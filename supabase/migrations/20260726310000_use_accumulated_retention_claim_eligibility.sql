begin;

-- Retention Claim availability is operational ownership less immutable prior
-- claims. Release schedules remain available as optional planning metadata, but
-- are deliberately absent from this authoritative calculation.
create or replace function private.retention_eligibility_state(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private, extensions
as $$
  with project_context as (
    select
      project.id,
      project.organization_id,
      public.get_project_retention_position_summary(project.id) as position
    from public.organization_projects project
    where project.id = p_project_id
  ),
  submitted_claimed as (
    select
      allocation.originating_payment_claim_id,
      round(coalesce(sum(allocation.allocation_amount), 0), 2) as amount
    from public.retention_claim_allocations allocation
    join public.retention_claims retention_claim
      on retention_claim.id = allocation.retention_claim_id
    where retention_claim.project_id = p_project_id
      and retention_claim.status = 'submitted'
    group by allocation.originating_payment_claim_id
  ),
  legacy_claimed as (
    select
      legacy.originating_payment_claim_id,
      round(coalesce(legacy.amount, 0), 2) as amount
    from private.current_legacy_committed_by_origin(p_project_id) legacy
  ),
  origins as (
    select
      payment_claim.id,
      payment_claim.claim_number,
      payment_claim.status,
      payment_claim.claim_date,
      greatest(
        round(coalesce(payment_claim.retention_withheld_amount, 0), 2),
        0
      )::numeric(14,2) as retention_held,
      coalesce(submitted.amount, 0)::numeric(14,2) as submitted_claimed,
      coalesce(legacy.amount, 0)::numeric(14,2) as legacy_claimed
    from public.project_claims payment_claim
    left join submitted_claimed submitted
      on submitted.originating_payment_claim_id = payment_claim.id
    left join legacy_claimed legacy
      on legacy.originating_payment_claim_id = payment_claim.id
    where payment_claim.project_id = p_project_id
      and payment_claim.status <> 'Cancelled'
  ),
  payload as (
    select
      context.organization_id,
      context.id as project_id,
      context.position,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'originatingPaymentClaimId', origin.id,
          'claimNumber', origin.claim_number,
          'claimStatus', origin.status,
          'claimDate', origin.claim_date,
          'currentRetentionOwned', origin.retention_held,
          'retentionHeld', origin.retention_held,
          'submittedRetentionClaimCommitted', origin.submitted_claimed,
          'legacyCommittedRetention', origin.legacy_claimed,
          'committedRetention',
            round(origin.submitted_claimed + origin.legacy_claimed, 2),
          'previouslyClaimed',
            round(origin.submitted_claimed + origin.legacy_claimed, 2),
          'currentEligibleRetention',
            greatest(round(
              origin.retention_held
              - origin.submitted_claimed
              - origin.legacy_claimed,
              2
            ), 0),
          'availableRetention',
            greatest(round(
              origin.retention_held
              - origin.submitted_claimed
              - origin.legacy_claimed,
              2
            ), 0),
          'remainingRetention',
            greatest(round(
              origin.retention_held
              - origin.submitted_claimed
              - origin.legacy_claimed,
              2
            ), 0),
          'eligibilitySource', 'accumulated_retention',
          'scheduleIds', '[]'::jsonb,
          'schedules', '[]'::jsonb
        )
        order by origin.claim_date nulls last, origin.id
      ) filter (where origin.id is not null), '[]'::jsonb) as origins
    from project_context context
    left join origins origin on true
    group by context.organization_id, context.id, context.position
  )
  select jsonb_build_object(
    'organizationId', organization_id,
    'projectId', project_id,
    'positionStateHash', position ->> 'stateHash',
    'eligibilityModel', 'accumulated_retention_v1',
    'eligibilityStateHash', encode(extensions.digest(convert_to(
      jsonb_build_object(
        'organizationId', organization_id,
        'projectId', project_id,
        'positionStateHash', position ->> 'stateHash',
        'eligibilityModel', 'accumulated_retention_v1',
        'origins', origins
      )::text,
      'UTF8'
    ), 'sha256'), 'hex'),
    'origins', origins,
    'effectiveLegacyReconciliationCaseId',
      private.current_effective_retention_legacy_case(project_id)
  )
  from payload;
