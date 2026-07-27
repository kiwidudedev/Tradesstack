/**
 * @deprecated
 * Legacy full-worksheet scaffold generator retained for transition safety only.
 * The active Ask AI pricing worksheet flow now uses the worksheet edit assistant
 * and compact edit-plan validation path instead of full sheet generation.
 */
import {
  createDefaultWorksheetData,
  type WorksheetCell,
  type WorksheetData,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import { recalculateWorksheetFormulas } from "@/lib/opportunity-pricing-worksheet-formulas";
import {
  buildPricingWorksheetScaffoldPreview,
  type PricingWorksheetScaffoldPreview,
} from "@/lib/ai-pricing-worksheet-scaffold";
import { summarizeWorksheetStructure } from "@/lib/pricing-worksheet-intelligence";
import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import type { AiMemoryItem, AiValidationWarning } from "@/lib/ai-lifecycle-server";
import type { Json } from "@/lib/supabase/types";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_WORKSHEET_PRIMARY_MODEL = "gpt-5.5";
const DEFAULT_WORKSHEET_FALLBACK_MODEL = "gpt-5.4";
const WORKSHEET_AI_TIMEOUT_MS = 75_000;
const WORKSHEET_AI_MAX_OUTPUT_TOKENS = 5000;
const WORKSHEET_PROVIDER_SCHEMA_VERSION = "worksheet_grid_schema_v1";
const MAX_COLUMNS = 20;
const MAX_ROWS = 220;
const MAX_CELLS = 500;
const DEFAULT_COLUMN_WIDTH = 160;
const DEFAULT_ROW_HEIGHT = 32;
const ALLOWED_FORMULA_FUNCTIONS = new Set([
  "SUM",
  "ROUND",
  "ROUNDUP",
  "ROUNDDOWN",
  "IF",
]);

type WorksheetPreviewGenerationMeta = {
  provider: "openai" | "tradesstack";
  model: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
};

type CurrentWorksheetSummary = {
  rowCount: number;
  columnCount: number;
  formulaCount: number;
  populatedCellCount: number;
  hasExistingContent: boolean;
};

type BuildWorksheetModelPreviewParams = {
  prompt: string;
  worksheetName: string;
  tradePackage: string | null;
  memoryItems: AiMemoryItem[];
  currentWorksheetSummary?: CurrentWorksheetSummary | null;
  organizationConstructionContext?: string | null;
};

type WorksheetProviderColumn = {
  label: string;
  width: number | null;
};

type WorksheetProviderRow = {
  height: number | null;
};

type WorksheetProviderCell = {
  ref: string;
  value: string | number | null;
};

type WorksheetProviderFormula = {
  ref: string;
  formula: string;
};

type WorksheetProviderResponse = {
  worksheetName: string;
  columns: WorksheetProviderColumn[];
  rows: WorksheetProviderRow[];
  cells: WorksheetProviderCell[];
  formulas: WorksheetProviderFormula[];
  assumptions: string[];
  warnings: string[];
};

type WorksheetBuildIssue = {
  ruleKey: string;
  severity: "warning" | "error";
  result: "warning" | "failed";
  message: string;
  expectedValue?: Json | null;
  observedValue?: Json | null;
  details?: Record<string, Json>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createCell(value: string | number | null, overrides?: Partial<WorksheetCell>): WorksheetCell {
  return {
    value,
    type: typeof value === "number" ? "number" : value === null ? "empty" : "text",
    formula: null,
    computedValue: value,
    displayValue: value === null ? "" : String(value),
    metadata: {},
    ...overrides,
  };
}

function setCell(worksheet: WorksheetData, cellRef: string, cell: WorksheetCell) {
  worksheet.cells[cellRef] = cell;
}

function logWorksheetModelDebug(action: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[pricing-worksheet-model]", {
    action,
    ...payload,
  });
}

