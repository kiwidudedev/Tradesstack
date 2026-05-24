import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import { FORMULA_ERROR_STRINGS } from "@/lib/opportunity-pricing-worksheet-formulas";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import type { Json } from "@/lib/supabase/types";

export type WorksheetTextAlign = "left" | "center" | "right";
export type WorksheetNumberFormatKind = "general" | "number" | "currency" | "percent";
export type WorksheetNegativeNumberStyle = "minus" | "parentheses";

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
  number?: {
    kind?: WorksheetNumberFormatKind;
    decimalPlaces?: number;
    negativeStyle?: WorksheetNegativeNumberStyle;
    currencyCode?: "NZD";
    useGrouping?: boolean;
  };
}

export type WorksheetCellFormatPatch = WorksheetCellFormat;
export type WorksheetBorderMode = "all" | "outer" | "clear";

const DEFAULT_BORDER: WorksheetCellBorderStyle = {
  color: "#94A3B8",
  style: "solid",
};
const MAX_DECIMAL_PLACES = 6;
const numberFormatterCache = new Map<string, Intl.NumberFormat>();

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
  const hasNumber =
    Boolean(format.number) &&
    (Boolean(format.number?.kind) ||
      typeof format.number?.decimalPlaces === "number" ||
      Boolean(format.number?.negativeStyle) ||
      Boolean(format.number?.currencyCode) ||
      typeof format.number?.useGrouping === "boolean");

  return !hasText && !hasFill && !hasBorder && !hasNumber;
}

function cloneFormat(format: WorksheetCellFormat | undefined): WorksheetCellFormat {
  return format ? JSON.parse(JSON.stringify(format)) as WorksheetCellFormat : {};
}

function normalizeNumberFormat(
  numberFormat: WorksheetCellFormat["number"]
): WorksheetCellFormat["number"] | undefined {
  if (!numberFormat) {
    return undefined;
  }

  const kind = numberFormat.kind;
  const normalizedKind = kind ?? "general";
  const normalized: NonNullable<WorksheetCellFormat["number"]> = {};

  if (kind) {
    normalized.kind = kind;
  }

  if (typeof numberFormat.decimalPlaces === "number") {
    const clampedDecimalPlaces = Math.max(
      0,
      Math.min(MAX_DECIMAL_PLACES, Math.round(numberFormat.decimalPlaces))
    );
    const defaultDecimalPlaces =
      normalizedKind === "currency" ? 2 : normalizedKind === "number" ? 2 : 0;
    if (
      !(normalizedKind !== "general" && clampedDecimalPlaces === defaultDecimalPlaces)
    ) {
      normalized.decimalPlaces = clampedDecimalPlaces;
    }
  }

  if (numberFormat.negativeStyle && numberFormat.negativeStyle !== "minus") {
    normalized.negativeStyle = numberFormat.negativeStyle;
  }

  if (normalizedKind === "currency") {
    if (numberFormat.currencyCode && numberFormat.currencyCode !== "NZD") {
      normalized.currencyCode = numberFormat.currencyCode;
    }
  }

  if (typeof numberFormat.useGrouping === "boolean") {
    const defaultUseGrouping = normalizedKind !== "general";
    if (numberFormat.useGrouping !== defaultUseGrouping) {
      normalized.useGrouping = numberFormat.useGrouping;
    }
  }

  return isEmptyFormat({ number: normalized }) ? undefined : normalized;
}

function normalizeCellFormat(format: WorksheetCellFormat | undefined): WorksheetCellFormat | undefined {
  if (!format) {
    return undefined;
  }

  const normalized: WorksheetCellFormat = {
    ...(format.text ? { text: { ...format.text } } : {}),
    ...(format.fill ? { fill: { ...format.fill } } : {}),
    ...(format.border ? { border: { ...format.border } } : {}),
    ...(format.number ? { number: normalizeNumberFormat(format.number) } : {}),
  };

  if (normalized.text && isEmptyFormat({ text: normalized.text })) {
    delete normalized.text;
  }
  if (normalized.fill && !normalized.fill.color) {
    delete normalized.fill;
  }
  if (
    normalized.border &&
    isEmptyBorderStyle(normalized.border.top) &&
    isEmptyBorderStyle(normalized.border.right) &&
    isEmptyBorderStyle(normalized.border.bottom) &&
    isEmptyBorderStyle(normalized.border.left)
  ) {
    delete normalized.border;
  }
  if (normalized.number && isEmptyFormat({ number: normalized.number })) {
    delete normalized.number;
  }

  return isEmptyFormat(normalized) ? undefined : normalized;
}

