import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import {
  createDefaultWorksheetData,
  type WorksheetCell,
  type WorksheetData,
} from "./opportunity-pricing-worksheet-defaults";
import { recalculateWorksheetFormulas } from "./opportunity-pricing-worksheet-formulas";
import {
  buildWorksheetRedoState,
  buildWorksheetUndoState,
  commitWorksheetHistoryEntry,
} from "./opportunity-pricing-worksheet-history";
import type {
  WorksheetMultiSelectionState,
  WorksheetSelectionArea,
} from "./opportunity-pricing-worksheet-multi-selection";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";
import { deriveWorksheetSelectionAggregate } from "./opportunity-pricing-worksheet-selection-aggregate";

function buildCell(
  value: string | number | null,
  options?: {
    computedValue?: string | number | null;
    formula?: string | null;
    kind?: "general" | "number" | "currency" | "percent";
    decimalPlaces?: number;
    displayValue?: string;
  },
): WorksheetCell {
  const computedValue = options && "computedValue" in options ? options.computedValue! : value;
  return {
    value,
    type: typeof value === "number" ? "number" : value === null ? "empty" : "text",
    formula: options?.formula ?? null,
    computedValue,
    displayValue: options?.displayValue ?? (computedValue === null ? "" : String(computedValue)),
    metadata: options?.kind
      ? {
          format: {
            number: {
              kind: options.kind,
              ...(options.decimalPlaces !== undefined
                ? { decimalPlaces: options.decimalPlaces }
                : {}),
            },
          },
        }
      : {},
  };
}

function cellRange(
  startRowIndex: number,
  endRowIndex: number,
  startColumnIndex = 0,
  endColumnIndex = startColumnIndex,
  kind: WorksheetSelectionArea["kind"] = "cells",
): WorksheetSelectionArea {
  return { kind, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex };
}

function selection(...ranges: WorksheetSelectionArea[]): WorksheetMultiSelectionState {
  return {
    anchorCellKey: null,
    focusCellKey: null,
    ranges,
    activeRangeIndex: 0,
  };
}

function aggregate(worksheet: WorksheetData, ...ranges: WorksheetSelectionArea[]) {
  return deriveWorksheetSelectionAggregate({ worksheet, selectionState: selection(...ranges) });
}

function setCell(
  worksheet: WorksheetData,
  cellKey: string,
  value: string | number | null,
  options?: Parameters<typeof buildCell>[1],
) {
  worksheet.cells[cellKey] = buildCell(value, options);
}

