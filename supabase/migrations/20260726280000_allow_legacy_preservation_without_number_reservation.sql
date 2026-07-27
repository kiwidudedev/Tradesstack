begin;

create or replace function public.enforce_phase2a_revision_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  document public.organization_accounting_documents%rowtype;
  previous_revision public.organization_accounting_document_revisions%rowtype;
  reservation public.organization_accounting_number_reservations%rowtype;
  resolved_project_id uuid;
  source_claim_number text;
begin
  select * into document
  from public.organization_accounting_documents d
  where d.id = new.accounting_document_id;
  if not found
    or document.organization_id <> new.organization_id
    or document.provider <> new.provider
    or document.tenant_id <> new.tenant_id
    or document.accounting_connection_id <> new.connection_id
    or document.local_document_type <> new.source_document_type
    or coalesce(
      document.project_claim_id,
      document.retention_claim_id,
      document.local_document_id
    ) <> new.source_document_id then
    raise exception 'Accounting revision identity does not match its stable document.'
      using errcode = '23514';
  end if;

  if new.source_document_type = 'project_claim' then
    select c.project_id, c.claim_number
      into resolved_project_id, source_claim_number
    from public.project_claims c
    where c.id = new.source_document_id
      and c.organization_id = new.organization_id;
  elsif new.source_document_type = 'retention_claim' then
    select c.project_id into resolved_project_id
    from public.retention_claims c
    where c.id = new.source_document_id
      and c.organization_id = new.organization_id;
  end if;
  if new.source_document_type in ('project_claim', 'retention_claim')
    and (resolved_project_id is null or new.project_id is distinct from resolved_project_id)
  then
    raise exception 'Accounting revision project does not match its source claim.'
      using errcode = '23514';
  end if;

  if new.revision_sequence = 1 then
    if new.previous_revision_id is not null then
      raise exception 'First accounting revision cannot have a predecessor.'
        using errcode = '23514';
    end if;
  else
    select * into previous_revision
    from public.organization_accounting_document_revisions r
    where r.id = new.previous_revision_id;
    if not found
      or previous_revision.accounting_document_id <> new.accounting_document_id
      or previous_revision.organization_id <> new.organization_id
      or previous_revision.revision_sequence <> new.revision_sequence - 1 then
      raise exception 'Accounting revision predecessor must be the prior revision of the same document.'
        using errcode = '23514';
    end if;
  end if;

  if new.source_document_type = 'project_claim'
    and new.revision_intent = 'legacy_import'
    and new.resolution_strategy = 'legacy_preservation'
    and new.number_reservation_id is null then
    if nullif(trim(source_claim_number), '') is null
      or new.external_document_number <> source_claim_number
      or nullif(trim(new.external_document_id), '') is null then
      raise exception 'Legacy Payment Claim identity must preserve its source claim number and Xero InvoiceID.'
        using errcode = '23514';
    end if;
  elsif new.source_document_type = 'project_claim'
    and document.integration_contract = 'payment_claim_revision_v1'
    and new.revision_intent = 'initial_push'
    and new.number_reservation_id is null then
    if nullif(trim(source_claim_number), '') is null
      or new.external_document_number <> source_claim_number then
      raise exception 'Phase 2B Payment Claim revision number must equal its source claim number.'
        using errcode = '23514';
    end if;
  elsif new.source_document_type in ('project_claim', 'retention_claim') then
    select * into reservation
    from public.organization_accounting_number_reservations n
    where n.id = new.number_reservation_id;
    if not found
      or reservation.organization_id <> new.organization_id
      or reservation.provider <> new.provider
      or reservation.tenant_id <> new.tenant_id
      or reservation.accounting_document_id <> new.accounting_document_id
      or reservation.source_document_type <> new.source_document_type
      or reservation.source_document_id <> new.source_document_id
      or reservation.formatted_number <> new.external_document_number then
      raise exception 'Accounting revision number reservation does not match its tenant and document.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

commit;
