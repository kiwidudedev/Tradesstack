# TradesStack Phase 1E — Pure PDF Utility Characterization

This is the Phase 1E Stage A characterization record. Stage B extraction was not performed because the current utility is not yet a package-portable seam.

# A. PASS 1E VERDICT

PASS 1E COMPLETE — CHARACTERIZED, EXTRACTION DEFERRED.

# B. SOURCE STATE

Branch main, HEAD 361bf3f094a8abbb58d20606413686cebc242e66. The worktree was already dirty with prior product, architecture, package, migration, and artifact changes. Phase 1E preserved them. This pass changed only the existing characterization test and architecture documentation.

# C. PHASE 1D AUTHORITY

Phase 1D identified lib/exports/merge-pdfs.ts and deterministic metadata behavior as the first narrow candidate, while explicitly deferring extraction until characterization proved portability.

# D. PRODUCT PRESERVATION

No production source was moved. No database, migration, Storage, Supabase, authorization, worker, route, UI, business calculation, branding, or document-output behavior was changed.

# E. AUTHORITATIVE PDF UTILITY

The authoritative implementation is lib/exports/merge-pdfs.ts. It exports DeterministicPdfMetadata, applyDeterministicPdfMetadata, and mergePdfDocuments.

# F. CURRENT CALLER INVENTORY

| Caller | Domain | Purpose | Runtime | Input | Output |
| --- | --- | --- | --- | --- | --- |
| lib/exports/payment-claim-pdf.ts | payment claim | merge generated claim PDF parts | server/Node-compatible caller | Uint8Array parts plus metadata and timing | Uint8Array |
| lib/exports/invoice-pdf.ts | invoice PDF | apply deterministic metadata to a generated PDF | server/browser-capable renderer caller | PDFDocument plus metadata | mutated PDFDocument |
| lib/exports/merge-pdfs.test.ts | characterization | create fixtures and verify behavior | Vitest Node | synthetic PDF bytes | assertions |

No retention, takeoff, quote, PO, variation, QA, Files, Storage, or attachment caller directly invokes mergePdfDocuments or applyDeterministicPdfMetadata in the current repository search. Their PDF or file behavior remains separate.

# G. CURRENT RESPONSIBILITY

mergePdfDocuments creates a new PDFDocument, loads each byte input, copies every source page in source order, adds those pages to the new document, and saves the result. applyDeterministicPdfMetadata sets title, author, subject, creator, producer, creation date, and modification date. The implementation does not perform business calculations, validation policy, authorization, Storage access, or HTTP response handling.

# H. DOMAIN DEPENDENCY

The production utility contains no claim, retention, quote, PO, variation, QA, project, organization, supplier, or invoice knowledge. The timing type name is export-oriented but the runtime contract is only start, end, and mark methods.

# I. DATABASE DEPENDENCY

None. No database client, RPC, query, record, or schema import exists.

# J. STORAGE DEPENDENCY

None. No bucket, object, signed URL, upload, download, or Storage import exists.

# K. AUTHORIZATION DEPENDENCY

None. The utility does not determine membership, permissions, tenant ownership, claim eligibility, or document access.

# L. ENVIRONMENT DEPENDENCY

The utility has no process.env, runtime flag, secret, URL, or deployment configuration access.

# M. NEXT.JS DEPENDENCY

There is no next/server, next/headers, next/navigation, server-only, route-handler, or App Router import.

# N. REACT DEPENDENCY

None.

# O. BROWSER DEPENDENCY

None. It does not use window, document, Blob, object URLs, anchors, or print APIs.

# P. NODE DEPENDENCY

The utility has no direct Node API. The test uses node:crypto only for output hashing. The current source remains package-coupled through the app alias used by its type-only PdfExportTiming import.

# Q. PDF-LIB DEPENDENCY

The implementation uses pdf-lib 1.17.1, the repository’s existing locked version. APIs used are PDFDocument.create, PDFDocument.load, copyPages, getPageIndices, addPage, save, and the document metadata setters. No library upgrade or replacement was made.

