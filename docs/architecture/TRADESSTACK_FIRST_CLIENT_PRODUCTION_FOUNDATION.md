# TradesStack Phase 1U — First-client production foundation

## A. Phase 1U verdict

**PASS 1U WITH CONDITIONS — PRODUCTION FOUNDATION DEFINED WITH LISTED
OWNER/PROVIDER DECISIONS**

The pre-hosting operating foundation is defined sufficiently to plan the next
phase. It is not permission to connect a provider, create a cloud resource,
deploy a client, or use customer data.

## B. Final architectural answer

**PARTIALLY — MATERIAL PRE-HOSTING DECISIONS REMAIN**

The architecture and gates are defined. Provider account selection, exact
region, billing contracts, data-governance terms, RPO/RTO, monitoring/backup
vendors and the final owner authorization remain decisions for the owner.

## C. Local readiness verdict

**LOCAL PRODUCTION FOUNDATIONS PARTIALLY READY — DECISIONS REQUIRED FIRST**

The local Master/client/release architecture is substantially proven. Local
implementation closure remains required for toolchain reproducibility,
inventory records, release/security evidence and the operational runbooks
listed below.

## D. External hosting verdict

**DO NOT AUTHORIZE EXTERNAL HOSTING YET**

Phase 1U defines the authorization gate; it does not pass it. No provider login,
authenticated discovery, cloud resource, deployment or hosted fictional client
is authorized by this document.

## E. Real-customer verdict

**NOT READY FOR REAL CUSTOMER**

A hosted fictional proof must pass first, followed by additional security,
recovery, support, contract, data-governance and customer-acceptance gates.

## F. Executive summary

TradesStack Master remains a private source and release authority. The first
client target is a dedicated application repository and dedicated runtime,
database/Auth/Storage, secrets and operational record set. Provider accounts
should be company-controlled, with client data ownership, export, support,
billing and termination terms documented. The initial operating model is a
reviewed non-secret client/release inventory plus manual approval runbooks.

The next phase may create a fictional hosted client only after the owner makes
the listed provider and ownership decisions and explicitly authorizes exact
resources and mutations.

## G. Source state

Source state was inspected locally only. The repository is on `main`, the
worktree is dirty from earlier work, and no cleanup or destructive Git action
was performed for Phase 1U.

## H. Master SHA

Current HEAD at audit start:

`361bf3f094a8abbb58d20606413686cebc242e66`

## I. Master worktree status

The worktree contains pre-existing tracked modifications and numerous
untracked prior-phase documents, proofs, packages, artifacts and migrations.
They were preserved. The Phase 1U document is a new untracked documentation
file; it is not mixed into earlier implementation changes.

## J. Pre-existing changes

All existing application, test, configuration, package, artifact, baseline,
migration and architecture-document changes reported by `git status` predate
this Phase 1U document. This phase did not classify or rewrite their content,
and does not claim that the dirty worktree is a clean release candidate.

## K. Phase 1U changes

Only this document was added for Phase 1U:
`docs/architecture/TRADESSTACK_FIRST_CLIENT_PRODUCTION_FOUNDATION.md`.

No application code, package, script, schema, migration, provider integration,
infrastructure definition or control-plane implementation was added.

## L. Authority documents read

The local operating instructions, maintained AI context, Master ownership and
repository-foundation material, client consumption/configuration/database and
application-shell proof material, hosted-client readiness material and Phase
1T owner operating model were used as architectural inputs. Current repository
code, migrations, generated types and tests remain authoritative where prose
differs.

## M. Phase 1T reverification

Phase 1T’s conclusions remain valid:

- Master is source/release authority only;
- an internal reference deployment is optional, not a customer runtime;
- dedicated client repositories and data planes are the target;
- clients may be release-skewed and upgrade through reviewed PRs;
- a lightweight non-secret registry is needed before the first real client;
- a full control plane is premature;
- provider and infrastructure choices were intentionally not made.

## N. Current proven architecture

