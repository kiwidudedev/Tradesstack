# TradesStack Master Repository Foundation

## Phase 1B — Repository / package boundary foundation

**Status: PASS 1B COMPLETE WITH NON-BLOCKING TOOLCHAIN LIMITATION**

This document is the Phase 1B repository/package authority. It implements the smallest safe proof that the complete current TradesStack application can consume a controlled `@tradesstack/*` package. It does not extract product functionality.

## A. PASS 1B VERDICT

**PASS 1B COMPLETE WITH NON-BLOCKING TOOLCHAIN LIMITATION**

The package foundation, reference-app consumption proof, TypeScript/build participation and boundary check pass. Full-repository lint remains unusable as a clean gate because the pre-existing repository contains generated/build artifacts and legacy source producing thousands of existing errors. Targeted lint for all Phase 1B files passes. The known local toolchain mismatch remains: npm 10.9.7 is below the repository engine requirement of npm 11.6.2, and installed Next is 16.1.6 while manifest/lockfile request 16.3.3.

## B. SOURCE STATE

```text
Branch: main
HEAD: 361bf3f094a8abbb58d20606413686cebc242e66
Initial worktree: dirty
```

All pre-existing tracked and untracked work was preserved. No reset, restore, checkout, clean, stash or history rewrite was used.

## C. PHASE 1A AUTHORITY

Consulted `docs/architecture/TRADESSTACK_MASTER_CORE_OWNERSHIP.md` in addition to the Phase 0 architecture, database, bootstrap and fresh-install/security documents. Phase 1A’s transitioning Master monorepo recommendation and shared UI/formatting first-extraction recommendation govern this pass.

## D. PRODUCT PRESERVATION

The complete current TradesStack product remains in its existing locations. No domain functionality, routes, UI behavior, Auth, permissions, database, Supabase, Storage, workers, integrations, cron, Edge Functions, commercial logic, project lifecycle, QA, Files or retention code was moved or refactored.

## E. OPERATING RULE COMPLIANCE

The installed package versions were rechecked before work. The package foundation was implemented independently of the mismatches. Package tests, boundary checks, TypeScript, targeted security tests and the production build were run. Full lint was investigated to completion and classified as a pre-existing repository-wide baseline failure; targeted lint for Phase 1B files passed. Work continued without hiding the limitation.

## F. PACKAGE MANAGER

npm is the repository authority: `package.json`, `package-lock.json`, npm scripts and existing `node_modules` are present. Phase 1B uses conservative npm workspaces with `packages/*`. No pnpm, Yarn, Turborepo, Nx, Lerna, Changesets, registry or publishing tool was introduced.

## G. NEXT.JS TOOLCHAIN STATE

| Item | Observed |
|---|---|
| Manifest Next | `16.3.3` |
| Lockfile Next | `16.3.3` |
| Installed Next | `16.1.6` |
| Node | `v22.22.2` |
| npm | `10.9.7` |
| Package engine | Node `>=22.22.2 <23`, npm `>=11.6.2 <12` |
| Classification | **LOCAL TOOLCHAIN MISMATCH**, pre-existing |

No dependency version was changed. The package-lock update records workspace metadata; npm 10 also normalized some peer metadata while doing so. The production build passed with the installed Next 16.1.6, but 16.3.3 compatibility remains a later toolchain-maintenance task.

## H. REPOSITORY STRUCTURE BEFORE

```text
Tradesstack-ai/
├── app/
├── components/
├── lib/
├── supabase/
├── scripts/
├── tests/
├── docs/
├── package.json
├── package-lock.json
├── tsconfig.json
└── next.config.ts
```

## I. REPOSITORY STRUCTURE AFTER

```text
Tradesstack-ai/
├── app/                         # complete Master reference application
├── components/                 # current product UI
├── lib/                        # current product/domain services
├── packages/
│   └── core-contracts/         # private foundation package only
│       ├── package.json
│       └── src/
│           ├── index.ts
│           └── index.test.ts
├── supabase/                   # unchanged
├── scripts/
│   └── check-package-boundaries.mjs
├── tests/
└── docs/architecture/
```