# R. CURRENT INPUT CONTRACT

mergePdfDocuments accepts Uint8Array[] and optional DeterministicPdfMetadata and optional PdfExportTiming. Metadata dates are caller-provided Date values. It accepts an empty array. Each byte input must be loadable by pdf-lib.

# S. CURRENT OUTPUT CONTRACT

The function returns Promise<Uint8Array>. It always serializes a newly created PDF. applyDeterministicPdfMetadata mutates the supplied PDFDocument and returns void.

# T. VALID PDF CHARACTERIZATION

PASS. A normal merge begins with the PDF signature, reloads successfully, and has the expected page count.

# U. MERGE ORDER CHARACTERIZATION

PASS. Synthetic inputs with 2, 1, and 3 pages produce six pages in exact A1, A2, B1, C1, C2, C3 order. Distinct page dimensions make ordering observable without adding a text-extraction dependency.

# V. SINGLE INPUT CHARACTERIZATION

PASS. A single input is rewritten into a new PDF. The output is not byte-identical to the input, while page count and dimensions remain intact.

# W. EMPTY INPUT CHARACTERIZATION

PASS and recorded as current behavior. An empty input list produces a valid one-page PDF using pdf-lib’s default A4 page dimensions, approximately 595.28 by 841.89 points. The test does not impose a preferred zero-page behavior.

# X. MALFORMED INPUT CHARACTERIZATION

PASS. Empty bytes, plain text bytes, and truncated PDF bytes reject with an Error. No partial output is returned.

# Y. MIXED INPUT CHARACTERIZATION

PASS. A valid PDF followed by malformed bytes and another valid PDF rejects the complete operation. No partial result is exposed.

# Z. PAGE DIMENSION CHARACTERIZATION

PASS. Source page width and height are preserved in source order; the merge does not normalize dimensions or orientation.

# AA. PAGE ROTATION CHARACTERIZATION

PASS for the exercised case. A source page rotated 90 degrees retains a 90-degree page rotation in the merged output. No normalization was added.

# AB. METADATA CHARACTERIZATION

With metadata supplied, the utility sets title, author, subject, creator, producer, creation date, and modification date on the new document. Source metadata is not inherited when no metadata argument is provided. Supplied metadata overwrites source metadata on the merged document.

# AC. TIMESTAMP CHARACTERIZATION

Timestamps are explicitly caller-controlled Date values. The utility does not call the clock. The existing deterministic test waits more than one second and receives identical timestamps and output.

# AD. BYTE DETERMINISM

PASS for identical input bytes and identical explicit metadata. Repeated output is byte-identical and has the same SHA-256 digest. This is deterministic because metadata dates are explicit and no random or current-time value is injected.

# AE. SEMANTIC DETERMINISM

PASS for the characterized inputs: page count, page order, dimensions, rotation, and explicit metadata remain equivalent across repeated runs.

# AF. SOURCE METADATA BEHAVIOR

Source metadata is discarded by the newly created output unless caller metadata is supplied. It is not merged or partially preserved.

# AG. FORMS / ANNOTATIONS CHARACTERIZATION

Not exercised. The utility uses page copying and has no explicit AcroForm or annotation policy. This is a documented characterization gap, not a new feature requirement.

# AH. ENCRYPTED PDF BEHAVIOR

Not exercised. No current direct caller establishes encrypted-PDF support, and no decryption or encryption behavior was added. Encrypted input compatibility remains an explicit future characterization item if a caller requires it.

# AI. LARGE INPUT / MEMORY MODEL

The utility loads every source PDF and copies every page into one in-memory PDFDocument before saving. There is no explicit byte, page, streaming, or concurrency limit. This is acceptable as a characterized current behavior but is a runtime and memory consideration for any future package contract.

# AJ. INPUT MUTATION

