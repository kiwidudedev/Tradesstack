import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import { buildWorksheetCellKey, parseWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";

export type WorksheetSelectionKind = "cells" | "rows" | "columns";

export interface WorksheetSelectionArea extends WorksheetSelectionRange {
  kind: WorksheetSelectionKind;
}

export interface WorksheetMultiSelectionState {
  anchorCellKey: string | null;
  focusCellKey: string | null;
  ranges: WorksheetSelectionArea[];
  activeRangeIndex: number;
}

function normalizeWorksheetSelectionArea(area: WorksheetSelectionArea): WorksheetSelectionArea {
  return {
    ...area,
    startRowIndex: Math.min(area.startRowIndex, area.endRowIndex),
    endRowIndex: Math.max(area.startRowIndex, area.endRowIndex),
    startColumnIndex: Math.min(area.startColumnIndex, area.endColumnIndex),
    endColumnIndex: Math.max(area.startColumnIndex, area.endColumnIndex),
  };
}

function cloneWorksheetSelectionArea(area: WorksheetSelectionArea): WorksheetSelectionArea {
  return {
    kind: area.kind,
    startRowIndex: area.startRowIndex,
    endRowIndex: area.endRowIndex,
    startColumnIndex: area.startColumnIndex,
    endColumnIndex: area.endColumnIndex,
  };
}

function getWorksheetSelectionAreaIdentity(area: WorksheetSelectionArea) {
  return [
    area.kind,
    area.startRowIndex,
    area.endRowIndex,
    area.startColumnIndex,
    area.endColumnIndex,
  ].join(":");
}

function normalizeWorksheetSelectionAreas(ranges: WorksheetSelectionArea[]) {
  const seen = new Set<string>();
  const normalized: WorksheetSelectionArea[] = [];

  for (const range of ranges) {
    const nextRange = normalizeWorksheetSelectionArea(cloneWorksheetSelectionArea(range));
    const identity = getWorksheetSelectionAreaIdentity(nextRange);
    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    normalized.push(nextRange);
  }

  return normalized;
}

function getCellPosition(worksheet: WorksheetData, cellKey: string) {
  const parsed = parseWorksheetCellKey(cellKey);
  if (!parsed) {
    return null;
  }

  const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
  const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);
  if (columnIndex < 0 || rowIndex < 0) {
    return null;
  }

  return { rowIndex, columnIndex };
}

function getCellKeyAtPosition(
  worksheet: WorksheetData,
  rowIndex: number,
  columnIndex: number,
) {
  const row = worksheet.rows[rowIndex];
  const column = worksheet.columns[columnIndex];
  if (!row || !column) {
    return null;
  }

  return buildWorksheetCellKey(column.id, row.id);
}

function clampActiveRangeIndex(ranges: WorksheetSelectionArea[], activeRangeIndex: number) {
  if (ranges.length === 0) {
    return 0;
  }

  return Math.max(0, Math.min(activeRangeIndex, ranges.length - 1));
}

function buildState(
  ranges: WorksheetSelectionArea[],
  activeRangeIndex: number,
  anchorCellKey: string | null,
  focusCellKey: string | null,
): WorksheetMultiSelectionState {
  const normalizedRanges = normalizeWorksheetSelectionAreas(ranges);
  return {
    anchorCellKey,
    focusCellKey,
    ranges: normalizedRanges,
    activeRangeIndex: clampActiveRangeIndex(normalizedRanges, activeRangeIndex),
  };
}

export function createEmptyWorksheetMultiSelectionState(): WorksheetMultiSelectionState {
  return buildState([], 0, null, null);
}

export function getActiveWorksheetSelectionArea(state: WorksheetMultiSelectionState) {
  return state.ranges[state.activeRangeIndex] ?? null;
}

