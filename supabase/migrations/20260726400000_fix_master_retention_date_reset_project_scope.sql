begin;

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

revoke all on function
  private.master_retention_date_edit_context(uuid, boolean)
  from public, anon, authenticated, service_role;

commit;