## J. WORKSPACE FOUNDATION

Root `package.json` now declares the npm workspace `packages/*`. The lockfile records the workspace package. The foundation is source-consumed through the existing TypeScript/Next build rather than introducing a separate package compiler or publishing pipeline.

## K. PACKAGE NAMESPACE

The reserved namespace is `@tradesstack/*`. The first package is private and unpublished. No client package or client application was created.

## L. FOUNDATION PACKAGE

Created exactly one package:

```text
packages/core-contracts/
  package.json
  src/index.ts
  src/index.test.ts
```

Package name: `@tradesstack/core-contracts`.

## M. FOUNDATION PACKAGE PURPOSE

It is a zero-business-logic characterization package. It contains no Auth, tenancy, permissions, database, product domain, UI, provider, worker or client contract. Its purpose is only to prove the future package direction safely.

## N. FOUNDATION PACKAGE EXPORTS

The root export is explicit and contains only:

- `CORE_CONTRACTS_PACKAGE_VERSION`, value `"0.0.0"`;
- `CoreContractsPackageMarker`, a type derived from that marker.

No unstable subpath exports are exposed.

## O. REFERENCE APP CONSUMPTION

`app/layout.tsx` imports the marker from `@tradesstack/core-contracts` and evaluates it invisibly with `void`. It does not render the value, change metadata, alter a route, query data, call a provider or change server behavior. The import resolves through the TypeScript path mapping and is included in the Next production build. The package test imports through the same public package name.

## P. USER-VISIBLE IMPACT

**NONE EXPECTED.** No visible UI, route, navigation, document, calculation, authorization or runtime workflow was changed.

## Q. ROOT SCRIPT COMPATIBILITY

Existing scripts were preserved. Two additive scripts were added:

- `npm run test:core-contracts`
- `npm run check:boundaries`

No existing script was removed or renamed. The repository did not previously define `npm test`; no replacement was introduced.

## R. TYPESCRIPT FOUNDATION

The existing `@/*` alias remains unchanged. One explicit alias was added for `@tradesstack/core-contracts`, pointing to its source entry during the transitional source-consumed phase. `tsconfig.build.json` inherits the mapping and the package source is included by the existing broad TypeScript include.

## S. NEXT.JS PACKAGE COMPATIBILITY

No `next.config.ts` change was required. Next’s existing TypeScript build successfully compiled the package import. No `transpilePackages` setting was added because the package is source-consumed through the existing TypeScript path mapping and contains no external runtime dependency.

## T. PACKAGE BUILD MODEL

**Source-consumed TypeScript package.** This is the smallest compatible model for a private internal proof. A prebuilt package compiler, declaration bundling, publishing and registry selection are intentionally deferred.

## U. IMPORT DIRECTION RULES

The documented target is:

```text
CLIENT EXTENSION → CLIENT/REFERENCE APP → CORE PUBLIC CONTRACTS → CORE IMPLEMENTATION
```

The current transitional rules are:

- `packages/*` must not import `app/*`;
- `packages/*` must not import `components/app/*`;
- `packages/*` must not import future client application paths;
- Core packages may depend on other Core packages only through public exports;
- reference app may consume Core packages;
- future client apps may consume Core packages, configuration and client extensions;
- Core must never import client extensions;
- client extensions must depend on Core public contracts, never Core internals;
- moving TypeScript does not transfer database ownership.

## V. BOUNDARY ENFORCEMENT

Added `scripts/check-package-boundaries.mjs`. It recursively scans source files under every `packages/*` directory, resolves relative imports, checks forbidden `@/app` and `@/components/app` aliases, and fails with the importer/specifier when a forbidden direction is detected. It also reserves `clients/` as a future application boundary.

This is intentionally a light repository check, not a full dependency graph platform. It currently enforces the obvious package-to-application direction; domain/API/database contracts remain future work.

## W. BOUNDARY CHECK RESULT

**PASS**

