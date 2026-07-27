begin;

alter table public.retention_claim_events
  drop constraint retention_claim_events_type_check;
alter table public.retention_claim_events
  add constraint retention_claim_events_type_check
    check (
      event_type in (
        'claim_created',
        'draft_updated',
        'allocation_added',
        'allocation_updated',
        'allocation_removed',
        'claim_submitted',
        'submission_rejected',
        'draft_cancelled',
        'invalid_transition_attempted',
        'permission_denied',
        'draft_document_saved',
        'draft_save_rejected',
        'successor_draft_created',
        'successor_draft_skipped',
        'master_dates_updated'
      )
    );

-- The current operational dates are accounting evidence. Historical revisions
-- continue to retain their own commercial and payload snapshots.
create or replace function private.master_retention_claim_source(
  p_retention_claim_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with master as (
    select *
    from public.retention_claims
    where id = p_retention_claim_id
      and master_role = 'master_retention_claim'
      and status = 'submitted'
  ),
  origins as (
    select
      payment_claim.*,
      row_number() over (
        order by payment_claim.claim_date nulls last,
          payment_claim.created_at, payment_claim.id
      )::integer as sequence
    from public.project_claims payment_claim
    join master on master.organization_id = payment_claim.organization_id
      and master.project_id = payment_claim.project_id
    where payment_claim.status = 'Submitted'
      and round(greatest(
        coalesce(payment_claim.retention_withheld_amount, 0), 0
      ), 2) > 0
  ),
  position as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object(
          'id', origin.id,
          'allocationSequence', origin.sequence,
          'originatingPaymentClaimId', origin.id,
          'allocationAmount',
            round(origin.retention_withheld_amount, 2),
          'originClaimNumberSnapshot', origin.claim_number,
          'originClaimDateSnapshot', origin.claim_date,
          'originClaimStatusSnapshot', origin.status,
          'originRetentionOwnedSnapshot',
            round(origin.retention_withheld_amount, 2),
          'retentionMethodSnapshot', origin.retention_method,
          'retentionRateSnapshot', origin.retention_percent,
          'retentionWithheldSnapshot',
            round(origin.retention_withheld_amount, 2),
          'retentionReleasedSnapshot', 0,
          'retentionBalanceSnapshot',
            round(origin.retention_withheld_amount, 2),
          'existingSubmittedAllocationBefore', 0,
          'remainingAfterAllocation', 0,
          'projectStateHashSnapshot', null,
          'originStateHashSnapshot', encode(digest(convert_to(
            jsonb_build_object(
              'id', origin.id,
              'claimNumber', origin.claim_number,
              'status', origin.status,
              'retention', round(origin.retention_withheld_amount, 2),
              'updatedAt', origin.updated_at
            )::text, 'UTF8'
          ), 'sha256'), 'hex'),
          'eligibilityStateHashSnapshot', null,
          'eligibilityScheduleIdsSnapshot', '[]'::jsonb,
          'submittedAt', origin.updated_at
        )
        order by origin.sequence
      ), '[]'::jsonb) as lines,
      coalesce(round(sum(origin.retention_withheld_amount), 2), 0) as subtotal,
      max(origin.updated_at) as latest_origin_at
    from origins origin
  ),
  evidence as (
    select
      master.*,
      position.lines,
      position.subtotal,
      greatest(
        master.submitted_at,
        master.updated_at,
        position.latest_origin_at
      ) as revised_at,
      encode(digest(convert_to(jsonb_build_object(
        'organizationId', master.organization_id,
        'projectId', master.project_id,
        'claimNumber', master.claim_number,
        'origins', position.lines,
        'subtotal', position.subtotal
      )::text, 'UTF8'), 'sha256'), 'hex') as state_hash
    from master cross join position
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'claim', jsonb_build_object(
      'id', evidence.id,
      'organizationId', evidence.organization_id,
      'projectId', evidence.project_id,
      'claimNumber', evidence.claim_number,
      'title', evidence.title,
      'reference', evidence.reference,
      'issueDate', evidence.issue_date,
      'dueDate', evidence.due_date,
      'status', 'submitted',
      'subtotalExclTax', evidence.subtotal,
      'submissionStateHash', evidence.state_hash,
      'submissionEligibilityStateHash', evidence.state_hash,
      'submittedBy', evidence.submitted_by,
      'submittedAt', evidence.revised_at
    ),
    'allocations', evidence.lines
  )
  from evidence;
$$;