Local evidence proves reusable packages, dedicated client configuration,
baseline plus forward migrations, application-shell releases, ownership-aware
upgrades, fresh-release equivalence, provenance and separate client
repositories. The application preserves organization tenancy, server/database
permissions, private Storage semantics, commercial lineage, QA/accounting
immutability and current/legacy distinctions.

## O. Remaining production gap

The remaining gap is operational rather than a license to broaden the product:
toolchain closure; provider/account ownership; region and data governance;
release distribution; baseline promotion and live-state reconciliation;
secret delivery; Auth/Storage acceptance; backups and restore; monitoring and
support; domain/email/integration policy; cost attribution; export/offboarding;
and a precise external authorization gate.

## P. Master hosting position

Master should remain source/release authority only. It does not need a hosted
production application before the first dedicated client. If an internal
reference deployment is later useful, it must be isolated, synthetic-data-only,
non-customer and clearly subordinate to the release artifacts and repository.

## Q. Infrastructure ownership verdict

**RECOMMENDED INITIAL MODEL: COMPANY-CONTROLLED PROVIDER ACCOUNTS WITH
DEDICATED PER-CLIENT RESOURCES.**

The contract must separately state that client business data belongs to the
client/customer as agreed, that TradesStack operates the service, and that the
customer has defined export and termination rights. Customer-owned hosting is a
possible later model, not the default first-client operating model.

## R. Provider account model

Use company-controlled organizations/accounts for source control, hosting,
database/Auth/Storage, package distribution, monitoring, backups, DNS and
email where the company is responsible for operating the service. Each client
gets an isolated project/resource namespace, credentials and operational
record. Personal accounts and shared human credentials are not acceptable
production ownership.

The exact providers and commercial account structures remain owner decisions.

## S. Source control model

The long-term model is private company-controlled source control with protected
Master and client branches/repositories, reviewed pull requests, immutable
release references, secret scanning, export/retention and least-privilege
automation identities. No provider is selected or connected in Phase 1U.

## T. Client repository ownership

The company should own the first client repositories for supportability and
release provenance, while documenting customer access, data export and
offboarding. Client-owned repositories can be supported only when access,
upgrade, support and continuity responsibilities are contractual and explicit.

## U. Application hosting requirements

The eventual application host must support the Next.js application, HTTPS,
protected environment variables, deployment provenance, clean-build
reproducibility, previews without production secrets, logs, health checks,
rollback/forward-fix procedures and per-client isolation. Hosting must not be
treated as proof that workers, cron, database migration or Storage recovery are
solved.

## V. Database/Auth/Storage model

Each client requires a dedicated database/Auth/Storage boundary or an
equivalent isolation model that preserves organization tenancy, RLS, RPC guards,
private buckets, signed URLs, Auth redirect control, migration ledger and
recovery. The preferred first-client model remains a dedicated Supabase-style
project, but no hosted provider is assumed or connected.

## W. Region/data-location model

Region must be selected per client or from an approved policy using geography,
latency, provider availability, backup location, recovery, residency and cost.
There is no unapproved default region. Data residency and legal compliance are
business/legal decisions, not claims that can be inferred from code.

## X. Toolchain findings

The package manifest and prior clean-client proof identify Next.js `16.3.3`
and the declared Node/npm engine range `>=22.22.2 <23` and `>=11.6.2 <12`.
Prior evidence identified a Master-installed Next/npm skew. This must be
closed before hosting so Master, release artifacts and clean client builds
have one declared reproducible toolchain.

## Y. Toolchain closure plan

Select the authoritative Node/npm/Next inputs from the manifest and lockfile;
make the local Master validation environment reproducible; run a clean install,
lint/typecheck/build and focused tests; repeat the Phase 1R client proof; record
the toolchain in the release identity; and fail release eligibility on drift.
Do not perform a broad dependency update as part of this phase.

## Z. Release/package distribution model

Packages and shell artifacts must be private, immutable, pinned and traceable
to Master SHA, artifact checksum and release identity. A future private registry
or release-artifact channel may be selected; no publication or registry login
occurs in Phase 1U. Client installation must be reproducible without a live
checkout of Master.

