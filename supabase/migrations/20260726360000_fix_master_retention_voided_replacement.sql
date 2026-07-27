begin;

-- The cumulative master Retention workflow must not fall back to the legacy
-- allocation/PDF confirmation function when its active Xero invoice is voided.
-- This replacement boundary reloads and locks the same structured master
-- evidence used by proposal construction, reserves RC-01-Rn atomically, and
-- creates no PDF, blob, or attachment evidence.
create or replace function public.confirm_master_retention_claim_replacement(
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
  v_replacement_sequence bigint;
  v_global_sequence bigint;
  v_idempotency text;
  v_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Master Retention replacement confirmation is server-only.';
  end if;
  if p_input->>'operation' <> 'REPLACEMENT_EXPORT' then
    raise exception 'XERO_STATE_CHANGED: The resolved master Retention operation is no longer replacement.';
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

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2636));
  select * into v_claim_row
  from public.retention_claims
  where id = v_claim
    and organization_id = v_org
    and project_id = v_project
    and master_role = 'master_retention_claim'
  for update;
  if not found
    or v_claim_row.status <> 'submitted'
    or v_claim_row.claim_number <> p_input->>'commercialClaimNumber' then
    raise exception 'RETENTION_MASTER_CHANGED: The submitted master Retention Claim identity changed.';
  end if;

  v_source := private.master_retention_claim_source(v_claim);
  if v_source is null then
    raise exception 'RETENTION_MASTER_CHANGED: The cumulative master Retention source is unavailable.';
  end if;
  v_source_hash := encode(
    digest(convert_to(v_source::text, 'UTF8'), 'sha256'), 'hex'
  );
  if v_source_hash <> p_input->>'retentionSourceEvidenceHash'
    or (v_source->'claim'->>'submittedAt')::timestamptz is distinct from
      (p_input->>'sourceOptimisticRevision')::timestamptz then
    raise exception 'RETENTION_MASTER_CHANGED: New Payment Claim retention appeared after preview.';
  end if;
  if jsonb_array_length(p_input->'lines') <>
      jsonb_array_length(v_source->'allocations')
    or exists (
      select 1
      from jsonb_array_elements(p_input->'lines') line
      where not exists (
        select 1
        from public.project_claims payment_claim
        where payment_claim.id = (line->>'originatingPaymentClaimId')::uuid
          and payment_claim.id = (line->>'sourceLineId')::uuid
          and payment_claim.organization_id = v_org
          and payment_claim.project_id = v_project
          and payment_claim.status = 'Submitted'
          and round(payment_claim.retention_withheld_amount * 100)::bigint =
            (line->>'lineAmountMinor')::bigint
      )
    ) then
    raise exception 'RETENTION_MASTER_CHANGED: Cumulative Retention origin evidence changed.';
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
  if not found or v_proposal.expires_at <= now() then
    raise exception 'PROPOSAL_EXPIRED: The master Retention replacement proposal is missing or expired.';
  end if;
  if v_proposal.preview_hash <> p_input->>'previewHash'
    or v_proposal.operation <> 'REPLACEMENT_EXPORT'
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
    raise exception 'XERO_STATE_CHANGED: The structured master Retention replacement proposal is stale.';
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
    or v_document.integration_contract <> 'retention_claim_revision_v1' then
    raise exception 'ACTIVE_REVISION_CHANGED: The master Retention accounting identity changed.';
  end if;

  -- A repeated confirmation of this exact preview reuses all durable
  -- identities and never allocates another replacement number.
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
      and attempt.attempt_intent = 'replace'
    order by attempt.attempt_sequence
    limit 1;
    select job.id into v_job_id
    from public.organization_accounting_sync_jobs job
    where job.organization_id = v_org
      and job.job_kind = 'xero.retention_claim.replacement'
      and job.request_payload->>'accountingRevisionId' = v_revision.id::text
    order by job.created_at
    limit 1;
    if v_attempt.id is null or v_job_id is null then
      raise exception 'The existing master Retention replacement confirmation is incomplete.';
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
  if not found
    or v_previous.external_document_id <> p_input->>'previousInvoiceId'
    or v_previous.external_document_number <>
      p_input->>'previousInvoiceNumber'
    or v_document.external_document_id <> v_previous.external_document_id
    or v_document.external_document_number <>
      v_previous.external_document_number then
    raise exception 'ACTIVE_REVISION_CHANGED: The active master Retention revision changed.';
  end if;

  select * into v_projection
  from public.organization_accounting_projections
  where accounting_document_id = v_document.id
    and accounting_revision_id = v_previous.id
  for update;
  if not found
    or v_projection.normalized_invoice_status not in ('voided', 'deleted')
    or coalesce(v_projection.amount_paid_minor, 0) <> 0
    or coalesce(v_projection.amount_credited_minor, 0) <> 0
    or v_projection.divergent then
    raise exception 'REPLACEMENT_NO_LONGER_ELIGIBLE: The previous invoice is not voided, unpaid, uncredited, and non-divergent.';
  end if;
  select * into v_observation
  from public.organization_accounting_remote_observations
  where id = v_projection.remote_observation_id
    and id = (p_input->>'previousObservationId')::uuid
    and accounting_revision_id = v_previous.id
    and external_document_id = v_previous.external_document_id;
  if not found
    or upper(coalesce(v_observation.raw_status, '')) not in ('VOIDED', 'DELETED')
    or jsonb_array_length(
      coalesce(v_observation.raw_observation->'Payments', '[]'::jsonb)
    ) <> 0
    or jsonb_array_length(
      coalesce(v_observation.raw_observation->'CreditNotes', '[]'::jsonb)
    ) <> 0 then
    raise exception 'XERO_STATE_CHANGED: The exact voided Xero observation changed.';
  end if;

  select coalesce(max(
    case
      when left(
        revision.external_document_number,
        char_length(v_claim_row.claim_number) + 2
      ) = v_claim_row.claim_number || '-R'
        and substring(
          revision.external_document_number
          from char_length(v_claim_row.claim_number) + 3
        ) ~ '^[1-9][0-9]*$'
      then substring(
        revision.external_document_number
        from char_length(v_claim_row.claim_number) + 3
      )::bigint
      else 0
    end
  ), 0) + 1 into v_replacement_sequence
  from public.organization_accounting_document_revisions revision
  where revision.accounting_document_id = v_document.id;
  v_number := v_claim_row.claim_number || '-R' || v_replacement_sequence;
  if p_input->>'externalDocumentNumber' <> v_number
    or p_input->'payloadTemplate'->>'InvoiceNumber' <> v_number
    or p_input->'payloadTemplate'->>'Type' <> 'ACCREC'
    or p_input->'payloadTemplate'->>'Status' <> 'AUTHORISED' then
    raise exception 'XERO_STATE_CHANGED: The replacement invoice identity changed.';
  end if;

  insert into public.organization_accounting_number_counters(
    organization_id, provider, tenant_id, document_class, last_sequence
  ) values (v_org, 'xero', v_tenant, 'sales_invoice', 1)
  on conflict (organization_id, provider, tenant_id, document_class)
  do update set
    last_sequence =
      public.organization_accounting_number_counters.last_sequence + 1,
    updated_at = now()
  returning last_sequence into v_global_sequence;
  insert into public.organization_accounting_number_reservations(
    organization_id, provider, tenant_id, document_class,
    sequence_number, formatted_number, accounting_document_id,
    source_document_type, source_document_id, reservation_reason, reserved_by
  ) values (
    v_org, 'xero', v_tenant, 'sales_invoice',
    v_global_sequence, v_number, v_document.id,
    'retention_claim', v_claim, 'replacement', v_actor
  ) returning * into v_reservation;

  select * into v_revision
  from public.persist_confirmed_accounting_revision_phase2a(
    jsonb_build_object(
      'organizationId', v_org,
      'projectId', v_project,
      'accountingDocumentId', v_document.id,
      'sourceDocumentType', 'retention_claim',
      'sourceDocumentId', v_claim,
      'revisionIntent', 'replacement',
      'resolutionStrategy', 'replacement',
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
        'required', false, 'evidenceModel', 'structured_only'
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
      'confirmationReason', 'Previous Xero invoice voided',
      'correlationId', p_input->>'proposalId',
      'lines', p_input->'lines',
      'attachments', '[]'::jsonb
    )
  );
  v_idempotency := encode(digest(convert_to(
    'xero:master_retention:replacement:' || v_revision.id,
    'UTF8'
  ), 'sha256'), 'hex');
  select * into v_attempt
  from public.create_accounting_revision_attempt_phase2a(
    v_revision.id,
    'replace',
    v_idempotency,
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'previousRevisionId', v_previous.id,
      'externalDocumentId', v_previous.external_document_id,
      'payloadHash', p_input->>'payloadHash',
      'tenantId', v_tenant,
      'intent', 'replacement'
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
    v_org, 'xero', v_connection, 'xero.retention_claim.replacement',
    'user_export',
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attempt.id,
      'previousRevisionId', v_previous.id,
      'externalDocumentId', v_previous.external_document_id,
      'payloadHash', p_input->>'payloadHash',
      'tenantId', v_tenant
    ),
    '{}'::jsonb, v_idempotency, 5, v_actor
  ) returning id into v_job_id;
  update public.organization_accounting_documents
  set export_status = 'queued', updated_at = now()
  where id = v_document.id;
  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    accounting_attempt_id, event_type, actor_user_id,
    correlation_id, event_evidence
  ) values (
    v_org, v_document.id, v_revision.id, v_attempt.id,
    'decision_resolved', v_actor, p_input->>'proposalId',
    jsonb_build_object(
      'operation', 'REPLACEMENT_EXPORT',
      'commercialClaimNumber', v_claim_row.claim_number,
      'previousInvoiceId', v_previous.external_document_id,
      'previousInvoiceNumber', v_previous.external_document_number,
      'replacementInvoiceNumber', v_number,
      'previousObservationId', v_observation.id
    )
  );
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

