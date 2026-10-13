# TradesStack Customer Implementation Playbook

This is the internal operating guide for implementing TradesStack for a
construction company. It is designed for a high-touch, owner-led process. It
is not a self-service SaaS onboarding flow.

TradesStack Main remains the authoritative product source. Each customer gets
an isolated implementation, while useful fixes and reusable capabilities flow
back into Main. Follow the [Business and Product Model](../architecture/TRADESSTACK_BUSINESS_MODEL.md)
and verify technical claims against the [AI Context](../architecture/TRADESSTACK_AI_CONTEXT.md).

## When to use this playbook

Use it from commercial agreement through launch and ongoing support. Keep one
copy of the linked records for each customer. Manual work is acceptable;
undocumented or random work is not.

## Roles

The TradesStack implementation owner coordinates scope, decisions, testing,
launch and support. The technical operator handles repositories, releases,
deployments, migrations, secrets and recovery evidence. The customer supplies
decision makers, workflow knowledge, data, acceptance testers and launch
approval. One person may hold several roles initially.

## Required records

- discovery worksheet;
- requirements register;
- customer technical record;
- customer differences register;
- migration/import record;
- support/change records; and
- go-live and handover records.

Use the templates in this directory. Do not store secret values in them.

## Implementation stages

### 1. Commercial agreement

Confirm implementation scope, subscription, AI arrangement, custom-development
treatment, assumptions, exclusions, milestones and acceptance criteria. No
significant custom work starts before the requirement and commercial treatment
are recorded.

### 2. Discovery

Run [CUSTOMER_DISCOVERY_TEMPLATE.md](CUSTOMER_DISCOVERY_TEMPLATE.md). Map the
customer's actual lifecycle from tender through financial closeout, not just
the screens they initially request.

### 3. Requirements classification

Record every material requirement in
[CUSTOMER_REQUIREMENTS_TEMPLATE.md](CUSTOMER_REQUIREMENTS_TEMPLATE.md). Prefer
configuration, then a reusable Main capability, then a controlled extension.
Customer-specific source is a last resort.

### 4. Implementation planning

Agree launch scope, owners, dates, data scope, modules, integrations,
templates, workflows, risks and accepted limitations. Create the customer
technical record and differences register before technical setup.

### 5. Dedicated technical setup

Provision the private client repository, deployment, dedicated Supabase
project, Storage, Auth and secrets using approved operator procedures. Start
from an approved Main release and record its source SHA, release fingerprint,
client configuration and migration target.

The current release path is described in
`docs/operations/TRADESSTACK_RELEASE_PROMOTION_RUNBOOK.md`. The local
provisioning proof in `proofs/dedicated-client-provisioning/` is not hosted
customer provisioning. Real-customer readiness remains approval-gated.

### 6. Configuration and customization

Configure company identity, branding, locale, permissions, modules, templates,
workflows, integrations and AI settings. Record each meaningful difference
from Main in [CUSTOMER_DIFFERENCES_REGISTER.md](CUSTOMER_DIFFERENCES_REGISTER.md).

### 7. Data migration/import

Agree the import scope, source, owner, validation method and exclusions. Import
customers, suppliers, projects, quotes, pricing, POs, variations, files,
drawings, QA and history only as approved. Preserve historical evidence and
validate organization ownership. Never use a migration shortcut that bypasses
the application's authorization or lineage rules.

### 8. Internal testing

TradesStack tests critical workflows, roles, permissions, tenant isolation,
documents, imports, integrations, migrations, Storage and the configured
differences. Record failures and fixes. General defects are evaluated for
Main; customer-only defects remain recorded against the customer.

### 9. Customer acceptance

The customer runs agreed workflows using representative data and confirms the
acceptance criteria. Acceptance does not waive unresolved security, tenancy,
migration, provenance or recovery blockers.

### 10. Go-live

Use [CUSTOMER_GO_LIVE_CHECKLIST.md](CUSTOMER_GO_LIVE_CHECKLIST.md). A blocked
critical item stops launch. Record the approved release, deployment,
migration state, known limitations, support owner and launch approval.

### 11. Hypercare

Assign a named owner for the first two to four weeks. Review issues regularly,
triage defects separately from new requests, observe actual workflows, and
capture reusable product feedback for Main.

### 12. Ongoing operation

Maintain support, backups, recovery evidence, health checks, customer
differences, subscription/AI reviews and controlled Main upgrades. Revisit the
implementation periodically rather than allowing undocumented drift.

## Main versus customer decisions

```text
Customer request
    ↓
Existing configuration or template?
    ├── Yes → configure and test
    └── No
Useful to other customers?
    ├── Yes → build and release through Main
    └── No
Supported extension boundary?
    ├── Yes → controlled extension and register the difference
    └── No
Commercially justified and safe?
    ├── No → defer or reject
    └── Yes → isolated customer source change with reconciliation plan
```

## Bug handling

Capture customer, environment, release, deployment, migration target,
configuration and evidence first. Determine whether the issue is configuration,
extension, Main, data/migration, provider, or deployment/release related. If it
could affect other customers, reproduce against the relevant Main release and
assess the wider customer set.

## Change requests

A new request is not automatically included implementation scope. Record the
business outcome, classify it, estimate impact, agree commercial treatment and
define acceptance criteria before work begins.

## Controlled upgrades

For each Main release: review customer compatibility and differences, confirm
backup/recovery readiness, validate the release and migration target, prepare
the controlled client upgrade branch, run checks, obtain approval, deploy,
smoke-test and record the resulting client SHA, deployment and migration.

Use the existing promotion tooling rather than copying source manually.

## Post-launch review

At the first review, and periodically thereafter, confirm:

- actual workflow adoption and unresolved issues;
- support and change-request trends;
- Main candidates discovered through customer work;
- active customer differences and reconciliation dates;
- release, migration, backup and monitoring status; and
- module, AI and subscription changes.

