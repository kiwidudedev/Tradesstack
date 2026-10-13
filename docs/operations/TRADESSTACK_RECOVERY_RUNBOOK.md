# TradesStack recovery runbook

Recovery is client-specific, approval-gated and tested in isolation first.

## Application release

Identify the last accepted release, compare provenance, choose rollback or
forward fix, redeploy the exact client release and run acceptance. Never assume
the database can be reversed with the application.

## Database and Auth

Identify client and recovery point, restore/duplicate to an isolated target,
validate schema and migration ledger, Auth behavior, RLS, ordinary-user access,
cross-organization denial and application compatibility before cutover.

## Storage objects

Restore objects separately, verify checksums, opaque keys, private policies,
signed access, Files metadata, drawing evidence and QA evidence, then reconcile
database references.

**POSTGRES BACKUP ≠ STORAGE BACKUP.**

## Phase 1X-B2 proven synthetic procedure

For fictional synthetic Alpha, a complete hosted logical schema export plus a
public data-only export restored successfully into disposable local Supabase
project `alpha-recovery-b2`. Representative organization, membership,
supplier, project, opportunity, procurement and supplier-invoice queries
passed. The two private Storage buckets were exported separately; all six
objects passed an upload/download SHA-256 round trip in the isolated target.

This is a proven isolated replay procedure, not proof of recurring provider
backups, point-in-time recovery or an RPO guarantee. Auth was only partially
proven: hosted user count was inventoried and synthetic local sign-in passed,
but exact user/password/session continuity was not recreated. Do not mark
customer recovery complete until Auth identity reconciliation, RLS/tenant
acceptance and provider backup/retention are separately evidenced.

## Phase 1X-B3 Auth recovery contract

TradesStack records Auth UUIDs across organization membership, commercial,
Files, project, QA, accounting, activity, task and intelligence references;
the current baseline contains 226 foreign-key constraints to `auth.users`.
Arbitrary UUID remapping is therefore not an approved recovery shortcut.

The preferred disaster procedure is to preserve Auth UUIDs through a supported
provider project restore, reconcile organization memberships and roles, then
invalidate old sessions/refresh tokens and require secure reauthentication or
password recovery. Password and browser-session continuity are not required
customer-recovery invariants. If the provider cannot preserve UUIDs, stop at an
architecture/owner decision before changing schema or provenance behavior.

The current Alpha Free plan has no managed project backups, so this exact Auth
continuity path remains unproven. B2 synthetic sign-in is only a reconstruction
mechanics proof.

## Phase 1X-B3 backup ownership

Until an owner-approved recurring mechanism exists, the operator must not claim
an RPO. The recommended minimum is daily provider database backup plus a
separate daily private-Storage export/checksum manifest, with an operator
recording the last successful backup, size, checksum, object count, retention
state and failure status. Corey must name the restore approver and alert
channel before first-customer use.

The current free-tier Alpha implementation is
`.github/workflows/client-alpha-backup.yml`. It runs daily at 02:17 UTC and
can be manually dispatched. It creates an AES-256-GCM encrypted artifact
containing the database dump, Auth identity inventory, private Storage bytes,
checksums and manifest, with 30-day GitHub artifact retention. The
authenticated GitHub CLI and authorized operator have configured the project
reference, database connection/password, project URL, service-role secret and
independently recoverable encryption key without exposing values. Live
workflow `36977001303` completed successfully with database, Auth and private
Storage coverage. Restore verification `36979459575` decrypted the artifact
and restored the database into a disposable PostgreSQL target in 9.882 seconds.
GitHub failure-state detection, owner email delivery and disposable artifact
restore are proven; hosted Auth/Storage rehydration remains a provider-
dependent follow-up. The approved disposable Free Supabase target could not be
created because the organization has reached its two-project Free limit;
Alpha and Master must not be paused or deleted to bypass this.

## Secrets and deployment configuration

Use the approved secret recovery/rotation procedure. Recreate non-secret
deployment configuration from the registry and release manifest. Never recover
secrets from Git, logs or proof artifacts.

## Domains, workers and integrations

Validate exact URL/callback ownership, worker queue leases/idempotency and
provider reconciliation before enabling traffic. Record unresolved provider
state rather than guessing.

## Restore acceptance record

Record client, isolated target, point in time, RPO/RTO result, schema/ledger,
Auth/RLS, representative user, Storage object/policy/signed-access checks,
Files/drawing/QA evidence, application result, reconciliation and approver.
