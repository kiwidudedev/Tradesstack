begin;

-- Stage 6 extends the exact Stage 5 pilot envelope to a hosted-development
-- allowlist. It inserts no controls and changes no Opportunity or Project data.
alter table public.opportunity_lifecycle_rollout_controls
  drop constraint opportunity_lifecycle_rollout_promotion_pilot_check,
  drop constraint opportunity_lifecycle_rollout_pilot_environment_check,
  drop constraint opportunity_lifecycle_rollout_pilot_scope_check;

alter table public.opportunity_lifecycle_rollout_controls
  add constraint opportunity_lifecycle_rollout_pilot_scope_check check (
    pilot_scope in (
      'disabled',
      'local_admin_pilot',
      'hosted_development_allowlist'
    )
  ),
  add constraint opportunity_lifecycle_rollout_pilot_environment_check check (
    pilot_environment in (
      'disabled',
      'local_development',
      'hosted_development'
    )
  ),
  add constraint opportunity_lifecycle_rollout_promotion_pilot_check check (
    promotion_enabled is false
    or (
      creation_enabled
      and allowed_strategy = 'promote_workspace_v1'
      and (
        (
          pilot_scope = 'local_admin_pilot'
          and pilot_environment = 'local_development'
        )
        or (
          pilot_scope = 'hosted_development_allowlist'
          and pilot_environment = 'hosted_development'
        )
      )
    )
  );

create or replace function public.is_opportunity_promotion_rollout_scope_v1(
  p_pilot_scope text,
  p_pilot_environment text
)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select
    (p_pilot_scope = 'local_admin_pilot' and p_pilot_environment = 'local_development')
    or (
      p_pilot_scope = 'hosted_development_allowlist'
      and p_pilot_environment = 'hosted_development'
    );
$$;

revoke all on function public.is_opportunity_promotion_rollout_scope_v1(text, text)
from public, anon, authenticated;
grant execute on function public.is_opportunity_promotion_rollout_scope_v1(text, text)
to service_role;

-- The browser still supplies no strategy. This trusted function accepts only
-- the two exact non-production promotion scopes recognized above.
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
  rollout_row public.opportunity_lifecycle_rollout_controls%rowtype;
  selected_strategy text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not public.has_org_permission(p_organization_id, 'leads.opportunities.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  select * into rollout_row
  from public.opportunity_lifecycle_rollout_controls rollout
  where rollout.organization_id = p_organization_id;

  if not found or rollout_row.creation_enabled is not true then
    raise exception 'Opportunity lifecycle creation is not enabled'
      using errcode = 'TS409';
  end if;

  if rollout_row.allowed_strategy = 'promote_workspace_v1' then
    if rollout_row.promotion_enabled is not true
      or not public.is_opportunity_promotion_rollout_scope_v1(
        rollout_row.pilot_scope,
        rollout_row.pilot_environment
      )
    then
      raise exception 'Opportunity promotion creation is not authorized'
        using errcode = 'TS409';
    end if;
    selected_strategy := 'promote_workspace_v1';
  elsif rollout_row.allowed_strategy = 'legacy_two_project_v1' then
    selected_strategy := 'legacy_two_project_v1';
  else
    raise exception 'Opportunity lifecycle rollout control is contradictory'
      using errcode = 'TS409';
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

-- Preserve the public award contract and every legacy branch. Only the exact
-- control-scope predicate for a not-yet-completed promotion is extended.
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
  rollout_row public.opportunity_lifecycle_rollout_controls%rowtype;
  promotion_result record;
  legacy_result record;
  promotion_event_count integer;
  resolved_strategy text;
  resolved_correlation_id uuid;
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
    select * into rollout_row
    from public.opportunity_lifecycle_rollout_controls rollout
    where rollout.organization_id = p_organization_id;

    if not found
      or rollout_row.creation_enabled is not true
      or rollout_row.promotion_enabled is not true
      or rollout_row.allowed_strategy <> 'promote_workspace_v1'
      or not public.is_opportunity_promotion_rollout_scope_v1(
        rollout_row.pilot_scope,
        rollout_row.pilot_environment
      )
    then
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

comment on function public.is_opportunity_promotion_rollout_scope_v1(text, text)
is 'Stage 6 exact non-production rollout-scope predicate. No wildcard or production scope is recognized.';

comment on function public.create_opportunity_workspace_controlled_v1(
  uuid, uuid, text, uuid, jsonb, uuid, text, date, numeric, text
) is 'Stage 6 trusted creation entry point for exact local or hosted-development controls.';

comment on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
is 'Stage 6 lifecycle award orchestrator with exact non-production organization controls.';

commit;
