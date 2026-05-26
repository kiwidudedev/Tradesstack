import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { applyFormattingToRange, getCellFormat } from "./opportunity-pricing-worksheet-formatting";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";
import {
  buildWorksheetRedoState,
  buildWorksheetUndoState,
  commitWorksheetHistoryEntry,
} from "./opportunity-pricing-worksheet-history";
import { recalculateWorksheetFormulas } from "./opportunity-pricing-worksheet-formulas";
import { applyWorksheetMutation } from "./opportunity-pricing-worksheet-mutations";

function setCellValue(worksheet: WorksheetData, ref: string, value: string | number | null) {
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
  if (value === null) {
    delete worksheet.cells[cellKey];
    return;
  }

  worksheet.cells[cellKey] = {
    value,
    type: typeof value === "number" ? "number" : "text",
    formula: null,
    computedValue: value,
    displayValue: String(value),
    metadata: {},
  };
}

function buildWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "History Test",
    rowCount: 8,
    columnCount: 4,
  });

  setCellValue(worksheet, "A4", 10);
  setCellValue(worksheet, "B4", 20);
  worksheet.cells.C4 = {
    value: "=A4*B4",
    type: "text",
    formula: "=A4*B4",
    computedValue: "=A4*B4",
    displayValue: "=A4*B4",
    metadata: {},
  };

  return recalculateWorksheetFormulas(worksheet);
}

describe("worksheet history helpers", () => {
  it("does not push history for no-op commits", () => {
    const worksheet = buildWorksheet();
    const priorWorksheet = buildWorksheet();
    setCellValue(priorWorksheet, "A4", 9);
    const priorRecalculated = recalculateWorksheetFormulas(priorWorksheet);

    const committedHistory = commitWorksheetHistoryEntry({
      changed: true,
      future: [],
      historyLimit: 50,
      past: [],
      previousWorksheet: priorRecalculated,
    });

    const noOpHistory = commitWorksheetHistoryEntry({
      changed: false,
      future: committedHistory.future,
      historyLimit: 50,
      past: committedHistory.past,
      previousWorksheet: worksheet,
    });

    expect(noOpHistory).toEqual(committedHistory);
    expect(noOpHistory.past).toHaveLength(1);
  });

  it("keeps undo safe after a no-op edit", () => {
    const originalWorksheet = buildWorksheet();
    const editedWorksheet = buildWorksheet();
    setCellValue(editedWorksheet, "A4", 11);
    const editedRecalculated = recalculateWorksheetFormulas(editedWorksheet);

    const historyAfterRealChange = commitWorksheetHistoryEntry({
      changed: true,
      future: [],
      historyLimit: 50,
      past: [],
      previousWorksheet: originalWorksheet,
    });

    const historyAfterNoOp = commitWorksheetHistoryEntry({
      changed: false,
      future: historyAfterRealChange.future,
      historyLimit: 50,
      past: historyAfterRealChange.past,
      previousWorksheet: editedRecalculated,
    });

    const undoState = buildWorksheetUndoState({
      currentWorksheet: editedRecalculated,
      future: historyAfterNoOp.future,
      historyLimit: 50,
      past: historyAfterNoOp.past,
    });

    expect(undoState).not.toBeNull();
    expect(undoState?.worksheet.cells.A4?.value).toBe(10);
    expect(undoState?.worksheet.cells.C4?.displayValue).toBe("200");
    expect(undoState?.future).toHaveLength(1);

    const redoState = buildWorksheetRedoState({
      currentWorksheet: undoState!.worksheet,
      future: undoState!.future,
      historyLimit: 50,
      past: undoState!.past,
    });

    expect(redoState).not.toBeNull();
    expect(redoState?.worksheet.cells.A4?.value).toBe(11);
    expect(redoState?.worksheet.cells.C4?.displayValue).toBe("220");
  });

  it("returns null when undo is requested without any real history", () => {
    const worksheet = buildWorksheet();

    const undoState = buildWorksheetUndoState({
      currentWorksheet: worksheet,
      future: [],
      historyLimit: 50,
      past: [],
    });

    expect(undoState).toBeNull();
  });

  it("undoes and redoes formatting-only worksheet changes", () => {
    const originalWorksheet = buildWorksheet();
    const mutationResult = applyWorksheetMutation(originalWorksheet, (current) =>
      applyFormattingToRange(
        current,
        {
          startRowIndex: 3,
          endRowIndex: 3,
          startColumnIndex: 0,
          endColumnIndex: 0,
        },
        {
          fill: { color: "#DBEAFE" },
          text: { bold: true, italic: true },
        }
      ),
      {
        recalculateFormulas: false,
      }
    );

    expect(mutationResult.changed).toBe(true);

    const history = commitWorksheetHistoryEntry({
      changed: true,
      future: [],
      historyLimit: 50,
      past: [],
      previousWorksheet: mutationResult.previousWorksheet,
    });

    const undoState = buildWorksheetUndoState({
      currentWorksheet: mutationResult.nextWorksheet,
      future: history.future,
      historyLimit: 50,
      past: history.past,
    });

    expect(undoState).not.toBeNull();
    expect(getCellFormat(undoState?.worksheet.cells.A4).fill?.color).toBeUndefined();

    const redoState = buildWorksheetRedoState({
      currentWorksheet: undoState!.worksheet,
      future: undoState!.future,
      historyLimit: 50,
      past: undoState!.past,
    });

    expect(redoState).not.toBeNull();
    expect(getCellFormat(redoState?.worksheet.cells.A4).fill?.color).toBe("#DBEAFE");
    expect(getCellFormat(redoState?.worksheet.cells.A4).text?.italic).toBe(true);
  });
});
