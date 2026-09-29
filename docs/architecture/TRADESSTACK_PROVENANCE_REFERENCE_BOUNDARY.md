# TradesStack Phase 1H — Provenance and Reference Contract Characterization

This is a read-only characterization record. No provenance, reference, database, package, application, or configuration source was changed.

# A. PASS 1H VERDICT

PASS 1H COMPLETE — PROVENANCE IS DOMAIN-OWNED.

The audit found repeated reference-shaped fields but no single semantic contract with compatible purpose, lifecycle, tenancy, authorization, persistence, and future-client value. core-contracts should remain foundation-only.

# B. SOURCE STATE

Branch main at HEAD 361bf3f094a8abbb58d20606413686cebc242e66. The existing dirty worktree was preserved.

# C. PHASE 1G AUTHORITY

Phase 1G required characterization of existing provenance/reference families before any Core extraction and prohibited invented EntityId, EntityReference, or Provenance abstractions.

# D. PRODUCT PRESERVATION

No application code, package code, database, migrations, Supabase, Storage, auth, permissions, workers, integrations, UI, or configuration changed.

# E. IDENTITY DEFINITION

Identity answers which durable record this is. In TradesStack it is normally a database row ID plus its owning domain and tenant context, not a universally meaningful UUID.

# F. REFERENCE DEFINITION

A reference points from one domain record to another record or object. Its meaning includes allowed target type, ownership, lifecycle, and access rules; type plus string ID alone is insufficient.

# G. PROVENANCE DEFINITION

Provenance records where a value or record originated and what source semantics were retained. It may be a live link, snapshot, reference plus snapshot, or derived-record lineage.

# H. LINEAGE DEFINITION

Lineage is a transformation or lifecycle chain, such as Opportunity to Award to Project or Takeoff measurement to commercial item. It is broader than one source field.

# I. OWNERSHIP DEFINITION

Ownership is the organization, project, domain, and permission boundary governing a record or reference. It is security semantics, not a generic provenance field.

# J. SNAPSHOT DEFINITION

A snapshot is captured historical state at a point in time. It is distinct from a live reference and from a revision of the same logical record.

# K. AUDIT ATTRIBUTION DEFINITION

created_by, updated_by, recorded_by, signed_by, approved_by, and actor IDs identify human or system actions. They are audit attribution, not source provenance.

# L. EXTERNAL REFERENCE DEFINITION

Xero IDs, provider IDs, and external IDs map TradesStack records to another system. They are integration mappings, not internal source lineage.

# M. FIELD-NAME INVENTORY

The repository contains source_type/source_id, sourceType/sourceId, source_link_json, sourceLinkJson, source_snapshot, sourceSnapshot, originating_payment_claim_id, source_opportunity_id, source_takeoff_measurement_id, snapshot and snapshot_hash fields, created_by/updated_by, external/provider IDs, Storage paths, and signed URLs. These names occur across different domains and are not equivalent.

# N. DATABASE REFERENCE INVENTORY

| Area | Observed database shape | Enforcement | Meaning |
| --- | --- | --- | --- |
| commercial items | source_type, source_workbook_id, source_worksheet_id, source_sheet_id, source_takeoff_measurement_id, source_range, source_signature, source_version, source_link_json | RPC/application checks and permission policies | commercial source lineage |
| project lineage | source_opportunity_id/originating opportunity fields | lifecycle RPC/migrations and tenant checks | award/project lineage |
| claims/retention | originating_payment_claim_id, origin IDs, state/hash snapshots | SQL functions, project/org checks, immutable snapshots | accounting lineage |
| accounting | source_type, source_reference, source invoice/allocation IDs | database functions and accounting rules | event source and reversal lineage |
| QA | definition/snapshot/version/hash fields | QA workflow and project policies | immutable QA definition lineage |
| Files | node/version/storage_key | document RPCs and ownership policies | file/version/object relationship |
| attachments | task/variation/invoice IDs plus bucket/path | domain RPCs and Storage policies | attachment relationship/evidence |
| drawings | drawing_set/page/measurement IDs and storage paths | project ownership and worker flow | technical source/render lineage |

# O. TYPESCRIPT REFERENCE INVENTORY

