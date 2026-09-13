-- Financial Routing is the sole persisted Cost Item classification authority.

alter table public.supplier_invoice_line_allocations
  add column if not exists financial_routing_confidence numeric null,
  add column if not exists financial_routing_source text null;

alter table public.project_actual_cost_events
  add column if not exists financial_routing_confidence numeric null,
  add column if not exists financial_routing_source text null;

-- This is a schema backfill, not a user edit. Suppress workflow, immutable
-- export, approval-invalidation and learning side effects while only the new
-- routing provenance columns are populated. Transaction rollback restores the
-- original trigger state if any following statement fails.
alter table public.supplier_invoice_line_allocations disable trigger user;
alter table public.project_actual_cost_events disable trigger user;

update public.supplier_invoice_line_allocations allocation
set
  financial_routing_confidence = coalesce(
    allocation.financial_routing_confidence,
    (
      select ci.financial_routing_confidence
      from public.cost_items ci
      where ci.id = coalesce(allocation.source_cost_item_id, allocation.cost_item_id)
    )
  ),
  financial_routing_source = coalesce(
    allocation.financial_routing_source,
    (
      select ci.financial_routing_source
      from public.cost_items ci
      where ci.id = coalesce(allocation.source_cost_item_id, allocation.cost_item_id)
    )
  )
where (
    allocation.financial_routing_confidence is null
    or allocation.financial_routing_source is null
  );

update public.project_actual_cost_events event
set
  tradesstack_cost_code = coalesce(
    event.tradesstack_cost_code,
    (
      select allocation.tradesstack_cost_code
      from public.supplier_invoice_line_allocations allocation
      where allocation.id = coalesce(event.source_invoice_allocation_id, event.supplier_invoice_line_allocation_id)
    ),
    (
      select ci.tradesstack_cost_code from public.cost_items ci
      where ci.id = coalesce(event.source_cost_item_id, event.cost_item_id)
    )
  ),
  tradesstack_cost_code_label = coalesce(
    event.tradesstack_cost_code_label,
    (
      select allocation.tradesstack_cost_code_label
      from public.supplier_invoice_line_allocations allocation
      where allocation.id = coalesce(event.source_invoice_allocation_id, event.supplier_invoice_line_allocation_id)
    ),
    (
      select ci.tradesstack_cost_code_label from public.cost_items ci
      where ci.id = coalesce(event.source_cost_item_id, event.cost_item_id)
    )
  ),
  financial_routing_confidence = coalesce(
    event.financial_routing_confidence,
    (
      select allocation.financial_routing_confidence
      from public.supplier_invoice_line_allocations allocation
      where allocation.id = coalesce(event.source_invoice_allocation_id, event.supplier_invoice_line_allocation_id)
    ),
    (
      select ci.financial_routing_confidence from public.cost_items ci where ci.id = event.cost_item_id
    )
  ),
  financial_routing_source = coalesce(
    event.financial_routing_source,
    (
      select allocation.financial_routing_source
      from public.supplier_invoice_line_allocations allocation
      where allocation.id = coalesce(event.source_invoice_allocation_id, event.supplier_invoice_line_allocation_id)
    ),
    (
      select ci.financial_routing_source from public.cost_items ci where ci.id = event.cost_item_id
    )
  )
where (
    event.tradesstack_cost_code is null
    or event.tradesstack_cost_code_label is null
    or event.financial_routing_confidence is null
    or event.financial_routing_source is null
  );

-- Historical actual-cost rows can predate allocation/Cost Item lineage. Route
-- only those unresolved rows to the canonical 800 bucket and make the low-
-- confidence migration provenance explicit; do not reconstruct old taxonomy.
update public.project_actual_cost_events event
set
  tradesstack_cost_code = coalesce(event.tradesstack_cost_code, 800),
  tradesstack_cost_code_label = coalesce(
    event.tradesstack_cost_code_label,
    (select routing.label from public.tradesstack_financial_routing_codes routing where routing.code = 800),
    'Others'
  ),
  financial_routing_confidence = coalesce(event.financial_routing_confidence, 0),
  financial_routing_source = coalesce(event.financial_routing_source, 'migration_default')
where event.tradesstack_cost_code is null
   or event.tradesstack_cost_code_label is null;

