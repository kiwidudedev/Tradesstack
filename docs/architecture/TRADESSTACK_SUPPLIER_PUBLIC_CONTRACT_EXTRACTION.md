# TradesStack Phase 1J — Supplier Public Contract Characterization and Extraction

Status: **PASS 1J COMPLETE WITH NON-BLOCKING BASELINE ITEMS — SUPPLIER PUBLIC CONTRACT EXTRACTED**

This document is the Phase 1J authority. It records the characterized public Supplier validation contract and the deliberately narrow extraction. It does not mean the Supplier domain has been fully extracted.

## A. Verdict and authority

**PASS 1J COMPLETE WITH NON-BLOCKING BASELINE ITEMS — SUPPLIER PUBLIC CONTRACT EXTRACTED**

Phase 1I authority: `docs/architecture/TRADESSTACK_DOMAIN_PUBLIC_CONTRACT_PILOT.md`.

The extracted package is `@tradesstack/suppliers`. Its public surface is the provider-neutral validation family from the former `lib/supplier-validation.ts`. Persistence, tenancy, authorization, RLS, CRUD, UI, server actions, Materials relationships, POs, invoices, accounting, Xero, Storage, workers and integrations remain Master-owned.

## B. Pre-extraction implementation and export inventory

Before extraction, `lib/supplier-validation.ts` exported:

- `OrganizationSupplierRow` — generated database alias; not extracted.
- `SUPPLIER_PAYMENT_TERMS_TYPES` — extracted.
- `SupplierPaymentTermsType` — extracted.
- `SupplierWriteInput` — extracted.
- `SupplierValidationField` — extracted.
- `SupplierValidationErrors` — extracted.
- `ValidatedSupplierWriteInput` — extracted.
- `SupplierValidationError` — extracted.
- `normalizeSupplierWebsite` — extracted.
- `validateSupplierWriteInput` — extracted.
- `getSupplierValidationIssuesForReadiness` — retained in the compatibility/application layer because it consumes generated database-row fields and is a readiness projection.

The extracted implementation contains no Supabase, generated-type, Next.js, React, environment, Storage, Xero, AI, network, or server-only dependency.

## C. Characterized contract behavior

### `SupplierWriteInput`

The input retains its existing optional/nullability model and all current field names, including legacy fields. `name` is required by the TypeScript shape and is trimmed at runtime. Optional strings accept `null`, `undefined`, blank strings and whitespace; blank values normalize to `null`, except `defaultPaymentTerms`, which normalizes to `""`. `isActive` defaults to `true` unless explicitly boolean or overridden by `fallbackIsActive`.

The contract does not contain Supplier ID or `organization_id`. Identity and tenant resolution remain persistence/application concerns.

### `ValidatedSupplierWriteInput`

Successful validation returns a new plain object with normalized strings, nullable optional fields, uppercase two-letter `countryCode`, uppercase three-letter `defaultCurrencyCode`, structured payment terms, and boolean `isActive`. The input object is not mutated. Unknown runtime properties are ignored and are not copied to the result.

### Validation fields and errors

`SupplierValidationField` is both stable Supplier field identity and the current field-level error-routing vocabulary. `SupplierValidationErrors` is a partial field-to-human-readable-message map. Current consumers inspect field presence and current messages; Phase 1J preserves both. No localization or multi-message error model was introduced.

`SupplierValidationError` retains its name, message, and `fieldErrors` property. Error wording is therefore treated as a compatibility-sensitive current behavior until a later explicit error-contract decision.

### Payment terms

The exact ordered runtime constant is:

```text
days_after_bill_date
days_after_bill_month
of_current_month
of_following_month
```

Structured terms are current TradesStack semantics, not Xero payloads. Days are integer numbers from 0 through 31 when supplied. Non-integer and `NaN` values normalize to `null` under current behavior; this behavior is intentionally preserved. Day-based terms require a non-null day. A day without a structured term is rejected. Negative and greater-than-31 integers are rejected.

### Other normalization

