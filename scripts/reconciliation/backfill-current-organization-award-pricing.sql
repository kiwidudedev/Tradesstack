-- Historical award-pricing backfill for the current TradesStack organization.
-- SAFE DEFAULT: all mutations are transactionally rolled back.
-- Set apply_changes := true and change the final ROLLBACK to COMMIT only after
-- the dry run proves the exact audited counts below.

begin;

do $preflight$
#variable_conflict use_variable
declare
  apply_changes boolean := false;
  organization_id constant uuid := '5c5de347-9f21-48fa-aac9-ba87e91fe92a';
  actor_user_id constant uuid := '374ae39f-836c-4022-93fd-1fcce50fdbed';
  eligible_count integer;
  unresolved_count integer;
begin
  perform 1 from public.organization_members member
  where member.organization_id = organization_id
    and member.user_id = actor_user_id;
  if not found then
    raise exception 'Backfill stopped: audited organization actor is no longer a member';
  end if;

  select count(*) into eligible_count
  from public.opportunity_award_pricing_reconciliation_v1 reconciliation
  where reconciliation.organization_id = organization_id
    and reconciliation.classification in ('EXACT', 'DERIVABLE', 'MANUAL_ONLY', 'MIXED', 'NO_WORKSHEET')
    and not exists (
      select 1 from public.opportunity_award_pricing_manifests manifest
      where manifest.organization_id = reconciliation.organization_id
        and manifest.opportunity_id = reconciliation.opportunity_id
    );
  if eligible_count not in (0, 4) then
    raise exception 'Backfill stopped: expected either 4 safe historical records or an idempotent no-op, found %', eligible_count;
  end if;

  select count(*) into unresolved_count
  from public.opportunity_award_pricing_reconciliation_v1 reconciliation
  where reconciliation.organization_id = organization_id
    and reconciliation.classification in ('AMBIGUOUS', 'BROKEN_LINEAGE');
  if unresolved_count <> 3 then
    raise exception 'Backfill stopped: expected 3 unresolved historical records, found %', unresolved_count;
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('tradesstack.award_pricing_backfill_expected', eligible_count::text, true);
  perform set_config('tradesstack.award_pricing_backfill_apply', case when apply_changes then 'on' else 'off' end, true);
end;
$preflight$;

create temporary table historical_award_before on commit drop as
select
  reconciliation.*,
  quote.subtotal as accepted_subtotal_before,
  quote.gst_amount as accepted_gst_before,
  quote.total_quote_price as accepted_total_before,
  quote.status as accepted_status_before,
  quote.award_locked_at as accepted_lock_before
from public.opportunity_award_pricing_reconciliation_v1 reconciliation
left join public.project_quotes quote
  on quote.organization_id = reconciliation.organization_id
 and quote.id = reconciliation.accepted_quote_id
where reconciliation.organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a';

insert into public.opportunity_award_pricing_reconciliation_ledger (
  organization_id, opportunity_id, project_id, accepted_quote_id, classification,
  reason, candidate_workbook_ids, candidate_source_links
)
select
  organization_id, opportunity_id, project_id, accepted_quote_id, classification,
  case classification
    when 'AMBIGUOUS' then 'Accepted pricing basis cannot be proven from persisted source links.'
    else 'Persisted final Project or accepted quote lineage is incomplete.'
  end,
  candidate_workbook_ids, candidate_source_links
from historical_award_before
where classification in ('AMBIGUOUS', 'BROKEN_LINEAGE')
  and accepted_quote_id is not null
on conflict (organization_id, opportunity_id, accepted_quote_id)
do update set
  classification = excluded.classification,
  reason = excluded.reason,
  candidate_workbook_ids = excluded.candidate_workbook_ids,
  candidate_source_links = excluded.candidate_source_links,
  last_observed_at = timezone('utc', now());

update public.opportunity_award_pricing_reconciliation_ledger ledger
set
  classification = before_state.classification,
  reason = 'Persisted final Project or accepted quote lineage is incomplete.',
  candidate_workbook_ids = before_state.candidate_workbook_ids,
  candidate_source_links = before_state.candidate_source_links,
  last_observed_at = timezone('utc', now())
