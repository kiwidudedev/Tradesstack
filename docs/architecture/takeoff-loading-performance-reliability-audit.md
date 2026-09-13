# TradesStack Takeoff Loading Performance & Reliability Audit

## A. Executive Verdict

**ARCHITECTURAL LOADING WATERFALL + INTERMITTENT FAILURE ROOT CAUSE FOUND + PERFORMANCE + RELIABILITY REFACTOR REQUIRED**

Takeoff is not slow for one reason, and the evidence does not support blaming only PDF.js. The current lifecycle combines:

1. a production-prefetched, two-route Measure entry (`/takeoff` then `/takeoff/measure`);
2. repeated opportunity/workspace resolution and a 12–19-call canonical server-render path;
3. synchronous full-PDF download and server parsing when page records do not yet exist;
4. PDF signing before the Measure React tree can render;
5. a very large client viewer plus eager `pdf-lib` in the initial client graph;
6. immediate adjacent-page database and PDF priming during the critical PDF startup window; and
7. missing route loading/error boundaries and several code-confirmed dead-end retry/preparation states.

The strongest reliability findings are code-confirmed:

- A stale or cross-drawing `pageId` is deliberately rejected, but the resulting preparation workspace receives no `pageId`, never polls status, never refreshes, and repeatedly calls the render worker every four seconds (`lib/takeoff/page-selection.ts:5-7`, `app/app/(editor)/leads-clients/opportunities/[opportunityId]/takeoff/measure/page.tsx:41-45`, `components/app/TakeoffPreparationWorkspace.tsx:43-101`).
- When PDF signing returns `null`, the displayed **Retry Page** calls `loadPage()` for the already-active page; `loadPage()` returns immediately and performs no retry (`components/app/TakeoffMeasureWorkspace.tsx:553-560,809-816`).
- Page-change failures are stored in `pageLoadError`, but `TakeoffPdfViewer` never renders either `pageLoadError` or `isPageLoading`; a slow/failed page click therefore looks unresponsive (`components/app/TakeoffMeasureWorkspace.tsx:577-601,796-797`; props are only declared/destructured at `components/app/TakeoffPdfViewer.tsx:237-238,1496-1497`).

No application, database, routing, PDF, loading, or test code was changed. This document is the only audit artifact.

## B. Current Takeoff Navigation Architecture

### Route map

```text
/app
├── leads-clients/opportunities/[opportunityId]
│   ├── files                         Opportunity document workspace
│   ├── drawing-intelligence          source drawing/trade-pack upload surface
│   └── takeoff
│       ├── (index)                   selection/initialization redirect alias
│       ├── measure                   fullscreen Measure editor
│       └── quantities                quantity register/export surface
└── projects/[projectId]
    ├── files                         Project document workspace
    └── drawing-intelligence          Project drawing-set upload surface

/api/takeoff
├── measure-viewer                    client page-data API
├── pages/status                      preview-status API
└── render-jobs/run                   preview worker trigger
```

## Implementation outcome — 2026-08-23

The refactor has been implemented with Takeoff-scoped verification:

- The legacy `/takeoff` route is now a lightweight canonical redirect to `/takeoff/measure`.
- Measure and Quantities menu links use `prefetch={false}` so opening the menu does not fully execute either heavy dynamic route.
- Stale and cross-drawing page IDs fall back to the first authorized page and the browser URL is normalized.
- Missing page metadata is queued as a database-backed `page_metadata` render job. Navigation no longer downloads or parses the complete PDF.
- Preparation has pending, processing, ready, and failed states; terminal failures are visible and retryable.
- Source-PDF retry re-signs the storage URL and forces PDF.js to create a new loading task.
- Page API, preparation API, Supabase read, and PDF.js document-load paths have bounded timeouts.
- Neighbour page data and PDF proxy warming now begin only after the selected canvas is usable; obsolete data warmups are aborted.
- `pdf-lib` export code is dynamically imported on export intent rather than included through the initial viewer import graph.
- Quantities all-page hydration uses page-set measurement and calibration reads rather than per-page query fan-out.
- The initial page and measurement projections exclude preview/audit/AI fields that the Measure first view does not consume.
- No database migration was required: the existing render-job partial unique index provides pending/processing idempotency for the new job type.

Verification:

- `npx vitest run components/app/takeoff-calibration-dialog-ui.test.ts lib/takeoff app/api/takeoff/pages/prepare/route.test.ts app/api/takeoff/measure-viewer/route.test.ts` — 14 files, 62 tests passed.
- Takeoff-scoped ESLint — zero errors; 29 existing warnings remain in `TakeoffPdfViewer.tsx`.
- Production browser timing was not available. No millisecond improvement is claimed.
- A whole-site build was intentionally stopped at the user's direction; future verification for this work is Takeoff-scoped unless explicitly requested otherwise.

There is **no Project Takeoff route**. Takeoff is opportunity-addressed and resolves an opportunity workspace Project internally. Project Files/Drawing Intelligence can supply the same `project_drawing_sets` storage/table domain, but no `/app/projects/[projectId]/takeoff` page exists.

Exact route files:

- Alias/redirect: `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/page.tsx:6-40`.
- Measure: `app/app/(editor)/leads-clients/opportunities/[opportunityId]/takeoff/measure/page.tsx:12-77`.
- Quantities: `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/quantities/page.tsx:60-225`.
- URL construction: `lib/takeoff/navigation.ts:1-49`.
- Opportunity drawing source: `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/drawing-intelligence/page.tsx:11-47`.
- Project drawing source: `app/app/(workspace)/projects/[projectId]/drawing-intelligence/page.tsx:6-28`.
- Browser upload/storage row creation: `components/app/useTakeoffSourceDrawingUpload.ts:50-126`, `lib/project-drawing-set-upload.ts:99-155`.

### Route/layout/component trees

```text
Measure canonical route
proxy.ts                              auth.getUser()
└── app/app/layout.tsx                organization member/auth gate
    └── app/app/(editor)/layout.tsx   fullscreen frame; no server work
        └── measure/page.tsx
            └── MeasureFullscreenShell
                └── TakeoffMeasureWorkspace
                    └── TakeoffPdfViewer
                        ├── summary/inspector UI
                        ├── PDF.js document/page/canvas runtime
                        ├── measurement overlays
                        ├── calibration/tool dialogs
                        └── PDF export controls
```