- website values are trimmed; protocol-free values receive `https://`;
- only `http:` and `https:` website protocols are accepted;
- email uses the existing simple pattern and is not replaced with a new validator;
- country and currency codes are uppercased and checked for 2/3 ASCII letters;
- names and other bounded fields retain current length limits and messages;
- phone, address, tax, registration and payment-term legacy fields are trimmed but not jurisdictionally reformatted.

Validation is synchronous, deterministic, side-effect-free, and serializable as plain data apart from the thrown Error instance. No dates, maps, sets, functions, symbols, random values, time, environment or provider data are involved.

## D. Consumer inventory and dogfooding

Current consumers of the old path were:

| Consumer | Symbols | Treatment |
|---|---|---|
| `lib/supplier-service.ts` | validation, error, input type | compatibility path retained |
| `lib/suppliers.ts` | readiness helper, payment-term type | compatibility/application path retained |
| `components/app/AddSupplierDialog.tsx` | website normalizer, payment-term type | direct package import |
| `app/app/(workspace)/company/suppliers/CompanySuppliersWorkspace.tsx` | website normalizer, payment-term type | compatibility path retained |
| `app/app/(workspace)/company/suppliers/actions.ts` | validation error, input type | direct package import |
| `lib/supplier-validation.test.ts` | validator/error | compatibility characterization |

The Master reference application therefore directly dogfoods `@tradesstack/suppliers` through the Supplier action and Add Supplier dialog, while existing consumers remain protected through the compatibility shim.

## E. Compatibility and ownership

`lib/supplier-validation.ts` is now a compatibility boundary. It re-exports the package public API and retains only `OrganizationSupplierRow` and `getSupplierValidationIssuesForReadiness`, which are application/database-shaped and not package contracts. There is one authoritative implementation of each extracted symbol in `packages/suppliers/src/index.ts`.

The package owns Supplier validation semantics. It does not own persistence representation, uniqueness, tenant context, authorization, readiness queries, duplicate checks, provider mappings or UI error presentation.

## F. Stage A extraction gates

| Gate | Result | Evidence |
|---|---|---|
| Supplier owns semantics | PASS | explicit Supplier master-data validation family |
| current behavior characterized | PASS | 9 compatibility tests plus package tests |
| current tests sufficient after additions | PASS | edge behavior covered before extraction |
| pure deterministic behavior | PASS | plain-value tests; no side effects |
| DB-neutral | PASS WITH SAFE DECOUPLING | removed row alias/readiness from package |
| Supabase-neutral | PASS | no Supabase imports |
| Next-neutral | PASS | no Next/server-only imports |
| React-neutral | PASS | no React/JSX imports |
| app-alias neutral | PASS WITH SAFE DECOUPLING | package uses only local imports; shim retains app aliases for DB row |
| environment-neutral | PASS | no environment access |
| provider-neutral | PASS | no Xero/provider imports or IDs |
| security-neutral | PASS | authorization remains outside package |
| serialization understood | PASS | plain data inputs/outputs; Error only on failure |
| consumers identified | PASS | direct and compatibility consumers inventoried |
| compatibility path identified | PASS | `lib/supplier-validation.ts` re-export shim |
| meaningful Master dogfood identified | PASS | Supplier action and AddSupplierDialog |
| no DB migration required | PASS | no schema/RPC/trigger changes |
| no product behavior change required | PASS | behavioral tests pass |
| future client portability | PASS | package has no Master/runtime/provider dependencies |

## G. Extracted package

Created:

- `packages/suppliers/package.json`
- `packages/suppliers/src/index.ts`
- `packages/suppliers/src/index.test.ts`

The package is a private npm workspace package at version `0.0.0`, with a deliberate root export and zero runtime dependencies. `tsconfig.json` and `vitest.config.ts` contain the required workspace aliases. No publishing or deployment infrastructure was added.

Public exports are exactly:

```text
SUPPLIER_PAYMENT_TERMS_TYPES
SupplierPaymentTermsType
SupplierWriteInput
SupplierValidationField
SupplierValidationErrors
ValidatedSupplierWriteInput
SupplierValidationError
normalizeSupplierWebsite
validateSupplierWriteInput
```

