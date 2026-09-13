# Pricing Worksheet Measure / Takeoff Drawer Architecture Audit

Audit date: 2026-08-23  
Scope: read-only audit of the repository as it existed in the working tree on the audit date.  
Runtime note: the supplied screenshot corroborates the desktop layout. The required in-app browser automation runtime was unavailable, so keyboard/focus/click-away findings below are derived from source and existing tests rather than a new interactive run.

## A. Executive Verdict

**READY WITH SMALL ARCHITECTURAL REFACTOR**

TradesStack already has almost all of the required foundations:

- a shared responsive worksheet side-panel shell;
- a proven lazy-loading drawer lifecycle;
- a generic cell model whose metadata can hold source snapshots;
- one canonical worksheet mutation path with formula recalculation, history, dirty state, and save validation;
- a persisted, server-calculated Takeoff display quantity and unit;
- organization/project isolation in both server helpers and Takeoff RLS;
- commercial snapshots and immutable issued/accepted Quote boundaries.

The small refactor is to replace Material-specific panel visibility with one mutually exclusive active worksheet panel state. The Measure drawer should use `WorksheetSidePanel` directly; it should not render inside or copy `PricingWorksheetMaterialLibraryDrawer`.

The Measure data must be loaded lazily through a new lightweight server read model. Existing Takeoff page loaders are not safe to reuse for this purpose because they load PDF/viewer concerns and geometry collections. No database migration is required for the recommended snapshot-first implementation.

The highest product constraint is that a worksheet has no fixed Description/Quantity/Unit columns. It is a generic spreadsheet. Therefore the first implementation must use an explicit captured cell or explicit field mapping and must not guess adjacent columns.

## B. Current Pricing Worksheet Architecture

### Architecture tree

```text
Opportunity route
app/app/(workspace)/leads-clients/opportunities/[opportunityId]/pricing-worksheet/page.tsx
└── SharedPricingWorksheetRegisterPage
    ├── client-side scoped workbook register
    ├── URL + sessionStorage overlay restoration
    └── PricingWorksheetOverlayDialog
        └── PricingWorksheetOwnerProvider
            └── OpportunityPricingWorksheetBoard
                ├── top bar / sheet title / save / close
                ├── formatting toolbar
                ├── formula bar
                ├── virtualized worksheet grid
                ├── selection, edit, drag-fill, resize, context-menu state
                ├── worksheet mutation + undo/redo history
                ├── Material Library side panel
                ├── Commercial Mapping side panel
                └── workbook persistence RPC adapter

Project route
app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/pricing-worksheet/[worksheetId]/page.tsx
└── ProjectPricingWorksheetRoutePage
    └── resolveProjectPricingWorksheetRouteContext
        └── same SharedPricingWorksheetRegisterPage / Overlay / Board stack
```

### Entry points and ownership

- Opportunity deep route validation is at `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/pricing-worksheet/[worksheetId]/page.tsx:6-31`. It verifies the workbook belongs to the opportunity and is not archived, then returns the shared register.
- The opportunity index route is a direct export of the shared register at `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/pricing-worksheet/page.tsx:1`.
- The current Project quote route delegates to `components/app/ProjectPricingWorksheetRoutePage.tsx:5-29`.
- Project/Quote/workbook authorization and route canonicalization are resolved server-side at `lib/project-pricing-worksheet-route-server.ts:14-65`, including organization, project, quote, opportunity lineage, archive, variation, and working-clone filters.
- Owner variants are explicit at `lib/pricing-worksheet-owner.ts:1-14`: `opportunity`, `project`, `quote`, and `variation`.
- Opportunity owners deliberately persist `projectId: null` even when a workspace Project exists (`lib/pricing-worksheet-owner.ts:16-38`). Project owners persist both opportunity lineage and Project ownership (`lib/pricing-worksheet-owner.ts:63-81`).

### Server/client boundary

The route and owner resolution are server-side. The register and editor are client components:

- `components/app/PricingWorksheetRegisterPage.tsx:247-268` initializes the shared register with the resolved owner.
- It opens an editor by writing overlay state to history/session storage (`components/app/PricingWorksheetRegisterPage.tsx:296-367`).
- It renders `PricingWorksheetOverlayDialog` at `components/app/PricingWorksheetRegisterPage.tsx:1202-1210`.
- The overlay is a full-viewport modal that deliberately prevents Escape and outside dismissal (`components/app/PricingWorksheetOverlayDialog.tsx:25-44`).
- `OpportunityPricingWorksheetBoard` is the actual editor at `components/app/OpportunityPricingWorksheetBoard.tsx:1961-1976`.

### Worksheet, row, and cell model

The worksheet is a generic sparse spreadsheet, not a typed estimating-row table:

- `WorksheetColumn`: ID, index, label, width.
- `WorksheetRow`: ID, index, height.
- `WorksheetCell`: value, type, formula, computed value, display value, and JSON metadata.
- `WorksheetData`: version, name, dimensions, columns, rows, sparse `cells`, and sheet metadata.

These definitions are at `lib/opportunity-pricing-worksheet-defaults.ts:3-36`. The default grid is 500 rows by 26 columns (`lib/opportunity-pricing-worksheet-defaults.ts:59-105`). There is no native row type, quantity column, unit column, description column, rate column, or total column.

Cells normalize literals into `text`, `number`, or formula-bearing text at `lib/opportunity-pricing-worksheet-defaults.ts:135-180`. Persisted JSON is normalized defensively at `lib/opportunity-pricing-worksheet-defaults.ts:249-329`.

### State, selection, editing, and history

The Board owns the editor state locally:

- worksheet and save state: `components/app/OpportunityPricingWorksheetBoard.tsx:1977-2005`;
- panel state: `components/app/OpportunityPricingWorksheetBoard.tsx:2021-2029`;
- history, active editor, selection, drag, and resize state: `components/app/OpportunityPricingWorksheetBoard.tsx:2035-2064`.

Selection is a multi-range model. `selectedSingleCellKey` is derived only when exactly one cell is selected (`components/app/OpportunityPricingWorksheetBoard.tsx:2634`). Editing can occur in a cell or formula bar. Arrow keys, Tab, Enter, Delete/Backspace, typing, undo/redo, zoom, and mapping-mode Escape are centralized in `handleWorksheetKeyDown` beginning at `components/app/OpportunityPricingWorksheetBoard.tsx:6591`.

Structural row/column insertion and deletion, including formula reference shifting, live in `lib/opportunity-pricing-worksheet-structure.ts:267-540`. Paste is handled by `lib/opportunity-pricing-worksheet-paste.ts:135`. Selection and fill dragging are internal pointer operations; the only HTML5 `draggable` cell path is for Commercial Mapping (`components/app/OpportunityPricingWorksheetBoard.tsx:1479-1484`). The Material drawer has no drag/drop insertion path.

