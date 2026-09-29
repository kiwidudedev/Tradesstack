# TradesStack Phase 1K — Supplier Public Read-Model Characterization and Extraction

Status: **PASS 1K COMPLETE WITH NON-BLOCKING BASELINE ITEMS — SUPPLIER PUBLIC READ MODEL EXTRACTED**

This document is the Phase 1K authority. It records a deliberately narrow Supplier read contract. It does not mean that Supplier persistence, CRUD, procurement, invoices, accounting, Xero, Materials relationships, or the Supplier domain as a whole have been extracted.

## A. Verdict and scope

The extracted contract is:

```ts
type SupplierReference = {
  id: string;
  displayName: string;
  isActive: boolean;
};
```

It is exported from `@tradesstack/suppliers`. The Master application still owns the query, authorization, row-to-contract mapping, database shape and UI. The mapping deliberately remains in the Master application:

```ts
{
  id: supplier.id,
  displayName: getSupplierDisplayName(supplier),
  isActive: supplier.is_active,
}
```

No database row type, query, generated Supabase type, provider identifier, tenant identifier or authorization decision is part of the package contract.

## B. Authority and source state

Phase 1I authority: `docs/architecture/TRADESSTACK_DOMAIN_PUBLIC_CONTRACT_PILOT.md`.

Phase 1J authority: `docs/architecture/TRADESSTACK_SUPPLIER_PUBLIC_CONTRACT_EXTRACTION.md`.

Current implementation and tests remain authoritative. The worktree was already dirty before Phase 1K; unrelated edits and untracked files were preserved. No destructive Git operation was used.

## C. Read-path inventory

| Current path | Current shape | Observed use | Phase 1K treatment |
|---|---|---|---|
| `lib/purchase-orders/service.ts` | `OrganizationSupplierRow[]` from `select("*")` | Supplier loading for procurement | remains application/database-owned |
| `app/.../purchase-orders/[purchaseOrderId]/page.tsx` | full rows filtered by `getSupplierDisplayName` | PO supplier selector | maps to `SupplierReference` |
| `components/app/SupplierPicker.tsx` | previously accepted full rows | renders label, id and active badge | accepts package contract |
| `app/.../company/suppliers/page.tsx` | full row/detail projections | Supplier management and Xero/readiness | remains application-owned |
| `CompanySuppliersWorkspace.tsx` | full rows and readiness data | Supplier CRUD and operational UI | remains application-owned |
| supplier-invoice pages/components | full rows and richer matching data | invoice capture and matching | remains invoice/application-owned |
| materials/pricing paths | full rows plus product/price/tax context | pricing and supplier-product workflows | remains Materials-owned |

The PO selector is the only audited consumer that requires exactly the three-field, provider-neutral reference semantics. Richer paths are not evidence for a single universal Supplier read model.

## D. Current Supplier read semantics

`organization_suppliers` remains the persistence authority. It is organization-owned and protected by existing membership/RLS rules. Its `id` and `is_active` columns are mapped by the application. `displayName` is not a database column: it preserves the existing `getSupplierDisplayName` rule, using trimmed `company_name`, then trimmed `name`, then the empty string.

The package therefore exposes a semantic reference, not a row projection. An empty `displayName` remains representable because the current helper can return an empty string; Phase 1K does not add a new required-name rule or silently alter existing behavior.

## E. Field characterization

| Field | Type/nullability | Meaning | Source/normalization | Provider or DB coupling |
|---|---|---|---|---|
| `id` | `string`, required | Supplier identity used by the current selector and downstream PO value | mapped from the authorized row’s `id`; no new ID abstraction | no provider type; DB authority remains outside package |
| `displayName` | `string`, required but possibly empty | current human-readable selector label | `getSupplierDisplayName` semantics remain app-owned | no provider or UI type |
| `isActive` | `boolean`, required | current active/inactive display state | mapped from `is_active` | no RLS or authorization meaning |

`organization_id`, contacts, address, tax, currency, payment terms, timestamps, source, readiness, Xero mappings, Materials relationships, invoice data and PO data are intentionally absent. They belong to persistence or narrower domain/application projections.

## F. Read-model candidate comparison

| Candidate | Evidence | Decision |
|---|---|---|
| `SupplierReference` (`id`, `displayName`, `isActive`) | concrete PO selector consumer; small; serializable; provider-neutral | **EXTRACTED** |
| Supplier summary including contact/tax/payment fields | appears in management/readiness screens but semantics vary by screen | DEFERRED |
| Supplier detail/readiness model | includes DB fields, duplicate checks, Xero/readiness and operational concerns | DEFERRED |
| Supplier-material/product/price model | owned by Materials/pricing/procurement relationships | DEFERRED |
| Supplier invoice matching model | invoice/accounting/document semantics | DEFERRED |

There is no evidence for a universal `SupplierRow`, generic `EntityReference`, or provider-neutral read model containing all Supplier fields.