function normalizeCellForComparison(cell: WorksheetCell | undefined) {
  if (!cell) {
    return null;
  }

  const nextMetadata = {
    ...cell.metadata,
  } as Record<string, Json | undefined>;
  const normalizedFormat = normalizeCellFormat(getCellFormat(cell));

  if (!normalizedFormat) {
    delete nextMetadata.format;
  } else {
    nextMetadata.format = normalizedFormat as unknown as Json;
  }

  if (Object.keys(nextMetadata).length === 0) {
    return {
      ...cell,
      metadata: {},
    };
  }

  return {
    ...cell,
    metadata: nextMetadata,
  };
}

function areCellsFormatEquivalent(existingCell: WorksheetCell | undefined, nextCell: WorksheetCell) {
  return (
    JSON.stringify(normalizeCellForComparison(existingCell)) ===
    JSON.stringify(normalizeCellForComparison(nextCell))
  );
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
  } as Record<string, Json | undefined>;
  const normalizedFormat = normalizeCellFormat(format);

  if (!normalizedFormat) {
    delete nextMetadata.format;
  } else {
    nextMetadata.format = normalizedFormat as unknown as Json;
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

  const text: WorksheetCellFormat["text"] = isObject(rawFormat.text)
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

  const fill: WorksheetCellFormat["fill"] = isObject(rawFormat.fill)
    ? {
        color: typeof rawFormat.fill.color === "string" ? rawFormat.fill.color : undefined,
      }
    : undefined;

  const border: WorksheetCellFormat["border"] = isObject(rawFormat.border)
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
  const number: WorksheetCellFormat["number"] = isObject(rawFormat.number)
    ? {
        kind:
          rawFormat.number.kind === "general" ||
          rawFormat.number.kind === "number" ||
          rawFormat.number.kind === "currency" ||
          rawFormat.number.kind === "percent"
            ? rawFormat.number.kind
            : undefined,
        decimalPlaces:
          typeof rawFormat.number.decimalPlaces === "number" && Number.isFinite(rawFormat.number.decimalPlaces)
            ? Math.max(0, Math.min(MAX_DECIMAL_PLACES, Math.round(rawFormat.number.decimalPlaces)))
            : undefined,
        negativeStyle:
          rawFormat.number.negativeStyle === "minus" || rawFormat.number.negativeStyle === "parentheses"
            ? rawFormat.number.negativeStyle
            : undefined,
        currencyCode: rawFormat.number.currencyCode === "NZD" ? "NZD" : undefined,
        useGrouping: typeof rawFormat.number.useGrouping === "boolean" ? rawFormat.number.useGrouping : undefined,
      }
    : undefined;

  return {
    text,
    fill,
    border,
    number,
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

  if (patch.number) {
    next.number = {
      ...(next.number ?? {}),
      ...patch.number,
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
  if (next.number && isEmptyFormat({ number: next.number })) {
    delete next.number;
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

export function clearCellNumberFormat(format: WorksheetCellFormat | undefined) {
  const next = cloneFormat(format);
  delete next.number;
  return next;
}

function getNumericDisplayValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return null;
  }

  if (typeof cell.computedValue === "number" && Number.isFinite(cell.computedValue)) {
    return cell.computedValue;
  }

  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return cell.value;
  }

  return null;
}

function formatNumberWithStyle(value: number, format: NonNullable<WorksheetCellFormat["number"]>) {
  const kind = format.kind ?? "general";
  const negativeStyle = format.negativeStyle ?? "minus";
  const useGrouping = format.useGrouping ?? kind !== "general";
  const decimalPlaces =
    typeof format.decimalPlaces === "number"
      ? Math.max(0, Math.min(MAX_DECIMAL_PLACES, Math.round(format.decimalPlaces)))
      : kind === "currency"
      ? 2
      : undefined;
  const isNegative = value < 0 || Object.is(value, -0);
  const absoluteValue = Math.abs(value);
  const displayValue = kind === "percent" ? absoluteValue * 100 : absoluteValue;
  const formattedNumber =
    kind === "general" && typeof decimalPlaces !== "number"
      ? String(displayValue)
      : getCachedNumberFormatter(decimalPlaces, useGrouping).format(displayValue);

  let formatted = formattedNumber;

  if (kind === "currency") {
    formatted = `$${formatted}`;
  } else if (kind === "percent") {
    formatted = `${formatted}%`;
  }

  if (!isNegative) {
    return formatted;
  }

  return negativeStyle === "parentheses" ? `(${formatted})` : `-${formatted}`;
}

function getCachedNumberFormatter(
  decimalPlaces: number | undefined,
  useGrouping: boolean
) {
  const formatterKey = `${decimalPlaces ?? "auto"}:${useGrouping ? "group" : "plain"}`;
  const cachedFormatter = numberFormatterCache.get(formatterKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.NumberFormat("en-NZ", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
    useGrouping,
  });
  numberFormatterCache.set(formatterKey, formatter);
  return formatter;
}

export function getFormattedCellDisplayValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return "";
  }

  if (typeof cell.displayValue === "string" && FORMULA_ERROR_STRINGS.has(cell.displayValue)) {
    return cell.displayValue;
  }

  const numberFormat = getCellFormat(cell).number;
  if (!numberFormat) {
    return typeof cell.displayValue === "string" ? cell.displayValue : "";
  }

  const numericValue = getNumericDisplayValue(cell);
  if (numericValue === null) {
    return typeof cell.displayValue === "string" ? cell.displayValue : "";
  }

  return formatNumberWithStyle(numericValue, numberFormat);
}

