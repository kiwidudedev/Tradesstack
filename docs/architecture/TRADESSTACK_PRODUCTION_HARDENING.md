# TradesStack Phase 1X-B — Production hardening and first-customer operational readiness

## A. Phase 1X-B verdict

**PARTIALLY — SPECIFIC PRODUCTION-HARDENING DECISIONS / PROOFS REMAIN**

The product commissioning baseline remains accepted for the fictional hosted
Alpha proof. This phase does not authorize a real customer. Material recovery,
provider-access, monitoring and operational-ownership gaps remain.

## B. Real-customer gate status

**NO — RESOLVE LISTED HARDENING ITEMS FIRST**

This is not a product-feature failure. It is an operational readiness gap.

## C. Executive summary

What is proven locally: the declared Node/npm/Next toolchain, release
validation, release metadata checks, migration repository preflight, registry
secret scan, package boundaries and the public Alpha HTTP smoke. What is
recorded from the previous hosted commissioning: Alpha is fictional, isolated,
on Vercel Hobby and Supabase Free/NANO in Sydney, with Xero, AI, email, cron,
worker, custom DNS and third-party monitoring off.

What is not proven: a recoverable database backup, database restore, independent
Storage backup/restore, Auth recovery, operational alerting, provider account
recovery, a clean-machine hosted redeploy, a live Vercel rollback, or a real
Alpha export. These are recorded honestly as gaps or tabletop-only procedures.

## D. Master state

At audit time Master was on `main`, local HEAD
`9e726716be48439fd4833a3cce808c8924b18fa7`, and remote `origin/main` resolved
to the same SHA. The worktree was dirty with pre-existing `next-env.d.ts`
changes and extensive prior-phase untracked artifacts/documents/migrations.
No reset, clean, restore, stash, force-push or history rewrite was used.

Local authoritative validation passed:

- `npm run ops:validate-release` — PASS;
- toolchain — PASS: Node 22.22.2, Corepack npm 11.6.2, Next 16.3.8;
- release lint — PASS;
- release tests — PASS;
- release TypeScript — PASS;
- release identity, registry, migration preflight, security and drift — PASS;
- package boundary check — PASS.

The initial dependency audit found a critical Next.js 16.3.3 advisory affecting
`next/og`. Master was narrowly upgraded to Next.js 16.3.8 with matching
`eslint-config-next`; the production build and release validation pass after
the upgrade. Alpha still requires a controlled redeploy from the approved
release path, so hosted remediation is not claimed.

The registry script’s wording still calls the registry “operating index only”
even though it contains Alpha hosted references. This is a documentation/script
consistency issue, not evidence that hosted recovery has been proven.

## E. Alpha state

Alpha remains synthetic and fictional. The registry records repository
`kiwidudedev/tradesstack-client-alpha`, Supabase ref
`ibjyzpyuqupsxqakpzxj`, Vercel project `tradesstack-client-alpha`, Sydney
region, Vercel Hobby and Supabase Free/NANO. The last recorded hosted release
is deployment `dpl_DxNCmWPz15reQQt7A613HdF7eNAM` from repository SHA
`e9a7bddc5e48e1a6636c9f4406e590f7dc68e9a8`. A fresh unauthenticated HTTP
request returned 200 on 2026-10-01. This proves availability of that public
root response only, not provider configuration, backup or data recovery.

No real customer, real staff identity, real project document, real invoice or
real commercial record was used.

## F. Production operations inventory

| Boundary | Current evidence | Owner/responsibility | Failure impact | Hardening state |
|---|---|---|---|---|
| GitHub | private Master and Alpha repository references | TradesStack owner/company account | source/release continuity | ownership/MFA not verified here |
| Vercel | Alpha Hobby project and public URL recorded | deployment owner | application unavailable/release failure | logs/history recorded; rollback not executed |
| Supabase Postgres | dedicated Free/NANO project, Sydney | database/recovery owner | all tenant operational data unavailable | backup/restore capability not proven |
| Supabase Auth | same dedicated project; fictional users recorded | database/Auth owner | access loss or user recovery problem | recovery metadata/process not proven |
| Supabase Storage | private `organization-documents`, `project-drawing-sets` recorded | Storage/recovery owner | private Files/drawing evidence unavailable | independent backup/restore not proven |
| DNS | default Vercel URL only; custom DNS off | owner/provider | URL/callback outage if later enabled | not applicable to Alpha current proof |
| email | Resend/external email off | owner/provider | invite/reset/notification delivery unavailable | approved exclusion |
| AI/Xero/worker/cron | intentionally off | owner/provider | excluded capability unavailable | approved exclusion |
| release tooling | local scripts and non-secret manifests | Master release owner | unsafe or untraceable deployment | local proof PASS |
| logs | Vercel/Supabase provider logs recorded | incident owner | delayed detection/evidence loss | no independent alerting |
| exports/backups | runbooks only | recovery owner | customer recovery/export failure | not technically proven |

## G. Client data inventory

A complete Alpha recovery includes the Postgres business schema/data and
migration ledger; Auth users, identity metadata and recovery configuration;
private Storage buckets, object bytes, paths and metadata; application/client
configuration; release identity; Vercel environment configuration; and any
future provider/domain/integration configuration. A database backup alone is
not a complete client backup.

## H. Failure-scenario matrix

