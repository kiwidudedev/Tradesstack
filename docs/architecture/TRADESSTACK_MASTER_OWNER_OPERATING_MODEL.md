# TradesStack Phase 1T — Master owner operating model

## A. Phase 1T status

**PASS 1T WITH CONDITIONS — OWNER OPERATING MODEL DEFINED WITH LISTED HUMAN DECISIONS**

This is an audit, architecture, operating-model and future-implementation
plan. It does not implement a control plane, deployment system, provider
connection, schema, migration, script, package, API or UI.

## B. Scope and safety result

The governing model is local-only. No authenticated provider discovery,
external connection, external mutation, Master commit or Master push was
performed for Phase 1T. The dirty Master worktree was preserved.

## C. Evidence reviewed

The current repository, `AGENTS.md`, `TRADESSTACK_AI_CONTEXT.md`, the Master
ownership and repository-foundation documents, the client-consumption and
application-shell proof documents, the client configuration/database baseline
documents, and `TRADESSTACK_HOSTED_CLIENT_DEPLOYMENT_READINESS.md` were
reviewed. Current code, migrations and tests remain authoritative over prose.

The local evidence supports a reusable Master-to-dedicated-client architecture,
but does not prove hosted infrastructure, provider ownership, live deployment,
production operations, backup recovery or customer readiness.

## D. Current repository state

At the start of this phase:

- branch: `main`;
- HEAD: `361bf3f094a8abbb58d20606413686cebc242e66`;
- branch is ahead of `origin/main` by one commit;
- worktree is dirty with tracked changes and extensive untracked prior-phase
  documents, proofs, packages, artifacts and migrations;
- the Phase 1S readiness document is untracked prior work;
- this document is the only Phase 1T documentation change.

No existing work was reset, cleaned, restored over, stashed destructively,
committed or pushed.

## E. Existing architecture reverified

Master currently contains the product source, domain implementation,
migrations, tests, package workspaces and release/provenance logic. Previous
phases locally proved package consumption, dedicated client configuration,
baseline plus forward migrations, application-shell release/upgrade behavior,
ownership-aware client changes and fresh-release equivalence.

Phase 1S correctly identifies the next boundary: hosted clients require
separately owned source, runtime, database/Auth/Storage, secrets, domains,
workers, provider connections and operating records. None of those is assumed
to exist here.

## F. Architectural principle

```text
Master product authority
  -> approved release manifest
  -> dedicated client repository
  -> dedicated client runtime and data plane
  -> separately operated construction business
```

Master is the product and release authority. A client environment is an
independent operational system. Customer business data, customer secrets,
customer Auth users and customer runtime state never become Master data.

## G. What TradesStack Master is

Master is the private product source of truth and the place where the owner:

- develops product capability and shared contracts;
- owns the canonical application shell and shared packages;
- owns the migration lineage and approved database release inputs;
- validates and identifies releases;
- maintains compatibility policy and upgrade procedures;
- records non-secret client/release provenance;
- supports clients through controlled releases, runbooks and evidence.

Master is not a customer tenant, a shared customer database, a production
control plane, a customer support database, or a substitute for client
runtime observability.

## H. What Master is not

Master must not become a live customer-like tenant merely to make deployment
convenient. It must not contain customer operational records, client service
role keys, Xero tokens, private Storage objects, Auth users, or client-specific
provider state.

## I. Master hosting question

Master does not need hosting to perform its initial product-authority role.
Local development, protected source control, release artifacts and controlled
validation are sufficient for the current operating scale. A hosted internal
reference deployment may later improve release acceptance, but that is an
optional reference surface, not a production dependency or customer runtime.

## J. Hosting models considered

| Model | Meaning | Assessment |
|---|---|---|
| A | Master is source/release authority only | Preferred initial model; matches current evidence and avoids a fake tenant. |
| B | Master has an internal reference/staging deployment | Useful later for release acceptance; must be isolated and non-customer. |
| C | Master is a live platform application | Not justified; creates tenancy, data, support and security confusion. |
| D | Other, such as a shared customer runtime | Rejected for dedicated-client isolation and provenance reasons. |

## K. Master hosting verdict

**MASTER SHOULD REMAIN SOURCE/RELEASE AUTHORITY ONLY**

An internal reference/staging deployment is a future option under Model B. It
must never be silently treated as Model C or as a customer production
environment.

## L. Internal reference/staging verdict

**OPTIONAL, NOT REQUIRED BEFORE THE FIRST REAL CLIENT**.

If created later, it should use synthetic data, isolated credentials, a clearly
non-production domain, release-candidate acceptance, disposable or explicitly
recoverable infrastructure, and no customer data. It cannot be the authority
for client databases or client support records.

## M. Tenant and data boundary

Each client has its own organization tenancy inside its own client data plane.
`organization_id`, membership, permissions, RLS, RPC guards, private Storage
policies and server-only credentials remain mandatory. Master inventory may
refer to a client identifier and release state, but not copy client business
data.

## N. Owner operating model

Initially the owner may hold product, release, deployment-approval, support
and incident-coordination responsibilities. Those responsibilities are
distinct even when one person performs them. Every consequential action must
have an owner, evidence, approval boundary and recovery path.

The owner operates the product through repeatable release records and
runbooks, not through undocumented edits to customer databases.

## O. Owner lifecycle