```text
Takeoff alias and Quantities
proxy.ts
└── app/app/layout.tsx
    └── app/app/(workspace)/layout.tsx
        └── opportunity/[opportunityId]/layout.tsx
            ├── opportunity workspace header/navigation
            ├── /takeoff/page.tsx          server redirect only
            └── /takeoff/quantities/page.tsx
                └── TakeoffQuantitiesFilters
                    └── TakeoffQuantitiesTable
```

Measure intentionally changes from the `(workspace)` route group to `(editor)`. On a soft navigation, already-mounted shared layouts are preserved until the redirect transitions to the editor group; on a hard request, the relevant tree runs from the root. Layout evidence:

- Root auth: `app/app/layout.tsx:6-15`.
- Workspace branding/member/permission work: `app/app/(workspace)/layout.tsx:11-21`.
- Opportunity workspace plus unrelated Files navigation resolution: `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/layout.tsx:17-35`.
- Fullscreen editor layout: `app/app/(editor)/layout.tsx:1-3`.

## C. Initial Load Call Graph

### Normal first click from an Opportunity page with no Takeoff query context

```text
Takeoff dropdown opens
├── Link Measure href = /.../[opportunity]/takeoff
├── Link Quantities href = /.../[opportunity]/takeoff/quantities
└── both Links use prefetch={true}
    └── production may fully prefetch both dynamic routes

user selects Measure
└── proxy.updateSession
    └── auth.getUser
└── /takeoff alias page
    ├── getLatestActiveAreaMeasurementForOpportunitySlug
    │   ├── getCurrentOrganizationMember
    │   │   ├── auth.getUser
    │   │   └── organization_members
    │   ├── organization_opportunities
    │   ├── organization_projects
    │   └── takeoff_measurements (latest active area)
    ├── [if no latest area] getTakeoffDrawingSetsForOpportunitySlug
    │   ├── organization_opportunities          duplicate resolution
    │   ├── organization_projects               duplicate resolution
    │   └── project_drawing_sets
    ├── [if drawing exists] getTakeoffMeasurePageData
    │   ├── organization_opportunities          duplicate resolution
    │   ├── organization_projects               duplicate resolution
    │   ├── takeoff_pages
    │   ├── [if no pages] ensureTakeoffPagesForOpportunityDrawingSet
    │   │   ├── repeated workspace/drawing/page queries
    │   │   ├── storage.download(full PDF)
    │   │   ├── dynamic import pdf-lib
    │   │   ├── PDFDocument.load + getPages
    │   │   ├── insert takeoff_pages
    │   │   └── reload takeoff_pages repeatedly
    │   ├── takeoff_measurements + nested generic points
    │   ├── takeoff_calibrations (parallel with measurements)
    │   ├── area shapes -> area points              sequential
    │   └── line paths -> line points               sequential after area branch
    └── Next server redirect to canonical /takeoff/measure?...ids...
```

The alias sequence is at `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/page.tsx:11-40`. Workspace resolution is at `lib/takeoff-server.ts:1187-1258`; it is not React-cached. First-page creation is at `lib/takeoff-server.ts:1901-2071`.

### Canonical Measure server render

```text
proxy.updateSession
└── auth.getUser

app root + getTakeoffPageShellData
├── getCurrentOrganizationMember (React request cache)
│   ├── auth.getUser
│   └── organization_members
├── getOpportunityWorkspaceData
│   ├── organization_opportunities
│   └── Promise.all
│       ├── organization_clients (conditional)
│       ├── organization_members owner (conditional)
│       ├── project_quotes (always)
│       └── organization_projects workspace slug (conditional)
└── resolveTakeoffWorkspaceForOpportunitySlug
    ├── organization_opportunities               duplicate opportunity
    └── organization_projects                    duplicate project

getTakeoffMeasureViewerData
├── Promise.all: PDF branch
│   └── createSignedTakeoffDrawingSetUrlForOpportunity
│       ├── project_drawing_sets selected row
│       └── storage.createSignedUrl (1-hour default)
└── Promise.all: page branch
    └── getTakeoffMeasurePageData
        ├── takeoff_pages (all pages for drawing set)
        ├── Promise.all
        │   ├── takeoff_measurements + generic points
        │   │   ├── area shapes -> area points
        │   │   └── line paths -> line points
        │   └── active takeoff_calibration
        └── readiness calculation (pure JS; no extra query)

RSC payload/HTML becomes available
└── hydrate TakeoffMeasureWorkspace + TakeoffPdfViewer
```

Key implementation: `takeoff-page-data.ts:49-71,74-137,139-177`; measurements and geometry: `lib/takeoff-server.ts:2641-2681`, `lib/takeoff-server.ts:725-870`; signing: `lib/takeoff-server.ts:1296-1333`.

### Immediate client continuation

```text
TakeoffMeasureWorkspace mount
├── cache initial selected-page payload in component-local Map
├── fetch previous page /api/takeoff/measure-viewer (no-store)
└── fetch next page /api/takeoff/measure-viewer (no-store)
    └── each repeats auth/member + workspace + all-page list + page payload queries

TakeoffPdfViewer mount
├── ResizeObserver / viewport state
├── import pdfjs-dist/legacy/build/pdf.min.mjs
├── configure /pdf.worker.min.mjs
├── pdfjs.getDocument(signed URL)
├── getPage(selected page number)
├── prime previous and next PDF page proxies
├── render selected page to buffered canvas at fit × zoom × DPR
├── copy buffer to visible canvas
└── render measurement/calibration overlays
```

Client page-data priming is `components/app/TakeoffMeasureWorkspace.tsx:360-427,734-737`. PDF startup is `components/app/TakeoffPdfViewer.tsx:3180-3437`; canvas rendering is `components/app/TakeoffPdfViewer.tsx:3483-3650`.

## D. Initial Query Count

Counts below are **code-derived Supabase Auth, database/RPC, and Storage invocations** before the named milestone. They are not SQL statements observed from Postgres logs. Conditional enrichment and conditional geometry tables make the count data-dependent.

### Required headline count: UI click to canonical Measure server payload

```text
minimum:    19
typical:    25
worst case: 51
```

- **Minimum 19:** six alias-route calls via the latest-area shortcut plus a 13-call canonical render (the area record makes at least the area-shape lookup execute).
- **Typical 25:** six alias-route calls plus a populated canonical render with mixed area/line geometry (19 calls).
- **Worst case 51:** no latest-area shortcut, no page records, full alias initialization (up to 32 calls), followed by the populated canonical render (19 calls).

Database-only portions (membership included as a database call, Auth and Storage excluded) are **14 minimum / 20 typical / 45 worst case**. The remaining calls are four Auth invocations across the alias and canonical requests, plus one normal Storage signing call or two Storage calls in the page-initialization worst case (full download + later signing).

