import { describe, expect, it } from "vitest";
import { aggregateTakeoffQuantityRows, formatTakeoffQuantityGroupTotals } from "./quantity-totals";

function row(overrides: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    measurementId: crypto.randomUUID(),
    drawingSetId: "drawing-a",
    pageId: "page-a",
    pageLabel: "Page 1",
    pageNumber: 1,
    name: "Measurement",
    description: null,
    colorHex: null,
    typeLabel: "Linear",
    unitLabel: "m",
    quantityValue: 0,
    quantityDisplay: "0 m",
    secondaryQuantityValue: null,
    secondaryUnitLabel: null,
    secondaryQuantityDisplay: "—",
    status: "active",
    viewHref: "/",
    ...overrides,
  } as never;
}

describe("takeoff quantity group totals", () => {
  it("aggregates only rows with identical display semantics", () => {
    const totals = aggregateTakeoffQuantityRows([
      row({ quantityValue: 2, unitLabel: "m" }),
      row({ quantityValue: 3, unitLabel: "m" }),
      row({ quantityValue: 500, unitLabel: "mm" }),
    ]);
    expect(totals).toEqual([
      { kind: "Linear", unit: "m", value: 5 },
      { kind: "Linear", unit: "mm", value: 500 },
    ]);
    expect(formatTakeoffQuantityGroupTotals(totals)).toBe("Linear 5 m • Linear 500 mm");
  });

  it("keeps square units and perimeter units separate", () => {
    const totals = aggregateTakeoffQuantityRows([
      row({ typeLabel: "Area", quantityValue: 1, unitLabel: "m²", secondaryQuantityValue: 4, secondaryUnitLabel: "m" }),
      row({ typeLabel: "Area", quantityValue: 2500, unitLabel: "cm²", secondaryQuantityValue: 200, secondaryUnitLabel: "cm" }),
    ]);
    expect(formatTakeoffQuantityGroupTotals(totals)).toBe(
      "Area 1 m² • Perimeter 4 m • Area 2500 cm² • Perimeter 200 cm"
    );
  });
});