## AA. Release identity

The minimum release record contains release ID, Master SHA, shell fingerprint,
package versions/source SHAs, database baseline/migration target, configuration
contract/fingerprint, toolchain, validation evidence, approver and timestamp.
It contains no secrets, customer data or provider tokens.

## AB. Production release gate

No release becomes production-eligible until source, package, shell, database,
configuration, toolchain, security, migration, recovery and client-impact
checks are complete. A successful build is only one gate. A database migration
requires a separate target and approval check.

## AC. Release gate matrix

| Gate | Local design | Before fictional proof | Before real customer |
|---|---|---|---|
| Source/package provenance | Defined | Verify pinned artifacts | Signed/attested preferred |
| Toolchain | Skew identified | Close and repeat clean build | Continuous drift control |
| Database | Baseline/forward model | Hosted reconciliation | Promotion and restore evidence |
| Auth/RLS/Storage | Local architecture | Ordinary-user acceptance | Security review and recovery |
| Secrets | Names/contracts known | Per-client delivery | Rotation/audit/break-glass |
| Operations | Runbooks designed | Monitoring/backup minimum | Tested RPO/RTO and support |
| Customer | None | Fictional only | Contract and acceptance |

## AD. Lightweight client registry

Before the first real client, create a reviewed non-secret registry as a
future local implementation. It should not be a database of customer
operations, a shared runtime dependency or an automatic deployment system.

## AE. Registry data model

Record stable client ID, display name, lifecycle state, repository reference,
runtime/resource references, owner, region, environment, shell/package/database
and configuration targets, release eligibility, deployment/acceptance state,
backup/monitoring evidence, support status, incidents, cost allocation and
offboarding status. Store no secret values or customer operational records.

## AF. Registry authority

The registry is an index. Client repositories, migration ledgers, provider
resource state and client databases remain authoritative for their domains.
Registry edits require review and provenance. A stale registry is an incident
of operational drift, not permission to guess or overwrite client state.

## AG. Baseline promotion requirements

Before any hosted project is called production-ready, approve the Phase 1O
baseline, checksum and migration cut; reconcile it to generated types and
current forward migrations; review Auth/RLS/Storage policies; confirm clean
bootstrap; establish backup/restore; and obtain owner/security approval.
The baseline is not promoted by Phase 1U.

## AH. Live-state reconciliation requirements

Reconcile the actual target’s migration ledger, tables, functions, views,
policies, buckets, Auth settings and generated types. Record differences and
correct through forward migrations or explicit remediation. A migration file’s
presence is not evidence that a hosted schema is applied.

## AI. Migration compatibility model

Use additive/backward-compatible changes first, deploy compatible application
code second, and remove old structures only after all clients move. Track each
client’s schema target separately from shell/package release. No automatic
reverse migration is assumed.

## AJ. Production migration gate

Validate exact client/project identity, current ledger, backup freshness,
preflight checks, compatibility window, permission/RLS/Storage effects,
expected lock/time behavior, migration approval, post-migration checks and
forward-fix plan. Application deployment must stop if a required migration
fails.

## AK. Secret ownership

Master secrets, client secrets, provider secrets and operator access tokens are
different scopes. A client never receives Master secrets. A client’s service
role, database URL, OAuth tokens, AI/email keys, cron secret and worker token
are client-scoped and server-only.

## AL. Secret storage requirements

Use a provider secret manager or equivalent with least privilege, rotation,
audit, environment separation and redacted logs. Secret names may appear in
non-secret inventory; values never enter Git, packages, artifacts, browser
bundles, tickets or the client registry.

## AM. Auth production foundation

Define site URL, exact redirect URLs, invitation, confirmation, reset, rate
limits, email delivery, session/cookie behavior, support access and user
offboarding per client. Validate anonymous, own-organization,
cross-organization and insufficient-permission cases with ordinary users.
No Auth users or URLs are created here.

## AN. Storage inventory

