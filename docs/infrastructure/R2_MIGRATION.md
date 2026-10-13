# R2 migration and rollback

Status: prepared, not executed.

## Provider boundary

`lib/storage/provider.ts` defines the provider-neutral operations required by document workflows: put, get, head, delete, copy and list. It validates opaque relative keys and includes an R2 binding adapter. The document workflow now has a controlled R2 path: the browser sends bytes to an authenticated server route, the route writes to the private binding, and a Supabase security-definer RPC activates metadata only after size/MIME/permission checks. Supabase remains the default provider and existing TUS/signed-URL path.

## Migration stages

1. Inventory every bucket and domain path: `organization-documents`, drawings, QA evidence, supplier invoices, claims, generated files and legacy attachments. Export organization/project/entity IDs, key, MIME, byte size, checksum where available, version/activity state and last access evidence.
2. Create private R2 target storage and record the customer/bucket mapping in the Owner Control Plane. Do not use `r2.dev` or public buckets for sensitive data.
3. Copy objects with an idempotency key derived from source bucket + source key + checksum. Use multipart transfer for large objects and retry transient failures.
4. Verify size, MIME, checksum/etag and metadata. Record each result as pending, copied, verified, mismatch or failed.
5. Run authorization reconciliation through the existing Supabase RPCs. Prove organization, project and role access using owner, restricted member, outsider and anonymous cases.
6. Shadow-read R2 for a non-production cohort while Supabase remains the fallback. Compare bytes and access decisions.
7. Cut over one approved Alpha environment by configuration flag. Keep original objects and references unchanged during the rollback window.
8. Retire source objects only after explicit production approval, a verified backup/recovery point and a completed reconciliation report.

## Security requirements

R2 never receives browser credentials. A server route authenticates the Supabase session, checks organization/project permission and only then reads the R2 binding. Storage keys are opaque and path-safe. Logs contain customer/resource IDs and outcome, never signed URLs, tokens or document contents. Upload size/MIME rules remain those in `lib/documents/validation.ts` and domain-specific evidence rules remain domain-specific.

## Rollback

Set `TRADESSTACK_STORAGE_PROVIDER=supabase`, stop new R2 writes, retain the migration ledger and continue serving the original Supabase object references. Do not delete R2 or source objects during rollback. A failed object copy is retried from the source; a checksum mismatch is quarantined and never activated.

## Current limitation

The document workflow is commissioned in Alpha: the forward migration is applied there, the private Alpha bucket is isolated, `TRADESSTACK_STORAGE_PROVIDER=r2` and `TRADESSTACK_R2_DOCUMENTS_ENABLED=1` are enabled, and authenticated upload/activation/download/isolation proofs passed. Main remains pending its own backup, migration approval, and application proof. No historical storage migration or legacy-object deletion is authorized.

R2 is currently limited to the document workflow. Drawings, QA evidence, supplier invoices, task attachments, claims, generated PDFs, logos, material imports, and legacy attachments still use their established Supabase Storage paths unless a separate domain-specific adapter and migration proof exists. This is intentional: a raw R2 round trip does not commission those domains.