Output: `packages/* has no imports from app, components/app, or client application paths.`

## X. CORE → APP FORBIDDEN DEPENDENCY

**PASS.** The foundation package has no imports. The repository-wide checker would reject relative or explicit alias imports from package source into `app`, `components/app` or `clients`.

## Y. CLIENT EXTENSION DIRECTION

Documented target:

```text
CLIENT EXTENSION → CORE PUBLIC CONTRACT

never

CLIENT EXTENSION → CORE INTERNAL FILE
```

No extension loader, plugin system, event bus or client repository was created.

## Z. MASTER REFERENCE APP

The current complete TradesStack application is explicitly designated the **TRADESSTACK MASTER REFERENCE APPLICATION**. It remains the first consumer of every future extracted Core package and remains complete while extraction proceeds.

## AA. DOGFOODING CONTRACT

Documented sequence:

```text
Core change → Core tests → Master reference app build
           → reference acceptance → client update
```

No automation for client updates was added.

## AB. FUTURE PACKAGE CATEGORIES

The documented categories are:

- Core contract package;
- Core domain package;
- shared service package;
- shared UI package;
- integration package.

Only the Core contract foundation package exists after Phase 1B.

## AC. SHARED UI INVENTORY

Current presentation candidates inspected:

- `components/ui/badge.tsx`, `button.tsx`, `card.tsx`, `checkbox.tsx`, `input.tsx`, `radio.tsx`, `select.tsx`, `switch.tsx`, `textarea.tsx`;
- `components/ui/dialog.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `sheet.tsx`, `tooltip.tsx`;
- `lib/format/currency.ts`;
- `lib/fonts.ts` and public font assets;
- selected UI model helpers such as `components/ui/signature-pad-model.ts`.

## AD. SHARED UI READY

For Phase 1C, the most ready first group is the dependency-light, non-Next form/presentation primitives:

- `badge.tsx`;
- `button.tsx`;
- `card.tsx`;
- `checkbox.tsx`;
- `input.tsx`;
- `radio.tsx`;
- `switch.tsx`;
- `textarea.tsx`.

They still require characterization tests and an explicit CSS/token consumption contract before movement. “Ready” means suitable for the first narrow extraction investigation, not approved for blind relocation.

## AE. SHARED UI NEEDS DECOUPLING

These need narrow preparation before extraction:

- `select.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `separator.tsx` and `tooltip.tsx` because they depend on Radix behavior and/or `@/`-style assumptions;
- signature pad model and component because browser/canvas/signature behavior needs characterization;
- any component using Tailwind classes that rely on global tokens or `tailwind.config.ts` content scanning.

## AF. SHARED UI DOMAIN-COUPLED

Leave out of the first UI batch:

- `components/app/**` domain components;
- claims, QA, Files, commercial, worksheet, project and opportunity components;
- any component importing server actions, Supabase clients, domain types, route data or Next navigation tied to a business workflow;
- marketing components and branded composition surfaces that belong to the reference-app/product brand rather than generic UI.

## AG. FORMAT UTILITY INVENTORY

`lib/format/currency.ts` is the current principal formatting utility. It is a candidate only after checking its currency/tax semantics. Generic number/date formatting may become shared later, but tax/GST, commercial totals, accounting identity and jurisdiction logic remain Core business logic. No format utility was moved.

## AH. FONT / ASSET BOUNDARY

`lib/fonts.ts` imports `next/font/local` and resolves assets from `public/`; it is Next/reference-app specific today. Font files, logos, marketing imagery and TradesStack branding remain reference-app assets. A future shared UI package should receive theme/font tokens or an asset contract, not import the reference app’s brand assets directly. No assets were moved.

## AI. CSS / THEME CONTRACT

Global styling is owned by `styles/globals.css`, with Tailwind v4 import/theme configuration, CSS variables, semantic colors, spacing, typography, radius and shadows. `tailwind.config.ts` and content scanning are application-level authorities. Phase 1C must either keep package classes within the app’s scan boundary or establish a tested package CSS/token contract. No global CSS or Tailwind configuration changed.

