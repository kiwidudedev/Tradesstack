alter table public.project_quotes
  add column if not exists originating_opportunity_id uuid null references public.organization_opportunities (id) on delete set null;

update public.project_quotes
set originating_opportunity_id = source_opportunity_id
where originating_opportunity_id is null
  and source_opportunity_id is not null;

alter table public.project_quotes
  alter column project_id drop not null;

alter table public.project_quote_line_items
  alter column project_id drop not null;

create index if not exists project_quotes_org_originating_opp_idx
  on public.project_quotes (organization_id, originating_opportunity_id, updated_at desc);

create index if not exists project_quotes_org_project_attached_idx
  on public.project_quotes (organization_id, project_id, updated_at desc)
  where project_id is not null;

create or replace function public.validate_project_quote_canonical_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_project_source_opportunity_id uuid;
begin
  if new.originating_opportunity_id is null and new.project_id is null then
    raise exception 'Commercial quote must have either originating_opportunity_id or project_id';
  end if;

  if new.originating_opportunity_id is not null and not exists (
    select 1
    from public.organization_opportunities opportunity
    where opportunity.id = new.originating_opportunity_id
      and opportunity.organization_id = new.organization_id
  ) then
    raise exception 'Originating opportunity not found for organization';
  end if;

  if new.project_id is not null then
    select project.source_opportunity_id
    into resolved_project_source_opportunity_id
    from public.organization_projects project
    where project.id = new.project_id
      and project.organization_id = new.organization_id;

    if not found then
      raise exception 'Project not found for organization';
    end if;

    if resolved_project_source_opportunity_id is not null
      and new.originating_opportunity_id is not null
      and resolved_project_source_opportunity_id <> new.originating_opportunity_id then
      raise exception 'Project must belong to the same originating opportunity';
    end if;
  end if;

  if new.source_opportunity_id is null then
    new.source_opportunity_id := new.originating_opportunity_id;
  elsif new.originating_opportunity_id is not null and new.source_opportunity_id <> new.originating_opportunity_id then
    raise exception 'source_opportunity_id must match originating_opportunity_id';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_project_quote_canonical_ownership on public.project_quotes;
create trigger validate_project_quote_canonical_ownership
before insert or update on public.project_quotes
for each row execute function public.validate_project_quote_canonical_ownership();

create or replace function public.validate_project_quote_line_item_canonical_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.project_quotes%rowtype;
begin
  select *
  into quote_row
  from public.project_quotes quote
  where quote.id = new.quote_id
    and quote.organization_id = new.organization_id;

  if not found then
    raise exception 'Quote not found for organization';
  end if;

  if new.project_id is distinct from quote_row.project_id then
    raise exception 'Quote line project_id must match quote project_id';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_project_quote_line_item_canonical_ownership on public.project_quote_line_items;
create trigger validate_project_quote_line_item_canonical_ownership
before insert or update on public.project_quote_line_items
for each row execute function public.validate_project_quote_line_item_canonical_ownership();

create or replace function public.save_commercial_quote_draft(
  p_organization_id uuid,
  p_originating_opportunity_id uuid,
  p_project_id uuid default null,
  p_quote_id uuid default null,
  p_expected_updated_at timestamptz default null,
  p_quote_title text default '',
  p_quote_number text default '',
  p_client_name text default '',
  p_company_name text default '',
  p_contact_person text default '',
  p_client_email text default '',
  p_client_phone text default '',
  p_site_address text default '',
  p_project_name text default '',
  p_quote_date date default null,
  p_expiry_date date default null,
  p_status text default 'Draft',
  p_optional_items_notes text default '',
  p_scope_exclusions text default '',
  p_assumptions text default '',
  p_scope_notes text default '',
  p_margin_percent numeric default 0,
  p_discount_amount numeric default 0,
  p_contingency_amount numeric default 0,
  p_gst_percent numeric default 15,
  p_validity_period text default '',
  p_payment_terms text default '',
  p_retention_percent_default numeric default 0,
  p_lead_time text default '',
  p_terms_inclusions text default '',
  p_terms_exclusions text default '',
  p_clarifications text default '',
  p_acceptance_notes text default '',
  p_line_items jsonb default '[]'::jsonb
)
returns table (
  id uuid,
  updated_at timestamptz,
  subtotal numeric,
  optional_subtotal numeric,
  gst_amount numeric,
  total_quote_price numeric,
  status text,
  originating_opportunity_id uuid,
  project_id uuid
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
  resolved_attached_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_originating_opportunity_id is null then
    raise exception 'originating_opportunity_id is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_opportunities opportunity
    where opportunity.id = p_originating_opportunity_id
      and opportunity.organization_id = p_organization_id
  ) then
    raise exception 'Originating opportunity not found for organization';
  end if;

  if p_project_id is not null then
    select project.source_opportunity_id
    into resolved_project_source_opportunity_id
    from public.organization_projects project
    where project.id = p_project_id
      and project.organization_id = p_organization_id;

    if not found then
      raise exception 'Project not found for organization';
    end if;

    if resolved_project_source_opportunity_id is not null
      and resolved_project_source_opportunity_id <> p_originating_opportunity_id then
      raise exception 'Project must belong to the same originating opportunity';
    end if;
  else
    resolved_project_source_opportunity_id := null;
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
    from public.project_quotes quote
    where quote.id = p_quote_id
      and quote.organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Quote not found';
    end if;

    if existing_row.originating_opportunity_id is not null
      and existing_row.originating_opportunity_id <> p_originating_opportunity_id then
      raise exception 'Quote belongs to a different originating opportunity';
    end if;

    if p_expected_updated_at is null then
      raise exception 'Quote version is required. Please refresh and try again.'
        using errcode = '40001';
    end if;

    if existing_row.updated_at is distinct from p_expected_updated_at then
      raise exception 'This quote was updated by another user. Refresh and try again.'
        using errcode = '40001';
    end if;

    resolved_attached_project_id := coalesce(p_project_id, existing_row.project_id);

    update public.project_quotes quote
    set
      project_id = resolved_attached_project_id,
      originating_opportunity_id = coalesce(quote.originating_opportunity_id, p_originating_opportunity_id),
      source_opportunity_id = coalesce(quote.source_opportunity_id, p_originating_opportunity_id),
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
        else quote.status
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
      acceptance_notes = coalesce(p_acceptance_notes, '')
    where quote.id = p_quote_id
      and quote.organization_id = p_organization_id
    returning * into saved_row;
  else
    saved_status := case
      when p_status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then p_status
      else 'Draft'
    end;

    insert into public.project_quotes (
      organization_id,
      project_id,
      originating_opportunity_id,
      source_opportunity_id,
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
      retention_percent_default,
      lead_time,
      terms_inclusions,
      terms_exclusions,
      clarifications,
      acceptance_notes
    ) values (
      p_organization_id,
      p_project_id,
      p_originating_opportunity_id,
      p_originating_opportunity_id,
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
      round(resolved_retention_percent_default, 3),
      coalesce(p_lead_time, ''),
      coalesce(p_terms_inclusions, ''),
      coalesce(p_terms_exclusions, ''),
      coalesce(p_clarifications, ''),
      coalesce(p_acceptance_notes, '')
    )
    returning * into saved_row;
  end if;

  delete from public.project_quote_line_items line
  where line.organization_id = p_organization_id
    and line.quote_id = saved_row.id;

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
    saved_row.project_id,
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
    saved_row.status,
    saved_row.originating_opportunity_id,
    saved_row.project_id;
