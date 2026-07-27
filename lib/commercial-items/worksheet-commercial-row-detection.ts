import type { WorksheetData, WorksheetCell } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import type {
  PublishedWorksheetCommercialRow,
  PublishedWorksheetSkippedRow,
  PublishedWorksheetSkippedRowReason,
} from "@/lib/commercial-items/published-worksheet-selection";

type WorksheetCommercialColumnRole = "description" | "quantity" | "unit" | "rate" | "total";

type WorksheetCommercialColumnRoleMap = Partial<Record<WorksheetCommercialColumnRole, number>>;

type DetectedWorksheetRowData =
  | {
      kind: "commercial";
      row: Omit<
        PublishedWorksheetCommercialRow,
        "snapshotJson" | "sourceLinkJson" | "lockedMetadataJson" | "sourceSignature" | "sourceRangeLabel"
      >;
    }
  | {
      kind: "skipped";
      skippedRow: PublishedWorksheetSkippedRow;
    };

const DESCRIPTION_ALIASES = ["description", "scope", "item", "work", "trade", "package", "task"];
const QUANTITY_ALIASES = ["qty", "quantity", "quant", "amount"];
const UNIT_ALIASES = ["unit", "uom"];
const RATE_ALIASES = ["rate", "price", "cost", "sell", "unit rate", "unit price"];
const TOTAL_ALIASES = ["total", "amount", "value", "sum", "line total"];
const TAX_LABELS = ["gst", "tax", "vat"];
const SUBTOTAL_LABELS = ["subtotal", "sub total"];
const GRAND_TOTAL_LABELS = ["grand total", "contract total", "total contract"];

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function asCellDisplayValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return "";
  }

  if (typeof cell.displayValue === "string" && cell.displayValue.trim().length > 0) {
    return cell.displayValue.trim();
  }

  if (typeof cell.computedValue === "string" && cell.computedValue.trim().length > 0) {
    return cell.computedValue.trim();
  }

  if (typeof cell.computedValue === "number" && Number.isFinite(cell.computedValue)) {
    return String(cell.computedValue);
  }

  if (typeof cell.value === "string" && cell.value.trim().length > 0) {
    return cell.value.trim();
  }

  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return String(cell.value);
  }

  return "";
}

function asCellNumericValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return null;
  }

  const candidates = [cell.computedValue, cell.value];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === "string") {
      const normalized = candidate.replaceAll(",", "").trim();
      if (normalized.length === 0) {
        continue;
      }

      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function isDividerText(value: string) {
  return /^[\s\-_=/.|]+$/.test(value);
}

function isMeaningfulDescription(value: string) {
  const normalized = normalizeLabel(value);

  if (!normalized) {
    return false;
  }

  if (
    SUBTOTAL_LABELS.includes(normalized) ||
    TAX_LABELS.includes(normalized) ||
    GRAND_TOTAL_LABELS.includes(normalized)
  ) {
    return false;
  }

  if (isDividerText(normalized)) {
    return false;
  }

  return /[a-z]/i.test(normalized);
}

function scoreColumnRole(value: string, aliases: string[]) {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return 0;
  }

  if (aliases.includes(normalized)) {
    return 100;
  }

  return aliases.some((alias) => normalized.includes(alias)) ? 50 : 0;
}

function detectWorksheetCommercialColumnRoles(worksheet: WorksheetData): WorksheetCommercialColumnRoleMap {
  const detected: WorksheetCommercialColumnRoleMap = {};

  const scores = worksheet.columns.map((column, columnIndex) => {
    let descriptionScore = scoreColumnRole(column.label, DESCRIPTION_ALIASES);
    let quantityScore = scoreColumnRole(column.label, QUANTITY_ALIASES);
    let unitScore = scoreColumnRole(column.label, UNIT_ALIASES);
    let rateScore = scoreColumnRole(column.label, RATE_ALIASES);
    let totalScore = scoreColumnRole(column.label, TOTAL_ALIASES);

    for (let rowIndex = 0; rowIndex < Math.min(10, worksheet.rowCount); rowIndex += 1) {
      const row = worksheet.rows[rowIndex];
      if (!row) {
        continue;
      }

      const cell = worksheet.cells[`${column.id}${row.id}`];
      const displayValue = asCellDisplayValue(cell);
      descriptionScore = Math.max(descriptionScore, scoreColumnRole(displayValue, DESCRIPTION_ALIASES));
      quantityScore = Math.max(quantityScore, scoreColumnRole(displayValue, QUANTITY_ALIASES));
      unitScore = Math.max(unitScore, scoreColumnRole(displayValue, UNIT_ALIASES));
      rateScore = Math.max(rateScore, scoreColumnRole(displayValue, RATE_ALIASES));
      totalScore = Math.max(totalScore, scoreColumnRole(displayValue, TOTAL_ALIASES));
    }

    return {
      columnIndex,
      descriptionScore,
      quantityScore,
      unitScore,
      rateScore,
      totalScore,
    };
  });

  const roleEntries = [
    ["description", "descriptionScore"],
    ["quantity", "quantityScore"],
    ["unit", "unitScore"],
    ["rate", "rateScore"],
    ["total", "totalScore"],
  ] as const;

  for (const [role, scoreKey] of roleEntries) {
    const winner = scores
      .filter((entry) => entry[scoreKey] > 0)
      .sort((left, right) => right[scoreKey] - left[scoreKey] || left.columnIndex - right.columnIndex)[0];

    if (winner) {
      detected[role] = winner.columnIndex;
    }
  }

  return detected;
}

