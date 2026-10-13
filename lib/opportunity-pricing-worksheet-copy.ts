import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { parseWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import { getCellFormat } from "@/lib/opportunity-pricing-worksheet-formatting";

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

function escapeWorksheetHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildWorksheetCellHtmlStyle(cell: WorksheetData["cells"][string] | undefined) {
  const format = getCellFormat(cell);
  const styles: string[] = [];
  const text = format.text;

  if (text?.bold) styles.push("font-weight:bold");
  if (text?.italic) styles.push("font-style:italic");
  const decorations = [
    text?.underline ? "underline" : "",
    text?.strikethrough ? "line-through" : "",
  ].filter(Boolean);
  if (decorations.length > 0) styles.push(`text-decoration:${decorations.join(" ")}`);
  if (typeof text?.fontSize === "number") styles.push(`font-size:${text.fontSize}px`);
  if (text?.color) styles.push(`color:${text.color}`);
  if (text?.align) styles.push(`text-align:${text.align}`);
  if (text?.wrap === "wrap") styles.push("white-space:normal");
  if (text?.wrap === "clip") styles.push("white-space:nowrap;overflow:hidden");
  if (format.fill?.color) styles.push(`background-color:${format.fill.color}`);

  for (const [side, border] of Object.entries(format.border ?? {})) {
    if (!border) continue;
    styles.push(`border-${side}:1px solid ${border.color ?? "#94A3B8"}`);
  }

  return styles.join(";");
}

/** Build the style-preserving HTML clipboard representation used by Excel. */
export function buildWorksheetHtmlFromRange(
  worksheet: WorksheetData,
  range: WorksheetSelectionRange,
) {
  const rows: string[] = [];

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    const row = worksheet.rows[rowIndex];
    const cells: string[] = [];

    for (
      let columnIndex = range.startColumnIndex;
      columnIndex <= range.endColumnIndex;
      columnIndex += 1
    ) {
      const column = worksheet.columns[columnIndex];
      const cell = row && column ? worksheet.cells[`${column.id}${row.id}`] : undefined;
      const value = cell?.formula ?? (cell?.value === null || cell?.value === undefined ? "" : String(cell.value));
      const style = buildWorksheetCellHtmlStyle(cell);
      const styleAttribute = style ? ` style="${escapeWorksheetHtml(style)}"` : "";
      cells.push(`<td${styleAttribute}>${escapeWorksheetHtml(value)}</td>`);
    }

    rows.push(`<tr>${cells.join("")}</tr>`);
  }

  return `<table><tbody>${rows.join("")}</tbody></table>`;
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
