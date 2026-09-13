# TradesStack Full Codebase Complexity, Development Hours & Replacement Cost Audit

**Audit date:** 17 August 2026 (NZST)

**Scope:** Current working tree, including tracked modifications and untracked first-party files

**Method:** Read-only static repository and Git-history audit; no code, configuration, database, or tests were changed or executed

**Evidence labels:** **CONFIRMED** = directly observed; **CALCULATED** = mechanically derived; **ESTIMATED** = professional cost/effort model; **INFERRED** = reasoned conclusion

## 1. Executive Verdict

**TradesStack is a large, unusually broad construction vertical-SaaS codebase with advanced commercial, accounting, document, estimating, and learning infrastructure.** It is not accurately described as a CRUD application or a collection of screens.

The audited corpus contains **2,141 repository files after cache/vendor/archive exclusions**, including **1,984 first-party files**, **1,952 source-like files**, **95 application pages**, **107 API route files**, **444 SQL migrations**, **251 tables and 503 functions in the generated current public schema**, and **564 Vitest/Playwright test or spec files**. The measured source corpus is approximately **609,268 physical lines**, of which about **130,358 are test code** and **130,250 are SQL**. After removing generated Supabase types, generated keyword corpora, and obvious duplicate-suffixed working files, the meaningful implementation is approximately **570,000 physical lines**. These are size indicators, not an hours formula.

**ESTIMATED equivalent professional rebuild effort:**

- **Optimistic:** 22,000–28,000 hours (12.2–15.6 developer-years)
- **Realistic:** 34,000–44,000 hours (18.9–24.4 developer-years); central model approximately 40,000 hours
- **Conservative commercial:** 50,000–65,000 hours (27.8–36.1 developer-years)

At a realistic blended delivery rate of **NZ$150–NZ$200/hour**, the primary replacement-cost range is **NZ$5.1m–NZ$8.8m**. This is replacement-cost modelling, not a market quotation or a claim about money historically spent.

The closest classification is **complex vertical SaaS platform by feature breadth**, with **early-to-maturing production SaaS** operational maturity. Strong database invariants, financial evidence, recovery queues, tenant isolation and characterization tests coexist with very large source files, compatibility layers, a heavily dirty working tree, some duplicate files, incomplete/placeholder safety screens, and no evidence from this audit of a fully exercised release pipeline.

## 2. Repository Statistics

### Inventory

| Metric | Result | Basis |
|---|---:|---|
| Repository files | 2,141 | **CALCULATED**; excludes `.git`, `node_modules`, `.next*`, `.tmp`, artifacts, coverage/build outputs, vendor, archives, disabled branches, Supabase temp/branches and temporary public assets |
| First-party files in audited roots/config | 1,984 | **CALCULATED** across `app`, `components`, `hooks`, `lib`, `src`, `styles`, `supabase`, `scripts`, `tests`, `types`, `docs` and root configs |
| Source-like files | 1,952 | TS/TSX/JS/MJS/SQL/CSS/shell/Swift |
| TypeScript (`.ts`) | 1,125 | Includes tests and generated DB types |
| TSX | 344 | React/server/client components and tests |
| JavaScript/MJS | 22 | Predominantly operational scripts/config |
| SQL | 448 | 444 migrations plus functions/snippets/other SQL |
| Test files (broad classifier) | 580 | Includes fixtures/helpers and files beneath test directories |
| Test/spec files | 564 | `*.test.*` / `*.spec.*` |
| E2E files | 23 | 14 executable test/spec files plus setup/helpers/guards |
| Scripts | 35 | `scripts/`; reconciliation, rollout, audit, debug and workers |
| Config files | 10 | Principal package/TypeScript/Next/Playwright/Vercel/Supabase configs |
| Markdown documentation | 10 | Architecture, intelligence and operations docs |
| Next pages / API routes / layouts / actions | 95 / 107 / 8 / 13 | File-system route inventory |

### Lines of code

| Corpus | Files | Physical | Blank | Comment-only (approx.) | Nonblank/noncomment (approx.) |
|---|---:|---:|---:|---:|---:|
| All source-like files | 1,952 | 609,268 | 46,177 | 1,681 | 561,411 |
| Test-classified code | 570 | 130,358 | 9,876 | 24 | 120,458 |
| SQL | 448 | 130,250 | 9,486 | 669 | 120,095 |
| SQL migrations | 444 | 129,711 | 9,433 | 622 | 119,656 |
| Generated Supabase type copies | 2 | 28,447 | 12 | 4 | 28,431 |
| Production-classified, before generated/duplicate adjustment | 1,380 | 450,463 | 36,289 | 1,653 | 412,522 |

The comment count uses a conservative line-oriented lexical classifier and understates inline JSX/SQL comments. **Approximate production application code excluding SQL, tests, generated types, generated keyword corpora and obvious duplicate-suffixed files is 280k–290k physical LOC.** Tests contribute about 130k and SQL about 130k more. Thirty-eight `* 2.*`/`* 3.*` files plus two generated keyword corpora account for roughly 17,013 lines; these were inspected as evidence of evolution but excluded from meaningful implementation size where duplicative.

### Explicit exclusions

Excluded from meaningful counts: dependencies and vendor code; `.git`; `.next*`; `.tmp` browser/Playwright/Next output; `artifacts`; caches; logs/databases; binary media/fonts; `coverage`, `dist`, `build`; `_archive`; `branch_only_disabled`; Supabase temp/branch state; generated bundles; the generated `lib/supabase/types.ts` and duplicate `types 2.ts` for adjusted LOC; generated/enriched keyword datasets; and duplicate-suffixed source copies where they would inflate size. Public assets remain repository files but not source LOC.

