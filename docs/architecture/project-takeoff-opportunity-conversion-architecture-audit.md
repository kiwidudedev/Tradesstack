# Project Takeoff + Opportunity → Project Migration Architecture Audit

Audit date: 2026-08-23  
Scope: read-only audit of Takeoff, Project routes, and Opportunity → Project conversion. No implementation or schema changes were made.

## A. Executive Verdict

**PROJECT TAKEOFF CAN REUSE EXISTING DATA DIRECTLY — READY WITH OWNER-CONTEXT REFACTOR — MIXED CONVERSION REFERENCE HANDLING REQUIRED.**

Current Opportunity Takeoff is already physically Project-backed. `organization_opportunities.workspace_project_id` resolves the workspace Project, and drawing sets plus every material Takeoff record are partitioned by that Project. For the current `promote_workspace_v1` lifecycle, conversion retains the Project identity, so no Takeoff rows, object paths, IDs, or jobs need to move.

The repository also retains a legacy two-Project lifecycle. Its post-commit clone copies drawing-set metadata and source objects into a different final Project, but does **not** copy pages, calibrations, groups, measurements, points, events, render jobs, or page previews. The continuity shadow explicitly describes that omission as expected (`supabase/migrations/20260801130000_correct_shadow_workspace_continuity.sql:26-29,618-627`). Project Takeoff must therefore resolve a final Project to the original workspace Project for legacy conversions. Blind cloning would create the largest risk in this feature.

## B. Current Opportunity Takeoff Ownership

The UI is Opportunity-owned; the persisted graph is Project-backed.

| Record | Physical scope | Opportunity field | Meaning |
| --- | --- | --- | --- |
| `project_drawing_sets` | `organization_id`, `project_id` | none | Source drawing identity belongs to a Project (`supabase/migrations/20260301091500_create_project_drawing_sets.sql:1-15`). |
| `takeoff_pages` | organization + project + drawing set | nullable `opportunity_id` | Project partition plus source lineage (`supabase/migrations/20260421110000_create_takeoff_tables.sql:42-63`). |
| `takeoff_calibrations` | organization + project + page | nullable `opportunity_id` | Versioned page calibration in the same graph (`...create_takeoff_tables.sql:66-99`). |
| `takeoff_measurement_groups` | organization + project | nullable `opportunity_id` | Project-wide grouping with optional source lineage (`...create_takeoff_tables.sql:102-127`). |
| `takeoff_measurements` | organization + project + drawing/page | nullable `opportunity_id` | Measurement identity and graph scope (`...create_takeoff_tables.sql:130-182`). |
| points/events | parent measurement / org-project lineage | events retain opportunity | Child geometry and audit history. |
| `takeoff_render_jobs` | organization + project + drawing set | nullable `opportunity_id` | Preparation belongs to the same Project graph. |

The schema function `takeoff_opportunity_matches_project` requires a non-null `opportunity_id` to reference an Opportunity whose `workspace_project_id` equals the row's `project_id` (`...create_takeoff_tables.sql:302-324`). Consistency triggers enforce drawing → page → calibration/group/measurement scope (`...create_takeoff_tables.sql:333-593`). Thus `project_id` is the physical partition/authority; `opportunity_id` is constrained source lineage, not an instruction to migrate a row to a newly created final Project.

## C. Current Project Relationship

```text
Opportunity slug
  → organization_opportunities.id + workspace_project_id
  → organization_projects.id
  → project_drawing_sets
  → pages → calibrations / measurements / points / events
  → project-wide groups and render jobs
```

`resolveTakeoffWorkspaceForOpportunitySlug` reads `id, name, workspace_project_id`, then resolves the Project (`lib/takeoff-server.ts:1222-1287`). `getTakeoffAuthorizedContext` adds current membership authorization (`lib/takeoff-server.ts:1298-1316`). Register reads then query `project_drawing_sets`, `takeoff_pages`, and `takeoff_render_jobs` under the resolved Project (`lib/takeoff-server.ts:1318-1418`).

Answer to the required ownership question: **YES — current Opportunity Takeoff is physically stored under the Opportunity's workspace Project.**

Current route map:

```text
/app/leads-clients/opportunities/[opportunityId]/takeoff
  → Drawing Set Register
/app/leads-clients/opportunities/[opportunityId]/takeoff/measure?drawingSetId=&pageId=
  → fullscreen editor route group
/app/leads-clients/opportunities/[opportunityId]/takeoff/quantities?drawingSetId=&pageId=&drawingScope=all
  → Quantities
```

The register route resolves once and passes the same client through batched register reads (`app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/page.tsx:10-37`). Measure is intentionally in `(editor)` and normalizes an absent/foreign drawing back to the register (`app/app/(editor)/leads-clients/opportunities/[opportunityId]/takeoff/measure/page.tsx:13-40`). Quantities supports current page/current drawing/all drawings (`.../takeoff/quantities/page.tsx:20-70,73-121,144-213`). Opportunity navigation exposes Takeoff → Measure/Quantities and disables Takeoff prefetch (`components/app/OpportunityWorkspaceShell.tsx:47-52,152-180`).

## D. Project Takeoff Route Recommendation

Use the existing Project slug convention even though the folder parameter is named `projectId`:

```text
app/app/(workspace)/projects/[projectId]/takeoff/page.tsx
  URL /app/projects/[projectId]/takeoff
  Drawing Set Register

app/app/(editor)/projects/[projectId]/takeoff/measure/page.tsx
  URL /app/projects/[projectId]/takeoff/measure?drawingSetId=...&pageId=...
  fullscreen Measure

app/app/(workspace)/projects/[projectId]/takeoff/quantities/page.tsx
  URL /app/projects/[projectId]/takeoff/quantities?drawingSetId=...&drawingScope=all
```

Mount the same UI through Project route adapters. Put a top-level **Takeoff** dropdown between Files and Quotation in `ProjectSecondaryNav`; the Project nav already defines Files and a Quotation dropdown (`components/app/ProjectSecondaryNav.tsx:33-46,138-219`). Measure should open the register; selecting a drawing opens `/measure`. Both Takeoff links should retain `prefetch={false}`.

## E. Reusable Components

| Classification | Component/module | Required treatment |
| --- | --- | --- |
| DIRECTLY REUSABLE | `components/app/TakeoffPdfViewer.tsx` | Already receives viewer data/actions/title; retain lazy PDF export. |
| DIRECTLY REUSABLE | `components/app/TakeoffQuantitiesTable.tsx` | Data/export-context driven. |
| DIRECTLY REUSABLE | `lib/takeoff/measurement-display.ts`, units, totals, selection helpers | Domain logic contains no owner lookup. |
| REUSABLE WITH OWNER ADAPTER | `TakeoffDrawingSetRegister` | Replace `opportunityId` URL/API assumptions with navigation + owner API descriptor (`components/app/TakeoffDrawingSetRegister.tsx:41-43,70-85,123-175`). |
| REUSABLE WITH OWNER ADAPTER | `TakeoffMeasureWorkspace` | Inject route builder and viewer endpoint scope; it currently imports an Opportunity route type and constructs Opportunity URLs (`components/app/TakeoffMeasureWorkspace.tsx:8-10,112,225-294,547-567`). |
| REUSABLE WITH OWNER ADAPTER | `TakeoffPreparationWorkspace` | Replace `opportunityId` query construction; worker remains shared (`components/app/TakeoffPreparationWorkspace.tsx:9-35,63`). |
| REUSABLE WITH OWNER ADAPTER | `TakeoffQuantitiesFilters` | Inject navigation builder (`components/app/TakeoffQuantitiesFilters.tsx:14,43-64,299`). |
| REUSABLE WITH OWNER ADAPTER | `useTakeoffSourceDrawingUpload` | Organization/data Project upload is already generic; navigation/preparation scope is not (`components/app/useTakeoffSourceDrawingUpload.ts:15-25,66-96`). |
| REUSABLE WITH SMALL CLEANUP | `MeasureFullscreenShell` | `opportunityId` is declared but unused (`components/app/MeasureFullscreenShell.tsx:4-18`). |
| OPPORTUNITY-SPECIFIC | Existing three route pages and `takeoff-page-data.ts` | Become thin Opportunity adapters over owner-neutral loaders. |
| OPPORTUNITY-SPECIFIC | `lib/takeoff/navigation.ts` | Hardcodes Opportunity roots (`lib/takeoff/navigation.ts:24-58`). |
| PROJECT-SPECIFIC | New Project pages and Project nav entry | Resolve Project owner and provide Project URLs/labels only. |

