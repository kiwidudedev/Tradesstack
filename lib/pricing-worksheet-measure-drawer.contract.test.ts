import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const board = readFileSync(resolve(process.cwd(), "components/app/OpportunityPricingWorksheetBoard.tsx"), "utf8");
const drawer = readFileSync(resolve(process.cwd(), "components/app/PricingWorksheetMeasureDrawer.tsx"), "utf8");
const server = readFileSync(resolve(process.cwd(), "lib/pricing-worksheet-measure-picker-server.ts"), "utf8");
const mapping = readFileSync(resolve(process.cwd(), "lib/pricing-worksheet-measure-mapping.ts"), "utf8");

describe("pricing worksheet Measure drawer contract", () => {
  it("uses one mutually exclusive worksheet side-panel state", () => {
    expect(board).toContain('type WorksheetSidePanelType = "materials" | "measures" | null');
    expect(board).toContain('setActiveSidePanel("materials")');
    expect(board).toContain('setActiveSidePanel("measures")');
    expect(board).not.toContain("isMaterialLibraryOpen");
  });

  it("is lazy-mounted and reuses the shared side-panel shell", () => {
    expect(board).toContain('activeSidePanel === "measures" ? (');
    expect(drawer).toContain("<WorksheetSidePanel");
    expect(drawer).toContain("WorksheetSidePanelBody");
    expect(drawer).toContain("WorksheetSidePanelFooter");
    expect(drawer).toContain("AbortController");
    expect(drawer).toContain('cache: "no-store"');
  });

  it("selects compact rows without inserting and maps explicit worksheet destinations", () => {
    expect(drawer).toContain("selectedMeasureId");
    expect(drawer).toContain('aria-pressed={selectedMeasureId === source.measurementId}');
    expect(drawer).toContain("onClick={() => setSelectedMeasureId(source.measurementId)}");
    expect(drawer).toContain('requestInsert(selectedMeasure)');
    expect(drawer).not.toContain('onClick={() => requestInsert(source, "quantity")}');
    expect(drawer).toContain('data-testid="pricing-measure-insert"');
    expect(drawer).toContain("WorksheetCellMappingField");
    expect(drawer).toContain('mappedCellPrefix="Destination"');
    expect(drawer).toContain("Quantity");
    expect(drawer).toContain("Unit");
    expect(drawer).toContain("Description");
    expect(drawer).toContain("Replace mapped worksheet cells?");
    expect(mapping).toContain("buildMeasureWorksheetCell");
    expect(board).toContain("applyCommittedWorksheetChange((worksheetData)");
    expect(board).not.toContain("measureTarget");
    expect(board).toContain('mappedAction: "measure"');
    expect(board).toContain('activeWorksheetMapping?.kind === "measure"');
    expect(board).toContain("measureMapping.assignCell(cellKey)");
    expect(board).toContain("measureMapping.assignCell(selectedSingleCellKey)");
    expect(board).toContain("measureMapping.cancel()");
  });

  it("uses Summary formatting, measurement colours, and flattened page lists", () => {
    expect(drawer).toContain("formatQuantityValue(source.quantity, source.unit)");
    expect(drawer).toContain("resolveTakeoffMeasurementColor(source.colorHex, source.kind)");
    expect(drawer).toContain('rounded-[14px]');
    expect(drawer).toContain('title={drawing.drawingSetName}');
    expect(drawer).not.toContain('maximumFractionDigits: 4');
  });

  it("selects no geometry or PDFs and never consumes the legacy quantity field", () => {
    const selectedFields = server.match(/\.select\(\n\s+"id, version,[\s\S]*?\n\s+\{ count: "exact" \}/)?.[0] ?? "";
    expect(selectedFields).toContain("color_hex");
    for (const forbidden of ["points", "shape", "path", "storage_path", "calibration", "quantity,"]) expect(selectedFields).not.toContain(forbidden);
    expect(server).toContain('row.measurement_kind === "count"');
    expect(server).toContain("row.count_value ?? row.display_value");
  });
});