PASS. The input Uint8Array is unchanged after merging in the characterization test.

# AK. ERROR CONTRACT

Malformed input rejects asynchronously with an Error from the pdf-lib load path. The current utility does not wrap or normalize third-party error text. Tests assert error classification rather than brittle vendor wording.

# AL. CHARACTERIZATION TEST RESULTS

lib/exports/merge-pdfs.test.ts: 10 tests passed. Covered valid PDF, order, dimensions, rotation, single input, empty input, malformed input, mixed input, input mutation, deterministic metadata, timestamps, repeated output, and reload validity.

# AM. EXTRACTION GATE

| Gate | Result |
| --- | --- |
| Domain-neutral | YES |
| Database-neutral | YES |
| Storage-neutral | YES |
| Authorization-neutral | YES |
| Next-neutral | YES |
| React-neutral | YES |
| Browser-neutral | YES |
| Environment-neutral | YES |
| Input/output explicit | YES |
| Current behavior testable | YES |
| Portable package seam | NO, currently |

The final gate is NO because merge-pdfs.ts imports the application alias @/lib/exports/pdf-export-timing. Even though it is type-only, the source boundary is not package-portable as written. The timing coupling must be separately resolved and characterized before Stage B.

# AN. EXTRACTION DECISION

Extraction deferred. The pure byte behavior is proven, but the package seam is not yet proven. This is not a PDF behavior regression or a domain-coupling failure; it is a package portability blocker.

# AO. PACKAGE NAME

No package was created. If the portability gate later passes, the narrowest likely name is @tradesstack/pdf-utils, not @tradesstack/documents.

# AP. PACKAGE RESPONSIBILITY

Potential future responsibility is limited to characterized PDF byte operations: page merging and, only if still inseparable, explicit deterministic metadata application.

# AQ. PACKAGE NON-RESPONSIBILITIES

Claims, retention, invoices, quotes, POs, variations, Files, Storage, signed URLs, Supabase, authorization, branding lookup, templates, calculations, routes, HTTP responses, filenames, browser print, drawings, takeoff viewer, and worker authorization remain outside.

# AR. PACKAGE PUBLIC EXPORTS

No package exports were introduced. Candidate exports are only the already-characterized operations mergePdfDocuments, applyDeterministicPdfMetadata, and the metadata type, subject to a later portability decision.

# AS. PACKAGE DEPENDENCIES

The only intended runtime dependency is the existing pdf-lib 1.17.1. No dependency changes were made.

# AT. PACKAGE RUNTIME CONTRACT

Current implementation is tested under Node through Vitest. Browser or generic-JS compatibility is not claimed because it was not separately proven.

# AU. PACKAGE APP ALIAS DEPENDENCY

Current source has one app alias dependency: @/lib/exports/pdf-export-timing. This is the exact extraction blocker.

# AV. PACKAGE DOMAIN DEPENDENCY

None found in the utility implementation beyond the timing type’s application location.

# AW. PACKAGE ENV DEPENDENCY

None.

# AX. PACKAGE SIDE EFFECTS

The utility itself does not log, read files, access globals, initialize handlers, or access environment. Runtime behavior is limited to pdf-lib document creation, loading, page copying, metadata setting, and serialization. Timing callbacks are invoked when supplied.

# AY. COMPATIBILITY STRATEGY

Not applicable because Stage B did not occur. If approved later, preserve lib/exports/merge-pdfs.ts as the compatibility path or re-export shim and keep one implementation. Do not migrate callers until the timing boundary is explicit and tested.

# AZ. DUPLICATE IMPLEMENTATION CHECK

No duplicate merge implementation was found. Similar metadata setters in invoice and payment-claim renderers are caller-specific usage of the current helper, not independently extracted implementations.

# BA. PACKAGE BOUNDARY CHECK

Existing npm run check:boundaries passed. No PDF package exists, so no new package boundary was added.

# BB. CLAIM REGRESSION

