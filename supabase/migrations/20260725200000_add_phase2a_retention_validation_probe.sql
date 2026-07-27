begin;

create or replace function public.probe_retention_ownership_phase2a(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  organization_name text;
  connection public.organization_xero_connections%rowtype;
  native_project_id uuid := gen_random_uuid();
  legacy_project_id uuid := gen_random_uuid();
  unresolved_project_id uuid := gen_random_uuid();
  native_origin_id uuid := gen_random_uuid();
  legacy_origin_id uuid := gen_random_uuid();
  unresolved_origin_id uuid := gen_random_uuid();
  submitted_claim_id uuid := gen_random_uuid();
  draft_claim_id uuid := gen_random_uuid();
  submitted_allocation_id uuid := gen_random_uuid();
  reconciliation_id uuid := gen_random_uuid();
  legacy_case_id uuid := gen_random_uuid();
  legacy_source_id uuid := gen_random_uuid();
  now_value timestamptz := now();
  legacy_raw jsonb;
  result jsonb;
  rollback_detail text;
begin
  select o.name into organization_name
  from public.organizations o
  where o.id = p_organization_id;
  if organization_name is null
    or organization_name not like '__phase2a_verification__%'
    or not exists (
      select 1 from auth.users u where u.id = p_actor_user_id
    ) then
    raise exception 'Retention probe accepts only synthetic Phase 2A fixtures.';
  end if;
  select * into connection
  from public.organization_xero_connections c
  where c.organization_id = p_organization_id
  limit 1;
  if connection.id is null then
    raise exception 'Synthetic Xero connection is required for the failed-export fixture.';
  end if;

  begin
    insert into public.organization_projects(
      id, organization_id, created_by, name, slug
    ) values
      (
        native_project_id, p_organization_id, p_actor_user_id,
        'Phase 2A native retention probe', 'phase2a-native-' || native_project_id
      ),
      (
        legacy_project_id, p_organization_id, p_actor_user_id,
        'Phase 2A legacy retention probe', 'phase2a-legacy-' || legacy_project_id
      ),
      (
        unresolved_project_id, p_organization_id, p_actor_user_id,
        'Phase 2A unresolved retention probe',
        'phase2a-unresolved-' || unresolved_project_id
      );

    insert into public.project_claims(
      id, organization_id, project_id, created_by, claim_number, claim_title,
      status, claim_amount, retention_percent, retention_withheld_amount,
      retention_released_amount, retention_held_to_date,
      retention_released_to_date, retention_balance
    ) values
      (
        native_origin_id, p_organization_id, native_project_id, p_actor_user_id,
        'PC-NATIVE', 'Native retention ownership', 'Submitted', 10000,
        10, 1000, 0, 1000, 0, 1000
      ),
      (
        legacy_origin_id, p_organization_id, legacy_project_id, p_actor_user_id,
        'PC-LEGACY', 'Approved legacy retention ownership', 'Submitted', 10000,
        10, 1000, 400, 1000, 400, 600
      ),
      (
        unresolved_origin_id, p_organization_id, unresolved_project_id,
        p_actor_user_id, 'PC-UNRESOLVED',
        'Unresolved legacy retention ownership', 'Submitted', 10000,
        10, 1000, 300, 1000, 300, 700
      );

    insert into public.retention_claims(
      id, organization_id, project_id, claim_number, title, status,
      created_by
    ) values (
      submitted_claim_id, p_organization_id, native_project_id,
      'RC-SUBMITTED', 'Submitted native commitment', 'draft', p_actor_user_id
    );
    insert into public.retention_claims(
      id, organization_id, project_id, claim_number, title, status,
      created_by
    ) values (
      draft_claim_id, p_organization_id, native_project_id,
      'RC-DRAFT', 'Draft allocation diagnostic', 'draft', p_actor_user_id
    );

    insert into public.retention_claim_allocations(
      id, organization_id, project_id, retention_claim_id,
      originating_payment_claim_id, allocation_sequence, allocation_amount,
      draft_origin_state_hash, draft_origin_updated_at,
      draft_origin_retention_owned, origin_claim_number_snapshot,
      origin_claim_status_snapshot, origin_claim_created_at_snapshot,
      origin_claim_updated_at_snapshot, retention_method_snapshot,
      retention_rate_snapshot, retention_withheld_snapshot,
      retention_released_snapshot, retention_held_to_date_snapshot,
      retention_released_to_date_snapshot, retention_balance_snapshot,
      existing_submitted_allocation_before, remaining_after_allocation,
      gross_claim_amount_snapshot, net_claim_excl_gst_snapshot,
      gst_amount_snapshot, total_payable_snapshot,
      project_state_hash_snapshot, origin_state_hash_snapshot,
      submitted_by, submitted_at, created_by
    ) values (
      submitted_allocation_id, p_organization_id, native_project_id,
      submitted_claim_id, native_origin_id, 1, 600,
      repeat('b', 64), now_value, 1000, 'PC-NATIVE', 'Submitted',
      now_value, now_value, 'flat', 10, 1000, 0, 1000, 0, 1000,
      0, 400, 10000, 10000, 1500, 11500,
      repeat('c', 64), repeat('d', 64),
      p_actor_user_id, now_value, p_actor_user_id
    );
    insert into public.retention_claim_allocations(
      organization_id, project_id, retention_claim_id,
      originating_payment_claim_id, allocation_sequence, allocation_amount,
      draft_origin_state_hash, draft_origin_updated_at,
      draft_origin_retention_owned, created_by
    ) values (
      p_organization_id, native_project_id, draft_claim_id,
      native_origin_id, 1, 100, repeat('e', 64), now_value, 1000,
      p_actor_user_id
    );
    update public.retention_claims set
      status = 'submitted',
      subtotal_excl_tax = 600,
      submission_state_hash = repeat('a', 64),
      submitted_by = p_actor_user_id,
      submitted_at = now_value
    where id = submitted_claim_id;

    -- A failed accounting document is diagnostic only. The submitted
    -- allocation remains committed independently of export status.
    insert into public.organization_accounting_documents(
      organization_id, accounting_connection_id, provider, tenant_id,
      local_document_type, local_document_id, project_claim_id,
      retention_claim_id, export_status, last_error_code, last_error_message
    ) values (
      p_organization_id, connection.id, 'xero', connection.tenant_id,
      'retention_claim', null, null, submitted_claim_id, 'failed',
      'synthetic_failure', 'Synthetic failed export'
    );

    result := jsonb_build_object(
      'nativeAboveCommitment', public.evaluate_retention_ownership_phase2a(
        p_organization_id, native_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', native_origin_id,
          'proposedOwnedMinor', 80000,
          'proposedReleaseMinor', 0
        ))
      ),
      'nativeEqualCommitment', public.evaluate_retention_ownership_phase2a(
        p_organization_id, native_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', native_origin_id,
          'proposedOwnedMinor', 60000,
          'proposedReleaseMinor', 0
        ))
      ),
      'nativeBelowCommitment', public.evaluate_retention_ownership_phase2a(
        p_organization_id, native_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', native_origin_id,
          'proposedOwnedMinor', 50000,
          'proposedReleaseMinor', 0
        ))
      ),
      'duplicateRelease', public.evaluate_retention_ownership_phase2a(
        p_organization_id, native_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', native_origin_id,
          'proposedOwnedMinor', 80000,
          'proposedReleaseMinor', 10000
        ))
      )
    );

    insert into public.retention_claim_payment_reconciliations(
      id, organization_id, project_id, retention_claim_id,
      reconciliation_sequence, source, payment_status, projection_applied,
      paid_amount_excl_tax, outstanding_amount_excl_tax, fully_paid_at,
      source_evidence_hash, actor_user_id
    ) values (
      reconciliation_id, p_organization_id, native_project_id,
      submitted_claim_id, 1, 'manual', 'paid', true,
      600, 0, now_value, repeat('f', 64), p_actor_user_id
    );
    insert into public.retention_claim_payment_attributions(
      organization_id, project_id, retention_claim_id,
      payment_reconciliation_id, retention_claim_allocation_id,
      originating_payment_claim_id, allocation_sequence,
      allocation_amount_snapshot, paid_amount, floor_paid_amount,
      residual_cent_awarded, remainder_numerator
    ) values (
      p_organization_id, native_project_id, submitted_claim_id,
      reconciliation_id, submitted_allocation_id, native_origin_id, 1,
      600, 600, 600, false, 0
    );
    result := result || jsonb_build_object(
      'nativeAfterPaid', public.evaluate_retention_ownership_phase2a(
        p_organization_id, native_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', native_origin_id,
          'proposedOwnedMinor', 80000,
          'proposedReleaseMinor', 0
        ))
      )
    );

    legacy_raw := private.retention_legacy_source_state(legacy_project_id);
    perform set_config('app.retention_phase6_internal_write', 'true', true);
    insert into public.retention_legacy_reconciliation_cases(
      id, organization_id, project_id, case_sequence, status, revision,
      position_state_hash, source_fingerprint, total_legacy_released,
      total_allocated, source_count, allocation_count,
      submitted_by, submitted_at, approved_by, approved_at, created_by
    ) values (
      legacy_case_id, p_organization_id, legacy_project_id, 1, 'approved', 1,
      legacy_raw->>'stateHash', legacy_raw->>'sourceFingerprint',
      (legacy_raw->>'totalLegacyRetentionReleased')::numeric,
      400, 1, 1, p_actor_user_id, now_value,
      p_actor_user_id, now_value, p_actor_user_id
    );
    insert into public.retention_legacy_release_sources(
      id, organization_id, project_id, reconciliation_case_id,
      source_payment_claim_id, source_sequence, claim_number_snapshot,
      claim_status_snapshot, claim_created_at_snapshot,
      claim_updated_at_snapshot, retention_released_amount_snapshot,
      source_origin_state_hash
    ) values (
      legacy_source_id, p_organization_id, legacy_project_id, legacy_case_id,
      legacy_origin_id, 1, 'PC-LEGACY', 'Submitted', now_value, now_value,
      400, repeat('1', 64)
    );
    insert into public.retention_legacy_release_allocations(
      organization_id, project_id, reconciliation_case_id,
      legacy_release_source_id, originating_payment_claim_id,
      allocation_sequence, allocation_amount,
      origin_claim_number_snapshot, origin_claim_status_snapshot,
      origin_claim_created_at_snapshot, origin_claim_updated_at_snapshot,
      origin_retention_owned_snapshot, origin_state_hash_snapshot,
      position_state_hash_snapshot, approved_by, approved_at, created_by
    ) values (
      p_organization_id, legacy_project_id, legacy_case_id, legacy_source_id,
      legacy_origin_id, 1, 400, 'PC-LEGACY', 'Submitted',
      now_value, now_value, 1000, repeat('2', 64),
      legacy_raw->>'stateHash', p_actor_user_id, now_value, p_actor_user_id
    );
    perform set_config('app.retention_phase6_internal_write', '', true);

    result := result || jsonb_build_object(
      'approvedLegacyAboveCommitment', public.evaluate_retention_ownership_phase2a(
        p_organization_id, legacy_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', legacy_origin_id,
          'proposedOwnedMinor', 50000,
          'proposedReleaseMinor', 0
        ))
      ),
      'approvedLegacyEqualCommitment', public.evaluate_retention_ownership_phase2a(
        p_organization_id, legacy_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', legacy_origin_id,
          'proposedOwnedMinor', 40000,
          'proposedReleaseMinor', 0
        ))
      ),
      'approvedLegacyBelowCommitment', public.evaluate_retention_ownership_phase2a(
        p_organization_id, legacy_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', legacy_origin_id,
          'proposedOwnedMinor', 30000,
          'proposedReleaseMinor', 0
        ))
      ),
      'unresolvedLegacy', public.evaluate_retention_ownership_phase2a(
        p_organization_id, unresolved_project_id,
        jsonb_build_array(jsonb_build_object(
          'originId', unresolved_origin_id,
          'proposedOwnedMinor', 70000,
          'proposedReleaseMinor', 0
        ))
      )
    );

    raise exception 'rollback_phase2a_retention_probe'
      using errcode = 'P2001', detail = result::text;
  exception when sqlstate 'P2001' then
    get stacked diagnostics rollback_detail = pg_exception_detail;
    return rollback_detail::jsonb;
  end;
end;
$$;

revoke all on function public.probe_retention_ownership_phase2a(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.probe_retention_ownership_phase2a(uuid,uuid)
to service_role;

commit;