| Failure | Detection | Recovery | Result |
|---|---|---|---|
| bad app release | deployment/runtime logs, synthetic HTTP check | provider deployment rollback or forward fix | documented; live rollback not executed |
| bad environment variable | runtime errors/health smoke | restore approved secret/config binding | documented; provider proof unavailable |
| bad migration/data damage | migration result, integrity checks, user report | stop release, preserve evidence, forward fix or isolated restore | tabletop only; restore not proven |
| database/ Supabase outage | provider status/logs and app failures | provider escalation or isolated recovery | provider capability/access required |
| deleted private object | user report, metadata/object reconciliation | restore object from approved export | no export/restore proof |
| broken RLS/Storage policy | authorization checks and incident report | stop traffic/change, forward migration, re-test | security checks exist; live incident drill not run |
| lost repository/provider access | owner/provider account recovery | alternate authorized owner/recovery path | ownership/MFA not verified |
| customer export/termination | owner request | structured export, checksum, confirmation, revoke/retain/delete per policy | documented dry run only |

## I–K. Database backup and restore

**Database backup capability: PARTIAL — PROVIDER CAPABILITY REQUIRED.** The
current registry records Free/NANO and no managed database backup capability
verified. No independent logical backup artifact was created because no
authorized Alpha database credential or safe isolated restore target is
available in this workspace. A backup command or provider assertion would not
be treated as restore proof.

**Database backup proof: FAIL — NOT PROVEN.** No backup artifact was generated.

**Database restore proof: FAIL — NOT PROVEN.** The live Alpha database was not
overwritten or reset. A future proof must restore synthetic Alpha into an
isolated target and verify organization, memberships, project, opportunity,
quote, variation, PO, supplier invoice, claim, task, QA, Files metadata and
timesheet relationships plus RLS/tenant denial.

## L. Auth recovery

**UNKNOWN / OWNER AND PROVIDER DECISION REQUIRED.** Supabase Auth identities
are platform-managed and must not be assumed to be in a Postgres business-data
backup. Password hashes, sessions, refresh tokens, user metadata, redirect
configuration and post-restore identity mapping require provider-specific
verification. The existing fictional Alpha users remain untouched.

## M–O. Storage inventory, backup and restore

Recorded Alpha private buckets are `organization-documents` and
`project-drawing-sets`; previous commissioning recorded three synthetic
objects and owner/outsider access behavior. Database backup does not back up
these object bytes. No private Files object and drawing/trade-pack object were
exported and restored in an isolated target during Phase 1X-B.

**Storage backup: NOT PROVEN. Storage restore: NOT PROVEN.** The required
procedure is to export bytes, bucket, opaque path, metadata, relationship and
checksum through an approved privileged mechanism, then restore to a safe
isolated path/project and re-establish private policy/signed access.

## P. Combined client recovery

The required order is:

```text
provider/config identity
→ isolated Postgres restore and migration-ledger reconciliation
→ Auth recovery and user/organization reconciliation
→ private Storage restore and checksum/object relationship validation
→ compatible application release
→ non-secret configuration and approved secrets
→ tenant/RLS/Storage/representative workflow acceptance
```

This is **TABLETOP ONLY** in Phase 1X-B.

## Q. Recovery consistency

Recovery must detect database/Storage time skew, missing object references,
orphaned objects, migration-ledger mismatch, incompatible application/schema
versions, missing Auth identities and broken RLS/Storage policies. A single
timestamped recovery manifest and post-restore reconciliation are required.

## R. RPO

Proposed first-customer target: **maximum 24 hours**, subject to owner/provider
approval and a real backup mechanism. For a construction subcontractor this
could mean losing one day of new project correspondence, timesheets, supplier
invoice capture, QA evidence or commercial updates. It is not acceptable to
claim this target is met while Free/NANO backup and export are unproven.

## S. RTO

Proposed current manual target: **one business day**. A one-hour outage can
interrupt site and commercial work; four hours is materially disruptive during
a working day; one business day requires manual fallback and customer
communication. A four-hour recovery target is desirable but not proven and may
require paid/provider capability or automation. No upgrade was purchased.

## T. Deployment rollback

Vercel deployment history and the last known deployment identity are recorded.
The application rollback procedure is documented in the recovery/runbook
material, but no authenticated provider rollback was executed in Phase 1X-B.
Result: **PASS — DOCUMENTED / TABLETOP**, not technical restore proof.

Application rollback is not database rollback. A backward app deploy is safe
only when the restored/current schema remains compatible; otherwise use a
forward fix or database recovery decision.

## U. Migration failure recovery

The repository supports forward-only migration preflight, migration target
identity, release validation and post-change acceptance. The operator procedure
is: stop rollout, preserve logs/ledger/data evidence, assess integrity and RLS,
restore service with compatible code or forward correction, restore only when
necessary, and re-run tenant/security acceptance. No down migration was added.
Result: **PASS — DOCUMENTED / TABLETOP**.

## V–X. Secrets

Secret classes include Supabase service role, database credentials, Vercel/GitHub
access, Auth administration, CRON/worker credentials and future provider
credentials. Public Supabase URL/anon configuration is distinct from secrets.
Secrets must live in provider secret stores or an approved password/secret
manager, scoped per client, server-only where privileged, and absent from Git,
registry, reports, browser bundles and logs.

The local operations security scan passed and no secret values were printed.
This does not prove provider-side secret configuration or browser-bundle review
for the hosted Alpha deployment. No material credential was rotated.

## Y–AA. Break-glass and account ownership

