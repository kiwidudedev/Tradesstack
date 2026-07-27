begin;

-- Retention Claim Phase 2C is an opt-in immutable integration. Existing
-- Phase 9 documents and snapshots remain untouched for later adoption.
alter table public.organization_accounting_phase2b_settings
  add column retention_claim_immutable_xero_enabled boolean not null default false;

alter table public.organization_accounting_phase2b_settings
  drop constraint accounting_phase2b_settings_enabled_shape;
alter table public.organization_accounting_phase2b_settings
  add constraint accounting_phase2b_settings_enabled_shape check (
    (
      not initial_payment_claim_push_enabled
      and not retention_claim_immutable_xero_enabled
    )
    or (enabled_by is not null and enabled_at is not null)
  );

alter table public.organization_accounting_documents
  drop constraint organization_accounting_documents_integration_contract_check;
alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_integration_contract_check
  check (
    integration_contract is null
    or integration_contract in (
      'payment_claim_revision_v1',
      'retention_claim_revision_v1'
    )
  );

-- A Retention Claim has one stable Xero accounting document regardless of
-- which historical tenant identity is represented by an immutable revision.
create unique index
  organization_accounting_documents_stable_retention_claim_uidx
on public.organization_accounting_documents(
  organization_id, provider, retention_claim_id
)
where local_document_type = 'retention_claim'
  and retention_claim_id is not null;

-- Commercial Retention Claim numbers are globally unique within a TradesStack
-- organisation, which maps to the selected Xero organisation for export.
create unique index retention_claims_organization_claim_number_uidx
on public.retention_claims(organization_id, claim_number);

alter table public.organization_accounting_number_reservations
  drop constraint accounting_number_reservation_number_check;
alter table public.organization_accounting_number_reservations
  add constraint accounting_number_reservation_number_check check (
    (
      source_document_type = 'project_claim'
      and (
        formatted_number ~ '^TSI-[0-9]{8,}$'
        or formatted_number ~ '^.+-CL-[0-9]+$'
        or formatted_number ~ '^.+-R[1-9][0-9]*$'
      )
    )
    or (
      source_document_type = 'retention_claim'
      and char_length(trim(formatted_number)) > 0
    )
  );

alter table public.organization_accounting_push_proposals
  drop constraint accounting_push_proposal_source_check;
alter table public.organization_accounting_push_proposals
  add constraint accounting_push_proposal_source_check
    check (source_document_type in ('project_claim', 'retention_claim'));

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
      'xero.retention_claim.initial_push',
      'xero.retention_claim.initial_push.attachment',
      'xero.retention_claim.replacement',
      'xero.retention_claim.replacement.attachment',
      'xero.payment_claim.initial_push',
      'xero.payment_claim.initial_push.attachment',
      'xero.payment_claim.replacement',
      'xero.payment_claim.replacement.attachment'
    )
  );

create unique index
  organization_accounting_sync_jobs_active_retention_revision_uidx
on public.organization_accounting_sync_jobs(
  organization_id, provider, job_kind,
  (request_payload->>'accountingRevisionId')
)
where queue_state in ('pending', 'claimed', 'retry_scheduled')
  and job_kind in (
    'xero.retention_claim.initial_push',
    'xero.retention_claim.initial_push.attachment',
    'xero.retention_claim.replacement',
    'xero.retention_claim.replacement.attachment'
  );

create or replace function private.retention_phase2c_actor_can_push(
  p_organization_id uuid,
  p_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select o.is_allowed
      from public.organization_members m
      join public.member_permission_overrides o
        on o.organization_member_id = m.id
       and o.permission_key = 'retention.claims.xero.manage'
      where m.organization_id = p_organization_id
        and m.user_id = p_actor_id
      limit 1
    ),
    (
      select rp.is_allowed
      from public.organization_members m
      join public.role_permissions rp
        on rp.role = m.role
       and rp.permission_key = 'retention.claims.xero.manage'
      where m.organization_id = p_organization_id
        and m.user_id = p_actor_id
      limit 1
    ),
    false
  );
$$;

-- This source reader is service-only. The application authenticates the
-- current member and permission before calling it; unlike the legacy Phase 9
-- reader it is governed exclusively by the organisation Phase 2C gate.
create or replace function public.get_retention_claim_xero_source_phase2c(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_source jsonb;
  v_hash text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Immutable Retention Claim source evidence is server-only.';
  end if;
  select * into v_claim
  from public.retention_claims
  where id = p_retention_claim_id;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_found'
    );
  end if;
  if not exists (
    select 1
    from public.organization_accounting_phase2b_settings s
    where s.organization_id = v_claim.organization_id
      and s.retention_claim_immutable_xero_enabled
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'feature_disabled'
    );
  end if;
  if v_claim.status <> 'submitted' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_submitted'
    );
  end if;
  v_source := private.retention_claim_document_source(v_claim.id);
  v_hash := encode(
    extensions.digest(convert_to(v_source::text, 'UTF8'), 'sha256'),
    'hex'
  );
  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'organizationId', v_claim.organization_id,
    'projectId', v_claim.project_id,
    'retentionSourceEvidenceHash', v_hash,
    'source', v_source
  );
end;
$$;