## F. Opportunity-Specific Assumptions

| File/function | Opportunity assumption | Project impact | Refactor needed |
| --- | --- | --- | --- |
| `resolveTakeoffWorkspaceForOpportunitySlug` | Starts at Opportunity slug and `workspace_project_id` | Cannot resolve direct/legacy final Project | Keep as adapter; add Project owner resolver. |
| `getTakeoffAuthorizedContext` | Membership + Opportunity resolver | Project route needs equivalent canonical context | Return common authorized owner context. |
| Drawing/register reads in `lib/takeoff-server.ts` | Public names/arguments use Opportunity though queries use org/project | Causes duplicate Project service if copied | Extract org/data-project core; retain compatibility wrappers. |
| `takeoff-page-data.ts` | Opportunity type, title, signed URL, page read (`:75-203`) | Cannot mount directly in Project route | Move neutral loader; inject resolved context. |
| `createTakeoffPageActions` | Closes over Opportunity and passes it to every mutation (`lib/takeoff/actions.ts:63-541`) | Project cannot save safely | Factory closes over authorized owner descriptor/context. |
| `TakeoffDrawingSetRegister` | Opportunity URLs and lifecycle payload | Project upload/rename/archive blocked | Owner navigation/API adapter. |
| `TakeoffMeasureWorkspace` | Opportunity register/page history/viewer URL | Wrong Project deep links | Owner navigation/API adapter. |
| `TakeoffPreparationWorkspace` | `opportunityId` required by prepare API | Cannot prepare direct Project | Generic scope token/descriptor. |
| `TakeoffQuantitiesFilters` | Opportunity route builder | Wrong Project filter URLs | Generic navigation object. |
| `mapTakeoffToQuantityRows` | Requires Opportunity solely to create `viewHref` (`lib/takeoff/quantities-adapter.ts:40-47,121`) | Domain adapter leaks routing | Accept a view-link callback/base href. |
| `/api/takeoff/drawing-sets/[drawingSetId]` | Body requires `opportunityId` (`route.ts:7-32`) | No Project lifecycle calls | Resolve an owner descriptor before the shared mutation. |
| `/api/takeoff/pages/prepare` | Query requires Opportunity (`route.ts:7-42`) | No Project preparation | Owner-generic API boundary, same worker. |
| `/api/takeoff/measure-viewer` | Imports Opportunity loader and requires `opportunityId` (`route.ts:3-30`) | No Project viewer refresh | Move loader to neutral module and resolve owner. |
| `opportunity_id` persistence | Written on pages/calibrations/groups/measurements/jobs | Direct Project has no Opportunity | Use `lineageOpportunityId`, nullable; never fabricate or rewrite it. |
| `getProjectWorkContextForCurrentUser` | Generic fallback decides from “any feature data” (`lib/project-work-context-server.ts:25-59,172-218`) | Legacy cloned drawing rows falsely make final Project authoritative | Do not use this heuristic for Takeoff; inspect the Takeoff graph and lifecycle mapping. |

## G. Generic Owner Context Recommendation

Use a discriminated route owner plus explicit physical data authority:

```ts
type AuthorizedTakeoffContext = {
  organizationId: string;
  routeOwner: { kind: "opportunity" | "project"; slug: string; id: string };
  routeProjectId: string;       // Project shown in the URL/product
  dataProjectId: string;        // authoritative Takeoff graph partition
  lineageOpportunityId: string | null;
  conversionMode: "workspace" | "promoted" | "legacy-reference" | "project";
  displayName: string;
};
```

Resolution rules:

1. Opportunity: member organization → Opportunity → `workspace_project_id`; if converted, return canonical Project redirect metadata.
2. Direct Project with no source Opportunity: route and data Project are the same; lineage is null.
3. Promoted Project: route and data Project are the same; retain source Opportunity lineage.
4. Legacy final Project: validate `source_opportunity_id`/final mapping and use the Opportunity's workspace Project as `dataProjectId`.
5. If both legacy final and workspace contain real Takeoff graphs, fail closed and require reconciliation; never merge by name or filename.

All core reads/mutations take the resolved context plus IDs and revalidate drawing/page membership under `organizationId + dataProjectId`. Client requests should send an opaque/small route-owner descriptor, not trusted physical IDs. Separate thin Opportunity/Project API routes are acceptable, but they must call one authorized core.

