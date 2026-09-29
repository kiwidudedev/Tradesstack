# TradesStack Phase 1D — Shared Document / Export Boundary Audit

Status: read-only architecture audit. This document records the current implementation boundary; it does not define a refactor already performed.

## A. PASS 1D VERDICT

PASS 1D COMPLETE — CHARACTERIZATION REQUIRED BEFORE EXTRACTION.

The current product has defined, but deliberately separate, business-document, file-workspace, evidence, drawing, and attachment boundaries. No safe wholesale documents package is justified. A narrow pure-PDF utility is the first candidate, subject to characterization gates in Phase 1E.

## B. SOURCE STATE

Audit source state was captured from branch main at HEAD 361bf3f094a8abbb58d20606413686cebc242e66. The worktree was already dirty with Phase 1A, 1B, and 1C architecture work plus unrelated product changes. Those changes are preserved. This pass adds only this documentation file.

## C. ARCHITECTURE AUTHORITY CONSULTED

Consulted AI context, Phase 1A core ownership, Phase 1B repository foundation, Phase 1C shared UI extraction, fresh-install acceptance, and current source. Current source remains implementation authority where documents differ.

## D. PRODUCT PRESERVATION

No business code, database, migration, Storage, Supabase, package, UI, route, branding, calculation, authorization, worker, or output changes are part of this pass.

## E. DOCUMENT TAXONOMY

Generated business documents are calculated or composed from authoritative domain records. User-uploaded documents are user-provided bytes stored against a domain record. Evidence files support a workflow decision or audit event. Drawings are technical source documents with a render/index pipeline. Versioned documents have explicit document-version records. Transient output exists only for a response or browser print. Persisted output is a stored artifact with identity, provenance, and lifecycle semantics.

## F. MASTER DOCUMENT SURFACE MATRIX

| Surface | Kind | Current output | Storage | Owner |
| --- | --- | --- | --- | --- |
| Quote | generated transient | browser HTML / print | no generated PDF storage | quote domain |
| Purchase order | generated transient | browser HTML / print | no generated PDF storage | purchase-order domain |
| Variation | generated transient | browser HTML / print | no generated PDF storage | variation domain |
| Claim invoice | generated transient | server PDF response | no generated PDF storage | claim/invoice domain |
| Files | uploaded, versioned | download of active version | organization-documents | Files domain |
| Drawings | uploaded technical document | private source plus rendered previews | project-drawing-sets | drawing/takeoff domain |
| Supplier invoice | uploaded evidence | private source document | supplier-invoice-documents | supplier-invoice domain |
| QA | evidence file | private evidence/photo | project-qa-evidence and legacy photo bucket | QA domain |
| Tasks/issues | attachment | private attachment | task-attachments | task domain |
| Variation/PO attachments | attachment | private attachment | project-variation-attachments | owning domain |

## G. GENERATED DOCUMENT INVENTORY

Quote, purchase order, variation, payment-claim invoice, retention-claim PDF, and takeoff image/PDF export are generated outputs. They are not one interchangeable document type.

## H. UPLOADED DOCUMENT INVENTORY

Files workspace versions, drawing-set PDFs, supplier invoice PDFs, and user-provided attachments are uploaded bytes. Their metadata, retention, replacement, and authorization are owned by their domain records.

## I. EVIDENCE / ATTACHMENT INVENTORY

Supplier invoices are accounting evidence; QA files are inspection evidence; task/issue/variation attachments are contextual collaboration evidence. Evidence is not equivalent to generated output and must retain source provenance.

## J. DRAWING DOCUMENT INVENTORY

Drawing sets are private technical source files. Pages and previews are derived render artifacts associated with a drawing set and page identity; they are not generic document exports.

## K. QUOTE OUTPUT ARCHITECTURE

Quote presentation is composed in the quote page and lib/quote-pdf-html.ts. It builds escaped HTML, inline print CSS, totals, GST, discounts, contingency, terms, and organization branding. The browser owns final print/PDF production. Quote numbering, status, commercial calculations, and source snapshot remain quote-owned.

## L. PURCHASE ORDER OUTPUT ARCHITECTURE

