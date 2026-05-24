import { describe, expect, it } from "vitest";
import {
  createDefaultWorksheetData,
  normalizeWorksheetCell,
  type WorksheetData,
} from "./opportunity-pricing-worksheet-defaults";
import {
  applyWorksheetPasteToCells,
  buildWorksheetCellKey,
  parseWorksheetClipboardText,
} from "./opportunity-pricing-worksheet-paste";
import {
  findWorksheetFormulaErrors,
  recalculateWorksheetFormulas,
} from "./opportunity-pricing-worksheet-formulas";
import {
  deleteWorksheetRows,
  insertWorksheetRow,
} from "./opportunity-pricing-worksheet-structure";

function setCell(
  worksheet: WorksheetData,
  ref: string,
  params: { value?: string | number | null; formula?: string | null }
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

function getCell(worksheet: WorksheetData, ref: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) {
    throw new Error(`Invalid ref ${ref}`);
  }

  const column = worksheet.columns.find((entry) => entry.id === match[1]);
  const row = worksheet.rows[Number(match[2]) - 1];
  if (!column || !row) {
    throw new Error(`Missing worksheet position for ${ref}`);
  }

  return worksheet.cells[buildWorksheetCellKey(column.id, row.id)] ?? null;
}

function buildWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Reliability Test",
    rowCount: 8,
    columnCount: 6,
  });

  setCell(worksheet, "B2", { value: "Timber" });
  setCell(worksheet, "B3", { value: "Timber" });
  setCell(worksheet, "B4", { value: "Steel" });
  setCell(worksheet, "B5", { value: "Timber" });
  setCell(worksheet, "C2", { value: 10 });
  setCell(worksheet, "C3", { value: 4 });
  setCell(worksheet, "C4", { value: 6 });
  setCell(worksheet, "C5", { value: 8 });
  setCell(worksheet, "D2", { value: 2.111 });
  setCell(worksheet, "D3", { value: 0 });
  setCell(worksheet, "D4", { value: 3 });
  setCell(worksheet, "D5", { value: 5 });

  return worksheet;
}

describe("recalculateWorksheetFormulas", () => {
  it("keeps computedValue and displayValue in sync after referenced cell edits", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "E2", { formula: "=SUM(C2:C3)" });

    const initial = recalculateWorksheetFormulas(worksheet);
    expect(getCell(initial, "E2")?.computedValue).toBe(14);
    expect(getCell(initial, "E2")?.displayValue).toBe("14");

    setCell(initial, "C2", { value: 12 });
    const recalculated = recalculateWorksheetFormulas(initial);

    expect(getCell(recalculated, "E2")?.computedValue).toBe(16);
    expect(getCell(recalculated, "E2")?.displayValue).toBe("16");
  });

  it("recalculates correctly after multi-cell paste", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "E2", { formula: "=SUM(C2:D2)" });
    setCell(worksheet, "E3", { formula: "=SUM(C3:D3)" });
    const parsedPaste = parseWorksheetClipboardText("2\t3\n4\t5");
    if (!parsedPaste) {
      throw new Error("Expected parsed paste payload");
    }

    const pastedWorksheet = applyWorksheetPasteToCells(
      worksheet,
      { columnIndex: 2, rowIndex: 1 },
      parsedPaste,
      normalizeWorksheetCell
    );
    const recalculated = recalculateWorksheetFormulas(pastedWorksheet);

    expect(getCell(recalculated, "E2")?.displayValue).toBe("5");
    expect(getCell(recalculated, "E3")?.displayValue).toBe("9");
  });

  it("updates range references after inserting rows", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "E6", { formula: "=SUM(C2:C5)" });

    const inserted = recalculateWorksheetFormulas(insertWorksheetRow(worksheet, 2));

    expect(getCell(inserted, "E7")?.formula).toBe("=SUM(C2:C6)");
    expect(getCell(inserted, "E7")?.displayValue).toBe("28");
  });

  it("surfaces broken references after deleting rows", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "E2", { formula: "=C3" });

    const deleted = recalculateWorksheetFormulas(deleteWorksheetRows(worksheet, 2));

    expect(getCell(deleted, "E2")?.displayValue).toBe("#REF!");
    expect(findWorksheetFormulaErrors(deleted)).toContainEqual({
      cellKey: "E2",
      error: "#REF!",
    });
  });

  it("supports the core formula set used by worksheet edits", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "E1", { formula: "=SUM(C2:C5)" });
    setCell(worksheet, "E2", { formula: '=IF(C2>5,"High","Low")' });
    setCell(worksheet, "E3", { formula: '=IFERROR(C2/D3,"")' });
    setCell(worksheet, "E4", { formula: "=ROUNDUP(D2,2)" });
    setCell(worksheet, "E5", { formula: '=SUMIF(B2:B5,"Timber",C2:C5)' });
    setCell(worksheet, "E6", { formula: '=SUMIFS(C2:C5,B2:B5,"Timber",D2:D5,">0")' });
    setCell(worksheet, "E7", { formula: '=COUNTIF(B2:B5,"Timber")' });
    setCell(worksheet, "E8", { formula: '=COUNTIFS(B2:B5,"Timber",D2:D5,">0")' });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "E1")?.displayValue).toBe("28");
    expect(getCell(recalculated, "E2")?.displayValue).toBe("High");
    expect(getCell(recalculated, "E3")?.displayValue).toBe("");
    expect(getCell(recalculated, "E4")?.displayValue).toBe("2.12");
    expect(getCell(recalculated, "E5")?.displayValue).toBe("22");
    expect(getCell(recalculated, "E6")?.displayValue).toBe("18");
    expect(getCell(recalculated, "E7")?.displayValue).toBe("3");
    expect(getCell(recalculated, "E8")?.displayValue).toBe("2");
  });

  it("surfaces divide-by-zero, value, and circular reference errors", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "A1", { formula: "=C2/D3" });
    setCell(worksheet, "A2", { formula: '=SUM("text",1)' });
    setCell(worksheet, "A3", { formula: "=A4" });
    setCell(worksheet, "A4", { formula: "=A3" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "A1")?.displayValue).toBe("#DIV/0!");
    expect(getCell(recalculated, "A2")?.displayValue).toBe("#VALUE!");
    expect(getCell(recalculated, "A3")?.displayValue).toBe("#CYCLE!");
    expect(getCell(recalculated, "A4")?.displayValue).toBe("#CYCLE!");
  });
});