create or replace function private.master_retention_date_edit_context(
  p_retention_claim_id uuid,
  p_lock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
  v_document public.organization_accounting_documents%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_payment_count integer := 0;
  v_credit_count integer := 0;
begin
  select claim.* into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;
  if not found then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'claim_not_found'
    );
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.claims.create',
    false
  );
  if not coalesce((v_context->>'succeeded')::boolean, false)
    or (v_context->>'organizationId')::uuid <> v_claim.organization_id then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', coalesce(v_context->>'errorCode', 'permission_denied')
    );
  end if;
  if v_claim.status <> 'submitted'
    or v_claim.master_role <> 'master_retention_claim' then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'not_submitted_master'
    );
  end if;

  if p_lock then
    perform pg_advisory_xact_lock(
      hashtextextended(v_claim.id::text, 2639)
    );
    select claim.* into v_claim
    from public.retention_claims claim
    where claim.id = p_retention_claim_id
      and claim.organization_id = (v_context->>'organizationId')::uuid
      and claim.status = 'submitted'
      and claim.master_role = 'master_retention_claim'
    for update;
    if not found then
      return jsonb_build_object(
        'succeeded', false,
        'errorCode', 'RETENTION_DATES_STALE',
        'reason', 'master_changed'
      );
    end if;
  end if;

  select document.* into v_document
  from public.organization_accounting_documents document
  where document.organization_id = v_claim.organization_id
    and document.retention_claim_id = v_claim.id
    and document.provider = 'xero'
    and document.local_document_type = 'retention_claim'
    and document.integration_contract = 'retention_claim_revision_v1'
  for update;
  if not found or v_document.active_accounting_revision_id is null then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'active_accounting_identity_missing'
    );
  end if;

  select revision.* into v_revision
  from public.organization_accounting_document_revisions revision
  where revision.id = v_document.active_accounting_revision_id
    and revision.organization_id = v_claim.organization_id
    and revision.project_id = v_claim.project_id
    and revision.accounting_document_id = v_document.id
    and revision.lifecycle_state = 'succeeded'
    and revision.external_document_id = v_document.external_document_id
    and revision.external_document_number =
      v_document.external_document_number
  for update;
  if not found then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'active_revision_not_stable'
    );
  end if;

  if not exists (
    select 1
    from public.organization_xero_connections connection
    where connection.id = v_revision.connection_id
      and connection.organization_id = v_claim.organization_id
      and connection.tenant_id = v_revision.tenant_id
      and connection.status = 'connected'
      and connection.scope @> array['accounting.invoices']::text[]
  ) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'connection_unavailable'
    );
  end if;

  if exists (
    select 1
    from public.organization_accounting_sync_jobs job
    where job.organization_id = v_claim.organization_id
      and job.provider = 'xero'
      and job.job_kind in (
        'xero.retention_claim.initial_push',
        'xero.retention_claim.update',
        'xero.retention_claim.replacement',
        'xero.retention_claim.refresh'
      )
      and job.queue_state in ('pending', 'claimed', 'retry_scheduled')
      and job.request_payload->>'accountingDocumentId' = v_document.id::text
  ) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'accounting_operation_processing'
    );
  end if;
  if exists (
    select 1
    from public.organization_accounting_revision_attempts attempt
    join public.organization_accounting_document_revisions revision
      on revision.id = attempt.accounting_revision_id
    where revision.accounting_document_id = v_document.id
      and attempt.attempt_intent in ('create', 'update', 'replace')
      and attempt.queue_state = 'attention_required'
  ) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'uncertain_accounting_result'
    );
  end if;

  select projection.* into v_projection
  from public.organization_accounting_projections projection
  where projection.accounting_document_id = v_document.id
    and projection.accounting_revision_id = v_revision.id
  for update;
  if not found
    or v_projection.normalized_invoice_status not in (
      'authorised', 'awaiting_payment'
    )
    or coalesce(v_projection.amount_paid_minor, 0) <> 0
    or coalesce(v_projection.amount_credited_minor, 0) <> 0
    or v_projection.divergent then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'invoice_not_safely_updateable'
    );
  end if;

  select observation.* into v_observation
  from public.organization_accounting_remote_observations observation
  where observation.id = v_projection.remote_observation_id
    and observation.accounting_revision_id = v_revision.id
    and observation.external_document_id = v_revision.external_document_id;
  if found then
    v_payment_count := case
      when jsonb_typeof(v_observation.raw_observation->'Payments') = 'array'
      then jsonb_array_length(v_observation.raw_observation->'Payments')
      else 0
    end;
    v_credit_count := case
      when jsonb_typeof(v_observation.raw_observation->'CreditNotes') = 'array'
      then jsonb_array_length(v_observation.raw_observation->'CreditNotes')
      else 0
    end;
  end if;
  if not found
    or upper(coalesce(v_observation.raw_status, '')) <> 'AUTHORISED'
    or v_observation.observed_at < now() - interval '24 hours'
    or v_payment_count <> 0
    or v_credit_count <> 0 then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATE_RESET_BLOCKED',
      'reason', 'provider_state_not_safely_updateable'
    );
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'organizationId', v_claim.organization_id,
    'projectId', v_claim.project_id,
    'actorUserId', v_context->>'actorUserId',
    'retentionClaimId', v_claim.id,
    'claimDate', v_claim.issue_date,
    'dueDate', v_claim.due_date,
    'optimisticRevision', v_claim.draft_revision,
    'activeAccountingRevisionId', v_revision.id,
    'invoiceId', v_revision.external_document_id,
    'invoiceNumber', v_revision.external_document_number
  );