```text
discover -> design -> build -> validate -> candidate -> approve
  -> publish release identity -> select client cohort -> upgrade PR
  -> migrate with gate -> deploy -> accept -> monitor -> support/revise
```

Client creation, client upgrade, incident response and offboarding are separate
lifecycles. A successful application build is not proof of a successful
database migration, deployment, customer acceptance or recovery capability.

## P. Development model

Product features are developed in Master against existing domain boundaries.
Before release, the owner traces current and legacy paths, tenancy and
permissions, source-of-truth tables, migration effects, provenance, snapshot
semantics, queue idempotency and affected tests. Customer-specific behavior is
expressed through the approved configuration boundary only.

## Q. Validation model

Validation is layered: focused tests and characterization tests; lint,
typecheck and build; migration/security checks; clean client consumption and
application-shell proof where relevant; then client acceptance after deployment.
No one check substitutes for another. A release can be code-valid but not
client-upgrade-safe.

## R. Release domains

Every release records separate identities for:

1. application shell;
2. shared packages;
3. database baseline/migration target;
4. client configuration contract;
5. deployment/toolchain;
6. optional workers, Edge Functions, cron and provider adapters.

The domains are compatible inputs, not one undifferentiated “version”.

## S. Release identity

A release identity should contain an immutable release ID, Master source SHA,
package versions and source SHAs, shell fingerprint, database target and
migration cut, configuration-contract version/fingerprint, toolchain versions,
validation evidence, approver and creation time. It must contain no secrets or
customer data.

## T. Release states

Recommended states are `draft`, `candidate`, `approved`, `reference-tested`
(if a reference deployment exists), `client-eligible`, `deployed`,
`superseded`, `retired` and `withdrawn`. A state transition requires evidence
and an accountable owner. “Built” is not “approved”.

## U. Release approval gates

Approval requires reproducible source inputs, package and shell fingerprints,
focused and broad validation appropriate to scope, secret-scan results,
database compatibility review, migration plan, rollback/forward-fix plan,
client impact classification and a named approver. Security, data-loss,
financial, QA and accounting changes need heightened review.

## V. Toolchain authority

The package manifest, lockfile, declared engines and clean Phase 1R client
proof are the current authority for reproducibility. The previously observed
Next/npm skew must be closed before a real customer: the declared toolchain
must be pinned and the Master/client clean-build difference resolved. No broad
dependency update is implied by this phase.

## W. Package release model

Packages are private product components. Versions are immutable; packages are
released with source SHA, artifact checksum, compatibility range and release
identity. Clients consume pinned versions through a future approved private
distribution mechanism or pinned release artifacts. No package publication is
performed in Phase 1T, and no registry is selected as final authority yet.

## X. Application-shell release model

The shell is released as an identifiable, checksummed product input. Client
application code may contain client-owned files and configuration. Upgrade
logic must preserve client-owned paths, refuse unsafe ownership conflicts and
record the source release. A client is not a fork of Master merely because it
has a separate repository.

## Y. Database release model

Database releases are baseline plus forward migrations, with a migration ledger
and explicit target. Historical migrations are not replayed blindly into a
production client. Applied state must be reconciled against the actual target
before claiming compatibility.

## Z. Database compatibility model

Use additive, backward-compatible changes first; deploy compatible application
code; perform destructive cleanup only after all affected clients have moved.
Compatibility is assessed per client release and migration target. The schema
is a business-logic and security boundary, not merely an installation detail.

## AA. Database migration model

Migration approval checks target identity, backup readiness, preflight,
permissions/RLS/Storage effects, expected ledger state and application
compatibility. Application deployment must not silently imply an unreviewed
destructive migration.

## AB. Database rollback model

There is no assumed automatic reverse migration. Application rollback,
forward corrective migration, provider restore and duplicate-project recovery
are different operations. The chosen operation depends on whether the failure
is code, schema, data, provider state or infrastructure.

## AC. Baseline promotion model

The local Phase 1O baseline is evidence for a repeatable local path, not
production authority. Before a real client it requires hosted reconciliation,
schema/type compatibility, Auth/RLS/Storage acceptance, backup and restore
evidence, security review and explicit owner approval. No baseline promotion is
performed here.

## AD. Client configuration model

Client configuration is the narrow Phase 1P contract: approved branding,
identity, capability/configuration values and environment-specific public
values. It must not become a disguised data store. Organization members,
clients, projects, quotes, POs, variations, QA and accounting records remain in
the client database.

## AE. Client inventory model

Before the first real client, a lightweight non-secret inventory is required,
but a full control plane is not. Initially it can be a reviewed Git-managed
manifest and runbook containing client ID, repository, release components,
migration target, configuration contract, environment/region, ownership,
deployment state, acceptance evidence, support state and offboarding state.

## AF. Client inventory authority

The inventory is an operational index, not the authority for customer business
data. The client repository, client migration ledger and client provider state
remain authoritative for their respective domains. Inventory changes require
review and must never contain secrets.

## AG. New-customer onboarding model

Initially onboarding is manual but runbook-driven. It includes commercial and
ownership decisions, client identity, repository creation, release selection,
infrastructure plan, region/data governance, baseline gate, secret injection,
Auth/Storage/domain/email decisions, acceptance tests, support contact and
offboarding/export commitment. A new customer is not live until the first-real-
client gate passes.

## AH. Client provisioning model

