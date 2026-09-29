# TradesStack Phase 1I — Domain Public Contract Pilot Audit

Status: **PASS 1I COMPLETE — SUPPLIER PILOT SELECTED**

This is a read-only audit. It records current implementation evidence and a narrowly scoped Phase 1J characterization target. It does not authorize package extraction, application refactoring, database changes, migration changes, or integration changes.

## A. Pass 1I verdict

**PASS 1I COMPLETE — SUPPLIER PILOT SELECTED**

The first domain public-contract pilot should be Supplier, specifically the existing provider-neutral supplier identity/write-validation family. Phase 1J must characterize that family before any extraction:

- `SupplierWriteInput`
- `ValidatedSupplierWriteInput`
- `SupplierValidationField`
- `SupplierValidationErrors`
- `SupplierPaymentTermsType`
- `SUPPLIER_PAYMENT_TERMS_TYPES`
- the pure validation/normalization behavior in `lib/supplier-validation.ts`

The current `OrganizationSupplierRow` and all persistence, authorization, server-action, PO, invoice, Xero and UI types remain application-owned. The exact package contract is therefore not the generated database row.

Materials and CRM were audited and remain deferred for this first pilot. Materials is a broad, supplier- and commercial-coupled subsystem. CRM is a broad identity/workflow surface coupled to opportunity, project, quote, notes/files, visibility filtering and Xero contacts.

## B. Source state

Captured before the audit:

```text
branch: main
HEAD: 361bf3f094a8abbb58d20606413686cebc242e66
commit: 361bf3f docs: add maintained TradesStack AI architecture context
worktree: dirty
```

The worktree already contained tracked application/config/test edits, untracked architecture/package files, artifacts, scripts, and migrations. No pre-existing work was reset, cleaned, restored, stashed, overwritten, or deleted.

## C. Phase 1H authority

`TRADESSTACK_PROVENANCE_REFERENCE_BOUNDARY.md` remains authoritative: no generic Core identity, reference, provenance, lineage, snapshot, or provider-reference contract was introduced. Supplier identity and supplier-to-provider mappings remain Supplier/integration-owned. This phase does not change `@tradesstack/core-contracts`.

## D. Product preservation

No application, package, database, migration, Supabase, Storage, Auth, permission, RLS, worker, integration, UI, configuration, or generated-type file was changed by this phase. Xero, OpenAI/AI, Resend, workers, cron, Edge Functions, Materials, CRM, commercial lineage, opportunity/project lifecycle, claims, retention, QA and Files remain required product capabilities.

## E. Domain public contract definition

A domain public contract is the supported, implementation-independent interface through which another application or domain uses a domain concept. It is not automatically a database row, generated Supabase type, React prop, server-action payload, or generic Core contract.

The Phase 1I target is the upper boundary only:

```text
public supplier types + pure validation
                 ↓
        existing supplier implementation
                 ↓
 database / server actions / UI / integrations
```

## F. Target package model

If Phase 1J passes, the narrow package is expected to contain only provider-neutral Supplier public types, constants, validators and pure normalization/helpers justified by characterization. It must not become a copied Supplier application.

Expected non-responsibilities: Supabase clients, generated database types, RLS, organization membership, permission checks, server actions, route handlers, React components/pages, Storage, signed URLs, PO/invoice persistence, Xero clients, provider credentials, AI clients, workers, cron, deployment configuration and environment access.

## G. Materials audit

### G1. Feature map and source paths

Materials currently includes an organization catalogue, active/archive lifecycle, organization cost-code linkage, supplier products, supplier-specific prices, price history/current/preferred semantics, unit conversion, tax evidence and normalization, import batches/rows, CSV/spreadsheet/PDF/image extraction, AI/provider interpretation, search, material picker and price review, worksheet consumption, commercial quote/variation/PO consumption, takeoff publication, supplier invoice/cost observations, and background retention/pricing jobs.

Authoritative implementation paths include:

- `lib/materials/types.ts`
- `lib/materials/validation.ts`
- `lib/materials/service.ts`
- `lib/materials/queries.ts`
- `lib/materials/normalization.ts`
- `lib/materials/effective-price.ts`
- `lib/materials/estimating-price.ts`
- `lib/materials/atomic-rpc.ts`
- `lib/materials/import-service.ts`, `import-processing.ts`, `import-job-service.ts`
- `lib/materials/supplier-product-match.ts`
- `lib/materials/unit-conversion/*`
- `lib/materials/supplier-pricing-intelligence/*`
- `lib/materials/quote-supplier-pricing.ts`, `variation-supplier-pricing.ts`, `purchase-order-supplier-pricing.ts`
- `app/app/(workspace)/company/materials/*`
- `app/api/materials/*`
- `app/api/pricing-worksheets/materials/route.ts`
- `components/app/PricingWorksheetMaterialLibraryDrawer.tsx`
- `components/app/SharedSupplierPricingBrowser.tsx`

### G2. Database, tenancy and semantics

The catalogue authority is `organization_materials`, created by `20260615103000_add_material_library_v1.sql`. It is organization-owned, unique by `(organization_id, normalized_name)`, active/archive-capable, and has a required nonblank `default_unit`. It links optionally to organization cost codes.

Material imports are separate organization-owned batches/rows. Supplier prices are not intrinsic material values: `organization_material_supplier_prices` has `material_id`, `supplier_id`, unit, unit cost, currency, source, effective window, current/preferred flags and historical supersession behavior. Later migrations add `organization_material_supplier_products`, unit conversions, lifecycle events, tax evidence and organization-scoped composite integrity.

RLS and permissions are material-specific (`materials.view` / `materials.write`) and import storage is private. Material data is therefore not security-neutral merely because some normalization functions are pure.

### G3. Current types and public candidates

`lib/materials/types.ts` is predominantly persistence/integration-shaped: `OrganizationMaterialRow`, supplier-price/product rows, import rows and `MaterialListSummary` alias generated DB/JSON shapes. `MaterialDraftInput` and related review inputs in `lib/materials/validation.ts` are transport/application inputs, not yet proven public contracts. Pure normalization exists, but its output and helpers depend on DB-shaped material summaries and comparable supplier pricing.

The strongest apparent candidates are `MaterialDraftInput` plus `validateMaterialDraft`, and selected unit-conversion contracts. They are not yet safe as the first pilot because their consumers and validation semantics sit inside a larger supplier/product/tax/import/commercial graph.

### G4. Consumers and coupling

Pricing worksheets consume material identity, supplier product identity, supplier price snapshots, units, tax basis and provenance. Takeoff publishes quantities into commercial destinations rather than directly owning catalogue material semantics. Quotes, variations and POs consume supplier pricing through commercial adapters. Imports use Storage, AI/provider interpretation, workers and review persistence. The package boundary would need to preserve price history, tax evidence, supplier-product identity and commercial lineage.

### G5. Materials risk

| Dimension | Classification | Evidence |
|---|---|---|
| stability | MEDIUM | Catalogue identity is clear, but price/product/tax meanings are layered |
| DB coupling | HIGH | Multiple tables, RPCs, generated rows and historical constraints |
| security | MEDIUM | organization ownership and `materials.*` permissions; private import storage |
| UI coupling | MEDIUM | company library, import review, worksheet picker and price review |
| integration | HIGH | AI/provider extraction, imports, tax evidence, workers and commercial consumers |
| cross-domain | HIGH | Supplier, pricing, commercial, PO, variation, takeoff and invoice links |
| testability | MEDIUM | strong pure tests, but service tests require realistic Supabase chains |
| client value | HIGH | useful eventually, but only after semantic subcontracts are characterized |
| portability | NO — DOMAIN BOUNDARY NOT READY | current public-looking types remain DB/provider/application coupled |

## H. Supplier audit

### H1. Feature map and source paths