## 3. Architecture Overview

**Frontend/server.** Next.js 16 and React 19 use the App Router, server components/actions, client workspaces, and 107 route handlers (`package.json:41-45`). Large interactive systems include the 10,275-line pricing worksheet board, 7,191-line takeoff viewer, and 7,150-line supplier-invoice workspace. Supabase SSR maintains sessions and project-slug compatibility redirects (`lib/supabase/middleware.ts:10-65`; `proxy.ts:6-35`).

**Database.** PostgreSQL/Supabase is not passive persistence: transactions, RPCs, triggers, RLS, queues, counters, snapshots, constraints and read models encode major business behavior. Generated types place the public sections at `lib/supabase/types.ts:41`, `:22728`, `:23197` and `:28270`.

**Tenancy/authorization.** Most business entities carry `organization_id`; membership, roles, permission overrides and capabilities form the authorization model. Server checks call `has_org_permission` and batch permission RPCs (`lib/permissions-server.ts:38,75`), while migrations apply RLS to tenant tables. Platform-admin gates are separate (`lib/permissions-server.ts:144`).

**Storage/documents.** Supabase Storage, TUS resumable upload, immutable versions, opaque storage keys, workspace/entity links, quotas, soft deletion, cleanup queues and reconciliation findings form a document subsystem (`package.json:50`; `supabase/migrations/20260730110000_complete_document_storage_lifecycle.sql:104-174,1273-1355`).

**Financial/accounting.** Relational commercial truth flows through quotes, variations, purchase orders, supplier invoices, actual costs, payment claims, retention and immutable accounting revisions. Xero is a downstream accounting provider, not the semantic source of truth. CostItems are explicitly canonical (`docs/architecture/commercial-intelligence-architecture.md:15`); the canonical intelligence model says relational business data remains authoritative (`docs/intelligence/tradesstack-intelligence-canonical-model.md:33`).

**AI/learning.** OpenAI and Anthropic providers support chat, drawing/spec classification, worksheet editing, document interpretation and Universal Construction Learning. Durable event, classification, evidence-pool, semantic-pool, synthesis, organization-memory and review-run pipelines surround model calls. AI is bounded by schemas, provenance, cursors and validation, rather than being the primary database.

**Runtime.** Next/Vercel plus Supabase/PostgreSQL/Storage is evident. Seven production cron declarations cover Xero, supplier-bill learning, worksheet classification, two invoice-status refreshes, document cleanup and material pricing (`vercel.json:2-31`); additional internal/manual cron routes exist beyond the deployed list.

### Confirmed lifecycle dependency

The repository supports this principal chain, with branches and compatibility paths:

`Opportunity → pricing workbook/takeoff/scope/quote → award/conversion → project + commercial lineage → variation/PO → supplier invoice/actual cost → payment claim/retention → immutable accounting revision → Xero invoice/bill → payment/status reconciliation`

It is not one monolithic transaction. Canonical commercial-item links and CostItem lineage preserve meaning across documents; promotion migrations preserve opportunity/project workspace continuity; financial documents create revisioned or append-only evidence; asynchronous provider work is queued and reconciled.

## 4. Product Module Inventory

