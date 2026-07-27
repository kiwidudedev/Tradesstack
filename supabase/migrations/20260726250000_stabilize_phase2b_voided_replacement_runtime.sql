begin;

-- Phase 2B server services read immutable evidence to resolve the operation and
-- execute a persisted replacement. Read access cannot mutate immutable rows.
grant select on
  public.organization_accounting_document_revisions,
  public.organization_accounting_revision_lines,
  public.organization_accounting_revision_attachments,
  public.organization_accounting_revision_attempts,
  public.organization_accounting_events,
  public.organization_accounting_remote_observations,
  public.organization_accounting_projections
to service_role;

-- Server workers may only append events. Existing immutable triggers and the
-- absence of UPDATE/DELETE grants continue to prevent historical rewrites.
grant insert on public.organization_accounting_events to service_role;

alter table public.organization_accounting_sync_jobs
  drop constraint organization_accounting_sync_jobs_job_kind_check;
alter table public.organization_accounting_sync_jobs
  add constraint organization_accounting_sync_jobs_job_kind_check check (
    job_kind in (
      'import_accounts', 'import_tax_rates', 'import_contacts', 'health_check',
      'xero.bill.export', 'xero.bill.refresh',
      'xero.sales_invoice.sync', 'xero.sales_invoice.refresh',
      'xero.sales_invoice.attachment',
      'xero.retention_claim.sync', 'xero.retention_claim.attachment',
      'xero.retention_claim.refresh',
      'xero.payment_claim.initial_push',
      'xero.payment_claim.initial_push.attachment',
      'xero.payment_claim.replacement',
      'xero.payment_claim.replacement.attachment'
    )
  );

drop index if exists
  public.organization_accounting_sync_jobs_active_phase2b_revision_uidx;
create unique index
  organization_accounting_sync_jobs_active_phase2b_revision_uidx
on public.organization_accounting_sync_jobs (
  organization_id, provider, job_kind,
  (request_payload->>'accountingRevisionId')
)
where queue_state in ('pending', 'claimed', 'retry_scheduled')
  and job_kind in (
    'xero.payment_claim.initial_push',
    'xero.payment_claim.initial_push.attachment',
    'xero.payment_claim.replacement',
    'xero.payment_claim.replacement.attachment'
  );

commit;
