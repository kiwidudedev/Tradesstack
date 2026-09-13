# Deployment readiness and activation contract

This branch supplies local remediation, not approval to deploy, migrate an existing database, delete storage, or activate providers.

## Runtime and installation

Use Node 22.22.2 (`.nvmrc`) and npm 11.6.2. The package engine ranges enforce Node 22 and npm 11. Use `npm ci` to reproduce the lockfile, followed by `npm run build`. Do not reuse an older workspace's node_modules. No global runtime update is required.

## Background jobs default to disabled

`TRADESSTACK_ENABLED_BACKGROUND_JOBS` is an explicit comma-separated allowlist, empty by default. Exact job names only; `*` and `true` do not enable anything. Existing authentication is still required even when a job is disabled. Cron schedules are unchanged. Enable individual jobs only after database, provider, volume, cost and recovery review.

Recognized route job names:

- `document-storage-cleanup`
- `material-supplier-pricing`
- `organization-memory-retirement`
- `project-qa-evidence-cleanup`
- `retention-rolling-drafts`
- `universal-construction-learning`
- `universal-construction-learning/schedule`
- `universal-construction-learning/supplier-bills`
- `worksheet-event-classifications`
- `worksheet-memory-evidence-pools`
- `worksheet-memory-semantic-pools`
- `worksheet-memory-synthesis`
- `worksheet-mutation-evidence-v2`
- `xero-bill-status`
- `xero-retention-claim-status`
- `xero-sales-invoice-status`
- `xero-sync`

`material-source-retention` is an additional, separate deletion opt-in. Material processing does not imply retention deletion. Immediate Material processing claims only the requested job once; scheduled processing uses the existing bounded batch. Turning these gates off pauses background completion, so pending imports will remain queued until an approved activation.

The separate Deno time-sheet worker requires both `TIME_SHEETS_RULES_ENABLED=true` and a nonempty `TIME_SHEETS_CRON_SECRET`, supplied through the actual environment. Its bearer authorization must match exactly. Never put secret values in this document or example environment file.

## Database prerequisites and release hold

Apply no migration to a hosted database based on this document alone. The 500-file local sequence passes on a disposable database, including these new prerequisites:

1. `20260913100000_lease_qa_evidence_cleanup.sql`
2. `20260913110000_fence_material_import_publication.sql`
3. `20260913120000_lease_material_source_retention.sql`

Worker source calls the new RPCs. Keep workers disabled until their migrations have been separately approved and applied. The historical tax-policy trigger now tolerates the absent optional organization fields, matching the existing JSON-based backfill. The award-pricing replacement recognizes an already-applied exact function patch.

A fresh migration replay is not a complete application database: generated contracts expect fields absent from the committed history. Confirmed examples include organization profile/tax fields, organization client detail fields and client location/contact tables. Other contract gaps include older labour and worker-assignment tables and time-sheet sync fields. Do not invent defaults, constraints, permissions or historical data transformations from TypeScript types. Obtain an authoritative schema/history export and reconcile it locally before approving a fresh deployment. Existing database presence has not been inspected.

The previously held `20260810190000_cleanup_phase1_material_test_fixtures.sql` remains excluded outside this branch. It has not been copied into the rehearsal or executed.

Historical destructive migrations are NOT approved by a successful replay on synthetic data. In particular, `20260823170000_retire_legacy_cost_item_classification.sql` removes 15 columns and a mapping table after rewriting dependent functions. Before applying it to real data, establish the actual migration state, confirm classification backfills and consumers, and verify a restorable backup/export. Two other DROP candidates are the initial `20260228173000_create_organization_accounts.sql` (drops legacy profiles/invites; requires history/data approval if still pending) and `20260718090000_stabilize_supplier_invoice_workflow_phase_ab.sql` (replaces a generated normalized-reference column; locally reproducible from its retained source field). Review data-deletion candidates against the same authoritative baseline. Do not rewrite applied migration history on a hosted database.

## Cleanup and recovery

QA cleanup claims at most 100 jobs (default 25), with a one-hour grace period, active-reference checks and five-minute leases. Material source retention uses terminal batches, durable immutable-path reservations and five-minute leases. Both retry with backoff and dead-letter after five attempts, including repeated crashes. Claims and finalization are service-role-only. Tests use mocked storage; no real object was removed.

A storage delete and database transaction cannot commit atomically. Durable records retain the exact object path so a retry can finish after a delete succeeded but metadata persistence failed. Material reservations reject reprocessing while that source is reserved. Lease finalization rejects stale ownership. Restore deleted bytes only from an independently verified storage backup; disabling a gate does not recover an object.

Inspect dead-letter records and source ownership manually before any separately approved reset/retry. Do not blindly clear reservations or leases, and do not delete cleanup tables to roll back code. Disable affected workers first; retain additive schema and audit records. Material row publication is atomic and lease-fenced; failed publication preserves previous pending review rows. Approved rows remain untouched.

## Server resource limits

Upload-initiation JSON is limited to 16 KiB of actual streamed bytes. Material multipart requests are limited to 26 MiB (existing file limit 25 MiB). Spreadsheet archives are capped at 25 MiB compressed, 64 MiB expanded and 2,048 ZIP entries; encrypted and unsupported compression formats are rejected before ExcelJS parsing. Worksheet limits are 50 sheets, 20,000 rows, 256 columns and 500,000 aggregate cells. CSV source text is bounded to 4 million characters; document chunks are bounded. These intentionally reject oversized inputs rather than consume unbounded resources.

## Optional providers and residual dependency alert

Keep optional email and worker providers unconfigured unless their features are intentionally enabled. No default or fake credential is supplied. Core application Supabase/auth configuration still requires genuine operator configuration; a successful build is not a hosted integration test.

The remaining moderate dependency alert is UUID under ExcelJS. The inspected ExcelJS caller uses UUID v4 without a caller buffer; the advisory targets other UUID APIs. Recheck this assessment when ExcelJS usage/dependencies change. Do not force an incompatible UUID override or downgrade ExcelJS solely to silence the audit.