Cell, row, and column context menus are local Board state (`components/app/OpportunityPricingWorksheetBoard.tsx:315-334`) and are opened around `components/app/OpportunityPricingWorksheetBoard.tsx:5961-6093`. Context menus close on window mousedown, scroll, or Escape (`components/app/OpportunityPricingWorksheetBoard.tsx:4330-4353`).

### Canonical mutation path

All committed worksheet changes should pass through `applyCommittedWorksheetChange` (`components/app/OpportunityPricingWorksheetBoard.tsx:4536-4633`). It:

1. checks edit permission/mode;
2. delegates to `applyWorksheetMutation`;
3. recalculates formulas by default;
4. validates formula outputs when requested;
5. records one undo snapshot and clears redo history;
6. recalculates the pricing summary;
7. updates the worksheet ref/state;
8. sets dirty state.

`applyWorksheetMutation` is at `lib/opportunity-pricing-worksheet-mutations.ts:39-103`. It clones the worksheet, runs the mutation, recalculates formulas, invalidates changed Material provenance, and optionally blocks formula errors.

Undo/redo is bounded to 50 snapshots (`components/app/OpportunityPricingWorksheetBoard.tsx:488`) and restored by the handlers at `components/app/OpportunityPricingWorksheetBoard.tsx:6547-6573`.

### Persistence and autosave

Worksheet content is not continuously autosaved. It becomes dirty and is saved by the Save action, by Close, or before operations/sheet transitions that explicitly flush it. Only the worksheet title has a debounced autosave controller.

- Save implementation: `components/app/OpportunityPricingWorksheetBoard.tsx:6958-7183`.
- Close flushes title and silently saves dirty content: `components/app/OpportunityPricingWorksheetBoard.tsx:7185-7203`.
- Save validation runs before persistence: `components/app/OpportunityPricingWorksheetBoard.tsx:6980-6994`.
- A mutation revision prevents an older save response from overwriting newer local edits: `components/app/OpportunityPricingWorksheetBoard.tsx:6995` and `7136-7176`.
- Workbook persistence is through `save_pricing_workbook_active_sheet` in `lib/opportunity-pricing-workbook.ts:782-841`.
- Parent workbook and child sheets store `worksheet_data`, `pricing_summary`, and `extracted_pricing_data`; load filters are at `lib/opportunity-pricing-workbook.ts:599-695`.

The cell metadata that would hold Measure provenance is already persisted inside worksheet JSON. A separate relation is not required for a snapshot-first integration.

### Quantity semantics

There is no globally designated worksheet Quantity or Unit cell. Commercial publication recognizes five semantic fields—Description, Quantity, Unit, Rate, Total—only through explicit mapping or interpretation (`lib/commercial-items/worksheet-commercial-mapping.ts:16-65`). Numeric fields must resolve to numeric cells and Unit/Description to text-compatible cells (`lib/commercial-items/worksheet-commercial-mapping.ts:94-141`).

Formula results can be used as commercial numeric values because resolution prefers numeric `computedValue` then numeric `value` (`lib/commercial-items/worksheet-commercial-mapping.ts:107-111`). Effective commercial values and the `Quantity × Rate` warning are calculated during mapping (`lib/commercial-items/worksheet-commercial-mapping.ts:170-197`).

Therefore a Measure quantity inserted as a numeric literal will participate in existing formulas immediately. Replacing a formula must require confirmation because the new literal removes that formula, as Material insertion already demonstrates.

## C. Existing Material Library Drawer Architecture

### Opening, closing, and mutual exclusion

- Toolbar button: `components/app/OpportunityPricingWorksheetBoard.tsx:9117-9133`.
- Visibility state: local boolean `isMaterialLibraryOpen` at `components/app/OpportunityPricingWorksheetBoard.tsx:2022`.
- Captured insertion target: local `materialTarget` at `components/app/OpportunityPricingWorksheetBoard.tsx:2023`.
- Open lifecycle: `components/app/OpportunityPricingWorksheetBoard.tsx:5285-5295` commits an active edit, blocks Commercial Mapping, closes AI chat, captures the current single cell, and opens the panel.
- Close lifecycle: `components/app/OpportunityPricingWorksheetBoard.tsx:5297-5301` clears visibility and target.
- Opening the AI dialog closes Materials (`components/app/OpportunityPricingWorksheetBoard.tsx:2909-2922`). Starting Commercial Mapping closes Materials (`components/app/OpportunityPricingWorksheetBoard.tsx:2963-2980`). This is manual mutual exclusion, not an abstract panel registry.
- The target is invalidated when the sheet/structure/cell disappears (`components/app/OpportunityPricingWorksheetBoard.tsx:5412-5421`). After insertion, selecting another single cell can arm a new target (`components/app/OpportunityPricingWorksheetBoard.tsx:5406-5410`).

There is no Material-specific Escape handler, focus trap, initial autofocus, or focus restoration. On desktop, clicking the grid is allowed because the panel is nonmodal. On narrow screens, the backdrop button is a click-away close surface. The header close button always closes.

### Drawer shell

`WorksheetSidePanel` is already the correct shared primitive (`components/app/WorksheetSidePanel.tsx:7-42`):

- narrow screens: fixed right panel, `z-50`, width `min(100vw, 420px)`, full height, overlay shadow, and a `z-40` blurred backdrop that closes on click;
- `md` and wider: static flex sibling, 400 px width, full height, border-left, no shadow, no backdrop effect;
- no animation or resize support;
- no portal—the panel is rendered as a Board sibling;
- content is clipped by the shell and individual body regions scroll vertically.

Shared header styling and close accessibility are at `components/app/WorksheetSidePanel.tsx:44-77`. Reusable body/footer primitives are at `components/app/WorksheetSidePanel.tsx:80-89`.

### Drawer content and visual pattern

`PricingWorksheetMaterialLibraryDrawer` is the confirmed component (`components/app/PricingWorksheetMaterialLibraryDrawer.tsx:326-338`). Its structure is:

```text
WorksheetSidePanel
├── WorksheetSidePanelHeader
├── Library / Updates tabs
├── selected-cell context
├── warning state
├── search or update filters
├── scroll body
│   ├── loading/error/empty state
│   └── grouped result cards
└── conditional pagination footer
```

Important reusable patterns:

- header: `components/app/PricingWorksheetMaterialLibraryDrawer.tsx:569-578`;
- compact two-tab underline navigation: `151-193`;
- target/current-value context strip: `195-207`;
- centered empty state: `210-227`;
- search field and clear action: `589-604`;
- scroll body and loading/error/empty/result states: `618-638`;
- bordered grouped cards: `299-323`;
- pagination: `717-718`.

The future Measure content should reuse the shell, header, Input/Button/OperationalAlert/StatusBadge primitives, spacing tokens, grouped-card treatment, loading state, and pagination treatment. Material-specific pricing cards, update-review tab, conversion evidence, and supplier concepts should not be generalized into Measure.

### Fetching and search

The drawer does no search request until a normalized search reaches two characters. Search is normalized by `lib/pricing-worksheet-material-picker.ts:12-20`.

Client lifecycle (`components/app/PricingWorksheetMaterialLibraryDrawer.tsx:339-447`):

- 300 ms debounce;
- page reset when search changes;
- `AbortController` cancellation;
- monotonically increasing request sequence to discard stale responses;
- per-request-key suppression of duplicate completed searches;
- `cache: "no-store"`;
- bounded server pagination;
- loading, parse, API, empty, and search-hint states.

The API route authenticates the member, requires a workbook ID, invokes the server search, returns `private, no-store`, and maps scope failures to 403 (`app/api/pricing-worksheets/materials/route.ts:6-28`). The server adapter clamps page size and calls `search_pricing_worksheet_materials` (`lib/pricing-worksheet-material-picker-server.ts:14-47`).

The RPC is a bounded workbook-authorized read model (`supabase/migrations/20260816150000_add_pricing_worksheet_material_picker.sql:3-122`). It derives organization from the workbook, checks organization membership and `materials.view`, searches only active organization records, resolves effective prices once per page, and returns normalized JSON.

There is no client cache beyond the mounted component's result and request-key refs; closing unmounts the drawer and loses it. There is no Next revalidation because requests are explicitly no-store.

### Selection and insertion

Material insertion is intentionally one-cell-at-a-time:

- target contains workbook ID, sheet ID, cell address, cloned current cell, and structure key (`components/app/PricingWorksheetMaterialLibraryDrawer.tsx:30-36`);
- no target, multi-selection, read-only mode, or stale target disables insertion (`components/app/PricingWorksheetMaterialLibraryDrawer.tsx:549-552`);
- a nonblank cell or formula opens a replacement confirmation (`components/app/PricingWorksheetMaterialLibraryDrawer.tsx:554-561` and `721-725`);
- no new row is created and adjacent cells are not inferred;
- no drag/drop is supported.

`insertMaterialPrice` validates sheet/structure/address again, builds one numeric estimating-rate cell, and passes the change through `applyCommittedWorksheetChange` (`components/app/OpportunityPricingWorksheetBoard.tsx:5303-5339`). This produces formula recalculation, one undo entry, dirty state, and later normal workbook persistence. It is optimistic local state; the user is told to save.

### Material provenance

Material insertion has robust cell-level snapshot provenance:

- v2 provenance records binding ID, material/supplier/product IDs, source price evidence, confirmed unit conversion, normalized estimating rate, calculation version/evaluation time, and labels (`lib/worksheet-material-pricing-provenance.ts:37-86`).
- `buildMaterialEstimatingRateWorksheetCell` writes the numeric estimating rate, removes any formula, and embeds v2 provenance (`lib/pricing-worksheet-material-picker.ts:163-220`).
- provenance remains when a cell moves or is formatted, but is removed when its represented value/formula changes (`lib/worksheet-material-pricing-provenance.ts:252-304`).
- active bindings can be collected from worksheet JSON (`lib/worksheet-material-pricing-provenance.ts:306-313`).

This pattern is reusable conceptually for Measure: source identity plus an immutable inserted snapshot in cell metadata, invalidated when the inserted value is overwritten. The Material-specific schema and database reconciliation trigger should not be reused verbatim.

## D. Project Measure / Takeoff Architecture

### Architecture tree

```text
Opportunity Takeoff Measure route (editor layout)
└── getTakeoffPageShellData
    ├── current organization member
    ├── opportunity workspace resolver
    └── selected drawing set
└── getTakeoffMeasureViewerData
    ├── signed PDF URL
    └── getTakeoffMeasurePageData
        ├── pages / selected page
        ├── page measurements + all geometry
        ├── active calibration
        └── readiness
└── MeasureFullscreenShell
    └── TakeoffMeasureWorkspace
        └── TakeoffPdfViewer
            ├── calibration UI
            ├── line / area / count drawing tools
            ├── optimistic page cache
            └── server actions

Takeoff persistence
├── project_drawing_sets
├── takeoff_pages
├── takeoff_calibrations
├── takeoff_measurement_groups (foundation present; UI currently dormant)
├── takeoff_measurements (aggregate + canonical display quantity)
├── takeoff_measurement_points
├── takeoff_measurement_line_paths + points
├── takeoff_measurement_area_shapes + points
└── takeoff_measurement_events

Quantities route
└── pages for one drawing set
    └── per-page measurements + geometry + calibrations
        └── mapTakeoffToQuantityRows
            └── TakeoffQuantitiesFilters / table / exports
```

### Routes and loaders

- Measure route: `app/app/(editor)/leads-clients/opportunities/[opportunityId]/takeoff/measure/page.tsx:12-76`.
- It loads shell/workspace state, optionally loads a drawing/page viewer payload, builds server actions, and renders the full-screen Measure workspace.
- Shared shell/page data: `app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data.ts:49-71`.
- Page data loads/creates pages, selects the page, then loads measurements and active calibration (`takeoff-page-data.ts:74-130`).
- Viewer data additionally signs the source PDF (`takeoff-page-data.ts:145-177`).
- Client page navigation uses a page cache and a no-store API request (`components/app/TakeoffMeasureWorkspace.tsx:299-413`).
- API route: `app/api/takeoff/measure-viewer/route.ts:4-50`.

### Viewer/tools and mutations

`TakeoffPdfViewer` owns calibration/drawing interaction and optimistic geometry state; `TakeoffMeasureWorkspace` owns cross-page fetch caching. Mutations are exposed by `createTakeoffPageActions` (`lib/takeoff/actions.ts:63 onward`) and implemented in `lib/takeoff-server.ts`.

Creation inputs support kind, name, description, optional group/color, points, and count (`lib/takeoff-server.ts:197-207`). Detail updates support name, description, tag metadata, and color (`lib/takeoff-server.ts:243-250`). Measurement status transitions are `active`, `archived`, and `deleted`; there is no `completed` status (`supabase/migrations/20260421110000_create_takeoff_tables.sql:9-13`).