Break-glass access is defined as rare, minimum-necessary, auditable,
time-bounded where practical and followed by review. It covers outage triage,
RLS/Storage incidents and recovery diagnostics; it must not become a permanent
service-role shortcut. **Documented; access path not tested.**

GitHub, Vercel and Supabase references are known, but company/team ownership,
MFA, recovery methods, alternate authorized operators and single-account
dependency were not verified because provider account access was unavailable.
Result: **PARTIAL — OWNER DECISION REQUIRED**.

## AB–AD. Observability, monitoring and alerting

Current detectable signals are public HTTP availability, Vercel deployment and
runtime logs, and Supabase provider logs/health where an authorized operator
can access them. There is no source-defined health endpoint that distinguishes
web liveness from backend readiness, no third-party monitor, and no proven
alert recipient/channel or outside-hours escalation.

The minimum acceptable initial posture is a synthetic public HTTP check plus
provider deployment/runtime/database/storage/auth review with a named owner
and documented escalation. **Alerting is not operationally proven.** Adding a
monitoring vendor or paid capability requires owner approval.

## AE–AI. Incident model and drills

Use SEV-1 for security/data loss/full outage, SEV-2 for a major customer
workflow outage, SEV-3 for degraded/noncritical operation, and SEV-4 for minor
impact. The incident runbook covers detect, acknowledge, contain, preserve
evidence, communicate, recover, validate, close and review.

Outage, private-file-loss and database-recovery drills are **TABLETOP ONLY**.
No deliberate Alpha damage or deletion was performed. A future technical drill
must use isolated copies/targets and retain checksums without mutating live
Alpha.

## AJ–AM. Export, offboarding and retention

The export scope includes organization/member references, CRM, opportunities,
projects, quotes/workbooks, variations, POs, supplier invoices, claims, tasks,
QA, timesheets, Files metadata, private objects, drawings and a manifest. The
recommended format is structured JSON/CSV plus original private documents,
generated PDFs where available, and checksums.

The export/offboarding runbook is documented, but no Alpha dataset export was
generated or validated in Phase 1X-B. Alpha was not deleted. Retention periods
remain legal/business policy decisions; technical recommendations must not be
presented as legal advice.

## AN. Data governance

TradesStack handles names, email/phone data, project and commercial records,
timesheets/location-related evidence, signatures, QA evidence, private files,
supplier invoices and accounting information. Signatures, financial records,
private documents, access credentials and location-related evidence deserve
heightened access, logging and retention controls. No legal retention period is
asserted here.

## AO–AS. Logging, web security, Auth and tenant boundary

The codebase keeps service-role/provider secrets in server-side paths and the
repository security scan passed. A complete hosted log-content audit and
provider configuration audit were not performed. No clear generic logging
defect was changed in this phase.

The Alpha public root returned HTTPS HTTP 200. Existing middleware/SSR auth,
private Storage, RLS and representative anonymous/outsider/role checks remain
the security baseline from commissioning. No Auth, RLS, Storage policy or
tenant-boundary code was changed. Hosted post-hardening re-execution of all
security checks was not possible without provider credentials.

## AT. Supply-chain security

The lockfile, declared toolchain, package boundary and repository-supported
release/security checks passed. A narrow Next.js patch from 16.3.3 to 16.3.8
resolved the audited critical `next/og` RCE advisory. `corepack npm audit
--omit=dev --audit-level=high` now reports no critical findings, but retains a
transitive `brace-expansion` high finding and moderate `exceljs`/`uuid` findings
with major-version or dependency-chain implications. No broad dependency
upgrade was performed. Supply-chain result: **PARTIAL — FOLLOW-UP REQUIRED**.

## AU. Release provenance / attestation

Local release identity and validation passed, recording source SHA, shell,
database target, client configuration contract and toolchain. Alpha’s previous
hosted deployment provenance is recorded in the commissioning/registry files.
Current hosted deployment freshness and approval cannot be re-attested without
provider access. Result: **PASS locally; PARTIAL hosted**.

## AV. Client registry

`ops/clients.json` retains non-secret Alpha resource references and now points
to `ops/hardening/client-alpha.json`. The registry contains no secret values
according to the local scanner. Its “operating index only” status wording is
stale relative to the hosted Alpha entry and should be corrected in a future
small metadata/script pass after owner review.

## AW–AZ. Single-device, single-account and clean rebuild risk

The source and non-secret release records are in Git, and local release
validation is reproducible from the current checkout. Recovery still depends
on provider accounts, secret retrieval and an isolated database/Storage target;
those cannot be reconstructed from the laptop alone. If Corey’s laptop or
primary provider login disappeared, continuity is **not proven**. A clean
environment hosted redeploy was not performed in Phase 1X-B.

## BA. Provider plan and capacity assessment

Alpha is recorded on Vercel Hobby and Supabase Free/NANO. No paid plan was
purchased. The material risks are backup/restore capability, provider limits,
manual recovery, logs/alerting and collaboration/ownership—not application
capacity proven by the current HTTP 200. The minimum upgrade, if required,
must be identified by provider evidence and separately approved.

## BB–BF. Support, change policy and outage/security runbooks

The first-customer model is owner-led: one named operator triages, records
severity/evidence, pauses releases where needed, communicates status and seeks
approval for recovery/direct provider action. No direct customer database edit
is allowed without reason, approval, before-state evidence, exact action,
after-state evidence and source/release reconciliation.

