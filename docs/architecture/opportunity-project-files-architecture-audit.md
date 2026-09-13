# Opportunity Files to Project Files Architecture Audit

Date: 21 August 2026  
Scope: read-only code, migration, storage, security, conversion, and test audit

## Audit boundary and repository-state caveat

This audit did not modify application code, migrations, database records, or Storage objects. No database, Storage, or browser tests were executed because those suites create and delete fixtures. The conclusions below come from static tracing of the current working tree and its tests.

The working tree is not a clean representation of a released baseline. The whole shared document subsystem, both Files routes, its migrations, and its end-to-end tests are currently untracked. Navigation and conversion files are modified. In other words, the repository contains a substantial candidate implementation, but `git ls-files` shows that the candidate Files foundation is not committed. Any release-readiness decision must therefore treat the architecture as present in the working tree but not yet safely integrated into version control or proven to be deployed.

## A. Executive Verdict

**SHARED WORKSPACE FOUNDATION REQUIRED**

That foundation is required because copy-on-conversion and project-ID-based storage would reproduce the existing drawing-set collision and post-commit failure class. The current working tree already contains the right candidate foundation:

```text
Opportunity ─┐
             ├─ document_workspace_entities ─ document_workspaces
Project ─────┘                                  ├─ document_nodes
                                                └─ document_versions
                                                     └─ organization-documents/{orgId}/{workspaceId}/{versionId}
```

The candidate is structurally sound and should be completed rather than replaced. It is a shared workspace model with concrete Opportunity and Project foreign keys, not a weak polymorphic owner. Conversion inserts one additional Project-to-workspace link inside the conversion database transaction; node IDs, version IDs, folder hierarchy, metadata, storage keys, and bytes do not change.

The verdict is not “ready for small extension” because:

1. In the tracked baseline, the shared foundation and both Files routes are absent/uncommitted.
2. Existing `project_drawing_sets` and module-owned attachments are separate systems and are not backfilled or surfaced in Files.
3. Legacy drawing/trade-pack conversion still copies Storage objects after the award transaction commits.
4. Opportunity Files resolution requires `files.write`, even for an existing workspace, while Project resolution supports a `files.view` reader.
5. Access is organisation-role based, not Opportunity-owner or Project-role based; post-conversion Opportunity access remains live and mutable.
6. The inspected tests are broad, but they were not run during this read-only audit and several lifecycle/security cases remain missing.

Subject to those gaps, the long-term architecture is already the simplest correct one.

## B. Current Project Files Architecture

### UI-to-storage flow

```text
/app/projects/[projectId]/files
  -> ProjectFilesPage server component
     -> resolve project slug and organisation membership
     -> get_or_create_project_document_workspace(project UUID)
     -> get_document_storage_usage(workspace UUID)
     -> list_document_workspace_nodes / list_deleted_document_batches
     -> get_document_folder_breadcrumbs
     -> list_document_workspace_folders
  -> <FilesWorkspace entity={project} workspaceId=...>
     -> create/rename/move/soft-delete/restore/purge server actions
     -> FileUploadQueue
        -> POST /api/documents/uploads/initiate
        -> initiate_document_upload RPC reserves node/version/key
        -> browser TUS upload directly to private Supabase bucket
        -> POST /api/documents/uploads/[versionId]/complete
        -> service-role complete_document_upload verifies exact Storage object
     -> POST /api/documents/nodes/[nodeId]/download
        -> resolve_document_download RPC authorizes current active version
        -> service-role creates a five-minute signed URL
```

Primary route: `app/app/(workspace)/projects/[projectId]/files/page.tsx:15-80`. It resolves a real Project through `getTradePackWorkspaceBySlugForCurrentUser`, resolves or creates the workspace, and passes RPC-backed listing data to the shared client component.

The UI is already generic. `components/app/files/FilesWorkspace.tsx:118-637` accepts a typed entity context and has no Project-only labels. Route generation is centralized in `lib/documents/workspace.ts:95-103`. The same component implements search, type filtering, sorting, pagination, breadcrumbs, folder creation, uploads, details, download, rename, metadata-only move, soft delete, recycle-bin restore, and owner-only purge.

The Project layout adds Files to both the section map and top navigation at `components/app/ProjectLayoutShell.tsx:8-22` and `components/app/ProjectSecondaryNav.tsx:32-45`.

### Server and mutation boundaries

- Listing and workspace resolution wrappers: `lib/documents/workspace-server.ts:33-217`.
- Shared mutation actions: `lib/documents/workspace-actions.ts:45-160`.
- Upload reservation, activation, and signed download: `lib/documents/server.ts:26-131`.
- Browser-side resumable TUS transport: `lib/documents/upload-client.ts:36-171`.
- Upload UI and per-file idempotency persistence: `components/app/files/FileUploadQueue.tsx:48-203`.
- Upload APIs: `app/api/documents/uploads/initiate/route.ts:14-70`, `app/api/documents/uploads/[versionId]/complete/route.ts:9-62`, and `app/api/documents/uploads/[versionId]/abandon/route.ts:8-35`.
- Download API: `app/api/documents/nodes/[nodeId]/download/route.ts:9-59`.
- Cleanup worker: `lib/documents/cleanup-worker.ts:87-230`; cron entry point: `app/api/cron/document-storage-cleanup/run/route.ts:18-73`.