Provisioning eventually should be repeatable and idempotent, but no automation
is built now. It must create or associate only the exact client resources,
record ownership and region, apply approved database inputs, configure private
Storage/Auth boundaries, and produce provenance. It must not depend on Master
runtime data or credentials at request time.

## AI. Client repository model

Each client receives a separate private repository, not a fork containing
Master history. It contains the approved application shell, pinned packages,
client-owned configuration and deployment inputs. It contains no secrets,
customer operational exports or unreviewed Master changes.

## AJ. Client repository ownership

For the first clients, company-controlled repository ownership is recommended
for supportability, continuity and release provenance, with customer export and
offboarding rights documented. Customer-owned or hybrid ownership remains a
commercial/legal decision, not an implementation assumption.

## AK. Client infrastructure model

The default target is dedicated client runtime, dedicated database/Auth/
Storage, dedicated secrets and dedicated provider state where used. Shared
platform services may be introduced only with explicit isolation, cost,
failure-domain and data-governance evidence.

## AL. Infrastructure ownership

Recommended initial posture: TradesStack controls the infrastructure needed to
support the service, while the contract documents customer data ownership,
access, export, portability, billing allocation and termination. Customer-owned
infrastructure can be supported later if the operating model and support
boundary are explicit.

## AM. Billing ownership decisions

The owner must decide whether base platform costs are bundled, passed through or
allocated. Variable costs—hosting, database, Storage, email, AI, accounting,
workers, monitoring and backups—need per-client attribution even if invoiced as
one subscription. No billing account or provider is selected here.

## AN. Client deployment model

Deployment is a client-repository release operation. A reviewed upgrade PR,
client CI, migration gate, deployment provenance and acceptance precede
production promotion. No direct deployment from an unreviewed Master working
tree is acceptable.

## AO. Environment model

Separate local, preview/test, reference (optional) and production environments.
Preview must not receive production secrets, customer data or service-role
credentials by default. Environment identity, release identity and database
target are recorded independently.

## AP. Reference/staging model

An optional internal reference environment validates a release against synthetic
or disposable data. It is not a customer staging area, not a shared tenant and
not a source of client production data. A client-specific acceptance environment
belongs to that client lifecycle.

## AQ. Domain model

Use a platform-controlled proof subdomain initially if a hosted proof is later
authorized. Custom customer domains require ownership, DNS, TLS, Auth redirect,
email and support decisions. Domain names are not yet registered or configured.

## AR. Auth URL model

For each client, application site URL, Auth site URL, exact redirect URLs,
invite/confirmation/reset behavior and email sender are one reviewed record.
`XERO_REDIRECT_URI`, where used, must share the application origin. No Auth
users or callback configuration are created in this phase.

## AS. Secret model

Master secrets, client secrets and provider credentials are separate. Secrets
never enter Git, release manifests, browser bundles, client inventory or logs.
Service-role keys, database URLs, Xero tokens, AI keys, email keys, cron
secrets and worker tokens remain server/operator scoped.

## AT. Secret access model

Access is least privilege, time-bounded where possible, per client and
auditable. Support staff do not receive blanket cross-client secrets. Break-
glass access requires named approval, purpose, evidence and rotation review.

## AU. Client upgrade model

Master publishes a release identity; a client upgrade branch/PR applies only
the compatible Master-owned changes, preserves client-owned changes, updates
packages/config/database target as required, passes CI and obtains migration
approval. Deployment and acceptance update the inventory. Automatic mass upgrade
is not allowed initially.

## AV. Release skew model

Client skew is expected and must be visible. A client record tracks shell,
package, database and configuration targets separately. Compatibility windows,
security deadlines and unsupported versions are explicit. Skew is managed, not
silently erased.

## AW. Staged rollout model

Use cohorts: internal/reference (if available), pilot client, low-risk clients,
then broader clients. Gate on health, migration outcome, support load and
customer acceptance. Halt rollout on security, data-integrity, financial or
cross-tenant signals.

## AX. Hotfix model

Hotfixes have a narrow scope, explicit affected clients, elevated review,
security/compatibility checks and a forward-fix or rollback plan. Emergency
changes are documented after the fact if immediate action is necessary, then
reconciled into Master so client state does not become an undocumented fork.

## AY. Security-update model

Security updates can override normal cadence but not identity, authorization,
provenance or audit. Affected clients are inventoried, prioritized by exposure,
and upgraded in a controlled cohort. Unsupported clients receive a documented
risk decision and deadline.

## AZ. Support model

Support is a product operation: intake, severity, ownership, evidence capture,
reproduction, safe mitigation, release/incident linkage, customer update and
closure. Support must distinguish product defect, client configuration, client
data, provider outage and customer workflow issue.

## BA. Support access model

Support uses logs, health records, customer-provided evidence and approved
read-only diagnostics first. It does not directly edit production business
rows to “fix” a screen. Break-glass data correction must be authorized,
transactional, auditable, reversible or compensating, and follow the domain’s
revision/snapshot rules.

## BB. Client health model

Health is a per-client view of deployment version, migration target, app errors,
Auth failures, database health, Storage failures, worker/cron state, provider
sync state, backup freshness and unresolved incidents. It is not a claim that a
client is healthy merely because a deployment succeeded.

## BC. Monitoring model

