begin;

-- Payment Claim and immutable Retention Claim accounting are complete product
-- capabilities. Keep the existing per-organization row as a service/admin-only
-- emergency override, but make system-created settings enabled by default.
alter table public.organization_accounting_phase2b_settings
  alter column initial_payment_claim_push_enabled set default true,
  alter column retention_claim_immutable_xero_enabled set default true,
  alter column enabled_at set default now();

alter table public.organization_accounting_phase2b_settings
  drop constraint if exists accounting_phase2b_settings_enabled_shape;

alter table public.organization_accounting_phase2b_settings
  add constraint accounting_phase2b_settings_enabled_shape
  check (
    (
      not initial_payment_claim_push_enabled
      and not retention_claim_immutable_xero_enabled
    )
    or enabled_at is not null
  );

insert into public.organization_accounting_phase2b_settings (
  organization_id,
  initial_payment_claim_push_enabled,
  retention_claim_immutable_xero_enabled,
  enabled_by,
  enabled_at
)
select
  organization.id,
  true,
  true,
  null,
  now()
from public.organizations organization
on conflict (organization_id) do nothing;

create or replace function public.seed_claim_accounting_settings_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_accounting_phase2b_settings (
    organization_id,
    initial_payment_claim_push_enabled,
    retention_claim_immutable_xero_enabled,
    enabled_by,
    enabled_at
  )
  values (new.id, true, true, null, now())
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function public.seed_claim_accounting_settings_for_organization()
  from public, anon, authenticated;
grant execute on function public.seed_claim_accounting_settings_for_organization()
  to service_role;

drop trigger if exists seed_claim_accounting_settings_after_organization_insert
  on public.organizations;
create trigger seed_claim_accounting_settings_after_organization_insert
after insert on public.organizations
for each row
execute function public.seed_claim_accounting_settings_for_organization();

-- The original Retention capability/project modes were rollout infrastructure.
-- Promote only untouched system defaults. Actor-managed states, explicit
-- disables and blocked projects remain unchanged.
alter table public.organization_capabilities
  alter column enabled set default true,
  alter column enabled_at set default now();

alter table public.organization_capabilities
  drop constraint if exists organization_capabilities_enabled_actor_pair;
alter table public.organization_capabilities
  drop constraint if exists organization_capabilities_current_state_check;

alter table public.organization_capabilities
  add constraint organization_capabilities_enabled_actor_pair
  check (enabled_by is null or enabled_at is not null);
alter table public.organization_capabilities
  add constraint organization_capabilities_current_state_check
  check (
    (
      enabled
      and enabled_at is not null
      and disabled_by is null
      and disabled_at is null
    )
    or not enabled
  );

with promoted as (
  update public.organization_capabilities capability
  set
    enabled = true,
    enabled_at = now(),
    disabled_by = null,
    disabled_at = null
  where capability.capability_key = 'retention_management'
    and not capability.enabled
    and capability.enabled_by is null
    and capability.enabled_at is null
    and capability.disabled_by is null
    and capability.disabled_at is null
  returning capability.organization_id
)
insert into public.retention_capability_events (
  organization_id,
  project_id,
  event_type,
  previous_state,
  new_state,
  actor_user_id,
  reason,
  correlation_id,
  metadata
)
select
  promoted.organization_id,
  null,
  'organization_capability_enabled',
  'disabled',
  'enabled',
  null,
  'Retention Management made generally available after rollout completion.',
  '20260726470000-global-availability',
  jsonb_build_object('source', 'system_migration')
from promoted;

create or replace function public.seed_retention_capability_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_capabilities (
    organization_id,
    capability_key,
    enabled,
    enabled_by,
    enabled_at
  )
  values (new.id, 'retention_management', true, null, now())
  on conflict (organization_id, capability_key) do nothing;
  return new;
end;
$$;

with promoted as (
  update public.project_retention_workflow_states state
  set mode = 'observe'
  where state.mode = 'legacy'
    and state.changed_by is null
    and state.changed_at is null
  returning state.organization_id, state.project_id
)
insert into public.retention_capability_events (
  organization_id,
  project_id,
  event_type,
  previous_state,
  new_state,
  actor_user_id,
  reason,
  correlation_id,
  metadata
)
select
  promoted.organization_id,
  promoted.project_id,
  'project_mode_changed',
  'legacy',
  'observe',
  null,
  'Retention Management made generally available after rollout completion.',
  '20260726470000-global-availability',
  jsonb_build_object('source', 'system_migration')
from promoted;

alter table public.project_retention_workflow_states
  alter column mode set default 'observe';

create or replace function public.seed_retention_workflow_state_for_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_retention_workflow_states (
    organization_id,
    project_id,
    mode
  )
  values (new.organization_id, new.id, 'observe')
  on conflict (project_id) do nothing;
  return new;
end;
$$;

-- Retire only the temporary signed Phase 3 pilot claim. Capability, project
-- mode, permissions and every accounting prerequisite remain authoritative.
create or replace function private.retention_claim_phase3_gate_enabled()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select true;
$$;

revoke all on function private.retention_claim_phase3_gate_enabled()
  from public, anon, authenticated;

commit;
