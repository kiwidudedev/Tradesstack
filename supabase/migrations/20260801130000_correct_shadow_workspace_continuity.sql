begin;

-- Stage 4 correction only. This migration does not enable any control, change a
-- lifecycle strategy, create a final mapping, or invoke the promotion RPC.
alter table public.opportunity_promotion_shadow_controls
  drop constraint opportunity_promotion_shadow_evaluator_check,
  add constraint opportunity_promotion_shadow_evaluator_check
    check (evaluator_version in ('shadow-v1', 'shadow-v2'));

alter table public.opportunity_promotion_shadow_controls
  alter column evaluator_version set default 'shadow-v2';

alter table public.opportunity_promotion_shadow_runs
  drop constraint opportunity_promotion_shadow_evaluator_version_check,
  add constraint opportunity_promotion_shadow_evaluator_version_check
    check (evaluator_version in ('shadow-v1', 'shadow-v2'));

alter table public.opportunity_promotion_shadow_runs
  add column expected_difference_codes text[] not null default array[]::text[];

alter table public.opportunity_promotion_shadow_runs
  add constraint opportunity_promotion_shadow_expected_difference_codes_check
  check (
    expected_difference_codes <@ array[
      'legacy_final_does_not_own_workspace_tasks',
      'legacy_final_does_not_own_takeoff_pages',
      'legacy_final_does_not_own_takeoff_measurements',
      'promoted_workspace_task_continuity_verified',
      'promoted_workspace_takeoff_continuity_verified',
      'promoted_workspace_measurement_continuity_verified'
    ]::text[]
  );

alter table public.opportunity_promotion_shadow_runs
  drop constraint opportunity_promotion_shadow_mismatch_codes_check,
  add constraint opportunity_promotion_shadow_mismatch_codes_check check (
    mismatch_codes <@ array[
      'identity_mismatch',
      'baseline_quote_mismatch',
      'baseline_total_mismatch',
      'quote_line_count_mismatch',
      'commercial_item_mismatch',
      'cost_item_mismatch',
      'document_workspace_mismatch',
      'document_count_mismatch',
      'drawing_count_mismatch',
      'takeoff_count_mismatch',
      'scope_count_mismatch',
      'trade_pack_count_mismatch',
      'task_count_mismatch',
      'visibility_mismatch',
      'delivery_eligibility_mismatch',
      'lineage_mismatch',
      'ambiguous_source_state',
      'comparison_failed',
      'task_continuity_mismatch',
      'takeoff_page_continuity_mismatch',
      'measurement_continuity_mismatch',
      'calibration_continuity_mismatch',
      'workspace_history_continuity_mismatch',
      'pricing_workbook_continuity_mismatch'
    ]::text[]
  );

create or replace function public.validate_opportunity_promotion_shadow_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pre_observed'
    or new.status not in ('completed', 'comparison_error')
    or new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.opportunity_id is distinct from old.opportunity_id
    or new.workspace_project_id is distinct from old.workspace_project_id
    or new.accepted_quote_id is distinct from old.accepted_quote_id
    or new.lifecycle_strategy is distinct from old.lifecycle_strategy
    or new.lifecycle_strategy_version is distinct from old.lifecycle_strategy_version
    or new.evaluator_version is distinct from old.evaluator_version
    or new.conversion_correlation_id is distinct from old.conversion_correlation_id
    or new.observation_kind is distinct from old.observation_kind
    or new.eligibility_result is distinct from old.eligibility_result
    or new.eligibility_failure_codes is distinct from old.eligibility_failure_codes
    or new.predicted_final_project_identity_rule
      is distinct from old.predicted_final_project_identity_rule
    or new.pre_snapshot is distinct from old.pre_snapshot
    or new.immutable_payload_hash is distinct from old.immutable_payload_hash
    or new.pre_observed_at is distinct from old.pre_observed_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Opportunity promotion shadow observations are immutable'
      using errcode = 'TS409';
  end if;
  return new;
end;
$$;