Server creation computes geometry from normalized points and page dimensions, applies the active calibration, converts to display units, writes the aggregate measurement, then writes child geometry (`lib/takeoff-server.ts:3034-3138` and `3200-3333`). Append/update/delete child operations recompute and persist aggregate totals; representative recalculation sites are `lib/takeoff-server.ts:3563-3575`, `3793-3807`, `4639-4652`, and `4828-4843`.

Every lifecycle change records a measurement event snapshot containing measurement plus point/shape/path geometry (`lib/takeoff-server.ts:873-912`).

### Drawing and page relationship

Measurements directly store both `drawing_set_id` and `page_id`. Pages store the PDF drawing-set relationship, `page_number`, optional `page_label`, dimensions, rotation, revision, preview metadata, and storage path (`supabase/migrations/20260421110000_create_takeoff_tables.sql:42-64`). Drawing-set `file_name` is available from `project_drawing_sets` (`lib/takeoff-server.ts:56-57`) without loading the PDF.

The reliable drawer hierarchy is therefore:

```text
Drawing set (file_name)
└── page (page_label or Page N)
    └── measurement
        ├── name / description
        ├── display_value / display_unit
        ├── kind / status
        └── optional measurement group
```

`takeoff_measurement_groups` supports nested project-wide groups and trade metadata (`supabase/migrations/20260421110000_create_takeoff_tables.sql:103-126`), but the current UI always submits an empty group ID (`components/app/TakeoffPdfViewer.tsx:5021`, `5254`, `5475`). Apart from the server reader and intelligence enrichment, no active group-management UI was found. The drawer should tolerate null groups and must not make grouping its primary hierarchy until that UI is activated.

## E. Authoritative Measure Quantity

The Pricing Worksheet should consume:

```text
line:  takeoff_measurements.display_value + display_unit
area:  takeoff_measurements.display_value + display_unit
count: takeoff_measurements.count_value + "count"
       (defensive fallback to display_value matches the existing Quantities adapter)
```

Evidence:

- line creation computes base length, converts it server-side, then stores `display_value` and the calibration `display_unit` (`lib/takeoff-server.ts:3072-3085`);
- area creation computes base area/perimeter, converts area server-side, then stores `display_value` and squared display unit (`lib/takeoff-server.ts:3088-3105`);
- count creation stores both `count_value` and `display_value`, with unit `count` (`lib/takeoff-server.ts:3107-3115`);
- the existing Quantities adapter treats exactly these fields as the user-facing authority (`lib/takeoff/quantities-adapter.ts:59-77`).

Do **not** use `takeoff_measurements.quantity`; current manual creation always writes `quantity: 1` (`lib/takeoff-server.ts:3132`). It is not the measured result.

Do **not** recompute from points, shapes, line paths, PDF dimensions, calibration scale, base quantities, or current active calibration inside the drawer. Historic measurements may refer to a superseded calibration. Existing Quantities code deliberately resolves the measurement's own calibration before falling back to the active one (`lib/takeoff/quantities-adapter.ts:59-63`).

For the main line/area/count value, the stored display pair is already self-contained. Area perimeter is a secondary derived presentation and should be omitted from the first drawer read model unless product scope explicitly requires it; if included later, reuse `convertBaseLengthToDisplayValue` with the measurement calibration (`lib/takeoff/measurement-display.ts:32-75`).

## F. Measure Data Model

### Core measurement record

`takeoff_measurements` is defined at `supabase/migrations/20260421110000_create_takeoff_tables.sql:128-193`, with later perimeter addition at `supabase/migrations/20260423193000_add_takeoff_area_perimeter_fields.sql:1-2`. Generated TypeScript authority is `lib/supabase/types.ts:20024`.

Actual fields:

| Concern | Actual field(s) |
| --- | --- |
| Identity/tenancy | `id`, `organization_id`, `project_id`, nullable `opportunity_id` |
| Drawing trace | `drawing_set_id`, `page_id` |
| Classification | nullable `calibration_id`, nullable `group_id`, `measurement_kind`, `status`, `source` |
| Labels | `name`, `description`, nullable `color_hex` |
| Quantities | `quantity`, nullable `count_value`, `measured_length_base`, `measured_area_base`, `measured_perimeter_base`, `display_value`, `display_unit` |
| Bounds/AI/import | bbox fields, `ai_confidence`, `ai_model`, `ai_run_id`, `external_ref`, JSON `metadata` |
| Lifecycle | `version`, creator/updater/archiver IDs, timestamps, `archived_at` |

The table does **not** have dedicated waste, multiplier, completion flag, measurement-system field, drawing name, sheet number, or takeoff-group label columns. Calibration owns unit system/base/display unit. Drawing/page/group labels must be joined.

### Calibration

`takeoff_calibrations` is defined at `supabase/migrations/20260421110000_create_takeoff_tables.sql:66-101` and typed at `lib/supabase/types.ts:19453`. It stores page, scale ratio, unit system, base/display units, reference lengths, calibration points, active/superseded state, notes, metadata, creator, and timestamps.

### Geometry

- legacy/general points: `takeoff_measurement_points` (`20260421110000_create_takeoff_tables.sql:195-207`);
- area shapes and points: `20260423121000_add_takeoff_area_shapes.sql:1-45`;
- line paths and points: `20260423152000_add_takeoff_line_paths.sql:1-45`.

None is needed by the drawer.

### Groups, pages, and drawings

- groups: `takeoff_measurement_groups`, typed at `lib/supabase/types.ts:19777`;
- pages: `takeoff_pages`, typed at `lib/supabase/types.ts:20208`;
- drawings: `project_drawing_sets`, typed at `lib/supabase/types.ts:11100`.

### Existing TypeScript projections

- full measurement types: `lib/takeoff-server.ts:63-76`;
- geometry-bearing `TakeoffMeasurementWithPoints`: `lib/takeoff-server.ts:164-172`;
- current lightweight presentation shape `QuantityTableRow`: `lib/takeoff/quantities-adapter.ts:4-23`.

`QuantityTableRow` is close to the future drawer item but lacks Project/organization authorization context, drawing-set name, group data, measurement timestamps/version, and a drawer-specific parsing contract. It also originates after an expensive geometry loader, so it should inform—but not serve as—the transport type.

## G. Measure → Worksheet Compatibility