| Module | Purpose | Main routes/UI | Principal services | Main DB entities | Integrations/tests | Complexity |
|---|---|---|---|---|---|---|
| Authentication & invitations | Login, registration, join, session/invite bootstrap | `/login`, `/register`, `/join` | Supabase clients, middleware, organization server | organizations, members, invites/audit | Supabase Auth; migration/security tests | High—identity plus safe tenant bootstrap |
| Organizations, users & permissions | Company settings, roles, overrides, capabilities | `/settings/*` | `permissions-server`, settings actions | app_permissions, role_permissions, overrides, capabilities | RLS/permission contracts | Very High—defence in depth across all domains |
| Clients & contacts | Client CRM, locations, notes, files, quotes/invoices | `/leads-clients/clients/*` | `leads-clients-server`, Xero client contacts | clients, contacts, locations, notes | Xero contacts; route/action tests | Moderate |
| Suppliers & contacts | Supplier directory and contact linkage | `/company/suppliers` | supplier services, Xero contacts | suppliers, external contacts/link activity | Xero; component/service tests | High—canonical/external identity matching |
| Opportunities & lifecycle | Pipeline, award, conversion, promotion rollout | `/leads-clients/opportunities/*` | opportunity creation/conversion/promotion/compatibility services | opportunities, lifecycles, promotion controls/events, final projects | Shadow/pilot/hosted E2E corpus | Very High—dual lifecycle compatibility and atomic conversion |
| Quotes & tendering | Opportunity/project quotes and commercial publish | opportunity/project `/quote` | quote services, commercial-item publishing | opportunity/project quotes and lines, commercial items | PDF/accounting lineage tests | High—versioned lineage and totals |
| Pricing workbooks | Spreadsheet-like sheets, formulas, paste, autosave, AI edit plans | `/pricing-worksheet/*` | formulas, mutation, interaction, publish and AI-job services | worksheets, workbook sheets, bindings | OpenAI/Anthropic; extensive unit/E2E | Exceptional—10k-line grid, formulas, selection semantics, AI and persistence |
| Drawings & takeoff | PDF render, calibration, point/line/area measures and quantities | `/takeoff/*`, measure editor | `takeoff-server`, render worker, coordinate transforms | drawing sets, pages, jobs, calibrations, measurements/shapes/paths | PDF.js/Sharp; takeoff tests | Exceptional—geometry, coordinate systems, rendering, large interactive UI |
| Scope/spec/trade packs/change detection | Interpret documents into scopes, finishes and trade packs | build-scope, spec, change-detection, trade-pack routes | scope/spec/trade-pack builders | runs, trade packs/workspaces/page indexes/reason snapshots | AI/PDF; validation tests | Very High—document AI plus project continuity |
| Projects & dashboards | Project creation, lifecycle shell, aggregate reporting | `/projects/*`, dashboard | projects/work-context/cost-report services | projects, aliases, members, labour budgets | aggregate RPCs/component tests | High—central integration surface |
| Tasks, todos & attachments | Shared project/opportunity task workflows | job-management/todos | typed task service/RPCs | tasks, links, comments, attachments, activity | storage; migration/contract tests | High—shared migration and audited mutations |
| Timesheets & labour | Entries, events, PO-linked labour snapshots | job-management/time-sheets | timesheet/project services | time entries/events, labour budgets | PO synchronization tests | High—commercial linkage/timezone rules |
| Quality assurance | Inspections, issues, evidence, photos, sign-offs | job-management/quality-assurance | QA services/helpers | 12+ QA tables | Storage; UI/service tests | High—multi-state evidence workflow |
| Health & safety | Navigation shells for plans, hazards, incidents, inductions etc. | `/site-safety/*` | minimal | no dedicated live entities confirmed | no material suite confirmed | Low—subroutes are 16–17-line placeholders |
| CostItems & cost-code mapping | Canonical commercial semantics and company accounting translation | company/report review, cost codes | classification/routing/intelligence | cost_items, mapping rules/codes, actual cost events | AI/Xero downstream; review tests | Very High—cross-document lineage and governance |
| Variations | Draft/publish/status, pricing worksheet, claim inclusion | `/preconstruction/variations/*` | commercial-item/publish services | variations, lines, attachments, invoice items/events | storage/Xero downstream; regression tests | Very High—financial revision and lineage |
| Purchase orders & commitments | PO editing, assignments, approvals, releases | `/purchase-orders/*` | procurement-commercial, PO services | POs/lines/assignments/status/activity/releases | Xero/supplier invoices; extensive tests | Very High—commitment accounting and concurrency |
| Supplier invoices | Capture/extract/match/allocate/approve/export | `/company/supplier-invoices/*`, API routes | allocation, workflow, extraction, tax resolution | invoice lines/docs/matches/allocations/approval/snapshot tables | document AI, Xero; E2E + many contracts | Exceptional—7k-line UI plus multi-role financial workflow |
| Payment claims | Progress claims, snapshots, customer invoices/payments | `/preconstruction/claims/*`, company register | claim/financial snapshot/payment services | claims/lines, accounting docs/revisions/jobs | Xero, PDFs; characterization/visual tests | Exceptional—historical snapshots, replacement and payment state |
| Retention | Schedules, rolling drafts, variances, claims, releases, reconciliation | `/preconstruction/retention/*` | 52 retention files plus Xero workers | 30+ retention tables/ledgers/events/jobs | Xero/PDF/cron; phase/legacy tests | Exceptional—construction-specific, append-only and legacy-sensitive finance |
| Materials & supplier pricing | Catalogue, imports, product identity, price history, tax/unit evidence | `/company/materials`, imports APIs | 69 material files, import/pricing workers | materials, products, prices, imports/jobs/rows, lifecycle/conversions | AI documents/cron; dense regression suite | Exceptional—normalization, provenance, tax, units and idempotent approval |
| Files/document workspace | Tenant/project/opportunity workspaces, versions, uploads, deletion | `/files`, document APIs | documents workspace/upload/cleanup | workspaces, nodes, versions, links, usage, cleanup/reconciliation | Supabase Storage/TUS; E2E/worker tests | Exceptional—versioned storage lifecycle and recovery |
| PDFs/Excel/export | Claims, retention, invoices, takeoff and quantity exports | download APIs/actions | `lib/exports/*` | document metadata/attachments | pdf-lib, PDF.js, ExcelJS | High—financial fidelity and PDF coordinate handling |
| Xero/accounting | OAuth, contacts, bills, sales invoices, updates, status/payment sync | integrations settings/callback, cron/internal routes | 137 files in `lib/xero` | connections/secrets/contacts, immutable accounting docs/revisions/jobs/events | Xero; exceptionally dense tests | Exceptional—external accounting correctness, uncertain outcomes and reconciliation |
| AI assistants/classification | Chat, worksheet edit/scaffold, document/drawing/spec classification | `/api/ai`, `/api/chat`, classification routes | AI providers/edit plan/model generator | AI interactions/chat/usage/validation | OpenAI/Anthropic | Very High—structured generation, quotas and safe mutation planning |
| Organization memory & UCL | Tenant learning, evidence/semantic pools, synthesis, lifecycle/review | company/internal intelligence and cron routes | UCL builders/runner/worker, memory services | memory/event/pool/queue/run/cursor/action tables | Anthropic; large unit/characterization suite | Exceptional—37k LOC submodule, provenance, queues and cross-domain trust boundaries |
| Notifications & contact | Contact/early-access mail and retention reminders | public/API plus retention | Resend/contact and reminder logic | reminder/events/invites | Resend; limited direct suite | Moderate |
| Reporting/observability | Project/company finance, cost reports and intelligence operations | dashboard, financials, internal operations | cost report, inspection/metrics services | 13 views plus projections/events | DB aggregation and tests | High—aggregates across central financial data |