Existing incident, recovery, support and export/offboarding runbooks are
indexed by `docs/operations/TRADESSTACK_PRODUCTION_OPERATIONS_RUNBOOK.md`.
Vercel/Supabase outage and suspected credential leak/cross-tenant/private-file
exposure handling is documented at the procedure level; technical exercises
remain tabletop-only.

## BG. Automation classification

| Operation | Classification |
|---|---|
| local release validation and scans | AUTOMATED |
| release/deployment approval | OWNER APPROVAL REQUIRED |
| client deployment/rollback | SCRIPTED / OPERATOR-INITIATED plus MANUAL PROVIDER STEP |
| database backup/restore | SCRIPTED / OPERATOR-INITIATED plus PROVIDER STEP; not proven |
| Storage export/restore | SCRIPTED / OPERATOR-INITIATED plus PROVIDER STEP; not proven |
| incident communication/escalation | MANUAL OWNER STEP |
| secret retrieval/rotation | MANUAL PROVIDER/SECRET-STORE STEP; owner approval |
| offboarding deletion/retention | OWNER APPROVAL REQUIRED |

## BH–BI. Generic hardening defects and fixes

The critical Next.js dependency advisory was identified and fixed narrowly in
Master. `package.json` and `package-lock.json` now use Next.js 16.3.8 and the
matching ESLint config. No migration, package-boundary, UI, security-policy or
integration behavior was changed. The fix is locally regression-validated but
not yet promoted to Alpha because provider access is unavailable. Documentation
and the non-secret hardening record were added; existing runbooks were indexed
rather than duplicated.

## BJ–BM. Releases and final validation

No Alpha upgrade or provider rollback was performed. Local final validation:

- release validation after Next.js 16.3.8 patch — PASS;
- release lint — PASS;
- release tests — PASS;
- release TypeScript — PASS;
- registry/security/migration/drift/toolchain checks — PASS;
- package boundary check — PASS;
- secret scan of operations metadata — PASS, with documented limitations.

No provider credential scan, hosted secret-store audit, database dump, Storage
export, restore, deployment rollback or clean-machine hosted deployment was
performed.

## BN. Final hardening matrix

| Domain | Requirement | Current state | Proof performed | Result | Human decision | Remaining risk |
|---|---|---|---|---|---|---|
| Database backup | viable backup | Free/NANO; unverified | metadata review only | PARTIAL — PROVIDER CAPABILITY REQUIRED | choose mechanism/plan | data loss |
| Database restore | isolated restore | none | tabletop procedure | FAIL — NOT PROVEN | authorize safe target | unrecoverable DB |
| Auth recovery | identities/metadata | unknown | prior fictional users only | PARTIAL — OWNER DECISION REQUIRED | verify provider recovery | access loss |
| Storage backup/restore | bytes + metadata | private buckets known | no export/restore | FAIL — NOT PROVEN | approve procedure/target | file loss |
| Combined recovery | DB/Auth/Storage/release | runbook | tabletop | PARTIAL | exercise isolated recovery | skew/incompatibility |
| RPO/RTO | 24h / 1 business day proposal | proposed only | construction impact analysis | PARTIAL | approve target | unacceptable loss/outage |
| Rollback | app release | Vercel history recorded | documented/tabletop | PASS — DOCUMENTED / TABLETOP | execute safe proof later | DB compatibility |
| Migration recovery | forward fix/restore | local preflight | documented/tabletop | PASS — DOCUMENTED / TABLETOP | approve production procedure | migration damage |
| Secrets | isolated/rotatable | local metadata clean | repo scan only | PARTIAL | verify provider stores/MFA | lockout/leak |
| Break-glass | controlled access | runbook | not tested | PARTIAL | verify access path | unsafe emergency action |
| Monitoring/alerting | detect/notify | provider logs + HTTP | public smoke only | PARTIAL | name owner/channel | delayed detection |
| Incidents/drills | exercised response | runbook | tabletop only | PARTIAL | exercise isolated drills | slow recovery |
| Export/offboarding | usable handback | runbook | no Alpha export | PARTIAL | approve export/retention | customer handback gap |
| Web/Auth/security | preserve boundaries | current baseline | no source changes | PASS baseline / hosted recheck open | repeat after hardening | provider drift |
| Supply chain | dependency/release safety | critical Next advisory fixed; remaining findings | `corepack npm audit` plus release validation | PARTIAL — FOLLOW-UP REQUIRED | decide remaining dependency upgrades and redeploy Alpha | high transitive/moderate findings |
| Provenance | identify release/config/migrations | local + prior Alpha records | local validation | PARTIAL hosted | re-attest current Alpha | untraceable deploy |
| Clean rebuild | independent operator recovery | local source available | not run clean hosted | PARTIAL | prove from clean operator env | laptop dependence |

## BO. Owner decisions required

1. Approve the proposed 24-hour RPO and one-business-day RTO, or choose
   different targets.
2. Choose/approve a supported database backup and isolated restore capability.
3. Approve the private Storage export/restore mechanism and safe target.
4. Name alert recipients, escalation timing and outside-hours coverage.
5. Verify company/team ownership, MFA and recovery for GitHub, Vercel and
   Supabase.
6. Decide whether any paid provider tier is the minimum safe capability.
7. Authorize technical Alpha drills only after safe isolated targets exist.

## BP. Remaining material risks

Database restore, Storage restore, Auth recovery, alerting ownership, provider
account recovery, customer export and promotion of the Next.js security patch
are materially unproven/incomplete. These prevent a real-customer readiness
declaration. No real customer should be onboarded.

