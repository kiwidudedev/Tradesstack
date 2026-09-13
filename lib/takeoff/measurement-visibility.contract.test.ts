import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const viewer = readFileSync(resolve(root, "components/app/TakeoffPdfViewer.tsx"), "utf8");
const workspace = readFileSync(resolve(root, "components/app/TakeoffMeasureWorkspace.tsx"), "utf8");

describe("Takeoff live/export visibility wiring", () => {
  it("uses all saved operational measurements for rendering, hit-testing, and snapping", () => {
    expect(viewer).toContain("const liveCanvasMeasurements = savedMeasurements;");
    expect(viewer).toContain("liveCanvasMeasurements.forEach((measurement) => {");
    expect(viewer).toContain("{liveCanvasMeasurements.map((measurement) => (");
    expect(viewer).not.toContain("const canvasVisibleMeasurements");
  });

  it("keeps the export-hidden ID set connected to PDF export generation", () => {
    expect(viewer).toContain(
      "isTakeoffMeasurementIncludedInPdfExport(measurement, hiddenFromExportLegendMeasurementIds)",
    );
    expect(viewer).toContain("measurements: exportMeasurements");
    expect(viewer).toContain("legendRows: exportLegendRows");
  });

  it("routes committed measurements through defensive cache reconciliation", () => {
    expect(workspace).toContain("reconcileCommittedTakeoffMeasurement<(typeof currentMeasurements)[number]>");
    expect(workspace).not.toContain("nextMeasurements[existingIndex] = nextMeasurement");
  });
});