Purchase-order presentation is composed in the purchase-order page with domain data, supplier/project context, line values, numbering, and organization branding. It is browser-print output. The page remains responsible for composition and the browser remains responsible for final PDF/print generation.

## M. VARIATION OUTPUT ARCHITECTURE

Variation presentation is composed in the variation page with variation code, requested-by information, project context, line values, status, and branding. It is browser-print output. Variation business state and numbering remain variation-owned.

## N. CLAIM PDF ARCHITECTURE

Payment-claim invoice PDF generation is server-side, Node-only, and domain-aware. invoice-pdf-server.ts authorizes the organization member, loads claim data with the admin client, validates eligibility and accounting identity, composes an export model, and delegates drawing to invoice-pdf.ts. Payment claim and retention documents include domain-specific evidence and lifecycle rules.

## O. BROWSER PRINT VS SERVER PDF

Browser print is interactive, client-composed presentation with browser-controlled pagination and PDF bytes. Server PDF is a deterministic response generated after server authorization and business validation. They must not be unified without proof of equivalent calculations, pagination, branding, metadata, and security behavior.

## P. QA EXPORT STATUS

QA currently has evidence/photo storage and retrieval, but no report-export surface. Adding one would be a product decision and is outside Phase 1D.

## Q. FILES ARCHITECTURE

Files use organization-documents, an explicit document node/version model, upload reservations, completion verification, and RPC authorization. Download authorization resolves the node through resolve_document_download before an admin-created five-minute signed URL is returned.

## R. FILE VERSIONING ARCHITECTURE

The Files domain distinguishes node identity from version identity. Upload initiation creates a reservation and version number; completion activates verified content. This is materially different from replacing an arbitrary attachment path.

## S. DRAWINGS ARCHITECTURE

Drawing-set upload validates and stores private PDFs in project-drawing-sets. The takeoff server resolves authorized drawing sets/pages and creates bounded signed URLs. Render jobs create derived page previews through the worker boundary.

## T. SUPPLIER INVOICE FILE ARCHITECTURE

Supplier invoice documents are private accounting evidence. The service validates PDF signature, stores a domain-scoped document row, tracks current/superseded state, and protects editing after accounting export or posted actual-cost events. Storage and database state must move together.

## U. QA EVIDENCE ARCHITECTURE

QA execution uses signed upload URLs, admin-side downloads for processing, project-scoped paths, evidence metadata, and cleanup jobs. Legacy quality photos use project-quality-photos and a separate client helper; they are not interchangeable with execution evidence.

## V. TASK ATTACHMENT ARCHITECTURE

Task upload first resolves the task, derives an organization/project/task path, uploads to task-attachments, and records metadata through an RPC. If metadata creation fails, the uploaded object is removed. Task authorization remains domain/RPC-owned.

## W. ISSUE ATTACHMENT ARCHITECTURE

Issues use the task/attachment model where represented by task records and attachment RPCs. Any issue-specific caller remains responsible for its issue-to-task/project authorization; a generic file service cannot infer that relationship.

## X. OTHER ATTACHMENT ARCHITECTURE

Variation and purchase-order attachment paths use project-variation-attachments in existing callers. Material imports use material-library-imports. These buckets are separate because their retention and authorization owners differ.

## Y. STORAGE BUCKET MATRIX

| Bucket | Classification | Primary owner |
| --- | --- | --- |
| organization-logos | public branding asset | organization settings |
| organization-documents | private versioned files | Files |
| project-drawing-sets | private technical source/preview | drawings/takeoff |
| project-qa-evidence | private QA evidence | QA |
| project-quality-photos | private/legacy QA photos | QA |
| task-attachments | private task evidence | tasks |
| project-variation-attachments | private project/variation attachments | variation/PO |
| supplier-invoice-documents | private accounting evidence | supplier invoices |
| retention-claim-documents | private claim evidence/output | retention claims |
| material-library-imports | private import source | materials |

The project-images reference remains legacy/unconfirmed in the fresh-install bucket catalog and must not be treated as a new shared bucket contract.

## Z. DOWNLOAD ARCHITECTURE

