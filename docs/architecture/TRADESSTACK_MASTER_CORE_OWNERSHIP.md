# TradesStack Master Core Ownership

## Phase 1A — Master/Core ownership, dependency and extraction-boundary audit

**Status: PHASE 1A COMPLETE — MASTER/CORE BOUNDARIES DEFINED**

This is the Phase 1A architecture authority for future Master-platform work. It is an evidence-based map of the current repository, database contract, security boundaries and extraction risks. It does not authorize source movement, package creation, migration rewriting, UI changes or deployment changes.

## A. PHASE 1A VERDICT

**PHASE 1A COMPLETE — MASTER/CORE BOUNDARIES DEFINED**

The current TradesStack application is a complete Master reference product, not a thin shell. The safe target is a versioned Core consumed by a reference application and later by dedicated client applications. The first meaningful extraction should be a low-risk, server-independent shared presentation/formatting boundary, with **document/PDF export infrastructure** as the preferred first business-adjacent candidate after the package foundation. Auth, tenancy, permissions, project lifecycle, commercial provenance, claims/retention, QA immutability and database migration ownership remain later work.

No ownership decision blocks Phase 1B. The following are documented decisions requiring later human approval before implementation: final private package distribution, whether the existing Files workspace becomes the canonical shared document service, treatment of the unused `project-images` bucket contract, and whether NZ/AU defaults are product defaults or client jurisdiction configuration.

## B. SOURCE STATE

Captured at the start of this audit:

```text
Branch: main
HEAD: 361bf3f094a8abbb58d20606413686cebc242e66
Commit: 361bf3f docs: add maintained TradesStack AI architecture context
Worktree: dirty before Phase 1A
```

Pre-existing tracked modifications included the contact route, takeoff worker route, pricing worksheet components/tests, commercial security tests, opportunity creation, permissions, `next-env.d.ts`, and `supabase/config.toml`. Pre-existing untracked material included artifacts, reconciliation scripts, candidate migrations, a duplicate generated types file, worker tests and additional route/tests. None was reset, checked out, restored, cleaned or stashed.

The Phase 1A change is this document only.

## C. PHASE 0 AUTHORITY

The audit consulted:

- `docs/architecture/TRADESSTACK_AI_CONTEXT.md`
- `docs/architecture/TRADESSTACK_MASTER_BASELINE.md`
- `docs/architecture/TRADESSTACK_DATABASE_BASELINE.md`
- `docs/architecture/TRADESSTACK_BOOTSTRAP_CONTRACT.md`
- `docs/architecture/TRADESSTACK_FRESH_INSTALL_ACCEPTANCE.md`
- related architecture audits under `docs/architecture/`
- current source, migrations, package manifests, route handlers and tests

Phase 0 evidence establishes the preservation rule, fresh replay candidate, Auth/tenancy/RLS/Storage boundaries, the trusted retention claims and the Phase 0E takeoff-worker remediation. Current source remains implementation authority where older documentation differs.

## D. PRODUCT PRESERVATION

This pass made no application-code, database, migration, package, import, UI, route, deployment, Supabase, Storage or provider changes. Existing functionality remains in scope, including active and transitional implementations:

- opportunity promotion and legacy conversion;
- new QA and legacy quality systems;
- shared Files/document workspaces and domain-specific file registries;
- commercial items and older quote/PO/variation representations;
- current and legacy accounting/materials paths;
- mobile/time-sheet and worker paths;
- AI, memory, Universal Construction Learning, workers, cron and Edge Functions.

## E. REPOSITORY ARCHITECTURE

The repository is a single Next.js App Router application with server actions, route handlers, shared React components, domain services and a Supabase/PostgreSQL schema that contains substantial business logic. Principal areas are:

| Area | Current shape | Phase 1A ownership reading |
|---|---|---|
| `app/` | Route groups, pages, layouts, route handlers, server actions | Reference application composition plus Core consumers; not yet package-separated |
| `components/` | `app`, `auth`, `claims`, `marketing`, `quality-assurance`, `ui` | Domain UI, shared UI, document/editor/viewer surfaces |
| `lib/` | Domain services and shared infrastructure; 30+ domain subdirectories | Most future Core implementation; currently highly cross-imported |
| `supabase/migrations/` | 508 files currently present, including four untracked candidates | Core database history candidate; not yet split into streams |
| `supabase/functions/` | Six function directories including shared helpers | Master implementation deployed per client |
| `scripts/` | Audit, reconciliation, worker, deployment and domain tooling | Mixed development/test, deployment and data-operation ownership |
| `tests/` | Security and integration tests | Core security/deployment test infrastructure |
| `public/` | Fonts, logos, images and media | Product defaults today; future branding/configuration boundary |
| configuration | `package.json`, lockfile, `next.config.ts`, `proxy.ts`, `vercel.json`, Supabase config, `.env.example` | Master runtime contract plus client deployment values |
| `docs/` | Architecture, deployment, operations and intelligence authority | Master architecture and release evidence |

The current repository is not a monorepo. It has no package boundary or private package distribution mechanism. Alias imports use the application-level `@/` convention, so future extraction cannot be inferred from imports alone.

## F. CURRENT APPLICATION SHAPE

The product is a vertically integrated construction operating platform:

```text
Auth / tenancy / permissions
        ↓
CRM / opportunity / tender workspace
        ↓
drawings → takeoff → pricing worksheet → scope/specification → quote
        ↓
award / promotion / legacy conversion
        ↓
project → procurement → variations → invoices → claims / retention
        ↓
QA / evidence / tasks / issues / Files / accounting / Xero
        ↓
AI / memory / learning / workers / notifications / reporting
```

The application and database are coupled through direct table access, typed Supabase queries, RPCs, triggers, RLS, snapshots, append-only records, queues, hashes and lifecycle guards. The cleanest unit of future ownership is therefore a cohesive domain contract, not a route folder or table.

## G. MASTER OWNERSHIP MODEL

| Class | Meaning in this repository |
|---|---|
| Master Core | Product engines, domain invariants, authorization architecture, lifecycle rules, shared schemas and stable business contracts |
| Master Shared Service | Reusable infrastructure consumed by multiple domains: Supabase clients, document/storage helpers, export, notifications, worker/job primitives, shared UI |
| Client Configuration | Values that may vary without changing Core source: branding, defaults, terminology, feature enablement, jurisdiction settings and thresholds where safely supported |
| Client Operational Data | Tenant-owned clients, suppliers, projects, quotes, files, materials, templates, claims, QA records and other runtime records |
| Client Extension | Deliberate client-owned behavior behind a Core contract: custom reports, fields, workflows, adapters and composition routes |
| Client Integration Configuration | Credentials, provider tenant connections, sender identities, model choices and mapping values for a client deployment |
| Deployment Infrastructure | A client’s Supabase project, Auth/Storage runtime, domains, secrets, cron schedule, workers and Edge deployments |
| Development/Test Infrastructure | Fixtures, characterization tests, replay harnesses, audit scripts and disposable environments |
| Legacy Preserved | Active historical/parallel capability retained until separately retired by evidence and approval |