## AJ. REACT CLIENT/SERVER BOUNDARY

The first package should remain React-runtime-neutral and server/client neutral. UI components with browser APIs, event handlers or `"use client"` require explicit client entrypoint treatment. Server actions, Supabase clients and server-only imports must not enter a generic UI package. Signature pad is client/browser-sensitive and is deferred from the first batch.

## AK. NEXT-SPECIFIC UI

`dialog`, `dropdown-menu`, `separator`, `sheet`, `tooltip` and `signature-pad` were identified as UI files requiring additional inspection because they use Next-specific or browser/client concerns. Components importing `next/link`, `next/image`, navigation hooks, server actions or route-specific data should remain reference-app composition until an adapter contract exists.

## AL. PHASE 1C PROPOSED FIRST BATCH

Keep Phase 1C narrow:

```text
components/ui/badge.tsx
components/ui/button.tsx
components/ui/card.tsx
components/ui/checkbox.tsx
components/ui/input.tsx
components/ui/radio.tsx
components/ui/switch.tsx
components/ui/textarea.tsx
```

Move no domain component, font file, global stylesheet, Radix overlay, signature pad, marketing asset or tax-aware formatter in that first batch unless characterization proves it is independent.

## AM. PHASE 1C CHARACTERIZATION TESTS REQUIRED

Before movement, add or confirm tests for button variants/disabled behavior, input/textarea controlled behavior, checkbox/radio/switch state and accessibility, card/badge class contracts, Tailwind token resolution and package consumer rendering. Overlay keyboard/focus behavior and signature-pad pointer/canvas behavior require separate tests before later batches.

## AN. DATABASE IMPACT

**NONE**

## AO. MIGRATION IMPACT

**NONE**. No migration was added, moved, renamed, regenerated or replayed.

## AP. SUPABASE IMPACT

**NONE**. No local or hosted Supabase operation was performed.

## AQ. STORAGE IMPACT

**NONE**.

## AR. AUTH / PERMISSION IMPACT

**NONE**. No Auth, tenancy, permission, RLS, trusted-claim or service-role code moved.

## AS. WORKER SECURITY REGRESSION

The Phase 0E `TAKEOFF_RENDER_WORKER_TOKEN` boundary was not changed. Focused regression coverage passed: `app/api/takeoff/render-jobs/run/route.test.ts`, 2 tests passed within the focused run.

## AT. RETENTION SECURITY REGRESSION

No retention code or migration changed. The `retention_phase4_internal=true` trusted claim boundary remains untouched.

## AU. INTEGRATION IMPACT

**NONE**. Xero, OpenAI, Anthropic, Resend, callbacks, webhooks, cron and Edge Functions were not modified.

## AV. ENVIRONMENT CONTRACT

Existing environment variables were not renamed or abstracted. The documented future direction is:

```text
APP / DEPLOYMENT → CONFIGURATION → CORE CONTRACT
```

The package contains no environment access.

## AW. GENERATED TYPES IMPACT

**NONE**. Supabase generated types were not moved or regenerated.

## AX. PACKAGE TEST RESULTS

**PASS** — `npm run test:core-contracts`: 1 file, 1 test passed.

## AY. FOCUSED TEST RESULTS

**PASS** — focused run of worker-token and permissions tests: 2 files, 8 tests passed.

## AZ. LINT / TYPECHECK RESULTS

- Targeted ESLint on Phase 1B files: **PASS**, 0 errors; `package.json` produced only an expected ignored-file warning.
- `npx tsc --noEmit --pretty false -p tsconfig.build.json`: **PASS**.
- Full `npm run lint`: **FAILURE BASELINE**, 6,603 errors and 35,459 warnings across existing generated/build artifacts and legacy source. This was not introduced by Phase 1B; no Phase 1B file appeared as a reported error.

## BA. PRODUCTION BUILD

**PASS** — `npm run build` completed successfully with the installed Next.js 16.1.6. The build compiled the reference-app package import and generated the existing route set.

