# TradesStack Shared UI Extraction

## Phase 1C — Shared UI primitive extraction

**Status: PASS 1C COMPLETE — SHARED UI EXTRACTION PROVEN**

This document records the first real Core source extraction. The extracted primitives preserve their existing implementation, public API, class strings, DOM semantics and compatibility import paths. No domain functionality, business logic, database, security or deployment code was moved.

## A. PASS 1C VERDICT

**PASS 1C COMPLETE — SHARED UI EXTRACTION PROVEN**

All eight Phase 1B candidates were extracted safely. The reference application continues using the old import paths through re-export-only compatibility shims, which now resolve to @tradesstack/shared-ui. The package is source-consumed, private and unpublished.

## B. SOURCE STATE

Branch: main
HEAD: 361bf3f094a8abbb58d20606413686cebc242e66
Initial worktree: dirty

All pre-existing changes were preserved. No destructive Git operation was used.

## C. PHASE 1A / 1B AUTHORITY

Consulted TRADESSTACK_MASTER_CORE_OWNERSHIP.md, TRADESSTACK_MASTER_REPOSITORY_FOUNDATION.md, the Phase 0 AI context, database baseline, bootstrap contract and fresh-install/security acceptance, plus current component source, utilities, tests, Tailwind configuration and consumers.

## D. PRODUCT PRESERVATION

No routes, UI composition, component behavior, business logic, Auth, permissions, database, Storage, worker, integration, cron, Edge Function, project lifecycle, commercial or QA code was intentionally changed. Existing components/ui/* import paths remain available.

## E. PRE-EXTRACTION COMPONENT MATRIX

| Component | Dependencies | Client? | Radix? | Next? | App alias? | CSS/token dependency | Current tests | Decision |
|---|---|---:|---:|---:|---:|---|---|---|
| Badge | React, CVA, cn | No directive | No | No | lib/utils | Existing CSS variables/classes | No direct unit test found | EXTRACT |
| Button | React, Radix Slot, cn | No directive | Yes | No | lib/utils | Existing variants/classes | Consumer coverage | EXTRACT |
| Card | React, cn | No | No | No | lib/utils | Existing classes | Consumer coverage | EXTRACT |
| Checkbox | React, cn | No | No | No | lib/utils | Native input classes | Consumer coverage | EXTRACT |
| Input | React, cn | No | No | No | lib/utils | File/focus/disabled classes | Consumer coverage | EXTRACT |
| Radio | React, cn | No | No | No | lib/utils | Native input classes | Consumer coverage | EXTRACT |
| Switch | React | No directive; interactive | No | No | lib/utils | State classes/tokens | One consumer found | EXTRACT |
| Textarea | React, cn | No | No | No | lib/utils | Focus/disabled classes | Consumer coverage | EXTRACT |

The source audit found no browser API, server action, Supabase, domain type or Next import in these eight implementations. Button’s Radix Slot dependency is explicit in the package.

## F. EXTRACTED COMPONENTS

Badge, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Checkbox, Input, Radio, Switch and Textarea. The shared cn helper moved with the package so the extracted implementations do not duplicate the existing clsx/tailwind-merge authority.

## G. DEFERRED COMPONENTS

None of the eight candidates required deferral. Other UI primitives remain deferred: Radix overlays, signature pad, Next-specific components, marketing/branding surfaces and domain components.

## H. SHARED UI PACKAGE

packages/shared-ui contains README.md, package.json, eight primitive source files, utils.ts, index.ts and index.test.tsx. Identity: @tradesstack/shared-ui, version 0.0.0, private and unpublished.

## I. PACKAGE PUBLIC EXPORTS

The package root explicitly exports the eight primitive families, Card subcomponents, BadgeProps, ButtonProps, InputProps, badgeVariants and cn. No source internals or deferred components are exported.

## J. PACKAGE DEPENDENCIES

Runtime dependencies: @radix-ui/react-slot, class-variance-authority, clsx and tailwind-merge, using existing repository versions. React and React DOM are peer dependencies. No Next, Supabase, server or domain dependency was added.

## K. REACT OWNERSHIP

React and React DOM are host-provided peer dependencies. The package does not bundle a second React copy.

## L. RADIX OWNERSHIP

Radix Slot is an explicit runtime dependency because Button’s existing asChild behavior requires it. No overlay primitives or broader Radix restructuring was introduced.

## M. CLASS / VARIANT UTILITIES

cn is canonically implemented in packages/shared-ui/src/utils.ts. lib/utils.ts is a compatibility re-export. CVA remains used only by Badge, preserving its existing variant contract.

## N. CSS / TAILWIND HOST CONTRACT

The host application must provide the current styles/globals.css variables and Tailwind processing contract, including TradesStack color, typography, radius, border, focus, disabled and shadow tokens. Global CSS, Tailwind theme ownership, fonts and branding remain application-owned.

## O. TAILWIND CLASS DISCOVERY

tailwind.config.ts now includes packages/**/*.{ts,tsx}. The production build generated CSS containing extracted contracts including ui-button, ui-card, orange-primary, radius and brand-token classes. No visual CSS loss was observed.