Client configuration does not own the engine. A QA engine is Core; company templates are client data/configuration; a custom QA rule is an extension; its Storage and deployment are client-specific.

## H. MASTER CORE CAPABILITIES

Master Core includes the complete current product capability, grouped as:

- Auth, organization tenancy, membership, roles, permission catalog, server permission helpers, RLS and trusted internal claims;
- CRM, clients, contacts, suppliers and organization/project identity;
- opportunity/tender workspace, lifecycle, award, promotion and conversion lineage;
- drawings, pages, calibration, takeoff geometry, measurements and commercial publication;
- pricing worksheets, formulas, scope builder, specification/finish analysis and trade packs;
- quotes, revisions, quote acceptance, commercial items and commercial lineage;
- project lifecycle, project members, dashboards and project context;
- purchase orders, procurement, commitments, assignments and supplier invoice matching;
- variations, variation pricing and status transitions;
- payment claims, retention, immutable accounting records and financial evidence;
- new QA engine: templates, definitions, runs, responses, evidence, hold points, sign-offs and completion;
- Files/document workspaces, nodes, versions, uploads, downloads and signed URL authorization;
- tasks, issues, attachments, activity and project quality paths;
- materials, supplier products, units, tax evidence, pricing and imports;
- accounting concepts, tax, cost items, mappings, revisions, sync state and provider interfaces;
- AI feature logic, chat, document analysis, worksheet assistants, organization memory and Universal Construction Learning;
- Xero, Resend/email, OpenAI/Anthropic adapters, cron jobs, workers, Edge Functions and notification workflows.

## I. MASTER SHARED SERVICES

Shared services are implementation/infrastructure concerns, not client-owned product modules:

- `lib/supabase/`, `proxy.ts`, Auth/session and server/browser client construction;
- organization context and permission enforcement helpers;
- document/storage upload validation, signed URL and workspace authorization;
- PDF rendering/export, invoice/claim/retention exports and Excel export;
- shared UI primitives under `components/ui`, navigation and formatting;
- background job enablement, leasing, retry/dead-letter and cron guard primitives;
- email/notification delivery plumbing;
- AI provider registries/adapters and document-intelligence transport abstractions;
- audit/event, JSON contract, hashing and provenance utilities;
- shared tax/currency/jurisdiction primitives where they are truly provider-neutral.

The service boundary must not bypass domain authorization. A shared Storage helper must require domain ownership context; a worker helper must not turn service-role access into browser authority.

## J. CLIENT CONFIGURATION

Current or credible future configuration candidates:

- company display name, legal/contact details, logo, theme, product/document/email branding;
- feature/module enablement and background-job enablement;
- currency, tax/GST rates, jurisdiction, timezone, date/number formats and terminology;
- numbering conventions, approval thresholds, default retention/accounting settings;
- default QA templates, commercial defaults, cost-code mappings and report templates;
- AI provider/model selection and organization guidance;
- email sender/reply-to and notification preferences;
- integration enablement and non-secret provider mapping values.

The repository already has organization settings, tax/currency/timezone defaults, branding helpers, organization capabilities, AI context and environment gates. It does not yet provide a complete, centralized client configuration contract. Do not infer that every candidate is safely configurable today.

## K. CLIENT OPERATIONAL DATA

Operational tenant data is not configuration: organizations, members, clients, contacts, suppliers, opportunities, drawings, files, measurements, worksheets, quotes, projects, POs, variations, invoices, claims, retention schedules, QA templates/records, tasks, issues, materials, cost items, accounting records, memory items and provider-side connection data. Every client deployment owns its own rows and Storage objects; no production database is shared between clients.

## L. CLIENT EXTENSION CANDIDATES

Candidate extension surfaces, not implemented in Phase 1A:

- project-specific fields, tabs, dashboards and reports;
- custom approval/variation/claim workflows;
- custom QA rules, reports and evidence requirements;
- custom commercial calculations or document layouts behind Core totals/provenance contracts;
- external ERP/accounting adapters;
- client-specific document parsers and AI workflows;
- custom notifications, terminology and integrations;
- client routes composed alongside Core routes;
- client tables/functions that reference Core IDs without Core importing client tables.

The extension direction is `client extension → stable Core contract`. Current source still contains direct application-internal imports and route composition, so these are future boundaries rather than existing guarantees.

## M. CLIENT INTEGRATION CONFIGURATION

| Integration | Master implementation | Client-owned values |
|---|---|---|
| Supabase/Auth/Storage | Core access patterns, schema, policies and function code | Client project URL/keys, Auth settings, bucket runtime and deployment |
| Xero | `lib/xero/`, accounting sync and callback logic | OAuth credentials, encrypted token rows, Xero tenant connection, mappings |
| OpenAI/Anthropic | AI feature logic and provider adapters | API keys, model choice, quotas and organization guidance |
| Resend | invite/contact/notification delivery logic and Edge Function | API key, sender identity, domain verification and recipient data |
| PDF/Excel/image providers | shared export/render implementation | deployment runtime limits and client branding/data |
| Workers/cron | worker implementation, job contracts and guards | token/secret, schedule, enablement, runtime resources |

## N. DEPLOYMENT INFRASTRUCTURE

Each client owns a separate Supabase project/database/Auth/Storage, application deployment/domain, environment secrets, cron schedule, worker runtime, Edge Function deployment and provider connection. Master owns the source contracts, migration release and deployment templates; it does not own client runtime data or secrets.

## O. LEGACY PRESERVED

Explicitly preserved until a later approved retirement pass:

- legacy quality/inspection/issues/photos/sign-off system beside new QA;
- legacy opportunity conversion beside promotion/same-workspace lifecycle;
- quote/project quote compatibility paths;
- older commercial/accounting/material representations and reconciliation paths;
- current mobile/time-sheet compatibility paths;
- duplicate/archive-looking files and untracked artifacts when their active status is not disproven;
- current Safety placeholder route surfaces.

## P. MASTER OWNERSHIP MATRIX