from historical_award_before before_state
where before_state.classification = 'BROKEN_LINEAGE'
  and before_state.accepted_quote_id is null
  and ledger.organization_id = before_state.organization_id
  and ledger.opportunity_id = before_state.opportunity_id
  and ledger.accepted_quote_id is null;

insert into public.opportunity_award_pricing_reconciliation_ledger (
  organization_id, opportunity_id, project_id, accepted_quote_id, classification,
  reason, candidate_workbook_ids, candidate_source_links
)
select
  before_state.organization_id, before_state.opportunity_id, before_state.project_id,
  null, before_state.classification,
  'Persisted final Project or accepted quote lineage is incomplete.',
  before_state.candidate_workbook_ids, before_state.candidate_source_links
from historical_award_before before_state
where before_state.classification = 'BROKEN_LINEAGE'
  and before_state.accepted_quote_id is null
  and not exists (
    select 1
    from public.opportunity_award_pricing_reconciliation_ledger ledger
    where ledger.organization_id = before_state.organization_id
      and ledger.opportunity_id = before_state.opportunity_id
      and ledger.accepted_quote_id is null
  );

create temporary table historical_award_backfilled on commit drop as
select eligible.organization_id, eligible.opportunity_id, finalized.*
from historical_award_before eligible
cross join lateral public.finalize_opportunity_award_pricing_v1(
  eligible.organization_id,
  eligible.opportunity_id,
  eligible.project_id,
  eligible.accepted_quote_id
) finalized
where eligible.classification in ('EXACT', 'DERIVABLE', 'MANUAL_ONLY', 'MIXED', 'NO_WORKSHEET')
  and not exists (
    select 1 from public.opportunity_award_pricing_manifests manifest
    where manifest.organization_id = eligible.organization_id
      and manifest.opportunity_id = eligible.opportunity_id
  );

do $verify$
declare
  apply_changes boolean := current_setting('tradesstack.award_pricing_backfill_apply', true) = 'on';
  manifest_count integer;
  working_quote_count integer;
  working_workbook_count integer;
  expected_backfill_count integer := coalesce(current_setting('tradesstack.award_pricing_backfill_expected', true), '0')::integer;
begin
  if (select count(*) from historical_award_backfilled) <> expected_backfill_count then
    raise exception 'Historical award backfill finalized an unexpected record count: expected %, found %',
      expected_backfill_count, (select count(*) from historical_award_backfilled);
  end if;

  if exists (
    select 1 from historical_award_before before_state
    join public.project_quotes quote
      on quote.organization_id = before_state.organization_id
     and quote.id = before_state.accepted_quote_id
    where quote.subtotal is distinct from before_state.accepted_subtotal_before
      or quote.gst_amount is distinct from before_state.accepted_gst_before
      or quote.total_quote_price is distinct from before_state.accepted_total_before
      or quote.status is distinct from before_state.accepted_status_before
  ) then
    raise exception 'Historical accepted quote financial history changed during backfill';
  end if;

  select count(*) into manifest_count
  from public.opportunity_award_pricing_manifests manifest
  where manifest.organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a';
  select count(*) into working_quote_count
  from public.project_quotes quote
  where quote.organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a'
    and quote.revision_kind = 'project_working';
  select count(*) into working_workbook_count
  from public.opportunity_pricing_worksheets workbook
  where workbook.organization_id = '5c5de347-9f21-48fa-aac9-ba87e91fe92a'
    and workbook.source_award_manifest_id is not null;

  if manifest_count <> 5 or working_quote_count <> 5 or working_workbook_count <> 3 then
    raise exception 'Historical backfill counts differ: manifests %, working quotes %, working workbooks %',
      manifest_count, working_quote_count, working_workbook_count;
  end if;

  if apply_changes then
    raise notice 'Validated committed backfill shape for % historical Opportunities.', expected_backfill_count;
  else
    raise notice 'Validated rollback-only backfill shape for % historical Opportunities.', expected_backfill_count;
  end if;
end;
$verify$;

-- SAFE DEFAULT.
rollback;