export function applyFormattingToRange(
  worksheet: WorksheetData,
  range: WorksheetSelectionRange,
  patch: WorksheetCellFormatPatch | ((format: WorksheetCellFormat) => WorksheetCellFormat)
) {
  const nextCells = { ...worksheet.cells };
  let changed = false;

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      const row = worksheet.rows[rowIndex];
      const column = worksheet.columns[columnIndex];
      if (!row || !column) {
        continue;
      }

      const cellKey = buildWorksheetCellKey(column.id, row.id);
      const existingCell = worksheet.cells[cellKey];
      const currentFormat = getCellFormat(existingCell);
      const nextFormat =
        typeof patch === "function" ? patch(currentFormat) : mergeCellFormat(currentFormat, patch);
      const workingCell = ensureEditableCell(existingCell);
      const nextCell = setCellFormat(workingCell, nextFormat);

      if (areCellsFormatEquivalent(existingCell, nextCell)) {
        continue;
      }

      changed = true;
      nextCells[cellKey] = nextCell;
    }
  }

  if (!changed) {
    return worksheet;
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
  let changed = false;

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      const row = worksheet.rows[rowIndex];
      const column = worksheet.columns[columnIndex];
      if (!row || !column) {
        continue;
      }

      const cellKey = buildWorksheetCellKey(column.id, row.id);
      const existingCell = worksheet.cells[cellKey];
      const currentFormat = getCellFormat(existingCell);
      const workingCell = ensureEditableCell(existingCell);

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

      const nextCell = setCellFormat(workingCell, nextFormat);
      if (areCellsFormatEquivalent(existingCell, nextCell)) {
        continue;
      }

      changed = true;
      nextCells[cellKey] = nextCell;
    }
  }

  if (!changed) {
    return worksheet;
  }

  return {
    ...worksheet,
    cells: nextCells,
  };
}