Relevant definitions include lib/commercial-items/types.ts CommercialItemPayload and source-link payloads; lib/universal-learning/types.ts UniversalLearningSourceReference; lib/document-intelligence/contracts.ts SourceEvidence and DocumentSourcePart; lib/retention/phase8-retention-documents.ts retention document types; Files workspace/version types; QA evidence types; drawing/takeoff types; and generated Database row aliases. Each retains domain-specific semantics.

# P. CREATION AUTHORITIES

References are created by user/server actions, RPCs, SQL functions, publication processes, workers, imports, or system transformations depending on domain. This variation is itself evidence against one Core creator contract.

# Q. MUTABILITY CLASSIFICATION

Commercial source links can become stale or broken; project origin lineage is lifecycle history; claim/retention snapshots are protected historical state; Files versions activate and supersede; QA snapshots are immutable workflow evidence; attachment links can be deleted with the attachment. These lifecycles are incompatible.

# R. AUTHORIZATION CLASSIFICATION

Reference interpretation frequently requires organization/project membership, domain permissions, accounting state, or trusted internal capability. A generic reference would not carry enough authorization semantics and could expose protected metadata.

# S. TENANCY CLASSIFICATION

Most references must remain within one organization and often one project, opportunity, or commercial context. SQL and RPC code explicitly rejects cross-organization or cross-project claim origins. No cross-tenant generic reference is established.

# T. REFERENTIAL INTEGRITY

Integrity is mixed: some relationships use foreign keys or typed columns, others use RPC/application validation, JSON snapshots, polymorphic source fields, or no structural enforcement. A generic type/id contract would erase these guarantees.

# U. POLYMORPHIC REFERENCES

Commercial source_type/source_id-like fields are genuine polymorphic references, but allowed values, ownership, stale behavior, and downstream rules differ. UCL container types are a closed learning-domain vocabulary, not a universal entity vocabulary.

# V. STRINGLY-TYPED REFERENCES

Some source and provider fields are unrestricted strings or JSON. They represent extensibility, legacy compatibility, or domain metadata; this pass does not normalize them.

# W. TAKEOFF PROVENANCE

Current flow is Drawing set/page/measurement to commercial item or variation/purchase-order destination. Commercial items preserve source_type, source_takeoff_measurement_id, source signature/version, and source link metadata. The source is technical/commercial lineage with project authorization, not generic provenance.

# X. PRICING WORKSHEET PROVENANCE

Worksheet selections retain workbook, worksheet, sheet, range, signature, and version information when published to commercial items. Takeoff and manual sources follow different paths and validation rules. This is pricing/commercial provenance.

# Y. COMMERCIAL ITEM PROVENANCE

CommercialItemPayload in lib/commercial-items/types.ts combines source lineage, stale status, signatures, snapshots, locked metadata, and downstream document links. It is security-sensitive commercial authority and belongs to a future commercial package.

# Z. QUOTE PROVENANCE

Quote flows consume commercial item links and preserve quote/revision/business values. Opportunity and project quote records have different lifecycle and publication contexts; quote source data is not a generic reference.

# AA. PURCHASE ORDER PROVENANCE

Purchase-order lines can link to commercial items and retain source snapshots. The relationship may be a copied commercial commitment with historical values, not a live universal source link.

# AB. VARIATION PROVENANCE

Variation publication can preserve takeoff/commercial source information and variation-specific snapshots. Variation status and authorization govern interpretation.

# AC. SUPPLIER INVOICE PROVENANCE

Supplier invoices relate to suppliers, projects, purchase orders, accounting documents, actual-cost events, and private invoice evidence. These are separate business relationships, accounting lineage, and file evidence; they must not be collapsed.

# AD. CLAIM PROVENANCE

Payment claims preserve claim lines, commercial snapshots, contact/routing/tax snapshots, statutory attachments, accounting relationships, and replacement/revision identity. Claim lineage is accounting/security-sensitive.

# AE. RETENTION PROVENANCE

Retention derives from payment-claim origins and retains eligibility/state/hash snapshots. The internal retention_phase4_internal=true capability is trusted security state, not a generic provenance field.

# AF. QA PROVENANCE

QA flows are Company QA Template to Project QA definition to QA record to definition snapshot to responses/evidence/signatures. This is an immutable QA-domain lineage model.

# AG. QA SNAPSHOT MODEL