## P. CLIENT / SERVER BOUNDARY

The extracted source preserves the existing absence of a use-client directive. No server-only or browser-only import was added. Switch remains a controlled native button abstraction with the same callback and ARIA behavior; native form controls remain native inputs/textareas.

## Q. NEXT.JS DEPENDENCY

NONE. The package does not import Next.js. Fonts and Next-specific overlays remain outside this extraction.

## R. APP ALIAS DEPENDENCY

NONE in package implementation. Package source imports are relative or explicit package dependencies. Existing application aliases remain only in compatibility/test configuration.

## S. DOMAIN DEPENDENCY

NONE. The package imports no project, quote, QA, commercial, Auth, server-action, Supabase or domain service code.

## T. CURRENT CONSUMER INVENTORY

Approximate pre-extraction importer counts: Badge 8, Button 137, Card 29, Checkbox 3, Input 80, Radio 4, Switch 1 and Textarea 6. These counts justify compatibility shims rather than mass consumer rewriting.

## U. MIGRATION STRATEGY

Strategy B was selected: compatibility re-exports. Existing consumers remain unchanged and resolve through the package implementation. Future consumers should import from @tradesstack/shared-ui directly.

## V. COMPATIBILITY SHIMS

Re-export-only shims remain at components/ui/badge.tsx, button.tsx, card.tsx, checkbox.tsx, input.tsx, radio.tsx, switch.tsx, textarea.tsx and lib/utils.ts.

## W. CANONICAL IMPORT

