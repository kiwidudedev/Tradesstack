# TradesStack Phase 1S — Hosted client deployment readiness

## A. Phase 1S verdict

**PASS 1S — LOCAL ARCHITECTURE READY, HOSTED PROOF BLOCKED BY EXTERNAL PREREQUISITES**

## B. Real-customer readiness verdict

**REAL-CUSTOMER DEPLOYMENT READINESS — NOT YET READY**

## C. Executive summary

The path from the proven local dedicated-client architecture to a hosted
fictional Client Alpha is defined, but no external mutation is authorized or
performed in Phase 1S. The local release, package, database, Auth/RLS and
application-shell evidence is strong enough to design Phase 1T. It is not
evidence that a remote repository, hosted Supabase project, hosting project,
secrets, DNS, provider accounts, backups or operational access already exist.

The principal 1T blockers are external authority and configuration inputs:
company-controlled remote Git ownership, hosting/Supabase accounts and region,
secret-store ownership, an approved baseline promotion decision, domain/email
choices, and explicit authorization for each mutation class. Real-customer
deployment has additional blockers: hosted live-state reconciliation,
backup/restore acceptance, security review, operational ownership, provider
contracts/data-residency decisions, and release/toolchain closure.

## D–H. Source and Phase 1R verification

- Branch: `main`.
- Master SHA: `361bf3f094a8abbb58d20606413686cebc242e66`.
- Master worktree was already dirty; all existing modifications remain
  preserved. No Master commit, reset, clean, stash, push or external mutation
  was performed.
- Phase 1R release IDs verified in source: `0.0.0-phase1r.1` and
  `0.0.0-phase1r.2`.
- Phase 1O baseline verified unchanged:
  `52ac69bea6587301c9d50fca809847bb077f03471406476b1d01ed2520c5a372`.
- Current migration directory contains 508 files; the Phase 1O cut remains
  `20260913160000_reconcile_indexes_and_check_contracts.sql`, with current
  forward migrations after that cut.
- The Phase 1R proof generator remains local-only and creates no persistent
  client repository or release archive.

## I–J. Proven architecture and remaining boundaries

```text
Master product authority
        ↓ approved shell/package/database release
private client repository
        ↓ explicit CI/review
hosted application + dedicated Supabase project
        ↓ separate client-owned secrets and data
fictional hosted Client Alpha
```

Already proven locally: portable package consumption, package upgrade/rollback,
dedicated Supabase/Auth/RLS, baseline plus forward migrations, client config,
repeatable provisioning, full application-shell release, ownership-aware
upgrade, and fresh-B equivalence.

Remaining hosted boundaries: remote Git, package/release storage, hosted
Supabase ownership/region/backups, hosting, secrets, domain/TLS, Auth URL
configuration, Storage recovery, Edge Functions, workers, cron, email, Xero,
AI provider operations, monitoring, restore, offboarding and audit inventory.

## K–O. Remote repository and release model

Recommended ownership is a company-controlled private Git organization. Master
remains private product authority. Each client receives a separate private
repository; it is not a fork and does not receive Master history.

Recommended access categories:

| Capability | Master repository | Client repository | Hosted deployment |
|---|---|---|---|
| Read | product developers/release CI | client operators/release CI | deployment identity only |
| Write | reviewed Master contributors | client release operators through PR | no source write |
| Admin | platform owners | restricted platform owners | restricted platform owners |
| Deploy | Master release pipeline | protected deployment pipeline | runtime identity |

Minimum branch model: protected `main` is the approved/deployed state;
`shell-upgrade/<release-id>` is generated from the Phase 1R ownership-aware
upgrade and merged through a PR. Direct pushes to client `main` should be
prohibited. Client-local changes to Master-owned paths must be reviewed as
conflicts, not silently preserved as a fork.

The application shell should be stored as a CI-generated immutable release
bundle attached to the private Master release, containing the manifest,
fingerprint, source SHA and package/database compatibility metadata. A future
artifact store may be added for retention, but it should not become a second
source tree. The first hosted proof should consume a pinned bundle, not a live
Master checkout.

Release integrity requires release ID, Master SHA, manifest and fingerprint
verification before client application. Checksums are sufficient for the first
fictional proof when the bundle is obtained through a trusted private release
channel. Signing/attestation is required before real-customer operation, not
before the local-only 1T design gate.

## P–W. Private package distribution

Current packages are workspace/private packages:

`@tradesstack/core-contracts`, `@tradesstack/shared-ui`, `@tradesstack/pdf-utils`,
`@tradesstack/suppliers`, and `@tradesstack/client-config`.