| Capability | Master Core | Shared Service | Client Config | Client Data | Client Extension | Deployment |
|---|---|---|---|---|---|---|
| Auth/tenancy/RLS | ✓ | session clients | limited settings | members/org rows | no direct override | Auth project |
| CRM/opportunities | ✓ | storage/files | defaults | clients/tenders | custom fields/reports | client DB |
| Drawings/takeoff | ✓ | PDF/signed URLs/worker primitives | units/defaults | drawings/measurements | custom measurement/report | Storage/worker |
| Pricing/scope/quotes | ✓ | export/UI | tax/terms/defaults | worksheets/quotes | custom rules/layouts | client DB |
| Projects/procurement | ✓ | document/export | numbering/defaults | projects/POs | approvals/adapters | client DB |
| Variations/claims/retention | ✓ | PDF/notifications | thresholds/terms | schedules/claims | custom approval/report | client DB/cron |
| QA new engine | ✓ | evidence/storage | templates/settings | templates/runs/evidence | custom rules/reports | Storage |
| Legacy quality | ✓ preserved | photos/storage | limited | inspection records | future adapter | Storage |
| Files/documents | ✓ | storage/upload/export | naming/defaults | workspaces/nodes/versions | custom views/report | Storage |
| Tasks/issues | ✓ | attachments/activity | statuses/defaults | tasks/issues | custom workflows | client DB |
| Materials | ✓ | imports/AI/unit conversion | tax/defaults | catalogue/products/prices | supplier adapter | client DB/Storage |
| Accounting | ✓ | export/sync/job primitives | tax/mappings | revisions/costs | provider adapter | client DB/cron |
| Xero | adapter/interface | OAuth/job primitives | enablement/mapping | tenant/token rows | MYOB/ERP adapter | secrets/callback URL |
| AI/learning | feature logic | provider registry/queues | model/quota/guidance | interactions/memory | custom agent | API keys/workers |
| Email/notifications | delivery contract | templates/send helper | sender/preferences | recipients/events | custom provider | Resend secret/domain |
| Edge/workers/cron | implementation | auth/job helpers | enablement/schedule | queues/job records | client job | runtime/token |
| Branding/terminology | defaults and render contracts | fonts/formatting | ✓ | organization settings | client theme package | domain/assets |

## Q. DOMAIN SOURCE MAP

| Domain | Routes | Components | Services / actions | Database / runtime |
|---|---|---|---|---|
| Auth/tenancy | `app/login`, `register`, `join`, workspace layouts | `components/auth`, `hooks/use-auth.ts` | `proxy.ts`, `lib/supabase/*`, permission helpers | `organizations`, memberships, invites, roles, RLS |
| CRM | `app/(workspace)/leads-clients/clients` | client detail/dialog components | `lib/leads-clients-server.ts`, client actions | clients, contacts, notes, files |
| Opportunities | `.../opportunities` and API lifecycle routes | opportunity boards/dialogs | `lib/opportunity-*`, `trade-pack-workspaces.ts` | opportunities, lifecycle, tender clients, quote series |
| Drawings/takeoff | opportunity/project takeoff editor, `/api/takeoff/*` | viewer/editor components | `lib/takeoff/*`, `drawing-sets.ts`, export | drawing sets, pages, calibrations, measurements, render jobs |
| Pricing/scope | pricing worksheet routes, `/api/pricing-worksheets`, scope/spec APIs | worksheet/editor components | `lib/opportunity-pricing-*`, `lib/ai-pricing-*`, `lib/commercial-items/*` | worksheets, sheets, cells/formulas, publication requests |
| Quotes/commercial | quote routes, commercial context APIs | quote and commercial mapping components | `lib/commercial-quotes`, commercial items/lineage | quote series/revisions/lines, commercial items/edges |
| Projects | `app/(workspace)/projects/[projectId]` | dashboard/project components | `lib/projects.ts`, project creation | projects, members, aliases, actual costs |
| Procurement/PO | project preconstruction PO routes/actions | PO dialogs/forms | `lib/purchase-orders/*` | POs, lines, assignments, attachments, activity |
| Variations | project preconstruction variation routes/actions | variation components | variation/commercial/material services | variations, lines, attachments, status events |
| Invoices/accounting | company supplier-invoices, payment claims, accounting APIs | invoice/claim workspaces | `lib/supplier-invoice-*`, `lib/accounting/*` | invoices, allocations, documents, accounting revisions |
| Claims/retention | project claims/retention routes/actions | `components/claims` | `lib/payment-claims/*`, `lib/retention/*`, exports | claims, revisions, schedules, ledgers, reminders |
| QA | project QA routes | `components/app/quality-assurance` | `lib/quality-assurance/*` | templates, definitions, runs, responses, evidence, signoffs |
| Legacy quality/tasks | project job management routes | app task/quality components | task/quality server helpers | `project_quality_*`, `project_job_todos`, activity/attachments |
| Files | project/opportunity files routes, document APIs | `components/app/files` | `lib/documents/*`, upload queue | workspaces, nodes, versions, cleanup jobs |
| Materials | company materials, material APIs | material panels | `lib/materials/*` | materials, supplier products/prices, imports |
| AI/learning | project AI chat, company/internal intelligence, AI APIs | intelligence workspaces | `lib/ai/*`, `lib/universal-learning/*`, memory services | interactions, queues, memory, learning runs |
| Integrations | settings integrations, Xero callbacks | settings components | `lib/xero/*`, accounting mapping | OAuth, encrypted secrets, connections, sync jobs |
| Edge/mobile | Supabase functions | function-local handlers | `supabase/functions/*` | mobile/time-sheet/assignment schema |

## R. DATABASE OWNERSHIP MAP

The Phase 0 disposable replay recorded approximately 290 public relations, 800 public functions, 371 non-internal triggers and 477 public policies; 274 public relations had RLS enabled and 253 were forced RLS. The repository currently contains 508 migration files, while the Phase 0 replay candidate used 504 committed migrations plus approved forward candidates and excluded the development-only cleanup migration.

| Domain | Representative tables/relations | RPC/trigger/policy ownership | Primary owner |
|---|---|---|---|
| Auth/tenancy | `organizations`, `organization_members`, invites, capabilities, role/permission tables | signup/bootstrap, membership, permission and RLS helpers | Master Core |
| CRM | `organization_clients`, contacts/locations, `client_notes` | org-scoped CRUD, contact/linkage policies | Master Core; client data |
| Opportunity | `organization_opportunities`, lifecycle, tender clients, award manifests | lifecycle/award/conversion RPCs and lineage triggers | Master Core |
| Project | `organization_projects`, members, aliases, actual costs | project creation/member/access functions and policies | Master Core |
| Takeoff | drawing sets, pages, calibrations, measurements and geometry tables | publication RPCs, geometry constraints, private Storage policies | Master Core |
| Worksheet | pricing worksheets/sheets, memory and publication requests | worksheet owner/write/read functions and triggers | Master Core |
| Commercial | `commercial_items`, document links, `commercial_lineage_edges` | source validation, safe-column grants, lineage triggers | Master Core; high risk |
| Quotes/POs/variations | opportunity/project quote tables, PO and variation families | numbering, publication, status and snapshot functions | Master Core |
| Invoice/accounting | supplier invoice families, accounting documents/revisions/events | immutable revisions, allocation/status and sync functions | Master Core |
| Claims/retention | claims, retention schedules, ledgers, snapshots, events | trusted phase gates, release/allocation functions | Master Core; security-sensitive |
| QA | `qa_*`, project QA definitions/runs/evidence/signoffs | lifecycle, completion, immutability and Storage policies | Master Core |
| Legacy quality/tasks | `project_quality_*`, todos/comments/attachments | project access and lifecycle functions | Legacy Preserved in Core |
| Documents | workspaces/nodes/versions/uploads/cleanup | workspace access, upload/download guards | Shared service + Files Core |
| Materials | organization materials, supplier products/prices, imports | import/approval/price evidence functions | Master Core; client data |
| AI/learning | interactions, chat, memory, learning, evidence pools/queues | quota, queue leasing and internal operation functions | Master Core + shared workers |
| Integrations | Xero connections/secrets/OAuth states and accounting mappings | OAuth state, encrypted secret and sync functions | Master adapter + client config/data |
| Mobile/time sheets | worker assignments and time-sheet structures | Edge function identity and assignment checks | Master Edge/mobile Core |