The current repository identifies these buckets: `organization-logos`,
`organization-documents`, `project-drawing-sets`,
`project-variation-attachments`, `supplier-invoice-documents`,
`project-quality-photos`, `task-attachments`, `material-library-imports` and
`retention-claim-documents`. Visibility and domain ownership must remain as
currently defined; private buckets require signed access.

## AO. Storage production foundation

Validate bucket creation, private/public intent, policy scope, MIME/size
limits, opaque keys, signed URLs, upload reservation/completion/abandonment,
cleanup/reconciliation, drawing/takeoff ownership, QA evidence and document
versions. Storage is not restored by a database backup alone.

## AP. Database backup requirements

Define provider backups/PITR, retention, encryption, access, export, restore
target, ledger recovery, Auth metadata coverage and test cadence. Capture
backup freshness in the client inventory. No backup service is created here.

## AQ. Storage backup requirements

Define object export/backup, version and metadata preservation, private policy
recreation, checksum verification, lifecycle/retention and restore-to-isolated
target. Reconcile restored objects against database records.

## AR. Restore proof requirements

Before a real customer, restore a disposable or isolated target and verify
schema, migration ledger, Auth/RLS, Storage, signed access, representative
Files/drawing/QA evidence and application acceptance. Document data-loss window,
operator, result and limitations. No restore is run in Phase 1U.

## AS. RPO/RTO decisions

RPO/RTO are owner and commercial decisions by service tier. They must cover
Postgres/Auth, Storage, configuration/releases, secrets/recovery and provider
integrations separately. Values remain unset until pricing, contract and
provider capability are approved.

## AT. Monitoring minimum

At minimum monitor deployment failures, app errors, database/migration health,
Auth failures, Storage failures, worker/cron failures, provider sync failures,
backup freshness and security signals per client. Monitoring must not expose
private customer payloads or secrets.

## AU. Alerting minimum

Alerts need severity, deduplication, owner, runbook, escalation, acknowledgement
and closure. Critical alerts include migration failure, backup failure,
cross-tenant/security signal, Storage loss, Auth outage, deployment failure and
accounting uncertainty.

## AV. Error reporting verdict

**REQUIRED BEFORE REAL CUSTOMER; HOSTED PROOF MINIMUM REQUIRED.**

The current repository does not prove centralized production error reporting.
The first proof may use a narrowly scoped, privacy-reviewed mechanism, but it
must record client/release context and prevent secret/private-payload leakage.

## AW. Logging/privacy model

Logs use client-safe identifiers, release/deployment identity and correlation
IDs. Redact tokens, connection strings, provider secrets, private files and
unnecessary business payloads. Define access and retention. Existing domain
evidence remains governed by its own immutable/audit rules.

## AX. Support runbook

Support flow: classify issue; identify client/release/provider; gather safe
diagnostics; reproduce; decide config, product, data, provider or incident
path; communicate; choose a reviewed mitigation/release; verify; record root
cause and close. Support does not directly edit business rows as a shortcut.

## AY. Break-glass model

Break-glass access requires named approver, client, purpose, duration, minimum
scope, evidence, logging, customer communication where required, and rotation/
revocation. Financial, QA, accounting and immutable evidence must use existing
revision/corrective-record patterns.

## AZ. Incident model

Record severity, affected client(s), detection, timeline, owner, containment,
release/provider linkage, security/data-integrity assessment, communications,
recovery, follow-up and closure. Cross-client incidents require platform and
client impact separation.

## BA. Domain strategy

Use a controlled company subdomain for a later fictional proof unless the owner
chooses another strategy. Customer custom domains are optional and require DNS,
TLS, Auth redirects, email, ownership and offboarding decisions. No domain is
registered or changed here.

## BB. Auth/domain coupling

Application URL, Auth site URL, allowed redirects, cookie/session settings,
email links and any Xero callback must be reviewed as one deployment record.
`XERO_REDIRECT_URI` must share the application origin where Xero is enabled.

## BC. Email foundation

