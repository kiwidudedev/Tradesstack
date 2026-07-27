begin;

alter table public.organization_accounting_sync_jobs
  drop constraint organization_accounting_sync_jobs_job_kind_check;
alter table public.organization_accounting_sync_jobs
  add constraint organization_accounting_sync_jobs_job_kind_check check (
    job_kind in (
      'import_accounts', 'import_tax_rates', 'import_contacts', 'health_check',
      'xero.bill.export', 'xero.bill.refresh',
      'xero.sales_invoice.sync', 'xero.sales_invoice.refresh',
      'xero.sales_invoice.attachment',
      'xero.retention_claim.sync', 'xero.retention_claim.attachment',
      'xero.retention_claim.refresh',
      'xero.payment_claim.initial_push',
      'xero.payment_claim.initial_push.attachment',
      'xero.payment_claim.replacement',
      'xero.payment_claim.replacement.attachment',
      'xero.payment_claim.accounting_update',
      'xero.retention_claim.initial_push',
      'xero.retention_claim.initial_push.attachment',
      'xero.retention_claim.update',
      'xero.retention_claim.replacement',
      'xero.retention_claim.replacement.attachment'
    )
  );

create unique index
  organization_accounting_sync_jobs_active_payment_update_uidx
on public.organization_accounting_sync_jobs (
  organization_id,
  (request_payload->>'accountingRevisionId')
)
where queue_state in ('pending', 'claimed', 'retry_scheduled')
  and job_kind = 'xero.payment_claim.accounting_update';

