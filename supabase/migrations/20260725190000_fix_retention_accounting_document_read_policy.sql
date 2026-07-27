begin;

-- The Phase 9 policy queried retention_claims as the invoking authenticated
-- role, but that table intentionally has no direct authenticated SELECT grant.
-- The accounting document already has a restrictive FK to retention_claims,
-- so the redundant EXISTS caused permission errors without adding isolation.
drop policy if exists
  "Retention Xero viewers can view retention accounting documents"
on public.organization_accounting_documents;

create policy
  "Retention Xero viewers can view retention accounting documents"
on public.organization_accounting_documents
for select
to authenticated
using (
  local_document_type = 'retention_claim'
  and retention_claim_id is not null
  and public.has_org_permission(
    organization_id,
    'retention.claims.xero.view'
  )
);

commit;