Options evaluated:

1. Private npm-compatible registry: best long-term model for independently
   consumed packages, but package manifests, registry ownership and CI read
   access are not yet configured.
2. GitHub Packages npm registry: recommended if the company selects GitHub as
   remote Git authority; package access can be scoped separately and CI can
   use repository/workflow permissions. It still requires registry setup and
   read credentials for client CI.
3. Release-attached tarballs: safest first 1T fallback because it avoids
   registry publication, but less ergonomic and not the long-term package
   distribution model.

**Recommended model:** private GitHub Packages/npm-compatible registry after a
package-publication readiness change; use the pinned shell bundle and local
release artifacts for the first proof if registry setup is not yet authorized.
Never overwrite a published package version. Record package version, source
SHA, artifact SHA-256, toolchain and release timestamp. Use read-only CI access
for installation and short-lived/OIDC publishing where the chosen registry
supports it; do not create tokens in 1S.

## X–AA. CI/CD and migration pipeline

Master CI should validate package builds/tests, boundary checks, TypeScript,
focused tests, production build, secret scanning, shell manifest generation,
artifact fingerprinting and release approval. Client CI should validate lockfile
integrity, package resolution inside the client repository, client-config
validation, TypeScript, tests, boundary checks, production build, secret scan,
release ownership and deployment provenance.

Database migrations require a separate protected workflow. They should not be
an unconditional side effect of application deploy. The workflow should:

1. validate target project identity and backup/readiness state;
2. validate the approved baseline and migration ledger;
3. run preflight/compatibility checks;
4. obtain explicit migration approval;
5. apply forward migrations using a controlled migration identity;
6. record the applied ledger, result and deployment SHA;
7. stop application promotion if migration fails.

## AB–AO. Hosted Supabase and database

Each dedicated client needs one separately owned Supabase project with
Postgres, Auth, Storage, Realtime/required APIs, Edge Functions where used,
its own public URL/key and service-role secret. The preferred commercial
ownership is company-controlled infrastructure with client tenancy and export
rights documented; customer ownership of critical runtime infrastructure is a
business decision, not an assumed default.

Region must be selected from client geography, latency, provider availability,
backup location and data-residency requirements. Technical capability and legal
residency are separate decisions; no compliance guarantee is made here.

Bootstrap must use the approved Phase 1O baseline followed by forward
migrations, never replay the entire historical migration chain. The baseline
promotion gate must include: clean checksum, migration cut, migration ledger,
Auth/RLS/Storage acceptance, generated-type compatibility, backup/restore
plan, security review, and explicit product-owner approval. The existing
Phase 1O hosted-live-state reconciliation caveat remains open.

It does not block a fresh fictional hosted project if that project is empty and
bootstrapped from the approved baseline. It does block calling the baseline
production-authoritative for a real paying client until live-state
reconciliation and promotion approval are complete.

Database rollback is not automatic reverse migration. Use forward corrective
migrations for application defects; use provider restore/duplicate-project
procedures only for approved disaster recovery.

Application and database releases must support an overlap window: additive
schema changes first, compatible application release second, destructive
cleanup only after all clients have moved. Current compatibility is proven for
the local release path, not for every future migration.

## AP–AY. Auth, RLS, Storage and Files

Hosted Auth must define site URL, exact production redirect URLs, confirmation
and reset behavior, invite flow, rate limits, email delivery and any future
OAuth providers. The client public URL, Auth site URL and allowed redirect
URLs must be configured as one reviewed deployment record.

RLS remains mandatory. Hosted acceptance must use ordinary authenticated users
for own-organization, cross-organization, insufficient-permission and
anonymous checks. The service-role key is server-only and is permitted only for
controlled administration/bootstrap/worker paths; it must never reach the
browser or CI logs.

Current Storage buckets identified from source/migrations include:

| Bucket | Use | Visibility | Provisioning evidence |
|---|---|---|---|
| `organization-logos` | organization branding | public | migration-managed |
| `organization-documents` | Files/document versions | private | migration-managed |
| `project-drawing-sets` | drawings/takeoff assets | private | migration-managed |
| `project-variation-attachments` | variation/PO attachments | private | migration-managed |
| `supplier-invoice-documents` | supplier invoices | private | migration-managed |
| `project-quality-photos` | QA evidence/photos | private | migration-managed |
| `task-attachments` | task files | private | migration-managed |
| `material-library-imports` | material imports | private | migration-managed |
| `retention-claim-documents` | retention claim PDFs | private | migration-managed |

