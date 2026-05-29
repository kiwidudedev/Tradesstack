import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type {
  PricingWorksheetAiCompactContext,
  PricingWorksheetAiContextRowSummary,
} from "@/lib/pricing-worksheet-ai-context";
import {
  buildPricingWorksheetAiContext,
  extractPricingWorksheetPromptRowReferences,
} from "@/lib/pricing-worksheet-ai-context";
import type {
  PricingWorksheetConstructionIntent,
  PricingWorksheetConstructionPromptPath,
} from "@/lib/pricing-worksheet-construction-intent";
import {
  getPricingWorksheetAiAllowedFunctions,
  getPricingWorksheetAiFormulaCompatibility,
} from "@/lib/pricing-worksheet-edit-plan";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";

export type PricingWorksheetState =
  | "blank"
  | "starter_generated"
  | "partial_structured"
  | "mature_structured"
  | "formula_heavy";

export type PricingWorksheetSnapshotBudgetTier = "small" | "medium" | "large";

export type PricingWorksheetStructureColumn = {
  letter: string;
  label: string;
  semanticRole:
    | "section"
    | "item"
    | "description"
    | "unit"
    | "quantity"
    | "material_rate"
    | "labour_hours"
    | "labour_rate"
    | "margin"
    | "total"
    | "notes"
    | "other";
};

export type PricingWorksheetStructureRow = {
  rowNumber: number;
  label: string | null;
  sectionName: string | null;
  rowTypeHint: "section_heading" | "subtotal" | "line_item" | "input" | "formula" | "unknown";
  valuesPreview: string[];
  formulaRefs: string[];
  notesPreview: string | null;
  rowPurposeHint: "assumption_input" | "subtotal" | "section_heading" | "formula_target" | "line_item" | "unknown";
  isLikelyInputRow: boolean;
  isLikelyAssumptionRow: boolean;
};

export type PricingWorksheetStructureSection = {
  title: string;
  startRow: number;
  endRow: number;
  subtotalRow: number | null;
  totalCells: string[];
};

export type PricingWorksheetFormulaTargetRowMap = {
  rowNumber: number;
  label: string | null;
  sectionName: string | null;
  rowPurposeHint: PricingWorksheetStructureRow["rowPurposeHint"];
  isLikelyInputRow: boolean;
  isLikelyAssumptionRow: boolean;
  notesPreview: string | null;
  cells: {
    quantity: string | null;
    materialRate: string | null;
    labourHours: string | null;
    labourRate: string | null;
    margin: string | null;
    total: string | null;
    notes: string | null;
  };
  primaryRef: string | null;
};

export type PricingWorksheetStructureSnapshot = {
  worksheetState: PricingWorksheetState;
  budgetTier: PricingWorksheetSnapshotBudgetTier;
  estimatedTokenSize: number;
  bounds: {
    rowCount: number;
    columnCount: number;
  };
  columns: PricingWorksheetStructureColumn[];
  rows: PricingWorksheetStructureRow[];
  sections: PricingWorksheetStructureSection[];
  totals: Array<{
    rowNumber: number;
    label: string;
    formulaPattern: string | null;
  }>;
  formulaTargets: {
    rows: PricingWorksheetFormulaTargetRowMap[];
    namedRefs: Record<string, string>;
    sectionTotals: Record<string, string>;
    sectionTotalRanges: Record<string, string>;
  };
  rowCoverage: {
    meaningfulRowCount: number;
    includedRowCount: number;
    includedRowRanges: Array<{
      startRow: number;
      endRow: number;
    }>;
    omittedRowRanges: Array<{
      startRow: number;
      endRow: number;
    }>;
    promptReferencedRows: number[];
    note: string | null;
  };
  formulaCompatibility: ReturnType<typeof getPricingWorksheetAiFormulaCompatibility>;
};

type BuildSnapshotParams = {
  worksheet: WorksheetData;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  prompt?: string;
};