-- Content-minimized identity and numeric evidence for domains that remain on W.
create or replace function public.get_opportunity_workspace_continuity_snapshot_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_workspace_project_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  tasks as (
    select task.id
    from public.project_job_todos task
    where task.organization_id = p_organization_id
      and task.project_id = p_workspace_project_id
      and task.opportunity_id = p_opportunity_id
      and task.deleted_at is null
  ),
  pages as (
    select page.id
    from public.takeoff_pages page
    where page.organization_id = p_organization_id
      and page.project_id = p_workspace_project_id
      and page.opportunity_id = p_opportunity_id
  ),
  calibrations as (
    select calibration.id
    from public.takeoff_calibrations calibration
    join pages page on page.id = calibration.page_id
    where calibration.organization_id = p_organization_id
      and calibration.project_id = p_workspace_project_id
      and calibration.opportunity_id = p_opportunity_id
  ),
  measurements as (
    select measurement.id, measurement.quantity, measurement.count_value
    from public.takeoff_measurements measurement
    join pages page on page.id = measurement.page_id
    where measurement.organization_id = p_organization_id
      and measurement.project_id = p_workspace_project_id
      and measurement.opportunity_id = p_opportunity_id
      and measurement.archived_at is null
  )
  select jsonb_build_object(
    'tasks', jsonb_build_object(
      'ids', coalesce((select jsonb_agg(task.id order by task.id) from tasks task), '[]'::jsonb),
      'count', (select count(*) from tasks),
      'activity_count', (
        select count(*) from public.task_activity_log activity
        join tasks task on task.id = activity.task_id
        where activity.organization_id = p_organization_id
          and activity.project_id = p_workspace_project_id
      ),
      'ownership_valid', not exists (
        select 1 from public.project_job_todos task
        where task.organization_id = p_organization_id
          and task.opportunity_id = p_opportunity_id
          and task.deleted_at is null
          and task.project_id is distinct from p_workspace_project_id
      )
    ),
    'takeoff', jsonb_build_object(
      'page_ids', coalesce((select jsonb_agg(page.id order by page.id) from pages page), '[]'::jsonb),
      'calibration_ids', coalesce((select jsonb_agg(calibration.id order by calibration.id) from calibrations calibration), '[]'::jsonb),
      'measurement_ids', coalesce((select jsonb_agg(measurement.id order by measurement.id) from measurements measurement), '[]'::jsonb),
      'page_count', (select count(*) from pages),
      'calibration_count', (select count(*) from calibrations),
      'measurement_count', (select count(*) from measurements),
      'quantity_total', (select coalesce(sum(measurement.quantity), 0) from measurements measurement),
      'count_total', (select coalesce(sum(measurement.count_value), 0) from measurements measurement),
      'event_count', (
        select count(*) from public.takeoff_measurement_events event
        join measurements measurement on measurement.id = event.measurement_id
        where event.organization_id = p_organization_id
          and event.project_id = p_workspace_project_id
          and event.opportunity_id = p_opportunity_id
      ),
      'ownership_valid', not exists (
        select 1 from public.takeoff_pages page
        where page.organization_id = p_organization_id
          and page.opportunity_id = p_opportunity_id
          and page.project_id is distinct from p_workspace_project_id
      ) and not exists (
        select 1 from public.takeoff_calibrations calibration
        where calibration.organization_id = p_organization_id
          and calibration.opportunity_id = p_opportunity_id
          and calibration.project_id is distinct from p_workspace_project_id
      ) and not exists (
        select 1 from public.takeoff_measurements measurement
        where measurement.organization_id = p_organization_id
          and measurement.opportunity_id = p_opportunity_id
          and measurement.project_id is distinct from p_workspace_project_id
      ),
      'relationships_valid', not exists (
        select 1 from public.takeoff_measurements measurement
        left join public.takeoff_pages page
          on page.id = measurement.page_id
         and page.organization_id = measurement.organization_id
         and page.project_id = measurement.project_id
        left join public.takeoff_calibrations calibration
          on calibration.id = measurement.calibration_id
         and calibration.page_id = measurement.page_id
         and calibration.organization_id = measurement.organization_id
         and calibration.project_id = measurement.project_id
        where measurement.organization_id = p_organization_id
          and measurement.opportunity_id = p_opportunity_id
          and measurement.project_id = p_workspace_project_id
          and (
            page.id is null
            or (measurement.calibration_id is not null and calibration.id is null)
          )
      )
    ),
    'pricing', jsonb_build_object(
      'workbook_ids', coalesce((
        select jsonb_agg(workbook.id order by workbook.id)
        from public.opportunity_pricing_worksheets workbook
        where workbook.organization_id = p_organization_id
          and workbook.opportunity_id = p_opportunity_id
          and workbook.archived_at is null
      ), '[]'::jsonb),
      'workbook_count', (
        select count(*) from public.opportunity_pricing_worksheets workbook
        where workbook.organization_id = p_organization_id
          and workbook.opportunity_id = p_opportunity_id
          and workbook.archived_at is null
      ),
      'ownership_valid', not exists (
        select 1 from public.opportunity_pricing_worksheets workbook
        where workbook.organization_id = p_organization_id
          and workbook.opportunity_id = p_opportunity_id
          and workbook.archived_at is null
          and workbook.project_id is not null
          and workbook.project_id is distinct from p_workspace_project_id
      )
    )
  );
