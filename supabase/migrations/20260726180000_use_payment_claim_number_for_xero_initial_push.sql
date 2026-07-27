begin;

-- New Payment Claims use PC while historical CL numbers continue to occupy
-- their original project sequence. Existing rows are never rewritten.
create or replace function public.generate_project_claim_number(
  p_organization_id uuid,
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_project_code text;
  next_sequence integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;
  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_project_id::text || ':claim-number'));

  select coalesce(
           nullif(btrim(project_code), ''),
           nullif(regexp_replace(upper(coalesce(slug, '')), '[^A-Z0-9]+', '-', 'g'), ''),
           'JOB'
         )
    into resolved_project_code
  from public.organization_projects
  where id = p_project_id
    and organization_id = p_organization_id;
  if resolved_project_code is null then
    raise exception 'Could not resolve project code for claim numbering';
  end if;

  with used as (
    select distinct substring(c.claim_number from '([0-9]+)$')::integer as n
    from public.project_claims c
    where c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.claim_number ~ '.*-(CL|PC)-[0-9]+$'
  ),
  bounds as (
    select coalesce(max(n), 0) as max_n from used
  ),
  candidates as (
    select generate_series(1, greatest((select max_n from bounds) + 1, 1)) as n
  )
  select min(c.n)
    into next_sequence
  from candidates c
  where not exists (select 1 from used u where u.n = c.n);

  return format('%s-PC-%s', resolved_project_code, lpad(next_sequence::text, 2, '0'));
end;
$$;

comment on function public.generate_project_claim_number(uuid, uuid) is
  'Allocates new <project>-PC-## Payment Claim numbers while preserving historical CL sequence occupancy.';

grant execute on function public.generate_project_claim_number(uuid, uuid)
  to authenticated;

-- Standard Payment Claim initial pushes intentionally bypass the dormant TSI
-- reservation infrastructure. This isolated helper preserves the Phase 2A
-- immutable revision, line, attachment, and event invariants.
create or replace function public.persist_payment_claim_initial_revision_phase2b(
  p_input jsonb
)
returns public.organization_accounting_document_revisions
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  document public.organization_accounting_documents%rowtype;
  claim public.project_claims%rowtype;
  revision public.organization_accounting_document_revisions%rowtype;
  line jsonb;
  attachment jsonb;
  line_subtotal bigint := 0;
  line_tax bigint := 0;
