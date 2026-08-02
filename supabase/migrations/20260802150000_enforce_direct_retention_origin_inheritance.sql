begin;

create or replace function private.enforce_direct_retention_origin_inheritance()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_retention_revision public.organization_accounting_document_revisions%rowtype;
  v_origin_document public.organization_accounting_documents%rowtype;
  v_origin_revision public.organization_accounting_document_revisions%rowtype;
  v_origin_line public.organization_accounting_revision_lines%rowtype;
  v_origin_document_count integer;
  v_tax_type_count integer;
  v_origin_document_id uuid;
  v_origin_revision_id uuid;
  v_origin_line_id uuid;
  v_tax_type text;
begin
  if new.line_kind <> 'retention'
    or coalesce(new.source_snapshot->>'originEvidenceContract', '') <>
      'direct_immutable_retention_v1' then
    return new;
  end if;

  v_origin_document_id :=
    nullif(new.source_snapshot->>'originAccountingDocumentId', '')::uuid;
  v_origin_revision_id :=
    nullif(new.source_snapshot->>'originAccountingRevisionId', '')::uuid;
  v_origin_line_id :=
    nullif(new.source_snapshot->>'originAccountingRevisionLineId', '')::uuid;

  select revision.* into v_retention_revision
  from public.organization_accounting_document_revisions revision
  where revision.id = new.accounting_revision_id
    and revision.organization_id = new.organization_id
    and revision.source_document_type = 'retention_claim';
  if not found then
    raise exception 'RETENTION_ORIGIN_IDENTITY_MISMATCH: destination revision';
  end if;

  select count(*)::integer into v_origin_document_count
  from public.organization_accounting_documents document
  join public.organization_accounting_document_revisions revision
    on revision.id = document.active_accounting_revision_id
   and revision.organization_id = document.organization_id
   and revision.accounting_document_id = document.id
   and revision.lifecycle_state = 'succeeded'
   and revision.source_document_type = 'project_claim'
   and revision.source_document_id = new.originating_payment_claim_id
  where document.organization_id = new.organization_id
    and document.provider = 'xero'
    and document.local_document_type = 'project_claim'
    and document.project_claim_id = new.originating_payment_claim_id
    and document.integration_contract = 'payment_claim_revision_v1';
  if v_origin_document_count = 0 then
    raise exception 'ORIGIN_REVISION_MISSING: effective succeeded origin';
  elsif v_origin_document_count <> 1 then
    raise exception 'ORIGIN_REVISION_AMBIGUOUS: effective succeeded origin';
  end if;

  select document.* into v_origin_document
  from public.organization_accounting_documents document
  join public.organization_accounting_document_revisions revision
    on revision.id = document.active_accounting_revision_id
   and revision.organization_id = document.organization_id
   and revision.accounting_document_id = document.id
   and revision.lifecycle_state = 'succeeded'
  where document.id = v_origin_document_id
    and document.organization_id = new.organization_id
    and document.provider = 'xero'
    and document.local_document_type = 'project_claim'
    and document.project_claim_id = new.originating_payment_claim_id
    and document.integration_contract = 'payment_claim_revision_v1'
    and revision.id = v_origin_revision_id
    and revision.source_document_type = 'project_claim'
    and revision.source_document_id = new.originating_payment_claim_id;
  if not found then
    raise exception 'ORIGIN_REVISION_CHANGED: immutable origin is no longer effective';
  end if;
  select revision.* into v_origin_revision
  from public.organization_accounting_document_revisions revision
  where revision.id = v_origin_revision_id
    and revision.organization_id = new.organization_id
    and revision.accounting_document_id = v_origin_document.id
    and revision.lifecycle_state = 'succeeded'
    and revision.source_document_type = 'project_claim'
    and revision.source_document_id = new.originating_payment_claim_id;
  if not found then
    raise exception 'ORIGIN_REVISION_CHANGED: immutable origin revision is no longer effective';
  end if;
  if v_origin_revision.organization_id <> v_retention_revision.organization_id
    or v_origin_revision.project_id is distinct from v_retention_revision.project_id
    or v_origin_revision.connection_id <> v_retention_revision.connection_id
    or v_origin_revision.tenant_id <> v_retention_revision.tenant_id
    or v_origin_revision.currency_code <> v_retention_revision.currency_code then
    raise exception 'RETENTION_ORIGIN_IDENTITY_MISMATCH: organization, project, connection, tenant, or currency';
  end if;

  select line.* into v_origin_line
  from public.organization_accounting_revision_lines line
  where line.id = v_origin_line_id
    and line.organization_id = new.organization_id
    and line.accounting_revision_id = v_origin_revision.id
    and line.line_kind = 'retention'
    and line.originating_payment_claim_id = new.originating_payment_claim_id;
  if not found then
    raise exception 'ORIGIN_RETENTION_LINE_MISSING: immutable origin line';
  end if;
  if v_origin_line.line_amount_minor >= 0
    or v_origin_line.total_minor <>
      v_origin_line.line_amount_minor + v_origin_line.tax_minor
    or (
      v_origin_line.tax_minor <> 0
      and sign(v_origin_line.line_amount_minor) <>
        sign(v_origin_line.tax_minor)
    )
    or nullif(trim(v_origin_line.account_snapshot->>'accountCode'), '')
      is distinct from '700' then
    raise exception 'ORIGIN_RETENTION_LINE_INVALID: immutable origin amounts or account';
  end if;

  v_tax_type := nullif(trim(v_origin_line.tax_snapshot->>'taxType'), '');
  if v_tax_type is null
    or nullif(trim(v_origin_revision.tax_snapshot->>'taxRateId'), '') is null
    or nullif(trim(v_origin_revision.tax_snapshot->>'effectiveRate'), '') is null
    or nullif(trim(v_origin_revision.tax_snapshot->>'taxType'), '')
      is distinct from v_tax_type then
    raise exception 'ORIGIN_TAX_EVIDENCE_MISSING: immutable origin tax snapshot';
  end if;

  select count(*)::integer into v_tax_type_count
  from public.organization_accounting_tax_rates tax_rate
  where tax_rate.organization_id = v_origin_revision.organization_id
    and tax_rate.provider = 'xero'
    and tax_rate.accounting_connection_id = v_origin_revision.connection_id
    and tax_rate.tenant_id = v_origin_revision.tenant_id
    and tax_rate.is_active
    and upper(tax_rate.status) = 'ACTIVE'
    and tax_rate.metadata->>'canApplyToRevenue' = 'true'
    and upper(tax_rate.tax_type) = upper(v_tax_type);
  if v_tax_type_count <> 1 then
    raise exception 'ORIGIN_TAX_TYPE_UNAVAILABLE: immutable origin TaxType';
  end if;

  if new.line_amount_minor <> -v_origin_line.line_amount_minor
    or new.tax_minor <> -v_origin_line.tax_minor
    or new.total_minor <> -v_origin_line.total_minor
    or new.total_minor <> new.line_amount_minor + new.tax_minor
    or new.tax_snapshot->>'taxType' is distinct from v_tax_type
    or new.tax_snapshot->>'taxRateId' is distinct from
      v_origin_revision.tax_snapshot->>'taxRateId'
    or new.account_snapshot->>'accountCode' is distinct from
      v_origin_line.account_snapshot->>'accountCode' then
    raise exception 'RETENTION_ORIGIN_INVERSION_MISMATCH: release must exactly reverse origin';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_direct_retention_origin_inheritance
  on public.organization_accounting_revision_lines;
create trigger enforce_direct_retention_origin_inheritance
before insert on public.organization_accounting_revision_lines
for each row execute function private.enforce_direct_retention_origin_inheritance();

revoke all on function private.enforce_direct_retention_origin_inheritance()
from public, anon, authenticated, service_role;

commit;
