import type {
  WorksheetCell,
  WorksheetColumn,
  WorksheetData,
  WorksheetRow,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey, parseWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";

const DEFAULT_COLUMN_WIDTH = 140;
const DEFAULT_ROW_HEIGHT = 36;
const FORMULA_REF_ERROR = "#REF!";

function columnLabelFromIndex(index: number) {
  let current = index;
  let label = "";

  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return label;
}

function columnLabelToIndex(label: string) {
  let index = 0;

  for (let cursor = 0; cursor < label.length; cursor += 1) {
    index = index * 26 + (label.charCodeAt(cursor) - 64);
  }

  return index - 1;
}

function cloneCell(cell: WorksheetCell): WorksheetCell {
  return {
    ...cell,
    metadata: {
      ...cell.metadata,
    },
  };
}

function parseFormulaReference(reference: string) {
  const match = /^(\$?)([A-Z]+)(\$?)([1-9]\d*)$/i.exec(reference);
  if (!match) {
    return null;
  }

  const columnLabel = match[2].toUpperCase();

  return {
    isColumnAbsolute: match[1] === "$",
    isRowAbsolute: match[3] === "$",
    columnIndex: columnLabelToIndex(columnLabel),
    rowIndex: Number(match[4]) - 1,
  };
}

function buildFormulaReference(
  reference: {
    isColumnAbsolute: boolean;
    isRowAbsolute: boolean;
    columnIndex: number;
    rowIndex: number;
  }
) {
  return `${reference.isColumnAbsolute ? "$" : ""}${columnLabelFromIndex(reference.columnIndex)}${reference.isRowAbsolute ? "$" : ""}${reference.rowIndex + 1}`;
}

function isReferenceBoundaryCharacter(character: string | undefined) {
  if (!character) {
    return true;
  }

  return !/[A-Za-z0-9_$]/.test(character);
}

function shiftReferenceForInsert(
  reference: string,
  insert: { type: "row" | "column"; index: number }
) {
  const parsed = parseFormulaReference(reference);
  if (!parsed) {
    return reference;
  }

  const nextReference = { ...parsed };

  if (insert.type === "row" && parsed.rowIndex >= insert.index) {
    nextReference.rowIndex += 1;
  }

  if (insert.type === "column" && parsed.columnIndex >= insert.index) {
    nextReference.columnIndex += 1;
  }

  return buildFormulaReference(nextReference);
}

function shiftReferenceForDelete(
  reference: string,
  deletion: { type: "row" | "column"; index: number; count: number }
) {
  const parsed = parseFormulaReference(reference);
  if (!parsed) {
    return reference;
  }

  const deletedStartIndex = deletion.index;
  const deletedEndIndex = deletion.index + deletion.count - 1;
  const nextReference = { ...parsed };

  if (deletion.type === "row") {
    if (parsed.rowIndex >= deletedStartIndex && parsed.rowIndex <= deletedEndIndex) {
      return FORMULA_REF_ERROR;
    }

    if (parsed.rowIndex > deletedEndIndex) {
      nextReference.rowIndex -= deletion.count;
    }
  }

  if (deletion.type === "column") {
    if (parsed.columnIndex >= deletedStartIndex && parsed.columnIndex <= deletedEndIndex) {
      return FORMULA_REF_ERROR;
    }

    if (parsed.columnIndex > deletedEndIndex) {
      nextReference.columnIndex -= deletion.count;
    }
  }

  return buildFormulaReference(nextReference);
}

export function updateFormulaReferencesForStructuralInsert(
  formula: string,
  insert: { type: "row" | "column"; index: number }
) {
  if (!formula.startsWith("=")) {
    return formula;
  }

  let result = "";
  let cursor = 0;
  const pattern = /(\$?[A-Z]+\$?[1-9]\d*)(:(\$?[A-Z]+\$?[1-9]\d*))?/gi;

  for (const match of formula.matchAll(pattern)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) {
      continue;
    }

    const previousCharacter = formula[matchIndex - 1];
    const nextCharacter = formula[matchIndex + matchedText.length];
    if (
      !isReferenceBoundaryCharacter(previousCharacter) ||
      !isReferenceBoundaryCharacter(nextCharacter)
    ) {
      continue;
    }

    result += formula.slice(cursor, matchIndex);

    if (match[3]) {
      const shiftedStart = shiftReferenceForInsert(match[1], insert);
      const shiftedEnd = shiftReferenceForInsert(match[3], insert);
      result += `${shiftedStart}:${shiftedEnd}`;
    } else {
      result += shiftReferenceForInsert(match[1], insert);
    }

    cursor = matchIndex + matchedText.length;
  }

  if (cursor === 0) {
    return formula;
  }

  result += formula.slice(cursor);
  return result;
}