Database ownership is conceptual until a Core migration stream is created. Current migrations must not be moved or rewritten in Phase 1A.

## S. DATABASE CROSS-DOMAIN DEPENDENCIES

- Organization and membership scope is the parent authority for every tenant domain.
- Opportunity links clients, tender context, drawings, files, takeoff, worksheets, scope, trade packs and quote series.
- Quote acceptance/award links opportunity history to a final project through either promotion or legacy conversion.
- Takeoff and worksheet publications create commercial items and destination-specific quote/PO/variation records while preserving provenance.
- Projects own procurement, variations, claims, retention, QA, tasks/issues and project Files.
- POs and variations feed supplier invoice matching, actual cost and accounting resolution.
- Claims/retention use project, accounting and Xero state; retention has trusted internal phase gates.
- QA, tasks, invoices, drawings and documents share private Storage authorization but must not share unrestricted table authority.
- AI and learning consume organization/project documents and commercial events through queues and provenance, but provider credentials remain server-only.

## T. DOMAIN DEPENDENCY GRAPH

```text
AUTH / TENANCY / RLS
        ↓
PERMISSIONS / ORGANIZATION CONTEXT
        ↓
CRM / CLIENTS / SUPPLIERS
        ↓
OPPORTUNITY / TENDER WORKSPACE
   ┌────┼───────────────┬──────────────┐
   ↓    ↓               ↓              ↓
FILES DRAWINGS/TAKEOFF PRICING/SCOPE  QUOTES
   └────┴───────────────┴──────┬───────┘
                               ↓
                    AWARD / PROMOTION / CONVERSION
                               ↓
                            PROJECT
              ┌──────────────┼──────────────┬──────────────┐
              ↓              ↓              ↓              ↓
        PROCUREMENT      VARIATIONS       QA       TASKS / ISSUES
              ↓              ↓              ↓
       SUPPLIER INVOICES → ACTUAL COSTS → CLAIMS / RETENTION
                                             ↓
                                         ACCOUNTING / XERO

SHARED FILES/STORAGE, DOCUMENT EXPORT, NOTIFICATIONS, AI/LEARNING
cross-cut the graph through authorized contracts and queues.
```

## U. HIGH-COUPLING DOMAINS

1. **Opportunity → Project lifecycle**: two active award strategies, manifests, quote/project quote compatibility and workspace/document continuity.
2. **Commercial kernel**: `commercial_items` and lineage are shared by takeoff, worksheets, quotes, POs, variations, materials, invoices and accounting.
3. **Project → claims/retention/accounting**: immutable snapshots, origin inheritance, trusted phase gates and Xero updates create strong database coupling.
4. **Pricing worksheet**: large UI/service/database subsystem with AI, materials, takeoff, commercial publication and historical versions.
5. **QA and Files/Storage**: evidence and signatures cross project, Storage, document versions and lifecycle immutability.
6. **AI/learning**: queues and provider calls consume many domains and have internal/admin boundaries.

## V. CYCLIC DEPENDENCIES

The following are current architectural cycles, not defects to fix in 1A:

- Project ↔ Files: project context owns document workspaces while Files authorization resolves project context.
- Project ↔ Commercial: project quotes/variations consume commercial items, while commercial provenance carries project/destination identity.
- Project ↔ Takeoff: takeoff routes may resolve opportunity/project lineage; publication writes project commercial records.
- Commercial ↔ Materials: material pricing creates commercial inputs and commercial lines retain material/source provenance.
- Project ↔ QA/Tasks/Issues: project owns operational records while QA/issues can create tasks, attachments and evidence.
- Accounting ↔ Claims/Invoices/Retention: financial records feed provider sync while provider state and accounting mappings gate operational status.

These cycles argue for stable contracts and strangler extraction, not table-by-table packages.

## W. IMPORT-LEVEL EXTRACTION BLOCKERS

Static source review identifies these practical blockers:

- route components and server actions import domain services directly through `@/lib/*`;
- shared UI components contain domain-specific data shapes and presentation assumptions;
- commercial item helpers are imported by pricing, takeoff, quotes, POs, variations, materials and invoice paths;
- document/storage helpers are called from drawings, QA, invoices, claims, tasks, variations and Files;
- accounting and Xero code crosses claims, retention, supplier invoices and cost mappings;
- AI providers are partly abstracted for worksheet workflows but other AI/document paths still know provider details;
- cron routes call feature workers directly and share database queue contracts;
- Edge Functions use their own Supabase clients and server-side service-role paths;
- duplicate/archive-looking files and generated types make source authority ambiguous;
- 508 migrations are a chronological replacement history, not independent domain packages.

## X. AUTH / TENANCY OWNERSHIP

Auth and tenancy are immutable Master infrastructure. Current evidence shows Supabase Auth sessions, middleware/proxy, organization bootstrap, invitations, membership, organization context, RLS and service-role containment. Client deployments provide Auth configuration and tenant data; they cannot redefine the authority chain or bypass organization derivation. Signup, invite acceptance, organization selection, membership and project access remain Core contracts.

## Y. PERMISSION OWNERSHIP

The permission engine, role catalog, role-permission mapping, member overrides, `has_org_permission` and server helpers are Master Core. Role assignment and organization-specific assignments are client operational data/configuration within the Core catalog. The current architecture does not support clients redefining the permission catalog safely; do not expose that as client configuration. RLS and permission checks remain database/application security logic.

## Z. PROJECT LIFECYCLE OWNERSHIP

The full Opportunity → workspace → quote → award → promotion/conversion → Project chain is one high-risk Core lifecycle. It must not be split between a client app and Core. Both promotion and legacy conversion remain preserved. Award pricing manifests, commercial history, quote revisions, project continuations and document lineage are part of the contract. Extract only after lifecycle characterization and database compatibility gates exist.

## AA. DRAWING / TAKEOFF OWNERSHIP

Drawing and takeoff are Master Core. PDF.js/viewer/editor UI, drawing sets/pages, calibration, normalized geometry, measurement groups/paths/areas, publication and provenance are one domain family. PDF rendering and worker execution are shared/deployment infrastructure. The dedicated takeoff worker token is a required security contract; browser Auth must never substitute for it.

## AB. PRICING / SCOPE / QUOTE OWNERSHIP

