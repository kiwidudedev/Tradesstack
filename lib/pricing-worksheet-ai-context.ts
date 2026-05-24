import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";

type CompactCellValue = string | number | boolean | null;

export type PricingWorksheetAiSelectionContext = {
  activeCellKey?: string | null;
  anchorCellKey?: string | null;
  focusCellKey?: string | null;
};

export type PricingWorksheetAiContextRowSummary = {
  row: number;
  label: string | null;
  values: string[];
  formulaRefs: string[];
  formulaPattern: string | null;
  sectionHint: string | null;
  isSubtotalLike: boolean;
};

export type PricingWorksheetAiCompactContext = {
  worksheetId: string | null;
  worksheetName: string;
  tradePackage: string | null;
  dimensions: {
    rows: number;
    columns: number;
  };
  populatedCellCount: number;
  headers: string[];
  sections: string[];
  visibleSelection: PricingWorksheetAiSelectionContext;
  nearbyRows: PricingWorksheetAiContextRowSummary[];
  rows: PricingWorksheetAiContextRowSummary[];
  totals: Array<{
    row: number;
    label: string;
    formulaPattern: string | null;
  }>;
  formulaPatterns: string[];
};

type BuildContextOptions = {
  worksheetId?: string | null;
  worksheetName: string;
  tradePackage?: string | null;
  selection?: PricingWorksheetAiSelectionContext;
  maxRows?: number;
};

const DEFAULT_MAX_ROWS = 40;
const MAX_COLUMNS = 10;

function normalizeCellValue(cell: WorksheetCell | undefined): CompactCellValue {
  if (!cell) {
    return null;
  }

  if (typeof cell.value === "number" || typeof cell.value === "boolean") {
    return cell.value;
  }

  if (typeof cell.value === "string" && cell.value.trim().length > 0) {
    return cell.value.trim();
  }

  if (typeof cell.formula === "string" && cell.formula.trim().length > 0) {
    return `=${cell.formula.trim()}`;
  }

  return null;
}