$$;

-- The whole-document saver previously added the current Draft allocation back
-- to schedule availability. Pre-validate the complete request against only
-- immutable submitted allocations before delegating to the existing atomic
-- document writer.
alter function public.save_retention_claim_draft_document(
  uuid, bigint, text, text, date, date, text, text, text, jsonb, text
) rename to save_retention_claim_draft_document_pre_accumulated_eligibility;

revoke all on function
  public.save_retention_claim_draft_document_pre_accumulated_eligibility(
    uuid, bigint, text, text, date, date, text, text, text, jsonb, text
  )
from public, anon, authenticated, service_role;

create or replace function public.save_retention_claim_draft_document(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_title text,
  p_reference text,
  p_issue_date date,
  p_due_date date,
  p_expected_position_state_hash text,
  p_expected_eligibility_state_hash text,
  p_expected_origin_set_hash text,
  p_lines jsonb,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  claim public.retention_claims%rowtype;
  invalid_lines jsonb;
begin
  select *
  into claim
  from public.retention_claims
  where id = p_retention_claim_id
  for update;

  if not found then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'claim_not_found',
      'changed', false
    );
  end if;

  if p_lines is not null
    and jsonb_typeof(p_lines) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_lines) item
      where jsonb_typeof(item) <> 'object'
        or coalesce(item ->> 'originatingPaymentClaimId', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item ->> 'proposedAmountCents', '') !~ '^[0-9]+$'
    )
  then
    perform origin.id
    from public.project_claims origin
    where origin.id in (
      select (item ->> 'originatingPaymentClaimId')::uuid
      from jsonb_array_elements(p_lines) item
    )
    order by origin.id
    for update;

    with requested as (
      select
        (item ->> 'originatingPaymentClaimId')::uuid as origin_id,
        (item ->> 'proposedAmountCents')::bigint as proposed_cents
      from jsonb_array_elements(p_lines) item
    ),
    submitted as (
      select
        allocation.originating_payment_claim_id as origin_id,
        round(coalesce(sum(allocation.allocation_amount), 0) * 100)::bigint
          as submitted_cents
      from public.retention_claim_allocations allocation
      join public.retention_claims submitted_claim
        on submitted_claim.id = allocation.retention_claim_id
      where submitted_claim.organization_id = claim.organization_id
        and submitted_claim.project_id = claim.project_id
        and submitted_claim.status = 'submitted'
      group by allocation.originating_payment_claim_id
    ),
    legacy as (
      select
        committed.originating_payment_claim_id as origin_id,
        round(coalesce(committed.amount, 0) * 100)::bigint as legacy_cents
      from private.current_legacy_committed_by_origin(claim.project_id) committed
    )
    select jsonb_agg(jsonb_build_object(
      'originatingPaymentClaimId', requested.origin_id,
      'errorCode', case
        when origin.id is null then 'origin_not_found'
        when origin.organization_id <> claim.organization_id
          or origin.project_id <> claim.project_id then 'cross_project_origin'
        when origin.status not in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
          then 'origin_cancelled'
        else 'allocation_exceeds_eligibility'
      end,
      'retentionHeldCents',
        round(greatest(coalesce(origin.retention_withheld_amount, 0), 0) * 100),
      'previouslyClaimedCents',
        coalesce(submitted.submitted_cents, 0) + coalesce(legacy.legacy_cents, 0),
      'currentLimitCents', greatest(
        round(greatest(coalesce(origin.retention_withheld_amount, 0), 0) * 100)
        - coalesce(submitted.submitted_cents, 0)
        - coalesce(legacy.legacy_cents, 0),
        0
      ),
      'proposedAmountCents', requested.proposed_cents
    ) order by requested.origin_id)
    into invalid_lines
    from requested
    left join public.project_claims origin on origin.id = requested.origin_id
    left join submitted on submitted.origin_id = requested.origin_id
    left join legacy on legacy.origin_id = requested.origin_id
    where origin.id is null
      or origin.organization_id <> claim.organization_id
      or origin.project_id <> claim.project_id
      or origin.status not in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
      or requested.proposed_cents > greatest(
        round(greatest(coalesce(origin.retention_withheld_amount, 0), 0) * 100)
        - coalesce(submitted.submitted_cents, 0)
        - coalesce(legacy.legacy_cents, 0),
        0
      );

    if invalid_lines is not null then
      return private.reject_retention_document_save(
        claim,
        coalesce(invalid_lines -> 0 ->> 'errorCode',
          'allocation_exceeds_eligibility'),
        p_correlation_id,
        jsonb_build_object('rowErrors', invalid_lines)
      );
    end if;
  end if;

  return public.save_retention_claim_draft_document_pre_accumulated_eligibility(
    p_retention_claim_id,
    p_expected_draft_revision,
    p_title,
    p_reference,
    p_issue_date,
    p_due_date,
    p_expected_position_state_hash,
    p_expected_eligibility_state_hash,
    p_expected_origin_set_hash,
    p_lines,
    p_correlation_id
  );
