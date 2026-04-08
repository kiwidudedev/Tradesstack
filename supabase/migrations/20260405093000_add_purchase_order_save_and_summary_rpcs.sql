create or replace function public.get_project_purchase_order_summary(
  p_organization_id uuid,
  p_project_id uuid
)
returns table (
  total_value numeric,
  draft_count integer,
  awaiting_client_count integer,
  approved_count integer,
  invoice_ready_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  return query
  select
    coalesce(sum(po.total_purchase_order_price), 0)::numeric as total_value,
    count(*) filter (where po.status = 'Draft')::integer as draft_count,
    count(*) filter (where po.status = 'Issued')::integer as awaiting_client_count,
    count(*) filter (where po.status = 'Approved')::integer as approved_count,
    count(*) filter (where po.invoice_ready is true)::integer as invoice_ready_count
  from public.project_purchase_orders po
  where po.organization_id = p_organization_id
    and po.project_id = p_project_id;
end;
$$;

create or replace function public.save_project_purchase_order_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_expected_updated_at timestamptz,
  p_purchase_order_title text,
  p_purchase_order_number text,
  p_status text,
  p_origin text,
  p_supplier_id uuid,
  p_issued_to_label text,
  p_supplier_contact text,
  p_supplier_name_snapshot text,
  p_supplier_email_snapshot text,
  p_supplier_phone_snapshot text,
  p_requested_by text,
  p_requested_date date,
  p_due_date date,
  p_sent_to_client_at timestamptz,
  p_approved_at timestamptz,
  p_invoice_ready boolean,
  p_notes text,
  p_margin_percent numeric,
  p_discount_amount numeric,
  p_contingency_amount numeric,
  p_gst_percent numeric,
  p_include_margin_in_export boolean,
  p_include_discount_in_export boolean,
  p_include_contingency_in_export boolean,
  p_line_items jsonb,
  p_attachments jsonb
)
returns table (
  updated_at timestamptz,
  subtotal numeric,
  gst_total numeric,
  total_purchase_order_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_purchase_orders%rowtype;
  updated_row public.project_purchase_orders%rowtype;
  computed_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst_total numeric := 0;
  computed_grand_total numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from public.organization_suppliers s
    where s.id = p_supplier_id
      and s.organization_id = p_organization_id
  ) then
    raise exception 'Supplier does not belong to this organization';
  end if;

  select *
  into existing_row
  from public.project_purchase_orders po
  where po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Purchase order not found';
  end if;

  if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This purchase order was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  select coalesce(sum(round(coalesce((line.item->>'quantity')::numeric, 0) * coalesce((line.item->>'rate')::numeric, 0), 2)), 0)
  into computed_subtotal
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst_total := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst_total;

  update public.project_purchase_orders po
  set
    purchase_order_title = coalesce(nullif(btrim(p_purchase_order_title), ''), po.purchase_order_number),
    purchase_order_number = coalesce(nullif(btrim(p_purchase_order_number), ''), po.purchase_order_number),
    status = p_status,
    origin = p_origin,
    supplier_id = p_supplier_id,
    issued_to_label = coalesce(p_issued_to_label, ''),
    supplier_contact = coalesce(p_supplier_contact, ''),
    supplier_name_snapshot = coalesce(p_supplier_name_snapshot, ''),
    supplier_email_snapshot = coalesce(p_supplier_email_snapshot, ''),
    supplier_phone_snapshot = coalesce(p_supplier_phone_snapshot, ''),
    requested_by = coalesce(p_requested_by, ''),
    requested_date = p_requested_date,
    due_date = p_due_date,
    sent_to_client_at = p_sent_to_client_at,
    approved_at = p_approved_at,
    invoice_ready = coalesce(p_invoice_ready, false),
    notes = coalesce(p_notes, ''),
    subtotal = round(computed_subtotal, 2),
    margin_percent = round(coalesce(p_margin_percent, 0), 3),
    discount_amount = round(coalesce(p_discount_amount, 0), 2),
    contingency_amount = round(coalesce(p_contingency_amount, 0), 2),
    gst_percent = round(coalesce(p_gst_percent, 0), 3),
    include_margin_in_export = coalesce(p_include_margin_in_export, true),
    include_discount_in_export = coalesce(p_include_discount_in_export, false),
    include_contingency_in_export = coalesce(p_include_contingency_in_export, false),
    gst_total = round(computed_gst_total, 2),
    total_purchase_order_price = round(computed_grand_total, 2)
  where po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  returning * into updated_row;

  delete from public.project_purchase_order_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.purchase_order_id = p_purchase_order_id;

  insert into public.project_purchase_order_line_items (
    id,
    organization_id,
    project_id,
    purchase_order_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    sort_order,
    source_time_sheet_entry_id
  )
  select
    case
      when nullif(line.item->>'id', '') is null then gen_random_uuid()
      else (line.item->>'id')::uuid
    end,
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    case
      when line.item->>'section' in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then line.item->>'section'
      else 'Labour'
    end,
    coalesce(line.item->>'description', ''),
    coalesce((line.item->>'quantity')::numeric, 0),
    coalesce(line.item->>'unit', ''),
    coalesce((line.item->>'rate')::numeric, 0),
    round(coalesce((line.item->>'quantity')::numeric, 0) * coalesce((line.item->>'rate')::numeric, 0), 2),
    (line.ordinality - 1)::integer,
    case
      when nullif(line.item->>'source_time_sheet_entry_id', '') is null then null
      else (line.item->>'source_time_sheet_entry_id')::uuid
    end
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality);

  delete from public.project_purchase_order_attachments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.purchase_order_id = p_purchase_order_id;

  insert into public.project_purchase_order_attachments (
    id,
    organization_id,
    project_id,
    purchase_order_id,
    file_kind,
    file_name,
    external_url,
    uploaded_by
  )
  select
    case
      when nullif(att.item->>'id', '') is null then gen_random_uuid()
      else (att.item->>'id')::uuid
    end,
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    case
      when att.item->>'type' in ('Drawing', 'Email', 'Site Instruction', 'Other') then att.item->>'type'
      else 'Other'
    end,
    coalesce(nullif(att.item->>'name', ''), 'Attachment'),
    coalesce(nullif(att.item->>'external_url', ''), 'manual://' || coalesce(nullif(att.item->>'name', ''), 'attachment')),
    auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as att(item);

  if existing_row.status is distinct from updated_row.status then
    insert into public.project_purchase_order_status_events (
      organization_id,
      project_id,
      purchase_order_id,
      from_status,
      to_status,
      changed_by
    ) values (
      p_organization_id,
      p_project_id,
      p_purchase_order_id,
      existing_row.status,
      updated_row.status,
      auth.uid()
    );
  end if;

  if updated_row.invoice_ready then
    insert into public.project_purchase_order_invoice_items (
      organization_id,
      project_id,
      purchase_order_id,
      amount,
      status
    ) values (
      p_organization_id,
      p_project_id,
      p_purchase_order_id,
      round(computed_grand_total, 2),
      'Ready'
    )
    on conflict (purchase_order_id)
    do update set
      amount = excluded.amount,
      status = excluded.status,
      updated_at = now();
  else
    delete from public.project_purchase_order_invoice_items ii
    where ii.organization_id = p_organization_id
      and ii.project_id = p_project_id
      and ii.purchase_order_id = p_purchase_order_id;
  end if;

  return query
  select updated_row.updated_at, updated_row.subtotal, updated_row.gst_total, updated_row.total_purchase_order_price, updated_row.status;
end;
$$;

grant execute on function public.get_project_purchase_order_summary(uuid, uuid) to authenticated;
grant execute on function public.save_project_purchase_order_draft(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  date,
  timestamptz,
  timestamptz,
  boolean,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  boolean,
  boolean,
  boolean,
  jsonb,
  jsonb
) to authenticated;
