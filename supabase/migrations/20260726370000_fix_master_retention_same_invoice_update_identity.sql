begin;

create or replace function public.confirm_master_retention_claim_update(
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
  v_claim uuid := (p_input->>'retentionClaimId')::uuid;
  v_actor uuid := (p_input->>'confirmedBy')::uuid;
  v_connection uuid := (p_input->>'connectionId')::uuid;
  v_tenant text := p_input->>'tenantId';
  v_claim_row public.retention_claims%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_previous public.organization_accounting_document_revisions%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_proposal public.organization_accounting_push_proposals%rowtype;
  v_reservation public.organization_accounting_number_reservations%rowtype;
  v_source jsonb;
  v_source_hash text;
  v_number text;
  v_idempotency text;
  v_job_id uuid;
  v_payment_count integer := 0;
  v_credit_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Master Retention update confirmation is server-only.';
  end if;
  if p_input->>'operation' <> 'UPDATE_EXISTING_INVOICE' then
    raise exception 'The resolved master Retention operation is not an update.';
  end if;
  if not private.retention_phase2c_actor_can_push(v_org, v_actor) then
    raise exception 'Retention Claim Push to Xero permission is required.';
  end if;
  if not exists (
    select 1
    from public.organization_accounting_phase2b_settings setting
    where setting.organization_id = v_org
      and setting.retention_claim_immutable_xero_enabled
  ) then
    raise exception 'Immutable Retention Claim Push to Xero is not enabled.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2637));

  select * into v_claim_row
  from public.retention_claims
  where id = v_claim
    and organization_id = v_org
    and project_id = v_project
    and master_role = 'master_retention_claim'
  for update;
  if not found or v_claim_row.status <> 'submitted' then
    raise exception 'The master Retention Claim is no longer submitted.';
  end if;
  if v_claim_row.claim_number <> p_input->>'commercialClaimNumber' then
    raise exception 'The master Retention Claim identity changed.';
  end if;

  v_source := private.master_retention_claim_source(v_claim);
  if v_source is null then
    raise exception 'The cumulative master Retention source is unavailable.';
  end if;
  v_source_hash := encode(
    digest(convert_to(v_source::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_source_hash <> p_input->>'retentionSourceEvidenceHash'
    or (v_source->'claim'->>'submittedAt')::timestamptz is distinct from
      (p_input->>'sourceOptimisticRevision')::timestamptz then
    raise exception 'New Payment Claim retention appeared after preview.';
  end if;
  if jsonb_array_length(p_input->'lines') <>
      jsonb_array_length(v_source->'allocations')
    or exists (
      select 1
      from jsonb_array_elements(p_input->'lines') line
      where not exists (
        select 1
        from public.project_claims payment_claim
        where payment_claim.id =
          (line->>'originatingPaymentClaimId')::uuid
          and payment_claim.id = (line->>'sourceLineId')::uuid
          and payment_claim.organization_id = v_org
          and payment_claim.project_id = v_project
          and payment_claim.status = 'Submitted'
          and round(
            payment_claim.retention_withheld_amount * 100
          )::bigint = (line->>'lineAmountMinor')::bigint
      )
    ) then
    raise exception 'Cumulative Retention origin evidence changed.';
  end if;
  if not exists (
    select 1
    from public.organization_xero_connections connection
    where connection.id = v_connection
      and connection.organization_id = v_org
      and connection.status = 'connected'
      and connection.tenant_id = v_tenant
      and connection.scope @> array['accounting.invoices']::text[]
  ) then
    raise exception 'The Xero connection, tenant, or invoice scope changed.';
  end if;

  select * into v_proposal
  from public.organization_accounting_push_proposals
  where id = (p_input->>'proposalId')::uuid
    and organization_id = v_org
    and project_id = v_project
    and source_document_type = 'retention_claim'
    and source_document_id = v_claim;
  if not found
    or v_proposal.expires_at <= now()
    or v_proposal.preview_hash <> p_input->>'previewHash'
    or v_proposal.operation <> 'UPDATE_EXISTING_INVOICE'
    or v_proposal.external_document_number <>
      p_input->>'externalDocumentNumber'
    or v_proposal.source_optimistic_revision::timestamptz is distinct from
      (p_input->>'sourceOptimisticRevision')::timestamptz
    or v_proposal.evidence_hashes->>'sourceEvidenceHash' <>
      p_input->>'sourceEvidenceHash'
    or v_proposal.evidence_hashes->>'dependencyHash' <>
      p_input->>'dependencyHash'
    or v_proposal.evidence_hashes->>'commercialHash' <>
      p_input->>'commercialHash'
    or v_proposal.evidence_hashes->>'linesHash' <>
      p_input->>'linesHash'
    or v_proposal.evidence_hashes->>'payloadHash' <>
      p_input->>'payloadHash' then
    raise exception 'The structured master Retention update proposal is missing, expired, or stale.';
  end if;

  select * into v_document
  from public.organization_accounting_documents
  where organization_id = v_org
    and provider = 'xero'
    and local_document_type = 'retention_claim'
    and retention_claim_id = v_claim
  for update;
  if not found
    or v_document.accounting_connection_id <> v_connection
    or v_document.tenant_id <> v_tenant
    or v_document.integration_contract <> 'retention_claim_revision_v1'
    or v_document.active_accounting_revision_id is null then
    raise exception 'The master Retention accounting identity changed.';
  end if;

  select * into v_revision
  from public.organization_accounting_document_revisions revision
  where revision.accounting_document_id = v_document.id
    and revision.confirmation_preview_hash = p_input->>'previewHash'
    and revision.external_document_number =
      p_input->>'externalDocumentNumber'
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
      and job.job_kind = 'xero.retention_claim.update'
      and job.request_payload->>'accountingRevisionId' =
        v_revision.id::text
    order by job.created_at
    limit 1;
    if v_attempt.id is null or v_job_id is null then
      raise exception 'The existing master Retention update confirmation is incomplete.';
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
  from public.organization_accounting_document_revisions
  where id = v_document.active_accounting_revision_id
    and id = (p_input->>'previousRevisionId')::uuid
    and accounting_document_id = v_document.id
    and lifecycle_state = 'succeeded'
  for update;
  if not found then
    raise exception 'The active master Retention revision changed.';
  end if;

  v_number := v_previous.external_document_number;
  if nullif(trim(v_number), '') is null
    or v_previous.external_document_id <>
      p_input->>'previousInvoiceId'
    or v_document.external_document_id <>
      v_previous.external_document_id
    or v_document.external_document_number <> v_number
    or p_input->>'externalDocumentNumber' <> v_number
    or p_input->'payloadTemplate'->>'InvoiceNumber' <> v_number
    or p_input->'payloadTemplate'->>'Type' <> 'ACCREC'
    or p_input->'payloadTemplate'->>'Status' <> 'AUTHORISED' then
    raise exception 'The active master Retention Xero invoice changed.';
  end if;

  select * into v_projection
  from public.organization_accounting_projections
  where accounting_document_id = v_document.id
    and accounting_revision_id = v_previous.id
  for update;
  if not found
    or v_projection.normalized_invoice_status not in (
      'authorised',
      'awaiting_payment'
    )
    or coalesce(v_projection.amount_paid_minor, 0) <> 0
    or coalesce(v_projection.amount_credited_minor, 0) <> 0
    or v_projection.divergent then
    raise exception 'The existing Xero invoice is not safely updateable.';
  end if;

  select * into v_observation
  from public.organization_accounting_remote_observations
  where id = v_projection.remote_observation_id
    and accounting_revision_id = v_previous.id
    and external_document_id = v_previous.external_document_id;
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
    or v_observation.id <>
      (p_input->>'previousObservationId')::uuid
    or upper(coalesce(v_observation.raw_status, '')) <> 'AUTHORISED'
    or v_payment_count <> 0
    or v_credit_count <> 0 then
    raise exception 'Payments, credits, or Xero state prevent this update.';
  end if;

  select * into v_reservation
  from public.organization_accounting_number_reservations
  where id = v_previous.number_reservation_id
    and accounting_document_id = v_document.id
    and formatted_number = v_number;
  if not found then
    raise exception 'The stable master Retention invoice number is not reserved.';
  end if;

  select * into v_revision
  from public.persist_confirmed_accounting_revision_phase2a(
    jsonb_build_object(
      'organizationId', v_org,
      'projectId', v_project,
      'accountingDocumentId', v_document.id,
      'sourceDocumentType', 'retention_claim',
      'sourceDocumentId', v_claim,
      'revisionIntent', 'direct_update',
      'resolutionStrategy', 'update_existing',
      'previousRevisionId', v_previous.id,
      'provider', 'xero',
      'connectionId', v_connection,
      'tenantId', v_tenant,
      'numberReservationId', v_reservation.id,
      'externalDocumentNumber', v_number,
      'commercialSnapshot', p_input->'commercialSnapshot',
      'contactSnapshot', p_input->'contactSnapshot',
      'routingSnapshot', p_input->'routingSnapshot',
      'taxSnapshot', p_input->'taxSnapshot',
      'attachmentSnapshot', jsonb_build_object(
        'required', false,
        'evidenceModel', 'structured_only'
      ),
      'payloadSnapshot', p_input->'payloadTemplate',
      'canonicalSchemaVersion',
        p_input->>'canonicalSchemaVersion',
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
      'confirmationReason', 'New cumulative Retention added',
      'correlationId', p_input->>'proposalId',
      'lines', p_input->'lines',
      'attachments', '[]'::jsonb
    )
  );

  v_idempotency := encode(digest(convert_to(
    'xero:master_retention:update:' || v_revision.id,
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
      'externalDocumentNumber', v_number,
      'payloadHash', p_input->>'payloadHash',
      'tenantId', v_tenant,
      'intent', 'direct_update'
    )
  );
  perform public.transition_accounting_revision_lifecycle_phase2a(
    v_revision.id,
    'queued',
    null,
    null
  );
  insert into public.organization_accounting_sync_jobs(
    organization_id,
    provider,
    connection_id,
    job_kind,
    trigger_source,
    request_payload,
    result_summary,
    idempotency_key,
    max_attempts,
    created_by_user_id
  ) values (
    v_org,
    'xero',
    v_connection,
    'xero.retention_claim.update',
    'user_export',
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attempt.id,
      'previousRevisionId', v_previous.id,
      'externalDocumentId', v_previous.external_document_id,
      'externalDocumentNumber', v_number,
      'payloadHash', p_input->>'payloadHash',
      'tenantId', v_tenant
    ),
    '{}'::jsonb,
    v_idempotency,
    5,
    v_actor
  )
  returning id into v_job_id;

  update public.organization_accounting_documents
  set export_status = 'queued',
      updated_at = now()
  where id = v_document.id;

  return jsonb_build_object(
    'accountingDocumentId', v_document.id,
    'accountingRevisionId', v_revision.id,
    'attemptId', v_attempt.id,
    'jobId', v_job_id,
    'invoiceNumber', v_number,
    'revisionSequence', v_revision.revision_sequence,
    'status', 'queued'
  );
end;
$$;

revoke all on function public.confirm_master_retention_claim_update(jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_master_retention_claim_update(jsonb)
  to service_role;

commit;
