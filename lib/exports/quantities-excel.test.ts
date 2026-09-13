import { describe, expect, it } from "vitest";
import { buildQuantitiesExportRowValues } from "./quantities-excel";

describe("quantities Excel unit semantics", () => {
  it.each(["mm", "cm", "m", "in", "ft", "mm²", "cm²", "m²", "in²", "ft²"])(
    "exports %s without relabelling",
    (unitLabel) => {
      const values = buildQuantitiesExportRowValues({
        id: "row-a",
        measurementId: "measurement-a",
        drawingSetId: "drawing-a",
        drawingDisplayName: "Architectural",
        pageId: "page-a",
        pageLabel: "Page 1",
        pageNumber: 1,
        name: "Measurement",
        description: null,
        colorHex: null,
        typeLabel: unitLabel.includes("²") ? "Area" : "Linear",
        unitLabel,
        quantityValue: 4.89,
        quantityDisplay: `4.89 ${unitLabel}`,
        secondaryQuantityValue: null,
        secondaryUnitLabel: null,
        secondaryQuantityDisplay: "—",
        status: "active",
        viewHref: "/",
      });
      expect(values[3]).toBe(4.89);
      expect(values[4]).toBe(unitLabel);
    }
  );

  it("adds source drawing identity only for the all-drawings export shape", () => {
    const row = {
      id: "row-a",
      measurementId: "measurement-a",
      drawingSetId: "drawing-a",
      drawingDisplayName: "Main Construction",
      pageId: "page-a",
      pageLabel: "A201",
      pageNumber: 1,
      name: "Wall Type 1",
      description: null,
      colorHex: null,
      typeLabel: "Linear" as const,
      unitLabel: "m",
      quantityValue: 4.89,
      quantityDisplay: "4.89 m",
      secondaryQuantityValue: null,
      secondaryUnitLabel: null,
      secondaryQuantityDisplay: "—",
      status: "active" as const,
      viewHref: "/",
    };
    expect(buildQuantitiesExportRowValues(row)).toHaveLength(9);
    expect(buildQuantitiesExportRowValues(row, null, true)).toEqual(expect.arrayContaining(["Main Construction", "A201"]));
    expect(buildQuantitiesExportRowValues(row, null, true)).toHaveLength(10);
  });
});
