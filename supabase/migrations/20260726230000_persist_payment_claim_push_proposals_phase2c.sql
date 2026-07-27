begin;

create or replace function public.persist_payment_claim_push_proposal_phase2c(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p_input->>'proposalId')::uuid;
  v_operation text := p_input->>'operation';
  v_document_id uuid := nullif(p_input->>'accountingDocumentId', '')::uuid;
begin
  insert into public.organization_accounting_push_proposals(
    id, organization_id, project_id, source_document_type, source_document_id,
    accounting_document_id, active_revision_id, operation, external_document_number,
    preview_hash, source_optimistic_revision, decision_snapshot, evidence_hashes,
    expires_at, created_by
  ) values (
    v_id,
    (p_input->>'organizationId')::uuid,
    (p_input->>'projectId')::uuid,
    'project_claim',
    (p_input->>'claimId')::uuid,
    v_document_id,
    nullif(p_input->>'activeRevisionId', '')::uuid,
    v_operation,
    p_input->>'externalDocumentNumber',
    p_input->>'previewHash',
    p_input->>'sourceOptimisticRevision',
    p_input->'decisionSnapshot',
    p_input->'evidenceHashes',
    (p_input->>'expiresAt')::timestamptz,
    (p_input->>'createdBy')::uuid
  );

  if v_operation = 'REPLACEMENT_EXPORT' and v_document_id is not null then
    insert into public.organization_accounting_events(
      organization_id, accounting_document_id, accounting_revision_id,
      event_type, actor_user_id, correlation_id, event_evidence
    ) values (
      (p_input->>'organizationId')::uuid,
      v_document_id,
      nullif(p_input->>'activeRevisionId', '')::uuid,
      'replacement_proposed',
      (p_input->>'createdBy')::uuid,
      v_id::text,
      jsonb_build_object(
        'operation', v_operation,
        'previousInvoiceId', p_input#>>'{decisionSnapshot,previousInvoiceId}',
        'previousInvoiceNumber', p_input#>>'{decisionSnapshot,previousInvoiceNumber}',
        'replacementInvoiceNumber', p_input->>'externalDocumentNumber',
        'previewHash', p_input->>'previewHash'
      )
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.persist_payment_claim_push_proposal_phase2c(jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_payment_claim_push_proposal_phase2c(jsonb)
  to service_role;

commit;
