begin;

-- Stage 7 installs a dormant, database-backed default lifecycle policy.
-- This migration creates no policy row and changes no Opportunity, Project,
-- lifecycle, mapping, quote, document, accounting, or rollout-control data.
alter table public.opportunity_lifecycle_rollout_controls
  add column override_enabled boolean not null default false,
  add constraint opportunity_lifecycle_rollout_override_enabled_check check (
    override_enabled is false
    or (
      creation_enabled
      and (
        (pilot_scope = 'local_admin_pilot' and pilot_environment = 'local_development')
        or (
          pilot_scope = 'hosted_development_allowlist'
          and pilot_environment = 'hosted_development'
        )
      )
    )
  );

create table public.opportunity_lifecycle_default_policy (
  singleton boolean primary key default true,
  environment text not null,
  default_strategy text not null,
  creation_enabled boolean not null default false,
  promotion_enabled boolean not null default false,
  effective_from timestamptz not null,
  configured_by uuid not null,
  configured_at timestamptz not null default now(),
  constraint opportunity_lifecycle_default_policy_singleton_check
    check (singleton),
  constraint opportunity_lifecycle_default_policy_environment_check
    check (environment in ('local_development', 'hosted_development')),
  constraint opportunity_lifecycle_default_policy_strategy_check
    check (default_strategy in ('legacy_two_project_v1', 'promote_workspace_v1')),
  constraint opportunity_lifecycle_default_policy_state_check
    check (
      (
        default_strategy = 'legacy_two_project_v1'
        and promotion_enabled is false
      )
      or (
        default_strategy = 'promote_workspace_v1'
        and (
          (creation_enabled and promotion_enabled)
          or (creation_enabled is false and promotion_enabled is false)
        )
      )
    )
);

alter table public.opportunity_lifecycle_default_policy enable row level security;
alter table public.opportunity_lifecycle_default_policy force row level security;
revoke all on public.opportunity_lifecycle_default_policy
from public, anon, authenticated;
grant select, insert, update, delete on public.opportunity_lifecycle_default_policy
to service_role;

create table public.opportunity_lifecycle_default_policy_events (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  environment text not null,
  previous_policy jsonb null,
  resulting_policy jsonb null,
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  constraint opportunity_lifecycle_default_policy_events_operation_check
    check (operation in ('insert', 'update', 'delete')),
  constraint opportunity_lifecycle_default_policy_events_environment_check
    check (environment in ('local_development', 'hosted_development'))
);

create index opportunity_lifecycle_default_policy_events_changed_at_idx
on public.opportunity_lifecycle_default_policy_events (changed_at desc);

alter table public.opportunity_lifecycle_default_policy_events enable row level security;
alter table public.opportunity_lifecycle_default_policy_events force row level security;
revoke all on public.opportunity_lifecycle_default_policy_events
from public, anon, authenticated;
grant select, insert on public.opportunity_lifecycle_default_policy_events
to service_role;