QA definition snapshots, versions, hashes, responses, and evidence exist to preserve what was inspected and signed. Their security and immutability semantics differ from commercial source links.

# AH. FILES PROVENANCE

Files are File node to active File version to Storage object. Node identity, version identity, Storage key, signed URL, and attachment relationship are different concepts.

# AI. TASK ATTACHMENT REFERENCES

Task attachments point to a task and Storage object with metadata. They are contextual evidence/relationship records, not necessarily provenance of task content.

# AJ. ISSUE ATTACHMENT REFERENCES

Issue attachment references follow task/project authorization where represented by task infrastructure. The attachment relationship does not establish a generic source lineage.

# AK. VARIATION ATTACHMENT REFERENCES

Variation/PO attachments point to their owning domain and a private Storage object. They are evidence/relationship records.

# AL. SUPPLIER INVOICE EVIDENCE REFERENCES

Supplier invoice document rows point to an invoice and current/superseded private evidence object. This is accounting evidence with replacement semantics.

# AM. DRAWING REFERENCES

Drawing set, page, revision, measurement, preview, and render-job references form a technical document pipeline. Rendered previews are derived artifacts, not generic business provenance.

# AN. PROJECT ORIGIN LINEAGE

Opportunity to Award to Project is lifecycle lineage. source_opportunity_id identifies origin of a promoted project; it is not a universal source reference and is governed by project lifecycle rules.

# AO. QUOTE REVISION LINEAGE

Quote revisions represent versions of a quote/business document. They are revision identity, not necessarily derivation from another entity.

# AP. DOCUMENT REVISION LINEAGE

Files versions, quote revisions, drawing revisions, claim replacements, and supplier invoice supersession each have different lifecycle rules. No universal document revision contract exists.

# AQ. AUDIT ATTRIBUTION

created_by, updated_by, actorUserId, signed_by, recorded_by, and approved_by identify actors or events. They must remain distinct from source identity and lineage.

# AR. EXTERNAL PROVIDER REFERENCES

Xero invoice/contact/account identifiers and other provider IDs are external mappings owned by integrations/accounting. They are not internal provenance.

# AS. STORAGE OBJECT REFERENCES

Bucket and storage_path/storage_key values locate bytes in Storage. They are implementation/security locators and are not durable domain identity.

# AT. SIGNED URL CLASSIFICATION

Signed URLs are ephemeral delivery capabilities issued after authorization. They are neither provenance nor durable file references.

# AU. HASH CLASSIFICATION

Content hashes and snapshot/state hashes provide integrity, identity, comparison, or audit evidence depending on domain. A hash does not define the referenced record semantics.

# AV. METADATA JSON PROVENANCE

metadata, source_link_json, snapshot_json, routing snapshots, tax snapshots, and provider payloads contain hidden domain semantics. JSON shape reuse does not establish a Core contract.

# AW. LOCKED METADATA SEMANTICS

locked_metadata_json preserves commercial source state at a protected boundary. Its meaning includes commercial integrity and permission behavior; it is not generic provenance.

# AX. COPY VS LINK MATRIX

| Flow | Classification | Evidence |
| --- | --- | --- |
| takeoff to commercial item | reference plus snapshot/derived record | source IDs, signature/version, snapshot/link JSON |
| commercial item to quote/PO/variation | reference plus historical snapshot | document link rows and snapshot_at_link_json |
| opportunity to project | lifecycle lineage | source opportunity fields and promotion logic |
| claim to retention | reference plus accounting snapshot | originating claim IDs and hash snapshots |
| QA template to QA record | snapshot copy | definition snapshot/version/hash |
| Files node to version | version relationship | node/version/upload activation model |
| File version to Storage object | storage locator | storage key/path |
| task/variation to attachment | simple relationship/evidence | attachment row plus bucket/path |

# AY. SOURCE DELETION BEHAVIOR

Deletion, archival, cancellation, supersession, and cleanup differ by domain. Historical claim/retention/QA snapshots can survive source mutation; attachments and temporary objects may be deleted; Files versions are lifecycle-managed. No shared delete contract exists.

# AZ. SOURCE MUTATION BEHAVIOR

Stale commercial links detect source change; copied snapshots remain historical; live domain queries can reflect source state; Files versions remain immutable after activation. Mutation semantics are incompatible.

