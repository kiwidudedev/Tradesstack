-- MUTATING, INTENTIONALLY UNAPPLIED.
-- Run only after reviewing the read-only reconciliation output, as an authenticated
-- user with leads.opportunities.write and quotes.write for every organization in scope:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/reconciliation/backfill-opportunity-award-pricing.sql

begin;

create temporary table award_pricing_before on commit drop as
select reconciliation.*, quote.total_quote_price as accepted_total_before
from public.opportunity_award_pricing_reconciliation_v1 reconciliation
left join public.project_quotes quote
  on quote.organization_id = reconciliation.organization_id
 and quote.id = reconciliation.accepted_quote_id;

-- Required pre-mutation counts.
select classification, count(*) as record_count
from award_pricing_before
group by classification
order by classification;

insert into public.opportunity_award_pricing_reconciliation_ledger (
  organization_id, opportunity_id, project_id, accepted_quote_id, classification,
  reason, candidate_workbook_ids, candidate_source_links
)
select
  organization_id, opportunity_id, project_id, accepted_quote_id, classification,
  case classification
    when 'AMBIGUOUS' then 'Accepted pricing basis cannot be proven from persisted source links.'
    when 'BROKEN_LINEAGE' then 'Persisted organization/opportunity/project/quote/source lineage is inconsistent.'
    when 'NO_WORKSHEET' then 'No worksheet and no accepted quote lines exist to carry through.'
    else 'Record is not eligible for automatic backfill.'
  end,
  candidate_workbook_ids, candidate_source_links
from award_pricing_before
where classification not in ('EXACT', 'DERIVABLE', 'MANUAL_ONLY', 'MIXED')
on conflict (organization_id, opportunity_id, accepted_quote_id)
do update set
  classification = excluded.classification,
  reason = excluded.reason,
  candidate_workbook_ids = excluded.candidate_workbook_ids,
  candidate_source_links = excluded.candidate_source_links,
  last_observed_at = timezone('utc', now());

create temporary table award_pricing_backfilled on commit drop as
select eligible.organization_id, eligible.opportunity_id, finalized.*
from award_pricing_before eligible
cross join lateral public.finalize_opportunity_award_pricing_v1(
  eligible.organization_id,
  eligible.opportunity_id,
  eligible.project_id,
  eligible.accepted_quote_id
) finalized
where eligible.classification in ('EXACT', 'DERIVABLE', 'MANUAL_ONLY', 'MIXED');

-- Fail the transaction if any accepted customer-facing amount changed.
do $$
begin
  if exists (
    select 1
    from award_pricing_before before_state
    join public.project_quotes quote
      on quote.organization_id = before_state.organization_id
     and quote.id = before_state.accepted_quote_id
    where quote.total_quote_price is distinct from before_state.accepted_total_before
  ) then
    raise exception 'Historical accepted quote totals changed during pricing backfill';
  end if;
end;
$$;

select classification, count(*) as auto_backfilled_count
from award_pricing_backfilled
group by classification
order by classification;

select classification, count(*) as post_backfill_count
from public.opportunity_award_pricing_reconciliation_v1
group by classification
order by classification;

commit;
