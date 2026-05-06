alter table public.project_purchase_order_line_items
  add column if not exists source_cost_item_id uuid null references public.cost_items (id) on delete set null;

create index if not exists project_purchase_order_line_items_source_cost_item_idx
  on public.project_purchase_order_line_items (source_cost_item_id)
  where source_cost_item_id is not null;

create or replace function public.sync_purchase_order_line_cost_item(
  p_purchase_order_line_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  line_row record;
  resolved_cost_item_id uuid;
  resolved_parent_cost_item_id uuid;
  resolved_fingerprint text;
begin
  select
    po.organization_id,
    po.project_id,
    po.id as purchase_order_id,
    po.purchase_order_number,
    po.purchase_order_title,
    po.supplier_id,
    po.issued_to_label,
    li.id as line_item_id,
    li.line_uid,
    li.cost_item_id,
    li.source_cost_item_id,
    li.section,
    li.description,
    li.quantity,
    li.unit,
    li.rate as unit_rate,
    coalesce(li.total, round(li.quantity * li.rate, 2)) as line_total,
    li.sort_order,
    li.source_time_sheet_entry_id
  into line_row
  from public.project_purchase_order_line_items li
  join public.project_purchase_orders po
    on po.id = li.purchase_order_id
   and po.organization_id = li.organization_id
   and po.project_id = li.project_id
  where li.id = p_purchase_order_line_item_id;

  if not found then
    return null;
  end if;

  resolved_fingerprint := public.compute_cost_item_source_fingerprint(
    'project_purchase_order',
    'project_purchase_order_line_items',
    line_row.section,
    line_row.description,
    line_row.quantity,
    line_row.unit,
    line_row.unit_rate,
    line_row.line_total,
    false,
    line_row.sort_order,
    coalesce(line_row.source_time_sheet_entry_id::text, ''),
    coalesce(line_row.line_uid::text, '')
  );

  resolved_parent_cost_item_id := null;

  if line_row.source_time_sheet_entry_id is not null then
    select ci.id
    into resolved_parent_cost_item_id
    from public.cost_items ci
    where ci.organization_id = line_row.organization_id
      and ci.project_id = line_row.project_id
      and ci.is_current = true
      and ci.source_document_kind <> 'project_purchase_order'
      and ci.source_snapshot ->> 'source_time_sheet_entry_id' = line_row.source_time_sheet_entry_id::text
    order by ci.effective_from desc, ci.created_at desc
    limit 1;
  end if;

  if resolved_parent_cost_item_id is null and line_row.source_cost_item_id is not null then
    select ci.id
    into resolved_parent_cost_item_id
    from public.cost_items ci
    where ci.id = line_row.source_cost_item_id
      and ci.organization_id = line_row.organization_id
      and ci.project_id = line_row.project_id
      and ci.is_current = true
    limit 1;
  end if;

  resolved_cost_item_id := line_row.cost_item_id;

  if resolved_cost_item_id is not null then
    update public.cost_items
    set
      organization_id = line_row.organization_id,
      project_id = line_row.project_id,
      source_document_kind = 'project_purchase_order',
      source_document_id = line_row.purchase_order_id,
      source_line_table = 'project_purchase_order_line_items',
      source_line_id = line_row.line_item_id,
      parent_cost_item_id = resolved_parent_cost_item_id,
      origin_kind = case
        when line_row.source_time_sheet_entry_id is not null then 'time_sheet_sync'
        else 'manual'
      end,
      source_snapshot = jsonb_build_object(
        'document_kind', 'project_purchase_order',
        'document_number', line_row.purchase_order_number,
        'document_title', line_row.purchase_order_title,
        'line_item_id', line_row.line_item_id,
        'line_uid', line_row.line_uid,
        'supplier_id', line_row.supplier_id,
        'issued_to_label', line_row.issued_to_label,
        'source_cost_item_id', line_row.source_cost_item_id,
        'source_time_sheet_entry_id', line_row.source_time_sheet_entry_id
      ),
      supplier_id = line_row.supplier_id,
      supplier_name_snapshot = line_row.issued_to_label,
      title = coalesce(nullif(btrim(line_row.description), ''), 'Untitled line item'),
      description = coalesce(line_row.description, ''),
      quantity = line_row.quantity,
      unit = line_row.unit,
      unit_rate = line_row.unit_rate,
      line_total = line_row.line_total,
      sort_order = line_row.sort_order,
      source_fingerprint = resolved_fingerprint,
      linked_purchase_order_line_item_id = line_row.line_item_id,
      status = 'active',
      effective_to = null,
      is_current = true
    where id = resolved_cost_item_id;

    if found then
      update public.project_purchase_order_line_items
      set cost_item_id = resolved_cost_item_id
      where id = line_row.line_item_id
        and cost_item_id is distinct from resolved_cost_item_id;

      return resolved_cost_item_id;
    end if;
  end if;

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
  values (
    line_row.organization_id,
    line_row.project_id,
    'project_purchase_order',
    line_row.purchase_order_id,
    'project_purchase_order_line_items',
    line_row.line_item_id,
    resolved_parent_cost_item_id,
    case
      when line_row.source_time_sheet_entry_id is not null then 'time_sheet_sync'
      else 'manual'
    end,
    jsonb_build_object(
      'document_kind', 'project_purchase_order',
      'document_number', line_row.purchase_order_number,
      'document_title', line_row.purchase_order_title,
      'line_item_id', line_row.line_item_id,
      'line_uid', line_row.line_uid,
      'supplier_id', line_row.supplier_id,
      'issued_to_label', line_row.issued_to_label,
      'source_cost_item_id', line_row.source_cost_item_id,
      'source_time_sheet_entry_id', line_row.source_time_sheet_entry_id
    ),
    '',
    'line_item',
    line_row.section,
    line_row.section,
    null,
    null,
    '',
    '',
    line_row.supplier_id,
    line_row.issued_to_label,
    coalesce(nullif(btrim(line_row.description), ''), 'Untitled line item'),
    coalesce(line_row.description, ''),
    line_row.quantity,
    line_row.unit,
    line_row.unit_rate,
    line_row.line_total,
    false,
    line_row.sort_order,
    'active',
    clock_timestamp(),
    null,
    true,
    'line-sync',
    resolved_fingerprint,
    null,
    null,
    line_row.line_item_id,
    null,
    auth.uid()
  )
  returning id into resolved_cost_item_id;

  update public.project_purchase_order_line_items
  set cost_item_id = resolved_cost_item_id
  where id = line_row.line_item_id
    and cost_item_id is distinct from resolved_cost_item_id;

  return resolved_cost_item_id;
end;
$$;

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
      li.source_cost_item_id,
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
      coalesce(time_sheet_parent.id, explicit_parent.id),
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
        'source_cost_item_id', cl.source_cost_item_id,
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
      where ci.organization_id = cl.organization_id
        and ci.project_id = cl.project_id
        and ci.is_current = true
        and ci.source_document_kind <> 'project_purchase_order'
        and cl.source_time_sheet_entry_id is not null
        and ci.source_snapshot ->> 'source_time_sheet_entry_id' = cl.source_time_sheet_entry_id::text
      order by ci.effective_from desc, ci.created_at desc
      limit 1
    ) time_sheet_parent on true
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.id = cl.source_cost_item_id
        and ci.organization_id = cl.organization_id
        and ci.project_id = cl.project_id
        and ci.is_current = true
      limit 1
    ) explicit_parent on true
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
  normalized_line_items_json jsonb := '[]'::jsonb;
  computed_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst_total numeric := 0;
  computed_grand_total numeric := 0;
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'purchase_orders.write') then
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

  with normalized_line_items as (
    select
      coalesce(
        existing_synced_line.id,
        parsed.line_id,
        gen_random_uuid()
      ) as id,
      coalesce(
        existing_synced_line.line_uid,
        existing_line_by_id.line_uid,
        parsed.line_uid,
        gen_random_uuid()
      ) as line_uid,
      coalesce(
        existing_synced_line.cost_item_id,
        existing_line_by_id.cost_item_id,
        parsed.cost_item_id
      ) as cost_item_id,
      coalesce(
        existing_synced_line.source_cost_item_id,
        existing_line_by_id.source_cost_item_id,
        parsed.source_cost_item_id
      ) as source_cost_item_id,
      coalesce(
        existing_synced_line.section,
        case
          when line.item->>'section' in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then line.item->>'section'
          else 'Labour'
        end
      ) as section,
      coalesce(existing_synced_line.description, coalesce(line.item->>'description', '')) as description,
      coalesce(existing_synced_line.quantity, coalesce(nullif(line.item->>'quantity', '')::numeric, 0)) as quantity,
      coalesce(existing_synced_line.unit, coalesce(line.item->>'unit', '')) as unit,
      coalesce(nullif(line.item->>'rate', '')::numeric, 0) as rate,
      (line.ordinality - 1)::integer as sort_order,
      parsed.source_time_sheet_entry_id
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality)
    left join lateral (
      select
        case
          when nullif(line.item->>'id', '') is null then null
          else (line.item->>'id')::uuid
        end as line_id,
        case
          when nullif(line.item->>'line_uid', '') is null then null
          else (line.item->>'line_uid')::uuid
        end as line_uid,
        case
          when nullif(line.item->>'cost_item_id', '') is null then null
          else (line.item->>'cost_item_id')::uuid
        end as cost_item_id,
        case
          when nullif(line.item->>'source_cost_item_id', '') is null then null
          else (line.item->>'source_cost_item_id')::uuid
        end as source_cost_item_id,
        case
          when nullif(line.item->>'source_time_sheet_entry_id', '') is null then null
          else (line.item->>'source_time_sheet_entry_id')::uuid
        end as source_time_sheet_entry_id
    ) parsed on true
    left join public.project_purchase_order_line_items existing_synced_line
      on existing_synced_line.organization_id = p_organization_id
      and existing_synced_line.project_id = p_project_id
      and existing_synced_line.purchase_order_id = p_purchase_order_id
      and existing_synced_line.source_time_sheet_entry_id = parsed.source_time_sheet_entry_id
    left join public.project_purchase_order_line_items existing_line_by_id
      on existing_line_by_id.organization_id = p_organization_id
      and existing_line_by_id.project_id = p_project_id
      and existing_line_by_id.purchase_order_id = p_purchase_order_id
      and existing_line_by_id.id = parsed.line_id
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'line_uid', line_uid,
          'cost_item_id', cost_item_id,
          'source_cost_item_id', source_cost_item_id,
          'section', section,
          'description', description,
          'quantity', quantity,
          'unit', unit,
          'rate', rate,
          'sort_order', sort_order,
          'source_time_sheet_entry_id', source_time_sheet_entry_id
        )
        order by sort_order
      ),
      '[]'::jsonb
    ),
    coalesce(sum(round(quantity * rate, 2)), 0)
  into normalized_line_items_json, computed_subtotal
  from normalized_line_items;

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
    line_uid,
    cost_item_id,
    source_cost_item_id,
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
    (item->>'id')::uuid,
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    (item->>'line_uid')::uuid,
    case
      when nullif(item->>'cost_item_id', '') is null then null
      else (item->>'cost_item_id')::uuid
    end,
    case
      when nullif(item->>'source_cost_item_id', '') is null then null
      else (item->>'source_cost_item_id')::uuid
    end,
    item->>'section',
    coalesce(item->>'description', ''),
    coalesce(nullif(item->>'quantity', '')::numeric, 0),
    coalesce(item->>'unit', ''),
    coalesce(nullif(item->>'rate', '')::numeric, 0),
    round(
      coalesce(nullif(item->>'quantity', '')::numeric, 0)
      * coalesce(nullif(item->>'rate', '')::numeric, 0),
      2
    ),
    coalesce(nullif(item->>'sort_order', '')::integer, 0),
    case
      when nullif(item->>'source_time_sheet_entry_id', '') is null then null
      else (item->>'source_time_sheet_entry_id')::uuid
    end
  from jsonb_array_elements(normalized_line_items_json) as line(item);

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

  cost_item_revision_key := public.begin_cost_item_revision('project_purchase_order', p_purchase_order_id);
  perform public.supersede_previous_cost_items('project_purchase_order', p_purchase_order_id, cost_item_revision_key);
  perform public.upsert_cost_items_for_project_purchase_order(p_purchase_order_id, cost_item_revision_key);

  return query
  select updated_row.updated_at, updated_row.subtotal, updated_row.gst_total, updated_row.total_purchase_order_price, updated_row.status;
