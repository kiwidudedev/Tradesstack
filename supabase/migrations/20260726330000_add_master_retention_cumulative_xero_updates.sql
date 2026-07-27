begin;

alter table public.retention_claims
  add column if not exists master_role text;

alter table public.retention_claims
  drop constraint if exists retention_claims_master_role_check;
alter table public.retention_claims
  add constraint retention_claims_master_role_check check (
    master_role is null
    or master_role in (
      'master_retention_claim',
      'obsolete_automatic_draft',
      'legacy_separate_claim'
    )
  );

select set_config('app.retention_phase4_submission_write', 'true', true);

-- A stable accounting identity is conclusive master evidence.
update public.retention_claims claim
set master_role = 'master_retention_claim'
where exists (
  select 1
  from public.organization_accounting_documents document
  where document.organization_id = claim.organization_id
    and document.retention_claim_id = claim.id
    and document.local_document_type = 'retention_claim'
    and document.integration_contract = 'retention_claim_revision_v1'
);

-- Preserve untouched automatic successors as historical evidence, but ensure
-- they can never become another project master.
update public.retention_claims claim
set master_role = 'obsolete_automatic_draft'
where claim.status = 'draft'
  and claim.draft_kind = 'automatic_rolling'
  and claim.master_role is null
  and not exists (
    select 1 from public.retention_claim_allocations allocation
    where allocation.retention_claim_id = claim.id
  )
  and not exists (
    select 1 from public.retention_claim_documents document
    where document.retention_claim_id = claim.id
  )
  and not exists (
    select 1
    from public.organization_accounting_documents document
    where document.retention_claim_id = claim.id
  );

update public.retention_claims
set master_role = 'legacy_separate_claim'
where master_role is null;

select set_config('app.retention_phase4_submission_write', '', true);

alter table public.retention_claims
  alter column master_role set default 'master_retention_claim';

create unique index if not exists
  retention_claims_one_master_per_project_uidx
on public.retention_claims(organization_id, project_id)
where master_role = 'master_retention_claim';

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
      'xero.retention_claim.update',
      'xero.payment_claim.initial_push',
      'xero.payment_claim.initial_push.attachment',
      'xero.payment_claim.replacement',
      'xero.payment_claim.replacement.attachment'
    )
  );

drop index if exists
  public.organization_accounting_sync_jobs_active_retention_revision_uidx;
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
    'xero.retention_claim.replacement.attachment',
    'xero.retention_claim.update'
  );

-- The cumulative master source is authoritative structured data derived from
-- submitted Payment Claims. It deliberately ignores Retention allocations and
-- requires no Retention document or PDF.
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
      greatest(master.submitted_at, position.latest_origin_at) as revised_at,
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
  select * into v_claim from public.retention_claims
  where id = p_retention_claim_id;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_found'
    );
  end if;
  if v_claim.master_role <> 'master_retention_claim' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'not_master_retention_claim'
    );
  end if;
  if not exists (
    select 1 from public.organization_accounting_phase2b_settings setting
    where setting.organization_id = v_claim.organization_id
      and setting.retention_claim_immutable_xero_enabled
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'feature_disabled'
    );
  end if;
  v_source := private.master_retention_claim_source(v_claim.id);
  if v_source is null
    or jsonb_array_length(v_source->'allocations') = 0 then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'no_submitted_retention'
    );
  end if;
  v_hash := encode(digest(convert_to(v_source::text, 'UTF8'), 'sha256'), 'hex');
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

revoke all on function private.master_retention_claim_source(uuid)
  from public, anon, authenticated;
revoke all on function public.get_retention_claim_xero_source_phase2c(uuid)
  from public, anon, authenticated;
grant execute on function public.get_retention_claim_xero_source_phase2c(uuid)
  to service_role;

