# TradesStack Customer Go-Live Checklist

Use one copy for each implementation. Every item is `PASS`, `BLOCKED`, or
`PASS WITH ACCEPTED LIMITATIONS`.

> Any unresolved security, data-isolation, migration, release-provenance,
> recovery-critical, or launch-critical workflow failure is **BLOCKED**.

## Product

- [ ] Agreed modules validated.
- [ ] Critical workflows pass.
- [ ] Roles and permissions are correct.
- [ ] Templates and generated documents are correct.
- [ ] Required reports are usable.
- [ ] Launch requirements register is complete.

Status:
Evidence/limitations:

## Security

- [ ] Auth and production URL configuration validated.
- [ ] RLS and organization membership tested.
- [ ] Private Storage policies tested.
- [ ] Secrets are customer-specific and server-only.
- [ ] Anonymous access is denied where required.
- [ ] Cross-organization access is denied.
- [ ] Role permissions are tested.

Status:
Evidence/limitations:

## Technical

- [ ] Approved Main release recorded.
- [ ] Main source SHA and client SHA recorded.
- [ ] Release fingerprint and client configuration recorded.
- [ ] Build passes.
- [ ] Focused tests pass.
- [ ] Migration baseline and ledger reconcile.
- [ ] Deployment is healthy.
- [ ] Production smoke tests pass.

Status:
Evidence/limitations:

## Data

- [ ] Approved imports completed.
- [ ] Record counts checked.
- [ ] Organization ownership validated.
- [ ] File and drawing imports validated.
- [ ] Historical exclusions documented.
- [ ] Data reconciliation owner assigned.

Status:
Evidence/limitations:

## Integrations

- [ ] Accounting integration tested or explicitly deferred.
- [ ] Email tested or explicitly deferred.
- [ ] AI provider/configuration tested or explicitly deferred.
- [ ] External APIs tested or explicitly deferred.
- [ ] Customer-specific provider behavior recorded.

Status:
Evidence/limitations:

## Operations

- [ ] Backup process recorded and accepted.
- [ ] Recovery process and approver recorded.
- [ ] Monitoring/health checks recorded.
- [ ] Incident owner identified.
- [ ] Support contacts recorded.
- [ ] Customer technical record complete.
- [ ] Customer differences register complete.
- [ ] Release and migration record complete.

Status:
Evidence/limitations:

## Customer

- [ ] Training completed.
- [ ] Customer acceptance testing completed.
- [ ] Known limitations accepted.
- [ ] Launch approval recorded.
- [ ] Handover completed.
- [ ] Support expectations confirmed.

Status:
Evidence/limitations:

## Final approval

- TradesStack implementation owner:
- Technical operator:
- Customer approver:
- Planned launch date:
- Actual launch date:
- Known limitations:
- Final status: PASS / BLOCKED / PASS WITH ACCEPTED LIMITATIONS
- Approval notes:

The current repository supports many of these checks, but Alpha is a fictional
hosted proof and the release manifest currently keeps real-client approval
blocked. Do not mark provider, backup, recovery or operational items complete
without direct evidence.