Storage policies, bucket limits, MIME restrictions, signed URLs and path
ownership must be accepted in the hosted project. Database backups do not
restore Storage objects; Storage backup/export and restore must be designed
separately. The Files version/snapshot/ownership model is not simplified for
deployment.

## AZ–BD. Secret inventory and environment separation

Names/categories only; no values are recorded:

| Secret/category | Consumer | Scope | Storage target |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | server routes, Edge Functions, workers | one client project | hosted secret store |
| `DATABASE_URL`, `SUPABASE_DB_URL` | audits/migration tooling | controlled operator/CI | migration secret store |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_TOKEN_ENCRYPTION_KEY` | Xero server adapter | client deployment | hosted secret store |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | server AI routes | platform or client policy | hosted secret store |
| `RESEND_API_KEY` | contact/invite email | client deployment | hosted secret store |
| `CRON_SECRET` | scheduled routes | client deployment | hosted secret store |
| `TAKEOFF_RENDER_WORKER_TOKEN` | render worker route | client deployment | worker/hosting secret store |
| `TIME_SHEETS_CRON_SECRET` | Supabase Edge Function | client project | Supabase function secret store |
| `KLAVIYO_PRIVATE_API_KEY` | early-access marketing path | only if retained | hosted secret store |
| package/Git/hosting/Supabase access tokens | CI/operator | least-privilege system scope | CI/platform secret store |

Public values include `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` and approved Phase 1P
client-config fields. Public does not mean trusted; server authorization and
RLS remain authoritative.

Required separation:

```text
Master secrets ≠ Client Alpha secrets ≠ Client Beta secrets
```

Target environments are local, preview/test and production. Preview must not
receive production database, service-role, provider or customer secrets by
default. Git contains no secret values and no operational customer data.

## BE–BK. Hosting, toolchain and provenance

Vercel is the recommended application host because the repository is a Next.js
application and already has `vercel.json` cron declarations. It is not a
complete worker platform for the current long-running `scripts/run_takeoff_render_worker.sh`;
that worker requires a separate controlled worker runtime or an explicitly
designed replacement. Vercel cron routes must be verified against the current
Bearer-secret route implementation before activation.

The current source manifest requires Next.js `16.3.3`; the existing Master
workspace previously contained Next.js `16.1.6`. Clean Phase 1R client builds
used `16.3.3`, while the Master build used the installed `16.1.6`. This is a
release/toolchain blocker to close before real customer deployment and a
required 1T input for reproducibility. The package manifest requires Node
`>=22.22.2 <23` and npm `>=11.6.2 <12`; the current audit environment reported
npm `10.9.7`, so CI must pin the declared toolchain.

Every deployment record should contain client repository SHA, shell release ID
and fingerprint, package versions, migration target, client-config fingerprint,
deployment timestamp, environment and operator/workflow identity. No secrets
belong in this record.

## BL–BW. Domains, OAuth, Xero, AI and email

Domain options are a platform-owned subdomain for the fictional proof or a
later client-owned custom domain. DNS ownership, verification records, TLS and
rollback are human decisions. HTTPS is mandatory for hosted production.

`NEXT_PUBLIC_SITE_URL` is the application/Auth site URL. `XERO_REDIRECT_URI`
must be absolute and share the same origin. Xero requirements include client
ID/secret, exact callback registration, scopes, encrypted token storage,
connection ownership and webhook/reconnect decisions. Whether all clients use
one platform OAuth app or separate Xero apps is provider-policy and commercial
input; 1S does not guess.

OpenAI and Anthropic keys are server-only. The current application has multiple
AI routes/models and needs per-client or platform-level cost attribution,
quotas, rate limits and failure policy before real customers. Resend is used
for contact/invite delivery; Auth confirmation/reset email also needs an
explicit SMTP/provider decision. A fictional proof may use a controlled test
sender or leave provider-connected workflows unconnected, but it must not
silently claim email readiness.

## BX–CF. Workers, Edge Functions, cron and webhooks

Current worker/function inventory includes the takeoff render worker, many
HTTP cron routes, Supabase Edge Functions for mobile bootstrap/clock-in/
clock-out, time-sheet rules and invite email, plus Xero/material/UCL/document/
QA cleanup workers. Worker tokens, CRON secrets and Edge Function secrets must
be per-client, server-only, audited and rotated.

`vercel.json` declares eight cron routes. Background work is independently
opt-in through `TRADESSTACK_ENABLED_BACKGROUND_JOBS`; hosted activation must be
an explicit allowlist, not a blanket enable. Each cron route needs alerting,
idempotency/lease verification and a tested authorization header. Inbound
webhooks and provider callbacks require exact URL ownership, signature/token
verification, replay protection where applicable and environment separation.

## CG–CT. Monitoring, backups, access and recovery

Minimum observability covers application errors, failed deployments, cron and
worker failures, Edge Function failures, database/migration failures, Auth
failures, Storage errors and provider/integration failures. Current logging
usually emits summaries but must be reviewed to prevent IDs, payloads,
connection strings or provider responses from leaking into logs.

Backup classes are separate:

| Data | Primary store | Required recovery |
|---|---|---|
| Postgres/Auth metadata | Supabase Postgres | provider backup/PITR plus restore test |
| Files/photos/drawings | Supabase Storage | object export/backup and restore test |
| source/config | private Git/release artifacts | protected repository and release retention |
| secrets | secret manager/provider stores | documented rotation/recovery, never Git |
| deployment/DNS config | protected platform configuration | non-secret inventory and rebuild procedure |

RPO/RTO are business decisions and remain unset. A first hosted proof must
still test a disposable restore/duplicate procedure before real-customer use.
Break-glass access, offboarding, billing ownership and audit-log retention need
named role categories and human approval.

## CU–DC. Promotion, upgrade, skew and rollback

```text
Master validation
  ↓ shell/package release approval
