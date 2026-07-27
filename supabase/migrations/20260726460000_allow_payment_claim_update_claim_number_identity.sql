begin;

-- Payment Claim revisions use the commercial claim number as InvoiceNumber and
-- intentionally do not consume the dormant TSI reservation sequence. Extend
-- that existing identity rule from the initial revision to a same-invoice
-- direct update while retaining exact predecessor and claim-number checks.
create or replace function public.enforce_phase2a_revision_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  document public.organization_accounting_documents%rowtype;
  previous_revision public.organization_accounting_document_revisions%rowtype;
  reservation public.organization_accounting_number_reservations%rowtype;
  resolved_project_id uuid;
  source_claim_number text;
begin
  select * into document
  from public.organization_accounting_documents d
  where d.id = new.accounting_document_id;
  if not found
    or document.organization_id <> new.organization_id
    or document.provider <> new.provider
    or document.tenant_id <> new.tenant_id
    or document.accounting_connection_id <> new.connection_id
    or document.local_document_type <> new.source_document_type
    or coalesce(
      document.project_claim_id,
      document.retention_claim_id,
      document.local_document_id
    ) <> new.source_document_id then
    raise exception 'Accounting revision identity does not match its stable document.'
      using errcode = '23514';
  end if;

  if new.source_document_type = 'project_claim' then
    select c.project_id, c.claim_number
      into resolved_project_id, source_claim_number
    from public.project_claims c
    where c.id = new.source_document_id
      and c.organization_id = new.organization_id;
  elsif new.source_document_type = 'retention_claim' then
    select c.project_id into resolved_project_id
    from public.retention_claims c
    where c.id = new.source_document_id
      and c.organization_id = new.organization_id;
  end if;
  if new.source_document_type in ('project_claim', 'retention_claim')
    and (resolved_project_id is null or new.project_id is distinct from resolved_project_id)
  then
    raise exception 'Accounting revision project does not match its source claim.'
      using errcode = '23514';
  end if;

  if new.revision_sequence = 1 then
    if new.previous_revision_id is not null then
      raise exception 'First accounting revision cannot have a predecessor.'
        using errcode = '23514';
    end if;
  else
    select * into previous_revision
    from public.organization_accounting_document_revisions r
    where r.id = new.previous_revision_id;
    if not found
      or previous_revision.accounting_document_id <> new.accounting_document_id
      or previous_revision.organization_id <> new.organization_id
      or previous_revision.revision_sequence <> new.revision_sequence - 1 then
      raise exception 'Accounting revision predecessor must be the prior revision of the same document.'
        using errcode = '23514';
    end if;
  end if;

  if new.source_document_type = 'project_claim'
    and new.revision_intent = 'legacy_import'
    and new.resolution_strategy = 'legacy_preservation'
    and new.number_reservation_id is null then
    if nullif(trim(source_claim_number), '') is null
      or new.external_document_number <> source_claim_number
      or nullif(trim(new.external_document_id), '') is null then
      raise exception 'Legacy Payment Claim identity must preserve its source claim number and Xero InvoiceID.'
        using errcode = '23514';
    end if;
  elsif new.source_document_type = 'project_claim'
    and document.integration_contract = 'payment_claim_revision_v1'
    and new.revision_intent = 'initial_push'
    and new.number_reservation_id is null then
    if nullif(trim(source_claim_number), '') is null
      or new.external_document_number <> source_claim_number then
      raise exception 'Phase 2B Payment Claim revision number must equal its source claim number.'
        using errcode = '23514';
    end if;
  elsif new.source_document_type = 'project_claim'
    and document.integration_contract = 'payment_claim_revision_v1'
    and new.revision_intent = 'direct_update'
    and new.resolution_strategy = 'update_existing'
    and new.number_reservation_id is null then
    if nullif(trim(source_claim_number), '') is null
      or new.external_document_number <> source_claim_number
      or previous_revision.id is null
      or previous_revision.external_document_number <> source_claim_number
      or previous_revision.number_reservation_id is not null then
      raise exception 'Payment Claim update must preserve its reservation-free claim-number identity.'
        using errcode = '23514';
    end if;
  elsif new.source_document_type in ('project_claim', 'retention_claim') then
    select * into reservation
    from public.organization_accounting_number_reservations n
    where n.id = new.number_reservation_id;
    if not found
      or reservation.organization_id <> new.organization_id
      or reservation.provider <> new.provider
      or reservation.tenant_id <> new.tenant_id
      or reservation.accounting_document_id <> new.accounting_document_id
      or reservation.source_document_type <> new.source_document_type
      or reservation.source_document_id <> new.source_document_id
      or reservation.formatted_number <> new.external_document_number then
      raise exception 'Accounting revision number reservation does not match its tenant and document.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

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
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_payment_count integer := 0;
  v_credit_count integer := 0;
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
  if v_previous.number_reservation_id is null then
    if v_previous.revision_intent not in ('initial_push', 'direct_update')
      or v_previous.external_document_number <> v_claim_row.claim_number then
      raise exception 'The active Payment Claim number identity changed.';
    end if;
  elsif not exists (
    select 1
    from public.organization_accounting_number_reservations reservation
    where reservation.id = v_previous.number_reservation_id
      and reservation.accounting_document_id = v_document.id
      and reservation.formatted_number = v_previous.external_document_number
  ) then
    raise exception 'The existing Payment Claim invoice number reservation changed.';
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
    or v_payment_count <> 0
    or v_credit_count <> 0 then
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
      'numberReservationId', v_previous.number_reservation_id,
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