Supplier currently includes organization supplier identity and contact/address/payment data, duplicate detection, active state, procurement readiness, supplier-product relationships through Materials, PO relationships, supplier invoice matching/allocation, accounting and Xero contact mapping, search/picker surfaces, imports and supplier pricing.

Authoritative paths include:

- `lib/supplier-validation.ts`
- `lib/suppliers.ts`
- `lib/supplier-service.ts`
- `lib/supplier-service.test.ts`
- `lib/supplier-validation.test.ts`
- `lib/supplier-browser-write-regression.test.ts`
- `app/app/(workspace)/company/suppliers/page.tsx`
- `app/app/(workspace)/company/suppliers/actions.ts`
- `components/app/AddSupplierDialog.tsx`
- `components/app/SupplierPicker.tsx`
- `components/app/OrganizationSupplierPricingDrawer.tsx`
- `lib/purchase-orders/types.ts`, `lib/purchase-orders/service.ts`
- `lib/supplier-invoices.ts` and supplier-invoice allocation/workflow services
- `lib/xero/contacts.ts`, `lib/xero/client-contacts.ts`, `lib/xero/sync.ts`

### H2. Database authority, tenancy and identity

The persistence authority is `organization_suppliers`, created by `20260323195500_add_suppliers_and_po_issued_to.sql` and extended by later supplier-master migrations. It is an organization-owned UUID row with `name`, legacy/company and contact fields, structured address fields, tax/registration fields, currency/payment terms, active state, source and timestamps. It is not a CRM contact and does not derive its identity from Xero, a PO, an invoice, a project or a Material.

RLS is organization membership/administrator governed. Supplier writes are additionally gated in `app/app/(workspace)/company/suppliers/actions.ts` by `suppliers.write`; Xero contact management uses `accounting.contacts.manage`. POs reference `supplier_id` but retain supplier name/contact snapshots. Supplier invoices and accounting records have their own permission, snapshot and lineage boundaries.

Materials reference Supplier through supplier products/prices and import batches. That does not make Supplier-owned identity depend on Materials. The direction is Supplier identity → Material supplier product/price relationship; procurement and invoice domains own their downstream records and snapshots.

### H3. Current types

`OrganizationSupplierRow` in `lib/supplier-validation.ts` and `lib/suppliers.ts` is a generated persistence alias and is internal to the current application boundary. `SupplierWriteInput`, `ValidatedSupplierWriteInput`, `SupplierValidationField`, `SupplierValidationErrors`, `SupplierPaymentTermsType` and `SUPPLIER_PAYMENT_TERMS_TYPES` are application/domain-shaped candidates. `SupplierDuplicateWarning` and `SupplierReadinessAssessment` are application/readiness projections and require separate characterization.

`lib/supplier-service.ts` is implementation/server persistence: it reads all organization suppliers for duplicate checks and inserts/updates `organization_suppliers`. It must not move with the first contract.

### H4. Contact semantics and external references

Supplier primary-contact fields are embedded supplier master data. Xero contacts are linked provider records through `lib/xero/contacts.ts`; they are not the Supplier identity. CRM client/contact data is separate, and the current code explicitly distinguishes supplier Xero linking from client Xero linking. The pilot must preserve this distinction.

### H5. Candidate contract

The strongest existing candidate family is the provider-neutral write/validation contract in `lib/supplier-validation.ts`:

```text
SupplierWriteInput
  → validateSupplierWriteInput
  → ValidatedSupplierWriteInput
```

It has explicit fields, nullability/defaulting, payment-terms vocabulary, URL/email/country/currency normalization, bounded lengths, and error-field semantics. It is consumed by Supplier server actions and supplier UI, but currently imports the generated DB row type only because the same module also exports `OrganizationSupplierRow`. Phase 1J must prove whether the candidate can be separated without changing behavior, not assume that it can.