Downloads are domain-authorized first, then return either bytes or a short-lived signed URL. Files uses an authorization RPC followed by an admin signed URL. Claim and retention generated PDFs return private no-store bytes. Drawing, QA, supplier invoice, and attachment downloads use domain-specific authorization and signed URLs.

## AA. UPLOAD ARCHITECTURE

Uploads vary by risk: Files uses reservation/completion RPCs and TUS settings; QA uses signed upload URLs; drawings use project-scoped upload paths; tasks upload through a client bucket call followed by an attachment RPC; supplier invoices use a server-controlled document service. There is no common upload contract yet.

## AB. SIGNED URL ARCHITECTURE

Signed URLs are capabilities issued only after domain authorization. Observed lifetimes include five minutes for Files and commonly sixty minutes for drawing, QA, supplier-invoice, and attachment access. URL creation must remain behind the owning authorization boundary.

## AC. SERVICE-ROLE DOCUMENT USAGE

The admin/service-role client is used server-side for signed URL creation, protected document reads, PDF source retrieval, cleanup, and worker processing. It is not a browser-safe abstraction and must not be placed in a shared client package.

## AD. WORKER DOCUMENT BOUNDARY

The takeoff worker route requires exactly the TAKEOFF_RENDER_WORKER_TOKEN bearer token, rejects missing/invalid tokens with 401, then uses server credentials to process jobs. Browser authentication is not a fallback. This boundary is security-owned and remains application/worker-owned.

## AE. AUTHORIZATION MATRIX

| Surface | Authorization authority |
| --- | --- |
| Quote/PO/Variation | authenticated workspace/project/domain access |
| Claim PDF | organization membership plus claim eligibility |
| Files | resolve_document_download RPC and document ownership |
| Drawings | project/workspace access and drawing-set ownership |
| Supplier invoice | organization and invoice ownership plus accounting lock rules |
| QA | project/org QA authorization |
| Tasks/issues | task/project RPC authorization |
| Worker | dedicated worker token, then server-side job authorization |

## AF. MIME / FILE VALIDATION

Files has an explicit extension-to-MIME allowlist, blocked executable/archive/script segments, and size limits. QA validates image type and ten-megabyte size. Supplier invoice validation requires PDF signature. Task inference is permissive and domain-specific. These policies must not be silently collapsed.

## AG. DOCUMENT NUMBERING OWNERSHIP

Quote, purchase-order, variation, claim, and supplier-invoice numbering are domain/business concerns. Filename sanitization may be shared only as a pure utility after characterization; it must never allocate or change business numbers.

## AH. DOCUMENT STATUS OWNERSHIP

Eligibility and status are domain-owned. Claim export checks claim state; supplier invoice documents respect Xero/export/posting locks; Files versions have upload and activation states; retention documents use claim/capability status. A generic renderer must receive an already-authorized, already-valid view model.

## AI. BUSINESS CALCULATION OWNERSHIP

Line totals, GST/tax, discounts, contingency, claim values, retention, margin, accounting totals, and status rules remain in their respective domains. Rendering code may display supplied values but must not become a calculation authority.

## AJ. CURRENCY FORMATTING OWNERSHIP

Currency code and commercial formatting are domain-owned inputs. invoice-pdf.ts currently formats money with locale-sensitive behavior; quote HTML uses quote formatting helpers. Any shared formatter requires explicit locale/currency characterization.

## AK. DATE / TIME FORMATTING OWNERSHIP

Document issue dates, due dates, claim periods, and version timestamps are domain-owned. Existing browser and PDF surfaces use different helpers and contexts. A shared date formatter is not approved by this audit.

## AL. BRANDING OWNERSHIP

Branding data belongs to organization settings and the consuming domain. Renderers may accept a resolved brand view, but must not query Storage or organization tables as a generic package responsibility.

## AM. ORGANIZATION LOGO BOUNDARY

organization-logos is public by design in current flows. Browser outputs use public URLs; server PDFs resolve a public logo URL through the admin client. Logo fallback and image embedding behavior remain output-specific.

## AN. TEMPLATE OWNERSHIP

Quote, PO, variation, and claim templates are business templates, not generic infrastructure. Shared future primitives may provide layout or byte helpers only when they have no domain fields, authorization, branding policy, or business calculations.

## AO. BROWSER PRINT INFRASTRUCTURE