function stringifyCompactValue(value: CompactCellValue): string {
  if (value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}

function summarizeFormulaPattern(formulas: Array<{ ref: string; formula: string }>): string | null {
  if (formulas.length === 0) {
    return null;
  }

  const firstFormula = formulas[0]?.formula?.trim();
  if (!firstFormula) {
    return null;
  }

  const upper = firstFormula.toUpperCase();
  if (upper.startsWith("SUM(")) {
    return "SUM range";
  }

  if (upper.startsWith("IF(")) {
    return "IF condition";
  }

  if (upper.includes("*") && upper.includes("+")) {
    return "mixed arithmetic";
  }

  if (upper.includes("*")) {
    return "qty x rate style";
  }

  if (upper.includes("/")) {
    return "division formula";
  }

  return firstFormula.length > 48 ? `${firstFormula.slice(0, 45)}...` : firstFormula;
}

function isSubtotalLike(label: string, formulas: Array<{ ref: string; formula: string }>): boolean {
  const normalizedLabel = label.toLowerCase();
  if (
    normalizedLabel.includes("subtotal") ||
    normalizedLabel.includes("sub total") ||
    normalizedLabel.includes("total")
  ) {
    return true;
  }

  return formulas.some(({ formula }) => formula.trim().toUpperCase().startsWith("SUM("));
}

function looksLikeSectionHeading(textValues: string[], formulaCount: number): boolean {
  const nonEmptyText = textValues.filter((value) => value.trim().length > 0);
  if (formulaCount > 0 || nonEmptyText.length === 0 || nonEmptyText.length > 2) {
    return false;
  }

  const combined = nonEmptyText.join(" ").trim();
  if (combined.length < 3 || combined.length > 60) {
    return false;
  }

  return !/\d/.test(combined);
}

function buildColumnLabel(index: number): string {
  let current = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return label;
}

function buildFormulaRef(columnIndex: number, rowIndex: number): string {
  return `${buildColumnLabel(columnIndex)}${rowIndex + 1}`;
}

export function buildPricingWorksheetAiContext(
  worksheet: WorksheetData,
  options: BuildContextOptions,
): PricingWorksheetAiCompactContext {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const rows = Array.isArray(worksheet.rows) ? worksheet.rows : [];
  const columns = Array.isArray(worksheet.columns) ? worksheet.columns : [];
  const rowSummaries: PricingWorksheetAiContextRowSummary[] = [];
  const sectionNames = new Set<string>();
  const formulaPatterns = new Set<string>();
  const totals: PricingWorksheetAiCompactContext["totals"] = [];

  let populatedCellCount = 0;

  const headerRow = rows[0] ?? null;
  const headers = columns.slice(0, MAX_COLUMNS).map((column, columnIndex) => {
    const headerValue = headerRow
      ? normalizeCellValue(worksheet.cells[buildWorksheetCellKey(column.id, headerRow.id)])
      : null;
    return stringifyCompactValue(headerValue) || buildColumnLabel(columnIndex);
  });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const values = columns
      .slice(0, MAX_COLUMNS)
      .map((column) => normalizeCellValue(worksheet.cells[buildWorksheetCellKey(column.id, row.id)]));
    const nonEmptyValues = values.filter((value) => value !== null);
    if (nonEmptyValues.length === 0) {
      continue;
    }

    populatedCellCount += nonEmptyValues.length;

    const formulas = columns
      .slice(0, MAX_COLUMNS)
      .map((column, columnIndex) => {
        const cell = worksheet.cells[buildWorksheetCellKey(column.id, row.id)];
        if (!cell?.formula || typeof cell.formula !== "string" || cell.formula.trim().length === 0) {
          return null;
        }

        return {
          ref: buildFormulaRef(columnIndex, rowIndex),
          formula: cell.formula.trim(),
        };
      })
      .filter((entry): entry is { ref: string; formula: string } => Boolean(entry));

    const textValues = values
      .map((value) => stringifyCompactValue(value))
      .filter((value) => value.trim().length > 0);
    const label = textValues[0] ?? null;
    const pattern = summarizeFormulaPattern(formulas);
    if (pattern) {
      formulaPatterns.add(pattern);
    }

    const sectionHint =
      looksLikeSectionHeading(textValues, formulas.length) && label
        ? label
        : rowSummaries[rowSummaries.length - 1]?.sectionHint ?? null;
    if (looksLikeSectionHeading(textValues, formulas.length) && label) {
      sectionNames.add(label);
    }

    const subtotalLike = label ? isSubtotalLike(label, formulas) : false;
    if (subtotalLike && label) {
      totals.push({
        row: rowIndex + 1,
        label,
        formulaPattern: pattern,
      });
    }

    rowSummaries.push({
      row: rowIndex + 1,
      label,
      values: textValues.slice(0, 6),
      formulaRefs: formulas.map(({ ref }) => ref),
      formulaPattern: pattern,
      sectionHint,
      isSubtotalLike: subtotalLike,
    });
  }

  const selectionRows = new Set<number>();
  const selectionKeys = [
    options.selection?.activeCellKey,
    options.selection?.anchorCellKey,
    options.selection?.focusCellKey,
  ].filter((value): value is string => Boolean(value));

  for (const key of selectionKeys) {
    const match = key.match(/[A-Z]+(\d+)$/i);
    if (match) {
      selectionRows.add(Number(match[1]));
    }
  }

  const nearbyRows = rowSummaries.filter((summary) => {
    if (selectionRows.size === 0) {
      return summary.row <= 20;
    }

    for (const selectedRow of selectionRows) {
      if (Math.abs(summary.row - selectedRow) <= 8) {
        return true;
      }
    }

    return false;
  });

  return {
    worksheetId: options.worksheetId ?? null,
    worksheetName: options.worksheetName,
    tradePackage: options.tradePackage ?? null,
    dimensions: {
      rows: rows.length,
      columns: columns.length,
    },
    populatedCellCount,
    headers,
    sections: Array.from(sectionNames).slice(0, 12),
    visibleSelection: {
      activeCellKey: options.selection?.activeCellKey ?? null,
      anchorCellKey: options.selection?.anchorCellKey ?? null,
      focusCellKey: options.selection?.focusCellKey ?? null,
    },
    nearbyRows: nearbyRows.slice(0, maxRows),
    rows: rowSummaries.slice(0, maxRows),
    totals: totals.slice(0, 12),
    formulaPatterns: Array.from(formulaPatterns).slice(0, 12),
  };
}