-- Confirm initial and cumulative master pushes from structured evidence only.
-- Replacement remains on the existing controlled replacement path.
create or replace function public.confirm_master_retention_claim_push(
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
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_proposal public.organization_accounting_push_proposals%rowtype;
  v_reservation public.organization_accounting_number_reservations%rowtype;
  v_source jsonb;
  v_source_hash text;
  v_number text;
  v_global_sequence bigint;
  v_idempotency text;
  v_job_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Master Retention confirmation is server-only.';
  end if;
  if v_operation not in ('INITIAL_EXPORT', 'UPDATE_EXISTING_INVOICE') then
    raise exception 'The resolved master Retention operation is not executable.';
  end if;
  if not private.retention_phase2c_actor_can_push(v_org, v_actor) then
    raise exception 'Retention Claim Push to Xero permission is required.';
  end if;
  if not exists (
    select 1 from public.organization_accounting_phase2b_settings setting
    where setting.organization_id = v_org
      and setting.retention_claim_immutable_xero_enabled
  ) then
    raise exception 'Immutable Retention Claim Push to Xero is not enabled.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2633));
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
    digest(convert_to(v_source::text, 'UTF8'), 'sha256'), 'hex'
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
        where payment_claim.id = (line->>'originatingPaymentClaimId')::uuid
          and payment_claim.id = (line->>'sourceLineId')::uuid
          and payment_claim.organization_id = v_org
          and payment_claim.project_id = v_project
          and payment_claim.status = 'Submitted'
          and round(payment_claim.retention_withheld_amount * 100)::bigint =
            (line->>'lineAmountMinor')::bigint
      )
    ) then
    raise exception 'Cumulative Retention origin evidence changed.';
  end if;
  if not exists (
    select 1 from public.organization_xero_connections connection
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
    or v_proposal.operation <> v_operation
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
    raise exception 'The structured master Retention proposal is missing, expired, or stale.';
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
      raise exception 'The master Retention accounting document is missing.';
    end if;
    insert into public.organization_accounting_documents(
      organization_id, accounting_connection_id, provider, tenant_id,
      local_document_type, retention_claim_id, export_status,
      currency_code, integration_contract
    ) values (
      v_org, v_connection, 'xero', v_tenant,
      'retention_claim', v_claim, 'not_ready',
      'NZD', 'retention_claim_revision_v1'
    ) returning * into v_document;
  end if;
  if v_document.accounting_connection_id <> v_connection
    or v_document.tenant_id <> v_tenant
    or v_document.integration_contract <> 'retention_claim_revision_v1' then
    raise exception 'The master Retention accounting identity changed.';
  end if;

  select * into v_revision
  from public.organization_accounting_document_revisions revision
  where revision.accounting_document_id = v_document.id
    and revision.confirmation_preview_hash = p_input->>'previewHash'
    and revision.external_document_number = p_input->>'externalDocumentNumber'
  order by revision.revision_sequence
  limit 1;
  if found then
    select * into v_attempt
    from public.organization_accounting_revision_attempts attempt
    where attempt.accounting_revision_id = v_revision.id
      and attempt.attempt_intent in ('create', 'update')
    order by attempt.attempt_sequence
    limit 1;
    select job.id into v_job_id
    from public.organization_accounting_sync_jobs job
    where job.organization_id = v_org
      and job.job_kind in (
        'xero.retention_claim.initial_push',
        'xero.retention_claim.update'
      )
      and job.request_payload->>'accountingRevisionId' = v_revision.id::text
    order by job.created_at
    limit 1;
    if v_attempt.id is null or v_job_id is null then
      raise exception 'The existing master Retention confirmation is incomplete.';
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

  v_number := v_claim_row.claim_number;
  if p_input->>'externalDocumentNumber' <> v_number
    or p_input->'payloadTemplate'->>'InvoiceNumber' <> v_number
    or p_input->'payloadTemplate'->>'Type' <> 'ACCREC'
    or p_input->'payloadTemplate'->>'Status' <> 'AUTHORISED' then
    raise exception 'The confirmed master Retention invoice identity is stale.';
  end if;
  if v_operation = 'INITIAL_EXPORT' then
    if v_document.active_accounting_revision_id is not null
      or v_document.external_document_id is not null
      or exists (
        select 1 from public.organization_accounting_document_revisions revision
        where revision.accounting_document_id = v_document.id
      ) then
      raise exception 'An initial master Retention revision already exists.';
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
      'retention_claim', v_claim, 'retention_claim_initial_push', v_actor
    ) returning * into v_reservation;
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
      or v_previous.external_document_number <> v_number
      or v_document.external_document_id <> v_previous.external_document_id
      or v_document.external_document_number <> v_number then
      raise exception 'The active master Retention Xero invoice changed.';
    end if;
    select * into v_projection
    from public.organization_accounting_projections
    where accounting_document_id = v_document.id
      and accounting_revision_id = v_previous.id
    for update;
    if not found
      or v_projection.normalized_invoice_status not in (
        'authorised', 'awaiting_payment'
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
    if not found
      or v_observation.id <> (p_input->>'previousObservationId')::uuid
      or upper(coalesce(v_observation.raw_status, '')) <> 'AUTHORISED'
      or jsonb_array_length(
        coalesce(v_observation.raw_observation->'Payments', '[]'::jsonb)
      ) <> 0
      or jsonb_array_length(
        coalesce(v_observation.raw_observation->'CreditNotes', '[]'::jsonb)
      ) <> 0 then
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
  end if;

  select * into v_revision
  from public.persist_confirmed_accounting_revision_phase2a(
    jsonb_build_object(
      'organizationId', v_org,
      'projectId', v_project,
      'accountingDocumentId', v_document.id,
      'sourceDocumentType', 'retention_claim',
      'sourceDocumentId', v_claim,
      'revisionIntent', case when v_operation = 'INITIAL_EXPORT'
        then 'initial_push' else 'direct_update' end,
      'resolutionStrategy', case when v_operation = 'INITIAL_EXPORT'
        then 'new_document' else 'update_existing' end,
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
      'confirmationReason', case when v_operation = 'INITIAL_EXPORT'
        then null else 'New cumulative Retention added' end,
      'correlationId', p_input->>'proposalId',
      'lines', p_input->'lines',
      'attachments', '[]'::jsonb
    )
  );
  v_idempotency := encode(digest(convert_to(
    'xero:master_retention:' ||
    case when v_operation = 'INITIAL_EXPORT' then 'create:' else 'update:' end ||
    v_revision.id,
    'UTF8'
  ), 'sha256'), 'hex');
  select * into v_attempt
  from public.create_accounting_revision_attempt_phase2a(
    v_revision.id,
    case when v_operation = 'INITIAL_EXPORT' then 'create' else 'update' end,
    v_idempotency,
    jsonb_build_object(
      'accountingDocumentId', v_document.id,
      'accountingRevisionId', v_revision.id,
      'previousRevisionId', v_previous.id,
      'externalDocumentId', v_previous.external_document_id,
      'payloadHash', p_input->>'payloadHash',
      'tenantId', v_tenant,
      'intent', case when v_operation = 'INITIAL_EXPORT'
        then 'initial_push' else 'direct_update' end
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
      else 'xero.retention_claim.update' end,
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

create or replace function public.get_master_retention_claim_execution(
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
  left join public.organization_accounting_document_revisions previous
    on previous.id = revision.previous_revision_id
  where revision.id = p_revision_id
    and revision.source_document_type = 'retention_claim'
    and document.integration_contract = 'retention_claim_revision_v1';
$$;

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
    or v_revision.revision_intent not in ('initial_push', 'direct_update')
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
    if v_document.active_accounting_revision_id <> v_previous.id
      or v_document.external_document_id <> v_previous.external_document_id
      or p_result->>'externalDocumentId' <> v_previous.external_document_id
      or v_revision.external_document_number <>
        v_previous.external_document_number then
      raise exception 'The master Retention predecessor changed before activation.';
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

revoke all on function public.confirm_master_retention_claim_push(jsonb)
  from public, anon, authenticated;
revoke all on function public.get_master_retention_claim_execution(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.complete_master_retention_claim_push(uuid,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_master_retention_claim_push(jsonb)
  to service_role;
grant execute on function public.get_master_retention_claim_execution(uuid,uuid)
  to service_role;
grant execute on function public.complete_master_retention_claim_push(uuid,text,uuid,jsonb)
  to service_role;

commit;