| Drawer field | Existing source | Worksheet compatibility | Constraint |
| --- | --- | --- | --- |
| Description | measurement `name`; optional `description` detail | text cell | Product must define whether name or description is primary; safe default is nonblank name with description as context |
| Quantity | stored `display_value`; count uses `count_value` | numeric cell | Never concatenate the unit into the numeric cell |
| Unit | stored `display_unit` or `count` | text cell | Plain strings are accepted; aliases are not normalized by worksheet core |
| Drawing | drawing-set `file_name`; page label/number | provenance/context text | No PDF required |
| Takeoff/group | optional `group_id` joined to group name/code | provenance/filter/context | Currently usually null because group UI is dormant |

Measure supports linear display units `mm`, `cm`, `m`, `in`, `ft`; area adds the squared form; count uses `count` (`lib/takeoff/units.ts:1-19` and `lib/takeoff-server.ts:3104-3115`).

The worksheet has no shared unit type. Commercial mapping accepts arbitrary nonblank text as Unit, while its heuristic recognizer includes `m`, `mm`, `cm`, `m²`/`m2`, `m³`/`m3`, `lm`, and many estimating units (`lib/commercial-items/worksheet-publish-v2.ts:169-211`). Notably:

- Takeoff emits `m`, not `lm`/`L/M`;
- Takeoff emits `count`, while commercial conventions often use `ea`/`each`;
- imperial squared strings are valid source strings but not in the heuristic's explicit list;
- no cross-system conversion exists in worksheet core;
- no alias normalization automatically maps `count` to `ea` or `m` to `lm`.

The safest insertion preserves the exact Takeoff display value/unit snapshot. Any alias change must be explicit presentation/mapping policy, not silent conversion.

Because the sheet layout is arbitrary, selecting one Measure cannot safely infer “Description, Quantity, Unit” destinations from neighboring cells. Behavior consistent with Material is one explicit captured target per action. If three-field insertion is required, use an explicit mapping step backed by the existing selection model; do not auto-overwrite adjacent cells or auto-create a row.

## H. Existing Measure / Worksheet Connections

No direct Measure/Takeoff → Pricing Worksheet implementation was found.

Repository-wide searches found:

- shared opportunity navigation exposes both Takeoff and Pricing Worksheet, but no data bridge (`components/app/OpportunityWorkspaceShell.tsx:13`, `54-89`);
- Commercial Mapping already models Description/Quantity/Unit/Rate/Total cell sources (`lib/commercial-items/worksheet-commercial-mapping.ts:16-65`);
- Takeoff Quantities already supplies a presentation projection (`lib/takeoff/quantities-adapter.ts:39-120`);
- the worksheet AI assistant prompt mentions planning quote/takeoff linkage, but it is advisory text, not a persisted integration (`lib/ai-pricing-worksheet-edit-assistant.ts:1448`);
- worksheet semantic/AI fixtures use words such as “Measured area” or “Material Takeoff,” but have no Takeoff IDs or source link;
- no `measure_id`, `takeoff_id`, Measure drawer, feature flag, dormant button, copy-to-worksheet RPC, worksheet source type, or database foreign key was found.

The existing reusable building blocks are adjacent architecture, not a partial implementation.

## I. Drawer Reuse Recommendation

**Reuse lower-level shared primitives, plus a small active-panel state refactor.**

Specifically:

```text
OpportunityPricingWorksheetBoard
├── activeSidePanel: "materials" | "measures" | null
├── material target state
├── measure target/mapping state
└── shared panel slot
    ├── PricingWorksheetMaterialLibraryDrawer
    │   └── WorksheetSidePanel
    └── PricingWorksheetMeasureDrawer
        └── WorksheetSidePanel
```

Reasons:

1. `WorksheetSidePanel` already extracted the shell that Option A would otherwise seek.
2. Material content is highly specialized: supplier products, estimating conversions, price updates, workbook bindings, and a replacement dialog.
3. Reusing the Material component directly would couple Measure to irrelevant price-review state.
4. Copying the shell would create the duplicate architecture the brief seeks to avoid.
5. One discriminated `activeSidePanel` makes Materials, Measures, Commercial Mapping, AI, and future libraries easier to keep mutually exclusive than adding another boolean.

Do not refactor all drawer content before the feature. The sufficient architectural change is the discriminated active panel and shared open/close coordination. `WorksheetSidePanel` itself likely needs no change for the first Measure drawer.

Accessibility debt discovered in the reference should be carried as an explicit implementation decision: Material does not close on Escape, does not focus the search input automatically, and does not restore grid focus on close. Measure should not silently invent different behavior. If these are improved, improve/test the shared panel contract and both consumers together.

## J. Proposed Data Flow

```text
User opens Measures from worksheet toolbar
        ↓
Board commits active edit and captures explicit selection context
        ↓
activeSidePanel = "measures" (Materials/AI/Mapping closed)
        ↓
PricingWorksheetMeasureDrawer mounts
        ↓
lazy GET with workbookId + search/filter/page
        ↓
server authenticates current member
        ↓
server resolves workbook organization + owner context
        ├── Project/Quote/Variation owner → scoped project_id
        └── Opportunity owner → opportunity.workspace_project_id or empty state
        ↓
server verifies organization/project/workbook relationship
        ↓
lightweight Takeoff query
  measurements (active only by default)
  + pages
  + drawing-set file names
  + optional group labels
  - no PDF URL
  - no calibration geometry
  - no points/shapes/paths/events
        ↓
validated PricingWorksheetMeasureSourcePage
        ↓
user explicitly chooses quantity/description/unit insertion target(s)
        ↓
existing applyCommittedWorksheetChange
        ↓
numeric/text cells + Measure snapshot provenance
        ↓
formula recalculation + undo entry + dirty state
        ↓
existing workbook save RPC persists worksheet JSON
```

### Recommended server shape

A purpose-built server function and API endpoint are recommended, not a database view or RPC initially. The route can perform explicit authorization and bounded selects using existing indexed columns and RLS. A representative transport shape, subject to implementation naming, is:

```ts
type PricingWorksheetMeasureSource = {
  measurementId: string;
  measurementVersion: number;
  projectId: string;
  drawingSetId: string;
  drawingSetName: string;
  pageId: string;
  pageNumber: number;
  pageLabel: string;
  groupId: string | null;
  groupName: string | null;
  kind: "line" | "area" | "count";
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  updatedAt: string;
};
```

This is supported by actual fields. Do not include geometry or calibration objects. Include a runtime parser, as Material does, so malformed numeric/null data never reaches worksheet mutation code.

Use a shared server query rather than reusing `getTakeoffMeasurementsForPage`, because that function expands points, area shapes, shape points, line paths, and path points (`lib/takeoff-server.ts:2641-2682`). Use an API route rather than a server action because the drawer needs cancellable, debounced, paginated GET reads. An RPC becomes worthwhile only if measured production volume or query-plan evidence shows that bounded relational selects are insufficient.