The architecture is not coupled to `organization_projects`. Entity resolution is entity-specific, but all file/folder operations are workspace-specific. This is a reusable workspace abstraction with a typed Opportunity/Project routing adapter.

## C. Current Opportunity Architecture

The Opportunity workspace is rooted at `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/layout.tsx:7-35`. The URL parameter is a slug even though it is named `opportunityId`; `getOpportunityWorkspaceData` resolves the persisted UUID and organisation-owned record.

The secondary navigation is rendered by `OpportunityWorkspaceLayoutShell` and `OpportunityWorkspaceShell`. In the candidate tree, Files is correctly placed directly after Overview:

```text
Overview | Files | Generate Trade Pack | Build Scope | Pricing Worksheet | Takeoff | Quotation
```

Relevant locations are `components/app/OpportunityWorkspaceLayoutShell.tsx:6-33` for active-route detection and `components/app/OpportunityWorkspaceShell.tsx:82-119` for the tab definition.

The Opportunity Files route at `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/files/page.tsx:15-89` is the same server composition as the Project route. Its only entity-specific work is resolving the Opportunity UUID and calling `get_or_create_opportunity_document_workspace`.

Opportunity lifecycle/data ownership is more complicated than the Files model:

- `organization_opportunities` owns pipeline state, client, owner, stage, location, due/quoted dates, `workspace_project_id`, `converted_project_id`, and conversion timestamps.
- A tender workspace may already be represented by an `organization_projects` row through `workspace_project_id`.
- Lifecycle strategy can be `legacy_two_project_v1` or `promote_workspace_v1`.
- `opportunity_final_projects` is the authoritative one-to-one delivery Project mapping.
- Quotes and commercial items retain Opportunity lineage while their Project attachment can change.

Files should remain attached to the document workspace, not to the tender `organization_projects` row. That keeps Files independent from whether lifecycle policy promotes the tender workspace or creates a second Project.

## D. Current Conversion Architecture

### Entry point and transaction

```text
Opportunity quote UI
  -> POST /api/leads-clients/opportunities/[slug]/convert
  -> convertOpportunityToProjectForCurrentUser
  -> award_opportunity_by_lifecycle_v1
       ├─ promote_opportunity_workspace_v1, or
       └─ convert_accepted_opportunity_to_project
  -> finalize_opportunity_award_pricing_v1 (idempotent historical retry)
  -> legacy drawing/trade-pack/scope Storage clone (post-commit, when required)
```

The API is `app/api/leads-clients/opportunities/[opportunitySlug]/convert/route.ts:28-153`. The current server orchestration is `lib/leads-clients-server.ts:725-868`. `award_opportunity_by_lifecycle_v1` serializes on the Opportunity row, validates permissions and lifecycle strategy, and either promotes or performs legacy two-project conversion (`supabase/migrations/20260801160000_add_default_opportunity_lifecycle_policy.sql:398-592`).

For the legacy path, `convert_accepted_opportunity_to_project` creates the final Project, creates the authoritative mapping, reattaches commercial history, handles the legacy quote fallback, links the shared document workspace, and marks the Opportunity Won in one PostgreSQL transaction. The shared Files link occurs before the Opportunity update at `supabase/migrations/20260731100000_add_dormant_opportunity_promotion_foundation.sql:1232-1264` (the earlier definition is also visible at `20260730120000_add_atomic_opportunity_conversion.sql:772-805`).

### Conversion dependency map

| Resource | Current strategy | Result |
|---|---|---|
| Opportunity row/stage | MOVE state | `stage=Won`, `converted_project_id`, `converted_at`, `quoted_at` updated. Original row remains. |
| Final Project identity | RECREATE for legacy; REUSE for promotion | Legacy creates a delivery Project; promotion turns the recorded tender workspace into the final Project. |
| Client/contact identity | REUSE | Final Project references the same client; no client copy. |
| Name/location/basic metadata | RECREATE/SNAPSHOT | Legacy Project inserts selected Opportunity values. Not every Opportunity field/notes is copied. |
| Authoritative final mapping | RECREATE idempotently | One `opportunity_final_projects` row; uniqueness and row locking prevent two final Projects. |
| Canonical quotes | RELINK | Opportunity-originated Project quotes are moved from null/tender Project to final Project. |
| Quote line items | RELINK | Project IDs follow canonical quote attachment. |
| Commercial items and quote-derived cost items | RELINK | Project ID is changed while Opportunity lineage remains. |
| Legacy `opportunity_quotes` | RECREATE only as fallback | Converted only when no canonical Project quote is attached. |
| Accepted pricing basis | SNAPSHOT | Award manifest, source workbook/sheet/material-binding snapshots, and line snapshots preserve the accepted basis. |
| Project working pricing workbooks/sheets | COPY/RECREATE | Deterministic Project continuations are created; source workbooks and accepted quote are award-locked. |
| Shared Files workspace | REUSE + RELINK | Same workspace, nodes, versions, keys, and bytes; one Project entity link is inserted transactionally. |
| Legacy drawing sets | COPY | New deterministic metadata IDs and new Storage paths under the delivery Project. |
| Trade packs | COPY/RECREATE | IDs and PDF URLs are mapped to the cloned drawing-set object. |
| Scope runs | COPY | New deterministic IDs and remapped trade-pack IDs. |
| Takeoff page previews/other drawing derivatives | UNCHANGED unless covered elsewhere | The inspected post-commit clone does not explicitly clone takeoff pages/previews; continuity is not demonstrated. |
| Variation, purchase-order, task, supplier-invoice, claim attachments | UNCHANGED | Module-owned stores are not part of Opportunity Files conversion. |