create function public.audit_opportunity_lifecycle_default_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
begin
  actor_id := coalesce(new.configured_by, old.configured_by);
  insert into public.opportunity_lifecycle_default_policy_events (
    operation,
    environment,
    previous_policy,
    resulting_policy,
    changed_by
  ) values (
    lower(tg_op),
    coalesce(new.environment, old.environment),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    actor_id
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_opportunity_lifecycle_default_policy_v1()
from public, anon, authenticated;
grant execute on function public.audit_opportunity_lifecycle_default_policy_v1()
to service_role;

create trigger audit_opportunity_lifecycle_default_policy_v1
after insert or update or delete on public.opportunity_lifecycle_default_policy
for each row execute function public.audit_opportunity_lifecycle_default_policy_v1();

-- Disabled Stage 5/6 control rows are not overrides. Exact recognized scopes
-- retain precedence over the environment default when deliberately activated.
create or replace function public.is_opportunity_lifecycle_override_active_v1(
  p_pilot_scope text,
  p_pilot_environment text
)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select public.is_opportunity_promotion_rollout_scope_v1(
    p_pilot_scope,
    p_pilot_environment
  );
$$;

revoke all on function public.is_opportunity_lifecycle_override_active_v1(text, text)
from public, anon, authenticated;
grant execute on function public.is_opportunity_lifecycle_override_active_v1(text, text)
to service_role;

create function public.is_opportunity_lifecycle_strategy_authorized_v1(
  p_organization_id uuid,
  p_strategy text,
  p_require_promotion boolean default false
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  override_row public.opportunity_lifecycle_rollout_controls%rowtype;
  default_row public.opportunity_lifecycle_default_policy%rowtype;
begin
  if p_strategy not in ('legacy_two_project_v1', 'promote_workspace_v1') then
    return false;
  end if;

  select * into override_row
  from public.opportunity_lifecycle_rollout_controls rollout
  where rollout.organization_id = p_organization_id
    and rollout.override_enabled
    and public.is_opportunity_lifecycle_override_active_v1(
      rollout.pilot_scope,
      rollout.pilot_environment
    );

  if found then
    return override_row.creation_enabled
      and override_row.allowed_strategy = p_strategy
      and (
        p_require_promotion is false
        or (
          p_strategy = 'promote_workspace_v1'
          and override_row.promotion_enabled
        )
      );
  end if;

  select * into default_row
  from public.opportunity_lifecycle_default_policy policy
  where policy.singleton
    and policy.effective_from <= now();

  return found
    and default_row.creation_enabled
    and default_row.default_strategy = p_strategy
    and (
      p_require_promotion is false
      or (
        p_strategy = 'promote_workspace_v1'
        and default_row.promotion_enabled
      )
    );
end;
$$;

revoke all on function public.is_opportunity_lifecycle_strategy_authorized_v1(
  uuid, text, boolean
) from public, anon, authenticated;
grant execute on function public.is_opportunity_lifecycle_strategy_authorized_v1(
  uuid, text, boolean
) to service_role;

-- The Stage 1 atomic primitives retain their signatures and behavior, but
-- their authorization predicate now accepts the same exact override/default
-- decision as the Stage 7 orchestrators. Exact source fragments are required;
-- deployment fails closed if an unexpected prior definition is present.
do $stage7_inner_authorization$
declare
  definition text;
  updated_definition text;
  old_creation_guard constant text := $guard$
  select *
  into rollout_row
  from public.opportunity_lifecycle_rollout_controls rollout
  where rollout.organization_id = p_organization_id;

  if not found
    or rollout_row.creation_enabled is not true
    or rollout_row.allowed_strategy <> p_strategy
  then
    raise exception 'Opportunity lifecycle creation is not enabled'
      using errcode = 'TS409';
  end if;
$guard$;
  new_creation_guard constant text := $guard$
  if not public.is_opportunity_lifecycle_strategy_authorized_v1(
    p_organization_id,
    p_strategy,
    p_strategy = 'promote_workspace_v1'
  ) then
    raise exception 'Opportunity lifecycle creation is not enabled'
      using errcode = 'TS409';
  end if;
$guard$;
  old_promotion_guard constant text := $guard$
  select *
  into rollout_row
  from public.opportunity_lifecycle_rollout_controls rollout
  where rollout.organization_id = p_organization_id;

  if not found
    or rollout_row.promotion_enabled is not true
    or rollout_row.allowed_strategy <> 'promote_workspace_v1'
  then
    raise exception 'Opportunity promotion is not enabled'
      using errcode = 'TS409';
  end if;
$guard$;
  new_promotion_guard constant text := $guard$
  if not public.is_opportunity_lifecycle_strategy_authorized_v1(
    p_organization_id,
    'promote_workspace_v1',
    true
  ) then
    raise exception 'Opportunity promotion is not enabled'
      using errcode = 'TS409';
  end if;
$guard$;
begin
  select pg_get_functiondef(
    'public.create_opportunity_workspace_v1(uuid,uuid,text,text,uuid,jsonb,uuid,text,date,numeric,text)'::regprocedure
  ) into definition;
  updated_definition := replace(definition, old_creation_guard, new_creation_guard);
  if updated_definition = definition then
    raise exception 'Stage 7 could not locate the expected atomic creation authorization guard';
  end if;
  execute updated_definition;

  select pg_get_functiondef(
    'public.promote_opportunity_workspace_v1(uuid,uuid,uuid,uuid)'::regprocedure
  ) into definition;
  updated_definition := replace(definition, old_promotion_guard, new_promotion_guard);
  if updated_definition = definition then
    raise exception 'Stage 7 could not locate the expected atomic promotion authorization guard';
  end if;
  execute updated_definition;
end;
$stage7_inner_authorization$;

create or replace function public.create_opportunity_workspace_controlled_v1(
  p_organization_id uuid,
  p_creation_request_id uuid,
  p_name text,
  p_client_id uuid default null,
  p_new_client jsonb default null,
  p_owner_user_id uuid default null,
  p_location text default 'Unspecified',
  p_due_date date default null,
  p_estimated_value numeric default 0,
  p_notes text default ''
)
returns table (
  opportunity_id uuid,
  opportunity_slug text,
  workspace_project_id uuid,
  workspace_project_slug text,
  lifecycle_id uuid,
  records_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  override_row public.opportunity_lifecycle_rollout_controls%rowtype;
  default_row public.opportunity_lifecycle_default_policy%rowtype;
  selected_strategy text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not public.has_org_permission(p_organization_id, 'leads.opportunities.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  select * into override_row
  from public.opportunity_lifecycle_rollout_controls rollout
  where rollout.organization_id = p_organization_id
    and rollout.override_enabled
    and public.is_opportunity_lifecycle_override_active_v1(
      rollout.pilot_scope,
      rollout.pilot_environment
    );

  if found then
    if override_row.creation_enabled is not true then
      raise exception 'Opportunity lifecycle creation is not enabled for organization override'
        using errcode = 'TS409';
    end if;

    if override_row.allowed_strategy = 'promote_workspace_v1' then
      if override_row.promotion_enabled is not true then
        raise exception 'Opportunity promotion creation is not authorized by organization override'
          using errcode = 'TS409';
      end if;
      selected_strategy := 'promote_workspace_v1';
    elsif override_row.allowed_strategy = 'legacy_two_project_v1' then
      selected_strategy := 'legacy_two_project_v1';
    else
      raise exception 'Opportunity lifecycle organization override is contradictory'
        using errcode = 'TS409';
    end if;
  else
    select * into default_row
    from public.opportunity_lifecycle_default_policy policy
    where policy.singleton
      and policy.effective_from <= now();

    if not found or default_row.creation_enabled is not true then
      raise exception 'Opportunity lifecycle default creation is not enabled'
        using errcode = 'TS409';
    end if;

    if default_row.default_strategy = 'promote_workspace_v1' then
      if default_row.promotion_enabled is not true then
        raise exception 'Opportunity promotion default is paused'
          using errcode = 'TS409';
      end if;
      selected_strategy := 'promote_workspace_v1';
    elsif default_row.default_strategy = 'legacy_two_project_v1' then
      selected_strategy := 'legacy_two_project_v1';
    else
      raise exception 'Opportunity lifecycle default policy is contradictory'
        using errcode = 'TS409';
    end if;
  end if;

  return query
  select * from public.create_opportunity_workspace_v1(
    p_organization_id,
    p_creation_request_id,
    selected_strategy,
    p_name,
    p_client_id,
    p_new_client,
    p_owner_user_id,
    p_location,
    p_due_date,
    p_estimated_value,
    p_notes
  );
end;
$$;

revoke all on function public.create_opportunity_workspace_controlled_v1(
  uuid, uuid, text, uuid, jsonb, uuid, text, date, numeric, text
) from public, anon;
grant execute on function public.create_opportunity_workspace_controlled_v1(
  uuid, uuid, text, uuid, jsonb, uuid, text, date, numeric, text
) to authenticated;

create or replace function public.award_opportunity_by_lifecycle_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_correlation_id text
)
returns table (
  project_id uuid,
  project_slug text,
  project_created boolean,
  storage_clone_required boolean,
  lifecycle_strategy text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity_row public.organization_opportunities%rowtype;
  lifecycle_row public.opportunity_lifecycles%rowtype;
  mapping_row public.opportunity_final_projects%rowtype;
  project_row public.organization_projects%rowtype;
  override_row public.opportunity_lifecycle_rollout_controls%rowtype;
  default_row public.opportunity_lifecycle_default_policy%rowtype;
  promotion_result record;
  legacy_result record;
  promotion_event_count integer;
  resolved_strategy text;
  resolved_correlation_id uuid;
  promotion_authorized boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  if p_correlation_id is null then
    raise exception 'Award correlation ID is required' using errcode = 'TS422';
  end if;

  resolved_correlation_id := case
    when p_correlation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then p_correlation_id::uuid
    else md5(p_correlation_id)::uuid
  end;

  select * into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.organization_id = p_organization_id
    and opportunity.id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Opportunity not found for organization' using errcode = 'TS422';
  end if;

  select * into lifecycle_row
  from public.opportunity_lifecycles lifecycle
  where lifecycle.organization_id = p_organization_id
    and lifecycle.opportunity_id = p_opportunity_id
  for key share;

  resolved_strategy := coalesce(lifecycle_row.strategy, 'unmarked_historical');
  if lifecycle_row.id is not null and (
    lifecycle_row.strategy_version <> 1
    or lifecycle_row.strategy not in ('legacy_two_project_v1', 'promote_workspace_v1')
  ) then
    raise exception 'Unsupported Opportunity lifecycle strategy' using errcode = 'TS409';
  end if;

  select * into mapping_row
  from public.opportunity_final_projects mapping
  where mapping.organization_id = p_organization_id
    and mapping.opportunity_id = p_opportunity_id
  for update;

  if mapping_row.opportunity_id is not null then
    if mapping_row.accepted_quote_id is distinct from p_accepted_quote_id
      or opportunity_row.converted_project_id is distinct from mapping_row.project_id
    then
      raise exception 'Opportunity has a conflicting final Project mapping'
        using errcode = 'TS409';
    end if;

    select * into project_row
    from public.organization_projects project
    where project.organization_id = p_organization_id
      and project.id = mapping_row.project_id;
    if not found then
      raise exception 'Designated final Project is missing' using errcode = 'TS409';
    end if;

    if lifecycle_row.strategy = 'promote_workspace_v1' then
      select count(*)::integer into promotion_event_count
      from public.opportunity_promotion_events event
      where event.organization_id = p_organization_id
        and event.opportunity_id = p_opportunity_id
        and event.project_id = opportunity_row.workspace_project_id
        and event.accepted_quote_id = p_accepted_quote_id;

      if mapping_row.project_id is distinct from opportunity_row.workspace_project_id
        or lifecycle_row.original_workspace_project_id
          is distinct from opportunity_row.workspace_project_id
        or promotion_event_count <> 1
      then
        raise exception 'Completed promotion evidence is inconsistent'
          using errcode = 'TS409';
      end if;

      return query select project_row.id, project_row.slug, false, false,
        'promote_workspace_v1'::text;
      return;
    end if;

    if lifecycle_row.id is not null and lifecycle_row.strategy <> 'legacy_two_project_v1' then
      raise exception 'Final mapping contradicts lifecycle strategy' using errcode = 'TS409';
    end if;

    return query select project_row.id, project_row.slug, false, true,
      resolved_strategy;
    return;
  end if;

  if lifecycle_row.strategy = 'promote_workspace_v1' then
    select * into override_row
    from public.opportunity_lifecycle_rollout_controls rollout
    where rollout.organization_id = p_organization_id
      and rollout.override_enabled
      and public.is_opportunity_lifecycle_override_active_v1(
        rollout.pilot_scope,
        rollout.pilot_environment
      );

    if found then
      promotion_authorized := override_row.creation_enabled
        and override_row.promotion_enabled
        and override_row.allowed_strategy = 'promote_workspace_v1';
    else
      select * into default_row
      from public.opportunity_lifecycle_default_policy policy
      where policy.singleton
        and policy.effective_from <= now();
      promotion_authorized := found
        and default_row.creation_enabled
        and default_row.promotion_enabled
        and default_row.default_strategy = 'promote_workspace_v1';
    end if;

    if promotion_authorized is not true then
      raise exception 'Opportunity promotion award is paused'
        using errcode = 'TS409';
    end if;

    select * into promotion_result
    from public.promote_opportunity_workspace_v1(
      p_organization_id,
      p_opportunity_id,
      p_accepted_quote_id,
      resolved_correlation_id
    );

    return query select
      promotion_result.project_id,
      promotion_result.project_slug,
      false,
      false,
      'promote_workspace_v1'::text;
    return;
  end if;

  if lifecycle_row.id is not null and lifecycle_row.strategy <> 'legacy_two_project_v1' then
    raise exception 'Opportunity lifecycle strategy is contradictory'
      using errcode = 'TS409';
  end if;

  select * into legacy_result
  from public.convert_accepted_opportunity_to_project(
    p_organization_id,
    p_opportunity_id,
    p_accepted_quote_id
  );

  return query select
    legacy_result.project_id,
    legacy_result.project_slug,
    legacy_result.project_created,
    legacy_result.storage_clone_required,
    resolved_strategy;
end;
$$;

revoke all on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
from public, anon;
grant execute on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
to authenticated;

comment on table public.opportunity_lifecycle_default_policy
is 'Stage 7 trusted singleton default for future Opportunity lifecycle selection. No existing lifecycle row is updated.';

comment on table public.opportunity_lifecycle_default_policy_events
is 'Append-only audit history for Stage 7 default-policy changes.';

comment on function public.create_opportunity_workspace_controlled_v1(
  uuid, uuid, text, uuid, jsonb, uuid, text, date, numeric, text
) is 'Stage 7 trusted creation entry point: exact active organization override, then effective environment default, otherwise fail closed.';

comment on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
is 'Stage 7 immutable-strategy award orchestrator. Policy controls promotion execution only and never selects strategy at award.';

commit;