Pricing worksheets, formulas, scope builder, specification/finish review, trade packs, quotes, revisions and acceptance are Core. Worksheet/company defaults and quote terms are client data/configuration. OpenAI/Anthropic provider credentials and model selection are client integration configuration; worksheet feature logic remains Core. Quote snapshots and commercial publication are not interchangeable with the estimating workbook.

## AC. COMMERCIAL OWNERSHIP

Commercial items, effective values, sections, totals, tax, destination adapters, source signatures and lineage are a reusable Core commercial kernel. The current database and services make this a high-risk boundary: takeoff, worksheets, quote, PO, variation, materials, invoice and accounting paths depend on it. It is not the first extraction candidate. A future stable contract must preserve source/provenance, organization/project scope, status authority and destination-specific snapshots.

## AD. PO / VARIATION OWNERSHIP

Purchase orders and variations are Core project-commercial domains. Supplier/project/client records, line data and attachments are client operational data; numbering, status transitions, commercial publication, tax, provenance and permissions are Core. Document rendering and Storage are shared services. Custom approvals are extension candidates behind Core status contracts.

## AE. SUPPLIER INVOICE OWNERSHIP

The invoice capture, document extraction, matching, allocation, approvals, accounting resolution and Xero handoff are Master Core. Supplier, invoice and document rows are client data; Xero credentials and tenant connection are client integration configuration/data. Invoice extraction can later expose parser/adaptor extension points, but current service and accounting coupling is high.

## AF. CLAIM / RETENTION OWNERSHIP

Claims, revisions, snapshots, retention schedules, origins, ledgers, reminders, allocation, PDF output and accounting state are Core. `retention_phase4_internal=true` and related trusted phase claims are internal security boundaries, never client-editable configuration. Client contractual rates, dates, schedules and recipient data are operational data. This domain remains late extraction due to immutable records, phase gates, Xero/accounting coupling and rollback risk.

## AG. QA OWNERSHIP

The new QA engine is Master Core. Company templates and defaults are client configuration/data; project definitions, runs, responses, evidence, hold points and sign-offs are client operational records. The legacy `project_quality_*` inspection/issues/photos/sign-off system is **LEGACY PRESERVED** and remains Core-owned until a separately approved retirement. Do not consolidate the systems during extraction.

## AH. FILES OWNERSHIP

The document workspace, nodes, versions, upload lifecycle, download guards, signed URLs, usage accounting and cleanup are a Master shared service plus Files Core domain. Feature ownership remains with drawings, QA, invoices, claims, tasks and variations for their specific records and Storage paths. The shared workspace is a strong future extraction candidate after security contract tests, but not before its consumers are placed behind an API.

## AI. TASK / ISSUE OWNERSHIP

Tasks/todos, comments, attachments, activity, assignments and project links are a reusable construction Core service. Issues/defects and legacy quality records remain preserved and are more domain-specific. Attachment Storage is shared infrastructure. Client-specific statuses, fields or assignment workflows are extension candidates, not permission bypasses.

## AJ. MATERIALS OWNERSHIP

Material/catalogue, supplier product, unit conversion, tax evidence, imports and estimating-price logic are Core. Material rows, supplier catalogue data, price history and imports are client data. Supplier-specific feeds and ERP/catalogue adapters are extension/integration candidates. Current materials work includes active migration/reconciliation artifacts; these are not silently promoted to Core migration history.

## AK. ACCOUNTING OWNERSHIP

Tax, cost items, mappings, accounting documents/revisions, immutable accounting evidence, sync jobs and provider-neutral accounting state are Core. Organization cost mappings, tax settings and provider tenant data are client configuration/data. Xero is one adapter, not the accounting engine. Accounting remains high risk due to immutable revisions and claim/invoice/retention dependencies.

## AL. INTEGRATION OWNERSHIP MATRIX

| Integration | Master implementation | Client credentials | Client data | Deployment config | Extension candidate |
|---|---|---|---|---|---|
| Supabase | client factories, RLS/RPC contracts, Storage policy schema | anon/service keys are deployment secrets as applicable | all tenant DB/Storage records | project, Auth, buckets, Edge deploy | alternate hosted runtime only later |
| OpenAI | AI feature logic and provider adapter | `OPENAI_API_KEY`, model vars | prompts/context/memory | env/secrets and quotas | other model/provider adapters |
| Anthropic | worksheet/document provider implementation | `ANTHROPIC_API_KEY`, model vars | organization AI context | env/secrets | provider adapter |
| Xero | OAuth, sync workers, accounting adapter | client ID/secret/encryption key | encrypted connection, Xero tenant/mappings | redirect URL, cron | MYOB/QuickBooks/custom ERP |
| Resend | invite/contact email implementation | `RESEND_API_KEY`, from/reply-to | recipients/templates/events | verified domain and Edge secret | alternative email provider |
| Workers | feature worker code and queue contracts | `TAKEOFF_RENDER_WORKER_TOKEN`, cron/internal secrets | job rows/results | worker runtime/schedule | client-specific job adapter |
| Edge Functions | mobile, time-sheet and invite function code | deployed function secrets | mobile/time-sheet records | project/function deployment | client mobile adapter |
| PDF/Excel/image | export/render code | none normally | generated document data | runtime limits/assets | custom document renderer |

## AM. AI OWNERSHIP

AI feature logic is Core: Scope Builder, document analysis, chat, worksheet edit/scaffold assistants, pricing learning, organization memory and Universal Construction Learning. Provider adapters are shared/Core integration code. Model choice, API credentials, quotas and organization guidance are client configuration. Current worksheet provider abstraction is evidence for an adapter boundary; other AI paths require further isolation before promising a universal provider contract.

## AN. XERO OWNERSHIP

Xero implementation remains Master. OAuth state, callback validation, encrypted token storage, contact/bill/sales invoice sync and accounting worker behavior are Core. Xero credentials, encrypted connection rows, selected Xero tenant and mappings are client configuration/data. Callback URLs and cron schedules are deployment-specific. Future accounting adapters must implement a provider-neutral Core interface rather than be copied into client code.

## AO. EMAIL OWNERSHIP

Invite/contact/notification behavior and message contracts are Core/shared service. Resend is the current provider adapter. API keys, sender identity, domain and recipient/organization data are client/deployment-owned. Phase 0D.6 portability remediation is preserved: no provider call should be required for local/core tests, and provider failures must not become authorization bypasses.

## AP. EDGE / WORKER / CRON OWNERSHIP

Edge Function code is Master; each client deploys it to its own Supabase project. Vercel cron route and worker implementations are Master; schedules, enabled jobs, secrets/tokens and runtime resources are deployment configuration. Job queues, leases, dead letters and domain results are client DB data. Current functions include mobile bootstrap/clock in/clock out, invite email and time-sheet rules. Current worker families include takeoff rendering, documents cleanup, retention rolling drafts, Universal Learning, supplier-bill/Xero accounting workers and cron-driven refreshes.

## AQ. STORAGE OWNERSHIP