begin
  select * into document
  from public.organization_accounting_documents
  where id = (p_input->>'accountingDocumentId')::uuid
    and organization_id = (p_input->>'organizationId')::uuid
  for update;
  if not found
    or document.provider <> 'xero'
    or document.local_document_type <> 'project_claim'
    or document.integration_contract <> 'payment_claim_revision_v1'
    or document.tenant_id <> p_input->>'tenantId'
    or document.accounting_connection_id <> (p_input->>'connectionId')::uuid
    or document.project_claim_id <> (p_input->>'sourceDocumentId')::uuid then
    raise exception 'Payment Claim accounting identity does not match the immutable document.';
  end if;
  if document.external_document_id is not null
    or document.active_accounting_revision_id is not null then
    raise exception 'Payment Claim accounting identity is already linked.';
  end if;

  select * into claim
  from public.project_claims c
  where c.id = document.project_claim_id
    and c.organization_id = document.organization_id
    and c.project_id = (p_input->>'projectId')::uuid;
  if not found then
    raise exception 'Payment Claim source identity was not found.';
  end if;
  if nullif(trim(claim.claim_number), '') is null
    or p_input->>'externalDocumentNumber' <> claim.claim_number
    or p_input#>>'{payloadSnapshot,InvoiceNumber}' <> claim.claim_number
    or p_input#>>'{commercialSnapshot,commercialClaimNumber}' <> claim.claim_number then
    raise exception 'Immutable Xero InvoiceNumber must equal the Payment Claim number.';
  end if;
  if nullif(p_input->>'numberReservationId', '') is not null then
    raise exception 'Standard Payment Claim initial pushes must not use an accounting number reservation.';
  end if;
  if p_input->>'revisionIntent' <> 'initial_push'
    or p_input->>'resolutionStrategy' <> 'new_document'
    or nullif(p_input->>'previousRevisionId', '') is not null
    or p_input->>'providerDocumentType' <> 'ACCREC'
    or p_input->>'requestedProviderStatus' <> 'AUTHORISED' then
    raise exception 'Invalid standard Payment Claim initial revision contract.';
  end if;
  if exists (
    select 1 from public.organization_accounting_document_revisions r
    where r.accounting_document_id = document.id
  ) then
    raise exception 'A Payment Claim accounting revision already exists.';
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

  if jsonb_array_length(coalesce(p_input->'attachments', '[]'::jsonb)) <> 1
    or p_input#>>'{attachments,0,filename}' <> claim.claim_number || '-r0001.pdf' then
    raise exception 'Immutable Payment Claim PDF filename must use the Payment Claim number.';
  end if;

  insert into public.organization_accounting_document_revisions(
    organization_id, project_id, accounting_document_id, revision_sequence,
    source_document_type, source_document_id, revision_intent,
    resolution_strategy, previous_revision_id, provider, connection_id,
    tenant_id, number_reservation_id, external_document_number,
    commercial_snapshot, contact_snapshot, routing_snapshot, tax_snapshot,
    attachment_snapshot, payload_snapshot, canonical_schema_version,
    source_evidence_hash, commercial_hash, lines_hash, payload_hash,
    provider_content_hash, pdf_hash, currency_code, provider_document_type,
    requested_provider_status, line_amount_type, subtotal_minor, tax_minor,
    total_minor, confirmation_preview_hash, confirmed_by, confirmed_at,
    confirmation_reason
  ) values (
    document.organization_id, (p_input->>'projectId')::uuid, document.id, 1,
    'project_claim', document.project_claim_id, 'initial_push',
    'new_document', null, 'xero', document.accounting_connection_id,
    document.tenant_id, null, claim.claim_number,
    p_input->'commercialSnapshot', p_input->'contactSnapshot',
    p_input->'routingSnapshot', p_input->'taxSnapshot',
    p_input->'attachmentSnapshot', p_input->'payloadSnapshot',
    p_input->>'canonicalSchemaVersion', p_input->>'sourceEvidenceHash',
    p_input->>'commercialHash', p_input->>'linesHash',
    p_input->>'payloadHash', p_input->>'providerContentHash',
    nullif(p_input->>'pdfHash', ''), p_input->>'currencyCode', 'ACCREC',
    'AUTHORISED', p_input->>'lineAmountType',
    (p_input->>'subtotalMinor')::bigint, (p_input->>'taxMinor')::bigint,
    (p_input->>'totalMinor')::bigint, p_input->>'confirmationPreviewHash',
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
    select value from jsonb_array_elements(p_input->'attachments')
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

revoke all on function public.persist_payment_claim_initial_revision_phase2b(jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_payment_claim_initial_revision_phase2b(jsonb)
  to service_role;

create or replace function public.confirm_payment_claim_initial_push_phase2b_impl(
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
  v_document public.organization_accounting_documents%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_attachment public.organization_accounting_revision_attachments%rowtype;
  v_payload jsonb;
  v_pdf bytea;
  v_pdf_hash text;
  v_payload_hash text;
  v_idempotency text;
  v_job_id uuid;
  v_invoice_number text;
begin
  if not private.phase2b_actor_has_push_permission(v_org, v_actor) then
    raise exception 'Payment Claim initial Push to Xero permission is required.';
  end if;
  if not exists (
    select 1 from public.organization_accounting_phase2b_settings s
    where s.organization_id = v_org
      and s.initial_payment_claim_push_enabled
  ) then
    raise exception 'Immutable Payment Claim Push to Xero is not enabled.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2600));
  select * into v_claim_row
  from public.project_claims c
  where c.id = v_claim
    and c.organization_id = v_org
    and c.project_id = v_project
  for update;
  if not found then raise exception 'Payment Claim is outside the organisation project.'; end if;
  if v_claim_row.status <> 'Submitted' then
    raise exception 'Payment Claim is no longer in an exportable state.';
  end if;
  if v_claim_row.updated_at::text <> p_input->>'sourceOptimisticRevision' then
    raise exception 'The Payment Claim changed after the accounting preview was created.';
  end if;
  v_invoice_number := nullif(trim(v_claim_row.claim_number), '');
  if v_invoice_number is null
    or p_input#>>'{payloadTemplate,InvoiceNumber}' <> v_invoice_number
    or p_input#>>'{commercialSnapshot,commercialClaimNumber}' <> v_invoice_number then
    raise exception 'The confirmed Xero InvoiceNumber must equal the Payment Claim number.';
  end if;
  if not exists (
    select 1 from public.organization_xero_connections c
    where c.id = v_connection and c.organization_id = v_org
      and c.status = 'connected' and c.tenant_id = v_tenant
  ) then
    raise exception 'The Xero connection or selected tenant changed.';
  end if;

  select * into v_document
  from public.organization_accounting_documents d
  where d.organization_id = v_org
    and d.provider = 'xero'
    and d.tenant_id = v_tenant
    and d.local_document_type = 'project_claim'
    and d.project_claim_id = v_claim
  for update;
  if not found then
    insert into public.organization_accounting_documents(
      organization_id, accounting_connection_id, provider, tenant_id,
      local_document_type, local_document_id, project_claim_id,
      current_version_id, export_status, currency_code, integration_contract
    ) values (
      v_org, v_connection, 'xero', v_tenant,
      'project_claim', null, v_claim, null, 'not_ready', 'NZD',
      'payment_claim_revision_v1'
    ) returning * into v_document;
  end if;
  if v_document.accounting_connection_id <> v_connection
    or v_document.external_document_id is not null
    or v_document.active_accounting_revision_id is not null
    or v_document.integration_contract is distinct from 'payment_claim_revision_v1' then
    raise exception 'Payment Claim accounting identity is already linked or incompatible.';
  end if;
  if exists (
    select 1 from public.organization_accounting_document_revisions r
    where r.accounting_document_id = v_document.id
      and r.revision_intent = 'initial_push'
  ) then
    raise exception 'An immutable initial-push revision already exists.';
  end if;

  v_pdf := decode(p_input->>'pdfBase64', 'base64');
  v_pdf_hash := encode(digest(v_pdf, 'sha256'), 'hex');
  if v_pdf_hash <> p_input->>'pdfHash'
    or octet_length(v_pdf) <> (p_input->>'pdfByteSize')::bigint
    or substring(v_pdf from 1 for 4) <> decode('25504446', 'hex') then
    raise exception 'Confirmed Payment Claim PDF evidence is invalid.';
  end if;

  v_payload := p_input->'payloadTemplate';
  v_payload_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

  select * into v_revision
  from public.persist_payment_claim_initial_revision_phase2b(
    jsonb_build_object(
      'organizationId', v_org,
      'projectId', v_project,
      'accountingDocumentId', v_document.id,
      'sourceDocumentType', 'project_claim',
      'sourceDocumentId', v_claim,
      'revisionIntent', 'initial_push',
      'resolutionStrategy', 'new_document',
      'previousRevisionId', null,
      'provider', 'xero',
      'connectionId', v_connection,
      'tenantId', v_tenant,
      'numberReservationId', null,
      'externalDocumentNumber', v_invoice_number,
      'commercialSnapshot', p_input->'commercialSnapshot',
      'contactSnapshot', p_input->'contactSnapshot',
      'routingSnapshot', p_input->'routingSnapshot',
      'taxSnapshot', p_input->'taxSnapshot',
      'attachmentSnapshot', jsonb_build_object(
        'contentSha256', v_pdf_hash,
        'byteSize', octet_length(v_pdf),
        'statutoryDocumentsIncluded', p_input->'statutoryDocumentsIncluded'
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
      'confirmationReason', null,
      'correlationId', p_input->>'proposalId',
      'lines', p_input->'lines',
      'attachments', jsonb_build_array(jsonb_build_object(
        'sequence', 1,
        'kind', 'claim_pdf',
        'sourceDocumentId', v_claim,
        'filename', v_invoice_number || '-r0001.pdf',
        'contentType', 'application/pdf',
        'byteSize', octet_length(v_pdf),
        'contentSha256', v_pdf_hash,
        'storageBucket', 'accounting-revision-evidence',
        'storagePath', v_org || '/' || v_document.id || '/revision-1/claim.pdf'
      ))
    )
  );

  select * into v_attachment
  from public.organization_accounting_revision_attachments a
  where a.accounting_revision_id = v_revision.id and a.attachment_sequence = 1;
  insert into public.organization_accounting_revision_blobs(
    accounting_revision_id, organization_id, attachment_id, content_type,
    byte_size, content_sha256, content_bytes
  ) values (
    v_revision.id, v_org, v_attachment.id, 'application/pdf',
    octet_length(v_pdf), v_pdf_hash, v_pdf
  );

  v_idempotency := encode(
    digest(('xero:payment_claim:initial_push:' || v_revision.id)::bytea, 'sha256'),
    'hex'
  );
  select * into v_attempt
  from public.create_accounting_revision_attempt_phase2a(
    v_revision.id, 'create', v_idempotency,
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'payloadHash', v_payload_hash,
      'tenantId', v_tenant,
      'intent', 'initial_push'
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
    v_org, 'xero', v_connection, 'xero.payment_claim.initial_push', 'user_export',
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attempt.id,
      'payloadHash', v_payload_hash,
      'tenantId', v_tenant,
      'intent', 'initial_push'
    ),
    '{}'::jsonb, v_idempotency, 5, v_actor
  ) returning id into v_job_id;

  update public.organization_accounting_documents
  set export_status = 'queued', updated_at = now()
  where id = v_document.id;

  return jsonb_build_object(
    'accountingDocumentId', v_document.id,
    'accountingRevisionId', v_revision.id,
    'attemptId', v_attempt.id,
    'jobId', v_job_id,
    'invoiceNumber', v_invoice_number,
    'revisionSequence', v_revision.revision_sequence,
    'pdfFilename', v_attachment.filename,
    'status', 'queued'
  );
end;
$$;

revoke all on function public.confirm_payment_claim_initial_push_phase2b_impl(jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_initial_push_phase2b_impl(jsonb)
  to service_role;

commit;