Separate Auth invite/confirmation/reset from contact and transactional email.
Choose sender ownership, domain verification, deliverability, rate limits,
bounce handling, provider failure behavior, secrets and client attribution.
No email provider is connected.

## BD. Xero foundation

Define per-client OAuth ownership, callback, scopes, encrypted token storage,
tenant selection, sync jobs, retries, uncertain outcomes, webhooks, cost and
offboarding. TradesStack remains authoritative for internal commercial meaning;
Xero is authoritative for provider-side records/status after sync. No Xero
organization is connected.

## BE. AI foundation

Define provider/model policy, server-only keys, cost attribution, quotas,
retention/data use, failure/degraded mode, human review and provenance. AI
cannot become the source of truth for commercial, financial or QA records. No
AI provider is connected.

## BF. Worker inventory

Current local inventory includes the takeoff render worker, cron-backed routes,
Supabase Edge Functions for mobile/time-sheet/invite paths and other cleanup,
sync and learning jobs. This is source inventory, not proof that each job is
ready for production activation.

## BG. Worker runtime requirements

The long-running takeoff worker needs a controlled runtime, client-scoped token,
queue leases, retries, idempotency, timeout/shutdown behavior, health and
failure alerting. A request host alone is insufficient. No worker is deployed.

## BH. Cron inventory

The current `vercel.json` declares eight cron routes, including Xero sync/status,
learning, worksheet classification, document/QA cleanup and supplier pricing.
Routes use secret authorization and background jobs are opt-in. Activation
requires a reviewed allowlist, per-client secret and idempotency evidence.

## BI. Cron requirements

Each job needs exact schedule ownership, timeout, lease/retry behavior,
duplicate protection, alerting, disable switch, provider cost impact and
customer-impact assessment. No cron is activated in Phase 1U.

## BJ. Webhook inventory

Potential future callbacks include Xero/provider callbacks and Auth/email or
other provider events. Each requires exact URL, signature/token verification,
replay protection, idempotency, correlation, retry/reconciliation and
offboarding. No webhook is configured.

## BK. Cost attribution model

Separate shared Master/release costs from per-client runtime, database,
Storage, secrets, domain, email, AI, Xero, worker, monitoring, backup and
support costs. Track committed and actual variable cost, usage spikes and
recovery work by client before commercial launch.

## BL. Customer export requirements

Define export of structured business data, documents/Storage objects, metadata,
provenance and agreed provider/accounting records. Specify format, encryption,
delivery, verification, retention and customer confirmation. No customer data
is exported or used in this phase.

## BM. Offboarding requirements

Freeze changes; confirm retention; export and verify; revoke access/provider
links; preserve immutable financial/QA evidence; retire or transfer exact
resources; document deletion and final release/schema state; and confirm the
customer outcome.

## BN. Data retention decisions

Retention must be set by contract, legal/accounting/QA obligations, security
and provider capability. Define business data, files, logs, backups, releases,
secrets/recovery and incident evidence separately. No retention policy is
claimed complete until owner/legal decisions are recorded.

## BO. Security foundation

Before hosting: review browser/public environment exposure, service-role
leakage, RLS/storage policies, Auth redirects, package and CI credentials,
worker/cron/webhook secrets, provider error logging, preview isolation, backup
access and break-glass. UI visibility is never the security boundary.

## BP. Supply-chain foundation

Pin lockfiles/toolchains, use immutable packages/artifacts, scan secrets and
dependencies, restrict CI identities, preserve source/artifact checksums and
record provenance. Add SBOM/attestation before real-customer operation or
broad automated rollout.

## BQ. Release signing verdict

Checksums and trusted private artifacts can support the first controlled proof.
Signed releases or attestations are required before real-customer operation or
mass rollout. No signing system is implemented in Phase 1U.

## BR. SBOM verdict

**NOT REQUIRED TO BUILD IN PHASE 1U; REQUIRED AS A REAL-CUSTOMER SUPPLY-CHAIN
GATE.** The implementation plan should generate and retain an SBOM for each
production release without placing secrets or customer data in it.

## BS. Owner account security

