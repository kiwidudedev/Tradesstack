# TradesStack Master Baseline

## Phase 0A — Product Preservation Baseline

Status: **Phase 0A Product Preservation Baseline / Candidate**

This document records the complete current TradesStack product that must be preserved while the platform is later made reproducible and structurally suitable for dedicated client applications.

It does **not** establish database reproducibility, a final migration authority, a schema version, a storage manifest, or Master Baseline 1. Those belong to later Phase 0 passes, beginning with Phase 0B.

## Preservation rule

The initial TradesStack Master platform must preserve the complete functional behaviour and module coverage of the approved current TradesStack baseline. Phase 0 and subsequent Master extraction work must not remove, redesign, disable, consolidate or materially alter existing product functionality unless that change is separately approved, implemented and validated as an intentional product change.

Architectural extraction must preserve behaviour before improving architecture.

Legacy, duplicate and transitional implementations are preserved when their active status cannot be disproven. “Legacy” does not mean removable.

## Current source baseline

The repository baseline is currently composed of more than Git HEAD alone:

```text
Committed application source
+ package-lock.json and runtime configuration
+ committed migrations and generated database types
+ pre-existing tracked working-tree changes
+ untracked migrations and reconciliation material
+ external Supabase/Auth/Storage state
+ external environment and deployment configuration
```

The protected Git reference captured for this pass is:

```text
Branch: main
HEAD: 361bf3f094a8abbb58d20606413686cebc242e66
Commit: 361bf3f docs: add maintained TradesStack AI architecture context
```

The approved product source is therefore a **candidate baseline**, not yet a clean reproducible release. Existing worktree content is preserved and separately classified below.

## Product preservation inventory

### A — Approved Master product source

The current application includes these active or materially implemented product areas:

- Authentication, registration, invitations and join flow
- Organizations, members, roles, permissions and organization settings
- Clients, contacts, locations, notes and CRM history
- Leads and tender opportunities
- Opportunity lifecycle, award and conversion/promotion paths
- Pricing worksheets, formulas, commercial mapping and AI worksheet assistance
- Scope builder, specification/finish analysis and trade packs
- Drawings, drawing sets, PDF viewing, page preparation and takeoff
- Measurements, calibration, normalized geometry and commercial publication
- Quotes, quote revisions and commercial items
- Commercial lineage and provenance
- Projects, project members, dashboards and project aliases
- Purchase orders, commitments, assignments and supplier relationships
- Variations and variation pricing/publication
- Supplier invoices, capture, extraction, matching, allocation and approval
- Payment claims and retention
- QA templates, project definitions, runs, evidence, hold points and signatures
- Legacy quality inspections, issues, defects, photos, work proof and sign-offs where still active
- Tasks, todos, comments, attachments and activity
- Files, document workspaces, nodes, immutable versions and uploads
- Photos, signatures, drawings and evidence storage
- Materials, supplier products, imports, pricing and tax evidence
- Cost items, cost codes, accounting mappings and actual costs
- Accounting documents, revisions, events and reconciliation
- Xero OAuth, contacts, bills, sales invoices and status/payment sync
- OpenAI and Anthropic AI workflows
- Organization memory and Universal Construction Learning
- Notifications, invite email and reminder processing
- Cron routes, queues, cleanup and retry/dead-letter processing
- Supabase Edge Functions, including mobile/time-sheet functionality
- Site-safety routes and current placeholder surfaces
- Settings, integrations, branding, dashboards and reporting

Primary implementation areas are documented in `docs/architecture/TRADESSTACK_AI_CONTEXT.md`, with application code under `app/`, `components/`, `hooks/`, `lib/`, `supabase/`, `scripts/` and `tests/`.

### B — Active transitional product areas

These remain part of the preserved product until later work proves a safe canonical replacement:

- New QA engine alongside older `project_quality_*` quality paths
- Shared Files/document workspace alongside drawing, QA and domain-specific registries
- Opportunity promotion alongside legacy two-project conversion
- Opportunity and project quote compatibility paths
- Current commercial-item lineage alongside older commercial representations
- Current accounting/revision paths alongside historical Xero workflows
- Current and legacy materials/supplier-price compatibility paths
- Mobile/active schema work alongside older time-sheet and assignment assumptions

No transitional path is removed or disabled by Phase 0A.

### C — Supporting infrastructure

- Next.js App Router layouts and route groups
- Supabase browser/server/middleware clients
- Auth/session handling in `proxy.ts` and `lib/supabase/*`
- Organization membership and permission helpers
- RLS, SECURITY DEFINER functions, grants and storage policies
- Supabase Storage buckets and signed URL flows
- Server actions and API route handlers
- PDF, Excel, image and resumable-upload infrastructure
- Vercel cron configuration
- Supabase Edge Functions
- Service-role server/worker paths
- Environment-variable handling and deployment configuration

### D — Development and validation infrastructure

- Vitest, React Testing Library and route-handler tests
- Playwright E2E tests and fixtures
- SQL/deployment/security tests
- Reconciliation and audit scripts
- Material, supplier invoice, opportunity lifecycle and accounting validation scripts
- Architecture, deployment, database, security, intelligence and operations documentation

### E — Generated contract

- `lib/supabase/types.ts`
- Existing generated or runtime-derived route/type output
- Any generated validation artifact that is later proven to be part of the release contract

Generated authority is intentionally deferred to Phase 0F.

### F — Local, reconciliation or release-candidate material

The following are preserved but are not automatically approved as Master product source:

- Reconciliation SQL with customer/project-specific UUIDs
- Development-only material fixture cleanup migration
- Reconciliation JSON/Markdown artifacts under `artifacts/`
- `.dsh-drop/` and other local runtime artifacts
- Empty/duplicate generated type file `lib/supabase/types 2.ts`

### G — Unknown — preserve

Any file whose status is not proven remains in the workspace. Phase 0A does not delete, rename, clean or reclassify it destructively.

## Route and entry-point preservation map

### Public and Auth

- `/`
- `/marketing`
- `/early-access`
- `/contact-us`
- `/privacy-policy`
- `/terms-of-service`
- `/login`
- `/register`
- `/join`

### Workspace and company

- `/app/dashboard`
- `/app/leads-clients/clients/*`
- `/app/leads-clients/opportunities/*`
- `/app/projects/*`
- `/app/company/*`
- `/app/settings/*`
- `/app/internal/*`
- `/app/site-safety/*`

### Editors

- Opportunity and project takeoff measure editors under `(editor)` routes
- Pricing worksheet and commercial editing surfaces
- Files, QA, variation, purchase-order, claim and invoice workspaces

### API families

- `/api/ai/*`
- `/api/chat/*`
- `/api/change-detection/*`
- `/api/commercial-items/*`
- `/api/documents/*`
- `/api/integrations/xero/*`
- `/api/internal/*`
- `/api/leads-clients/opportunities/*`
- `/api/materials/*`
- `/api/payment-claims/*`
- `/api/pricing-worksheets/*`
- `/api/projects/*`
- `/api/scope-builder/*`
- `/api/spec-finishes*`
- `/api/supplier-invoices/*`
- `/api/takeoff/*`
- `/api/trade-pack/*`
- `/api/cron/*`

### Cron and Edge Function entry points

Vercel cron routes are declared in `vercel.json` for Xero, supplier-bill learning, worksheet classification, invoice status refresh, document cleanup, QA evidence cleanup and material supplier pricing.

Supabase Edge Function entry points currently include:

- `supabase/functions/mobile_app_bootstrap/index.ts`
- `supabase/functions/mobile_clock_in_v2/index.ts`
- `supabase/functions/mobile_clock_out_v2/index.ts`
- `supabase/functions/send-invite-email/index.ts`
- `supabase/functions/time-sheets-rules/index.ts`