end;
$$;

revoke all on function public.save_retention_claim_draft_document(
  uuid, bigint, text, text, date, date, text, text, text, jsonb, text
) from public, anon;
grant execute on function public.save_retention_claim_draft_document(
  uuid, bigint, text, text, date, date, text, text, text, jsonb, text
) to authenticated;

-- Replace only the buried Phase 4 schedule boundary. Later variance, legacy,
-- document-successor, and Phase 2C wrappers continue to execute unchanged.
create or replace function public.submit_retention_claim_phase4_pre_variance(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_expected_position_state_hash text,
  p_correlation_id text default null,
  p_expected_eligibility_state_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  claim public.retention_claims%rowtype;
  state jsonb;
  state_hash text;
  invalid_lines jsonb;
  result jsonb;
begin
  select *
  into claim
  from public.retention_claims
  where id = p_retention_claim_id
  for update;

  if not found then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'claim_not_found'
    );
  end if;

  -- Serialize every submission path that can consume the same originating
  -- Payment Claim before recomputing immutable prior allocations.
  perform origin.id
  from public.project_claims origin
  join public.retention_claim_allocations allocation
    on allocation.originating_payment_claim_id = origin.id
  where allocation.retention_claim_id = claim.id
    and origin.organization_id = claim.organization_id
    and origin.project_id = claim.project_id
  order by origin.id
  for update of origin;

  state := private.retention_eligibility_state(claim.project_id);
  state_hash := state ->> 'eligibilityStateHash';

  if p_expected_eligibility_state_hash is null
    or p_expected_eligibility_state_hash <> state_hash
    or claim.last_eligibility_state_hash <> state_hash
  then
    return private.reject_retention_claim_submission(
      claim.id,
      'stale_eligibility',
      jsonb_build_object(
        'eligibilityModel', 'accumulated_retention_v1',
        'draftEligibilityStateHash', claim.last_eligibility_state_hash,
        'expectedEligibilityStateHash', p_expected_eligibility_state_hash,
        'currentEligibilityStateHash', state_hash,
        'origins', state -> 'origins'
      ),
      p_correlation_id
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'originatingPaymentClaimId', allocation.originating_payment_claim_id,
    'proposedAllocation', allocation.allocation_amount,
    'retentionHeld', coalesce((eligible ->> 'retentionHeld')::numeric, 0),
    'previouslyClaimed',
      coalesce((eligible ->> 'previouslyClaimed')::numeric, 0),
    'remainingRetention',
      coalesce((eligible ->> 'remainingRetention')::numeric, 0)
  ) order by allocation.originating_payment_claim_id)
  into invalid_lines
  from public.retention_claim_allocations allocation
  left join lateral (
    select value as eligible
    from jsonb_array_elements(coalesce(state -> 'origins', '[]'::jsonb))
    where value ->> 'originatingPaymentClaimId' =
      allocation.originating_payment_claim_id::text
  ) eligibility on true
  where allocation.retention_claim_id = claim.id
    and allocation.allocation_amount >
      coalesce((eligible ->> 'remainingRetention')::numeric, 0);

  if invalid_lines is not null then
    return private.reject_retention_claim_submission(
      claim.id,
      case
        when exists (
          select 1
          from jsonb_array_elements(invalid_lines) line
          where coalesce((line ->> 'remainingRetention')::numeric, 0) = 0
        ) then 'retention_not_eligible'
        else 'allocation_exceeds_eligibility'
      end,
      jsonb_build_object(
        'eligibilityModel', 'accumulated_retention_v1',
        'origins', invalid_lines,
        'eligibilityStateHash', state_hash
      ),
      p_correlation_id
    );
  end if;

  result := public.submit_retention_claim_phase3_pre_schedule(
    p_retention_claim_id,
    p_expected_draft_revision,
    p_expected_position_state_hash,
    p_correlation_id
  );
  if not coalesce((result ->> 'succeeded')::boolean, false) then
    return result;
  end if;

  perform set_config('app.retention_phase4_submission_write', 'true', true);
  update public.retention_claim_allocations allocation
  set
    eligibility_state_hash_snapshot = state_hash,
    eligibility_schedule_ids_snapshot = '{}'::uuid[]
  where allocation.retention_claim_id = claim.id;

  update public.retention_claims
  set submission_eligibility_state_hash = state_hash
  where id = claim.id;
  perform set_config('app.retention_phase4_submission_write', '', true);

  return result || jsonb_build_object(
    'eligibilityStateHash', state_hash,
    'eligibilityModel', 'accumulated_retention_v1',
    'eligibility', state
  );
