import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetCell } from "./opportunity-pricing-worksheet-defaults";
import {
  applyWorksheetAutoLayout,
  buildWorksheetColumnAutoFitTarget,
  buildWorksheetLayoutTargetFromDiffSummary,
  buildWorksheetRowAutoFitTarget,
} from "./opportunity-pricing-worksheet-layout";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";

function setTextCell(worksheet: ReturnType<typeof createDefaultWorksheetData>, ref: string, value: string) {
  worksheet.cells[ref] = {
    value,
    type: "text",
    formula: null,
    computedValue: value,
    displayValue: value,
    metadata: {},
  } satisfies WorksheetCell;
}

describe("worksheet layout helpers", () => {
  it("builds bounded layout targets from AI diff summary", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 4 });
    setTextCell(worksheet, buildWorksheetCellKey("A", "2"), "Quantity input");
    setTextCell(worksheet, buildWorksheetCellKey("B", "2"), "Long estimator note");

    const target = buildWorksheetLayoutTargetFromDiffSummary(worksheet, {
      changedCells: ["A2", "B2"],
      formulaCells: [],
      formattingCells: [],
      insertedRows: [2],
      affectedRows: [2],
    });

    expect(target.rowIds).toEqual(["2"]);
    expect(target.columnIds).toEqual(["A", "B"]);
    expect(target.cellKeys).toEqual(["A2", "B2"]);
  });

  it("does not shrink existing widths and heights during the AI layout pass", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 4 });
    worksheet.columns[0] = { ...worksheet.columns[0], width: 220 };
    worksheet.rows[0] = { ...worksheet.rows[0], height: 84 };
    setTextCell(worksheet, buildWorksheetCellKey("A", "1"), "Scope summary");

    const result = applyWorksheetAutoLayout({
      worksheet,
      target: {
        rowIds: ["1"],
        columnIds: ["A"],
        cellKeys: ["A1"],
      },
      measureCell: () => ({
        textWidth: 120,
        wrappedHeight: 40,
      }),
      minColumnWidth: 80,
      maxColumnWidth: 640,
      minRowHeight: 28,
      maxRowHeight: 240,
      preserveExistingColumnWidths: true,
      preserveExistingRowHeights: true,
    });

    expect(result.columns[0]?.width).toBe(220);
    expect(result.rows[0]?.height).toBe(84);
  });

  it("auto-fits manual column and row targets using populated cells", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 4 });
    setTextCell(worksheet, buildWorksheetCellKey("B", "2"), "Labour allowance");
    setTextCell(worksheet, buildWorksheetCellKey("B", "3"), "Sell price output");
    setTextCell(worksheet, buildWorksheetCellKey("C", "2"), "1200");

    const columnTarget = buildWorksheetColumnAutoFitTarget(worksheet, "B");
    const rowTarget = buildWorksheetRowAutoFitTarget(worksheet, "2");

    expect(columnTarget.columnIds).toEqual(["B"]);
    expect(columnTarget.cellKeys).toEqual(["B2", "B3"]);
    expect(rowTarget.rowIds).toEqual(["2"]);
    expect(rowTarget.cellKeys).toEqual(["B2", "C2"]);
  });

  it("applies measured widths and heights inside the configured bounds", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 4 });
    setTextCell(worksheet, buildWorksheetCellKey("A", "1"), "Extremely long worksheet heading");
    setTextCell(worksheet, buildWorksheetCellKey("B", "1"), "Short");

    const result = applyWorksheetAutoLayout({
      worksheet,
      target: {
        rowIds: ["1"],
        columnIds: ["A", "B"],
        cellKeys: ["A1", "B1"],
      },
      measureCell: ({ cellKey }) => ({
        textWidth: cellKey === "A1" ? 720 : 96,
        wrappedHeight: cellKey === "A1" ? 180 : 36,
      }),
      minColumnWidth: 80,
      maxColumnWidth: 320,
      minRowHeight: 28,
      maxRowHeight: 120,
      preserveExistingColumnWidths: false,
      preserveExistingRowHeights: false,
    });

    expect(result.columns[0]?.width).toBe(320);
    expect(result.columns[1]?.width).toBe(96);
    expect(result.rows[0]?.height).toBe(120);
  });

  it("grows affected populated rows when a resized column becomes narrower", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 4 });
    setTextCell(worksheet, buildWorksheetCellKey("B", "2"), "Estimator worksheet note");
    worksheet.columns[1] = { ...worksheet.columns[1], width: 90 };
    worksheet.rows[1] = { ...worksheet.rows[1], height: 36 };

    const result = applyWorksheetAutoLayout({
      worksheet,
      target: buildWorksheetColumnAutoFitTarget(worksheet, "B"),
      measureCell: ({ cellKey, width }) => ({
        textWidth: 140,
        wrappedHeight: cellKey === "B2" && width <= 100 ? 88 : 36,
      }),
      minColumnWidth: 80,
      maxColumnWidth: 640,
      minRowHeight: 28,
      maxRowHeight: 240,
      preserveExistingColumnWidths: true,
      preserveExistingRowHeights: false,
      resizeColumns: false,
      resizeRows: true,
    });

    expect(result.rows[1]?.height).toBe(88);
    expect(result.rows[0]?.height).toBe(36);
  });

  it("shrinks affected populated rows when a resized column becomes wider", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 4 });
    setTextCell(worksheet, buildWorksheetCellKey("B", "2"), "Estimator worksheet note");
    worksheet.columns[1] = { ...worksheet.columns[1], width: 220 };
    worksheet.rows[1] = { ...worksheet.rows[1], height: 88 };

    const result = applyWorksheetAutoLayout({
      worksheet,
      target: buildWorksheetColumnAutoFitTarget(worksheet, "B"),
      measureCell: ({ cellKey, width }) => ({
        textWidth: 140,
        wrappedHeight: cellKey === "B2" && width >= 200 ? 36 : 88,
      }),
      minColumnWidth: 80,
      maxColumnWidth: 640,
      minRowHeight: 28,
      maxRowHeight: 240,
      preserveExistingColumnWidths: true,
      preserveExistingRowHeights: false,
      resizeColumns: false,
      resizeRows: true,
    });

    expect(result.rows[1]?.height).toBe(36);
  });

  it("does not recalculate empty rows when refitting rows for a resized column", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 4 });
    setTextCell(worksheet, buildWorksheetCellKey("C", "3"), "Output");
    worksheet.rows[1] = { ...worksheet.rows[1], height: 72 };

    const result = applyWorksheetAutoLayout({
      worksheet,
      target: buildWorksheetColumnAutoFitTarget(worksheet, "B"),
      measureCell: () => ({
        textWidth: 100,
        wrappedHeight: 44,
      }),
      minColumnWidth: 80,
      maxColumnWidth: 640,
      minRowHeight: 28,
      maxRowHeight: 240,
      preserveExistingColumnWidths: true,
      preserveExistingRowHeights: false,
      resizeColumns: false,
      resizeRows: true,
    });

    expect(result).toBe(worksheet);
    expect(result.rows[1]?.height).toBe(72);
  });
});