The above includes one Proxy `auth.getUser()` per route request. If a production prefetch completed first, the click may reuse a router payload, but the same work has merely moved before the click and may compete with the simultaneously prefetched Quantities route.

### Canonical Measure route alone

| Scope | Minimum | Typical populated page | First-page-record worst case |
| --- | ---: | ---: | ---: |
| Proxy + canonical Measure RSC | 12 | 19 | 33 |
| Immediate two-neighbour page-data priming after hydration | 0/7 per neighbour | 18–22 for two mixed neighbours | higher if a neighbour triggers page initialization |

Canonical breakdown (normal workspace, existing pages):

| Category | Calls |
| --- | ---: |
| Proxy authentication | 1 |
| server auth + membership | 2 |
| opportunity header/core + optional enrichment | 2–5 |
| Takeoff opportunity/workspace resolution | 2 |
| selected drawing row + signed URL | 2 |
| page list + measurements + active calibration | 3 |
| area shape/point tables | 0–2 |
| line path/point tables | 0–2 |
| **Total** | **12–19** |

### Duplicate work

- The canonical shell queries the opportunity once for rich workspace data and again for Takeoff resolution; the workspace Project is also queried in both paths (`takeoff-page-data.ts:53-60`, `lib/opportunity-workspace-server.ts:20-68`, `lib/takeoff-server.ts:1200-1233`).
- The alias can resolve the same opportunity and Project three times: latest-area selection, drawing-set listing, and page-data loading (`takeoff/page.tsx:12-33`).
- The alias loads page/measurement data only to redirect; the canonical route immediately loads the same page/measurement data again.
- A first page-record initialization re-reads page rows several times (`lib/takeoff-server.ts:1933,2052,2058,2071`).
- Proxy auth and server-layout auth are separate invocations. Within one React render, `getCurrentOrganizationMember` is correctly request-deduplicated with React `cache()` (`lib/projects-server.ts:80-82`).
- `getOpportunityWorkspaceData` is also request-cached, but Takeoff workspace resolution is not (`lib/opportunity-workspace-server.ts:11`; `lib/takeoff-server.ts:1187`).
- Immediately after hydration, adjacent-page API calls repeat member/workspace/all-pages reads even though the server already returned the full page list metadata.
- Quantities with a selected page loads that page once for fast display and then loads it again as part of all-page hydration (`takeoff/quantities/page.tsx:119-160`).

## E. Loading Timeline

No authenticated browser timing runtime or initial-loader timing logs were available. Numeric durations are therefore intentionally omitted.

```text
[CODE-INFERRED] click/open Takeoff dropdown
  → production Link prefetch may start BOTH alias Measure and Quantities loaders

[CODE-INFERRED] choose Measure
  → Proxy auth
  → alias route latest-area lookup
  → possibly repeated drawing/workspace/page selection
  → possibly full PDF server download + parse + page-row insert
  → server redirect

[CODE-INFERRED] canonical Measure request
  → Proxy auth
  → member + rich opportunity header data
  → duplicate Takeoff workspace resolution
  → in parallel:
       selected drawing lookup + signed URL
       all page metadata + selected-page measurements/calibration/geometry
  → RSC/HTML available

[CODE-INFERRED] client startup
  → hydrate 8,000+ lines of workspace/viewer client code
  → begin two adjacent page-data API requests
  → ResizeObserver establishes viewport
  → dynamically import PDF.js
  → fetch 1.13 MB PDF worker asset
  → fetch signed PDF (range/stream behavior depends on storage response)
  → parse PDF document
  → get selected page
  → prime adjacent PDF page proxies
  → render high-DPR buffered canvas
  → promote bitmap + render all selected-page overlays
  → usable Takeoff viewer
```

Verified non-timing evidence: the existing focused suite passed 19/19 tests. The 77-page PDF browser E2E asserts functional canvas/worker/page navigation, not latency, transferred bytes, range requests, query count, or failure recovery (`tests/e2e/takeoff-measure-pdf-runtime.spec.ts:191-234`).

## F. Top Bottlenecks

| Rank | Issue | Severity | Category | Evidence |
| ---: | ----- | -------- | -------- | -------- |
| 1 | Opening the dropdown exposes two `prefetch={true}` heavy dynamic routes; production can fully run both Measure alias and Quantities before selection | CRITICAL | ROUTING / SERVER / DATABASE | `OpportunityWorkspaceShell.tsx:187-223`; no Takeoff `loading.tsx`; Next 16 `prefetch=true` semantics |
| 2 | First Measure navigation commonly uses a redirect alias that loads selection/page data and then repeats it on the canonical route | CRITICAL | ROUTING / SERVER / DATABASE | `OpportunityWorkspaceShell.tsx:87-90`; `takeoff/page.tsx:12-40`; `takeoff-page-data.ts:49-177` |
| 3 | Missing page rows synchronously download the entire PDF, buffer it, parse every page with `pdf-lib`, insert rows, and repeatedly reload them; uploads permit 5 GB | CRITICAL | STORAGE / PDF / SERVER / STATE-RACE | `drawing-sets.ts:4`; `takeoff-server.ts:1996-2071` |
| 4 | Canonical RSC blocks on 12–19 backend calls, including signing and complete selected-page geometry, with no streaming boundary | HIGH | SERVER / DATABASE / STORAGE | `measure/page.tsx:20-34`; no route `loading.tsx`/Suspense |
| 5 | Hydration immediately primes both neighbour page datasets (14–22 calls total) while PDF.js imports/downloads/parses/renders; PDF.js then primes neighbour page proxies too | HIGH | NETWORK / DATABASE / PDF | `TakeoffMeasureWorkspace.tsx:734-737`; `TakeoffPdfViewer.tsx:3422-3437` |
| 6 | Stale page IDs enter a preparation UI that cannot poll or recover | HIGH | STATE-RACE / ERROR HANDLING | `page-selection.ts:5-7`; `measure/page.tsx:41-45`; `TakeoffPreparationWorkspace.tsx:48-101` |
| 7 | Takeoff DB/storage/PDF requests have no explicit initial-load timeout and no route loading/error boundary | HIGH | RELIABILITY / LOADING UX | `supabase/server.ts:11-24`; only rich opportunity lookup supplies 10s timeout; no Takeoff boundaries |
| 8 | `TakeoffPdfViewer` is 7,811 lines and statically imports export code that imports `pdf-lib`; 525 KB minified library is in the initial viewer graph although export is user-triggered | HIGH | CLIENT BUNDLE / CLIENT CPU | `TakeoffPdfViewer.tsx:91-95`; `takeoff-pdf-export.ts:1-4`; local package artifact sizes |
| 9 | Initial payload selects broad measurement/AI/metadata columns plus every selected-page point/shape/path; geometry branches are sequential | MEDIUM | DATABASE / NETWORK / CLIENT CPU | `takeoff-server.ts:38-53,725-870,2641-2681` |
| 10 | Quantities fans out 3–8 calls per page concurrently and can be production-prefetched even when the user intends Measure | HIGH | DATABASE / NETWORK | `takeoff/quantities/page.tsx:17-58`; `OpportunityWorkspaceShell.tsx:213-220` |