create or replace function public.confirm_payment_claim_accounting_update(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_org uuid := (p_input->>'organizationId')::uuid;
  v_project uuid := (p_input->>'projectId')::uuid;
  v_claim uuid := (p_input->>'claimId')::uuid;
  v_actor uuid := (p_input->>'confirmedBy')::uuid;
  v_connection uuid := (p_input->>'connectionId')::uuid;
  v_tenant text := p_input->>'tenantId';
  v_claim_row public.project_claims%rowtype;
  v_proposal public.organization_accounting_push_proposals%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_previous public.organization_accounting_document_revisions%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_reservation public.organization_accounting_number_reservations%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_idempotency text;
  v_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Payment Claim accounting updates are server-only.';
  end if;
  if p_input->>'operation' <> 'ACCOUNTING_UPDATE' then
    raise exception 'The resolved Payment Claim operation is not an accounting update.';
  end if;
  if not private.phase2b_actor_has_push_permission(v_org, v_actor) then
    raise exception 'Payment Claim Push to Xero permission is required.';
  end if;
  if not exists (
    select 1
    from public.organization_accounting_phase2b_settings setting
    where setting.organization_id = v_org
      and setting.initial_payment_claim_push_enabled
  ) then
    raise exception 'Immutable Payment Claim Push to Xero is not enabled.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2645));
  select * into v_claim_row
  from public.project_claims claim
  where claim.id = v_claim
    and claim.organization_id = v_org
    and claim.project_id = v_project
  for update;
  if not found or v_claim_row.status <> 'Submitted' then
    raise exception 'The Payment Claim is no longer submitted.';
  end if;
  if v_claim_row.updated_at is distinct from
    (p_input->>'sourceOptimisticRevision')::timestamptz then
    raise exception 'The Payment Claim changed after the accounting preview was created.';
  end if;
  if not exists (
    select 1
    from public.organization_xero_connections connection
    where connection.id = v_connection
      and connection.organization_id = v_org
      and connection.tenant_id = v_tenant
      and connection.status = 'connected'
      and connection.scope @> array['accounting.invoices']::text[]
  ) then
    raise exception 'The Xero connection, tenant, or invoice scope changed.';
  end if;

  select * into v_proposal
  from public.organization_accounting_push_proposals proposal
  where proposal.id = (p_input->>'proposalId')::uuid
    and proposal.organization_id = v_org
    and proposal.project_id = v_project
    and proposal.source_document_type = 'project_claim'
    and proposal.source_document_id = v_claim;
  if not found
    or v_proposal.expires_at <= now()
    or v_proposal.operation <> 'ACCOUNTING_UPDATE'
    or v_proposal.preview_hash <> p_input->>'previewHash'
    or v_proposal.active_revision_id <>
      (p_input->>'previousRevisionId')::uuid
    or v_proposal.external_document_number <>
      p_input->>'externalDocumentNumber'
    or v_proposal.source_optimistic_revision::timestamptz is distinct from
      (p_input->>'sourceOptimisticRevision')::timestamptz
    or v_proposal.evidence_hashes->>'sourceEvidenceHash' <>
      p_input->>'sourceEvidenceHash'
    or v_proposal.evidence_hashes->>'commercialHash' <>
      p_input->>'commercialHash'
    or v_proposal.evidence_hashes->>'linesHash' <>
      p_input->>'linesHash'
    or v_proposal.evidence_hashes->>'dependencyHash' <>
      p_input->>'dependencyHash'
    or v_proposal.evidence_hashes->>'payloadHash' <>
      p_input->>'payloadHash' then
    raise exception 'The immutable Payment Claim amendment proposal is stale.';
  end if;

  select * into v_document
  from public.organization_accounting_documents document
  where document.id = v_proposal.accounting_document_id
    and document.organization_id = v_org
    and document.project_claim_id = v_claim
    and document.local_document_type = 'project_claim'
    and document.provider = 'xero'
  for update;
  if not found
    or v_document.integration_contract <> 'payment_claim_revision_v1'
    or v_document.accounting_connection_id <> v_connection
    or v_document.tenant_id <> v_tenant then
    raise exception 'The Payment Claim accounting document identity changed.';
  end if;

  -- A duplicate confirmation returns its original immutable successor before
  -- testing active jobs or predecessor activation. This remains idempotent
  -- while queued, while processing, and after successful activation.
  select * into v_revision
  from public.organization_accounting_document_revisions revision
  where revision.accounting_document_id = v_document.id
    and revision.confirmation_preview_hash = p_input->>'previewHash'
    and revision.revision_intent = 'direct_update'
  order by revision.revision_sequence
  limit 1;
  if found then
    select * into v_attempt
    from public.organization_accounting_revision_attempts attempt
    where attempt.accounting_revision_id = v_revision.id
      and attempt.attempt_intent = 'update'
    order by attempt.attempt_sequence
    limit 1;
    select job.id into v_job_id
    from public.organization_accounting_sync_jobs job
    where job.organization_id = v_org
      and job.job_kind = 'xero.payment_claim.accounting_update'
      and job.request_payload->>'accountingRevisionId' = v_revision.id::text
    order by job.created_at
    limit 1;
    if v_attempt.id is null or v_job_id is null then
      raise exception 'The existing Payment Claim amendment confirmation is incomplete.';
    end if;
    return jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attempt.id,
      'jobId', v_job_id,
      'invoiceNumber', v_revision.external_document_number,
      'revisionSequence', v_revision.revision_sequence,
      'status', case
        when v_revision.lifecycle_state = 'succeeded' then 'completed'
        when v_revision.lifecycle_state = 'processing' then 'processing'
        else 'queued'
      end
    );
  end if;

  select * into v_previous
  from public.organization_accounting_document_revisions revision
  where revision.id = v_document.active_accounting_revision_id
    and revision.id = (p_input->>'previousRevisionId')::uuid
    and revision.accounting_document_id = v_document.id
    and revision.lifecycle_state = 'succeeded'
  for update;
  if not found
    or v_previous.external_document_id <> p_input->>'previousInvoiceId'
    or v_previous.external_document_number <>
      p_input->>'previousInvoiceNumber'
    or v_document.external_document_id <> v_previous.external_document_id
    or v_document.external_document_number <>
      v_previous.external_document_number
    or p_input->>'externalDocumentNumber' <>
      v_previous.external_document_number
    or p_input->'payloadTemplate'->>'InvoiceNumber' <>
      v_previous.external_document_number then
    raise exception 'The active Payment Claim Xero identity changed.';
  end if;

  select * into v_projection
  from public.organization_accounting_projections projection
  where projection.accounting_document_id = v_document.id
    and projection.accounting_revision_id = v_previous.id
  for update;
  if not found
    or v_projection.normalized_invoice_status not in (
      'authorised', 'awaiting_payment'
    )
    or coalesce(v_projection.amount_paid_minor, 0) <> 0
    or coalesce(v_projection.amount_credited_minor, 0) <> 0
    or v_projection.divergent then
    raise exception 'The existing Xero invoice is not safely amendable.';
  end if;
  select * into v_observation
  from public.organization_accounting_remote_observations observation
  where observation.id = v_projection.remote_observation_id
    and observation.id = (p_input->>'previousObservationId')::uuid
    and observation.accounting_revision_id = v_previous.id
    and observation.external_document_id = v_previous.external_document_id
  for update;
  if not found
    or upper(coalesce(v_observation.raw_status, '')) <> 'AUTHORISED'
    or jsonb_array_length(
      coalesce(v_observation.raw_observation->'Payments', '[]'::jsonb)
    ) <> 0
    or jsonb_array_length(
      coalesce(v_observation.raw_observation->'CreditNotes', '[]'::jsonb)
    ) <> 0 then
    raise exception 'Payments, credits, or Xero state prevent this amendment.';
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
    raise exception 'An uncertain accounting attempt prevents this amendment.';
  end if;
  if exists (
    select 1
    from public.organization_accounting_sync_jobs job
    where job.organization_id = v_org
      and job.queue_state in ('pending', 'claimed', 'retry_scheduled')
      and job.request_payload->>'accountingDocumentId' = v_document.id::text
      and job.job_kind in (
        'xero.payment_claim.initial_push',
        'xero.payment_claim.replacement',
        'xero.payment_claim.accounting_update',
        'xero.sales_invoice.sync'
      )
  ) then
    raise exception 'Another Payment Claim accounting action is active.';
  end if;

  if p_input->'payloadTemplate'->>'Type' <> 'ACCREC'
    or p_input->'payloadTemplate'->>'Status' <> 'AUTHORISED' then
    raise exception 'The Payment Claim amendment payload is invalid.';
  end if;
  select * into v_reservation
  from public.organization_accounting_number_reservations reservation
  where reservation.id = v_previous.number_reservation_id
    and reservation.accounting_document_id = v_document.id
    and reservation.formatted_number = v_previous.external_document_number;
  if not found then
    raise exception 'The existing Payment Claim invoice number is not reserved.';
  end if;

  select * into v_revision
  from public.persist_confirmed_accounting_revision_phase2a(
    jsonb_build_object(
      'organizationId', v_org,
      'projectId', v_project,
      'accountingDocumentId', v_document.id,
      'sourceDocumentType', 'project_claim',
      'sourceDocumentId', v_claim,
      'revisionIntent', 'direct_update',
      'resolutionStrategy', 'update_existing',
      'previousRevisionId', v_previous.id,
      'provider', 'xero',
      'connectionId', v_connection,
      'tenantId', v_tenant,
      'numberReservationId', v_reservation.id,
      'externalDocumentNumber', v_previous.external_document_number,
      'commercialSnapshot', p_input->'commercialSnapshot',
      'contactSnapshot', p_input->'contactSnapshot',
      'routingSnapshot', p_input->'routingSnapshot',
      'taxSnapshot', p_input->'taxSnapshot',
      'attachmentSnapshot', jsonb_build_object(
        'required', false,
        'reason', 'same_invoice_accounting_update'
      ),
      'payloadSnapshot', p_input->'payloadTemplate',
      'canonicalSchemaVersion', p_input->>'canonicalSchemaVersion',
      'sourceEvidenceHash', p_input->>'sourceEvidenceHash',
      'commercialHash', p_input->>'commercialHash',
      'linesHash', p_input->>'linesHash',
      'payloadHash', p_input->>'payloadHash',
      'providerContentHash', p_input->>'payloadHash',
      'pdfHash', null,
      'currencyCode', 'NZD',
      'providerDocumentType', 'ACCREC',
      'requestedProviderStatus', 'AUTHORISED',
      'lineAmountType', 'Exclusive',
      'subtotalMinor', p_input->>'subtotalMinor',
      'taxMinor', p_input->>'taxMinor',
      'totalMinor', p_input->>'totalMinor',
      'confirmationPreviewHash', p_input->>'previewHash',
      'confirmedBy', v_actor,
      'confirmedAt', now(),
      'confirmationReason', 'Payment Claim amended after export',
      'correlationId', p_input->>'proposalId',
      'lines', p_input->'lines',
      'attachments', '[]'::jsonb
    )
  );
  v_idempotency := encode(digest(convert_to(
    'xero:payment_claim:accounting_update:' || v_revision.id,
    'UTF8'
  ), 'sha256'), 'hex');
  select * into v_attempt
  from public.create_accounting_revision_attempt_phase2a(
    v_revision.id,
    'update',
    v_idempotency,
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'previousRevisionId', v_previous.id,
      'externalDocumentId', v_previous.external_document_id,
      'externalDocumentNumber', v_previous.external_document_number,
      'payloadHash', p_input->>'payloadHash',
      'tenantId', v_tenant,
      'intent', 'direct_update'
    )
  );
  perform public.transition_accounting_revision_lifecycle_phase2a(
    v_revision.id, 'queued', null, null
  );
  insert into public.organization_accounting_sync_jobs(
    organization_id, provider, connection_id, job_kind, trigger_source,
    request_payload, result_summary, idempotency_key, max_attempts,
    created_by_user_id
  ) values (
    v_org, 'xero', v_connection,
    'xero.payment_claim.accounting_update', 'user_export',
    jsonb_build_object(
      'organizationId', v_org,
      'projectId', v_project,
      'claimId', v_claim,
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'successorRevisionId', v_revision.id,
      'previousRevisionId', v_previous.id,
      'attemptId', v_attempt.id,
      'proposalId', p_input->>'proposalId',
      'connectionId', v_connection,
      'externalDocumentId', v_previous.external_document_id,
      'externalDocumentNumber', v_previous.external_document_number,
      'tenantId', v_tenant,
      'intent', 'direct_update'
    ),
    '{}'::jsonb, v_idempotency, 5, v_actor
  ) returning id into v_job_id;
  update public.organization_accounting_documents
  set export_status = 'queued', updated_at = now()
  where id = v_document.id;
  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, event_evidence
  ) values (
    v_org, v_document.id, v_revision.id,
    'payment_claim_accounting_update_confirmed',
    jsonb_build_object(
      'proposalId', p_input->>'proposalId',
      'predecessorRevisionId', v_previous.id,
      'externalDocumentId', v_previous.external_document_id
    )
  );
  return jsonb_build_object(
    'accountingDocumentId', v_document.id,
    'accountingRevisionId', v_revision.id,
    'attemptId', v_attempt.id,
    'jobId', v_job_id,
    'invoiceNumber', v_revision.external_document_number,
    'revisionSequence', v_revision.revision_sequence,
    'status', 'queued'
  );