Monitoring eventually spans platform/release, client runtime, database/Auth/
Storage, workers/cron, integrations and business-critical failures. It must
preserve tenant privacy and avoid logging secrets, tokens, private payloads or
unnecessary customer identifiers.

## BD. Alerting model

Alerts require severity, owner, deduplication, runbook, escalation and closure
evidence. Critical alerts include deployment failure, migration failure,
cross-tenant/security signals, backup failure, Storage loss, authentication
outage and accounting/provider uncertainty.

## BE. Logging model

Logs are operational evidence, not a customer data warehouse. Correlate by
client-safe identifiers and release/deployment identity; redact secrets and
private business payloads; define retention and access. Provider responses are
stored only where the domain’s existing evidence model requires them.

## BF. Backup model

Back up Postgres/Auth metadata, Storage objects, source/release artifacts,
non-secret deployment configuration and secret recovery/rotation material as
separate classes. A database backup does not restore Storage objects or
provider-side state.

## BG. Database restore model

Restore is a controlled disaster-recovery operation: identify the exact client,
point in time, target, data-loss window, application compatibility and approval;
restore or duplicate into an isolated target; validate RLS/Auth and integrity;
then execute a documented cutover. It is not an everyday rollback.

## BH. Storage restore model

Storage recovery must preserve opaque keys, document versions, drawing-set
ownership, QA evidence semantics, private bucket policies and signed access.
Object recovery is tested separately from database recovery and reconciled with
database metadata.

## BI. Disaster-recovery model

Define RPO/RTO per commercial tier, provider failure assumptions, alternate
operator access, restore order, customer communication, evidence retention and
annual or risk-based exercises. RPO/RTO values remain human decisions.

## BJ. Incident model

Incidents have severity, affected client(s), start/end, detection, owner,
timeline, containment, customer communication, release/provider linkage,
data-integrity/security assessment, recovery, post-incident actions and closure
approval. A client incident must not be hidden inside a generic platform note.

## BK. Offboarding model

Offboarding freezes changes, confirms contract and retention obligations,
exports agreed data/documents, preserves immutable financial/QA evidence,
revokes access and provider links, separates or retires infrastructure safely,
records final release/migration state and confirms deletion/retention outcomes.

## BL. Customer data export model

Exports must cover structured business data, documents/Storage objects,
metadata, provenance and agreed accounting/provider records in usable formats.
Export scope, format, encryption, delivery, verification and retention are
contractual decisions. No customer data is exported by Phase 1T.

## BM. Xero operating model

Xero remains an organization-scoped external accounting provider. TradesStack
owns internal quotes, POs, variations, invoices, claims and cost semantics;
Xero owns provider-side objects/status after synchronization. Each client’s
OAuth state, encrypted tokens, callbacks, sync jobs, retries and uncertain
outcomes are isolated and supportable. No Xero connection is made here.

## BN. AI operating model

AI is server-only, cost-attributed and bounded by organization/project context.
Relational operational records remain canonical. AI suggestions require the
existing validation, review, apply, provenance and correction patterns. Provider
keys, models, quotas, retention and customer-data policy remain owner decisions.

## BO. Email operating model

Auth email, invite email, contact email and transactional notifications have
separate ownership, sender, deliverability, rate-limit and failure policies.
Email readiness is not inferred from an application build. No sender/provider
is configured here.

## BP. Worker operating model

Long-running takeoff rendering and other workers require a deliberate runtime,
per-client token, queue lease/idempotency behavior, health monitoring and
shutdown/retry procedure. A web host’s request runtime must not be assumed to
be a worker runtime.

## BQ. Cron operating model

Cron routes use authenticated, per-environment secrets and opt-in job
allowlists. Each job needs idempotency, lease/retry evidence, timeout limits,
alerting and owner. The current eight declared routes are inventory evidence,
not permission to activate them.

## BR. Webhook operating model

Inbound callbacks require exact URL ownership, signature/token verification,
replay protection where applicable, idempotent handling, provider correlation
and failure/retry reconciliation. No webhook is configured here.

## BS. Files operational model

General Files, drawings, QA evidence, accounting attachments and other domain
objects retain their current semantic boundaries. Private Storage, signed URLs,
version identities, cleanup/reconciliation and ownership policies are preserved;
they are not collapsed into a generic public bucket.

## BT. QA operational considerations

The current QA engine and older quality subsystem remain distinct. Client
support and release validation must test whichever path is affected. Completed
QA definitions, responses, evidence, hold releases and signatures remain
historically defensible and immutable.

## BU. Commercial operational considerations

Estimates, quotes, POs, variations, costs, claims and accounting records are
not interchangeable. Awarded evidence, quote revisions, commercial lineage,
pricing source/version and accounting revisions must survive client upgrades.

## BV. Client customisation model

Supported customization is configuration within the approved contract: brand,
identity, approved capability settings and environment values. Customer-
specific security or workflow behavior must not be hidden in a feature flag or
manual patch.

## BW. Client fork policy

Customer-specific forks are not supported as the default business model. A
client-owned change either becomes a reviewed Master capability, an approved
configuration, or an explicitly priced separate product line with a documented
support boundary. Silent divergence is a release and support failure.

## BX. Feature-flag verdict

**NOT A SUBSTITUTE FOR CLIENT CUSTOMISATION OR SECURITY.** Feature flags may
eventually control safe presentation/rollout behavior, but RLS, permissions,
workflow authority and data isolation remain server/database boundaries.

