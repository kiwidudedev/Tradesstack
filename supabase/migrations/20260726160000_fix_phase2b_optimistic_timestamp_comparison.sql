begin;

create or replace function public.confirm_payment_claim_initial_push_phase2b(
  p_input jsonb
)
returns jsonb language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_org uuid := (p_input->>'organizationId')::uuid;
  v_project uuid := (p_input->>'projectId')::uuid;
  v_claim uuid := (p_input->>'claimId')::uuid;
  v_source_revision timestamptz;
  v_claim_updated_at timestamptz;
  v_document public.organization_accounting_documents%rowtype;
  v_normalized_input jsonb;
begin
  begin
    v_source_revision := (p_input->>'sourceOptimisticRevision')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'The Payment Claim accounting preview has an invalid source revision.';
  end;
  if v_source_revision is null then
    raise exception 'The Payment Claim accounting preview has an invalid source revision.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2600));
  select c.updated_at into v_claim_updated_at
  from public.project_claims c
  where c.id = v_claim
    and c.organization_id = v_org
    and c.project_id = v_project
  for update;
  if not found then
    raise exception 'Payment Claim is outside the organisation project.';
  end if;
  if v_claim_updated_at is distinct from v_source_revision then
    raise exception 'The Payment Claim changed after the accounting preview was created.';
  end if;

  -- The verified Phase 2B implementation predates this wrapper and compares
  -- updated_at::text internally. Preserve that implementation while supplying
  -- PostgreSQL's own canonical text form after the semantic timestamp check.
  v_normalized_input := jsonb_set(
    p_input,
    '{sourceOptimisticRevision}',
    to_jsonb(v_claim_updated_at::text),
    true
  );

  select * into v_document
  from public.organization_accounting_documents d
  where d.organization_id = v_org
    and d.provider = 'xero'
    and d.tenant_id = p_input->>'tenantId'
    and d.local_document_type = 'project_claim'
    and d.project_claim_id = v_claim
  for update;
  if found and v_document.integration_contract is null then
    if v_document.external_document_id is not null
      or v_document.active_accounting_revision_id is not null then
      raise exception 'Existing linked Payment Claims remain on the legacy integration.';
    end if;
    update public.organization_accounting_documents
    set integration_contract = 'payment_claim_revision_v1', updated_at = now()
    where id = v_document.id
      and integration_contract is null
      and external_document_id is null
      and active_accounting_revision_id is null;
  end if;
  return public.confirm_payment_claim_initial_push_phase2b_impl(v_normalized_input);
end;
$$;

revoke all on function public.confirm_payment_claim_initial_push_phase2b(jsonb)
from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_initial_push_phase2b(jsonb)
to service_role;

commit;
