import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { parseWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";

export interface WorksheetSelectionRange {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

export interface WorksheetRangeEdgeFlags {
  isInRange: boolean;
  isTopEdge: boolean;
  isBottomEdge: boolean;
  isLeftEdge: boolean;
  isRightEdge: boolean;
}

type WorksheetMoveDirection = "up" | "down" | "left" | "right";

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

  return {
    columnIndex,
    rowIndex,
  };
}

function buildCellKeyAtPosition(
  worksheet: WorksheetData,
  position: { rowIndex: number; columnIndex: number }
) {
  const row = worksheet.rows[position.rowIndex];
  const column = worksheet.columns[position.columnIndex];

  if (!row || !column) {
    return null;
  }

  return `${column.id}${row.id}`;
}

export function getWorksheetSelectionRange(
  worksheet: WorksheetData,
  anchorCellKey: string | null,
  focusCellKey: string | null
) {
  if (!anchorCellKey || !focusCellKey) {
    return null;
  }

  const anchorPosition = getCellPosition(worksheet, anchorCellKey);
  const focusPosition = getCellPosition(worksheet, focusCellKey);

  if (!anchorPosition || !focusPosition) {
    return null;
  }

  return {
    startRowIndex: Math.min(anchorPosition.rowIndex, focusPosition.rowIndex),
    endRowIndex: Math.max(anchorPosition.rowIndex, focusPosition.rowIndex),
    startColumnIndex: Math.min(anchorPosition.columnIndex, focusPosition.columnIndex),
    endColumnIndex: Math.max(anchorPosition.columnIndex, focusPosition.columnIndex),
  } satisfies WorksheetSelectionRange;
}

export function isCellInWorksheetRange(
  worksheet: WorksheetData,
  cellKey: string,
  range: WorksheetSelectionRange | null
) {
  if (!range) {
    return false;
  }

  const position = getCellPosition(worksheet, cellKey);
  if (!position) {
    return false;
  }

  return (
    position.rowIndex >= range.startRowIndex &&
    position.rowIndex <= range.endRowIndex &&
    position.columnIndex >= range.startColumnIndex &&
    position.columnIndex <= range.endColumnIndex
  );
}

export function getWorksheetRangeEdgeFlags(
  worksheet: WorksheetData,
  cellKey: string,
  range: WorksheetSelectionRange | null
) {
  if (!range) {
    return {
      isInRange: false,
      isTopEdge: false,
      isBottomEdge: false,
      isLeftEdge: false,
      isRightEdge: false,
    } satisfies WorksheetRangeEdgeFlags;
  }

  const position = getCellPosition(worksheet, cellKey);
  if (!position) {
    return {
      isInRange: false,
      isTopEdge: false,
      isBottomEdge: false,
      isLeftEdge: false,
      isRightEdge: false,
    } satisfies WorksheetRangeEdgeFlags;
  }

  const isInRange =
    position.rowIndex >= range.startRowIndex &&
    position.rowIndex <= range.endRowIndex &&
    position.columnIndex >= range.startColumnIndex &&
    position.columnIndex <= range.endColumnIndex;

  return {
    isInRange,
    isTopEdge: isInRange && position.rowIndex === range.startRowIndex,
    isBottomEdge: isInRange && position.rowIndex === range.endRowIndex,
    isLeftEdge: isInRange && position.columnIndex === range.startColumnIndex,
    isRightEdge: isInRange && position.columnIndex === range.endColumnIndex,
  } satisfies WorksheetRangeEdgeFlags;
}

export function buildWorksheetTsvFromRange(
  worksheet: WorksheetData,
  range: WorksheetSelectionRange
) {
  const lines: string[] = [];

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    const row = worksheet.rows[rowIndex];
    const values: string[] = [];

    for (
      let columnIndex = range.startColumnIndex;
      columnIndex <= range.endColumnIndex;
      columnIndex += 1
    ) {
      const column = worksheet.columns[columnIndex];

      if (!row || !column) {
        values.push("");
        continue;
      }

      const cell = worksheet.cells[`${column.id}${row.id}`];
      if (!cell) {
        values.push("");
        continue;
      }

      if (cell.formula) {
        values.push(cell.formula);
        continue;
      }

      if (typeof cell.value === "number") {
        values.push(String(cell.value));
        continue;
      }

      if (typeof cell.value === "string") {
        values.push(cell.value);
        continue;
      }

      values.push("");
    }

    lines.push(values.join("\t"));
  }

  return lines.join("\n");
}

export function moveCellKey(
  worksheet: WorksheetData,
  currentKey: string | null,
  direction: WorksheetMoveDirection
) {
  if (!currentKey) {
    return null;
  }

  const position = getCellPosition(worksheet, currentKey);
  if (!position) {
    return null;
  }

  const nextPosition = {
    rowIndex:
      direction === "up"
        ? position.rowIndex - 1
        : direction === "down"
        ? position.rowIndex + 1
        : position.rowIndex,
    columnIndex:
      direction === "left"
        ? position.columnIndex - 1
        : direction === "right"
        ? position.columnIndex + 1
        : position.columnIndex,
  };

  if (
    nextPosition.rowIndex < 0 ||
    nextPosition.columnIndex < 0 ||
    nextPosition.rowIndex >= worksheet.rowCount ||
    nextPosition.columnIndex >= worksheet.columnCount
  ) {
    return currentKey;
  }

  return buildCellKeyAtPosition(worksheet, nextPosition) ?? currentKey;
}

export function extendRangeFromAnchor(
  worksheet: WorksheetData,
  anchorKey: string | null,
  focusKey: string | null,
  direction: WorksheetMoveDirection
) {
  const startingKey = focusKey ?? anchorKey;
  return moveCellKey(worksheet, startingKey, direction);
}