### Existing conversion problem

`cloneWorkspaceDataToProject` reads `project_drawing_sets`, `trade_packs`, and `scope_runs`; copies each drawing object; then inserts cloned metadata (`lib/leads-clients-server.ts:135-326`). It executes only after the award RPC and pricing finalizer have committed (`lib/leads-clients-server.ts:830-853`). Failure returns a successful conversion with `fileMigrationStatus="retry_required"` and a warning.

Consequences:

- A Project can exist and be marked Won while some legacy drawing files are absent.
- Storage copies can succeed before metadata insertion fails.
- Retrying must distinguish an existing object from an unrelated collision.
- Deterministic IDs help metadata idempotency, but Storage and metadata are not atomic.
- `project_drawing_sets.storage_path` is globally unique, so attempting to reuse the original path for a copied row produces the known `project_drawing_sets_storage_path_key` class of failure.
- The route warning says “tender files,” but it applies to legacy drawing/trade-pack data. Shared Files do not require copying and should not be described as pending migration.

Opportunity Files must not be added to this post-commit clone. The candidate shared workspace correctly avoids doing so.

## E. Storage Model

### Shared Files bucket

Bucket: `organization-documents`, private, 2 GiB per object, with an explicit PDF/text/CSV/common-image/Office MIME allowlist (`supabase/migrations/20260729160000_add_document_storage_upload_foundation.sql:100-130`).

Object key:

```text
{organization UUID}/{workspace UUID}/{version UUID}
```

Generation is database-owned at `20260729160000_add_document_storage_upload_foundation.sql:590-625`. It contains neither Project ID, Opportunity ID, folder ID, nor user-controlled filename.

Properties:

- The organisation prefix enforces tenancy and helps catalog operations.
- The durable workspace prefix survives Opportunity-to-Project conversion unchanged.
- Each immutable version UUID provides collision-safe physical identity.
- Logical names and hierarchy are database metadata only.
- Rename and move do not change Storage; the UI explicitly states this at `components/app/files/FilesWorkspace.tsx:550-560`.
- The browser can only INSERT the exact pending reserved object. It cannot SELECT, UPDATE, DELETE, list, or upsert (`20260729160000_add_document_storage_upload_foundation.sql:230-283`).
- Downloads cross a server/service-role boundary only after `resolve_document_download` authorizes the current active version.
- Soft deletion retains objects. Purge deletes metadata transactionally, queues cleanup, and deletes Storage asynchronously with leased retry jobs.

### Shared Files uniqueness constraints

- `document_versions_storage_key_unique`: global unique immutable Storage key.
- `document_versions_storage_object_uidx`: one version per Supabase `storage.objects.id`.
- `document_versions_uploader_idempotency_uidx`: one reservation per `(uploaded_by, upload_idempotency_key)`.
- `document_versions_node_version_unique`: one version number per node.
- `document_nodes_live_root_name_uidx` and `document_nodes_live_child_name_uidx`: case-insensitive live name uniqueness within a folder.
- `document_workspace_entities_opportunity_uidx` and `_project_uidx`: at most one workspace per entity.
- `document_storage_cleanup_jobs_active_object_uidx`: at most one active cleanup job per bucket/key.

The central Storage-key constraint is desirable, not a conversion hazard, because conversion never inserts a second version row or changes the key.

### Legacy drawing storage

Bucket: `project-drawing-sets`, private, 5 GiB. Path generation is:

```text
{organizationId}/{projectId}/{random UUID}-{normalized filename}
```

See `lib/drawing-sets.ts:18-45` and `supabase/migrations/20260301091500_create_project_drawing_sets.sql:1-15`.

`project_drawing_sets.storage_path` has a global UNIQUE constraint. Its RLS and Storage policies infer access from the Project ID embedded in the second path segment (`20260301091500_create_project_drawing_sets.sql:30-140`). Therefore those objects cannot simply remain under the tender Project path while metadata is reassigned to a different final Project without changing policy semantics. This is the reason the legacy path physically copies objects.

### Central Files tables

