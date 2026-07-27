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
  p_retention_percent_default numeric,
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
  resolved_retention_percent_default numeric := 0;
  saved_status text := 'Draft';
  cost_item_revision_key text;
  resolved_project_source_opportunity_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select p.source_opportunity_id
  into resolved_project_source_opportunity_id
  from public.organization_projects p
  where p.id = p_project_id
    and p.organization_id = p_organization_id;

  if not found then
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
        else round(
          coalesce(nullif(line.item->>'quantity', '')::numeric, 0)
          * coalesce(nullif(line.item->>'rate', '')::numeric, 0),
          2
        )
      end
    ), 0),
    coalesce(sum(
      case
        when coalesce((line.item->>'isOptional')::boolean, false) then round(
          coalesce(nullif(line.item->>'quantity', '')::numeric, 0)
          * coalesce(nullif(line.item->>'rate', '')::numeric, 0),
          2
        )
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
  resolved_retention_percent_default := greatest(0, least(100, coalesce(p_retention_percent_default, 0)));

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

    if p_expected_updated_at is null then
      raise exception 'Quote version is required. Please refresh and try again.'
        using errcode = '40001';
    end if;

    if existing_row.updated_at is distinct from p_expected_updated_at then
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
      retention_percent_default = round(resolved_retention_percent_default, 3),
      lead_time = coalesce(p_lead_time, ''),
      terms_inclusions = coalesce(p_terms_inclusions, ''),
      terms_exclusions = coalesce(p_terms_exclusions, ''),
      clarifications = coalesce(p_clarifications, ''),
      acceptance_notes = coalesce(p_acceptance_notes, ''),
      source_opportunity_id = coalesce(q.source_opportunity_id, resolved_project_source_opportunity_id)
    where q.id = p_quote_id
      and q.organization_id = p_organization_id
      and q.project_id = p_project_id
    returning * into saved_row;
  else
    saved_status := case
      when p_status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then p_status
      else 'Draft'
    end;

    insert into public.project_quotes (
      organization_id, project_id, source_opportunity_id, created_by, quote_title, quote_number, client_name, company_name, contact_person,
      client_email, client_phone, site_address, project_name, quote_date, expiry_date, status, optional_items_notes,
      scope_exclusions, assumptions, scope_notes, subtotal, optional_subtotal, margin_percent, margin_amount,
      discount_amount, contingency_amount, gst_percent, gst_amount, total_quote_price, validity_period,
      payment_terms, retention_percent_default, lead_time, terms_inclusions, terms_exclusions, clarifications, acceptance_notes
    ) values (
      p_organization_id, p_project_id, resolved_project_source_opportunity_id, auth.uid(), btrim(p_quote_title), btrim(p_quote_number), coalesce(p_client_name, ''),
      coalesce(p_company_name, ''), coalesce(p_contact_person, ''), coalesce(p_client_email, ''), coalesce(p_client_phone, ''),
      coalesce(p_site_address, ''), coalesce(p_project_name, ''), p_quote_date, p_expiry_date, saved_status,
      coalesce(p_optional_items_notes, ''), coalesce(p_scope_exclusions, ''), coalesce(p_assumptions, ''),
      coalesce(p_scope_notes, ''), round(computed_subtotal, 2), round(computed_optional_subtotal, 2),
      round(coalesce(p_margin_percent, 0), 3), round(computed_margin, 2), round(coalesce(p_discount_amount, 0), 2),
      round(coalesce(p_contingency_amount, 0), 2), round(coalesce(p_gst_percent, 0), 3), round(computed_gst, 2),
      round(computed_grand_total, 2), coalesce(p_validity_period, ''), coalesce(p_payment_terms, ''),
      round(resolved_retention_percent_default, 3), coalesce(p_lead_time, ''), coalesce(p_terms_inclusions, ''),
      coalesce(p_terms_exclusions, ''), coalesce(p_clarifications, ''), coalesce(p_acceptance_notes, '')
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
    sort_order,
    source_opportunity_quote_id,
    source_opportunity_quote_line_item_id,
    source_opportunity_quote_number
  )
  select
    case
      when nullif(line.item->>'id', '') is not null then (line.item->>'id')::uuid
      else gen_random_uuid()
    end,
    p_organization_id,
    p_project_id,
    saved_row.id,
    case
      when line.item->>'section' in ('Item', 'Materials', 'Labour', 'Plant', 'Subcontractors', 'Preliminaries') then line.item->>'section'
      else 'Labour'
    end,
    coalesce(line.item->>'description', ''),
    coalesce(nullif(line.item->>'quantity', '')::numeric, 0),
    coalesce(line.item->>'unit', ''),
    coalesce(nullif(line.item->>'rate', '')::numeric, 0),
    round(
      coalesce(nullif(line.item->>'quantity', '')::numeric, 0)
      * coalesce(nullif(line.item->>'rate', '')::numeric, 0),
      2
    ),
    coalesce((line.item->>'isOptional')::boolean, false),
    row_number() over (),
    case
      when nullif(line.item->>'sourceOpportunityQuoteId', '') is not null then (line.item->>'sourceOpportunityQuoteId')::uuid
      else null
    end,
    case
      when nullif(line.item->>'sourceOpportunityQuoteLineItemId', '') is not null then (line.item->>'sourceOpportunityQuoteLineItemId')::uuid
      else null
    end,
    nullif(line.item->>'sourceOpportunityQuoteNumber', '')
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  cost_item_revision_key := public.begin_cost_item_revision('project_quote', saved_row.id);
  perform public.supersede_previous_cost_items('project_quote', saved_row.id, cost_item_revision_key);
  perform public.upsert_cost_items_for_document('project_quote', saved_row.id, cost_item_revision_key);

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

grant execute on function public.save_project_quote_draft(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, text,
  date, date, text, text, text, text, text, numeric, numeric, numeric, numeric, text, text,
  numeric, text, text, text, text, text, jsonb
) to authenticated;
