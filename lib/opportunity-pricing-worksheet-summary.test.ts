import { describe, expect, it } from "vitest";

import {
  createDefaultWorksheetData,
  type WorksheetData,
} from "./opportunity-pricing-worksheet-defaults";
import { recalculateWorksheetFormulas } from "./opportunity-pricing-worksheet-formulas";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";
import { deriveWorksheetPricingSummary } from "./opportunity-pricing-worksheet-summary";

function setCell(
  worksheet: WorksheetData,
  ref: string,
  params: { value?: string | number | null; formula?: string | null },
) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) {
    throw new Error(`Invalid ref ${ref}`);
  }

  const column = worksheet.columns.find((entry) => entry.id === match[1]);
  const row = worksheet.rows[Number(match[2]) - 1];
  if (!column || !row) {
    throw new Error(`Missing worksheet position for ${ref}`);
  }

  const cellKey = buildWorksheetCellKey(column.id, row.id);
  const value = params.formula ?? params.value ?? null;
  worksheet.cells[cellKey] = {
    value,
    type: typeof value === "number" ? "number" : value === null ? "empty" : "text",
    formula: params.formula ?? null,
    computedValue: value,
    displayValue: value === null ? "" : String(value),
    metadata: {},
  };
}

function buildAuditWorksheet(rate: number) {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Summary Audit",
    rowCount: 10,
    columnCount: 6,
  });

  setCell(worksheet, "A3", { value: "Labour" });
  setCell(worksheet, "B3", { value: 12 });
  setCell(worksheet, "C3", { value: rate });
  setCell(worksheet, "D3", { formula: "=B3*C3" });
  setCell(worksheet, "A4", { value: "Materials" });
  setCell(worksheet, "B4", { value: 1 });
  setCell(worksheet, "C4", { value: 2400 });
  setCell(worksheet, "D4", { formula: "=B4*C4" });
  setCell(worksheet, "A5", { value: "Subtotal" });
  setCell(worksheet, "D5", { formula: "=SUM(D3:D4)" });
  setCell(worksheet, "A6", { value: "Margin %" });
  setCell(worksheet, "E6", { value: 0.15 });
  setCell(worksheet, "A7", { value: "Total" });
  setCell(worksheet, "F7", { formula: "=D5*(1+E6)" });

  return recalculateWorksheetFormulas(worksheet);
}

describe("deriveWorksheetPricingSummary", () => {
  it("derives subtotal, margin, and grand total from the recalculated worksheet", () => {
    const worksheet = buildAuditWorksheet(92);

    expect(
      deriveWorksheetPricingSummary(worksheet, null, {
        calculatedAt: "2026-06-13T09:30:00.000Z",
      }),
    ).toEqual({
      version: 1,
      currency: "NZD",
      subtotal: 3504,
      margin: 0.15,
      gst: null,
      grandTotal: 4029.6,
      lastCalculatedAt: "2026-06-13T09:30:00.000Z",
    });
  });

  it("preserves existing fields when the worksheet has no detectable pricing summary rows", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Blank",
      rowCount: 4,
      columnCount: 4,
    });

    expect(
      deriveWorksheetPricingSummary(worksheet, {
        version: 2,
        currency: "AUD",
        subtotal: 18.125,
        margin: 0.155,
        gst: 1.125,
        grandTotal: 19.25,
        lastCalculatedAt: "2026-06-13T08:00:00.000Z",
      }),
    ).toEqual({
      version: 2,
      currency: "AUD",
      subtotal: 18.13,
      margin: 0.16,
      gst: 1.13,
      grandTotal: 19.25,
      lastCalculatedAt: "2026-06-13T08:00:00.000Z",
    });
  });
});