| Table | Key and ownership | Parent/storage | Audit/lifecycle | Security and constraints |
|---|---|---|---|---|
| `document_workspaces` | PK `id`; required `organization_id` | none | `created_by`, `updated_by`, created/updated timestamps | Composite `(organization_id,id)` identity; forced RLS. |
| `document_workspace_entities` | PK `id`; required org/workspace; exactly one of `opportunity_id` or `project_id` | Concrete composite FKs to workspace and entity | `linked_by`, `linked_at` | Unique Opportunity and Project links; forced RLS. Multiple different entity links may point to one workspace. |
| `document_nodes` | PK `id`; org/workspace | `parent_node_id` self-FK; `current_version_id` for files | created/updated users/timestamps; `deleted_at/by`, `deletion_batch_id`, lifecycle state | Folder/file checks, active-parent enforcement, cycle prevention, per-folder normalized-name uniqueness; forced RLS. |
| `document_versions` | PK `id`; org/workspace/node | `storage_key`, `storage_object_id`; prior-version FK | immutable version number, uploader, initiated/uploaded/verified/activated/failed/abandoned/purged timestamps, MIME, size, SHA-256, failure fields | Unique key/object/idempotency/version; active version must have verified Storage identity; forced RLS. |
| `document_activity_events` | PK `id`; org/workspace; optional link/node/version | no bytes | actor, event type, metadata, timestamp | Append-only trigger; entity/node/version scope validation; forced RLS. |
| `organization_document_storage_usage` | PK/FK `organization_id` | quota/counters | reconciled/created/updated timestamps | Counter checks; org-level read policy. |
| `document_storage_cleanup_batches` | PK `id`; org/workspace | deletion/root IDs | requester, status, counts, timestamps | Unique deletion batch and root per workspace; service-role writes. |
| `document_storage_cleanup_jobs` | PK `id`; org/workspace; optional version/batch | bucket/key/bytes | lease, attempts, status, errors, timestamps | Unique job identity and active object job; service-role only. |
| `document_storage_reconciliation_findings` | PK `id`; optional org/workspace/version | bucket/key | discrepancy/status/count/details/timestamps | Unique fingerprint; service-role writes, monitor RPC reads. |

The defining schema is in `supabase/migrations/20260729150000_add_document_workspace_foundation.sql:69-439`, upload hardening in `20260729160000_add_document_storage_upload_foundation.sql:1-130`, and lifecycle tables in `20260730110000_complete_document_storage_lifecycle.sql:23-230`.

### Other file registries

There is not one application-wide file registry. Separate module-owned stores include at least:

- `project_drawing_sets` plus `takeoff_pages.preview_storage_path` and `trade_packs.pdf_url`.
- `project_variation_attachments` and `project_purchase_order_attachments` in `project-variation-attachments`.
- `task_attachments` and older `project_job_todo_attachments`.
- `supplier_invoice_documents` and extraction/AI metadata.
- `retention_claim_documents`, payment-claim generated PDFs/Xero attachment state, and accounting document versions.
- Material import source documents, organisation branding, site/QA photos, and other domain assets.

These have domain semantics and should not be silently copied into Files. A later product decision may expose references or curated shortcuts, but physical consolidation is a separate migration project.

## F. Existing Opportunity File Capabilities

Before the candidate shared Files workspace, Opportunities already had indirect document capabilities:

- Source drawings live in `project_drawing_sets` under the Opportunity's tender `workspace_project_id` and drive drawing intelligence, takeoff, trade packs, and scope generation.
- Canonical and legacy quotes, pricing worksheets, and generated quote/PDF output contain document-like commercial records.
- Scope runs and trade-pack PDF URLs are Project-row scoped even during tendering.

They are not a general folder/file workspace. They should remain domain-owned. Recommended presentation policy:

- General user-uploaded documents belong in shared Files.
- Drawing sources remain in the drawing/takeoff system unless a deliberate dual-reference or import adapter is designed.
- Generated quotes, pricing worksheets, and commercial records should be referenced from Files only if the UI needs discoverability; their authoritative records should remain in their modules.
- Do not duplicate bytes merely to make module-owned records appear in a Files list.

## G. Recommended Ownership Model

**SHARED WORKSPACE**

Use the existing candidate design: durable `document_workspaces`, concrete association rows in `document_workspace_entities`, logical `document_nodes`, and immutable `document_versions`.

Model comparison:

| Model | Assessment |
|---|---|
| COPY | Reject. Doubles bytes and metadata; introduces partial success, path collisions, cleanup/rollback work, long conversion latency, and retry ambiguity. |
| REASSIGN | Better than copy but inferior here. It either removes historical Opportunity access or requires nullable dual ownership and ownership mutations. It also does not solve legacy Project-ID path policies. |
| SHARED WORKSPACE | Recommend. Strong FKs, stable organisation ownership, no byte move, atomic link insertion, full hierarchy/version identity, and natural future lifecycle reuse. |
| POLYMORPHIC OWNER | Reject for this scope. `(owner_type, owner_id)` cannot have ordinary FKs to two tables, complicates RLS and cascade behavior, and gains nothing over the concrete link table. |

The link table is a restrained abstraction: it exists solely to bind durable workspace identity to lifecycle entities. It is not an unnecessary generic object system.

## H. Recommended Files Lifecycle

```text
Create Opportunity
  -> Files tab resolves/creates one organisation-scoped document workspace
  -> user creates metadata-only folder tree
  -> upload reservation creates immutable version and opaque workspace key
  -> browser uploads bytes once; server verifies/activates version

Opportunity awarded
  -> lock Opportunity row and validate accepted quote/lifecycle
  -> create or promote final Project
  -> ensure Opportunity workspace exists
  -> insert idempotent Project link to the same workspace
  -> mark Opportunity Won
  -> commit all database work together

Project Files opens
  -> resolves the same workspace UUID
  -> returns the same node IDs, parent IDs, version IDs, and storage keys
  -> bytes remain at the same private object key
```

