begin;

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
  supplier_invoice_row public.supplier_invoices%rowtype;
  next_allocation_sequence integer;
  successor_review_status text;
  normalized_reason text;
  normalized_note text;
  correction_root_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_organization_id is null then
    raise exception 'Organization is required.';
  end if;

  if p_supplier_invoice_id is null then
    raise exception 'Supplier invoice is required.';
  end if;

  if p_event_id is null then
    raise exception 'Actual cost event is required.';
  end if;

  if not public.has_org_permission(p_organization_id, 'actual_costs.reverse') then
    raise exception 'You do not have permission to reverse actual costs.';
  end if;

  normalized_reason := nullif(btrim(coalesce(p_reversal_reason, '')), '');
  normalized_note := nullif(btrim(coalesce(p_reversal_note, '')), '');

  select *
  into supplier_invoice_row
  from public.supplier_invoices invoice_row
  where invoice_row.id = p_supplier_invoice_id
    and invoice_row.organization_id = p_organization_id;

  if not found then
    raise exception 'Supplier invoice not found.';
  end if;

  select *
  into original_event
  from public.project_actual_cost_events event_row
  where event_row.id = p_event_id
    and event_row.organization_id = p_organization_id
    and event_row.supplier_invoice_id = p_supplier_invoice_id
  for update;

  if not found then
    raise exception 'Actual cost event not found.';
  end if;

  if original_event.event_type <> 'posting' then
    raise exception 'Only posting actual cost events can be reversed.';
  end if;

  if original_event.event_status <> 'posted' then
    raise exception 'Only posted actual cost events can be reversed.';
  end if;

  if original_event.source_type <> 'supplier_invoice' then
    raise exception 'Only supplier invoice actual cost events can be reversed.';
  end if;

  if exists (
    select 1
    from public.project_actual_cost_events existing_reversal
    where existing_reversal.organization_id = p_organization_id
      and existing_reversal.event_type = 'reversal'
      and existing_reversal.reverses_event_id = original_event.id
  ) then
    raise exception 'This actual cost event has already been reversed.';
  end if;

  if not exists (
    select 1
    from public.organization_projects project_row
    where project_row.id = original_event.project_id
      and project_row.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for actual cost event.';
  end if;

  select *
  into source_allocation
  from public.supplier_invoice_line_allocations allocation_row
  where allocation_row.id = coalesce(
      original_event.source_invoice_allocation_id,
      original_event.supplier_invoice_line_allocation_id
    )
    and allocation_row.organization_id = p_organization_id
    and allocation_row.supplier_invoice_id = p_supplier_invoice_id
  for update;

  if not found then
    raise exception 'Source allocation not found for actual cost event.';
  end if;

  if source_allocation.project_id is distinct from original_event.project_id then
    raise exception 'Source allocation project does not match the actual cost event.';
  end if;

  if source_allocation.supplier_invoice_line_id is distinct from original_event.supplier_invoice_line_id then
    raise exception 'Source allocation invoice line does not match the actual cost event.';
  end if;

  correction_root_id := coalesce(original_event.correction_root_event_id, original_event.id);

  insert into public.project_actual_cost_events (
    organization_id,
    supplier_invoice_id,
    supplier_invoice_line_id,
    supplier_invoice_line_allocation_id,
    purchase_order_id,
    purchase_order_line_item_id,
    project_id,
    supplier_id,
    cost_item_id,
    source_cost_item_id,
    work_type,
    cost_type,
    internal_cost_code,
    organization_cost_code_id,
    amount,
    tax_amount,
    total_amount,
    quantity,
    event_date,
    event_status,
    event_type,
    posting_source,
    reverses_event_id,
    correction_root_event_id,
    reversal_reason,
    reversal_note,
    source_invoice_line_id,
    source_invoice_allocation_id,
    source_type,
    source_reference,
    created_by_user_id
  )
  values (
    original_event.organization_id,
    original_event.supplier_invoice_id,
    original_event.supplier_invoice_line_id,
    source_allocation.id,
    original_event.purchase_order_id,
    original_event.purchase_order_line_item_id,
    original_event.project_id,
    original_event.supplier_id,
    original_event.cost_item_id,
    original_event.source_cost_item_id,
    original_event.work_type,
    original_event.cost_type,
    original_event.internal_cost_code,
    original_event.organization_cost_code_id,
    original_event.amount * -1,
    original_event.tax_amount * -1,
    original_event.total_amount * -1,
    case
      when original_event.quantity is null then null
      else original_event.quantity * -1
    end,
    original_event.event_date,
    'posted',
    'reversal',
    original_event.posting_source,
    original_event.id,
    correction_root_id,
    normalized_reason,
    normalized_note,
    original_event.source_invoice_line_id,
    coalesce(original_event.source_invoice_allocation_id, source_allocation.id),
    original_event.source_type,
    original_event.source_reference,
    auth.uid()
  )
  returning *
  into reversal_event;

  update public.supplier_invoice_line_allocations allocation_row
  set edit_state = 'reversed'
  where allocation_row.id = source_allocation.id;

  select coalesce(max(allocation_row.allocation_sequence), 0) + 1
  into next_allocation_sequence
  from public.supplier_invoice_line_allocations allocation_row
  where allocation_row.organization_id = p_organization_id
    and allocation_row.supplier_invoice_line_id = source_allocation.supplier_invoice_line_id
    and allocation_row.purchase_order_line_item_id is not distinct from source_allocation.purchase_order_line_item_id;

  successor_review_status := case
    when source_allocation.classification_status = 'needs_review' then 'needs_cost_review'
    when source_allocation.accounting_resolution_status in ('unresolved', 'classification_review_required') then 'needs_accounting_review'
    else 'pending'
  end;

  insert into public.supplier_invoice_line_allocations (
    organization_id,
    supplier_invoice_id,
    supplier_invoice_line_id,
    purchase_order_id,
    purchase_order_line_item_id,
    project_id,
    allocation_group_id,
    supersedes_allocation_id,
    allocation_sequence,
    allocated_quantity,
    allocated_amount,
    matched_amount,
    cost_item_id,
    source_cost_item_id,
    work_type,
    cost_type,
    internal_cost_code,
    classification_status,
    organization_cost_code_id,
    accounting_resolution_status,
    allocation_status,
    match_status,
    review_status,
    approval_status,
    approval_notes,
    approval_checks_json,
    reviewed_by_user_id,
    reviewed_at,
    approved_by_user_id,
    approved_at,
    allocation_source,
    ai_suggested_purchase_order_line_item_id,
    ai_suggested_cost_item_id,
    ai_confidence_score,
    ai_reasoning_summary,
    accepted_ai_suggestion,
    ai_suggestion_metadata_json,
    edit_state
  )
  values (
    source_allocation.organization_id,
    source_allocation.supplier_invoice_id,
    source_allocation.supplier_invoice_line_id,
    source_allocation.purchase_order_id,
    source_allocation.purchase_order_line_item_id,
    source_allocation.project_id,
    coalesce(source_allocation.allocation_group_id, source_allocation.id),
    source_allocation.id,
    next_allocation_sequence,
    source_allocation.allocated_quantity,
    source_allocation.allocated_amount,
    source_allocation.matched_amount,
    source_allocation.cost_item_id,
    source_allocation.source_cost_item_id,
    source_allocation.work_type,
    source_allocation.cost_type,
    source_allocation.internal_cost_code,
    source_allocation.classification_status,
    source_allocation.organization_cost_code_id,
    source_allocation.accounting_resolution_status,
    source_allocation.allocation_status,
    source_allocation.match_status,
    successor_review_status,
    'pending',
    '',
    source_allocation.approval_checks_json,
    null,
    null,
    null,
    null,
    source_allocation.allocation_source,
    source_allocation.ai_suggested_purchase_order_line_item_id,
    source_allocation.ai_suggested_cost_item_id,
    source_allocation.ai_confidence_score,
    source_allocation.ai_reasoning_summary,
    source_allocation.accepted_ai_suggestion,
    source_allocation.ai_suggestion_metadata_json,
    'editable'
  )
  returning *
  into successor_allocation;

  insert into public.supplier_invoice_activity_events (
    organization_id,
    supplier_invoice_id,
    event_type,
    message,
    metadata,
    created_by
  )
  values
    (
      p_organization_id,
      p_supplier_invoice_id,
      'actual_cost_reversed',
      case
        when normalized_reason is null then 'Actual cost event reversed.'
        else format('Actual cost event reversed: %s.', normalized_reason)
      end,
      jsonb_build_object(
        'original_event_id', original_event.id,
        'reversal_event_id', reversal_event.id,
        'source_allocation_id', source_allocation.id,
        'reason', normalized_reason,
        'note', normalized_note
      ),
      auth.uid()
    ),
    (
      p_organization_id,
      p_supplier_invoice_id,
      'actual_cost_correction_started',
      'Correction draft allocation created from reversed actual cost event.',
      jsonb_build_object(
        'original_event_id', original_event.id,
        'reversal_event_id', reversal_event.id,
        'source_allocation_id', source_allocation.id,
        'successor_allocation_id', successor_allocation.id,
        'reason', normalized_reason,
        'note', normalized_note
      ),
      auth.uid()
    );

  return query
  select
    original_event.id,
    reversal_event.id,
    successor_allocation.id,
    p_supplier_invoice_id,
    original_event.project_id;
end;
$$;

grant execute on function public.reverse_supplier_invoice_actual_cost_event(uuid, uuid, uuid, text, text) to authenticated;

commit;
