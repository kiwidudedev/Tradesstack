alter table public.project_quotes
  add column if not exists source_opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  add column if not exists source_opportunity_quote_id uuid null references public.opportunity_quotes (id) on delete set null,
  add column if not exists source_opportunity_quote_number text null;

alter table public.project_quote_line_items
  add column if not exists source_opportunity_quote_id uuid null references public.opportunity_quotes (id) on delete set null,
  add column if not exists source_opportunity_quote_line_item_id uuid null references public.opportunity_quote_line_items (id) on delete set null,
  add column if not exists source_opportunity_quote_number text null;

create index if not exists project_quote_line_items_quote_source_opp_line_idx
  on public.project_quote_line_items (quote_id, source_opportunity_quote_line_item_id)
  where source_opportunity_quote_line_item_id is not null;

create or replace function public.upsert_project_quote_cost_items_from_opportunity(
  p_organization_id uuid,
  p_project_quote_id uuid,
  p_opportunity_quote_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_context record;
  cost_item_revision_key text;
  rows_written integer := 0;
  missing_parent_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select *
  into resolved_context
  from public.resolve_cost_item_document_context('project_quote', p_project_quote_id)
  limit 1;

  if resolved_context.organization_id is null then
    raise exception 'Project quote not found or not authorized for CostItem conversion';
  end if;

  select count(*)
  into missing_parent_count
  from public.project_quote_line_items pqli
  left join public.cost_items oci
    on oci.source_document_kind = 'opportunity_quote'
   and oci.source_document_id = p_opportunity_quote_id
   and oci.is_current = true
   and oci.linked_opportunity_quote_line_item_id = pqli.source_opportunity_quote_line_item_id
  where pqli.organization_id = p_organization_id
    and pqli.project_id = resolved_context.project_id
    and pqli.quote_id = p_project_quote_id
    and pqli.source_opportunity_quote_id = p_opportunity_quote_id
    and oci.id is null;

  if missing_parent_count > 0 then
    raise exception 'Cannot create project quote CostItems: one or more opportunity quote lines have no current baseline CostItem';
  end if;

  cost_item_revision_key := public.begin_cost_item_revision('project_quote', p_project_quote_id);
  perform public.supersede_previous_cost_items('project_quote', p_project_quote_id, cost_item_revision_key);

  delete from public.cost_items ci
  where ci.source_document_kind = 'project_quote'
    and ci.source_document_id = p_project_quote_id
    and ci.source_revision_key = cost_item_revision_key;

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
    linked_quote_line_item_id,
    created_by
  )
  select
    pq.organization_id,
    pq.project_id,
    'project_quote',
    pq.id,
    'project_quote_line_items',
    pqli.id,
    oci.id,
    'system',
    jsonb_build_object(
      'document_kind', 'project_quote',
      'document_number', pq.quote_number,
      'document_title', pq.quote_title,
      'source_opportunity_id', pq.source_opportunity_id,
      'source_opportunity_quote_id', pq.source_opportunity_quote_id,
      'source_opportunity_quote_number', pq.source_opportunity_quote_number,
      'source_opportunity_quote_line_item_id', pqli.source_opportunity_quote_line_item_id,
      'section', pqli.section,
      'is_optional', pqli.is_optional
    ),
    '',
    'line_item',
    pqli.section,
    pqli.section,
    null,
    null,
    '',
    '',
    coalesce(nullif(btrim(pqli.description), ''), 'Untitled line item'),
    coalesce(pqli.description, ''),
    pqli.quantity,
    pqli.unit,
    pqli.rate,
    coalesce(pqli.total, round(pqli.quantity * pqli.rate, 2)),
    pqli.is_optional,
    pqli.sort_order,
    'active',
    clock_timestamp(),
    null,
    true,
    cost_item_revision_key,
    public.compute_cost_item_source_fingerprint(
      'project_quote',
      'project_quote_line_items',
      pqli.section,
      pqli.description,
      pqli.quantity,
      pqli.unit,
      pqli.rate,
      coalesce(pqli.total, round(pqli.quantity * pqli.rate, 2)),
      pqli.is_optional,
      pqli.sort_order,
      coalesce(pqli.source_opportunity_quote_line_item_id::text, ''),
      coalesce(pqli.source_opportunity_quote_number, '')
    ),
    pqli.id,
    auth.uid()
  from public.project_quotes pq
  join public.project_quote_line_items pqli
    on pqli.organization_id = pq.organization_id
   and pqli.project_id = pq.project_id
   and pqli.quote_id = pq.id
  join public.cost_items oci
    on oci.source_document_kind = 'opportunity_quote'
   and oci.source_document_id = p_opportunity_quote_id
   and oci.is_current = true
   and oci.linked_opportunity_quote_line_item_id = pqli.source_opportunity_quote_line_item_id
  where pq.organization_id = p_organization_id
    and pq.id = p_project_quote_id
    and pq.source_opportunity_quote_id = p_opportunity_quote_id;

  get diagnostics rows_written = row_count;
  return rows_written;