end;
$$;

grant execute on function public.save_commercial_quote_draft(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, text,
  date, date, text, text, text, text, text, numeric, numeric, numeric, numeric, text, text,
  numeric, text, text, text, text, text, jsonb
) to authenticated;

create or replace function public.repair_project_quote_source_opportunity_lineage(
  p_organization_id uuid,
  p_quote_id uuid
)
returns table (
  id uuid,
  source_opportunity_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  quote_row public.project_quotes%rowtype;
  resolved_project_source_opportunity_id uuid;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select q.*
  into quote_row
  from public.project_quotes q
  where q.id = p_quote_id
    and q.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Quote not found';
  end if;

  if quote_row.project_id is not null then
    select p.source_opportunity_id
    into resolved_project_source_opportunity_id
    from public.organization_projects p
    where p.id = quote_row.project_id
      and p.organization_id = quote_row.organization_id;

    if resolved_project_source_opportunity_id is not null
      and quote_row.originating_opportunity_id is not null
      and resolved_project_source_opportunity_id <> quote_row.originating_opportunity_id then
      raise exception 'This quote belongs to a different opportunity.';
    end if;
  else
    resolved_project_source_opportunity_id := quote_row.originating_opportunity_id;
  end if;

  if quote_row.source_opportunity_id is null then
    update public.project_quotes q
    set source_opportunity_id = coalesce(resolved_project_source_opportunity_id, q.originating_opportunity_id)
    where q.id = quote_row.id
    returning * into quote_row;
  end if;

  return query
  select quote_row.id, quote_row.source_opportunity_id;
end;
$$;

create or replace function public.can_insert_commercial_item_document_link(
  p_organization_id uuid,
  p_commercial_item_id uuid,
  p_document_kind text,
  p_document_id uuid,
  p_document_line_id uuid,
  p_link_role text
)
returns boolean
language sql
stable
as $$
  select case
    when p_document_kind = 'quote_line' then exists (
      select 1
      from public.commercial_items item
      join public.project_quote_line_items line
        on line.id = p_document_line_id
       and line.quote_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_quotes quote
        on quote.id = line.quote_id
       and quote.organization_id = p_organization_id
      left join public.organization_projects project
        on project.id = quote.project_id
       and project.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and quote.originating_opportunity_id = item.opportunity_id
        and item.project_id is not distinct from quote.project_id
        and line.project_id is not distinct from quote.project_id
        and (
          quote.project_id is null
          or project.source_opportunity_id is null
          or project.source_opportunity_id = item.opportunity_id
        )
        and (
          p_link_role <> 'source'
          or not exists (
            select 1
            from public.commercial_item_document_links existing_link
            where existing_link.organization_id = p_organization_id
              and existing_link.document_kind = 'quote_line'
              and existing_link.document_line_id = p_document_line_id
              and existing_link.link_role = 'source'
              and existing_link.commercial_item_id <> p_commercial_item_id
          )
        )
    )
    when p_document_kind = 'purchase_order_line' then exists (
      select 1
      from public.commercial_items item
      join public.project_purchase_order_line_items line
        on line.id = p_document_line_id
       and line.purchase_order_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_purchase_orders purchase_order
        on purchase_order.id = line.purchase_order_id
       and purchase_order.organization_id = p_organization_id
      join public.organization_projects project
        on project.id = purchase_order.project_id
       and project.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and item.project_id is not null
        and item.project_id = line.project_id
        and item.project_id = purchase_order.project_id
        and project.source_opportunity_id = item.opportunity_id
    )
    else false
  end;
$$;
