# TradesStack Phase 1G — Core Contract Boundary Audit

This document is the Phase 1G ownership and portability authority. It is an audit only. No contract was moved and no production source was changed.

# A. PASS 1G VERDICT

PASS 1G COMPLETE — CHARACTERIZATION REQUIRED BEFORE CONTRACT EXTRACTION.

The current Core package foundation is valid, but no existing product contract is proven stable, cross-Core, database-neutral, domain-neutral, and client-portable enough to extract safely in Phase 1H.

# B. SOURCE STATE

Branch main at HEAD 361bf3f094a8abbb58d20606413686cebc242e66. The worktree was already dirty with application, package, migration, artifact, and architecture changes from earlier work. They were preserved.

# C. ARCHITECTURE AUTHORITY CONSULTED

Consulted the AI context, Phase 1A core ownership, Phase 1B repository foundation, Phase 1C shared UI extraction, Phase 1D document/export boundary, Phase 1E PDF characterization, Phase 1F PDF extraction, and fresh-install acceptance documents, plus current source.

# D. PRODUCT PRESERVATION

No application code, package code, database, migrations, Supabase, Storage, authorization, permissions, workers, integrations, UI, or generated types changed in Phase 1G.

# E. CORE CONTRACT DEFINITION

A Core contract is a stable, implementation-neutral, database-neutral, deployment-neutral, security-neutral, client-portable contract whose semantic owner is genuinely cross-Core. It must be useful beyond the current reference application and must not merely be a reused local type.

# F. WHAT IS NOT A CORE CONTRACT

Database rows, Supabase generated types, RPC shapes, route params, server action inputs, component props, domain statuses, commercial snapshots, provider payloads, Storage paths, signed URLs, worker tokens, environment configuration, and application view models are not Core contracts by default.

# G. CURRENT CORE-CONTRACTS PACKAGE

packages/core-contracts contains package.json, src/index.ts, and src/index.test.ts. It exports only CORE_CONTRACTS_PACKAGE_VERSION and its marker type. It has no runtime dependencies, no application aliases, and one foundation consumer/test. Its role remains a package-consumption proof, not a product contract container.

# H. CONTRACT INVENTORY SUMMARY

The repository contains many TypeScript shapes, but most are coupled to one of: Supabase rows, domain state machines, application transport, provider schemas, runtime validators, or UI composition. Reuse is common; stable Core ownership is not.

# I. CORE CONTRACT CANDIDATES

No existing product contract is approved for extraction. The strongest future candidates are lightweight references or operation/result primitives, but current source does not establish one canonical shape without merging unrelated domains.

# J. DOMAIN CONTRACTS

Commercial item payloads, quote/PO/variation shapes, opportunity/project lifecycle, materials, QA, Files, drawings/takeoff, claims/retention, accounting, document intelligence, and universal learning types belong with their owning domains.

# K. APPLICATION CONTRACTS

Route request bodies, server action inputs/results, page data, workspace presentation rows, browser print models, and component props are application contracts. Examples include app/api/projects/create/route.ts request data and company register presentation types.

# L. DATABASE CONTRACTS

lib/supabase/types.ts, Database row/insert/update projections, RPC argument/return shapes, and row aliases in domain files are persistence contracts. They are generated or schema-shaped and must not become Core source of truth.

# M. CLIENT CONFIGURATION CONTRACTS

Organization branding, client workflow flags, templates, feature configuration, integration selection, and client-specific composition are future client/configuration concerns. Current organization settings shapes are not proven host contracts.

# N. INTEGRATION CONTRACTS

Xero accounting payloads, OpenAI/AI request and response shapes, Resend/email payloads, and provider-specific metadata belong to integration boundaries. Provider-neutral concepts are not currently defined strongly enough to extract.

# O. DEPLOYMENT CONTRACTS

Environment variables, Supabase URLs/keys, PDF timing flags, worker tokens, cron configuration, and runtime selection are deployment or security contracts, not Core contracts.

# P. TEST CONTRACTS

Fixture rows, mocked clients, E2E contexts, test-only request shapes, and characterization fixtures are test contracts. They may protect production behavior but do not define public Core ownership.

# Q. LEGACY CONTRACTS

Legacy project-images references, project-quality-photos helpers, duplicated legacy types, and compatibility paths are preserved evidence. They must not define new Core contracts.