## BY. Extension API verdict

**NOT REQUIRED BEFORE THE FIRST REAL CLIENT.** Do not invent an extension API
until a real repeated requirement, ownership boundary, versioning policy and
security model justify it.

## BZ. Control-plane options

1. no control plane, with runbooks and manifests;
2. lightweight non-secret client/release registry;
3. automated deployment/provisioning control plane;
4. full multi-client operations platform.

## CA. Control-plane verdict

**LIGHTWEIGHT CLIENT/RELEASE REGISTRY REQUIRED BEFORE FIRST REAL CLIENT;
FULL CONTROL PLANE NOT REQUIRED BEFORE FIRST REAL CLIENT.**

The first registry can remain a reviewed non-secret inventory. It must not
become a second product database or an automatic mass-upgrade system.

## CB. Control-plane minimum data

Client ID; repository and runtime references; owner; environment/region;
application-shell, package, database and config targets; deployment state;
last acceptance; backup/monitoring state; support status; incidents; upgrade
eligibility; and offboarding status. Never store secrets or operational client
records.

## CC. Control-plane future actions

Later stages may automate drift detection, release eligibility, health
inventory, cohort upgrades, incident linkage, backup evidence and offboarding
checklists. Automation must remain approval-gated and client-scoped.

## CD. Human approval boundaries

Human approval remains mandatory for new-client acceptance, infrastructure and
billing ownership, region/residency, baseline promotion, production migrations,
security releases, destructive schema changes, mass rollout, break-glass data
access, provider OAuth, incident closure after data risk, export and
offboarding.

## CE. Audit model

Audit records answer who changed what, for which client, from which release,
against which migration target, with which approval, when, and with what
result. Audit records are append-oriented and separate from customer business
records.

## CF. Provenance model

Provenance links Master source SHA, release identity, package artifacts,
client repository commit, configuration fingerprint, migration ledger,
deployment identity, operator/workflow and acceptance result. It never embeds
secret values. Commercial and QA provenance inside the client remains governed
by the existing domain architecture.

## CG. Client creation record

Record client identity, commercial owner, repository/runtime/data ownership,
region, release inputs, configuration contract, baseline/migration target,
secret injection confirmation, acceptance evidence, support tier, billing
allocation and export/offboarding terms.

## CH. Client upgrade record

Record source release, client PR/commit, preserved client-owned changes,
compatibility result, migration approval/ledger, deployment result, acceptance,
rollback/forward-fix decision and inventory update.

## CI. Incident record

Record client scope, severity, timeline, detection, release/provider state,
containment, data/security assessment, communications, recovery, follow-up
owner and closure approval.

## CJ. Offboarding record

Record export scope and verification, final release/schema state, retention and
deletion decisions, revoked access/providers/secrets, infrastructure disposition,
customer confirmation and evidence retention.

## CK. Access-control matrix

| Role | Master source | Client data | Release approval | Production access |
|---|---|---|---|---|
| Product owner | approve/write by policy | support-limited | yes | break-glass only |
| Developer | reviewed code | none by default | no | none |
| Release operator | read/release | operationally scoped | delegated | controlled deploy |
| Support operator | read diagnostics | approved scoped access | no | no direct mutation |
| Customer admin | client admin | own organization | customer acceptance | own app only |
| Provider/runtime admin | infrastructure scope | no business access by default | no | audited platform access |

## CL. Provider strategy

Provider choice is an architecture decision, not a prior assumption. The
current repository makes Vercel, Supabase and GitHub plausible candidates based
on source shape and prior documents, but Phase 1T selects none and connects to
none. The target model should remain portable enough to change providers
without changing client tenancy or release identity.

## CM. Source-control requirements

Private source, protected branches, reviewed PRs, immutable release references,
least-privilege CI identity, secret scanning, retention and export. The
specific provider remains undecided.

## CN. Release/package storage requirements

Immutable artifacts, checksums, source provenance, retention, access audit,
private installation and restore/export. A registry is not a second source
tree and published versions are never overwritten.

## CO. Application-hosting requirements

Next.js-compatible runtime, HTTPS, environment separation, deployment SHA
provenance, protected secrets, health checks, logs, rollback strategy and
supportable preview behavior. No host is chosen here.

## CP. Database/Auth/Storage requirements

Dedicated client project or equivalent isolation, Postgres/RLS/RPC support,
private Storage and signed URLs, Auth redirect control, backup/recovery,
migration ledger, Edge Function support where required and per-client secrets.

## CQ. Worker-hosting requirements

Long-running process support, queue leases, retries, idempotency, token
separation, observability, controlled deploy and recovery. Web request hosting
alone is insufficient evidence.

## CR. DNS requirements

Owned domain/subdomain, DNS/TLS control, exact Auth/Xero callback records,
environment separation, certificate renewal and offboarding procedure.

## CS. Email requirements

Verified sender/domain, Auth/invite/reset delivery, transactional separation,
rate limits, bounce/complaint handling, secret rotation and client attribution.

## CT. AI provider requirements

Server-only keys, model/version policy, per-client cost attribution, quotas,
data-retention decision, failure/degraded mode, review/provenance and provider
offboarding.

## CU. Monitoring requirements

Application, deployment, database/Auth/Storage, worker/cron, integration,
security and business-critical failure coverage, with tenant-safe logs and
runbooks.

## CV. Backup provider requirements