end;
$$;

create or replace function public.sync_purchase_order_line_from_time_sheet_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_purchase_order_id uuid;
  next_purchase_order_id uuid;
  preserved_rate numeric := 0;
  preserved_sort_order integer;
  preserved_line_uid uuid;
  preserved_cost_item_id uuid;
  preserved_source_cost_item_id uuid;
  deleted_cost_item_id uuid;
  computed_hours numeric := 0;
  line_description text;
  synced_line_id uuid;
begin
  if tg_op = 'DELETE' then
    previous_purchase_order_id := old.purchase_order_id;

    delete from public.project_purchase_order_line_items
    where source_time_sheet_entry_id = old.id
    returning cost_item_id into deleted_cost_item_id;

    perform public.retire_purchase_order_line_cost_item(deleted_cost_item_id);

    if previous_purchase_order_id is not null then
      perform public.recalculate_project_purchase_order_totals(previous_purchase_order_id);
    end if;

    return old;
  end if;

  previous_purchase_order_id := case when tg_op = 'UPDATE' then old.purchase_order_id else null end;
  next_purchase_order_id := new.purchase_order_id;

  select li.rate, li.sort_order, li.line_uid, li.cost_item_id, li.source_cost_item_id
  into preserved_rate, preserved_sort_order, preserved_line_uid, preserved_cost_item_id, preserved_source_cost_item_id
  from public.project_purchase_order_line_items li
  where li.source_time_sheet_entry_id = new.id
  limit 1;

  if previous_purchase_order_id is not null and previous_purchase_order_id is distinct from next_purchase_order_id then
    delete from public.project_purchase_order_line_items
    where source_time_sheet_entry_id = new.id
    returning cost_item_id into deleted_cost_item_id;

    perform public.recalculate_project_purchase_order_totals(previous_purchase_order_id);

    if next_purchase_order_id is null then
      perform public.retire_purchase_order_line_cost_item(deleted_cost_item_id);
    end if;
  end if;

  if next_purchase_order_id is null then
    return new;
  end if;

  computed_hours := greatest(0, coalesce(new.total_hours, 0));
  line_description := coalesce(nullif(btrim(new.worker_name), ''), 'Worker') || ' - ' || to_char(new.clock_in_at, 'DD/MM/YYYY');

  insert into public.project_purchase_order_line_items (
    organization_id,
    project_id,
    purchase_order_id,
    line_uid,
    cost_item_id,
    source_cost_item_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    sort_order,
    source_time_sheet_entry_id
  )
  values (
    new.organization_id,
    new.project_id,
    next_purchase_order_id,
    coalesce(
      preserved_line_uid,
      (
        select li.line_uid
        from public.project_purchase_order_line_items li
        where li.source_time_sheet_entry_id = new.id
        limit 1
      ),
      gen_random_uuid()
    ),
    coalesce(
      preserved_cost_item_id,
      (
        select li.cost_item_id
        from public.project_purchase_order_line_items li
        where li.source_time_sheet_entry_id = new.id
        limit 1
      )
    ),
    coalesce(
      preserved_source_cost_item_id,
      (
        select li.source_cost_item_id
        from public.project_purchase_order_line_items li
        where li.source_time_sheet_entry_id = new.id
        limit 1
      )
    ),
    'Labour',
    line_description,
    computed_hours,
    'hrs',
    coalesce(preserved_rate, 0),
    round(computed_hours * coalesce(preserved_rate, 0), 2),
    coalesce(
      preserved_sort_order,
      (
        select coalesce(max(li.sort_order), -1) + 1
        from public.project_purchase_order_line_items li
        where li.purchase_order_id = next_purchase_order_id
      )
    ),
    new.id
  )
  on conflict (source_time_sheet_entry_id) do update
  set
    organization_id = excluded.organization_id,
    project_id = excluded.project_id,
    purchase_order_id = excluded.purchase_order_id,
    line_uid = coalesce(public.project_purchase_order_line_items.line_uid, excluded.line_uid),
    cost_item_id = coalesce(public.project_purchase_order_line_items.cost_item_id, excluded.cost_item_id),
    source_cost_item_id = coalesce(public.project_purchase_order_line_items.source_cost_item_id, excluded.source_cost_item_id),
    section = 'Labour',
    description = excluded.description,
    quantity = excluded.quantity,
    unit = 'hrs',
    total = round(excluded.quantity * public.project_purchase_order_line_items.rate, 2)
  returning id into synced_line_id;

  perform public.sync_purchase_order_line_cost_item(synced_line_id);
  perform public.recalculate_project_purchase_order_totals(next_purchase_order_id);

  return new;
end;
$$;