# R. UNCERTAIN / DEFERRED CONTRACTS

Generic entity references, provenance primitives, file references, operation results, pagination, and client host contracts remain deferred because there is no single current implementation-neutral authority for each.

# S. CONTRACT INVENTORY MATRIX

| Contract | Current path | Current owner | Consumers | Classification | Stability | Portability | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Core package marker | packages/core-contracts/src/index.ts | package foundation | package test | Core foundation | stable | portable now | retain |
| PDF byte operations | packages/pdf-utils/src/index.ts | pdf-utils | PDF callers | package contract | stable | portable now | keep in pdf-utils |
| PdfOperationTiming | packages/pdf-utils/src/index.ts | pdf-utils adapter seam | merge utility/application timing | package contract | stable | portable now | keep minimal |
| PdfExportTiming | lib/exports/pdf-export-timing.ts | application observability | routes/exporters | application/deployment | mostly stable | not appropriate for Core | retain in app |
| Shared UI props | packages/shared-ui/src/*.tsx | shared-ui | app and shim components | UI package | stable within UI | portable with React host | keep in shared-ui |
| Database row aliases | lib/supabase/types.ts and domain aliases | database | domain/application | database | generated | not appropriate | do not move |
| CommercialItemPayload | lib/commercial-items/types.ts | commercial domain | quote/PO/variation services | domain | domain-evolving | not appropriate | future commercial package |
| DocumentSourcePart | lib/document-intelligence/contracts.ts | document intelligence | extraction sources | domain/integration | domain-evolving | not appropriate | keep document domain |
| SourceEvidence | lib/document-intelligence/contracts.ts | document intelligence | interpretation | domain | domain-evolving | not appropriate | do not globalize |
| UniversalLearningSourceReference | lib/universal-learning/types.ts | learning domain | UCL pipelines | domain/database | domain-evolving | not appropriate | retain |
| AppRole | lib/role-permissions.ts | auth/application | permission helpers | security/application | security-sensitive | not appropriate | do not move |
| route request/response types | app/api/**/route.ts | application transport | route and client | application | implementation-coupled | not appropriate | retain |
| Storage/file references | lib/documents, QA, tasks, supplier invoices | owning domains | signed download/upload paths | domain/security | domain-evolving | not appropriate | retain |
| Domain statuses | lib/retention, materials, UCL, commercial, QA | domain owners | domain workflows | domain | domain-evolving | not appropriate | keep local |
| Provider payloads | integrations/Xero/AI/email code | integration | provider adapters | integration | provider-evolving | not appropriate | future integration packages |

# T. ORGANIZATION IDENTITY

Organization IDs are currently UUID-shaped database and authorization values appearing across rows, RPCs, Storage paths, and application context. No stable OrganizationReference contract prevents coupling, and exposing one would risk disguising tenant authority. Defer.

# U. USER / MEMBER IDENTITY

User IDs, member rows, roles, display names, and membership permissions are auth/tenancy concerns. Their current shapes vary by database row, session, and application projection. Do not extract.

# V. TENANT CONTEXT

Current organization/member/user context is assembled by Supabase session and server membership helpers. It includes authorization semantics and cannot be a generic Core context without redesigning Auth.

# W. PERMISSION IDENTIFIERS

Permission identifiers are database-backed/security-sensitive. Current permission catalogs and server checks are not a proven public client contract. Do not move or duplicate them.

# X. ROLE IDENTIFIERS

AppRole in lib/role-permissions.ts is application/security-owned and includes nullable/undefined session states. Database/reference-data roles and TypeScript role literals are separate authorities. Defer.

# Y. ENTITY REFERENCE CONTRACTS

The repository has many ad hoc pairs such as sourceType/sourceId, ownerType/ownerId, and table/sourceId. They differ by domain and security meaning. No canonical entity reference exists; do not invent one in Phase 1G.

# Z. PROVENANCE CONTRACTS

Commercial source links, UCL source references, QA evidence, supplier invoice evidence, Files versions, takeoff lineage, and snapshots all carry provenance, but their fields and authority differ. Similarity is not sufficient for Core ownership.

# AA. COMMERCIAL SOURCE CONTRACTS

CommercialItemPayload and source-link/snapshot types include opportunity/project/workbook/takeoff lineage, stale status, calculations, and persistence details. They are high-risk commercial contracts and belong to a future commercial domain package.