No shared Files copy, move, rename, URL rewrite, or backfill should occur during conversion. The storage path remains valid because it contains workspace ID rather than Project ID.

After conversion, choose and encode one product policy explicitly:

1. Preferred: redirect the Won Opportunity Files tab to Project Files, while preserving audit linkage; or
2. Keep Opportunity Files read-only as a historical view; or
3. Intentionally allow both routes as aliases to the same mutable workspace.

The candidate currently implements option 3. Project uploads and mutations immediately appear through the old Opportunity URL, demonstrated by `tests/e2e/project-files-continuity.spec.ts:232-307`. That is technically coherent but should not be accidental.

## I. UI Reuse Plan

The smallest UI design is already present:

- Reuse `FilesWorkspace` unchanged for both entities.
- Reuse `FileUploadQueue` unchanged; it maps entity kind to exactly one upload identifier.
- Reuse shared query parsing, file categorisation, routing, folder path, and validation helpers.
- Reuse shared server actions; entity context is only needed for route revalidation.
- Keep thin entity-specific server pages for entity/slug lookup and initial workspace resolution.
- Keep shared loading/error presentation; Project loading already re-exports Opportunity loading.

Project-specific assumptions remaining in the candidate are outside the shared component:

- Project page calls `getTradePackWorkspaceBySlugForCurrentUser` and `get_or_create_project_document_workspace`.
- Opportunity page calls `getOpportunityWorkspaceData` and `get_or_create_opportunity_document_workspace`.
- Navigation implementations are separate and both must expose Files.

Required refinement before release:

- Add `canWrite` to storage/permission presentation data and hide upload/new-folder/rename/move controls when false.
- Hide delete actions when `canDelete` is false, not only the recycle-bin button.
- Make Opportunity workspace resolution view-capable when a workspace already exists, mirroring Project behavior.
- Decide post-Won redirect/read-only behavior.

No second Opportunity-specific Files component or API namespace should be created.

## J. Database Changes Eventually Required

If the untracked candidate has not been applied, the eventual database work is the candidate foundation itself:

1. Permissions: `files.view`, `files.write`, `files.delete`, `files.purge`, `files.monitor` and role defaults.
2. Durable workspace/link/node/version/activity tables and strong composite organisation FKs.
3. Private `organization-documents` bucket and exact-reservation INSERT policy.
4. Workspace resolution, mutation, listing, upload, download, storage-usage, purge, cleanup, and reconciliation RPCs.
5. Project workspace resolution and Opportunity-to-Project shared-link RPC.
6. Transactional invocation from both legacy conversion and promotion paths.

Do not edit an already-applied timestamped migration in a deployed environment. Use a new forward migration for any permission/read-resolution/post-Won correction.

Recommended schema refinements:

- Add or expose a view-only Opportunity resolver so existing workspaces can be opened with `files.view`.
- Consider an explicit link state/authority (`active`, `historical`, or `redirect_to_project`) only if product policy requires different post-conversion Opportunity behavior. Avoid adding it pre-emptively.
- Keep concrete link FKs; do not replace them with owner type/id.

No schema change is needed to carry the hierarchy through conversion.

## K. Conversion Changes Eventually Required

- Preserve the transactional call to `ensure_opportunity_project_document_workspace` inside every award strategy.
- Ensure the early-return/idempotent conversion path also repairs a missing Project workspace link. The lower-level Project resolver can self-heal on first Files visit, but conversion itself should leave the invariant complete.
- Do not include `document_nodes`, `document_versions`, or `organization-documents` in `cloneWorkspaceDataToProject`.
- Rename `fileMigrationStatus`/warning copy to make clear that it concerns legacy drawing workspace assets, not shared Files.
- Move legacy drawing/trade-pack/scope cloning to a durable outbox/job with explicit progress and idempotent reconciliation, or eliminate the clone by completing lifecycle promotion. Do not rely on the request process after commit.
- Define and test whether takeoff previews and derived drawing records are copied, regenerated, or intentionally left with the tender workspace.
- Keep pricing finalization and document linkage inside the award transaction when possible; the current extra application-level pricing retry is useful for historical repair but can still produce a 500 after award has committed.

## L. Migration / Backfill Requirements

### Existing Opportunities

No eager backfill is required. First Files access can create the workspace. For large deployments, an optional idempotent backfill can pre-create workspace/link rows, but it should not copy bytes.

### Existing direct Projects

No eager backfill is required for empty shared workspaces. `get_or_create_project_document_workspace` creates one lazily. Existing Project functionality remains unaffected because the workspace is additive.

### Existing converted Projects

Backfill or lazy resolution should link each Project with valid `source_opportunity_id` to its source Opportunity's workspace. The candidate Project resolver already does this on first access. A preflight must reject a Project already linked to a different workspace.

### Existing project drawing sets and attachments

They do not automatically appear in Files. Choices are:

- Lowest risk: leave them in their owning modules and label Files as a new general document workspace.
- Medium risk: add read-only references/shortcuts in Files without copying bytes.
- High risk: ingest them as document versions, which needs key ownership, deduplication, historical-link, rollback, and module-authority rules.

Do not silently duplicate them.

Overall migration risk: **MEDIUM**. The shared workspace is additive and low-risk; the risk comes from rollout state, historical link conflicts, permission semantics, and expectations that old module attachments will appear in Files.

## M. RLS / Security Impact

### Current candidate controls

- All central tables use forced RLS.
- Authenticated users have SELECT only on user-facing metadata tables; mutations go through SECURITY DEFINER RPCs.
- `can_access_document_workspace` derives the organisation from the workspace and requires `has_org_permission` plus at least one valid entity link (`20260729150000...sql:699-756`).
- Composite FKs prevent an entity in one organisation from linking to a workspace in another.
- Upload reservation requires exactly one real Opportunity or Project, checks `files.write`, and serializes reservations.
- Storage INSERT validates the exact key against a live pending version owned by the caller.
- Storage has no authenticated SELECT, UPDATE, DELETE, or listing policy.
- Download resolves only the current active non-deleted version, then produces a short-lived signed URL.
- Ordinary users cannot complete uploads with arbitrary actor IDs or manipulate cleanup jobs.

Role defaults are organisation-wide:

| Role | view | write | delete | purge | monitor |
|---|---:|---:|---:|---:|---:|
| owner | yes | yes | yes | yes | yes |
| admin | yes | yes | yes | no | yes |
| QS | yes | yes | no | no | no |
| project manager | yes | yes | yes | no | no |
| worker | no | no | no | no | no |

### Gaps

1. **No per-Opportunity owner check.** A member with `files.view` can access any linked workspace in the organisation. This satisfies organisation isolation but not a rule such as “only the Opportunity owner/team may access it.” If that is a real requirement, add a common entity-access predicate and use it in both resolution and workspace access.
2. **No Project-role check.** Access is based on organisation permission, not assignment to a Project.
3. **Opportunity view-only gap.** `get_or_create_opportunity_document_workspace` requires `files.write` even when the workspace exists (`20260729150000...sql:794-900`). Project resolution correctly allows `files.view` for an existing link.
4. **Mutation controls are over-rendered.** The shared UI renders write/delete controls without a `canWrite`/per-action gate; RPCs remain secure, but users can receive avoidable permission errors.
5. **Post-conversion aliasing.** The Opportunity link remains valid and permissions do not become historical. Thus the old Opportunity route can mutate the live Project workspace. Decide whether that is intended.
6. **Entity deletion semantics.** Links cascade when their entity is deleted; a workspace survives while another valid link exists. If all links disappear, the workspace cascades only through explicit workspace deletion, so operational orphan detection should cover linkless workspaces.

Cross-organisation access is strongly blocked. “Another user's Opportunity” is blocked only when that user is in another organisation or lacks the organisation-wide file permission; ownership alone is not considered.

## N. Failure / Idempotency Risks

| Risk | Rank | Assessment/mitigation |
|---|---|---|
| Candidate files/migrations are untracked and omitted from deployment | **CRITICAL** | Commit/review/deploy as one coherent release; gate routes until migrations exist. |
| Legacy post-commit drawing clone partially fails | **HIGH** | Durable outbox/job, exact source/target ledger, retry status, reconciliation; never add shared Files to it. |
| Pricing finalizer fails after award RPC commits | **HIGH** | Treat as reconciliation workflow; return accurate partial-success state rather than generic conversion failure. |
| Post-Won Opportunity route retains live mutation access | **HIGH** if undesired, otherwise LOW | Choose redirect/read-only/alias policy and enforce it consistently. |
| Existing Project already linked to a different workspace | **HIGH** for affected record | Fail closed and require reconciliation; current RPC does this. Run preflight before rollout. |
| Direct Project/converted Project lazy workspace race | **LOW** | Advisory locks plus unique indexes make creation/linking idempotent. |
| Double-submit/retry creates two final Projects | **LOW** | Opportunity row lock, final mapping uniqueness, lineage checks, and idempotent returns. |
| Shared Files conversion duplicates keys/bytes | **LOW** | It inserts only a link; no node/version/object insertion. |
| Upload retry duplicates a version/object | **LOW** | Caller UUID idempotency key, fingerprint match, opaque version key, TUS resume, no upsert. |
| Rename/move causes physical Storage failure | **LOW** | Metadata only; keys are immutable. |
| Restore collides with reused name | **MEDIUM** | Fail safely and require rename/move of the live item; already implemented. |
| Purge metadata commits but Storage delete fails | **MEDIUM** | Leased retry jobs, dead-letter diagnostics, and reconciliation; bytes may persist privately until cleanup. |
| Organisation reader cannot open Opportunity Files | **MEDIUM** | Add view-only existing-workspace resolution and UI permission presentation. |
| Existing drawings/attachments expected in Files but absent | **MEDIUM** | Explicit product copy and optional reference adapter; no implicit migration. |
| Legacy drawing target path collision | **MEDIUM** | Randomized source names and deterministic target mapping reduce risk, but global unique metadata plus copy-before-insert remains non-atomic. |

