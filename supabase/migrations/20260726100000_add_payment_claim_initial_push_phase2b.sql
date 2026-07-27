begin;

insert into public.app_permissions(permission_key, description)
values (
  'accounting.sales_invoices.push',
  'Preview and confirm an authorised Xero Sales Invoice from an immutable Payment Claim revision'
)
on conflict (permission_key) do update set description = excluded.description;

insert into public.role_permissions(role, permission_key, is_allowed)
values
  ('owner', 'accounting.sales_invoices.push', true),
  ('admin', 'accounting.sales_invoices.push', true),
  ('qs', 'accounting.sales_invoices.push', false),
  ('project_manager', 'accounting.sales_invoices.push', false),
  ('worker', 'accounting.sales_invoices.push', false)
on conflict (role, permission_key) do update
set is_allowed = excluded.is_allowed, updated_at = now();

create table public.organization_accounting_phase2b_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  initial_payment_claim_push_enabled boolean not null default false,
  enabled_by uuid null references auth.users(id) on delete set null,
  enabled_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint accounting_phase2b_settings_enabled_shape check (
    not initial_payment_claim_push_enabled or (enabled_by is not null and enabled_at is not null)
  )
);

alter table public.organization_accounting_phase2b_settings enable row level security;
alter table public.organization_accounting_phase2b_settings force row level security;

create policy "Accounting viewers can read Phase 2B rollout state"
on public.organization_accounting_phase2b_settings
for select to authenticated
using (public.has_org_permission(organization_id, 'accounting.sales_invoices.view'));

grant select on public.organization_accounting_phase2b_settings to authenticated;
grant select, insert, update on public.organization_accounting_phase2b_settings to service_role;

alter table public.organization_accounting_documents
  add column integration_contract text null,
  add constraint organization_accounting_documents_integration_contract_check
    check (integration_contract is null or integration_contract in ('payment_claim_revision_v1'));

create table public.organization_accounting_revision_blobs (
  accounting_revision_id uuid primary key
    references public.organization_accounting_document_revisions(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  attachment_id uuid not null unique
    references public.organization_accounting_revision_attachments(id) on delete restrict,
  content_type text not null,
  byte_size bigint not null,
  content_sha256 text not null,
  content_bytes bytea not null,
  created_at timestamptz not null default now(),
  constraint accounting_revision_blob_hash_check
    check (content_sha256 ~ '^[a-f0-9]{64}$'),
  constraint accounting_revision_blob_content_check check (
    content_type = 'application/pdf'
    and byte_size > 0
    and byte_size = octet_length(content_bytes)
  )
);

create or replace function public.reject_accounting_revision_blob_mutation()
returns trigger language plpgsql set search_path = public
as $$
begin
  raise exception 'Confirmed accounting PDF bytes are immutable.';
end;
$$;

create trigger reject_accounting_revision_blob_mutation
before update or delete on public.organization_accounting_revision_blobs
for each row execute function public.reject_accounting_revision_blob_mutation();

alter table public.organization_accounting_revision_blobs enable row level security;
alter table public.organization_accounting_revision_blobs force row level security;
revoke all on public.organization_accounting_revision_blobs from public, anon, authenticated;
revoke all on function public.reject_accounting_revision_blob_mutation()
  from public, anon, authenticated, service_role;

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
      'xero.payment_claim.initial_push.attachment'
    )
  );

create unique index organization_accounting_sync_jobs_active_phase2b_revision_uidx
on public.organization_accounting_sync_jobs (
  organization_id, provider, job_kind, (request_payload->>'accountingRevisionId')
)
where queue_state in ('pending', 'claimed', 'retry_scheduled')
  and job_kind in (
    'xero.payment_claim.initial_push',
    'xero.payment_claim.initial_push.attachment'
  );

-- Retention movements are negative Xero lines when retention is withheld.
-- Narrowly permit signed values only for immutable retention line evidence.
alter table public.organization_accounting_revision_lines
  drop constraint accounting_revision_line_amounts_check;
alter table public.organization_accounting_revision_lines
  add constraint accounting_revision_line_amounts_check check (
    quantity >= 0
    and (
      (line_kind <> 'retention' and line_amount_minor >= 0 and tax_minor >= 0)
      or
      (line_kind = 'retention'
        and sign(line_amount_minor) = sign(tax_minor)
        and line_amount_minor <> 0)
    )
    and total_minor = line_amount_minor + tax_minor
  );

create or replace function private.phase2b_actor_has_push_permission(
  p_organization_id uuid,
  p_actor_id uuid
)
returns boolean language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (
      select o.is_allowed
      from public.organization_members m
      join public.member_permission_overrides o
        on o.organization_member_id = m.id
       and o.permission_key = 'accounting.sales_invoices.push'
      where m.organization_id = p_organization_id
        and m.user_id = p_actor_id
      limit 1
    ),
    (
      select rp.is_allowed
      from public.organization_members m
      join public.role_permissions rp
        on rp.role = m.role
       and rp.permission_key = 'accounting.sales_invoices.push'
      where m.organization_id = p_organization_id
        and m.user_id = p_actor_id
      limit 1
    ),
    false
  );