# AB. STATUS CONTRACTS

Status unions are domain state machines: quote, variation, claim, retention, QA, materials, learning, supplier invoice, and commercial statuses must not be centralized.

# AC. MONEY / CURRENCY CONTRACTS

Amounts currently use number, string, database numeric, locale formatting, currency code, tax basis, and jurisdiction-specific semantics. No stable money primitive is established. Defer, consistent with Phase 1D.

# AD. QUANTITY / UNIT CONTRACTS

Quantities and units vary across takeoff, materials, worksheet, commercial, and accounting contexts. Existing unit types are domain-specific and sometimes metric/imperial or tax/comparison-aware. Do not extract.

# AE. DATE / TIME CONTRACTS

ISO strings, database timestamps, local dates, display labels, claim periods, and timing measurements have different semantics. No universal date/time contract is proven.

# AF. PAGINATION / SORT / FILTER CONTRACTS

List inputs and filter shapes are distributed across domains and routes, often carrying domain-specific statuses or organization IDs. No generic stable contract is currently authoritative.

# AG. FILE REFERENCE CONTRACTS

File references include bucket, path, version, signed URL, MIME, evidence, and domain ownership depending on caller. Signed URLs are ephemeral delivery capabilities, not durable Core identity. No extraction.

# AH. DOCUMENT / PDF CONTRACT OWNERSHIP

PDF byte utilities belong to pdf-utils. Business document models, Files versions, Storage, evidence, and rendering remain domain/application-owned. Nothing should be duplicated in core-contracts.

# AI. PROJECT CONTRACTS

Project rows and lifecycle projections are database/domain contracts. Project IDs are used in authorization and Storage paths. Do not extract.

# AJ. OPPORTUNITY CONTRACTS

Opportunity lifecycle and Opportunity-to-Project lineage are protected domain behavior. Current shapes import database rows and application services. Do not extract.

# AK. CRM / CONTACT CONTRACTS

Client, contact, opportunity, and CRM summaries are application/domain projections. Future CRM package ownership is more appropriate than Core.

# AL. SUPPLIER CONTRACTS

Supplier and supplier-product types encode catalog, pricing, lifecycle, and accounting relationships. They are materials/procurement domain contracts.

# AM. MATERIAL CONTRACTS

lib/materials/types.ts contains database rows, import statuses, price sources, tax/comparison semantics, and UI summaries. These are materials-domain contracts.

# AN. QA CONTRACTS

QA definitions, responses, inspections, evidence, signatures, hold points, and cleanup are QA-owned and security-sensitive.

# AO. LEGACY QUALITY CONTRACTS

Legacy quality photo types/helpers use a separate bucket and behavior. Preserve them as legacy; do not reconcile into Core.

# AP. FILES CONTRACTS

Files nodes, versions, upload reservations, activation, quotas, and signed download resolution are Files/database/security contracts.

# AQ. DRAWING / TAKEOFF CONTRACTS

Drawing sets, pages, measurements, shapes, previews, and worker jobs are technical drawing/takeoff contracts with project ownership.

# AR. QUOTE CONTRACTS

Quote editor state, commercial line items, quote revisions, statuses, snapshots, and browser-print models are quote/commercial domain contracts.

# AS. PURCHASE ORDER CONTRACTS

Purchase-order rows, suppliers, line items, publishing, attachments, and print models are procurement domain contracts.

# AT. VARIATION CONTRACTS

Variation state, code, source lineage, attachments, approval semantics, and browser print are variation domain contracts.

# AU. CLAIM / RETENTION CONTRACTS

Claims and retention include authorization, accounting, trusted internal flags, immutable evidence, hashes, and private output. They must remain domain/security-owned.

# AV. ACCOUNTING CONTRACTS

Cost codes, mappings, routing, Xero status, posted events, and accounting documents are accounting/integration contracts. Separate internal accounting from provider payloads.

# AW. INTEGRATION TYPE BOUNDARIES

Current provider-specific types are not Core contracts. A later integration pass may define provider-neutral adapter contracts, but none is stable enough here.

# AX. AI CONTRACTS

AI chat, document interpretation, learning, prompts, schemas, and provider metadata are domain/integration contracts. No generic AI contract is extracted.

# AY. NOTIFICATION CONTRACTS

Email and notification shapes mix product intent, transport, and provider payloads. Keep those ownerships separate.

