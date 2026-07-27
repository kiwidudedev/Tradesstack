begin;

alter table public.project_claims
  add constraint project_claims_organization_id_id_key
  unique (organization_id, id);

alter table public.organization_accounting_documents
  add column project_claim_id uuid null,
  add column last_synced_hash text null,
  alter column local_document_id drop not null;

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_project_claim_org_fkey
  foreign key (organization_id, project_claim_id)
  references public.project_claims (organization_id, id)
  on delete restrict;

alter table public.organization_accounting_documents
  drop constraint organization_accounting_documents_type_check;

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_type_check check (
    local_document_type in ('supplier_invoice', 'project_claim')
  );

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_local_identity_shape_check check (
    (
      local_document_type = 'supplier_invoice'
      and local_document_id is not null
      and project_claim_id is null
    )
    or
    (
      local_document_type = 'project_claim'
      and local_document_id is null
      and project_claim_id is not null
      and current_version_id is null
    )
  ),
  add constraint organization_accounting_documents_last_synced_hash_not_blank check (
    last_synced_hash is null or char_length(trim(last_synced_hash)) > 0
  );

create unique index organization_accounting_documents_unique_project_claim_uidx
  on public.organization_accounting_documents (
    organization_id,
    provider,
    tenant_id,
    project_claim_id
  )
  where local_document_type = 'project_claim'
    and project_claim_id is not null;

create policy "Sales invoice viewers can view project claim accounting documents"
on public.organization_accounting_documents
for select
to authenticated
using (
  organization_accounting_documents.local_document_type = 'project_claim'
  and public.has_org_permission(
    organization_accounting_documents.organization_id,
    'accounting.sales_invoices.view'
  )
  and exists (
    select 1
    from public.project_claims claim
    where claim.id = organization_accounting_documents.project_claim_id
      and claim.organization_id = organization_accounting_documents.organization_id
  )
);

insert into public.app_permissions (permission_key, description)
values
  ('accounting.sales_invoices.view', 'View Payment Claim Xero Sales Invoice sync and payment state'),
  ('accounting.sales_invoices.manage', 'Create, update, retry, and refresh Payment Claim Xero Sales Invoices')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'accounting.sales_invoices.view', true),
  ('owner', 'accounting.sales_invoices.manage', true),
  ('admin', 'accounting.sales_invoices.view', true),
  ('admin', 'accounting.sales_invoices.manage', true),
  ('qs', 'accounting.sales_invoices.view', true),
  ('qs', 'accounting.sales_invoices.manage', false),
  ('project_manager', 'accounting.sales_invoices.view', true),
  ('project_manager', 'accounting.sales_invoices.manage', false),
  ('worker', 'accounting.sales_invoices.view', false),
  ('worker', 'accounting.sales_invoices.manage', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

alter table public.organization_accounting_sync_jobs
  drop constraint organization_accounting_sync_jobs_job_kind_check;

alter table public.organization_accounting_sync_jobs
  add constraint organization_accounting_sync_jobs_job_kind_check check (
    job_kind in (
      'import_accounts',
      'import_tax_rates',
      'import_contacts',
      'health_check',
      'xero.bill.export',
      'xero.bill.refresh',
      'xero.sales_invoice.sync',
      'xero.sales_invoice.refresh'
    )
  );

create unique index org_accounting_sync_jobs_active_sales_invoice_doc_uidx
  on public.organization_accounting_sync_jobs (
    organization_id,
    provider,
    connection_id,
    (request_payload ->> 'accountingDocumentId')
  )
  where queue_state in ('pending', 'claimed', 'retry_scheduled')
    and job_kind in ('xero.sales_invoice.sync', 'xero.sales_invoice.refresh')
    and nullif(trim(request_payload ->> 'accountingDocumentId'), '') is not null;

commit;