Every High-or-higher rating is driven by at least one of: tenant authorization, irreversible money state, cross-document lineage, external-provider uncertainty, geometry/document processing, compatibility migration, or durable asynchronous processing—not file size alone.

## 5. Database Complexity

**Current live architecture (generated schema):** 251 public tables, 503 public RPC/functions, 13 views, five enums. No materialized views are present in the generated public types. **Historical implementation:** 444 migration files and 129,711 migration LOC. Static migration parsing finds 246 `CREATE TABLE` statements (245 distinct names), 997 function creation/replacement statements (714 distinct names including private helpers), 298 trigger creations (286 names), 14 view creations (13 names), 651 policy creations (528 names), and 717 index creations (705 names). Those historical statement/name totals are not current-live counts because later migrations replace/drop objects.

The database contains composite tenant foreign keys, organization-scoped uniqueness, number counters, JSON shape checks, financial amount checks, state-transition RPCs, append-only triggers, queue leasing with `FOR UPDATE SKIP LOCKED`, partial/hot-path indexes and read-model views. At least 244 explicit `ENABLE ROW LEVEL SECURITY` occurrences were found across 115 migration files. Constraint-related migration matches exceed 1,600, though that is deliberately reported only as an order-of-magnitude indicator because formatting and replacements prevent a clean current count without applying all migrations.

Historical migration effort is **Very Significant**: examples include repeated claim snapshot fixes (April), CostItem lineage repair (May), worksheet intelligence queues/pools/synthesis (May–June), commercial canonicalization (July), immutable accounting/retention phases (July–August), opportunity promotion compatibility (July–August), and material/tax/unit-conversion hardening (August).

## 6. Integration Complexity

- **Xero:** OAuth state/secrets, encryption, scopes, tenant/contact identity, bills, sales invoices, attachments, status/payment refresh, retry/dead-letter behavior and “request may have reached provider” uncertainty (`lib/xero/sync.ts:1101-1141`). This is the highest-risk integration.
- **Supabase:** Auth, SSR, Postgres/RPC/RLS and Storage; TUS supports resumable uploads.
- **OpenAI/Anthropic:** provider adapters for chat, pricing sheets, document interpretation and UCL, guarded by structured schemas/provenance.
- **Documents:** pdf-lib, PDF.js, Sharp and ExcelJS (`package.json:39,43-44,48`) support rendering, merging, coordinates and exports.
- **Email:** Resend (`package.json:47`) supports public contact/early access and related communication paths.

## 7. Security & Multi-Tenancy

Security is **defence-in-depth**: authenticated Supabase clients; organization membership; role permissions; member overrides; capability/gate records; server permission checks; RPC assertions; RLS; tenant-composite foreign keys; separate service-role workers; storage-object access functions; platform-admin gates; signed/internal cron secrets; request timeouts; PDF signature validation; and shared database-backed rate/concurrency limits. The abuse guard fails closed with 503 when the limiter is unavailable and 429 on excess (`lib/security/abuse-guard.ts:44-164`).

The intelligence design explicitly prohibits tenant memory leakage (`docs/intelligence/tradesstack-intelligence-canonical-model.md:147`) and raw-customer exposure in platform intelligence (`:166`). Remaining audit risk: static evidence cannot prove every route/RPC is correctly scoped, and the working tree contains substantial uncommitted change.

## 8. Financial & Commercial Complexity

The expensive work is in invariants and history:

- Immutable accounting revisions store canonical snapshots, multiple SHA-256-style hashes, minor-unit totals, confirmation evidence and supersession state; update triggers reject mutation (`supabase/migrations/20260725130000_add_immutable_accounting_foundation_phase2a.sql:75-221,652-712`).
- Retention payment evidence is append-only and uses deterministic `largest_remainder_v1` allocation (`supabase/migrations/20260724150000_add_retention_claim_payment_reconciliation.sql:3,35-212,311`).
- Claims preserve pre-GST, variation and retention snapshots and have recalculation/backfill migrations.
- Supplier invoices separate extraction, match, site review, allocation, commercial approval, accounting approval and actual-cost projection; mapping/material changes invalidate prior approvals.
- Xero workflows distinguish create/update/void-and-replace/legacy adoption, source hashes, proposal staleness, external payment refresh and uncertain provider outcomes.
- Tax logic includes jurisdiction resolution, GST inheritance, zero-tax lines, material tax normalization/versioning and remediation evidence.

These features are specialist/high-risk engineering because errors can duplicate provider documents, change historical financial meaning, cross tenant boundaries, or produce cent-level reconciliation drift.

## 9. Background Processing & Reliability

Queues exist for Xero sync, learning reviews, supplier-bill refresh, document cleanup, material imports, worksheet classification/evidence/semantic/synthesis, organization-memory retirement, retention rolling drafts/variance scans, render jobs and intelligence outboxes. Common patterns include atomic claims, lease expiry, bounded batches, attempt counts, exponential/delayed retry, idempotency keys, correlation IDs, dead letters, stale-job recovery, completion evidence and operator-attention states. Document cleanup alone includes leased `SKIP LOCKED` claims and dead-letter/reconciliation records (`complete_document_storage_lifecycle.sql:1273-1592`). Xero jobs model `pending`, `claimed`, `retry_scheduled`, `completed`, and `dead_lettered` (`lib/xero/sync.ts:123-131`).

## 10. Testing & Quality Architecture

