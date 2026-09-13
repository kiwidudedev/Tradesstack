import {
  type WorksheetCell,
  type WorksheetColumn,
  type WorksheetData,
  type WorksheetRow,
} from "@/lib/opportunity-pricing-worksheet-defaults";

export interface ParsedWorksheetPaste {
  rows: string[][];
  rowCount: number;
  columnCount: number;
  isTabular: boolean;
}

function columnLabelFromIndex(index: number) {
  let current = index;
  let label = "";

  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return label;
}

export function buildWorksheetCellKey(columnId: string, rowId: string) {
  return `${columnId}${rowId}`;
}

export function parseWorksheetCellKey(cellKey: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(cellKey);
  if (!match) {
    return null;
  }

  return {
    columnId: match[1],
    rowId: match[2],
  };
}

export function parseWorksheetClipboardText(input: string): ParsedWorksheetPaste | null {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");

  if (normalized.length === 0) {
    return null;
  }

  const isTabular = normalized.includes("\t") || normalized.includes("\n");

  const rows = normalized.split("\n").map((row) => row.split("\t"));
  const rowCount = rows.length;
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  return {
    rows,
    rowCount,
    columnCount,
    isTabular,
  };
}

export function getWorksheetAnchorPosition(worksheet: WorksheetData, cellKey: string) {
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

export function expandWorksheetToFitPaste(
  worksheet: WorksheetData,
  anchor: { columnIndex: number; rowIndex: number },
  paste: ParsedWorksheetPaste
) {
  const requiredColumnCount = Math.max(
    worksheet.columnCount,
    anchor.columnIndex + paste.columnCount
  );
  const requiredRowCount = Math.max(
    worksheet.rowCount,
    anchor.rowIndex + paste.rowCount
  );

  const columns: WorksheetColumn[] =
    requiredColumnCount === worksheet.columnCount
      ? worksheet.columns
      : Array.from({ length: requiredColumnCount }, (_, index) => {
          const existing = worksheet.columns[index];
          return (
            existing ?? {
              id: columnLabelFromIndex(index),
              index,
              label: columnLabelFromIndex(index),
              width: 140,
            }
          );
        });

  const rows: WorksheetRow[] =
    requiredRowCount === worksheet.rowCount
      ? worksheet.rows
      : Array.from({ length: requiredRowCount }, (_, index) => {
          const existing = worksheet.rows[index];
          return (
            existing ?? {
              id: String(index + 1),
              index,
              height: 36,
            }
          );
        });

  return {
    ...worksheet,
    columnCount: requiredColumnCount,
    rowCount: requiredRowCount,
    columns,
    rows,
  };
}

export function applyWorksheetPasteToCells(
  worksheet: WorksheetData,
  anchor: { columnIndex: number; rowIndex: number },
  paste: ParsedWorksheetPaste,
  normalizeCell: (input: string) => WorksheetCell
) {
  const nextCells = { ...worksheet.cells };

  paste.rows.forEach((rowValues, rowOffset) => {
    rowValues.forEach((rawValue, columnOffset) => {
      const column = worksheet.columns[anchor.columnIndex + columnOffset];
      const row = worksheet.rows[anchor.rowIndex + rowOffset];

      if (!column || !row) {
        return;
      }

      const cellKey = buildWorksheetCellKey(column.id, row.id);
      const normalizedCell = normalizeCell(rawValue);

      if (normalizedCell.type === "empty") {
        delete nextCells[cellKey];
      } else {
        nextCells[cellKey] = normalizedCell;
      }
    });
  });

  return {
    ...worksheet,
    cells: nextCells,
  };
}