function parseJsonObjectFromText(payload: string): Record<string, unknown> | null {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const direct = JSON.parse(trimmed);
    return isRecord(direct) ? direct : null;
  } catch {
    const openBraceIndex = trimmed.indexOf("{");
    const closeBraceIndex = trimmed.lastIndexOf("}");
    if (openBraceIndex < 0 || closeBraceIndex <= openBraceIndex) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed.slice(openBraceIndex, closeBraceIndex + 1));
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function extractOpenAiResponseText(responseJson: unknown): string {
  if (!isRecord(responseJson)) {
    return "";
  }

  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim().length > 0) {
    return responseJson.output_text.trim();
  }

  const output = responseJson.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const outputItem of output) {
    if (!isRecord(outputItem)) {
      continue;
    }

    const content = outputItem.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (contentItem.type === "output_text" && typeof contentItem.text === "string") {
        chunks.push(contentItem.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function sanitizeText(value: unknown, maximumLength = 120) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function sanitizeStringArray(value: unknown, limit: number, maximumLength = 160) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => sanitizeText(entry, maximumLength))
    .filter((entry) => entry.length > 0)
    .slice(0, limit);
}

function toFiniteNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function columnIndexFromLabel(label: string) {
  let index = 0;
  for (let i = 0; i < label.length; i += 1) {
    const code = label.charCodeAt(i);
    if (code < 65 || code > 90) {
      return -1;
    }
    index = index * 26 + (code - 64);
  }
  return index - 1;
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

function parseCellReference(ref: string) {
  const normalized = sanitizeText(ref, 24).toUpperCase();
  const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(normalized);
  if (!match) {
    return null;
  }

  const columnIndex = columnIndexFromLabel(match[2]);
  const rowIndex = Number.parseInt(match[4], 10) - 1;
  if (columnIndex < 0 || rowIndex < 0) {
    return null;
  }

  return {
    normalized,
    columnLabel: match[2],
    rowLabel: String(rowIndex + 1),
    columnIndex,
    rowIndex,
  };
}

function normalizeWorksheetProviderColumn(value: unknown): WorksheetProviderColumn | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = sanitizeText(value.label, 60);
  const width = toFiniteNumberOrNull(value.width);
  if (!label) {
    return null;
  }

  return {
    label,
    width,
  };
}

function normalizeWorksheetProviderRow(value: unknown): WorksheetProviderRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    height: toFiniteNumberOrNull(value.height),
  };
}

function normalizeWorksheetProviderCell(value: unknown): WorksheetProviderCell | null {
  if (!isRecord(value)) {
    return null;
  }

  const ref = sanitizeText(value.ref, 24).toUpperCase();
  if (!parseCellReference(ref)) {
    return null;
  }

  const cellValue = value.value;
  if (
    typeof cellValue !== "string" &&
    typeof cellValue !== "number" &&
    cellValue !== null
  ) {
    return null;
  }

  return {
    ref,
    value: typeof cellValue === "string" ? cellValue.slice(0, 400) : cellValue,
  };
}

function normalizeWorksheetProviderFormula(value: unknown): WorksheetProviderFormula | null {
  if (!isRecord(value)) {
    return null;
  }

  const ref = sanitizeText(value.ref, 24).toUpperCase();
  const formula = typeof value.formula === "string" ? value.formula.trim() : "";
  if (!parseCellReference(ref) || !formula.startsWith("=") || formula.length > 400) {
    return null;
  }

  return {
    ref,
    formula,
  };
}

function normalizeWorksheetProviderResponse(value: unknown): WorksheetProviderResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const worksheetName = sanitizeText(value.worksheetName, 120);
  const columns = Array.isArray(value.columns)
    ? value.columns
        .map(normalizeWorksheetProviderColumn)
        .filter((entry): entry is WorksheetProviderColumn => entry !== null)
        .slice(0, MAX_COLUMNS)
    : [];
  const rows = Array.isArray(value.rows)
    ? value.rows
        .map(normalizeWorksheetProviderRow)
        .filter((entry): entry is WorksheetProviderRow => entry !== null)
        .slice(0, MAX_ROWS)
    : [];
  const cells = Array.isArray(value.cells)
    ? value.cells
        .map(normalizeWorksheetProviderCell)
        .filter((entry): entry is WorksheetProviderCell => entry !== null)
        .slice(0, MAX_CELLS)
    : [];
  const formulas = Array.isArray(value.formulas)
    ? value.formulas
        .map(normalizeWorksheetProviderFormula)
        .filter((entry): entry is WorksheetProviderFormula => entry !== null)
        .slice(0, MAX_CELLS)
    : [];
  const assumptions = sanitizeStringArray(value.assumptions, 12);
  const warnings = sanitizeStringArray(value.warnings, 12);

  if (!worksheetName || columns.length < 2 || rows.length < 2) {
    return null;
  }

  return {
    worksheetName,
    columns,
    rows,
    cells,
    formulas,
    assumptions,
    warnings,
  };
}

function buildWorksheetModelSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      worksheetName: { type: "string" },
      columns: {
        type: "array",
        minItems: 2,
        maxItems: MAX_COLUMNS,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            width: { type: ["number", "null"] },
          },
          required: ["label", "width"],
        },
      },
      rows: {
        type: "array",
        minItems: 2,
        maxItems: MAX_ROWS,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            height: { type: ["number", "null"] },
          },
          required: ["height"],
        },
      },
      cells: {
        type: "array",
        maxItems: MAX_CELLS,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ref: { type: "string" },
            value: { type: ["string", "number", "null"] },
          },
          required: ["ref", "value"],
        },
      },
      formulas: {
        type: "array",
        maxItems: MAX_CELLS,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ref: { type: "string" },
            formula: { type: "string" },
          },
          required: ["ref", "formula"],
        },
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["worksheetName", "columns", "rows", "cells", "formulas", "assumptions", "warnings"],
  } as const;
}

function buildMemorySummary(memoryItems: AiMemoryItem[]) {
  return memoryItems.slice(0, 4).map((item) => ({
    title: item.title,
    memoryCategory: item.memoryCategory,
    memoryType: item.memoryType,
    confidenceScore: item.confidenceScore,
    rowCount: typeof item.memoryValue.rowCount === "number" ? item.memoryValue.rowCount : null,
    columnCount: typeof item.memoryValue.columnCount === "number" ? item.memoryValue.columnCount : null,
    headers: Array.isArray(item.memoryValue.headers)
      ? item.memoryValue.headers.filter((entry): entry is string => typeof entry === "string").slice(0, 8)
      : [],
    summary: item.summary,
  }));
}

function buildSystemPrompt() {
  return [
    "You generate practical spreadsheet-style pricing worksheets for construction and commercial estimating.",
    "Return a direct worksheet grid schema only.",
    "Do not return an estimating intent abstraction, input keys, factor keys, productivity keys, trade constants, archetypes, or explanatory prose outside the JSON fields.",
    "The worksheet should directly map to the final grid TradesStack will preview.",
    "Use the columns array to define the visible worksheet columns.",
    "Use the rows array to define worksheet row count and optional row heights.",
    "Use the cells array for literal text and numeric values.",
    "Use the formulas array for calculated cells.",
    "Formulas must be simple and use only these capabilities: cell references, +, -, *, /, parentheses, SUM, ROUND, ROUNDUP, ROUNDDOWN, and IF.",
    "Do not use any other functions.",
    "Do not use external names, sheet-qualified references, named ranges, or unsupported formulas.",
    "Keep the worksheet usable, editable, and estimator-friendly.",
    "Prefer a clear header row and practical line items.",
    "If information is uncertain, include that in assumptions or warnings instead of inventing hidden constants.",
    "Return strict JSON only with no markdown fences.",
  ].join(" ");
}

function buildUserPrompt(params: {
  prompt: string;
  worksheetName: string;
  tradePackage: string | null;
  memoryItems: AiMemoryItem[];
  currentWorksheetSummary?: CurrentWorksheetSummary | null;
  organizationConstructionContext?: string | null;
}) {
  const currentWorksheetSummary = params.currentWorksheetSummary ?? {
    rowCount: 0,
    columnCount: 0,
    formulaCount: 0,
    populatedCellCount: 0,
    hasExistingContent: false,
  };

  return [
    `User request: ${params.prompt || `Generate a worksheet for ${params.worksheetName}.`}`,
    `Requested worksheet name: ${params.worksheetName}`,
    `Trade package: ${params.tradePackage ?? "Not specified"}`,
    params.organizationConstructionContext ?? null,
    `Current worksheet summary: ${JSON.stringify(currentWorksheetSummary)}`,
    `Organization memory examples for context only: ${JSON.stringify(buildMemorySummary(params.memoryItems))}`,
    "Output contract:",
    "- create a direct worksheet schema that can be previewed immediately",
    "- columns should define the main worksheet structure",
    "- rows should define row count and optional row heights",
    "- cells should define literals only",
    "- formulas should define calculated cells only",
    "- keep formulas simple and within the allowed subset",
    "- support arbitrary worksheet requests, not just trade-specific calculators",
    "- assumptions should be concise and useful",
    "- warnings should be concise and useful",
  ].filter((value): value is string => typeof value === "string").join("\n\n");
}

