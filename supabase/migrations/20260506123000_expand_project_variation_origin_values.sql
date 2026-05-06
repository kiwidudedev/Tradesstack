alter table public.project_variations
  drop constraint if exists project_variations_origin_check;

alter table public.project_variations
  add constraint project_variations_origin_check
  check (origin in ('Client Request', 'Drawing Revision', 'Site Instruction', 'RFI', 'Unknown'));

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

  if p_origin not in ('Client Request', 'Drawing Revision', 'Site Instruction', 'RFI', 'Unknown') then
    raise exception 'Variation origin must be one of: Client Request, Drawing Revision, Site Instruction, RFI, Unknown';
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