## G. Intermittent Failure Findings

### Confirmed code paths

1. **Stale selected page produces an indefinite preparation screen.** `selectScopedTakeoffPage` returns `null` rather than falling back. The page renders `TakeoffPreparationWorkspace` without `pageId`; status polling is conditional on `pageId`, so it never refreshes. The worker kick continues every four seconds. This exactly supports “sometimes appears stuck.”
2. **PDF signing failure cannot be retried from the displayed action.** Signing collapses missing drawing, storage policy failure, missing object, timeout/error, and signing failure to `null`. The outer retry targets the current page and is short-circuited.
3. **Page navigation failure is silent.** `pageLoadError` and `isPageLoading` are passed but unused, so the current canvas remains with no visible progress/error.
4. **Transient page-list query errors masquerade as “no pages.”** `getTakeoffPagesForOpportunitySlug` returns `[]` on query error. The caller may incorrectly enter expensive page initialization instead of surfacing the read failure (`lib/takeoff-server.ts:1393-1398`, `takeoff-page-data.ts:92-103`).
5. **Measurement/calibration read errors silently alter state.** Measurement errors become an empty overlay; calibration errors become “not calibrated”; production child-geometry errors become empty geometry (`lib/takeoff-server.ts:2375-2379,2646-2668,740-777,814-851`).
6. **Invalid drawing IDs throw without a local error boundary.** Page initialization throws “drawing set could not be found,” and the Measure route has no `error.tsx` (`lib/takeoff-server.ts:1917-1930`).

### Plausible risks ranked by evidence

| Rank | Risk | Evidence level | Why intermittent |
| ---: | --- | --- | --- |
| 1 | Long/unbounded Supabase Storage or Takeoff query wait | Strong code evidence | Takeoff helpers use the default Supabase client without `requestTimeoutMs`; network/provider variance determines whether it appears hung |
| 2 | Concurrent first-page initialization | Strong code evidence | Multiple prefetches/tabs/requests can all observe zero rows, download/parse the full PDF, then race on the unique page constraint |
| 3 | PDF.js document promise remains loading on a slow/partial storage response | Strong code evidence, runtime unmeasured | No client timeout or retry/renew flow wraps `loadingTask.promise` |
| 4 | Signed URL/object mismatch or expiry | Moderate | One-hour signing is normally sufficient, but missing objects and later range requests have no renewal path |
| 5 | Development Strict Mode repeats mount effects and PDF startup/priming | Moderate, dev-only | Effects are cleanup-aware, but document teardown/reload and neighbour priming still add dev noise |
| 6 | Stale client request overwrites active page | Low | Request IDs and mutation revisions guard explicit page navigation; no AbortController exists, but stale application is largely prevented (`TakeoffMeasureWorkspace.tsx:575-600`) |

No redirect loop or locally created never-resolving Promise was found. External Supabase/Storage/PDF.js promises remain capable of long waits because timeouts are absent.

## H. PDF / Storage Findings

### Signing

- The server queries the selected `project_drawing_sets` row and creates a private-bucket signed URL with a one-hour expiry (`lib/takeoff-server.ts:1312-1332`).
- Signing runs in parallel with page data, but both must finish before `getTakeoffMeasureViewerData` returns; signing therefore blocks the Measure RSC payload (`takeoff-page-data.ts:157-177`).
- All signing failures return `null`; error cause and retryability are lost.
- Signing is repeated on every uncached canonical render/return. Page changes inside one mounted viewer reuse the same PDF URL.

### Download and page record creation

- Existing page rows: the server does not download the PDF during normal page-data loading.
- Missing page rows: the server downloads the **entire object**, converts the entire Blob to an ArrayBuffer/Uint8Array, dynamically imports `pdf-lib`, loads the full PDF, reads all pages, and creates all page rows before continuing (`lib/takeoff-server.ts:1996-2043`).
- This path scales with both file bytes and page count and is dangerous relative to the 5 GB accepted upload limit (`lib/drawing-sets.ts:4`).
- The insert is cast through options resembling upsert conflict options (`onConflict`, `ignoreDuplicates`) while using `.insert`; concurrent correctness ultimately relies on the unique constraint and fallback re-read (`lib/takeoff-server.ts:2045-2055`; unique constraint at `20260421110000_create_takeoff_tables.sql:63`). This needs runtime confirmation during implementation.

### Browser PDF initialization and rendering

- PDF.js itself is dynamically imported after hydration (`TakeoffPdfViewer.tsx:1451-1453,3279-3297`).
- The worker is a separate 1,128,591-byte local static asset, `/pdf.worker.min.mjs` (`TakeoffPdfViewer.tsx:3304-3307`; `public/pdf.worker.min.mjs`).
- `getDocument({url, withCredentials:false})` leaves PDF.js range/stream defaults enabled. Whether the first page avoids a full download depends on signed-storage response headers and PDF linearization; the code does not measure or assert range behavior.
- The selected page is fetched only after the document promise resolves; the visible bitmap is rendered into a DPR-scaled buffer and then copied to the visible canvas (`TakeoffPdfViewer.tsx:3367-3420,3483-3606`).
- Adjacent PDF page proxies are primed after document readiness.

### Failure handling

- PDF module, worker configuration, document, page, and canvas-render failures change the viewer to a visible generic error state (`TakeoffPdfViewer.tsx:3283-3357,3396-3412,3608-3631,7622-7629`).
- Detailed PDF diagnostics are logged **only in development** (`TakeoffPdfViewer.tsx:1093-1121`), leaving production without phase-level telemetry.
- The visible PDF runtime error has no retry button; signed-URL-null has a button, but that button is a no-op as described above.

Conclusion: **PDF work partially blocks first render**. Signed URL creation blocks the server payload. PDF bytes, PDF.js import/worker/document parsing, page retrieval, and canvas rendering happen after hydration and block the first usable canvas, not the conceptual shell.

## I. Database Findings