Storage infrastructure is deployment-specific; bucket names, schema expectations, object path rules and policies are Master-owned. Phase 0 evidence lists organization logos, organization documents, drawing sets, QA evidence/photos, task attachments, variation attachments, supplier invoice documents and material imports. `project-images` is referenced by code but absent from the replay-created bucket catalog and requires a later human disposition. No client extension may mint arbitrary signed URLs or weaken path policies.

## AR. SECURITY OWNERSHIP MATRIX

| Boundary | Master-owned rule | Client-owned value/data |
|---|---|---|
| Auth/session | Supabase session and identity derivation | project/Auth runtime |
| Tenancy | organization derivation, membership and composite scope | organization/member rows |
| Permissions | catalog, helper RPCs, server checks | role assignments/overrides within catalog |
| RLS | policies, forced RLS, SECURITY DEFINER search paths | client DB instance |
| Storage | bucket/path policy contract and authorization helpers | objects and Storage runtime |
| Worker | token enforcement and service-role containment | token secret/runtime |
| Cron | secret validation and job authorization | schedule/secret/enablement |
| Internal claims | trusted signed claims and DB write fences | deployment signing configuration |
| Service role | server/worker-only use after auth checks | deployment key |
| Integration tokens | encryption/access boundary | client secrets and provider tenant |

Phase 0E specifically verified that the takeoff worker now requires `TAKEOFF_RENDER_WORKER_TOKEN`; invalid/missing tokens return 401 and browser Auth does not fall through to processing.

## AS. CONFIGURATION INVENTORY

| Configuration | Current authority | Future owner | Runtime/build-time | Existing support? |
|---|---|---|---|---|
| Supabase URL/anon key | environment | client deployment | runtime/build | yes |
| service-role key | environment/server | client deployment secret | runtime | yes |
| site/callback URL | `NEXT_PUBLIC_SITE_URL`, Xero env | client deployment | runtime/build | yes |
| AI keys/models | env/provider modules | client integration config | runtime | partial |
| Xero credentials/scopes | `lib/xero/env.ts`/env | client integration config | runtime | yes |
| Resend/from email | Edge/env | client integration config/deployment | runtime | partial |
| cron/worker tokens | env | client deployment secret | runtime | yes |
| background-job allowlist | env | client deployment/config | runtime | yes |
| organization branding | org settings/`lib/branding-server.ts` | client configuration | runtime | partial |
| tax/currency/timezone | bootstrap/org settings/jurisdiction helpers | client configuration | runtime | partial |
| terminology | route/component strings | future config/extension | build/runtime | no centralized support |
| feature rollout controls | DB/env/scripts | Core release + client config | runtime | partial |
| QA/material/commercial defaults | DB/bootstrap/domain constants | client configuration/data | runtime | partial |

## AT. COMPANY-SPECIFIC HARD-CODING

The scan found product branding and marketing references to TradesStack, NZ/AU wording, fonts/assets, GST-oriented commercial fields, and `TradesStack` cost-code labels. Environment variables contain diagnostics and provider configuration rather than customer IDs. Organization IDs are primarily runtime tenant scope, not detected client-specific branching. These findings classify as:

- TradesStack logos/fonts/product copy: current product default, future branding configuration candidate;
- NZ/AU construction language and GST: likely product/jurisdiction defaults; do not internationalize or remove in 1A;
- GST/currency/tax fields: jurisdiction/configuration boundary plus Core tax engine;
- customer/project UUIDs in reconciliation SQL/artifacts: data-operation inputs, not product logic;
- organization IDs in server/Edge code: tenant authority, not client-specific branching unless a literal ID/name is found;
- `TRADESSTACK_ENABLED_BACKGROUND_JOBS` and diagnostic organization allowlists: deployment/development configuration.

No evidence was found requiring a client-specific branch to be removed. The current findings should be revisited when a client configuration contract is designed.

## AU. JURISDICTION BOUNDARY

Jurisdiction affects GST/tax, currency, accounting, supplier invoices, claims, retention, statutory documents, terminology, date/time and AI guidance. The Core should own calculation and evidence contracts; jurisdiction profiles/defaults should own values and terminology. Current NZ/AU behavior remains valid Master product behavior and must not be internationalized during extraction.

## AV. BRANDING BOUNDARY

Branding is currently embedded in public assets, fonts, component copy, document/email rendering and organization settings. The future boundary is client configuration with Core-rendered templates and an explicit asset resolver. Until then, preserve TradesStack branding and all current marketing routes/assets.

## AW. CLIENT-SPECIFIC BRANCHING

Search found runtime organization IDs and tenant checks, but no proven `if client === ...` or named Client A product branch. Literal TradesStack branding and NZ/AU marketing are product defaults, not customer forks. Reconciliation scripts contain customer/project identifiers and must remain outside Core application logic.

## AX. EXTENSION CANDIDATE MATRIX

| Extension point | Core contract needed | Current coupling | Risk | Recommended phase |
|---|---|---:|---:|---|
| Custom project fields/tabs | project identity/context and permission contract | High | Medium | after package foundation |
| Custom reports | stable read models/document/export contract | High | Medium | after Files/export boundary |
| Custom approval workflows | status transition/event contract | High | High | after project/commercial characterization |
| Custom QA rules | QA definition/run/evidence contract | High | High | after QA immutability tests |
| Custom ERP adapter | accounting interface and immutable evidence | High | High | after Xero adapter isolation |
| Custom AI workflow | provider-neutral context/usage contract | Medium/high | Medium | after AI provider audit |
| Custom notifications | event/template/delivery contract | Medium | Low/medium | after shared notification boundary |
| Custom route | composition/namespace contract | High in App Router | Medium | Phase 1B design |
| Custom DB table | Core IDs, RLS and migration namespace rules | High | High | migration-stream phase |

## AY. CORE CONTRACT CANDIDATES

Stable extension contracts should eventually cover organization/project identity, authenticated actor and permission checks, project lifecycle events, commercial item/provenance, quote/PO/variation snapshots, file/workspace upload/download, QA evidence/signoff, accounting document/revision, notification delivery, AI provider calls and integration adapter interfaces. Internal Supabase queries, private table columns, route-local types and implementation files are not public extension contracts.

## AZ. UI / ROUTE EXTENSION CANDIDATES

Candidate UI composition points are project tabs/actions, settings integrations, reports, dashboards, document actions, QA actions and custom company screens. Next App Router constraints mean client routes should be composed in a client app namespace or wrapper route tree; Core routes should not be edited per client. A future reference app must exercise the same contracts as client apps.

## BA. DATABASE EXTENSION MODEL

Core migrations own Core tables, functions, triggers, policies, types and Storage contract. Client migrations may add client tables/functions/policies and foreign-key/reference Core IDs, but Core migrations must never reference client tables or rewrite Core history. Client objects must have a namespace/naming policy, explicit RLS and compatibility tests. Shared operational records remain Core schema, not copied into client extension tables.