**CONFIRMED:** 564 test/spec files, approximately 130k test LOC and 4,022 textual test/describe/it declarations. The suite includes 41 characterization files, at least 33 contract-named files, 123 migration-named tests, 48 regression/boundary/behavior files, security/RLS tests, idempotency/concurrency tests, and 14 executable E2E/test specs. Playwright covers supplier invoices, payment-claim visuals, pricing-sheet parity/autosave, opportunity promotion stages, files continuity and material price review (`tests/e2e/*`).

The architecture is strong in database-contract and regression characterization testing. Limitations: this audit did not execute tests (to preserve strict audit-only/no-artifact scope), E2E is configured serially with zero retries (`playwright.config.ts:3-15`), visual coverage is narrow, and no confirmed CI configuration was found in the audited first-party inventory.

## 11. Dependency/Coupling Analysis

| System | Depends on | Used by | Coupling | Change risk |
|---|---|---|---|---|
| Organization/permission kernel | Auth, membership, RLS | Nearly every module | Very High | Critical |
| Generated schema/RPC contracts | Migration chain | All server/data services | Very High | Critical |
| Commercial items/CostItems | quotes, mappings, lineage | variations, POs, invoices, claims, reporting, AI | Very High | Critical |
| Opportunity lifecycle/conversion | clients, workspaces, quote/estimate | projects and all downstream commercial modules | Very High | Critical |
| Pricing workbook engine | materials, formulas, persistence, AI | quotes/variations/estimating/intelligence | Very High | Critical |
| Project/work context | organization, opportunity, members | dashboard, takeoff, tasks, QA, commercial | Very High | Critical |
| Supplier-invoice workflow | suppliers, POs, tax, docs, permissions | actual cost, Xero, reporting, UCL | Very High | Critical |
| Claims/retention | quote/variation baselines, tax, permissions | PDF, accounting, Xero, dashboard | Very High | Critical |
| Immutable accounting/Xero | commercial evidence, contacts, tax, queues | payments, status, reconciliation, reports | Very High | Critical |
| Documents/storage | tenants, permissions, Storage, entity links | clients, opportunities, projects, invoices, commercial docs | High | Critical |
| Takeoff/drawings | PDFs, storage, geometry, render jobs | quantities, scope, estimating | High | High |
| Memory/UCL | canonical business data, events, AI, queues | company intelligence and future assistants | Very High | High |

The first ten rows are the ten most architecturally important systems: they either enforce trust/identity, define canonical commercial truth, or fan out to three or more financially material consumers.

## 12. Complexity Drivers

**Engineering composition by equivalent effort:** Basic application development **16%**; intermediate engineering **23%**; advanced engineering **35%**; specialist/high-risk engineering **26%**. The specialist share is concentrated in accounting/Xero, retention, claims, spreadsheet behavior, takeoff geometry, tenant security, durable jobs, migration compatibility and AI provenance.

Performance work is visible in aggregate RPCs, batch permission calls, partial and hot-path indexes, pagination/bounded batches, `SKIP LOCKED`, scoped filters, cached permission reads, server-side aggregation and concurrency control. Historical compatibility appears in opportunity lifecycle readers/aliases, quote conversion lineage repair, legacy retention reconciliation, legacy voided-claim adoption, Xero reconnect recovery, fallback reads, staged rollout controls and old/new accounting paths.

## 13. Complexity Score

| Dimension | Score | Repository basis |
|---|---:|---|
| Product breadth | 9/10 | CRM through estimating, delivery, commercial finance, documents and intelligence |
| Domain complexity | 9/10 | Construction-specific takeoff, procurement, progress claims and retention |
| Database complexity | 10/10 | 251 tables, 503 public functions, 444 migrations, RLS/triggers/queues/read models |
| Financial/commercial complexity | 10/10 | snapshots, immutable revisions, GST, retention, payments and reconciliation |
| Integration complexity | 8/10 | deep Xero plus Supabase Storage/Auth and two AI providers; limited provider count |
| Security/tenancy complexity | 9/10 | organization scoping, RLS, roles/overrides/capabilities and storage guards |
| Workflow/state complexity | 10/10 | staged approvals, promotion, financial lifecycle and compatibility transitions |
| Reliability/background processing | 9/10 | leased queues, retries, dead letters, outboxes and recovery |
| Testing/quality architecture | 9/10 | 564 test/spec files and strong characterization; CI/executed status unverified |
| Cross-system coupling | 9/10 | commercial/identity/financial kernels feed many modules |
| **TOTAL** | **92/100** | **Exceptional complexity; score reflects risk and interconnectedness, not LOC alone** |

## 14. Module-by-Module Development Hours

Hours include module-specific discovery, UX, implementation and focused tests; shared foundations are in §15.