# AZ. CONFIGURATION CONTRACTS

Product, client, deployment, organization, domain, branding, and integration configuration are distinct. Current shapes are not a single Core host contract.

# BA. ENVIRONMENT CONTRACTS

Environment parsing and deployment variables belong to deployment/runtime. Secrets and worker tokens must never enter Core.

# BB. ROUTE / SERVER ACTION CONTRACTS

Next route params and server action inputs are application/framework transport contracts.

# BC. API TRANSPORT CONTRACTS

API request/response types are route-owned unless a separately supported external API has been established. Current routes are not proven public Core APIs.

# BD. RPC CONTRACTS

RPC arguments and return shapes are database contracts and often encode authorization/state transitions. Do not move.

# BE. GENERATED SUPABASE TYPES

lib/supabase/types.ts remains generated/persistence authority. It is not Core source of truth.

# BF. VALIDATION SCHEMAS

Zod and other validators are distributed across business, transport, UI, integration, and database-adjacent boundaries. No generic schema family is proven.

# BG. TYPE / VALIDATOR CO-OWNERSHIP

Where a type and validator describe the same operation, they should remain with that operation’s owning domain or transport boundary. Do not split them into Core by syntax.

# BH. LITERAL UNION DUPLICATION

Repeated literals such as statuses, roles, units, source types, and provider states have different authorities. Duplication is not sufficient evidence for centralization.

# BI. CROSS-DOMAIN TYPE IMPORTS

Examples include commercial items importing worksheet/takeoff types, materials importing tax types, document intelligence importing source contracts, and learning importing database Json. These indicate future domain seams, not Core contracts.

# BJ. APP ALIAS DEPENDENCIES

Most candidate files import @/lib, Supabase, or application services. The PDF utility is the proven exception and remains in pdf-utils rather than core-contracts.

# BK. RUNTIME DEPENDENCIES

Candidate files commonly include Supabase clients, validators, Node APIs, browser APIs, React, logging, or environment reads. core-contracts should remain runtime-light and currently has none.

# BL. CONTRACT DEPENDENCY GRAPH

Current graph: core-contracts foundation marker has no dependencies; shared-ui depends on UI libraries; pdf-utils depends on pdf-lib; domain types depend on database/domain/integration internals; the application consumes all of them. No product type currently points cleanly into core-contracts.

# BM. CIRCULAR OWNERSHIP

Cross-domain imports around commercial, worksheet, materials, document intelligence, and learning show coupling, but no new cycle was introduced or resolved in this audit. They are future domain-boundary evidence.

# BN. CLIENT HOST CONTRACTS

Current: none. Future ideas such as client identity, Core compatibility, feature registration, branding references, and extension registration are target design ideas, not current contracts.

# BO. EXTENSION CONTRACTS

No existing plugin or extension contract was found. Do not design one in Phase 1G.

# BP. EVENT CONTRACTS

Event-like records exist in domain/database workflows, but no stable cross-Core event architecture exists. Do not invent one.

# BQ. COMMAND CONTRACTS

Server actions and RPCs are application/database commands, not a proven generic command contract.

# BR. ERROR / RESULT CONTRACTS

Repeated success/error objects are incidental across routes and domains. No stable generic operation-result authority is established.

# BS. AUDIT / PROVENANCE IDENTIFIERS

created_by, actor IDs, source IDs, correlation IDs, export IDs, and hashes have different ownership. Export IDs belong PDF observability; hashes belong immutable domain artifacts; actor IDs belong auth/audit.

# BT. JSON CONTRACTS

Json, metadata JSON, snapshots, locked metadata, and provider payloads are persistence/domain blobs. Their openness and domain semantics make them unsuitable for Core.

# BU. SNAPSHOT CONTRACTS

Commercial, QA, retention, and accounting snapshots are domain audit artifacts. They must not be globalized.

# BV. SECURITY CONTRACTS

Security-sensitive permission, trusted-claim, Storage, signed URL, and worker boundaries are not generic Core contracts.

# BW. RETENTION TRUSTED CLAIM CLASSIFICATION

retention_phase4_internal=true is an internal trusted capability boundary, not a client contract.

# BX. WORKER TOKEN CLASSIFICATION

TAKEOFF_RENDER_WORKER_TOKEN is deployment/security infrastructure, not a business or Core contract.

# BY. STORAGE PATH CLASSIFICATION