No claim production source changed. Focused claim regression was not required for a Stage A-only test change; the existing merge caller remains unchanged.

# BC. RETENTION REGRESSION

No retention source changed. No direct merge caller was found.

# BD. INVOICE REGRESSION

No invoice source changed. applyDeterministicPdfMetadata behavior is covered by the focused characterization test and the existing invoice test suite was not altered.

# BE. TAKEOFF REGRESSION

No direct takeoff merge caller was found and no takeoff source changed. The separate pdfjs-dist/viewer/render-worker architecture remains untouched.

# BF. PDF OUTPUT REGRESSION

No production output regression was introduced by the test-only characterization changes. The focused utility tests pass.

# BG. METADATA REGRESSION

Explicit metadata remains deterministic and caller-controlled. No metadata production code changed.

# BH. TARGETED LINT

Targeted ESLint passed for lib/exports/merge-pdfs.ts and lib/exports/merge-pdfs.test.ts.

# BI. TYPE VALIDATION

Repository-wide npx tsc --noEmit was run and failed with the pre-existing baseline: generated Next validator module gaps, unrelated application type errors, Deno/Supabase function typing errors, and other repository-wide errors. No error implicated the characterized utility or its test. No extraction source was added.

# BJ. PACKAGE TEST RESULTS

No package tests exist because no package was created. Existing focused utility tests passed: 10 tests in one file.

# BK. DOMAIN TEST RESULTS

No domain production code changed. Domain test suites were not broadened for a deferred extraction.

# BL. PRODUCTION BUILD

Not run. Stage B did not occur and no production source/config/dependency changed.

# BM. LOCKFILE REVIEW

No lockfile change was made. pdf-lib remains 1.17.1.

# BN. DATABASE IMPACT

None.

# BO. MIGRATION IMPACT

None.

# BP. SUPABASE IMPACT

None.

# BQ. STORAGE IMPACT

None.

# BR. AUTH / PERMISSION IMPACT

None.

# BS. WORKER SECURITY IMPACT

None. TAKEOFF_RENDER_WORKER_TOKEN behavior was not changed.

# BT. RETENTION SECURITY IMPACT

None. The retention_phase4_internal=true boundary was not changed.

# BU. INTEGRATION IMPACT

None. Xero, OpenAI, Resend, Edge Functions, cron, and webhooks were not changed.

# BV. BROWSER PRINT IMPACT

None. Quote, purchase-order, and variation browser-print infrastructure was not changed.

# BW. FILES IMPACT

None. Files versioning, upload, download, and signed URL behavior were not changed.

# BX. DRAWINGS IMPACT

None. Drawing source files, previews, PDF.js, and render workers were not changed.

# BY. QA IMPACT

None. No QA report export was added.

# BZ. ATTACHMENT IMPACT

None. Task, issue, and variation attachment infrastructure was not changed.

# CA. SUPPLIER INVOICE EVIDENCE IMPACT

None. Supplier invoice Storage, evidence, extraction, and supersede behavior were not changed.

# CB. TOOLCHAIN LIMITATION

Current repository values remain Next 16.3.3 in the manifest/lock and installed Next 16.1.6; required npm is 11.x while installed npm is 10.x. These were not changed.

# CC. VITEST SERVER-ONLY LIMITATION

The known unresolved server-only import limitation remains in representative page tests. It does not prevent the pure utility characterization tests, which run in the Node Vitest environment.

# CD. FUTURE CLIENT PORTABILITY

NO, not yet. A future client cannot consume the current source path without the application timing alias. After a separate explicit timing-contract decision, this may become YES.

# CE. APPLICATION FILES CHANGED

No application production files changed. The existing test file lib/exports/merge-pdfs.test.ts was expanded for characterization.

# CF. PACKAGE FILES CHANGED

None.

# CG. CONFIG FILES CHANGED

None.

# CH. TEST FILES CHANGED