alter table public.supplier_invoice_line_allocations enable trigger user;
alter table public.project_actual_cost_events enable trigger user;

create or replace function public.enqueue_current_cost_item_construction_intelligence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_current
    or new.status in ('deleted', 'superseded')
    or new.tradesstack_cost_code is null
    or nullif(btrim(coalesce(new.tradesstack_cost_code_label, '')), '') is null
    or nullif(btrim(coalesce(new.description, new.title, '')), '') is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.source_revision_key is not distinct from old.source_revision_key
    and new.source_fingerprint is not distinct from old.source_fingerprint
    and new.description is not distinct from old.description
    and new.tradesstack_cost_code is not distinct from old.tradesstack_cost_code
    and new.tradesstack_cost_code_label is not distinct from old.tradesstack_cost_code_label
    and new.accounting_mapping_id is not distinct from old.accounting_mapping_id then
    return new;
  end if;

  perform public.enqueue_cost_construction_intelligence_event(jsonb_build_object(
    'idempotencyKey', concat_ws(':', 'cost-item', new.id::text, new.source_revision_key, new.source_fingerprint),
    'organizationId', new.organization_id,
    'projectId', new.project_id,
    'sourceType', 'cost_item',
    'sourceId', new.id,
    'tradesstackCostCode', new.tradesstack_cost_code::text,
    'tradesstackCostCodeLabel', new.tradesstack_cost_code_label,
    'accountingMappingId', new.accounting_mapping_id,
    'description', coalesce(nullif(btrim(new.description), ''), new.title),
    'supplierId', new.supplier_id,
    'supplierName', new.supplier_name_snapshot,
    'quantity', new.quantity,
    'unit', new.unit,
    'rate', new.unit_rate,
    'amount', new.line_total,
    'classificationVersion', 2,
    'documentContext', jsonb_strip_nulls(jsonb_build_object(
      'module', 'cost_items',
      'sourceDocumentKind', new.source_document_kind,
      'sourceDocumentId', new.source_document_id,
      'sourceDocumentSubtype', coalesce(new.source_line_table, new.origin_kind),
      'parentCostItemId', new.parent_cost_item_id,
      'title', new.title,
      'itemType', new.item_type,
      'category', new.category,
      'section', new.section,
      'priceSource', new.price_source,
      'projectType', new.project_type,
      'buildingType', new.building_type,
      'sector', new.sector,
      'locationRegion', new.location_region
    )),
    'eventPayload', jsonb_strip_nulls(jsonb_build_object(
      'rawDescription', new.raw_description,
      'normalizedDescription', new.normalized_description,
      'sourceDocumentKind', new.source_document_kind,
      'sourceDocumentSubtype', coalesce(new.source_line_table, new.origin_kind),
      'parentCostItemId', new.parent_cost_item_id
    ))
  ));

  return new;
end;
$$;

drop trigger if exists cost_items_enqueue_construction_intelligence on public.cost_items;
create trigger cost_items_enqueue_construction_intelligence
after insert or update of
  source_revision_key,
  source_fingerprint,
  description,
  tradesstack_cost_code,
  tradesstack_cost_code_label,
  accounting_mapping_id,
  is_current,
  status
on public.cost_items
for each row
execute function public.enqueue_current_cost_item_construction_intelligence();

-- Remove the two obsolete Cost Item/cost-code taxonomy derivation loops while
-- retaining worksheet, supplier-invoice and takeoff organization memory.
do $$
declare
  definition text;
  first_loop integer;
  current_loop integer;
begin
  select pg_get_functiondef('public.run_organization_memory_derivation(jsonb)'::regprocedure)
  into definition;

  first_loop := strpos(definition, E'  for candidate in\n    with base as (\n      select\n        e.organization_id,\n        coalesce(nullif');
  current_loop := strpos(definition, E'  for candidate in\n    with base as (\n      select\n        e.organization_id,\n        nullif(btrim(coalesce(e.metadata->>''workbookId''');

  if first_loop = 0 or current_loop = 0 or current_loop <= first_loop then
    raise exception 'Unable to locate legacy Cost Item organization-memory derivation loops';
  end if;

  definition := overlay(definition placing '' from first_loop for current_loop - first_loop);
  execute definition;
end;
$$;

