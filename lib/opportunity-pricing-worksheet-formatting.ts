import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";

export type WorksheetTextAlign = "left" | "center" | "right";

export interface WorksheetCellBorderStyle {
  color?: string;
  style?: "solid";
}

export interface WorksheetCellFormat {
  text?: {
    bold?: boolean;
    color?: string;
    align?: WorksheetTextAlign;
  };
  fill?: {
    color?: string;
  };
  border?: {
    top?: WorksheetCellBorderStyle;
    right?: WorksheetCellBorderStyle;
    bottom?: WorksheetCellBorderStyle;
    left?: WorksheetCellBorderStyle;
  };
}

export type WorksheetCellFormatPatch = WorksheetCellFormat;
export type WorksheetBorderMode = "all" | "outer" | "clear";

const DEFAULT_BORDER: WorksheetCellBorderStyle = {
  color: "#94A3B8",
  style: "solid",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyBorderStyle(value: WorksheetCellBorderStyle | undefined) {
  return !value || (!value.color && !value.style);
}

function isEmptyFormat(format: WorksheetCellFormat | undefined) {
  if (!format) {
    return true;
  }

  const hasText =
    Boolean(format.text) &&
    (format.text?.bold !== undefined ||
      Boolean(format.text?.color) ||
      Boolean(format.text?.align));
  const hasFill = Boolean(format.fill?.color);
  const hasBorder =
    Boolean(format.border) &&
    !(
      isEmptyBorderStyle(format.border?.top) &&
      isEmptyBorderStyle(format.border?.right) &&
      isEmptyBorderStyle(format.border?.bottom) &&
      isEmptyBorderStyle(format.border?.left)
    );

  return !hasText && !hasFill && !hasBorder;
}

function cloneFormat(format: WorksheetCellFormat | undefined): WorksheetCellFormat {
  return format ? JSON.parse(JSON.stringify(format)) as WorksheetCellFormat : {};
}

function ensureEditableCell(cell: WorksheetCell | undefined): WorksheetCell {
  if (cell) {
    return {
      ...cell,
      metadata: {
        ...cell.metadata,
      },
    };
  }

  return {
    value: null,
    type: "empty",
    formula: null,
    computedValue: null,
    displayValue: "",
    metadata: {},
  };
}

function setCellFormat(cell: WorksheetCell, format: WorksheetCellFormat | undefined) {
  const nextMetadata = {
    ...cell.metadata,
  } as Record<string, unknown>;

  if (!format || isEmptyFormat(format)) {
    delete nextMetadata.format;
  } else {
    nextMetadata.format = format;
  }

  return {
    ...cell,
    metadata: nextMetadata,
  };
}

export function hasCellFormatting(cell: WorksheetCell | undefined) {
  return !isEmptyFormat(getCellFormat(cell));
}

export function getCellFormat(cell: WorksheetCell | undefined): WorksheetCellFormat {
  const rawFormat = cell?.metadata?.format;
  if (!isObject(rawFormat)) {
    return {};
  }

  const text = isObject(rawFormat.text)
    ? {
        bold: typeof rawFormat.text.bold === "boolean" ? rawFormat.text.bold : undefined,
        color: typeof rawFormat.text.color === "string" ? rawFormat.text.color : undefined,
        align:
          rawFormat.text.align === "left" ||
          rawFormat.text.align === "center" ||
          rawFormat.text.align === "right"
            ? rawFormat.text.align
            : undefined,
      }
    : undefined;

  const fill = isObject(rawFormat.fill)
    ? {
        color: typeof rawFormat.fill.color === "string" ? rawFormat.fill.color : undefined,
      }
    : undefined;

  const border = isObject(rawFormat.border)
    ? {
        top: isObject(rawFormat.border.top)
          ? {
              color:
                typeof rawFormat.border.top.color === "string"
                  ? rawFormat.border.top.color
                  : undefined,
              style: rawFormat.border.top.style === "solid" ? "solid" : undefined,
            }
          : undefined,
        right: isObject(rawFormat.border.right)
          ? {
              color:
                typeof rawFormat.border.right.color === "string"
                  ? rawFormat.border.right.color
                  : undefined,
              style: rawFormat.border.right.style === "solid" ? "solid" : undefined,
            }
          : undefined,
        bottom: isObject(rawFormat.border.bottom)
          ? {
              color:
                typeof rawFormat.border.bottom.color === "string"
                  ? rawFormat.border.bottom.color
                  : undefined,
              style: rawFormat.border.bottom.style === "solid" ? "solid" : undefined,
            }
          : undefined,
        left: isObject(rawFormat.border.left)
          ? {
              color:
                typeof rawFormat.border.left.color === "string"
                  ? rawFormat.border.left.color
                  : undefined,
              style: rawFormat.border.left.style === "solid" ? "solid" : undefined,
            }
          : undefined,
      }
    : undefined;

  return {
    text,
    fill,
    border,
  };
}

export function mergeCellFormat(
  existing: WorksheetCellFormat | undefined,
  patch: WorksheetCellFormatPatch
) {
  const next = cloneFormat(existing);

  if (patch.text) {
    next.text = {
      ...(next.text ?? {}),
      ...patch.text,
    };
  }

  if (patch.fill) {
    next.fill = {
      ...(next.fill ?? {}),
      ...patch.fill,
    };
  }

  if (patch.border) {
    next.border = {
      ...(next.border ?? {}),
      ...(patch.border.top !== undefined ? { top: patch.border.top } : {}),
      ...(patch.border.right !== undefined ? { right: patch.border.right } : {}),
      ...(patch.border.bottom !== undefined ? { bottom: patch.border.bottom } : {}),
      ...(patch.border.left !== undefined ? { left: patch.border.left } : {}),
    };
  }

  if (next.text && isEmptyFormat({ text: next.text })) {
    delete next.text;
  }
  if (next.fill && !next.fill.color) {
    delete next.fill;
  }
  if (
    next.border &&
    isEmptyBorderStyle(next.border.top) &&
    isEmptyBorderStyle(next.border.right) &&
    isEmptyBorderStyle(next.border.bottom) &&
    isEmptyBorderStyle(next.border.left)
  ) {
    delete next.border;
  }

  return next;
}

export function clearCellFill(format: WorksheetCellFormat | undefined) {
  const next = cloneFormat(format);
  delete next.fill;
  return next;
}

export function clearCellBorders(format: WorksheetCellFormat | undefined) {
  const next = cloneFormat(format);
  delete next.border;
  return next;
}

export function applyFormattingToRange(
  worksheet: WorksheetData,
  range: WorksheetSelectionRange,
  patch: WorksheetCellFormatPatch | ((format: WorksheetCellFormat) => WorksheetCellFormat)
) {
  const nextCells = { ...worksheet.cells };

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      const row = worksheet.rows[rowIndex];
      const column = worksheet.columns[columnIndex];
      if (!row || !column) {
        continue;
      }

      const cellKey = buildWorksheetCellKey(column.id, row.id);
      const existingCell = worksheet.cells[cellKey];
      const workingCell = ensureEditableCell(existingCell);
      const currentFormat = getCellFormat(existingCell);
      const nextFormat =
        typeof patch === "function" ? patch(currentFormat) : mergeCellFormat(currentFormat, patch);

      nextCells[cellKey] = setCellFormat(workingCell, nextFormat);
    }
  }

  return {
    ...worksheet,
    cells: nextCells,
  };
}