## BQ. Phase 1X-B answer

**PARTIALLY — SPECIFIC PRODUCTION-HARDENING DECISIONS / PROOFS REMAIN**

## BR. First-real-customer gate answer

**NO — RESOLVE LISTED HARDENING ITEMS FIRST**

## BS. Next phase

The next pass should first perform the controlled Alpha redeploy of the
validated Next.js 16.3.8 security patch, then a narrowly authorized **isolated
Alpha recovery proof**:
first verify provider/account access and approve a disposable recovery target,
then create a synthetic-only database backup/export and restore it without
touching live Alpha, followed by a separate private Storage export/restore
proof. Do not purchase, upgrade, delete Alpha or enable excluded integrations
without explicit owner authorization.

## What this means for the TradesStack owner

1. Alpha is still fictional and currently reachable, but that does not prove it
   can be rebuilt after loss.
2. Database recovery is not proven.
3. A 24-hour RPO is a proposed target, not a current guarantee.
4. A one-business-day RTO is a proposed manual target, not a current guarantee.
5. Free/NANO database backup capability is unverified and is a material risk.
6. No database restore has been performed.
7. Files/drawings are private and known, but no separate private-object restore
   has been proven.
8. Auth recovery after database/provider failure remains unknown.
9. App rollback is documented from provider deployment history, but not live
   executed in this pass; it is not database rollback.
10. Migration incident handling is documented and tabletop-only.
11. Secrets are absent from local operations metadata; provider secret storage
    and rotation were not verified.
12. Break-glass is defined but not tested.
13. Current detection is provider logs plus a public HTTP smoke; alerting is not
    operationally proven.
14. Outage, file-loss and database-loss responses were documented/tabletopped,
    not technically exercised.
15. A complete Alpha export and offboarding dry run were not executed.
16. A lost laptop or inaccessible provider account would expose continuity
    gaps.
17. The critical Next.js advisory is fixed locally at 16.3.8, but Alpha is not
    yet redeployed to the patched release.
18. Local release reproduction is strong; clean hosted reconstruction remains
    unproven.
19. No paid upgrade was purchased. The minimum paid capability, if any, still
    requires evidence and owner approval.

Phase 1X-B stops here. It does not onboard a real customer, enable excluded
integrations, purchase infrastructure or delete fictional Alpha.

## Phase 1X-B2 addendum — recovery and operations proof

This addendum supersedes the Phase 1X-B statements about the specific proofs
performed below, while preserving the Phase 1X-B historical record. It was
executed on 2026-10-01 against fictional synthetic Alpha only. No production
customer, live Alpha destructive operation, paid plan, excluded integration,
credential rotation or deletion was performed.

### Release promotion proof

The security patch followed the required path:

```text
Master main c7dad2feaaf4401427d6e5e30583a70acdfa9b76
  → Alpha repository main 8858415
  → Vercel production dpl_HJd44wRD7jpLxyPCitoMPqVru7yW
  → https://tradesstack-client-alpha.vercel.app/ HTTP 200
```

The promoted application uses Next.js 16.3.8. Alpha’s temporary local
type-check and production build passed; the production deployment reached
`READY`. The temporary build ran under the available Node 25.6.0 environment
and emitted the repository’s existing engine warnings; the hosted project
remains configured for Node 22.x. No live rollback was executed because the
previous deployment contains the superseded vulnerable Next.js version.

### Database export and isolated restore proof

Read-only Supabase CLI access was available for the fictional Alpha project.
Two temporary logical artifacts were generated outside the repository:

| Artifact | Bytes | SHA-256 | Result |
|---|---:|---|---|
| complete hosted schema dump | 4,306,919 | `d5306b38de191a6b78f7165707ee224dc6f509bc01a5a2b2f392dc3c04e8af47` | exported and restored |
| public data-only dump | 1,369,031 | `21f79fc9d2351ce1b209b7327fd1dfef95ec7dcd2dbe93206fee3bb4bfca7615` | exported and restored |

The complete schema dump restored cleanly into a disposable local Supabase
target named `alpha-recovery-b2`. The data-only dump restored with
`ON_ERROR_STOP=1`. Representative organization, membership, supplier,
project, opportunity, procurement and supplier-invoice queries succeeded.
The earlier public-only schema attempt exposed a missing `private` schema;
the complete schema export resolved that limitation. The hosted Alpha was
never overwritten, reset or mutated by this proof.

This proves a synthetic logical export and isolated replay path. It does not
prove recurring managed backups, point-in-time recovery, provider retention,
or an RPO guarantee on the current Free/NANO plan.

### Private Storage export and restore proof

The two recorded private buckets were exported using privileged read-only
access and restored to the isolated local target:

| Bucket | Objects | Export bytes | Restore |
|---|---:|---:|---|
| `organization-documents` | 4 | 673,220 | PASS |
| `project-drawing-sets` | 2 | 338,031 | PASS |

All six object downloads were uploaded to the isolated target, downloaded
again, and matched their original SHA-256 checksums. The temporary export
manifest and object bytes remain outside the repository and contain no
secrets. Live Alpha bucket policies and contents were not changed.

### Auth recovery proof and remaining boundary

The Alpha Auth admin inventory reported seven hosted users without exposing
emails, passwords, sessions or tokens. Seven synthetic local recovery users
were created in the disposable target and seven local password sign-ins
passed. Exact Alpha user IDs, password continuity, refresh-token continuity,
provider recovery configuration and organization-membership identity mapping
were not recreated. Auth recovery is therefore **PARTIAL**, not PASS.

