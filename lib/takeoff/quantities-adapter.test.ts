import { describe, expect, it } from "vitest";
import { mapTakeoffToQuantityRows } from "./quantities-adapter";

describe("historic takeoff calibration presentation", () => {
  it("formats area perimeter with the measurement calibration instead of the current active calibration", () => {
    const historic = { id: "cal-a", base_unit: "mm", display_unit: "m" } as never;
    const active = { id: "cal-b", base_unit: "in", display_unit: "ft" } as never;
    const measurement = {
      id: "measurement-a",
      calibration_id: "cal-a",
      measurement_kind: "area",
      status: "active",
      name: "Historic area",
      description: "",
      display_value: 10,
      display_unit: "m²",
      measured_perimeter_base: 12000,
      points: [],
      area_shapes: [],
      line_paths: [],
    } as never;

    const rows = mapTakeoffToQuantityRows([measurement], active, new Map([["cal-a", historic]]), {
      drawingSetId: "drawing-a",
      opportunityId: "opportunity-a",
      pageId: "page-a",
      pageLabel: "Page 1",
      pageNumber: 1,
    });

    expect(rows[0]?.secondaryQuantityValue).toBe(12);
    expect(rows[0]?.secondaryUnitLabel).toBe("m");
    expect(rows[0]?.unitLabel).toBe("m²");
  });

  it.each([
    ["mm", 5200, "5200 mm"],
    ["cm", 520, "520 cm"],
    ["m", 5.2, "5.2 m"],
  ])("preserves a legitimate %s line measurement", (displayUnit, displayValue, expectedDisplay) => {
    const measurement = {
      id: `measurement-${displayUnit}`,
      calibration_id: null,
      measurement_kind: "line",
      status: "active",
      name: "Length",
      description: "",
      display_value: displayValue,
      display_unit: displayUnit,
      measured_perimeter_base: null,
      points: [],
      area_shapes: [],
      line_paths: [],
    } as never;
    const rows = mapTakeoffToQuantityRows([measurement], null, new Map(), {
      drawingSetId: "drawing-a",
      opportunityId: "opportunity-a",
      pageId: "page-a",
      pageLabel: "Page 1",
      pageNumber: 1,
    });
    expect(rows[0]?.unitLabel).toBe(displayUnit);
    expect(rows[0]?.quantityDisplay).toBe(expectedDisplay);
  });
});
