import { describe, expect, it } from "vitest";

import { createDefaultWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import {
  addWorksheetSelectionFromCellKeys,
  createEmptyWorksheetMultiSelectionState,
  getActiveWorksheetSelectionArea,
  replaceWorksheetSelectionFromCellKeys,
  toggleWorksheetCellSelection,
  toggleWorksheetColumnSelection,
  toggleWorksheetRowSelection,
} from "./opportunity-pricing-worksheet-multi-selection";

function buildWorksheet() {
  return createDefaultWorksheetData();
}

describe("worksheet multi-selection state", () => {
  it("keeps A9 and J9 as exactly two isolated single-cell ranges", () => {
    const worksheet = buildWorksheet();
    const a9 = replaceWorksheetSelectionFromCellKeys(
      createEmptyWorksheetMultiSelectionState(),
      worksheet,
      "A9",
      "A9",
    );
    const next = toggleWorksheetCellSelection(a9, worksheet, "J9");

    expect(next.ranges).toEqual([
      { kind: "cells", startRowIndex: 8, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 0 },
      { kind: "cells", startRowIndex: 8, endRowIndex: 8, startColumnIndex: 9, endColumnIndex: 9 },
    ]);
  });

  it("keeps A1 and C3 as separate selections", () => {
    const worksheet = buildWorksheet();
    const single = replaceWorksheetSelectionFromCellKeys(
      createEmptyWorksheetMultiSelectionState(),
      worksheet,
      "A1",
      "A1",
    );
    const next = toggleWorksheetCellSelection(single, worksheet, "C3");

    expect(next.ranges).toEqual([
      { kind: "cells", startRowIndex: 0, endRowIndex: 0, startColumnIndex: 0, endColumnIndex: 0 },
      { kind: "cells", startRowIndex: 2, endRowIndex: 2, startColumnIndex: 2, endColumnIndex: 2 },
    ]);
  });

  it("preserves three standalone cell selections", () => {
    const worksheet = buildWorksheet();
    const a1 = replaceWorksheetSelectionFromCellKeys(
      createEmptyWorksheetMultiSelectionState(),
      worksheet,
      "A1",
      "A1",
    );
    const c3 = toggleWorksheetCellSelection(a1, worksheet, "C3");
    const e5 = toggleWorksheetCellSelection(c3, worksheet, "E5");

    expect(e5.ranges).toHaveLength(3);
    expect(e5.ranges.map((range) => [range.startRowIndex, range.startColumnIndex])).toEqual([
      [0, 0],
      [2, 2],
      [4, 4],
    ]);
  });

  it("removes an already-selected standalone cell without affecting others", () => {
    const worksheet = buildWorksheet();
    const base = toggleWorksheetCellSelection(
      toggleWorksheetCellSelection(
        replaceWorksheetSelectionFromCellKeys(createEmptyWorksheetMultiSelectionState(), worksheet, "A1", "A1"),
        worksheet,
        "C3",
      ),
      worksheet,
      "E5",
    );

    const next = toggleWorksheetCellSelection(base, worksheet, "C3");

    expect(next.ranges).toEqual([
      { kind: "cells", startRowIndex: 0, endRowIndex: 0, startColumnIndex: 0, endColumnIndex: 0 },
      { kind: "cells", startRowIndex: 4, endRowIndex: 4, startColumnIndex: 4, endColumnIndex: 4 },
    ]);
  });

  it("keeps row 2 and row 8 only", () => {
    const worksheet = buildWorksheet();
    const row2 = replaceWorksheetSelectionFromCellKeys(
      createEmptyWorksheetMultiSelectionState(),
      worksheet,
      "A2",
      "A2",
      "rows",
    );
    const next = toggleWorksheetRowSelection(row2, worksheet, 7);

    expect(next.ranges).toEqual([
      { kind: "rows", startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: worksheet.columnCount - 1 },
      { kind: "rows", startRowIndex: 7, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: worksheet.columnCount - 1 },
    ]);
  });

  it("keeps column B and column F only", () => {
    const worksheet = buildWorksheet();
    const columnB = replaceWorksheetSelectionFromCellKeys(
      createEmptyWorksheetMultiSelectionState(),
      worksheet,
      "B1",
      "B1",
      "columns",
    );
    const next = toggleWorksheetColumnSelection(columnB, worksheet, 5);

    expect(next.ranges).toEqual([
      { kind: "columns", startRowIndex: 0, endRowIndex: worksheet.rowCount - 1, startColumnIndex: 1, endColumnIndex: 1 },
      { kind: "columns", startRowIndex: 0, endRowIndex: worksheet.rowCount - 1, startColumnIndex: 5, endColumnIndex: 5 },
    ]);
  });

  it("keeps ctrl/cmd drag ranges separate", () => {
    const worksheet = buildWorksheet();
    const base = replaceWorksheetSelectionFromCellKeys(
      createEmptyWorksheetMultiSelectionState(),
      worksheet,
      "A1",
      "B2",
    );
    const next = addWorksheetSelectionFromCellKeys(base, worksheet, "D4", "E5");

    expect(next.ranges).toEqual([
      { kind: "cells", startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
      { kind: "cells", startRowIndex: 3, endRowIndex: 4, startColumnIndex: 3, endColumnIndex: 4 },
    ]);
  });

  it("keeps shift extension contiguous", () => {
    const worksheet = buildWorksheet();
    const next = replaceWorksheetSelectionFromCellKeys(
      createEmptyWorksheetMultiSelectionState(),
      worksheet,
      "A1",
      "C3",
    );

    expect(getActiveWorksheetSelectionArea(next)).toEqual({
      kind: "cells",
      startRowIndex: 0,
      endRowIndex: 2,
      startColumnIndex: 0,
      endColumnIndex: 2,
    });
  });

  it("normal click replacement clears older multi-selection", () => {
    const worksheet = buildWorksheet();
    const multi = toggleWorksheetCellSelection(
      replaceWorksheetSelectionFromCellKeys(createEmptyWorksheetMultiSelectionState(), worksheet, "A1", "A1"),
      worksheet,
      "C3",
    );

    const next = replaceWorksheetSelectionFromCellKeys(multi, worksheet, "D4", "D4");

    expect(next.ranges).toEqual([
      { kind: "cells", startRowIndex: 3, endRowIndex: 3, startColumnIndex: 3, endColumnIndex: 3 },
    ]);
  });

  it("never fills the bounding rectangle for non-contiguous cells", () => {
    const worksheet = buildWorksheet();
    const next = toggleWorksheetCellSelection(
      replaceWorksheetSelectionFromCellKeys(createEmptyWorksheetMultiSelectionState(), worksheet, "A1", "A1"),
      worksheet,
      "C3",
    );

    expect(next.ranges.some((range) =>
      range.startRowIndex === 0 &&
      range.endRowIndex === 2 &&
      range.startColumnIndex === 0 &&
      range.endColumnIndex === 2,
    )).toBe(false);
  });

  it("does not infer a bounding rectangle between A9 and J9", () => {
    const worksheet = buildWorksheet();
    const next = toggleWorksheetCellSelection(
      replaceWorksheetSelectionFromCellKeys(createEmptyWorksheetMultiSelectionState(), worksheet, "A9", "A9"),
      worksheet,
      "J9",
    );

    expect(next.ranges.some((range) =>
      range.startRowIndex === 8 &&
      range.endRowIndex === 8 &&
      range.startColumnIndex === 0 &&
      range.endColumnIndex === 9,
    )).toBe(false);
  });

  it("cmd/clicking J9 again removes only J9", () => {
    const worksheet = buildWorksheet();
    const a9AndJ9 = toggleWorksheetCellSelection(
      replaceWorksheetSelectionFromCellKeys(createEmptyWorksheetMultiSelectionState(), worksheet, "A9", "A9"),
      worksheet,
      "J9",
    );

    const next = toggleWorksheetCellSelection(a9AndJ9, worksheet, "J9");

    expect(next.ranges).toEqual([
      { kind: "cells", startRowIndex: 8, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 0 },
    ]);
  });

  it("keeps reversed or duplicated ranges canonical without merging isolated cells", () => {
    const worksheet = buildWorksheet();
    const state = addWorksheetSelectionFromCellKeys(
      addWorksheetSelectionFromCellKeys(
        replaceWorksheetSelectionFromCellKeys(
          createEmptyWorksheetMultiSelectionState(),
          worksheet,
          "J9",
          "A9",
        ),
        worksheet,
        "A9",
        "A9",
      ),
      worksheet,
      "J9",
      "J9",
    );

    expect(state.ranges).toEqual([
      { kind: "cells", startRowIndex: 8, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 9 },
      { kind: "cells", startRowIndex: 8, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 0 },
      { kind: "cells", startRowIndex: 8, endRowIndex: 8, startColumnIndex: 9, endColumnIndex: 9 },
    ]);
  });
});