revoke all on function public.confirm_payment_claim_accounting_update(jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_accounting_update(jsonb)
  to service_role;

create or replace function public.persist_confirmed_accounting_revision_phase2a(
  p_input jsonb
)
returns public.organization_accounting_document_revisions
language plpgsql security definer set search_path = public
as $$
declare
  document public.organization_accounting_documents%rowtype;
  reservation public.organization_accounting_number_reservations%rowtype;
  previous_revision public.organization_accounting_document_revisions%rowtype;
  source_claim_number text;
  revision public.organization_accounting_document_revisions%rowtype;
  line jsonb;
  attachment jsonb;
  next_sequence bigint;
  line_subtotal bigint := 0;
  line_tax bigint := 0;
  reservation_free_payment_update boolean := false;
begin
  select * into document
  from public.organization_accounting_documents
  where id = (p_input->>'accountingDocumentId')::uuid
    and organization_id = (p_input->>'organizationId')::uuid
  for update;
  if not found then raise exception 'Accounting document not found in organization.'; end if;
  if document.provider <> p_input->>'provider'
    or document.tenant_id <> p_input->>'tenantId'
    or document.accounting_connection_id <> (p_input->>'connectionId')::uuid
    or document.local_document_type <> p_input->>'sourceDocumentType'
    or coalesce(document.project_claim_id, document.retention_claim_id, document.local_document_id)
      <> (p_input->>'sourceDocumentId')::uuid then
    raise exception 'Confirmed accounting identity does not match the stable document.';
  end if;

  next_sequence := coalesce((
    select max(r.revision_sequence) + 1
    from public.organization_accounting_document_revisions r
    where r.accounting_document_id = document.id
  ), 1);

  if next_sequence = 1 and nullif(p_input->>'previousRevisionId', '') is not null then
    raise exception 'The first accounting revision cannot have a predecessor.';
  elsif next_sequence > 1 then
    select * into previous_revision
    from public.organization_accounting_document_revisions
    where id = (p_input->>'previousRevisionId')::uuid
      and accounting_document_id = document.id;
    if not found or previous_revision.revision_sequence <> next_sequence - 1 then
      raise exception 'Accounting revision predecessor is not the prior document revision.';
    end if;
  end if;

  reservation_free_payment_update :=
    document.local_document_type = 'project_claim'
    and document.integration_contract = 'payment_claim_revision_v1'
    and p_input->>'revisionIntent' = 'direct_update'
    and p_input->>'resolutionStrategy' = 'update_existing'
    and nullif(p_input->>'numberReservationId', '') is null
    and previous_revision.id is not null
    and previous_revision.number_reservation_id is null;

  if reservation_free_payment_update then
    select claim.claim_number into source_claim_number
    from public.project_claims claim
    where claim.id = document.project_claim_id
      and claim.organization_id = document.organization_id;
    if nullif(trim(source_claim_number), '') is null
      or p_input->>'externalDocumentNumber' <> source_claim_number
      or previous_revision.external_document_number <> source_claim_number
      or p_input#>>'{payloadSnapshot,InvoiceNumber}' <> source_claim_number then
      raise exception 'Payment Claim update must preserve its reservation-free claim-number identity.';
    end if;
  elsif document.local_document_type in ('project_claim', 'retention_claim') then
    select * into reservation
    from public.organization_accounting_number_reservations n
    where n.id = (p_input->>'numberReservationId')::uuid
      and n.organization_id = document.organization_id
      and n.provider = document.provider
      and n.tenant_id = document.tenant_id
      and n.accounting_document_id = document.id
      and n.source_document_type = document.local_document_type
      and n.source_document_id =
        coalesce(document.project_claim_id, document.retention_claim_id);
    if not found or reservation.formatted_number <> p_input->>'externalDocumentNumber' then
      raise exception 'Confirmed sales-invoice number is not the reserved tenant number.';
    end if;
  end if;

  if jsonb_typeof(p_input->'lines') <> 'array'
    or jsonb_array_length(p_input->'lines') = 0 then
    raise exception 'A confirmed accounting revision requires line evidence.';
  end if;
  for line in select value from jsonb_array_elements(p_input->'lines')
  loop
    line_subtotal := line_subtotal + (line->>'lineAmountMinor')::bigint;
    line_tax := line_tax + (line->>'taxMinor')::bigint;
  end loop;
  if line_subtotal <> (p_input->>'subtotalMinor')::bigint
    or line_tax <> (p_input->>'taxMinor')::bigint
    or line_subtotal + line_tax <> (p_input->>'totalMinor')::bigint then
    raise exception 'Confirmed accounting line totals do not reconcile.';
  end if;

  insert into public.organization_accounting_document_revisions(
    organization_id, project_id, accounting_document_id, revision_sequence,
    source_document_type, source_document_id, revision_intent,
    resolution_strategy, previous_revision_id, provider, connection_id,
    tenant_id, number_reservation_id, external_document_number,
    commercial_snapshot, contact_snapshot, routing_snapshot, tax_snapshot,
    attachment_snapshot, payload_snapshot, canonical_schema_version,
    source_evidence_hash, commercial_hash, lines_hash, payload_hash,
    provider_content_hash, pdf_hash,
    currency_code, provider_document_type, requested_provider_status,
    line_amount_type, subtotal_minor, tax_minor, total_minor,
    confirmation_preview_hash, confirmed_by, confirmed_at, confirmation_reason
  ) values (
    document.organization_id,
    nullif(p_input->>'projectId', '')::uuid,
    document.id,
    next_sequence,
    document.local_document_type,
    coalesce(document.project_claim_id, document.retention_claim_id, document.local_document_id),
    p_input->>'revisionIntent',
    p_input->>'resolutionStrategy',
    nullif(p_input->>'previousRevisionId', '')::uuid,
    document.provider,
    (p_input->>'connectionId')::uuid,
    document.tenant_id,
    nullif(p_input->>'numberReservationId', '')::uuid,
    p_input->>'externalDocumentNumber',
    p_input->'commercialSnapshot',
    p_input->'contactSnapshot',
    p_input->'routingSnapshot',
    p_input->'taxSnapshot',
    p_input->'attachmentSnapshot',
    p_input->'payloadSnapshot',
    p_input->>'canonicalSchemaVersion',
    p_input->>'sourceEvidenceHash',
    p_input->>'commercialHash',
    p_input->>'linesHash',
    p_input->>'payloadHash',
    p_input->>'providerContentHash',
    nullif(p_input->>'pdfHash', ''),
    p_input->>'currencyCode',
    p_input->>'providerDocumentType',
    p_input->>'requestedProviderStatus',
    p_input->>'lineAmountType',
    (p_input->>'subtotalMinor')::bigint,
    (p_input->>'taxMinor')::bigint,
    (p_input->>'totalMinor')::bigint,
    p_input->>'confirmationPreviewHash',
    (p_input->>'confirmedBy')::uuid,
    coalesce((p_input->>'confirmedAt')::timestamptz, now()),
    nullif(p_input->>'confirmationReason', '')
  ) returning * into revision;

  for line in select value from jsonb_array_elements(p_input->'lines')
  loop
    insert into public.organization_accounting_revision_lines(
      organization_id, accounting_revision_id, sequence, line_kind,
      source_line_type, source_line_id, originating_payment_claim_id,
      description, quantity, unit_amount_minor, line_amount_minor, tax_minor,
      total_minor, account_snapshot, tax_snapshot, tracking_snapshot,
      source_snapshot
    ) values (
      revision.organization_id, revision.id, (line->>'sequence')::integer,
      line->>'lineKind', line->>'sourceLineType',
      nullif(line->>'sourceLineId', '')::uuid,
      nullif(line->>'originatingPaymentClaimId', '')::uuid,
      line->>'description', (line->>'quantity')::numeric,
      (line->>'unitAmountMinor')::bigint, (line->>'lineAmountMinor')::bigint,
      (line->>'taxMinor')::bigint, (line->>'totalMinor')::bigint,
      line->'accountSnapshot', line->'taxSnapshot',
      coalesce(line->'trackingSnapshot', '{}'::jsonb),
      line->'sourceSnapshot'
    );
  end loop;

  for attachment in
    select value from jsonb_array_elements(coalesce(p_input->'attachments', '[]'::jsonb))
  loop
    insert into public.organization_accounting_revision_attachments(
      organization_id, accounting_revision_id, attachment_sequence,
      attachment_kind, source_document_id, filename, content_type, byte_size,
      content_sha256, storage_bucket, storage_path
    ) values (
      revision.organization_id, revision.id,
      (attachment->>'sequence')::integer, attachment->>'kind',
      nullif(attachment->>'sourceDocumentId', '')::uuid,
      attachment->>'filename', attachment->>'contentType',
      (attachment->>'byteSize')::bigint, attachment->>'contentSha256',
      attachment->>'storageBucket', attachment->>'storagePath'
    );
  end loop;

  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, actor_user_id, correlation_id, event_evidence
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    'revision_confirmed', revision.confirmed_by, p_input->>'correlationId',
    jsonb_build_object(
      'revisionSequence', revision.revision_sequence,
      'confirmationPreviewHash', revision.confirmation_preview_hash,
      'sourceEvidenceHash', revision.source_evidence_hash
    )
  );
  return revision;
end;
$$;

commit;