Current browser print infrastructure is distributed in domain pages, with HTML composition and window print behavior. It depends on browser DOM/window behavior and page-specific state. No extraction is approved in 1D.

## AP. SERVER PDF INFRASTRUCTURE

Server PDF infrastructure includes pdf-lib drawing, server-only data loading, logo retrieval, response headers, deterministic metadata, and timing. Only the byte-level helpers are plausible shared candidates; domain loaders and renderers remain server/domain-owned.

## AQ. PDF LIBRARY INVENTORY

pdf-lib is used by invoice, payment-claim, retention, and takeoff PDF-related code. pdfjs-dist is used for takeoff rendering/viewing. These dependencies have different runtime and semantic roles; replacing or moving them is outside this audit.

## AR. PDF VIEWER VS GENERATOR

Takeoff PDF.js usage is a viewer/render pipeline concern. pdf-lib usage creates or mutates output PDFs. Viewer, source-document rendering, and business-document generation must not share a package boundary by technology name alone.

## AS. GENERATED DOCUMENT → FILES RELATIONSHIP

Generated quote, PO, variation, and claim outputs are not automatically Files versions. Persisting one would require an explicit business decision for snapshot identity, retention, revision, audit, permissions, and provenance. No such conversion is performed.

## AT. AUTHORITATIVE RECORD MATRIX

| Artifact | Authority |
| --- | --- |
| Quote output | quote revision and quote calculations |
| PO output | purchase order record and supplier/project context |
| Variation output | variation record and approved/requested values |
| Claim invoice | claim, project, organization, and accounting state |
| Files content | document node plus active version |
| Drawing preview | drawing set/page/render job |
| Supplier invoice file | supplier invoice document row |
| QA evidence | QA execution/evidence record |
| Task attachment | task attachment record |

## AU. IMMUTABILITY / SNAPSHOT MODEL

Claim and retention outputs carry stronger snapshot/provenance requirements than browser print. Supplier invoice documents have current/superseded semantics. Files versions are explicit. Browser print is a view at print time and is not an immutable stored snapshot.

## AV. REVISION VS FILE VERSION MODEL

A quote revision, claim revision, variation state, Files version, and supplier invoice document replacement are distinct concepts. No common revision model may be introduced without preserving each domain’s state machine.

## AW. PROVENANCE MODEL

Every persisted source or evidence artifact needs domain record identity, owner, uploader or generator, timestamps, and relationship to the business event. Generated transient outputs have provenance in the source record and request context but are not persisted artifacts.

## AX. DELETE / REPLACE / SUPERSEDE MODEL

Files upload abandonment marks an upload failed; task upload cleans up an orphan on metadata failure; supplier invoice replacement supersedes the current document; QA cleanup removes evidence according to job policy; claim documents may be immutable or capability-gated. These semantics are not a generic delete API.

## AY. DOCUMENT SECURITY CLASSIFICATION

Public presentation is limited to intentional organization branding. Authenticated business output is protected by application authorization. Private documents require signed capabilities. Security-sensitive evidence is domain and audit controlled. Privileged generated output is server-only. Technical drawings are private project assets.

## AZ. CLIENT DATA OWNERSHIP

Client-side pages may compose views and request outputs. They do not own database authority, Storage policy, service-role credentials, claim eligibility, accounting locks, or worker authorization.

## BA. CLIENT CONFIGURATION BOUNDARY

Organization name, logo path, locale, currency, terms, and branding are configuration inputs resolved by the application/domain. A future renderer contract may accept these as data, but must not discover them through global environment or database access.

## BB. CLIENT EXTENSION CANDIDATES

Future clients may reuse pure view-model types, filename sanitization, PDF metadata normalization, or byte merging if proven runtime-neutral. They must supply authorization, domain calculations, templates, branding, and storage adapters.

## BC. CLIENT-SPECIFIC BRANCHING

Browser print, server PDF, and future client output may legitimately branch for runtime, layout, accessibility, and security reasons. Portability does not require visual or byte identity.

## BD. DOCUMENT CONTRACT CANDIDATES