### Export and combined recovery result

The temporary recovery manifest covered the complete database schema/data
exports, private Storage objects/checksums, hosted Auth count, synthetic Auth
login proof and release identity. Database and Storage replay were proven
independently. A complete end-to-end customer recovery remains partial because
exact Auth continuity, recurring backup/retention, alerting ownership and
provider account/MFA recovery remain open.

### Operations and monitoring result

Provider CLI access was verified for Vercel and Supabase, and the current
production deployment was inspected as `READY`. No live rollback was
performed for the security reason stated above. No monitoring vendor or paid
capability was enabled. There is still no named alert recipient, escalation
channel or outside-hours owner proven in repository evidence. Break-glass and
provider account ownership/MFA remain human-owner decisions.

### Phase 1X-B2 verdict

**PARTIALLY — SPECIFIC PRODUCTION-HARDENING PROOFS STILL REMAIN**

The most important technical recovery gap is narrowed: synthetic database
export/replay and private Storage checksum recovery are now proven, and the
patched release is deployed through Master → Alpha → Vercel. The remaining
gaps are material for a real customer: recurring provider backup/retention,
exact Auth recovery continuity, named monitoring/escalation, provider
ownership/MFA/recovery, and the remaining dependency-audit findings.

### First-real-customer gate

**NO — RESOLVE LISTED HARDENING PROOFS FIRST**

The Alpha proof is not a declaration that a real customer may be onboarded.

### Next smallest pass

The next pass should be a human-owner/provider readiness gate for backup
retention, Auth recovery procedure, alert ownership and provider account/MFA
continuity. After those decisions, run only the smallest isolated Auth and
monitoring proofs that are safe and authorized. Do not broaden this into live
customer onboarding or a full Supplier/CRM/Materials operational extraction.

## Phase 1X-B3 addendum — owner and provider operational readiness

This addendum records the B3 investigation performed on 2026-10-01. It does
not repeat the B2 database or Storage replay. It does not onboard a customer,
change billing, enable excluded integrations, modify Alpha data, change MFA,
rotate credentials or create an external monitoring account.

### Current provider evidence

The Alpha Supabase dashboard identifies the `Tradesstack AI` organization as
Free and explicitly states that the Free plan does not include project
backups. The scheduled-backup screen offers Pro with up to seven days of
scheduled backups. The Point-in-Time Recovery screen identifies PITR as a Pro
add-on starting at $100/month. No upgrade was selected.

The current evidence therefore establishes:

```text
Free managed database backups       = NOT AVAILABLE
Free PITR                           = NOT AVAILABLE
Pro daily database backups          = AVAILABLE AFTER OWNER APPROVAL
PITR                                = PAID ADD-ON / OWNER DECISION
Storage in database backup          = NOT INCLUDED; separate object model
Auth in B2 logical export           = NOT INCLUDED; separate recovery model
```

Supabase official plan material states that Pro includes daily backups with
seven days of retention and that PITR is an add-on. Supabase’s restore-to-new-
project documentation states that a paid physical-backup restore can include
Auth user data, while Storage objects/settings require separate reconfiguration.
These provider capabilities are not treated as enabled for Alpha until the
owner approves the plan and the resulting configuration is verified.

### B3 current plan decision

Alpha remains on the Free plan for now. The approved Alpha backup architecture
is the independent daily AES-256-GCM GitHub Actions artifact described below;
Supabase Pro and PITR are not required for the current proof and were not
activated. Supabase Pro managed daily backups remain a potential additional
resilience option for a real customer and must be reconsidered at the Final
First-Real-Customer Readiness Gate, together with current pricing and the
customer's recovery requirements.

### Recommended first-customer backup operating model

The smallest credible model is:

1. Supabase Pro daily managed database backups as the primary database
   recovery point, with the provider-retained seven-day window.
2. A separate scheduled Storage export containing private object bytes,
   opaque paths, bucket metadata, relationship manifest and SHA-256 checksums.
3. A non-production-provider destination for the Storage export and, if the
   owner requires provider independence, a scheduled logical Postgres export.
4. A daily operator check recording last-success time, artifact sizes,
   checksums, object count, retention state and failure status.

This model is **TARGET / OWNER AND PLAN DECISION REQUIRED**, not an active
production schedule. B2 proved export and replay mechanics only. No recurring
job, durable external destination or backup alert has been configured.

### RPO and RTO

The proposed 24-hour RPO is not currently proven because Alpha Free has no
managed database backup and Storage has no recurring export schedule. With
daily Pro backups plus daily Storage export, a 24-hour RPO is a reasonable
technical target, subject to successful completion detection and owner/provider
approval. PITR would improve database granularity but would not replace the
Storage export or define Auth/session behavior.

B2 demonstrates the mechanical restore path, but not the elapsed time for a
real operator assembling provider access, recovery artifacts, Auth recovery,
Storage, configuration and acceptance. One business day remains a proposed
manual RTO, not an evidence-backed guarantee.

### Auth disaster-recovery contract

Repository evidence shows Auth UUIDs are not merely login identifiers. The
baseline contains 226 foreign-key constraints to `auth.users`, including
organization membership, commercial, Files, projects, QA, accounting,
activities, tasks and intelligence references. QA signatures and audit fields
also record actor/signer UUIDs. Arbitrary remapping would therefore threaten
tenant relationships and historical provenance.