## Runtime and external dependencies

The application uses Next.js 16, React 19, TypeScript, Supabase SSR/JS, PostgreSQL, Supabase Auth, Storage, OpenAI, Anthropic, Xero, Resend, PDF.js, pdf-lib, Sharp, ExcelJS and TUS uploads.

The runtime requires environment configuration for Supabase and server/admin paths. OpenAI, Anthropic, Xero, Resend, cron and worker variables support specific modules and are not evidence that those modules may be removed from the product baseline.

Background processing is controlled by explicit environment allowlists. A disabled worker is still preserved functionality and must not be mistaken for a retired module.

## Database and storage dependency

The application depends on a database business-logic layer containing tables, RLS, policies, grants, functions, RPCs, triggers, queues, snapshots, revisions and audit records. Major database-backed domains include identity/tenancy, CRM, opportunities, projects, takeoff, pricing, commercial items, procurement, variations, claims, retention, accounting, QA, documents, materials, integrations and intelligence.

Storage is private or signed-access by design across document, drawing, QA, supplier invoice, material, task, variation and logo paths. Storage semantics are part of the preserved product.

Database authority remains unresolved and is explicitly deferred to **Phase 0B**. This document does not approve any migration, generated type, storage manifest or external database state as authoritative.

## Pre-existing tracked modifications

These were present before Phase 0A and are not changed by this pass:

| File | Classification | Runtime impact | Treatment |
|---|---|---:|---|
| `components/app/PricingWorksheetCommercialMappingDrawer.tsx` | B — pending active product work | Yes | Preserve; validate separately before release |
| `components/app/PricingWorksheetCommercialMappingDrawer.test.tsx` | B — pending active product work | Test | Preserve with related UI work |
| `components/app/WorksheetCommercialLineConfirmationEditor.tsx` | B — pending active product work | Yes | Preserve; do not complete or revert in 0A |
| `components/app/WorksheetCommercialLineConfirmationEditor.test.tsx` | B — pending active product work | Test | Preserve with related UI work |
| `components/app/WorksheetPublishToPurchaseOrderDialog.test.tsx` | B — pending active product work | Test | Preserve; validate separately |
| `lib/commercial-items-security-catalog.test.ts` | B — pending validation work | Test/database contract | Preserve; requires isolated DB validation |
| `next-env.d.ts` | D/F — generated/runtime contract candidate | Build/type behavior | Preserve; resolve during later type/build validation |

The worksheet changes alter presentation and tests, including removal/repositioning of line labels and formatting of floating-point quantities. They are not assumed to be complete or approved for the Master release.

## Architecture-relevant untracked files

| File or group | Classification | Master relevance | Treatment |
|---|---|---|---|
| `supabase/migrations/20260810190000_cleanup_phase1_material_test_fixtures.sql` | C — database reconciliation input | High, but destructive/data-specific | Do not apply or commit automatically; Phase 0B must decide whether it belongs outside the Core migration history |
| `supabase/migrations/20260913170000_fix_commercial_item_takeoff_reference_read_permission.sql` | C — forward schema/security candidate | High | Reconcile against app source, types and applied ledger in Phase 0B |
| `supabase/migrations/20260913180000_align_supplier_invoice_accounting_resolution_status.sql` | C — forward schema candidate | High | Reconcile against application status writers, tests and applied ledger in Phase 0B |
| `lib/supplier-invoice-accounting-status-migration.test.ts` | E/B — validation for untracked migration | Medium/high | Preserve; validate only after migration authority is resolved |
| `lib/supabase/types 2.ts` | D/F — duplicate/empty generated candidate | Unknown | Preserve; do not use as canonical or delete in 0A |
| `scripts/reconciliation/*.sql` currently untracked | C — customer/data reconciliation input | High for database investigation, not product source | Do not execute against production or convert to migrations in 0A |
| `artifacts/materials/*` and `artifacts/files-upload-modal-implementation/*` | F — validation/design artifacts | Evidence only unless separately approved | Preserve; do not treat as runtime source |
| `.dsh-drop/` | F — local/runtime candidate | Unknown | Preserve; no cleanup in 0A |