export function buildWorksheetSelectionAreaFromCellKeys(
  worksheet: WorksheetData,
  anchorCellKey: string | null,
  focusCellKey: string | null,
  kind: WorksheetSelectionKind = "cells",
) {
  if (!anchorCellKey || !focusCellKey) {
    return null;
  }

  const anchorPosition = getCellPosition(worksheet, anchorCellKey);
  const focusPosition = getCellPosition(worksheet, focusCellKey);
  if (!anchorPosition || !focusPosition) {
    return null;
  }

  const fullRowEnd = Math.max(0, worksheet.columnCount - 1);
  const fullColumnEnd = Math.max(0, worksheet.rowCount - 1);

  if (kind === "rows") {
    return {
      kind,
      startRowIndex: Math.min(anchorPosition.rowIndex, focusPosition.rowIndex),
      endRowIndex: Math.max(anchorPosition.rowIndex, focusPosition.rowIndex),
      startColumnIndex: 0,
      endColumnIndex: fullRowEnd,
    } satisfies WorksheetSelectionArea;
  }

  if (kind === "columns") {
    return {
      kind,
      startRowIndex: 0,
      endRowIndex: fullColumnEnd,
      startColumnIndex: Math.min(anchorPosition.columnIndex, focusPosition.columnIndex),
      endColumnIndex: Math.max(anchorPosition.columnIndex, focusPosition.columnIndex),
    } satisfies WorksheetSelectionArea;
  }

  return {
    kind,
    startRowIndex: Math.min(anchorPosition.rowIndex, focusPosition.rowIndex),
    endRowIndex: Math.max(anchorPosition.rowIndex, focusPosition.rowIndex),
    startColumnIndex: Math.min(anchorPosition.columnIndex, focusPosition.columnIndex),
    endColumnIndex: Math.max(anchorPosition.columnIndex, focusPosition.columnIndex),
  } satisfies WorksheetSelectionArea;
}

export function replaceWorksheetSelectionFromCellKeys(
  state: WorksheetMultiSelectionState,
  worksheet: WorksheetData,
  anchorCellKey: string | null,
  focusCellKey: string | null,
  kind: WorksheetSelectionKind = "cells",
) {
  const area = buildWorksheetSelectionAreaFromCellKeys(worksheet, anchorCellKey, focusCellKey, kind);
  if (!area) {
    return buildState([], 0, anchorCellKey, focusCellKey);
  }

  return buildState([area], 0, anchorCellKey, focusCellKey);
}

export function addWorksheetSelectionFromCellKeys(
  state: WorksheetMultiSelectionState,
  worksheet: WorksheetData,
  anchorCellKey: string | null,
  focusCellKey: string | null,
  kind: WorksheetSelectionKind = "cells",
) {
  const area = buildWorksheetSelectionAreaFromCellKeys(worksheet, anchorCellKey, focusCellKey, kind);
  if (!area) {
    return state;
  }

  const nextRanges = [...state.ranges, area];
  return buildState(nextRanges, nextRanges.length - 1, anchorCellKey, focusCellKey);
}

function syncStateToRange(
  worksheet: WorksheetData,
  ranges: WorksheetSelectionArea[],
  activeRangeIndex: number,
) {
  const activeRange = ranges[activeRangeIndex] ?? null;
  if (!activeRange) {
    return buildState([], 0, null, null);
  }

  const anchorCellKey =
    getCellKeyAtPosition(worksheet, activeRange.startRowIndex, activeRange.startColumnIndex);
  const focusCellKey =
    getCellKeyAtPosition(worksheet, activeRange.endRowIndex, activeRange.endColumnIndex);

  return buildState(ranges, activeRangeIndex, anchorCellKey, focusCellKey);
}

export function removeWorksheetSelectionRangeAtIndex(
  state: WorksheetMultiSelectionState,
  worksheet: WorksheetData,
  index: number,
) {
  if (index < 0 || index >= state.ranges.length) {
    return state;
  }

  const nextRanges = state.ranges.filter((_, rangeIndex) => rangeIndex !== index);
  const nextActiveRangeIndex =
    nextRanges.length === 0
      ? 0
      : index >= nextRanges.length
        ? nextRanges.length - 1
        : index;

  return syncStateToRange(worksheet, nextRanges, nextActiveRangeIndex);
}

function isStandaloneCellArea(area: WorksheetSelectionArea) {
  return (
    area.kind === "cells" &&
    area.startRowIndex === area.endRowIndex &&
    area.startColumnIndex === area.endColumnIndex
  );
}

function isExactRowArea(area: WorksheetSelectionArea, rowIndex: number, worksheet: WorksheetData) {
  return (
    area.kind === "rows" &&
    area.startRowIndex === rowIndex &&
    area.endRowIndex === rowIndex &&
    area.startColumnIndex === 0 &&
    area.endColumnIndex === Math.max(0, worksheet.columnCount - 1)
  );
}

