begin;

create table public.organization_accounting_push_proposals (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  source_document_type text not null,
  source_document_id uuid not null,
  accounting_document_id uuid null,
  active_revision_id uuid null references public.organization_accounting_document_revisions(id) on delete restrict,
  operation text not null,
  external_document_number text not null,
  preview_hash text not null,
  source_optimistic_revision text not null,
  decision_snapshot jsonb not null,
  evidence_hashes jsonb not null,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint accounting_push_proposal_operation_check
    check (operation in ('INITIAL_EXPORT', 'REPLACEMENT_EXPORT', 'ACCOUNTING_UPDATE', 'BLOCKED')),
  constraint accounting_push_proposal_source_check
    check (source_document_type = 'project_claim'),
  constraint accounting_push_proposal_hash_check
    check (preview_hash ~ '^[a-f0-9]{64}$'),
  constraint accounting_push_proposal_objects_check
    check (jsonb_typeof(decision_snapshot) = 'object' and jsonb_typeof(evidence_hashes) = 'object')
);

create or replace function public.prevent_accounting_push_proposal_mutation()
returns trigger language plpgsql set search_path = public
as $$
begin
  raise exception 'Immutable accounting push proposals cannot be updated or deleted.';
end;
$$;
create trigger accounting_push_proposal_immutable
before update or delete on public.organization_accounting_push_proposals
for each row execute function public.prevent_accounting_push_proposal_mutation();

alter table public.organization_accounting_push_proposals enable row level security;
alter table public.organization_accounting_push_proposals force row level security;
create policy accounting_push_proposals_select on public.organization_accounting_push_proposals
for select to authenticated
using (public.has_org_permission(organization_id, 'accounting.sales_invoices.view'));
grant select on public.organization_accounting_push_proposals to authenticated;
grant select, insert on public.organization_accounting_push_proposals to service_role;

create or replace function public.confirm_payment_claim_push_phase2c(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.organization_accounting_push_proposals%rowtype;
begin
  select * into v_proposal from public.organization_accounting_push_proposals
  where id = (p_input->>'proposalId')::uuid
    and organization_id = (p_input->>'organizationId')::uuid
    and source_document_id = (p_input->>'claimId')::uuid
    and project_id = (p_input->>'projectId')::uuid;
  if not found
    or v_proposal.expires_at <= now()
    or v_proposal.source_document_type <> 'project_claim'
    or v_proposal.preview_hash <> p_input->>'previewHash'
    or v_proposal.operation <> p_input->>'operation'
    or v_proposal.external_document_number <> p_input->>'externalDocumentNumber'
    or v_proposal.source_optimistic_revision <> p_input->>'sourceOptimisticRevision'
    or v_proposal.active_revision_id is distinct from nullif(p_input->>'previousRevisionId', '')::uuid
    or v_proposal.evidence_hashes->>'sourceEvidenceHash' <> p_input->>'sourceEvidenceHash'
    or v_proposal.evidence_hashes->>'commercialHash' <> p_input->>'commercialHash'
    or v_proposal.evidence_hashes->>'linesHash' <> p_input->>'linesHash'
    or v_proposal.evidence_hashes->>'previewHash' <> p_input->>'previewHash'
    or v_proposal.evidence_hashes->>'pdfHash' <> p_input->>'pdfHash' then
    raise exception 'The immutable accounting proposal is missing, expired, or stale.';
  end if;
  if v_proposal.operation = 'INITIAL_EXPORT' then
    return public.confirm_payment_claim_initial_push_phase2b(p_input);
  elsif v_proposal.operation = 'REPLACEMENT_EXPORT' then
    return public.confirm_payment_claim_replacement_phase2c(p_input);
  end if;
  raise exception 'The resolved accounting operation is not executable.';
end;
$$;

revoke all on function public.confirm_payment_claim_push_phase2c(jsonb) from public, anon, authenticated;
grant execute on function public.confirm_payment_claim_push_phase2c(jsonb) to service_role;

commit;