The supported recovery contract is:

```text
recover business data and private objects
preserve Auth UUIDs where provider project restore supports it
preserve organization membership and role relationships
preserve historical actor/signer references
invalidate old sessions and refresh tokens
require secure reauthentication/password recovery
```

On the current Free plan this exact Auth continuity path is **NOT PROVEN**.
B2’s synthetic user reconstruction proves sign-in mechanics only. A future
paid physical-backup/restore proof may establish identity continuity; it must
also validate tenant access, cross-organization denial, role checks, private
Storage access and QA/audit provenance in isolation.

### Monitoring and alerting

Vercel’s current documented notifications are available on all plans and
cover deployment/account/usage notifications, but this does not prove an
application outage monitor or backup-failure alert. Supabase logs/dashboard
access is available, but no alert recipient, escalation channel or outside-
hours coverage has been assigned. No third-party monitor was created.

Monitoring status:

| Signal | Current result |
|---|---|
| public HTTP availability | manually verified; no independent monitor |
| Vercel deployment failure | native notification capability available |
| Supabase/backend failure | dashboard/log visibility; alert route unassigned |
| backup failure | no recurring backup, therefore no operational alert |
| recipient and escalation | owner decision required |
| harmless delivered alert | not proven |

### Provider account and MFA evidence

Read-only provider checks found:

| Provider | Current evidence | Result |
|---|---|---|
| GitHub | `kiwidudedev` authenticated; both repositories visible with admin permission; personal security page says 2FA is not enabled | ownership access visible; MFA/recovery unsafe |
| Vercel | `tradesstack` CLI access; Alpha project under `hi-5577s-projects`; account page shows GitHub/email sign-in and Two-Factor Authentication `Inactive`; account banner reports suspended subscription state | deployment access visible; MFA/account billing continuity unresolved |
| Supabase | `Tradesstack AI` organization and Alpha project visible; organization is Free; security page says no authenticator apps | project access visible; role, MFA and alternate recovery unresolved |

No passwords, tokens, MFA codes or recovery codes were recorded. No provider
account setting was changed. The account-level findings require the owner to
enable appropriate MFA and verify alternate recovery access before a real
customer.

### Secure release recovery

The prior deployment remains security-ineligible for rollback because it uses
the superseded vulnerable Next.js release. The secure alternative is proven:

```text
Master 444519472abaa120b71e61879c26fa00bc54eebd
→ Alpha commit a1526d51a0dd839dd5010050ca894f06b837519d
→ Vercel dpl_5qkbsHXVkFPEYRm1D7s3eaYXeXhz
→ READY / HTTP 200
```

This is a secure redeploy/provenance path, not permission to roll back to the
vulnerable deployment.

### Dependency finding disposition

The current production audit has zero critical and zero high findings after a
narrow compatible `brace-expansion` override through
`exceljs → archiver → glob/minimatch`. Two moderate findings remain:
`exceljs@4.4.0` brings `uuid@8.3.2`, which is below the
fixed `uuid` range. The high finding affects brace parsing and is not a
Next.js/browser runtime path identified in this audit; the moderate UUID issue
requires a breaking ExcelJS major upgrade according to npm’s remediation.

No blind force-fix was applied. The high finding remains an evidence-backed
maintenance item requiring a compatible dependency strategy or explicit risk
acceptance. The moderate findings remain a documented owner/dependency decision
because the available fix is a major ExcelJS change.

### B3 verdict

**PARTIALLY — SPECIFIC PRODUCTION-HARDENING PROOFS STILL REMAIN**

The remaining gaps are technical/operational, not merely preferences:
recurring backup scheduling and retention, Auth continuity on the selected
plan, alert delivery/ownership, MFA and alternate provider recovery, and
dependency disposition.

### First-real-customer gate

**NO — RESOLVE LISTED HARDENING ITEMS FIRST**

No real customer may be onboarded as a result of this pass.

### Free-tier recurring backup implementation

The Alpha repository now contains a scheduled workflow and backup script. The
authoritative implementation is now Alpha commit `c26f405`:

```text
Alpha repository: c26f405
Schedule: daily at 02:17 UTC
Manual trigger: workflow_dispatch
Destination: private GitHub Actions artifact
Retention: 30 days
Encryption: AES-256-GCM before upload
Contents: PostgreSQL dump, Auth identity inventory, private Storage bytes,
          Storage checksums and manifest
```

The script was executed locally against the disposable `alpha-recovery-b2`
target. It exported the restored database, seven synthetic Auth identities and
six private Storage objects, produced an encrypted archive, and successfully
decrypted/listed that archive with the test key. No live Alpha secret or backup
data was committed.

The live run `36977001303` completed successfully. Its non-secret summary and
artifact metadata verified a 5,834,206-byte database dump, seven Auth users,
six private Storage objects, `TSB1` encryption framing, matching SHA-256
checksum and artifact expiry on 2026-11-01. The implementation also performed
an in-run AES-256-GCM decrypt-and-compare self-check before upload.

The workflow has recorded prior failed runs with red GitHub Actions outcomes,
so failure-state detection is proven. The owner also confirmed receipt of the
GitHub Actions failure notification, proving the current owner email alert
path for the owner-operated model.

On 2026-10-02 the owner confirmed MFA and recovery methods were enabled and
stored for GitHub, Vercel and Supabase. Provider CLI access remains available;
no passwords, MFA codes or recovery values were recorded.

