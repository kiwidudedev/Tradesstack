begin;

-- Phase 7 is an additive UI/read-model phase. This projection composes the
-- existing Phase 2-6 authorities and never writes Payment Claims or financial
-- evidence.
create or replace function public.get_project_retention_register(
  p_project_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  eligibility jsonb;
begin
  eligibility := public.get_project_retention_eligibility(p_project_id);

  if not coalesce((eligibility->>'succeeded')::boolean, false) then
    return eligibility;
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'organizationId', eligibility->>'organizationId',
    'projectId', eligibility->>'projectId',
    'positionStateHash', eligibility->>'positionStateHash',
    'eligibilityStateHash', eligibility->>'eligibilityStateHash',
    'rows', coalesce((
      select jsonb_agg(
        origin
        || jsonb_build_object(
          'nativeClaimedAmount', coalesce(native_claims.claimed_amount, 0),
          'legacyReconciledAmount', coalesce(legacy_claims.reconciled_amount, 0),
          'remainingAmount', greatest(
            (origin->>'currentRetentionOwned')::numeric
            - coalesce(native_claims.claimed_amount, 0)
            - coalesce(legacy_claims.reconciled_amount, 0),
            0
          ),
          -- Paid attribution is intentionally absent until approved Phase 10.
          'paidAmount', null,
          'latestRetentionClaim', latest_claim.claim,
          'scheduleNames', coalesce(schedule_names.names, '[]'::jsonb),
          'nextEligibilityDate', schedule_names.next_eligibility_date,
          'variance', variance.current_variance,
          'legacyReconciliation', legacy_case.current_case
        )
        order by
          nullif(origin->>'claimDate', '')::date nulls last,
          origin->>'claimNumber',
          origin->>'originatingPaymentClaimId'
      )
      from jsonb_array_elements(coalesce(eligibility->'origins', '[]'::jsonb)) origin
      left join lateral (
        select
          round(coalesce(sum(a.allocation_amount), 0), 2) as claimed_amount
        from public.retention_claim_allocations a
        join public.retention_claims c on c.id = a.retention_claim_id
        where a.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and c.status = 'submitted'
      ) native_claims on true
      left join lateral (
        select
          round(coalesce(sum(a.allocation_amount), 0), 2) as reconciled_amount
        from public.retention_legacy_release_allocations a
        join public.retention_legacy_reconciliation_cases c
          on c.id = a.reconciliation_case_id
        where a.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and c.status = 'approved'
      ) legacy_claims on true
      left join lateral (
        select jsonb_build_object(
          'id', c.id,
          'claimNumber', c.claim_number,
          'status', c.status,
          'issueDate', c.issue_date,
          'allocationAmount', a.allocation_amount
        ) as claim
        from public.retention_claim_allocations a
        join public.retention_claims c on c.id = a.retention_claim_id
        where a.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and c.status <> 'cancelled_draft'
        order by coalesce(c.submitted_at, c.created_at) desc, c.id desc
        limit 1
      ) latest_claim on true
      left join lateral (
        select
          coalesce(jsonb_agg(s.name order by s.schedule_sequence), '[]'::jsonb)
            as names,
          (
            select min(nullif(schedule->>'eligibilityDate', '')::date)
            from jsonb_array_elements(
              coalesce(origin->'schedules', '[]'::jsonb)
            ) schedule
            where not coalesce(
              (schedule->>'currentlyEligible')::boolean,
              false
            )
          ) as next_eligibility_date
        from public.project_retention_schedule_origins so
        join public.project_retention_release_schedules s on s.id = so.schedule_id
        where so.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and s.status <> 'cancelled'
      ) schedule_names on true
      left join lateral (
        select jsonb_build_object(
          'id', v.id,
          'state', v.state,
          'severity', v.severity,
          'isBlocking', v.is_blocking,
          'primaryType', v.primary_type
        ) as current_variance
        from public.retention_variances v
        where v.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
        limit 1
      ) variance on true
      left join lateral (
        select jsonb_build_object(
          'id', c.id,
          'caseSequence', c.case_sequence,
          'status', c.status
        ) as current_case
        from public.retention_legacy_reconciliation_cases c
        where c.project_id = p_project_id
          and c.status in ('draft', 'in_review', 'approved')
        order by c.case_sequence desc
        limit 1
      ) legacy_case on true
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_project_retention_register(uuid)
  from public, anon;
grant execute on function public.get_project_retention_register(uuid)
  to authenticated;

commit;