lib/exports/merge-pdfs.test.ts only. It now contains the focused ten-test characterization suite.

# CI. DOCUMENTATION CHANGES

Added this Phase 1E characterization record. The Phase 1D document is updated separately with the result.

# CJ. PRE-EXISTING WORKTREE PRESERVED

Yes. No reset, clean, restore, destructive stash, checkout, or history rewrite was used.

# CK. PHASE 1E REGRESSIONS

None observed. The focused characterization suite, targeted ESLint, and existing package-boundary check pass.

# CL. REMAINING PDF / DOCUMENT DEBT

Forms, annotation preservation, encrypted input, and broader cross-runtime testing remain uncharacterized. They are not blockers for the current Stage A conclusion but must be handled before any package claims support for them.

# CM. HUMAN DECISIONS REQUIRED

Decide whether timing belongs in a package-neutral structural contract, remains an application-only optional adapter, or is removed from the future pure utility API. Do not silently move the application timing type into the package.

# CN. PHASE 1E STATUS

Stage A complete. Stage B not started.

# CO. NEXT PASS READINESS

Ready for a narrowly scoped portability decision and follow-up characterization of the timing seam. Not ready for package extraction.

# CP. NEXT RECOMMENDED PASS

Characterize the timing callback as an application adapter or remove it from the package-facing operation, then re-run the import, runtime, and caller gates. Only after that may a package be created.

# CQ. FINAL GIT SAFETY

Expected Phase 1E additions are this document and the expanded existing characterization test, plus the Phase 1D documentation update. All other dirty files pre-date this pass or belong to other work.

# Final question

## NO — CHARACTERIZATION SHOWED THE BOUNDARY IS NOT YET SAFE

The PDF byte behavior is characterized and passes. The package boundary is not yet safe because the current implementation imports the application timing type through an app alias.

# Final operating instruction

Do not extract the PDF utility until the timing dependency has an explicit package-neutral contract and the future-client portability gate passes.

# Phase 1F — Timing Seam Resolution and Conditional Extraction

# A. PASS 1F VERDICT

PASS 1F COMPLETE — PDF CORE UTILITY EXTRACTED AND PORTABLE.

# B. SOURCE STATE

Branch main at HEAD 361bf3f094a8abbb58d20606413686cebc242e66; the pre-existing dirty worktree was preserved.

# C. PHASE 1E AUTHORITY

Phase 1E supplied ten passing behavior tests and identified the application timing type import as the sole portability blocker.

# D. PRODUCT PRESERVATION

Only dependency direction changed. PDF bytes, metadata, errors, timing labels, and caller APIs remain preserved.

# E. TIMING IMPLEMENTATION INVENTORY

lib/exports/pdf-export-timing.ts owns PdfExportTiming, timing kinds, clocks, flags, export IDs, logging, and Server-Timing.

# F. TIMING CALLER INVENTORY

Timing is created by payment-claim API/browser callers and consumed by invoice, payment-claim, and merge-related export code. No retention or takeoff merge caller exists.

# G. MERGE TIMING BEHAVIOR

merge emits start merge, mark merge-start, load start/end, copy start/end per source, save start/end, and merge end.

# H. OBSERVABILITY OWNERSHIP

Timing is diagnostic and response observability, not PDF correctness, authorization, audit identity, or commercial authority.

# I. TIMING SIDE EFFECTS

The package invokes supplied callbacks only. Logging, clocks, environment flags, IDs, and headers remain application behavior. Callback exceptions propagate.

# J. MINIMUM STRUCTURAL CONTRACT

PdfOperationTiming contains only start(stage), mark(stage), and end(stage).

# K. TIMING OPTIONALITY

Timing remains optional.

# L. TIMING CALLBACK ORDER

The package test locks the existing nine-event single-source sequence and labels.

# M. TIMING OUTPUT INDEPENDENCE

Identical inputs and metadata produce byte-identical output with and without timing.

# N. TIMING FAILURE BEHAVIOR