This is a free operational mechanism, but its destination remains coupled to
the GitHub account/repository and its 30-day artifact retention. It is not the
same resilience as an independent paid object store or Supabase managed
backup. The combined database/Auth/Storage 24-hour RPO is
**CONDITIONALLY PROVEN**: the daily schedule, encrypted artifact coverage and
live end-to-end run pass, but long-term schedule continuity and owner alert
delivery remain operational follow-up items. Restore verification run
`36979459575` decrypted the artifact and restored the database into a
disposable PostgreSQL target in `9.882` seconds, with seven Auth identities
and six private Storage objects represented by the verified manifest. This
proves the database restore path and artifact integrity; it does not yet prove
provider rehydration of Auth identities or private Storage into a replacement
hosted project. The one-business-day RTO is therefore **CONDITIONALLY PROVEN**
for the tested technical recovery path, pending hosted rehydration.

The daily workflow is configured and has completed a live run, but a long-term
multi-day schedule continuity observation has not elapsed in this pass. The
24-hour RPO therefore remains conditionally proven rather than being upgraded
to an unconditional guarantee.

Business-hours owner coverage was approved on 2026-10-02. This aligns the
initial response policy with the one-business-day RTO target; no 24/7 response
guarantee is claimed.

### Hosted recovery target disposition

The approved attempt to create a temporary Free Supabase recovery project was
rejected because the organization has reached its two-project Free limit.
Alpha and Master were not paused, deleted or upgraded. Hosted Auth and private
Storage rehydration are therefore **PROVIDER-BLOCKED / DEFERRED**. Current
evidence proves encrypted artifact recovery, database restoration, Auth
inventory recovery and Storage object/checksum coverage, but not hosted
provider rehydration.

### Exact remaining setup checkpoint

The workflow requires these repository secrets, plus the separate password
secret used to avoid URI password-encoding ambiguity:

```text
SUPABASE_PROJECT_REF
SUPABASE_DB_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
BACKUP_ENCRYPTION_KEY
SUPABASE_DB_PASSWORD
```

All required secrets are now configured. `SUPABASE_DB_PASSWORD` is used only
by the backup runner and is not logged. A new paid destination or Supabase
plan is not required for this proof.

## Current consolidated status — 2026-10-03

The earlier sections above preserve the original Phase 1X-B baseline and
historical findings. The latest owner-confirmed state is:

- GitHub, Vercel and Supabase MFA/recovery checkpoints are complete for the
  single-owner operating model.
- The daily encrypted Alpha backup has a successful live run, verified
  database/Auth/Storage manifest coverage, 30-day artifact retention and an
  isolated database restore. The combined 24-hour RPO remains
  **CONDITIONALLY PROVEN**, not an unconditional guarantee.
- The one-business-day RTO remains **CONDITIONALLY PROVEN** for the tested
  technical path. Hosted Auth and private-Storage rehydration into a new
  provider project remain unproven because the Free-plan recovery-project
  limit prevented creating the disposable hosted target.
- Business-hours, owner-operated alert response is approved. The owner email
  failure signal has been observed; no 24/7 guarantee or alternate operator is
  claimed.
- The client-local scheduler dispatcher is implemented, authenticated,
  allowlisted and locally validated. Hosted recurring scheduler delivery,
  retry/SLA behavior and scheduler failure alert delivery remain
  **DEFERRED — IMPLEMENTATION COMPLETE; HOSTED VERCEL PRO CRON PROOF PENDING
  OWNER ACTIVATION**. GitHub scheduled execution is not used as proof.
- Supabase Pro/PITR, Xero, Resend/Supabase Auth email and AI provider
  activation remain deferred by owner decision. Site Safety remains excluded
  from Customer #1 scope.
- The Customer #1 hosted workflow evidence is maintained separately in
  `docs/architecture/TRADESSTACK_PHASE_1Y_D_HOSTED_WORKFLOW_PROOF.md` and
  remains **IN PROGRESS**; the current build and local release checks do not
  override hosted workflow gaps.

This consolidation does not rewrite the historical baseline, alter provider
configuration, or claim first-customer readiness.

## Current dependency security recheck — 2026-10-03

The previous audit identified two moderate findings in the direct
`exceljs@4.4.0` path. A narrow, dependency-scoped override was then tested
in isolation and applied:

- `package.json` overrides `exceljs`'s nested `uuid` to `14.0.2`;
- `package-lock.json` records the resolved top-level UUID package;
- `npm ls uuid` confirms `uuid@14.0.2 overridden` beneath ExcelJS;
- `npm audit --omit=dev --json` now reports zero vulnerabilities;
- source-level inspection confirms the visible ExcelJS conditional-formatting
  helper uses `uuid.v4`;
- focused spreadsheet/import/export regression coverage remains green: 4 test
  files and 19 tests passed;
- release TypeScript and the production build pass after the override.

This resolves the previously recorded dependency finding without a major
ExcelJS upgrade. The override remains subject to ordinary lockfile review on
future ExcelJS upgrades, and hosted import acceptance remains a separate
workflow gate.

The override is currently validated in the Master worktree only. It has not
been promoted to hosted Alpha in this pass; Alpha promotion requires the
normal controlled Master → client release review and deployment authorization.
Therefore the local dependency audit is **PROVEN**, while hosted Alpha
deployment of this remediation remains **PENDING CONTROLLED RELEASE**.