Use company-owned accounts, MFA, recovery contacts, least privilege, separate
human and automation identities, access reviews, offboarding and break-glass
records. Never rely on one person’s personal provider account for a client.

## BT. Business continuity

Retain source/releases, exportable inventory, backup/restore procedures,
provider recovery access, named substitutes, incident communication and the
ability to rebuild a client without a live Master runtime. Test the recovery
path before real-customer reliance.

## BU. Client version visibility

The owner must be able to identify each client’s shell, packages, database
target, config contract, deployment commit, last acceptance and support status.
This is required in the lightweight registry and must be reconciled to client
state.

## BV. Client drift model

Detect drift across repository commit, release manifest, package set, migration
ledger, config fingerprint, runtime/resource identity, provider settings,
backup/monitoring evidence and inventory. Surface drift for approval; never
silently repair across clients.

## BW. First hosted fictional proof requirements

Only after authorization, the proof must use an exact fictional client ID and
dedicated resources; pinned shell/packages; clean build; approved baseline plus
forward migrations; Auth login/invite/reset appropriate to the proof; ordinary
user RLS/cross-organization denial; representative private Storage acceptance;
deployment provenance; health checks; and no Master runtime/data dependency.

## BX. What can remain unconnected during fictional proof

Real Xero, customer domains, production email sender, real AI accounts, Klaviyo,
nonessential cron, full takeoff worker throughput and real customer data may
remain unconnected if the proof’s scope explicitly excludes them. Core app,
database/Auth/RLS/Storage and recovery evidence cannot be silently omitted.

## BY. First real customer gate

The fictional proof must pass first. Then require contract/data-governance
approval; provider/security review; toolchain closure; baseline promotion;
backup and restore; Storage recovery; monitoring/alerting; support/incident;
cost attribution; export/offboarding; release provenance; named approvers and
customer acceptance. This gate is not passed.

## BZ. Fictional proof vs real customer difference

| Area | Fictional proof | Real customer |
|---|---|---|
| Data | Synthetic only | Contractual customer data |
| Domains/email | Controlled/deferred | Verified and supportable |
| Integrations | Optional test/deferred | Approved live provider state |
| Recovery | Disposable restore evidence | Contractual RPO/RTO and exercises |
| Support | Owner-led pilot | Formal support/incident obligations |
| Security | Controlled acceptance | Security/data-governance approval |

## CA. External hosting authorization gate

Authorization requires a written owner decision naming the exact provider(s),
account owner, project/resource scope, region, budget, data classification,
secret-delivery method, mutation list, rollback/cleanup plan, operator and
acceptance evidence. Without that record, no login or provider mutation occurs.

## CB. Provider decision table

| Capability | Required decision | Phase 1U state |
|---|---|---|
| Source control | Company account/provider | Not selected/connected |
| App host | Next-compatible provider | Not selected/connected |
| DB/Auth/Storage | Dedicated-client platform | Model defined, not connected |
| Packages | Private immutable channel | Model defined, not selected |
| Worker | Long-running runtime | Requirement identified |
| DNS/email | Company/client domain and sender | Not selected |
| Monitoring | Privacy-safe per-client coverage | Not selected |
| Backup | DB plus object recovery | Requirements defined |

## CC. Ownership table

| Asset | Recommended operating owner | Customer position |
|---|---|---|
| Master source/releases | TradesStack | No operational data |
| Client repository/runtime | TradesStack initially | Access/export by contract |
| Client business data | Client/customer as contracted | Export/retention rights |
| Client secrets/provider links | TradesStack operator, scoped per client | No shared Master secret |
| Billing/cost allocation | TradesStack with contract terms | Transparent allocation |
| Recovery evidence | TradesStack operator | Customer communication |

## CD. First-client foundation matrix