Failure scenario outcomes for shared Files:

- Project creation succeeds but document link fails: because linkage is inside the conversion RPC, the transaction rolls back the new Project and conversion state.
- Database link succeeds but Storage work fails: no Storage work occurs for shared Files.
- Storage upload succeeds but metadata activation fails: version remains pending/failed; cleanup jobs reconcile the private orphan/pending object; an older active version remains current.
- Conversion is retried or double-submitted: the same final Project and workspace link are returned; unique link indexes prevent duplication.
- Opportunity is already converted: lifecycle mapping validates accepted quote and Project consistency before returning the existing Project.

## O. Test Plan

### Existing inspected coverage

The candidate suite already covers a substantial portion of the requirement:

- Foundation DB tests: concurrency, idempotent workspace creation, role denial, cross-org isolation, nested folders, name collisions, hierarchy/cycle checks, soft delete/restore, immutable versions, RLS, and Project linkage.
- Upload DB and Storage tests: exact reservation, idempotency, MIME/size validation, TUS, interrupted resume, no overwrite/list/delete, activation verification, replacement version concurrency, signed download, and expired/abandoned cleanup.
- Lifecycle tests: usage quotas, deletion batches, async purge, cleanup leases/dead-lettering, reconciliation, and concurrent quota reservation.
- UI tests: shared Opportunity/Project rendering, toolbar, tables, empty/search state, upload modal, and deleted batches.
- Browser tests: Opportunity tab, nested folder/upload/replace/download/search/rename/move/delete/restore/purge, mobile layout, background upload, exact identity continuity after conversion, Project-side mutation visibility, and repeat conversion.

Key files include `tests/characterization/documents/*.test.ts`, `components/app/files/*.test.tsx`, `tests/e2e/opportunity-files.spec.ts`, and `tests/e2e/project-files-continuity.spec.ts`.

### Required additions or explicit assertions

Before implementation/release is considered safe, add or retain tests for:

1. Opportunity Files loads for a `files.view=true`, `files.write=false` member.
2. Write/delete/purge controls are hidden according to permission, with direct RPC calls still denied.
3. Same-organisation but non-owner/non-assigned Opportunity access follows the chosen business policy.
4. Post-Won Opportunity Files follows the chosen redirect/read-only/alias behavior.
5. Conversion with zero document nodes.
6. Conversion with many files/versions and several levels of nested folders.
7. Same filenames in different folders remain valid across conversion.
8. Duplicate folder names in different parents remain valid; same-parent duplicates remain rejected.
9. Simultaneous double-submit from two sessions returns one Project and one link.
10. Forced failure immediately after Project insert proves transaction rollback includes the document link and Opportunity state.
11. Existing direct Project Files and existing linked converted Project Files remain unchanged after migration.
12. Project-link repair for historical converted Projects and conflict behavior for a pre-linked different workspace.
13. Project deletion/Opportunity deletion behavior when one or both links remain.
14. Cleanup after last entity link removal does not expose or silently lose private bytes.
15. Legacy post-commit clone retry after: object copied/metadata absent; metadata present/object absent; takeoff derivatives present; target collision.
16. Sorting assertions for name, modified, owner, size, ascending/descending, pagination, and type filters in both entity routes.
17. Download link expiry and revocation-by-delete/current-version change.
18. Deployment-order test: routes fail closed or remain gated if RPC migrations are unavailable.

Storage integration tests must run against a disposable local Supabase instance with the real TUS endpoint and bucket policies, not mocks alone. Browser conversion tests must assert the Storage object count and exact key remain unchanged for shared Files.

## P. Files That Would Need Modification

The following is the exact candidate/change surface in the inspected tree. Because many are currently untracked, this is also the minimum set that must be reviewed and integrated; future corrections to applied SQL should use new migration paths rather than editing deployed migrations.

### Routes and navigation

- `app/app/(workspace)/projects/[projectId]/files/page.tsx:15-80`
- `app/app/(workspace)/projects/[projectId]/files/loading.tsx:1`
- `app/app/(workspace)/projects/[projectId]/files/error.tsx`
- `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/files/page.tsx:15-89`
- `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/files/loading.tsx`
- `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/files/error.tsx`
- `components/app/OpportunityWorkspaceLayoutShell.tsx:6-33`
- `components/app/OpportunityWorkspaceShell.tsx:12,82-119`
- `components/app/ProjectSecondaryNav.tsx:32-45,147-227`
- `components/app/ProjectLayoutShell.tsx:8-22`

### Shared UI and server code

- `components/app/files/FilesWorkspace.tsx:87-637`
- `components/app/files/FileUploadQueue.tsx:48-203`
- `lib/documents/constants.ts:1-67`
- `lib/documents/workspace.ts:3-226`
- `lib/documents/workspace-server.ts:33-217`
- `lib/documents/workspace-actions.ts:45-160`
- `lib/documents/validation.ts`
- `lib/documents/server.ts:26-131`
- `lib/documents/upload-client.ts:36-171`
- `lib/documents/upload-queue.ts`
- `lib/documents/cleanup-worker.ts:87-230`
- `app/api/documents/uploads/initiate/route.ts:14-70`
- `app/api/documents/uploads/[versionId]/complete/route.ts:9-62`
- `app/api/documents/uploads/[versionId]/abandon/route.ts:8-35`
- `app/api/documents/nodes/[nodeId]/download/route.ts:9-59`
- `app/api/cron/document-storage-cleanup/run/route.ts:18-73`
- `app/api/internal/documents/diagnostics/route.ts:14-46`
- `vercel.json` for cleanup scheduling
- `lib/supabase/types.ts` after schema generation