client upgrade branch/PR
  ↓ client CI and ownership check
database migration approval, if required
  ↓ deployment
hosted acceptance and inventory update
```

Clients may run different shell/package releases temporarily. Database targets
must be tracked separately. Application rollback, package rollback, hosting
rollback, database forward-fix and database restore are different operations.
No automatic reverse migration is assumed.

## DE–DI. First hosted fictional proof scope

### Required for 1T

- remote private client repository and protected branch;
- pinned shell release and package/release inputs;
- production-style clean build from client SHA;
- one dedicated hosted Supabase project;
- approved baseline plus forward migrations;
- hosted Auth login/invite/reset path sufficient for the proof;
- ordinary-user RLS and cross-organization denial;
- Supplier create/read acceptance;
- client config and deployment provenance;
- private Storage bucket/policy acceptance for at least one representative
  file/evidence flow;
- HTTPS app reachability and health checks;
- no Master filesystem/database/secret dependency.

### Configuration required but may remain unconnected

Xero, OpenAI/Anthropic, Resend/transactional email, Klaviyo, cron allowlist,
takeoff worker and Edge Functions may be configured as isolated server-side
inputs but must not be connected to real accounts unless explicitly authorized.

### Deferred acceptance

Real customer data, real Xero organization, real domains, production email
sender, customer OAuth, full worker throughput, long-term monitoring, formal
RPO/RTO and commercial offboarding.

1T must still be a real hosted app plus real dedicated Supabase/Auth/RLS/Storage
proof, not a static page.

## DJ–DR. Inventory and risk summary

| External system | Purpose | 1T? | Owner/input | Mutation in 1S? |
|---|---|---:|---|---:|
| private Git provider | Master/client repositories and PRs | Yes | platform owner | No |
| package/release storage | pinned packages/shell bundle | Yes | release owner | No |
| hosting platform | Next app/HTTPS/preview/cron | Yes | deployment owner | No |
| Supabase | Postgres/Auth/Storage/Realtime/Functions | Yes | infrastructure owner | No |
| DNS/TLS | public URL | proof subdomain preferred | domain owner | No |
| Xero | accounting integration | no live connection | integration owner | No |
| OpenAI/Anthropic | AI routes | no live key required for core proof | AI cost owner | No |
| Resend/Auth email | contact/invite/reset | controlled proof sender or deferred | email owner | No |
| monitoring/backups | operations/recovery | readiness required; configure in 1T | operations owner | No |

| Risk | Evidence | Classification | Mitigation |
|---|---|---|---|
| No remote/hosted resources or credentials | Phase 1S restriction | Blocks 1T | explicit human authorization and account inputs |
| Next/npm installed skew | local audit and Phase 1R builds | Blocks real customer; 1T input | pin CI/deployment toolchain and rerun build |
| Baseline not promoted for hosted production | Phase 1O caveat | Blocks real customer | promotion gate and hosted reconciliation |
| Storage objects excluded from DB backup | provider architecture | Blocks real customer recovery | object backup/restore design and test |
| Long-running takeoff worker has no hosted runtime | worker script | Blocks worker-enabled proof | choose separate worker runtime |
| OAuth/email/domain choices unresolved | source/config/provider boundaries | Blocks corresponding integrations | human/provider decisions |
| No current centralized error reporting | repository inventory | Non-blocking for first proof; hardening | add approved observability before real customer |

## DS–DX. Human decisions and deferred operations

Human decisions required: Git/hosting/Supabase account ownership, region and
residency, provider billing, package registry, domain strategy, email sender,
Xero OAuth model, AI key/cost model, worker hosting, monitoring vendor, backup
retention, RPO/RTO, support owner, offboarding and real-customer baseline
promotion.

Do not build a control plane in 1S. A future multi-client inventory may track
client, shell release, package set, migration target, config contract and
deployment state. It should begin as a non-secret inventory, not an automatic
upgrade system.

## DY–EA. Explicit readiness decisions

- Toolchain skew: **required 1T input; real-customer blocker**.
- Baseline promotion: **fictional fresh hosted proof may use it after explicit
  approval; real-customer promotion blocked pending reconciliation and gate**.
- Release signing: **checksum sufficient for fictional proof; signing/
  attestation required before real customer**.
- Preview security: **never attach production client secrets/data by default**.
- Client repository policy: **no secret values and no operational customer data**.

## EB–EF. Security and policy gates

Review before 1T: browser/public env exposure, service-role leakage, package
tokens, CI logs, worker/cron/webhook secrets, OAuth callbacks, Storage path
policies, Auth redirects, preview isolation, branch/PR secret exposure and
provider error logging. CI must fail on secret values and must not print
connection strings.

## EG–EQ. Phase 1T execution plan (not executed)

| Step | External system | Action | Authorization/input | Validation | Rollback/side effect |
|---|---|---|---|---|---|
| 1 | Git | create private Master/client repos | org/admin approval | repo visibility/access/branch protection | delete exact proof repos only |
| 2 | package/release store | publish or attach pinned artifacts | release approval | checksums/provenance/install | revoke exact artifact |
| 3 | Supabase | create fictional dedicated project | project/account/region approval | exact project ref/region | delete exact proof project |
| 4 | Supabase DB | apply baseline then forward migrations | migration approval | ledger/schema/Auth/RLS | forward fix or exact proof cleanup |
| 5 | secret stores | add client-scoped secrets | secret-owner approval | names-only inventory/log scan | revoke/rotate exact secrets |
| 6 | hosting | connect client repo and deploy preview | hosting/project approval | clean build/deployment SHA | remove exact project/deployment |
| 7 | Auth/Storage/Functions | configure URLs, buckets/policies/functions | infrastructure approval | login/RLS/Storage/function tests | revert exact config/project |
| 8 | DNS/TLS | use disposable proof hostname if needed | domain owner approval | HTTPS/callback checks | remove exact records |
| 9 | integrations | leave unconnected or connect only fictional test accounts | provider-specific approval | provider acceptance | revoke exact connection |
| 10 | operations | configure monitoring/backups/restore test | operations approval | alert/restore evidence | remove exact proof monitors |

No step is authorized by this document alone. Cleanup must use exact resource
IDs; never wildcard-delete infrastructure.

## ER–EV. Readiness gate tables

| Area | Result |
|---|---|
| Source/release | READY WITH REQUIRED 1T INPUT |
| Database bootstrap/migrations | READY WITH REQUIRED 1T INPUT |
| Hosted Supabase | BLOCKS 1T until project/region/ownership are authorized |
| Deployment/toolchain | BLOCKS 1T until Node/npm/Next skew is closed |
| Auth/RLS | READY FOR CONTROLLED HOSTED PROOF after project configuration |
| Storage | BLOCKS a complete proof until representative Storage acceptance is included |
| Integrations | CONFIGURATION-REQUIRED; live connections deferred |
| Workers/Edge/cron | BLOCKS only if enabled in 1T; otherwise deferred with explicit allowlist |
| Operations/recovery | BLOCKS real customer; restore/monitoring inputs required for 1T |

## EW–FI. Documentation and final status

Created: this authority document.

Updated: no historical phase documents were modified.

Phase 1S proves that the hosted architecture and mutation-controlled Phase 1T
plan are defined from repository evidence. It does not prove hosted provider
configuration, live deployment, real DNS, real integrations, backup restore,
or customer readiness.

Master worktree remains dirty and preserved. External mutations: **NONE**.
Recommended next phase: **Phase 1T — First Controlled Hosted Fictional
Dedicated Client Deployment**, only after the listed external authorizations and
inputs are explicitly provided.