$$;

revoke all on function public.get_opportunity_workspace_continuity_snapshot_v1(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.get_opportunity_workspace_continuity_snapshot_v1(uuid, uuid, uuid)
to service_role;

create or replace function public.evaluate_opportunity_promotion_shadow_v2(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_actor_user_id uuid
)
returns table (
  eligible boolean,
  failure_codes text[],
  workspace_project_id uuid,
  lifecycle_strategy text,
  lifecycle_strategy_version smallint,
  evaluator_version text,
  snapshot jsonb,
  payload_hash text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base record;
  snapshot_value jsonb;
begin
  select * into base
  from public.evaluate_opportunity_promotion_shadow_v1(
    p_organization_id, p_opportunity_id, p_accepted_quote_id, p_actor_user_id
  );

  snapshot_value := base.snapshot || jsonb_build_object(
    'permanent_workspace',
    public.get_opportunity_workspace_continuity_snapshot_v1(
      p_organization_id, p_opportunity_id, base.workspace_project_id
    )
  );

  return query select
    base.eligible,
    base.failure_codes,
    base.workspace_project_id,
    base.lifecycle_strategy,
    base.lifecycle_strategy_version,
    'shadow-v2'::text,
    snapshot_value,
    encode(extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke all on function public.evaluate_opportunity_promotion_shadow_v2(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.evaluate_opportunity_promotion_shadow_v2(uuid, uuid, uuid, uuid)
to service_role;

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

create or replace function public.finalize_opportunity_promotion_shadow_v2(
  p_organization_id uuid,
  p_run_id uuid,
  p_final_project_id uuid,
  p_actor_user_id uuid
)
returns table (
  finalized boolean,
  comparison_result text,
  mismatch_codes text[],
  expected_difference_codes text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  control_row public.opportunity_promotion_shadow_controls%rowtype;
  run_row public.opportunity_promotion_shadow_runs%rowtype;
  mapping_row public.opportunity_final_projects%rowtype;
  final_row public.organization_projects%rowtype;
  baseline record;
  final_document_workspace_id uuid;
  post_value jsonb;
  mismatches text[] := array[]::text[];
  expected_differences text[] := array[]::text[];
  result_value text;
  pre_quote jsonb;
  pre_commercial jsonb;
  pre_cost jsonb;
  pre_documents jsonb;
  pre_features jsonb;
  pre_permanent jsonb;
  post_permanent jsonb;
  actual_visible boolean := false;
  actual_delivery boolean := false;
  legacy_final_task_count integer := 0;
  legacy_final_page_count integer := 0;
  legacy_final_measurement_count integer := 0;
begin
  if not exists (
    select 1 from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_actor_user_id
  ) then
    raise exception 'Not authorized for shadow comparison' using errcode = '42501';
  end if;

  select * into control_row
  from public.opportunity_promotion_shadow_controls control
  where control.organization_id = p_organization_id;
  if control_row.organization_id is null
    or not control_row.comparison_enabled
    or control_row.evaluator_version <> 'shadow-v2'
  then
    return query select false, null::text, array[]::text[], array[]::text[];
    return;
  end if;

  select * into run_row
  from public.opportunity_promotion_shadow_runs shadow_run
  where shadow_run.organization_id = p_organization_id
    and shadow_run.id = p_run_id
  for update;
  if run_row.id is null or run_row.evaluator_version <> 'shadow-v2' then
    return query select false, 'comparison_error'::text,
      array['comparison_failed']::text[], array[]::text[];
    return;
  end if;
  if run_row.status <> 'pre_observed' then
    return query select false, run_row.comparison_result, run_row.mismatch_codes,
      run_row.expected_difference_codes;
    return;
  end if;

  select * into mapping_row
  from public.opportunity_final_projects mapping
  where mapping.organization_id = p_organization_id
    and mapping.opportunity_id = run_row.opportunity_id;
  select * into final_row
  from public.organization_projects project
  where project.organization_id = p_organization_id
    and project.id = p_final_project_id;
  select * into baseline
  from public.resolve_project_contractual_baseline_v1(p_organization_id, p_final_project_id);
  select link.workspace_id into final_document_workspace_id
  from public.document_workspace_entities link
  where link.organization_id = p_organization_id
    and link.project_id = p_final_project_id;

  select exists (
    select 1 from public.get_visible_project_ids_v1(
      p_organization_id, array[p_final_project_id]::uuid[]
    ) visible where visible.project_id = p_final_project_id
  ) into actual_visible;
  actual_delivery := public.is_project_delivery_eligible_v1(p_organization_id, p_final_project_id);

  post_permanent := public.get_opportunity_workspace_continuity_snapshot_v1(
    p_organization_id, run_row.opportunity_id, run_row.workspace_project_id
  );
  select count(*)::integer into legacy_final_task_count
  from public.project_job_todos task
  where task.organization_id = p_organization_id
    and task.project_id = p_final_project_id and task.deleted_at is null;
  select count(*)::integer into legacy_final_page_count
  from public.takeoff_pages page
  where page.organization_id = p_organization_id and page.project_id = p_final_project_id;
  select count(*)::integer into legacy_final_measurement_count
  from public.takeoff_measurements measurement
  where measurement.organization_id = p_organization_id
    and measurement.project_id = p_final_project_id and measurement.archived_at is null;

  post_value := jsonb_build_object(
    'identity', jsonb_build_object(
      'opportunity_id', run_row.opportunity_id,
      'workspace_project_id', run_row.workspace_project_id,
      'final_project_id', p_final_project_id,
      'final_source_opportunity_id', final_row.source_opportunity_id,
      'mapped_project_id', mapping_row.project_id
    ),
    'quote', jsonb_build_object(
      'id', baseline.quote_id,
      'subtotal', (select coalesce(quote.subtotal, 0) from public.project_quotes quote
        where quote.organization_id = p_organization_id and quote.id = baseline.quote_id),
      'tax', (select coalesce(quote.gst_amount, 0) from public.project_quotes quote
        where quote.organization_id = p_organization_id and quote.id = baseline.quote_id),
      'total', (select coalesce(quote.total_quote_price, 0) from public.project_quotes quote
        where quote.organization_id = p_organization_id and quote.id = baseline.quote_id),
      'line_count', (select count(*) from public.project_quote_line_items line
        where line.organization_id = p_organization_id
          and line.quote_id = baseline.quote_id and line.project_id = p_final_project_id)
    ),
    'commercial', jsonb_build_object(
      'item_count', (select count(*) from public.commercial_items item
        where item.organization_id = p_organization_id
          and item.opportunity_id = run_row.opportunity_id
          and item.project_id = p_final_project_id),
      'total', (select coalesce(sum(item.total), 0) from public.commercial_items item
        where item.organization_id = p_organization_id
          and item.opportunity_id = run_row.opportunity_id
          and item.project_id = p_final_project_id)
    ),
    'cost', jsonb_build_object(
      'item_count', (select count(*) from public.cost_items cost
        where cost.organization_id = p_organization_id
          and cost.source_document_kind = 'project_quote'
          and cost.source_document_id = baseline.quote_id
          and cost.project_id = p_final_project_id and cost.is_current),
      'total', (select coalesce(sum(cost.line_total), 0) from public.cost_items cost
        where cost.organization_id = p_organization_id
          and cost.source_document_kind = 'project_quote'
          and cost.source_document_id = baseline.quote_id
          and cost.project_id = p_final_project_id and cost.is_current)
    ),
    'documents', jsonb_build_object(
      'workspace_id', final_document_workspace_id,
      'node_count', (select count(*) from public.document_nodes node
        where node.organization_id = p_organization_id
          and node.workspace_id = final_document_workspace_id and node.deleted_at is null),
      'version_count', (select count(*) from public.document_versions version
        where version.organization_id = p_organization_id
          and version.workspace_id = final_document_workspace_id and version.purged_at is null)
    ),
    'features', jsonb_build_object(
      'drawing_set_count', (select count(*) from public.project_drawing_sets drawing
        where drawing.organization_id = p_organization_id and drawing.project_id = p_final_project_id),
      'trade_pack_count', (select count(*) from public.trade_packs pack
        where pack.organization_id = p_organization_id and pack.project_id = p_final_project_id),
      'scope_run_count', (select count(*) from public.scope_runs scope
        where scope.organization_id = p_organization_id and scope.project_id = p_final_project_id)
    ),
    'legacy_final_workspace_domains', jsonb_build_object(
      'task_count', legacy_final_task_count,
      'takeoff_page_count', legacy_final_page_count,
      'measurement_count', legacy_final_measurement_count
    ),
    'permanent_workspace', post_permanent,
    'actual', jsonb_build_object('visible', actual_visible, 'delivery_eligible', actual_delivery)
  );

  pre_quote := run_row.pre_snapshot -> 'quote';
  pre_commercial := run_row.pre_snapshot -> 'commercial';
  pre_cost := run_row.pre_snapshot -> 'cost';
  pre_documents := run_row.pre_snapshot -> 'documents';
  pre_features := run_row.pre_snapshot -> 'features';
  pre_permanent := run_row.pre_snapshot -> 'permanent_workspace';

  if run_row.eligibility_result = 'ineligible' then
    result_value := 'ineligible';
  else
    if p_final_project_id = run_row.workspace_project_id
      or mapping_row.project_id is distinct from p_final_project_id
    then mismatches := array_append(mismatches, 'identity_mismatch'); end if;
    if final_row.source_opportunity_id is distinct from run_row.opportunity_id
    then mismatches := array_append(mismatches, 'lineage_mismatch'); end if;
    if baseline.is_valid is not true or baseline.quote_id is distinct from run_row.accepted_quote_id
    then mismatches := array_append(mismatches, 'baseline_quote_mismatch'); end if;
    if (post_value #>> '{quote,subtotal}')::numeric is distinct from (pre_quote ->> 'subtotal')::numeric
      or (post_value #>> '{quote,tax}')::numeric is distinct from (pre_quote ->> 'tax')::numeric
      or (post_value #>> '{quote,total}')::numeric is distinct from (pre_quote ->> 'total')::numeric
    then mismatches := array_append(mismatches, 'baseline_total_mismatch'); end if;
    if (post_value #>> '{quote,line_count}')::integer is distinct from (pre_quote ->> 'line_count')::integer
    then mismatches := array_append(mismatches, 'quote_line_count_mismatch'); end if;
    if post_value -> 'commercial' is distinct from pre_commercial
    then mismatches := array_append(mismatches, 'commercial_item_mismatch'); end if;
    if post_value -> 'cost' is distinct from pre_cost
    then mismatches := array_append(mismatches, 'cost_item_mismatch'); end if;
    if post_value #>> '{documents,workspace_id}' is distinct from pre_documents ->> 'workspace_id'
    then mismatches := array_append(mismatches, 'document_workspace_mismatch'); end if;
    if (post_value #>> '{documents,node_count}')::integer is distinct from (pre_documents ->> 'node_count')::integer
      or (post_value #>> '{documents,version_count}')::integer is distinct from (pre_documents ->> 'version_count')::integer
    then mismatches := array_append(mismatches, 'document_count_mismatch'); end if;
    if (post_value #>> '{features,drawing_set_count}')::integer
      is distinct from (pre_features ->> 'drawing_set_count')::integer
    then mismatches := array_append(mismatches, 'drawing_count_mismatch'); end if;
    if (post_value #>> '{features,scope_run_count}')::integer
      is distinct from (pre_features ->> 'scope_run_count')::integer
    then mismatches := array_append(mismatches, 'scope_count_mismatch'); end if;
    if (post_value #>> '{features,trade_pack_count}')::integer
      is distinct from (pre_features ->> 'trade_pack_count')::integer
    then mismatches := array_append(mismatches, 'trade_pack_count_mismatch'); end if;

    if post_permanent #> '{tasks,ids}' is distinct from pre_permanent #> '{tasks,ids}'
      or (post_permanent #>> '{tasks,ownership_valid}')::boolean is not true
    then mismatches := array_append(mismatches, 'task_continuity_mismatch'); end if;
    if post_permanent #> '{takeoff,page_ids}' is distinct from pre_permanent #> '{takeoff,page_ids}'
    then mismatches := array_append(mismatches, 'takeoff_page_continuity_mismatch'); end if;
    if post_permanent #> '{takeoff,measurement_ids}' is distinct from pre_permanent #> '{takeoff,measurement_ids}'
      or (post_permanent #>> '{takeoff,quantity_total}')::numeric
        is distinct from (pre_permanent #>> '{takeoff,quantity_total}')::numeric
      or (post_permanent #>> '{takeoff,count_total}')::numeric
        is distinct from (pre_permanent #>> '{takeoff,count_total}')::numeric
    then mismatches := array_append(mismatches, 'measurement_continuity_mismatch'); end if;
    if post_permanent #> '{takeoff,calibration_ids}' is distinct from pre_permanent #> '{takeoff,calibration_ids}'
    then mismatches := array_append(mismatches, 'calibration_continuity_mismatch'); end if;
    if (post_permanent #>> '{takeoff,ownership_valid}')::boolean is not true
      or (post_permanent #>> '{takeoff,relationships_valid}')::boolean is not true
      or (post_permanent #>> '{takeoff,event_count}')::integer
        is distinct from (pre_permanent #>> '{takeoff,event_count}')::integer
      or (post_permanent #>> '{tasks,activity_count}')::integer
        is distinct from (pre_permanent #>> '{tasks,activity_count}')::integer
    then mismatches := array_append(mismatches, 'workspace_history_continuity_mismatch'); end if;
    if post_permanent -> 'pricing' is distinct from pre_permanent -> 'pricing'
    then mismatches := array_append(mismatches, 'pricing_workbook_continuity_mismatch'); end if;
    if not actual_visible then mismatches := array_append(mismatches, 'visibility_mismatch'); end if;
    if not actual_delivery then mismatches := array_append(mismatches, 'delivery_eligibility_mismatch'); end if;

    if cardinality(mismatches) = 0 then
      if legacy_final_task_count is distinct from (pre_permanent #>> '{tasks,count}')::integer then
        expected_differences := array_append(expected_differences, 'legacy_final_does_not_own_workspace_tasks');
      end if;
      if legacy_final_page_count is distinct from (pre_permanent #>> '{takeoff,page_count}')::integer then
        expected_differences := array_append(expected_differences, 'legacy_final_does_not_own_takeoff_pages');
      end if;
      if legacy_final_measurement_count is distinct from (pre_permanent #>> '{takeoff,measurement_count}')::integer then
        expected_differences := array_append(expected_differences, 'legacy_final_does_not_own_takeoff_measurements');
      end if;
      if coalesce((pre_permanent #>> '{tasks,count}')::integer, 0) > 0 then
        expected_differences := array_append(expected_differences, 'promoted_workspace_task_continuity_verified');
      end if;
      if coalesce((pre_permanent #>> '{takeoff,page_count}')::integer, 0) > 0 then
        expected_differences := array_append(expected_differences, 'promoted_workspace_takeoff_continuity_verified');
      end if;
      if coalesce((pre_permanent #>> '{takeoff,measurement_count}')::integer, 0) > 0 then
        expected_differences := array_append(expected_differences, 'promoted_workspace_measurement_continuity_verified');
      end if;
    end if;

    result_value := case
      when cardinality(mismatches) > 0 then 'mismatch'
      when p_final_project_id <> run_row.workspace_project_id then 'expected_difference'
      else 'match'
    end;
  end if;

  update public.opportunity_promotion_shadow_runs shadow_run
  set final_project_id = p_final_project_id,
      status = 'completed',
      post_snapshot = post_value,
      comparison_result = result_value,
      mismatch_codes = mismatches,
      expected_difference_codes = expected_differences,
      compared_at = timezone('utc', now())
  where shadow_run.id = run_row.id;

  return query select true, result_value, mismatches, expected_differences;
exception when others then
  if run_row.id is not null and run_row.status = 'pre_observed' and p_final_project_id is not null then
    update public.opportunity_promotion_shadow_runs shadow_run
    set final_project_id = p_final_project_id,
        status = 'comparison_error',
        post_snapshot = jsonb_build_object('error_code', sqlstate),
        comparison_result = 'comparison_error',
        mismatch_codes = array['comparison_failed']::text[],
        expected_difference_codes = array[]::text[],
        compared_at = timezone('utc', now())
    where shadow_run.id = run_row.id;
  end if;
  return query select false, 'comparison_error'::text,
    array['comparison_failed']::text[], array[]::text[];
end;
$$;

revoke all on function public.finalize_opportunity_promotion_shadow_v2(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.finalize_opportunity_promotion_shadow_v2(uuid, uuid, uuid, uuid)
to service_role;

comment on function public.evaluate_opportunity_promotion_shadow_v2(uuid, uuid, uuid, uuid) is
  'Pure Stage 4 continuity evaluator. Permanent W-owned records are compared by identity and integrity, not by legacy F ownership.';

commit;