function isExactColumnArea(area: WorksheetSelectionArea, columnIndex: number, worksheet: WorksheetData) {
  return (
    area.kind === "columns" &&
    area.startColumnIndex === columnIndex &&
    area.endColumnIndex === columnIndex &&
    area.startRowIndex === 0 &&
    area.endRowIndex === Math.max(0, worksheet.rowCount - 1)
  );
}

export function toggleWorksheetCellSelection(
  state: WorksheetMultiSelectionState,
  worksheet: WorksheetData,
  cellKey: string,
) {
  const position = getCellPosition(worksheet, cellKey);
  if (!position) {
    return state;
  }

  const existingIndex = state.ranges.findIndex((range) =>
    isStandaloneCellArea(range) &&
    range.startRowIndex === position.rowIndex &&
    range.startColumnIndex === position.columnIndex,
  );

  if (existingIndex >= 0) {
    return removeWorksheetSelectionRangeAtIndex(state, worksheet, existingIndex);
  }

  return addWorksheetSelectionFromCellKeys(state, worksheet, cellKey, cellKey, "cells");
}

export function toggleWorksheetRowSelection(
  state: WorksheetMultiSelectionState,
  worksheet: WorksheetData,
  rowIndex: number,
) {
  const row = worksheet.rows[rowIndex];
  const firstColumn = worksheet.columns[0];
  if (!row || !firstColumn) {
    return state;
  }

  const existingIndex = state.ranges.findIndex((range) => isExactRowArea(range, rowIndex, worksheet));
  if (existingIndex >= 0) {
    return removeWorksheetSelectionRangeAtIndex(state, worksheet, existingIndex);
  }

  const cellKey = buildWorksheetCellKey(firstColumn.id, row.id);
  return addWorksheetSelectionFromCellKeys(state, worksheet, cellKey, cellKey, "rows");
}

export function toggleWorksheetColumnSelection(
  state: WorksheetMultiSelectionState,
  worksheet: WorksheetData,
  columnIndex: number,
) {
  const column = worksheet.columns[columnIndex];
  const firstRow = worksheet.rows[0];
  if (!column || !firstRow) {
    return state;
  }

  const existingIndex = state.ranges.findIndex((range) => isExactColumnArea(range, columnIndex, worksheet));
  if (existingIndex >= 0) {
    return removeWorksheetSelectionRangeAtIndex(state, worksheet, existingIndex);
  }

  const cellKey = buildWorksheetCellKey(column.id, firstRow.id);
  return addWorksheetSelectionFromCellKeys(state, worksheet, cellKey, cellKey, "columns");
}

export function isPositionInWorksheetSelectionArea(
  position: { rowIndex: number; columnIndex: number },
  range: WorksheetSelectionRange | null,
) {
  if (!range) {
    return false;
  }

  return (
    position.rowIndex >= range.startRowIndex &&
    position.rowIndex <= range.endRowIndex &&
    position.columnIndex >= range.startColumnIndex &&
    position.columnIndex <= range.endColumnIndex
  );
}

export function findWorksheetSelectionRangeIndexForCellKey(
  worksheet: WorksheetData,
  ranges: WorksheetSelectionArea[],
  cellKey: string,
) {
  const position = getCellPosition(worksheet, cellKey);
  if (!position) {
    return -1;
  }

  return ranges.findIndex((range) => isPositionInWorksheetSelectionArea(position, range));
}

export function findWorksheetSelectionRangeIndexForRow(
  ranges: WorksheetSelectionArea[],
  rowIndex: number,
) {
  return ranges.findIndex((range) =>
    range.kind === "rows" &&
    rowIndex >= range.startRowIndex &&
    rowIndex <= range.endRowIndex,
  );
}

export function findWorksheetSelectionRangeIndexForColumn(
  ranges: WorksheetSelectionArea[],
  columnIndex: number,
) {
  return ranges.findIndex((range) =>
    range.kind === "columns" &&
    columnIndex >= range.startColumnIndex &&
    columnIndex <= range.endColumnIndex,
  );
}

export function isRowIndexSelected(
  ranges: WorksheetSelectionArea[],
  rowIndex: number,
) {
  return findWorksheetSelectionRangeIndexForRow(ranges, rowIndex) >= 0;
}

export function isColumnIndexSelected(
  ranges: WorksheetSelectionArea[],
  columnIndex: number,
) {
  return findWorksheetSelectionRangeIndexForColumn(ranges, columnIndex) >= 0;
}