export function updateFormulaReferencesForStructuralDelete(
  formula: string,
  deletion: { type: "row" | "column"; index: number; count: number }
) {
  if (!formula.startsWith("=") || deletion.count <= 0) {
    return formula;
  }

  let result = "";
  let cursor = 0;
  const pattern = /(\$?[A-Z]+\$?[1-9]\d*)(:(\$?[A-Z]+\$?[1-9]\d*))?/gi;

  for (const match of formula.matchAll(pattern)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) {
      continue;
    }

    const previousCharacter = formula[matchIndex - 1];
    const nextCharacter = formula[matchIndex + matchedText.length];
    if (
      !isReferenceBoundaryCharacter(previousCharacter) ||
      !isReferenceBoundaryCharacter(nextCharacter)
    ) {
      continue;
    }

    result += formula.slice(cursor, matchIndex);

    if (match[3]) {
      const shiftedStart = shiftReferenceForDelete(match[1], deletion);
      const shiftedEnd = shiftReferenceForDelete(match[3], deletion);
      result += shiftedStart === FORMULA_REF_ERROR || shiftedEnd === FORMULA_REF_ERROR
        ? FORMULA_REF_ERROR
        : `${shiftedStart}:${shiftedEnd}`;
    } else {
      result += shiftReferenceForDelete(match[1], deletion);
    }

    cursor = matchIndex + matchedText.length;
  }

  if (cursor === 0) {
    return formula;
  }

  result += formula.slice(cursor);
  return result;
}

function updateCellFormulaForInsert(
  cell: WorksheetCell,
  insert: { type: "row" | "column"; index: number }
) {
  const nextCell = cloneCell(cell);
  if (!nextCell.formula) {
    return nextCell;
  }

  const nextFormula = updateFormulaReferencesForStructuralInsert(nextCell.formula, insert);
  nextCell.formula = nextFormula;
  nextCell.value = nextFormula;
  return nextCell;
}

function updateCellFormulaForDelete(
  cell: WorksheetCell,
  deletion: { type: "row" | "column"; index: number; count: number }
) {
  const nextCell = cloneCell(cell);
  if (!nextCell.formula) {
    return nextCell;
  }

  const nextFormula = updateFormulaReferencesForStructuralDelete(nextCell.formula, deletion);
  nextCell.formula = nextFormula;
  nextCell.value = nextFormula;
  return nextCell;
}