end;
$$;

grant execute on function public.upsert_project_quote_cost_items_from_opportunity(uuid, uuid, uuid) to authenticated;

create or replace function public.convert_opportunity_quote_to_project_quote(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_opportunity_quote_id uuid,
  p_project_id uuid,
  p_fallback_created_by uuid
)
returns table (
  project_quote_id uuid,
  source_opportunity_quote_id uuid,
  project_quote_number text,
  quote_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity_row public.organization_opportunities%rowtype;
  opportunity_quote_row public.opportunity_quotes%rowtype;
  project_quote_row public.project_quotes%rowtype;
  quote_number_for_project text;
  quote_number_conflict_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select *
  into opportunity_row
  from public.organization_opportunities o
  where o.id = p_opportunity_id
    and o.organization_id = p_organization_id;

  if not found then
    raise exception 'Opportunity not found for organization';
  end if;

  select *
  into opportunity_quote_row
  from public.opportunity_quotes q
  where q.id = p_opportunity_quote_id
    and q.organization_id = p_organization_id
    and q.opportunity_id = p_opportunity_id;

  if not found then
    raise exception 'Opportunity quote not found for organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  if not exists (
    select 1
    from public.cost_items ci
    where ci.source_document_kind = 'opportunity_quote'
      and ci.source_document_id = p_opportunity_quote_id
      and ci.is_current = true
  ) then
    raise exception 'Opportunity quote has no current baseline CostItems';
  end if;

  select pq.id
  into quote_number_conflict_id
  from public.project_quotes pq
  where pq.organization_id = p_organization_id
    and pq.quote_number = opportunity_quote_row.quote_number
  limit 1;

  quote_number_for_project := case
    when quote_number_conflict_id is not null then ''
    else opportunity_quote_row.quote_number
  end;

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
    acceptance_notes,
    source_opportunity_id,
    source_opportunity_quote_id,
    source_opportunity_quote_number
  ) values (
    p_organization_id,
    p_project_id,
    coalesce(opportunity_quote_row.created_by, p_fallback_created_by),
    opportunity_quote_row.quote_title,
    quote_number_for_project,
    opportunity_quote_row.client_name,
    opportunity_quote_row.company_name,
    opportunity_quote_row.contact_person,
    opportunity_quote_row.client_email,
    opportunity_quote_row.client_phone,
    opportunity_quote_row.site_address,
    opportunity_quote_row.project_name,
    opportunity_quote_row.quote_date,
    opportunity_quote_row.expiry_date,
    opportunity_quote_row.status,
    opportunity_quote_row.optional_items_notes,
    opportunity_quote_row.scope_exclusions,
    opportunity_quote_row.assumptions,
    opportunity_quote_row.scope_notes,
    opportunity_quote_row.subtotal,
    opportunity_quote_row.optional_subtotal,
    opportunity_quote_row.margin_percent,
    opportunity_quote_row.margin_amount,
    opportunity_quote_row.discount_amount,
    opportunity_quote_row.contingency_amount,
    opportunity_quote_row.gst_percent,
    opportunity_quote_row.gst_amount,
    opportunity_quote_row.total_quote_price,
    opportunity_quote_row.validity_period,
    opportunity_quote_row.payment_terms,
    opportunity_quote_row.lead_time,
    opportunity_quote_row.terms_inclusions,
    opportunity_quote_row.terms_exclusions,
    opportunity_quote_row.clarifications,
    opportunity_quote_row.acceptance_notes,
    p_opportunity_id,
    p_opportunity_quote_id,
    opportunity_quote_row.quote_number
  )
  returning * into project_quote_row;

  insert into public.project_quote_line_items (
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
    p_organization_id,
    p_project_id,
    project_quote_row.id,
    li.section,
    li.description,
    li.quantity,
    li.unit,
    li.rate,
    li.total,
    li.is_optional,
    li.sort_order,
    p_opportunity_quote_id,
    li.id,
    opportunity_quote_row.quote_number
  from public.opportunity_quote_line_items li
  where li.organization_id = p_organization_id
    and li.quote_id = p_opportunity_quote_id
  order by li.sort_order, li.id;

  perform public.upsert_project_quote_cost_items_from_opportunity(
    p_organization_id,
    project_quote_row.id,
    p_opportunity_quote_id
  );

  return query
  select
    project_quote_row.id,
    p_opportunity_quote_id,
    project_quote_row.quote_number,
    project_quote_row.quote_date;
end;
$$;

grant execute on function public.convert_opportunity_quote_to_project_quote(uuid, uuid, uuid, uuid, uuid) to authenticated;
