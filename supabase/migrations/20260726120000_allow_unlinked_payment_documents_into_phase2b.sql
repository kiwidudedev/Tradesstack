begin;

alter function public.confirm_payment_claim_initial_push_phase2b(jsonb)
rename to confirm_payment_claim_initial_push_phase2b_impl;

create or replace function public.confirm_payment_claim_initial_push_phase2b(
  p_input jsonb
)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_document public.organization_accounting_documents%rowtype;
begin
  select * into v_document
  from public.organization_accounting_documents d
  where d.organization_id = (p_input->>'organizationId')::uuid
    and d.provider = 'xero'
    and d.tenant_id = p_input->>'tenantId'
    and d.local_document_type = 'project_claim'
    and d.project_claim_id = (p_input->>'claimId')::uuid
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
  return public.confirm_payment_claim_initial_push_phase2b_impl(p_input);
end;
$$;

revoke all on function public.confirm_payment_claim_initial_push_phase2b_impl(jsonb)
  from public, anon, authenticated;
revoke all on function public.confirm_payment_claim_initial_push_phase2b(jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_initial_push_phase2b_impl(jsonb)
  to service_role;
grant execute on function public.confirm_payment_claim_initial_push_phase2b(jsonb)
  to service_role;

commit;