Timing callback errors propagate and reject the operation.

# O. OPTION 1 ASSESSMENT

Selected: the tiny structural contract is sufficient and behavior-preserving.

# P. OPTION 2 ASSESSMENT

Not selected: a callback-only redesign would add churn without reducing coupling.

# Q. OPTION 3 ASSESSMENT

Not selected: timing can be separated without removing existing observability.

# R. OPTION 4 ASSESSMENT

Rejected: application timing is not required inside the pure utility.

# S. SELECTED TIMING DESIGN

@tradesstack/pdf-utils accepts optional PdfOperationTiming; application PdfExportTiming satisfies it structurally.

# T. WHY THIS DESIGN

It preserves behavior, minimizes caller churn, keeps observability application-owned, and removes the app alias.

# U. PORTABILITY GATE

All gates are YES: domain, database, Storage, authorization, Next.js, React, browser, environment, app alias, explicit I/O, timing neutrality, testability, and package portability.

# V. EXTRACTION DECISION

Extracted. lib/exports/merge-pdfs.ts is now a compatibility re-export.

# W. PACKAGE NAME

@tradesstack/pdf-utils.

# X. PACKAGE RESPONSIBILITY

Pure PDF byte merging and explicit deterministic metadata application using pdf-lib.

# Y. PACKAGE PUBLIC EXPORTS

mergePdfDocuments, applyDeterministicPdfMetadata, DeterministicPdfMetadata, and PdfOperationTiming.

# Z. PACKAGE DEPENDENCIES

pdf-lib 1.17.1 only.

# AA. PACKAGE RUNTIME CONTRACT

Node-compatible TypeScript/JavaScript is tested; browser compatibility is not claimed beyond no browser globals.

# AB. APP ALIAS DEPENDENCY

NONE in packages/pdf-utils.

# AC. DOMAIN DEPENDENCY

NONE.

# AD. DATABASE DEPENDENCY

NONE.

# AE. STORAGE DEPENDENCY

NONE.

# AF. AUTHORIZATION DEPENDENCY

NONE.

# AG. ENVIRONMENT DEPENDENCY

NONE.

# AH. NEXT.JS DEPENDENCY

NONE.

# AI. REACT DEPENDENCY

NONE.

# AJ. BROWSER DEPENDENCY

NONE.

# AK. APPLICATION TIMING ADAPTER

lib/exports/pdf-export-timing.ts remains application-owned and structurally satisfies PdfOperationTiming.

# AL. COMPATIBILITY STRATEGY

The old lib/exports/merge-pdfs.ts path re-exports the single package implementation; callers were not mass-rewritten.

# AM. DUPLICATE IMPLEMENTATION CHECK

PASS. Implementation exists only in packages/pdf-utils/src/index.ts.

# AN. PACKAGE BOUNDARY CHECK

PASS. Boundary enforcement rejects app aliases, Next.js, React, Supabase, server-only, environment, and browser globals in pdf-utils.

# AO. PHASE 1E CHARACTERIZATION REGRESSION

PASS. The original merge characterization suite remains green through the compatibility shim.

# AP. TIMING CHARACTERIZATION RESULTS

PASS. Optional timing, callback order, output independence, and callback failure are covered package-locally.

# AQ. CLAIM REGRESSION

PASS. Payment-claim PDF tests passed.

# AR. INVOICE REGRESSION

PASS. Invoice PDF tests passed.

# AS. RETENTION REGRESSION

No direct merge caller; retention was unchanged.

# AT. TAKEOFF REGRESSION

No direct merge caller; takeoff and worker security were unchanged.

# AU. PDF OUTPUT REGRESSION

PASS. Focused tests preserve validity, order, dimensions, rotation, empty input, malformed/mixed failure, metadata, determinism, and immutability.

# AV. METADATA REGRESSION

PASS. Metadata remains explicit and caller-controlled.

# AW. TARGETED LINT