Potential pure helpers in `lib/suppliers.ts`—display-name, lookup normalization, primary contact selection, address display, payment-term formatting and readiness—are useful characterization targets but must not all be exported automatically. Readiness includes persistence-derived fields and may remain application-owned.

### H6. Supplier risk

| Dimension | Classification | Evidence |
|---|---|---|
| stability | HIGH for base identity/write input; MEDIUM for readiness | write vocabulary is explicit; readiness/Xero/PO states are broader |
| DB coupling | MEDIUM | base contract is pure-shaped; implementation is row/RLS/service coupled |
| security | MEDIUM | organization/RLS and permission boundaries remain below contract |
| UI coupling | LOW for write input; MEDIUM for readiness/display projections | AddSupplierDialog and supplier workspace consume it |
| integration | MEDIUM | Xero is required, but provider mapping is separable from base identity |
| cross-domain | MEDIUM | PO, invoices and Materials consume Supplier identity; no CRM identity dependency |
| testability | HIGH for validation; MEDIUM for persistence service | 11 focused supplier tests passed; service remains Supabase-shaped |
| client value | HIGH | every dedicated client needs supplier master data and can supply its own providers |
| portability | YES AFTER SMALL DECOUPLING | remove generated-row coupling from the candidate module and characterize exports |

## I. CRM audit

### I1. Feature map and source paths

CRM currently includes clients, company/person naming, contacts, tags, notes, locations, leads/opportunities, project links, quote/claim/variation/timeline views, files/invoices/jobs pages, visibility filtering, and Xero client-contact linking. It is not one small contact package.

Authoritative paths include:

- `app/app/(workspace)/leads-clients/clients/*`
- `app/app/(workspace)/leads-clients/opportunities/*`
- `app/app/(workspace)/leads-clients/clients/[clientId]/client-detail-data.ts`
- `app/app/(workspace)/leads-clients/clients/[clientId]/actions.ts`
- `lib/leads-clients-server.ts`
- `lib/opportunity-lead-details.ts`
- `components/app/TenderClientMultiSelect.tsx`
- `lib/xero/client-contacts.ts`
- `lib/opportunity-creation-*`

### I2. Identity and tenancy

The current product distinguishes the TradesStack tenant `organizations` from CRM `organization_clients`. A CRM client has its own UUID and organization ownership. Current source does not establish a standalone reusable Contact aggregate equivalent to a generic Party model; contact-like data appears in client rows, external contacts and provider-linking paths. Leads and Opportunities are distinct lifecycle concepts and are linked to clients.

`organization_clients` is RLS-protected by membership/admin policies. Later schema adds client type/status, person/company naming, payment terms, risk, margin, lead source, notes and organization-scoped locations. Project and opportunity rows reference client identity.

### I3. Coupling and risk

`client-detail-data.ts` combines client persistence with project, opportunity, project quote, opportunity quote, claim, variation, drawing, notes and timeline view models. `lib/leads-clients-server.ts` also performs opportunity lifecycle, quote and project/workspace behavior. Xero client linking has separate accounting permissions and provider identity. These are valid product capabilities but poor first public-contract scope.

| Dimension | Classification | Evidence |
|---|---|---|
| stability | MEDIUM | client row is stable, CRM aggregate semantics are not narrow |
| DB coupling | HIGH | clients plus locations, notes, opportunities, projects and quotes |
| security | HIGH | project visibility, membership and lifecycle permissions |
| UI coupling | HIGH | detail page is a large composed view model |
| integration | MEDIUM/HIGH | Xero client contacts and Files/invoice/job surfaces |
| cross-domain | HIGH | opportunity/project/quote/claims/files relationships |
| testability | MEDIUM | focused page tests have a pre-existing `server-only` environment failure |
| client value | HIGH | CRM is valuable, but requires a later deliberate identity boundary |
| portability | NO — DOMAIN BOUNDARY NOT READY | no narrow, implementation-independent family proven |

## J. Cross-candidate dependency graph

Evidence-supported direction:

