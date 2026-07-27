begin;

-- A replacement may legitimately use the same commercial source evidence as
-- its predecessor. Revision lineage and payload identity remain unique.
alter table public.organization_accounting_document_revisions
  drop constraint if exists accounting_revision_hash_unique;
create index if not exists accounting_revision_document_source_hash_idx
  on public.organization_accounting_document_revisions(accounting_document_id, source_evidence_hash);

alter table public.organization_accounting_number_reservations
  drop constraint if exists accounting_number_reservation_number_check;
alter table public.organization_accounting_number_reservations
  add constraint accounting_number_reservation_number_check check (
    formatted_number ~ '^TSI-[0-9]{8,}$'
    or formatted_number ~ '^.+-R[1-9][0-9]*$'
  );

create or replace function public.confirm_payment_claim_replacement_phase2c(p_input jsonb)
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
  v_document public.organization_accounting_documents%rowtype;
  v_previous public.organization_accounting_document_revisions%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_reservation public.organization_accounting_number_reservations%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_attachment public.organization_accounting_revision_attachments%rowtype;
  v_claim_row public.project_claims%rowtype;
  v_payload jsonb;
  v_pdf bytea;
  v_pdf_hash text;
  v_payload_hash text;
  v_number text;
  v_replacement_sequence bigint;
  v_global_sequence bigint;
  v_idempotency text;
  v_job_id uuid;