create or replace function public.persist_retention_claim_push_proposal_phase2c(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p_input->>'proposalId')::uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Retention Claim accounting proposals are server-only.';
  end if;
  insert into public.organization_accounting_push_proposals(
    id, organization_id, project_id, source_document_type, source_document_id,
    accounting_document_id, active_revision_id, operation,
    external_document_number, preview_hash, source_optimistic_revision,
    decision_snapshot, evidence_hashes, expires_at, created_by
  ) values (
    v_id,
    (p_input->>'organizationId')::uuid,
    (p_input->>'projectId')::uuid,
    'retention_claim',
    (p_input->>'retentionClaimId')::uuid,
    nullif(p_input->>'accountingDocumentId', '')::uuid,
    nullif(p_input->>'activeRevisionId', '')::uuid,
    p_input->>'operation',
    p_input->>'externalDocumentNumber',
    p_input->>'previewHash',
    p_input->>'sourceOptimisticRevision',
    p_input->'decisionSnapshot',
    p_input->'evidenceHashes',
    (p_input->>'expiresAt')::timestamptz,
    (p_input->>'createdBy')::uuid
  );
  return v_id;
end;
$$;

create or replace function public.confirm_retention_claim_push_phase2c(
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
  v_operation text := p_input->>'operation';
  v_claim_row public.retention_claims%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_previous public.organization_accounting_document_revisions%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_proposal public.organization_accounting_push_proposals%rowtype;
  v_reservation public.organization_accounting_number_reservations%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_attachment public.organization_accounting_revision_attachments%rowtype;
  v_ownership jsonb;
  v_source jsonb;
  v_source_hash text;
  v_number text;
  v_replacement_sequence bigint;
  v_global_sequence bigint;
  v_pdf bytea;
  v_pdf_hash text;
  v_payload jsonb := p_input->'payloadTemplate';
  v_payload_hash text;
  v_idempotency text;
  v_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Retention Claim immutable confirmation is server-only.';
  end if;
  if v_operation not in ('INITIAL_EXPORT', 'REPLACEMENT_EXPORT') then
    raise exception 'The resolved Retention Claim operation is not executable.';
  end if;
  if not private.retention_phase2c_actor_can_push(v_org, v_actor) then
    raise exception 'Retention Claim Push to Xero permission is required.';
  end if;
  if not exists (
    select 1
    from public.organization_accounting_phase2b_settings s
    where s.organization_id = v_org
      and s.retention_claim_immutable_xero_enabled
  ) then
    raise exception 'Immutable Retention Claim Push to Xero is not enabled.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2630));
  select * into v_claim_row
  from public.retention_claims
  where id = v_claim
    and organization_id = v_org
    and project_id = v_project
  for update;
  if not found or v_claim_row.status <> 'submitted' then
    raise exception 'The Retention Claim is no longer submitted.';
  end if;
  if v_claim_row.submitted_at is distinct from
      (p_input->>'sourceOptimisticRevision')::timestamptz then
    raise exception 'The Retention Claim changed after the accounting preview was created.';
  end if;
  if v_claim_row.claim_number <> p_input->>'commercialClaimNumber' then
    raise exception 'The Retention Claim commercial identity changed.';
  end if;
  v_source := private.retention_claim_document_source(v_claim);
  v_source_hash := encode(
    extensions.digest(convert_to(v_source::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_source_hash <> p_input->>'retentionSourceEvidenceHash' then
    raise exception 'Retention Claim ownership evidence changed.';
  end if;
  select public.evaluate_retention_ownership_phase2a(
    v_org, v_project, '[]'::jsonb
  ) into v_ownership;
  if coalesce((v_ownership->>'valid')::boolean, false) is not true then
    raise exception 'Retention ownership changed after preview.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_input->'lines') line
    where not exists (
      select 1
      from public.retention_claim_allocations allocation
      where allocation.id = (line->>'sourceLineId')::uuid
        and allocation.retention_claim_id = v_claim
        and allocation.organization_id = v_org
        and allocation.project_id = v_project
        and allocation.originating_payment_claim_id =
          (line->>'originatingPaymentClaimId')::uuid
        and round(allocation.allocation_amount * 100)::bigint =
          (line->>'lineAmountMinor')::bigint
    )
  ) then
    raise exception 'Retention Claim allocation ownership changed.';
  end if;
  if not exists (
    select 1 from public.organization_xero_connections c
    where c.id = v_connection
      and c.organization_id = v_org
      and c.status = 'connected'
      and c.tenant_id = v_tenant
      and c.scope @> array['accounting.invoices']::text[]
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
    or v_proposal.operation <> v_operation
    or v_proposal.external_document_number <>
      p_input->>'externalDocumentNumber'
    or v_proposal.source_optimistic_revision <>
      p_input->>'sourceOptimisticRevision'
    or v_proposal.evidence_hashes->>'sourceEvidenceHash' <>
      p_input->>'sourceEvidenceHash'
    or v_proposal.evidence_hashes->>'dependencyHash' <>
      p_input->>'dependencyHash'
    or v_proposal.evidence_hashes->>'commercialHash' <>
      p_input->>'commercialHash'
    or v_proposal.evidence_hashes->>'linesHash' <>
      p_input->>'linesHash'
    or v_proposal.evidence_hashes->>'payloadHash' <>
      p_input->>'payloadHash'
    or v_proposal.evidence_hashes->>'pdfHash' <>
      p_input->>'pdfHash' then
    raise exception 'The immutable Retention Claim proposal is missing, expired, or stale.';
  end if;

  select * into v_document
  from public.organization_accounting_documents
  where organization_id = v_org
    and provider = 'xero'
    and local_document_type = 'retention_claim'
    and retention_claim_id = v_claim
  for update;
  if not found then
    if v_operation <> 'INITIAL_EXPORT' then
      raise exception 'The immutable Retention Claim accounting document is missing.';
    end if;
    insert into public.organization_accounting_documents(
      organization_id, accounting_connection_id, provider, tenant_id,
      local_document_type, local_document_id, project_claim_id,
      retention_claim_id, current_version_id, export_status,
      currency_code, integration_contract
    ) values (
      v_org, v_connection, 'xero', v_tenant,
      'retention_claim', null, null, v_claim, null, 'not_ready',
      'NZD', 'retention_claim_revision_v1'
    ) returning * into v_document;
  end if;
  if v_document.accounting_connection_id <> v_connection
    or v_document.tenant_id <> v_tenant
    or (
      v_document.integration_contract is not null
      and v_document.integration_contract <> 'retention_claim_revision_v1'
    ) then
    raise exception 'The immutable Retention Claim accounting identity changed.';
  end if;
  if v_document.integration_contract is null then
    update public.organization_accounting_documents
    set integration_contract = 'retention_claim_revision_v1',
        updated_at = now()
    where id = v_document.id;
    v_document.integration_contract := 'retention_claim_revision_v1';
  end if;

  -- A repeated or concurrent confirmation of the same immutable preview
  -- returns the original durable identities and never allocates another
  -- revision, number, attempt, or job.
  select * into v_revision
  from public.organization_accounting_document_revisions r
  where r.accounting_document_id = v_document.id
    and r.confirmation_preview_hash = p_input->>'previewHash'
    and r.external_document_number = p_input->>'externalDocumentNumber'
  order by r.revision_sequence
  limit 1;
  if found then
    select * into v_attempt
    from public.organization_accounting_revision_attempts a
    where a.accounting_revision_id = v_revision.id
      and a.attempt_intent in ('create', 'replace')
    order by a.attempt_sequence
    limit 1;
    select j.id into v_job_id
    from public.organization_accounting_sync_jobs j
    where j.organization_id = v_org
      and j.job_kind in (
        'xero.retention_claim.initial_push',
        'xero.retention_claim.replacement'
      )
      and j.request_payload->>'accountingRevisionId' = v_revision.id::text
    order by j.created_at
    limit 1;
    select * into v_attachment
    from public.organization_accounting_revision_attachments a
    where a.accounting_revision_id = v_revision.id
      and a.attachment_sequence = 1;
    if v_attempt.id is null or v_job_id is null or v_attachment.id is null then
      raise exception 'The existing Retention Claim confirmation is incomplete.';
    end if;
    return jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attempt.id,
      'jobId', v_job_id,
      'invoiceNumber', v_revision.external_document_number,
      'revisionSequence', v_revision.revision_sequence,
      'pdfFilename', v_attachment.filename,
      'status', case
        when v_revision.lifecycle_state = 'succeeded' then 'completed'
        when v_revision.lifecycle_state = 'processing' then 'processing'
        else 'queued'
      end
    );
  end if;

  if v_operation = 'INITIAL_EXPORT' then
    if v_document.active_accounting_revision_id is not null
      or v_document.external_document_id is not null
      or exists (
        select 1 from public.organization_accounting_document_revisions r
        where r.accounting_document_id = v_document.id
      ) then
      raise exception 'An immutable Retention Claim revision already exists.';
    end if;
    v_number := v_claim_row.claim_number;
  else
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
      or v_document.external_document_id <>
        v_previous.external_document_id then
      raise exception 'The active Retention Claim Xero invoice changed.';
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
      raise exception 'The previous Retention Claim invoice is not replacement eligible.';
    end if;
    select * into v_observation
    from public.organization_accounting_remote_observations
    where id = v_projection.remote_observation_id
      and accounting_revision_id = v_previous.id
      and external_document_id = v_previous.external_document_id;
    if not found
      or jsonb_array_length(
        coalesce(v_observation.raw_observation->'Payments', '[]'::jsonb)
      ) <> 0
      or jsonb_array_length(
        coalesce(v_observation.raw_observation->'CreditNotes', '[]'::jsonb)
      ) <> 0 then
      raise exception 'Payments or credits prevent Retention Claim replacement.';
    end if;
    select coalesce(max(
      case
        when left(
          r.external_document_number,
          char_length(v_claim_row.claim_number) + 2
        ) = v_claim_row.claim_number || '-R'
          and substring(
            r.external_document_number
            from char_length(v_claim_row.claim_number) + 3
          ) ~ '^[1-9][0-9]*$'
        then substring(
          r.external_document_number
          from char_length(v_claim_row.claim_number) + 3
        )::bigint
        else 0
      end
    ), 0) + 1 into v_replacement_sequence
    from public.organization_accounting_document_revisions r
    where r.accounting_document_id = v_document.id;
    v_number := v_claim_row.claim_number || '-R' || v_replacement_sequence;
  end if;

  if p_input->>'externalDocumentNumber' <> v_number
    or v_payload->>'InvoiceNumber' <> v_number
    or v_payload->>'Type' <> 'ACCREC'
    or v_payload->>'Status' <> 'AUTHORISED' then
    raise exception 'The confirmed Retention Claim invoice identity is stale.';
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
    'retention_claim', v_claim,
    case when v_operation = 'INITIAL_EXPORT'
      then 'retention_claim_initial_push' else 'replacement' end,
    v_actor
  ) returning * into v_reservation;

  v_pdf := decode(p_input->>'pdfBase64', 'base64');
  v_pdf_hash := encode(digest(v_pdf, 'sha256'), 'hex');
  if v_pdf_hash <> p_input->>'pdfHash'
    or octet_length(v_pdf) <> (p_input->>'pdfByteSize')::bigint
    or substring(v_pdf from 1 for 4) <> decode('25504446', 'hex') then
    raise exception 'Confirmed Retention Claim PDF evidence is invalid.';
  end if;
  v_payload_hash := encode(digest(v_payload::text, 'sha256'), 'hex');
  select * into v_revision
  from public.persist_confirmed_accounting_revision_phase2a(
    jsonb_build_object(
      'organizationId', v_org,
      'projectId', v_project,
      'accountingDocumentId', v_document.id,
      'sourceDocumentType', 'retention_claim',
      'sourceDocumentId', v_claim,
      'revisionIntent', case when v_operation = 'INITIAL_EXPORT'
        then 'initial_push' else 'replacement' end,
      'resolutionStrategy', case when v_operation = 'INITIAL_EXPORT'
        then 'new_document' else 'replacement' end,
      'previousRevisionId', case when v_operation = 'INITIAL_EXPORT'
        then null else v_previous.id end,
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
        'contentSha256', v_pdf_hash,
        'byteSize', octet_length(v_pdf),
        'provenance', 'exact_immutable_retention_document'
      ),
      'payloadSnapshot', v_payload,
      'canonicalSchemaVersion', p_input->>'canonicalSchemaVersion',
      'sourceEvidenceHash', p_input->>'sourceEvidenceHash',
      'commercialHash', p_input->>'commercialHash',
      'linesHash', p_input->>'linesHash',
      'payloadHash', v_payload_hash,
      'providerContentHash', v_payload_hash,
      'pdfHash', v_pdf_hash,
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
      'confirmationReason', case when v_operation = 'INITIAL_EXPORT'
        then null else 'Previous Xero invoice voided' end,
      'correlationId', p_input->>'proposalId',
      'lines', p_input->'lines',
      'attachments', jsonb_build_array(jsonb_build_object(
        'sequence', 1,
        'kind', 'claim_pdf',
        'sourceDocumentId', v_claim,
        'filename', v_number || '-r' ||
          lpad((coalesce(v_previous.revision_sequence, 0) + 1)::text, 4, '0')
          || '.pdf',
        'contentType', 'application/pdf',
        'byteSize', octet_length(v_pdf),
        'contentSha256', v_pdf_hash,
        'storageBucket', 'accounting-revision-evidence',
        'storagePath', v_org || '/' || v_document.id || '/revision-' ||
          (coalesce(v_previous.revision_sequence, 0) + 1) || '/retention-claim.pdf'
      ))
    )
  );
  select * into v_attachment
  from public.organization_accounting_revision_attachments
  where accounting_revision_id = v_revision.id
    and attachment_sequence = 1;
  insert into public.organization_accounting_revision_blobs(
    accounting_revision_id, organization_id, attachment_id,
    content_type, byte_size, content_sha256, content_bytes
  ) values (
    v_revision.id, v_org, v_attachment.id,
    'application/pdf', octet_length(v_pdf), v_pdf_hash, v_pdf
  );
  v_idempotency := encode(digest((
    'xero:retention_claim:' ||
    case when v_operation = 'INITIAL_EXPORT'
      then 'initial_push:' else 'replacement:' end ||
    v_revision.id
  )::bytea, 'sha256'), 'hex');
  select * into v_attempt
  from public.create_accounting_revision_attempt_phase2a(
    v_revision.id,
    case when v_operation = 'INITIAL_EXPORT' then 'create' else 'replace' end,
    v_idempotency,
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'previousRevisionId', v_previous.id,
      'payloadHash', v_payload_hash,
      'tenantId', v_tenant,
      'intent', case when v_operation = 'INITIAL_EXPORT'
        then 'initial_push' else 'replacement' end
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
    case when v_operation = 'INITIAL_EXPORT'
      then 'xero.retention_claim.initial_push'
      else 'xero.retention_claim.replacement' end,
    'user_export',
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attempt.id,
      'previousRevisionId', v_previous.id,
      'payloadHash', v_payload_hash,
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
      'operation', v_operation,
      'invoiceNumber', v_number,
      'retentionOwnership', v_ownership
    )
  );
  return jsonb_build_object(
    'accountingDocumentId', v_document.id,
    'accountingRevisionId', v_revision.id,
    'attemptId', v_attempt.id,
    'jobId', v_job_id,
    'invoiceNumber', v_number,
    'revisionSequence', v_revision.revision_sequence,
    'pdfFilename', v_attachment.filename,
    'status', 'queued'
  );