## BB. PRE-EXISTING FAILURES

- Installed Next.js 16.1.6 differs from manifest/lockfile 16.3.3.
- npm 10.9.7 is below the package engine requirement of npm 11.6.2.
- Full repository lint reports thousands of existing issues, including generated `.next*`/`.tmp` outputs and legacy source.

## BC. PHASE 1B REGRESSIONS

**NONE IDENTIFIED.** Boundary check, package test, TypeScript build check, focused security tests and production build passed.

## BD. APPLICATION FILES CHANGED

- `app/layout.tsx` — invisible foundation-package consumption import only; no rendered or workflow behavior.

## BE. PACKAGE / CONFIG FILES CHANGED

- `package.json` — npm workspace and additive validation scripts.
- `package-lock.json` — workspace/link metadata generated by npm.
- `packages/core-contracts/package.json`.
- `packages/core-contracts/src/index.ts`.
- `tsconfig.json` — explicit package source alias.
- `vitest.config.ts` — test resolver alias.

## BF. TEST FILES CHANGED

- `packages/core-contracts/src/index.test.ts`.

## BG. DOCUMENTATION CHANGES

- `docs/architecture/TRADESSTACK_MASTER_REPOSITORY_FOUNDATION.md`.
- No Phase 0 or Phase 1A document was rewritten.

## BH. DATABASE FILES CHANGED

**NONE**

## BI. PROTECTED SYSTEM IMPACT

**NONE**. Auth, RLS, Storage, workers, internal claims, integrations and service-role containment remain unchanged.

## BJ. PRODUCTION IMPACT

**NONE EXPECTED**

## BK. HOSTED SUPABASE IMPACT

**NONE**

## BL. ACTIVE LOCAL IMPACT

**NONE EXPECTED**. No local Supabase reset, migration, seed, stop or replay occurred.

## BM. PRE-EXISTING WORKTREE PRESERVED

**CONFIRMED.** Existing application edits, migrations, artifacts, scripts, generated candidates and documentation were retained. New Phase 1B paths are distinguishable: `packages/`, `scripts/check-package-boundaries.mjs`, the package/config changes above, `app/layout.tsx`, and this document.

## BN. ARCHITECTURAL LIMITATIONS

Remaining limitations are intentionally non-blocking:

- npm 10.9.7 and installed Next 16.1.6 do not match repository engine/manifest expectations;
- full lint is not a clean baseline because it scans generated artifacts and legacy source;
- package source is consumed through the transitional TypeScript alias; no separate package compilation/publishing pipeline exists yet;
- the boundary checker enforces obvious package-to-app direction, not semantic domain/database ownership;
- workspace installation/link behavior should be revalidated under the required npm 11 toolchain before external package publication.

## BO. HUMAN DECISIONS REQUIRED

None block Phase 1B completion. The previously deferred private distribution decision remains relevant only to a later publication pass; it was not configured here.

## BP. PHASE 1B DOCUMENTATION

`docs/architecture/TRADESSTACK_MASTER_REPOSITORY_FOUNDATION.md`

## BQ. PHASE 1B STATUS

**COMPLETE WITH NON-BLOCKING TOOLCHAIN LIMITATION**

## BR. PHASE 1C READINESS

**READY**, subject to the documented narrow first batch and characterization tests.

## BS. NEXT RECOMMENDED PASS

**PHASE 1C — SHARED UI / FORMATTING EXTRACTION**

## BT. FINAL GIT SAFETY

```text
Branch: main
HEAD: 361bf3f094a8abbb58d20606413686cebc242e66
```

The final dirty state contains all pre-existing changes plus the explicit Phase 1B changes listed in BD–BG. No destructive Git operation was used. Database, Supabase, Storage and production state were not touched.

## Final question

**YES — PROVEN.** The current complete TradesStack application now acts as the Master reference application while consuming a controlled private `@tradesstack/core-contracts` package, with no intentional product behavior change. The proof is the package test, TypeScript build check, successful Next production build and passing boundary check.