### Database and conversion

- `supabase/migrations/20260729150000_add_document_workspace_foundation.sql:1-1534`
- `supabase/migrations/20260729160000_add_document_storage_upload_foundation.sql:1-1115`
- `supabase/migrations/20260729170000_harden_document_version_activation_order.sql:1-55`
- `supabase/migrations/20260729180000_add_document_workspace_listing.sql:1-252`
- `supabase/migrations/20260730100000_add_project_document_workspace_resolution.sql:1-210`
- `supabase/migrations/20260730110000_complete_document_storage_lifecycle.sql:1-2080`
- `supabase/migrations/20260730120000_add_atomic_opportunity_conversion.sql:559-817`
- Later lifecycle function definitions, especially `supabase/migrations/20260731100000_add_dormant_opportunity_promotion_foundation.sql:1040-1265` and `supabase/migrations/20260801160000_add_default_opportunity_lifecycle_policy.sql:398-592`
- `lib/leads-clients-server.ts:135-326,725-868`
- `app/api/leads-clients/opportunities/[opportunitySlug]/convert/route.ts:28-153`

### Tests

- `components/app/files/FilesWorkspace.test.tsx`
- `components/app/files/FileUploadQueue.test.tsx`
- `lib/documents/*.test.ts`
- `tests/characterization/documents/*.test.ts`
- `tests/e2e/opportunity-files.spec.ts`
- `tests/e2e/project-files-continuity.spec.ts`
- `lib/atomic-opportunity-conversion-migration.test.ts`
- `lib/project-document-workspace-migration.test.ts`
- `lib/leads-clients-server.document-linkage.contract.test.ts`

## Q. Implementation Phases

### Phase 0 - repository and deployment preflight

- Inventory which candidate files/migrations are committed, applied locally, and applied in hosted environments.
- Run read-only preflight queries for conflicting entity links, invalid organisation lineage, linkless workspaces, and converted Projects without document linkage.
- Freeze edits to already-applied migrations; plan forward-only corrections.

### Phase 1 - shared Files foundation

- Integrate and review the durable workspace, concrete entity links, node/version model, private opaque storage, RLS, permissions, quota, cleanup, and reconciliation.
- Prove migration order and rollback on disposable databases.

### Phase 2 - shared UI and entity adapters

- Integrate `FilesWorkspace`, upload queue, APIs, thin Opportunity/Project pages, loading/error states, and navigation.
- Correct view-only Opportunity resolution and action visibility.

### Phase 3 - conversion invariant

- Link the Project to the exact Opportunity workspace inside every conversion/promotion transaction.
- Repair the idempotent early-return path.
- Define post-Won Opportunity route behavior.
- Separate shared Files status from legacy drawing clone status.

### Phase 4 - historical compatibility and optional backfill

- Lazily or eagerly link historical converted Projects.
- Leave module-owned documents in place by default.
- If requested, add read-only references rather than duplicating Storage objects.

### Phase 5 - legacy drawing conversion hardening

- Move remaining post-commit copy work to a durable, observable, retry-safe process or retire it through workspace promotion.
- Define takeoff/preview derivative behavior.

### Phase 6 - automated verification

- Run unit, migration contract, DB behavior, real Storage/TUS integration, and browser lifecycle suites.
- Add the missing permission, rollback, high-volume, double-submit, historical repair, and post-Won behavior cases.

### Phase 7 - staged rollout and reconciliation

- Release behind lifecycle/environment controls.
- Monitor cleanup dead letters, reconciliation findings, conversion partial-success status, workspace-link anomalies, and Storage counts.
- Promote broadly only after zero-copy identity continuity is proven in hosted environments.

## R. Final Recommendation

Adopt the candidate **shared durable document workspace** as the one Files system for both Opportunities and Projects:

```text
Opportunity Files
  -> one organisation-scoped workspace
  -> logical folder/file metadata
  -> immutable organisation/workspace/version Storage keys

Opportunity won
  -> Project created or tender workspace promoted
  -> Project receives a concrete FK-backed link to the same document workspace
  -> no file metadata clone
  -> no Storage copy

Project Files
  -> same workspace, hierarchy, nodes, versions, checksums, keys, and bytes
```

Do not copy shared Files, do not rewrite their paths, and do not add a polymorphic owner. Keep module-owned drawings, takeoff artifacts, quotes, pricing, invoices, and attachments separate unless a later audited reference layer intentionally surfaces them.

The immediate architectural priority is not another abstraction. It is to integrate the existing candidate coherently, correct permission/post-Won semantics, ensure every conversion path establishes the shared link transactionally, and isolate the remaining legacy post-commit drawing copy from the new Files lifecycle.
