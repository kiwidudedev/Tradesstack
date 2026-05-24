import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { recalculateWorksheetFormulas } from "./opportunity-pricing-worksheet-formulas";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";
import { validateWorksheetBeforeSave } from "./opportunity-pricing-worksheet-save-validation";

function setCell(
  worksheet: WorksheetData,
  ref: string,
  params: { value?: string | number | null; formula?: string | null },
) {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
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

function buildWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Save Validation Test",
    rowCount: 8,
    columnCount: 4,
  });

  setCell(worksheet, "A1", { value: "Qty" });
  setCell(worksheet, "B1", { value: "Rate" });
  setCell(worksheet, "C1", { value: "Total" });
  setCell(worksheet, "A2", { value: 10 });
  setCell(worksheet, "B2", { value: 20 });
  setCell(worksheet, "C2", { formula: "=A2*B2" });

  return recalculateWorksheetFormulas(worksheet);
}

describe("validateWorksheetBeforeSave", () => {
  it("returns a recalculated worksheet for valid saves", () => {
    const worksheet = buildWorksheet();

    const result = validateWorksheetBeforeSave(worksheet);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.worksheet.cells.C2?.displayValue).toBe("200");
    }
  });

  it("blocks invalid formula outputs before save", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "C2", { formula: "=A2/0" });

    const result = validateWorksheetBeforeSave(worksheet);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Save blocked");
      expect(result.message).toContain("#DIV/0!");
    }
  });
});
