# TradesStack incident runbook

## First response

Record start time, detector, severity, affected client(s), release/deployment,
operator and a short symptom. Preserve evidence before changing state.

## Incident classes

- application outage or deployment failure;
- database or migration failure;
- Auth outage or authorization anomaly;
- Storage outage or private-object exposure;
- worker/cron failure;
- integration uncertainty;
- backup failure;
- security or cross-tenant concern.

## Response

Assign an incident owner, contain the smallest affected scope, pause a staged
rollout when appropriate, protect immutable commercial/QA/accounting records,
and communicate status to affected parties. Use provider support only through
the approved account and record; no emergency login is inferred from this
runbook.

Recovery is selected between application rollback, forward fix, isolated
database restore, Storage restore/reconciliation, credential rotation or
provider retry. These are different actions.

Close with timeline, impact, data/security assessment, recovery verification,
customer communication, release/provider linkage and corrective actions.