begin
  if p_input->>'operation' <> 'REPLACEMENT_EXPORT' then
    raise exception 'Server-resolved replacement operation is required.';
  end if;
  if not private.phase2b_actor_has_push_permission(v_org, v_actor) then
    raise exception 'Payment Claim Push to Xero permission is required.';
  end if;
  if not exists (
    select 1 from public.organization_accounting_phase2b_settings s
    where s.organization_id = v_org and s.initial_payment_claim_push_enabled
  ) then
    raise exception 'Immutable Payment Claim Push to Xero is not enabled.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2601));
  select * into v_claim_row from public.project_claims
  where id = v_claim and organization_id = v_org and project_id = v_project
  for update;
  if not found or v_claim_row.status <> 'Submitted' then
    raise exception 'Payment Claim is no longer in an exportable state.';
  end if;
  if v_claim_row.updated_at::text <> p_input->>'sourceOptimisticRevision' then
    raise exception 'The Payment Claim changed after the accounting preview was created.';
  end if;
  select * into v_document from public.organization_accounting_documents
  where organization_id = v_org and provider = 'xero'
    and local_document_type = 'project_claim' and project_claim_id = v_claim
  for update;
  if not found
    or v_document.integration_contract <> 'payment_claim_revision_v1'
    or v_document.accounting_connection_id <> v_connection
    or v_document.tenant_id <> v_tenant then
    raise exception 'The immutable Payment Claim accounting identity changed.';
  end if;
  select * into v_previous from public.organization_accounting_document_revisions
  where id = v_document.active_accounting_revision_id
    and id = (p_input->>'previousRevisionId')::uuid
    and organization_id = v_org
    and accounting_document_id = v_document.id
    and lifecycle_state = 'succeeded'
  for update;
  if not found
    or v_previous.external_document_id <> p_input->>'previousInvoiceId'
    or v_previous.external_document_number <> p_input->>'previousInvoiceNumber'
    or v_document.external_document_id <> v_previous.external_document_id
    or v_document.external_document_number <> v_previous.external_document_number then
    raise exception 'The active Xero invoice changed after preview.';
  end if;
  if not exists (
    select 1 from public.organization_xero_connections c
    where c.id = v_connection and c.organization_id = v_org
      and c.status = 'connected' and c.tenant_id = v_tenant
      and c.scope @> array['accounting.invoices']::text[]
  ) then
    raise exception 'The Xero connection, tenant, or invoice scope changed.';
  end if;

  select * into v_projection from public.organization_accounting_projections
  where accounting_document_id = v_document.id
    and accounting_revision_id = v_previous.id
  for update;
  if not found
    or v_projection.normalized_invoice_status not in ('voided', 'deleted')
    or coalesce(v_projection.amount_paid_minor, 0) <> 0
    or coalesce(v_projection.amount_credited_minor, 0) <> 0
    or v_projection.divergent then
    raise exception 'The previous Xero invoice is not safely replacement eligible.';
  end if;
  select * into v_observation from public.organization_accounting_remote_observations
  where id = v_projection.remote_observation_id
    and accounting_revision_id = v_previous.id
    and external_document_id = v_previous.external_document_id;
  if not found
    or jsonb_array_length(coalesce(v_observation.raw_observation->'Payments', '[]'::jsonb)) <> 0
    or jsonb_array_length(coalesce(v_observation.raw_observation->'CreditNotes', '[]'::jsonb)) <> 0 then
    raise exception 'Payments or credits prevent replacement.';
  end if;

  select coalesce(max(
    case
      when left(r.external_document_number, char_length(v_claim_row.claim_number) + 2)
          = v_claim_row.claim_number || '-R'
        and substring(r.external_document_number from char_length(v_claim_row.claim_number) + 3) ~ '^[1-9][0-9]*$'
      then substring(r.external_document_number from char_length(v_claim_row.claim_number) + 3)::bigint
      else 0
    end
  ), 0) + 1 into v_replacement_sequence
  from public.organization_accounting_document_revisions r
  where r.accounting_document_id = v_document.id;
  v_number := v_claim_row.claim_number || '-R' || v_replacement_sequence;
  if p_input->>'externalDocumentNumber' <> v_number
    or p_input#>>'{payloadTemplate,InvoiceNumber}' <> v_number
    or p_input#>>'{payloadTemplate,Type}' <> 'ACCREC'
    or p_input#>>'{payloadTemplate,Status}' <> 'AUTHORISED' then
    raise exception 'The confirmed replacement invoice identity is stale.';
  end if;

  insert into public.organization_accounting_number_counters(
    organization_id, provider, tenant_id, document_class, last_sequence
  ) values (v_org, 'xero', v_tenant, 'sales_invoice', 1)
  on conflict (organization_id, provider, tenant_id, document_class)
  do update set last_sequence = organization_accounting_number_counters.last_sequence + 1, updated_at = now()
  returning last_sequence into v_global_sequence;
  insert into public.organization_accounting_number_reservations(
    organization_id, provider, tenant_id, document_class, sequence_number,
    formatted_number, accounting_document_id, source_document_type,
    source_document_id, reservation_reason, reserved_by
  ) values (
    v_org, 'xero', v_tenant, 'sales_invoice', v_global_sequence,
    v_number, v_document.id, 'project_claim', v_claim, 'replacement', v_actor
  ) returning * into v_reservation;

  v_pdf := decode(p_input->>'pdfBase64', 'base64');
  v_pdf_hash := encode(digest(v_pdf, 'sha256'), 'hex');
  if v_pdf_hash <> p_input->>'pdfHash'
    or octet_length(v_pdf) <> (p_input->>'pdfByteSize')::bigint
    or substring(v_pdf from 1 for 4) <> decode('25504446', 'hex') then
    raise exception 'Confirmed replacement PDF evidence is invalid.';
  end if;
  v_payload := p_input->'payloadTemplate';
  v_payload_hash := encode(digest(v_payload::text, 'sha256'), 'hex');
  select * into v_revision from public.persist_confirmed_accounting_revision_phase2a(
    jsonb_build_object(
      'organizationId', v_org, 'projectId', v_project,
      'accountingDocumentId', v_document.id, 'sourceDocumentType', 'project_claim',
      'sourceDocumentId', v_claim, 'revisionIntent', 'replacement',
      'resolutionStrategy', 'replacement', 'previousRevisionId', v_previous.id,
      'provider', 'xero', 'connectionId', v_connection, 'tenantId', v_tenant,
      'numberReservationId', v_reservation.id, 'externalDocumentNumber', v_number,
      'commercialSnapshot', p_input->'commercialSnapshot',
      'contactSnapshot', p_input->'contactSnapshot',
      'routingSnapshot', p_input->'routingSnapshot',
      'taxSnapshot', p_input->'taxSnapshot',
      'attachmentSnapshot', jsonb_build_object('contentSha256', v_pdf_hash, 'byteSize', octet_length(v_pdf)),
      'payloadSnapshot', v_payload, 'canonicalSchemaVersion', p_input->>'canonicalSchemaVersion',
      'sourceEvidenceHash', p_input->>'sourceEvidenceHash',
      'commercialHash', p_input->>'commercialHash', 'linesHash', p_input->>'linesHash',
      'payloadHash', v_payload_hash, 'providerContentHash', v_payload_hash,
      'pdfHash', v_pdf_hash, 'currencyCode', 'NZD', 'providerDocumentType', 'ACCREC',
      'requestedProviderStatus', 'AUTHORISED', 'lineAmountType', 'Exclusive',
      'subtotalMinor', p_input->>'subtotalMinor', 'taxMinor', p_input->>'taxMinor',
      'totalMinor', p_input->>'totalMinor', 'confirmationPreviewHash', p_input->>'previewHash',
      'confirmedBy', v_actor, 'confirmedAt', now(), 'confirmationReason', 'Previous Xero invoice voided',
      'correlationId', p_input->>'proposalId', 'lines', p_input->'lines',
      'attachments', jsonb_build_array(jsonb_build_object(
        'sequence', 1, 'kind', 'claim_pdf', 'sourceDocumentId', v_claim,
        'filename', v_number || '-r' || lpad((v_previous.revision_sequence + 1)::text, 4, '0') || '.pdf',
        'contentType', 'application/pdf', 'byteSize', octet_length(v_pdf),
        'contentSha256', v_pdf_hash, 'storageBucket', 'accounting-revision-evidence',
        'storagePath', v_org || '/' || v_document.id || '/revision-' || (v_previous.revision_sequence + 1) || '/claim.pdf'
      ))
    )
  );
  select * into v_attachment from public.organization_accounting_revision_attachments
  where accounting_revision_id = v_revision.id and attachment_sequence = 1;
  insert into public.organization_accounting_revision_blobs(
    accounting_revision_id, organization_id, attachment_id, content_type,
    byte_size, content_sha256, content_bytes
  ) values (v_revision.id, v_org, v_attachment.id, 'application/pdf', octet_length(v_pdf), v_pdf_hash, v_pdf);

  v_idempotency := encode(digest(('xero:payment_claim:replacement:' || v_revision.id)::bytea, 'sha256'), 'hex');
  select * into v_attempt from public.create_accounting_revision_attempt_phase2a(
    v_revision.id, 'replace', v_idempotency,
    jsonb_build_object('accountingDocumentId', v_document.id, 'accountingRevisionId', v_revision.id,
      'previousRevisionId', v_previous.id, 'payloadHash', v_payload_hash, 'tenantId', v_tenant)
  );
  perform public.transition_accounting_revision_lifecycle_phase2a(v_revision.id, 'queued', null, null);
  insert into public.organization_accounting_sync_jobs(
    organization_id, provider, connection_id, job_kind, trigger_source,
    request_payload, result_summary, idempotency_key, max_attempts, created_by_user_id
  ) values (
    v_org, 'xero', v_connection, 'xero.payment_claim.replacement', 'user_export',
    jsonb_build_object('accountingDocumentId', v_document.id, 'accountingRevisionId', v_revision.id,
      'attemptId', v_attempt.id, 'previousRevisionId', v_previous.id),
    '{}'::jsonb, v_idempotency, 5, v_actor
  ) returning id into v_job_id;
  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    accounting_attempt_id, event_type, actor_user_id, correlation_id, event_evidence
  ) values
    (v_org, v_document.id, v_revision.id, v_attempt.id, 'decision_resolved', v_actor,
      p_input->>'proposalId', jsonb_build_object('operation', 'REPLACEMENT_EXPORT')),
    (v_org, v_document.id, v_revision.id, v_attempt.id, 'replacement_confirmed', v_actor,
      p_input->>'proposalId', jsonb_build_object('previousRevisionId', v_previous.id, 'invoiceNumber', v_number));
  return jsonb_build_object(
    'accountingDocumentId', v_document.id, 'accountingRevisionId', v_revision.id,
    'attemptId', v_attempt.id, 'jobId', v_job_id, 'invoiceNumber', v_number,
    'revisionSequence', v_revision.revision_sequence, 'pdfFilename', v_attachment.filename, 'status', 'queued'
  );