end;
$$;

create or replace function public.get_payment_claim_accounting_update_execution(
  p_revision_id uuid,
  p_attempt_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'document', to_jsonb(document),
    'revision', to_jsonb(revision),
    'previousRevision', to_jsonb(previous),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(line) order by line.sequence)
      from public.organization_accounting_revision_lines line
      where line.accounting_revision_id = revision.id
    ), '[]'::jsonb),
    'attempt', to_jsonb(attempt)
  )
  from public.organization_accounting_document_revisions revision
  join public.organization_accounting_documents document
    on document.id = revision.accounting_document_id
   and document.organization_id = revision.organization_id
  join public.organization_accounting_revision_attempts attempt
    on attempt.id = p_attempt_id
   and attempt.accounting_revision_id = revision.id
  join public.organization_accounting_document_revisions previous
    on previous.id = revision.previous_revision_id
  where revision.id = p_revision_id
    and revision.source_document_type = 'project_claim'
    and document.integration_contract = 'payment_claim_revision_v1';
$$;

create or replace function public.complete_payment_claim_accounting_update(
  p_attempt_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_previous public.organization_accounting_document_revisions%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_job public.organization_accounting_sync_jobs%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_finalized boolean;
begin
  select * into v_attempt
  from public.organization_accounting_revision_attempts
  where id = p_attempt_id
  for update;
  if not found then
    return false;
  end if;
  select * into v_revision
  from public.organization_accounting_document_revisions
  where id = v_attempt.accounting_revision_id
  for update;
  select * into v_previous
  from public.organization_accounting_document_revisions
  where id = v_revision.previous_revision_id
  for update;
  select * into v_document
  from public.organization_accounting_documents
  where id = v_revision.accounting_document_id
  for update;
  select * into v_job
  from public.organization_accounting_sync_jobs
  where id = nullif(p_result->>'jobId', '')::uuid
    and organization_id = v_revision.organization_id
    and job_kind = 'xero.payment_claim.accounting_update'
    and request_payload->>'accountingRevisionId' = v_revision.id::text
    and request_payload->>'attemptId' = v_attempt.id::text
  for update;
  if v_attempt.queue_state = 'succeeded' then
    return v_revision.lifecycle_state = 'succeeded'
      and v_document.active_accounting_revision_id = v_revision.id
      and v_job.queue_state = 'completed'
      and v_revision.external_document_id = p_result->>'externalDocumentId'
      and v_revision.external_document_number =
        p_result->>'externalDocumentNumber';
  end if;
  if v_attempt.queue_state <> 'claimed'
    or v_attempt.worker_id <> p_worker_id
    or v_attempt.lease_token <> p_lease_token
    or v_attempt.lease_expires_at < now()
    or v_job.queue_state <> 'claimed'
    or v_job.claimed_by <> p_worker_id
    or v_job.claim_expires_at < now() then
    return false;
  end if;
  if v_revision.source_document_type <> 'project_claim'
    or v_revision.revision_intent <> 'direct_update'
    or v_attempt.attempt_intent <> 'update'
    or v_document.integration_contract <> 'payment_claim_revision_v1'
    or v_document.active_accounting_revision_id <> v_previous.id
    or v_document.external_document_id <> v_previous.external_document_id
    or v_document.external_document_number <>
      v_previous.external_document_number
    or v_job.id is null
    or p_result->>'externalDocumentId' <>
      v_previous.external_document_id
    or p_result->>'externalDocumentNumber' <>
      v_previous.external_document_number
    or v_revision.external_document_number <>
      v_previous.external_document_number
    or (p_result->>'subtotalMinor')::bigint <> v_revision.subtotal_minor
    or (p_result->>'taxMinor')::bigint <> v_revision.tax_minor
    or (p_result->>'totalMinor')::bigint <> v_revision.total_minor then
    raise exception 'Verified Xero result does not match the immutable Payment Claim amendment.';
  end if;
  v_finalized := public.finalize_accounting_revision_attempt_phase2a(
    p_attempt_id,
    p_worker_id,
    p_lease_token,
    'succeeded',
    case when coalesce((p_result->>'recovered')::boolean, false)
      then 'recovered_authorised_invoice'
      else 'verified_authorised_invoice' end,
    'Xero exactly matched the immutable Payment Claim amendment revision.',
    p_result->'rawObservation'
  );
  if not v_finalized then return false; end if;
  update public.organization_accounting_documents
  set
    external_document_id = v_previous.external_document_id,
    external_document_number = v_previous.external_document_number,
    amount_exported = v_revision.total_minor::numeric / 100,
    tax_exported = v_revision.tax_minor::numeric / 100,
    exported_by = v_revision.confirmed_by,
    exported_at = now(),
    last_synced_at = now(),
    raw_external_status = 'AUTHORISED',
    normalized_external_status = 'awaiting_payment',
    amount_paid = 0,
    amount_due = v_revision.total_minor::numeric / 100,
    amount_credited = 0,
    export_status = 'exported',
    last_synced_hash = v_revision.commercial_snapshot->>'currentStateHash',
    last_error_code = null,
    last_error_message = null,
    last_status_sync_error = null,
    updated_at = now()
  where id = v_document.id;
  perform public.activate_successful_accounting_revision_phase2a(
    v_revision.id, v_previous.external_document_id
  );
  select * into v_observation
  from public.record_accounting_remote_observation_phase2a(
    jsonb_build_object(
      'organizationId', v_revision.organization_id,
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'provider', 'xero',
      'tenantId', v_revision.tenant_id,
      'externalDocumentId', v_previous.external_document_id,
      'providerUpdatedAt', p_result->>'providerUpdatedAt',
      'rawStatus', 'AUTHORISED',
      'normalizedStatus', 'authorised_unpaid',
      'normalizedInvoiceStatus', 'authorised',
      'normalizedPaymentStatus', 'unpaid',
      'contentHash', v_revision.provider_content_hash,
      'settlementHash', p_result->>'settlementHash',
      'amountPaidMinor', '0',
      'amountDueMinor', v_revision.total_minor::text,
      'amountCreditedMinor', '0',
      'rawObservation', p_result->'rawObservation',
      'correlationId', p_attempt_id::text
    )
  );
  select * into v_projection
  from public.organization_accounting_projections projection
  where projection.accounting_document_id = v_document.id
    and projection.accounting_revision_id = v_revision.id
    and projection.remote_observation_id = v_observation.id;
  update public.organization_accounting_sync_jobs
  set
    queue_state = 'completed',
    result_summary = jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'predecessorRevisionId', v_previous.id,
      'successorRevisionId', v_revision.id,
      'attemptId', v_attempt.id,
      'jobId', v_job.id,
      'observationId', v_observation.id,
      'projectionId', v_projection.id,
      'externalDocumentId', v_previous.external_document_id,
      'externalDocumentNumber', v_previous.external_document_number,
      'recovered', coalesce((p_result->>'recovered')::boolean, false)
    ),
    last_error = null,
    claimed_at = null,
    claimed_by = null,
    claim_expires_at = null,
    last_completed_at = now(),
    updated_at = now()
  where id = v_job.id;
  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, event_evidence
  ) values (
    v_revision.organization_id, v_document.id, v_revision.id,
    case when coalesce((p_result->>'recovered')::boolean, false)
      then 'payment_claim_accounting_update_recovered'
      else 'payment_claim_accounting_update_succeeded' end,
    jsonb_build_object(
      'predecessorRevisionId', v_previous.id,
      'externalDocumentId', v_previous.external_document_id,
      'externalDocumentNumber', v_previous.external_document_number
    )
  );
  return true;
