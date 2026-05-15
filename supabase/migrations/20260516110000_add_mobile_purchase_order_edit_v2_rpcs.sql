begin;

drop function if exists public.update_mobile_project_purchase_order_header_v2(
  uuid,
  uuid,
  timestamptz,
  text,
  date,
  date,
  text
);

create or replace function public.update_mobile_project_purchase_order_header_v2(
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_expected_updated_at timestamptz,
  p_notes text,
  p_due_date date,
  p_requested_date date,
  p_requested_by text
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
  existing_row public.project_purchase_orders%rowtype;
  updated_row public.project_purchase_orders%rowtype;
  normalized_notes text := coalesce(p_notes, '');
  normalized_requested_by text := coalesce(nullif(btrim(coalesce(p_requested_by, '')), ''), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Purchase order version is required. Please refresh and try again.'
      using errcode = '40001';
  end if;

  select *
  into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  if not public.has_org_permission(current_context.organization_id, 'purchase_orders.write') then
    raise exception 'Not authorized to edit purchase orders for this organization';
  end if;

  select *
  into existing_row
  from public.project_purchase_orders po
  where po.organization_id = current_context.organization_id
    and po.project_id = p_project_id
    and po.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'Purchase order not found for this project';
  end if;

  if existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This purchase order was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  if existing_row.notes is not distinct from normalized_notes
    and existing_row.due_date is not distinct from p_due_date
    and existing_row.requested_date is not distinct from p_requested_date
    and existing_row.requested_by is not distinct from normalized_requested_by then
    return query
    select *
    from public.get_mobile_project_purchase_order_detail_v2(p_project_id, p_purchase_order_id);
    return;
  end if;

  update public.project_purchase_orders po
  set
    notes = normalized_notes,
    due_date = p_due_date,
    requested_date = p_requested_date,
    requested_by = normalized_requested_by,
    updated_at = statement_timestamp()
  where po.organization_id = current_context.organization_id
    and po.project_id = p_project_id
    and po.id = p_purchase_order_id
  returning * into updated_row;

  if existing_row.notes is distinct from updated_row.notes then
    perform public._write_purchase_order_activity(
      current_context.organization_id,
      p_project_id,
      p_purchase_order_id,
      auth.uid(),
      'header_field_changed',
      'notes',
      to_jsonb(existing_row.notes),
      to_jsonb(updated_row.notes),
      'Purchase order notes updated from mobile',
      jsonb_build_object('source', 'update_mobile_project_purchase_order_header_v2')
    );
  end if;

  if existing_row.due_date is distinct from updated_row.due_date then
    perform public._write_purchase_order_activity(
      current_context.organization_id,
      p_project_id,
      p_purchase_order_id,
      auth.uid(),
      'header_field_changed',
      'due_date',
      to_jsonb(existing_row.due_date),
      to_jsonb(updated_row.due_date),
      'Purchase order due date updated from mobile',
      jsonb_build_object('source', 'update_mobile_project_purchase_order_header_v2')
    );
  end if;

  if existing_row.requested_date is distinct from updated_row.requested_date then
    perform public._write_purchase_order_activity(
      current_context.organization_id,
      p_project_id,
      p_purchase_order_id,
      auth.uid(),
      'header_field_changed',
      'requested_date',
      to_jsonb(existing_row.requested_date),
      to_jsonb(updated_row.requested_date),
      'Purchase order requested date updated from mobile',
      jsonb_build_object('source', 'update_mobile_project_purchase_order_header_v2')
    );
  end if;

  if existing_row.requested_by is distinct from updated_row.requested_by then
    perform public._write_purchase_order_activity(
      current_context.organization_id,
      p_project_id,
      p_purchase_order_id,
      auth.uid(),
      'header_field_changed',
      'requested_by',
      to_jsonb(existing_row.requested_by),
      to_jsonb(updated_row.requested_by),
      'Purchase order requested by updated from mobile',
      jsonb_build_object('source', 'update_mobile_project_purchase_order_header_v2')
    );
  end if;

  return query
  select *
  from public.get_mobile_project_purchase_order_detail_v2(p_project_id, p_purchase_order_id);
end;
$$;

drop function if exists public.update_mobile_project_purchase_order_status_v2(
  uuid,
  uuid,
  timestamptz,
  text
);

create or replace function public.update_mobile_project_purchase_order_status_v2(
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_expected_updated_at timestamptz,
  p_status text
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
  existing_row public.project_purchase_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Purchase order version is required. Please refresh and try again.'
      using errcode = '40001';
  end if;

  select *
  into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  select *
  into existing_row
  from public.project_purchase_orders po
  where po.organization_id = current_context.organization_id
    and po.project_id = p_project_id
    and po.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'Purchase order not found for this project';
  end if;

  if existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This purchase order was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  perform 1
  from public.update_purchase_order_status(
    current_context.organization_id,
    p_project_id,
    p_purchase_order_id,
    p_status
  );

  return query
  select *
  from public.get_mobile_project_purchase_order_detail_v2(p_project_id, p_purchase_order_id);
end;
$$;

grant execute on function public.update_mobile_project_purchase_order_header_v2(
  uuid,
  uuid,
  timestamptz,
  text,
  date,
  date,
  text
) to authenticated;

grant execute on function public.update_mobile_project_purchase_order_status_v2(
  uuid,
  uuid,
  timestamptz,
  text
) to authenticated;

commit;