## Untracked migration analysis

### `20260810190000_cleanup_phase1_material_test_fixtures.sql`

This is explicitly labelled development-only cleanup. It contains an exact UUID allowlist, locks material-related tables, disables and restores an append-only trigger, deletes fixture graph records, validates protected records and commits data deletion when guards pass. It is not a schema-only migration and depends on a particular populated database state.

Classification: **C — database reconciliation input**, not approved Master product source. Phase 0B must determine whether it was already applied, must remain excluded, or requires a separately approved data-operation process.

### `20260913170000_fix_commercial_item_takeoff_reference_read_permission.sql`

This grants authenticated `SELECT` on `commercial_items.source_takeoff_measurement_id` while intentionally keeping `locked_metadata_json` private. It directly corresponds to the application reload path described in the file comments.

Classification: **C — forward schema/security candidate**. It may be required for current intended behavior, but its migration status, generated-type relationship and production applicability are unresolved.

### `20260913180000_align_supplier_invoice_accounting_resolution_status.sql`

This replaces the supplier-invoice allocation status check constraint with an expanded set of historical and current accounting outcomes. The untracked test file directly exercises the migration and application status derivation.

Classification: **C — forward schema candidate plus E validation infrastructure**. It appears tied to active application work, but must not be included in a baseline release until Phase 0B establishes migration authority.

## Reconciliation SQL classification

The untracked reconciliation scripts contain customer/project-specific UUIDs and guarded, sometimes mutating, SQL for award pricing and opportunity/project history. They are not generic Master schema. They are database reconciliation inputs for Phase 0B or a later approved data operation.

The scripts are not executed, converted into migrations, or treated as current product behavior by Phase 0A.

## Generated types relationship

`lib/supabase/types.ts` is the tracked generated database contract used by application code. `lib/supabase/types 2.ts` is untracked, zero-byte and different from the canonical file. It is classified as an empty/duplicate generated candidate and is not authoritative.

No types were regenerated or replaced during Phase 0A. Generated-type authority is deferred to Phase 0F.

## HEAD versus working tree versus external state

### HEAD-only product state

HEAD is the committed application and migration baseline at `361bf3f`. It does not include the pre-existing tracked edits or untracked files listed above.

### Working-tree product state

The working tree contains active worksheet changes, validation changes, untracked migration candidates, reconciliation inputs, generated candidates and artifacts. These remain preserved but are not all approved for Master release.

### External/database-dependent state

Supabase Auth, PostgreSQL, Storage, migration ledger, managed roles, hosted configuration, secrets, cron deployment and external provider settings are outside Git. Their correspondence to HEAD is not established by 0A.

## Phase 0A status

This document establishes the **Phase 0A Product Preservation Baseline**:

- the complete current product is explicitly preserved;
- current/legacy/transitional paths remain in scope;
- pre-existing work is classified rather than discarded;
- database and generated-contract authority are explicitly deferred;
- no Core/client architecture is introduced.

It deliberately does not claim **Master Baseline 1** or reproducibility.

## What must not change during Master conversion

Until separately approved and validated, Master work must not remove or materially change current routes, modules, UI, branding, permissions, roles, business logic, database behavior, storage semantics, Auth semantics, integrations, AI, QA, commercial workflows, takeoff, pricing worksheets, quotes, opportunities, projects, purchase orders, variations, supplier invoices, claims, retention, documents, accounting, Xero, notifications, workers, cron or Edge Functions.

## Next pass

Phase 0B must resolve:

1. committed versus untracked migration authority;
2. the development-only cleanup migration and its application status;
3. the two untracked forward migrations;
4. reconciliation SQL ownership and production applicability;
5. generated types versus migration/schema state;
6. the missing seed/reference-data contract;
7. the exact fresh database replay baseline.
