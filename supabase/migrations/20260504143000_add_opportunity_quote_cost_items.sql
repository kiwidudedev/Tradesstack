alter table public.cost_items
  add column if not exists linked_opportunity_quote_line_item_id uuid null references public.opportunity_quote_line_items (id) on delete set null;

alter table public.cost_items
  drop constraint if exists cost_items_source_document_kind_check,
  drop constraint if exists cost_items_source_line_table_check,
  drop constraint if exists cost_items_single_live_link_check;

alter table public.cost_items
  add constraint cost_items_source_document_kind_check check (
    source_document_kind in ('opportunity_quote', 'project_quote', 'project_variation', 'project_purchase_order', 'project_claim')
  ),
  add constraint cost_items_source_line_table_check check (
    source_line_table is null
    or source_line_table in (
      'opportunity_quote_line_items',
      'project_quote_line_items',
      'project_variation_line_items',
      'project_purchase_order_line_items',
      'project_claim_line_items'
    )
  ),
  add constraint cost_items_single_live_link_check check (
    num_nonnulls(
      linked_opportunity_quote_line_item_id,
      linked_quote_line_item_id,
      linked_variation_line_item_id,
      linked_purchase_order_line_item_id,
      linked_claim_line_item_id
    ) <= 1
  );

create index if not exists cost_items_opportunity_quote_link_idx
  on public.cost_items (linked_opportunity_quote_line_item_id)
  where linked_opportunity_quote_line_item_id is not null;