## K. Snapshot vs Live Link Recommendation

**Use a snapshot with source provenance for the first implementation. Do not live-link worksheet values.**

Recommended semantics:

```text
Measure 145.2 m², version 7
→ worksheet receives numeric 145.2 and text unit m²
→ cell metadata records source measurement/version/project/drawing/page/group and inserted snapshot
→ later Takeoff edits do not silently mutate the worksheet
```

Why this fits TradesStack:

- Material insertion is a snapshot value plus provenance, not an automatically updating formula/reference.
- Worksheet JSON has no runtime foreign-reference evaluator.
- Formula recalculation is local to worksheet cell references, not external entities.
- Commercial publication creates sanitized worksheet snapshots and source links (`lib/commercial-items/worksheet-publish.ts:57-87`, `141-174`).
- persisted Quote lines and PDFs read stored quote/line values (`lib/project-quote-pdf-snapshot.ts:28-79`).
- award-locked Quote revisions cannot be republished, and issued/accepted revisions are treated as immutable by current migrations/tests (`supabase/migrations/20260819140000_align_quote_publication_and_pdf_authority.sql:57`; `lib/project-quote-pricing-surface.test.ts:70`).

Suggested Measure provenance metadata should include at least schema version, binding/source ID, Takeoff measurement version, project/drawing/page/group identity, labels, kind, inserted numeric quantity/unit, and source `updated_at`. Like Material, it should be removed when the represented inserted value is overwritten. This needs a Measure-specific helper because one Measure may be represented across multiple cells and Material invalidation is price-specific.

A later “refresh from source” feature may compare versions and offer an explicit update, but it must preserve the old snapshot and require user confirmation. Deletion, archive, rename, or recalculation must never silently blank or rewrite a commercial worksheet.

## L. Performance Findings

### Initial worksheet load

Load no Takeoff data. The Measure drawer should be absent from the tree while closed, matching Materials (`components/app/OpportunityPricingWorksheetBoard.tsx:10584-10598`).

### On drawer open

Lazy-load only a bounded projection. A default first page can load immediately because Measure browsing is useful without requiring search; search/filter changes should use the Material drawer's debounce, cancellation, sequence, and no-store pattern.

Recommended default filters:

- organization and resolved Project (mandatory server scope);
- `status = active` by default;
- optional search across measurement name/description, page label, drawing-set filename, and group name/code;
- optional drawing set, page, kind, unit, and group filters;
- stable order by drawing set/page/updated or explicit user sort;
- bounded page size (20-50).

### Data that must not be fetched

- signed PDF URL or PDF bytes;
- page previews;
- measurement points;
- area shapes or shape points;
- line paths or path points;
- event snapshots;
- bbox fields;
- calibration point geometry;
- AI metadata not displayed;
- full worksheet or quote payload beyond the authorization check.

The current Quantities loader is not appropriate. It iterates every page of one drawing set, loads full geometry-bearing measurements and active calibration per page, then loads calibration records (`app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/quantities/page.tsx:17-57`). That N+1/full-geometry flow is acceptable for the existing detailed Quantities surface but unnecessarily expensive for a drawer.

Existing indexes support Project/page/status, group/status, drawing/page, and active-page reads (`supabase/migrations/20260421110000_create_takeoff_tables.sql:229-267`; `supabase/migrations/20260422153000_optimize_takeoff_measure_page_reads.sql:1-3`). Add an index only if an actual `EXPLAIN`/production trace demonstrates a missing search/order path.

## M. Permissions / Security

Existing protections:

- `getCurrentOrganizationMember` establishes the current organization.
- Takeoff workspace resolution scopes an opportunity slug to that organization and its workspace Project (`lib/takeoff-server.ts:1187-1258`).
- Takeoff mutation context validates membership/workspace before using the admin client (`lib/takeoff-server.ts:1273-1293`).
- reads use organization/project filters and authenticated Supabase/RLS.
- Takeoff tables have RLS based on membership in the owning organization/project; measurement select policy is at `supabase/migrations/20260421110000_create_takeoff_tables.sql:811-823`.
- database consistency triggers ensure page/calibration/group/measurement organization and Project relationships (`20260421110000_create_takeoff_tables.sql:430-505`).
- the Material picker demonstrates workbook-derived authorization rather than trusting a client organization ID (`20260816150000_add_pricing_worksheet_material_picker.sql:24-34`).

The future Measure endpoint must:

1. accept a workbook ID, not a caller-provided organization/project pair as authority;
2. authenticate the member;
3. load the nonarchived workbook in the member organization;
4. derive owner Project context server-side;
5. verify the resolved Project belongs to the same organization and is valid for that workbook/opportunity lineage;
6. query measurements with explicit `organization_id` and `project_id` predicates even though RLS also applies;
7. return no records for unrelated or unresolved opportunity workspaces;
8. never use an admin client for this read unless equivalent explicit authorization is proven before every query.

### Opportunity constraint

An opportunity-owned worksheet deliberately has no persisted `project_id`, while Takeoff always requires a Project ID. Current opportunity Takeoff uses `organization_opportunities.workspace_project_id`, with a project-work-context fallback (`lib/takeoff-server.ts:1200-1248`). Therefore:

- an opportunity with a workspace Project can expose that workspace's Takeoff records;
- an opportunity without a workspace Project must show “No Measure workspace available” and no query results;
- a promoted/converted opportunity must resolve the effective Project carefully; the project context helper already distinguishes final Project data from legacy workspace fallback (`lib/project-work-context-server.ts:135-223`);
- Project/Quote/Variation owners can use their explicit `projectId` after validating workbook ownership.

Do not enable the toolbar based solely on `worksheetOwner.projectId`, or valid opportunity workspace Takeoff data will be hidden. Conversely, do not trust `projectSlug` navigation context as persistence authority.

## N. UI / UX Reuse

Reuse:

- `WorksheetSidePanel`, `WorksheetSidePanelHeader`, and optionally Body/Footer;
- the 400 px desktop / max-420 px narrow sizing;
- border, surface, shadow, radius, type, and color tokens in `WorksheetSidePanel.tsx`;
- the selected-cell context strip pattern;
- Material's search Input, clear action, 300 ms debounce, cancellation, and pagination patterns;
- `OperationalAlert` for warning/error;
- centered icon/title/description empty states;
- `StatusBadge` for kind/status only if badges add useful scanability;
- grouped bordered cards and compact rows;
- existing Button/Input focus-visible treatments.

Do not reuse:

- Material Library/Updates tabs unless Measure gains a real second mode;
- supplier pricing cards;
- price review/update logic;
- material conversion and tax evidence UI;
- Material-specific target/provenance types.