-- Remove blank legacy columns from the current mirror function definitions.
do $$
declare
  function_name text;
  definition text;
  rewritten text;
begin
  foreach function_name in array array[
    'upsert_opportunity_quote_cost_items(uuid,text)',
    'upsert_cost_items_for_document(text,uuid,text)',
    'upsert_cost_items_for_project_variation(uuid,text)',
    'sync_purchase_order_line_cost_item(uuid)',
    'upsert_cost_items_for_project_purchase_order(uuid,text)',
    'upsert_cost_items_for_project_claim(uuid,text)'
  ]
  loop
    select pg_get_functiondef(to_regprocedure('public.' || function_name)) into definition;
    if definition is null then
      raise exception 'Missing current Cost Item mirror function: %', function_name;
    end if;

    rewritten := regexp_replace(
      definition,
      E'\\n([[:space:]]*)cost_code,\\n[[:space:]]*cost_type,',
      '',
      'g'
    );
    rewritten := regexp_replace(
      rewritten,
      $pattern$
[[:space:]]*'',
[[:space:]]*'',
([[:space:]]*(cl|line_row|resolved_routing)\.tradesstack_cost_code)$pattern$,
      E'\n\\1',
      'g'
    );

    if rewritten = definition
      or rewritten ~ E'\\n[[:space:]]*cost_code,\\n[[:space:]]*cost_type,' then
      raise exception 'Unable to remove legacy mirror writes from %', function_name;
    end if;

    execute rewritten;
  end loop;
end;
$$;

