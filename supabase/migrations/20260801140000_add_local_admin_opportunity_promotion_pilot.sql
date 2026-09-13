begin;

-- Stage 5 remains dormant unless one exact organization is explicitly marked
-- as a local administrator pilot. No rollout rows are inserted here.
alter table public.opportunity_lifecycle_rollout_controls
  add column pilot_scope text not null default 'disabled',
  add column pilot_environment text not null default 'disabled';

alter table public.opportunity_lifecycle_rollout_controls
  add constraint opportunity_lifecycle_rollout_pilot_scope_check
    check (pilot_scope in ('disabled', 'local_admin_pilot')),
  add constraint opportunity_lifecycle_rollout_pilot_environment_check
    check (pilot_environment in ('disabled', 'local_development')),
  add constraint opportunity_lifecycle_rollout_promotion_pilot_check
    check (
      promotion_enabled is false
      or (
        creation_enabled
        and allowed_strategy = 'promote_workspace_v1'
        and pilot_scope = 'local_admin_pilot'
        and pilot_environment = 'local_development'
      )
    );

create table public.opportunity_lifecycle_rollout_control_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  previous_control jsonb,
  next_control jsonb,
  changed_by uuid references auth.users (id) on delete restrict,
  changed_at timestamptz not null default timezone('utc', now()),
  constraint opportunity_rollout_event_previous_object_check check (
    previous_control is null or jsonb_typeof(previous_control) = 'object'
  ),
  constraint opportunity_rollout_event_next_object_check check (
    next_control is null or jsonb_typeof(next_control) = 'object'
  )
);

alter table public.opportunity_lifecycle_rollout_control_events enable row level security;
alter table public.opportunity_lifecycle_rollout_control_events force row level security;
revoke all on public.opportunity_lifecycle_rollout_control_events
from public, anon, authenticated;
grant select, insert on public.opportunity_lifecycle_rollout_control_events
to service_role;

create or replace function public.audit_opportunity_lifecycle_rollout_control_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_value jsonb;
  next_value jsonb;
begin
  previous_value := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  next_value := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  insert into public.opportunity_lifecycle_rollout_control_events (
    organization_id,
    operation,
    previous_control,
    next_control,
    changed_by
  ) values (
    coalesce(new.organization_id, old.organization_id),
    lower(tg_op),
    previous_value,
    next_value,
    coalesce(auth.uid(), new.updated_by, old.updated_by)
  );

  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_opportunity_lifecycle_rollout_control_v1()
from public, anon, authenticated;

create trigger audit_opportunity_lifecycle_rollout_control_stage5
after insert or update or delete
on public.opportunity_lifecycle_rollout_controls
for each row execute function public.audit_opportunity_lifecycle_rollout_control_v1();

-- Browser requests never provide a lifecycle strategy. This trusted wrapper
-- resolves the exact organization control and binds the immutable strategy.
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
      or rollout_row.pilot_scope <> 'local_admin_pilot'
      or rollout_row.pilot_environment <> 'local_development'
    then
      raise exception 'Opportunity promotion pilot creation is not authorized'
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

-- Content-minimized contractual and structural evidence is populated by the
-- immutable promotion-event trigger. Existing events remain valid.
alter table public.opportunity_promotion_events
  add column contract_subtotal numeric,
  add column contract_tax numeric,
  add column contract_total numeric,
  add column contract_currency text,
  add column structural_evidence jsonb,
  add column evidence_hash text;

alter table public.opportunity_promotion_events
  add constraint opportunity_promotion_event_structural_evidence_check check (
    structural_evidence is null or jsonb_typeof(structural_evidence) = 'object'
  ),
  add constraint opportunity_promotion_event_evidence_hash_check check (
    evidence_hash is null or evidence_hash ~ '^[a-f0-9]{64}$'
  );

create or replace function public.validate_opportunity_promotion_event_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lifecycle_row public.opportunity_lifecycles%rowtype;
  opportunity_row public.organization_opportunities%rowtype;
  quote_row public.project_quotes%rowtype;
  mapping_row public.opportunity_final_projects%rowtype;
  currency_value text;
  evidence_value jsonb;