# BA. SOURCE VISIBILITY

Source identity is displayed selectively in commercial and learning interfaces. Private QA, invoice, Files, and Storage metadata are protected. Display provenance is an application/domain view, not persistence authority.

# BB. SOURCE NAVIGATION

Some commercial links navigate back to source worksheets, takeoff measurements, quotes, or projects. Navigation requires domain routing and authorization; it is not a generic Core reference operation.

# BC. SOURCE PERMISSION BEHAVIOR

A downstream user may have access to a record but not its source, especially with private files, QA evidence, supplier invoices, and cross-domain accounting data. Generic reference exposure would be unsafe.

# BD. CROSS-ORG REFERENCES

Current evidence expects no cross-organization references. Claim SQL explicitly validates organization and project boundaries. References must retain domain tenant checks.

# BE. CROSS-PROJECT REFERENCES

Most references are project-local, but pre-award opportunity lineage and some accounting/learning contexts have distinct scopes. Cross-project behavior is domain-specific.

# BF. PRE-AWARD → PROJECT LINEAGE

Opportunity-to-project promotion is lifecycle lineage created by promotion logic and preserved for traceability. It is not generic source metadata.

# BG. SOURCE TYPE VOCABULARIES

| Domain | Field/vocabulary | Enforcement |
| --- | --- | --- |
| commercial | worksheet_selection, takeoff_measurement and document kinds | TypeScript plus RPC/domain validation |
| UCL | fixed container type tuple | TypeScript/domain workflow |
| accounting | source_type/source_reference and source invoice/allocation fields | SQL functions and accounting rules |
| claims/retention | origin/originating claim IDs | SQL validation and project/org checks |
| document intelligence | pdf, spreadsheet, csv, image, email_body | TypeScript/domain source adapter |
| materials | price/source/status unions | materials domain |

# BH. ID REPRESENTATIONS

Most internal IDs are UUID strings from Supabase; provider IDs may be text; source ranges and Storage paths are strings; some references are composite JSON. No branded universal ID type exists.

# BI. NULLABILITY SEMANTICS

Null can mean not applicable, unknown, not yet linked, legacy, no project, no source, or deleted/superseded depending on domain. A generic nullable reference would erase meaning.

# BJ. LEGACY PROVENANCE

Legacy quality photos, project-images references, legacy retention origins, and older source fields must remain classified as legacy. They do not define new Core architecture.

# BK. NEW VS LEGACY QUALITY

New QA definition/evidence/snapshot workflows and legacy quality-photo helpers have separate buckets, metadata, and lifecycle. They are not one provenance model.

# BL. DATABASE VS DOMAIN SEMANTICS

source_type TEXT plus source_id UUID is a database representation. Domain meaning comes from allowed values, authorization, lifecycle, snapshots, and consumers; those differ across every inspected family.

# BM. LIFECYCLE SEMANTICS

Creation authorities, stale detection, publication, supersession, archival, deletion, immutable snapshots, and revisions vary. Lifecycle incompatibility fails a shared Core contract.

# BN. SECURITY SEMANTICS

Commercial lineage, claim/retention origin state, QA evidence, Files versions, Storage paths, and accounting references all participate in security rules. Security meaning cannot be removed from a generic contract.

# BO. SERIALIZATION

References serialize as columns, JSON, RPC parameters, API payloads, route params, Storage keys, and snapshots. Transport representation is not semantic ownership.

# BP. EXISTING REUSABLE TYPES

UniversalLearningSourceReference and DocumentSourcePart/SourceEvidence are reusable within their domains. CommercialItemPayload and domain file/QA types are substantial domain contracts. None is cross-Core.

# BQ. DUPLICATED REFERENCE TYPES

Structurally similar source/link types exist in commercial, UCL, document intelligence, accounting, QA, Files, and claims. They differ in value semantics, lifecycle, tenancy, and security.

# BR. DUPLICATED SOURCE-TYPE UNIONS

Repeated source-type unions represent separate vocabularies or historical drift, not a missing universal union.

# BS. CROSS-DOMAIN IMPORTS

Commercial code imports worksheet/takeoff types; materials imports tax types; document intelligence imports source contracts; learning imports Json/database-shaped values. These are future domain-boundary indicators, not evidence for Core ownership.