create or replace function public.reverse_supplier_invoice_actual_cost_event(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_event_id uuid,
  p_reversal_reason text default null,
  p_reversal_note text default null
)
returns table (
  original_event_id uuid,
  reversal_event_id uuid,
  successor_allocation_id uuid,
  supplier_invoice_id uuid,
  project_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  original_event public.project_actual_cost_events%rowtype;
  reversal_event public.project_actual_cost_events%rowtype;
  source_allocation public.supplier_invoice_line_allocations%rowtype;
  successor_allocation public.supplier_invoice_line_allocations%rowtype;
  next_allocation_sequence integer;
  successor_review_status text;
  successor_review_reason text;
  normalized_reason text;
  normalized_note text;
  correction_root_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_organization_id is null then raise exception 'Organization is required.'; end if;
  if p_supplier_invoice_id is null then raise exception 'Supplier invoice is required.'; end if;
  if p_event_id is null then raise exception 'Actual cost event is required.'; end if;
  if not public.has_org_permission(p_organization_id, 'actual_costs.reverse') then
    raise exception 'You do not have permission to reverse actual costs.';
  end if;

  normalized_reason := nullif(btrim(coalesce(p_reversal_reason, '')), '');
  normalized_note := nullif(btrim(coalesce(p_reversal_note, '')), '');

  if not exists (
    select 1 from public.supplier_invoices invoice
    where invoice.id = p_supplier_invoice_id and invoice.organization_id = p_organization_id
  ) then raise exception 'Supplier invoice not found.'; end if;

  select * into original_event
  from public.project_actual_cost_events event
  where event.id = p_event_id
    and event.organization_id = p_organization_id
    and event.supplier_invoice_id = p_supplier_invoice_id
  for update;

  if not found then raise exception 'Actual cost event not found.'; end if;
  if original_event.event_type <> 'posting' then raise exception 'Only posting actual cost events can be reversed.'; end if;
  if original_event.event_status <> 'posted' then raise exception 'Only posted actual cost events can be reversed.'; end if;
  if original_event.source_type <> 'supplier_invoice' then raise exception 'Only supplier invoice actual cost events can be reversed.'; end if;
  if original_event.tradesstack_cost_code is null or original_event.tradesstack_cost_code_label is null then
    raise exception 'Actual cost event is missing Financial Routing.';
  end if;
  if exists (
    select 1 from public.project_actual_cost_events reversal
    where reversal.organization_id = p_organization_id
      and reversal.event_type = 'reversal'
      and reversal.reverses_event_id = original_event.id
  ) then raise exception 'This actual cost event has already been reversed.'; end if;

  select * into source_allocation
  from public.supplier_invoice_line_allocations allocation
  where allocation.id = coalesce(original_event.source_invoice_allocation_id, original_event.supplier_invoice_line_allocation_id)
    and allocation.organization_id = p_organization_id
    and allocation.supplier_invoice_id = p_supplier_invoice_id
  for update;

  if not found then raise exception 'Source allocation not found for actual cost event.'; end if;
  if source_allocation.project_id is distinct from original_event.project_id then
    raise exception 'Source allocation project does not match the actual cost event.';
  end if;
  if source_allocation.supplier_invoice_line_id is distinct from original_event.supplier_invoice_line_id then
    raise exception 'Source allocation invoice line does not match the actual cost event.';
  end if;

  correction_root_id := coalesce(original_event.correction_root_event_id, original_event.id);

  insert into public.project_actual_cost_events (
    organization_id, supplier_invoice_id, supplier_invoice_line_id,
    supplier_invoice_line_allocation_id, purchase_order_id, purchase_order_line_item_id,
    project_id, supplier_id, cost_item_id, source_cost_item_id,
    tradesstack_cost_code, tradesstack_cost_code_label,
    financial_routing_confidence, financial_routing_source,
    organization_cost_code_id, accounting_mapping_id,
    amount, tax_amount, total_amount, quantity, event_date, event_status, event_type,
    posting_source, reverses_event_id, correction_root_event_id, reversal_reason, reversal_note,
    source_invoice_line_id, source_invoice_allocation_id, source_type, source_reference,
    ai_construction_intelligence, created_by_user_id
  ) values (
    original_event.organization_id, original_event.supplier_invoice_id, original_event.supplier_invoice_line_id,
    source_allocation.id, original_event.purchase_order_id, original_event.purchase_order_line_item_id,
    original_event.project_id, original_event.supplier_id, original_event.cost_item_id, original_event.source_cost_item_id,
    original_event.tradesstack_cost_code, original_event.tradesstack_cost_code_label,
    original_event.financial_routing_confidence, original_event.financial_routing_source,
    original_event.organization_cost_code_id, original_event.accounting_mapping_id,
    original_event.amount * -1, original_event.tax_amount * -1, original_event.total_amount * -1,
    case when original_event.quantity is null then null else original_event.quantity * -1 end,
    original_event.event_date, 'posted', 'reversal', original_event.posting_source,
    original_event.id, correction_root_id, normalized_reason, normalized_note,
    original_event.source_invoice_line_id, coalesce(original_event.source_invoice_allocation_id, source_allocation.id),
    original_event.source_type, original_event.source_reference,
    original_event.ai_construction_intelligence, auth.uid()
  ) returning * into reversal_event;

  update public.supplier_invoice_line_allocations set edit_state = 'reversed'
  where id = source_allocation.id;

  select coalesce(max(allocation_sequence), 0) + 1 into next_allocation_sequence
  from public.supplier_invoice_line_allocations
  where organization_id = p_organization_id
    and supplier_invoice_line_id = source_allocation.supplier_invoice_line_id
    and purchase_order_line_item_id is not distinct from source_allocation.purchase_order_line_item_id;

  successor_review_status := case
    when source_allocation.tradesstack_cost_code is null then 'needs_routing_review'
    when source_allocation.accounting_mapping_id is null then 'needs_accounting_mapping'
    when source_allocation.review_status in ('needs_routing_review', 'high_value_review', 'disputed') then source_allocation.review_status
    else 'pending'
  end;
  successor_review_reason := case
    when successor_review_status = 'needs_routing_review' then coalesce(source_allocation.review_reason, 'missing_financial_routing')
    when successor_review_status = 'needs_accounting_mapping' then coalesce(source_allocation.review_reason, 'missing_accounting_mapping')
    else source_allocation.review_reason
  end;

  insert into public.supplier_invoice_line_allocations (
    organization_id, supplier_invoice_id, supplier_invoice_line_id,
    purchase_order_id, purchase_order_line_item_id, project_id,
    allocation_group_id, supersedes_allocation_id, allocation_sequence,
    allocated_quantity, allocated_amount, matched_amount,
    cost_item_id, source_cost_item_id,
    tradesstack_cost_code, tradesstack_cost_code_label,
    financial_routing_confidence, financial_routing_source,
    organization_cost_code_id, accounting_mapping_id, accounting_resolution_status,
    accounting_tax_rate_id, tax_resolution_status,
    allocation_status, match_status, review_status, review_reason,
    approval_status, approval_notes, approval_checks_json,
    reviewed_by_user_id, reviewed_at, approved_by_user_id, approved_at,
    allocation_source, ai_suggested_purchase_order_line_item_id, ai_suggested_cost_item_id,
    ai_confidence_score, ai_reasoning_summary, accepted_ai_suggestion,
    ai_suggestion_metadata_json, ai_construction_intelligence, edit_state
  ) values (
    source_allocation.organization_id, source_allocation.supplier_invoice_id, source_allocation.supplier_invoice_line_id,
    source_allocation.purchase_order_id, source_allocation.purchase_order_line_item_id, source_allocation.project_id,
    coalesce(source_allocation.allocation_group_id, source_allocation.id), source_allocation.id, next_allocation_sequence,
    source_allocation.allocated_quantity, source_allocation.allocated_amount, source_allocation.matched_amount,
    source_allocation.cost_item_id, source_allocation.source_cost_item_id,
    source_allocation.tradesstack_cost_code, source_allocation.tradesstack_cost_code_label,
    source_allocation.financial_routing_confidence, source_allocation.financial_routing_source,
    source_allocation.organization_cost_code_id, source_allocation.accounting_mapping_id,
    source_allocation.accounting_resolution_status, source_allocation.accounting_tax_rate_id,
    source_allocation.tax_resolution_status, source_allocation.allocation_status,
    source_allocation.match_status, successor_review_status, successor_review_reason,
    'pending', '', source_allocation.approval_checks_json,
    null, null, null, null, source_allocation.allocation_source,
    source_allocation.ai_suggested_purchase_order_line_item_id, source_allocation.ai_suggested_cost_item_id,
    source_allocation.ai_confidence_score, source_allocation.ai_reasoning_summary,
    source_allocation.accepted_ai_suggestion, source_allocation.ai_suggestion_metadata_json,
    source_allocation.ai_construction_intelligence, 'editable'
  ) returning * into successor_allocation;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values
  (
    p_organization_id, p_supplier_invoice_id, 'actual_cost_reversed',
    case when normalized_reason is null then 'Actual cost event reversed.' else format('Actual cost event reversed: %s.', normalized_reason) end,
    jsonb_build_object('original_event_id', original_event.id, 'reversal_event_id', reversal_event.id,
      'source_allocation_id', source_allocation.id, 'reason', normalized_reason, 'note', normalized_note),
    auth.uid()
  ),
  (
    p_organization_id, p_supplier_invoice_id, 'actual_cost_correction_started',
    'Correction draft allocation created from reversed actual cost event.',
    jsonb_build_object('original_event_id', original_event.id, 'reversal_event_id', reversal_event.id,
      'source_allocation_id', source_allocation.id, 'successor_allocation_id', successor_allocation.id,
      'reason', normalized_reason, 'note', normalized_note),
    auth.uid()
  );

  return query select original_event.id, reversal_event.id, successor_allocation.id,
    p_supplier_invoice_id, original_event.project_id;
end;
$$;

grant execute on function public.reverse_supplier_invoice_actual_cost_event(uuid, uuid, uuid, text, text) to authenticated;

drop view if exists public.intelligence_observability_cost_item_review_backlog;
drop view if exists public.intelligence_observability_cost_item_daily;

create view public.intelligence_observability_cost_item_daily as
select
  ci.organization_id,
  date_trunc('day', ci.updated_at at time zone 'utc')::date as event_date,
  'cost_items'::text as module,
  coalesce(ci.review_status, 'unreviewed') as event_type,
  ci.project_id,
  ci.tradesstack_cost_code,
  ci.tradesstack_cost_code_label,
  ci.financial_routing_source,
  ci.source_document_kind,
  count(*)::bigint as event_count,
  count(distinct ci.id)::bigint as distinct_entity_count,
  avg(ci.financial_routing_confidence) as avg_routing_confidence,
  count(*) filter (where ci.accounting_mapping_id is null)::bigint as unmapped_count
from public.cost_items ci
where ci.is_current
  and ci.status not in ('deleted', 'superseded')
  and public._intelligence_can_view_analytics(ci.organization_id)
group by 1, 2, 3, 4, 5, 6, 7, 8, 9;

create view public.intelligence_observability_cost_item_review_backlog as
select
  ci.organization_id,
  ci.project_id,
  ci.source_document_kind,
  ci.tradesstack_cost_code,
  ci.tradesstack_cost_code_label,
  ci.review_status,
  count(*)::bigint as unresolved_review_count,
  avg(ci.financial_routing_confidence) as avg_routing_confidence,
  max(ci.updated_at) as last_updated_at
from public.cost_items ci
where ci.is_current
  and ci.status not in ('deleted', 'superseded')
  and ci.review_status in ('needs_routing_review', 'needs_accounting_mapping', 'high_value_review')
  and public._intelligence_can_view_analytics(ci.organization_id)
group by 1, 2, 3, 4, 5, 6;

revoke all on public.intelligence_observability_cost_item_daily from public, anon, authenticated;
revoke all on public.intelligence_observability_cost_item_review_backlog from public, anon, authenticated;
grant select on public.intelligence_observability_cost_item_daily to authenticated;
grant select on public.intelligence_observability_cost_item_review_backlog to authenticated;

-- Route every Cost Item that could still be referenced before removing fallbacks.
with routing as (
  select ci.id, resolved.*
  from public.cost_items ci
  cross join lateral public.resolve_cost_item_financial_routing_defaults(
    ci.organization_id, ci.project_id, ci.source_document_kind, ci.source_line_table,
    ci.origin_kind, ci.item_type, ci.category, ci.section, ci.title, ci.description, ci.line_total
  ) resolved
  where ci.tradesstack_cost_code is null or ci.tradesstack_cost_code_label is null
)
update public.cost_items ci
set
  tradesstack_cost_code = routing.tradesstack_cost_code,
  tradesstack_cost_code_label = routing.tradesstack_cost_code_label,
  financial_routing_confidence = routing.financial_routing_confidence,
  financial_routing_source = routing.financial_routing_source,
  accounting_mapping_id = routing.accounting_mapping_id,
  review_status = routing.review_status,
  review_reason = routing.review_reason
from routing
where ci.id = routing.id;

do $$
begin
  if exists (
    select 1 from public.cost_items
    where is_current and status not in ('deleted', 'superseded')
      and (tradesstack_cost_code is null or tradesstack_cost_code_label is null)
  ) then raise exception 'Cannot retire legacy classification: current Cost Items are missing Financial Routing'; end if;

  if exists (
    select 1 from public.supplier_invoice_line_allocations
    where edit_state <> 'reversed'
      and (tradesstack_cost_code is null or tradesstack_cost_code_label is null)
  ) then raise exception 'Cannot retire legacy classification: active allocations are missing Financial Routing'; end if;

  if exists (
    select 1 from public.project_actual_cost_events
    where event_status = 'posted'
      and (tradesstack_cost_code is null or tradesstack_cost_code_label is null)
  ) then raise exception 'Cannot retire legacy classification: posted actual costs are missing Financial Routing'; end if;
end;
$$;

drop index if exists public.cost_items_classification_confidence_idx;
drop index if exists public.cost_items_classification_source_idx;
drop index if exists public.cost_items_needs_review_idx;
drop index if exists public.cost_items_review_queue_idx;

alter table public.cost_items
  drop constraint if exists cost_items_classification_confidence_range_check,
  drop constraint if exists cost_items_classification_source_check,
  drop constraint if exists cost_items_original_classification_object_check,
  drop constraint if exists cost_items_final_classification_object_check,
  drop column if exists work_type,
  drop column if exists cost_type,
  drop column if exists cost_code,
  drop column if exists classification_confidence,
  drop column if exists classification_source,
  drop column if exists needs_review,
  drop column if exists original_classification,
  drop column if exists final_classification;

alter table public.supplier_invoice_line_allocations
  drop constraint if exists supplier_invoice_line_allocations_classification_status_check,
  drop column if exists work_type,
  drop column if exists cost_type,
  drop column if exists internal_cost_code,
  drop column if exists classification_status;

alter table public.project_actual_cost_events
  drop column if exists work_type,
  drop column if exists cost_type,
  drop column if exists internal_cost_code;

drop table if exists public.organization_cost_code_mapping_rules;
