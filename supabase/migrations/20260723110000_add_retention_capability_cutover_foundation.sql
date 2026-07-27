begin;

-- Phase 1 is capability and cutover infrastructure only. It intentionally adds
-- no Retention Claim financial records and does not touch project_claims.

insert into public.app_permissions (permission_key, description)
values
  ('retention.view', 'View Retention Management capability and project workflow state'),
  ('retention.schedules.manage', 'Manage future retention schedules'),
  ('retention.schedules.confirm', 'Confirm future retention schedules'),
  ('retention.reminders.manage', 'Manage future retention reminders'),
  ('retention.claims.create', 'Create future Retention Claims'),
  ('retention.claims.submit', 'Submit future Retention Claims'),
  ('retention.claims.xero_manage', 'Manage future Retention Claim Xero invoices'),
  ('retention.claims.void_request', 'Request future Retention Claim voids'),
  ('retention.claims.void_approve', 'Approve future Retention Claim voids'),
  ('retention.variances.view', 'View future retention variances'),
  ('retention.variances.resolve', 'Resolve future retention variances'),
  ('retention.variances.override', 'Override future retention variance controls'),
  ('retention.legacy.reconcile', 'Reconcile legacy retention release history'),
  ('retention.legacy.approve', 'Approve legacy retention reconciliation'),
  ('retention.cutover.manage', 'Manage Retention Management capability and project cutover state')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
select role_name, permission.permission_key, role_name in ('owner', 'admin')
from unnest(array['owner', 'admin', 'qs', 'project_manager', 'worker']) as role_name
cross join (
  values
    ('retention.view'),
    ('retention.schedules.manage'),
    ('retention.schedules.confirm'),
    ('retention.reminders.manage'),
    ('retention.claims.create'),
    ('retention.claims.submit'),
    ('retention.claims.xero_manage'),
    ('retention.claims.void_request'),
    ('retention.claims.void_approve'),
    ('retention.variances.view'),
    ('retention.variances.resolve'),
    ('retention.variances.override'),
    ('retention.legacy.reconcile'),
    ('retention.legacy.approve'),
    ('retention.cutover.manage')
) as permission(permission_key)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

-- Read-only visibility is granted to QS and Project Manager roles. All
-- management permissions remain owner/admin by default and can still use the
-- existing owner-controlled member override system.
insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('qs', 'retention.view', true),
  ('qs', 'retention.variances.view', true),
  ('project_manager', 'retention.view', true),
  ('project_manager', 'retention.variances.view', true)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

create table public.organization_capabilities (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  capability_key text not null,
  enabled boolean not null default false,
  enabled_by uuid null references auth.users (id) on delete restrict,
  enabled_at timestamptz null,
  disabled_by uuid null references auth.users (id) on delete restrict,
  disabled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, capability_key),
  constraint organization_capabilities_key_not_blank
    check (char_length(trim(capability_key)) between 1 and 100),
  constraint organization_capabilities_enabled_actor_pair
    check ((enabled_by is null) = (enabled_at is null)),
  constraint organization_capabilities_disabled_actor_pair
    check ((disabled_by is null) = (disabled_at is null)),
  constraint organization_capabilities_current_state_check
    check (
      (enabled and enabled_by is not null and enabled_at is not null and disabled_by is null and disabled_at is null)
      or not enabled
    )
);

create index organization_capabilities_key_enabled_idx
  on public.organization_capabilities (capability_key, enabled, organization_id);

drop trigger if exists set_organization_capabilities_updated_at on public.organization_capabilities;
create trigger set_organization_capabilities_updated_at
before update on public.organization_capabilities
for each row
execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_projects_organization_id_id_key'
      and conrelid = 'public.organization_projects'::regclass
  ) then
    alter table public.organization_projects
      add constraint organization_projects_organization_id_id_key
      unique (organization_id, id);
  end if;
end;
$$;

create table public.project_retention_workflow_states (
  organization_id uuid not null,
  project_id uuid not null,
  mode text not null default 'legacy',
  changed_by uuid null references auth.users (id) on delete restrict,
  changed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id),
  constraint project_retention_workflow_states_org_project_unique
    unique (organization_id, project_id),
  constraint project_retention_workflow_states_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id)
    on delete cascade,
  constraint project_retention_workflow_states_mode_check
    check (mode in ('legacy', 'observe', 'ready', 'cutover', 'blocked')),
  constraint project_retention_workflow_states_changed_actor_pair
    check ((changed_by is null) = (changed_at is null))
);