| Module | Low | Expected | High | Main reason |
|---|---:|---:|---:|---|
| Public/auth/onboarding | 300 | 500 | 800 | Auth, invites, legal/marketing |
| Organizations/users/settings | 400 | 650 | 1,000 | tenant/role administration |
| Clients/suppliers/contacts | 550 | 950 | 1,400 | CRM plus external identity |
| Opportunities/lifecycle/conversion | 650 | 1,050 | 1,600 | compatibility and atomic promotion |
| Quotes/tendering | 450 | 750 | 1,100 | financial documents and lineage |
| Pricing workbook/estimating | 1,050 | 1,700 | 2,500 | spreadsheet interactions/formulas |
| Drawings/takeoff | 900 | 1,450 | 2,200 | PDF geometry/rendering |
| Scope/spec/trade packs/change detection | 850 | 1,350 | 2,000 | AI document workflows |
| Projects/dashboard/reporting | 650 | 1,050 | 1,500 | aggregate central workspace |
| Tasks/timesheets/QA | 1,000 | 1,700 | 2,500 | shared states, evidence and labour linkage |
| Health & safety placeholders | 50 | 100 | 200 | navigation/placeholder only |
| CostItems/codes/commercial-item kernel | 750 | 1,150 | 1,700 | canonical semantics and lineage |
| Variations | 550 | 850 | 1,300 | revision/status/claim coupling |
| Purchase orders/procurement | 750 | 1,250 | 1,850 | commitments, assignment, approvals |
| Supplier invoices | 1,200 | 1,850 | 2,700 | extraction-to-accounting workflow |
| Payment claims | 850 | 1,350 | 2,000 | snapshots/invoice/payment lifecycle |
| Retention | 1,450 | 2,350 | 3,500 | specialist financial/legacy logic |
| Materials/imports/supplier prices | 1,050 | 1,650 | 2,400 | identity, units, tax, provenance |
| Files/document workspace | 650 | 1,050 | 1,600 | resumable/versioned storage lifecycle |
| PDF/Excel/document exports | 450 | 750 | 1,100 | accurate financial/geometry output |
| Xero/accounting workflows | 1,500 | 2,450 | 3,600 | uncertain external financial effects |
| AI assistants/classification | 850 | 1,400 | 2,100 | structured safe generation |
| Organization memory/UCL | 1,650 | 2,650 | 3,900 | provenance, pooling, synthesis, queues |
| Notifications/operational views | 300 | 550 | 850 | mail, reminders, admin observability |
| **Module subtotal** | **18,850** | **30,550** | **45,400** | Calculated from the component rows |

## 15. Cross-Cutting Development Hours

These hours are excluded from module rows to avoid double counting.

| Cross-cutting work | Low | Expected | High |
|---|---:|---:|---:|
| Core architecture and domain discovery | 500 | 800 | 1,200 |
| Shared design system/UI infrastructure | 350 | 550 | 850 |
| Database and migration architecture | 650 | 950 | 1,400 |
| Auth, authorization and tenancy foundation | 500 | 800 | 1,200 |
| Test infrastructure/fixtures/E2E harness | 400 | 650 | 1,000 |
| Security hardening and abuse controls | 300 | 500 | 800 |
| Background-job/outbox infrastructure | 300 | 500 | 800 |
| Storage/PDF common infrastructure | 250 | 400 | 650 |
| Observability/error handling | 250 | 400 | 650 |
| Performance optimization | 300 | 500 | 800 |
| Build/deployment/environment setup | 200 | 350 | 550 |
| Cross-module QA/regression | 550 | 900 | 1,400 |
| Refactoring/rework/compatibility | 800 | 1,300 | 2,100 |
| Production hardening/acceptance | 450 | 800 | 1,300 |
| **Cross-cutting subtotal** | **5,800** | **9,400** | **14,700** |

The central expected component model is **39,950 hours**; modelling uncertainty produces the 34k–44k realistic range. The component low and high totals are 24,650 and 60,100 hours. Conservative commercial hours add product management, design iteration, coordination, acceptance and contingency rather than merely selecting every row maximum.

## 16. Total Rebuild Estimate

| Scenario | Hours | Assumptions |
|---|---:|---|
| Optimistic professional | 22,000–28,000 | requirements known, senior team, strong reuse, little architectural error |
| **Realistic professional** | **34,000–44,000** | discovery, normal iteration, bugs, integration failures, testing and hardening |
| Conservative commercial | 50,000–65,000 | agency governance, PM/design/QA, revisions, acceptance and contingency |

This estimate recreates functional behavior, architecture and safety characteristics from a specification. It does not multiply LOC by typing speed, and it does not assert historical time spent.

## 17. Developer-Year Estimate

At 1,800 productive engineering hours/year: optimistic **12.2–15.6**, realistic **18.9–24.4**, conservative **27.8–36.1 developer-years**.

## 18. Team/Calendar Estimate

Practical realistic-build durations account for coordination and specialist bottlenecks:

| Team | Approximate calendar duration | Effective parallelism |
|---|---:|---|
| 1 exceptional generalist | 20–26 years | 1.0×; skill breadth is a material constraint |
| 2 developers | 11–15 years | ~1.7× |
| 3 developers | 8–10 years | ~2.4× |
| 5-person product team | 5.5–7 years | ~3.5× |
| 8-person cross-functional team | 4–5.5 years | ~4.8–5.2× |

A focused team could shorten calendar time by reducing scope or accepting lower historical compatibility/quality; a perfect division of hours by headcount is not credible for this coupled platform.

## 19. Replacement Cost Matrix

All values are **NZD millions** and represent range × rate.

### Individual/contractor rates

| Rate | Optimistic 22–28k | Realistic 34–44k | Conservative 50–65k |
|---:|---:|---:|---:|
| NZ$75/h | $1.65–2.10m | $2.55–3.30m | $3.75–4.88m |
| NZ$100/h | $2.20–2.80m | $3.40–4.40m | $5.00–6.50m |
| NZ$125/h | $2.75–3.50m | $4.25–5.50m | $6.25–8.13m |
| NZ$150/h | $3.30–4.20m | $5.10–6.60m | $7.50–9.75m |
| NZ$175/h | $3.85–4.90m | $5.95–7.70m | $8.75–11.38m |
| NZ$200/h | $4.40–5.60m | $6.80–8.80m | $10.00–13.00m |

### Professional software-company blended rates