## G. Consumer and dogfooding result

The Master reference application now consumes `SupplierReference` directly in `components/app/SupplierPicker.tsx`. The PO page maps its authorized full rows into the package contract and passes only that contract to the picker. Selection behavior remains unchanged: the same Supplier ID and existing display label are written to the active PO variation.

Other consumers continue using full application-owned rows where they need richer semantics. They were not forced through an artificial summary contract.

## H. Stage A extraction gates

| Gate | Result | Evidence |
|---|---|---|
| Supplier owns semantics | PASS | stable Supplier reference used by a real selector |
| Current read behavior characterized | PASS | source tracing and focused package/consumer tests |
| Narrow public surface | PASS | three fields only |
| Persistence remains outside package | PASS WITH SAFE DECOUPLING | app mapper converts the authorized row |
| DB-neutral | PASS | no generated Supabase type or row alias in package |
| Supabase-neutral | PASS | no client, RPC or Auth import |
| Next/React-neutral package | PASS | package contains only data contract; UI remains app-owned |
| App-alias neutral | PASS | package has no `@/` imports |
| Environment-neutral | PASS | no environment access |
| Provider-neutral | PASS | no Xero/provider field or client |
| Security-neutral | PASS | authorization and RLS remain query/application boundaries |
| Serialization understood | PASS | plain JSON-compatible fields |
| Existing consumer identified | PASS | PO selector is direct dogfood consumer |
| Compatibility path | PASS | full row/application paths remain intact; no DB type re-export added |
| No migration required | PASS | no schema, data, RPC, trigger or RLS change |
| Future-client portability | PASS | future app can map its own authorized persistence into the contract |

All critical gates passed. The only safe decoupling is the deliberate application-owned row-to-reference mapping.

## I. Extraction result

The package was extended without creating a second Supplier package:

- `packages/suppliers/src/index.ts` exports `SupplierReference`.
- `packages/suppliers/src/index.test.ts` proves the intended shape is serializable.
- `components/app/SupplierPicker.tsx` consumes `SupplierReference`.
- The PO page performs the authoritative application-side mapping.

The prior Supplier validation exports and compatibility shim remain intact. There is one package-owned definition of `SupplierReference`; there is no duplicate full read-model type.

## J. Explicit non-goals and protected boundaries

Phase 1K did not move or change Supplier reads, writes, CRUD, server actions, repositories, Supabase clients, generated types, RLS, tenancy, Auth, permissions, Storage, workers, retention, QA, Files, Materials, PO behavior, supplier invoices, accounting, Xero, provider credentials, or UI behavior. No migration or data mutation occurred.

`SupplierReference` is not a permission result, tenant context, signed URL, Storage path, Xero contact, Material supplier-product relation, invoice match, or generic cross-domain identity contract.

## K. Tests and validation

- Focused Supplier/package characterization: **PASS — 4 test files, 19 tests**.
- Existing package suite (`core-contracts`, `shared-ui`, `pdf-utils`, `suppliers`): **PASS — 4 files, 12 tests**.
- Package boundary check: **PASS**.
- Targeted ESLint: **PASS**.
- `npx tsc --noEmit --pretty false -p tsconfig.build.json`: **PASS**.
- `npm run build`: **PASS** — Next.js 16.1.6, 124 generated pages.

Known unrelated baselines remain unchanged: Phase 1I reported 54 passing Materials tests with 7 fixture/client-shape failures, and 10 passing CRM tests with one server-only Vitest page-suite blocker. They were not changed or treated as Phase 1K regressions.

## L. Compatibility and versioning

Adding an optional field to a future reference contract may be MINOR. Removing or renaming a field, changing requiredness/nullability, changing the `displayName` semantics, or changing `isActive` meaning is BREAKING. An internal mapping implementation change that preserves these semantics is PATCH-compatible.

The package version is independent of the Supplier database schema version. A future client must perform its own authorized query and map its result to the contract; the package does not define how that query, tenant boundary or RLS policy works. Global Core/client version-skew policy remains deferred.

## M. Future client and extension implications

A dedicated client can use `@tradesstack/suppliers` for a stable selector/reference shape without importing Master server actions, database code, Xero implementation, React components or Supabase types. Client-specific fields, jurisdiction rules, accounting mappings and provider mappings remain future configuration/domain-extension concerns; no extension API was designed here.

## N. Next recommendation

The next smallest evidence-driven capability is a **first client-repository consumption proof** using the already proven Supplier write and narrow read contracts, with client-owned persistence/configuration and no Master database sharing. Do not broaden Supplier extraction into CRUD or detail read models until a separate consumer demonstrates a stable need.

## O. Final answer

**SUPPLIER — EXACT CONTRACT EXTRACTED:** `SupplierReference { id: string; displayName: string; isActive: boolean }`.

TradesStack has now proven a narrow business-domain read contract through a dedicated package while the Master application retains persistence, authorization, UI, integrations and operational workflows.
