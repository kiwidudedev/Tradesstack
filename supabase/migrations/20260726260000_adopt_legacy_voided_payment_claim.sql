begin;

create or replace function public.adopt_legacy_voided_payment_claim_phase2c(
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
  v_actor uuid := (p_input->>'adoptedBy')::uuid;
  v_connection uuid := (p_input->>'connectionId')::uuid;
  v_tenant text := p_input->>'tenantId';
  v_invoice_id text := p_input->>'externalDocumentId';
  v_invoice_number text := p_input->>'externalDocumentNumber';
  v_document public.organization_accounting_documents%rowtype;
  v_existing public.organization_accounting_document_revisions%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_classification public.organization_accounting_legacy_classifications%rowtype;
  v_claim_row public.project_claims%rowtype;
  v_line jsonb;
  v_line_subtotal bigint;
  v_line_tax bigint;
  v_remote jsonb := p_input->'rawObservation';
begin
  if not private.phase2b_actor_has_push_permission(v_org, v_actor) then
    raise exception 'Payment Claim Push to Xero permission is required.';
  end if;
  if not exists (
    select 1
    from public.organization_accounting_phase2b_settings s
    where s.organization_id = v_org
      and s.initial_payment_claim_push_enabled
  ) then
    raise exception 'Immutable Payment Claim Push to Xero is not enabled.';
  end if;
  if nullif(trim(v_invoice_id), '') is null
    or nullif(trim(v_invoice_number), '') is null
    or nullif(trim(v_tenant), '') is null then
    raise exception 'The legacy Xero identity is incomplete.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2602));

  select * into v_claim_row
  from public.project_claims
  where id = v_claim
    and organization_id = v_org
    and project_id = v_project
  for update;
  if not found or v_claim_row.status <> 'Submitted' then
    raise exception 'Payment Claim is no longer in an exportable state.';
  end if;
  if v_claim_row.updated_at::text <> p_input->>'sourceOptimisticRevision' then
    raise exception 'The Payment Claim changed before legacy adoption.';
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

  select * into v_document
  from public.organization_accounting_documents
  where organization_id = v_org
    and provider = 'xero'
    and local_document_type = 'project_claim'
    and project_claim_id = v_claim
  for update;

  if not found then
    insert into public.organization_accounting_documents(
      organization_id, accounting_connection_id, provider, tenant_id,
      local_document_type, local_document_id, project_claim_id,
      current_version_id, external_document_id, external_document_number,
      raw_external_status, normalized_external_status, export_status,
      amount_exported, tax_exported, currency_code, exported_by, exported_at,
      last_synced_at, last_synced_hash, integration_contract
    ) values (
      v_org, v_connection, 'xero', v_tenant,
      'project_claim', null, v_claim,
      null, v_invoice_id, v_invoice_number,
      'VOIDED', 'voided', 'exported',
      (p_input->>'totalMinor')::numeric / 100,
      (p_input->>'taxMinor')::numeric / 100,
      p_input->>'currencyCode', v_actor,
      nullif(p_input->>'providerUpdatedAt', '')::timestamptz,
      now(), p_input#>>'{commercialSnapshot,currentStateHash}',
      'payment_claim_revision_v1'
    )
    returning * into v_document;
  end if;

  if v_document.accounting_connection_id <> v_connection
    or v_document.tenant_id <> v_tenant
    or v_document.external_document_id <> v_invoice_id
    or v_document.external_document_number <> v_invoice_number then
    raise exception 'The legacy Xero identity changed before adoption.';
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
    raise exception 'An immutable accounting revision already exists for this Payment Claim.';
  end if;
  if v_document.integration_contract is not null
    and v_document.integration_contract <> 'payment_claim_revision_v1' then
    raise exception 'The accounting document uses an unsupported integration contract.';
  end if;

  if v_remote->>'Type' <> 'ACCREC'
    or v_remote->>'Status' <> 'VOIDED'
    or v_remote->>'InvoiceID' <> v_invoice_id
    or v_remote->>'InvoiceNumber' <> v_invoice_number
    or coalesce((v_remote->>'AmountPaid')::numeric, 0) <> 0
    or coalesce((v_remote->>'AmountCredited')::numeric, 0) <> 0
    or jsonb_array_length(coalesce(v_remote->'Payments', '[]'::jsonb)) <> 0
    or jsonb_array_length(coalesce(v_remote->'CreditNotes', '[]'::jsonb)) <> 0 then
    raise exception 'The predecessor is not a confirmed unsettled VOIDED Sales Invoice.';
  end if;
  if round((v_remote->>'SubTotal')::numeric * 100)::bigint <> (p_input->>'subtotalMinor')::bigint
    or round((v_remote->>'TotalTax')::numeric * 100)::bigint <> (p_input->>'taxMinor')::bigint
    or round((v_remote->>'Total')::numeric * 100)::bigint <> (p_input->>'totalMinor')::bigint
    or (p_input->>'subtotalMinor')::bigint + (p_input->>'taxMinor')::bigint
      <> (p_input->>'totalMinor')::bigint then
    raise exception 'The adopted Xero totals do not reconcile.';
  end if;

  select
    coalesce(sum((value->>'lineAmountMinor')::bigint), 0),
    coalesce(sum((value->>'taxMinor')::bigint), 0)
  into v_line_subtotal, v_line_tax
  from jsonb_array_elements(p_input->'lines');
  if v_line_subtotal <> (p_input->>'subtotalMinor')::bigint
    or v_line_tax <> (p_input->>'taxMinor')::bigint then
    raise exception 'The adopted Xero lines do not reconcile.';
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
    'project_claim', v_claim, 'legacy_import',
    'legacy_preservation', null, 'xero', v_connection,
    v_tenant, null, v_invoice_id,
    v_invoice_number, p_input->'commercialSnapshot',
    p_input->'contactSnapshot', p_input->'routingSnapshot',
    p_input->'taxSnapshot',
    jsonb_build_object(
      'provenance', 'legacy_adoption',
      'evidenceQuality', p_input->>'evidenceQuality'
    ),
    p_input->'payloadSnapshot', p_input->>'canonicalSchemaVersion',
    p_input->>'sourceEvidenceHash', p_input->>'commercialHash',
    p_input->>'linesHash', p_input->>'payloadHash',
    p_input->>'providerContentHash', null,
    p_input->>'currencyCode', 'ACCREC', 'AUTHORISED',
    p_input->>'lineAmountType',
    (p_input->>'subtotalMinor')::bigint,
    (p_input->>'taxMinor')::bigint,
    (p_input->>'totalMinor')::bigint,
    p_input->>'confirmationPreviewHash', v_actor, now(),
    'Historical Xero invoice adopted from reconstructed current evidence.',
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
      v_claim, v_line->>'description',
      (v_line->>'quantity')::numeric,
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
  set active_accounting_revision_id = v_revision.id,
      integration_contract = 'payment_claim_revision_v1',
      raw_external_status = 'VOIDED',
      normalized_external_status = 'voided',
      export_status = 'exported',
      amount_paid = 0,
      amount_due = (p_input->>'totalMinor')::numeric / 100,
      amount_credited = 0,
      last_status_synced_at = now(),
      last_status_sync_error = 'The linked Xero Sales Invoice is voided or deleted.',
      updated_at = now()
  where id = v_document.id
    and organization_id = v_org
    and active_accounting_revision_id is null;
  if not found then
    raise exception 'Legacy adoption lost its accounting document lock.';
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
      'remoteObservationId', v_observation.id
    ),
    p_input->>'sourceEvidenceHash', v_actor
  )
  returning * into v_classification;

  perform set_config('app.accounting_phase2a_pointer_write', 'true', true);
  update public.organization_accounting_documents
  set current_legacy_classification_id = v_classification.id
  where id = v_document.id and organization_id = v_org;
  perform set_config('app.accounting_phase2a_pointer_write', '', true);

  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, actor_user_id, correlation_id, event_evidence
  ) values
    (
      v_org, v_document.id, v_revision.id,
      'legacy_adopted', v_actor, p_input->>'correlationId',
      jsonb_build_object(
        'provenance', 'legacy_adoption',
        'evidenceQuality', p_input->>'evidenceQuality',
        'externalDocumentId', v_invoice_id,
        'externalDocumentNumber', v_invoice_number,
        'remoteObservationId', v_observation.id,
        'xeroPostPerformed', false
      )
    ),
    (
      v_org, v_document.id, v_revision.id,
      'legacy_adoption_activated', v_actor, p_input->>'correlationId',
      jsonb_build_object('activeRevisionId', v_revision.id)
    );

  return jsonb_build_object(
    'accountingDocumentId', v_document.id,
    'accountingRevisionId', v_revision.id,
    'remoteObservationId', v_observation.id,
    'adopted', true
  );
end;
$$;

revoke all on function public.adopt_legacy_voided_payment_claim_phase2c(jsonb)
from public, anon, authenticated;
grant execute on function public.adopt_legacy_voided_payment_claim_phase2c(jsonb)
to service_role;

commit;