end;
$$;

create or replace function public.complete_retention_claim_push_phase2c(
  p_attempt_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_result jsonb
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
  v_attachment_attempt public.organization_accounting_revision_attempts%rowtype;
  v_attachment_key text;
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
    or v_revision.revision_intent not in ('initial_push', 'replacement')
    or p_result->>'externalDocumentNumber' <>
      v_revision.external_document_number
    or nullif(trim(p_result->>'externalDocumentId'), '') is null then
    raise exception 'Verified Xero result does not match the immutable Retention Claim revision.';
  end if;
  if v_revision.revision_intent = 'initial_push' then
    if v_document.active_accounting_revision_id is not null then
      raise exception 'A Retention Claim revision is already active.';
    end if;
  else
    select * into v_previous
    from public.organization_accounting_document_revisions
    where id = v_revision.previous_revision_id
    for update;
    if v_document.active_accounting_revision_id <> v_previous.id
      or v_document.external_document_id <>
        v_previous.external_document_id then
      raise exception 'The Retention Claim predecessor changed before activation.';
    end if;
  end if;
  v_finalized := public.finalize_accounting_revision_attempt_phase2a(
    p_attempt_id, p_worker_id, p_lease_token, 'succeeded',
    case when coalesce((p_result->>'recovered')::boolean, false)
      then 'recovered_authorised_invoice'
      else 'verified_authorised_invoice' end,
    'Xero invoice exactly matched immutable Retention Claim revision.',
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
    last_status_sync_error = null,
    export_status = 'exported',
    last_synced_hash =
      v_revision.commercial_snapshot->>'currentStateHash',
    last_error_code = null,
    last_error_message = null,
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
  v_attachment_key := encode(digest((
    'xero:retention_claim:attachment:' || v_revision.id
  )::bytea, 'sha256'), 'hex');
  select * into v_attachment_attempt
  from public.create_accounting_revision_attempt_phase2a(
    v_revision.id, 'attach', v_attachment_key,
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attachmentId', (
        select id
        from public.organization_accounting_revision_attachments
        where accounting_revision_id = v_revision.id
          and attachment_sequence = 1
      ),
      'tenantId', v_revision.tenant_id
    )
  );
  insert into public.organization_accounting_sync_jobs(
    organization_id, provider, connection_id, job_kind, trigger_source,
    request_payload, result_summary, idempotency_key, max_attempts,
    created_by_user_id
  ) values (
    v_revision.organization_id, 'xero', v_revision.connection_id,
    case when v_revision.revision_intent = 'initial_push'
      then 'xero.retention_claim.initial_push.attachment'
      else 'xero.retention_claim.replacement.attachment' end,
    'user_export',
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attachment_attempt.id,
      'tenantId', v_revision.tenant_id
    ),
    '{}'::jsonb, v_attachment_key, 5, v_revision.confirmed_by
  ) on conflict (idempotency_key)
    where idempotency_key is not null do nothing;
  return true;