export function applyBordersToRange(
  worksheet: WorksheetData,
  range: WorksheetSelectionRange,
  mode: WorksheetBorderMode
) {
  const nextCells = { ...worksheet.cells };

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      const row = worksheet.rows[rowIndex];
      const column = worksheet.columns[columnIndex];
      if (!row || !column) {
        continue;
      }

      const cellKey = buildWorksheetCellKey(column.id, row.id);
      const existingCell = worksheet.cells[cellKey];
      const workingCell = ensureEditableCell(existingCell);
      const currentFormat = getCellFormat(existingCell);

      let nextFormat: WorksheetCellFormat;
      if (mode === "clear") {
        nextFormat = clearCellBorders(currentFormat);
      } else if (mode === "all") {
        nextFormat = mergeCellFormat(currentFormat, {
          border: {
            top: DEFAULT_BORDER,
            right: DEFAULT_BORDER,
            bottom: DEFAULT_BORDER,
            left: DEFAULT_BORDER,
          },
        });
      } else {
        nextFormat = mergeCellFormat(currentFormat, {
          border: {
            top: rowIndex === range.startRowIndex ? DEFAULT_BORDER : undefined,
            right: columnIndex === range.endColumnIndex ? DEFAULT_BORDER : undefined,
            bottom: rowIndex === range.endRowIndex ? DEFAULT_BORDER : undefined,
            left: columnIndex === range.startColumnIndex ? DEFAULT_BORDER : undefined,
          },
        });

        nextFormat.border = {
          top: rowIndex === range.startRowIndex ? DEFAULT_BORDER : undefined,
          right: columnIndex === range.endColumnIndex ? DEFAULT_BORDER : undefined,
          bottom: rowIndex === range.endRowIndex ? DEFAULT_BORDER : undefined,
          left: columnIndex === range.startColumnIndex ? DEFAULT_BORDER : undefined,
        };
      }

      nextCells[cellKey] = setCellFormat(workingCell, nextFormat);
    }
  }

  return {
    ...worksheet,
    cells: nextCells,
  };
}
