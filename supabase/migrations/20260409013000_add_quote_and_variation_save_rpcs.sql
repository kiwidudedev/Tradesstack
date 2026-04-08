create or replace function public.save_project_quote_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_quote_id uuid,
  p_expected_updated_at timestamptz,
  p_quote_title text,
  p_quote_number text,
  p_client_name text,
  p_company_name text,
  p_contact_person text,
  p_client_email text,
  p_client_phone text,
  p_site_address text,
  p_project_name text,
  p_quote_date date,
  p_expiry_date date,
  p_status text,
  p_optional_items_notes text,
  p_scope_exclusions text,
  p_assumptions text,
  p_scope_notes text,
  p_margin_percent numeric,
  p_discount_amount numeric,
  p_contingency_amount numeric,
  p_gst_percent numeric,
  p_validity_period text,
  p_payment_terms text,
  p_lead_time text,
  p_terms_inclusions text,
  p_terms_exclusions text,
  p_clarifications text,
  p_acceptance_notes text,
  p_line_items jsonb
)
returns table (
  id uuid,
  updated_at timestamptz,
  subtotal numeric,
  optional_subtotal numeric,
  gst_amount numeric,
  total_quote_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_quotes%rowtype;
  saved_row public.project_quotes%rowtype;
  computed_subtotal numeric := 0;
  computed_optional_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst numeric := 0;
  computed_grand_total numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
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

  if coalesce(nullif(btrim(p_quote_title), ''), '') = '' then
    raise exception 'Quote title is required';
  end if;

  if coalesce(nullif(btrim(p_quote_number), ''), '') = '' then
    raise exception 'Quote number is required';
  end if;

  select
    coalesce(sum(
      case
        when coalesce((line.item->>'isOptional')::boolean, false) then 0
        else round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
      end
    ), 0),
    coalesce(sum(
      case
        when coalesce((line.item->>'isOptional')::boolean, false) then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0
      end
    ), 0)
  into computed_subtotal, computed_optional_subtotal
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst;

  if p_quote_id is not null then
    select *
    into existing_row
    from public.project_quotes q
    where q.id = p_quote_id
      and q.organization_id = p_organization_id
      and q.project_id = p_project_id
    for update;

    if not found then
      raise exception 'Quote not found';
    end if;

    if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
      raise exception 'This quote was updated by another user. Refresh and try again.'
        using errcode = '40001';
    end if;

    update public.project_quotes q
    set
      quote_title = btrim(p_quote_title),
      quote_number = btrim(p_quote_number),
      client_name = coalesce(p_client_name, ''),
      company_name = coalesce(p_company_name, ''),
      contact_person = coalesce(p_contact_person, ''),
      client_email = coalesce(p_client_email, ''),
      client_phone = coalesce(p_client_phone, ''),
      site_address = coalesce(p_site_address, ''),
      project_name = coalesce(p_project_name, ''),
      quote_date = p_quote_date,
      expiry_date = p_expiry_date,
      status = case
        when p_status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then p_status
        else q.status
      end,
      optional_items_notes = coalesce(p_optional_items_notes, ''),
      scope_exclusions = coalesce(p_scope_exclusions, ''),
      assumptions = coalesce(p_assumptions, ''),
      scope_notes = coalesce(p_scope_notes, ''),
      subtotal = round(computed_subtotal, 2),
      optional_subtotal = round(computed_optional_subtotal, 2),
      margin_percent = round(coalesce(p_margin_percent, 0), 3),
      margin_amount = round(computed_margin, 2),
      discount_amount = round(coalesce(p_discount_amount, 0), 2),
      contingency_amount = round(coalesce(p_contingency_amount, 0), 2),
      gst_percent = round(coalesce(p_gst_percent, 0), 3),
      gst_amount = round(computed_gst, 2),
      total_quote_price = round(computed_grand_total, 2),
      validity_period = coalesce(p_validity_period, ''),
      payment_terms = coalesce(p_payment_terms, ''),
      lead_time = coalesce(p_lead_time, ''),
      terms_inclusions = coalesce(p_terms_inclusions, ''),
      terms_exclusions = coalesce(p_terms_exclusions, ''),
      clarifications = coalesce(p_clarifications, ''),
      acceptance_notes = coalesce(p_acceptance_notes, '')
    where q.id = p_quote_id
      and q.organization_id = p_organization_id
      and q.project_id = p_project_id
    returning * into saved_row;
  else
    insert into public.project_quotes (
      organization_id,
      project_id,
      created_by,
      quote_title,
      quote_number,
      client_name,
      company_name,
      contact_person,
      client_email,
      client_phone,
      site_address,
      project_name,
      quote_date,
      expiry_date,
      status,
      optional_items_notes,
      scope_exclusions,
      assumptions,
      scope_notes,
      subtotal,
      optional_subtotal,
      margin_percent,
      margin_amount,
      discount_amount,
      contingency_amount,
      gst_percent,
      gst_amount,
      total_quote_price,
      validity_period,
      payment_terms,
      lead_time,
      terms_inclusions,
      terms_exclusions,
      clarifications,
      acceptance_notes
    ) values (
      p_organization_id,
      p_project_id,
      auth.uid(),
      btrim(p_quote_title),
      btrim(p_quote_number),
      coalesce(p_client_name, ''),
      coalesce(p_company_name, ''),
      coalesce(p_contact_person, ''),
      coalesce(p_client_email, ''),
      coalesce(p_client_phone, ''),
      coalesce(p_site_address, ''),
      coalesce(p_project_name, ''),
      p_quote_date,
      p_expiry_date,
      case
        when p_status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then p_status
        else 'Draft'
      end,
      coalesce(p_optional_items_notes, ''),
      coalesce(p_scope_exclusions, ''),
      coalesce(p_assumptions, ''),
      coalesce(p_scope_notes, ''),
      round(computed_subtotal, 2),
      round(computed_optional_subtotal, 2),
      round(coalesce(p_margin_percent, 0), 3),
      round(computed_margin, 2),
      round(coalesce(p_discount_amount, 0), 2),
      round(coalesce(p_contingency_amount, 0), 2),
      round(coalesce(p_gst_percent, 0), 3),
      round(computed_gst, 2),
      round(computed_grand_total, 2),
      coalesce(p_validity_period, ''),
      coalesce(p_payment_terms, ''),
      coalesce(p_lead_time, ''),
      coalesce(p_terms_inclusions, ''),
      coalesce(p_terms_exclusions, ''),
      coalesce(p_clarifications, ''),
      coalesce(p_acceptance_notes, '')
    )
    returning * into saved_row;
  end if;

  delete from public.project_quote_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.quote_id = saved_row.id;

  insert into public.project_quote_line_items (
    id,
    organization_id,
    project_id,
    quote_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    is_optional,
    sort_order
  )
  select
    case
      when nullif(line.item->>'id', '') is null then gen_random_uuid()
      else (line.item->>'id')::uuid
    end,
    p_organization_id,
    p_project_id,
    saved_row.id,
    case
      when line.item->>'section' in ('Preliminaries', 'Labour', 'Materials', 'Plant', 'Subcontractors', 'Item') then line.item->>'section'
      else 'Labour'
    end,
    coalesce(line.item->>'description', ''),
    coalesce(nullif(line.item->>'quantity', '')::numeric, 0),
    coalesce(line.item->>'unit', ''),
    coalesce(nullif(line.item->>'rate', '')::numeric, 0),
    round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2),
    coalesce((line.item->>'isOptional')::boolean, false),
    (line.ordinality - 1)::integer
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality);

  return query
  select
    saved_row.id,
    saved_row.updated_at,
    saved_row.subtotal,
    saved_row.optional_subtotal,
    saved_row.gst_amount,
    saved_row.total_quote_price,
    saved_row.status;