end;
$$;

create or replace function public.complete_payment_claim_replacement_phase2c(
  p_attempt_id uuid, p_worker_id text, p_lease_token uuid, p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_previous public.organization_accounting_document_revisions%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_finalized boolean;
  v_attachment_attempt public.organization_accounting_revision_attempts%rowtype;
  v_attachment_key text;
begin
  select * into v_attempt from public.organization_accounting_revision_attempts
  where id = p_attempt_id for update;
  if not found or v_attempt.queue_state <> 'claimed' or v_attempt.worker_id <> p_worker_id
    or v_attempt.lease_token <> p_lease_token or v_attempt.lease_expires_at < now() then return false; end if;
  select * into v_revision from public.organization_accounting_document_revisions
  where id = v_attempt.accounting_revision_id for update;
  select * into v_previous from public.organization_accounting_document_revisions
  where id = v_revision.previous_revision_id for update;
  select * into v_document from public.organization_accounting_documents
  where id = v_revision.accounting_document_id for update;
  if v_revision.revision_intent <> 'replacement' or v_attempt.attempt_intent <> 'replace'
    or v_document.active_accounting_revision_id <> v_previous.id
    or v_document.external_document_id <> v_previous.external_document_id
    or p_result->>'externalDocumentNumber' <> v_revision.external_document_number
    or nullif(trim(p_result->>'externalDocumentId'), '') is null then
    raise exception 'Verified Xero result does not match the immutable replacement identity.';
  end if;
  v_finalized := public.finalize_accounting_revision_attempt_phase2a(
    p_attempt_id, p_worker_id, p_lease_token, 'succeeded',
    'verified_authorised_replacement', 'Xero replacement exactly matched immutable revision.',
    p_result->'rawObservation'
  );
  if not v_finalized then return false; end if;
  update public.organization_accounting_documents set
    external_document_id = p_result->>'externalDocumentId',
    external_document_number = v_revision.external_document_number,
    amount_exported = v_revision.total_minor::numeric / 100,
    tax_exported = v_revision.tax_minor::numeric / 100,
    exported_by = v_revision.confirmed_by, exported_at = now(), last_synced_at = now(),
    raw_external_status = 'AUTHORISED', normalized_external_status = 'awaiting_payment',
    amount_paid = 0, amount_due = v_revision.total_minor::numeric / 100, amount_credited = 0,
    last_status_sync_error = null, export_status = 'exported',
    last_synced_hash = v_revision.commercial_snapshot->>'currentStateHash',
    last_error_code = null, last_error_message = null, updated_at = now()
  where id = v_document.id and active_accounting_revision_id = v_previous.id;
  perform public.activate_successful_accounting_revision_phase2a(v_revision.id, p_result->>'externalDocumentId');
  perform public.record_accounting_remote_observation_phase2a(jsonb_build_object(
    'organizationId', v_revision.organization_id, 'accountingDocumentId', v_document.id,
    'accountingRevisionId', v_revision.id, 'provider', 'xero', 'tenantId', v_revision.tenant_id,
    'externalDocumentId', p_result->>'externalDocumentId', 'providerUpdatedAt', p_result->>'providerUpdatedAt',
    'rawStatus', 'AUTHORISED', 'normalizedStatus', 'authorised_unpaid',
    'normalizedInvoiceStatus', 'authorised', 'normalizedPaymentStatus', 'unpaid',
    'contentHash', v_revision.provider_content_hash, 'settlementHash', p_result->>'settlementHash',
    'amountPaidMinor', '0', 'amountDueMinor', v_revision.total_minor::text, 'amountCreditedMinor', '0',
    'rawObservation', p_result->'rawObservation', 'correlationId', p_attempt_id::text
  ));
  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    accounting_attempt_id, event_type, actor_user_id, event_evidence
  ) values (
    v_revision.organization_id, v_document.id, v_revision.id, v_attempt.id,
    case when coalesce((p_result->>'recovered')::boolean, false)
      then 'replacement_recovered' else 'replacement_succeeded' end,
    v_revision.confirmed_by,
    jsonb_build_object('previousRevisionId', v_previous.id, 'externalDocumentId', p_result->>'externalDocumentId')
  );
  v_attachment_key := encode(digest(('xero:payment_claim:replacement:attachment:' || v_revision.id)::bytea, 'sha256'), 'hex');
  select * into v_attachment_attempt from public.create_accounting_revision_attempt_phase2a(
    v_revision.id, 'attach', v_attachment_key,
    jsonb_build_object('accountingDocumentId', v_document.id, 'accountingRevisionId', v_revision.id,
      'attachmentId', (select id from public.organization_accounting_revision_attachments
        where accounting_revision_id = v_revision.id and attachment_sequence = 1),
      'tenantId', v_revision.tenant_id, 'intent', 'replacement_attachment')
  );
  insert into public.organization_accounting_sync_jobs(
    organization_id, provider, connection_id, job_kind, trigger_source,
    request_payload, result_summary, idempotency_key, max_attempts, created_by_user_id
  ) values (
    v_revision.organization_id, 'xero', v_revision.connection_id,
    'xero.payment_claim.replacement.attachment', 'user_export',
    jsonb_build_object('accountingDocumentId', v_document.id, 'accountingRevisionId', v_revision.id,
      'attemptId', v_attachment_attempt.id, 'tenantId', v_revision.tenant_id, 'intent', 'replacement_attachment'),
    '{}'::jsonb, v_attachment_key, 5, v_revision.confirmed_by
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return true;
end;
$$;

revoke all on function public.confirm_payment_claim_replacement_phase2c(jsonb) from public, anon, authenticated;
revoke all on function public.complete_payment_claim_replacement_phase2c(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_replacement_phase2c(jsonb) to service_role;
grant execute on function public.complete_payment_claim_replacement_phase2c(uuid,text,uuid,jsonb) to service_role;

commit;