### Query quality and waterfalls

- Workspace resolution is a strict opportunity-then-project waterfall (`lib/takeoff-server.ts:1200-1233`).
- Page list precedes selected-page queries. Measurements and active calibration are parallel, but measurement child branches are sequential: measurements → area shapes → area points → line paths → line points (`takeoff-page-data.ts:92-120`, `lib/takeoff-server.ts:2641-2668`).
- Geometry is batched by measurement IDs, not N+1 per measurement. This is good: at most two queries per child kind, not one query per shape/path.
- The initial page list fetch selects every column for every page, including preview metadata/bytes and JSON metadata, even though first render uses a small subset (`lib/takeoff-server.ts:38-39,1381-1398`).
- Measurement selection is broad, including AI fields, external refs, audit identities/timestamps, and JSON metadata, then embeds all generic points (`lib/takeoff-server.ts:42-45,2646-2651`).
- Initial Measure does not load measurement groups or event history. Calibration history is deferred until the manager opens (`TakeoffPdfViewer.tsx:3120-3146`).

### Scaling

```text
normal Measure initial server payload:
  O(number of pages metadata)
  + O(selected-page measurements)
  + O(selected-page generic/area/line geometry points)

first page-record creation:
  O(full PDF bytes in server memory)
  + O(PDF pages parsed)
  + O(page rows inserted)

Quantities all-pages hydration:
  O(all pages × measurements/geometry/calibrations)
  with broad page-level concurrency
```

### Index review

Existing indexes are generally aligned with normal Measure reads:

- pages: `(organization_id, project_id, drawing_set_id, page_number)` (`20260421110000_create_takeoff_tables.sql:229-230`);
- active measurements by page/order: partial `(page_id, created_at) where status <> 'deleted'` (`20260422153000_optimize_takeoff_measure_page_reads.sql:1-3`);
- active calibration: unique partial `page_id where is_active=true` (`20260421110000_create_takeoff_tables.sql:239-241`);
- generic, area, and line child points: parent ID plus order (`20260421110000_create_takeoff_tables.sql:269-270`; area/line migrations at lines 41-45).

Potential degradation:

- Alias “latest active area” orders by `updated_at desc, created_at desc`, while the closest index is `(organization_id, project_id, measurement_kind, status, created_at desc)` and does not lead with `updated_at` (`lib/takeoff-server.ts:2700-2711`; migration lines 255-256). A targeted index is only a possible later optimization after `EXPLAIN ANALYZE`.
- Quantities’ page-wide concurrent query fan-out is an architectural query-shape concern that an index alone will not solve.

## J. Client / Bundle Findings

- `TakeoffMeasureWorkspace.tsx` is 821 lines and `TakeoffPdfViewer.tsx` is 7,811 lines. The latter owns PDF runtime, overlays, tools, dialogs, optimistic mutations, undo/redo, summary, export, navigation, and calibration management in one initial client component.
- PDF.js main module (481,423-byte local minified artifact) is correctly dynamically imported after mount; its 1,128,591-byte worker is then fetched separately.
- `TakeoffPdfViewer` statically imports `takeoff-pdf-export.ts`, which statically imports `pdf-lib`. The local minified `pdf-lib` artifact is 525,099 bytes. Export is only needed after a user clicks export, but its code/library enter the initial viewer module graph (`TakeoffPdfViewer.tsx:91-95`; `takeoff-pdf-export.ts:1-4,810+`).
- Dialogs, dropdowns, tool setup, calibration manager, export transforms, and all mutation tooling are also part of the initial component graph.
- The viewer initializes more than 50 state/ref values and many effects/memos. `savedMeasurements` walks every selected-page measurement and child geometry and depends on `transform`, so viewport/pan/zoom changes can re-transform the full overlay set (`TakeoffPdfViewer.tsx:1788-1803,1893-2063`).
- Multiple downstream derived structures filter, group, total, and convert those measurements (`TakeoffPdfViewer.tsx:2064-2070,2353-2474,2676-2717`).
- The canvas is rendered at `fitScale × zoom × devicePixelRatio`; high-DPR/large viewport rendering increases canvas pixels and memory (`TakeoffPdfViewer.tsx:3497-3505`).
- No production bundle report exists in the repository, and this audit did not run `next build` because it would mutate build artifacts. Bundle severity is therefore based on import graph and local package sizes, not a measured route chunk.

CPU and network are separate bottlenecks: server/Storage latency delays hydration; then module parse/hydration, PDF parsing, geometry transformation, and canvas work delay usability.

## K. Loading UX Findings

- There is no `loading.tsx` in the editor, Takeoff, or opportunity Takeoff segments and no server Suspense boundary. During a dynamic client navigation, the user can remain on the stale previous screen with no Takeoff-specific progress until the complete RSC payload is ready.
- Official Next.js guidance identifies dynamic routes without `loading.tsx` as a common cause of an app appearing unresponsive; this route exactly matches that condition.
- The Takeoff dropdown trigger itself has no pending state. The user cannot tell that production prefetch/server work began or that the selected link is awaiting a redirect.
- After hydration, PDF loading has a small “Loading source PDF…” badge, and PDF failure has a central visible message (`TakeoffPdfViewer.tsx:6560-6566,7622-7649`).
- Page changes have no visible loading or error feedback because the supplied props are unused.
- `TakeoffPreparationWorkspace` looks intentionally busy but can be a permanent dead end when no `pageId` is supplied.

Poor feedback is therefore a major contributor to “does not load,” but it does not explain away real latency and real dead-end states.

## L. Error Handling Findings

| Failure path | Current handling | User outcome |
| --- | --- | --- |
| Proxy/env/auth exception | middleware catches and returns `user:null`; root redirects | redirect/login behavior; root cause hidden |
| no organization member | root redirect or shell `notFound` | redirect/404, no Takeoff-specific explanation |
| rich opportunity metadata timeout/failure | core opportunity may become `null`; optional warnings logged | header fallback possible; 10s bound only here |
| Takeoff workspace opportunity/project read error | returns `null` | `notFound` from shell |
| transient page-list query error | returns `[]` | may trigger full PDF initialization incorrectly |
| invalid/missing drawing row | signing returns `null`; ensure throws | unavailable state or uncaught route error |
| missing storage object/sign failure | returns `null` | visible unavailable state; retry button does nothing |
| page record creation download/parse/insert error | throws | no local error boundary/recovery |
| stale/cross-scope page ID | returns `null` | indefinite preparation screen with no polling |
| measurements query error | returns `[]` | silently empty overlays |
| calibration query error | returns `null` | silently uncalibrated/disabled line+area tools |
| geometry query error | dev throws; production returns empty child data | dev route error or silently missing shapes/paths |
| client page API 404/500/non-JSON | throws, stored in state | current page remains; no visible error/loading |
| PDF.js import/worker/document/page/render | generic visible error; dev-only detailed log | no runtime retry; production phase diagnostics absent |
| preparation worker POST failure | swallowed | calm text, repeated polling/kicks; can remain forever |
| preview status API failure | ignored | polling continues without escalation |

