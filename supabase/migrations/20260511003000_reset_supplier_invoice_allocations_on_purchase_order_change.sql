begin;

create or replace function public.reset_supplier_invoice_match_approvals_for_purchase_order_change(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_changed_fields text[] default array[]::text[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  impacted_invoice_ids uuid[] := array[]::uuid[];
  impacted_invoice_id uuid;
  reset_count integer := 0;
begin
  select coalesce(array_agg(distinct m.supplier_invoice_id), array[]::uuid[])
  into impacted_invoice_ids
  from public.supplier_invoice_purchase_order_matches m
  where m.organization_id = p_organization_id
    and m.purchase_order_id = p_purchase_order_id
    and m.match_status in ('accepted', 'adjusted')
    and m.approval_status in ('approved', 'disputed');

  if coalesce(array_length(impacted_invoice_ids, 1), 0) = 0 then
    return;
  end if;

  update public.supplier_invoice_purchase_order_matches m
  set
    approval_status = 'pending',
    approved_by_user_id = null,
    approved_at = null,
    approval_notes = '',
    approval_checks_json = '{}'::jsonb
  where m.organization_id = p_organization_id
    and m.purchase_order_id = p_purchase_order_id
    and m.match_status in ('accepted', 'adjusted')
    and m.approval_status in ('approved', 'disputed');

  get diagnostics reset_count = row_count;

  if reset_count = 0 then
    return;
  end if;

  foreach impacted_invoice_id in array impacted_invoice_ids loop
    perform public.record_supplier_invoice_activity_event(
      p_organization_id,
      impacted_invoice_id,
      'allocation_approval_changed',
      'Allocation approvals reset because the linked purchase order changed.',
      jsonb_build_object(
        'purchase_order_id', p_purchase_order_id,
        'changed_fields', coalesce(to_jsonb(p_changed_fields), '[]'::jsonb),
        'reset_count', reset_count
      ),
      auth.uid()
    );
  end loop;
end;
$$;

create or replace function public.handle_material_purchase_order_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed_fields text[] := array[]::text[];
begin
  if new.supplier_id is distinct from old.supplier_id then
    changed_fields := array_append(changed_fields, 'supplier_id');
  end if;
  if new.issued_to_label is distinct from old.issued_to_label then
    changed_fields := array_append(changed_fields, 'issued_to_label');
  end if;
  if new.supplier_name_snapshot is distinct from old.supplier_name_snapshot then
    changed_fields := array_append(changed_fields, 'supplier_name_snapshot');
  end if;
  if new.supplier_email_snapshot is distinct from old.supplier_email_snapshot then
    changed_fields := array_append(changed_fields, 'supplier_email_snapshot');
  end if;
  if new.supplier_phone_snapshot is distinct from old.supplier_phone_snapshot then
    changed_fields := array_append(changed_fields, 'supplier_phone_snapshot');
  end if;
  if new.status is distinct from old.status then
    changed_fields := array_append(changed_fields, 'status');
  end if;
  if new.subtotal is distinct from old.subtotal then
    changed_fields := array_append(changed_fields, 'subtotal');
  end if;
  if new.margin_percent is distinct from old.margin_percent then
    changed_fields := array_append(changed_fields, 'margin_percent');
  end if;
  if new.discount_amount is distinct from old.discount_amount then
    changed_fields := array_append(changed_fields, 'discount_amount');
  end if;
  if new.contingency_amount is distinct from old.contingency_amount then
    changed_fields := array_append(changed_fields, 'contingency_amount');
  end if;
  if new.gst_percent is distinct from old.gst_percent then
    changed_fields := array_append(changed_fields, 'gst_percent');
  end if;
  if new.gst_total is distinct from old.gst_total then
    changed_fields := array_append(changed_fields, 'gst_total');
  end if;
  if new.total_purchase_order_price is distinct from old.total_purchase_order_price then
    changed_fields := array_append(changed_fields, 'total_purchase_order_price');
  end if;

  if array_length(changed_fields, 1) is not null then
    perform public.reset_supplier_invoice_match_approvals_for_purchase_order_change(
      new.organization_id,
      new.id,
      changed_fields
    );
  end if;

  return new;
end;
$$;

drop trigger if exists handle_material_purchase_order_change
  on public.project_purchase_orders;
create trigger handle_material_purchase_order_change
after update on public.project_purchase_orders
for each row execute function public.handle_material_purchase_order_change();

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
  id uuid,
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
  existing_line_item_signature jsonb := '[]'::jsonb;
  incoming_line_item_signature jsonb := '[]'::jsonb;
  section_labour_total numeric := 0;
  section_materials_total numeric := 0;
  section_subcontractors_total numeric := 0;
  section_plant_total numeric := 0;
  section_margin_total numeric := 0;
  computed_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst_total numeric := 0;
  computed_grand_total numeric := 0;
  invalid_attachment_count integer := 0;
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'purchase_orders.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Purchase order version is required. Please refresh and try again.'
      using errcode = '40001';
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

  if existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This purchase order was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  with normalized_line_items as (
    select
      coalesce(
        existing_synced_line.id,
        parsed.line_id,
        gen_random_uuid()
      ) as resolved_id,
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
          'id', resolved_id,
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
    coalesce(sum(case when section = 'Labour' then round(quantity * rate, 2) else 0 end), 0),
    coalesce(sum(case when section = 'Materials' then round(quantity * rate, 2) else 0 end), 0),
    coalesce(sum(case when section = 'Subcontractors' then round(quantity * rate, 2) else 0 end), 0),
    coalesce(sum(case when section = 'Plant' then round(quantity * rate, 2) else 0 end), 0),
    coalesce(sum(case when section = 'Margin' then round(quantity * rate, 2) else 0 end), 0),
    coalesce(sum(round(quantity * rate, 2)), 0)
  into
    normalized_line_items_json,
    section_labour_total,
    section_materials_total,
    section_subcontractors_total,
    section_plant_total,
    section_margin_total,
    computed_subtotal
  from normalized_line_items;

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst_total := round(pre_gst_total * (coalesce(p_gst_percent, 0) / 100), 2);
  computed_grand_total := round(pre_gst_total + computed_gst_total, 2);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_key', coalesce(li.line_uid::text, li.id::text),
        'section', li.section,
        'quantity', round(li.quantity, 3),
        'unit', li.unit,
        'rate', round(li.rate, 2),
        'total', round(li.total, 2)
      )
      order by coalesce(li.line_uid::text, li.id::text)
    ),
    '[]'::jsonb
  )
  into existing_line_item_signature
  from public.project_purchase_order_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.purchase_order_id = p_purchase_order_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_key', coalesce(line.item->>'line_uid', line.item->>'id'),
        'section', line.item->>'section',
        'quantity', round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0), 3),
        'unit', coalesce(line.item->>'unit', ''),
        'rate', round(coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2),
        'total', round(
          coalesce(nullif(line.item->>'quantity', '')::numeric, 0)
          * coalesce(nullif(line.item->>'rate', '')::numeric, 0),
          2
        )
      )
      order by coalesce(line.item->>'line_uid', line.item->>'id')
    ),
    '[]'::jsonb
  )
  into incoming_line_item_signature
  from jsonb_array_elements(normalized_line_items_json) as line(item);

  select count(*)
  into invalid_attachment_count
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as att(item)
  where nullif(att.item->>'storagePath', '') is null
    and nullif(att.item->>'externalUrl', '') is null;

  if invalid_attachment_count > 0 then
    raise exception 'Each attachment must include storagePath or externalUrl';
  end if;

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
    labour_total = round(section_labour_total, 2),
    materials_total = round(section_materials_total, 2),
    subcontractors_total = round(section_subcontractors_total, 2),
    plant_total = round(section_plant_total, 2),
    margin_total = round(section_margin_total, 2),
    subtotal = round(computed_subtotal, 2),
    margin_percent = round(coalesce(p_margin_percent, 0), 3),
    discount_amount = round(coalesce(p_discount_amount, 0), 2),
    contingency_amount = round(coalesce(p_contingency_amount, 0), 2),
    gst_percent = round(coalesce(p_gst_percent, 0), 3),
    include_margin_in_export = coalesce(p_include_margin_in_export, true),
    include_discount_in_export = coalesce(p_include_discount_in_export, false),
    include_contingency_in_export = coalesce(p_include_contingency_in_export, false),
    gst_total = round(computed_gst_total, 2),
    total_purchase_order_price = computed_grand_total,
    updated_at = statement_timestamp()
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
    storage_path,
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
    nullif(att.item->>'storagePath', ''),
    nullif(att.item->>'externalUrl', ''),
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

  if existing_line_item_signature is distinct from incoming_line_item_signature then
    perform public.reset_supplier_invoice_match_approvals_for_purchase_order_change(
      p_organization_id,
      p_purchase_order_id,
      array['line_items']
    );
  end if;

  cost_item_revision_key := public.begin_cost_item_revision('project_purchase_order', p_purchase_order_id);
  perform public.supersede_previous_cost_items('project_purchase_order', p_purchase_order_id, cost_item_revision_key);
  perform public.upsert_cost_items_for_project_purchase_order(p_purchase_order_id, cost_item_revision_key);

  return query
  select
    updated_row.id,
    updated_row.updated_at,
    updated_row.subtotal,
    updated_row.gst_total,
    updated_row.total_purchase_order_price,
    updated_row.status;
end;
$$;

commit;