## H. Pricing Worksheet Conversion Architecture

Pricing Worksheets use controlled continuation cloning, not owner promotion:

```text
POST opportunity convert
  → convertOpportunityToProjectForCurrentUser
  → award_opportunity_by_lifecycle_v1 (atomic lifecycle mapping)
  → finalize_opportunity_award_pricing_v1
      → immutable manifest/snapshots
      → ensure_opportunity_project_pricing_workbooks_v1
          → Project workspace workbook continuation
          → cloned sheets/cells with source lineage
  → legacy storage/metadata clone only when RPC requests it
```

The API entry is `app/api/leads-clients/opportunities/[opportunitySlug]/convert/route.ts:28-55`; orchestration is `lib/leads-clients-server.ts:704-896`. Award and pricing finalize are separate idempotent calls (`:760-865`), and legacy object copying is post-commit/retryable (`:865-896`).

`ensure_opportunity_project_pricing_workbooks_v1` finds an existing continuation by organization, final Project, source workbook and clone kind, otherwise creates the Project workbook and sheets (`supabase/migrations/20260819210000_add_project_pricing_worksheet_continuations.sql:281-381,547-548`). The source Opportunity workbook remains. The continuation has a new workbook ID, records `source_workbook_id`, version and manifest, and is constrained by a partial unique index (`:9-32`). This makes retries idempotent and preserves immutable lineage.

Takeoff should reuse the orchestration principles—locked identity decision, explicit lineage, idempotency, reconciliation—not the row-cloning mechanism.

## I. Pricing Worksheet vs Takeoff Conversion

| Concern | Pricing Worksheet | Takeoff |
| --- | --- | --- |
| Opportunity ownership | Workbook may be Opportunity-scoped | UI/lineage only |
| Project ownership | New Project continuation workbook | Physical graph already uses workspace Project |
| Physical DB owner | Workbook `project_id`/`opportunity_id` model | `project_id` is graph partition; optional Opportunity lineage |
| Conversion requirement | Produce Project working continuation | Expose same authoritative graph from Project route |
| IDs can remain stable | Source IDs remain, continuation IDs change | All graph IDs should remain stable |
| Storage involved | Not the core workbook identity | Source PDFs and previews are Project-prefixed |
| Clone required | Yes, controlled workbook/sheet continuation | No for promoted/direct; unsafe for legacy graph |
| Reassociation possible | Not used for working continuation | Route-to-data Project reference is sufficient |
| Downstream provenance | Explicit source workbook/version/manifest | Measurement/drawing/page/project IDs already persisted |

## J. Required Takeoff Conversion Semantic

**MIXED.**

- `promote_workspace_v1`: **PROMOTION / NONE**. The workspace Project becomes canonical with the same ID.
- direct Projects: **NONE**.
- legacy two-Project conversions: **REFERENCE UPDATE at the application resolution layer**. The final Project route points to the existing workspace Takeoff graph.
- **CLONE: rejected** for the authoritative Takeoff graph.

The lifecycle dispatcher still supports both strategies (`supabase/migrations/20260801160000_add_default_opportunity_lifecycle_policy.sql:398-590`; latest wrapper `20260822130000_add_opportunity_quote_series.sql:773-823`). Architecture must not assume every deployed/historical conversion used promotion.

## K. Drawing Set Conversion

Drawing Set IDs should remain unchanged: **YES**.

Promotion keeps the same Project and rows. Legacy reference resolution exposes the original rows rather than the deterministic copies. Existing legacy clone code reads a limited drawing-set projection, copies storage, generates target IDs, and calls `clone_workspace_metadata_to_project` (`lib/leads-clients-server.ts:135-314`; SQL `supabase/migrations/20260730120000_add_atomic_opportunity_conversion.sql:320-397`). It does not clone the connected Takeoff graph and predates/omits important multi-drawing fields from its select (`display_name`, sort/archive/source metadata). Those final-Project drawing replicas must not be mistaken for authoritative Takeoff drawings.

Archived rows remain in the same graph and stay excluded by normal active register queries. Multiple drawings remain separated by IDs; no filename merge is allowed.

## L. Page / Calibration / Measurement Conversion