No route-local `error.tsx`, root `global-error.tsx`, or Takeoff-specific `not-found.tsx` exists.

## M. First Load vs Return Load

| Navigation | Repeated work | Reused work |
| --- | --- | --- |
| First Opportunity → Measure with no context | alias selection/redirect, canonical shell, signing, selected-page payload, hydration, PDF runtime, neighbour priming | production Link prefetch may move some route work earlier |
| Return to exact Measure URL in same app session | can repeat canonical server queries/signing and remount viewer; exact Next router payload may be reused if still cached | browser static chunks/worker and possibly HTTP PDF bytes; framework router cache only, not explicit app cache |
| Leave Measure for Quantities then return | editor component unmounts; component Maps, PDF document/page proxies, mutation refs, and viewer state are lost | JS/static browser cache; possibly Next router cache |
| Page change within same drawing | no Next server navigation; `window.history.pushState`, component page cache/API, same signed PDF/document | initial/current/primed page data and PDF page proxy caches |
| Drawing change/full assignment | server shell/sign/page load and PDF document startup repeat; old component cache may be discarded | downloaded JS/worker |

The page cache is initialized as an empty component-local `Map`, populated with initial data after mount, and primed for neighbours (`TakeoffMeasureWorkspace.tsx:305-310,607-714,734-737`). It is keyed by globally unique page ID, which is appropriately scoped in practice. It does not help the first server navigation and is lost on unmount/return. It also caches complete measurement geometry, so memory grows with visited/primed pages.

The PDF page-proxy cache is similarly component-local (`TakeoffPdfViewer.tsx:1506-1507,2885-2913`) and is cleared when a new PDF document loads.

## N. Dev vs Production

### Development-only or development-amplified

- Automatic Link prefetching is disabled in development, so production’s hidden Measure+Quantities prefetch load will not reproduce faithfully in dev.
- First navigation in `next dev --webpack` can include route/client chunk compilation, source-map work, Fast Refresh overhead, and PDF.js/export chunk compilation (`package.json:6`).
- App Router Strict Mode development behavior can repeat effect setup/cleanup, amplifying PDF teardown/reload and background priming noise.
- Geometry child query errors throw in development but are swallowed in production (`lib/takeoff-server.ts:748-751,774-777,822-825,848-851`).
- Detailed PDF failure logging exists only in development.

### Production architecture problems

- Alias redirect and duplicate workspace/page loaders.
- `prefetch={true}` on both heavy dropdown routes (production-only execution, but a production problem).
- Full-PDF server initialization when page rows are missing.
- Blocking signing/data before RSC output.
- No loading/error boundary.
- Immediate neighbour API/PDF priming.
- Broad selected-page geometry payload and large client module.
- No Takeoff/storage/PDF timeouts or reliable retry state.

Development compile latency may exaggerate the first visit, but it cannot explain the stale-page dead end, no-op retry, silent page failure, query waterfall, or synchronous server PDF initialization.

## O. Caching / Prefetch Findings

### Current caching

- `getCurrentOrganizationMember` and `getOpportunityWorkspaceData` use React `cache()` and deduplicate only within the relevant React server request/render (`lib/projects-server.ts:80-82`; `lib/opportunity-workspace-server.ts:11`).
- Takeoff workspace resolution, page lists, drawing rows, signed URLs, measurements, geometry, and calibration have no `unstable_cache`, shared application cache, or explicit durable cache.
- Adjacent-page client API requests explicitly use `cache: "no-store"` (`TakeoffMeasureWorkspace.tsx:360-367`).
- The signed URL is valid for one hour but is not an application data cache.
- The component page/PDF caches help in-viewer page changes only and are lost on unmount.
- Supabase authenticated Auth/PostgREST/Storage requests are not safely deduplicated by Next fetch memoization as identical public GET data calls; the code should be treated as repeated work unless React helper caching shown above applies.

### Current prefetch

- Both Measure and Quantities use Next `<Link prefetch>` (`OpportunityWorkspaceShell.tsx:209,219`). In Next 16, explicit `prefetch={true}` requests full prefetching for static **and dynamic** routes, in production only.
- The dropdown links do not exist in the visible viewport until the menu content mounts. Opening the menu can therefore start both full route prefetches at once.
- From a non-Takeoff opportunity page, Measure prefetch targets the expensive redirect alias, not the canonical viewer URL (`OpportunityWorkspaceShell.tsx:87-90`).
- There is no `router.prefetch`/hover/focus warm-up for Takeoff context. The only custom intent prefetch in this navigation is for Files (`OpportunityWorkspaceShell.tsx:166-179`).
- No Takeoff `loading.tsx` exists to create a cheap partial-prefetch boundary.

Safe future opportunities are: canonical-link intent warm-up of minimal auth/workspace context, a loading boundary that prevents full heavy route prefetch, and carefully bounded selected-page metadata caching. Full Quantities/PDF/geometry work should not be warmed merely because the dropdown opened.