Technically possible Measure search/filter fields are name, description, drawing-set filename, page label/number, optional group name/code/trade label, kind, unit, and status. The natural first visual grouping is Drawing Set → Page because those relationships are active and traceable today. Group should be secondary/optional until group management is live.

Required empty/error states:

- loading measures;
- no Project Measure workspace for this owner;
- no drawing sets;
- drawings/pages exist but no active measures;
- no results for current search/filters;
- failed/forbidden load;
- select exactly one target cell (or complete explicit field mapping);
- source was archived/deleted between load and insertion;
- workbook is read-only.

For source traceability show drawing-set file name and page label/number without loading the PDF. A future “View in Measure” link can be formed from the existing measurement URL pattern at `lib/takeoff/quantities-adapter.ts:118`, but opening it is not required for insertion.

## O. Files Likely To Be Touched During Implementation

| File | Current responsibility | Expected future responsibility |
| --- | --- | --- |
| `components/app/OpportunityPricingWorksheetBoard.tsx` | Worksheet state, selection, mutation, toolbar, Material/Mapping/AI coordination | Add Measure toolbar action, discriminated active side-panel state, target/mapping capture, and canonical Measure insertion callback |
| `components/app/WorksheetSidePanel.tsx` | Shared responsive panel shell | Likely no change; only touch if shared Escape/focus behavior is deliberately added for both panels |
| `components/app/PricingWorksheetMaterialLibraryDrawer.tsx` | Material search/review/insertion content | Ideally no behavioral change; update only if panel state/accessibility refactor requires shared contract changes |
| `components/app/PricingWorksheetMeasureDrawer.tsx` (new) | — | Measure browse/search/filter/loading/empty/result/explicit-use UI using the shared shell |
| `lib/pricing-worksheet-measure-picker.ts` (new) | — | Transport types, runtime parser, normalization, insertion/provenance cell builders |
| `lib/pricing-worksheet-measure-picker-server.ts` (new) | — | Workbook-authorized Project resolution and lightweight bounded Takeoff query |
| `app/api/pricing-worksheets/measures/route.ts` (new) | — | Authenticated, no-store, cancellable Measure drawer GET boundary |
| `lib/worksheet-measure-provenance.ts` (new) | — | Versioned source snapshot, parser, attachment, and overwrite invalidation helpers |
| `lib/opportunity-pricing-worksheet-mutations.ts` | Canonical mutation + formula recalc + Material provenance invalidation | Compose Measure provenance invalidation if source metadata is added |
| `lib/pricing-worksheet-owner.ts` | Owner context contract | Probably no change; consume owner semantics through workbook server resolution |
| `lib/takeoff/units.ts` | Canonical Takeoff unit definitions/conversions | Reuse types/parsers only; do not duplicate calculations |
| `lib/takeoff/quantities-adapter.ts` | Detailed Quantities presentation projection | Reference semantics; optionally extract only a pure label fallback helper if justified, without coupling the drawer to geometry loader |
| `lib/pricing-worksheet-material-drawer.contract.test.ts` | Material/shared panel architecture characterization | Adjust only if active-panel/source contract assertions change |
| `lib/pricing-worksheet-measure-picker.test.ts` (new) | — | Parser, authority, unit, insertion, formula replacement, and provenance tests |
| `app/api/pricing-worksheets/measures/route.test.ts` (new) | — | Auth/scope/search/pagination/error contract tests |
| `lib/pricing-worksheet-measure-drawer.contract.test.ts` (new) | — | Shell reuse, lazy mount, mutual exclusion, target invalidation, states |
| `tests/e2e/pricing-worksheet-measure-drawer.spec.ts` (new) | — | End-to-end drawer, selection, insertion, undo/save/reopen, context and accessibility coverage |

No existing file should be changed merely to duplicate the Takeoff quantity calculation.

## P. Database Changes

**NONE EXPECTED**

Reasons:

- all required source fields already exist;
- Project/drawing/page/group relationships already exist;
- canonical display quantity/unit are already stored;
- required filter columns are indexed sufficiently for an initial bounded query;
- worksheet cells already persist arbitrary JSON metadata;
- the recommended integration is a snapshot, not a referential live link;
- authorization can be enforced in a server query plus existing RLS.

A database RPC/view is optional optimization, not a prerequisite. A migration would become required only if product scope changes to durable cross-workbook Measure binding reconciliation, global stale-source review, database-enforced Measure foreign references, or query-plan evidence requires a new index/RPC.

## Q. Testing Requirements

### Existing relevant coverage

- Material drawer shell/search/target/replacement/mutual-exclusion/update contracts: `lib/pricing-worksheet-material-drawer.contract.test.ts:9-105`.
- Material picker parsing and cell provenance: `lib/pricing-worksheet-material-picker.test.ts:47 onward`.
- worksheet cell interaction visuals/selection aggregate: `components/app/OpportunityPricingWorksheetBoard.interaction.test.tsx:57-160`.
- worksheet formulas: `lib/opportunity-pricing-worksheet-formulas.test.ts:95 onward`.
- workbook adapter/save: `lib/opportunity-pricing-workbook.test.ts:384 onward`.
- worksheet interaction parity E2E: `tests/e2e/pricing-worksheet-interaction-parity.spec.ts`.
- Takeoff units: `lib/takeoff/units.test.ts:13-50`.
- Quantities historic calibration behavior: `lib/takeoff/quantities-adapter.test.ts:4-31`.
- quantity totals: `lib/takeoff/quantity-totals.test.ts:28 onward`.
- Takeoff actions/lifecycle: `lib/takeoff/actions.test.ts:27 onward` and `lib/takeoff/measurement-lifecycle.test.ts:9 onward`.
- scoped Measure page API: `app/api/takeoff/measure-viewer/route.test.ts:15-52`.
- PDF Measure runtime: `tests/e2e/takeoff-measure-pdf-runtime.spec.ts:53 onward`.
- project route and quote immutability coverage: `lib/project-pricing-worksheet-route-server.test.ts`, `lib/project-quote-publication-authority-migration.test.ts`, and `lib/project-quote-pricing-surface.test.ts`.

### Required implementation-phase tests

