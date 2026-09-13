begin;

alter table public.project_quotes
  add column if not exists pricing_basis_status text not null default 'unpublished',
  add column if not exists publication_basis_json jsonb not null default '{}'::jsonb,
  add column if not exists pricing_basis_checked_at timestamptz null;

alter table public.project_quotes
  add constraint project_quotes_pricing_basis_status_check
    check (pricing_basis_status in ('unpublished', 'current', 'stale'));

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
  where line.organization_id = p_organization_id
    and line.quote_id = p_quote_id
    and (
      line.pricing_source_kind <> 'worksheet'
      or round(coalesce(item.quantity, 1), 3) <> round(line.quantity, 3)
      or coalesce(item.unit, '') <> line.unit
      or round(coalesce(item.rate, 0), 2) <> round(line.rate, 2)
      or round(coalesce(item.total, coalesce(item.quantity, 1) * coalesce(item.rate, 0)), 2) <> line.total
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

grant execute on function public.validate_and_record_quote_publication_v1(uuid, uuid) to authenticated;

create or replace function public.mark_project_quote_pricing_basis_stale_from_line_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_line public.project_quote_line_items%rowtype := case when tg_op = 'DELETE' then old else new end;
begin
  update public.project_quotes quote
  set pricing_basis_status = 'stale',
      pricing_basis_checked_at = timezone('utc', now())
  where quote.organization_id = target_line.organization_id
    and quote.id = target_line.quote_id
    and quote.award_locked_at is null
    and quote.pricing_basis_status = 'current';
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger mark_quote_basis_stale_from_line
after insert or update or delete on public.project_quote_line_items
for each row execute function public.mark_project_quote_pricing_basis_stale_from_line_v1();

create or replace function public.mark_project_quote_pricing_basis_stale_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workbook_id uuid := case when tg_table_name = 'opportunity_pricing_workbook_sheets' then new.workbook_id else new.id end;
begin
  update public.project_quotes quote
  set pricing_basis_status = 'stale',
      pricing_basis_checked_at = timezone('utc', now())
  where quote.organization_id = new.organization_id
    and quote.award_locked_at is null
    and quote.pricing_basis_status = 'current'
    and quote.publication_basis_json->'workbookIds' @> jsonb_build_array(target_workbook_id::text);
  return new;
end;
$$;

create trigger mark_quote_basis_stale_from_workbook
after update of version, worksheet_data, pricing_summary, extracted_pricing_data
on public.opportunity_pricing_worksheets
for each row
when (old.version is distinct from new.version or old.worksheet_data is distinct from new.worksheet_data)
execute function public.mark_project_quote_pricing_basis_stale_v1();

create trigger mark_quote_basis_stale_from_sheet
after update of version, worksheet_data, pricing_summary, extracted_pricing_data
on public.opportunity_pricing_workbook_sheets
for each row
when (old.version is distinct from new.version or old.worksheet_data is distinct from new.worksheet_data)
execute function public.mark_project_quote_pricing_basis_stale_v1();

commit;