```text
organization tenant
├── CRM client → opportunity → project / quotes / claims / files
├── Supplier identity → PO supplier reference/snapshots
│                  ├── supplier products/prices ← Materials
│                  ├── supplier invoices / accounting
│                  └── Xero provider mapping
└── Materials catalogue → supplier products/prices → worksheet/commercial/PO/variation consumers
```

Materials has a strong Supplier relationship, but Supplier identity does not depend on the Material catalogue. CRM is upstream of Opportunity and Project, making CRM extraction more lifecycle-sensitive. Meaningful cycles are mostly application-level composition cycles (Materials ↔ Supplier pricing, Supplier ↔ procurement/invoices, CRM ↔ opportunity/project); they are not solved here.

## K. Import and coupling analysis

- Materials types directly alias generated Supabase rows, import JSON, tax contracts, supplier products and pricing structures.
- Supplier candidate modules directly alias generated `Database` rows today; this is the specific Phase 1J decoupling gate.
- CRM detail types are locally shaped but combine DB query results and server-only/App Router dependencies.
- Server-action inputs are transport/application boundaries unless independently proven domain semantics. SupplierWriteInput is the strongest candidate because it is reused by validation/service/UI and has provider-neutral meaning.
- Component props such as `TenderClientOption`, `SupplierPicker` props and worksheet drawer props are UI models, not public domain contracts.
- Candidate implementation files use `@/` aliases; no candidate can be copied into a portable package unchanged.
- Supplier base validation has no Next, React, Supabase client, environment, Storage or provider runtime dependency, once its generated row type is separated. Materials and CRM candidate paths do.

## L. Tenant, authorization and client portability

All three domains contain organization-owned objects. A public contract may carry organization context only if later evidence requires it; it must not implement membership or permission enforcement. Supplier RLS, `suppliers.write`, Xero permissions, PO/invoice permissions and provider mappings stay below the contract.

| Domain | Portability conclusion |
|---|---|
| Materials | NO — DOMAIN BOUNDARY NOT READY |
| Supplier | YES AFTER SMALL DECOUPLING |
| CRM | NO — DOMAIN BOUNDARY NOT READY |

Supplier has useful client portability because a client can consume supplier identity/write semantics while retaining its own database, Xero credentials, PO implementation and configuration. Client-specific fields are likely, but extension API design is deferred.

## M. Comparison matrix

| Dimension | Materials | Supplier | CRM |
|---|---|---|---|
| domain stability | MEDIUM | HIGH for base contract | MEDIUM |
| DB coupling | HIGH | MEDIUM | HIGH |
| security coupling | MEDIUM | MEDIUM | HIGH |
| UI coupling | MEDIUM | LOW/MEDIUM | HIGH |
| integration coupling | HIGH | MEDIUM | MEDIUM/HIGH |
| cross-domain coupling | HIGH | MEDIUM | HIGH |
| existing public shape quality | fragmented/DB-shaped | small validation family | broad view models |
| testability | MEDIUM | HIGH for validation | MEDIUM |
| future client usefulness | HIGH | HIGH | HIGH |
| extraction risk | HIGH | LOW/MEDIUM after decoupling | HIGH |

## N. Candidate public-contract matrix

| Candidate | Domain | Current path | Consumers | DB-neutral now | App-neutral now | Stable | Portable | Risk |
|---|---|---|---|---|---|---|---|---|
| Supplier write/validation family | Supplier | `lib/supplier-validation.ts` | supplier service/actions/dialog/tests | NO — same module exports DB row alias | NO — `@/` import | likely YES | YES after small decoupling | LOW/MEDIUM |
| Material draft input | Materials | `lib/materials/validation.ts` | material actions/import/review | partly | NO | MEDIUM | NO | MEDIUM/HIGH |
| CRM client detail family | CRM | `client-detail-data.ts`, `lib/leads-clients-server.ts` | client detail and lifecycle surfaces | NO | NO | MEDIUM | NO | HIGH |

## O. Package responsibility and naming