- **Pages:** unchanged ID, `project_id`, `drawing_set_id`, and lineage `opportunity_id`.
- **Calibrations:** unchanged ID/version chain, page, scale, project, and lineage. No recalibration.
- **Groups:** unchanged project-wide IDs/hierarchy and lineage.
- **Measurements:** unchanged ID/version, project, drawing, page, calibration/group references and geometry points.
- **Events:** unchanged audit history.

`project_id` is physical graph scope; drawing/page/calibration/group IDs are identity edges; `opportunity_id` is source lineage. Clearing or rewriting Opportunity lineage would violate or weaken the existing consistency model. New direct-Project records use null lineage; Project routes backed by an Opportunity workspace continue using that source Opportunity ID.

## M. Render Job / Preparation Conversion

Active jobs can continue unchanged under promotion and legacy reference resolution because their `project_id`, drawing ID, storage path, and job ID do not move. The generic worker can keep claiming the same record. The Project status adapter reads the same job through `dataProjectId`.

For Drawing C preparing during conversion:

```text
Drawing A ready + measurements  ┐
Drawing B ready + measurements  ├─ same IDs and state
Drawing C preparing + job       ┘
```

Do not clone active jobs or enqueue a second job during conversion. A failed drawing remains failed and retryable through the canonical Project route.

## N. Storage Impact

**Storage files need moving: NO** under the recommended architecture.

Source paths are `${organizationId}/${projectId}/${uuid}-${filename}` and previews are `${organizationId}/${projectId}/takeoff-page-previews/${drawingSetId}/page-####.png` (`lib/drawing-sets.ts:3,27-52`). Storage policies and drawing inserts verify that prefix matches org/project (`supabase/migrations/20260301091500_create_project_drawing_sets.sql:46-57,107-127`). Promotion leaves `projectId` unchanged; legacy reference keeps reading the original workspace path.

The old legacy clone copies source objects to a target Project prefix (`lib/leads-clients-server.ts:184-213`) but not page previews. Extending it to Takeoff would reopen collision, partial-copy, missing-preview, and stale-metadata failure modes. Existing copies can remain as Drawing Intelligence legacy artifacts; they are not the Takeoff authority.

## O. Project Pricing Worksheet Measure Impact

Current picker scope uses `workbook.project_id` when present; only an Opportunity workbook without a Project resolves `workspace_project_id` (`lib/pricing-worksheet-measure-picker-server.ts:46-78`). It then queries drawing sets, pages, groups and measurements by that Project (`:84-106,160-192`).

- Promotion: already safe because Project workbook and Takeoff share the same Project ID.
- Legacy final Project: currently unsafe/empty because the final Project may have cloned drawing rows but no Takeoff measurements. The picker must resolve the same Takeoff `dataProjectId` as Project routes rather than blindly using `workbook.project_id`.
- Direct Project: remains self-scoped.

This is the most important downstream adaptation. It must be delivered with Project Takeoff, not deferred.

## P. Provenance Impact

**PROVENANCE REWRITE REQUIRED: NO.**

Persisted provenance contains `measurementId`, `projectId`, `drawingSetId`, and `pageId` (`lib/worksheet-measure-provenance.ts:10-15,47-52`). Promotion preserves all values. The legacy reference strategy deliberately queries the original `projectId`, so existing provenance remains valid. A full clone with new drawing/page/measurement IDs would require a deep provenance rewrite and is another reason to reject cloning.

## Q. Quantities Project-Side Architecture

Reuse the current set-based loader and adapter. Current/all-drawing collection batches pages, measurements, active calibrations, and historical calibrations (`.../takeoff/quantities/page.tsx:20-70,144-213`). Replace only Opportunity resolution, route links, empty-state copy, and owner labels. Preserve `drawingScope=all`, drawing/page normalization, current-page-first hydration, export context, and the same table component. Do not create a second Project query implementation.

## R. Project Upload / Preparation

`uploadProjectDrawingSet` already accepts organization + Project and writes friendly name/source metadata (`lib/project-drawing-set-upload.ts:102-154`). Project Takeoff should pass `context.dataProjectId`, which is the route Project for direct/promoted projects and the linked workspace for legacy conversions. Then use the same preparation service and worker.