$$;

create or replace function public.confirm_payment_claim_initial_push_phase2b(
  p_input jsonb
)
returns jsonb language plpgsql security definer
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
  v_reservation public.organization_accounting_number_reservations%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_attachment public.organization_accounting_revision_attachments%rowtype;
  v_payload jsonb;
  v_pdf bytea;
  v_pdf_hash text;
  v_payload_hash text;
  v_idempotency text;
  v_job_id uuid;
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

  select * into v_reservation
  from public.reserve_accounting_sales_invoice_number_phase2a(
    v_org, 'xero', v_tenant, 'project_claim', v_claim, v_document.id,
    v_actor, 'payment_claim_initial_push'
  );
  v_payload := jsonb_set(
    p_input->'payloadTemplate',
    '{InvoiceNumber}',
    to_jsonb(v_reservation.formatted_number),
    true
  );
  v_payload_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

  select * into v_revision
  from public.persist_confirmed_accounting_revision_phase2a(
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
      'numberReservationId', v_reservation.id,
      'externalDocumentNumber', v_reservation.formatted_number,
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
        'filename', v_reservation.formatted_number || '-r0001-' ||
          regexp_replace(coalesce(v_claim_row.claim_number, 'Payment-Claim'), '[^A-Za-z0-9._-]+', '-', 'g') || '.pdf',
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
    'invoiceNumber', v_reservation.formatted_number,
    'revisionSequence', v_revision.revision_sequence,
    'pdfFilename', v_attachment.filename,
    'status', 'queued'
  );
end;
$$;

create or replace function public.claim_accounting_revision_attempt_phase2b(
  p_attempt_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns public.organization_accounting_revision_attempts
language plpgsql security definer set search_path = public
as $$
declare v_attempt public.organization_accounting_revision_attempts%rowtype;
begin
  if nullif(trim(p_worker_id), '') is null or p_lease_seconds not between 10 and 900 then
    raise exception 'Invalid accounting attempt lease request.';
  end if;
  select * into v_attempt
  from public.organization_accounting_revision_attempts a
  where a.id = p_attempt_id
    and (
      a.queue_state = 'queued'
      or (a.queue_state = 'claimed' and a.lease_expires_at < now())
    )
  for update skip locked;
  if not found then return null; end if;
  perform set_config('app.accounting_phase2a_lease_write', 'true', true);
  update public.organization_accounting_revision_attempts set
    queue_state = 'claimed', worker_id = trim(p_worker_id),
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    heartbeat_at = now(), started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = p_attempt_id returning * into v_attempt;
  perform set_config('app.accounting_phase2a_lease_write', '', true);
  return v_attempt;
end;
$$;

create or replace function public.get_payment_claim_initial_push_execution_phase2b(
  p_revision_id uuid,
  p_attempt_id uuid
)
returns jsonb language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'document', to_jsonb(d),
    'revision', to_jsonb(r),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.sequence)
      from public.organization_accounting_revision_lines l
      where l.accounting_revision_id = r.id
    ), '[]'::jsonb),
    'attachment', to_jsonb(a),
    'pdfBase64', encode(b.content_bytes, 'base64'),
    'attempt', to_jsonb(at)
  )
  from public.organization_accounting_document_revisions r
  join public.organization_accounting_documents d on d.id = r.accounting_document_id
  join public.organization_accounting_revision_attempts at
    on at.id = p_attempt_id and at.accounting_revision_id = r.id
  join public.organization_accounting_revision_attachments a
    on a.accounting_revision_id = r.id and a.attachment_sequence = 1
  join public.organization_accounting_revision_blobs b
    on b.accounting_revision_id = r.id and b.attachment_id = a.id
  where r.id = p_revision_id
    and d.integration_contract = 'payment_claim_revision_v1';
$$;

create or replace function public.complete_payment_claim_initial_push_phase2b(
  p_attempt_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_result jsonb
)
returns boolean language plpgsql security definer
set search_path = public
as $$
declare
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_finalized boolean;
  v_attachment_attempt public.organization_accounting_revision_attempts%rowtype;
  v_attachment_key text;