Candidate contracts are: pure PDF byte utilities; pure filename/content-disposition helpers; explicit renderer input models; and possibly a browser print adapter. Files, signed URLs, authorization, document numbering, and domain templates are not approved as first shared contracts.

## BE. CONTRACT GRANULARITY

The correct granularity is below a business document and above a raw library call: deterministic, side-effect-free helpers with explicit input/output and no Next.js, React, Storage, database, or domain imports.

## BF. VIEW MODEL BOUNDARY

The renderer boundary should accept a complete, already-authorized view model containing display values, resolved branding data, and explicit metadata. It should not load records, calculate totals, sign URLs, or decide eligibility.

## BG. DATA ACCESS BOUNDARY

Data access stays in server/domain services and RPCs. Pure renderers and utilities must not import Supabase clients, server-only markers, environment variables, routes, or application aliases.

## BH. SERVER / CLIENT / WORKER MATRIX

| Layer | Allowed responsibility |
| --- | --- |
| browser | compose and print browser-owned views; request authorized downloads |
| server | authorize, load records, calculate/validate, generate protected PDF responses |
| worker | process token-authorized drawing render jobs with service credentials |
| pure package candidate | deterministic transformation of explicit data/bytes only |

## BI. NEXT.JS COUPLING

API routes, NextResponse, route params, headers, server-only markers, and app aliases are application boundaries. They cannot be moved into a portable document package.

## BJ. REACT COUPLING

Existing document surfaces are embedded in React page components. React should remain a host/composition concern; no React dependency is justified for a pure PDF utility.

## BK. NODE COUPLING

Server PDF generation and filesystem/logo loading are Node/server concerns. A future shared PDF utility may use a library only if its runtime contract and dependency behavior are characterized.

## BL. BROWSER COUPLING

Browser print and download helpers depend on window, Blob, object URLs, anchors, and browser pagination. They are not server-safe and are not part of the first extraction candidate.

## BM. PACKAGE CANDIDATE MAP

| Candidate | Decision |
| --- | --- |
| generic documents package | reject; boundary is too broad |
| Files package | defer; authorization/version/storage are coupled |
| browser print package | defer; page/template semantics not characterized |
| whole claim PDF package | reject; domain and server security coupled |
| pure PDF byte utility | first candidate, characterization required |
| generic Storage package | reject for 1E; bucket policies/domain ownership differ |

## BN. DOCUMENT DOMAIN OWNERSHIP MATRIX

Quotes own quote output; purchase orders own PO output; variations own variation output; claims/retention own claim documents; Files owns nodes and versions; drawings own source/render lifecycle; supplier invoices own accounting evidence; QA owns evidence; tasks own task attachments.

## BO. SECURITY OWNERSHIP MATRIX

Organization/project membership, claim eligibility, accounting locks, document RPCs, QA execution permissions, task/variation ownership, signed URL creation, and worker tokens remain application/domain/security-owned.

## BP. RENDERING OWNERSHIP MATRIX

Quote/PO/variation rendering is page/template-owned. Claim and retention PDF layout is export-domain-owned. Drawing preview rendering is worker-owned. A pure PDF utility may own byte manipulation only.

## BQ. FORMAT OWNERSHIP MATRIX

PDF format and browser HTML print are output-specific. Uploaded MIME policy is domain-specific. Excel export is a separate existing surface. No universal document format abstraction is supported by current evidence.

## BR. BRANDING OWNERSHIP MATRIX

Organization settings own logo/name configuration; each output owns placement, fallback, dimensions, and loading behavior. Shared code must receive resolved branding data rather than query Storage.

## BS. DOCUMENT DEPENDENCY GRAPH

Quote/PO/variation: domain record -> page composition -> browser print. Claim: domain record -> authorization/calculation -> server view model -> pdf-lib renderer -> PDF response. Files: RPC -> version/object -> signed URL. Drawings: source object -> job -> worker -> preview. Evidence: domain event -> upload/object -> signed read.

## BT. SHARED DEPENDENCY GRAPH

Potential shared nodes are pdf-lib, deterministic PDF metadata, PDF byte merge, filename sanitization, and timing. They currently have different callers and require characterization before package ownership is assigned.

## BU. CROSS-DOMAIN COUPLING