# BT. APP ALIAS COUPLING

Most candidate types import @/lib, Supabase, or application services. Even type-only application coupling fails portability under the Phase 1E standard.

# BU. DATABASE COUPLING

Many candidates directly alias Database rows or Json. Such types are persistence contracts and cannot be moved into core-contracts without changing authority.

# BV. VALIDATOR COUPLING

Validators are domain, transport, file, accounting, or integration-specific. No shared validator/type family is proven.

# BW. SECURITY COUPLING

Tenant, permission, claim, QA, Files, Storage, and worker semantics are embedded in interpretation and consumers. Generic Core extraction would be security coupling.

# BX. DOMAIN OWNERSHIP

The narrowest stable owner is commercial for source links, QA for definition snapshots, Files for versions, drawings/takeoff for technical lineage, projects for origin promotion, claims/retention/accounting for origins and snapshots, and integrations for external IDs.

# BY. CROSS-CORE OWNERSHIP

No candidate passes the cross-Core ownership test. At least two packages may need similar-looking references, but not the same semantic contract.

# BZ. FUTURE CLIENT VALUE

A future client needs domain public contracts and configuration boundaries, but current provenance structures are too domain/security-specific to serve as a safe generic client composition contract.

# CA. EXTENSION VALUE

No existing extension consumes a generic provenance/reference contract. Designing extension APIs is outside this pass.

# CB. VERSIONING IMPLICATIONS

Changing each domain provenance model would require domain-specific compatibility review, not Core SemVer. No current candidate has independent Core consumers.

# CC. GENERIC ID HYPOTHESIS

Rejected. EntityId would add no runtime safety, erase domain identity, and permit wrong-ID substitution.

# CD. GENERIC ENTITY REFERENCE HYPOTHESIS

Rejected. type plus id would lose allowed targets, FK/RPC enforcement, tenancy, lifecycle, and permissions.

# CE. GENERIC PROVENANCE HYPOTHESIS

Rejected. sourceType/sourceId cannot express snapshots, signatures, stale status, origin claims, QA definition versions, or source visibility.

# CF. DISCRIMINATED UNION HYPOTHESIS

Rejected for Core. A closed union would need to know every domain vocabulary and become a god-contract.

# CG. DOMAIN-OWNED REFERENCE HYPOTHESIS

Supported. CommercialSourceReference, QA definition snapshot references, FileVersionReference, ProjectOriginLineage, and accounting origin references should remain with their domains.

# CH. SMALL CORE PRIMITIVE HYPOTHESIS

No existing smaller primitive is proven. A display descriptor or opaque reference could be invented, but that would not preserve authoritative semantics and is deferred.

# CI. DISPLAY PROVENANCE

Source labels, navigation targets, and source chips are application/UI projections. They are not persisted provenance contracts.

# CJ. PERSISTED VS DISPLAY PROVENANCE

Persisted source links/snapshots govern lineage and integrity; display provenance is resolved through domain authorization and presentation. Do not merge them.

# CK. PROVENANCE VS AUDIT

Commercial item source lineage answers where a line came from; created_by answers who created it. QA signed_by and claim approved_by are attribution, not source identity.

# CL. PROVENANCE VS VERSIONING

Takeoff-to-commercial derivation differs from Quote revision or Files version. One is source lineage; the others are versions of a logical artifact.

# CM. PROVENANCE VS RELATIONSHIP

Invoice belongs to supplier and attachment belongs to task are relationships. A commercial item derived from a worksheet selection is provenance/lineage.

# CN. PROVENANCE VS EXTERNAL MAPPING

Xero invoice/contact IDs map systems; they do not explain how a TradesStack record was derived.

# CO. PROVENANCE VS STORAGE

File version to Storage object is a locator relationship. It is not business source provenance.

# CP. STRONGEST CANDIDATE MATRIX

| Candidate | Domains | Same shape? | Same meaning? | Same lifecycle? | Same security? | DB neutral? | App neutral? | Core candidate? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| source type/id | commercial, accounting, learning, claims | partly | no | no | no | no | no | no |
| source link plus snapshot | commercial, claims, QA | partly | no | no | no | no | no | no |
| File/version reference | Files, attachments, evidence | partly | no | no | no | no | no | no |
| origin lineage | opportunity/project, claims/retention | partly | no | no | no | no | no | no |
| display source descriptor | UI domains | partly | no | no | no | yes | no | no |