PASS for package, shim, timing, tests, and boundary script.

# AX. TYPE VALIDATION

Repository-wide tsc retains pre-existing generated Next, application, Deno, and Supabase errors; no package-specific error was observed.

# AY. PACKAGE TEST RESULTS

packages/pdf-utils/src/index.test.ts: 4 passed.

# AZ. DOMAIN TEST RESULTS

Merge, timing, invoice, and payment-claim suites: 32 passed; combined focused run: 36 passed.

# BA. PRODUCTION BUILD

Run after extraction; result is reported in the final handoff.

# BB. LOCKFILE REVIEW

pdf-lib remains 1.17.1; the workspace lock records @tradesstack/pdf-utils. npm 10 emitted the known npm 11 engine warning.

# BC. DATABASE IMPACT

NONE.

# BD. MIGRATION IMPACT

NONE.

# BE. SUPABASE IMPACT

NONE.

# BF. STORAGE IMPACT

NONE.

# BG. AUTH / PERMISSION IMPACT

NONE.

# BH. WORKER SECURITY IMPACT

NONE; TAKEOFF_RENDER_WORKER_TOKEN was untouched.

# BI. RETENTION SECURITY IMPACT

NONE; retention_phase4_internal=true behavior was untouched.

# BJ. INTEGRATION IMPACT

NONE; Xero, OpenAI, Resend, Edge Functions, cron, and webhooks were untouched.

# BK. BROWSER PRINT IMPACT

NONE; Quote, PO, and Variation print were untouched.

# BL. FILES IMPACT

NONE.

# BM. DRAWINGS IMPACT

NONE.

# BN. QA IMPACT

NONE.

# BO. ATTACHMENT IMPACT

NONE.

# BP. SUPPLIER INVOICE EVIDENCE IMPACT

NONE.

# BQ. FUTURE CLIENT PORTABILITY

YES. A dedicated client can consume @tradesstack/pdf-utils without importing the Master application or timing implementation.

# BR. TOOLCHAIN LIMITATION

Manifest/lock specify Next 16.3.3 and npm 11.6.2 or later; local install is Next 16.1.6 and npm 10.9.7. Not changed.

# BS. APPLICATION FILES CHANGED

lib/exports/merge-pdfs.ts changed only to a compatibility re-export.

# BT. PACKAGE FILES CHANGED

Added packages/pdf-utils/package.json, src/index.ts, and src/index.test.ts.

# BU. CONFIG FILES CHANGED

Updated tsconfig.json, vitest.config.ts, and package-boundary enforcement.

# BV. TEST FILES CHANGED

Preserved Phase 1E tests and added package timing/public behavior tests.

# BW. DOCUMENTATION CHANGES

This Phase 1F report is appended here; the Phase 1D document receives the final package direction.

# BX. PRE-EXISTING WORKTREE PRESERVED

Yes. No destructive Git operation was used.

# BY. PHASE 1F REGRESSIONS

None observed in the focused affected test set.

# BZ. REMAINING PDF / DOCUMENT DEBT

Forms, annotations, encrypted PDFs, streaming, and filename/header helpers remain out of scope.

# CA. HUMAN DECISIONS REQUIRED

None for this extraction.

# CB. PHASE 1F STATUS

Complete: timing seam resolved and pure PDF utility extracted.

# CC. NEXT PASS READINESS

Ready for future client portability validation without broadening the package.

# CD. NEXT RECOMMENDED PASS

Dogfood @tradesstack/pdf-utils from a dedicated client-style host test; keep document, Storage, and rendering boundaries separate.

# CE. FINAL GIT SAFETY

Phase 1F changes are limited to package source/tests, compatibility shim, boundary/config metadata, lockfile, and architecture documentation.

# Final question

## YES — PDF CORE UTILITY IS PORTABLE

The package now depends only on explicit PDF bytes, metadata, optional structural timing callbacks, and pdf-lib. Application observability remains outside Core.
