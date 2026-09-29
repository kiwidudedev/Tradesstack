# TradesStack owner support runbook

This runbook is local operational guidance. It does not authorize direct
production database edits, provider login or customer-data access.

1. Identify the exact client, environment, user organization and reported
   symptom.
2. Identify the client repository commit, release ID, shell/package versions,
   database target and last accepted deployment from the operating registry.
3. Check deployment state, recent release/migration changes and known
   incidents.
4. Check app errors, Auth, database, Storage, worker/cron and integration
   health through approved diagnostics.
5. Classify as product defect, client configuration, client data, provider
   outage, security concern or incident.
6. Mitigate safely: pause a release/job, apply an approved forward fix or
   communicate a provider workaround. Do not edit business rows as a shortcut.
7. Verify the affected workflow, permissions, tenant boundary and historical
   evidence.
8. Record client, release, evidence, action, operator, result and follow-up;
   close only when the owner and customer communication obligations are met.

Escalate immediately for cross-organization access, suspected secret leakage,
financial/accounting evidence, QA evidence/signatures, data loss or uncertain
provider outcomes.