end;
$$;

revoke all on function public.submit_retention_claim_phase4_pre_variance(
  uuid, bigint, text, text, text
) from public, anon, authenticated, service_role;

-- Variance scanning remains useful for ownership reductions and historical
-- over-allocation, but schedule cancellation or schedule changes are no longer
-- operational blockers.
create or replace function private.retention_variance_snapshot(
  p_project_id uuid,
  p_originating_payment_claim_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions
as $$
declare
  origin public.project_claims%rowtype;
  position jsonb;
  held numeric(14,2);
  native_committed numeric(14,2);
  legacy_committed numeric(14,2);
  total_committed numeric(14,2);
  snapshot_held numeric(14,2);
  claim_ids uuid[];
  allocation_ids uuid[];
  native_payload jsonb;
  legacy_payload jsonb;
  committed_hash text;
  conditions text[] := '{}'::text[];
  primary_type text;
  variance_state text;
  severity text;
  blocking boolean := false;
begin
  select *
  into origin
  from public.project_claims
  where id = p_originating_payment_claim_id
    and project_id = p_project_id;
  if not found then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'origin_not_found'
    );
  end if;

  position := public.get_project_retention_position_summary(p_project_id);
  held := greatest(round(coalesce(origin.retention_withheld_amount, 0), 2), 0);

  select
    round(coalesce(sum(allocation.allocation_amount), 0), 2),
    coalesce(array_agg(distinct claim.id order by claim.id), '{}'::uuid[]),
    coalesce(array_agg(allocation.id order by allocation.id), '{}'::uuid[]),
    round(coalesce(max(allocation.retention_withheld_snapshot), held), 2),
    coalesce(jsonb_agg(jsonb_build_object(
      'retentionClaimId', claim.id,
      'retentionClaimStatus', claim.status,
      'retentionClaimSubmittedAt', claim.submitted_at,
      'allocationId', allocation.id,
      'originatingPaymentClaimId', allocation.originating_payment_claim_id,
      'allocationAmount', allocation.allocation_amount,
      'allocationSubmittedAt', allocation.submitted_at,
      'originStateHashSnapshot', allocation.origin_state_hash_snapshot,
      'eligibilityStateHashSnapshot', allocation.eligibility_state_hash_snapshot
    ) order by claim.id, allocation.id), '[]'::jsonb)
  into
    native_committed,
    claim_ids,
    allocation_ids,
    snapshot_held,
    native_payload
  from public.retention_claim_allocations allocation
  join public.retention_claims claim
    on claim.id = allocation.retention_claim_id
  where claim.status = 'submitted'
    and allocation.originating_payment_claim_id = origin.id;

  select
    coalesce(committed.amount, 0),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'legacyAllocationId', allocation.id,
        'reconciliationCaseId', allocation.reconciliation_case_id,
        'legacyReleaseSourceId', allocation.legacy_release_source_id,
        'originatingPaymentClaimId', allocation.originating_payment_claim_id,
        'allocationAmount', allocation.allocation_amount,
        'approvedAt', allocation.approved_at
      ) order by allocation.id)
      from public.retention_legacy_release_allocations allocation
      where allocation.reconciliation_case_id =
        private.current_effective_retention_legacy_case(p_project_id)
        and allocation.originating_payment_claim_id = origin.id
    ), '[]'::jsonb)
  into legacy_committed, legacy_payload
  from (select 1) singleton
  left join private.current_legacy_committed_by_origin(p_project_id) committed
    on committed.originating_payment_claim_id = origin.id;

  native_committed := coalesce(native_committed, 0);
  legacy_committed := coalesce(legacy_committed, 0);
  total_committed := round(native_committed + legacy_committed, 2);
  committed_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'originatingPaymentClaimId', origin.id,
    'submittedAllocations', native_payload,
    'legacyAllocations', legacy_payload
  )::text, 'UTF8'), 'sha256'), 'hex');

  if total_committed > 0 and origin.status = 'Cancelled' then
    conditions := array_append(conditions, 'origin_payment_claim_cancelled');
  end if;
  if total_committed > held then
    conditions := array_append(conditions, 'ownership_reduced');
  end if;
  if total_committed > 0 and held <> snapshot_held
    and not ('ownership_reduced' = any(conditions))
  then
    conditions := array_append(conditions, 'ownership_reduced');
  end if;

  if 'origin_payment_claim_cancelled' = any(conditions) then
    primary_type := 'origin_payment_claim_cancelled';
    variance_state := case
      when total_committed > held then 'over_allocated'
      else 'reconciliation_required'
    end;
    severity := case
      when total_committed > held then 'critical'
      else 'high'
    end;
    blocking := true;
  elsif total_committed > held then
    primary_type := 'ownership_reduced';
    variance_state := 'over_allocated';
    severity := 'critical';
    blocking := true;
  elsif 'ownership_reduced' = any(conditions) then
    primary_type := 'ownership_reduced';
    variance_state := 'warning';
    severity := 'medium';
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'organizationId', origin.organization_id,
    'projectId', origin.project_id,
    'originatingPaymentClaimId', origin.id,
    'originClaimNumber', origin.claim_number,
    'originStatus', origin.status,
    'hasVariance', primary_type is not null,
    'primaryType', primary_type,
    'contributingConditions', to_jsonb(conditions),
    'state', variance_state,
    'severity', severity,
    'isBlocking', blocking,
    'currentOwnership', held,
    'currentEligibility', held,
    'submittedRetentionClaimCommitted', native_committed,
    'legacyCommittedRetention', legacy_committed,
    'committedRetention', total_committed,
    'ownershipVariance', round(held - total_committed, 2),
    'eligibilityVariance', round(held - total_committed, 2),
    'diagnosticRemaining', greatest(round(held - total_committed, 2), 0),
    'allocatableAvailability', greatest(round(held - total_committed, 2), 0),
    'phase2StateHash', position ->> 'stateHash',
    'phase4EligibilityHash',
      private.retention_eligibility_state(p_project_id) ->> 'eligibilityStateHash',
    'committedAllocationHash', committed_hash,
    'affectedRetentionClaimIds', to_jsonb(claim_ids),
    'affectedAllocationIds', to_jsonb(allocation_ids),
    'reliedScheduleIds', '[]'::jsonb,
    'currentScheduleIds', '[]'::jsonb,
    'committedAllocations', native_payload,
    'legacyAllocations', legacy_payload,
    'currentSchedules', '[]'::jsonb,
    'eligibilityModel', 'accumulated_retention_v1',
    'effectiveLegacyReconciliationCaseId',
      private.current_effective_retention_legacy_case(p_project_id)
  );