| Rate | Optimistic | Realistic | Conservative |
|---:|---:|---:|---:|
| NZ$150/h | $3.30–4.20m | $5.10–6.60m | $7.50–9.75m |
| NZ$180/h | $3.96–5.04m | $6.12–7.92m | $9.00–11.70m |
| NZ$200/h | $4.40–5.60m | $6.80–8.80m | $10.00–13.00m |
| NZ$225/h | $4.95–6.30m | $7.65–9.90m | $11.25–14.63m |
| NZ$250/h | $5.50–7.00m | $8.50–11.00m | $12.50–16.25m |

Indicative models: **solo senior contractor** NZ$3.4m–$6.6m at $100–$150/h but with impractical duration; **small specialist team** NZ$5.1m–$8.8m; **professional agency** NZ$6.1m–$11.0m; **enterprise-grade rebuild** NZ$10.0m–$16.25m. These are replacement-cost models, not quotations or company valuations.

## 20. AI-Assisted Development Adjustment

AI can dramatically compress boilerplate, repetitive migrations/tests, component scaffolding, repository search, draft refactors and debugging hypotheses. The repository’s very high output over a short Git period and numerous characterization/migration contracts are consistent with intensive AI-assisted iteration.

AI does not eliminate product decisions, construction-domain definitions, financial verification, architecture, edge-case discovery, provider troubleshooting, review of generated SQL, UI acceptance, production diagnosis or responsibility for tenant isolation. It may also increase review/rework when it produces large files or parallel compatibility layers.

**INFERRED, lower confidence:** a capable founder/operator using intensive agentic AI could plausibly have invested **1,500–3,500 personally elapsed hours** to direct, review, test and iterate this working tree, potentially with AI tasks running in parallel. That is not evidenced time tracking and should not be read as hours actually worked. Relative to 34k–44k traditional-equivalent hours, the implied compression is approximately **10×–25×**, with the widest uncertainty in how much generated work was manually validated and how many collaborators contributed.

## 21. Git History / Development Activity

**CONFIRMED:** Git contains 94 commits from `9665e7c` (“Initial commit”, 10 March 2026 17:12 NZDT) to `b0dee25` (“fix: inherit retention GST from origin evidence”, 2 August 2026 17:04 NZST). There are 43 distinct commit dates and 12 distinct ISO commit weeks across roughly 146 elapsed days. Monthly commits: March 18, April 45, May 29, July 1, August 1. Historical numstat totals are 586,089 additions, 67,942 deletions and 2,539 file-change records.

Major bursts include 31 March UI, April takeoff/claims/retention/project conversion, 14 May’s nine-step task backend/service migration, late-May spreadsheet AI, the 27 July full-platform commit (293,960 additions), and August retention GST. The current working tree extends beyond HEAD with **128 modified tracked files and 735 untracked files**; therefore Git statistics substantially underrepresent the audited August working state.

**Minimum evidenced active days:** 43 commit dates. **Development-period duration:** about 4.8 months from first to latest commit, while dated migrations span 28 February–16 August. History strongly supports intensive ongoing development but cannot establish continuous sessions or exact hours. Commit timestamps and migration filenames are evidence of sequence, not time sheets.

## 22. Rework & Architectural Evolution

**Rating: Very Significant.** Evidence includes additions/deletions; hundreds of corrective/hardening migrations; parallel old/new commercial structures; repeated claim recalculation/backfill; quote/variation/PO lineage repairs; task migration to a shared RPC service; staged opportunity shadow/pilot/default promotion; legacy retention cases; Xero legacy adoption/voided replacement/reconnect recovery; removal of automatic rolling retention creation; material read/write cutovers; and multiple compatibility readers.

Current LOC omits deleted approaches, investigation and production diagnosis. Conversely, historical churn is not automatically productive value; some large files and duplicate-suffixed copies indicate technical debt. The replacement estimate includes necessary iteration but does not price every historical misstep one-for-one.

## 23. Top 20 Most Expensive Systems

| Rank | System | Expected hours | Complexity | Why expensive |
|---:|---|---:|---|---|
| 1 | Immutable accounting + Xero | 2,450 | Exceptional | external money effects, identity, retries, reconciliation |
| 2 | Universal Construction Learning | 2,050 | Exceptional | builders, trust boundaries, queues, provenance |
| 3 | Retention | 2,350 | Exceptional | specialist law/commercial math and legacy evidence |
| 4 | Pricing workbook | 1,700 | Exceptional | spreadsheet UX/formulas/AI/persistence |
| 5 | Supplier invoices | 1,850 | Exceptional | extraction, approvals, allocations, tax, Xero |
| 6 | Materials/supplier pricing | 1,650 | Exceptional | identity, units, tax, temporal price lineage |
| 7 | Takeoff/PDF geometry | 1,450 | Exceptional | coordinate transforms and rendering |
| 8 | Memory/pools/synthesis | 1,250 | Exceptional | lifecycle, confidence, evidence aggregation |
| 9 | Payment claims | 1,350 | Exceptional | snapshots, invoicing and payment state |
| 10 | Scope/spec/trade packs | 1,350 | Very High | document AI and workspace continuity |
| 11 | Purchase orders/procurement | 1,250 | Very High | commitments and serialized approvals |
| 12 | Commercial item/CostItem kernel | 1,150 | Very High | canonical cross-document semantics |
| 13 | Opportunity promotion/conversion | 1,050 | Very High | atomic state and old/new compatibility |
| 14 | Document workspace/storage | 1,050 | Exceptional | immutable versions, TUS, cleanup/reconciliation |
| 15 | Tasks/timesheets/QA | 1,700 | High | several evidence-rich shared workflows |
| 16 | AI worksheet assistant | 900 | Very High | safe edit planning and provider contracts |
| 17 | Variations | 850 | Very High | revisions, lineage and claim coupling |
| 18 | Quotes | 750 | High | financial totals/publishing/lineage |
| 19 | PDF/Excel exports | 750 | High | financial and geometric fidelity |
| 20 | Tenant permissions/RLS foundation | 800 | Very High | every data path depends on correctness |