Framework references: [Next.js Link `prefetch` reference](https://nextjs.org/docs/app/api-reference/components/link), [Next.js prefetching guide](https://nextjs.org/docs/app/guides/prefetching), and [Next.js linking/loading guidance](https://nextjs.org/docs/app/getting-started/linking-and-navigating).

## P. Recommended Target Architecture

```text
user shows Takeoff intent
└── optionally warm minimal authorized opportunity/workspace context only

user selects Measure
└── one canonical URL (no data-loading redirect alias)
    ├── immediate editor shell + route pending feedback
    ├── validate/normalize drawingSetId + pageId deterministically
    │   └── stale page → safe first-page fallback or explicit recoverable message
    └── stream/defer selected content
        ├── selected drawing metadata
        ├── signed PDF URL with typed error + renewal/retry
        └── selected page payload
            ├── minimal page metadata
            ├── active calibration
            └── selected-page measurements + batched geometry

client viewer mounts
├── PDF.js chunk/worker/document load with timeout + retry state
├── first selected page canvas
├── overlays
└── only after first usable canvas / idle or explicit intent
    ├── neighbour page-data prefetch (bounded/cancellable)
    ├── neighbour PDF page proxy prefetch (bounded)
    ├── export modules
    └── calibration/history/dialog modules as needed

page rows absent
└── idempotent background preparation job
    ├── one owner/lock per drawing revision
    ├── explicit pending/ready/failed status
    ├── no full-PDF parsing inside navigation request
    └── recoverable progress/error UI
```

Reliability order is deliberate: canonical selection, typed errors, timeouts, and stuck-state removal precede caching or bundle tuning.

## Q. Recommended Fixes in Priority Order

| Priority | Problem | Proposed future fix | Expected impact | Risk | Files/systems involved |
| ---: | --- | --- | --- | --- | --- |
| 1 | stale page dead end, no-op signing retry, invisible page failures | Make route selection/retry a typed state machine; pass valid page ID to preparation; render page loading/error; renew/re-sign PDF on retry | Removes confirmed “doesn’t load” paths | Low–Medium | page selection, Measure page, workspace, preparation, viewer |
| 2 | no route feedback/error boundary or request timeout | Add editor/Takeoff loading and error boundaries; add scoped timeouts and typed failures for initial DB/storage/PDF stages | Immediate feedback and bounded failure | Low–Medium | route files, Supabase client wrapper, PDF viewer |
| 3 | heavy alias + unsafe full prefetch | Link to one canonical Measure selection path; avoid full prefetch of heavy Measure/Quantities loaders; warm only minimal safe context on intent | Removes duplicate requests and hidden DB fan-out | Medium | Opportunity navigation, route selection, Next prefetch policy |
| 4 | page creation downloads/parses full PDF in navigation | Move page synchronization to a single idempotent background preparation lifecycle with drawing-revision state | Largest cold/new-drawing reliability gain | Medium–High | Takeoff server, worker, storage, page status |
| 5 | repeated shell/workspace queries | Consolidate/carry authorized workspace context through shell, signing, page loaders; remove rich header enrichment not required by fullscreen shell | Reduces canonical 12–19 call path | Medium | opportunity workspace server, Takeoff page-data/server |
| 6 | sequential/broad selected-page payload | Return minimal columns and fetch area/line child branches in parallel or via one scoped read RPC if justified | Lower DB latency/payload | Medium | Supabase queries/RPC, types |
| 7 | neighbour priming competes with first canvas | Delay, bound, and cancel page-data/PDF neighbour priming until first usable canvas/idle; avoid two API auth/workspace repeats | Faster first usable viewer, less load burst | Low–Medium | workspace, viewer, page API |
| 8 | large eager client graph / eager `pdf-lib` | Split export and nonessential dialogs/tools behind user action; then evaluate viewer decomposition with bundle report | Lower hydration/parse cost | Medium | viewer, export modules, dialogs |
| 9 | Quantities N-page fan-out | Introduce a set-based quantities read contract or paged/streamed aggregate load; do not fully prefetch it on menu open | Prevents data-growth collapse | Medium–High | Quantities page, server/RPC |
| 10 | no production evidence | Add Server-Timing/query counts/client performance marks and production error phase telemetry | Makes later optimization measurable | Low | proxy/routes/loaders/viewer/observability |

## R. Files Likely To Change

| Path | Current responsibility | Likely future optimization |
| --- | --- | --- |
| `components/app/OpportunityWorkspaceShell.tsx` | Takeoff dropdown, alias/direct href, full prefetch | canonical link, bounded intent prefetch, pending feedback |
| `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/page.tsx` | latest-area/drawing/page selection redirect | remove heavy redirect loader or reduce to canonical lightweight normalization |
| `app/app/(editor)/leads-clients/opportunities/[opportunityId]/takeoff/measure/page.tsx` | blocking shell/viewer composition | stream shell, typed states, valid selection handling |
| `.../takeoff/takeoff-page-data.ts` | shell, page, PDF+page composition | consolidated context, minimal payload, parallel reads, instrumentation |
| `lib/takeoff-server.ts` | workspace, signing, pages, PDF initialization, measurements/geometry | typed failures/timeouts, idempotent preparation, set-based reads, instrumentation |
| `lib/takeoff/page-selection.ts` | strict page scope selection | explicit stale-ID recovery policy |
| `components/app/TakeoffPreparationWorkspace.tsx` | worker kicking/status polling | finite state, required scope, terminal errors, no unbounded worker spam |
| `components/app/TakeoffMeasureWorkspace.tsx` | client page cache/API/history/retry | visible pending/error, correct PDF retry, delayed/cancellable priming |
| `components/app/TakeoffPdfViewer.tsx` | entire PDF/editor runtime | timeout/retry/telemetry; defer export/dialog code; split only at safe boundaries |
| `lib/exports/takeoff-pdf-export.ts` | on-demand PDF export implementation | dynamically load from export action boundary |
| `app/api/takeoff/measure-viewer/route.ts` | full page-data API | authorized minimal page endpoint, timeout/error codes, timing |
| `app/app/(workspace)/.../takeoff/quantities/page.tsx` | selected/all-page quantity reads | set-based/paged server contract |
| new Takeoff `loading.tsx` / `error.tsx` | currently absent | immediate route feedback and recoverable failure UI |
| Supabase migration/RPC (only if measurement proves need) | current indexes/read tables | latest-area index or scoped viewer/quantities RPC |

## S. Database Changes

**POSSIBLE INDEX/RPC OPTIMIZATION**

No database migration is required for the first reliability and architectural fixes. Existing page, active-measurement, calibration, and geometry-parent indexes are aligned with the core selected-page reads.

After instrumentation and `EXPLAIN (ANALYZE, BUFFERS)` on production-shaped data, consider:

- an index matching latest active area selection’s `updated_at` ordering; and/or
- a single authorized, set-based viewer/Quantities read RPC to replace round trips.

Do not add either until query plans and payload sizes demonstrate benefit.

## T. Instrumentation Plan

Future instrumentation should use one correlation ID across:

1. Takeoff navigation intent/click and target href;
2. Proxy auth complete;
3. alias selection stages (latest measurement, drawing list, page initialization);
4. shell stages (member, opportunity core/enrichment, workspace resolution);
5. drawing row and signed URL;
6. page list, measurement base query, area shapes/points, line paths/points, calibration;
7. page initialization download bytes/time, ArrayBuffer time, PDF parse time/page count, insert/reload time;
8. RSC response complete;
9. hydration/viewer mount;
10. PDF.js module, worker response, document promise, first-page proxy, first canvas, overlay ready; and
11. neighbour prefetch start/end/cancel.

Emit:

- `Server-Timing` for server stages;
- a per-request Supabase invocation counter by category/table;
- file bytes/page count/measurement count/geometry point count;
- storage status, `Accept-Ranges`, `Content-Length`, range request count/bytes;
- client `performance.mark/measure` from click to shell, PDF ready, canvas ready, usable; and
- production-safe PDF error phase codes without signed query tokens.

`TAKEOFF_PERF_LOGS` currently times mutation operations through `createTakeoffPerfTrace`, not the initial read/navigation lifecycle (`lib/takeoff-server.ts:259-289`). It cannot answer this audit’s timing question without future extension.

## U. Testing Requirements

Existing useful coverage:

- page scope rejection: `lib/takeoff/page-selection.test.ts`;
- client mutation race primitives: `lib/takeoff/measurement-lifecycle.test.ts`;
- page API response/error sanitization: `app/api/takeoff/measure-viewer/route.test.ts`;
- PDF.js worker/canvas/page functional E2E: `tests/e2e/takeoff-measure-pdf-runtime.spec.ts`;
- calibration dialog presentation: `components/app/takeoff-calibration-dialog-ui.test.ts`.

Required future regression/performance coverage:

1. Opportunity → Measure uses one canonical navigation and does not duplicate page loader work.
2. Opening the Takeoff dropdown does not execute full Measure and Quantities datasets.
3. A route shell/loading state appears before PDF/signing/data complete.
4. Stale/cross-drawing page ID resolves to a safe page or a visible recoverable error—never endless preparation.
5. Signed URL failure shows a working retry that re-signs.
6. Missing object, storage timeout, DB timeout, page API failure, PDF worker failure, document failure, and render failure each reach a terminal visible state.
7. Page API failure clears pending UI; stale response cannot overwrite active page.
8. Page-record initialization is idempotent under two concurrent requests and does not parse twice.
9. First page becomes usable without waiting for neighbour prefetch.
10. Return navigation has defined cache/signing behavior and never uses an expired URL.
11. Query-budget tests for canonical Measure and Quantities; assert no duplicate auth/workspace/page reads beyond budget.
12. PDF matrix: small/large bytes, few/many pages, linearized/non-linearized, range supported/unsupported, high DPR.
13. Payload matrix: many measurements, many generic points, many area shapes/points, many line paths/points, large metadata.
14. Production build bundle budget for Measure initial chunk; export library absent until action.
15. Performance thresholds in a production build for click→shell, click→canvas, click→usable, with p50/p95 and failure rate.

## V. Risk Register

| Risk | Severity | Cause | Mitigation |
| ---- | -------- | ----- | ---------- |
| Navigation appears frozen | CRITICAL | dynamic blocking routes without loading boundary; redirect waterfall | shell/loading state + canonical route |
| Permanent preparation screen | CRITICAL | stale page rejected; no page ID passed to polling | explicit selection recovery/terminal error |
| New/large PDF exhausts server memory or times out | CRITICAL | full Blob→ArrayBuffer→pdf-lib load in route; 5 GB accepted | background bounded preparation; size/resource policy |
| Hidden production DB/storage surge | HIGH | both dropdown links full-prefetch heavy routes | bounded intent prefetch; cheap loading boundary |
| Duplicate page initialization | HIGH | non-locked zero-row race | idempotent job/claim and revision key |
| PDF unavailable cannot recover | HIGH | signing errors collapse to null; retry short-circuits | typed signing error + actual re-sign retry |
| Silent missing measurements/calibration | HIGH | query errors converted to empty/null | distinguish empty from failure; visible degraded state |
| Silent page-change failure | HIGH | pending/error props unused | render/cancel/retry page state |
| Long external wait | HIGH | no Takeoff/storage/PDF timeout | scoped AbortSignal/timeouts and terminal state |
| Data growth degrades Quantities | HIGH | per-page fan-out and geometry hydration | set-based/paged contract and no eager prefetch |
| Large client startup | MEDIUM–HIGH | monolithic viewer and eager export dependency | bundle measurement, action-boundary imports |
| Signed URL leaks in logs | MEDIUM | error reporting around asset URLs | always log source path key without query token (existing client helper already strips query) |
| Optimization introduces stale authorization/data | HIGH | over-broad shared caching | request/user/org-scoped cache keys; short TTL/invalidation; authorization before admin reads |

## W. Recommended Implementation Phases

```text
Phase 1 — reliability and stuck-state removal
  stale selection, real retries, visible page errors, terminal preparation states

Phase 2 — bounded loading/error architecture
  route loading/error boundary, server/storage/PDF timeouts, production telemetry

Phase 3 — canonical navigation and prefetch correction
  remove heavy alias duplication; prevent Measure+Quantities full prefetch surge

Phase 4 — page preparation lifecycle
  take full-PDF parsing out of navigation; single idempotent job/status flow

Phase 5 — server query/payload consolidation
  reuse authorized context; parallel/minimal selected-page reads; verify indexes/RPC

Phase 6 — first-usable client path
  delay/cancel neighbour priming; defer export/nonessential modules; bundle budget

Phase 7 — Quantities scalability
  replace per-page query fan-out with set-based/paged loading

Phase 8 — production verification
  p50/p95/failure-rate comparison across PDF/page/geometry size matrix and return loads
```

Each phase has a narrow owner boundary and can be verified before the next; no giant Takeoff rewrite is required.

## X. Implementation Readiness

```text
IMPLEMENTATION READY: YES

Primary bottleneck:
Architectural route/server waterfall: heavy production prefetch and alias redirect work,
followed by a 12–19-call canonical server render and immediate neighbour priming.
For drawings without page rows, synchronous full-PDF server download/parsing dominates.

Primary intermittent failure cause:
Stale page IDs enter a preparation screen with no page ID to poll and no refresh path.
PDF-signing retry is also code-confirmed as a no-op, and page API failures are invisible.

Initial load query count:
19 minimum / 25 typical / 51 worst-case backend invocations for the normal alias-to-canonical UI path.
Database-only portion: 14 minimum / 20 typical / 45 worst case.
Canonical Measure alone: 12 minimum / 19 typical / 33 first-page-record worst case.

PDF blocks first render:
PARTIALLY

Duplicate server work:
YES

Client bundle issue:
YES

Database migration likely:
POSSIBLY

Recommended first fix:
Remove the confirmed stuck states first: normalize stale page selection, make PDF retry actually
re-sign/reload, render page pending/errors, and add bounded loading/error behavior. Then replace
the heavy alias/full-prefetch path with one canonical shell-first navigation.
```