Rename/archive endpoint and prepare/viewer APIs are currently Opportunity-specific (`app/api/takeoff/drawing-sets/[drawingSetId]/route.ts:7-32`; `app/api/takeoff/pages/prepare/route.ts:7-42`; `app/api/takeoff/measure-viewer/route.ts:7-30`). Refactor their core authorization once. Friendly name, sort order, source type, archive status and preparation state remain identical (`supabase/migrations/20260823120000_add_multi_drawing_takeoff_metadata.sql:2-18,72-164`).

## S. Quote Impact

Required Quote changes: **NO**.

Keep the one-way commercial chain:

```text
Takeoff → Pricing Worksheet Measure binding → Commercial Mapping → Quote snapshot
```

Project Takeoff creates no live Quote dependency. Only regression coverage is required to prove conversion/order and existing published Quote snapshots are unchanged.

## T. PO Impact

Required Purchase Order changes: **NO**.

PO semantics remain downstream of worksheet/commercial-item publication. No Takeoff owner field, route, or conversion behavior should alter an existing PO.

## U. Old Opportunity Route Behaviour

After conversion, old Opportunity Takeoff URLs should server-redirect to the canonical Project equivalent, preserving authorized `drawingSetId`, `pageId`, measurement/status and `drawingScope` query parameters. This matches Files' existing converted-route behavior (`app/app/(workspace)/leads-clients/opportunities/[opportunityId]/files/page.tsx:1-55`).

Converted Opportunities should retain the visible Takeoff entry only as a gateway that redirects; they should not expose a second writable surface. A Measure tab already open at conversion may continue displaying its signed PDF, but the next route refresh should redirect. A stale mutation should fail with a canonical-route conflict/redirect instruction, not silently create divergence.

## V. Security / RLS

Current RLS is usable without policy changes. Drawing-set policies verify organization membership, Project membership and matching storage prefix (`...create_project_drawing_sets.sql:30-76,107-127`). Takeoff page/calibration/group/measurement policies join `organization_projects` under the row's organization/project (`...create_takeoff_tables.sql:606-872`); point/event access follows the parent graph (`:878-979`). Render-job policies follow the same model.

Required service checks remain stricter than RLS:

1. resolve current membership and route owner;
2. validate final↔source mapping for a legacy reference;
3. constrain every drawing to `organizationId + dataProjectId`;
4. constrain page/calibration/group/measurement to that same graph;
5. reject foreign/archived drawing deep links;
6. never accept a client-supplied `dataProjectId` as authority.

No Project route may gain cross-project access merely because RLS allows the same organization member to see several projects.

## W. Performance

Performance parity is achievable only by sharing the current implementation:

- preserve the single resolved context/client passed through shell/register reads (`takeoff/page.tsx:16-27`);
- preserve authorized drawing and scoped page selectors (`takeoff-page-data.ts:75-123`);
- retain current-page-first Quantities hydration and set-based all-drawing queries;
- keep Takeoff nav `prefetch={false}` so navigation does not parse/sign PDFs;
- do not load inactive drawing pages/measurements;
- retain on-demand signed source refresh and existing neighbor/canvas behavior;
- retain dynamic `takeoff-pdf-export` loading, enforced by `lib/takeoff/loading-architecture.test.ts:43-44`;
- log/measure Project loader stages with the same trace (`takeoff-page-data.ts:21-43`).

Avoid wrapping Project Takeoff with `getProjectWorkContextForCurrentUser` and then resolving again. One Takeoff resolver should return both route and data Projects.

## X. Conversion Atomicity / Idempotency

No Takeoff row mutation belongs in the conversion transaction under the recommended design. The transaction decides lifecycle identity/final mapping; Project routes subsequently resolve the already-authoritative graph. This is inherently idempotent.

Current conversion performs lifecycle award and pricing finalize, then conditionally does legacy storage metadata cloning post-commit (`lib/leads-clients-server.ts:704-896`). A retry receives/reuses the same mapping and deterministic pricing continuations. Takeoff must not join that clone. If reference resolution fails, return a reconciliation-required state without partially rewriting rows.

For existing destination data:

- cloned drawing rows alone do not establish Takeoff authority;
- workspace graph only → workspace is canonical;
- final graph only → final is canonical only after validated reconciliation/history;
- both contain pages/measurements/jobs → conflict, fail closed and audit; never merge by filename.

## Y. Files Likely To Change