Branding crosses organization settings and every output. Storage crosses every uploaded-file surface. Authentication crosses every protected download. PDF libraries cross several generated outputs. These shared dependencies do not imply shared business ownership.

## BV. TRUE DUPLICATION

Repeated patterns include safe response filenames, PDF response headers, PDF metadata, logo fallback, signed URL calls, and file-name sanitization. Only the side-effect-free portions are possible extraction candidates.

## BW. FALSE DUPLICATION

Repeated PDF drawing, totals, dates, branding placement, and storage calls are not proven duplication: they encode different domains, runtimes, authorization, or output semantics.

## BX. TEST INVENTORY

Existing tests cover portions of PDF generation, security helpers, document workflows, task/QA behavior, and Phase 1C shared UI. Source inspection found no complete cross-surface visual, byte, semantic, or storage contract suite.

## BY. CHARACTERIZATION GAPS

Before extraction, add characterization for PDF metadata, merged bytes, page count/order, malformed input, filename headers, renderer output, logo failure, locale/currency, claim eligibility, and server/client runtime import safety.

## BZ. FUTURE VISUAL EQUIVALENCE STRATEGY

For any template move, capture representative browser print and server-rendered fixtures, compare rasterized pages with an agreed tolerance, and review intentional differences. Do not use visual equivalence as a proxy for authorization or calculation correctness.

## CA. FUTURE PDF SEMANTIC TEST STRATEGY

Parse output and assert page count, text presence, source ordering, metadata, totals supplied by the domain, and attachment inclusion. Test deterministic inputs independently from business calculation tests.

## CB. FUTURE PRINT SEMANTIC TEST STRATEGY

Use representative browser fixtures and assert required labels, escaped content, print CSS, page-break behavior, logo fallback, and no unsafe markup. Browser snapshots do not establish server-PDF equivalence.

## CC. FUTURE STORAGE TEST GATE

Any storage-boundary change requires authorization-before-signing, private bucket, MIME/size, path ownership, expiry, deletion/replacement, and service-role containment tests against the actual domain contract.

## CD. MASTER REFERENCE APP CONTRACT

The reference app remains the implementation authority for current rendering, storage, and security behavior. Future packages may be proven against it but must not silently replace it.

## CE. FUTURE CLIENT HOST CONTRACT

A future client host must supply authenticated domain data, authorization, configuration, and runtime adapters. It may consume pure contracts but must not receive service credentials or bypass domain policies.

## CF. FUTURE CLIENT PORTABILITY

Pure contracts can be portable if they avoid app aliases, React, Next.js, Storage, Supabase, browser globals, and server-only imports. Current document surfaces do not yet meet that condition as wholes.

## CG. APP ALIAS EXTRACTION BLOCKERS

Current export files import application aliases such as lib paths and domain types. Alias-free type and utility extraction must be proved before moving anything to a package.

## CH. DOMAIN IMPORT EXTRACTION BLOCKERS

Invoice, claim, quote, variation, supplier invoice, and drawing modules import domain models and data access. Those imports are blockers for wholesale extraction.

## CI. ENVIRONMENT DEPENDENCIES

Supabase URLs/keys, service role, worker token, PDF timing flag, runtime selection, and browser APIs affect behavior. A shared package must not read these implicitly.

## CJ. EXTERNAL PROVIDER RELATIONSHIPS

Supabase Storage and database are authoritative infrastructure. Xero status affects supplier invoice editability. Email and AI may consume documents or extracted data, but neither is a generic document authority.

## CK. EMAIL / DOCUMENT RELATIONSHIP

Email attachments, if added by callers, should consume an already-authorized byte artifact or signed source. Email delivery and document generation remain separate contracts.

## CL. XERO / DOCUMENT RELATIONSHIP

Supplier invoice document replacement is constrained by Xero export status and posted actual-cost events. This coupling is accounting-domain-owned and must not move into generic file infrastructure.

## CM. AI / DOCUMENT RELATIONSHIP

Supplier invoice extraction is an AI-assisted evidence workflow with schema/version/status metadata. Extracted values are not the source PDF and must not be treated as generic document output.

## CN. DOWNLOAD FILENAME OWNERSHIP

