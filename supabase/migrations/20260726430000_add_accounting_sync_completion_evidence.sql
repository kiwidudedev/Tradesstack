-- Exact, read-only completion evidence for synchronous Accounting Sync actions.
-- Service-only: browser roles cannot execute this function.

create or replace function public.get_accounting_sync_completion_evidence(
  p_organization_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.organization_accounting_sync_jobs%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_proposal public.organization_accounting_push_proposals%rowtype;
  v_source_matches boolean := false;
  v_revision_id uuid;
  v_document_id uuid;
  v_attempt_id uuid;
begin
  if p_organization_id is null or p_job_id is null then
    return null;
  end if;

  select *
  into v_job
  from public.organization_accounting_sync_jobs
  where organization_id = p_organization_id
    and id = p_job_id;

  if not found then
    return null;
  end if;

  v_revision_id := nullif(v_job.request_payload ->> 'accountingRevisionId', '')::uuid;
  v_document_id := nullif(v_job.request_payload ->> 'accountingDocumentId', '')::uuid;
  v_attempt_id := nullif(v_job.request_payload ->> 'attemptId', '')::uuid;

  if v_revision_id is not null then
    select *
    into v_revision
    from public.organization_accounting_document_revisions
    where organization_id = p_organization_id
      and id = v_revision_id;
    if found then
      v_document_id := v_revision.accounting_document_id;
    end if;
  end if;

  if v_document_id is null then
    return null;
  end if;

  select *
  into v_document
  from public.organization_accounting_documents
  where organization_id = p_organization_id
    and id = v_document_id;
  if not found then
    return null;
  end if;

  if v_revision_id is null then
    v_revision_id := v_document.active_accounting_revision_id;
    if v_revision_id is not null then
      select *
      into v_revision
      from public.organization_accounting_document_revisions
      where organization_id = p_organization_id
        and id = v_revision_id;
    end if;
  end if;

  if v_revision.id is null
    or v_document.active_accounting_revision_id is distinct from v_revision.id
    or v_revision.lifecycle_state <> 'succeeded'
    or v_revision.external_document_id is null
  then
    return null;
  end if;

  if v_attempt_id is not null then
    select *
    into v_attempt
    from public.organization_accounting_revision_attempts
    where organization_id = p_organization_id
      and id = v_attempt_id
      and accounting_revision_id = v_revision.id;
  else
    select *
    into v_attempt
    from public.organization_accounting_revision_attempts
    where organization_id = p_organization_id
      and accounting_revision_id = v_revision.id
      and attempt_intent in ('create', 'update', 'replace')
    order by attempt_sequence desc, id desc
    limit 1;
  end if;

  if v_attempt.id is null or v_attempt.queue_state <> 'succeeded' then
    return null;
  end if;

  select *
  into v_proposal
  from public.organization_accounting_push_proposals
  where organization_id = p_organization_id
    and source_document_type = v_revision.source_document_type
    and source_document_id = v_revision.source_document_id
    and preview_hash = v_revision.confirmation_preview_hash
  order by created_at desc, id desc
  limit 1;

  if v_proposal.id is not null then
    if v_revision.source_document_type = 'project_claim' then
      select claim.updated_at =
        v_proposal.source_optimistic_revision::timestamptz
      into v_source_matches
      from public.project_claims claim
      where claim.organization_id = p_organization_id
        and claim.id = v_revision.source_document_id;
    elsif v_revision.source_document_type = 'retention_claim' then
      select claim.submitted_at =
        v_proposal.source_optimistic_revision::timestamptz
      into v_source_matches
      from public.retention_claims claim
      where claim.organization_id = p_organization_id
        and claim.id = v_revision.source_document_id;
    end if;
  end if;

  select *
  into v_observation
  from public.organization_accounting_remote_observations
  where organization_id = p_organization_id
    and accounting_document_id = v_document.id
    and accounting_revision_id = v_revision.id
    and external_document_id = v_revision.external_document_id
  order by observed_at desc, id desc
  limit 1;

  select *
  into v_projection
  from public.organization_accounting_projections
  where organization_id = p_organization_id
    and accounting_document_id = v_document.id
    and accounting_revision_id = v_revision.id
    and remote_observation_id = v_observation.id;

  if v_observation.id is null
    or v_projection.id is null
    or v_projection.divergent
    or v_observation.content_hash is distinct from v_revision.provider_content_hash
    or v_observation.tenant_id is distinct from v_revision.tenant_id
    or v_observation.external_document_id is distinct from v_revision.external_document_id
  then
    return null;
  end if;

  return jsonb_build_object(
    'organizationId', v_job.organization_id,
    'projectId', v_revision.project_id,
    'claimId', v_revision.source_document_id,
    'sourceDocumentType', v_revision.source_document_type,
    'accountingDocumentId', v_document.id,
    'activeRevisionId', v_revision.id,
    'observationId', v_observation.id,
    'projectionId', v_projection.id,
    'attemptId', v_attempt.id,
    'jobId', v_job.id,
    'invoiceId', v_revision.external_document_id,
    'invoiceNumber', v_revision.external_document_number,
    'operation', v_revision.revision_intent,
    'providerStatus', coalesce(v_observation.raw_status, v_revision.requested_provider_status),
    'subtotalMinor', v_revision.subtotal_minor,
    'taxMinor', v_revision.tax_minor,
    'totalMinor', v_revision.total_minor,
    'paidMinor', coalesce(v_projection.amount_paid_minor, 0),
    'creditedMinor', coalesce(v_projection.amount_credited_minor, 0),
    'outstandingMinor', coalesce(v_projection.amount_due_minor, v_revision.total_minor),
    'observedAt', v_observation.observed_at,
    'completedAt', v_attempt.completed_at,
    'sourceMatches', coalesce(v_source_matches, false),
    'document', to_jsonb(v_document),
    'revision', to_jsonb(v_revision),
    'observation', to_jsonb(v_observation),
    'projection', to_jsonb(v_projection)
  );
end;
$$;

revoke all on function public.get_accounting_sync_completion_evidence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_accounting_sync_completion_evidence(uuid, uuid)
  to service_role;