Phase 1K extended the same package with the separately characterized narrow read contract `SupplierReference`. It is documented authoritatively in `docs/architecture/TRADESSTACK_SUPPLIER_PUBLIC_READ_MODEL.md`; this Phase 1J history remains focused on the original write-validation extraction.

No package internals are exported beyond this root API. The package does not depend on `@tradesstack/core-contracts`; no artificial dependency was introduced.

## H. Validation results

- Package tests: PASS — 3 tests.
- Supplier compatibility/service/regression tests: PASS — 15 tests.
- Existing package tests: PASS — core-contracts 1, shared-ui 3, pdf-utils 4, suppliers 3; 11 tests total.
- Package boundary check: PASS.
- Targeted ESLint: PASS with only the existing ignored `tsconfig.json` warning.
- `npx tsc --noEmit --pretty false -p tsconfig.build.json`: PASS.
- `npm run build`: PASS. Next.js 16.1.6 compiled, type-checked, generated 124 pages and completed route optimization.

The pre-existing Materials baseline remains unchanged: 54 passing tests and 7 known fixture/client-shape failures. The pre-existing CRM baseline remains unchanged: 10 passing tests and one page suite blocked by the existing `server-only` Vitest resolution issue.

## I. SemVer, jurisdiction and version skew

Preserving behavior is PATCH-compatible. Additive optional fields or capabilities may be MINOR if old consumers remain valid. Removing/renaming fields, changing requiredness/nullability/defaults, tightening accepted values, changing payment-term literals, changing error keys, or changing normalization is BREAKING. Exact human-readable error messages are currently compatibility-sensitive because they are user-visible, although a future localized error contract may deliberately change that policy.

Package SemVer is separate from Supplier database schema version. A schema migration does not automatically require a package release, and a package contract change does not automatically require a migration. Client version-skew sensitivity is concentrated in validator tightening, field/default changes, payment-term literals and error shape. Global version-skew policy remains deferred.

Current country/currency validation is generic-format validation, while NZD/GST defaults and operational display conventions remain Master/configuration concerns. No NZ/AU provider behavior was added to the package. Future client-specific fields, jurisdiction rules and accounting/provider mappings remain extension/configuration pressure, not package responsibilities.

## J. Explicit non-goals and impact

No changes were made to Core contracts, shared UI, PDF utilities, database schema, migrations, Supabase, Storage, Auth, permissions, RLS, workers, retention security, QA, Files, commercial flows, opportunity/project lifecycle, Materials behavior, POs, supplier invoices, accounting, Xero, integrations or UI layout/behavior. Xero and all other Supplier-related integrations remain required Master capabilities.

The Supplier validation contract is extracted; the Supplier domain is not fully extracted.

## K. Source and Git safety

HEAD remains `361bf3f094a8abbb58d20606413686cebc242e66` on `main`. The worktree was dirty before Phase 1J. Pre-existing application edits, artifacts, migrations, architecture documents and existing packages were preserved. No destructive Git operation, database mutation, hosted Supabase operation, Storage mutation or secret access was performed.

Phase 1J changes are limited to the Supplier package, its compatibility/direct consumer imports, characterization/package tests, workspace aliases, and this documentation.

## L. Final answer and next pass

**YES — SUPPLIER PUBLIC CONTRACT EXTRACTED AND DOGFOODED.** TradesStack has now proven that one real business-domain contract can be owned by a dedicated `@tradesstack/*` package while the Master reference application retains persistence, authorization, UI, provider integrations and operational workflows. The proof is the zero-runtime-dependency package, pre/post characterization coverage, compatibility shim, direct Master consumers, passing package/Supplier tests, boundary check, type-check and production build.

The next smallest evidence-driven step is **Supplier public read-model contract characterization**, not extraction of Supplier CRUD or provider mappings. Characterize a narrow read projection only if current consumers reveal a stable provider-neutral shape; otherwise select the next domain boundary based on evidence. Do not immediately extract the remaining Supplier module.