| Foundation | Local | Architecture | Before host | Before real client |
|---|---:|---:|---:|---:|
| Master/client boundary | Complete | Defined | Recheck | Maintain |
| Toolchain | Partial | Defined | Close | Monitor |
| Registry | Not implemented | Defined | Implement | Operate |
| Baseline | Local evidence | Defined | Reconcile | Promote |
| Auth/RLS/Storage | Local evidence | Defined | Hosted proof | Security acceptance |
| Backup/restore | Design only | Defined | Prove | Exercise |
| Monitoring/support | Design only | Defined | Minimum proof | Operationalize |
| Provider ownership | Unresolved | Recommendation | Decide | Contract |

## CE. Recovery matrix

| Asset | Recovery authority | Proof required |
|---|---|---|
| Postgres/Auth metadata | DB provider backup/PITR/export | Isolated restore |
| Storage objects | Object backup/export | Object restore/reconcile |
| Source/releases | Protected repository/artifacts | Rebuild clean client |
| Secrets | Secret manager/recovery procedure | Rotation/re-access test |
| DNS/deployment config | Protected non-secret inventory | Reconstruct exact config |
| Provider state | Provider-specific reconciliation | Documented re-link/retry |

## CF. Integration readiness matrix

| Integration | Phase 1U status | First proof |
|---|---|---|
| Xero | Foundation defined, unconnected | Deferred or fictional test only |
| AI | Server-only/cost policy needed | Deferred or controlled test |
| Email/Auth email | Sender policy needed | Controlled proof sender or deferred |
| Takeoff worker | Runtime needed | Disabled unless separately proven |
| Cron | Allowlist/idempotency needed | Disabled unless explicitly scoped |
| Webhooks | Verification/replay model needed | Unconnected |

## CG. Manual vs automated matrix

| Activity | Initial mode | Later automation |
|---|---|---|
| Provider/ownership decision | Manual approval | Workflow record |
| Client inventory | Reviewed manifest | Registry/control plane |
| Release eligibility | Manual gate | Policy evaluation |
| Upgrade | PR and human approval | Cohort orchestration |
| Migration | Explicit approval | Gated pipeline |
| Backup/restore | Runbook/exercise | Scheduled evidence |
| Support/incident | Owner-led | Support/incident system |

## CH. Owner decision register

The owner must decide: company versus customer infrastructure ownership;
provider accounts; package registry; region/residency; billing model; domain;
email; Xero OAuth; AI data/cost policy; worker host; monitoring; backup vendor;
RPO/RTO; retention; support tier; security/compliance posture; customer export;
offboarding; and the date/criteria for first-client authorization.

## CI. Architectural decisions closed by Phase 1U

Closed: Master remains source/release authority; dedicated client isolation;
company-controlled initial account recommendation; separate release domains;
baseline plus forward migrations; no automatic reverse migration; lightweight
registry before real client; staged/manual upgrades; provider-agnostic
requirements; no live Master customer runtime; and no customer data in proof.

## CJ. Business/legal decisions remaining

Customer data ownership and processing terms; residency/compliance; retention;
RPO/RTO and service levels; billing/pass-through; support access; export;
offboarding; customer-owned infrastructure exceptions; and incident notice
obligations remain human/business/legal decisions.

## CK. Provider decisions remaining

Select source control, hosting, database/Auth/Storage, package distribution,
worker, DNS, email, monitoring and backup providers. Confirm account ownership,
region, pricing, recovery, terms and exit/export before login.

## CL. Local implementation still required

Implement only after this design is accepted: clean toolchain closure; reviewed
client/release registry; release-manifest/provenance checks; migration
preflight; secret-name/preview checks; support/incident/export/offboarding
runbooks; recovery checklists; and security/supply-chain validation. This phase
does not implement them.

## CM. Hosted proof still required

After explicit authorization: exact dedicated resources; pinned release;
clean deployment; approved baseline/reconciliation; Auth/RLS/Storage tests;
representative private object recovery; deployment provenance; monitoring
minimum; and proof that Master runtime, data and secrets are not dependencies.

## CN. Risks before external hosting

Provider/account ambiguity; toolchain skew; incorrect baseline promotion;
secret leakage; incomplete Storage recovery; unsupported worker assumptions;
unclear region/residency; cost opacity; missing monitoring; and owner-account
single points of failure.