function detectSkippedReason(params: {
  normalizedRowText: string;
  nonEmptyValues: string[];
  numericValues: number[];
  description: string | null;
}): PublishedWorksheetSkippedRowReason | null {
  const { normalizedRowText, nonEmptyValues, numericValues, description } = params;

  if (nonEmptyValues.length === 0) {
    return "blank_row";
  }

  if (nonEmptyValues.every((value) => isDividerText(value))) {
    return "divider_row";
  }

  if (GRAND_TOTAL_LABELS.some((label) => normalizedRowText.includes(label))) {
    return "grand_total_row";
  }

  if (SUBTOTAL_LABELS.some((label) => normalizedRowText.includes(label))) {
    return "subtotal_row";
  }

  if (TAX_LABELS.some((label) => normalizedRowText.includes(label))) {
    return "tax_row";
  }

  if (!description) {
    return numericValues.length > 0 ? "missing_description" : "heading_row";
  }

  if (numericValues.length === 0) {
    return "missing_commercial_value";
  }

  return null;
}

function buildRowSourceRange(worksheet: WorksheetData, rowIndex: number) {
  const row = worksheet.rows[rowIndex];
  if (!row) {
    return {
      startRowIndex: rowIndex,
      endRowIndex: rowIndex,
      startColumnIndex: 0,
      endColumnIndex: Math.max(0, worksheet.columnCount - 1),
    } satisfies WorksheetSelectionRange;
  }

  const nonEmptyColumnIndexes = worksheet.columns.flatMap((column, columnIndex) => {
    const displayValue = asCellDisplayValue(worksheet.cells[`${column.id}${row.id}`]);
    return displayValue.length > 0 ? [columnIndex] : [];
  });

  return {
    startRowIndex: rowIndex,
    endRowIndex: rowIndex,
    startColumnIndex: nonEmptyColumnIndexes[0] ?? 0,
    endColumnIndex: nonEmptyColumnIndexes[nonEmptyColumnIndexes.length - 1] ?? Math.max(0, worksheet.columnCount - 1),
  } satisfies WorksheetSelectionRange;
}