Business domains choose semantic filenames. Response helpers may sanitize them for headers but must not invent business identity or numbering.

## CO. FILE SANITIZATION

Existing sanitizers are duplicated and differ by caller. Characterize required control-character, path-separator, length, Unicode, and fallback behavior before extracting a common helper.

## CP. CONTENT-DISPOSITION OWNERSHIP

Routes own response headers and attachment/inline policy. A future pure helper may format a safe header value only after tests; it must not choose download policy.

## CQ. CACHE / PRIVATE DATA BEHAVIOR

Generated claim and retention responses use private, no-store, and nosniff headers. Signed URLs are time-limited. Private evidence and Files downloads must not acquire public caching through a shared abstraction.

## CR. ERROR HANDLING

Domain routes map authorization, not-found, ineligible, validation, and generation failures to different statuses. A generic renderer must not collapse these distinctions.

## CS. OBSERVABILITY / AUDIT

PDF timing uses export IDs, stage marks, durations, and Server-Timing. Supplier invoice and QA workflows record domain events/cleanup state. Observability ownership follows the operation boundary.

## CT. PROJECT-IMAGES LEGACY STATUS

project-images is referenced by legacy project code but was not present in the fresh-install bucket catalog reviewed for this audit. It is not promoted to a shared contract or new bucket.

## CU. EXTRACTION RISK MATRIX

| Candidate | Risk | Decision |
| --- | --- | --- |
| generic documents | critical authority/security ambiguity | reject |
| Files/storage | critical RLS/version/delete coupling | defer |
| browser print | high template/browser variance | defer |
| claim PDF wholesale | critical domain/security coupling | reject |
| pure PDF bytes | medium library/runtime/semantic risk | characterize first |
| filename helper | low-to-medium behavior drift | characterize alongside, not first scope |

## CV. FIRST EXTRACTION CANDIDATE

Candidate E/F boundary: a small pure PDF byte utility centered on merge-pdfs.ts and deterministic PDF metadata behavior, only after characterization proves it is runtime-neutral and semantically unchanged. No domain renderer moves in Phase 1E.

## CW. WHY THIS CANDIDATE

It is the narrowest observed reuse: explicit PDF bytes in, explicit PDF bytes out, no authorization, database, Storage, business calculations, templates, or branding policy. It still touches pdf-lib and therefore needs tests before extraction.

## CX. PHASE 1E EXACT SCOPE

1. Characterize current merge and metadata behavior with fixed PDF fixtures.
2. Verify import/runtime behavior in server and any intended host runtime.
3. Define a package-neutral contract only if tests pass.
4. Extract only the proven pure utility, preserving current imports through an intentional compatibility path if required.
5. Run existing affected export tests and byte/semantic tests.

## CY. PHASE 1E NON-GOALS

Do not move invoice, claim, retention, quote, PO, variation, Files, Storage, signed URLs, authorization, worker logic, branding, calculations, templates, routes, database code, or browser print code. Do not change PDF appearance, metadata policy, filenames, or response headers.

## CZ. PHASE 1E REQUIRED TESTS

Required gates are deterministic metadata, merge order, page count, malformed/empty input, byte output validity, no accidental domain imports, no browser/server-only globals, affected payment/invoice/retention tests, and a current-worktree diff proving no unrelated files changed.

## DA. FUTURE DOCUMENT ROADMAP

First characterize pure PDF bytes. Next, if evidence supports it, define pure filename/header utilities. Later consider explicit renderer view-model contracts. Keep domain templates, authorization, Storage, Files versioning, drawings, evidence, and worker processing separate unless a later audit proves otherwise.

## DB. TOOLCHAIN LIMITATION

The local manifest/lock and installed toolchain have an npm/Next version mismatch, and the package engine expects npm 11 while the environment has npm 10. This is recorded as a validation limitation, not changed here.

## DC. VITEST SERVER-ONLY LIMITATION

A representative page test is blocked by an existing unresolved server-only import through lib/opportunity-lifecycle-compatibility-server.ts. This audit therefore relies on source inspection and existing targeted evidence; it does not alter that dependency.

## DD. APPLICATION FILES CHANGED

None by Phase 1D. Existing dirty application files from prior work are preserved and are not attributed to this pass.