## BB. CORE MIGRATION MODEL

The current 508-file history should remain untouched during Phase 1A. Future Master releases should establish an ordered, immutable Core migration stream derived from the approved historical/candidate set and fresh replay. Each client deployment applies Core migrations in order, records the Core schema version, and runs client migrations only after the compatible Core level is present. Customer/project reconciliation SQL and development fixture cleanup do not belong in the Core stream.

## BC. CLIENT MIGRATION MODEL

Client migrations run after compatible Core migrations and are append-only within the client repository/namespace. They must not modify or renumber Core history, replace Core functions without an explicit supported hook, or create dependencies that prevent a future Core update. Client migration metadata must identify required Core version and whether the change is additive, data-transforming or extension-only.

## BD. GENERATED TYPES MODEL

Generated Supabase types should be produced from the deployed Core-plus-client database contract for each client release, with Core types/contracts kept separate from client additions where tooling permits. `lib/supabase/types.ts` is current evidence, not a proven source of truth; the empty `lib/supabase/types 2.ts` is not authoritative. A future CI gate must regenerate in a disposable database and reject unexpected drift.

## BE. MASTER REPOSITORY TARGET

The current repository should evolve toward a Master monorepo containing the reference app, Core domain packages, shared UI/services, Core migrations, workers/Edge functions, tests and docs. The reference app should remain a real consumer of packages. No package directories are created in 1A.

## BF. CLIENT REPOSITORY TARGET

A future client repository should contain composition/routes, client config, extensions, integration adapters, client migrations, client acceptance tests and a package manifest pinned to a versioned Master Core. It must not contain a copied editable Core source tree. Client operational data lives in the client deployment, not in the repository.

## BG. MONOREPO STRATEGY

Evidence favors a **temporary/transitioning Master monorepo**, not immediate multi-repo extraction. Dependency density, App Router composition, shared `lib` imports, 508 migration history, shared DB contracts and cross-domain UI make immediate multi-repo extraction unsafe. A monorepo can first prove package boundaries and keep the reference application running. Long term, stable Core packages can be published privately to client repositories. The current single app remains the reference consumer until the first boundary is proven.

## BH. PACKAGE CANDIDATES

| Candidate | Scope | Coupling | Recommendation |
|---|---|---:|---|
| `core-contracts` | IDs, auth context, domain event/read-model types | Medium | early foundation |
| `shared-ui` | primitives, navigation, formatting | Low/medium | first low-risk extraction |
| `shared-documents` | upload/version/signed URL/export primitives | High | after authorization contract |
| `auth-tenancy-permissions` | security engine and contracts | Very high/security | Core package later, not first |
| `opportunities-projects` | lifecycle and award | Very high | keep cohesive; late |
| `takeoff-drawings` | drawings/takeoff/publication | High/commercial | late |
| `pricing-quotes-commercial` | worksheet/quote/commercial kernel | Very high | cohesive late package |
| `procurement-variations` | POs/variations | High | after commercial boundary |
| `claims-retention-accounting` | financial lifecycle | Very high | latest domain extraction |
| `qa` | new QA engine plus explicit legacy adapter | High | after immutability contracts |
| `materials` | catalog/import/pricing | Medium/high | after commercial interfaces |
| `integrations` | provider-neutral contracts/adapters | Medium | early contract, implementations later |
| `ai-learning` | AI/memory/queues | High/cross-cutting | later, split provider from feature logic |

Avoid one package per table, route or component.

## BI. DEPENDENCY RISK MATRIX

| Domain | Coupling | Extraction difficulty | Security sensitivity | DB coupling | Recommended order |
|---|---|---|---|---|---|
| Shared UI/formatting | Low | Low | Low | None | 1 |
| Export/document primitives | Medium | Medium | Medium | Storage/document | 2 |
| Provider contracts | Medium | Medium | High | integration state | 3 |
| Files workspace | High | High | High | workspace/RLS/Storage | 4 |
| CRM/suppliers/materials | Medium | Medium | Medium | org tables | 5 |
| Drawings/takeoff | High | High | High | geometry/Storage/worker | 6 |
| QA | High | High | Very high | immutable evidence | 7 |
| Procurement/variations | High | High | High | commercial/project | 8 |
| Opportunities/projects | Very high | Very high | Very high | lifecycle RPCs | 9 |
| Commercial kernel | Very high | Very high | Very high | lineage/provenance | 10 |
| Claims/retention/accounting | Very high | Very high | Very high | immutable financial DB | 11 |
| Auth/tenancy/permissions | Very high | Very high | Very high | all RLS | permanent Core, late packaging |

## BJ. HIGH-RISK EXTRACTION AREAS

Leave untouched until later: Auth/tenancy/permissions, opportunity/project lifecycle, commercial items/lineage, pricing worksheet publication, claims/retention, accounting revisions/Xero, QA immutability, Files signed URLs/Storage policy, takeoff worker boundary and Edge/mobile authority. These are not rejected as packages; they are deferred until stable contracts and equivalence tests exist.

## BK. FIRST EXTRACTION CANDIDATE

**Choose exactly one: shared UI and formatting primitives, centered on the existing `components/ui`, `lib/format`, `lib/fonts` and similarly dependency-light presentation utilities.**

Why:

- it proves workspace/package wiring without touching Auth, RLS, database, project lifecycle or commercial correctness;
- it has a manageable dependency direction toward React/style primitives rather than domain tables;
- it can be consumed by the reference app and tested through build/component tests;
- it provides immediate import-boundary evidence before any business-domain extraction.

The first business-domain-adjacent candidate after that foundation is shared document/PDF export infrastructure, but it is not the first extraction in this audit because signed URLs, Storage authorization and domain-specific exports make it materially riskier.

## BL. EXTRACTION ORDER

1. Repository/package foundation with no functional movement.
2. Shared UI, formatting and contract types.
3. Provider-neutral integration interfaces and test doubles.
4. Shared export/document primitives, preserving current route behavior.
5. Files workspace boundary and Storage authorization contract.
6. Low/medium-coupling CRM, materials and supplier services.
7. Drawings/takeoff and worker boundary.
8. QA new engine plus explicit legacy adapter.
9. Procurement and variations.
10. Opportunity/project lifecycle as one cohesive unit.
11. Commercial kernel and pricing/quote publication.
12. Claims/retention/accounting/Xero.
13. Client extension and migration tooling.

Auth/tenancy/permissions remain foundational Core and should be packaged only after the package boundary has been proven elsewhere.

## BM. VERSIONING MODEL

Use SemVer for Core packages/release bundles, with a separately recorded Core database schema level. Major versions may change stable extension contracts; minor versions add compatible capability; patches fix behavior without changing contracts. Database changes must be forward-compatible across the supported application skew window. Package version alone is insufficient: every release needs migration level, generated contract, provider contract and client compatibility metadata.

## BN. CORE RELEASE MODEL

