drop function if exists public.save_project_variation_draft(
  uuid,
  uuid,
  uuid,
  timestamptz,
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
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
);

create or replace function public.save_project_variation_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_variation_id uuid,
  p_expected_updated_at timestamptz,
  p_variation_title text,
  p_variation_number text,
  p_status text,
  p_origin text,
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
  p_validity_period text,
  p_payment_terms text,
  p_lead_time text,
  p_terms_inclusions text,
  p_terms_exclusions text,
  p_clarifications text,
  p_assumptions text,
  p_line_items jsonb,
  p_attachments jsonb
)
returns table (
  id uuid,
  updated_at timestamptz,
  subtotal numeric,
  gst_total numeric,
  total_variation_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_row public.project_variations%rowtype;
  computed_subtotal numeric := 0;
  computed_margin_total numeric := 0;
  computed_gst_total numeric := 0;
  computed_grand_total numeric := 0;
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'variations.write') then
    raise exception 'You do not have permission to save variations for this organization';
  end if;

  if coalesce(btrim(p_variation_title), '') = '' then
    raise exception 'Variation title is required';
  end if;

  if coalesce(btrim(p_variation_number), '') = '' then
    raise exception 'Variation number is required';
  end if;

  if p_status not in ('Draft', 'Sent', 'Approved', 'Invoiced') then
    raise exception 'Variation status must be Draft, Sent, Approved, or Invoiced';
  end if;

  if p_origin not in ('Internal', 'Client') then
    raise exception 'Variation origin must be Internal or Client';
  end if;

  select *
  into saved_row
  from public.project_variations v
  where v.organization_id = p_organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id
  for update;

  if not found then
    raise exception 'Variation not found';
  end if;

  if saved_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This variation was updated by someone else. Please reload and try again.';
  end if;

  computed_subtotal := coalesce((
    select sum(round(coalesce((line_item->>'quantity')::numeric, 0) * coalesce((line_item->>'rate')::numeric, 0), 2))
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line_item
  ), 0);

  computed_margin_total := round(computed_subtotal * (coalesce(p_margin_percent, 0) / 100), 2);
  computed_grand_total := computed_subtotal + computed_margin_total - coalesce(p_discount_amount, 0) + coalesce(p_contingency_amount, 0);
  computed_gst_total := round(computed_grand_total * (coalesce(p_gst_percent, 0) / 100), 2);

  update public.project_variations
  set
    variation_title = btrim(p_variation_title),
    variation_number = btrim(p_variation_number),
    status = p_status,
    origin = p_origin,
    requested_by = nullif(btrim(coalesce(p_requested_by, '')), ''),
    requested_date = p_requested_date,
    due_date = p_due_date,
    sent_to_client_at = case when p_status in ('Sent', 'Approved', 'Invoiced') then p_sent_to_client_at else null end,
    approved_at = case when p_status in ('Approved', 'Invoiced') then p_approved_at else null end,
    invoice_ready = coalesce(p_invoice_ready, false),
    notes = coalesce(p_notes, ''),
    margin_percent = coalesce(p_margin_percent, 0),
    discount_amount = coalesce(p_discount_amount, 0),
    contingency_amount = coalesce(p_contingency_amount, 0),
    gst_percent = coalesce(p_gst_percent, 0),
    include_margin_in_export = coalesce(p_include_margin_in_export, true),
    include_discount_in_export = coalesce(p_include_discount_in_export, true),
    include_contingency_in_export = coalesce(p_include_contingency_in_export, true),
    validity_period = coalesce(p_validity_period, ''),
    payment_terms = coalesce(p_payment_terms, ''),
    lead_time = coalesce(p_lead_time, ''),
    terms_inclusions = coalesce(p_terms_inclusions, ''),
    terms_exclusions = coalesce(p_terms_exclusions, ''),
    clarifications = coalesce(p_clarifications, ''),
    assumptions = coalesce(p_assumptions, ''),
    subtotal = round(computed_subtotal, 2),
    margin_total = round(computed_margin_total, 2),
    gst_total = round(computed_gst_total, 2),
    total_variation_price = round(computed_grand_total + computed_gst_total, 2),
    updated_at = statement_timestamp()
  where public.project_variations.id = saved_row.id
  returning *
  into saved_row;

  delete from public.project_variation_attachments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.variation_id = p_variation_id;

  insert into public.project_variation_attachments (
    organization_id,
    project_id,
    variation_id,
    storage_object_path,
    original_filename,
    mime_type,
    size_bytes,
    created_by
  )
  select
    p_organization_id,
    p_project_id,
    p_variation_id,
    nullif(btrim(coalesce(attachment->>'storage_object_path', '')), ''),
    nullif(btrim(coalesce(attachment->>'original_filename', '')), ''),
    nullif(btrim(coalesce(attachment->>'mime_type', '')), ''),
    coalesce((attachment->>'size_bytes')::bigint, 0),
    auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as attachment
  where nullif(btrim(coalesce(attachment->>'storage_object_path', '')), '') is not null;

  delete from public.project_variation_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.variation_id = p_variation_id;

  insert into public.project_variation_line_items (
    id,
    organization_id,
    project_id,
    variation_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    sort_order,
    source_project_quote_id,
    source_project_quote_line_item_id,
    source_project_quote_number,
    source_purchase_order_id,
    source_purchase_order_line_item_id,
    source_purchase_order_number,
    created_by
  )
  select
    coalesce(
      nullif((line_item->>'id')::uuid, null),
      gen_random_uuid()
    ),
    p_organization_id,
    p_project_id,
    p_variation_id,
    coalesce(line_item->>'section', 'General'),
    coalesce(line_item->>'description', ''),
    coalesce((line_item->>'quantity')::numeric, 0),
    nullif(btrim(coalesce(line_item->>'unit', '')), ''),
    coalesce((line_item->>'rate')::numeric, 0),
    round(coalesce((line_item->>'quantity')::numeric, 0) * coalesce((line_item->>'rate')::numeric, 0), 2),
    coalesce((line_item->>'sort_order')::integer, row_number() over ()),
    nullif(line_item->>'source_project_quote_id', '')::uuid,
    nullif(line_item->>'source_project_quote_line_item_id', '')::uuid,
    nullif(btrim(coalesce(line_item->>'source_project_quote_number', '')), ''),
    nullif(line_item->>'source_purchase_order_id', '')::uuid,
    nullif(line_item->>'source_purchase_order_line_item_id', '')::uuid,
    nullif(btrim(coalesce(line_item->>'source_purchase_order_number', '')), ''),
    auth.uid()
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line_item(line_item, ordinality);

  if saved_row.status = 'Approved' then
    insert into public.project_variation_status_events (
      organization_id,
      project_id,
      variation_id,
      event_type,
      occurred_at,
      metadata,
      created_by
    )
    values (
      p_organization_id,
      p_project_id,
      saved_row.id,
      'approved',
      coalesce(saved_row.approved_at, now()),
      jsonb_build_object('source', 'save_project_variation_draft'),
      auth.uid()
    );
  end if;

  if saved_row.invoice_ready then
    insert into public.project_variation_invoice_items (
      organization_id,
      project_id,
      variation_id,
      amount,
      status
    ) values (
      p_organization_id,
      p_project_id,
      p_variation_id,
      round(saved_row.total_variation_price, 2),
      'Ready'
    )
    on conflict (variation_id) do update
    set
      amount = excluded.amount,
      status = excluded.status;
  else
    delete from public.project_variation_invoice_items ii
    where ii.organization_id = p_organization_id
      and ii.project_id = p_project_id
      and ii.variation_id = p_variation_id;
  end if;

  cost_item_revision_key := public.begin_cost_item_revision('project_variation', saved_row.id);
  perform public.supersede_previous_cost_items('project_variation', saved_row.id, cost_item_revision_key);
  perform public.upsert_cost_items_for_project_variation(saved_row.id, cost_item_revision_key);

  return query
  select
    saved_row.id,
    saved_row.updated_at,
    saved_row.subtotal,
    saved_row.gst_total,
    saved_row.total_variation_price,
    saved_row.status;
end;
$$;

grant execute on function public.save_project_variation_draft(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date, date, timestamptz, timestamptz,
  boolean, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean, text, text, text,
  text, text, text, text, jsonb, jsonb
) to authenticated;

drop function if exists public.save_project_purchase_order_draft(
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
);

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
  select
    updated_row.id,
    updated_row.updated_at,
    updated_row.subtotal,
    updated_row.gst_total,
    updated_row.total_purchase_order_price,
    updated_row.status;
end;
$$;

grant execute on function public.save_project_purchase_order_draft(
  uuid, uuid, uuid, timestamptz, text, text, text, text, uuid, text, text, text, text, text, text,
  date, date, timestamptz, timestamptz, boolean, text, numeric, numeric, numeric, numeric, boolean,
  boolean, boolean, jsonb, jsonb
) to authenticated;