create index project_retention_workflow_states_org_mode_idx
  on public.project_retention_workflow_states (organization_id, mode, project_id);

drop trigger if exists set_project_retention_workflow_states_updated_at
  on public.project_retention_workflow_states;
create trigger set_project_retention_workflow_states_updated_at
before update on public.project_retention_workflow_states
for each row
execute function public.set_updated_at();

create table public.retention_capability_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  project_id uuid null references public.organization_projects (id) on delete restrict,
  domain_key text not null default 'retention_management',
  event_type text not null,
  previous_state text null,
  new_state text null,
  actor_user_id uuid null references auth.users (id) on delete restrict,
  reason text not null,
  correlation_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_capability_events_domain_check
    check (domain_key = 'retention_management'),
  constraint retention_capability_events_type_check
    check (
      event_type in (
        'organization_capability_enabled',
        'organization_capability_disabled',
        'project_mode_changed',
        'project_mode_transition_rejected',
        'management_permission_denied'
      )
    ),
  constraint retention_capability_events_reason_not_blank
    check (char_length(trim(reason)) between 1 and 1000),
  constraint retention_capability_events_correlation_length
    check (correlation_id is null or char_length(correlation_id) between 1 and 200),
  constraint retention_capability_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index retention_capability_events_org_occurred_idx
  on public.retention_capability_events (organization_id, occurred_at desc, id);

create index retention_capability_events_project_occurred_idx
  on public.retention_capability_events (project_id, occurred_at desc, id)
  where project_id is not null;

create or replace function public.prevent_retention_capability_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Retention capability events are append-only.';
end;
$$;

drop trigger if exists retention_capability_events_append_only
  on public.retention_capability_events;
create trigger retention_capability_events_append_only
before update or delete on public.retention_capability_events
for each row
execute function public.prevent_retention_capability_event_mutation();

insert into public.organization_capabilities (organization_id, capability_key, enabled)
select id, 'retention_management', false
from public.organizations
on conflict (organization_id, capability_key) do nothing;

insert into public.project_retention_workflow_states (organization_id, project_id, mode)
select organization_id, id, 'legacy'
from public.organization_projects
on conflict (project_id) do nothing;

create or replace function public.seed_retention_capability_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_capabilities (organization_id, capability_key, enabled)
  values (new.id, 'retention_management', false)
  on conflict (organization_id, capability_key) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_retention_capability_after_organization_insert
  on public.organizations;
create trigger seed_retention_capability_after_organization_insert
after insert on public.organizations
for each row
execute function public.seed_retention_capability_for_organization();

create or replace function public.seed_retention_workflow_state_for_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_retention_workflow_states (organization_id, project_id, mode)
  values (new.organization_id, new.id, 'legacy')
  on conflict (project_id) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_retention_workflow_state_after_project_insert
  on public.organization_projects;
create trigger seed_retention_workflow_state_after_project_insert
after insert on public.organization_projects
for each row
execute function public.seed_retention_workflow_state_for_project();