```text
Master change → Core/reference tests → fresh DB replay → versioned Core release
             → generated contract → client update PR → client compatibility/staging
             → approval → client production
```

Bug fixes must update the Core release and each client’s pinned dependency through a reviewable change. Do not silently copy source or mutate client repos in place.

## BO. CLIENT UPDATE MODEL

Clients may remain on supported Core versions, for example A on 1.8 and B on 1.7, only while migration and provider compatibility are supported. The update process must compare app version, Core schema level, client migration level, extension contract and provider configuration. Failed application updates may roll back code; database changes should use forward remediation and backups, not unsafe promise-of-rollback.

## BP. CLIENT CUSTOM FEATURE MODEL

For each request: promote broadly reusable behavior into Core; otherwise implement a client extension behind a stable contract. Client extensions live in client-owned paths/packages and migrations, use Core APIs/events/read models, and never patch Core internals. A later promotion migrates the implementation to Core, preserves the extension contract, and lets the client switch by versioned release.

## BQ. CORE PROMOTION MODEL

Promotion requires a generalized contract, Core implementation, Core/reference tests, client compatibility tests and a deprecation path for the client extension. The original client migration/data must be preserved or forward-migrated; no Core update may overwrite client-owned records or extension code.

## BR. MASTER REFERENCE APP

Yes. The current TradesStack application should become the Master reference application consuming the same Core packages future clients consume. This is essential dogfooding: a package is not considered stable until the reference app exercises it through the public/stable boundary. Every Core release should pass against the reference app before client update PRs.

## BS. TEST OWNERSHIP

| Test class | Future home |
|---|---|
| Core unit/contract | Core packages |
| Core integration/database | Core repository with disposable replay |
| Security/RLS/Storage | Core release gates and deployment harness |
| Reference app acceptance | Master reference app |
| Client extension/acceptance | client repository |
| Deployment/provider | client deployment CI with safe test credentials |
| Reconciliation/data operations | separately approved operations/scripts, never ordinary Core tests |

## BT. CORE RELEASE GATES

Build/typecheck, lint, Core unit/integration tests, clean fresh migration replay, generated type check, Auth/bootstrap, RLS/permission/Storage security, project lifecycle, commercial provenance, QA immutability, worker-token enforcement, cron/Edge contract tests, provider mocks and reference-app acceptance. Phase 0 evidence shows these are required, not optional polish.

## BU. CLIENT RELEASE GATES

Pinned Core compatibility, Core migration application, client migrations, generated types, client build/tests, Auth/bootstrap, permissions/RLS/Storage, project lifecycle, extension tests, provider configuration validation, worker/cron secrets, staging smoke tests and explicit production approval. Database level and app version must be recorded together.

## BV. ARCHITECTURAL DEBT BLOCKING EXTRACTION

Only material blockers are recorded:

- no package/workspace boundary or private distribution;
- direct cross-domain `lib` imports and server-action coupling;
- database/RPC/triggers are not partitioned into Core/client streams;
- generated types have no proven regeneration gate and a duplicate candidate exists;
- migration history includes untracked forward candidates and data-specific operations;
- route, UI and service ownership are mixed;
- Files/Storage authorization is shared but not exposed through a stable contract;
- provider abstraction is incomplete outside selected AI worksheet paths;
- active parallel implementations make “canonical module” assumptions unsafe.

No debt is cleaned in Phase 1A.

## BW. PHASE 0E WORKER SECURITY PRESERVATION

The Phase 0E remediation is an explicit extraction constraint. `app/api/takeoff/render-jobs/run/route.ts` must require `TAKEOFF_RENDER_WORKER_TOKEN`; invalid/missing tokens are rejected, and browser Auth is not a fallback. Any future worker package/deployment must preserve token enforcement, Auth/RLS for user paths, service-role containment, job ownership, idempotency and auditability. A package boundary that bypasses this is invalid.

## BX. NEXT.JS DEPENDENCY MISMATCH

Exact finding from Phase 0: `package.json` and `package-lock.json` request Next.js `16.3.3`, while installed `node_modules/next/package.json` reports `16.1.6`. Two environment-sensitive tests are affected: the synthetic Server Action error expectation and image optimizer AVIF passthrough expectation. Phase 0 reports this as a toolchain mismatch, not an Auth/RLS/application defect. It does not alter extraction planning, but it must be reconciled before relying on all build/test gates. No dependency was changed in Phase 1A.

## BY. PHASE 1B SCOPE

**PHASE 1B — REPOSITORY / PACKAGE BOUNDARY FOUNDATION** should:

- add workspace/package tooling without moving product files;
- define a Core/reference-app package convention and import-direction rules;
- establish shared type/build/test configuration;
- define a no-op or characterization package consumed by the reference app;
- document Core versus app versus client-extension ownership;
- add dependency graph/boundary checks where safe;
- preserve all current routes, UI, database, migrations, Supabase config, permissions, Storage, workers and deployment behavior.

1B must not move the first business domain, create client repos, alter migration history, publish packages, or change runtime behavior.

## BZ. LONGER MASTER ROADMAP

```text
1A ownership/dependency audit
 ↓
1B repository/package foundation
 ↓
1C shared UI/formatting extraction
 ↓
1D provider contracts and document/export boundary
 ↓
1E Files/Storage contract
 ↓
1F low-risk domain boundaries
 ↓
1G takeoff/QA/procurement boundaries
 ↓
1H cohesive opportunity/project/commercial extraction
 ↓
1I claims/retention/accounting and provider adapters
 ↓
1J Core/client migration streams and reference deployment
 ↓
1K controlled client extensions, private distribution and update automation
```

## CA. HUMAN DECISIONS REQUIRED

The audit is not blocked, but these decisions require explicit approval before implementation:

1. Long-term private package distribution: private registry/GitHub Packages versus another controlled channel.
2. Whether Files/document workspace is the canonical shared service or remains a Core domain with shared helpers.
3. Final disposition of the referenced but replay-absent `project-images` bucket.
4. Whether NZ/AU wording/defaults are product defaults, jurisdiction profiles or both.
5. Supported Core-version skew window and client migration compatibility policy.

## CB. DOCUMENTATION CREATED

`docs/architecture/TRADESSTACK_MASTER_CORE_OWNERSHIP.md`

## CC. APPLICATION FILES CHANGED

**NONE**

## CD. DATABASE CHANGES

**NONE**

## CE. PRODUCTION IMPACT

**NONE**

## CF. HOSTED SUPABASE IMPACT

**NONE**

## CG. ACTIVE LOCAL IMPACT

**NONE**

## CH. PHASE 1A STATUS

**COMPLETE**

## CI. NEXT RECOMMENDED PASS

**PHASE 1B — REPOSITORY / PACKAGE BOUNDARY FOUNDATION**

## CJ. FINAL GIT SAFETY

Phase 1A preserved all pre-existing work. Only the approved architecture document was added. Final status and HEAD must be checked by the executing agent and reported alongside the existing dirty state; no pre-existing file may be reverted or discarded.