## CO. Risks before real customer

All CN risks plus incomplete RPO/RTO, support/incident obligations, export and
offboarding, data-retention terms, live provider reconciliation, security
review, customer acceptance, billing and operational continuity.

## CP. Phase 1V recommendation

**Phase 1V — First controlled hosted fictional-client proof and production
foundation implementation.** It should begin only after the owner records the
external hosting authorization gate and exact provider/resource scope.

## CQ. Phase 1V exact scope

Implement the minimum registry/release evidence and required runbooks; close
toolchain skew; select and authorize providers; create only the exact fictional
client resources; bootstrap the approved baseline; prove Auth/RLS/Storage;
deploy the pinned client; test recovery/monitoring minimum; and report all
resource IDs, limitations and cleanup steps. Do not create a full control plane.

## CR. Whether Phase 1V requires external access

**YES, BUT ONLY AFTER EXPLICIT OWNER AUTHORIZATION.** Phase 1U itself uses no
external access. Phase 1V must not infer authorization from this recommendation.

## CS. Conditions before first provider login

Written authorization; selected provider and account; exact resource scope;
region; budget; resource ownership; data classification; secret method;
operator identity; browser/CLI safety plan; rollback/cleanup; acceptance
tests; and an explicit statement that the proof is fictional and uses no
customer data.

## CT. External connections performed

**NONE.** No authenticated discovery, provider login, OAuth, browser connector,
remote API, registry login or external inspection was performed for Phase 1U.

## CU. External resources created

**NONE.** No repository, hosting project, database, Auth user, Storage bucket,
secret, domain, DNS record, OAuth app, package, worker, cron, webhook,
monitoring project, backup service or billing item was created or changed.

## CV. Vercel connection

**NONE.** Vercel is not selected or connected. Its compatibility remains a
future provider decision only.

## CW. Supabase Cloud connection

**NONE.** No hosted Supabase project, database, Auth, Storage, Edge Function or
secret was created or changed.

## CX. Remote Git creation

**NONE.** No remote repository, branch protection, action, webhook or access
permission was created or changed.

## CY. DNS changes

**NONE.** No domain was registered, verified or modified.

## CZ. Provider secret changes

**NONE.** No secret value was requested, read, created, rotated or stored.

## DA. Database changes

**NONE FOR PHASE 1U.** No hosted or local database state, RLS, Storage policy,
Auth state or schema was changed by this phase.

## DB. Historical migration changes

**NONE.** No applied or historical migration was edited.

## DC. Phase 1O baseline changes

**NONE.** The Phase 1O baseline was not promoted, altered or represented as
production-authoritative.

## DD. Product code changes

**NONE.** No application, package, script, API, worker, infrastructure-as-code
or control-plane code was implemented.

## DE. Master commit

**NONE.** The Phase 1U document remains uncommitted.

## DF. Master push

**NONE.** No push was performed.

## DG. Documentation created

Created:
`docs/architecture/TRADESSTACK_FIRST_CLIENT_PRODUCTION_FOUNDATION.md`.

## DH. Documentation updated

No historical Phase 1O, 1S or 1T document was rewritten. The existing dirty
Master worktree was preserved.

## DI. Final Git safety

Master commit: **NONE**. Master push: **NONE**. External mutations: **NONE**.
No customer, real construction company, real project, employee, customer file,
Xero organization, customer domain or customer credential was used.

## Owner-friendly summary

The production foundation is now defined on paper, but hosting is still not
authorized. Before the first fictional client, close the toolchain, choose and
own provider accounts, define region/billing/data policy, implement the small
registry and runbooks, reconcile the baseline, and prove backup/restore,
Auth/RLS/Storage and minimum operations. Only then should the owner authorize
an exact hosted proof.

## Stop condition

This document completes Phase 1U’s audit, decision-closure, architecture and
implementation-plan scope. It does not host anything, connect anything,
provision anything, publish anything, create cloud resources or implement a
control plane.

STOP.
