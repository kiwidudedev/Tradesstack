begin;

drop function if exists public.mobile_mutate_project_purchase_order_manual_line_v2(
  uuid,
  uuid,
  timestamptz,
  text,
  uuid,
  text,
  text,
  numeric,
  text,
  numeric
);

create or replace function public.mobile_mutate_project_purchase_order_manual_line_v2(
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_expected_updated_at timestamptz,
  p_operation text,
  p_line_id uuid,
  p_section text,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_rate numeric
)
returns table (
  purchase_order_id uuid,
  project_id uuid,
  purchase_order_number text,
  purchase_order_title text,
  status text,
  origin text,
  requested_by text,
  requested_date date,
  due_date date,
  notes text,
  issued_to_label text,
  supplier_contact text,
  supplier_name_snapshot text,
  supplier_email_snapshot text,
  supplier_phone_snapshot text,
  subtotal numeric,
  gst_total numeric,
  total_purchase_order_price numeric,
  line_items jsonb,
  attachments jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_context record;
  po_row public.project_purchase_orders%rowtype;
  target_line public.project_purchase_order_line_items%rowtype;
  mutable_line_items jsonb := '[]'::jsonb;
  preserved_attachments jsonb := '[]'::jsonb;
  next_line_id uuid;
  next_line_uid uuid;
  operation_normalized text := lower(coalesce(p_operation, ''));
  section_normalized text;
  description_normalized text;
  unit_normalized text;
  blocking_match_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Purchase order version is required. Please refresh and try again.'
      using errcode = '40001';
  end if;

  if operation_normalized not in ('add', 'update', 'delete') then
    raise exception 'Operation must be add, update, or delete';
  end if;

  select *
  into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  if not public.has_org_permission(current_context.organization_id, 'purchase_orders.write') then
    raise exception 'Not authorized to edit purchase orders for this organization';
  end if;

  select *
  into po_row
  from public.project_purchase_orders po
  where po.organization_id = current_context.organization_id
    and po.project_id = p_project_id
    and po.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'Purchase order not found for this project';
  end if;

  if po_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This purchase order was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  select count(*)::integer
  into blocking_match_count
  from public.supplier_invoice_purchase_order_matches m
  where m.organization_id = current_context.organization_id
    and m.purchase_order_id = p_purchase_order_id;

  if blocking_match_count > 0 then
    raise exception 'This purchase order has supplier invoice match activity and cannot be edited from mobile yet.';
  end if;

  if operation_normalized in ('update', 'delete') and p_line_id is null then
    raise exception 'Line id is required for update or delete';
  end if;

  if operation_normalized in ('add', 'update') then
    section_normalized := case
      when p_section in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then p_section
      else null
    end;

    if section_normalized is null then
      raise exception 'Section must be one of Labour, Materials, Subcontractors, Plant, or Margin';
    end if;

    if p_quantity is null then
      raise exception 'Quantity is required';
    end if;

    if p_rate is null then
      raise exception 'Rate is required';
    end if;

    description_normalized := coalesce(p_description, '');
    unit_normalized := coalesce(p_unit, '');
  end if;

  if operation_normalized in ('update', 'delete') then
    select *
    into target_line
    from public.project_purchase_order_line_items li
    where li.organization_id = current_context.organization_id
      and li.project_id = p_project_id
      and li.purchase_order_id = p_purchase_order_id
      and li.id = p_line_id;

    if not found then
      raise exception 'Line item not found for this purchase order';
    end if;

    if target_line.source_time_sheet_entry_id is not null then
      raise exception 'Timesheet-synced labour lines cannot be edited from mobile';
    end if;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', li.id,
          'line_uid', li.line_uid,
          'cost_item_id', li.cost_item_id,
          'source_cost_item_id', li.source_cost_item_id,
          'section', li.section,
          'description', li.description,
          'quantity', li.quantity,
          'unit', li.unit,
          'rate', li.rate,
          'source_time_sheet_entry_id', li.source_time_sheet_entry_id
        )
        order by li.sort_order asc, li.created_at asc
      ),
      '[]'::jsonb
    )
  into mutable_line_items
  from public.project_purchase_order_line_items li
  where li.organization_id = current_context.organization_id
    and li.project_id = p_project_id
    and li.purchase_order_id = p_purchase_order_id;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', att.id,
          'name', att.file_name,
          'type', att.file_kind,
          'storagePath', att.storage_path,
          'externalUrl', att.external_url,
          'notes', att.notes
        )
        order by att.created_at asc
      ),
      '[]'::jsonb
    )
  into preserved_attachments
  from public.project_purchase_order_attachments att
  where att.organization_id = current_context.organization_id
    and att.project_id = p_project_id
    and att.purchase_order_id = p_purchase_order_id;

  if operation_normalized = 'add' then
    next_line_id := gen_random_uuid();
    next_line_uid := gen_random_uuid();

    mutable_line_items := mutable_line_items || jsonb_build_array(
      jsonb_build_object(
        'id', next_line_id,
        'line_uid', next_line_uid,
        'cost_item_id', null,
        'source_cost_item_id', null,
        'section', section_normalized,
        'description', description_normalized,
        'quantity', p_quantity,
        'unit', unit_normalized,
        'rate', p_rate,
        'source_time_sheet_entry_id', null
      )
    );
  elsif operation_normalized = 'update' then
    select coalesce(
      jsonb_agg(
        case
          when item->>'id' = p_line_id::text then
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(item, '{section}', to_jsonb(section_normalized), false),
                    '{description}',
                    to_jsonb(description_normalized),
                    false
                  ),
                  '{quantity}',
                  to_jsonb(p_quantity),
                  false
                ),
                '{unit}',
                to_jsonb(unit_normalized),
                false
              ),
              '{rate}',
              to_jsonb(p_rate),
              false
            )
          else item
        end
        order by ordinality
      ),
      '[]'::jsonb
    )
    into mutable_line_items
    from jsonb_array_elements(mutable_line_items) with ordinality as line(item, ordinality);
  else
    select coalesce(
      jsonb_agg(item order by ordinality),
      '[]'::jsonb
    )
    into mutable_line_items
    from jsonb_array_elements(mutable_line_items) with ordinality as line(item, ordinality)
    where item->>'id' <> p_line_id::text;
  end if;

  perform 1
  from public.save_project_purchase_order_draft(
    current_context.organization_id,
    p_project_id,
    p_purchase_order_id,
    p_expected_updated_at,
    po_row.purchase_order_title,
    po_row.purchase_order_number,
    po_row.status,
    po_row.origin,
    po_row.supplier_id,
    po_row.issued_to_label,
    po_row.supplier_contact,
    po_row.supplier_name_snapshot,
    po_row.supplier_email_snapshot,
    po_row.supplier_phone_snapshot,
    po_row.requested_by,
    po_row.requested_date,
    po_row.due_date,
    po_row.sent_to_client_at,
    po_row.approved_at,
    po_row.invoice_ready,
    po_row.notes,
    po_row.margin_percent,
    po_row.discount_amount,
    po_row.contingency_amount,
    po_row.gst_percent,
    po_row.include_margin_in_export,
    po_row.include_discount_in_export,
    po_row.include_contingency_in_export,
    mutable_line_items,
    preserved_attachments
  );

  return query
  select *
  from public.get_mobile_project_purchase_order_detail_v2(p_project_id, p_purchase_order_id);
end;
$$;

grant execute on function public.mobile_mutate_project_purchase_order_manual_line_v2(
  uuid,
  uuid,
  timestamptz,
  text,
  uuid,
  text,
  text,
  numeric,
  text,
  numeric
) to authenticated;

commit;