begin
  select * into lifecycle_row
  from public.opportunity_lifecycles lifecycle
  where lifecycle.organization_id = new.organization_id
    and lifecycle.id = new.lifecycle_id;

  if not found
    or lifecycle_row.opportunity_id <> new.opportunity_id
    or lifecycle_row.original_workspace_project_id <> new.project_id
    or lifecycle_row.strategy <> new.strategy
    or lifecycle_row.strategy_version <> new.strategy_version
  then
    raise exception 'Promotion event contradicts its lifecycle record'
      using errcode = 'TS409';
  end if;

  select * into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.organization_id = new.organization_id
    and opportunity.id = new.opportunity_id;

  if not found
    or opportunity_row.workspace_project_id is distinct from new.project_id
    or opportunity_row.converted_project_id is distinct from new.project_id
    or opportunity_row.stage <> 'Won'
  then
    raise exception 'Promotion event contradicts Opportunity state'
      using errcode = 'TS409';
  end if;

  select * into quote_row
  from public.project_quotes quote
  where quote.organization_id = new.organization_id
    and quote.id = new.accepted_quote_id;

  if not found
    or quote_row.originating_opportunity_id is distinct from new.opportunity_id
    or quote_row.project_id is distinct from new.project_id
    or quote_row.status <> 'Accepted'
    or quote_row.subtotal < 0
    or quote_row.gst_amount < 0
    or quote_row.total_quote_price < 0
  then
    raise exception 'Promotion event contradicts accepted quote state'
      using errcode = 'TS409';
  end if;

  select * into mapping_row
  from public.opportunity_final_projects final_project
  where final_project.organization_id = new.organization_id
    and final_project.opportunity_id = new.opportunity_id;

  if not found
    or mapping_row.project_id <> new.project_id
    or mapping_row.accepted_quote_id is distinct from new.accepted_quote_id
  then
    raise exception 'Promotion event contradicts final Project mapping'
      using errcode = 'TS409';
  end if;

  select coalesce(
    nullif(upper(btrim(to_jsonb(organization) ->> 'default_currency')), ''),
    'NZD'
  ) into currency_value
  from public.organizations organization
  where organization.id = new.organization_id;

  evidence_value := jsonb_build_object(
    'quote_line_count', (select count(*) from public.project_quote_line_items line
      where line.organization_id = new.organization_id
        and line.quote_id = new.accepted_quote_id
        and line.project_id = new.project_id),
    'commercial_item_count', (select count(*) from public.commercial_items item
      where item.organization_id = new.organization_id
        and item.opportunity_id = new.opportunity_id
        and item.project_id = new.project_id),
    'cost_item_count', (select count(*) from public.cost_items cost
      where cost.organization_id = new.organization_id
        and cost.source_document_kind = 'project_quote'
        and cost.source_document_id = new.accepted_quote_id
        and cost.project_id = new.project_id
        and cost.is_current),
    'task_count', (select count(*) from public.project_job_todos task
      where task.organization_id = new.organization_id
        and task.project_id = new.project_id
        and task.deleted_at is null),
    'takeoff_page_count', (select count(*) from public.takeoff_pages page
      where page.organization_id = new.organization_id
        and page.project_id = new.project_id),
    'measurement_count', (select count(*) from public.takeoff_measurements measurement
      where measurement.organization_id = new.organization_id
        and measurement.project_id = new.project_id
        and measurement.archived_at is null),
    'drawing_set_count', (select count(*) from public.project_drawing_sets drawing
      where drawing.organization_id = new.organization_id
        and drawing.project_id = new.project_id),
    'scope_run_count', (select count(*) from public.scope_runs scope
      where scope.organization_id = new.organization_id
        and scope.project_id = new.project_id),
    'trade_pack_count', (select count(*) from public.trade_packs pack
      where pack.organization_id = new.organization_id
        and pack.project_id = new.project_id),
    'document_workspace_ids', coalesce((
      select jsonb_agg(link.workspace_id order by link.workspace_id)
      from public.document_workspace_entities link
      where link.organization_id = new.organization_id
        and (link.opportunity_id = new.opportunity_id or link.project_id = new.project_id)
    ), '[]'::jsonb)
  );

  new.contract_subtotal := quote_row.subtotal;
  new.contract_tax := quote_row.gst_amount;
  new.contract_total := quote_row.total_quote_price;
  new.contract_currency := currency_value;
  new.structural_evidence := evidence_value;
  new.evidence_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'organization_id', new.organization_id,
      'opportunity_id', new.opportunity_id,
      'project_id', new.project_id,
      'accepted_quote_id', new.accepted_quote_id,
      'subtotal', quote_row.subtotal,
      'tax', quote_row.gst_amount,
      'total', quote_row.total_quote_price,
      'currency', currency_value,
      'structure', evidence_value
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  return new;
end;
$$;