end;
$$;

create or replace function public.get_retention_claim_push_execution_phase2c(
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
    'document', to_jsonb(d),
    'revision', to_jsonb(r),
    'previousRevision', to_jsonb(previous),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.sequence)
      from public.organization_accounting_revision_lines l
      where l.accounting_revision_id = r.id
    ), '[]'::jsonb),
    'attachment', to_jsonb(a),
    'pdfBase64', encode(b.content_bytes, 'base64'),
    'attempt', to_jsonb(attempt)
  )
  from public.organization_accounting_document_revisions r
  join public.organization_accounting_documents d
    on d.id = r.accounting_document_id
   and d.organization_id = r.organization_id
  join public.organization_accounting_revision_attempts attempt
    on attempt.id = p_attempt_id
   and attempt.accounting_revision_id = r.id
  join public.organization_accounting_revision_attachments a
    on a.accounting_revision_id = r.id
   and a.attachment_sequence = 1
  join public.organization_accounting_revision_blobs b
    on b.accounting_revision_id = r.id
   and b.attachment_id = a.id
  left join public.organization_accounting_document_revisions previous
    on previous.id = r.previous_revision_id
  where r.id = p_revision_id
    and r.source_document_type = 'retention_claim'
    and d.integration_contract = 'retention_claim_revision_v1';