end;
$$;

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
  existing_row public.project_variations%rowtype;
  saved_row public.project_variations%rowtype;
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
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'variations.write') then
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

  select *
  into existing_row
  from public.project_variations v
  where v.id = p_variation_id
    and v.organization_id = p_organization_id
    and v.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Variation not found';
  end if;

  if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This variation was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  select
    coalesce(sum(
      case when line.item->>'section' = 'Labour'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(
      case when line.item->>'section' = 'Materials'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(
      case when line.item->>'section' = 'Subcontractors'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(
      case when line.item->>'section' = 'Plant'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(
      case when line.item->>'section' = 'Margin'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)), 0)
  into
    section_labour_total,
    section_materials_total,
    section_subcontractors_total,
    section_plant_total,
    section_margin_total,
    computed_subtotal
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst_total := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst_total;

  update public.project_variations v
  set
    variation_title = coalesce(nullif(btrim(p_variation_title), ''), v.variation_title),
    variation_number = coalesce(nullif(btrim(p_variation_number), ''), v.variation_number),
    status = case
      when p_status in ('Draft', 'Priced', 'Sent', 'Client Review', 'Approved', 'Rejected', 'Invoiced') then p_status
      else v.status
    end,
    origin = case
      when p_origin in ('Client Request', 'Drawing Revision', 'Site Instruction', 'RFI', 'Unknown') then p_origin
      else v.origin
    end,
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
    validity_period = coalesce(p_validity_period, ''),
    payment_terms = coalesce(p_payment_terms, ''),
    lead_time = coalesce(p_lead_time, ''),
    terms_inclusions = coalesce(p_terms_inclusions, ''),
    terms_exclusions = coalesce(p_terms_exclusions, ''),
    clarifications = coalesce(p_clarifications, ''),
    assumptions = coalesce(p_assumptions, ''),
    gst_total = round(computed_gst_total, 2),
    total_variation_price = round(computed_grand_total, 2)
  where v.id = p_variation_id
    and v.organization_id = p_organization_id
    and v.project_id = p_project_id
  returning * into saved_row;

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
    source_purchase_order_id,
    source_purchase_order_line_item_id,
    source_purchase_order_number
  )
  select
    case
      when nullif(line.item->>'id', '') is null then gen_random_uuid()
      else (line.item->>'id')::uuid
    end,
    p_organization_id,
    p_project_id,
    p_variation_id,
    case
      when line.item->>'section' in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then line.item->>'section'
      else 'Labour'
    end,
    coalesce(line.item->>'description', ''),
    coalesce(nullif(line.item->>'quantity', '')::numeric, 0),
    coalesce(line.item->>'unit', ''),
    coalesce(nullif(line.item->>'rate', '')::numeric, 0),
    round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2),
    (line.ordinality - 1)::integer,
    case
      when nullif(line.item->>'sourcePurchaseOrderId', '') is null then null
      else (line.item->>'sourcePurchaseOrderId')::uuid
    end,
    case
      when nullif(line.item->>'sourcePurchaseOrderLineItemId', '') is null then null
      else (line.item->>'sourcePurchaseOrderLineItemId')::uuid
    end,
    coalesce(line.item->>'sourcePurchaseOrderNumber', '')
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality);

  delete from public.project_variation_attachments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.variation_id = p_variation_id;

  insert into public.project_variation_attachments (
    id,
    organization_id,
    project_id,
    variation_id,
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
    p_variation_id,
    case
      when att.item->>'type' in ('Drawing', 'Email', 'Site Instruction', 'Other') then att.item->>'type'
      else 'Other'
    end,
    coalesce(nullif(att.item->>'name', ''), 'Attachment'),
    nullif(att.item->>'storagePath', ''),
    nullif(att.item->>'externalUrl', ''),
    auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as att(item);

  if existing_row.status is distinct from saved_row.status then
    insert into public.project_variation_status_events (
      organization_id,
      project_id,
      variation_id,
      from_status,
      to_status,
      changed_by
    ) values (
      p_organization_id,
      p_project_id,
      p_variation_id,
      existing_row.status,
      saved_row.status,
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

  return query
  select
    saved_row.updated_at,
    saved_row.subtotal,
    saved_row.gst_total,
    saved_row.total_variation_price,
    saved_row.status;
end;
$$;

grant execute on function public.save_project_quote_draft(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;

grant execute on function public.save_project_variation_draft(
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
) to authenticated;