export function insertWorksheetRow(
  worksheet: WorksheetData,
  insertRowIndex: number
): WorksheetData {
  const boundedInsertIndex = Math.max(0, Math.min(worksheet.rowCount, insertRowIndex));
  const nextRowCount = worksheet.rowCount + 1;
  const rows: WorksheetRow[] = Array.from({ length: nextRowCount }, (_, index) => {
    if (index === boundedInsertIndex) {
      return {
        id: String(index + 1),
        index,
        height: DEFAULT_ROW_HEIGHT,
      };
    }

    const sourceRow = worksheet.rows[index < boundedInsertIndex ? index : index - 1];
    return {
      id: String(index + 1),
      index,
      height: sourceRow?.height ?? DEFAULT_ROW_HEIGHT,
    };
  });

  const cells: Record<string, WorksheetCell | undefined> = {};

  Object.entries(worksheet.cells).forEach(([cellKey, cell]) => {
    if (!cell) {
      return;
    }

    const parsed = parseWorksheetCellKey(cellKey);
    if (!parsed) {
      return;
    }

    const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
    const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);
    if (columnIndex < 0 || rowIndex < 0) {
      return;
    }

    const nextRowIndex = rowIndex >= boundedInsertIndex ? rowIndex + 1 : rowIndex;
    const nextColumn = worksheet.columns[columnIndex];
    const nextRow = rows[nextRowIndex];
    if (!nextColumn || !nextRow) {
      return;
    }

    cells[buildWorksheetCellKey(nextColumn.id, nextRow.id)] = updateCellFormulaForInsert(cell, {
      type: "row",
      index: boundedInsertIndex,
    });
  });

  return {
    ...worksheet,
    rowCount: nextRowCount,
    rows,
    cells,
  };
}

export function insertWorksheetColumn(
  worksheet: WorksheetData,
  insertColumnIndex: number
): WorksheetData {
  const boundedInsertIndex = Math.max(0, Math.min(worksheet.columnCount, insertColumnIndex));
  const nextColumnCount = worksheet.columnCount + 1;
  const columns: WorksheetColumn[] = Array.from({ length: nextColumnCount }, (_, index) => {
    const label = columnLabelFromIndex(index);

    if (index === boundedInsertIndex) {
      return {
        id: label,
        index,
        label,
        width: DEFAULT_COLUMN_WIDTH,
      };
    }

    const sourceColumn = worksheet.columns[index < boundedInsertIndex ? index : index - 1];
    return {
      id: label,
      index,
      label,
      width: sourceColumn?.width ?? DEFAULT_COLUMN_WIDTH,
    };
  });

  const cells: Record<string, WorksheetCell | undefined> = {};

  Object.entries(worksheet.cells).forEach(([cellKey, cell]) => {
    if (!cell) {
      return;
    }

    const parsed = parseWorksheetCellKey(cellKey);
    if (!parsed) {
      return;
    }

    const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
    const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);
    if (columnIndex < 0 || rowIndex < 0) {
      return;
    }

    const nextColumnIndex = columnIndex >= boundedInsertIndex ? columnIndex + 1 : columnIndex;
    const nextColumn = columns[nextColumnIndex];
    const nextRow = worksheet.rows[rowIndex];
    if (!nextColumn || !nextRow) {
      return;
    }

    cells[buildWorksheetCellKey(nextColumn.id, nextRow.id)] = updateCellFormulaForInsert(cell, {
      type: "column",
      index: boundedInsertIndex,
    });
  });

  return {
    ...worksheet,
    columnCount: nextColumnCount,
    columns,
    cells,
  };
}