create or replace function public.record_retention_capability_event(
  p_organization_id uuid,
  p_project_id uuid,
  p_event_type text,
  p_previous_state text,
  p_new_state text,
  p_actor_user_id uuid,
  p_reason text,
  p_correlation_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
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
  values (
    p_organization_id,
    p_project_id,
    p_event_type,
    p_previous_state,
    p_new_state,
    p_actor_user_id,
    left(coalesce(nullif(trim(p_reason), ''), 'Retention management action recorded.'), 1000),
    nullif(left(trim(coalesce(p_correlation_id, '')), 200), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_retention_capability_event(
  uuid, uuid, text, text, text, uuid, text, text, jsonb
) from public, anon, authenticated;

create or replace function public.get_organization_retention_capability()
returns table (
  organization_id uuid,
  capability_key text,
  enabled boolean,
  enabled_by uuid,
  enabled_at timestamptz,
  disabled_by uuid,
  disabled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  select member.organization_id
  into v_organization_id
  from public.organization_members member
  where member.user_id = auth.uid()
  order by member.created_at, member.id
  limit 1;

  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'retention.view') then
    return;
  end if;

  return query
  select
    capability.organization_id,
    capability.capability_key,
    capability.enabled,
    capability.enabled_by,
    capability.enabled_at,
    capability.disabled_by,
    capability.disabled_at,
    capability.created_at,
    capability.updated_at
  from public.organization_capabilities capability
  where capability.organization_id = v_organization_id
    and capability.capability_key = 'retention_management';
end;
$$;

create or replace function public.set_organization_retention_capability(
  p_enabled boolean,
  p_reason text,
  p_correlation_id text default null
)
returns table (
  succeeded boolean,
  error_code text,
  changed boolean,
  organization_id uuid,
  capability_key text,
  enabled boolean,
  enabled_by uuid,
  enabled_at timestamptz,
  disabled_by uuid,
  disabled_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_capability public.organization_capabilities%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_user_id is null then
    return query
    select false, 'unauthenticated'::text, false, null::uuid, 'retention_management'::text,
      false, null::uuid, null::timestamptz, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  select member.organization_id
  into v_organization_id
  from public.organization_members member
  where member.user_id = v_actor_user_id
  order by member.created_at, member.id
  limit 1;

  if v_organization_id is null then
    return query
    select false, 'organization_membership_required'::text, false, null::uuid,
      'retention_management'::text, false, null::uuid, null::timestamptz,
      null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into public.organization_capabilities (organization_id, capability_key, enabled)
  values (v_organization_id, 'retention_management', false)
  on conflict on constraint organization_capabilities_pkey do nothing;

  select *
  into v_capability
  from public.organization_capabilities capability
  where capability.organization_id = v_organization_id
    and capability.capability_key = 'retention_management'
  for update;

  if not public.has_org_permission(v_organization_id, 'retention.cutover.manage') then
    perform public.record_retention_capability_event(
      v_organization_id,
      null,
      'management_permission_denied',
      case when v_capability.enabled then 'enabled' else 'disabled' end,
      case when p_enabled then 'enabled' else 'disabled' end,
      v_actor_user_id,
      coalesce(v_reason, 'Permission denied while managing Retention capability.'),
      p_correlation_id,
      jsonb_build_object('action', 'set_organization_retention_capability')
    );

    return query
    select false, 'permission_denied'::text, false,
      v_capability.organization_id, v_capability.capability_key, v_capability.enabled,
      v_capability.enabled_by, v_capability.enabled_at,
      v_capability.disabled_by, v_capability.disabled_at, v_capability.updated_at;
    return;
  end if;

  if v_reason is null then
    return query
    select false, 'reason_required'::text, false,
      v_capability.organization_id, v_capability.capability_key, v_capability.enabled,
      v_capability.enabled_by, v_capability.enabled_at,
      v_capability.disabled_by, v_capability.disabled_at, v_capability.updated_at;
    return;
  end if;

  if v_capability.enabled = p_enabled then
    return query
    select true, null::text, false,
      v_capability.organization_id, v_capability.capability_key, v_capability.enabled,
      v_capability.enabled_by, v_capability.enabled_at,
      v_capability.disabled_by, v_capability.disabled_at, v_capability.updated_at;
    return;
  end if;

  if p_enabled then
    update public.organization_capabilities capability
    set
      enabled = true,
      enabled_by = v_actor_user_id,
      enabled_at = now(),
      disabled_by = null,
      disabled_at = null
    where capability.organization_id = v_organization_id
      and capability.capability_key = 'retention_management'
    returning * into v_capability;
  else
    update public.organization_capabilities capability
    set
      enabled = false,
      disabled_by = v_actor_user_id,
      disabled_at = now()
    where capability.organization_id = v_organization_id
      and capability.capability_key = 'retention_management'
    returning * into v_capability;
  end if;

  perform public.record_retention_capability_event(
    v_organization_id,
    null,
    case
      when p_enabled then 'organization_capability_enabled'
      else 'organization_capability_disabled'
    end,
    case when p_enabled then 'disabled' else 'enabled' end,
    case when p_enabled then 'enabled' else 'disabled' end,
    v_actor_user_id,
    v_reason,
    p_correlation_id,
    jsonb_build_object('capabilityKey', 'retention_management')
  );

  return query
  select true, null::text, true,
    v_capability.organization_id, v_capability.capability_key, v_capability.enabled,
    v_capability.enabled_by, v_capability.enabled_at,
    v_capability.disabled_by, v_capability.disabled_at, v_capability.updated_at;
end;
$$;

create or replace function public.get_project_retention_workflow_state(
  p_project_id uuid
)
returns table (
  organization_id uuid,
  project_id uuid,
  mode text,
  changed_by uuid,
  changed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_actor_user_id is null or p_project_id is null then
    return;
  end if;

  select project.organization_id
  into v_organization_id
  from public.organization_projects project
  join public.organization_members member
    on member.organization_id = project.organization_id
   and member.user_id = v_actor_user_id
  where project.id = p_project_id;

  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'retention.view') then
    return;
  end if;

  return query
  select
    state.organization_id,
    state.project_id,
    state.mode,
    state.changed_by,
    state.changed_at,
    state.created_at,
    state.updated_at
  from public.project_retention_workflow_states state
  where state.project_id = p_project_id
    and state.organization_id = v_organization_id;
end;
$$;

create or replace function public.transition_project_retention_workflow_mode(
  p_project_id uuid,
  p_new_mode text,
  p_reason text,
  p_correlation_id text default null
)
returns table (
  succeeded boolean,
  error_code text,
  changed boolean,
  organization_id uuid,
  project_id uuid,
  previous_mode text,
  mode text,
  changed_by uuid,
  changed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_state public.project_retention_workflow_states%rowtype;
  v_previous_mode text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_capability_enabled boolean := false;
  v_error_code text;
begin
  if v_actor_user_id is null then
    return query
    select false, 'unauthenticated'::text, false, null::uuid, p_project_id,
      null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  select project.organization_id
  into v_organization_id
  from public.organization_projects project
  join public.organization_members member
    on member.organization_id = project.organization_id
   and member.user_id = v_actor_user_id
  where project.id = p_project_id;

  if v_organization_id is null then
    return query
    select false, 'project_not_found'::text, false, null::uuid, p_project_id,
      null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into public.project_retention_workflow_states (organization_id, project_id, mode)
  values (v_organization_id, p_project_id, 'legacy')
  on conflict on constraint project_retention_workflow_states_pkey do nothing;

  select *
  into v_state
  from public.project_retention_workflow_states state
  where state.organization_id = v_organization_id
    and state.project_id = p_project_id
  for update;

  v_previous_mode := v_state.mode;

  if not public.has_org_permission(v_organization_id, 'retention.cutover.manage') then
    perform public.record_retention_capability_event(
      v_organization_id,
      p_project_id,
      'management_permission_denied',
      v_previous_mode,
      p_new_mode,
      v_actor_user_id,
      coalesce(v_reason, 'Permission denied while managing project Retention mode.'),
      p_correlation_id,
      jsonb_build_object('action', 'transition_project_retention_workflow_mode')
    );

    return query
    select false, 'permission_denied'::text, false,
      v_state.organization_id, v_state.project_id, v_previous_mode, v_state.mode,
      v_state.changed_by, v_state.changed_at, v_state.updated_at;
    return;
  end if;

  if v_reason is null then
    v_error_code := 'reason_required';
  elsif p_new_mode is null
    or p_new_mode not in ('legacy', 'observe', 'ready', 'cutover', 'blocked') then
    v_error_code := 'invalid_mode';
  elsif p_new_mode = v_previous_mode then
    return query
    select true, null::text, false,
      v_state.organization_id, v_state.project_id, v_previous_mode, v_state.mode,
      v_state.changed_by, v_state.changed_at, v_state.updated_at;
    return;
  elsif p_new_mode in ('ready', 'cutover') then
    v_error_code := 'reserved_until_readiness';
  else
    select capability.enabled
    into v_capability_enabled
    from public.organization_capabilities capability
    where capability.organization_id = v_organization_id
      and capability.capability_key = 'retention_management';

    if p_new_mode <> 'legacy' and not coalesce(v_capability_enabled, false) then
      v_error_code := 'capability_disabled';
    elsif not (
      (v_previous_mode = 'legacy' and p_new_mode = 'observe')
      or (v_previous_mode = 'observe' and p_new_mode = 'legacy')
      or (v_previous_mode = 'observe' and p_new_mode = 'blocked')
      or (v_previous_mode = 'blocked' and p_new_mode = 'observe')
    ) then
      v_error_code := 'transition_not_allowed';
    end if;
  end if;

  if v_error_code is not null then
    perform public.record_retention_capability_event(
      v_organization_id,
      p_project_id,
      'project_mode_transition_rejected',
      v_previous_mode,
      p_new_mode,
      v_actor_user_id,
      coalesce(v_reason, 'Project Retention mode transition rejected.'),
      p_correlation_id,
      jsonb_build_object('errorCode', v_error_code)
    );

    return query
    select false, v_error_code, false,
      v_state.organization_id, v_state.project_id, v_previous_mode, v_state.mode,
      v_state.changed_by, v_state.changed_at, v_state.updated_at;
    return;
  end if;

  update public.project_retention_workflow_states state
  set
    mode = p_new_mode,
    changed_by = v_actor_user_id,
    changed_at = now()
  where state.organization_id = v_organization_id
    and state.project_id = p_project_id
  returning * into v_state;

  perform public.record_retention_capability_event(
    v_organization_id,
    p_project_id,
    'project_mode_changed',
    v_previous_mode,
    v_state.mode,
    v_actor_user_id,
    v_reason,
    p_correlation_id,
    jsonb_build_object('transition', v_previous_mode || '_to_' || v_state.mode)
  );

  return query
  select true, null::text, true,
    v_state.organization_id, v_state.project_id, v_previous_mode, v_state.mode,
    v_state.changed_by, v_state.changed_at, v_state.updated_at;
end;
$$;

create or replace function public.get_retention_capability_events(
  p_project_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  organization_id uuid,
  project_id uuid,
  event_type text,
  previous_state text,
  new_state text,
  actor_user_id uuid,
  reason text,
  correlation_id text,
  metadata jsonb,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_actor_user_id is null then
    return;
  end if;

  select member.organization_id
  into v_organization_id
  from public.organization_members member
  where member.user_id = v_actor_user_id
  order by member.created_at, member.id
  limit 1;

  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'retention.view') then
    return;
  end if;

  if p_project_id is not null and not exists (
    select 1
    from public.organization_projects project
    where project.id = p_project_id
      and project.organization_id = v_organization_id
  ) then
    return;
  end if;

  return query
  select
    event.id,
    event.organization_id,
    event.project_id,
    event.event_type,
    event.previous_state,
    event.new_state,
    event.actor_user_id,
    event.reason,
    event.correlation_id,
    event.metadata,
    event.occurred_at
  from public.retention_capability_events event
  where event.organization_id = v_organization_id
    and (p_project_id is null or event.project_id = p_project_id)
  order by event.occurred_at desc, event.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

alter table public.organization_capabilities enable row level security;
alter table public.organization_capabilities force row level security;
alter table public.project_retention_workflow_states enable row level security;
alter table public.project_retention_workflow_states force row level security;
alter table public.retention_capability_events enable row level security;
alter table public.retention_capability_events force row level security;

create policy "Retention viewers can read organization capabilities"
on public.organization_capabilities
for select
to authenticated
using (
  capability_key = 'retention_management'
  and public.has_org_permission(organization_id, 'retention.view')
);

create policy "Retention viewers can read project workflow states"
on public.project_retention_workflow_states
for select
to authenticated
using (public.has_org_permission(organization_id, 'retention.view'));

create policy "Retention viewers can read capability events"
on public.retention_capability_events
for select
to authenticated
using (public.has_org_permission(organization_id, 'retention.view'));

grant select on public.organization_capabilities to authenticated;
grant select on public.project_retention_workflow_states to authenticated;
grant select on public.retention_capability_events to authenticated;

revoke insert, update, delete on public.organization_capabilities from authenticated;
revoke insert, update, delete on public.project_retention_workflow_states from authenticated;
revoke insert, update, delete on public.retention_capability_events from authenticated;

grant select, insert, update on public.organization_capabilities to service_role;
grant select, insert, update on public.project_retention_workflow_states to service_role;
grant select, insert on public.retention_capability_events to service_role;
revoke update, delete on public.retention_capability_events from service_role;

revoke all on function public.seed_retention_capability_for_organization()
  from public, anon, authenticated;
revoke all on function public.seed_retention_workflow_state_for_project()
  from public, anon, authenticated;
revoke all on function public.prevent_retention_capability_event_mutation()
  from public, anon, authenticated;

revoke all on function public.get_organization_retention_capability()
  from public, anon;
grant execute on function public.get_organization_retention_capability()
  to authenticated;

revoke all on function public.set_organization_retention_capability(boolean, text, text)
  from public, anon;
grant execute on function public.set_organization_retention_capability(boolean, text, text)
  to authenticated;

revoke all on function public.get_project_retention_workflow_state(uuid)
  from public, anon;
grant execute on function public.get_project_retention_workflow_state(uuid)
  to authenticated;

revoke all on function public.transition_project_retention_workflow_mode(uuid, text, text, text)
  from public, anon;
grant execute on function public.transition_project_retention_workflow_mode(uuid, text, text, text)
  to authenticated;

revoke all on function public.get_retention_capability_events(uuid, integer)
  from public, anon;
grant execute on function public.get_retention_capability_events(uuid, integer)
  to authenticated;

commit;
