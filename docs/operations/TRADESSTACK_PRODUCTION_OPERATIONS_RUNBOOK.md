# TradesStack first-customer production operations index

This is the operator entry point for Phase 1X-B. It applies to a dedicated
client such as fictional Client Alpha. It does not authorize a real customer,
provider mutation, paid upgrade, direct database edit, credential rotation or
deletion.

## Operating rule

Record the client, release SHA, deployment, database migration target,
operator, evidence and approval before any consequential action. Keep customer
Postgres/Auth and private Storage recovery separate. Never recover secrets from
Git, logs or exports. Never treat service-role access as permission proof.

## Normal release

1. Validate the Master release with `npm run ops:validate-release`.
2. Confirm the client registry, release identity, migration target and client
   configuration fingerprint.
3. Review application/database compatibility and the forward migration plan.
4. Deploy through the approved client repository/release path.
5. Record deployment identity and run the client acceptance checks.
6. Update the non-secret registry only after acceptance.

## Incident and outage response

Use [the incident runbook](TRADESSTACK_INCIDENT_RUNBOOK.md), preserve logs and
release evidence, assign a severity and owner, contain the smallest scope,
then choose application rollback, forward fix, database restore, Storage
recovery, credential rotation or provider escalation. Cloudflare and Supabase
provider outages must be distinguished from TradesStack defects.

## Recovery

Use [the recovery runbook](TRADESSTACK_RECOVERY_RUNBOOK.md). The required
sequence is:

```text
approved infrastructure/config
→ isolated database restore and ledger check
→ Auth recovery/reconciliation
→ private Storage restore and checksum check
→ compatible application release
→ secrets/configuration
→ tenant/RLS/Storage acceptance
```

Do not call recovery proven until the database and representative private
objects have been restored into an isolated target and validated.

## Access and secrets

Break-glass access is rare, minimum-necessary, auditable and followed by review.
Use provider account recovery and secret-store procedures; do not rotate a
critical credential merely to demonstrate the procedure. The Phase 1X-B2
hardening report proves a synthetic isolated database/Storage replay, but
provider backup retention, exact Auth continuity, alert ownership and account
MFA/recovery remain open.

## Export and offboarding

Use [the export/offboarding runbook](TRADESSTACK_EXPORT_OFFBOARDING_RUNBOOK.md).
Freeze releases, produce an integrity-checkable structured export plus private
documents, obtain owner/customer confirmation, disconnect integrations, revoke
access, apply the approved retention decision and record disposition. Do not
delete fictional Alpha as part of this phase.

## Current evidence

The authoritative Phase 1X-B evidence is
`docs/architecture/TRADESSTACK_PRODUCTION_HARDENING.md` and the non-secret
machine-readable record is `ops/hardening/client-alpha.json`.

## Phase 1X-B3 operating ownership

The current Alpha Free plan has no recurring managed database backup. The
approved free-tier mechanism is now a daily GitHub Actions encrypted artifact
containing the database dump, Auth inventory and private Storage export with
checksums. Live workflow `36977001303` succeeded and its 30-day retention
metadata was verified. Restore verification `36979459575` decrypted the
artifact and restored the database into a disposable PostgreSQL target in
9.882 seconds, with seven Auth identities and six private Storage objects
represented by the manifest. Treat the 24-hour RPO as conditionally proven
until longer-term schedule continuity is observed; owner email delivery is now
proven. Treat the one-business-day RTO as conditionally proven until hosted
Auth and private Storage rehydration is exercised.

The current operator may perform the check, with Corey as the primary alert
owner. Business-hours coverage is approved for the initial owner-operated
model; no 24/7 response guarantee is claimed.
No monitoring account or alert integration was created in B3.

The approved temporary hosted recovery target was deferred because Supabase
reported that the organization has reached its two-project Free limit. Alpha
and Master remain untouched; do not pause, delete or upgrade either project as
an implicit workaround.

Provider recovery must preserve the secure release path. The previous
vulnerable Next.js deployment is not an eligible rollback target; redeploy the
known secure Alpha release from the recorded Master SHA and Alpha commit.
GitHub, Cloudflare and Supabase MFA/recovery settings must be verified and kept
outside repository records.

The Alpha repository now has a daily encrypted backup workflow at
`.github/workflows/client-alpha-backup.yml` (02:17 UTC, 30-day artifact
retention). The operator checks the workflow result and encrypted artifact
summary. Configure the required repository secrets manually; never place them
in Git or this runbook. A failed workflow is an operational incident and must
be escalated to Corey until a second operator is formally assigned.
