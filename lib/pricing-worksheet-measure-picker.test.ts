import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetCell } from "@/lib/opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "@/lib/opportunity-pricing-worksheet-mutations";
import {
  buildMeasureWorksheetCell,
  parsePricingWorksheetMeasurePage,
  type PricingWorksheetMeasureSource,
} from "@/lib/pricing-worksheet-measure-picker";
import { formatQuantityValue } from "@/lib/takeoff/measurement-display";
import { getWorksheetCellMeasureProvenance } from "@/lib/worksheet-measure-provenance";

const source: PricingWorksheetMeasureSource = {
  measurementId: "measurement-1",
  measurementVersion: 4,
  projectId: "project-1",
  drawingSetId: "drawing-1",
  drawingSetName: "A-201 Ground Floor.pdf",
  pageId: "page-1",
  pageNumber: 4,
  pageLabel: "Ground Floor",
  groupId: null,
  groupName: null,
  groupCode: null,
  kind: "area",
  colorHex: null,
  name: "GIB Walls",
  description: "Internal wall lining",
  quantity: 145.2,
  unit: "m²",
  updatedAt: "2026-08-23T00:00:00.000Z",
};

describe("pricing worksheet Measure picker", () => {
  it("validates a bounded geometry-free transport page", () => {
    const parsed = parsePricingWorksheetMeasurePage({ items: [source], page: 1, pageSize: 30, total: 1, hasMore: false, workspaceStatus: "ready" });
    expect(parsed?.items[0]).toEqual(source);
    expect(parsed?.items[0]).not.toHaveProperty("points");
    expect(parsed?.items[0]).not.toHaveProperty("quantityGeometry");
    expect(parsePricingWorksheetMeasurePage({ items: [source], page: 1, pageSize: 100, total: 1, hasMore: false, workspaceStatus: "ready" })).toBeNull();
  });

  it("accepts custom and null Measure colours in the lightweight transport", () => {
    const custom = parsePricingWorksheetMeasurePage({ items: [{ ...source, colorHex: "#123ABC" }], page: 1, pageSize: 30, total: 1, hasMore: false, workspaceStatus: "ready" });
    const fallback = parsePricingWorksheetMeasurePage({ items: [source], page: 1, pageSize: 30, total: 1, hasMore: false, workspaceStatus: "ready" });
    expect(custom?.items[0]?.colorHex).toBe("#123ABC");
    expect(fallback?.items[0]?.colorHex).toBeNull();
  });

  it("formats compactly without changing the exact inserted quantity", () => {
    const preciseSource = { ...source, quantity: 7.1572, unit: "m" };
    const cell = buildMeasureWorksheetCell({ source: preciseSource, field: "quantity", bindingId: "binding-precision", insertedAt: "2026-08-23T01:00:00.000Z" });
    expect(formatQuantityValue(preciseSource.quantity, preciseSource.unit)).toBe("7.16 m");
    expect(cell.value).toBe(7.1572);
    expect(getWorksheetCellMeasureProvenance(cell)?.insertedQuantity).toBe(7.1572);
  });

  it.each([
    ["quantity", 145.2, "number"],
    ["unit", "m²", "text"],
    ["description", "Internal wall lining", "text"],
  ] as const)("inserts %s as a typed snapshot", (field, value, type) => {
    const cell = buildMeasureWorksheetCell({ source, field, bindingId: "binding-1", insertedAt: "2026-08-23T01:00:00.000Z" });
    expect(cell).toMatchObject({ value, computedValue: value, displayValue: String(value), type, formula: null });
    expect(getWorksheetCellMeasureProvenance(cell)).toMatchObject({ measurementId: "measurement-1", measurementVersion: 4, insertedField: field, insertedQuantity: 145.2, insertedUnit: "m²" });
  });

  it("uses the Measure name when an explicit description is unavailable", () => {
    const cell = buildMeasureWorksheetCell({ source: { ...source, description: null }, field: "description", bindingId: "binding-2", insertedAt: "2026-08-23T01:00:00.000Z" });
    expect(cell.value).toBe("GIB Walls");
  });

  it("preserves provenance for formatting and removes it when the value is overwritten", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 2 });
    worksheet.cells.A1 = buildMeasureWorksheetCell({ source, field: "quantity", bindingId: "binding-3", insertedAt: "2026-08-23T01:00:00.000Z" });
    const formatted = applyWorksheetMutation(worksheet, (current) => ({
      ...current,
      cells: { ...current.cells, A1: { ...current.cells.A1!, metadata: { ...current.cells.A1!.metadata, format: { text: { bold: true } } } } as WorksheetCell },
    }));
    expect(getWorksheetCellMeasureProvenance(formatted.nextWorksheet.cells.A1)).not.toBeNull();

    const overwritten = applyWorksheetMutation(formatted.nextWorksheet, (current) => ({
      ...current,
      cells: { ...current.cells, A1: { ...current.cells.A1!, value: 151.7, computedValue: 151.7, displayValue: "151.7" } },
    }));
    expect(getWorksheetCellMeasureProvenance(overwritten.nextWorksheet.cells.A1)).toBeNull();
  });
});
