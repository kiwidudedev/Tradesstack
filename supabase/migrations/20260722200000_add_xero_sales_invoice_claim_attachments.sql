begin;

alter table public.organization_accounting_documents
  add column if not exists attachment_status text not null default 'not_attached',
  add column if not exists attachment_filename text null,
  add column if not exists attachment_synced_hash text null,
  add column if not exists attachment_uploaded_at timestamptz null,
  add column if not exists attachment_error_code text null,
  add column if not exists attachment_error_message text null;

alter table public.organization_accounting_documents
  drop constraint if exists organization_accounting_documents_attachment_status_check;

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_attachment_status_check check (
    attachment_status in ('not_attached', 'queued', 'attaching', 'attached', 'failed')
  );

alter table public.organization_accounting_documents
  drop constraint if exists organization_accounting_documents_attachment_hash_check;

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_attachment_hash_check check (
    attachment_synced_hash is null or attachment_synced_hash ~ '^[0-9a-f]{64}$'
  );

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
      'xero.sales_invoice.refresh',
      'xero.sales_invoice.attachment'
    )
  );

drop index if exists public.org_accounting_sync_jobs_active_sales_invoice_doc_uidx;

create unique index org_accounting_sync_jobs_active_sales_invoice_doc_uidx
  on public.organization_accounting_sync_jobs (
    organization_id,
    provider,
    connection_id,
    (request_payload ->> 'accountingDocumentId')
  )
  where queue_state in ('pending', 'claimed', 'retry_scheduled')
    and job_kind in (
      'xero.sales_invoice.sync',
      'xero.sales_invoice.refresh',
      'xero.sales_invoice.attachment'
    )
    and nullif(trim(request_payload ->> 'accountingDocumentId'), '') is not null;

comment on column public.organization_accounting_documents.attachment_synced_hash is
  'Deterministic Payment Claim outbound hash represented by the current Xero PDF attachment.';

commit;