1. Server authorization: cross-organization/project/workbook requests return no data/403.
2. Owner resolution: opportunity workspace, Project, Quote, Variation, promoted opportunity, and no-workspace opportunity.
3. Projection: line, area, count, null group, historic calibration, archived/deleted filtering, drawing/page trace.
4. No-geometry contract: query/select and response contain no points/shapes/paths/PDF URL.
5. Search/filter/pagination: stable order, cancellation, stale-response suppression, empty/error states.
6. Lazy loading: no Measure request while drawer is closed.
7. Mutual exclusion: Materials/Measures/AI/Commercial Mapping cannot overlap.
8. Target lifecycle: no target, multi-range, stale sheet, structure edit, deleted cell, read-only workbook.
9. Insertion: numeric quantity remains numeric; unit/description remain text; exact source snapshot metadata; formula replacement confirmation.
10. Mutation integration: recalculation, undo, redo, dirty state, save, reopen, provenance invalidation after overwrite.
11. Snapshot integrity: source edit/archive/delete does not silently change saved worksheet or published Quote.
12. Accessibility/responsive: header label, close control, tab order, narrow backdrop, explicit Escape/focus policy, desktop nonmodal grid interaction.
13. Performance: bounded result payload and no regression to initial worksheet load/render timings.

## R. Risk Register

| Risk | Severity | Cause | Mitigation |
| --- | --- | --- | --- |
| Duplicated geometry/calibration calculation | CRITICAL | Recomputing from points or active calibration in drawer | Consume stored `display_value`/`display_unit`; count uses `count_value`; centralize server projection |
| Cross-organization/Project leakage | CRITICAL | Trusting client IDs or under-scoped query | Derive scope from authenticated workbook/member; explicit org/project filters; retain RLS |
| Live-link mutates historical commercial values | CRITICAL | Worksheet cell resolves current Measure at render/save time | Snapshot-first insertion; explicit future refresh only; retain quote snapshots/locks |
| Project/opportunity context mismatch | HIGH | Opportunity workbook has `projectId: null`; Takeoff requires Project | Server-side owner/workspace resolution; explicit no-workspace state; promoted-project tests |
| Loading excessive geometry/PDF state | HIGH | Reusing Measure page or Quantities loaders | New lightweight projection; contract-test absence of geometry and signed URLs |
| Wrong quantity field | HIGH | Using `quantity = 1` or base quantity | Test line/area/count authority against existing adapter/server behavior |
| Unit mismatch/alias ambiguity | HIGH | `count` vs `ea`, `m` vs `lm`, imperial squared units | Preserve exact source unit; no silent aliasing/conversion; explicit mapping policy |
| Arbitrary worksheet columns overwritten | HIGH | Assuming Description/Quantity/Unit adjacency | Explicit target/field mapping; never infer neighboring cells |
| Formula destroyed without consent | HIGH | Literal insert into formula cell | Reuse Material replacement confirmation and canonical mutation path |
| Autosave race / stale save snapshot | HIGH | Source insert concurrent with save/newer edits | Use existing mutation revision and save path; disable/sequence insertion during active save as needed |
| Duplicate drawer infrastructure | MEDIUM | Copying Material shell and booleans | Reuse `WorksheetSidePanel`; discriminated `activeSidePanel` |
| Deleted/archived source reference | MEDIUM | Snapshot provenance points to unavailable Measure | Preserve inserted value; display stale/unavailable status only on explicit review |
| Renamed source appears inconsistent | MEDIUM | Provenance label snapshot differs from current source | Store source ID/version and snapshot label; optionally show current vs inserted label later |
| Historic calibration misrepresented | HIGH | Converting base values with current active calibration | Use stored display pair; only secondary perimeter uses measurement calibration |
| Group hierarchy over-promised | MEDIUM | Group table exists but UI generally writes null | Make group optional/secondary; Drawing Set → Page hierarchy first |
| Worksheet keyboard/focus conflict | MEDIUM | Panel inputs bubble keys or Escape behavior differs | Stop propagation in inputs; define/test shared Escape and focus restoration policy |
| Drag/drop conflict | LOW | Future Measure dragging collides with selection/mapping drag | Do not add drag/drop in first phase; explicit buttons/cell mapping |
| Large Project result set | MEDIUM | Unbounded active measurements/search joins | Server pagination, bounded page size, stable order, optional filters, measure payload size |
| Stale search responses | MEDIUM | Rapid query/filter changes | Copy AbortController + request-sequence pattern from Materials |
| Database coupling too early | MEDIUM | Adding FK/view/RPC before interaction contract settles | Use JSON snapshot and server query first; migrate only for proven durable requirements |

## S. Recommended Implementation Phases

### Phase 1 — Panel state and characterization

- Add regression tests for current Material behavior.
- Introduce `activeSidePanel` union and preserve current Material/AI/Mapping behavior.
- Decide and test shared Escape/focus behavior; avoid unrelated visual changes.

### Phase 2 — Lightweight Measure read model

- Define validated transport types.
- Build workbook-authorized Project resolution.
- Query only active measurement projection plus drawing/page/optional group labels.
- Add API/auth/pagination/no-geometry tests.

### Phase 3 — Measure drawer presentation

- Mount only when active.
- Reuse shared shell, header, search, states, grouping, and pagination patterns.
- Support Drawing Set → Page hierarchy and null groups.

### Phase 4 — Explicit worksheet insertion

- Start with explicit captured single-cell quantity insertion, matching Material precedent.
- If Description/Unit are included, require separate explicit targets or a deliberate field-mapping step.
- Confirm replacement of nonblank/formula cells.
- Route every change through `applyCommittedWorksheetChange`.

### Phase 5 — Snapshot provenance

- Add versioned Measure source snapshots in cell metadata.
- Preserve source/drawing/page/group trace and measurement version.
- Invalidate provenance when the represented value is overwritten.
- Do not auto-refresh.

### Phase 6 — Regression and lifecycle coverage

- Verify formulas, undo/redo, save/reopen, multi-page workbook, owner contexts, archive/delete/rename behavior, Material parity, and commercial publication snapshots.

### Phase 7 — Performance and accessibility verification

- Measure initial worksheet render with drawer closed.
- Inspect query plan/payload at realistic Takeoff volume.
- Verify desktop and narrow layouts, keyboard/focus policy, and no PDF/geometry transfer.

## T. Implementation Readiness

```text
IMPLEMENTATION READY: YES

Recommended first implementation task:
Characterize current Material/AI/Commercial Mapping mutual exclusion, then replace the Material boolean with a discriminated activeSidePanel state without changing visible behavior.

Highest-risk area:
Resolving the correct Project for opportunity-owned versus Project/Quote-owned workbooks while enforcing organization isolation and never using the wrong Takeoff quantity/calibration authority.

Database migration required:
NO

Existing architecture reusable:
YES — the shared side-panel, worksheet selection/mutation/history/save path, Takeoff stored display quantities, and commercial snapshot boundaries are directly reusable. A new lightweight server read model and Measure-specific provenance helper are still required.
```