export function deleteWorksheetRows(
  worksheet: WorksheetData,
  startRowIndex: number,
  endRowIndex = startRowIndex
): WorksheetData {
  if (worksheet.rowCount <= 1) {
    return worksheet;
  }

  const requestedStartIndex = Math.min(startRowIndex, endRowIndex);
  const requestedEndIndex = Math.max(startRowIndex, endRowIndex);
  const boundedStartIndex = Math.max(0, Math.min(worksheet.rowCount - 1, requestedStartIndex));
  const boundedEndIndex = Math.max(
    boundedStartIndex,
    Math.min(worksheet.rowCount - 1, requestedEndIndex)
  );
  const deleteCount = boundedEndIndex - boundedStartIndex + 1;
  if (deleteCount >= worksheet.rowCount) {
    return worksheet;
  }

  const nextRowCount = worksheet.rowCount - deleteCount;
  const rows: WorksheetRow[] = [];

  worksheet.rows.forEach((row, rowIndex) => {
    if (rowIndex >= boundedStartIndex && rowIndex <= boundedEndIndex) {
      return;
    }

    const nextIndex = rows.length;
    rows.push({
      id: String(nextIndex + 1),
      index: nextIndex,
      height: row.height ?? DEFAULT_ROW_HEIGHT,
    });
  });

  const cells: Record<string, WorksheetCell | undefined> = {};

  Object.entries(worksheet.cells).forEach(([cellKey, cell]) => {
    if (!cell) {
      return;
    }

    const parsed = parseWorksheetCellKey(cellKey);
    if (!parsed) {
      return;
    }

    const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
    const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);
    if (columnIndex < 0 || rowIndex < 0) {
      return;
    }

    if (rowIndex >= boundedStartIndex && rowIndex <= boundedEndIndex) {
      return;
    }

    const nextRowIndex = rowIndex > boundedEndIndex ? rowIndex - deleteCount : rowIndex;
    const nextColumn = worksheet.columns[columnIndex];
    const nextRow = rows[nextRowIndex];
    if (!nextColumn || !nextRow) {
      return;
    }

    cells[buildWorksheetCellKey(nextColumn.id, nextRow.id)] = updateCellFormulaForDelete(cell, {
      type: "row",
      index: boundedStartIndex,
      count: deleteCount,
    });
  });

  return {
    ...worksheet,
    rowCount: nextRowCount,
    rows,
    cells,
  };
}

export function deleteWorksheetColumns(
  worksheet: WorksheetData,
  startColumnIndex: number,
  endColumnIndex = startColumnIndex
): WorksheetData {
  if (worksheet.columnCount <= 1) {
    return worksheet;
  }

  const requestedStartIndex = Math.min(startColumnIndex, endColumnIndex);
  const requestedEndIndex = Math.max(startColumnIndex, endColumnIndex);
  const boundedStartIndex = Math.max(0, Math.min(worksheet.columnCount - 1, requestedStartIndex));
  const boundedEndIndex = Math.max(
    boundedStartIndex,
    Math.min(worksheet.columnCount - 1, requestedEndIndex)
  );
  const deleteCount = boundedEndIndex - boundedStartIndex + 1;
  if (deleteCount >= worksheet.columnCount) {
    return worksheet;
  }

  const nextColumnCount = worksheet.columnCount - deleteCount;
  const columns: WorksheetColumn[] = [];

  worksheet.columns.forEach((column, columnIndex) => {
    if (columnIndex >= boundedStartIndex && columnIndex <= boundedEndIndex) {
      return;
    }

    const nextIndex = columns.length;
    const label = columnLabelFromIndex(nextIndex);
    columns.push({
      id: label,
      index: nextIndex,
      label,
      width: column.width ?? DEFAULT_COLUMN_WIDTH,
    });
  });

  const cells: Record<string, WorksheetCell | undefined> = {};

  Object.entries(worksheet.cells).forEach(([cellKey, cell]) => {
    if (!cell) {
      return;
    }

    const parsed = parseWorksheetCellKey(cellKey);
    if (!parsed) {
      return;
    }

    const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
    const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);
    if (columnIndex < 0 || rowIndex < 0) {
      return;
    }

    if (columnIndex >= boundedStartIndex && columnIndex <= boundedEndIndex) {
      return;
    }

    const nextColumnIndex = columnIndex > boundedEndIndex ? columnIndex - deleteCount : columnIndex;
    const nextColumn = columns[nextColumnIndex];
    const nextRow = worksheet.rows[rowIndex];
    if (!nextColumn || !nextRow) {
      return;
    }

    cells[buildWorksheetCellKey(nextColumn.id, nextRow.id)] = updateCellFormulaForDelete(cell, {
      type: "column",
      index: boundedStartIndex,
      count: deleteCount,
    });
  });

  return {
    ...worksheet,
    columnCount: nextColumnCount,
    columns,
    cells,
  };
}
