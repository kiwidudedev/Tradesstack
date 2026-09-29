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