Recommended future package name: `@tradesstack/suppliers`.

Potential root public API after Phase 1J characterization: `SupplierWriteInput`, `ValidatedSupplierWriteInput`, `SupplierValidationField`, `SupplierValidationErrors`, `SupplierPaymentTermsType`, `SUPPLIER_PAYMENT_TERMS_TYPES`, and only the validators/normalizers proven to be provider-neutral and runtime-neutral. Prefer a small root export; use subpaths only if the final family is materially separable.

## P. Dogfooding and compatibility strategy

The Master reference app should continue to own `saveSupplier`, persistence and actions while importing the characterized public types/validator from `@tradesstack/suppliers`. Existing `@/lib/supplier-validation` imports may remain compatibility re-exports after extraction. There must be one implementation and one authoritative contract definition; no duplicate authoritative types.

## Q. Semver and database evolution

For the candidate contract, correcting an implementation bug without changing accepted valid input is conceptually PATCH. Adding optional fields, non-breaking payment-term vocabulary or additive diagnostics is MINOR only if defaults and old consumers remain valid. Renaming/removing fields, changing nullability/defaults, changing normalization, tightening accepted values, or changing error-field semantics is BREAKING.

Contract releases and database migrations are separate. A database migration may add persistence fields without exposing them publicly; a contract change may require no migration. Phase 1J must record compatibility with current and legacy supplier rows. Client version skew is not solved globally here, but this contract is sensitive to validator tightening and field/default changes.

## R. Phase 1J exact characterization target

Characterize the exact `lib/supplier-validation.ts` family listed in section A, plus the pure helper candidates in `lib/suppliers.ts` only where current consumers prove they are public semantics. Required characterization includes:

- field names, accepted input types, trimming, casing and URL normalization;
- nullability and defaults, especially `isActive`, payment terms, currency and country;
- validation error field names/messages and invalid-value behavior;
- payment-term vocabulary and day rules;
- identity meaning versus generated row identity;
- organization ownership remaining outside the package;
- serialization and compatibility with current server actions/UI;
- duplicate-warning/readiness behavior as separate, likely deferred projections;
- current/legacy fields (`name`, `company_name`, legacy email/phone/address) without flattening them;
- package import graph with no `@/`, Next, React, Supabase, environment or provider dependency;
- Master dogfooding through the same package export;
- compatibility re-export behavior;
- focused tests for valid, invalid, null, legacy and boundary inputs.

## S. Phase 1J exact files and consumers

Inspect/potentially change only if the characterization gate passes:

- `lib/supplier-validation.ts`
- `lib/suppliers.ts` (only selected pure helpers)
- `lib/supplier-validation.test.ts`
- `lib/supplier-service.ts` (consumer adaptation only; persistence remains here)
- `app/app/(workspace)/company/suppliers/actions.ts`
- `components/app/AddSupplierDialog.tsx`
- `components/app/SupplierPicker.tsx`
- future `packages/suppliers/*`
- compatibility imports/tests directly consuming the selected family

Dogfood consumers to prove include `lib/supplier-service.ts`, supplier server actions, `AddSupplierDialog`, SupplierPicker, and the focused validation/service tests. Xero, PO, supplier-invoice and Materials consumers must remain behaviorally covered but are not package implementation dependencies.

## T. Phase 1J non-goals and required validation

Leave untouched: `organization_suppliers` schema and RLS; all migrations; generated Supabase types; `saveSupplier` persistence; permissions/membership; Xero contacts/sync; POs; supplier invoices/accounting; Materials supplier products/prices; Storage; workers/cron; AI; CRM; UI behavior; shared packages; core-contracts; commercial lineage; opportunity/project lifecycle.

Required validation if Phase 1J proceeds:

- characterization tests for every selected field/default/normalization/error path;
- package tests and Master consumer tests;
- package import scan and `npm run check:boundaries`;
- package type-check and targeted lint;
- no Next/React/Supabase/environment/provider imports in package source;
- compatibility re-export and one-authoritative-definition checks;
- focused supplier service/action regression tests;
- production build only if source/config extraction occurs;
- no database or hosted Supabase mutation.