-- Replacement completion activates the newly created InvoiceID while keeping
-- the predecessor revision immutable and linked by previous_revision_id.
create or replace function public.complete_master_retention_claim_push(
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
  v_document public.organization_accounting_documents%rowtype;
  v_previous public.organization_accounting_document_revisions%rowtype;
  v_finalized boolean;
begin
  select * into v_attempt
  from public.organization_accounting_revision_attempts
  where id = p_attempt_id
  for update;
  if not found
    or v_attempt.queue_state <> 'claimed'
    or v_attempt.worker_id <> p_worker_id
    or v_attempt.lease_token <> p_lease_token
    or v_attempt.lease_expires_at < now() then
    return false;
  end if;
  select * into v_revision
  from public.organization_accounting_document_revisions
  where id = v_attempt.accounting_revision_id
  for update;
  select * into v_document
  from public.organization_accounting_documents
  where id = v_revision.accounting_document_id
  for update;
  if v_revision.source_document_type <> 'retention_claim'
    or v_revision.revision_intent not in (
      'initial_push', 'direct_update', 'replacement'
    )
    or p_result->>'externalDocumentNumber' <>
      v_revision.external_document_number
    or nullif(trim(p_result->>'externalDocumentId'), '') is null then
    raise exception 'Verified Xero result does not match the master Retention revision.';
  end if;
  if v_revision.revision_intent = 'initial_push' then
    if v_document.active_accounting_revision_id is not null then
      raise exception 'A master Retention revision is already active.';
    end if;
  else
    select * into v_previous
    from public.organization_accounting_document_revisions
    where id = v_revision.previous_revision_id
    for update;
    if not found
      or v_document.active_accounting_revision_id <> v_previous.id
      or v_document.external_document_id <> v_previous.external_document_id
      or v_document.external_document_number <>
        v_previous.external_document_number then
      raise exception 'The master Retention predecessor changed before activation.';
    end if;
    if v_revision.revision_intent = 'direct_update' and (
      p_result->>'externalDocumentId' <> v_previous.external_document_id
      or v_revision.external_document_number <>
        v_previous.external_document_number
    ) then
      raise exception 'The direct update did not preserve the Xero invoice identity.';
    end if;
    if v_revision.revision_intent = 'replacement' and (
      p_result->>'externalDocumentId' = v_previous.external_document_id
      or v_revision.external_document_number =
        v_previous.external_document_number
    ) then
      raise exception 'The replacement did not create a distinct Xero invoice identity.';
    end if;
  end if;
  v_finalized := public.finalize_accounting_revision_attempt_phase2a(
    p_attempt_id, p_worker_id, p_lease_token, 'succeeded',
    case when coalesce((p_result->>'recovered')::boolean, false)
      then 'recovered_authorised_invoice'
      else 'verified_authorised_invoice' end,
    'Xero exactly matched the immutable cumulative Retention revision.',
    p_result->'rawObservation'
  );
  if not v_finalized then return false; end if;
  update public.organization_accounting_documents
  set
    external_document_id = p_result->>'externalDocumentId',
    external_document_number = v_revision.external_document_number,
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
    v_revision.id, p_result->>'externalDocumentId'
  );
  perform public.record_accounting_remote_observation_phase2a(
    jsonb_build_object(
      'organizationId', v_revision.organization_id,
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'provider', 'xero',
      'tenantId', v_revision.tenant_id,
      'externalDocumentId', p_result->>'externalDocumentId',
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
  return true;
end;
$$;

revoke all on function public.confirm_master_retention_claim_replacement(jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_master_retention_claim_push(uuid,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_master_retention_claim_replacement(jsonb)
  to service_role;
grant execute on function public.complete_master_retention_claim_push(uuid,text,uuid,jsonb)
  to service_role;

commit;