Postgres/Auth and Storage coverage, encryption, retention, restore testing,
access audit, geographic policy, RPO/RTO and independent recovery evidence.

## CW. Cost architecture

Shared costs include Master development, release tooling, validation and
platform operations. Per-client costs include runtime, database/Auth/Storage,
secrets, domains, email, AI, Xero, workers, monitoring, backups and support
load. Allocation rules must be visible before pricing a real client.

## CX. Per-client cost visibility

Track committed and actual variable cost by client and provider category,
including shared-cost allocation, usage spikes, failed jobs and recovery work.
No provider billing data is connected or collected here.

## CY. One-to-five client model

One owner or small team; manual runbook; reviewed inventory; dedicated client
repositories and data planes; staged upgrades; manual support and restore
exercises. This is the recommended first operating model.

## CZ. Approximately-ten client model

Add a lightweight registry, automated release/drift inventory, cohort upgrades,
standard health checks, backup evidence and explicit support rotation. Avoid a
full control plane unless manual work is demonstrably the bottleneck.

## DA. Approximately-fifty client model

Require a real control plane, dedicated release/operations/support roles,
provider abstractions, automated provisioning and restore testing, formal
incident management and stronger cost/data governance.

## DB. Approximately-one-hundred client model

Require full multi-client operations, SRE/support coverage, regional and
residency governance, enterprise security/compliance evidence, capacity
planning, customer success and formal business continuity.

## DC. Single-owner model

The owner can operate 1–5 clients only if changes, migrations, provider
access, support and incidents are explicitly separated in records. Personal
memory is not an operating control. The owner must schedule recovery exercises
and maintain a second-person or delegated emergency path before critical
customers depend on the service.

## DD. Future team roles

Product owner; release manager; platform/infrastructure operator; database/
security owner; support/customer-success owner; integration owner; finance/
billing owner; and incident commander. One person may initially hold multiple
roles, but approval conflicts must be recognized.

## DE. Owner dashboard information model

Release candidates; client release skew; upgrade eligibility; migration state;
deployment/health; backup freshness; open incidents; provider failures;
security deadlines; cost anomalies; support queue; and offboarding actions.
This is a future information model, not a request to build a dashboard now.

## DF. New-client owner experience

Choose contract and ownership; assign client identity; select approved release;
complete repository/data-plane checklist; validate baseline/Auth/RLS/Storage;
run acceptance; record support/billing/export terms; approve go-live.

## DG. Upgrade owner experience

Select eligible cohort; review impact and compatibility; inspect generated PR;
approve migration; deploy; run acceptance; observe; close or forward-fix; update
inventory and customer communication.

## DH. Support owner experience

Classify issue; identify client/release/provider; gather safe diagnostics;
reproduce; choose support/config/release/incident path; communicate; preserve
evidence; close with corrective action.

## DI. Disaster owner experience

Declare incident; identify client and recovery objective; freeze risky changes;
restore in isolation; validate database/Auth/RLS/Storage and business evidence;
cut over with approval; communicate; reconcile inventory and conduct review.

## DJ. Offboarding owner experience

Confirm scope; export and verify; freeze and revoke; preserve legal/financial/
QA evidence; retire or transfer exact resources; confirm customer outcome;
record deletion and retention.

## DK. Automation maturity table

| Stage | Operating method |
|---|---|
| 1–5 clients | Runbook, manifests, manual approvals and scripts used only as reviewed tools. |
| ~10 | Registry, drift/health inventory, cohort release workflow and backup evidence. |
| ~50 | Provisioning, control plane, automated recovery tests and dedicated roles. |
| ~100 | Full operations platform, regional governance and formal reliability program. |

## DL. What remains manual initially

Customer qualification, ownership/billing/region decisions, release approval,
client creation, provider selection, secret injection, baseline promotion,
production migration, acceptance, incident declaration, exports and
offboarding.

## DM. What should be scripted next

After external decisions are made: deterministic client inventory validation,
release-manifest generation, ownership conflict checks, clean-build proof,
migration preflight, secret-name checks, acceptance checklist generation,
backup-freshness checks and drift reporting. Scripts must remain idempotent and
client-scoped.

## DN. What eventually belongs in a control plane

Client/release inventory, provider/resource references, eligibility, cohort
rollouts, migration/deployment evidence, health, incidents, backup status,
cost allocation and offboarding. It must not own customer operational data.

## DO. What always requires human approval

Production database changes, destructive actions, security exceptions,
cross-client access, provider OAuth, billing/ownership changes, baseline
promotion, mass rollout, data export, incident closure with data risk and
offboarding.

## DP. Drift detection model

Compare inventory to client repository commit, release manifest, package set,
migration ledger, config fingerprint, runtime identity, provider resource and
backup/monitoring evidence. Drift is surfaced for decision; it is not silently
repaired across clients.

## DQ. Infrastructure-as-code verdict

**NOT IMPLEMENTED OR REQUIRED IN PHASE 1T.** It becomes appropriate after
provider ownership, resource topology, secrets strategy, state ownership and
recovery rules are approved. IaC must not erase manual approval boundaries.

## DR. Client identity standard

Use a stable opaque client ID, human display name, organization identity,
environment suffix and lifecycle status. Do not derive security from a display
name or expose internal provider identifiers unnecessarily.

## DS. Resource naming standard