begin
  select * into v_attempt
  from public.organization_accounting_revision_attempts
  where id = p_attempt_id for update;
  if not found
    or v_attempt.queue_state <> 'claimed'
    or v_attempt.worker_id <> p_worker_id
    or v_attempt.lease_token <> p_lease_token
    or v_attempt.lease_expires_at < now() then
    return false;
  end if;
  select * into v_revision
  from public.organization_accounting_document_revisions
  where id = v_attempt.accounting_revision_id for update;
  select * into v_document
  from public.organization_accounting_documents
  where id = v_revision.accounting_document_id for update;
  if v_revision.revision_intent <> 'initial_push'
    or v_revision.provider_document_type <> 'ACCREC'
    or v_revision.requested_provider_status <> 'AUTHORISED'
    or v_document.integration_contract <> 'payment_claim_revision_v1'
    or v_document.external_document_id is not null
    or p_result->>'externalDocumentNumber' <> v_revision.external_document_number
    or nullif(trim(p_result->>'externalDocumentId'), '') is null then
    raise exception 'Verified Xero result does not match the immutable initial-push identity.';
  end if;

  v_finalized := public.finalize_accounting_revision_attempt_phase2a(
    p_attempt_id, p_worker_id, p_lease_token, 'succeeded',
    'verified_authorised_invoice', 'Xero invoice exactly matched immutable revision.',
    p_result->'rawObservation'
  );
  if not v_finalized then return false; end if;

  update public.organization_accounting_documents set
    external_document_id = p_result->>'externalDocumentId',
    external_document_number = v_revision.external_document_number,
    amount_exported = (v_revision.total_minor::numeric / 100),
    tax_exported = (v_revision.tax_minor::numeric / 100),
    exported_by = v_revision.confirmed_by,
    exported_at = now(),
    last_synced_at = now(),
    raw_external_status = 'AUTHORISED',
    normalized_external_status = 'awaiting_payment',
    export_status = 'exported',
    last_synced_hash = v_revision.commercial_snapshot->>'currentStateHash',
    last_error_code = null,
    last_error_message = null,
    updated_at = now()
  where id = v_document.id and external_document_id is null;

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
  v_attachment_key := encode(
    digest(('xero:payment_claim:initial_push:attachment:' || v_revision.id)::bytea, 'sha256'),
    'hex'
  );
  select * into v_attachment_attempt
  from public.create_accounting_revision_attempt_phase2a(
    v_revision.id, 'attach', v_attachment_key,
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attachmentId', (
        select id from public.organization_accounting_revision_attachments
        where accounting_revision_id = v_revision.id and attachment_sequence = 1
      ),
      'tenantId', v_revision.tenant_id,
      'intent', 'initial_push_attachment'
    )
  );
  insert into public.organization_accounting_sync_jobs(
    organization_id, provider, connection_id, job_kind, trigger_source,
    request_payload, result_summary, idempotency_key, max_attempts,
    created_by_user_id
  ) values (
    v_revision.organization_id, 'xero', v_revision.connection_id,
    'xero.payment_claim.initial_push.attachment', 'user_export',
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'attemptId', v_attachment_attempt.id,
      'tenantId', v_revision.tenant_id,
      'intent', 'initial_push_attachment'
    ),
    '{}'::jsonb, v_attachment_key, 5, v_revision.confirmed_by
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return true;
end;
$$;

create or replace function public.record_payment_claim_initial_push_unverified_observation_phase2b(
  p_revision_id uuid,
  p_observation jsonb,
  p_reason text
)
returns uuid language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_id uuid;
  v_external_id text;
begin
  select * into v_revision
  from public.organization_accounting_document_revisions
  where id = p_revision_id;
  if not found or v_revision.revision_intent <> 'initial_push' then
    raise exception 'Immutable initial-push revision not found.';
  end if;
  v_external_id := coalesce(
    nullif(trim(p_observation->>'InvoiceID'), ''),
    nullif(trim(p_observation->>'invoiceID'), '')
  );
  if v_external_id is null then
    raise exception 'Unverified provider observation requires an InvoiceID.';
  end if;
  insert into public.organization_accounting_remote_observations(
    organization_id, accounting_document_id, accounting_revision_id,
    provider, tenant_id, external_document_id, provider_updated_at,
    raw_status, normalized_status, content_hash, settlement_hash,
    raw_observation
  ) values (
    v_revision.organization_id, v_revision.accounting_document_id, v_revision.id,
    'xero', v_revision.tenant_id, v_external_id, null,
    coalesce(p_observation->>'Status', p_observation->>'status'),
    'unverified',
    encode(digest(p_observation::text::bytea, 'sha256'), 'hex'),
    encode(digest(jsonb_build_object('unverified', true)::text::bytea, 'sha256'), 'hex'),
    p_observation
  ) returning id into v_id;
  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, event_evidence
  ) values (
    v_revision.organization_id, v_revision.accounting_document_id, v_revision.id,
    'initial_push_provider_mismatch',
    jsonb_build_object('remoteObservationId', v_id, 'reason', p_reason)
  );
  return v_id;
end;
$$;

revoke all on function private.phase2b_actor_has_push_permission(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_payment_claim_initial_push_phase2b(jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_accounting_revision_attempt_phase2b(uuid,text,integer)
  from public, anon, authenticated;
revoke all on function public.get_payment_claim_initial_push_execution_phase2b(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.complete_payment_claim_initial_push_phase2b(uuid,text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.record_payment_claim_initial_push_unverified_observation_phase2b(uuid,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_initial_push_phase2b(jsonb)
  to service_role;
grant execute on function public.claim_accounting_revision_attempt_phase2b(uuid,text,integer)
  to service_role;
grant execute on function public.get_payment_claim_initial_push_execution_phase2b(uuid,uuid)
  to service_role;
grant execute on function public.complete_payment_claim_initial_push_phase2b(uuid,text,uuid,jsonb)
  to service_role;
grant execute on function public.record_payment_claim_initial_push_unverified_observation_phase2b(uuid,jsonb,text)
  to service_role;

commit;