Storage paths encode tenant/project/domain ownership and are implementation/security details.

# BZ. SIGNED URL CLASSIFICATION

Signed URLs are short-lived delivery capabilities, not durable file references.

# CA. CORE-CONTRACTS OWNERSHIP RULE

A contract lives with the narrowest stable owner that controls its semantics. Core owns only semantics genuinely shared across Core; shared-ui owns UI semantics; pdf-utils owns PDF byte semantics; domains own business semantics.

# CB. CORE-CONTRACTS DEPENDENCY RULE

core-contracts should remain zero-dependency or near-zero-dependency, with no application, database, Supabase, domain, React, Next, environment, or provider imports.

# CC. GOD-PACKAGE SAFEGUARDS

Reject additions justified only by reuse. Require a cross-client use case, explicit semantic owner, portability proof, characterization tests, and no domain/database/security authority. Do not place all statuses, IDs, API shapes, props, or provider payloads there.

# CD. VERSIONING IMPLICATIONS

Any future Core contract change would need public compatibility review and likely Core SemVer consideration. Current deferred candidates have no such proven external consumer.

# CE. DATABASE SCHEMA VERSION RELATIONSHIP

Core package SemVer and Supabase/database schema version remain independent. Generated schema changes do not automatically imply Core contract changes.

# CF. BACKWARD COMPATIBILITY

Future Core contracts should prefer additive evolution and explicit compatibility tests. No adapters or versioning machinery are implemented in Phase 1G.

# CG. CLIENT VERSION-SKEW SENSITIVITY

Statuses, database rows, provider payloads, and domain snapshots are highly version-sensitive. The marker and PDF utility have clearer package boundaries; Core product contracts remain unproven.

# CH. MASTER REFERENCE APP CONTRACT

The reference app must consume future Core contracts through public package exports, as it already does for shared-ui and pdf-utils. Private application internals must not be treated as client API.

# CI. FUTURE CLIENT CONTRACT

Target direction is client app to public Core packages to package implementation. A future client must not import Master app internals or private package files.

# CJ. CONTRACT EXPORT STYLE

Use controlled root exports for stable public contracts and subpath exports only when ownership scale requires it. Do not change core-contracts exports in this audit.

# CK. RUNTIME VALIDATOR STRATEGY

If a future Core contract requires runtime validation, keep validator and type ownership together and choose a minimal dependency deliberately. No current candidate justifies adding a validator.

# CL. ZERO-DEPENDENCY ASSESSMENT

core-contracts can remain zero-dependency today. This is preferable until a real contract proves otherwise.

# CM. PACKAGE OWNERSHIP MAP

core-contracts: foundation and future truly cross-Core contracts only. shared-ui: React/UI primitives and props. pdf-utils: pure PDF bytes and timing adapter seam. Future domains: commercial, projects/opportunities, drawings/takeoff, QA, Files, claims/retention/accounting, materials, integrations, and AI/learning. Database/generated: Supabase persistence shapes. Client app: configuration and composition.

# CN. CROSS-PACKAGE DEPENDENCY POLICY

Preferred direction is core-contracts upward into shared/domain packages and then Master/client apps. pdf-utils is independent of core-contracts. Domain-to-domain imports should use explicit public contracts only when a later audit proves the need.

# CO. FUTURE DOMAIN PACKAGE MAP

Continue evaluating auth-tenancy-permissions, opportunities-projects, takeoff-drawings, pricing-quotes-commercial, procurement-variations, claims-retention-accounting, QA, Files, materials, integrations, and AI-learning as separate future boundaries. Do not create them in Phase 1G.

# CP. TEST INVENTORY

Existing protection includes packages/core-contracts/src/index.test.ts, shared-ui tests, pdf-utils tests, merge PDF tests, domain tests, database characterization tests, and package boundary checks. No test proves a real cross-Core product contract yet.

# CQ. CHARACTERIZATION GAPS

There is no canonical entity reference, provenance primitive, generic result, pagination contract, or client host contract with multiple independent client consumers. These are the exact gaps before a safe Core extraction.

# CR. EXTRACTION RISK MATRIX

