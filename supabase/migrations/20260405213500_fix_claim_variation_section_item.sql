create or replace function public.get_project_claim_source_line_items(
  p_organization_id uuid,
  p_project_id uuid
)
returns table (
  source_kind text,
  source_document_id uuid,
  source_line_item_id uuid,
  source_number text,
  source_title text,
  section text,
  description text,
  quantity numeric,
  unit text,
  rate numeric,
  source_total numeric,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  with base_quote as (
    select q.id, q.quote_number, q.quote_title
    from public.project_quotes q
    where q.organization_id = p_organization_id
      and q.project_id = p_project_id
    order by
      case
        when q.status = 'Accepted' then 0
        when q.status = 'Sent' then 1
        else 2
      end,
      q.updated_at desc
    limit 1
  ),
  quote_lines as (
    select
      'Quote'::text as source_kind,
      bq.id as source_document_id,
      li.id as source_line_item_id,
      bq.quote_number as source_number,
      bq.quote_title as source_title,
      li.section,
      li.description,
      li.quantity,
      li.unit,
      li.rate,
      coalesce(li.total, round(li.quantity * li.rate, 2)) as source_total,
      li.sort_order as sort_order
    from base_quote bq
    join public.project_quote_line_items li
      on li.organization_id = p_organization_id
     and li.project_id = p_project_id
     and li.quote_id = bq.id
    where coalesce(li.is_optional, false) = false
  ),
  variation_totals as (
    select
      'Variation'::text as source_kind,
      v.id as source_document_id,
      v.id as source_line_item_id,
      v.variation_number as source_number,
      v.variation_title as source_title,
      'Item'::text as section,
      v.variation_title as description,
      1::numeric as quantity,
      'Item'::text as unit,
      coalesce(v.total_variation_price, 0)::numeric as rate,
      coalesce(v.total_variation_price, 0)::numeric as source_total,
      (100000 + row_number() over (order by v.created_at, v.id))::integer as sort_order
    from public.project_variations v
    where v.organization_id = p_organization_id
      and v.project_id = p_project_id
      and v.status in ('Approved', 'Sent', 'Invoiced')
  )
  select * from quote_lines
  union all
  select * from variation_totals
  order by sort_order;
$$;

grant execute on function public.get_project_claim_source_line_items(uuid, uuid) to authenticated;