$$;

create or replace function public.adopt_legacy_voided_retention_claim_phase2c(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_org uuid := (p_input->>'organizationId')::uuid;
  v_project uuid := (p_input->>'projectId')::uuid;
  v_claim uuid := (p_input->>'retentionClaimId')::uuid;
  v_actor uuid := (p_input->>'adoptedBy')::uuid;
  v_connection uuid := (p_input->>'connectionId')::uuid;
  v_tenant text := p_input->>'tenantId';
  v_invoice_id text := p_input->>'externalDocumentId';
  v_invoice_number text := p_input->>'externalDocumentNumber';
  v_claim_row public.retention_claims%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_existing public.organization_accounting_document_revisions%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_classification public.organization_accounting_legacy_classifications%rowtype;
  v_line jsonb;
  v_line_subtotal bigint;
  v_line_tax bigint;
  v_remote jsonb := p_input->'rawObservation';
begin
  if auth.role() <> 'service_role' then
    raise exception 'Historical Retention Claim adoption is server-only.';
  end if;
  if not private.retention_phase2c_actor_can_push(v_org, v_actor) then
    raise exception 'Retention Claim Push to Xero permission is required.';
  end if;
  if not exists (
    select 1
    from public.organization_accounting_phase2b_settings s
    where s.organization_id = v_org
      and s.retention_claim_immutable_xero_enabled
  ) then
    raise exception 'Immutable Retention Claim Push to Xero is not enabled.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2631));
  select * into v_claim_row
  from public.retention_claims
  where id = v_claim
    and organization_id = v_org
    and project_id = v_project
  for update;
  if not found or v_claim_row.status <> 'submitted' then
    raise exception 'The Retention Claim is no longer submitted.';
  end if;
  if v_claim_row.submitted_at is distinct from
      (p_input->>'sourceOptimisticRevision')::timestamptz then
    raise exception 'The Retention Claim changed before legacy adoption.';
  end if;
  if not exists (
    select 1
    from public.organization_xero_connections c
    where c.id = v_connection
      and c.organization_id = v_org
      and c.status = 'connected'
      and c.tenant_id = v_tenant
      and c.scope @> array['accounting.invoices']::text[]
  ) then
    raise exception 'The Xero connection, tenant, or invoice scope changed.';
  end if;
  if coalesce((
    public.evaluate_retention_ownership_phase2a(v_org, v_project, '[]'::jsonb)
      ->>'valid'
  )::boolean, false) is not true then
    raise exception 'Retention ownership changed before legacy adoption.';
  end if;

  select * into v_document
  from public.organization_accounting_documents
  where organization_id = v_org
    and provider = 'xero'
    and local_document_type = 'retention_claim'
    and retention_claim_id = v_claim
  for update;
  if not found then
    raise exception 'The historical Retention Claim accounting document is missing.';
  end if;
  if v_document.accounting_connection_id <> v_connection
    or v_document.tenant_id <> v_tenant
    or v_document.external_document_id <> v_invoice_id
    or v_document.external_document_number <> v_invoice_number then
    raise exception 'The historical Retention Claim Xero identity changed.';
  end if;
  if v_document.active_accounting_revision_id is not null then
    select * into v_existing
    from public.organization_accounting_document_revisions
    where id = v_document.active_accounting_revision_id
      and organization_id = v_org
      and accounting_document_id = v_document.id;
    if found
      and v_existing.revision_intent = 'legacy_import'
      and v_existing.external_document_id = v_invoice_id
      and v_existing.external_document_number = v_invoice_number
      and v_existing.tenant_id = v_tenant then
      return jsonb_build_object(
        'accountingDocumentId', v_document.id,
        'accountingRevisionId', v_existing.id,
        'adopted', false
      );
    end if;
    raise exception 'An immutable Retention Claim revision already exists.';
  end if;
  if v_document.integration_contract is not null
    and v_document.integration_contract <> 'retention_claim_revision_v1' then
    raise exception 'The historical accounting document uses an unsupported contract.';
  end if;
  if v_remote->>'Type' <> 'ACCREC'
    or v_remote->>'Status' <> 'VOIDED'
    or v_remote->>'InvoiceID' <> v_invoice_id
    or v_remote->>'InvoiceNumber' <> v_invoice_number
    or coalesce((v_remote->>'AmountPaid')::numeric, 0) <> 0
    or coalesce((v_remote->>'AmountCredited')::numeric, 0) <> 0
    or jsonb_array_length(coalesce(v_remote->'Payments', '[]'::jsonb)) <> 0
    or jsonb_array_length(coalesce(v_remote->'CreditNotes', '[]'::jsonb)) <> 0 then
    raise exception 'The historical predecessor is not a confirmed unsettled VOIDED invoice.';
  end if;
  if round((v_remote->>'SubTotal')::numeric * 100)::bigint
      <> (p_input->>'subtotalMinor')::bigint
    or round((v_remote->>'TotalTax')::numeric * 100)::bigint
      <> (p_input->>'taxMinor')::bigint
    or round((v_remote->>'Total')::numeric * 100)::bigint
      <> (p_input->>'totalMinor')::bigint
    or (p_input->>'subtotalMinor')::bigint
      + (p_input->>'taxMinor')::bigint
      <> (p_input->>'totalMinor')::bigint
    or round(v_claim_row.subtotal_excl_tax * 100)::bigint
      <> (p_input->>'subtotalMinor')::bigint then
    raise exception 'The historical Retention Claim totals do not reconcile.';
  end if;
  select
    coalesce(sum((value->>'lineAmountMinor')::bigint), 0),
    coalesce(sum((value->>'taxMinor')::bigint), 0)
  into v_line_subtotal, v_line_tax
  from jsonb_array_elements(p_input->'lines');
  if v_line_subtotal <> (p_input->>'subtotalMinor')::bigint
    or v_line_tax <> (p_input->>'taxMinor')::bigint then
    raise exception 'The historical Retention Claim lines do not reconcile.';
  end if;

  insert into public.organization_accounting_document_revisions(
    organization_id, project_id, accounting_document_id, revision_sequence,
    source_document_type, source_document_id, revision_intent,
    resolution_strategy, previous_revision_id, provider, connection_id,
    tenant_id, number_reservation_id, external_document_id,
    external_document_number, commercial_snapshot, contact_snapshot,
    routing_snapshot, tax_snapshot, attachment_snapshot, payload_snapshot,
    canonical_schema_version, source_evidence_hash, commercial_hash,
    lines_hash, payload_hash, provider_content_hash, pdf_hash,
    currency_code, provider_document_type, requested_provider_status,
    line_amount_type, subtotal_minor, tax_minor, total_minor,
    confirmation_preview_hash, confirmed_by, confirmed_at,
    confirmation_reason, lifecycle_state, succeeded_at, activated_at
  ) values (
    v_org, v_project, v_document.id, 1,
    'retention_claim', v_claim, 'legacy_import',
    'legacy_preservation', null, 'xero', v_connection,
    v_tenant, null, v_invoice_id, v_invoice_number,
    p_input->'commercialSnapshot', p_input->'contactSnapshot',
    p_input->'routingSnapshot', p_input->'taxSnapshot',
    jsonb_build_object(
      'provenance', 'legacy_adoption',
      'evidenceQuality', p_input->>'evidenceQuality',
      'historicalPdfAvailable', false,
      'historicalPdfFabricated', false
    ),
    p_input->'payloadSnapshot', p_input->>'canonicalSchemaVersion',
    p_input->>'sourceEvidenceHash', p_input->>'commercialHash',
    p_input->>'linesHash', p_input->>'payloadHash',
    p_input->>'providerContentHash', null,
    'NZD', 'ACCREC', 'AUTHORISED', 'Exclusive',
    (p_input->>'subtotalMinor')::bigint,
    (p_input->>'taxMinor')::bigint,
    (p_input->>'totalMinor')::bigint,
    p_input->>'confirmationPreviewHash', v_actor, now(),
    'Historical Retention Claim invoice adopted from reconstructed evidence.',
    'succeeded', now(), now()
  )
  returning * into v_revision;

  for v_line in
    select value from jsonb_array_elements(p_input->'lines')
  loop
    insert into public.organization_accounting_revision_lines(
      organization_id, accounting_revision_id, sequence, line_kind,
      source_line_type, source_line_id, originating_payment_claim_id,
      description, quantity, unit_amount_minor, line_amount_minor,
      tax_minor, total_minor, account_snapshot, tax_snapshot,
      tracking_snapshot, source_snapshot
    ) values (
      v_org, v_revision.id, (v_line->>'sequence')::integer,
      v_line->>'lineKind', v_line->>'sourceLineType',
      nullif(v_line->>'sourceLineId', '')::uuid,
      nullif(v_line->>'originatingPaymentClaimId', '')::uuid,
      v_line->>'description', (v_line->>'quantity')::numeric,
      (v_line->>'unitAmountMinor')::bigint,
      (v_line->>'lineAmountMinor')::bigint,
      (v_line->>'taxMinor')::bigint,
      (v_line->>'totalMinor')::bigint,
      v_line->'accountSnapshot', v_line->'taxSnapshot',
      coalesce(v_line->'trackingSnapshot', '{}'::jsonb),
      v_line->'sourceSnapshot'
    );
  end loop;

  perform set_config('app.accounting_phase2a_pointer_write', 'true', true);
  update public.organization_accounting_documents
  set
    active_accounting_revision_id = v_revision.id,
    integration_contract = 'retention_claim_revision_v1',
    raw_external_status = 'VOIDED',
    normalized_external_status = 'voided',
    export_status = 'exported',
    amount_paid = 0,
    amount_due = (p_input->>'totalMinor')::numeric / 100,
    amount_credited = 0,
    last_status_synced_at = now(),
    last_status_sync_error = null,
    updated_at = now()
  where id = v_document.id
    and organization_id = v_org
    and active_accounting_revision_id is null;
  if not found then
    raise exception 'Legacy Retention Claim adoption lost its document lock.';
  end if;
  perform set_config('app.accounting_phase2a_pointer_write', '', true);

  select * into v_observation
  from public.record_accounting_remote_observation_phase2a(
    jsonb_build_object(
      'organizationId', v_org,
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'provider', 'xero',
      'tenantId', v_tenant,
      'externalDocumentId', v_invoice_id,
      'providerUpdatedAt', p_input->>'providerUpdatedAt',
      'rawStatus', 'VOIDED',
      'normalizedStatus', 'voided',
      'normalizedInvoiceStatus', 'voided',
      'normalizedPaymentStatus', 'attention_required',
      'contentHash', p_input->>'providerContentHash',
      'settlementHash', p_input->>'settlementHash',
      'amountPaidMinor', '0',
      'amountDueMinor', p_input->>'totalMinor',
      'amountCreditedMinor', '0',
      'rawObservation', v_remote,
      'correlationId', p_input->>'correlationId'
    )
  );
  insert into public.organization_accounting_legacy_classifications(
    organization_id, accounting_document_id, classification_sequence,
    classification, evidence_snapshot, evidence_hash, classified_by
  ) values (
    v_org, v_document.id, 1, 'authoritative_match',
    jsonb_build_object(
      'provenance', 'legacy_adoption',
      'evidenceQuality', p_input->>'evidenceQuality',
      'externalDocumentId', v_invoice_id,
      'externalDocumentNumber', v_invoice_number,
      'remoteObservationId', v_observation.id,
      'historicalPdfFabricated', false
    ),
    p_input->>'sourceEvidenceHash', v_actor
  )
  returning * into v_classification;
  perform set_config('app.accounting_phase2a_pointer_write', 'true', true);
  update public.organization_accounting_documents
  set current_legacy_classification_id = v_classification.id
  where id = v_document.id
    and organization_id = v_org;
  perform set_config('app.accounting_phase2a_pointer_write', '', true);
  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, actor_user_id, correlation_id, event_evidence
  ) values (
    v_org, v_document.id, v_revision.id, 'legacy_adopted',
    v_actor, p_input->>'correlationId',
    jsonb_build_object(
      'externalDocumentId', v_invoice_id,
      'externalDocumentNumber', v_invoice_number,
      'remoteObservationId', v_observation.id,
      'evidenceQuality', p_input->>'evidenceQuality',
      'xeroPostPerformed', false,
      'historicalPdfFabricated', false
    )
  );
  return jsonb_build_object(
    'accountingDocumentId', v_document.id,
    'accountingRevisionId', v_revision.id,
    'remoteObservationId', v_observation.id,
    'adopted', true
  );
