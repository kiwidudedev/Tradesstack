import type {
  WorksheetCell,
  WorksheetData,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  formatWorksheetSelectionSummaryValue,
  getCellFormat,
  type WorksheetCellFormat,
  type WorksheetNumberFormatKind,
} from "@/lib/opportunity-pricing-worksheet-formatting";
import type {
  WorksheetMultiSelectionState,
  WorksheetSelectionArea,
} from "@/lib/opportunity-pricing-worksheet-multi-selection";
import { parseWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";

type WorksheetSelectionNumberFamily = "plain" | "currency" | "percent";
type WorksheetNumberFormat = NonNullable<WorksheetCellFormat["number"]>;

export interface WorksheetSelectionAggregate {
  numericCellCount: number;
  sum: number;
  displayValue: string;
  numberFormat: WorksheetNumberFormat;
}

function getFiniteCellNumericValue(cell: WorksheetCell) {
  if (typeof cell.computedValue === "number" && Number.isFinite(cell.computedValue)) {
    return cell.computedValue;
  }

  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return cell.value;
  }

  return null;
}

function getNumberFamily(kind: WorksheetNumberFormatKind): WorksheetSelectionNumberFamily {
  if (kind === "currency") {
    return "currency";
  }
  if (kind === "percent") {
    return "percent";
  }
  return "plain";
}

function isPositionInArea(
  rowIndex: number,
  columnIndex: number,
  area: WorksheetSelectionArea,
) {
  const startRowIndex = Math.min(area.startRowIndex, area.endRowIndex);
  const endRowIndex = Math.max(area.startRowIndex, area.endRowIndex);
  const startColumnIndex = Math.min(area.startColumnIndex, area.endColumnIndex);
  const endColumnIndex = Math.max(area.startColumnIndex, area.endColumnIndex);

  return (
    rowIndex >= startRowIndex &&
    rowIndex <= endRowIndex &&
    columnIndex >= startColumnIndex &&
    columnIndex <= endColumnIndex
  );
}

function hasMultipleLogicalCells(worksheet: WorksheetData, ranges: WorksheetSelectionArea[]) {
  const singletonCells = new Set<string>();

  for (const range of ranges) {
    const startRowIndex = Math.max(0, Math.min(range.startRowIndex, range.endRowIndex));
    const endRowIndex = Math.min(worksheet.rowCount - 1, Math.max(range.startRowIndex, range.endRowIndex));
    const startColumnIndex = Math.max(0, Math.min(range.startColumnIndex, range.endColumnIndex));
    const endColumnIndex = Math.min(
      worksheet.columnCount - 1,
      Math.max(range.startColumnIndex, range.endColumnIndex),
    );

    if (startRowIndex > endRowIndex || startColumnIndex > endColumnIndex) {
      continue;
    }

    if (startRowIndex !== endRowIndex || startColumnIndex !== endColumnIndex) {
      return true;
    }

    singletonCells.add(`${startRowIndex}:${startColumnIndex}`);
    if (singletonCells.size > 1) {
      return true;
    }
  }

  return false;
}

function getCommonValue<T>(values: T[]) {
  if (values.length === 0) {
    return undefined;
  }

  const first = values[0];
  return values.every((value) => value === first) ? first : undefined;
}

function deriveCompatibleNumberFormat(formats: WorksheetNumberFormat[]) {
  const kinds = formats.map((format) => format.kind ?? "general");
  const families = new Set(kinds.map(getNumberFamily));
  if (families.size !== 1) {
    // Mixed numeric families still share canonical numeric values, but no single
    // presentation format is semantically safe. Use a neutral display format
    // rather than suppressing the otherwise valid aggregate.
    return { kind: "general" } satisfies WorksheetNumberFormat;
  }

  const family = families.values().next().value as WorksheetSelectionNumberFamily;
  const explicitDecimalPlaces = formats
    .map((format) => format.decimalPlaces)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const decimalPlaces = explicitDecimalPlaces.length > 0
    ? Math.max(...explicitDecimalPlaces)
    : undefined;
  const negativeStyle = getCommonValue(formats.map((format) => format.negativeStyle));
  const useGrouping = getCommonValue(formats.map((format) => format.useGrouping));

  if (family === "currency") {
    // getCellFormat normalizes currency codes to NZD or undefined (the NZD default).
    return {
      kind: "currency",
      ...(decimalPlaces !== undefined ? { decimalPlaces } : {}),
      ...(negativeStyle !== undefined ? { negativeStyle } : {}),
      currencyCode: "NZD",
      ...(useGrouping !== undefined ? { useGrouping } : {}),
    } satisfies WorksheetNumberFormat;
  }

  if (family === "percent") {
    return {
      kind: "percent",
      ...(decimalPlaces !== undefined ? { decimalPlaces } : {}),
      ...(negativeStyle !== undefined ? { negativeStyle } : {}),
      ...(useGrouping !== undefined ? { useGrouping } : {}),
    } satisfies WorksheetNumberFormat;
  }

  return {
    kind: kinds.some((kind) => kind === "number") ? "number" : "general",
    ...(decimalPlaces !== undefined ? { decimalPlaces } : {}),
    ...(negativeStyle !== undefined ? { negativeStyle } : {}),
    ...(useGrouping !== undefined ? { useGrouping } : {}),
  } satisfies WorksheetNumberFormat;
}

export function deriveWorksheetSelectionAggregate(params: {
  worksheet: WorksheetData;
  selectionState: Pick<WorksheetMultiSelectionState, "ranges">;
}): WorksheetSelectionAggregate | null {
  const { worksheet, selectionState } = params;
  if (!hasMultipleLogicalCells(worksheet, selectionState.ranges)) {
    return null;
  }

  const rowIndexById = new Map(worksheet.rows.map((row, index) => [row.id, index]));
  const columnIndexById = new Map(worksheet.columns.map((column, index) => [column.id, index]));
  const formats: WorksheetNumberFormat[] = [];
  let numericCellCount = 0;
  let sum = 0;

  for (const [cellKey, cell] of Object.entries(worksheet.cells)) {
    if (!cell) {
      continue;
    }

    const parsed = parseWorksheetCellKey(cellKey);
    if (!parsed) {
      continue;
    }

    const rowIndex = rowIndexById.get(parsed.rowId);
    const columnIndex = columnIndexById.get(parsed.columnId);
    if (rowIndex === undefined || columnIndex === undefined) {
      continue;
    }

    if (!selectionState.ranges.some((range) => isPositionInArea(rowIndex, columnIndex, range))) {
      continue;
    }

    const numericValue = getFiniteCellNumericValue(cell);
    if (numericValue === null) {
      continue;
    }

    numericCellCount += 1;
    sum += numericValue;
    formats.push(getCellFormat(cell).number ?? { kind: "general" });
  }

  if (numericCellCount === 0 || !Number.isFinite(sum)) {
    return null;
  }

  const numberFormat = deriveCompatibleNumberFormat(formats);
  const normalizedSum = Object.is(sum, -0) ? 0 : sum;
  return {
    numericCellCount,
    sum: normalizedSum,
    displayValue: formatWorksheetSelectionSummaryValue(normalizedSum, numberFormat),
    numberFormat,
  };
}
