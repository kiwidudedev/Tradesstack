begin;

create index if not exists
  org_accounting_sync_jobs_active_document_lookup_idx
  on public.organization_accounting_sync_jobs (
    organization_id,
    provider,
    (request_payload ->> 'accountingDocumentId'),
    created_at desc
  )
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists
  org_accounting_sync_jobs_revision_lookup_idx
  on public.organization_accounting_sync_jobs (
    organization_id,
    (request_payload ->> 'accountingRevisionId'),
    created_at
  )
  where job_kind in (
    'xero.payment_claim.initial_push',
    'xero.payment_claim.replacement',
    'xero.retention_claim.initial_push',
    'xero.retention_claim.update',
    'xero.retention_claim.replacement'
  );

commit;