end;
$$;

-- Accounting ownership remains read-only and operational. Preserve the legacy
-- output keys for deployed callers while publishing explicit accumulated-
-- retention values and removing schedule state from the decision.
create or replace function public.evaluate_retention_ownership_phase2a(
  p_organization_id uuid,
  p_project_id uuid,
  p_proposals jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  position jsonb;
  payment_claim public.project_claims%rowtype;
  proposal jsonb;
  origins jsonb := '[]'::jsonb;
  native_submitted bigint;
  approved_legacy bigint;
  draft_committed bigint;
  exported bigint;
  paid bigint;
  held bigint;
  proposed_owned bigint;
  proposed_release bigint;
  previously_claimed bigint;
  remaining bigint;
  after_claim bigint;
  reasons jsonb;
  unresolved_legacy boolean;
begin
  if jsonb_typeof(p_proposals) <> 'array' then
    raise exception 'Retention ownership proposals must be a JSON array.';
  end if;
  if not exists (
    select 1
    from public.organization_projects project
    where project.id = p_project_id
      and project.organization_id = p_organization_id
  ) then
    raise exception 'Project does not belong to the organization.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_proposals) item
    where not exists (
      select 1
      from public.project_claims claim
      where claim.id = (item ->> 'originId')::uuid
        and claim.project_id = p_project_id
        and claim.organization_id = p_organization_id
    )
  ) then
    raise exception 'A proposed retention origin is outside the organization project.';
  end if;

  position := public.get_project_retention_position_summary(p_project_id);
  unresolved_legacy := coalesce(
    (position ->> 'legacyReconciliationRequired')::boolean,
    false
  );

  for payment_claim in
    select claim.*
    from public.project_claims claim
    where claim.organization_id = p_organization_id
      and claim.project_id = p_project_id
      and claim.status <> 'Cancelled'
    order by claim.claim_date nulls last, claim.created_at, claim.id
  loop
    select value
    into proposal
    from jsonb_array_elements(p_proposals)
    where value ->> 'originId' = payment_claim.id::text
    limit 1;

    held := round(greatest(
      coalesce(payment_claim.retention_withheld_amount, 0),
      0
    ) * 100);
    proposed_owned := round(coalesce(
      (proposal ->> 'proposedOwnedMinor')::numeric,
      held
    ));
    proposed_release := round(coalesce(
      (proposal ->> 'proposedReleaseMinor')::numeric,
      0
    ));

    select round(coalesce(sum(allocation.allocation_amount), 0) * 100)::bigint
    into native_submitted
    from public.retention_claim_allocations allocation
    join public.retention_claims retention_claim
      on retention_claim.id = allocation.retention_claim_id
    where allocation.originating_payment_claim_id = payment_claim.id
      and retention_claim.organization_id = p_organization_id
      and retention_claim.project_id = p_project_id
      and retention_claim.status = 'submitted';

    select round(coalesce(sum(allocation.allocation_amount), 0) * 100)::bigint
    into draft_committed
    from public.retention_claim_allocations allocation
    join public.retention_claims retention_claim
      on retention_claim.id = allocation.retention_claim_id
    where allocation.originating_payment_claim_id = payment_claim.id
      and retention_claim.organization_id = p_organization_id
      and retention_claim.project_id = p_project_id
      and retention_claim.status = 'draft';

    select round(coalesce(legacy.amount, 0) * 100)::bigint
    into approved_legacy
    from private.current_legacy_committed_by_origin(p_project_id) legacy
    where legacy.originating_payment_claim_id = payment_claim.id;
    approved_legacy := coalesce(approved_legacy, 0);

    select round(coalesce(sum(line.line_amount_excl_tax), 0) * 100)::bigint
    into exported
    from public.retention_claim_accounting_lines line
    join public.retention_claim_accounting_snapshots snapshot
      on snapshot.id = line.accounting_snapshot_id
    join public.organization_accounting_documents document
      on document.id = snapshot.accounting_document_id
    where line.originating_payment_claim_id = payment_claim.id
      and line.organization_id = p_organization_id
      and line.project_id = p_project_id
      and document.export_status = 'exported';

    select round(coalesce(sum(attribution.paid_amount), 0) * 100)::bigint
    into paid
    from public.retention_claim_payment_attributions attribution
    join public.retention_claim_payment_reconciliations reconciliation
      on reconciliation.id = attribution.payment_reconciliation_id
    where attribution.originating_payment_claim_id = payment_claim.id
      and attribution.organization_id = p_organization_id
      and attribution.project_id = p_project_id
      and reconciliation.id = (
        select latest.id
        from public.retention_claim_payment_reconciliations latest
        where latest.retention_claim_id = reconciliation.retention_claim_id
        order by latest.reconciliation_sequence desc
        limit 1
      );

    previously_claimed := native_submitted + approved_legacy;
    remaining := greatest(held - previously_claimed, 0);
    after_claim := greatest(remaining - proposed_release, 0);
    reasons := '[]'::jsonb;

    if unresolved_legacy then
      reasons := reasons || '"unresolved_legacy_retention"'::jsonb;
    end if;
    if proposed_owned > held then
      reasons := reasons || '"proposed_ownership_exceeds_current"'::jsonb;
    end if;
    if previously_claimed > proposed_owned then
      reasons := reasons ||
        '"committed_retention_exceeds_proposed_ownership"'::jsonb;
    end if;
    if proposed_release > remaining then
      reasons := reasons || '"proposed_release_exceeds_remaining"'::jsonb;
    end if;
    if proposed_release > 0 and previously_claimed > 0 then
      reasons := reasons || '"duplicate_release_path"'::jsonb;
    end if;
    if exported > native_submitted then
      reasons := reasons ||
        '"exported_retention_exceeds_native_commitment"'::jsonb;
    end if;
    if paid > exported then
      reasons := reasons ||
        '"paid_retention_exceeds_exported_retention"'::jsonb;
    end if;

    origins := origins || jsonb_build_array(jsonb_build_object(
      'originId', payment_claim.id,
      'retentionHeldMinor', held,
      'previouslyClaimedMinor', previously_claimed,
      'remainingMinor', remaining,
      'proposedMinor', proposed_release,
      'afterClaimMinor', after_claim,
      'currentOwnedMinor', held,
      'proposedOwnedMinor', proposed_owned,
      'nativeSubmittedMinor', native_submitted,
      'approvedLegacyMinor', approved_legacy,
      'draftCommittedMinor', draft_committed,
      'exportedMinor', exported,
      'paidMinor', paid,
      'scheduleEligibleMinor', remaining,
      'proposedReleaseMinor', proposed_release,
      'eligibilitySource', 'accumulated_retention',
      'unresolvedLegacy', unresolved_legacy,
      'blocker', reasons ->> 0,
      'blockingReasons', reasons,
      'valid', jsonb_array_length(reasons) = 0
    ));
  end loop;

  return jsonb_build_object(
    'organizationId', p_organization_id,
    'projectId', p_project_id,
    'readOnly', true,
    'eligibilityModel', 'accumulated_retention_v1',
    'origins', origins,
    'valid', not exists (
      select 1
      from jsonb_array_elements(origins) origin
      where not coalesce((origin ->> 'valid')::boolean, false)
    )
  );
end;
$$;

revoke all on function public.evaluate_retention_ownership_phase2a(
  uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.evaluate_retention_ownership_phase2a(
  uuid, uuid, jsonb
) to service_role;

commit;