end;
$$;

create or replace function public.reset_master_retention_claim_dates(
  p_retention_claim_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select private.master_retention_date_edit_context(
    p_retention_claim_id,
    false
  );
$$;

create or replace function public.update_master_retention_claim_dates(
  p_retention_claim_id uuid,
  p_claim_date date,
  p_due_date date,
  p_expected_revision bigint,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_context jsonb;
  v_claim public.retention_claims%rowtype;
  v_previous_claim_date date;
  v_previous_due_date date;
begin
  if p_claim_date is null or p_due_date is null
    or p_due_date < p_claim_date then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATES_INVALID'
    );
  end if;

  v_context := private.master_retention_date_edit_context(
    p_retention_claim_id,
    true
  );
  if not coalesce((v_context->>'succeeded')::boolean, false) then
    return v_context;
  end if;

  select claim.* into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id
    and claim.organization_id = (v_context->>'organizationId')::uuid
    and claim.project_id = (v_context->>'projectId')::uuid
    and claim.status = 'submitted'
    and claim.master_role = 'master_retention_claim'
  for update;
  if not found or v_claim.draft_revision <> p_expected_revision then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'RETENTION_DATES_STALE',
      'currentRevision', v_claim.draft_revision
    );
  end if;

  if v_claim.issue_date = p_claim_date
    and v_claim.due_date = p_due_date then
    return jsonb_build_object(
      'succeeded', true,
      'errorCode', 'RETENTION_DATES_UNCHANGED',
      'changed', false,
      'claimDate', v_claim.issue_date,
      'dueDate', v_claim.due_date,
      'optimisticRevision', v_claim.draft_revision
    );
  end if;

  v_previous_claim_date := v_claim.issue_date;
  v_previous_due_date := v_claim.due_date;
  perform set_config('app.retention_phase4_submission_write', 'true', true);
  update public.retention_claims
  set issue_date = p_claim_date,
      due_date = p_due_date,
      draft_revision = draft_revision + 1
  where id = v_claim.id
  returning * into v_claim;
  perform set_config('app.retention_phase4_submission_write', '', true);

  perform private.record_retention_claim_event(
    v_claim.organization_id,
    v_claim.project_id,
    v_claim.id,
    'master_dates_updated',
    'submitted',
    'submitted',
    (v_context->>'actorUserId')::uuid,
    'Master Retention Claim dates updated.',
    p_correlation_id,
    jsonb_build_object(
      'previousClaimDate', v_previous_claim_date,
      'claimDate', v_claim.issue_date,
      'previousDueDate', v_previous_due_date,
      'dueDate', v_claim.due_date,
      'activeAccountingRevisionId',
        v_context->>'activeAccountingRevisionId'
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'changed', true,
    'claimDate', v_claim.issue_date,
    'dueDate', v_claim.due_date,
    'optimisticRevision', v_claim.draft_revision,
    'activeAccountingRevisionId',
      v_context->>'activeAccountingRevisionId',
    'invoiceId', v_context->>'invoiceId',
    'invoiceNumber', v_context->>'invoiceNumber'
  );
end;
$$;

revoke all on function
  private.master_retention_date_edit_context(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.reset_master_retention_claim_dates(uuid)
  from public, anon;
revoke all on function public.update_master_retention_claim_dates(
  uuid, date, date, bigint, text
) from public, anon;
grant execute on function public.reset_master_retention_claim_dates(uuid)
  to authenticated, service_role;
grant execute on function public.update_master_retention_claim_dates(
  uuid, date, date, bigint, text
) to authenticated, service_role;

commit;