end;
$$;

create or replace function public.confirm_payment_claim_push_phase2c(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.organization_accounting_push_proposals%rowtype;
begin
  select * into v_proposal
  from public.organization_accounting_push_proposals
  where id = (p_input->>'proposalId')::uuid
    and organization_id = (p_input->>'organizationId')::uuid
    and source_document_id = (p_input->>'claimId')::uuid
    and project_id = (p_input->>'projectId')::uuid;
  if not found
    or v_proposal.expires_at <= now()
    or v_proposal.source_document_type <> 'project_claim'
    or v_proposal.preview_hash <> p_input->>'previewHash'
    or v_proposal.operation <> p_input->>'operation'
    or v_proposal.external_document_number <>
      p_input->>'externalDocumentNumber'
    or v_proposal.source_optimistic_revision <>
      p_input->>'sourceOptimisticRevision'
    or v_proposal.active_revision_id is distinct from
      nullif(p_input->>'previousRevisionId', '')::uuid
    or v_proposal.evidence_hashes->>'sourceEvidenceHash' <>
      p_input->>'sourceEvidenceHash'
    or v_proposal.evidence_hashes->>'commercialHash' <>
      p_input->>'commercialHash'
    or v_proposal.evidence_hashes->>'linesHash' <> p_input->>'linesHash'
    or v_proposal.evidence_hashes->>'dependencyHash' <>
      p_input->>'dependencyHash'
    or v_proposal.evidence_hashes->>'payloadHash' <> p_input->>'payloadHash'
    or v_proposal.evidence_hashes->>'previewHash' <> p_input->>'previewHash'
    or (
      v_proposal.operation <> 'ACCOUNTING_UPDATE'
      and v_proposal.evidence_hashes->>'pdfHash' is distinct from
        p_input->>'pdfHash'
    ) then
    raise exception 'The immutable accounting proposal is missing, expired, or stale.';
  end if;
  if v_proposal.operation = 'INITIAL_EXPORT' then
    return public.confirm_payment_claim_initial_push_phase2b(p_input);
  elsif v_proposal.operation = 'REPLACEMENT_EXPORT' then
    return public.confirm_payment_claim_replacement_phase2c(p_input);
  elsif v_proposal.operation = 'ACCOUNTING_UPDATE' then
    return public.confirm_payment_claim_accounting_update(p_input);
  end if;
  raise exception 'The resolved accounting operation is not executable.';
end;
$$;

revoke all on function public.confirm_payment_claim_accounting_update(jsonb)
  from public, anon, authenticated;
revoke all on function public.get_payment_claim_accounting_update_execution(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.complete_payment_claim_accounting_update(uuid,text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.confirm_payment_claim_push_phase2c(jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_accounting_update(jsonb)
  to service_role;
grant execute on function public.get_payment_claim_accounting_update_execution(uuid,uuid)
  to service_role;
grant execute on function public.complete_payment_claim_accounting_update(uuid,text,uuid,jsonb)
  to service_role;
grant execute on function public.confirm_payment_claim_push_phase2c(jsonb)
  to service_role;

commit;
