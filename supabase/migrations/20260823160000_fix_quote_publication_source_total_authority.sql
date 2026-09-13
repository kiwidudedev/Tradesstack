begin;

-- Commercial items retain the worksheet's exact mapped values. Quote lines,
-- however, persist the destination-normalized quantity/rate product. Validate
-- source-backed line totals against that Quote authority while retaining every
-- other lineage, source-value, line, and header reconciliation check.
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
      or round(effective_source.quantity * effective_source.rate, 2) <> line.total
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

revoke execute on function public.validate_and_record_quote_publication_v1(uuid, uuid) from public, anon;
grant execute on function public.validate_and_record_quote_publication_v1(uuid, uuid) to authenticated;

commit;