const SMALL_ROW_THRESHOLD = 24;
const MEDIUM_ROW_THRESHOLD = 80;
const LARGE_ROW_LIMIT = 18;
const MEDIUM_ROW_LIMIT = 24;
const SMALL_ROW_LIMIT = 40;
const MAX_SECTION_COUNT = 12;
const PROMPT_ROW_WINDOW_BEFORE = 2;
const PROMPT_ROW_WINDOW_AFTER = 16;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function estimateTokenSize(value: unknown) {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function inferColumnSemanticRole(index: number): PricingWorksheetStructureColumn["semanticRole"] {
  switch (index) {
    case 0:
      return "section";
    case 1:
      return "item";
    case 2:
      return "description";
    case 3:
      return "unit";
    case 4:
      return "quantity";
    case 5:
      return "material_rate";
    case 6:
      return "labour_hours";
    case 7:
      return "labour_rate";
    case 8:
      return "margin";
    case 9:
      return "total";
    case 10:
      return "notes";
    default:
      return "other";
  }
}

function hasMeaningfulHeaders(headers: string[]) {
  return headers.some((header) => {
    const normalized = normalizeText(header);
    return normalized.length > 1 && !/^[a-z]{1,2}$/.test(normalized);
  });
}

function isSectionHeadingRow(row: PricingWorksheetAiContextRowSummary) {
  return Boolean(row.sectionHint && row.label && row.sectionHint === row.label && row.formulaRefs.length === 0);
}

function inferRowTypeHint(row: PricingWorksheetAiContextRowSummary): PricingWorksheetStructureRow["rowTypeHint"] {
  if (isSectionHeadingRow(row)) {
    return "section_heading";
  }

  if (row.isSubtotalLike) {
    return "subtotal";
  }

  if (row.formulaRefs.length > 0) {
    return "formula";
  }

  if ((row.values[1] ?? "").length === 0 && row.values.length <= 3) {
    return "input";
  }

  if (row.values.length > 0) {
    return "line_item";
  }

  return "unknown";
}

function readWorksheetRowCellValues(
  worksheet: WorksheetData,
  rowIndex: number,
  maxColumns = 12,
) {
  const row = worksheet.rows[rowIndex];
  if (!row) {
    return [] as string[];
  }

  return worksheet.columns.slice(0, maxColumns).map((column) => {
    const cell = worksheet.cells[buildWorksheetCellKey(column.id, row.id)];
    if (!cell) {
      return "";
    }
    if (typeof cell.formula === "string" && cell.formula.trim().length > 0) {
      return `=${cell.formula.trim()}`;
    }
    if (typeof cell.value === "number") {
      return String(cell.value);
    }
    if (typeof cell.value === "string") {
      return cell.value.trim();
    }
    return "";
  });
}

function inferSemanticRowHints(params: {
  row: PricingWorksheetAiContextRowSummary;
  worksheet: WorksheetData;
}): Pick<
  PricingWorksheetStructureRow,
  "notesPreview" | "rowPurposeHint" | "isLikelyInputRow" | "isLikelyAssumptionRow"
> {
  const rowIndex = Math.max(0, params.row.row - 1);
  const fullRowValues = readWorksheetRowCellValues(params.worksheet, rowIndex);
  const notesPreview = fullRowValues[10]?.trim() || null;
  const semanticText = [
    params.row.label ?? "",
    params.row.sectionHint ?? "",
    ...fullRowValues,
  ]
    .join(" ")
    .toLowerCase();

  const isLikelyInputRow =
    inferRowTypeHint(params.row) === "input" ||
    /\b(input|assumption|area|sqm|sq m|quantity|rate|factor|percent|percentage|spacing|module|allowance|wastage|margin|markup|productivity|hours)\b/.test(
      semanticText,
    );
  const isLikelyAssumptionRow =
    /\b(assumption|assume|confirm|editable|enter|input|spacing|module|wastage|margin|productivity|factor)\b/.test(
      semanticText,
    ) || Boolean(notesPreview && notesPreview.length > 0);

  let rowPurposeHint: PricingWorksheetStructureRow["rowPurposeHint"] = "unknown";
  const rowTypeHint = inferRowTypeHint(params.row);
  if (rowTypeHint === "section_heading") {
    rowPurposeHint = "section_heading";
  } else if (rowTypeHint === "subtotal") {
    rowPurposeHint = "subtotal";
  } else if (rowTypeHint === "formula") {
    rowPurposeHint = "formula_target";
  } else if (isLikelyInputRow || isLikelyAssumptionRow) {
    rowPurposeHint = "assumption_input";
  } else if (rowTypeHint === "line_item") {
    rowPurposeHint = "line_item";
  }

  return {
    notesPreview,
    rowPurposeHint,
    isLikelyInputRow,
    isLikelyAssumptionRow,
  };
}

export function detectPricingWorksheetState(params: {
  worksheet: WorksheetData;
  worksheetContext: PricingWorksheetAiCompactContext;
  currentWorksheetSummary?: {
    populatedCellCount?: number;
    formulaCount?: number;
    hasExistingContent?: boolean;
  } | null;
}): PricingWorksheetState {
  const populatedCellCount =
    params.currentWorksheetSummary?.populatedCellCount ?? params.worksheetContext.populatedCellCount ?? 0;
  const formulaCount = params.currentWorksheetSummary?.formulaCount ?? params.worksheetContext.formulaPatterns.length ?? 0;
  const sectionCount = params.worksheetContext.sections.length;
  const rowSummaryCount = params.worksheetContext.rows.length;
  const totalsCount = params.worksheetContext.totals.length;
  const meaningfulHeaders = hasMeaningfulHeaders(params.worksheetContext.headers);

  if (populatedCellCount <= 2 && formulaCount === 0 && sectionCount === 0) {
    return "blank";
  }

  if (
    populatedCellCount <= 36 &&
    rowSummaryCount <= 18 &&
    (sectionCount <= 3 || meaningfulHeaders) &&
    formulaCount <= 8
  ) {
    return "starter_generated";
  }

  if (formulaCount >= 16 || params.worksheetContext.formulaPatterns.length >= 8) {
    return "formula_heavy";
  }

  if (sectionCount >= 3 && totalsCount >= 2 && rowSummaryCount >= 12) {
    return "mature_structured";
  }

  return "partial_structured";
}

function determineBudgetTier(worksheetContext: PricingWorksheetAiCompactContext): PricingWorksheetSnapshotBudgetTier {
  if (worksheetContext.rows.length <= SMALL_ROW_THRESHOLD && worksheetContext.populatedCellCount <= 80) {
    return "small";
  }

  if (worksheetContext.rows.length <= MEDIUM_ROW_THRESHOLD && worksheetContext.populatedCellCount <= 220) {
    return "medium";
  }

  return "large";
}

function rowMatchesPrompt(row: PricingWorksheetAiContextRowSummary, prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  if (!normalizedPrompt) {
    return false;
  }

  const haystack = `${row.label ?? ""} ${row.sectionHint ?? ""} ${row.values.join(" ")}`.toLowerCase();
  const keywords = normalizedPrompt.split(/\s+/).filter((token) => token.length > 3).slice(0, 12);
  return keywords.some((keyword) => haystack.includes(keyword));
}

function buildRowRanges(rowNumbers: number[]) {
  const sortedRowNumbers = [...new Set(rowNumbers)].sort((left, right) => left - right);
  if (sortedRowNumbers.length === 0) {
    return [] as Array<{ startRow: number; endRow: number }>;
  }

  const ranges: Array<{ startRow: number; endRow: number }> = [];
  let startRow = sortedRowNumbers[0];
  let previousRow = sortedRowNumbers[0];

  for (let index = 1; index < sortedRowNumbers.length; index += 1) {
    const rowNumber = sortedRowNumbers[index];
    if (rowNumber === previousRow + 1) {
      previousRow = rowNumber;
      continue;
    }
    ranges.push({ startRow, endRow: previousRow });
    startRow = rowNumber;
    previousRow = rowNumber;
  }
  ranges.push({ startRow, endRow: previousRow });
  return ranges;
}

function selectRowsForSnapshot(params: {
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  prompt?: string;
  worksheetState: PricingWorksheetState;
  budgetTier: PricingWorksheetSnapshotBudgetTier;
}) {
  const allRows = params.worksheetContext.rows;
  const nearbyRows = params.worksheetContext.nearbyRows;
  const prompt = params.prompt ?? "";
  const promptRowRefs = extractPricingWorksheetPromptRowReferences(prompt);
  const requestedLimit =
    params.budgetTier === "small"
      ? SMALL_ROW_LIMIT
      : params.budgetTier === "medium"
        ? MEDIUM_ROW_LIMIT
        : LARGE_ROW_LIMIT;

  if (params.classification.recommendedPromptPath === "generation" && params.worksheetState === "blank") {
    return [];
  }

  if (allRows.length <= SMALL_ROW_LIMIT) {
    return allRows;
  }

  const priorityRows: PricingWorksheetAiContextRowSummary[] = [];
  const seenRows = new Set<number>();
  const addRows = (rows: PricingWorksheetAiContextRowSummary[]) => {
    for (const row of rows) {
      if (seenRows.has(row.row)) {
        continue;
      }
      seenRows.add(row.row);
      priorityRows.push(row);
      if (priorityRows.length >= requestedLimit) {
        return;
      }
    }
  };
  const addRowWindow = (startRow: number, endRow: number) => {
    addRows(allRows.filter((row) => row.row >= Math.max(1, startRow) && row.row <= endRow));
  };

  for (const rowNumber of promptRowRefs.exactRows) {
    addRowWindow(rowNumber - PROMPT_ROW_WINDOW_BEFORE, rowNumber + PROMPT_ROW_WINDOW_BEFORE);
  }
  for (const range of promptRowRefs.rangedRows) {
    addRowWindow(range.startRow - 1, range.endRow + 1);
  }
  for (const rowNumber of promptRowRefs.openEndedRows) {
    addRowWindow(rowNumber - PROMPT_ROW_WINDOW_BEFORE, rowNumber + PROMPT_ROW_WINDOW_AFTER);
  }

  if (params.classification.recommendedPromptPath === "edit") {
    addRows(nearbyRows);
    addRows(allRows.filter((row) => rowMatchesPrompt(row, prompt)));
    addRows(allRows.filter((row) => row.isSubtotalLike));
  } else if (params.classification.recommendedPromptPath === "review") {
    addRows(allRows.filter((row) => row.isSubtotalLike || row.formulaRefs.length > 0));
    addRows(allRows.filter((row) => isSectionHeadingRow(row)));
    addRows(nearbyRows);
  } else {
    addRows(allRows.filter((row) => isSectionHeadingRow(row)));
    addRows(allRows.filter((row) => row.isSubtotalLike));
    addRows(nearbyRows);
  }

  addRows(allRows.slice(-8));

  if (priorityRows.length < requestedLimit) {
    addRows(allRows.slice(0, requestedLimit));
  }

  return priorityRows
    .sort((left, right) => left.row - right.row)
    .slice(0, requestedLimit);
}

function buildSectionsFromRows(rows: PricingWorksheetAiContextRowSummary[]) {
  const sections: PricingWorksheetStructureSection[] = [];
  let currentSection: PricingWorksheetStructureSection | null = null;

  for (const row of rows) {
    const sectionName = row.sectionHint ?? null;
    if (!sectionName) {
      continue;
    }

    if (!currentSection || currentSection.title !== sectionName) {
      currentSection = {
        title: sectionName,
        startRow: row.row,
        endRow: row.row,
        subtotalRow: row.isSubtotalLike ? row.row : null,
        totalCells: row.formulaRefs.slice(0, 4),
      };
      sections.push(currentSection);
      continue;
    }

    currentSection.endRow = row.row;
    if (row.isSubtotalLike && currentSection.subtotalRow === null) {
      currentSection.subtotalRow = row.row;
      currentSection.totalCells = row.formulaRefs.slice(0, 4);
    }
  }

  return sections.slice(0, MAX_SECTION_COUNT);
}

function buildFormulaTargetRows(
  rows: PricingWorksheetAiContextRowSummary[],
  worksheet: WorksheetData,
) {
  return rows
    .filter((row) => !isSectionHeadingRow(row))
    .map<PricingWorksheetFormulaTargetRowMap>((row) => {
      const semanticHints = inferSemanticRowHints({
        row,
        worksheet,
      });
      return {
        rowNumber: row.row,
        label: row.label,
        sectionName: row.sectionHint,
        rowPurposeHint: semanticHints.rowPurposeHint,
        isLikelyInputRow: semanticHints.isLikelyInputRow,
        isLikelyAssumptionRow: semanticHints.isLikelyAssumptionRow,
        notesPreview: semanticHints.notesPreview,
        cells: {
          quantity: `E${row.row}`,
          materialRate: `F${row.row}`,
          labourHours: `G${row.row}`,
          labourRate: `H${row.row}`,
          margin: `I${row.row}`,
          total: `J${row.row}`,
          notes: `K${row.row}`,
        },
        primaryRef: row.formulaRefs[0] ?? `J${row.row}`,
      };
    })
    .slice(0, 48);
}

function buildNamedRefs(rows: PricingWorksheetFormulaTargetRowMap[], sections: PricingWorksheetStructureSection[]) {
  const namedRefs: Record<string, string> = {};
  const sectionTotals: Record<string, string> = {};
  const sectionTotalRanges: Record<string, string> = {};

  for (const row of rows) {
    const labelKey = normalizeText(row.label).replace(/[^a-z0-9]+/g, "");
    if (labelKey && row.primaryRef) {
      namedRefs[labelKey] = row.primaryRef;
    }
  }

  for (const section of sections) {
    const normalizedTitle = normalizeText(section.title);
    const key = normalizedTitle.replace(/[^a-z0-9]+/g, "");
    if (!key) {
      continue;
    }

    if (section.subtotalRow) {
      sectionTotals[key] = `J${section.subtotalRow}`;
    }

    const rowRangeStart = Math.min(section.startRow + 1, section.endRow);
    if (rowRangeStart <= section.endRow) {
      sectionTotalRanges[key] = `J${rowRangeStart}:J${section.endRow}`;
    }
  }

  return {
    namedRefs,
    sectionTotals,
    sectionTotalRanges,
  };
}

export function buildPricingWorksheetAiStructureSnapshot(
  params: BuildSnapshotParams,
): PricingWorksheetStructureSnapshot {
  const fullWorksheetContext = buildPricingWorksheetAiContext(params.worksheet, {
    worksheetId: params.worksheetContext.worksheetId,
    worksheetName: params.worksheetContext.worksheetName,
    tradePackage: params.worksheetContext.tradePackage,
    selection: params.worksheetContext.visibleSelection,
    maxRows: Math.max(params.worksheet.rows.length, 1),
    prompt: params.prompt,
  });
  const worksheetState = detectPricingWorksheetState({
    worksheet: params.worksheet,
    worksheetContext: fullWorksheetContext,
  });
  const budgetTier = determineBudgetTier(fullWorksheetContext);
  const rows = selectRowsForSnapshot({
    worksheetContext: fullWorksheetContext,
    classification: params.classification,
    prompt: params.prompt,
    worksheetState,
    budgetTier,
  });

  const snapshotRows: PricingWorksheetStructureRow[] = rows.map((row) => ({
    rowNumber: row.row,
    label: row.label,
    sectionName: row.sectionHint,
    rowTypeHint: inferRowTypeHint(row),
    valuesPreview: row.values.slice(0, 6),
    formulaRefs: row.formulaRefs.slice(0, 6),
    ...inferSemanticRowHints({
      row,
      worksheet: params.worksheet,
    }),
  }));
  const sections = buildSectionsFromRows(rows);
  const formulaTargetRows = buildFormulaTargetRows(rows, params.worksheet);
  const namedRefs = buildNamedRefs(formulaTargetRows, sections);
  const allMeaningfulRowNumbers = fullWorksheetContext.rows.map((row) => row.row);
  const includedRowNumbers = rows.map((row) => row.row);
  const includedRowSet = new Set(includedRowNumbers);
  const omittedRowNumbers = allMeaningfulRowNumbers.filter((rowNumber) => !includedRowSet.has(rowNumber));
  const promptReferencedRows = extractPricingWorksheetPromptRowReferences(params.prompt).allReferencedRows;
  const omittedRowRanges = buildRowRanges(omittedRowNumbers);
  const rowCoverageNote =
    omittedRowRanges.length > 0
      ? `Snapshot omits meaningful row ranges ${omittedRowRanges
          .map((range) => (range.startRow === range.endRow ? `${range.startRow}` : `${range.startRow}-${range.endRow}`))
          .join(", ")} due to context limits. Do not infer hidden formulas or values for omitted rows.`
      : null;

  const snapshotWithoutEstimate = {
    worksheetState,
    budgetTier,
    bounds: {
      rowCount: params.worksheet.rows.length,
      columnCount: params.worksheet.columns.length,
    },
    columns: params.worksheet.columns.slice(0, 12).map((column, index) => ({
      letter: column.id,
      label: column.label,
      semanticRole: inferColumnSemanticRole(index),
    })),
    rows: snapshotRows,
    sections,
    totals: params.worksheetContext.totals.slice(0, 12).map((total) => ({
      rowNumber: total.row,
      label: total.label,
      formulaPattern: total.formulaPattern,
    })),
    formulaTargets: {
      rows: formulaTargetRows,
      ...namedRefs,
    },
    rowCoverage: {
      meaningfulRowCount: allMeaningfulRowNumbers.length,
      includedRowCount: includedRowNumbers.length,
      includedRowRanges: buildRowRanges(includedRowNumbers),
      omittedRowRanges,
      promptReferencedRows,
      note: rowCoverageNote,
    },
    formulaCompatibility: getPricingWorksheetAiFormulaCompatibility(),
  };

  return {
    ...snapshotWithoutEstimate,
    estimatedTokenSize: estimateTokenSize(snapshotWithoutEstimate),
  };
}

export function summarizePricingWorksheetStructureSnapshot(snapshot: PricingWorksheetStructureSnapshot) {
  return {
    worksheetState: snapshot.worksheetState,
    budgetTier: snapshot.budgetTier,
    estimatedTokenSize: snapshot.estimatedTokenSize,
    rowCount: snapshot.rows.length,
    meaningfulRowCount: snapshot.rowCoverage.meaningfulRowCount,
    includedRowRanges: snapshot.rowCoverage.includedRowRanges
      .map((range) => (range.startRow === range.endRow ? `${range.startRow}` : `${range.startRow}-${range.endRow}`))
      .join(", "),
    omittedRowRanges: snapshot.rowCoverage.omittedRowRanges
      .map((range) => (range.startRow === range.endRow ? `${range.startRow}` : `${range.startRow}-${range.endRow}`))
      .join(", "),
    promptReferencedRows: snapshot.rowCoverage.promptReferencedRows,
    sectionCount: snapshot.sections.length,
    formulaTargetRowCount: snapshot.formulaTargets.rows.length,
    allowedFunctions: getPricingWorksheetAiAllowedFunctions(),
  };
}
