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

function buildHelperWorksheet() {
  return createDefaultWorksheetData({
    sheetName: "Helper Formula Test",
    rowCount: 14,
    columnCount: 8,
  });
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
    setCell(worksheet, "F1", { formula: "=AND(C2>0,D2>0)" });
    setCell(worksheet, "F2", { formula: '=AND(B2<>"",B3<>"")' });
    setCell(worksheet, "F3", { formula: '=IF(AND(B2<>"",C2<>""),C2*2,"")' });
    setCell(worksheet, "F4", { formula: '=IF(C2="", "", IF(AND(C2>0,D2>0), C2*2, "Error"))' });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "E1")?.displayValue).toBe("28");
    expect(getCell(recalculated, "E2")?.displayValue).toBe("High");
    expect(getCell(recalculated, "E3")?.displayValue).toBe("");
    expect(getCell(recalculated, "E4")?.displayValue).toBe("2.12");
    expect(getCell(recalculated, "E5")?.displayValue).toBe("22");
    expect(getCell(recalculated, "E6")?.displayValue).toBe("18");
    expect(getCell(recalculated, "E7")?.displayValue).toBe("3");
    expect(getCell(recalculated, "E8")?.displayValue).toBe("2");
    expect(getCell(recalculated, "F1")?.displayValue).toBe("1");
    expect(getCell(recalculated, "F2")?.displayValue).toBe("1");
    expect(getCell(recalculated, "F3")?.displayValue).toBe("20");
    expect(getCell(recalculated, "F4")?.displayValue).toBe("20");
  });

  it("supports AND formulas in nested conditions and returns false when any condition fails", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "E2", { formula: '=AND(C2>0,D2>0)' });
    setCell(worksheet, "E3", { formula: '=AND(C2<>"",B2<>"")' });
    setCell(worksheet, "E4", { formula: '=IF(AND(C2<>"",D3<>""),C2*D3,"")' });
    setCell(worksheet, "E5", { formula: '=IF(AND(C2>0,D2>0,C4>0),C2*C4,"Error")' });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "E2")?.displayValue).toBe("1");
    expect(getCell(recalculated, "E3")?.displayValue).toBe("1");
    expect(getCell(recalculated, "E4")?.displayValue).toBe("0");
    expect(getCell(recalculated, "E5")?.displayValue).toBe("60");
  });

  it("supports IFS formulas and returns the first matching branch", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "A1", { value: "USG" });
    setCell(worksheet, "A2", { value: "Rondo" });
    setCell(worksheet, "A3", { value: "USG 22mm" });
    setCell(worksheet, "A4", { value: "Rondo Keylock 28mm" });
    setCell(worksheet, "E2", { formula: '=IFS(A1="USG",10,A1="Rondo",20)' });
    setCell(worksheet, "E3", { formula: '=IFS(A1="USG",10,A1="Rondo",20)' });
    setCell(worksheet, "E4", { formula: '=IFS(A3="USG 22mm","C-S/B",A3="Rondo Keylock 28mm","TCR S/B")' });
    setCell(worksheet, "E5", { formula: '=IFS(A4="USG 22mm","C-S/B",A4="Rondo Keylock 28mm","TCR S/B")' });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "E2")?.displayValue).toBe("10");
    expect(getCell(recalculated, "E3")?.displayValue).toBe("10");
    expect(getCell(recalculated, "E4")?.displayValue).toBe("C-S/B");
    expect(getCell(recalculated, "E5")?.displayValue).toBe("TCR S/B");
  });

  it("supports nested MAX inside IFS and returns an error when no conditions match", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "A1", { value: 24 });
    setCell(worksheet, "A2", { value: -5 });
    setCell(worksheet, "E2", { formula: '=IFS(A1=0,0,A1>=0,MAX(1,A1/20))' });
    setCell(worksheet, "E3", { formula: '=IFS(A2=0,0,A2>=0,MAX(1,A2/20))' });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "E2")?.displayValue).toBe("1.2");
    expect(getCell(recalculated, "E3")?.displayValue).toBe("#ERROR!");
  });

  it("rejects IFS formulas with invalid arity", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "E2", { formula: "=IFS()" });
    setCell(worksheet, "E3", { formula: '=IFS(A1="USG",10,A1="Rondo")' });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "E2")?.displayValue).toBe("#ERROR!");
    expect(getCell(recalculated, "E3")?.displayValue).toBe("#ERROR!");
  });

  it("supports QTY for linear, area, and volume calculations", () => {
    const worksheet = buildHelperWorksheet();
    setCell(worksheet, "C8", { value: 2 });
    setCell(worksheet, "E8", { value: 5 });
    setCell(worksheet, "F8", { value: null });
    setCell(worksheet, "G8", { value: null });
    setCell(worksheet, "H8", { formula: "=QTY(C8,E8,F8,G8)" });
    setCell(worksheet, "F9", { value: 3 });
    setCell(worksheet, "G9", { value: null });
    setCell(worksheet, "C9", { value: 2 });
    setCell(worksheet, "E9", { value: 5 });
    setCell(worksheet, "H9", { formula: "=QTY(C9,E9,F9,G9)" });
    setCell(worksheet, "C10", { value: 2 });
    setCell(worksheet, "E10", { value: 5 });
    setCell(worksheet, "F10", { value: 3 });
    setCell(worksheet, "G10", { value: 4 });
    setCell(worksheet, "H10", { formula: "=QTY(C10,E10,F10,G10)" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "H8")?.displayValue).toBe("10");
    expect(getCell(recalculated, "H9")?.displayValue).toBe("30");
    expect(getCell(recalculated, "H10")?.displayValue).toBe("120");
  });

  it("returns blank for blank QTY inputs and errors for incomplete QTY inputs", () => {
    const worksheet = buildHelperWorksheet();
    setCell(worksheet, "H8", { formula: "=QTY(C8,E8,F8,G8)" });
    setCell(worksheet, "C9", { value: 2 });
    setCell(worksheet, "F9", { value: 3 });
    setCell(worksheet, "H9", { formula: "=QTY(C9,E9,F9,G9)" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "H8")?.displayValue).toBe("");
    expect(getCell(recalculated, "H9")?.displayValue).toBe("#ERROR!");
  });

  it("supports UNIT for linear, area, and volume unit inference", () => {
    const worksheet = buildHelperWorksheet();
    setCell(worksheet, "E8", { value: 5 });
    setCell(worksheet, "F8", { value: null });
    setCell(worksheet, "G8", { value: null });
    setCell(worksheet, "H8", { formula: "=UNIT(E8,F8,G8)" });
    setCell(worksheet, "E9", { value: 5 });
    setCell(worksheet, "F9", { value: 3 });
    setCell(worksheet, "G9", { value: null });
    setCell(worksheet, "H9", { formula: "=UNIT(E9,F9,G9)" });
    setCell(worksheet, "E10", { value: 5 });
    setCell(worksheet, "F10", { value: 3 });
    setCell(worksheet, "G10", { value: 4 });
    setCell(worksheet, "H10", { formula: "=UNIT(E10,F10,G10)" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "H8")?.displayValue).toBe("m/No");
    expect(getCell(recalculated, "H9")?.displayValue).toBe("m2");
    expect(getCell(recalculated, "H10")?.displayValue).toBe("m3");
  });

  it("supports WASTE with decimal percentages", () => {
    const worksheet = buildHelperWorksheet();
    setCell(worksheet, "E14", { value: 100 });
    setCell(worksheet, "F14", { value: 0.1 });
    setCell(worksheet, "H14", { formula: "=WASTE(E14,F14)" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "H14")?.displayValue).toBe("110");
  });

  it("supports percentage syntax in arithmetic and WASTE formulas", () => {
    const worksheet = buildHelperWorksheet();
    setCell(worksheet, "A1", { value: 10 });
    setCell(worksheet, "A2", { value: 100 });
    setCell(worksheet, "B1", { formula: "=A1*10%" });
    setCell(worksheet, "B2", { formula: "=WASTE(A2,10%)" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "B1")?.displayValue).toBe("1");
    expect(getCell(recalculated, "B2")?.displayValue).toBe("110");
  });

  it("supports PACKS and handles zero and invalid pack size", () => {
    const worksheet = buildHelperWorksheet();
    setCell(worksheet, "G12", { value: 24 });
    setCell(worksheet, "H12", { formula: "=PACKS(G12,20)" });
    setCell(worksheet, "G13", { value: 0 });
    setCell(worksheet, "H13", { formula: "=PACKS(G13,20)" });
    setCell(worksheet, "G14", { value: 24 });
    setCell(worksheet, "H14", { formula: "=PACKS(G14,0)" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "H12")?.displayValue).toBe("1.2");
    expect(getCell(recalculated, "H13")?.displayValue).toBe("0");
    expect(getCell(recalculated, "H14")?.displayValue).toBe("#ERROR!");
  });

  it("supports exponent syntax in arithmetic formulas", () => {
    const worksheet = buildHelperWorksheet();
    setCell(worksheet, "A1", { value: 3 });
    setCell(worksheet, "B1", { formula: "=A1^2" });
    setCell(worksheet, "B2", { formula: "=2^3" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "B1")?.displayValue).toBe("9");
    expect(getCell(recalculated, "B2")?.displayValue).toBe("8");
  });

  it("rejects AND formulas with no arguments", () => {
    const worksheet = buildWorksheet();
    setCell(worksheet, "E2", { formula: "=AND()" });

    const recalculated = recalculateWorksheetFormulas(worksheet);

    expect(getCell(recalculated, "E2")?.displayValue).toBe("#ERROR!");
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