describe("deriveWorksheetSelectionAggregate", () => {
  it("retains the normalized NZD format when raw metadata contains another currency", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 10, { kind: "currency" });
    setCell(worksheet, "A2", 20, { kind: "currency" });
    worksheet.cells.A1!.metadata = { format: { number: { kind: "currency", currencyCode: "USD" } } };
    const result = aggregate(worksheet, cellRange(0, 1));
    expect(result?.sum).toBe(30);
    expect(result?.numberFormat).toMatchObject({ kind: "currency", currencyCode: "NZD" });
  });

  it.each([
    [3890.9800000000014, "3,890.98"],
    [0.30000000000000004, "0.3"],
    [266, "266"],
    [266.5, "266.5"],
    [1_000_000, "1,000,000"],
    [-3890.9800000000014, "-3,890.98"],
    [12_345_678.91, "12,345,678.91"],
  ])("formats a General Sum of %s as %s without changing its value", (value, expected) => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", value, { kind: "general" });
    setCell(worksheet, "A2", null);

    const result = aggregate(worksheet, cellRange(0, 1));
    expect(result?.sum).toBe(value);
    expect(result?.displayValue).toBe(expected);
  });

  it("formats 0.1 + 0.2 without exposing the binary floating-point tail", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 0.1, { kind: "general" });
    setCell(worksheet, "A2", 0.2, { kind: "general" });

    const result = aggregate(worksheet, cellRange(0, 1));
    expect(result?.sum).toBe(0.30000000000000004);
    expect(result?.displayValue).toBe("0.3");
  });

  it("formats the exact Material Total reference fixture as $20,933.66", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 12, columnCount: 12 });
    [988.9, 605, 1661, 3220.8, 2970, 10992.96, 495].forEach((value, index) => {
      setCell(worksheet, `J${index + 3}`, value, { kind: "currency" });
    });

    const result = aggregate(worksheet, cellRange(2, 8, 9, 9));

    expect(result?.numericCellCount).toBe(7);
    expect(result?.sum).toBeCloseTo(20933.66, 8);
    expect(result?.displayValue).toBe("$20,933.66");
  });

  it("sums plain numbers", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 10);
    setCell(worksheet, "A2", 20);
    expect(aggregate(worksheet, cellRange(0, 1))?.displayValue).toBe("30");
  });

  it("uses computedValue before value for formula results", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 10);
    setCell(worksheet, "A2", 20);
    setCell(worksheet, "A3", "=A1+A2", { formula: "=A1+A2", computedValue: 30 });
    expect(aggregate(worksheet, cellRange(0, 2))?.sum).toBe(60);
  });

  it("formats a numeric formula result without exposing its floating-point tail", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", "=0.1+0.2", {
      formula: "=0.1+0.2",
      computedValue: 0.30000000000000004,
      kind: "general",
    });
    setCell(worksheet, "A2", null);

    const result = aggregate(worksheet, cellRange(0, 1));
    expect(result?.sum).toBe(0.30000000000000004);
    expect(result?.displayValue).toBe("0.3");
  });

  it("includes formula booleans stored as numeric 1/0 without changing formula semantics", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", "=1=1", { formula: "=1=1", computedValue: 1 });
    setCell(worksheet, "A2", "=1=2", { formula: "=1=2", computedValue: 0 });
    expect(aggregate(worksheet, cellRange(0, 1))?.sum).toBe(1);
  });

  it("ignores text while retaining compatible currency values", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 12.5, { kind: "currency" });
    setCell(worksheet, "A2", "L/m");
    expect(aggregate(worksheet, cellRange(0, 1))?.displayValue).toBe("$12.50");
  });

  it("ignores blank cells", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 5);
    setCell(worksheet, "A2", null);
    expect(aggregate(worksheet, cellRange(0, 1))?.sum).toBe(5);
  });

  it("shows a zero-only multi-cell selection", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 0);
    setCell(worksheet, "A2", 0);
    expect(aggregate(worksheet, cellRange(0, 1))?.displayValue).toBe("0");
  });

  it("sums canonical percentage ratios and formats the result as a percentage", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 0.1, { kind: "percent", decimalPlaces: 0 });
    setCell(worksheet, "A2", 0.2, { kind: "percent", decimalPlaces: 0 });
    setCell(worksheet, "A3", 0.3, { kind: "percent", decimalPlaces: 0 });
    expect(aggregate(worksheet, cellRange(0, 2))?.displayValue).toBe("60%");
  });

  it("treats general and number formats as compatible and uses the highest precision", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 1.5, { kind: "general" });
    setCell(worksheet, "A2", 2.25, { kind: "number", decimalPlaces: 3 });
    expect(aggregate(worksheet, cellRange(0, 1))?.displayValue).toBe("3.750");
  });

  it("sums General and Currency values using neutral General display", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 10, { kind: "general" });
    setCell(worksheet, "A2", 2, { kind: "currency" });
    const result = aggregate(worksheet, cellRange(0, 1));
    expect(result?.sum).toBe(12);
    expect(result?.displayValue).toBe("12");
    expect(result?.numberFormat).toEqual({ kind: "general" });
  });

  it("sums Currency and Number values without displaying the result as currency", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 10, { kind: "currency" });
    setCell(worksheet, "A2", 2.5, { kind: "number", decimalPlaces: 2 });
    const result = aggregate(worksheet, cellRange(0, 1));
    expect(result?.sum).toBe(12.5);
    expect(result?.displayValue).toBe("12.5");
    expect(result?.numberFormat).toEqual({ kind: "general" });
  });

  it("sums percentage and currency canonical values using neutral General display", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 0.1, { kind: "percent" });
    setCell(worksheet, "A2", 10, { kind: "currency" });
    const result = aggregate(worksheet, cellRange(0, 1));
    expect(result?.sum).toBe(10.1);
    expect(result?.displayValue).toBe("10.1");
    expect(result?.numberFormat).toEqual({ kind: "general" });
  });

  it("regresses mixed numeric formats: 100 + 3.6 + 2.4 + 150 + 10 = 266", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 5, columnCount: 1 });
    setCell(worksheet, "A1", 100, { kind: "general" });
    setCell(worksheet, "A2", 3.6, { kind: "number", decimalPlaces: 1 });
    setCell(worksheet, "A3", 2.4, { kind: "currency" });
    setCell(worksheet, "A4", 150, { kind: "percent", decimalPlaces: 0 });
    setCell(worksheet, "A5", 10, { kind: "number", decimalPlaces: 3 });

    const result = aggregate(worksheet, cellRange(0, 4));
    expect(result?.numericCellCount).toBe(5);
    expect(result?.sum).toBe(266);
    expect(result?.displayValue).toBe("266");
    expect(result?.numberFormat).toEqual({ kind: "general" });
  });

  it("includes numeric formula results alongside differently formatted normal numbers", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 10, { kind: "general" });
    setCell(worksheet, "A2", 5, { kind: "currency" });
    setCell(worksheet, "A3", "=A1+A2", {
      formula: "=A1+A2",
      computedValue: 15,
      kind: "number",
      decimalPlaces: 2,
    });

    const result = aggregate(worksheet, cellRange(0, 2));
    expect(result?.numericCellCount).toBe(3);
    expect(result?.sum).toBe(30);
    expect(result?.displayValue).toBe("30");
  });

  it("uses canonical numeric fields instead of parsing visually formatted display strings", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 100, {
      kind: "currency",
      displayValue: "$9,999.99",
    });
    setCell(worksheet, "A2", 3.6, {
      kind: "number",
      decimalPlaces: 1,
      displayValue: "not the canonical value",
    });
    setCell(worksheet, "A3", "ignored text", {
      displayValue: "123,456",
    });

    const result = aggregate(worksheet, cellRange(0, 2));
    expect(result?.numericCellCount).toBe(2);
    expect(result?.sum).toBe(103.6);
    expect(result?.displayValue).toBe("103.6");
  });

  it("includes zero and negative values across different numeric formats", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 0, { kind: "general" });
    setCell(worksheet, "A2", -12.5, { kind: "currency" });
    setCell(worksheet, "A3", 2.5, { kind: "number", decimalPlaces: 1 });

    const result = aggregate(worksheet, cellRange(0, 2));
    expect(result?.numericCellCount).toBe(3);
    expect(result?.sum).toBe(-10);
    expect(result?.displayValue).toBe("-10");
  });

  it("ignores formula errors and invalid non-finite values", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 1 });
    setCell(worksheet, "A1", 7);
    setCell(worksheet, "A2", "=1/0", { formula: "=1/0", computedValue: "#DIV/0!" });
    setCell(worksheet, "A3", Number.POSITIVE_INFINITY);
    expect(aggregate(worksheet, cellRange(0, 2))?.sum).toBe(7);
  });

  it("sums multiple non-contiguous ranges", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 5, columnCount: 1 });
    setCell(worksheet, "A1", 2);
    setCell(worksheet, "A5", 8);
    expect(aggregate(worksheet, cellRange(0, 0), cellRange(4, 4))?.sum).toBe(10);
  });

  it("de-duplicates overlapping ranges", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 7, columnCount: 1 });
    for (let row = 1; row <= 7; row += 1) setCell(worksheet, `A${row}`, row);
    expect(aggregate(worksheet, cellRange(0, 4), cellRange(2, 6))?.sum).toBe(28);
  });

  it("de-duplicates exact duplicate ranges", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 1);
    setCell(worksheet, "A2", 2);
    const range = cellRange(0, 1);
    const result = aggregate(worksheet, range, { ...range });
    expect(result?.numericCellCount).toBe(2);
    expect(result?.sum).toBe(3);
  });

  it("supports a full-row selection", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 4 });
    setCell(worksheet, "A2", 4);
    setCell(worksheet, "D2", 6);
    expect(aggregate(worksheet, cellRange(1, 1, 0, 3, "rows"))?.sum).toBe(10);
  });

  it("supports a full-column selection", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 5, columnCount: 2 });
    setCell(worksheet, "B1", 3);
    setCell(worksheet, "B5", 9);
    expect(aggregate(worksheet, cellRange(0, 4, 1, 1, "columns"))?.sum).toBe(12);
  });

  it("includes selected cells outside a typical mounted viewport", () => {
    const worksheet = createDefaultWorksheetData();
    setCell(worksheet, "A1", 1);
    setCell(worksheet, "Z500", 99);
    expect(aggregate(worksheet, cellRange(0, 499, 0, 25))?.sum).toBe(100);
  });

  it("handles 10,000 stored selected cells without enumerating empty DOM cells", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 100, columnCount: 100 });
    for (const row of worksheet.rows) {
      for (const column of worksheet.columns) {
        worksheet.cells[buildWorksheetCellKey(column.id, row.id)] = buildCell(1);
      }
    }

    const startedAt = performance.now();
    const result = aggregate(worksheet, cellRange(0, 99, 0, 99));
    const durationMs = performance.now() - startedAt;

    expect(result?.numericCellCount).toBe(10_000);
    expect(result?.sum).toBe(10_000);
    expect(durationMs).toBeLessThan(500);
  });

  it("hides a single logical selected cell", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 10);
    expect(aggregate(worksheet, cellRange(0, 0))).toBeNull();
  });

  it("hides a multi-cell selection with no numeric cells", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", "Material");
    setCell(worksheet, "A2", "L/m");
    expect(aggregate(worksheet, cellRange(0, 1))).toBeNull();
  });

  it("updates from recalculated worksheet state without changing the selection", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 1 });
    setCell(worksheet, "A1", 10);
    setCell(worksheet, "A2", 20);
    setCell(worksheet, "A3", "=A1+A2", { formula: "=A1+A2" });
    const selected = selection(cellRange(0, 2));
    const initial = recalculateWorksheetFormulas(worksheet);
    expect(deriveWorksheetSelectionAggregate({ worksheet: initial, selectionState: selected })?.sum).toBe(60);

    initial.cells.A1 = buildCell(15);
    const updated = recalculateWorksheetFormulas(initial);
    expect(deriveWorksheetSelectionAggregate({ worksheet: updated, selectionState: selected })?.sum).toBe(70);
  });

  it("follows undo and redo worksheet snapshots without creating aggregate history", () => {
    const original = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(original, "A1", 10);
    setCell(original, "A2", 20);
    const edited = structuredClone(original);
    edited.cells.A2 = buildCell(25);
    const selected = selection(cellRange(0, 1));
    const history = commitWorksheetHistoryEntry({
      changed: true,
      future: [],
      historyLimit: 50,
      past: [],
      previousWorksheet: original,
    });

    expect(deriveWorksheetSelectionAggregate({ worksheet: edited, selectionState: selected })?.sum).toBe(35);
    const undo = buildWorksheetUndoState({ currentWorksheet: edited, ...history, historyLimit: 50 });
    expect(deriveWorksheetSelectionAggregate({ worksheet: undo!.worksheet, selectionState: selected })?.sum).toBe(30);
    const redo = buildWorksheetRedoState({
      currentWorksheet: undo!.worksheet,
      future: undo!.future,
      past: undo!.past,
      historyLimit: 50,
    });
    expect(deriveWorksheetSelectionAggregate({ worksheet: redo!.worksheet, selectionState: selected })?.sum).toBe(35);
    expect(history.past).toHaveLength(1);
  });

  it("does not mutate worksheet or selection inputs", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 1 });
    setCell(worksheet, "A1", 1);
    setCell(worksheet, "A2", 2);
    const selected = selection(cellRange(0, 1));
    const worksheetSnapshot = structuredClone(worksheet);
    const selectionSnapshot = structuredClone(selected);

    deriveWorksheetSelectionAggregate({ worksheet, selectionState: selected });

    expect(worksheet).toEqual(worksheetSnapshot);
    expect(selected).toEqual(selectionSnapshot);
  });
});