## DE. DATABASE FILES CHANGED

None by Phase 1D. No migration, SQL, generated schema, or database source was changed.

## DF. PACKAGE FILES CHANGED

None by Phase 1D. No package was created, extracted, or dependency-updated.

## DG. CONFIG FILES CHANGED

None by Phase 1D. Existing configuration changes remain untouched.

## DH. DOCUMENTATION CHANGES

Added this audit document only: docs/architecture/TRADESSTACK_DOCUMENT_EXPORT_BOUNDARY.md.

## DI. DATABASE IMPACT

None.

## DJ. SUPABASE IMPACT

None. Existing bucket, policy, RPC, signed URL, and service-role behavior is documented only.

## DK. STORAGE IMPACT

None. No objects moved, deleted, re-keyed, or reclassified.

## DL. AUTH / PERMISSION IMPACT

None. Current authorization ownership and boundaries are recorded without modification.

## DM. WORKER SECURITY IMPACT

None. The dedicated worker-token boundary is preserved.

## DN. RETENTION SECURITY IMPACT

None. Retention document authorization, private output, and hash/provenance behavior remain unchanged.

## DO. INTEGRATION IMPACT

None. Xero, email, AI extraction, and other integrations were not changed.

## DP. PROTECTED SYSTEM IMPACT

None. Core ownership, repository boundaries, shared UI, and fresh-install assumptions are not changed.

## DQ. PRE-EXISTING WORKTREE PRESERVED

Yes. Existing tracked and untracked worktree changes were inspected and preserved; no reset, clean, restore, checkout, or destructive stash was used.

## DR. HUMAN DECISIONS REQUIRED

Before any later extraction, approve whether the product wants a shared pure-PDF utility and what runtime support, metadata policy, and compatibility guarantees it must provide.

## DS. PHASE 1D DOCUMENTATION

This file is the Phase 1D architecture record and should be reviewed alongside the Phase 1A, 1B, 1C, and fresh-install documents.

## DT. PHASE 1D STATUS

Complete as a read-only boundary audit. No implementation extraction was attempted.

## DU. PHASE 1E READINESS

Ready for a characterization-first Phase 1E, not ready for an unconditional package extraction.

## DV. NEXT RECOMMENDED PASS

Run the exact Phase 1E characterization scope above against merge-pdfs.ts and deterministic PDF metadata, then reassess package ownership from test evidence.

## DW. FINAL GIT SAFETY

Expected Phase 1D diff: one new architecture document. Any other diff is pre-existing or belongs to another pass and must remain attributed accordingly.

# Final question

## YES — SAFE PHASE 1E BOUNDARY DEFINED

Yes, conditionally: a narrow pure-PDF byte utility boundary is defined, with characterization required before extraction.

## NO — FURTHER CHARACTERIZATION REQUIRED

Further characterization is required before implementation. This is not a blocker for Phase 1D; it is the explicit Phase 1E gate.

# Final instruction

Do not extract or refactor document infrastructure until the Phase 1E characterization tests establish that the proposed pure boundary is runtime-neutral, domain-neutral, and behavior-preserving.

## Phase 1F status

The timing seam is resolved. @tradesstack/pdf-utils owns only the characterized pure PDF byte operations and accepts the package-neutral PdfOperationTiming contract. The application PdfExportTiming implementation remains application-owned. lib/exports/merge-pdfs.ts is now a compatibility re-export, with dependency direction Master or future client to @tradesstack/pdf-utils to pdf-lib.

## Phase 1E characterization update

Phase 1E characterized lib/exports/merge-pdfs.ts without moving production source. Ten focused tests pass for valid output, merge order, single input, empty input, malformed and mixed input, dimensions, rotation, metadata, timestamps, repeatability, input immutability, return type, and error classification. The utility is domain-, database-, Storage-, authorization-, Next.js-, React-, browser-, and environment-neutral in behavior.

Extraction remains deferred because the authoritative source imports the application alias @/lib/exports/pdf-export-timing. That type-only application dependency prevents a package-portable boundary as currently written. The exact blocker and next gate are recorded in docs/architecture/TRADESSTACK_PDF_UTILITY_EXTRACTION.md.