end;
$$;

create or replace function public.queue_retention_claim_attachment_retry_phase2c(
  p_revision_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_attachment public.organization_accounting_revision_attachments%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_retry_sequence bigint;
  v_key text;
  v_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Retention Claim attachment retry is server-only.';
  end if;
  select * into v_revision
  from public.organization_accounting_document_revisions
  where id = p_revision_id
  for update;
  if not found
    or v_revision.source_document_type <> 'retention_claim'
    or v_revision.lifecycle_state <> 'succeeded'
    or v_revision.revision_intent not in ('initial_push', 'replacement') then
    raise exception 'The Retention Claim revision is not attachment-retry eligible.';
  end if;
  if not private.retention_phase2c_actor_can_push(
    v_revision.organization_id, p_actor_id
  ) then
    raise exception 'Retention Claim Push to Xero permission is required.';
  end if;
  if not exists (
    select 1
    from public.organization_accounting_phase2b_settings s
    where s.organization_id = v_revision.organization_id
      and s.retention_claim_immutable_xero_enabled
  ) then
    raise exception 'Immutable Retention Claim Push to Xero is not enabled.';
  end if;
  select * into v_document
  from public.organization_accounting_documents
  where id = v_revision.accounting_document_id
    and organization_id = v_revision.organization_id
    and active_accounting_revision_id = v_revision.id
    and integration_contract = 'retention_claim_revision_v1'
  for update;
  if not found
    or v_document.external_document_id <> v_revision.external_document_id then
    raise exception 'The Retention Claim revision is no longer active.';
  end if;
  select * into v_attachment
  from public.organization_accounting_revision_attachments
  where accounting_revision_id = v_revision.id
    and attachment_sequence = 1
  for update;
  if not found or v_attachment.upload_state <> 'failed' then
    raise exception 'The immutable Retention Claim PDF does not require retry.';
  end if;
  if exists (
    select 1
    from public.organization_accounting_sync_jobs j
    where j.organization_id = v_revision.organization_id
      and j.job_kind in (
        'xero.retention_claim.initial_push.attachment',
        'xero.retention_claim.replacement.attachment'
      )
      and j.queue_state in ('pending', 'claimed', 'retry_scheduled')
      and j.request_payload->>'accountingRevisionId' = v_revision.id::text
  ) then
    raise exception 'A Retention Claim PDF attachment job is already active.';
  end if;
  select count(*) + 1 into v_retry_sequence
  from public.organization_accounting_revision_attempts
  where accounting_revision_id = v_revision.id
    and attempt_intent = 'attach';
  v_key := encode(digest((
    'xero:retention_claim:attachment:retry:'
    || v_revision.id || ':' || v_retry_sequence
  )::bytea, 'sha256'), 'hex');
  select * into v_attempt
  from public.create_accounting_revision_attempt_phase2a(
    v_revision.id, 'attach', v_key,
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attachmentId', v_attachment.id,
      'tenantId', v_revision.tenant_id,
      'retrySequence', v_retry_sequence
    )
  );
  insert into public.organization_accounting_sync_jobs(
    organization_id, provider, connection_id, job_kind, trigger_source,
    request_payload, result_summary, idempotency_key, max_attempts,
    created_by_user_id
  ) values (
    v_revision.organization_id, 'xero', v_revision.connection_id,
    case when v_revision.revision_intent = 'initial_push'
      then 'xero.retention_claim.initial_push.attachment'
      else 'xero.retention_claim.replacement.attachment' end,
    'user_retry',
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attempt.id,
      'tenantId', v_revision.tenant_id
    ),
    '{}'::jsonb, v_key, 5, p_actor_id
  )
  returning id into v_job_id;
  return jsonb_build_object(
    'accountingRevisionId', v_revision.id,
    'attemptId', v_attempt.id,
    'jobId', v_job_id
  );