Names should be deterministic, provider-safe, environment-aware and reversible
to client ID, with no secrets or sensitive business names where avoidable.

## DT. Security and supply-chain model

Pin dependencies and toolchains; preserve lockfiles; scan secrets and
dependencies; record SBOM/attestation when real-customer operation warrants it;
use immutable artifacts; restrict CI identities; protect branches; and verify
release fingerprints before client upgrade.

## DU. Release-signing verdict

Checksums and trusted private release handling are adequate for the local and
fictional design stage. Signed releases/attestations are required before real
customer operation or broad automated rollout. No signing system is built now.

## DV. Privacy/data-governance decisions

Define data ownership, processor/subprocessor responsibilities, retention,
residency, export, deletion, AI/provider use, support access and incident
notification before a real customer. Technical isolation does not itself make a
legal/compliance promise.

## DW. Region model

Region is chosen per client or approved region policy using geography, latency,
provider availability, residency, backup location, recovery and cost. No
region is selected in Phase 1T.

## DX. Global expansion considerations

Plan for timezone/date/number/currency/tax/accounting behavior, regional
provider availability, data transfer, support hours, localization and
residency. Do not prebuild global infrastructure before demand and policy.

## DY. Enterprise-future requirements

Expect stronger SSO, audit export, retention/legal hold, segregation of duties,
regional controls, contractual SLAs, security review, incident evidence and
customer-owned keys only when enterprise demand justifies them.

## DZ. First-real-client minimum operating system

Required before go-live: approved company/client ownership and contract;
dedicated repository and data plane; toolchain closure; approved baseline and
forward migrations; Auth/RLS/Storage acceptance; secret separation; HTTPS and
email decision; backup/restore evidence; monitoring/alerting minimum; support
and incident runbooks; inventory; cost allocation; export/offboarding plan;
release provenance; named approvers; and customer acceptance.

## EA. First-real-client gate

**NOT YET PASSED.** Phase 1S and prior local proofs are necessary but do not
close hosted reconciliation, provider ownership, recovery, operations, cost,
data-governance or first-customer acceptance.

## EB. Blockers before first real client

Toolchain skew; baseline promotion and live reconciliation; provider/account
ownership; region/residency; dedicated runtime/data plane; secret delivery;
Auth/Storage/email/domain decisions; backup/restore; monitoring/alerting;
support and incident ownership; cost allocation; export/offboarding terms;
security/supply-chain review; and customer acceptance.

## EC. Required soon after first client

Automated health/drift inventory, repeatable backup/restore exercises,
controlled package distribution, release signing/attestation, cost reporting,
support rotation, incident exercises and provider failure runbooks.

## ED. Required before approximately ten clients

Lightweight control plane, staged cohort automation, upgrade eligibility,
client health view, backup evidence automation, formal support queue and
second-operator continuity.

## EE. Required before approximately fifty clients

Full control plane, automated provisioning and recovery testing, dedicated
operations/release/support roles, provider abstraction and formal reliability
and data-governance program.

## EF. Required before approximately one hundred clients

Full multi-client operations, SRE capacity, regional governance, enterprise
security/compliance, financial controls, customer success and business
continuity scale.

## EG. Premature architecture to avoid

Avoid a shared customer database, live Master tenant, automatic mass upgrades,
unbounded feature flags, customer forks, a new parallel commercial/QA/files/
accounting model, a full control plane before need, provider lock-in without
exit evidence, or direct support edits that bypass domain authority.

## EH. Risk register

| Risk | Current treatment |
|---|---|
| Master becomes a customer runtime | Keep source/release-only verdict. |
| Client drift/forks | Ownership-aware PRs, inventory and conflict refusal. |
| Migration/data loss | Baseline gate, ledger, backup/restore and forward-fix policy. |
| Cross-tenant exposure | Existing org/RLS/RPC/Storage invariants remain mandatory. |
| Provider lock-in | Select providers later; preserve release/data boundaries. |
| Support overload | Runbooks, cohorts, health inventory and staged automation. |
| Secret leakage | Per-client server-only secrets, scans and audited access. |
| Recovery failure | Separate DB/Storage/config/secret recovery and exercises. |
| Cost opacity | Per-client variable-cost attribution. |
| Single-owner dependency | Separate duties in records and add continuity before scale. |

## EI. Single points of failure

The owner’s product knowledge, release approval, provider access, migration
knowledge, backup recovery and support context are current concentration risks.
Mitigate with written runbooks, immutable records, exportable inventory,
second-person emergency access and tested recovery.

## EJ. Business continuity

Continuity requires source/release retention, client export, provider access
recovery, backup restoration, named substitutes, incident communication and a
documented ability to rebuild a client without Master runtime availability.

## EK. Decision register

| Decision | Phase 1T outcome |
|---|---|
| Master hosting | Source/release authority only; optional isolated reference later. |
| First-client operating model | Manual runbook plus lightweight inventory. |
| Client topology | Dedicated repository/runtime/data plane. |
| Upgrade policy | Explicit PR, migration gate, staged cohort; no mass auto-upgrade. |
| Control plane | Lightweight registry before first real client; full control plane later. |
| Provider selection | Unresolved human decision; no connection made. |
| Baseline | Local proof only until promotion gate passes. |

## EL. Human decision register

