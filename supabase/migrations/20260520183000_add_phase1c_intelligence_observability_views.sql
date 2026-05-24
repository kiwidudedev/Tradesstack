create or replace function public._intelligence_can_view_analytics(
  p_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  member_row public.organization_members%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;

  select *
  into member_row
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  limit 1;

  if member_row.id is null then
    return false;
  end if;

  return member_row.role in ('owner', 'admin')
    or public.has_org_permission(p_organization_id, 'intelligence.analytics.read');
end;
$$;

create or replace view public.intelligence_observability_daily_overview as
select
  activity.organization_id,
  activity.activity_date,
  activity.module,
  sum(activity.intelligence_event_count) as intelligence_event_count,
  sum(activity.correction_event_count) as correction_event_count,
  sum(activity.ai_interaction_count) as ai_interaction_count,
  sum(activity.validation_case_count) as validation_case_count,
  max(activity.latest_activity_at) as latest_activity_at
from (
  select
    e.organization_id,
    date_trunc('day', e.occurred_at at time zone 'utc')::date as activity_date,
    e.module,
    count(*)::bigint as intelligence_event_count,
    0::bigint as correction_event_count,
    0::bigint as ai_interaction_count,
    0::bigint as validation_case_count,
    max(e.occurred_at) as latest_activity_at
  from public.intelligence_events e
  where e.visibility_scope <> 'system'
    and public._intelligence_can_view_analytics(e.organization_id)
  group by 1, 2, 3

  union all

  select
    c.organization_id,
    date_trunc('day', c.created_at at time zone 'utc')::date as activity_date,
    c.module,
    0::bigint as intelligence_event_count,
    count(*)::bigint as correction_event_count,
    0::bigint as ai_interaction_count,
    0::bigint as validation_case_count,
    max(c.created_at) as latest_activity_at
  from public.correction_events c
  where c.visibility_scope <> 'system'
    and public._intelligence_can_view_analytics(c.organization_id)
  group by 1, 2, 3

  union all

  select
    ai.organization_id,
    date_trunc('day', ai.created_at at time zone 'utc')::date as activity_date,
    ai.module,
    0::bigint as intelligence_event_count,
    0::bigint as correction_event_count,
    count(*)::bigint as ai_interaction_count,
    0::bigint as validation_case_count,
    max(ai.created_at) as latest_activity_at
  from public.ai_interactions ai
  where ai.visibility_scope <> 'system'
    and public._intelligence_can_view_analytics(ai.organization_id)
  group by 1, 2, 3

  union all

  select
    vc.organization_id,
    date_trunc('day', vc.created_at at time zone 'utc')::date as activity_date,
    vc.module,
    0::bigint as intelligence_event_count,
    0::bigint as correction_event_count,
    0::bigint as ai_interaction_count,
    count(*)::bigint as validation_case_count,
    max(vc.created_at) as latest_activity_at
  from public.validation_cases vc
  where vc.visibility_scope <> 'system'
    and public._intelligence_can_view_analytics(vc.organization_id)
  group by 1, 2, 3
) activity
group by 1, 2, 3;

create or replace view public.intelligence_observability_event_daily as
select
  e.organization_id,
  date_trunc('day', e.occurred_at at time zone 'utc')::date as event_date,
  e.module,
  e.event_family,
  e.event_type,
  e.privacy_classification,
  bool_or(e.contains_financial_data) as contains_financial_data,
  count(*)::bigint as event_count,
  count(distinct e.entity_id)::bigint as distinct_entity_count,
  count(distinct e.actor_user_id)::bigint as distinct_actor_count,
  count(distinct e.project_id)::bigint as distinct_project_count,
  count(distinct e.opportunity_id)::bigint as distinct_opportunity_count,
  min(e.occurred_at) as first_occurred_at,
  max(e.occurred_at) as last_occurred_at
from public.intelligence_events e
where e.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(e.organization_id)
group by 1, 2, 3, 4, 5, 6;

create or replace view public.intelligence_observability_correction_daily as
select
  c.organization_id,
  date_trunc('day', c.created_at at time zone 'utc')::date as event_date,
  c.module,
  c.correction_type,
  c.target_entity_type,
  c.corrected_field_name,
  c.feedback_label,
  c.is_training_eligible,
  count(*)::bigint as correction_count,
  count(distinct c.target_entity_id)::bigint as distinct_target_count,
  count(distinct c.corrected_by_user_id)::bigint as distinct_actor_count,
  min(c.created_at) as first_created_at,
  max(c.created_at) as last_created_at
from public.correction_events c
where c.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(c.organization_id)
group by 1, 2, 3, 4, 5, 6, 7, 8;

create or replace view public.intelligence_observability_ai_daily as
with corrections_by_interaction as (
  select
    c.linked_ai_interaction_id as ai_interaction_id,
    count(*)::bigint as correction_count
  from public.correction_events c
  where c.linked_ai_interaction_id is not null
  group by 1
)
select
  ai.organization_id,
  date_trunc('day', ai.created_at at time zone 'utc')::date as event_date,
  ai.module,
  ai.interaction_type,
  count(*)::bigint as interaction_count,
  count(*) filter (where ai.human_disposition = 'accepted')::bigint as accepted_count,
  count(*) filter (where ai.human_disposition = 'rejected')::bigint as rejected_count,
  count(*) filter (where ai.human_disposition = 'edited')::bigint as edited_count,
  count(*) filter (where ai.human_disposition = 'partially_accepted')::bigint as partially_accepted_count,
  count(*) filter (where ai.human_disposition = 'ignored')::bigint as ignored_count,
  count(*) filter (where coalesce(cbi.correction_count, 0) > 0)::bigint as corrected_interaction_count,
  avg(ai.confidence) as avg_confidence,
  avg(ai.confidence) filter (where ai.human_disposition = 'accepted') as avg_confidence_accepted,
  avg(ai.confidence) filter (where ai.human_disposition = 'rejected') as avg_confidence_rejected,
  avg(ai.confidence) filter (where ai.human_disposition = 'edited') as avg_confidence_edited,
  avg(ai.confidence) filter (where coalesce(cbi.correction_count, 0) > 0) as avg_confidence_corrected,
  round(
    (
      count(*) filter (where coalesce(cbi.correction_count, 0) > 0)::numeric
      / nullif(count(*)::numeric, 0)
    ),
    4
  ) as correction_rate
from public.ai_interactions ai
left join corrections_by_interaction cbi
  on cbi.ai_interaction_id = ai.id
where ai.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(ai.organization_id)
group by 1, 2, 3, 4;

create or replace view public.intelligence_observability_ai_confidence_daily as
with corrections_by_interaction as (
  select
    c.linked_ai_interaction_id as ai_interaction_id,
    count(*)::bigint as correction_count
  from public.correction_events c
  where c.linked_ai_interaction_id is not null
  group by 1
)
select
  ai.organization_id,
  date_trunc('day', ai.created_at at time zone 'utc')::date as event_date,
  ai.module,
  ai.interaction_type,
  case
    when ai.confidence is null then 'unknown'
    when ai.confidence < 0.40 then '0.00-0.39'
    when ai.confidence < 0.60 then '0.40-0.59'
    when ai.confidence < 0.80 then '0.60-0.79'
    else '0.80-1.00'
  end as confidence_band,
  count(*)::bigint as interaction_count,
  count(*) filter (where ai.human_disposition = 'accepted')::bigint as accepted_count,
  count(*) filter (where ai.human_disposition = 'rejected')::bigint as rejected_count,
  count(*) filter (where ai.human_disposition = 'edited')::bigint as edited_count,
  count(*) filter (where coalesce(cbi.correction_count, 0) > 0)::bigint as corrected_interaction_count,
  round(
    (
      count(*) filter (where coalesce(cbi.correction_count, 0) > 0)::numeric
      / nullif(count(*)::numeric, 0)
    ),
    4
  ) as correction_rate
from public.ai_interactions ai
left join corrections_by_interaction cbi
  on cbi.ai_interaction_id = ai.id
where ai.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(ai.organization_id)
group by 1, 2, 3, 4, 5;

create or replace view public.intelligence_observability_validation_daily as
select
  vc.organization_id,
  date_trunc('day', vc.created_at at time zone 'utc')::date as event_date,
  vc.module,
  vc.rule_key,
  vc.validation_type,
  vc.severity,
  count(*)::bigint as validation_case_count,
  count(*) filter (where vc.result = 'failed')::bigint as failed_count,
  count(*) filter (where vc.result = 'warning')::bigint as warning_count,
  count(*) filter (where vc.result = 'passed')::bigint as passed_count,
  count(*) filter (where vc.result = 'overridden')::bigint as overridden_count,
  count(*) filter (where vc.requires_approval)::bigint as requires_approval_count,
  count(*) filter (where vc.approval_status = 'pending')::bigint as approval_pending_count,
  count(*) filter (where vc.approval_status = 'approved')::bigint as approval_approved_count,
  count(*) filter (where vc.approval_status = 'rejected')::bigint as approval_rejected_count,
  round(
    (
      count(*) filter (where vc.result = 'overridden')::numeric
      / nullif(count(*)::numeric, 0)
    ),
    4
  ) as override_rate
from public.validation_cases vc
where vc.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(vc.organization_id)
group by 1, 2, 3, 4, 5, 6;

create or replace view public.intelligence_observability_pricing_worksheet_daily as
select
  e.organization_id,
  date_trunc('day', e.occurred_at at time zone 'utc')::date as event_date,
  coalesce(nullif(btrim(e.metadata->>'worksheetName'), ''), '(unnamed worksheet)') as worksheet_name,
  nullif(btrim(e.metadata->>'tradePackage'), '') as trade_package,
  count(*) filter (where e.event_type = 'worksheet_created')::bigint as worksheet_created_count,
  count(*) filter (where e.event_type = 'worksheet_renamed')::bigint as worksheet_renamed_count,
  count(*) filter (where e.event_type = 'worksheet_duplicated')::bigint as worksheet_duplicated_count,
  count(*) filter (where e.event_type = 'worksheet_archived')::bigint as worksheet_archived_count,
  count(*) filter (where e.event_type = 'worksheet_saved')::bigint as worksheet_saved_count,
  avg(nullif(e.metadata->'structureSummary'->>'rowCount', '')::numeric)
    filter (where e.event_type = 'worksheet_saved') as avg_row_count_on_save,
  avg(nullif(e.metadata->'structureSummary'->>'columnCount', '')::numeric)
    filter (where e.event_type = 'worksheet_saved') as avg_column_count_on_save,
  avg(nullif(e.metadata->'structureSummary'->>'formulaCount', '')::numeric)
    filter (where e.event_type = 'worksheet_saved') as avg_formula_count_on_save,
  avg(nullif(e.metadata->'structureSummary'->>'populatedCellCount', '')::numeric)
    filter (where e.event_type = 'worksheet_saved') as avg_populated_cell_count_on_save
from public.intelligence_events e
where e.module = 'pricing_worksheets'
  and e.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(e.organization_id)
group by 1, 2, 3, 4;

create or replace view public.intelligence_observability_cost_item_daily as
select
  e.organization_id,
  date_trunc('day', e.occurred_at at time zone 'utc')::date as event_date,
  e.module,
  e.event_type,
  e.project_id,
  coalesce(
    nullif(btrim(e.after_data->>'workType'), ''),
    nullif(btrim(e.before_data->>'workType'), '')
  ) as work_type,
  coalesce(
    nullif(btrim(e.after_data->>'costType'), ''),
    nullif(btrim(e.before_data->>'costType'), '')
  ) as cost_type,
  coalesce(
    nullif(btrim(e.after_data->>'costCode'), ''),
    nullif(btrim(e.before_data->>'costCode'), ''),
    nullif(btrim(e.after_data->>'intelligenceCostCode'), ''),
    nullif(btrim(e.before_data->>'intelligenceCostCode'), '')
  ) as intelligence_cost_code,
  coalesce(
    nullif(btrim(e.after_data->>'targetCostCodeId'), ''),
    nullif(btrim(e.before_data->>'targetCostCodeId'), '')
  ) as target_cost_code_id,
  coalesce(
    nullif(btrim(e.metadata->>'sourceDocumentKind'), ''),
    nullif(btrim(e.after_data->>'sourceDocumentKind'), ''),
    nullif(btrim(e.before_data->>'sourceDocumentKind'), '')
  ) as source_document_kind,
  count(*)::bigint as event_count,
  count(distinct e.entity_id)::bigint as distinct_entity_count
from public.intelligence_events e
where e.module in ('cost_items', 'cost_code_mappings')
  and e.event_type in (
    'cost_item_classification_assigned',
    'cost_item_classification_corrected',
    'cost_code_mapping_overridden',
    'cost_code_mapping_confirmed',
    'cost_item_review_resolved',
    'cost_item_review_reopened'
  )
  and e.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(e.organization_id)
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10;

create or replace view public.intelligence_observability_cost_item_review_backlog as
select
  ci.organization_id,
  ci.project_id,
  ci.source_document_kind,
  ci.work_type,
  ci.cost_type,
  count(*)::bigint as unresolved_review_count,
  avg(ci.classification_confidence) as avg_classification_confidence,
  max(ci.updated_at) as last_updated_at
from public.cost_items ci
where ci.is_current
  and coalesce(ci.needs_review, false)
  and public._intelligence_can_view_analytics(ci.organization_id)
group by 1, 2, 3, 4, 5;

create or replace view public.intelligence_observability_supplier_invoice_daily as
select
  e.organization_id,
  date_trunc('day', e.occurred_at at time zone 'utc')::date as event_date,
  e.project_id,
  count(*) filter (where e.event_type = 'supplier_invoice_created')::bigint as invoice_created_count,
  count(*) filter (where e.event_type = 'supplier_invoice_match_suggested')::bigint as match_suggested_count,
  count(*) filter (where e.event_type = 'supplier_invoice_match_confirmed')::bigint as match_confirmed_count,
  count(*) filter (where e.event_type = 'supplier_invoice_match_rejected')::bigint as match_rejected_count,
  round(
    (
      count(*) filter (where e.event_type = 'supplier_invoice_match_confirmed')::numeric
      / nullif(
          (
            count(*) filter (where e.event_type = 'supplier_invoice_match_confirmed')
            + count(*) filter (where e.event_type = 'supplier_invoice_match_rejected')
          )::numeric,
          0
        )
    ),
    4
  ) as match_acceptance_rate,
  count(*) filter (where e.event_type = 'supplier_invoice_allocation_suggested')::bigint as allocation_suggested_count,
  count(*) filter (where e.event_type = 'supplier_invoice_allocation_approved')::bigint as allocation_approved_count,
  count(*) filter (where e.event_type = 'supplier_invoice_allocation_corrected')::bigint as allocation_corrected_count,
  round(
    (
      count(*) filter (where e.event_type = 'supplier_invoice_allocation_approved')::numeric
      / nullif(
          (
            count(*) filter (where e.event_type = 'supplier_invoice_allocation_approved')
            + count(*) filter (where e.event_type = 'supplier_invoice_allocation_corrected')
          )::numeric,
          0
        )
    ),
    4
  ) as allocation_approval_rate,
  count(*) filter (where e.event_type = 'supplier_invoice_approval_requested')::bigint as approval_requested_count,
  count(*) filter (where e.event_type = 'supplier_invoice_approved')::bigint as invoice_approved_count,
  count(*) filter (where e.event_type = 'supplier_invoice_rejected')::bigint as invoice_rejected_count,
  count(*) filter (where e.event_type = 'supplier_invoice_actual_cost_posted')::bigint as actual_cost_posted_count,
  count(*) filter (where e.event_type = 'supplier_invoice_actual_cost_reversed')::bigint as actual_cost_reversed_count,
  count(*) filter (where e.event_type = 'ai_supplier_invoice_match_accepted')::bigint as ai_match_accepted_count,
  count(*) filter (where e.event_type = 'ai_supplier_invoice_match_rejected')::bigint as ai_match_rejected_count,
  count(*) filter (where e.event_type = 'ai_supplier_invoice_match_edited')::bigint as ai_match_edited_count
from public.intelligence_events e
where e.module = 'supplier_invoices'
  and e.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(e.organization_id)
group by 1, 2, 3;

create or replace view public.intelligence_observability_takeoff_daily as
select
  e.organization_id,
  date_trunc('day', e.occurred_at at time zone 'utc')::date as event_date,
  e.project_id,
  e.opportunity_id,
  coalesce(
    nullif(btrim(e.after_data->>'measurementKind'), ''),
    nullif(btrim(e.before_data->>'measurementKind'), '')
  ) as measurement_kind,
  count(*) filter (where e.event_type = 'takeoff_measurement_created')::bigint as measurement_created_count,
  count(*) filter (where e.event_type = 'takeoff_measurement_updated')::bigint as measurement_updated_count,
  count(*) filter (where e.event_type = 'takeoff_measurement_corrected')::bigint as measurement_corrected_count,
  count(*) filter (where e.event_type = 'takeoff_measurement_archived')::bigint as measurement_archived_count,
  count(*) filter (where e.event_type = 'takeoff_measurement_deleted')::bigint as measurement_deleted_count,
  count(*) filter (where e.event_type = 'takeoff_measurement_restored')::bigint as measurement_restored_count,
  count(*) filter (where e.event_type = 'takeoff_calibration_created')::bigint as calibration_created_count,
  count(*) filter (where e.event_type = 'takeoff_calibration_corrected')::bigint as calibration_corrected_count
from public.intelligence_events e
where e.module = 'takeoff'
  and e.visibility_scope <> 'system'
  and public._intelligence_can_view_analytics(e.organization_id)
group by 1, 2, 3, 4, 5;

revoke all on public.intelligence_observability_daily_overview from public, anon, authenticated;
revoke all on public.intelligence_observability_event_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_correction_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_ai_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_ai_confidence_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_validation_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_pricing_worksheet_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_cost_item_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_cost_item_review_backlog from public, anon, authenticated;
revoke all on public.intelligence_observability_supplier_invoice_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_takeoff_daily from public, anon, authenticated;

grant select on public.intelligence_observability_daily_overview to authenticated;
grant select on public.intelligence_observability_event_daily to authenticated;
grant select on public.intelligence_observability_correction_daily to authenticated;
grant select on public.intelligence_observability_ai_daily to authenticated;
grant select on public.intelligence_observability_ai_confidence_daily to authenticated;
grant select on public.intelligence_observability_validation_daily to authenticated;
grant select on public.intelligence_observability_pricing_worksheet_daily to authenticated;
grant select on public.intelligence_observability_cost_item_daily to authenticated;
grant select on public.intelligence_observability_cost_item_review_backlog to authenticated;
grant select on public.intelligence_observability_supplier_invoice_daily to authenticated;
grant select on public.intelligence_observability_takeoff_daily to authenticated;

insert into public.app_permissions (permission_key, description)
values
  ('intelligence.analytics.read', 'View internal intelligence analytics and observability aggregates')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'intelligence.analytics.read', true),
  ('admin', 'intelligence.analytics.read', true),
  ('qs', 'intelligence.analytics.read', false),
  ('project_manager', 'intelligence.analytics.read', false),
  ('worker', 'intelligence.analytics.read', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();
