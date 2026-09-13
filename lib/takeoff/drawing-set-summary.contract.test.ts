import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const server = readFileSync(resolve(root, "lib/takeoff-server.ts"), "utf8");
const routePage = readFileSync(resolve(root, "components/app/TakeoffMeasureRoutePage.tsx"), "utf8");
const workspace = readFileSync(resolve(root, "components/app/TakeoffMeasureWorkspace.tsx"), "utf8");
const viewer = readFileSync(resolve(root, "components/app/TakeoffPdfViewer.tsx"), "utf8");
const summary = readFileSync(resolve(root, "components/app/TakeoffMeasureSummary.tsx"), "utf8");
const pageDataServer = readFileSync(resolve(root, "lib/takeoff/page-data-server.ts"), "utf8");

describe("Takeoff drawing-set Summary architecture", () => {
  it("loads one active parent-row projection scoped by authoritative owner and drawing set", () => {
    const projection = server.match(/const takeoffDrawingSetSummaryMeasurementSelect =\s*\n\s*"([^"]+)"/)?.[1] ?? "";
    expect(server).toContain("getTakeoffDrawingSetSummaryMeasurements");
    expect(server).toContain('.eq("organization_id", params.organizationId)');
    expect(server).toContain('.eq("project_id", params.projectId)');
    expect(server).toContain('.eq("drawing_set_id", params.drawingSetId)');
    expect(server).toContain('.eq("status", "active")');
    expect(server).not.toMatch(/takeoffDrawingSetSummaryMeasurementSelect[^;]+takeoff_measurement_points/);
    expect(projection).toBe("id, page_id, measurement_kind, status, name, color_hex, display_value, display_unit, created_at, page:takeoff_pages!inner(page_number, page_label)");
    expect(projection).not.toMatch(/description|quantity|count_value|measured_length_base|measured_area_base|version|updated_at/);
    expect(routePage).toContain("organizationId: workspace.organizationId");
    expect(routePage).toContain("projectId: workspace.projectId");
  });

  it("keeps Summary state drawing-set-wide while canvas measurements remain page-specific", () => {
    expect(routePage).toContain("initialSummaryMeasurements={initialSummaryMeasurements}");
    expect(workspace).toContain("summaryMeasurements={summaryMeasurements}");
    expect(workspace).toContain("measurements={viewerData.measurements}");
    expect(viewer).toContain("<TakeoffMeasureSummary");
    expect(viewer).toContain("measurementPageId !== pageId");
    expect(viewer).toContain("onPageChange(measurementPageId)");
  });

  it("memoizes the Summary behind pointer-independent rows and stable callbacks", () => {
    expect(summary).toContain("memo(TakeoffMeasureSummaryComponent)");
    expect(viewer).toContain("const drawingSetSummaryRows = useMemo");
    expect(viewer).toContain("summaryMeasurementClickRef.current(measurementId)");
    expect(viewer).toContain("summaryMeasurementContextMenuRef.current(event, measurementId)");
    expect(viewer).not.toContain("drawingSetSummaryMeasurements.map");
  });

  it("derives current-page optimistic Summary rows without a refresh or second store", () => {
    expect(viewer).toContain("mergeDrawingSetSummaryWithLocalMeasurements");
    expect(viewer).toContain("summaryMeasurements,");
    expect(viewer).toContain("localMeasurements,");
    expect(viewer).toContain("number: pageNumber");
    expect(viewer).toContain("label: pageLabel");
    expect(viewer).not.toMatch(/router\.refresh\(\)/);
    expect(workspace).not.toContain("optimisticSummaryMeasurements");
  });

  it("loads page data and the signed PDF URL concurrently using the shell-authorized drawing set", () => {
    expect(pageDataServer).toMatch(/const \[pageData, pdfUrl\] = await Promise\.all/);
    expect(pageDataServer).toContain("authorizedDrawingSet: params.authorizedDrawingSet");
    expect(routePage).toContain("authorizedDrawingSet: activeDrawingSet");
    expect(server).toContain("suppliedDrawingSetIsAuthorized");
    expect(server).toContain("suppliedDrawingSet.organization_id === resolved.organizationId");
    expect(server).toContain("suppliedDrawingSet.project_id === resolved.projectId");
    expect(server).toContain("suppliedDrawingSet.source_type === \"source\"");
    expect(server).toContain("if (suppliedDrawingSet && !suppliedDrawingSetIsAuthorized)");
  });

  it("does not request drawing-set Summary data during page navigation", () => {
    expect(workspace).toContain("/api/takeoff/measure-viewer?");
    expect(workspace).not.toContain("getTakeoffDrawingSetSummaryMeasurements");
    expect(workspace).not.toContain("/api/takeoff/measurement-summary");
  });
});