Future canonical import: @tradesstack/shared-ui. Compatibility imports remain the existing components/ui/* and lib/utils paths.

## X. DUPLICATE IMPLEMENTATION CHECK

PASS. The old component files are shim-only. No direct application import reaches packages/shared-ui/src/*.

## Y. PACKAGE BOUNDARY CHECK

npm run check:boundaries passed after extending the Phase 1B checker to forbid package imports from app, components/app, lib and future clients paths.

## Z. CORE → APP FORBIDDEN DEPENDENCY

PASS. The checker recursively scans package source and rejects relative or alias imports into application paths.

## AA. SHARED-UI → DOMAIN FORBIDDEN DEPENDENCY

PASS. lib was added to forbidden package roots; shared-ui source has no domain imports.

## AB. COMPONENT API EQUIVALENCE

PASS by source preservation and compatibility test. Component names, props, exported types, forwarded refs, default props, element types and asChild support were preserved.

## AC. VARIANT EQUIVALENCE

PASS. Button variant/size names and defaults, Badge variants/default and all class strings were preserved. Card subcomponent exports were preserved.

## AD. REF / EVENT EQUIVALENCE

PASS by source comparison. Forwarded refs and Switch’s click-to-toggle callback contract remain unchanged.

## AE. FORM STATE EQUIVALENCE

PASS by source comparison and static markup tests. Native input types, file-input handling, checkbox/radio semantics, disabled propagation, Input size handling and Textarea props remain unchanged.

## AF. ACCESSIBILITY EQUIVALENCE

Focused tests verify switch role/aria-checked, disabled/native input semantics and preserved focus classes. No accessibility API was redesigned.

## AG. VISUAL / CLASS EQUIVALENCE

PASS. Existing class strings were carried into the package unchanged. Static markup tests and production CSS inspection confirmed representative classes and tokens remain present.

## AH. SERVER RENDERING / HYDRATION

PASS. renderToStaticMarkup tests passed and the Next production build completed without extraction-attributable diagnostics.

## AI. CURRENCY FORMATTER DECISION

Deferred. lib/format/currency.ts was not moved because currency/tax presentation may encode jurisdiction or commercial semantics.

## AJ. FONT OWNERSHIP

Fonts remain application-owned through lib/fonts.ts, next/font/local and public/fonts. No font assets moved.

## AK. BRANDING OWNERSHIP

TradesStack branding, logos, marketing assets, document branding and future client branding remain outside shared UI.

## AL. PUBLIC ASSET IMPACT

NONE. No public assets moved or changed.

## AM. ROOT WORKSPACE IMPACT

The existing npm packages/* workspace now includes shared-ui. Existing scripts remain intact. TypeScript and Vitest aliases were added for the package root.

## AN. LOCKFILE IMPACT

Lockfile changes are limited to legitimate workspace/package metadata and existing dependency metadata normalization from the local npm version. No dependency versions were upgraded.

## AO. DEPENDENCY CHURN REVIEW

No broad dependency churn was introduced. Shared UI reuses existing root versions of Radix Slot, CVA, clsx and tailwind-merge.

## AP. CORE-CONTRACTS REGRESSION

The Phase 1B core-contracts package and invisible app/layout.tsx consumption remain intact. Its existing package test remains passing.

## AQ. PACKAGE TEST RESULTS

PASS — shared-ui package test: 1 file, 3 tests passed.

## AR. CONSUMER TEST RESULTS

Focused consumer/security run: 2 files passed, 11 tests passed. One existing client page test failed before execution because the current Vitest environment cannot resolve the pre-existing server-only package import from lib/opportunity-lifecycle-compatibility-server.ts. This is unrelated to shared-ui and does not occur in the production build.

## AS. ACCESSIBILITY TEST RESULTS

PASS for extracted contracts. Static markup tests verified switch role/state, native checkbox/radio/input semantics, disabled output and preserved focus-state class contracts.

## AT. TARGETED LINT

PASS — package source, shims, utility, boundary script and config files: 0 errors; only the expected ignored-file warning for tsconfig.json.

## AU. TYPE VALIDATION

PASS — npx tsc --noEmit --pretty false -p tsconfig.build.json.

## AV. PRODUCTION BUILD

PASS — npm run build completed successfully with the existing installed Next.js 16.1.6 and generated the existing route set.

## AW. TOOLCHAIN LIMITATION

The Phase 1B mismatch remains: package/lock Next.js 16.3.3, installed Next.js 16.1.6; repository engine requires npm >=11.6.2, current npm is 10.9.7. No dependency remediation was performed.

## AX. FULL LINT BASELINE

Full npm run lint remains a pre-existing baseline failure across generated artifacts and legacy source. It was not used to assess the extraction; targeted lint passed.

## AY. DATABASE IMPACT

NONE

## AZ. MIGRATION IMPACT

NONE

## BA. SUPABASE IMPACT

NONE

## BB. STORAGE IMPACT

NONE

## BC. AUTH / PERMISSION IMPACT

NONE

## BD. WORKER SECURITY IMPACT

NONE. Phase 0E TAKEOFF_RENDER_WORKER_TOKEN handling was not touched.

## BE. RETENTION SECURITY IMPACT

NONE. The retention_phase4_internal=true trusted boundary was not touched.

## BF. INTEGRATION IMPACT

NONE. Xero, OpenAI, Anthropic, Resend, cron, callbacks and Edge Functions were not modified.

## BG. BUSINESS LOGIC IMPACT

NONE. No currency, GST, commercial, permissions, project, QA or retention logic entered shared UI.

## BH. APPLICATION FILES CHANGED

The eight existing components/ui/*.tsx files became re-export shims. lib/utils.ts became a cn compatibility re-export. No other application behavior files changed.

## BI. PACKAGE FILES CHANGED

packages/shared-ui/package.json, README.md, eight primitive source files, src/utils.ts, src/index.ts and src/index.test.tsx.

## BJ. CONFIG FILES CHANGED

tsconfig.json, vitest.config.ts, tailwind.config.ts and package-lock.json.

## BK. TEST FILES CHANGED

packages/shared-ui/src/index.test.tsx.

## BL. DOCUMENTATION CHANGES

This document and packages/shared-ui/README.md.

## BM. PRE-EXISTING WORKTREE PRESERVED

Confirmed. Existing application changes, Phase 0/1A/1B documents, migrations, artifacts, scripts and generated candidates remain present.

## BN. PHASE 1C REGRESSIONS

NONE IDENTIFIED. The one failed representative test is a pre-existing missing server-only test-environment dependency; production build and extraction-focused tests pass.

## BO. REMAINING SHARED UI DEBT

Radix overlays, signature pad, Next-specific components, global theme ownership, font assets, branding, currency formatting and domain UI remain in the application.

## BP. FUTURE CLIENT PORTABILITY

YES, under the documented host styling contract. Package implementation has no reference-app alias, Next, domain, Supabase or server dependency. A future client must provide React, the package runtime dependencies and the established CSS/Tailwind token contract.

## BQ. PHASE 1C STATUS

COMPLETE

## BR. NEXT PASS READINESS

Ready for a focused audit, not immediate extraction, of document/export boundaries. Files, Storage, signed URLs and generated documents are materially more security-sensitive than shared UI.

## BS. NEXT RECOMMENDED PASS

PHASE 1D — SHARED DOCUMENT / EXPORT BOUNDARY AUDIT & CONTRACT

## BT. FINAL GIT SAFETY

Branch main. HEAD 361bf3f094a8abbb58d20606413686cebc242e66. No destructive Git operation was used. Database, Supabase, Storage, Auth, workers, integrations and production state were not touched.

## Final question

YES — PROVEN. TradesStack has completed its first real Core extraction: reusable UI primitives are owned by @tradesstack/shared-ui and consumed by the Master reference application through canonical package exports and compatibility shims, with production build, boundary, type, markup/accessibility and focused consumer evidence.