function detectWorksheetRowData(params: {
  worksheet: WorksheetData;
  rowIndex: number;
  roleMap: WorksheetCommercialColumnRoleMap;
  sectionHeading: string | null;
}): DetectedWorksheetRowData {
  const row = params.worksheet.rows[params.rowIndex];

  if (!row) {
    return {
      kind: "skipped",
      skippedRow: {
        rowId: String(params.rowIndex + 1),
        rowIndex: params.rowIndex,
        rowLabel: String(params.rowIndex + 1),
        reason: "blank_row",
      },
    };
  }

  const rowCells = params.worksheet.columns.map((column, columnIndex) => ({
    column,
    columnIndex,
    cell: params.worksheet.cells[`${column.id}${row.id}`],
    displayValue: asCellDisplayValue(params.worksheet.cells[`${column.id}${row.id}`]),
    numericValue: asCellNumericValue(params.worksheet.cells[`${column.id}${row.id}`]),
  }));

  const nonEmptyCells = rowCells.filter((entry) => entry.displayValue.length > 0);
  const nonEmptyValues = nonEmptyCells.map((entry) => entry.displayValue);
  const normalizedRowText = normalizeLabel(nonEmptyValues.join(" "));
  const numericCells = rowCells.filter((entry) => entry.numericValue !== null);
  const numericValues = numericCells.flatMap((entry) => (entry.numericValue === null ? [] : [entry.numericValue]));

  const descriptionByRole =
    params.roleMap.description !== undefined
      ? rowCells[params.roleMap.description]?.displayValue ?? ""
      : "";
  const descriptionFallback =
    rowCells.find((entry) => isMeaningfulDescription(entry.displayValue))?.displayValue ?? "";
  const description = isMeaningfulDescription(descriptionByRole)
    ? descriptionByRole
    : isMeaningfulDescription(descriptionFallback)
    ? descriptionFallback
    : null;

  const quantityByRole =
    params.roleMap.quantity !== undefined ? rowCells[params.roleMap.quantity]?.numericValue ?? null : null;
  const rateByRole =
    params.roleMap.rate !== undefined ? rowCells[params.roleMap.rate]?.numericValue ?? null : null;
  const totalByRole =
    params.roleMap.total !== undefined ? rowCells[params.roleMap.total]?.numericValue ?? null : null;
  const unitByRole =
    params.roleMap.unit !== undefined ? rowCells[params.roleMap.unit]?.displayValue.trim() || null : null;

  const quantityFallback =
    numericCells.length >= 2 ? numericCells[0]?.numericValue ?? null : numericCells.length === 1 ? numericCells[0]?.numericValue ?? null : null;
  const rateFallback =
    numericCells.length >= 2 ? numericCells[numericCells.length - 2]?.numericValue ?? null : null;
  const totalFallback = numericCells.length >= 1 ? numericCells[numericCells.length - 1]?.numericValue ?? null : null;
  const unitFallback =
    rowCells.find(
      (entry) =>
        entry.displayValue.length > 0 &&
        entry.numericValue === null &&
        entry.displayValue !== description &&
        normalizeLabel(entry.displayValue) !== normalizedRowText &&
        entry.displayValue.trim().length <= 12,
    )?.displayValue ?? null;

  const skippedReason = detectSkippedReason({
    normalizedRowText,
    nonEmptyValues,
    numericValues,
    description,
  });

  if (skippedReason) {
    return {
      kind: "skipped",
      skippedRow: {
        rowId: row.id,
        rowIndex: params.rowIndex,
        rowLabel: row.id,
        reason: skippedReason,
      },
    };
  }

  return {
    kind: "commercial",
    row: {
      rowId: row.id,
      rowIndex: params.rowIndex,
      rowLabel: row.id,
      sourceRowIndex: params.rowIndex,
      sourceRange: buildRowSourceRange(params.worksheet, params.rowIndex),
      sectionHeading: params.sectionHeading,
      rowCategoryHint: params.sectionHeading,
      description: description ?? "",
      quantity: quantityByRole ?? quantityFallback,
      unit: unitByRole ?? unitFallback,
      rate: rateByRole ?? rateFallback,
      total: totalByRole ?? totalFallback,
    },
  };
}

export function detectPublishedWorksheetRows(params: {
  worksheet: WorksheetData;
  selectionRange: WorksheetSelectionRange;
}) {
  const roleMap = detectWorksheetCommercialColumnRoles(params.worksheet);
  const commercialRows: Array<
    Omit<
      PublishedWorksheetCommercialRow,
      "snapshotJson" | "sourceLinkJson" | "lockedMetadataJson" | "sourceSignature" | "sourceRangeLabel"
    >
  > = [];
  const skippedRows: PublishedWorksheetSkippedRow[] = [];
  let currentSectionHeading: string | null = null;

  for (let rowIndex = params.selectionRange.startRowIndex; rowIndex <= params.selectionRange.endRowIndex; rowIndex += 1) {
    const detected = detectWorksheetRowData({
      worksheet: params.worksheet,
      rowIndex,
      roleMap,
      sectionHeading: currentSectionHeading,
    });

    if (detected.kind === "commercial") {
      commercialRows.push(detected.row);
    } else {
      skippedRows.push(detected.skippedRow);

      if (detected.skippedRow.reason === "heading_row") {
        const row = params.worksheet.rows[rowIndex];
        const headingText = row
          ? params.worksheet.columns
              .map((column) => asCellDisplayValue(params.worksheet.cells[`${column.id}${row.id}`]))
              .find((value) => isMeaningfulDescription(value)) ?? null
          : null;

        currentSectionHeading = headingText ? headingText.trim() : currentSectionHeading;
      }
    }
  }

  return {
    commercialRows,
    skippedRows,
  };
}