# CQ. SEMANTIC EQUIVALENCE GATE

No candidate achieves same purpose, value semantics, lifecycle, security, tenancy, versioning, database neutrality, application neutrality, and future-client value simultaneously.

# CR. CONTRACT OWNERSHIP RESULT

RESULT C — PROVENANCE MUST REMAIN DOMAIN-OWNED.

# CS. CORE-CONTRACTS RECOMMENDATION

Keep core-contracts foundation-only. Its zero-dependency marker is honest and preferable to a generic dumping ground.

# CT. PHASE 1I DECISION

The next pass should be a DOMAIN PUBLIC CONTRACT PILOT, not another generic provenance extraction pass.

# CU. PHASE 1I EXACT SCOPE

Characterize one low-risk domain public contract family from materials, supplier, or CRM using actual coupling evidence. Inventory public types, runtime validators, database aliases, consumers, and future-client value; select exactly one only after evidence. Do not touch provenance fields or core-contracts in that pass unless a domain public boundary is proven.

# CV. PHASE 1I NON-GOALS

Do not touch Auth/tenancy/permissions, commercial kernel, claims/retention/accounting, Files/Storage, opportunity/project lifecycle, QA immutability, takeoff workers, integrations implementation, AI learning, or generic Core IDs/provenance.

# CW. PHASE 1I REQUIRED VALIDATION

Require exact consumer inventory, domain-owned public export design, validator/type compatibility, no database or security leakage, package boundary checks, focused domain tests, and future-client compilation without Master app imports.

# CX. PACKAGE BOUNDARY CHECK

The existing package-boundary check passes. No boundary change was needed.

# CY. EXISTING PACKAGE TEST RESULTS

Core contracts, shared UI, and PDF utility focused tests pass: 8 tests.

# CZ. TYPESCRIPT BASELINE

Repository-wide TypeScript retains pre-existing unrelated generated Next, application, Deno, Supabase, and test errors. No source changes were made in this pass.

# DA. TOOLCHAIN BASELINE

Manifest/lock specify Next 16.3.3 and npm 11.6.2 or later; local installation remains Next 16.1.6 and npm 10.9.7. Not changed.

# DB. APPLICATION FILES CHANGED

NONE.

# DC. PACKAGE FILES CHANGED

NONE.

# DD. DATABASE FILES CHANGED

NONE.

# DE. CONFIG FILES CHANGED

NONE.

# DF. DOCUMENTATION CHANGES

Added docs/architecture/TRADESSTACK_PROVENANCE_REFERENCE_BOUNDARY.md.

# DG. DATABASE IMPACT

NONE.

# DH. SUPABASE IMPACT

NONE.

# DI. STORAGE IMPACT

NONE.

# DJ. AUTH / PERMISSION IMPACT

NONE.

# DK. WORKER SECURITY IMPACT

NONE.

# DL. RETENTION SECURITY IMPACT

NONE.

# DM. INTEGRATION IMPACT

NONE.

# DN. PROTECTED SYSTEM IMPACT

NONE.

# DO. PRE-EXISTING WORKTREE PRESERVED

Yes. No reset, clean, restore, destructive checkout, stash, or history rewrite was used.

# DP. HUMAN DECISIONS REQUIRED

Only approval of a future low-risk domain public contract pilot. No generic Core provenance decision is required; the evidence supports keeping it domain-owned.

# DQ. PHASE 1H STATUS

Complete as a read-only characterization audit.

# DR. NEXT PASS READINESS

Ready for a domain public contract pilot, not for Core provenance extraction.

# DS. NEXT RECOMMENDED PASS

Begin Phase 1I with the safest evidence-based domain candidate among materials, supplier, or CRM after a focused coupling audit.

# DT. FINAL GIT SAFETY

Expected Phase 1H change is one architecture document only. All other dirty files belong to prior work or other passes.

# Final question

## NO — PROVENANCE SHOULD REMAIN DOMAIN-OWNED

The same field names recur, but actual meanings differ across commercial lineage, claim/retention origins, QA snapshots, Files versions, attachments, project lifecycle, and provider mappings. A generic Core contract would erase lifecycle, tenancy, referential integrity, and security semantics.