end;
$$;

revoke all on function
  private.retention_phase2c_actor_can_push(uuid,uuid)
from public, anon, authenticated, service_role;
revoke all on function
  public.get_retention_claim_xero_source_phase2c(uuid)
from public, anon, authenticated;
revoke all on function
  public.persist_retention_claim_push_proposal_phase2c(jsonb)
from public, anon, authenticated;
revoke all on function
  public.confirm_retention_claim_push_phase2c(jsonb)
from public, anon, authenticated;
revoke all on function
  public.complete_retention_claim_push_phase2c(uuid,text,uuid,jsonb)
from public, anon, authenticated;
revoke all on function
  public.get_retention_claim_push_execution_phase2c(uuid,uuid)
from public, anon, authenticated;
revoke all on function
  public.adopt_legacy_voided_retention_claim_phase2c(jsonb)
from public, anon, authenticated;
revoke all on function
  public.queue_retention_claim_attachment_retry_phase2c(uuid,uuid)
from public, anon, authenticated;
grant execute on function
  public.get_retention_claim_xero_source_phase2c(uuid)
to service_role;
grant execute on function
  public.persist_retention_claim_push_proposal_phase2c(jsonb)
to service_role;
grant execute on function
  public.confirm_retention_claim_push_phase2c(jsonb)
to service_role;
grant execute on function
  public.complete_retention_claim_push_phase2c(uuid,text,uuid,jsonb)
to service_role;
grant execute on function
  public.get_retention_claim_push_execution_phase2c(uuid,uuid)
to service_role;
grant execute on function
  public.adopt_legacy_voided_retention_claim_phase2c(jsonb)
to service_role;
grant execute on function
  public.queue_retention_claim_attachment_retry_phase2c(uuid,uuid)
to service_role;

commit;