| Candidate | Stability | App coupling | DB coupling | Domain coupling | Security coupling | Client value | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| raw IDs/entity references | medium | low | high | medium | high | medium | high |
| generic provenance | low | medium | high | high | high | medium | high |
| generic file reference | low | medium | high | high | high | medium | high |
| operation result | low | medium | low | medium | medium | low | medium |
| pagination/filter | medium | medium | low | medium | low | medium | medium |
| client host contract | target only | unknown | unknown | unknown | high | high | high |
| existing Core marker | high | none | none | none | none | foundation only | low |

# CS. FIRST PHASE 1H CANDIDATE

D. NO SAFE CORE CONTRACT YET — CHARACTERIZATION REQUIRED.

# CT. WHY THIS CANDIDATE

The audit found no existing product contract meeting all Core criteria. Choosing a synthetic EntityReference or Provenance type would invent architecture and hide database/security semantics.

# CU. PHASE 1H EXACT SCOPE

Phase 1H should characterize one narrow existing family only: compare the actual source/reference shapes in lib/commercial-items/types.ts, lib/universal-learning/types.ts, lib/document-intelligence/contracts.ts, and Files/QA reference types. Record whether a shared reference contract exists without introducing one. If evidence identifies one canonical semantics, propose that exact type; otherwise leave core-contracts unchanged.

# CV. PHASE 1H NON-GOALS

Do not move Auth, permissions, generated Supabase types, database schema, Files, commercial kernel, opportunity/project lifecycle, claims/retention, QA, integrations, AI/learning, Storage, client extension frameworks, or provider contracts. Do not create a generic ID, provenance, event, command, result, or validator package by analogy.

# CW. PHASE 1H REQUIRED TESTS

Require consumer inventory, dependency graph, type-only and runtime import checks, database/security neutrality, cross-domain semantic comparison, future-client package compilation, compatibility tests, and package-boundary enforcement. Extraction is allowed only if every gate is proven.

# CX. TOOLCHAIN LIMITATION

Repository manifest/lock specify Next 16.3.3 and npm 11.6.2 or later; the local installation is Next 16.1.6 with npm 10.9.7. Do not fix this in Phase 1G.

# CY. TYPESCRIPT BASELINE

Repository-wide TypeScript has pre-existing generated Next, application, Deno, Supabase, and unrelated test errors. This audit is documentation-only and does not remediate them.

# CZ. LINT BASELINE

Repository-wide lint debt remains outside scope. No source changes require targeted lint.

# DA. APPLICATION FILES CHANGED

None by Phase 1G.

# DB. PACKAGE FILES CHANGED

None by Phase 1G.

# DC. DATABASE FILES CHANGED

None by Phase 1G.

# DD. CONFIG FILES CHANGED

None by Phase 1G.

# DE. DOCUMENTATION CHANGES

Added docs/architecture/TRADESSTACK_CORE_CONTRACT_BOUNDARY.md.

# DF. DATABASE IMPACT

None.

# DG. SUPABASE IMPACT

None.

# DH. STORAGE IMPACT

None.

# DI. AUTH / PERMISSION IMPACT

None.

# DJ. WORKER SECURITY IMPACT

None.

# DK. RETENTION SECURITY IMPACT

None.

# DL. INTEGRATION IMPACT

None.

# DM. PROTECTED SYSTEM IMPACT

None. Earlier protected-system changes were preserved.

# DN. PRE-EXISTING WORKTREE PRESERVED

Yes. No destructive Git operation was used.

# DO. HUMAN DECISIONS REQUIRED

Only the later decision whether a future characterized reference/provenance family is valuable enough to become a public Core contract. No decision is required to leave Core unchanged now.

# DP. PHASE 1G DOCUMENTATION

This document is the Phase 1G authority. It distinguishes current, target, candidate, and deferred architecture throughout.

# DQ. PHASE 1G STATUS

Complete as a read-only audit. No contract extraction occurred.

# DR. PHASE 1H READINESS

Ready for characterization of one reference/provenance family, not ready for unconditional Core contract extraction.

# DS. NEXT RECOMMENDED PASS

Run the exact Phase 1H scope against the four named contract families and decide whether one canonical, security-neutral reference contract exists.

# DT. FINAL GIT SAFETY

Expected Phase 1G change is one architecture document only. All other dirty files belong to prior work or other passes.

# Final question

## NO — FURTHER CHARACTERIZATION REQUIRED

TradesStack has not yet proven a first real product contract for @tradesstack/core-contracts. The foundation package is portable, but the product candidates remain domain, database, security, application, integration, or deployment-owned.