These are future implementation candidates; none was modified by this audit.

| Path | Current responsibility | Future responsibility |
| --- | --- | --- |
| `lib/takeoff-server.ts` | Opportunity resolver plus mixed core services | Authorized generic core and thin Opportunity/Project resolvers. |
| `lib/takeoff/actions.ts` | Opportunity-bound action factory | Owner-context action factory. |
| `lib/takeoff/navigation.ts` | Opportunity URLs | Owner-aware route builders. |
| `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data.ts` | Opportunity loader | Thin adapter; neutral loader moves to `lib/takeoff`. |
| Existing Opportunity Takeoff pages | Register/Measure/Quantities routes | Use shared owner core; converted URL redirect. |
| `app/app/(workspace)/projects/[projectId]/takeoff/page.tsx` | absent | Project register adapter. |
| `app/app/(editor)/projects/[projectId]/takeoff/measure/page.tsx` | absent | Project fullscreen Measure adapter. |
| `app/app/(workspace)/projects/[projectId]/takeoff/quantities/page.tsx` | absent | Project Quantities adapter. |
| `components/app/ProjectSecondaryNav.tsx` | Project nav | Takeoff dropdown with Measure/Quantities. |
| Five Takeoff workspace/register/filter/upload components | Opportunity navigation/API props | Shared owner adapter props. |
| `lib/takeoff/quantities-adapter.ts` | Domain mapping plus hardcoded link | Inject view-link builder. |
| Three `/api/takeoff/...` routes | Opportunity scope | Resolve generic owner and call one core. |
| `lib/pricing-worksheet-measure-picker-server.ts` | Uses workbook Project directly | Use Takeoff data authority resolver for legacy final Projects. |
| Opportunity Takeoff/nav conversion adapter | No Takeoff canonicalization | Redirect converted Opportunity URLs. |
| Tests listed below | Current contracts | Project/legacy/promotion parity coverage. |

`lib/leads-clients-server.ts`, conversion SQL, RLS, storage helpers, Quotes and POs should not need functional changes for the recommended path.

## Z. Database Changes

**NONE.**

Existing `workspace_project_id`, `source_opportunity_id`, final-Project mapping, lifecycle strategy, and org/Project RLS provide enough information for a server-side reference resolver. No owner-column rewrite, clone migration, storage move, or RLS migration is required. If future product requirements demand physically consolidating legacy workspaces, that is a separate larger migration—not a prerequisite for Project Takeoff.

## AA. Testing Requirements

Existing relevant coverage includes Takeoff selection/navigation/actions/preparation/quantities/loading/multi-drawing contracts under `lib/takeoff/*.test.ts`, API route tests under `app/api/takeoff`, conversion and promotion migration/characterization tests, `pricing-worksheet-measure-picker-server.test.ts`, Project Files continuity E2E, Quote tests, and PO adapter/linking tests.

Add implementation tests for:

1. Direct, promoted, and legacy-reference owner resolution, including unauthorized and ambiguous dual-graph cases.
2. Project register/Measure/Quantities route rendering and Project nav contract.
3. No Takeoff; one drawing; multiple drawings; archived, failed and preparing drawings.
4. Stable drawing/page/calibration/group/measurement/job IDs across conversion.
5. Line, area and count measurements plus calibration version history.
6. Current Drawing and All Drawings quantities parity and Excel/PDF export labels.
7. Project upload, friendly name, sort, rename, archive, preparation and viewer API authorization.
8. Foreign-org/foreign-project drawing, page and measurement rejection.
9. Promotion during active preparation and during an open signed viewer.
10. Legacy conversion retry/post-commit storage-clone failure with no Takeoff duplicates.
11. Old Opportunity register/Measure/Quantities deep-link redirects preserving query state.
12. Project Pricing Worksheet Measure drawer for promotion and legacy reference; old provenance resolves without rewrite.
13. Existing Quote snapshot and PO remain byte/semantic equivalent.
14. Performance contracts: no route prefetch, no eager PDF export, one owner resolution, no inactive drawing hydration.

## AB. Risk Register