function buildIssueWarning(issue: WorksheetBuildIssue): AiValidationWarning {
  return {
    ruleKey: issue.ruleKey,
    severity: issue.severity,
    result: issue.result,
    message: issue.message,
    expectedValue: issue.expectedValue,
    observedValue: issue.observedValue,
    details: issue.details,
  };
}

function buildFormattedFormulaCell(formula: string) {
  return createCell(formula, {
    formula,
    computedValue: formula,
    displayValue: formula,
  });
}

function buildPromptHighlights(prompt: string) {
  return prompt
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 8);
}

function chooseMatchedMemory(memoryItems: AiMemoryItem[]) {
  return memoryItems[0] ?? null;
}

function validateFormulaSubset(
  formula: string,
  worksheet: WorksheetData,
  cellRef: string
): WorksheetBuildIssue[] {
  const issues: WorksheetBuildIssue[] = [];
  const trimmed = formula.trim();
  if (!trimmed.startsWith("=")) {
    issues.push({
      ruleKey: "ai_pricing_worksheet_formula_missing_equals",
      severity: "error",
      result: "failed",
      message: `Formula ${cellRef} must start with "=".`,
      details: { cellRef, formula },
    });
    return issues;
  }

  const expression = trimmed.slice(1).toUpperCase();
  const invalidCharacterMatch = expression.match(/[^A-Z0-9_$+\-*/().,:<>=\s]/);
  if (invalidCharacterMatch) {
    issues.push({
      ruleKey: "ai_pricing_worksheet_formula_invalid_character",
      severity: "error",
      result: "failed",
      message: `Formula ${cellRef} contains unsupported characters.`,
      details: { cellRef, formula, character: invalidCharacterMatch[0] },
    });
  }

  const functionNames = [...expression.matchAll(/\b([A-Z]+)\s*\(/g)].map((match) => match[1]);
  functionNames.forEach((functionName) => {
    if (!ALLOWED_FORMULA_FUNCTIONS.has(functionName)) {
      issues.push({
        ruleKey: "ai_pricing_worksheet_formula_function_unsupported",
        severity: "error",
        result: "failed",
        message: `Formula ${cellRef} uses unsupported function "${functionName}".`,
        details: { cellRef, formula, functionName },
      });
    }
  });

  const referenceMatches = expression.match(/\$?[A-Z]+\$?\d+/g) ?? [];
  referenceMatches.forEach((reference) => {
    const parsed = parseCellReference(reference);
    if (!parsed) {
      issues.push({
        ruleKey: "ai_pricing_worksheet_formula_reference_invalid",
        severity: "error",
        result: "failed",
        message: `Formula ${cellRef} contains an invalid cell reference "${reference}".`,
        details: { cellRef, formula, reference },
      });
      return;
    }

    if (parsed.columnIndex >= worksheet.columnCount || parsed.rowIndex >= worksheet.rowCount) {
      issues.push({
        ruleKey: "ai_pricing_worksheet_formula_reference_out_of_bounds",
        severity: "error",
        result: "failed",
        message: `Formula ${cellRef} references ${reference}, which is outside the generated worksheet bounds.`,
        details: {
          cellRef,
          formula,
          reference,
          rowCount: worksheet.rowCount,
          columnCount: worksheet.columnCount,
        },
      });
    }
  });

  const identifierPattern = new RegExp(
    `\\b(?:${[...ALLOWED_FORMULA_FUNCTIONS, "TRUE", "FALSE"].join("|")})\\b`,
    "g"
  );
  const scrubbedExpression = expression
    .replace(/\$?[A-Z]+\$?\d+/g, " ")
    .replace(identifierPattern, " ");
  const unsupportedIdentifiers = scrubbedExpression.match(/\b[A-Z_]+\b/g) ?? [];
  unsupportedIdentifiers.forEach((identifier) => {
    issues.push({
      ruleKey: "ai_pricing_worksheet_formula_identifier_unsupported",
      severity: "error",
      result: "failed",
      message: `Formula ${cellRef} uses unsupported identifier "${identifier}".`,
      details: { cellRef, formula, identifier },
    });
  });

  return issues;
}

function buildWorksheetFromSchema(params: {
  providerResponse: WorksheetProviderResponse;
  matchedMemory: AiMemoryItem | null;
  prompt: string;
  tradePackage: string | null;
}) {
  const issues: WorksheetBuildIssue[] = [];
  const highestReferencedColumnIndex = Math.max(
    params.providerResponse.columns.length - 1,
    ...params.providerResponse.cells
      .map((cell) => parseCellReference(cell.ref)?.columnIndex ?? 0),
    ...params.providerResponse.formulas
      .map((formula) => parseCellReference(formula.ref)?.columnIndex ?? 0)
  );
  const highestReferencedRowIndex = Math.max(
    params.providerResponse.rows.length - 1,
    ...params.providerResponse.cells
      .map((cell) => parseCellReference(cell.ref)?.rowIndex ?? 0),
    ...params.providerResponse.formulas
      .map((formula) => parseCellReference(formula.ref)?.rowIndex ?? 0)
  );

  const columnCount = clampNumber(highestReferencedColumnIndex + 1, 2, MAX_COLUMNS);
  const rowCount = clampNumber(highestReferencedRowIndex + 1, 2, MAX_ROWS);
  const worksheet = createDefaultWorksheetData({
    sheetName: params.providerResponse.worksheetName,
    columnCount,
    rowCount,
  });

  worksheet.columns = worksheet.columns.map((column, index) => ({
    ...column,
    width: clampNumber(
      params.providerResponse.columns[index]?.width ?? DEFAULT_COLUMN_WIDTH,
      72,
      420
    ),
  }));
  worksheet.rows = worksheet.rows.map((row, index) => ({
    ...row,
    height: clampNumber(
      params.providerResponse.rows[index]?.height ?? DEFAULT_ROW_HEIGHT,
      24,
      120
    ),
  }));

  params.providerResponse.columns.forEach((column, index) => {
    const ref = `${columnLabelFromIndex(index)}1`;
    setCell(worksheet, ref, createCell(column.label));
  });

  params.providerResponse.cells.forEach((cell) => {
    const parsed = parseCellReference(cell.ref);
    if (!parsed) {
      return;
    }

    if (parsed.columnIndex >= worksheet.columnCount || parsed.rowIndex >= worksheet.rowCount) {
      issues.push({
        ruleKey: "ai_pricing_worksheet_cell_out_of_bounds",
        severity: "error",
        result: "failed",
        message: `Cell ${cell.ref} is outside the generated worksheet bounds.`,
        details: { cellRef: cell.ref, rowCount: worksheet.rowCount, columnCount: worksheet.columnCount },
      });
      return;
    }

    setCell(worksheet, cell.ref, createCell(cell.value));
  });

  params.providerResponse.formulas.forEach((formulaEntry) => {
    const parsed = parseCellReference(formulaEntry.ref);
    if (!parsed) {
      return;
    }

    if (parsed.columnIndex >= worksheet.columnCount || parsed.rowIndex >= worksheet.rowCount) {
      issues.push({
        ruleKey: "ai_pricing_worksheet_formula_out_of_bounds",
        severity: "error",
        result: "failed",
        message: `Formula target ${formulaEntry.ref} is outside the generated worksheet bounds.`,
        details: { cellRef: formulaEntry.ref, rowCount: worksheet.rowCount, columnCount: worksheet.columnCount },
      });
      return;
    }

    issues.push(...validateFormulaSubset(formulaEntry.formula, worksheet, formulaEntry.ref));
    setCell(worksheet, formulaEntry.ref, buildFormattedFormulaCell(formulaEntry.formula));
  });

  const recalculatedWorksheet = recalculateWorksheetFormulas(worksheet);
  const structureSummary = summarizeWorksheetStructure(recalculatedWorksheet);

  Object.entries(recalculatedWorksheet.cells).forEach(([cellKey, cell]) => {
    if (
      cell?.displayValue === "#ERROR!" ||
      cell?.displayValue === "#REF!" ||
      cell?.displayValue === "#VALUE!" ||
      cell?.displayValue === "#DIV/0!" ||
      cell?.displayValue === "#CYCLE!"
    ) {
      issues.push({
        ruleKey: "ai_pricing_worksheet_formula_execution_failed",
        severity: "error",
        result: "failed",
        message: `Generated formula ${cellKey} could not be evaluated safely by the worksheet engine.`,
        details: { cellKey, displayValue: cell.displayValue },
      });
    }
  });

  if (structureSummary.columnCount < 2 || structureSummary.rowCount < 2) {
    issues.push({
      ruleKey: "ai_pricing_worksheet_structure_bounds",
      severity: "error",
      result: "failed",
      message: "The generated worksheet is smaller than the minimum supported size.",
      expectedValue: {
        minimumRowCount: 2,
        minimumColumnCount: 2,
      } as unknown as Json,
      observedValue: {
        rowCount: structureSummary.rowCount,
        columnCount: structureSummary.columnCount,
      } as unknown as Json,
    });
  }

  const sampleLineItems = Object.entries(recalculatedWorksheet.cells)
    .filter(([cellKey, cell]) => cellKey.startsWith("B") && !cellKey.endsWith("1") && typeof cell?.displayValue === "string")
    .map(([, cell]) => cell?.displayValue.trim() ?? "")
    .filter((value) => value.length > 0)
    .slice(0, 8);

  const validationWarnings: AiValidationWarning[] = [
    ...params.providerResponse.warnings.map((message) => ({
      ruleKey: "ai_pricing_worksheet_model_warning",
      severity: "warning" as const,
      result: "warning" as const,
      message,
    })),
    ...issues.map(buildIssueWarning),
  ];

  if (params.providerResponse.assumptions.length > 0) {
    validationWarnings.push({
      ruleKey: "ai_pricing_worksheet_assumptions_present",
      severity: "info",
      result: "passed",
      message: `Estimator assumptions captured: ${params.providerResponse.assumptions.slice(0, 3).join("; ")}`,
      details: {
        assumptions: params.providerResponse.assumptions,
      } as Record<string, Json>,
    });
  }

  return {
    worksheet: recalculatedWorksheet,
    compactOutput: {
      suggestionSource: params.matchedMemory ? "organization_memory" : "default_template",
      memoryItemId: params.matchedMemory?.id ?? null,
      worksheetName: params.providerResponse.worksheetName,
      tradePackage: params.tradePackage,
      prompt: params.prompt,
      rowCount: structureSummary.rowCount,
      columnCount: structureSummary.columnCount,
      formulaCount: structureSummary.formulaCount,
      populatedCellCount: structureSummary.populatedCellCount,
      confidence: params.matchedMemory
        ? Math.max(0.72, Math.min(0.94, params.matchedMemory.confidenceScore + 0.06))
        : 0.72,
      headers: params.providerResponse.columns.map((column) => column.label).slice(0, 8),
      promptHighlights: buildPromptHighlights(params.prompt),
      sampleLineItems,
      assumptions: params.providerResponse.assumptions.slice(0, 12),
    },
    matchedMemory: params.matchedMemory,
    validationWarnings,
  } satisfies PricingWorksheetScaffoldPreview;
}

function extractOpenAiErrorMessage(payload: string) {
  const parsed = parseJsonObjectFromText(payload);
  if (!parsed) {
    return null;
  }

  const error = parsed.error;
  if (!isRecord(error)) {
    return null;
  }

  if (typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return null;
}

function buildFallbackReason(baseReason: string, issues: AiValidationWarning[]) {
  const detailMessages = issues
    .filter((issue) => issue.result === "failed" || issue.severity === "error" || issue.severity === "critical")
    .map((issue) => issue.message)
    .slice(0, 3);

  if (detailMessages.length === 0) {
    return baseReason;
  }

  return `${baseReason} Reason: ${detailMessages.join(" ")}`;
}

export function getPricingWorksheetModelConfig() {
  const candidates = [
    process.env.OPENAI_WORKSHEET_MODEL,
    process.env.OPENAI_WORKSHEET_FALLBACK_MODEL,
    DEFAULT_WORKSHEET_PRIMARY_MODEL,
    DEFAULT_WORKSHEET_FALLBACK_MODEL,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  const models = [...new Set(candidates)];

  return {
    provider: "openai" as const,
    model: models[0] ?? DEFAULT_WORKSHEET_PRIMARY_MODEL,
    models,
  };
}

function shouldRetryWorksheetProviderStatus(status: number) {
  return status >= 500 && status < 600;
}

function modelSupportsTemperature(model: string) {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith("gpt-5.5") || normalized.startsWith("gpt-5.4")) {
    return false;
  }
  return true;
}

function isUnsupportedTemperatureError(status: number, errorMessage: string | null, responseSnippet: string) {
  if (status !== 400) {
    return false;
  }

  const haystack = `${errorMessage ?? ""}\n${responseSnippet}`.toLowerCase();
  return haystack.includes("temperature") && haystack.includes("not supported");
}

export async function buildPricingWorksheetScaffoldPreviewWithModel(
  params: BuildWorksheetModelPreviewParams
): Promise<{
  preview: PricingWorksheetScaffoldPreview;
  generationMeta: WorksheetPreviewGenerationMeta;
}> {
  const matchedMemory = chooseMatchedMemory(params.memoryItems);
  const fallbackPreview = (reason: string, details?: Record<string, unknown>) => {
    if (details) {
      logWorksheetModelDebug("fallback", { reason, ...details });
    }

    const localPreview = buildPricingWorksheetScaffoldPreview({
      prompt: params.prompt,
      worksheetName: params.worksheetName,
      tradePackage: params.tradePackage,
      memoryItems: params.memoryItems,
    });

    localPreview.validationWarnings.unshift({
      ruleKey: "ai_pricing_worksheet_model_fallback",
      severity: "warning",
      result: "warning",
      message: reason,
    });

    return {
      preview: localPreview,
      generationMeta: {
        provider: "tradesstack" as const,
        model: "pricing-worksheet-generic-fallback-v1",
        fallbackUsed: true,
        fallbackReason: reason,
      },
    };
  };

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    return fallbackPreview("OpenAI is not configured for worksheet generation, so a generic calculator was created.");
  }

  const { models } = getPricingWorksheetModelConfig();
  const responseSchema = buildWorksheetModelSchema();

  let responseJson: unknown;
  let successfulModel: string | null = null;
  try {
    let finalRetryableFailure:
      | {
          model: string;
          status: number;
          errorMessage: string | null;
          responseSnippet: string;
          attemptNumber: number;
        }
      | null = null;

    for (let attemptIndex = 0; attemptIndex < models.length; attemptIndex += 1) {
      const model = models[attemptIndex];
      const includeTemperature = modelSupportsTemperature(model);
      const baseRequestBody = {
        model,
        max_output_tokens: WORKSHEET_AI_MAX_OUTPUT_TOKENS,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: buildSystemPrompt() }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: buildUserPrompt(params) }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "pricing_worksheet_grid_output",
            schema: responseSchema,
            strict: true,
          },
        },
      } as Record<string, unknown>;
      const requestBody = includeTemperature
        ? {
            ...baseRequestBody,
            temperature: 0.1,
          }
        : baseRequestBody;
      const serializedBody = JSON.stringify(requestBody);
      const attemptNumber = attemptIndex + 1;
      const isFallbackModel = attemptIndex > 0;

      logWorksheetModelDebug("provider_request", {
        model,
        attemptNumber,
        providerSchemaVersion: WORKSHEET_PROVIDER_SCHEMA_VERSION,
        payloadBytes: Buffer.byteLength(serializedBody, "utf8"),
        maxOutputTokens: WORKSHEET_AI_MAX_OUTPUT_TOKENS,
        timeoutMs: WORKSHEET_AI_TIMEOUT_MS,
        fallbackModelUsed: isFallbackModel,
        temperatureOmitted: !includeTemperature,
      });

      let openAiResponse = await fetchWithTimeout(
        OPENAI_API_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiApiKey}`,
          },
          body: serializedBody,
        },
        WORKSHEET_AI_TIMEOUT_MS
      );

      if (!openAiResponse.ok) {
        let errorBody = await openAiResponse.text();
        let errorMessage = extractOpenAiErrorMessage(errorBody);
        let responseSnippet = errorBody.slice(0, 1200);
        const shouldRetryWithoutTemperature =
          includeTemperature && isUnsupportedTemperatureError(openAiResponse.status, errorMessage, responseSnippet);

        if (shouldRetryWithoutTemperature) {
          const retryBody = JSON.stringify(baseRequestBody);
          logWorksheetModelDebug("provider_retry_without_temperature", {
            model,
            attemptNumber,
            providerSchemaVersion: WORKSHEET_PROVIDER_SCHEMA_VERSION,
            status: openAiResponse.status,
            payloadBytes: Buffer.byteLength(retryBody, "utf8"),
          });

          openAiResponse = await fetchWithTimeout(
            OPENAI_API_URL,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openAiApiKey}`,
              },
              body: retryBody,
            },
            WORKSHEET_AI_TIMEOUT_MS
          );

          if (openAiResponse.ok) {
            responseJson = await openAiResponse.json();
            successfulModel = model;
            break;
          }

          errorBody = await openAiResponse.text();
          errorMessage = extractOpenAiErrorMessage(errorBody);
          responseSnippet = errorBody.slice(0, 1200);
        }

        const retryable = shouldRetryWorksheetProviderStatus(openAiResponse.status) && attemptIndex < models.length - 1;

        logWorksheetModelDebug("provider_error", {
          model,
          attemptNumber,
          providerSchemaVersion: WORKSHEET_PROVIDER_SCHEMA_VERSION,
          status: openAiResponse.status,
          errorMessage,
          responseSnippet,
          fallbackModelUsed: isFallbackModel,
          temperatureOmitted: !includeTemperature || shouldRetryWithoutTemperature,
          willRetry: retryable,
        });

        if (retryable) {
          finalRetryableFailure = {
            model,
            status: openAiResponse.status,
            errorMessage,
            responseSnippet,
            attemptNumber,
          };
          continue;
        }

        return fallbackPreview(
          `OpenAI worksheet generation failed with status ${openAiResponse.status}, so a generic calculator was created.`,
          {
            model,
            attemptNumber,
            providerSchemaVersion: WORKSHEET_PROVIDER_SCHEMA_VERSION,
            status: openAiResponse.status,
            errorMessage,
            responseSnippet,
            fallbackModelUsed: isFallbackModel,
            finalFallbackReason: `provider_status_${openAiResponse.status}`,
          }
        );
      }

      responseJson = await openAiResponse.json();
      successfulModel = model;
      break;
    }

    if (!responseJson) {
      return fallbackPreview(
        `OpenAI worksheet generation failed with status ${finalRetryableFailure?.status ?? 520}, so a generic calculator was created.`,
        {
          model: finalRetryableFailure?.model ?? models[models.length - 1] ?? null,
          attemptNumber: finalRetryableFailure?.attemptNumber ?? models.length,
          providerSchemaVersion: WORKSHEET_PROVIDER_SCHEMA_VERSION,
          status: finalRetryableFailure?.status ?? 520,
          errorMessage: finalRetryableFailure?.errorMessage ?? null,
          responseSnippet: finalRetryableFailure?.responseSnippet ?? "",
          fallbackModelUsed: true,
          finalFallbackReason: "provider_retry_exhausted",
        }
      );
    }
  } catch (error) {
    logWorksheetModelDebug("provider_exception", {
      models,
      providerSchemaVersion: WORKSHEET_PROVIDER_SCHEMA_VERSION,
      errorMessage: error instanceof Error ? error.message : "Unknown provider error",
    });
    return fallbackPreview(
      error instanceof Error
        ? `OpenAI worksheet generation could not complete (${error.message}), so a generic calculator was created.`
        : "OpenAI worksheet generation could not complete, so a generic calculator was created."
    );
  }

  const outputText = extractOpenAiResponseText(responseJson);
  const parsedOutput = parseJsonObjectFromText(outputText);
  const providerResponse = normalizeWorksheetProviderResponse(parsedOutput);

  if (!providerResponse) {
    return fallbackPreview("OpenAI returned invalid worksheet JSON, so a generic calculator was created.", {
      outputTextPreview: outputText.slice(0, 600),
      providerSchemaVersion: WORKSHEET_PROVIDER_SCHEMA_VERSION,
    });
  }

  const builtPreview = buildWorksheetFromSchema({
    providerResponse,
    matchedMemory,
    prompt: params.prompt,
    tradePackage: params.tradePackage,
  });

  const failedWarnings = builtPreview.validationWarnings.filter(
    (warning) => warning.result === "failed" || warning.severity === "error" || warning.severity === "critical"
  );

  if (failedWarnings.length > 0) {
    return fallbackPreview(
      buildFallbackReason(
        "OpenAI returned worksheet schema that could not be converted safely, so a generic calculator was created.",
        failedWarnings
      ),
      {
        rejectionReason: "validation_failed",
        warningMessages: failedWarnings.map((warning) => warning.message),
      }
    );
  }

  logWorksheetModelDebug("preview_built", {
    provider: "openai",
    model: successfulModel ?? models[0] ?? null,
    providerSchemaVersion: WORKSHEET_PROVIDER_SCHEMA_VERSION,
    rowCount: builtPreview.compactOutput.rowCount,
    formulaCount: builtPreview.compactOutput.formulaCount,
    sampleLineItems: builtPreview.compactOutput.sampleLineItems,
  });

  return {
    preview: builtPreview,
    generationMeta: {
      provider: "openai",
      model: successfulModel ?? models[0] ?? "unknown",
      fallbackUsed: false,
      fallbackReason: null,
    },
  };
}
