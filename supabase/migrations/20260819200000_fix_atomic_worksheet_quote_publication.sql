begin;

create table if not exists public.worksheet_quote_publication_requests (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_key text not null,
  quote_id uuid not null references public.project_quotes (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, request_key)
);

alter table public.worksheet_quote_publication_requests enable row level security;
alter table public.worksheet_quote_publication_requests force row level security;

create or replace function public.validate_and_record_quote_publication_v1(
  p_organization_id uuid,
  p_quote_id uuid
)
returns table (
  quote_id uuid,
  publication_basis_hash text,
  pricing_basis_status text,
  persisted_total numeric,
  quote_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.project_quotes%rowtype;
  computed_subtotal numeric := 0;
  computed_optional_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_gst numeric := 0;
  computed_total numeric := 0;
  invalid_line_count integer := 0;
  invalid_source_value_count integer := 0;
  duplicate_source_link_count integer := 0;
  basis jsonb := '{}'::jsonb;
  basis_hash text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select * into quote_row
  from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.id = p_quote_id
  for update;

  if not found then
    raise exception 'Quote not found for organization';
  end if;
  if quote_row.award_locked_at is not null then
    raise exception 'Award-locked quote revisions cannot be republished' using errcode = 'TS409';
  end if;

  select
    coalesce(sum(case when line.is_optional then 0 else round(line.quantity * line.rate, 2) end), 0),
    coalesce(sum(case when line.is_optional then round(line.quantity * line.rate, 2) else 0 end), 0),
    count(*) filter (where line.total <> round(line.quantity * line.rate, 2))
  into computed_subtotal, computed_optional_subtotal, invalid_line_count
  from public.project_quote_line_items line
  where line.organization_id = p_organization_id
    and line.quote_id = p_quote_id;

  select count(*)::integer into invalid_source_value_count
  from public.project_quote_line_items line
  join public.commercial_item_document_links link
    on link.organization_id = line.organization_id
   and link.document_kind = 'quote_line'
   and link.document_id = line.quote_id
   and link.document_line_id = line.id
   and link.link_role = 'source'
  join public.commercial_items item
    on item.organization_id = link.organization_id
   and item.id = link.commercial_item_id
  cross join lateral (
    select
      coalesce(item.quantity, 1::numeric) as quantity,
      coalesce(item.unit, 'Item') as unit,
      case
        when item.rate is not null then item.rate
        when item.total is not null and coalesce(item.quantity, 1::numeric) <> 0
          then item.total / coalesce(item.quantity, 1::numeric)
        else 0::numeric
      end as rate
  ) effective_source
  where line.organization_id = p_organization_id
    and line.quote_id = p_quote_id
    and (
      line.pricing_source_kind <> 'worksheet'
      or round(effective_source.quantity, 3) <> round(line.quantity, 3)
      or effective_source.unit <> line.unit
      or round(effective_source.rate, 2) <> round(line.rate, 2)
      or round(coalesce(item.total, effective_source.quantity * effective_source.rate), 2) <> line.total
    );

  select count(*)::integer into duplicate_source_link_count
  from (
    select link.document_line_id
    from public.commercial_item_document_links link
    where link.organization_id = p_organization_id
      and link.document_kind = 'quote_line'
      and link.document_id = p_quote_id
      and link.link_role = 'source'
    group by link.document_line_id
    having count(*) <> 1
  ) duplicates;

  computed_margin := computed_subtotal * (quote_row.margin_percent / 100);
  computed_gst := greatest(0, computed_subtotal + computed_margin + quote_row.contingency_amount - quote_row.discount_amount)
    * (quote_row.gst_percent / 100);
  computed_total := greatest(0, computed_subtotal + computed_margin + quote_row.contingency_amount - quote_row.discount_amount)
    + computed_gst;

  if invalid_line_count > 0 or invalid_source_value_count > 0 or duplicate_source_link_count > 0
    or quote_row.subtotal <> round(computed_subtotal, 2)
    or quote_row.optional_subtotal <> round(computed_optional_subtotal, 2)
    or quote_row.margin_amount <> round(computed_margin, 2)
    or quote_row.gst_amount <> round(computed_gst, 2)
    or quote_row.total_quote_price <> round(computed_total, 2)
  then
    raise exception 'Quote publication totals do not reconcile with persisted quote lines' using errcode = 'TS422';
  end if;

  select jsonb_build_object(
    'version', 1,
    'quoteId', quote_row.id,
    'lineCount', count(distinct line.id),
    'manualLineIds', coalesce(jsonb_agg(distinct line.id order by line.id)
      filter (where line.pricing_source_kind = 'manual'), '[]'::jsonb),
    'commercialItems', coalesce(jsonb_agg(distinct jsonb_build_object(
      'lineId', line.id,
      'commercialItemId', item.id,
      'workbookId', item.source_workbook_id,
      'sheetId', item.source_sheet_id,
      'range', item.source_range,
      'sourceSignature', item.source_signature,
      'sourceVersion', item.source_version
    )) filter (where item.id is not null), '[]'::jsonb),
    'workbookIds', coalesce(jsonb_agg(distinct item.source_workbook_id::text)
      filter (where item.source_workbook_id is not null), '[]'::jsonb),
    'subtotal', quote_row.subtotal,
    'gst', quote_row.gst_amount,
    'total', quote_row.total_quote_price
  ) into basis
  from public.project_quote_line_items line
  left join public.commercial_item_document_links link
    on link.organization_id = line.organization_id
   and link.document_kind = 'quote_line'
   and link.document_id = line.quote_id
   and link.document_line_id = line.id
   and link.link_role = 'source'
  left join public.commercial_items item
    on item.organization_id = link.organization_id
   and item.id = link.commercial_item_id
  where line.organization_id = p_organization_id
    and line.quote_id = p_quote_id;

  basis_hash := md5(basis::text);
  update public.project_quotes quote
  set publication_basis_json = basis,
      publication_basis_hash = basis_hash,
      pricing_basis_status = 'current',
      pricing_basis_checked_at = timezone('utc', now()),
      published_at = timezone('utc', now())
  where quote.organization_id = p_organization_id
    and quote.id = p_quote_id
  returning quote.* into quote_row;

  return query select quote_row.id, basis_hash, 'current'::text, quote_row.total_quote_price, quote_row.updated_at;
end;
$$;

create or replace function public.publish_worksheet_commercial_quote_v1(p_input jsonb)
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
  actor_user_id uuid := auth.uid();
  resolved_organization_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  resolved_request_key text := nullif(p_input->>'requestKey', '');
  existing_request public.worksheet_quote_publication_requests%rowtype;
  saved_row record;
  link jsonb;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if resolved_organization_id is null or resolved_request_key is null then
    raise exception 'organizationId and requestKey are required';
  end if;
  if not public.has_org_permission(resolved_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select request.* into existing_request
  from public.worksheet_quote_publication_requests request
  where request.organization_id = resolved_organization_id
    and request.request_key = resolved_request_key;

  if found then
    return query
    select quote.id, quote.updated_at, quote.subtotal, quote.optional_subtotal,
      quote.gst_amount, quote.total_quote_price, quote.status,
      quote.originating_opportunity_id, quote.project_id
    from public.project_quotes quote
    where quote.organization_id = resolved_organization_id
      and quote.id = existing_request.quote_id;
    return;
  end if;

  select * into saved_row
  from public.save_commercial_quote_draft(
    p_organization_id => resolved_organization_id,
    p_originating_opportunity_id => nullif(p_input->>'originatingOpportunityId', '')::uuid,
    p_project_id => nullif(p_input->>'projectId', '')::uuid,
    p_quote_id => nullif(p_input->>'quoteId', '')::uuid,
    p_expected_updated_at => nullif(p_input->>'expectedUpdatedAt', '')::timestamptz,
    p_quote_title => coalesce(p_input->>'quoteTitle', ''),
    p_quote_number => coalesce(p_input->>'quoteNumber', ''),
    p_client_name => coalesce(p_input->>'clientName', ''),
    p_company_name => coalesce(p_input->>'companyName', ''),
    p_contact_person => coalesce(p_input->>'contactPerson', ''),
    p_client_email => coalesce(p_input->>'clientEmail', ''),
    p_client_phone => coalesce(p_input->>'clientPhone', ''),
    p_site_address => coalesce(p_input->>'siteAddress', ''),
    p_project_name => coalesce(p_input->>'projectName', ''),
    p_quote_date => nullif(p_input->>'quoteDate', '')::date,
    p_expiry_date => nullif(p_input->>'expiryDate', '')::date,
    p_status => coalesce(p_input->>'status', 'Draft'),
    p_optional_items_notes => coalesce(p_input->>'optionalItemsNotes', ''),
    p_scope_exclusions => coalesce(p_input->>'scopeExclusions', ''),
    p_assumptions => coalesce(p_input->>'assumptions', ''),
    p_scope_notes => coalesce(p_input->>'scopeNotes', ''),
    p_margin_percent => coalesce(nullif(p_input->>'marginPercent', '')::numeric, 0),
    p_discount_amount => coalesce(nullif(p_input->>'discountAmount', '')::numeric, 0),
    p_contingency_amount => coalesce(nullif(p_input->>'contingencyAmount', '')::numeric, 0),
    p_gst_percent => coalesce(nullif(p_input->>'gstPercent', '')::numeric, 0),
    p_validity_period => coalesce(p_input->>'validityPeriod', ''),
    p_payment_terms => coalesce(p_input->>'paymentTerms', ''),
    p_retention_percent_default => coalesce(nullif(p_input->>'retentionPercentDefault', '')::numeric, 0),
    p_lead_time => coalesce(p_input->>'leadTime', ''),
    p_terms_inclusions => coalesce(p_input->>'termsInclusions', ''),
    p_terms_exclusions => coalesce(p_input->>'termsExclusions', ''),
    p_clarifications => coalesce(p_input->>'clarifications', ''),
    p_acceptance_notes => coalesce(p_input->>'acceptanceNotes', ''),
    p_line_items => coalesce(p_input->'lineItems', '[]'::jsonb)
  );

  perform public.repair_project_quote_source_opportunity_lineage(
    resolved_organization_id,
    saved_row.id
  );

  for link in
    select value from jsonb_array_elements(coalesce(p_input->'commercialItemLinks', '[]'::jsonb))
  loop
    perform public.link_commercial_item_to_quote_line(jsonb_build_object(
      'organizationId', resolved_organization_id,
      'commercialItemId', link->>'commercialItemId',
      'quoteId', saved_row.id,
      'quoteLineId', link->>'quoteLineId',
      'linkRole', 'source',
      'snapshotAtLinkJson', coalesce(link->'snapshotAtLinkJson', '{}'::jsonb)
    ));
  end loop;

  perform public.validate_and_record_quote_publication_v1(
    resolved_organization_id,
    saved_row.id
  );

  insert into public.worksheet_quote_publication_requests (
    organization_id,
    request_key,
    quote_id,
    created_by
  ) values (
    resolved_organization_id,
    resolved_request_key,
    saved_row.id,
    actor_user_id
  );

  return query
  select quote.id, quote.updated_at, quote.subtotal, quote.optional_subtotal,
    quote.gst_amount, quote.total_quote_price, quote.status,
    quote.originating_opportunity_id, quote.project_id
  from public.project_quotes quote
  where quote.organization_id = resolved_organization_id
    and quote.id = saved_row.id;
end;
$$;

revoke all on table public.worksheet_quote_publication_requests from public, anon, authenticated;
revoke execute on function public.publish_worksheet_commercial_quote_v1(jsonb) from public, anon;
grant execute on function public.publish_worksheet_commercial_quote_v1(jsonb) to authenticated;

commit;