revoke all on function public.validate_opportunity_promotion_event_insert()
from public, anon, authenticated;

-- Stage 4 shadow observations are evidence for the legacy conversion path.
-- A Stage 5 promotion lifecycle is an active path, so it must not be inserted
-- into the legacy-only shadow ledger or produce a misleading capture error.
create or replace function public.capture_opportunity_promotion_shadow_v2(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_correlation_id uuid,
  p_actor_user_id uuid
)
returns table (run_id uuid, captured boolean, eligible boolean, failure_codes text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  control_row public.opportunity_promotion_shadow_controls%rowtype;
  evaluation record;
  existing_row public.opportunity_promotion_shadow_runs%rowtype;
begin
  select * into control_row
  from public.opportunity_promotion_shadow_controls control
  where control.organization_id = p_organization_id;
  if control_row.organization_id is null
    or not control_row.shadow_enabled
    or control_row.evaluator_version <> 'shadow-v2'
  then
    return query select null::uuid, false, false, array[]::text[];
    return;
  end if;

  select * into evaluation
  from public.evaluate_opportunity_promotion_shadow_v2(
    p_organization_id, p_opportunity_id, p_accepted_quote_id, p_actor_user_id
  );

  if evaluation.lifecycle_strategy is distinct from 'legacy_two_project_v1' then
    return query select null::uuid, false, false, evaluation.failure_codes;
    return;
  end if;

  insert into public.opportunity_promotion_shadow_runs (
    organization_id, opportunity_id, workspace_project_id, accepted_quote_id,
    lifecycle_strategy, lifecycle_strategy_version, evaluator_version,
    conversion_correlation_id, eligibility_result, eligibility_failure_codes,
    pre_snapshot, immutable_payload_hash, created_by
  ) values (
    p_organization_id, p_opportunity_id, evaluation.workspace_project_id,
    p_accepted_quote_id, evaluation.lifecycle_strategy,
    evaluation.lifecycle_strategy_version, evaluation.evaluator_version,
    p_correlation_id, case when evaluation.eligible then 'eligible' else 'ineligible' end,
    evaluation.failure_codes, evaluation.snapshot, evaluation.payload_hash,
    p_actor_user_id
  )
  on conflict (organization_id, opportunity_id) do nothing;

  select * into existing_row
  from public.opportunity_promotion_shadow_runs shadow_run
  where shadow_run.organization_id = p_organization_id
    and shadow_run.opportunity_id = p_opportunity_id;

  return query select
    existing_row.id,
    existing_row.conversion_correlation_id = p_correlation_id,
    existing_row.eligibility_result = 'eligible',
    existing_row.eligibility_failure_codes;
end;
$$;

revoke all on function public.capture_opportunity_promotion_shadow_v2(uuid, uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.capture_opportunity_promotion_shadow_v2(uuid, uuid, uuid, uuid, uuid)
to service_role;

-- One trusted orchestration point preserves the existing public award route
-- while branching exclusively on immutable lifecycle evidence.
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
      or rollout_row.pilot_scope <> 'local_admin_pilot'
      or rollout_row.pilot_environment <> 'local_development'
    then
      raise exception 'Opportunity promotion pilot award is paused'
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

comment on function public.create_opportunity_workspace_controlled_v1(
  uuid, uuid, text, uuid, jsonb, uuid, text, date, numeric, text
) is 'Stage 5 trusted creation entry point. Strategy is selected from an exact default-off rollout control.';

comment on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
is 'Stage 5 award orchestrator. Immutable lifecycle strategy selects same-Project promotion or preserved legacy conversion.';

commit;