The owner must decide company/customer infrastructure ownership, source-control
provider, hosting/database providers, regions, package distribution, billing,
domains, email, Xero OAuth model, AI cost/data policy, worker runtime,
monitoring, backup retention, RPO/RTO, support tiers, contract/export terms,
security/compliance posture and the date for first-client readiness.

## EM. Provider decision table

| Capability | Decision state |
|---|---|
| Source control | Provider not selected/connected. |
| App hosting | Provider not selected/connected; Next-compatible host required. |
| Database/Auth/Storage | Dedicated-client model selected; provider not connected. |
| Package registry | Private immutable distribution required; provider undecided. |
| Worker runtime | Separate long-running runtime required where worker remains. |
| DNS/email/monitoring/backups | Required design inputs; no accounts changed. |

## EN. External connections performed

**NONE FOR PHASE 1T.** No authenticated discovery, login, OAuth, provider API,
browser connector or remote inspection was used for this phase.

## EO. External resources created

**NONE.** No repository, hosting project, database, Auth user, Storage bucket,
secret, DNS record, provider app, cron, worker, webhook, billing item,
monitoring project or backup service was created or changed.

## EP. Vercel connection

**NONE.** Vercel remains only a possibility mentioned by the existing source/
Phase 1S analysis. No login, project, deployment, domain or secret was created.

## EQ. Supabase Cloud connection

**NONE.** No hosted project, database, Auth, Storage, Edge Function, secret or
provider configuration was created or changed.

## ER. Remote Git creation

**NONE.** No remote repository, branch protection, webhook, action or access
permission was created or changed.

## ES. DNS changes

**NONE.** No domain was registered, verified or changed.

## ET. Provider secrets changed

**NONE.** No secret value was requested, read, created, rotated or stored.

## EU. Database changes

**NONE for Phase 1T.** No database, migration, schema, RLS, Storage policy or
Auth state was changed.

## EV. Historical migration changes

**NONE.** Existing migration history was not edited.

## EW. Phase 1O baseline changes

**NONE.** The baseline remains evidence from prior phases and was not promoted
or altered here.

## EX. Product code changes

**NONE.** No application, package, script, API, worker or infrastructure code
was implemented for Phase 1T.

## EY. Master commit

**NONE.** The Phase 1T documentation change is intentionally uncommitted.

## EZ. Master push

**NONE.** No push was performed.

## FA. Documentation created

Created this document:
`docs/architecture/TRADESSTACK_MASTER_OWNER_OPERATING_MODEL.md`.

## FB. Documentation updated

No historical Phase 1R or Phase 1S document was rewritten. The existing dirty
worktree remains preserved.

## FC. Phase 1U recommendation

**Phase 1U — Real-customer production-readiness closure and first-client go-
live gate.** It should remain decision- and evidence-driven, with external
connections only after explicit owner authorization.

## FD. Phase 1U exact scope

Close toolchain reproducibility; decide provider/account/region ownership;
promote and reconcile the baseline; prove Auth/RLS/Storage; design and test
database and object recovery; establish monitoring/alerting; decide domain,
email, Xero, AI and worker policies; create the lightweight inventory; define
support/incident/export/offboarding records; perform security/supply-chain
review; and pass the first-real-client gate. Do not build a full control plane
unless these results demonstrate it is necessary.

## FE. First future phase that may require external connections

The first phase that may require them is the explicitly authorized execution
phase after Phase 1U decisions are recorded. It must name exact providers,
resources, identities, region, mutation scope and cleanup plan before access.

## FF. Conditions before external hosting authorization

Written owner authorization; selected accounts/providers; resource ownership;
region/residency; budget/billing; secret-delivery method; rollback/cleanup;
support and incident owner; baseline approval; and a precise mutation list.

## FG. Master worktree preserved

Pre-existing tracked and untracked work was left intact. Phase 1T adds only the
authority document named above. No unrelated cleanup was performed.

## FH. Final Git safety

Master commit: **NONE**. Master push: **NONE**. External mutations: **NONE**.

## FI. Owner-friendly summary

TradesStack Master should initially be run as a private product and release
authority, not as a hosted customer application. Each real client should have
its own repository, runtime, database/Auth/Storage, secrets and operational
records. The owner should release deliberately, upgrade clients through reviewed
PRs and migration gates, support through evidence and runbooks, and keep a
lightweight non-secret inventory before the first customer. Hosting, provider,
billing, region, recovery and customer-ownership choices still require human
decisions.

## FJ. Final architectural question

**PARTIALLY — OPERATING MODEL IS DEFINED BUT MATERIAL DECISIONS REMAIN**

The operating model, release boundaries, client isolation, support model,
control-plane timing and Master hosting verdict are defined. Provider selection,
ownership, region, billing, recovery objectives, data governance and first-client
go-live inputs remain intentionally unresolved.

## FK. Final Phase 1T verdict

**PASS 1T WITH CONDITIONS — OWNER OPERATING MODEL DEFINED WITH LISTED HUMAN DECISIONS**

## FL. Limitations and unverified items

No hosted provider state, live deployment, remote repository, production
database, Storage object, Auth user, provider account, billing state,
monitoring state, backup state or customer acceptance was verified. Public
provider behavior was not needed to answer the local operating-model question.
Those items remain future execution evidence, not assumptions supplied by this
document.

## FM. Stop condition

This document completes the Phase 1T audit/design deliverable. No
implementation, connection, mutation, commit or push is authorized by it.

STOP.