## U. Existing tests and observed validation

Current focused evidence:

- `npm run check:boundaries`: PASS.
- `npm run test:core-contracts`: PASS, 1 test.
- `npx vitest run packages/shared-ui/src/index.test.tsx packages/pdf-utils/src/index.test.ts`: PASS, 7 tests.
- `npx vitest run lib/supplier-validation.test.ts lib/supplier-service.test.ts lib/supplier-browser-write-regression.test.ts`: PASS, 11 tests.
- `npx vitest run lib/materials/normalization.test.ts lib/materials/estimating-price.test.ts lib/materials/service.test.ts lib/pricing-worksheet-material-picker.test.ts`: 54 passed, 7 failed. The failures are existing fixture/client-shape drift: the mocked Supabase chain lacks the newer tax-policy `.lte()` call, and one fixture lacks `supplier_product_id`; they reinforce that Materials service behavior is not a small portable contract.
- CRM focused run: 10 tests passed; the client page suite could not execute because the current Vitest environment cannot resolve the pre-existing `server-only` import from `lib/opportunity-lifecycle-compatibility-server.ts`.
- `npx tsc --noEmit --pretty false -p tsconfig.build.json`: PASS (no output).

These failures were not repaired because Phase 1I is documentation-only and unrelated test/tooling cleanup would violate scope.

## V. Impact report

| Area | Impact |
|---|---|
| `@tradesstack/core-contracts` | NONE |
| `@tradesstack/shared-ui` | NONE |
| `@tradesstack/pdf-utils` | NONE |
| database / migrations | NONE |
| Supabase / Storage | NONE |
| Auth / permissions / RLS | NONE |
| worker security / retention | NONE |
| integrations | NONE; Xero/AI/Resend remain required |
| application files | NONE |
| package files | NONE |
| config files | NONE |
| documentation | `docs/architecture/TRADESSTACK_DOMAIN_PUBLIC_CONTRACT_PILOT.md` |

## W. TypeScript and toolchain baseline

The build type-check passed in this environment. The repository still has the previously documented full-lint/generated-artifact baseline and npm/installed-Next version caveats; no toolchain changes were made. Phase 1I did not require a production build because it made no source/config changes.

## X. Human decisions required

No decision is required to complete Phase 1I. Phase 1J requires approval to characterize the Supplier family and, only if all gates pass, create `@tradesstack/suppliers`. Do not infer approval to move Supplier persistence, Xero, PO, invoice, UI or permissions.

## Y. Phase status and next pass

**PHASE 1I COMPLETE.**

**Phase 1J readiness:** ready for narrow Supplier validation-contract characterization; not ready for unconditional extraction.

**Next recommended pass:** Phase 1J — characterize `SupplierWriteInput` / `ValidatedSupplierWriteInput` and the minimum pure validation helpers, then conditionally extract only if the package-neutrality and behavior gates pass.

## Z. Final Git safety

Only this documentation file was added by Phase 1I. No destructive Git operation was used. Pre-existing dirty work and all pre-existing migrations/artifacts/packages were preserved.

## Final answer

**SUPPLIER — EXACT CONTRACT IDENTIFIED.** The first low-risk pilot is the existing Supplier provider-neutral write/validation family in `lib/supplier-validation.ts`: `SupplierWriteInput`, `ValidatedSupplierWriteInput`, `SupplierValidationField`, `SupplierValidationErrors`, `SupplierPaymentTermsType`, `SUPPLIER_PAYMENT_TERMS_TYPES`, and their characterized pure validation behavior. Phase 1J must prove and, only conditionally, extract that family while leaving Supplier persistence, RLS, permissions, server actions, UI, PO/invoice behavior, Materials relationships, Xero, AI, workers and all other product capabilities in the Master application.