Hours overlap only where a ranked “system” is a subcomponent of the broader module inventory; this ranking is prioritization, not an additional total.

## 24. Current Source vs Historical Engineering Investment

**Current source implementation complexity** is the difficulty of understanding, changing and operating the roughly 570k meaningful physical lines, 251-table schema, routes and test suite now present. It is high because central services and SQL encode dense invariants and coupling.

**Historical engineering investment** includes requirements discovery, abandoned designs, deleted code, staged migrations, repairs, debugging, compatibility and production hardening required to arrive here. The 67,942 committed deletions and migration sequence prove meaningful churn, while the current working tree adds uncommitted evolution. Historical investment is therefore greater than a clean-room transcription of current code, but exact historical hours are unknowable without time records.

## 25. What LOC Alone Would Miss

A screen/LOC audit would miss that a short provider worker can create a duplicate Xero invoice; that hash and lifecycle constraints protect immutable evidence; that payment cents are deterministically attributed; that opportunity conversion preserves workspace and commercial lineage; that RLS and composite tenant keys protect every child table; that document deletion is asynchronous and reconciled against object storage; that takeoff coordinates must survive PDF transforms; that material prices carry supplier-product, unit and tax provenance; and that UCL can only advance cursors after validated, attributable actions.

It would also overvalue generated types/keyword corpora and large UI files while undervaluing small state-decision, identity and reconciliation services. Visible safety routes illustrate the opposite issue: many screens exist, but their subpages are currently placeholders and should not be priced like a finished H&S product.

## 26. Software Maturity Assessment

**Feature breadth:** Complex vertical SaaS platform.

**Production maturity:** Early-to-maturing production SaaS architecture.

The product exceeds an MVP in breadth and backend sophistication. Mature traits include financial immutability, RLS, durable queues, recovery paths, provider reconciliation, hot-path indexes and characterization tests. Constraints on a “mature production” label include placeholder modules, very large components/services, substantial compatibility/rework surface, duplicate working files, a 735-file untracked state, unverified test/CI status and no runtime/production telemetry inspected.

## 27. Final Executive Assessment

1. **How large?** About 2,000 first-party files and 570k adjusted physical source lines, with 95 pages, 107 route files, 444 migrations and a 251-table current public schema.
2. **How complex?** Exceptional (92/100), driven by domain risk and coupling rather than size alone.
3. **What product?** A construction commercial operating and intelligence platform spanning preconstruction, project delivery, procurement, claims/accounting, documents and AI learning.
4. **Most sophisticated systems?** Immutable/Xero accounting, retention, pricing worksheets, supplier invoices, takeoff, materials pricing, document storage and UCL/memory.
5. **Rebuild effort?** Optimistic 22k–28k; realistic 34k–44k; conservative commercial 50k–65k hours.
6. **Realistic replacement cost?** Primarily NZ$5.1m–NZ$8.8m at NZ$150–$200/hour.
7. **Developer-years?** Realistically 18.9–24.4 productive developer-years.
8. **Could one conventional developer build it?** Technically possible only over roughly two decades at the audited scope and quality, with serious specialist-risk concentration; not a credible normal commercial delivery model.
9. **AI compression?** Material—possibly 10×–25× in personally elapsed founder/operator effort—but not a substitute for domain decisions and validation; confidence is low on this sub-estimate.
10. **Confidence?** **Medium-high for repository size/architecture; medium for rebuild hours/cost; low-to-medium for founder hours.** Static code and generated schema strongly support breadth/complexity, while working-tree churn, unexecuted tests, absent time records and unknown production usage constrain certainty.

## 28. Methodology & Confidence

The audit enumerated source/config/docs, classified extensions/tests/generated content, measured lines, inventoried App Router routes, parsed generated Supabase type sections, scanned migration DDL, reviewed architecture docs and representative security/financial/queue/storage code, mapped directory/service/entity relationships, and analyzed Git commits/dates/numstat. Estimates use bottom-up module and cross-cutting ranges, then scenario-level coordination/rework/contingency adjustments.

No LOC-to-hours multiplier was used. Low estimates assume unusually effective seniors and clear requirements; expected estimates include ordinary discovery/debugging/testing; conservative estimates include commercial delivery overhead and contingency. Cost is hours × stated rate.

## 29. Audit Limitations

- Static code proves implementation intent, not that every path is deployed, reachable or correct in production.
- No database was rebuilt, so policy/index/trigger historical counts are migration-create counts; current table/function/view counts come from generated types.
- Tests, lint, builds and E2E were not run to honor the audit-only/no-artifact instruction.
- The working tree was heavily dirty before the audit. Current metrics intentionally include first-party untracked work, but Git history cannot describe it.
- Generated types may lag the newest uncommitted migrations; thus current schema counts are a reliable generated snapshot, not guaranteed 17-August live production truth.
- No product specification, time tracking, production telemetry, user counts, defect history, design files or cloud configuration was audited.
- Hours and prices are professional estimates, not facts, quotations, valuation advice or a claim about historical spend.
