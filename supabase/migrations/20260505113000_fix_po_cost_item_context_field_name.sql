create or replace function public.upsert_cost_items_for_project_purchase_order(
  p_document_id uuid,
  p_source_revision_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_context record;
  rows_written integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into resolved_context
  from public.resolve_cost_item_document_context('project_purchase_order', p_document_id);

  if resolved_context.organization_id is null then
    raise exception 'Document context not found for cost item sync.';
  end if;

  with current_lines as (
    select
      po.organization_id,
      po.project_id,
      po.id as document_id,
      po.purchase_order_number as document_number,
      po.purchase_order_title as document_title,
      po.supplier_id,
      po.issued_to_label,
      li.id as line_item_id,
      li.line_uid,
      li.cost_item_id as previous_cost_item_id,
      li.section,
      li.description,
      li.quantity,
      li.unit,
      li.rate as unit_rate,
      coalesce(li.total, round(li.quantity * li.rate, 2)) as line_total,
      li.sort_order,
      li.source_time_sheet_entry_id,
      public.compute_cost_item_source_fingerprint(
        'project_purchase_order',
        'project_purchase_order_line_items',
        li.section,
        li.description,
        li.quantity,
        li.unit,
        li.rate,
        coalesce(li.total, round(li.quantity * li.rate, 2)),
        false,
        li.sort_order,
        coalesce(li.source_time_sheet_entry_id::text, ''),
        coalesce(li.line_uid::text, '')
      ) as source_fingerprint
    from public.project_purchase_orders po
    join public.project_purchase_order_line_items li
      on li.organization_id = po.organization_id
     and li.project_id = po.project_id
     and li.purchase_order_id = po.id
    where po.id = p_document_id
      and po.organization_id = resolved_context.organization_id
      and po.project_id = resolved_context.project_id
  ), inserted_cost_items as (
    insert into public.cost_items (
      organization_id,
      project_id,
      source_document_kind,
      source_document_id,
      source_line_table,
      source_line_id,
      parent_cost_item_id,
      origin_kind,
      source_snapshot,
      item_code,
      item_type,
      section,
      category,
      trade_id,
      trade_label,
      cost_code,
      cost_type,
      supplier_id,
      supplier_name_snapshot,
      title,
      description,
      quantity,
      unit,
      unit_rate,
      line_total,
      is_optional,
      sort_order,
      status,
      effective_from,
      effective_to,
      is_current,
      source_revision_key,
      source_fingerprint,
      linked_quote_line_item_id,
      linked_variation_line_item_id,
      linked_purchase_order_line_item_id,
      linked_claim_line_item_id,
      created_by
    )
    select
      cl.organization_id,
      cl.project_id,
      'project_purchase_order',
      cl.document_id,
      'project_purchase_order_line_items',
      cl.line_item_id,
      coalesce(cl.previous_cost_item_id, prev.id),
      case
        when cl.source_time_sheet_entry_id is not null then 'time_sheet_sync'
        else 'manual'
      end,
      jsonb_build_object(
        'document_kind', 'project_purchase_order',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'line_item_id', cl.line_item_id,
        'line_uid', cl.line_uid,
        'supplier_id', cl.supplier_id,
        'issued_to_label', cl.issued_to_label,
        'source_time_sheet_entry_id', cl.source_time_sheet_entry_id
      ),
      '',
      'line_item',
      cl.section,
      cl.section,
      null,
      null,
      '',
      '',
      cl.supplier_id,
      cl.issued_to_label,
      coalesce(nullif(btrim(cl.description), ''), 'Untitled line item'),
      coalesce(cl.description, ''),
      cl.quantity,
      cl.unit,
      cl.unit_rate,
      cl.line_total,
      false,
      cl.sort_order,
      'active',
      clock_timestamp(),
      null,
      true,
      p_source_revision_key,
      cl.source_fingerprint,
      null,
      null,
      cl.line_item_id,
      null,
      auth.uid()
    from current_lines cl
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.source_document_kind = 'project_purchase_order'
        and ci.source_document_id = cl.document_id
        and ci.source_revision_key <> p_source_revision_key
        and ci.source_fingerprint = cl.source_fingerprint
      order by ci.effective_from desc, ci.created_at desc
      limit 1
    ) prev on true
    returning id, linked_purchase_order_line_item_id
  )
  update public.project_purchase_order_line_items li
  set cost_item_id = inserted_cost_items.id
  from inserted_cost_items
  where li.id = inserted_cost_items.linked_purchase_order_line_item_id
    and li.cost_item_id is distinct from inserted_cost_items.id;

  get diagnostics rows_written = row_count;
  return rows_written;
end;
$$;