| Risk | Severity | Cause | Mitigation |
| --- | --- | --- | --- |
| Legacy final shows no measurements | CRITICAL | Picker/route uses final Project while graph remains on workspace | Conversion-aware `dataProjectId` resolver. |
| Duplicate Takeoff graph | CRITICAL | Extending legacy clone to connected rows | Do not clone; reference original graph. |
| Project/Opportunity divergence | CRITICAL | Both old and new routes remain writable | Canonical redirect and stale-mutation rejection. |
| Stale Measure provenance | CRITICAL | New IDs from cloning | Preserve original IDs/project reference. |
| Active job orphan/duplicate | HIGH | Moving/cloning while preparing | Keep job and project/drawing IDs unchanged. |
| Storage collision/missing previews | HIGH | Copying Project-prefixed objects | No storage movement; do not extend legacy clone. |
| Wrong authority chosen | HIGH | Generic work-context treats cloned drawing metadata as feature data | Takeoff-specific graph-based resolver; fail closed on dual graph. |
| Cross-project access | HIGH | Trusting route/query IDs without graph checks | Resolve owner server-side and constrain every child. |
| Drawing/page/measurement IDs change | HIGH | Clone/re-key strategy | Reference/promotion only. |
| Archived drawing revived/lost | MEDIUM | Legacy metadata clone omits archive fields | Read authoritative workspace row and preserve filters. |
| Old deep links break | MEDIUM | Opportunity surface removed without mapping | Server redirect with authorized query preservation. |
| Stale signed URL | LOW | Conversion in another tab | URL remains valid; canonicalize next navigation/mutation. |
| Loading regression | HIGH | Duplicate Project loader, hidden prefetch, eager PDF work | Share core and preserve performance contracts. |
| Pricing conversion order | HIGH | Project workbook created before Takeoff resolver works | Ship resolver/picker adaptation in the same phase. |
| Quote/PO regression | LOW | Accidental downstream coupling | No code changes; regression tests. |

## AC. Recommended Implementation Phases

1. Add characterization tests for all current Opportunity behavior and both conversion lifecycles.
2. Extract `AuthorizedTakeoffContext`, neutral data loader, Project resolver and conflict detection without changing routes.
3. Refactor core reads/actions/API authorization behind adapters; prove Opportunity parity.
4. Make navigation, register, viewer, preparation, filters, quantity links and upload owner-aware.
5. Add Project register and fullscreen Measure routes plus Project nav, retaining no-prefetch/loading boundaries.
6. Add Project Quantities and export parity.
7. Adapt the Project Pricing Worksheet Measure picker to `dataProjectId`; verify provenance.
8. Add converted Opportunity canonical redirects and stale-session mutation behavior.
9. Run promotion/legacy conversion, active-job, security, Quote/PO and browser performance regression suites.

There is no Takeoff “migration logic” phase because the recommended architecture deliberately avoids graph migration.

## AD. Target Final User Experience

```text
Opportunity
  → Takeoff
  → Drawing Set Register
  → Measure / Quantities

Convert Opportunity

Project
  → Takeoff
  → SAME authoritative Drawing Sets and PDFs
  → SAME pages and calibrations
  → SAME measurement IDs and groups
  → SAME Quantities and worksheet provenance
  → any preparing drawing continues preparing

Old Opportunity Takeoff link
  → canonical Project Takeoff equivalent
```

The deliberate Project-context difference is only route ownership, display labels, and navigation. The Takeoff data and behavior remain one authoritative workspace.

## AE. Implementation Readiness

```text
IMPLEMENTATION READY: YES

Current Opportunity Takeoff already Project-backed:
YES

Project routes can reuse Takeoff core:
YES

Takeoff records need cloning:
NO

Drawing Set IDs can remain unchanged:
YES

Measurement IDs can remain unchanged:
YES

Storage files need moving:
NO

Pricing Worksheet conversion architecture reusable:
PARTIALLY

Project Pricing Worksheet Measure picker safe:
NO (legacy two-Project conversions require the owner resolver first)

Provenance rewrite required:
NO

Quote changes required:
NO

PO changes required:
NO

Database migration likely:
NO

Recent Takeoff performance architecture can be preserved:
YES

Highest-risk area:
Selecting the legacy final Project as Takeoff authority merely because legacy conversion cloned drawing-set metadata there. That produces an apparently valid register with no connected pages/measurements and can split future writes. Resolve legacy Project routes and the Measure picker to the original workspace Takeoff graph, and fail closed if two real graphs exist.
```
