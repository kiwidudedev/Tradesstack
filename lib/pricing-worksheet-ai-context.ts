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
  prompt?: string;
};

const DEFAULT_MAX_ROWS = 40;
const MAX_COLUMNS = 10;
const PROMPT_ROW_CONTEXT_BEFORE = 2;
const PROMPT_ROW_CONTEXT_AFTER = 16;

export type PricingWorksheetAiPromptRowReferences = {
  exactRows: number[];
  rangedRows: Array<{
    startRow: number;
    endRow: number;
  }>;
  openEndedRows: number[];
  allReferencedRows: number[];
};

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

export function extractPricingWorksheetPromptRowReferences(
  prompt: string | null | undefined,
): PricingWorksheetAiPromptRowReferences {
  const normalizedPrompt = typeof prompt === "string" ? prompt : "";
  const exactRows = new Set<number>();
  const openEndedRows = new Set<number>();
  const rangedRows: Array<{ startRow: number; endRow: number }> = [];

  for (const match of normalizedPrompt.matchAll(/\brows?\s+(\d+)\s*(?:-|to|through|thru)\s*(\d+)\b/gi)) {
    const startRow = Number(match[1]);
    const endRow = Number(match[2]);
    if (!Number.isInteger(startRow) || !Number.isInteger(endRow) || startRow < 1 || endRow < 1) {
      continue;
    }
    rangedRows.push({
      startRow: Math.min(startRow, endRow),
      endRow: Math.max(startRow, endRow),
    });
  }

  for (const match of normalizedPrompt.matchAll(/\bfrom\s+rows?\s+(\d+)\b/gi)) {
    const rowNumber = Number(match[1]);
    if (Number.isInteger(rowNumber) && rowNumber >= 1) {
      openEndedRows.add(rowNumber);
    }
  }

  for (const match of normalizedPrompt.matchAll(/\brows?\s+(\d+)\b/gi)) {
    const rowNumber = Number(match[1]);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) {
      continue;
    }
    const isRangeEndpoint = rangedRows.some(
      (range) => rowNumber >= range.startRow && rowNumber <= range.endRow,
    );
    if (openEndedRows.has(rowNumber) || isRangeEndpoint) {
      continue;
    }
    exactRows.add(rowNumber);
  }

  const allReferencedRows = Array.from(
    new Set([
      ...exactRows,
      ...openEndedRows,
      ...rangedRows.flatMap((range) => [range.startRow, range.endRow]),
    ]),
  ).sort((left, right) => left - right);

  return {
    exactRows: Array.from(exactRows).sort((left, right) => left - right),
    rangedRows: rangedRows.sort((left, right) => left.startRow - right.startRow),
    openEndedRows: Array.from(openEndedRows).sort((left, right) => left - right),
    allReferencedRows,
  };
}

function selectRowsForCompactContext(params: {
  rowSummaries: PricingWorksheetAiContextRowSummary[];
  maxRows: number;
  selectionRows: Set<number>;
  prompt?: string;
}) {
  if (params.rowSummaries.length <= params.maxRows) {
    return params.rowSummaries;
  }

  const promptRowRefs = extractPricingWorksheetPromptRowReferences(params.prompt);
  const selectedRows = new Map<number, PricingWorksheetAiContextRowSummary>();
  const prioritizedRows: PricingWorksheetAiContextRowSummary[] = [];
  const addRow = (row: PricingWorksheetAiContextRowSummary | undefined) => {
    if (!row || selectedRows.has(row.row)) {
      return;
    }
    selectedRows.set(row.row, row);
    prioritizedRows.push(row);
  };
  const addRows = (rows: PricingWorksheetAiContextRowSummary[]) => {
    for (const row of rows) {
      addRow(row);
      if (selectedRows.size >= params.maxRows) {
        return;
      }
    }
  };
  const addRowWindow = (startRow: number, endRow: number) => {
    addRows(
      params.rowSummaries.filter((row) => row.row >= startRow && row.row <= endRow),
    );
  };

  for (const rowNumber of promptRowRefs.exactRows) {
    addRowWindow(rowNumber - PROMPT_ROW_CONTEXT_BEFORE, rowNumber + PROMPT_ROW_CONTEXT_BEFORE);
  }
  for (const range of promptRowRefs.rangedRows) {
    addRowWindow(range.startRow - 1, range.endRow + 1);
  }
  for (const rowNumber of promptRowRefs.openEndedRows) {
    addRowWindow(rowNumber - PROMPT_ROW_CONTEXT_BEFORE, rowNumber + PROMPT_ROW_CONTEXT_AFTER);
  }

  if (params.selectionRows.size > 0) {
    addRows(
      params.rowSummaries.filter((summary) =>
        [...params.selectionRows].some((selectedRow) => Math.abs(summary.row - selectedRow) <= 8),
      ),
    );
  }

  addRows(params.rowSummaries.filter((summary) => summary.isSubtotalLike));
  addRows(params.rowSummaries.filter((summary) => summary.formulaRefs.length > 0));
  addRows(params.rowSummaries.slice(0, 12));
  addRows(params.rowSummaries.slice(-12));

  if (selectedRows.size < params.maxRows) {
    addRows(params.rowSummaries);
  }

  return prioritizedRows
    .slice(0, params.maxRows)
    .sort((left, right) => left.row - right.row);
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

  const promptRowRefs = extractPricingWorksheetPromptRowReferences(options.prompt);
  const nearbyRows = rowSummaries.filter((summary) => {
    if (selectionRows.size > 0) {
      for (const selectedRow of selectionRows) {
        if (Math.abs(summary.row - selectedRow) <= 8) {
          return true;
        }
      }
      return false;
    }

    if (promptRowRefs.openEndedRows.length > 0 || promptRowRefs.rangedRows.length > 0 || promptRowRefs.exactRows.length > 0) {
      if (
        promptRowRefs.exactRows.some((rowNumber) => Math.abs(summary.row - rowNumber) <= PROMPT_ROW_CONTEXT_BEFORE)
      ) {
        return true;
      }
      if (
        promptRowRefs.rangedRows.some(
          (range) => summary.row >= range.startRow - 1 && summary.row <= range.endRow + 1,
        )
      ) {
        return true;
      }
      if (
        promptRowRefs.openEndedRows.some(
          (rowNumber) =>
            summary.row >= Math.max(1, rowNumber - PROMPT_ROW_CONTEXT_BEFORE) &&
            summary.row <= rowNumber + PROMPT_ROW_CONTEXT_AFTER,
        )
      ) {
        return true;
      }
      return false;
    }

    return summary.row <= 20;
  });
  const selectedRows = selectRowsForCompactContext({
    rowSummaries,
    maxRows,
    selectionRows,
    prompt: options.prompt,
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
    rows: selectedRows,
    totals: totals.slice(0, 12),
    formulaPatterns: Array.from(formulaPatterns).slice(0, 12),
  };
}
