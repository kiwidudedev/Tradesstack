import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { getCellFormat } from "./opportunity-pricing-worksheet-formatting";
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

  it("persists formula errors without losing the original formula", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "B2", { value: 0 });
    setCell(worksheet, "C2", { formula: "=A2/B2" });

    const result = validateWorksheetBeforeSave(worksheet);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.worksheet.cells.C2?.formula).toBe("=A2/B2");
      expect(result.worksheet.cells.C2?.computedValue).toBe("#DIV/0!");
      expect(result.worksheet.cells.C2?.displayValue).toBe("#DIV/0!");

      setCell(result.worksheet, "B2", { value: 5 });
      const recovered = validateWorksheetBeforeSave(result.worksheet);
      expect(recovered.ok).toBe(true);
      if (recovered.ok) {
        expect(recovered.worksheet.cells.C2?.formula).toBe("=A2/B2");
        expect(recovered.worksheet.cells.C2?.displayValue).toBe("2");
      }
    }
  });

  it("preserves supported spreadsheet error states as displayable strings", () => {
    const worksheet = buildWorksheet();
    const errors = ["#VALUE!", "#REF!", "#NAME?", "#N/A", "#NUM!", "#NULL!"];
    errors.forEach((error, index) => setCell(worksheet, `A${index + 3}`, { formula: `=${error}` }));

    const result = validateWorksheetBeforeSave(worksheet);

    expect(result.ok).toBe(true);
    if (result.ok) {
      errors.forEach((error, index) => {
        const cell = result.worksheet.cells[`A${index + 3}`];
        expect(cell?.formula).toBe(`=${error}`);
        expect(cell?.displayValue).toBe(error);
      });
    }
  });

  it("preserves formatting metadata through save validation", () => {
    const worksheet = buildWorksheet();
    const inputCell = worksheet.cells.A2;
    if (!inputCell) {
      throw new Error("Expected A2 to exist.");
    }

    inputCell.metadata.format = {
      fill: { color: "#DBEAFE" },
      text: { bold: true },
    };

    const result = validateWorksheetBeforeSave(worksheet);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getCellFormat(result.worksheet.cells.A2).fill?.color).toBe("#DBEAFE");
      expect(getCellFormat(result.worksheet.cells.A2).text?.bold).toBe(true);
      expect(result.worksheet.cells.C2?.displayValue).toBe("200");
    }
  });
});