create or replace function public.resolve_cost_item_document_context(
  p_document_kind text,
  p_document_id uuid
)
returns table (
  organization_id uuid,
  project_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_document_kind = 'opportunity_quote' then
    return query
    select o.organization_id, o.workspace_project_id
    from public.opportunity_quotes q
    join public.organization_opportunities o
      on o.id = q.opportunity_id
     and o.organization_id = q.organization_id
    where q.id = p_document_id
      and o.workspace_project_id is not null
      and public.has_org_permission(o.organization_id, 'leads.opportunities.write');
    return;
  end if;

  if p_document_kind = 'project_quote' then
    return query
    select q.organization_id, q.project_id
    from public.project_quotes q
    where q.id = p_document_id
      and public.has_org_permission(q.organization_id, 'quotes.write');
    return;
  end if;

  if p_document_kind = 'project_variation' then
    return query
    select v.organization_id, v.project_id
    from public.project_variations v
    where v.id = p_document_id
      and public.has_org_permission(v.organization_id, 'variations.write');
    return;
  end if;

  if p_document_kind = 'project_purchase_order' then
    return query
    select po.organization_id, po.project_id
    from public.project_purchase_orders po
    where po.id = p_document_id
      and public.has_org_permission(po.organization_id, 'purchase_orders.write');
    return;
  end if;

  if p_document_kind = 'project_claim' then
    return query
    select c.organization_id, c.project_id
    from public.project_claims c
    where c.id = p_document_id
      and public.is_member_of_organization(c.organization_id);
    return;
  end if;

  raise exception 'Unsupported CostItem document kind: %', p_document_kind;
end;
$$;

create or replace function public.upsert_opportunity_quote_cost_items(
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
  select *
  into resolved_context
  from public.resolve_cost_item_document_context('opportunity_quote', p_document_id)
  limit 1;

  if resolved_context.organization_id is null or resolved_context.project_id is null then
    raise exception 'Opportunity quote not found, not authorized, or missing workspace project for CostItem mirror write';
  end if;

  delete from public.cost_items ci
  where ci.source_document_kind = 'opportunity_quote'
    and ci.source_document_id = p_document_id
    and ci.source_revision_key = p_source_revision_key;

  with current_lines as (
    select
      q.organization_id,
      o.workspace_project_id as project_id,
      q.id as document_id,
      q.quote_number as document_number,
      q.quote_title as document_title,
      q.opportunity_id,
      o.opportunity_code,
      o.name as opportunity_name,
      li.id as line_item_id,
      li.section,
      li.description,
      li.quantity,
      li.unit,
      li.rate as unit_rate,
      coalesce(li.total, round(li.quantity * li.rate, 2)) as line_total,
      coalesce(li.is_optional, false) as is_optional,
      li.sort_order,
      public.compute_cost_item_source_fingerprint(
        'opportunity_quote',
        'opportunity_quote_line_items',
        li.section,
        li.description,
        li.quantity,
        li.unit,
        li.rate,
        coalesce(li.total, round(li.quantity * li.rate, 2)),
        coalesce(li.is_optional, false),
        li.sort_order,
        '',
        ''
      ) as source_fingerprint
    from public.opportunity_quotes q
    join public.organization_opportunities o
      on o.id = q.opportunity_id
     and o.organization_id = q.organization_id
    join public.opportunity_quote_line_items li
      on li.organization_id = q.organization_id
     and li.quote_id = q.id
    where q.id = p_document_id
      and q.organization_id = resolved_context.organization_id
      and o.workspace_project_id = resolved_context.project_id
  )
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
    linked_opportunity_quote_line_item_id,
    created_by
  )
  select
    cl.organization_id,
    cl.project_id,
    'opportunity_quote',
    cl.document_id,
    'opportunity_quote_line_items',
    cl.line_item_id,
    prev.id,
    'manual',
    jsonb_build_object(
      'document_kind', 'opportunity_quote',
      'document_number', cl.document_number,
      'document_title', cl.document_title,
      'opportunity_id', cl.opportunity_id,
      'opportunity_code', cl.opportunity_code,
      'opportunity_name', cl.opportunity_name,
      'line_item_id', cl.line_item_id,
      'section', cl.section,
      'is_optional', cl.is_optional
    ),
    '',
    'line_item',
    cl.section,
    cl.section,
    null,
    null,
    '',
    '',
    coalesce(nullif(btrim(cl.description), ''), 'Untitled line item'),
    coalesce(cl.description, ''),
    cl.quantity,
    cl.unit,
    cl.unit_rate,
    cl.line_total,
    cl.is_optional,
    cl.sort_order,
    'active',
    clock_timestamp(),
    null,
    true,
    p_source_revision_key,
    cl.source_fingerprint,
    cl.line_item_id,
    auth.uid()
  from current_lines cl
  left join lateral (
    select ci.id
    from public.cost_items ci
    where ci.source_document_kind = 'opportunity_quote'
      and ci.source_document_id = cl.document_id
      and ci.source_revision_key <> p_source_revision_key
      and ci.source_fingerprint = cl.source_fingerprint
    order by ci.effective_from desc, ci.created_at desc
    limit 1
  ) prev on true;

  get diagnostics rows_written = row_count;
  return rows_written;
end;
$$;

grant execute on function public.upsert_opportunity_quote_cost_items(uuid, text) to authenticated;

create or replace function public.save_opportunity_quote_draft(
  p_organization_id uuid,
  p_opportunity_id uuid,
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
  existing_row public.opportunity_quotes%rowtype;
  saved_row public.opportunity_quotes%rowtype;
  workspace_project_id uuid;
  computed_subtotal numeric := 0;
  computed_optional_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst numeric := 0;
  computed_grand_total numeric := 0;
  saved_status text := 'Draft';
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'leads.opportunities.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select o.workspace_project_id
  into workspace_project_id
  from public.organization_opportunities o
  where o.id = p_opportunity_id
    and o.organization_id = p_organization_id;

  if workspace_project_id is null then
    raise exception 'Opportunity not found for organization or missing workspace project';
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
  pre_gst_total := greatest(
    0,
    computed_subtotal + computed_margin + computed_contingency - computed_discount
  );
  computed_gst := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst;

  if p_quote_id is not null then
    select *
    into existing_row
    from public.opportunity_quotes q
    where q.id = p_quote_id
      and q.organization_id = p_organization_id
      and q.opportunity_id = p_opportunity_id
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

    update public.opportunity_quotes q
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
      and q.opportunity_id = p_opportunity_id
    returning * into saved_row;
  else
    saved_status := case
      when p_status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then p_status
      else 'Draft'
    end;

    insert into public.opportunity_quotes (
      organization_id,
      opportunity_id,
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
      p_opportunity_id,
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
      saved_status,
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

  delete from public.opportunity_quote_line_items li
  where li.organization_id = p_organization_id
    and li.quote_id = saved_row.id;

  insert into public.opportunity_quote_line_items (
    id,
    organization_id,
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
      when nullif(line.item->>'id', '') is not null then (line.item->>'id')::uuid
      else gen_random_uuid()
    end,
    p_organization_id,
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
    row_number() over ()
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  cost_item_revision_key := public.begin_cost_item_revision('opportunity_quote', saved_row.id);
  perform public.supersede_previous_cost_items('opportunity_quote', saved_row.id, cost_item_revision_key);
  perform public.upsert_opportunity_quote_cost_items(saved_row.id, cost_item_revision_key);

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

grant execute on function public.save_opportunity_quote_draft(
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
