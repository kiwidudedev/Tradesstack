begin;

create or replace view public.opportunity_award_pricing_reconciliation_v1
with (security_invoker = true)
as
with facts as (
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
    quote.total_quote_price,
    coalesce(workbooks.candidate_count, 0)::integer as candidate_workbook_count,
    coalesce(lines.line_count, 0)::integer as quote_line_count,
    coalesce(lines.unresolved_line_count, 0)::integer as unresolved_line_count,
    coalesce(links.linked_line_count, 0)::integer as worksheet_linked_quote_line_count,
    coalesce(links.linked_workbook_count, 0)::integer as distinct_linked_workbook_count,
    coalesce(links.invalid_count, 0)::integer as invalid_worksheet_link_count,
    coalesce(workbooks.workbook_ids, '[]'::jsonb) as candidate_workbook_ids,
    coalesce(links.link_evidence, '[]'::jsonb) as candidate_source_links
  from public.opportunity_final_projects mapping
  left join public.organization_opportunities opportunity
    on opportunity.organization_id = mapping.organization_id and opportunity.id = mapping.opportunity_id
  left join public.project_quotes quote
    on quote.organization_id = mapping.organization_id and quote.id = mapping.accepted_quote_id
  left join lateral (
    select count(*) as candidate_count, jsonb_agg(workbook.id order by workbook.created_at) as workbook_ids
    from public.opportunity_pricing_worksheets workbook
    where workbook.organization_id = mapping.organization_id
      and workbook.opportunity_id = mapping.opportunity_id
      and workbook.quote_id is null and workbook.variation_id is null and workbook.archived_at is null
  ) workbooks on true
  left join lateral (
    select count(*) as line_count,
      count(*) filter (where line.pricing_source_kind = 'unresolved') as unresolved_line_count
    from public.project_quote_line_items line
    where line.organization_id = mapping.organization_id and line.quote_id = mapping.accepted_quote_id
  ) lines on true
  left join lateral (
    select
      count(distinct link.document_line_id) as linked_line_count,
      count(distinct item.source_workbook_id) as linked_workbook_count,
      count(*) filter (where item.id is null or workbook.id is null or sheet.id is null or line.id is null) as invalid_count,
      jsonb_agg(jsonb_build_object(
        'lineId', link.document_line_id,
        'commercialItemId', item.id,
        'workbookId', item.source_workbook_id,
        'sheetId', item.source_sheet_id,
        'range', item.source_range
      ) order by link.document_line_id) as link_evidence
    from public.commercial_item_document_links link
    left join public.commercial_items item
      on item.organization_id = link.organization_id and item.id = link.commercial_item_id
    left join public.opportunity_pricing_worksheets workbook
      on workbook.organization_id = item.organization_id and workbook.id = item.source_workbook_id
    left join public.opportunity_pricing_workbook_sheets sheet
      on sheet.organization_id = item.organization_id and sheet.workbook_id = item.source_workbook_id and sheet.id = item.source_sheet_id
    left join public.project_quote_line_items line
      on line.organization_id = link.organization_id and line.quote_id = link.document_id and line.id = link.document_line_id
    where link.organization_id = mapping.organization_id
      and link.document_kind = 'quote_line' and link.document_id = mapping.accepted_quote_id
      and link.link_role = 'source'
  ) links on true
)
select facts.*,
  case
    when converted_project_id is distinct from project_id or accepted_quote_id is null
      or originating_opportunity_id is distinct from opportunity_id or quote_project_id is distinct from project_id
      or invalid_worksheet_link_count > 0 or worksheet_linked_quote_line_count > quote_line_count
      or distinct_linked_workbook_count > candidate_workbook_count then 'BROKEN_LINEAGE'
    when unresolved_line_count > 0 then 'AMBIGUOUS'
    when candidate_workbook_count = 0 and quote_line_count > 0 then 'MANUAL_ONLY'
    when candidate_workbook_count = 0 and quote_line_count = 0 then 'NO_WORKSHEET'
    when quote_line_count = 0 or worksheet_linked_quote_line_count = 0 then 'AMBIGUOUS'
    when worksheet_linked_quote_line_count < quote_line_count then 'MIXED'
    when distinct_linked_workbook_count = 0 then 'BROKEN_LINEAGE'
    when candidate_workbook_count = 1 and distinct_linked_workbook_count = 1 then 'EXACT'
    else 'DERIVABLE'
  end as classification
from facts;

create table if not exists public.opportunity_award_pricing_reconciliation_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  opportunity_id uuid not null,
  project_id uuid null,
  accepted_quote_id uuid null,
  classification text not null,
  reason text not null,
  candidate_workbook_ids jsonb not null default '[]'::jsonb,
  candidate_source_links jsonb not null default '[]'::jsonb,
  first_observed_at timestamptz not null default timezone('utc', now()),
  last_observed_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  unique (organization_id, opportunity_id, accepted_quote_id)
);

alter table public.opportunity_award_pricing_reconciliation_ledger enable row level security;
alter table public.opportunity_award_pricing_reconciliation_ledger force row level security;

create policy "Members can view award pricing reconciliation ledger"
on public.opportunity_award_pricing_reconciliation_ledger for select to authenticated
using (public.is_member_of_organization(organization_id));

create policy "Opportunity managers can record award pricing reconciliation"
on public.opportunity_award_pricing_reconciliation_ledger for insert to authenticated
with check (public.has_org_permission(organization_id, 'leads.opportunities.write'));

create policy "Opportunity managers can refresh award pricing reconciliation"
on public.opportunity_award_pricing_reconciliation_ledger for update to authenticated
using (public.has_org_permission(organization_id, 'leads.opportunities.write'))
with check (public.has_org_permission(organization_id, 'leads.opportunities.write'));

grant select on public.opportunity_award_pricing_reconciliation_v1 to authenticated;
grant select, insert, update on public.opportunity_award_pricing_reconciliation_ledger to authenticated;

commit;
