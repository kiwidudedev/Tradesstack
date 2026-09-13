-- READ ONLY: classifies awarded Opportunity pricing lineage. This script performs
-- SELECTs only and is safe to run through psql against a reviewed environment.
--
-- Example:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/reconciliation/audit-opportunity-award-pricing.sql

begin transaction read only;

with awarded as (
  select
    mapping.organization_id,
    mapping.opportunity_id,
    mapping.project_id,
    mapping.accepted_quote_id,
    opportunity.slug as opportunity_slug,
    opportunity.converted_project_id,
    quote.originating_opportunity_id,
    quote.project_id as quote_project_id,
    quote.quote_number,
    quote.status as quote_status
  from public.opportunity_final_projects mapping
  left join public.organization_opportunities opportunity
    on opportunity.organization_id = mapping.organization_id
   and opportunity.id = mapping.opportunity_id
  left join public.project_quotes quote
    on quote.organization_id = mapping.organization_id
   and quote.id = mapping.accepted_quote_id
), workbook_counts as (
  select
    awarded.organization_id,
    awarded.opportunity_id,
    count(workbook.id) filter (where workbook.quote_id is null)::integer as candidate_workbook_count,
    count(workbook.id) filter (where workbook.quote_id = awarded.accepted_quote_id)::integer
      as existing_quote_owned_workbook_count
  from awarded
  left join public.opportunity_pricing_worksheets workbook
   on workbook.organization_id = awarded.organization_id
   and workbook.opportunity_id = awarded.opportunity_id
   and workbook.variation_id is null
   and workbook.archived_at is null
  group by awarded.organization_id, awarded.opportunity_id
), quote_lines as (
  select
    awarded.organization_id,
    awarded.opportunity_id,
    awarded.accepted_quote_id,
    count(line.id)::integer as quote_line_count
  from awarded
  left join public.project_quote_line_items line
    on line.organization_id = awarded.organization_id
   and line.quote_id = awarded.accepted_quote_id
  group by awarded.organization_id, awarded.opportunity_id, awarded.accepted_quote_id
), worksheet_links as (
  select
    awarded.organization_id,
    awarded.opportunity_id,
    awarded.accepted_quote_id,
    count(distinct link.document_line_id)::integer as worksheet_linked_quote_line_count,
    count(distinct item.source_workbook_id)::integer as distinct_linked_workbook_count,
    count(*) filter (
      where link.id is not null
        and (
          item.id is null
          or item.organization_id <> awarded.organization_id
          or item.opportunity_id <> awarded.opportunity_id
          or workbook.id is null
          or sheet.id is null
          or line.id is null
        )
    )::integer as invalid_worksheet_link_count,
    array_remove(array_agg(distinct item.source_workbook_id), null) as linked_workbook_ids,
    array_remove(array_agg(distinct item.source_sheet_id), null) as linked_sheet_ids
  from awarded
  left join public.commercial_item_document_links link
    on link.organization_id = awarded.organization_id
   and link.document_kind = 'quote_line'
   and link.link_role = 'source'
   and link.document_id = awarded.accepted_quote_id
  left join public.commercial_items item
    on item.organization_id = link.organization_id
   and item.id = link.commercial_item_id
  left join public.opportunity_pricing_worksheets workbook
    on workbook.organization_id = item.organization_id
   and workbook.id = item.source_workbook_id
  left join public.opportunity_pricing_workbook_sheets sheet
    on sheet.organization_id = item.organization_id
   and sheet.workbook_id = item.source_workbook_id
   and sheet.id = item.source_sheet_id
  left join public.project_quote_line_items line
    on line.organization_id = link.organization_id
   and line.quote_id = link.document_id
   and line.id = link.document_line_id
  group by awarded.organization_id, awarded.opportunity_id, awarded.accepted_quote_id
), facts as (
  select
    awarded.*,
    coalesce(workbook_counts.candidate_workbook_count, 0) as candidate_workbook_count,
    coalesce(workbook_counts.existing_quote_owned_workbook_count, 0) as existing_quote_owned_workbook_count,
    coalesce(quote_lines.quote_line_count, 0) as quote_line_count,
    coalesce(worksheet_links.worksheet_linked_quote_line_count, 0) as worksheet_linked_quote_line_count,
    coalesce(worksheet_links.distinct_linked_workbook_count, 0) as distinct_linked_workbook_count,
    coalesce(worksheet_links.invalid_worksheet_link_count, 0) as invalid_worksheet_link_count,
    coalesce(worksheet_links.linked_workbook_ids, '{}'::uuid[]) as linked_workbook_ids,
    coalesce(worksheet_links.linked_sheet_ids, '{}'::uuid[]) as linked_sheet_ids
  from awarded
  left join workbook_counts using (organization_id, opportunity_id)
  left join quote_lines using (organization_id, opportunity_id, accepted_quote_id)
  left join worksheet_links using (organization_id, opportunity_id, accepted_quote_id)
)
select
  facts.*,
  case
    when facts.converted_project_id is distinct from facts.project_id
      or facts.accepted_quote_id is null
      or facts.originating_opportunity_id is distinct from facts.opportunity_id
      or facts.quote_project_id is distinct from facts.project_id
      or facts.invalid_worksheet_link_count > 0
      or facts.worksheet_linked_quote_line_count > facts.quote_line_count
      or facts.distinct_linked_workbook_count > facts.candidate_workbook_count
      then 'BROKEN_LINEAGE'
    when facts.candidate_workbook_count = 0 and facts.quote_line_count > 0
      then 'MANUAL_ONLY'
    when facts.candidate_workbook_count = 0 and facts.quote_line_count = 0
      then 'NO_WORKSHEET'
    when facts.quote_line_count = 0 or facts.worksheet_linked_quote_line_count = 0
      then 'AMBIGUOUS'
    when facts.worksheet_linked_quote_line_count < facts.quote_line_count
      then 'MIXED'
    when facts.distinct_linked_workbook_count = 0
      then 'BROKEN_LINEAGE'
    when facts.candidate_workbook_count = 1 and facts.distinct_linked_workbook_count = 1
      then 'EXACT'
    else 'DERIVABLE'
  end as classification
from facts
order by facts.organization_id, facts.opportunity_id;

rollback;
