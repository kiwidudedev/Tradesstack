import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { getCellFormat } from "@/lib/opportunity-pricing-worksheet-formatting";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import {
  extractBalancedJsonObject,
  extractPricingWorksheetAssistantPayload,
  type PricingWorksheetAssistantPayloadDiagnostics,
  type PricingWorksheetAssistantPayloadExtraction,
} from "@/lib/ai/providers/pricing-worksheet/openai-provider";
import {
  getPricingWorksheetAiProvider,
  getPricingWorksheetAiProviderName,
  getPricingWorksheetAnthropicModel,
  getPricingWorksheetOpenAiModel,
} from "@/lib/ai/providers/pricing-worksheet/registry";
import {
  convertAnthropicWorksheetDraftToOperations,
  isAnthropicWorksheetDraftResponse,
} from "@/lib/ai/providers/pricing-worksheet/anthropic-draft-to-operations";
import {
  buildPricingWorksheetAiContext,
  extractPricingWorksheetPromptRowReferences,
} from "@/lib/pricing-worksheet-ai-context";
import {
  buildPricingWorksheetAiStructureSnapshot,
  detectPricingWorksheetState,
  summarizePricingWorksheetStructureSnapshot,
  type PricingWorksheetState,
  type PricingWorksheetStructureSnapshot,
} from "@/lib/pricing-worksheet-ai-structure-snapshot";
import { compileAiWorksheetFormula } from "@/lib/pricing-worksheet-ai-formula-compiler";
import { parsePricingWorksheetFormula } from "@/lib/pricing-worksheet-formula-parser";
import {
  isPricingWorksheetProviderError,
  createPricingWorksheetProviderError,
  type PricingWorksheetProviderError,
} from "@/lib/ai/providers/pricing-worksheet/types";
import type { AiMemoryItem } from "@/lib/ai-lifecycle-server";
import {
  classifyPricingWorksheetConstructionIntent,
  type PricingWorksheetConstructionIntent,
} from "@/lib/pricing-worksheet-construction-intent";
import type {
  PricingWorksheetAiCompactContext,
  PricingWorksheetAiContextRowSummary,
} from "@/lib/pricing-worksheet-ai-context";
import type { PricingWorksheetOrganizationGuidance } from "@/lib/pricing-worksheet-organization-guidance";
import {
  batchPricingWorksheetAiOperationsForSafePreview,
  getPricingWorksheetAiFormulaCompatibility,
  buildPricingWorksheetAiAssistantSchema,
  buildPricingWorksheetAiSuggestedEditSelectionResponse,
  inspectPricingWorksheetAiOperationNormalization,
  normalizePricingWorksheetAiAssistantResponse,
  simulatePricingWorksheetAiEditPlan,
  type PricingWorksheetAiCellValueEntry,
  type PricingWorksheetAiAssistantResponse,
  type PricingWorksheetAiAssistantMode,
  type PricingWorksheetAiConfidence,
  type PricingWorksheetAiEvidenceSource,
  type PricingWorksheetAiFormulaEntry,
  type PricingWorksheetAiFindingStatus,
  type PricingWorksheetAiReviewFinding,
  type PricingWorksheetAiReviewSummary,
  type PricingWorksheetAiOperation,
  type PricingWorksheetAiSuggestedEditGroup,
  type PricingWorksheetAiValidationIssue,
} from "@/lib/pricing-worksheet-edit-plan";
import { validateGeneratedPricingWorksheetCompleteness } from "@/lib/pricing-worksheet-generated-sheet-completeness";
import { startPricingWorksheetPerformanceMeasure } from "@/lib/pricing-worksheet-performance";

export {
  extractBalancedJsonObject,
  extractPricingWorksheetAssistantPayload,
};
export type {
  PricingWorksheetAssistantPayloadDiagnostics,
  PricingWorksheetAssistantPayloadExtraction,
};

const WORKSHEET_AI_TIMEOUT_MS = 75_000;
const WORKSHEET_AI_DEFAULT_TIMEOUT_MS = 45_000;
const WORKSHEET_AI_GENERATION_TIMEOUT_MS = 60_000;
const WORKSHEET_AI_RETRIEVAL_GENERATION_TIMEOUT_MS = 90_000;
const WORKSHEET_AI_MAX_OUTPUT_TOKENS = 5000;
const WORKSHEET_AI_GENERATION_MAX_OUTPUT_TOKENS = 6500;
const WORKSHEET_AI_GENERATION_COMPACT_RETRY_MAX_OUTPUT_TOKENS = 4500;
const WORKSHEET_AI_TRUNCATION_RETRY_MAX_OUTPUT_TOKENS = 10000;
const WORKSHEET_AI_MAX_PROVIDER_ATTEMPTS = 3;
const WORKSHEET_AI_MAX_GENERATION_PROVIDER_ATTEMPTS = 1;
const WORKSHEET_AI_STAGE_MAX_PROVIDER_CALLS = 2;
const WORKSHEET_AI_ANTHROPIC_STAGE_A_MAX_OUTPUT_TOKENS = 2800;
const WORKSHEET_AI_FORMULA_STAGE_MAX_OUTPUT_TOKENS = 3000;
const WORKSHEET_AI_FORMULA_STAGE_MAX_SUGGESTIONS = 16;
const WORKSHEET_AI_FORMULA_STAGE_MAX_INPUT_TOKENS = 7000;
const WORKSHEET_AI_FORMULA_STAGE_OVERSIZE_WARNING =
  "Formula generation was skipped because the worksheet formula context was too large. Try selecting a smaller section or asking for formulas for one section at a time.";

type PricingWorksheetAiFormulaSuggestion = {
  targetRowNumber: number;
  targetColumn: string;
  expression: string;
  rationale: string;
};

type PricingWorksheetAiFormattingSuggestion = {
  type: "format_cell" | "format_cells";
  targetCells: string[];
  backgroundColor: string | null;
  textColor: string | null;
  bold: boolean | null;
  italic: boolean | null;
  rationale: string;
};

type PricingWorksheetAiEditIntentSuggestion = {
  action: "set_cell_value" | "set_cells_value" | "insert_row_after" | "insert_subtotal";
  targetCell: string | null;
  targetCells: string[];
  values: Array<{
    ref: string | null;
    column: string | null;
    value: string;
  }>;
  afterRowNumber: number | null;
  subtotalLabel: string | null;
  rationale: string;
};

type AnthropicWorkflow =
  | "staged_generation"
  | "formula_suggestions"
  | "formatting"
  | "review"
  | "compact_edit_intent"
  | "answer_only"
  | "safe_unknown_fallback";

type FormulaStageContextBudgetLevel = 0 | 1 | 2 | 3 | 4;

type FormulaStageContextBudget = {
  snapshot: PricingWorksheetStructureSnapshot;
  constructionSummary: ReturnType<typeof buildAnthropicConstructionSummary>;
  assumptionRows: ReturnType<typeof buildAnthropicAssumptionRowSummary>;
  formulaContextSummary: PricingWorksheetAiFormulaContextSummary | null;
  stageAssumptions: string[];
  stageWarnings: string[];
  userPrompt: string;
  compactionLevel: FormulaStageContextBudgetLevel;
  tokenBreakdown: {
    systemPromptTokens: number;
    userPromptTokens: number;
    snapshotTokens: number;
    constructionSummaryTokens: number;
    assumptionRowsTokens: number;
    totalEstimatedTokens: number;
    maxAllowedTokens: number;
    budgetTier: PricingWorksheetStructureSnapshot["budgetTier"];
    formulaTargetRowCount: number;
    compactionLevel: FormulaStageContextBudgetLevel;
  };
  blockedMessage?: string;
};

type PricingWorksheetAiFormulaContextSummary = {
  focusedRowNumbers: number[];
  focusedSectionTitles: string[];
  existingFormulaRows: Array<{
    rowNumber: number;
    label: string | null;
    sectionName: string | null;
    formulas: Array<{
      ref: string;
      formula: string;
      referencedRows: number[];
    }>;
  }>;
  omittedFormulaRowRanges: Array<{
    startRow: number;
    endRow: number;
  }>;
  note: string | null;
};

function isAnthropicEmptyOperationRetryEnabled() {
  return process.env.PRICING_WORKSHEET_ANTHROPIC_EMPTY_OPERATION_RETRY === "true";
}

type PricingWorksheetProviderResponseFailureReason =
  | "missing_structured_output"
  | "malformed_json"
  | "truncated_json"
  | "schema_normalization_failed"
  | "no_assistant_message"
  | "unsupported_provider_shape"
  | "provider_tool_only_response"
  | "provider_returned_empty_response";

export type PricingWorksheetAiProviderSettings = {
  timeoutMs: number;
  maxProviderAttempts: number;
  maxOutputTokens: number;
  webSearchEnabled: boolean;
};

function logEditAssistantDebug(action: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[pricing-worksheet-edit-assistant]", {
    action,
    ...payload,
  });
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
    };
  }

  const maybeCause = error as Error & { cause?: unknown; code?: string };
  return {
    name: error.name,
    message: error.message,
    code: maybeCause.code ?? null,
    cause:
      maybeCause.cause instanceof Error
        ? {
            name: maybeCause.cause.name,
            message: maybeCause.cause.message,
          }
        : maybeCause.cause ?? null,
  };
}

async function waitForRetry(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

type BuildPricingWorksheetEditAssistantParams = {
  prompt: string;
  worksheet: WorksheetData;
  worksheetContext: PricingWorksheetAiCompactContext;
  memoryItems: AiMemoryItem[];
  organizationConstructionContext?: string | null;
  classification?: PricingWorksheetConstructionIntent;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
  providerOptions?: {
    webSearchEnabled?: boolean;
  };
  internalFlags?: {
    anthropicWorkflowOverride?: AnthropicWorkflow | null;
    formattingToGenerationFallbackUsed?: boolean;
    formulaToGenerationFallbackUsed?: boolean;
  };
};

export type PricingWorksheetAiFollowUpContext = {
  previousReviewFindings?: PricingWorksheetAiReviewFinding[];
  previousReviewSummary?: (PricingWorksheetAiReviewSummary & { summary?: string }) | null;
  previousSuggestedEditGroups?: PricingWorksheetAiSuggestedEditGroup[];
  acceptedFindingIds?: string[];
  rejectedFindingIds?: string[];
  appliedEditGroupIds?: string[];
  userCorrection?: string | null;
};

export type PricingWorksheetAiAssistantGenerationMeta = {
  provider: "openai" | "anthropic" | "tradesstack";
  model: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
};

export type PricingWorksheetAiAssistantProviderAudit = {
  requestedProvider: "openai" | "anthropic";
  requestedModel: string;
  actualProvider: "openai" | "anthropic" | null;
  actualModel: string | null;
  webSearchEnabled: boolean;
};

export type PricingWorksheetAiContinuationBatch = {
  id: string;
  title: string;
  purpose: string;
  operations: PricingWorksheetAiOperation[];
  changedCellCount: number;
};

export type PricingWorksheetAiContinuationPlan = {
  strategy: "safe_generation_batches";
  currentBatchIndex: number;
  totalBatchCount: number;
  remainingBatchCount: number;
  remainingOperationCount: number;
  message: string;
  remainingBatches: PricingWorksheetAiContinuationBatch[];
};

export type PricingWorksheetAiAssistantPreview = {
  mode: PricingWorksheetAiAssistantMode;
  proposalName: string;
  answer: string;
  summary: string;
  confidence: PricingWorksheetAiConfidence;
  operations: PricingWorksheetAiOperation[];
  assumptions: string[];
  warnings: string[];
  reviewFindings: PricingWorksheetAiReviewFinding[];
  reviewSummary: PricingWorksheetAiReviewSummary | null;
  suggestedEditGroups: PricingWorksheetAiSuggestedEditGroup[];
  evidenceSources: PricingWorksheetAiEvidenceSource[];
  worksheet: WorksheetData;
  diffSummary: {
    changedCells: string[];
    formulaCells: string[];
    formattingCells: string[];
    insertedRows: number[];
    affectedRows: number[];
  };
  diffPreview: {
    changedCells: Array<{
      ref: string;
      row: number;
      sectionName: string | null;
      beforeValue: string;
      afterValue: string;
      beforeFormula: string | null;
      afterFormula: string | null;
      beforeFormattingSummary: string | null;
      afterFormattingSummary: string | null;
    }>;
    insertedRows: Array<{
      row: number;
      sectionName: string | null;
      values: string[];
      formulaRefs: string[];
    }>;
    affectedSections: string[];
    formulaChanges: Array<{
      ref: string;
      beforeFormula: string | null;
      afterFormula: string | null;
    }>;
    formattingChanges: Array<{
      ref: string;
      row: number;
      sectionName: string | null;
      beforeFormattingSummary: string | null;
      afterFormattingSummary: string | null;
    }>;
  };
  storageSummary: {
    responseMode: PricingWorksheetAiAssistantMode;
    sanitizedOperations: Array<{
      type: string;
      target: Record<string, string | string[] | number | null>;
      values: Array<{
        ref: string | null;
        column: string | null;
        value: string | number | boolean | null;
      }>;
      formulas: Array<{
        ref: string | null;
        column: string | null;
        formula: string;
      }>;
      rationale: string;
    }>;
    affectedCellRefs: string[];
    formulaChangeSummary: Array<{
      ref: string;
      beforeFormula: string | null;
      afterFormula: string | null;
    }>;
    formattingChangeSummary: Array<{
      ref: string;
      beforeFormattingSummary: string | null;
      afterFormattingSummary: string | null;
    }>;
    insertedRowSummary: Array<{
      row: number;
      sectionName: string | null;
    }>;
    affectedSections: string[];
    assumptions: string[];
    warnings: string[];
    organizationGuidance?: {
      itemCount: number;
      summary: string;
      items: Array<{
        type: string;
        title: string;
        guidance: string;
        confidence: PricingWorksheetAiConfidence;
      }>;
    };
    evidenceSources?: PricingWorksheetAiEvidenceSource[];
    reviewFindings?: PricingWorksheetAiReviewFinding[];
    reviewSummary?: PricingWorksheetAiReviewSummary | null;
    suggestedEditGroups?: Array<{
      id: string;
      title: string;
      purpose: string;
      confidence: PricingWorksheetAiConfidence;
      relatedFindingIds: string[];
      operationTypes: string[];
    }>;
    continuation?: {
      strategy: PricingWorksheetAiContinuationPlan["strategy"];
      currentBatchIndex: number;
      totalBatchCount: number;
      remainingBatchCount: number;
      remainingOperationCount: number;
    } | null;
  };
  validationIssues: PricingWorksheetAiValidationIssue[];
  validationWarnings: Array<{
    ruleKey: string;
    severity: "info" | "warning" | "error" | "critical";
    result: "passed" | "failed" | "warning" | "overridden";
    message: string;
  }>;
  compactOutput: {
    worksheetName: string;
    tradePackage: string | null;
    suggestionSource: "memory" | "default";
    confidence: PricingWorksheetAiConfidence;
    rowCount: number;
    columnCount: number;
    formulaCount: number;
    populatedCellCount: number;
    sectionCounts: {
      sections: number;
      rows: number;
      operations: number;
    };
    headers: string[];
    sections: string[];
    assumptions: string[];
    warnings: string[];
    promptHighlights: string[];
    sampleLineItems: string[];
  };
  matchedMemory: {
    id: string;
    title: string;
    summary: string;
  } | null;
  contextSummary: {
    matchedMemoryCount: number;
    organizationGuidanceCount?: number;
    summary: string;
  };
  classification: PricingWorksheetConstructionIntent;
  continuation: PricingWorksheetAiContinuationPlan | null;
};

type CurrentWorksheetSummary = {
  rowCount: number;
  columnCount: number;
  formulaCount: number;
  populatedCellCount: number;
};

function parseCellRef(ref: string): { columnId: string; rowNumber: number } | null {
  const match = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    columnId: match[1],
    rowNumber: Number(match[2]),
  };
}

function getCellAtRef(worksheet: WorksheetData, ref: string) {
  const parsed = parseCellRef(ref);
  if (!parsed) {
    return null;
  }

  const row = worksheet.rows[parsed.rowNumber - 1];
  if (!row) {
    return null;
  }

  const column = worksheet.columns.find((entry) => entry.id === parsed.columnId);
  if (!column) {
    return null;
  }

  return worksheet.cells[buildWorksheetCellKey(column.id, row.id)] ?? null;
}

function getCellDisplayValue(worksheet: WorksheetData, ref: string) {
  const cell = getCellAtRef(worksheet, ref);
  if (!cell) {
    return {
      value: "",
      formula: null as string | null,
    };
  }

  return {
    value: cell.displayValue || (cell.value === null ? "" : String(cell.value)),
    formula: typeof cell.formula === "string" && cell.formula.trim().length > 0 ? cell.formula : null,
  };
}

function getCellFormattingSummary(worksheet: WorksheetData, ref: string) {
  const cell = getCellAtRef(worksheet, ref);
  const format = getCellFormat(cell ?? undefined);
  const parts: string[] = [];

  if (format.fill?.color) {
    parts.push(`fill ${format.fill.color}`);
  }
  if (format.text?.color) {
    parts.push(`text ${format.text.color}`);
  }
  if (format.text?.bold) {
    parts.push("bold");
  }
  if (format.text?.italic) {
    parts.push("italic");
  }
  if (format.border?.top || format.border?.right || format.border?.bottom || format.border?.left) {
    parts.push("border");
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

function findSectionNameForRow(
  contextRows: PricingWorksheetAiContextRowSummary[],
  rowNumber: number,
): string | null {
  let nearest: string | null = null;
  for (const row of contextRows) {
    if (row.row > rowNumber) {
      break;
    }
    if (row.sectionHint) {
      nearest = row.sectionHint;
    }
  }
  return nearest;
}

function getOperationValueEntries(operation: PricingWorksheetAiOperation): PricingWorksheetAiCellValueEntry[] {
  return Array.isArray(operation.values?.cells) ? operation.values?.cells ?? [] : [];
}

function getOperationFormulaEntries(operation: PricingWorksheetAiOperation): PricingWorksheetAiFormulaEntry[] {
  return Array.isArray(operation.formulas?.cells) ? operation.formulas?.cells ?? [] : [];
}

function sanitizeOperation(operation: PricingWorksheetAiOperation) {
  return {
    type: operation.type,
    target: {
      cell: operation.target?.cell ?? null,
      cells: operation.target?.cells ?? null,
      row: operation.target?.row ?? null,
      sourceRow: operation.target?.sourceRow ?? null,
      insertAfterRow: operation.target?.insertAfterRow ?? null,
      insertBeforeRow: operation.target?.insertBeforeRow ?? null,
      startRow: operation.target?.startRow ?? null,
      endRow: operation.target?.endRow ?? null,
      sectionName: operation.target?.sectionName ?? null,
      totalColumn: operation.target?.totalColumn ?? null,
      labelColumn: operation.target?.labelColumn ?? null,
    },
    values: getOperationValueEntries(operation).slice(0, 16).map((entry) => ({
      ref: entry.ref ?? null,
      column: entry.column ?? null,
      value: entry.value ?? null,
    })),
    formulas: getOperationFormulaEntries(operation).slice(0, 16).map((entry) => ({
      ref: entry.ref ?? null,
      column: entry.column ?? null,
      formula: entry.formula,
    })),
    format: operation.format
      ? {
          backgroundColor: operation.format.backgroundColor ?? null,
          textColor: operation.format.textColor ?? null,
          bold: operation.format.bold ?? null,
          italic: operation.format.italic ?? null,
          border: operation.format.border ?? null,
        }
      : null,
    rationale: operation.rationale?.trim() ?? "",
  };
}

function buildDiffPreview(
  originalWorksheet: WorksheetData,
  nextWorksheet: WorksheetData,
  worksheetContext: PricingWorksheetAiCompactContext,
  diffSummary: {
    changedCells: string[];
    formulaCells: string[];
    insertedRows: number[];
    affectedRows: number[];
  },
) {
  const changedCells = diffSummary.changedCells.slice(0, 24).map((ref) => {
    const parsed = parseCellRef(ref);
    const before = getCellDisplayValue(originalWorksheet, ref);
    const after = getCellDisplayValue(nextWorksheet, ref);
    return {
      ref,
      row: parsed?.rowNumber ?? 0,
      sectionName: parsed ? findSectionNameForRow(worksheetContext.rows, parsed.rowNumber) : null,
      beforeValue: before.value,
      afterValue: after.value,
      beforeFormula: before.formula,
      afterFormula: after.formula,
      beforeFormattingSummary: getCellFormattingSummary(originalWorksheet, ref),
      afterFormattingSummary: getCellFormattingSummary(nextWorksheet, ref),
    };
  });

  const insertedRows = diffSummary.insertedRows.slice(0, 12).map((rowNumber) => {
    const row = nextWorksheet.rows[rowNumber - 1];
    const values: string[] = [];
    const formulaRefs: string[] = [];

    if (row) {
      for (let columnIndex = 0; columnIndex < Math.min(nextWorksheet.columns.length, 8); columnIndex += 1) {
        const column = nextWorksheet.columns[columnIndex];
        const cell = nextWorksheet.cells[buildWorksheetCellKey(column.id, row.id)];
        if (!cell) {
          continue;
        }

        if (cell.displayValue?.trim()) {
          values.push(cell.displayValue.trim());
        }

        if (cell.formula?.trim()) {
          formulaRefs.push(`${column.id}${rowNumber}`);
        }
      }
    }

    return {
      row: rowNumber,
      sectionName: findSectionNameForRow(worksheetContext.rows, rowNumber),
      values: values.slice(0, 5),
      formulaRefs: formulaRefs.slice(0, 6),
    };
  });

  const formulaChanges = changedCells
    .filter((entry) => entry.beforeFormula !== entry.afterFormula && (entry.beforeFormula || entry.afterFormula))
    .slice(0, 16)
    .map((entry) => ({
      ref: entry.ref,
      beforeFormula: entry.beforeFormula,
      afterFormula: entry.afterFormula,
    }));

  const affectedSections = Array.from(
    new Set(
      diffSummary.affectedRows
        .map((rowNumber) => findSectionNameForRow(worksheetContext.rows, rowNumber))
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 12);

  const formattingChanges = changedCells
    .filter(
      (entry) =>
        entry.beforeFormattingSummary !== entry.afterFormattingSummary &&
        (entry.beforeFormattingSummary || entry.afterFormattingSummary),
    )
    .slice(0, 24)
    .map((entry) => ({
      ref: entry.ref,
      row: entry.row,
      sectionName: entry.sectionName,
      beforeFormattingSummary: entry.beforeFormattingSummary,
      afterFormattingSummary: entry.afterFormattingSummary,
    }));

  return {
    changedCells,
    insertedRows,
    affectedSections,
    formulaChanges,
    formattingChanges,
  };
}

export function getPricingWorksheetEditAssistantModelConfig() {
  const provider = getPricingWorksheetAiProviderName();
  return {
    provider,
    model: provider === "anthropic" ? getPricingWorksheetAnthropicModel() : getPricingWorksheetOpenAiModel(),
  };
}

function buildEvidenceSourceDedupKey(source: Pick<PricingWorksheetAiEvidenceSource, "title" | "url">): string {
  const normalizedUrl = source.url?.trim().toLowerCase();
  if (normalizedUrl) {
    return normalizedUrl;
  }

  return source.title.trim().toLowerCase();
}

function mergeEvidenceSources(
  modelSources: PricingWorksheetAiEvidenceSource[],
  providerSources: PricingWorksheetAiEvidenceSource[],
): PricingWorksheetAiEvidenceSource[] {
  const merged: PricingWorksheetAiEvidenceSource[] = [];

  for (const source of [...providerSources, ...modelSources]) {
    const existingIndex = merged.findIndex((entry) => buildEvidenceSourceDedupKey(entry) === buildEvidenceSourceDedupKey(source));
    if (existingIndex < 0) {
      merged.push(source);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      title: existing.title.length >= source.title.length ? existing.title : source.title,
      url: existing.url ?? source.url,
      sourceType: existing.sourceType === "unknown" ? source.sourceType : existing.sourceType,
      jurisdiction: existing.jurisdiction === "unknown" ? source.jurisdiction : existing.jurisdiction,
      confidence:
        existing.confidence === "high" || source.confidence === "low"
          ? existing.confidence
          : source.confidence === "high"
            ? "high"
            : existing.confidence === "medium" || source.confidence === "medium"
              ? "medium"
              : "low",
      supportedClaims: Array.from(new Set([...(existing.supportedClaims ?? []), ...(source.supportedClaims ?? [])])).slice(0, 4),
      retrievedAt: existing.retrievedAt ?? source.retrievedAt,
    };
  }

  return merged.slice(0, 16);
}

function buildTruncationRetryPrompt(prompt: string): string {
  return `${prompt}\n\nIf returning a larger worksheet-generation scaffold, keep it compact and estimator-style so the JSON response fits fully in one reply. Use dense commercial workbook structure with only essential grouped sections, adjacent calculation flow, visible inputs, key pricing rows, practical subtotals, and a compact output summary. Prefer concise row names, minimal notes, editable assumptions, and visible formulas over hidden logic, repeated descriptions, giant worksheet layouts, or calculator sprawl.`;
}

function buildCompactGenerationRetryPrompt(prompt: string): string {
  return `${prompt}\n\nRetry instruction: return only the smallest useful estimator-style starter worksheet for this request. Keep it compact, previewable, and reversible. Use a tight commercial workbook flow with dense pricing blocks, adjacent quantity and pricing calculations, a structured subtotal, and a compact output or sell-price row where relevant. Prefer concise row labels, fewer note-style rows, tighter material and labour grouping, editable input assumptions, and visible formulas. Avoid long explanations, repeated descriptions, hidden logic, giant worksheet layouts, and non-essential rows.`;
}

function getWorksheetAiMaxOutputTokens(
  classification: PricingWorksheetConstructionIntent,
  truncationRetryCount: number,
  providerRecoveryRetryCount: number,
): number {
  if (truncationRetryCount > 0) {
    return WORKSHEET_AI_TRUNCATION_RETRY_MAX_OUTPUT_TOKENS;
  }

  if (providerRecoveryRetryCount > 0 && classification.primaryIntent === "worksheet_generation") {
    return WORKSHEET_AI_GENERATION_COMPACT_RETRY_MAX_OUTPUT_TOKENS;
  }

  if (classification.primaryIntent === "worksheet_generation") {
    return WORKSHEET_AI_GENERATION_MAX_OUTPUT_TOKENS;
  }

  return WORKSHEET_AI_MAX_OUTPUT_TOKENS;
}

function getWorksheetAiTimeoutMs(
  classification: PricingWorksheetConstructionIntent,
  providerRecoveryRetryCount: number,
): number {
  if (classification.primaryIntent === "worksheet_generation") {
    if (classification.requiresRetrieval) {
      return WORKSHEET_AI_RETRIEVAL_GENERATION_TIMEOUT_MS;
    }

    return providerRecoveryRetryCount > 0
      ? Math.max(WORKSHEET_AI_GENERATION_TIMEOUT_MS, WORKSHEET_AI_DEFAULT_TIMEOUT_MS)
      : WORKSHEET_AI_GENERATION_TIMEOUT_MS;
  }

  return Math.min(WORKSHEET_AI_TIMEOUT_MS, WORKSHEET_AI_DEFAULT_TIMEOUT_MS);
}

function getWorksheetAiMaxProviderAttempts(
  classification: PricingWorksheetConstructionIntent,
  providerRecoveryRetryCount: number,
): number {
  if (providerRecoveryRetryCount > 0) {
    return 1;
  }

  if (classification.primaryIntent === "worksheet_generation") {
    return WORKSHEET_AI_MAX_GENERATION_PROVIDER_ATTEMPTS;
  }

  return WORKSHEET_AI_MAX_PROVIDER_ATTEMPTS;
}

export function getPricingWorksheetAiProviderSettings(
  classification: PricingWorksheetConstructionIntent,
  options?: {
    truncationRetryCount?: number;
    providerRecoveryRetryCount?: number;
  },
): PricingWorksheetAiProviderSettings {
  const truncationRetryCount = options?.truncationRetryCount ?? 0;
  const providerRecoveryRetryCount = options?.providerRecoveryRetryCount ?? 0;

  return {
    timeoutMs: getWorksheetAiTimeoutMs(classification, providerRecoveryRetryCount),
    maxProviderAttempts: getWorksheetAiMaxProviderAttempts(classification, providerRecoveryRetryCount),
    maxOutputTokens: getWorksheetAiMaxOutputTokens(
      classification,
      truncationRetryCount,
      providerRecoveryRetryCount,
    ),
    webSearchEnabled: true,
  };
}

function isProviderTimeoutError(error: unknown): boolean {
  return (
    isPricingWorksheetProviderError(error) && error.code === "provider_timeout"
  ) || (error instanceof Error && error.message.includes("Upstream request timed out"));
}

function getProviderParseFailureReason(error: PricingWorksheetProviderError): PricingWorksheetProviderResponseFailureReason | null {
  if (!error.rawError || typeof error.rawError !== "object" || Array.isArray(error.rawError)) {
    return null;
  }

  const parseFailureReason = (error.rawError as Record<string, unknown>).parseFailureReason;
  return typeof parseFailureReason === "string"
    ? (parseFailureReason as PricingWorksheetProviderResponseFailureReason)
    : null;
}

function buildProviderErrorLogPayload(error: PricingWorksheetProviderError) {
  const rawError =
    error.rawError && typeof error.rawError === "object" && !Array.isArray(error.rawError)
      ? (error.rawError as Record<string, unknown>)
      : null;

  return {
    provider: error.provider,
    model: error.model,
    status: error.status,
    retryable: error.retryable,
    ...(rawError ? rawError : {}),
  };
}

function sanitizeText(value: string, maxLength = 160): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function formatMemorySummary(memoryItems: AiMemoryItem[]): string {
  if (memoryItems.length === 0) {
    return "No organization memory examples matched this worksheet request.";
  }

  return memoryItems
    .slice(0, 5)
    .map((item, index) => {
      const title = sanitizeText(item.title || "Worksheet example", 80);
      const summary = sanitizeText(item.summary || "", 220);
      return `${index + 1}. ${title}${summary ? ` - ${summary}` : ""}`;
    })
    .join("\n");
}

function formatOrganizationGuidanceSummary(
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null
): string {
  if (!organizationGuidance || organizationGuidance.items.length === 0) {
    return "No strong organization estimating guidance was available for this worksheet request.";
  }

  return organizationGuidance.items
    .slice(0, 6)
    .map((item, index) => {
      const title = sanitizeText(item.title, 70);
      const guidance = sanitizeText(item.guidance, 180);
      return `${index + 1}. ${title}${guidance ? ` - ${guidance}` : ""}`;
    })
    .join("\n");
}

function buildCompactFollowUpContextSummary(
  context?: PricingWorksheetAiFollowUpContext | null,
): Record<string, unknown> | null {
  if (!context) {
    return null;
  }

  const userCorrection = typeof context.userCorrection === "string" ? sanitizeText(context.userCorrection, 160) : null;
  const previousSummary = context.previousReviewSummary?.summary
    ? sanitizeText(context.previousReviewSummary.summary, 180)
    : null;

  return {
    userCorrection,
    previousSummary,
    acceptedFindingCount: context.acceptedFindingIds?.length ?? 0,
    rejectedFindingCount: context.rejectedFindingIds?.length ?? 0,
    appliedEditGroupCount: context.appliedEditGroupIds?.length ?? 0,
  };
}

function buildAnthropicConstructionSummary(params: {
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  memoryItems: AiMemoryItem[];
  organizationConstructionContext?: string | null;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
}) {
  return {
    worksheetName: params.worksheetContext.worksheetName,
    tradePackage: params.worksheetContext.tradePackage ?? null,
    primaryIntent: params.classification.primaryIntent,
    recommendedPromptPath: params.classification.recommendedPromptPath,
    tradeHints: params.classification.tradeHints.slice(0, 6),
    systemHints: params.classification.systemHints.slice(0, 6),
    riskLevel: params.classification.riskLevel,
    requiresRetrieval: params.classification.requiresRetrieval,
    retrievalReasons: (params.classification.retrievalReasons ?? []).slice(0, 6),
    organizationConstructionContext: params.organizationConstructionContext ?? null,
    organizationMemorySummary: formatMemorySummary(params.memoryItems),
    organizationGuidanceSummary: formatOrganizationGuidanceSummary(params.organizationGuidance),
    followUpContextSummary: buildCompactFollowUpContextSummary(params.followUpContext),
    assumptionCautionRules: [
      "Treat trade, manufacturer, and system logic as assumptions unless the worksheet or organization guidance confirms them.",
      "Prefer editable input rows for area, spacing, wastage, productivity, and margin assumptions when formulas depend on them.",
      "If assumptions are missing, explain the gap or suggest input rows instead of inventing hidden constants.",
    ],
  };
}

function buildAnthropicAssumptionRowSummary(snapshot: PricingWorksheetStructureSnapshot) {
  return snapshot.formulaTargets.rows
    .filter((row) => row.isLikelyInputRow || row.isLikelyAssumptionRow || row.rowPurposeHint === "assumption_input")
    .slice(0, 16)
    .map((row) => ({
      rowNumber: row.rowNumber,
      label: row.label,
      sectionName: row.sectionName,
      rowPurposeHint: row.rowPurposeHint,
      quantityRef: row.cells.quantity,
      materialRateRef: row.cells.materialRate,
      labourHoursRef: row.cells.labourHours,
      labourRateRef: row.cells.labourRate,
      marginRef: row.cells.margin,
      totalRef: row.cells.total,
      notesPreview: row.notesPreview,
    }));
}

function buildFollowUpContextSummary(context?: PricingWorksheetAiFollowUpContext | null): string {
  if (!context) {
    return "No previous review context was provided.";
  }

  return JSON.stringify(
    {
      previousReviewFindings: context.previousReviewFindings ?? [],
      previousReviewSummary: context.previousReviewSummary ?? null,
      previousSuggestedEditGroups: context.previousSuggestedEditGroups ?? [],
      acceptedFindingIds: context.acceptedFindingIds ?? [],
      rejectedFindingIds: context.rejectedFindingIds ?? [],
      appliedEditGroupIds: context.appliedEditGroupIds ?? [],
      userCorrection: context.userCorrection ?? null,
    },
    null,
    2,
  );
}

function normalizeTopicTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 4)
    .filter((entry) => !["this", "that", "with", "from", "into", "wall", "rows", "row", "estimate", "worksheet", "current", "rated"].includes(entry));
}

function hasNegation(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes(" not ") ||
    normalized.startsWith("not ") ||
    normalized.includes(" isn't ") ||
    normalized.includes(" isnt ") ||
    normalized.includes(" no ") ||
    normalized.includes(" remove ") ||
    normalized.includes(" without ") ||
    normalized.includes(" does not ") ||
    normalized.includes(" doesn't ")
  );
}

function confidenceRank(value: PricingWorksheetAiConfidence): number {
  if (value === "high") {
    return 3;
  }

  if (value === "medium") {
    return 2;
  }

  return 1;
}

function downgradeConfidence(value: PricingWorksheetAiConfidence): PricingWorksheetAiConfidence {
  if (value === "high") {
    return "medium";
  }

  return "low";
}

function buildFindingTopicText(finding: PricingWorksheetAiReviewFinding): string {
  return [finding.title, finding.finding, finding.assumption, finding.needsConfirmation, finding.uncertainty]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" ");
}

function findingMatchesCorrection(
  finding: PricingWorksheetAiReviewFinding,
  correction: string,
): boolean {
  const correctionTokens = new Set(normalizeTopicTokens(correction));
  if (correctionTokens.size === 0) {
    return false;
  }

  const findingTokens = normalizeTopicTokens(buildFindingTopicText(finding));
  return findingTokens.some((token) => correctionTokens.has(token));
}

function getFindingMatchKey(finding: PricingWorksheetAiReviewFinding): string {
  const normalizedTitle = finding.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${finding.category}::${normalizedTitle}`;
}

function clampConfidenceForFinding(
  finding: PricingWorksheetAiReviewFinding,
  contradicted: boolean,
): PricingWorksheetAiReviewFinding {
  let nextConfidence = finding.confidence;
  let nextStatus: PricingWorksheetAiFindingStatus = finding.findingStatus ?? "active";
  const hasAssumption = Boolean(finding.assumption?.trim());
  const hasUncertainty = Boolean(finding.uncertainty?.trim() || finding.needsConfirmation?.trim());
  const evidenceCount = finding.worksheetEvidence?.length ?? 0;

  if (contradicted) {
    nextConfidence = "low";
    nextStatus = nextStatus === "invalidated" ? "invalidated" : "downgraded";
  } else {
    if (hasAssumption && nextConfidence === "high") {
      nextConfidence = "medium";
    }

    if ((hasUncertainty || evidenceCount === 0) && nextConfidence === "high") {
      nextConfidence = "medium";
    }

    if ((hasUncertainty && hasAssumption) || (evidenceCount === 0 && hasAssumption)) {
      nextConfidence = downgradeConfidence(nextConfidence);
      if (nextStatus === "active") {
        nextStatus = "downgraded";
      }
    }
  }

  return {
    ...finding,
    confidence: nextConfidence,
    findingStatus: nextStatus,
  };
}

function applyReviewRevisionDiscipline(params: {
  response: PricingWorksheetAiAssistantResponse;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
}): PricingWorksheetAiAssistantResponse {
  const { response, followUpContext } = params;
  if (!followUpContext) {
    return {
      ...response,
      reviewFindings: (response.reviewFindings ?? []).map((finding) => clampConfidenceForFinding(finding, false)),
    };
  }

  const previousFindings = followUpContext.previousReviewFindings ?? [];
  const correction = followUpContext.userCorrection?.trim() ?? "";
  const rejectedFindingIds = new Set(followUpContext.rejectedFindingIds ?? []);
  const contradictedPreviousIds = new Set<string>();
  const currentFindings: PricingWorksheetAiReviewFinding[] = (response.reviewFindings ?? []).map((finding) => {
    const matchedPrevious =
      previousFindings.find((previous) => previous.id === finding.revisedFromFindingId) ??
      previousFindings.find((previous) => previous.id === finding.id) ??
      previousFindings.find((previous) => getFindingMatchKey(previous) === getFindingMatchKey(finding));
    const contradicted =
      correction.length > 0 &&
      hasNegation(` ${correction.toLowerCase()} `) &&
      (
        (matchedPrevious ? findingMatchesCorrection(matchedPrevious, correction) : false) ||
        findingMatchesCorrection(finding, correction)
      );

    if (matchedPrevious && contradicted) {
      contradictedPreviousIds.add(matchedPrevious.id);
    }

    const baseFinding: PricingWorksheetAiReviewFinding = {
      ...finding,
      revisedFromFindingId: matchedPrevious?.id ?? finding.revisedFromFindingId ?? null,
      findingStatus:
        matchedPrevious && contradicted
          ? "downgraded"
          : matchedPrevious
            ? "revised"
            : rejectedFindingIds.has(finding.id)
              ? "downgraded"
              : finding.findingStatus ?? "active",
      revisionReason:
        matchedPrevious && contradicted
          ? `Revised after clarification: ${correction}`
          : finding.revisionReason,
    };
    const hadPriorContradiction =
      matchedPrevious?.findingStatus === "invalidated" ||
      matchedPrevious?.findingStatus === "downgraded" ||
      rejectedFindingIds.has(matchedPrevious?.id ?? "");
    const disciplinedFinding = clampConfidenceForFinding(
      baseFinding,
      contradicted || rejectedFindingIds.has(baseFinding.id) || hadPriorContradiction,
    );
    const confidenceReducedFromPrevious =
      matchedPrevious
        ? confidenceRank(disciplinedFinding.confidence) < confidenceRank(matchedPrevious.confidence)
        : false;

    if (hadPriorContradiction && confidenceRank(disciplinedFinding.confidence) > confidenceRank("low")) {
      return {
          ...disciplinedFinding,
          confidence: "low",
          findingStatus:
            disciplinedFinding.findingStatus === "invalidated"
              ? "invalidated"
            : "downgraded",
        revisionReason:
          disciplinedFinding.revisionReason ??
          "Confidence reduced because this topic was previously contradicted or invalidated.",
      };
    }

    if (
      confidenceReducedFromPrevious &&
      disciplinedFinding.findingStatus !== "invalidated" &&
      disciplinedFinding.findingStatus !== "superseded"
    ) {
      return {
        ...disciplinedFinding,
        findingStatus: "downgraded",
        revisionReason:
          disciplinedFinding.revisionReason ??
          "Confidence reduced after clarification increased uncertainty or weakened the assumption basis.",
      };
    }

    return disciplinedFinding;
  });

  const invalidatedFindings: PricingWorksheetAiReviewFinding[] = previousFindings
    .filter((previous) => {
      const stillPresent = currentFindings.some(
        (current) =>
          current.id === previous.id ||
          current.revisedFromFindingId === previous.id ||
          getFindingMatchKey(current) === getFindingMatchKey(previous),
      );
      const contradicted =
        correction.length > 0 &&
        hasNegation(` ${correction.toLowerCase()} `) &&
        findingMatchesCorrection(previous, correction);
      const rejected = rejectedFindingIds.has(previous.id);
      const alreadyInvalidated =
        previous.findingStatus === "invalidated" || previous.findingStatus === "superseded";

      return !stillPresent && !alreadyInvalidated && (contradicted || rejected);
    })
    .map((previous) => ({
      ...previous,
      confidence: "low",
      findingStatus: "invalidated" as const,
      canSuggestWorksheetEdit: false,
      suggestedEditGroupId: null,
      revisionReason:
        correction.length > 0
          ? `Invalidated after clarification: ${correction}`
          : "Invalidated after user rejection.",
      supersededByFindingId: null,
    }));

  const allFindings = [...currentFindings, ...invalidatedFindings];
  const invalidatedTopicKeys = new Set(
    invalidatedFindings.map((finding) => getFindingMatchKey(finding)),
  );
  const invalidatedOrRejectedIds = new Set([
    ...invalidatedFindings.map((finding) => finding.id),
    ...Array.from(rejectedFindingIds),
    ...Array.from(contradictedPreviousIds),
  ]);

  const suggestedEditGroups = (response.suggestedEditGroups ?? []).filter((group) => {
    const linkedFindings = allFindings.filter(
      (finding) =>
        group.relatedFindingIds.includes(finding.id) ||
        group.relatedFindingIds.includes(finding.revisedFromFindingId ?? ""),
    );
    if (linkedFindings.some((finding) => finding.findingStatus === "invalidated")) {
      return false;
    }
    if (linkedFindings.some((finding) => invalidatedOrRejectedIds.has(finding.id))) {
      return false;
    }
    if (
      linkedFindings.length === 0 &&
      correction.length > 0 &&
      hasNegation(` ${correction.toLowerCase()} `) &&
      invalidatedTopicKeys.size > 0
    ) {
      const groupTopic = `${group.title} ${group.purpose} ${group.assumptions.join(" ")}`;
      const groupTokens = normalizeTopicTokens(groupTopic);
      if (Array.from(invalidatedTopicKeys).some((key) => groupTokens.some((token) => key.includes(token)))) {
        return false;
      }
    }

    return true;
  });

  const reviewSummary = response.reviewSummary
    ? {
        ...response.reviewSummary,
        possibleMissingItems: response.reviewSummary.possibleMissingItems.filter((item) => {
          if (!correction.length || !hasNegation(` ${correction.toLowerCase()} `)) {
            return true;
          }
          const itemFinding: PricingWorksheetAiReviewFinding = {
            id: "summary-item",
            category: "general_review",
            severity: "low",
            confidence: "low",
            title: item,
            finding: item,
          };
          return !findingMatchesCorrection(itemFinding, correction);
        }),
      }
    : null;

  return {
    ...response,
    reviewFindings: allFindings,
    reviewSummary,
    suggestedEditGroups,
  };
}

function applyEvidenceDiscipline(response: PricingWorksheetAiAssistantResponse): PricingWorksheetAiAssistantResponse {
  const evidenceSourceIds = new Set((response.evidenceSources ?? []).map((source) => source.id));

  const reviewFindings: PricingWorksheetAiReviewFinding[] = (response.reviewFindings ?? []).map((finding) => {
    const linkedEvidenceIds = (finding.evidenceSourceIds ?? []).filter((sourceId) => evidenceSourceIds.has(sourceId));
    const findingText = `${finding.title} ${finding.finding} ${finding.assumption ?? ""}`.toLowerCase();
    const isHighRiskExternalClaim =
      finding.category === "specification_uncertainty" ||
      findingText.includes("acoustic") ||
      findingText.includes("seismic") ||
      findingText.includes("fire") ||
      findingText.includes("waterproof") ||
      findingText.includes("manufacturer") ||
      findingText.includes("compliance");

    if (isHighRiskExternalClaim && linkedEvidenceIds.length === 0) {
      return {
        ...finding,
        confidence: "low" as const,
        evidenceSourceIds: [],
        uncertainty:
          finding.uncertainty ??
          "No supporting source evidence was captured for this higher-risk construction claim in the current request.",
      };
    }

    return {
      ...finding,
      evidenceSourceIds: linkedEvidenceIds,
    };
  });

  return {
    ...response,
    reviewFindings,
  };
}

function buildCommonWorksheetRules() {
  return [
    "You are a construction intelligence assistant inside TradesStack, not a generic spreadsheet chatbot.",
    "Choose exactly one mode: answer_only, propose_edit, or answer_and_propose_edit.",
    "Never return a replacement worksheet.",
    "Only propose the supported operations: update_cell, update_cells, insert_row, copy_row_variant, fix_formula, explain_formula, insert_subtotal, format_cell, format_cells.",
    "Selection context is optional. If no selection is provided, infer the safest location from headings, row labels, formulas, totals, and worksheet structure.",
    "Default to Australia/New Zealand construction estimating context and terminology.",
    "Web search is available for all worksheet assistant requests.",
    "Use web search whenever the response depends on construction facts, manufacturer or system references, standards, compliance, specification logic, product or system terminology, or current AUS/NZ construction information.",
    "Do not use web search unnecessarily for pure spreadsheet arithmetic or worksheet facts that are already clear from the worksheet.",
    "Inspect existing worksheet rows, formulas, totals, and structure before suggesting edits.",
    "Worksheet facts are the highest-confidence data available in this request.",
    "Determine what is known from worksheet data, what is assumed, and what is uncertain before suggesting changes.",
    "Distinguish worksheet facts from assumptions and uncertainty.",
    "Do not assume scope, specification, rating, system, supplier, or compliance requirements unless they are present in worksheet/project context or provided source context.",
    "Do not claim source-backed verification unless web search or provided source context actually supports it.",
    "If web search results are weak, conflicting, or unavailable, state uncertainty clearly.",
    "Web evidence supports construction reasoning, but it does not override project specifications or worksheet facts.",
    "Use words like potential, may, appears, and confirm when something is inferred rather than directly shown in the worksheet.",
    "Use confident language only for worksheet facts and clear arithmetic relationships.",
    "Prioritize trustworthiness over creativity.",
    "Never pretend compliance, specification, manufacturer, or project requirements were verified if they were not.",
    "Never present assumptions as facts.",
    "If context is unclear, explain assumptions, reduce confidence, and prefer targeted follow-up questions over overconfident edits.",
    "Only suggest changes that are defensible from worksheet context plus clearly stated assumptions.",
    "For commercial outputs, prioritize conservative review and user confirmation.",
    "Formula edits must be mathematically valid and compatible with the worksheet engine.",
    "Formatting edits must stay previewable, reversible, and value-neutral. Never change formulas or literal values when using format_cell or format_cells.",
    "Never silently mutate the worksheet. Any mutation must be surfaced as explicit operations only.",
    "Any proposed worksheet edits must remain previewable, bounded, and reversible.",
  ];
}

function buildPathSpecificPromptInstructions(classification: PricingWorksheetConstructionIntent) {
  const cautionInstructions = [
    classification.requiresRetrieval
      ? "This request strongly requires web-backed evidence before making external construction, manufacturer, compliance, standards, or specification claims. Use web search before making those claims. If suitable sources are not available, do not pretend verification occurred. State what still needs confirmation and keep any resulting edits or findings as assumptions rather than facts."
      : null,
    classification.riskLevel === "high" || classification.shouldAskFollowUp
      ? "This is a higher-risk or unclear request. For fire, acoustic, seismic, structural, waterproofing, electrical/plumbing compliance, safety, statutory/code/spec, or manufacturer-specific logic: do not generate confident edits unless evidence exists. Ask for the project spec, system, rating, or requirement if missing. Explain uncertainty and prefer review findings over edits when context is insufficient."
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  switch (classification.recommendedPromptPath) {
    case "answer":
      return [
        "You are a helpful AUS/NZ construction worksheet assistant explaining worksheet logic clearly inside TradesStack.",
        "Focus on explanation, not editing.",
        "Use a simple reasoning process: inspect the worksheet first, identify what is shown, identify what is assumed, and explain what remains uncertain.",
        "Do not propose worksheet mutations unless the user explicitly asks for a worksheet change.",
        "Keep explanations clear, estimator-friendly, and grounded in the worksheet context.",
        "Do not invent construction claims just because the worksheet appears construction-related.",
        "If the explanation depends on a construction system, manufacturer, terminology, or allowance logic, use web search to support the explanation.",
        "If the explanation is only about straightforward worksheet arithmetic, external claims are unnecessary.",
        ...cautionInstructions,
      ];
    case "review":
      return [
        "You are a senior AUS/NZ construction estimator reviewing a commercial estimate inside TradesStack.",
        "Review the worksheet like an experienced estimator checking another estimator's work.",
        "Follow an estimator review checklist: inspect scope completeness, materials/components, fixings/sundries, labour allowance, wastage allowance, quantities/units, formula consistency, subtotal/section structure, exclusions/clarifications, interface items, access/handling assumptions, compliance/spec ambiguity, and quote-readiness.",
        "Review what is present, what may be missing, why it may matter, confidence, assumptions, and what needs confirmation.",
        "Inspect worksheet structure, formulas, labour logic, wastage logic, likely missing scope/items, and estimate risks.",
        "Separate worksheet facts, likely assumptions, and uncertainty.",
        "Do not hallucinate seismic, fire, acoustic, compliance, or manufacturer-specific logic when the worksheet context is insufficient.",
        "Suggest worksheet edits only when they are safe and well-bounded.",
        "If the estimate appears incomplete or ambiguous, say what needs confirmation.",
        ...cautionInstructions,
      ];
    case "edit":
      return [
        "You are an AUS/NZ construction worksheet editing assistant generating safe worksheet edits and formulas inside TradesStack.",
        "Keep edits bounded, practical, and estimator-style.",
        "Use this process: inspect the worksheet first, identify the trade/system context, determine the input basis, determine what is assumed, determine what is uncertain, then suggest only defensible edits.",
        "For formula work, formulas must begin with = and stay compatible with worksheet-safe spreadsheet references.",
        "Do not generate formulas unless the target and input basis are clear.",
        "If selected cells are provided, use them.",
        "Target selected cells or nearby logical worksheet locations when appropriate.",
        "If inputs are missing, create blank input cells plus formula cells rather than fake zero values.",
        "Prefer readable formulas over complex formulas.",
        "Use IFERROR only where it makes commercial sense, not to hide genuine estimating errors.",
        "Do not use unsupported formulas.",
        "Never overwrite an existing formula without explaining the impact.",
        "Surface assumptions for any construction-related logic such as labour, wastage, quantity conversion, or system-specific estimating.",
        "If changing labour or wastage, explain the commercial assumption.",
        "Do not invent unsupported estimating logic or pretend specifications were checked.",
        ...cautionInstructions,
      ];
    case "generation":
      return [
        "You are an AUS/NZ construction estimator generating worksheet structures cautiously inside TradesStack.",
        "Generate starter structures only, not a full autonomous estimate.",
        "Generate compact estimator-style pricing workbook scaffolds, not generic spreadsheets or tiny standalone calculators.",
        "Generate practical rows, formulas, and worksheet structure in a bounded way.",
        "Structure the worksheet like a real estimator-built pricing module with clear grouped sections for inputs, calculations, subtotals, and outputs.",
        "Use a practical calculation flow with visible quantity transformations, editable assumptions, auditable formulas, structured subtotals, and final pricing outputs where relevant.",
        "Prefer dense commercial workbook layouts with compact grouped pricing blocks rather than long linear walkthroughs.",
        "Keep related inputs, quantity calculations, pricing rows, and subtotals close together so the worksheet reads like a practical pricing workbook.",
        "Use concise estimator-style row naming and avoid repeated descriptions, unnecessary note rows, and row-by-row explanation behaviour.",
        "Keep material, labour, waste, allowance, margin, and sell-price logic tightly grouped where relevant instead of spreading them across verbose sections.",
        "Where relevant, include material, labour, waste, allowance, margin, markup, and sell-price logic as visible worksheet rows rather than hidden reasoning.",
        "Prefer editable input or assumption rows when information is missing instead of blocking generation, unless the missing information would materially change the worksheet structure.",
        "Ask follow-up questions only when missing information would materially change the worksheet structure or make the starter layout unsafe.",
        "Group rows logically and keep the output auditable, transparent, previewable, reversible, and compact.",
        "Keep formulas simple, visible, and auditable.",
        "Separate inputs from calculations and outputs clearly so an estimator can review and edit the worksheet easily.",
        "Do not create database sheets, hidden pricing libraries, lookup-driven assemblies, autonomous estimating engines, or opaque formula chains.",
        "Explain assumptions and do not pretend construction requirements are verified.",
        "If trade, system, scope, or required inputs are unclear, ask follow-up questions instead of overcommitting.",
        "Do not invent compliance-driven, specification-driven, fire-rated, acoustic-rated, seismic, or manufacturer-specific requirements unless they were explicitly provided.",
        "Do not invent spec-driven, rating-driven, or manufacturer-driven requirements.",
        "Do not hardcode trade-specific workflows, systems, assemblies, or estimating patterns into the generated structure.",
        "Prefer compact starter structures over large uncontrolled worksheet generation.",
        ...cautionInstructions,
      ];
    case "quote_takeoff":
      return [
        "You are an AUS/NZ construction worksheet assistant helping plan quote or takeoff linkage inside TradesStack.",
        "Do not pretend quote sync or takeoff sync already exists.",
        "Provide preparation guidance only.",
        "Explain possible worksheet mapping, structure, traceability concepts, and future linkage ideas only.",
        "If edits are suggested, keep them limited to worksheet preparation rather than fake downstream integration.",
        ...cautionInstructions,
      ];
    default:
      return [
        "You are TradesStack's AUS/NZ construction worksheet assistant.",
        "Be cautious, practical, and explicit about assumptions and uncertainty.",
        ...cautionInstructions,
      ];
  }
}

function buildWorksheetAssistantPrompts(params: {
  prompt: string;
  worksheetContext: PricingWorksheetAiCompactContext;
  memoryItems: AiMemoryItem[];
  organizationConstructionContext?: string | null;
  classification: PricingWorksheetConstructionIntent;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
}) {
  const memorySummary = formatMemorySummary(params.memoryItems);
  const organizationGuidanceSummary = formatOrganizationGuidanceSummary(params.organizationGuidance);
  const systemPrompt = [
    ...buildPathSpecificPromptInstructions(params.classification),
    ...buildCommonWorksheetRules(),
    "Prefer small, safe edits.",
    "For formula advice, keep formulas simple and compatible with spreadsheet-style references.",
    "Never invent 0 numeric placeholder inputs just to make a row look complete.",
    "If the worksheet is blank or minimal and the user asks you to create a formula row, prefer blank input cells plus a real formula cell over zero-filled placeholders.",
    "If the needed inputs do not already exist, you may create a compact starter row across the first suitable columns and use IFERROR around the formula so blank inputs stay safe.",
    "If the user explicitly asks you to add or create a formula in the worksheet, do not return a mutating edit proposal that has no formulas.",
    "For explain_formula, do not mutate the worksheet.",
    "For answer_only, do not include mutating operations.",
    "If the user asks to color, colour, highlight, mark, or identify worksheet input cells, prefer format_cells operations over answer_only whenever formatting is possible.",
    "Use clear formatting groups when highlighting worksheet roles: manual quantity inputs use blue fill, assumption or system-factor inputs use amber fill, pricing or rate inputs use green fill, and outputs or formula cells use grey fill.",
    "Do not highlight formula or output cells as manual inputs unless the user explicitly asks for output highlighting.",
    "Prefer formatting manual input cells, assumption cells, rate cells, and user-entered quantity cells before outputs.",
    "For review_estimate requests, return structured reviewFindings whenever you can identify distinct findings.",
    "reviewFindings should explain worksheet evidence, assumptions, uncertainty, confidence, and any needed confirmation.",
    "If web search was used and you have usable source evidence, include evidenceSources and link findings with evidenceSourceIds where possible.",
    "Do not invent sources, URLs, or evidence links.",
    "Only include suggestedEditGroups when there is a bounded, previewable worksheet action with supported operations.",
    "High-risk review items should prefer confirmation over direct worksheet edits.",
    "When follow-up clarification is provided, do not treat previous findings as truth. Re-evaluate them using the current worksheet context plus the user's clarification.",
    "On revision, identify which previous findings remain valid, which are weakened, which are invalidated, and which should be removed or superseded.",
    "If a user contradicts an assumption, remove or downgrade dependent findings and remove dependent suggested edit groups.",
    "Do not defend earlier weak assumptions. Revise them explicitly.",
    "Do not let invalidated findings silently regain medium or high confidence later in the same review loop without strong worksheet evidence.",
    "Organization estimating guidance describes contextual tendencies only. It must never override worksheet facts, explicit project specifications, user corrections, retrieved evidence, or compliance requirements.",
  ].join(" ");

  const userPrompt = [
    `User request: ${params.prompt || "Help with the current worksheet."}`,
    "",
    params.organizationConstructionContext ?? null,
    params.organizationConstructionContext ? "" : null,
    "Construction intent classification:",
    JSON.stringify(params.classification, null, 2),
    "",
    "Compact worksheet context:",
    JSON.stringify(params.worksheetContext, null, 2),
    "",
    "Organization memory examples (optional hints only):",
    memorySummary,
    "",
    "Organization estimating guidance (contextual tendencies only, not facts):",
    organizationGuidanceSummary,
    "",
    "Output requirements:",
    "- Return strict JSON only.",
    "- If you propose edits, keep them compact and targeted.",
    "- Use row numbers and A1 references that match the provided worksheet context.",
    "- update_cells is preferred when several cells in one row should change together.",
    "- copy_row_variant is preferred when duplicating an existing row pattern and changing the description/spec.",
    "- Use insert_subtotal only when the subtotal range and total column are obvious and safe.",
    "- If you create a calculator row on a blank sheet, do not fill unknown numeric inputs with 0. Leave inputs blank and put the formula in a separate cell.",
    "- If you are uncertain about specification, compliance, or system requirements, say so explicitly.",
    "- Web search is available for every prompt path. Use it when construction evidence is needed, and do not claim verification if sources are weak or unavailable.",
    "- If web search gives useful source evidence, include it in evidenceSources and reference it from review findings with evidenceSourceIds where possible.",
    "- Do not fabricate evidenceSources. If no usable source metadata is available, leave evidenceSources empty.",
    `- requiresRetrieval=${params.classification.requiresRetrieval ? "true" : "false"} means ${
      params.classification.requiresRetrieval
        ? "web search is strongly expected before external construction claims."
        : "web search is available but only needs to be used when it would materially improve construction accuracy."
    }`,
    "- If previous review context is provided, revise that review instead of starting from scratch.",
    "- Rejected findings are not established facts and should be removed, downgraded, or clarified unless the worksheet strongly supports them.",
    "- Accepted findings can be kept, clarified, or narrowed if the user's follow-up changes the context.",
    "- Re-inspect the worksheet before revising previous findings.",
    "- Explain what changed and why when you revise or remove findings.",
    "- Remove stale assumptions. Do not carry them forward silently.",
    "- If a finding depends on a contradicted assumption, mark it invalidated or downgraded and lower confidence.",
    "- Organization guidance may help you adapt to company tendencies, but it never overrides worksheet facts, project specs, user corrections, or retrieved evidence.",
    "",
    "Previous review context (for follow-up revision only):",
    buildFollowUpContextSummary(params.followUpContext),
  ].filter((value): value is string => typeof value === "string").join("\n");

  return {
    systemPrompt,
    userPrompt,
  };
}

function buildCurrentWorksheetSummary(worksheet: WorksheetData): CurrentWorksheetSummary {
  let formulaCount = 0;
  let populatedCellCount = 0;

  for (const cell of Object.values(worksheet.cells)) {
    if (!cell) {
      continue;
    }

    if (typeof cell.formula === "string" && cell.formula.trim().length > 0) {
      formulaCount += 1;
      populatedCellCount += 1;
      continue;
    }

    if (typeof cell.value === "number" || (typeof cell.value === "string" && cell.value.trim().length > 0)) {
      populatedCellCount += 1;
    }
  }

  return {
    rowCount: worksheet.rows.length,
    columnCount: worksheet.columns.length,
    formulaCount,
    populatedCellCount,
  };
}

function countWorksheetFormulas(worksheet: WorksheetData) {
  let count = 0;
  for (const cell of Object.values(worksheet.cells)) {
    if (cell?.formula && cell.formula.trim().length > 0) {
      count += 1;
    }
  }
  return count;
}

function countWorksheetPopulatedCells(worksheet: WorksheetData) {
  let count = 0;
  for (const cell of Object.values(worksheet.cells)) {
    if (!cell) {
      continue;
    }

    if (
      (typeof cell.formula === "string" && cell.formula.trim().length > 0) ||
      typeof cell.value === "number" ||
      (typeof cell.value === "string" && cell.value.trim().length > 0)
    ) {
      count += 1;
    }
  }
  return count;
}

function summarizeOperation(operation: PricingWorksheetAiOperation): string {
  if (operation.type === "format_cell") {
    return `Format cell${operation.target?.cell ? ` ${operation.target.cell}` : ""}`;
  }

  if (operation.type === "format_cells") {
    return `Format ${operation.target?.cells?.length ?? 0} cell(s)`;
  }

  if (operation.type === "copy_row_variant") {
    const sourceRow = operation.target?.sourceRow ?? operation.target?.row ?? "?";
    return `Copy row ${sourceRow} as a variant`;
  }

  if (operation.type === "insert_row") {
    const row = operation.target?.insertAfterRow ?? operation.target?.insertBeforeRow ?? operation.target?.row ?? "?";
    return `Insert row near ${row}`;
  }

  if (operation.type === "insert_subtotal") {
    return "Insert subtotal row";
  }

  if (operation.type === "fix_formula") {
    return `Fix formula${operation.target?.cell ? ` at ${operation.target.cell}` : ""}`;
  }

  if (operation.type === "explain_formula") {
    return `Explain formula${operation.target?.cell ? ` at ${operation.target.cell}` : ""}`;
  }

  if (operation.type === "update_cell" || operation.type === "update_cells") {
    return `Update ${operation.values?.cells?.length ?? operation.formulas?.cells?.length ?? 0} cell(s)`;
  }

  return operation.type;
}

function isAdvicePrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized.includes("formula") ||
    normalized.includes("explain") ||
    normalized.includes("how do") ||
    normalized.includes("how to") ||
    normalized.includes("what") ||
    normalized.includes("why") ||
    normalized.includes("write me") ||
    normalized.includes("?")
  );
}

function isFormulaBuildPrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  return (
    normalized.includes("formula") ||
    normalized.includes("calculate") ||
    normalized.includes("calc") ||
    normalized.includes("work out") ||
    normalized.includes("add this formula") ||
    normalized.includes("create a row") ||
    normalized.includes("add a row")
  );
}

function promptTargetsWorksheetFormulaArea(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  return (
    /\bcol(?:umn)?\s+[a-z]{1,3}\b/.test(normalized) ||
    /\b[a-z]{1,3}\s+column\b/.test(normalized) ||
    /\bcells?\s+[a-z]{1,3}\d+\s*:\s*[a-z]{1,3}\d+\b/.test(normalized) ||
    /\bcell\s+[a-z]{1,3}\d+\b/.test(normalized)
  );
}

function isExplicitFormulaMutationPrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!promptTargetsWorksheetFormulaArea(normalized)) {
    return false;
  }

  return (
    /\b(?:create|add|fill|populate|write|insert|put|generate)\b[\s\S]{0,20}\bformulas?\b/.test(normalized) ||
    /\b(?:fix|repair|correct|complete|finish)\b[\s\S]{0,20}\b(?:missing\s+)?formulas?\b/.test(normalized)
  );
}

function getSelectedWorksheetCellRef(worksheetContext: PricingWorksheetAiCompactContext): string | null {
  const selectionKeys = [
    worksheetContext.visibleSelection.activeCellKey,
    worksheetContext.visibleSelection.focusCellKey,
    worksheetContext.visibleSelection.anchorCellKey,
  ];

  for (const value of selectionKeys) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim().toUpperCase();
    if (parseCellRef(normalized)) {
      return normalized;
    }
  }

  return null;
}

function extractExplicitFormulaWriteRequest(
  prompt: string,
  worksheetContext: PricingWorksheetAiCompactContext,
): { targetCell: string; formula: string } | null {
  const normalizedPrompt = prompt.trim();
  const lowerPrompt = normalizedPrompt.toLowerCase();
  const isExplicitWritePrompt =
    /\b(put|add|input|enter|insert|set|write|place)\b/.test(lowerPrompt) &&
    (
      lowerPrompt.includes("selected cell") ||
      lowerPrompt.includes("active cell") ||
      lowerPrompt.includes("current cell") ||
      lowerPrompt.includes("this cell")
    );

  if (!isExplicitWritePrompt) {
    return null;
  }

  const targetCell = getSelectedWorksheetCellRef(worksheetContext);
  if (!targetCell) {
    return null;
  }

  const formulaMatch = normalizedPrompt.match(/(=[^\n\r]+)/);
  if (!formulaMatch) {
    return null;
  }

  const formula = formulaMatch[1]?.trim().replace(/^[`"'“”]+|[`"'“”]+$/g, "");
  if (!formula?.startsWith("=")) {
    return null;
  }

  return {
    targetCell,
    formula,
  };
}

function coerceExplicitFormulaWriteResponse(
  response: PricingWorksheetAiAssistantResponse,
  prompt: string,
  worksheetContext: PricingWorksheetAiCompactContext,
): PricingWorksheetAiAssistantResponse {
  const explicitWriteRequest = extractExplicitFormulaWriteRequest(prompt, worksheetContext);
  if (!explicitWriteRequest || responseContainsFormulaOperations(response)) {
    return response;
  }

  return {
    ...response,
    mode: response.answer.trim().length > 0 ? "answer_and_propose_edit" : "propose_edit",
    proposalName:
      response.proposalName.trim().length > 0
        ? response.proposalName
        : `Write formula to ${explicitWriteRequest.targetCell}`,
    summary:
      response.summary.trim().length > 0
        ? response.summary
        : `Write ${explicitWriteRequest.formula} into ${explicitWriteRequest.targetCell}.`,
    operations: [
      ...response.operations,
      {
        type: "update_cell",
        target: {
          cell: explicitWriteRequest.targetCell,
        },
        values: {
          cells: [],
        },
        formulas: {
          cells: [
            {
              ref: explicitWriteRequest.targetCell,
              formula: explicitWriteRequest.formula,
            },
          ],
        },
        rationale: "Apply the explicit formula the user provided to the currently selected cell.",
      },
    ],
  };
}

function responseContainsFormulaOperations(response: PricingWorksheetAiAssistantResponse) {
  return response.operations.some((operation) =>
    Array.isArray(operation.formulas?.cells) &&
    operation.formulas.cells.some((entry) => typeof entry.formula === "string" && entry.formula.trim().length > 0),
  );
}

function responseUsesZeroPlaceholderValues(response: PricingWorksheetAiAssistantResponse) {
  return response.operations.some((operation) =>
    Array.isArray(operation.values?.cells) &&
    operation.values.cells.some((entry) => entry?.value === 0 || entry?.value === "0"),
  );
}

function shouldRetryForLowQualityProposal(
  prompt: string,
  worksheetContext: PricingWorksheetAiCompactContext,
  response: PricingWorksheetAiAssistantResponse,
) {
  if (!isFormulaBuildPrompt(prompt)) {
    return false;
  }

  if (response.mode === "answer_only") {
    return false;
  }

  const blankOrMinimalWorksheet = worksheetContext.populatedCellCount <= 2;
  if (!blankOrMinimalWorksheet) {
    return false;
  }

  if (responseContainsFormulaOperations(response)) {
    return false;
  }

  return responseUsesZeroPlaceholderValues(response) || response.operations.length > 0;
}

function isWorksheetMutationRequest(
  prompt: string,
  classification: PricingWorksheetConstructionIntent,
) {
  if (classification.recommendedPromptPath === "generation" || classification.primaryIntent === "worksheet_generation") {
    return true;
  }

  if (classification.recommendedPromptPath !== "edit") {
    return false;
  }

  return (
    /(?:create|build|generate)\b[\s\S]{0,60}\b(?:worksheet|sheet|row|rows|section|sections|subtotal|totals?)\b/i.test(
      prompt,
    ) ||
    /(?:add|insert|update|modify|adjust|change|fill|apply)\b[\s\S]{0,60}\b(?:worksheet|sheet|row|rows|cell|cells|section|sections|subtotal|totals?)\b/i.test(
      prompt,
    ) ||
    /(?:add|insert|update|apply|write)\b[\s\S]{0,30}\bformula\b[\s\S]{0,30}\b(?:into|to|in)\b[\s\S]{0,20}\b(?:cell|cells|row|rows|worksheet|sheet)\b/i.test(
      prompt,
    )
  );
}

function shouldRetryForMissingMutationOperations(
  prompt: string,
  classification: PricingWorksheetConstructionIntent,
  response: PricingWorksheetAiAssistantResponse,
) {
  return isWorksheetMutationRequest(prompt, classification) && response.operations.length === 0;
}

function buildMissingMutationOperationsRetryPrompt(prompt: string) {
  return `${prompt}

Correction: return a real worksheet edit plan, not an explanation. The JSON must include at least one supported worksheet operation. If you claim you created, added, updated, or adjusted the worksheet, operations cannot be empty. For worksheet creation, use supported insert_row, update_cell, update_cells, insert_subtotal, format_cell, or format_cells operations to build a bounded starter structure. For formula requests, include supported update_cell, update_cells, or fix_formula operations with real formula targets.`;
}

function sanitizeDisplayedNoOperationMutationResponse(
  response: PricingWorksheetAiAssistantResponse,
  prompt: string,
  classification: PricingWorksheetConstructionIntent,
): PricingWorksheetAiAssistantResponse {
  if (!shouldRetryForMissingMutationOperations(prompt, classification, response)) {
    return response;
  }

  const blockedMessage = "The AI returned an explanation but no worksheet changes. Please retry or adjust the prompt.";
  return {
    ...response,
    proposalName: "Worksheet changes required",
    answer: blockedMessage,
    summary: blockedMessage,
    warnings: Array.from(new Set([...(response.warnings ?? []), "ai_returned_no_worksheet_changes"])),
  };
}

function buildMutationIntentValidationIssues(
  response: PricingWorksheetAiAssistantResponse,
  prompt: string,
  classification: PricingWorksheetConstructionIntent,
) {
  if (!shouldRetryForMissingMutationOperations(prompt, classification, response)) {
    return [];
  }

  return [
    {
      code: "mutation_intent_missing_operations",
      message: "The AI returned an explanation but no worksheet changes. Please retry or adjust the prompt.",
      severity: "error" as const,
    },
  ];
}

function isGenerationPromptClassification(classification: PricingWorksheetConstructionIntent) {
  return (
    classification.primaryIntent === "worksheet_generation" &&
    classification.recommendedPromptPath === "generation"
  );
}

function shouldBlockIncompleteStagedWorksheetGeneration(params: {
  prompt: string;
  classification: PricingWorksheetConstructionIntent;
  worksheetState: PricingWorksheetState;
  formulaStageAttempted: boolean;
  formulaStageProducedFormulas: boolean;
}) {
  if (!isGenerationPromptClassification(params.classification)) {
    return false;
  }

  if (params.worksheetState !== "blank" && params.worksheetState !== "starter_generated") {
    return false;
  }

  if (!isFormulaBuildPrompt(params.prompt)) {
    return false;
  }

  return params.formulaStageAttempted && !params.formulaStageProducedFormulas;
}

function buildIncompleteStagedWorksheetGenerationIssue() {
  return {
    code: "staged_generation_incomplete_formula_fill",
    message:
      "The AI generated worksheet structure, but the formula stage did not complete safely. Please retry so TradesStack can finish the calculator formulas before approval.",
    severity: "error" as const,
  } satisfies PricingWorksheetAiValidationIssue;
}

function shouldValidateGeneratedPricingWorksheetCompleteness(params: {
  classification: PricingWorksheetConstructionIntent;
  worksheetState: PricingWorksheetState;
  stagedAnthropicGeneration: boolean;
  responseMode: PricingWorksheetAiAssistantMode;
  hasContinuation: boolean;
}) {
  if (!params.stagedAnthropicGeneration) {
    return false;
  }

  if (!isGenerationPromptClassification(params.classification)) {
    return false;
  }

  if (params.worksheetState !== "blank" && params.worksheetState !== "starter_generated") {
    return false;
  }

  return params.responseMode !== "answer_only" && !params.hasContinuation;
}

function estimateWorksheetAiTokenSize(values: unknown[]) {
  return Math.ceil(
    values.reduce<number>((total, value) => total + JSON.stringify(value).length, 0) / 4,
  );
}

function compactWorksheetAiText(value: string | null | undefined, maxLength: number) {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function getPromptKeywordTokens(prompt: string) {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 24);
}

const FORMULA_SCOPE_STOPWORDS = new Set([
  "formula",
  "formulas",
  "wrong",
  "check",
  "review",
  "edit",
  "fix",
  "rows",
  "row",
  "from",
  "there",
  "nearby",
  "total",
  "totals",
  "calculate",
  "calculating",
]);

function rowMatchesPromptTokens(
  row: PricingWorksheetStructureSnapshot["rows"][number],
  tokens: string[],
) {
  if (tokens.length === 0) {
    return false;
  }

  const haystack = [
    row.label ?? "",
    row.sectionName ?? "",
    row.notesPreview ?? "",
    ...row.valuesPreview,
    ...row.formulaRefs,
  ]
    .join(" ")
    .toLowerCase();

  return tokens.some((token) => haystack.includes(token));
}

function getSelectedWorksheetRowNumbers(worksheetContext: PricingWorksheetAiCompactContext) {
  const rows = new Set<number>();
  for (const key of [
    worksheetContext.visibleSelection.activeCellKey,
    worksheetContext.visibleSelection.focusCellKey,
    worksheetContext.visibleSelection.anchorCellKey,
  ]) {
    if (typeof key !== "string") {
      continue;
    }
    const parsed = /^([A-Z]+)(\d+)$/i.exec(key.trim());
    if (parsed) {
      rows.add(Number(parsed[2]));
    }
  }
  return rows;
}

function buildRowRanges(rowNumbers: number[]) {
  const sorted = [...new Set(rowNumbers)].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return [] as Array<{ startRow: number; endRow: number }>;
  }

  const ranges: Array<{ startRow: number; endRow: number }> = [];
  let startRow = sorted[0];
  let previousRow = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    const rowNumber = sorted[index];
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

function getWorksheetFormulaEntriesForRow(
  worksheet: WorksheetData,
  rowNumber: number,
  maxColumns = 12,
) {
  const row = worksheet.rows[rowNumber - 1];
  if (!row) {
    return [] as Array<{ ref: string; formula: string }>;
  }

  return worksheet.columns.slice(0, maxColumns).flatMap((column) => {
    const cell = worksheet.cells[buildWorksheetCellKey(column.id, row.id)];
    const formula = typeof cell?.formula === "string" ? cell.formula.trim() : "";
    if (!formula) {
      return [];
    }
    return [
      {
        ref: `${column.id}${rowNumber}`,
        formula: formula.startsWith("=") ? formula : `=${formula}`,
      },
    ];
  });
}

function filterSnapshotToScopedRows(params: {
  snapshot: PricingWorksheetStructureSnapshot;
  keptRowNumbers: Set<number>;
  note: string | null;
}) {
  const rows = params.snapshot.rows.filter((row) => params.keptRowNumbers.has(row.rowNumber));
  const keptSectionNames = new Set(
    rows
      .map((row) => row.sectionName)
      .filter((name): name is string => typeof name === "string" && name.length > 0),
  );
  const sections = params.snapshot.sections.filter(
    (section) =>
      keptSectionNames.has(section.title) ||
      [...params.keptRowNumbers].some(
        (rowNumber) => rowNumber >= section.startRow && rowNumber <= section.endRow + 1,
      ),
  );
  const allowedSectionTitles = new Set(sections.map((section) => section.title));
  const filteredRows = rows.filter(
    (row) => !row.sectionName || allowedSectionTitles.has(row.sectionName),
  );
  const targetRows = params.snapshot.formulaTargets.rows.filter(
    (row) =>
      params.keptRowNumbers.has(row.rowNumber) ||
      (!!row.sectionName && allowedSectionTitles.has(row.sectionName)),
  );
  const totals = params.snapshot.totals.filter((total) =>
    sections.some((section) => total.rowNumber >= section.startRow && total.rowNumber <= section.endRow + 2),
  );
  const normalizeKey = (value: string | null | undefined) =>
    (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const allowedSectionKeys = new Set([...allowedSectionTitles].map((section) => normalizeKey(section)));
  const allowedRefs = new Set<string>(
    targetRows.flatMap((row) =>
      [
        row.primaryRef,
        row.cells.quantity,
        row.cells.materialRate,
        row.cells.labourHours,
        row.cells.labourRate,
        row.cells.margin,
        row.cells.total,
        row.cells.notes,
      ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0),
    ),
  );
  const namedRefs = Object.fromEntries(
    Object.entries(params.snapshot.formulaTargets.namedRefs).filter(([, ref]) => allowedRefs.has(ref)),
  );
  const sectionTotals = Object.fromEntries(
    Object.entries(params.snapshot.formulaTargets.sectionTotals).filter(([key]) => allowedSectionKeys.has(key)),
  );
  const sectionTotalRanges = Object.fromEntries(
    Object.entries(params.snapshot.formulaTargets.sectionTotalRanges).filter(([key]) =>
      allowedSectionKeys.has(key),
    ),
  );
  const includedRowNumbers = filteredRows.map((row) => row.rowNumber);
  const omittedRowNumbers = params.snapshot.rows
    .map((row) => row.rowNumber)
    .filter((rowNumber) => !params.keptRowNumbers.has(rowNumber));
  const nextSnapshot = {
    ...params.snapshot,
    rows: filteredRows,
    sections,
    totals,
    formulaTargets: {
      rows: targetRows,
      namedRefs,
      sectionTotals,
      sectionTotalRanges,
    },
    rowCoverage: {
      ...params.snapshot.rowCoverage,
      meaningfulRowCount: params.snapshot.rows.length,
      includedRowCount: includedRowNumbers.length,
      includedRowRanges: buildRowRanges(includedRowNumbers),
      omittedRowRanges: buildRowRanges(omittedRowNumbers),
      note: params.note,
    },
  };

  return {
    ...nextSnapshot,
    estimatedTokenSize: estimateWorksheetAiTokenSize([nextSnapshot]),
  };
}

function buildScopedFormulaContext(params: {
  worksheet: WorksheetData;
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  prompt: string;
}): {
  snapshot: PricingWorksheetStructureSnapshot;
  formulaContextSummary: PricingWorksheetAiFormulaContextSummary | null;
} {
  const { rowScores, matchingSectionNames, selectedRows } = scoreWorksheetSnapshotRows({
    prompt: params.prompt,
    snapshot: params.snapshot,
    worksheetContext: params.worksheetContext,
    workflow: "formula",
    classification: params.classification,
  });
  const promptRowRefs = extractPricingWorksheetPromptRowReferences(params.prompt);
  const promptTokens = getPromptKeywordTokens(params.prompt).filter(
    (token) => !FORMULA_SCOPE_STOPWORDS.has(token),
  );
  const promptMatchedRows = params.snapshot.rows.filter((row) => rowMatchesPromptTokens(row, promptTokens));
  const keptRowNumbers = new Set<number>();
  const includeRow = (rowNumber: number) => {
    if (rowNumber >= 1) {
      keptRowNumbers.add(rowNumber);
    }
  };
  const includeWindow = (rowNumber: number, before = 1, after = 2) => {
    for (let cursor = rowNumber - before; cursor <= rowNumber + after; cursor += 1) {
      includeRow(cursor);
    }
  };

  for (const rowNumber of promptRowRefs.exactRows) {
    includeWindow(rowNumber, 2, 2);
  }
  for (const range of promptRowRefs.rangedRows) {
    for (let cursor = range.startRow - 1; cursor <= range.endRow + 1; cursor += 1) {
      includeRow(cursor);
    }
  }
  for (const rowNumber of promptRowRefs.openEndedRows) {
    for (let cursor = rowNumber - 1; cursor <= rowNumber + 12; cursor += 1) {
      includeRow(cursor);
    }
  }

  const rankedRows = [...params.snapshot.rows]
    .map((row) => ({ row, score: rowScores.get(row.rowNumber) ?? 0 }))
    .sort((left, right) => right.score - left.score || left.row.rowNumber - right.row.rowNumber);
  for (const { row, score } of rankedRows) {
    const promptMatched = rowMatchesPromptTokens(row, promptTokens);
    if (
      score <= 0 &&
      !row.formulaRefs.length &&
      row.rowTypeHint !== "subtotal" &&
      !row.isLikelyInputRow &&
      !row.isLikelyAssumptionRow
    ) {
      continue;
    }
    if (
      promptMatchedRows.length > 0 &&
      !promptMatched &&
      !selectedRows.has(row.rowNumber) &&
      !promptRowRefs.allReferencedRows.includes(row.rowNumber)
    ) {
      continue;
    }
    includeWindow(row.rowNumber, 1, 1);
    if (keptRowNumbers.size >= 18) {
      break;
    }
  }

  for (const rowNumber of selectedRows) {
    includeWindow(rowNumber, 2, 4);
  }

  const relevantSectionNames = new Set<string>();
  for (const sectionName of matchingSectionNames) {
    relevantSectionNames.add(sectionName);
  }
  for (const row of promptMatchedRows) {
    if (row.sectionName) {
      relevantSectionNames.add(row.sectionName);
    }
  }
  for (const section of params.snapshot.sections) {
    if (!relevantSectionNames.has(section.title)) {
      continue;
    }
    includeRow(section.startRow);
    includeRow(section.endRow);
    if (section.subtotalRow) {
      includeWindow(section.subtotalRow, 1, 1);
    }
  }

  const formulaRowsToInspect = params.snapshot.rows.filter(
    (row) =>
      keptRowNumbers.has(row.rowNumber) ||
      (row.sectionName ? relevantSectionNames.has(row.sectionName) : false),
  );
  const referencedRowNumbers = new Set<number>();
  const formulaContextRows: PricingWorksheetAiFormulaContextSummary["existingFormulaRows"] = [];
  for (const row of formulaRowsToInspect) {
    const formulas = getWorksheetFormulaEntriesForRow(params.worksheet, row.rowNumber).slice(0, 3);
    if (formulas.length === 0) {
      continue;
    }
    const summarizedFormulas = formulas.map((entry) => {
      const parsed = parsePricingWorksheetFormula(entry.formula, {
        allowedFunctions: params.snapshot.formulaCompatibility.allowedFunctions,
        maxRowCount: params.snapshot.bounds.rowCount,
        maxColumnCount: params.snapshot.bounds.columnCount,
      });
      const nextReferencedRows = parsed.success
        ? Array.from(
            new Set(
              parsed.referencedCells
                .map((ref) => parseCellRef(ref)?.rowNumber ?? null)
                .filter((rowNumber): rowNumber is number => typeof rowNumber === "number"),
            ),
          ).slice(0, 8)
        : [];
      nextReferencedRows.forEach((rowNumber) => referencedRowNumbers.add(rowNumber));
      return {
        ref: entry.ref,
        formula: compactWorksheetAiText(entry.formula, 80),
        referencedRows: nextReferencedRows,
      };
    });
    formulaContextRows.push({
      rowNumber: row.rowNumber,
      label: row.label,
      sectionName: row.sectionName,
      formulas: summarizedFormulas,
    });
  }

  for (const rowNumber of referencedRowNumbers) {
    includeWindow(rowNumber, 1, 1);
  }

  for (const row of params.snapshot.formulaTargets.rows) {
    if (
      keptRowNumbers.has(row.rowNumber) ||
      referencedRowNumbers.has(row.rowNumber) ||
      relevantSectionNames.has(row.sectionName ?? "")
    ) {
      includeRow(row.rowNumber);
    }
  }

  if (keptRowNumbers.size === 0) {
    for (const row of params.snapshot.rows.filter(
      (entry) => entry.formulaRefs.length > 0 || entry.rowTypeHint === "subtotal" || entry.isLikelyInputRow,
    ).slice(0, 12)) {
      includeWindow(row.rowNumber, 1, 1);
    }
  }

  const scopedSnapshot = filterSnapshotToScopedRows({
    snapshot: params.snapshot,
    keptRowNumbers,
    note:
      keptRowNumbers.size < params.snapshot.rows.length
        ? "Formula context is scoped to the most relevant rows, dependencies, and nearby totals for this request. Do not assume omitted worksheet regions share the same formulas."
        : params.snapshot.rowCoverage.note,
  });
  const formulaRowNumbers = params.snapshot.rows
    .filter((row) => row.formulaRefs.length > 0 || row.rowTypeHint === "subtotal")
    .map((row) => row.rowNumber);
  const omittedFormulaRowRanges = buildRowRanges(
    formulaRowNumbers.filter((rowNumber) => !keptRowNumbers.has(rowNumber)),
  );

  return {
    snapshot: scopedSnapshot,
    formulaContextSummary: {
      focusedRowNumbers: [...keptRowNumbers].sort((left, right) => left - right),
      focusedSectionTitles: [...relevantSectionNames].slice(0, 8),
      existingFormulaRows: formulaContextRows
        .filter((row) => keptRowNumbers.has(row.rowNumber))
        .slice(0, 12),
      omittedFormulaRowRanges,
      note:
        omittedFormulaRowRanges.length > 0
          ? `Omitted formula row ranges: ${omittedFormulaRowRanges
              .map((range) => (range.startRow === range.endRow ? `${range.startRow}` : `${range.startRow}-${range.endRow}`))
              .join(", ")}.`
          : scopedSnapshot.rowCoverage.note,
    },
  };
}

function buildCompactedConstructionSummary(
  summary: ReturnType<typeof buildAnthropicConstructionSummary>,
  level: FormulaStageContextBudgetLevel,
) {
  const maxMemoryLength = level === 0 ? 420 : level === 1 ? 260 : 180;
  const maxGuidanceLength = level === 0 ? 420 : level === 1 ? 260 : 180;
  const maxRules = level <= 1 ? 3 : 2;
  return {
    ...summary,
    organizationConstructionContext: compactWorksheetAiText(
      typeof summary.organizationConstructionContext === "string" ? summary.organizationConstructionContext : "",
      level === 0 ? 520 : level === 1 ? 340 : 220,
    ),
    organizationMemorySummary: compactWorksheetAiText(summary.organizationMemorySummary, maxMemoryLength),
    organizationGuidanceSummary: compactWorksheetAiText(summary.organizationGuidanceSummary, maxGuidanceLength),
    tradeHints: summary.tradeHints.slice(0, level <= 1 ? 6 : 4),
    systemHints: summary.systemHints.slice(0, level <= 1 ? 6 : 4),
    retrievalReasons: summary.retrievalReasons.slice(0, level <= 1 ? 6 : 4),
    assumptionCautionRules: summary.assumptionCautionRules.slice(0, maxRules),
    followUpContextSummary: summary.followUpContextSummary
      ? {
          ...summary.followUpContextSummary,
          userCorrection: compactWorksheetAiText(
            typeof summary.followUpContextSummary.userCorrection === "string"
              ? summary.followUpContextSummary.userCorrection
              : "",
            level <= 1 ? 120 : 80,
          ),
          previousSummary: compactWorksheetAiText(
            typeof summary.followUpContextSummary.previousSummary === "string"
              ? summary.followUpContextSummary.previousSummary
              : "",
            level <= 1 ? 140 : 90,
          ),
        }
      : null,
  };
}

function scoreWorksheetSnapshotRows(params: {
  prompt: string;
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  workflow: "formula" | "formatting";
  classification: PricingWorksheetConstructionIntent;
}) {
  const tokens = getPromptKeywordTokens(params.prompt);
  const selectedRows = getSelectedWorksheetRowNumbers(params.worksheetContext);
  const matchingSectionNames = new Set<string>();
  const scores = new Map<number, number>();

  for (const row of params.snapshot.rows) {
    const text = [
      row.label ?? "",
      row.sectionName ?? "",
      row.notesPreview ?? "",
      ...row.valuesPreview,
      ...row.formulaRefs,
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    if (selectedRows.has(row.rowNumber)) {
      score += 100;
    }
    if (tokens.some((token) => text.includes(token))) {
      score += 40;
      if (row.sectionName) {
        matchingSectionNames.add(row.sectionName);
      }
    }
    if (params.workflow === "formula") {
      if (row.formulaRefs.length > 0 || row.rowPurposeHint === "formula_target") {
        score += 30;
      }
      if (
        params.classification.primaryIntent === "formula_fix" &&
        (row.formulaRefs.length > 0 || row.rowTypeHint === "formula" || row.rowTypeHint === "subtotal")
      ) {
        score += 35;
      }
      if (row.isLikelyInputRow || row.isLikelyAssumptionRow) {
        score += 25;
      }
    } else {
      if (row.isLikelyInputRow) {
        score += 35;
      }
      if (row.isLikelyAssumptionRow) {
        score += 30;
      }
      if (row.rowPurposeHint === "formula_target" || row.formulaRefs.length > 0) {
        score += 25;
      }
    }
    if (row.rowTypeHint === "subtotal") {
      score += 20;
    }
    scores.set(row.rowNumber, score);
  }

  return {
    rowScores: scores,
    matchingSectionNames,
    selectedRows,
  };
}

function buildCompactedSnapshot(params: {
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  prompt: string;
  classification: PricingWorksheetConstructionIntent;
  workflow: "formula" | "formatting";
  level: Exclude<FormulaStageContextBudgetLevel, 4>;
}) {
  if (params.level === 0) {
    return params.snapshot;
  }

  const trimRow = (
    row: PricingWorksheetStructureSnapshot["rows"][number],
    aggressive: boolean,
  ): PricingWorksheetStructureSnapshot["rows"][number] => ({
    ...row,
    label: row.label ? compactWorksheetAiText(row.label, aggressive ? 36 : 60) : row.label,
    sectionName: row.sectionName ? compactWorksheetAiText(row.sectionName, aggressive ? 32 : 48) : row.sectionName,
    valuesPreview: aggressive ? row.valuesPreview.slice(0, 2) : row.valuesPreview.slice(0, 4),
    formulaRefs: row.formulaRefs.slice(0, aggressive ? 2 : 4),
    notesPreview: aggressive ? null : row.notesPreview ? compactWorksheetAiText(row.notesPreview, 60) : null,
  });
  const trimTargetRow = (
    row: PricingWorksheetStructureSnapshot["formulaTargets"]["rows"][number],
    aggressive: boolean,
  ): PricingWorksheetStructureSnapshot["formulaTargets"]["rows"][number] => ({
    ...row,
    label: row.label ? compactWorksheetAiText(row.label, aggressive ? 36 : 60) : row.label,
    sectionName: row.sectionName ? compactWorksheetAiText(row.sectionName, aggressive ? 32 : 48) : row.sectionName,
    notesPreview: aggressive ? null : row.notesPreview ? compactWorksheetAiText(row.notesPreview, 60) : null,
  });

  let rows = params.snapshot.rows;
  let targetRows = params.snapshot.formulaTargets.rows;
  let sections = params.snapshot.sections;
  let totals = params.snapshot.totals;
  let namedRefs = params.snapshot.formulaTargets.namedRefs;
  let sectionTotals = params.snapshot.formulaTargets.sectionTotals;
  let sectionTotalRanges = params.snapshot.formulaTargets.sectionTotalRanges;

  if (params.level >= 2) {
    const { rowScores, matchingSectionNames, selectedRows } = scoreWorksheetSnapshotRows({
      prompt: params.prompt,
      snapshot: params.snapshot,
      worksheetContext: params.worksheetContext,
      workflow: params.workflow,
      classification: params.classification,
    });
    const maxRows = params.level === 2 ? 16 : 10;
    const rankedRows = [...params.snapshot.rows]
      .map((row) => ({ row, score: rowScores.get(row.rowNumber) ?? 0 }))
      .sort((left, right) => right.score - left.score || left.row.rowNumber - right.row.rowNumber);
    const keptRowNumbers = new Set<number>();
    const keepRowNumber = (rowNumber: number) => {
      if (rowNumber >= 1) {
        keptRowNumbers.add(rowNumber);
      }
    };

    for (const row of rankedRows) {
      if (
        keptRowNumbers.size >= maxRows &&
        !(row.row.isLikelyInputRow || row.row.isLikelyAssumptionRow || row.row.rowTypeHint === "subtotal")
      ) {
        continue;
      }
      if (
        row.score > 0 ||
        row.row.isLikelyInputRow ||
        row.row.isLikelyAssumptionRow ||
        row.row.rowTypeHint === "subtotal" ||
        selectedRows.has(row.row.rowNumber)
      ) {
        keepRowNumber(row.row.rowNumber);
        keepRowNumber(row.row.rowNumber - 1);
        keepRowNumber(row.row.rowNumber + 1);
      }
    }

    for (const targetRow of params.snapshot.formulaTargets.rows) {
      if (targetRow.isLikelyInputRow || targetRow.isLikelyAssumptionRow) {
        keepRowNumber(targetRow.rowNumber);
      }
    }

    rows = params.snapshot.rows.filter((row) => keptRowNumbers.has(row.rowNumber));
    const keptSectionNames = new Set(
      rows
        .map((row) => row.sectionName)
        .filter((name): name is string => typeof name === "string" && name.length > 0),
    );
    for (const sectionName of matchingSectionNames) {
      keptSectionNames.add(sectionName);
    }
    sections = params.snapshot.sections
      .filter((section) => keptSectionNames.has(section.title) || [...keptRowNumbers].some((rowNumber) => rowNumber >= section.startRow && rowNumber <= section.endRow))
      .slice(0, params.level === 2 ? 4 : 2);
    const allowedSectionTitles = new Set(sections.map((section) => section.title));
    rows = rows.filter((row) => !row.sectionName || allowedSectionTitles.has(row.sectionName));
    targetRows = params.snapshot.formulaTargets.rows.filter(
      (row) =>
        keptRowNumbers.has(row.rowNumber) ||
        row.isLikelyInputRow ||
        row.isLikelyAssumptionRow ||
        (!!row.sectionName && allowedSectionTitles.has(row.sectionName)),
    );
    totals = params.snapshot.totals
      .filter((total) =>
        [...sections].some((section) => total.rowNumber >= section.startRow && total.rowNumber <= section.endRow + 2),
      )
      .slice(0, params.level === 2 ? 6 : 4);
    const normalizeKey = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const allowedSectionKeys = new Set([...allowedSectionTitles].map((section) => normalizeKey(section)));
    sectionTotals = Object.fromEntries(
      Object.entries(params.snapshot.formulaTargets.sectionTotals).filter(([key]) => allowedSectionKeys.has(key)),
    );
    sectionTotalRanges = Object.fromEntries(
      Object.entries(params.snapshot.formulaTargets.sectionTotalRanges).filter(([key]) => allowedSectionKeys.has(key)),
    );
    const allowedRefs = new Set<string>(
      targetRows.flatMap((row) =>
        [
          row.primaryRef,
          row.cells.quantity,
          row.cells.materialRate,
          row.cells.labourHours,
          row.cells.labourRate,
          row.cells.margin,
          row.cells.total,
          row.cells.notes,
        ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0),
      ),
    );
    namedRefs = Object.fromEntries(
      Object.entries(params.snapshot.formulaTargets.namedRefs).filter(([, ref]) => allowedRefs.has(ref)),
    );
  }

  const aggressive = params.level >= 3;
  const compactedSnapshotWithoutEstimate = {
    ...params.snapshot,
    rows: rows.map((row) => trimRow(row, aggressive)),
    sections: sections.map((section) => ({
      ...section,
      title: compactWorksheetAiText(section.title, aggressive ? 28 : 44),
    })),
    totals: totals.map((total) => ({
      ...total,
      label: compactWorksheetAiText(total.label, aggressive ? 28 : 44),
      formulaPattern: aggressive ? total.formulaPattern : total.formulaPattern,
    })),
    formulaTargets: {
      rows: targetRows.map((row) => trimTargetRow(row, aggressive)),
      namedRefs,
      sectionTotals,
      sectionTotalRanges,
    },
  };

  return {
    ...compactedSnapshotWithoutEstimate,
    estimatedTokenSize: estimateWorksheetAiTokenSize([compactedSnapshotWithoutEstimate]),
  };
}

function buildFormulaStageContextBudget(params: {
  workflow: "formula" | "formatting";
  prompt: string;
  systemPrompt: string;
  worksheet: WorksheetData;
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  constructionSummary: ReturnType<typeof buildAnthropicConstructionSummary>;
  assumptionRows: ReturnType<typeof buildAnthropicAssumptionRowSummary>;
  stageAssumptions?: string[];
  stageWarnings?: string[];
  promptBuilder: (input: {
    snapshot: PricingWorksheetStructureSnapshot;
    constructionSummary: ReturnType<typeof buildAnthropicConstructionSummary>;
    assumptionRows: ReturnType<typeof buildAnthropicAssumptionRowSummary>;
    formulaContextSummary: PricingWorksheetAiFormulaContextSummary | null;
    stageAssumptions: string[];
    stageWarnings: string[];
  }) => string;
}): FormulaStageContextBudget {
  const baseStageAssumptions = (params.stageAssumptions ?? []).slice(0, 12);
  const baseStageWarnings = (params.stageWarnings ?? []).slice(0, 12);
  const formulaScope =
    params.workflow === "formula"
      ? buildScopedFormulaContext({
          worksheet: params.worksheet,
          snapshot: params.snapshot,
          worksheetContext: params.worksheetContext,
          classification: params.classification,
          prompt: params.prompt,
        })
      : null;
  const baseSnapshot = formulaScope?.snapshot ?? params.snapshot;
  const formulaContextSummary = formulaScope?.formulaContextSummary ?? null;
  for (const level of [0, 1, 2, 3] as const) {
    const snapshot = buildCompactedSnapshot({
      snapshot: baseSnapshot,
      worksheetContext: params.worksheetContext,
      prompt: params.prompt,
      classification: params.classification,
      workflow: params.workflow,
      level,
    });
    const constructionSummary = buildCompactedConstructionSummary(params.constructionSummary, level);
    const assumptionRows = buildAnthropicAssumptionRowSummary(snapshot).slice(0, level <= 1 ? 16 : 10);
    const stageAssumptions = baseStageAssumptions.map((entry) =>
      compactWorksheetAiText(entry, level <= 1 ? 100 : 60),
    );
    const stageWarnings = baseStageWarnings.map((entry) =>
      compactWorksheetAiText(entry, level <= 1 ? 100 : 60),
    );
    const userPrompt = params.promptBuilder({
      snapshot,
      constructionSummary,
      assumptionRows,
      formulaContextSummary,
      stageAssumptions,
      stageWarnings,
    });
    const tokenBreakdown = {
      systemPromptTokens: estimateWorksheetAiTokenSize([params.systemPrompt]),
      userPromptTokens: estimateWorksheetAiTokenSize([userPrompt]),
      snapshotTokens: estimateWorksheetAiTokenSize([snapshot]),
      constructionSummaryTokens: estimateWorksheetAiTokenSize([constructionSummary]),
      assumptionRowsTokens: estimateWorksheetAiTokenSize([assumptionRows]),
      totalEstimatedTokens: estimateWorksheetAiTokenSize([params.systemPrompt, userPrompt]),
      maxAllowedTokens: WORKSHEET_AI_FORMULA_STAGE_MAX_INPUT_TOKENS,
      budgetTier: snapshot.budgetTier,
      formulaTargetRowCount: snapshot.formulaTargets.rows.length,
      compactionLevel: level,
    };
    if (tokenBreakdown.totalEstimatedTokens <= WORKSHEET_AI_FORMULA_STAGE_MAX_INPUT_TOKENS) {
      return {
        snapshot,
        constructionSummary,
        assumptionRows,
        formulaContextSummary,
        stageAssumptions,
        stageWarnings,
        userPrompt,
        compactionLevel: level,
        tokenBreakdown,
      };
    }
  }

  const finalSnapshot = buildCompactedSnapshot({
    snapshot: baseSnapshot,
    worksheetContext: params.worksheetContext,
    prompt: params.prompt,
    classification: params.classification,
    workflow: params.workflow,
    level: 3,
  });
  const finalConstructionSummary = buildCompactedConstructionSummary(params.constructionSummary, 3);
  const finalAssumptionRows = buildAnthropicAssumptionRowSummary(finalSnapshot).slice(0, 10);
  const finalStageAssumptions = baseStageAssumptions.map((entry) => compactWorksheetAiText(entry, 60));
  const finalStageWarnings = baseStageWarnings.map((entry) => compactWorksheetAiText(entry, 60));
  const finalUserPrompt = params.promptBuilder({
    snapshot: finalSnapshot,
    constructionSummary: finalConstructionSummary,
    assumptionRows: finalAssumptionRows,
    formulaContextSummary,
    stageAssumptions: finalStageAssumptions,
    stageWarnings: finalStageWarnings,
  });

  return {
    snapshot: finalSnapshot,
    constructionSummary: finalConstructionSummary,
    assumptionRows: finalAssumptionRows,
    formulaContextSummary,
    stageAssumptions: finalStageAssumptions,
    stageWarnings: finalStageWarnings,
    userPrompt: finalUserPrompt,
    compactionLevel: 4,
    tokenBreakdown: {
      systemPromptTokens: estimateWorksheetAiTokenSize([params.systemPrompt]),
      userPromptTokens: estimateWorksheetAiTokenSize([finalUserPrompt]),
      snapshotTokens: estimateWorksheetAiTokenSize([finalSnapshot]),
      constructionSummaryTokens: estimateWorksheetAiTokenSize([finalConstructionSummary]),
      assumptionRowsTokens: estimateWorksheetAiTokenSize([finalAssumptionRows]),
      totalEstimatedTokens: estimateWorksheetAiTokenSize([params.systemPrompt, finalUserPrompt]),
      maxAllowedTokens: WORKSHEET_AI_FORMULA_STAGE_MAX_INPUT_TOKENS,
      budgetTier: finalSnapshot.budgetTier,
      formulaTargetRowCount: finalSnapshot.formulaTargets.rows.length,
      compactionLevel: 4,
    },
    blockedMessage:
      "This formula request needs a smaller target area. Please select a section or ask for one section at a time.",
  };
}

export function buildFormulaStageContextBudgetForTest(params: {
  workflow: "formula" | "formatting";
  prompt: string;
  systemPrompt: string;
  worksheet: WorksheetData;
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  constructionSummary: ReturnType<typeof buildAnthropicConstructionSummary>;
  assumptionRows: ReturnType<typeof buildAnthropicAssumptionRowSummary>;
  promptBuilder: (input: {
    snapshot: PricingWorksheetStructureSnapshot;
    constructionSummary: ReturnType<typeof buildAnthropicConstructionSummary>;
    assumptionRows: ReturnType<typeof buildAnthropicAssumptionRowSummary>;
    formulaContextSummary: PricingWorksheetAiFormulaContextSummary | null;
    stageAssumptions: string[];
    stageWarnings: string[];
  }) => string;
}) {
  return buildFormulaStageContextBudget({
    ...params,
    stageAssumptions: [],
    stageWarnings: [],
  });
}

function createFormulaStageOversizeError(payload: Record<string, unknown>) {
  const error = new Error("Formula-stage worksheet context exceeds the safe token budget.") as Error & {
    code?: string;
    diagnostics?: Record<string, unknown>;
  };
  error.code = "formula_stage_context_too_large";
  error.diagnostics = payload;
  return error;
}

function isFormulaStageOversizeError(error: unknown): error is Error & {
  code: "formula_stage_context_too_large";
  diagnostics?: Record<string, unknown>;
} {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: string }).code === "formula_stage_context_too_large"
  );
}

function stripFormulaChangesFromResponse(
  response: PricingWorksheetAiAssistantResponse,
): PricingWorksheetAiAssistantResponse {
  return {
    ...response,
    operations: response.operations.map((operation) => ({
      ...operation,
      formulas: {
        cells: [],
      },
    })),
    warnings: Array.from(new Set([...(response.warnings ?? []), "ai_formula_generation_deferred_to_stage_b"])),
  };
}

function buildAnthropicFormulaStageSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "answer", "suggestions", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["formula_suggestions", "answer_only"],
      },
      answer: { type: "string" },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["targetRowNumber", "targetColumn", "expression", "rationale"],
          properties: {
            targetRowNumber: { type: "number" },
            targetColumn: { type: "string" },
            expression: { type: "string" },
            rationale: { type: "string" },
          },
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
  } as const;
}

function isFormattingWorksheetPrompt(prompt: string) {
  return /\b(?:highlight|colour|color|mark|shade|identify|show)\b[\s\S]{0,80}\b(?:input|fillable|fill in|manual input|cells?|areas?)\b/i.test(
    prompt,
  );
}

function isWorksheetGenerationStylePrompt(prompt: string) {
  return /(?:build|create|generate|make|draft|set up|fill|populate)\b[\s\S]{0,100}\b(?:worksheet|spreadsheet|sheet|page|calculator|pricing tool|pricing worksheet|estimator)\b/i.test(
    prompt,
  );
}

function shouldPrioritizeGenerationWorkflow(params: {
  classification: PricingWorksheetConstructionIntent;
  worksheetState: PricingWorksheetState;
}) {
  return (
    params.classification.primaryIntent === "worksheet_generation" &&
    params.classification.recommendedPromptPath === "generation"
  );
}

function shouldUseBlankStarterGenerationWorkflow(params: {
  prompt: string;
  classification: PricingWorksheetConstructionIntent;
  worksheetState: PricingWorksheetState;
}) {
  if (params.worksheetState !== "blank" && params.worksheetState !== "starter_generated") {
    return false;
  }

  if (
    shouldPrioritizeGenerationWorkflow({
      classification: params.classification,
      worksheetState: params.worksheetState,
    })
  ) {
    return true;
  }

  return isWorksheetGenerationStylePrompt(params.prompt);
}

function shouldFallbackBlankStarterFormulaSuggestionsToGeneration(params: {
  prompt: string;
  classification: PricingWorksheetConstructionIntent;
  worksheetState: PricingWorksheetState;
  response: PricingWorksheetAiAssistantResponse;
}) {
  return (
    shouldUseBlankStarterGenerationWorkflow({
      prompt: params.prompt,
      classification: params.classification,
      worksheetState: params.worksheetState,
    }) &&
    params.response.operations.length === 0 &&
    params.response.mode === "answer_only"
  );
}

function routeAnthropicWorkflow(params: {
  provider: "openai" | "anthropic";
  prompt: string;
  classification: PricingWorksheetConstructionIntent;
  worksheetState: PricingWorksheetState;
  selection?: PricingWorksheetAiCompactContext["visibleSelection"] | null;
}) {
  if (params.provider !== "anthropic") {
    return null;
  }

  if (
    shouldPrioritizeGenerationWorkflow({
      classification: params.classification,
      worksheetState: params.worksheetState,
    }) ||
    shouldUseBlankStarterGenerationWorkflow({
      prompt: params.prompt,
      classification: params.classification,
      worksheetState: params.worksheetState,
    })
  ) {
    return "staged_generation" as AnthropicWorkflow;
  }

  if (isFormattingWorksheetPrompt(params.prompt)) {
    return "formatting" as AnthropicWorkflow;
  }

  if (isExplicitFormulaMutationPrompt(params.prompt) && params.worksheetState !== "blank") {
    return "formula_suggestions" as AnthropicWorkflow;
  }

  if (
    (params.classification.primaryIntent === "formula_generate" ||
      params.classification.primaryIntent === "formula_fix") &&
    params.worksheetState !== "blank"
  ) {
    return "formula_suggestions" as AnthropicWorkflow;
  }

  if (
    params.classification.primaryIntent === "review_estimate" ||
    params.classification.recommendedPromptPath === "review"
  ) {
    return "review" as AnthropicWorkflow;
  }

  if (
    params.classification.primaryIntent === "unknown" ||
    params.classification.recommendedPromptPath === "unknown"
  ) {
    return "safe_unknown_fallback" as AnthropicWorkflow;
  }

  if (
    params.classification.recommendedPromptPath === "edit" ||
    params.classification.primaryIntent === "worksheet_edit" ||
    params.classification.primaryIntent === "quantity_update" ||
    params.classification.primaryIntent === "labour_adjustment" ||
    params.classification.primaryIntent === "wastage_adjustment" ||
    params.classification.primaryIntent === "margin_adjustment"
  ) {
    return "compact_edit_intent" as AnthropicWorkflow;
  }

  if (
    params.classification.recommendedPromptPath === "answer" ||
    params.classification.primaryIntent === "answer_only" ||
    params.classification.primaryIntent === "formula_explain"
  ) {
    return "answer_only" as AnthropicWorkflow;
  }

  return "safe_unknown_fallback" as AnthropicWorkflow;
}

export function routeAnthropicWorkflowForTest(params: {
  provider: "openai" | "anthropic";
  prompt: string;
  classification: PricingWorksheetConstructionIntent;
  worksheetState: PricingWorksheetState;
  selection?: PricingWorksheetAiCompactContext["visibleSelection"] | null;
}) {
  return routeAnthropicWorkflow(params);
}

function buildAnthropicFormattingStageSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "answer", "operations", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["formatting_suggestions", "answer_only"],
      },
      answer: { type: "string" },
      operations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "targetCells", "rationale"],
          properties: {
            type: {
              type: "string",
              enum: ["format_cell", "format_cells"],
            },
            targetCells: {
              type: "array",
              items: { type: "string" },
            },
            backgroundColor: { type: "string" },
            textColor: { type: "string" },
            bold: { type: "boolean" },
            italic: { type: "boolean" },
            rationale: { type: "string" },
          },
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
  } as const;
}

function normalizeFormulaSuggestionsPayload(value: unknown): {
  mode: "formula_suggestions" | "answer_only";
  answer: string;
  assumptions: string[];
  warnings: string[];
  suggestions: PricingWorksheetAiFormulaSuggestion[];
} {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const suggestions = Array.isArray(candidate.suggestions)
    ? candidate.suggestions
        .map((entry) => {
          const suggestion = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          if (!suggestion) {
            return null;
          }
          if (
            typeof suggestion.targetRowNumber !== "number" ||
            !Number.isInteger(suggestion.targetRowNumber) ||
            suggestion.targetRowNumber < 1 ||
            typeof suggestion.targetColumn !== "string" ||
            suggestion.targetColumn.trim().length === 0 ||
            typeof suggestion.expression !== "string" ||
            suggestion.expression.trim().length === 0
          ) {
            return null;
          }

          return {
            targetRowNumber: suggestion.targetRowNumber,
            targetColumn: suggestion.targetColumn.trim().toUpperCase(),
            expression: suggestion.expression.trim(),
            rationale:
              typeof suggestion.rationale === "string" && suggestion.rationale.trim().length > 0
                ? suggestion.rationale.trim()
                : "Apply worksheet-aware formula logic to the generated structure.",
          } satisfies PricingWorksheetAiFormulaSuggestion;
        })
        .filter((entry): entry is PricingWorksheetAiFormulaSuggestion => Boolean(entry))
        .slice(0, WORKSHEET_AI_FORMULA_STAGE_MAX_SUGGESTIONS)
    : [];

  return {
    mode: candidate.mode === "formula_suggestions" ? "formula_suggestions" : "answer_only",
    answer: typeof candidate.answer === "string" ? candidate.answer.trim() : "",
    assumptions:
      Array.isArray(candidate.assumptions)
        ? candidate.assumptions
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0)
            .slice(0, 12)
        : [],
    warnings:
      Array.isArray(candidate.warnings)
        ? candidate.warnings
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0)
            .slice(0, 12)
        : [],
    suggestions,
  };
}

function normalizeFormattingSuggestionsPayload(value: unknown): {
  mode: "formatting_suggestions" | "answer_only";
  answer: string;
  assumptions: string[];
  warnings: string[];
  operations: PricingWorksheetAiFormattingSuggestion[];
} {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const operations = Array.isArray(candidate.operations)
    ? candidate.operations
        .map((entry) => {
          const operation = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          if (!operation) {
            return null;
          }
          const targetCells = Array.isArray(operation.targetCells)
            ? operation.targetCells
                .map((cell) => (typeof cell === "string" ? cell.trim().toUpperCase() : ""))
                .filter((cell) => /^[A-Z]+\d+$/.test(cell))
                .slice(0, 48)
            : [];
          const type =
            operation.type === "format_cell" || operation.type === "format_cells"
              ? operation.type
              : targetCells.length <= 1
                ? "format_cell"
                : "format_cells";
          if (targetCells.length === 0) {
            return null;
          }
          return {
            type,
            targetCells,
            backgroundColor:
              typeof operation.backgroundColor === "string" && operation.backgroundColor.trim().length > 0
                ? operation.backgroundColor.trim()
                : null,
            textColor:
              typeof operation.textColor === "string" && operation.textColor.trim().length > 0
                ? operation.textColor.trim()
                : null,
            bold: typeof operation.bold === "boolean" ? operation.bold : null,
            italic: typeof operation.italic === "boolean" ? operation.italic : null,
            rationale:
              typeof operation.rationale === "string" && operation.rationale.trim().length > 0
                ? operation.rationale.trim()
                : "Apply worksheet formatting guidance to the selected cells.",
          } satisfies PricingWorksheetAiFormattingSuggestion;
        })
        .filter((entry): entry is PricingWorksheetAiFormattingSuggestion => Boolean(entry))
        .slice(0, 16)
    : [];

  return {
    mode: candidate.mode === "formatting_suggestions" ? "formatting_suggestions" : "answer_only",
    answer: typeof candidate.answer === "string" ? candidate.answer.trim() : "",
    assumptions: Array.isArray(candidate.assumptions)
      ? candidate.assumptions
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)
          .slice(0, 12)
      : [],
    warnings: Array.isArray(candidate.warnings)
      ? candidate.warnings
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)
          .slice(0, 12)
      : [],
    operations,
  };
}

function buildAnthropicFormattingCandidateSummary(snapshot: PricingWorksheetStructureSnapshot) {
  const uniqueRefs = (refs: Array<string | null | undefined>) =>
    Array.from(new Set(refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)));

  const manualQuantityInputRefs = uniqueRefs(
    snapshot.formulaTargets.rows.flatMap((row) =>
      row.rowPurposeHint !== "subtotal" && row.rowPurposeHint !== "section_heading" ? [row.cells.quantity] : [],
    ),
  ).slice(0, 20);

  const assumptionInputRefs = uniqueRefs(
    snapshot.formulaTargets.rows.flatMap((row) =>
      row.isLikelyInputRow || row.isLikelyAssumptionRow || row.rowPurposeHint === "assumption_input"
        ? [row.cells.quantity, row.cells.materialRate, row.cells.labourHours, row.cells.labourRate, row.cells.margin]
        : [],
    ),
  ).slice(0, 24);

  const ratePricingInputRefs = uniqueRefs(
    snapshot.formulaTargets.rows.flatMap((row) =>
      row.rowPurposeHint !== "subtotal" ? [row.cells.materialRate, row.cells.labourRate, row.cells.margin] : [],
    ),
  ).slice(0, 24);

  const outputFormulaRefs = uniqueRefs(
    [...snapshot.rows.flatMap((row) => row.formulaRefs),
      ...snapshot.formulaTargets.rows.flatMap((row) => [row.cells.total])],
  ).slice(0, 24);

  return {
    manualQuantityInputs: {
      refs: manualQuantityInputRefs,
      preferredBackgroundColor: "#DBEAFE",
      preferredTextColor: "#1D4ED8",
    },
    assumptionOrSystemInputs: {
      refs: assumptionInputRefs,
      preferredBackgroundColor: "#FEF3C7",
      preferredTextColor: "#B45309",
    },
    rateOrPricingInputs: {
      refs: ratePricingInputRefs,
      preferredBackgroundColor: "#DCFCE7",
      preferredTextColor: "#15803D",
    },
    formulaOrOutputCells: {
      refs: outputFormulaRefs,
      preferredBackgroundColor: "#E5E7EB",
      preferredTextColor: "#4B5563",
    },
  };
}

function buildAnthropicFormattingStagePrompt(params: {
  prompt: string;
  snapshot: PricingWorksheetStructureSnapshot;
  constructionSummary: ReturnType<typeof buildAnthropicConstructionSummary>;
  candidates: ReturnType<typeof buildAnthropicFormattingCandidateSummary>;
}) {
  return [
    `User request: ${params.prompt}`,
    `Construction intelligence summary: ${JSON.stringify(params.constructionSummary)}`,
    "This is a worksheet formatting-only task. Suggest highlighting or colouring using only real worksheet refs from the snapshot.",
    "Do not change worksheet values, formulas, or structure.",
    "If the snapshot discloses omitted row ranges, do not claim those rows are visible. State the omitted ranges explicitly instead of guessing.",
    "Prefer format_cells when several cells share the same purpose or colour.",
    "Manual quantity inputs should generally use blue fill, assumption or system inputs amber fill, rate or pricing inputs green fill, and formula or output cells grey fill.",
    "If the worksheet does not clearly expose input cells, return warnings rather than inventing targets.",
    `Formatting candidate refs: ${JSON.stringify(params.candidates)}`,
    `Worksheet structure snapshot: ${JSON.stringify(params.snapshot)}`,
  ].join("\n\n");
}

function buildFormattingOperationsFromSuggestions(params: {
  suggestions: PricingWorksheetAiFormattingSuggestion[];
}) {
  const operations: PricingWorksheetAiOperation[] = [];
  const warnings: string[] = [];

  for (const suggestion of params.suggestions) {
    if (suggestion.targetCells.length === 0) {
      continue;
    }

    const format: PricingWorksheetAiOperation["format"] = {
      ...(suggestion.backgroundColor ? { backgroundColor: suggestion.backgroundColor } : {}),
      ...(suggestion.textColor ? { textColor: suggestion.textColor } : {}),
      ...(typeof suggestion.bold === "boolean" ? { bold: suggestion.bold } : {}),
      ...(typeof suggestion.italic === "boolean" ? { italic: suggestion.italic } : {}),
    };

    if (!format || Object.keys(format).length === 0) {
      warnings.push(`Skipped formatting suggestion for ${suggestion.targetCells.join(", ")} because it had no supported style fields.`);
      continue;
    }

    operations.push({
      type: suggestion.targetCells.length === 1 || suggestion.type === "format_cell" ? "format_cell" : "format_cells",
      target: {
        cell: suggestion.targetCells.length === 1 ? suggestion.targetCells[0] : null,
        cells: suggestion.targetCells,
      },
      values: {
        cells: [],
      },
      formulas: {
        cells: [],
      },
      format,
      rationale: suggestion.rationale,
    });
  }

  return {
    operations,
    warnings: Array.from(new Set(warnings)),
  };
}

function buildAnthropicAnswerOnlyStageSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "proposalName", "answer", "summary", "confidence", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["answer_only"],
      },
      proposalName: { type: "string" },
      answer: { type: "string" },
      summary: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      assumptions: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
    },
  } as const;
}

function normalizeAnthropicAnswerOnlyPayload(value: unknown): PricingWorksheetAiAssistantResponse {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    mode: "answer_only",
    proposalName:
      typeof candidate.proposalName === "string" && candidate.proposalName.trim().length > 0
        ? candidate.proposalName.trim()
        : "Worksheet assistant response",
    answer:
      typeof candidate.answer === "string" && candidate.answer.trim().length > 0
        ? candidate.answer.trim()
        : "No safe worksheet changes could be proposed.",
    summary:
      typeof candidate.summary === "string" && candidate.summary.trim().length > 0
        ? candidate.summary.trim()
        : "No safe worksheet changes could be proposed.",
    confidence:
      candidate.confidence === "high" || candidate.confidence === "medium" || candidate.confidence === "low"
        ? candidate.confidence
        : "low",
    operations: [],
    assumptions: Array.isArray(candidate.assumptions)
      ? candidate.assumptions.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean).slice(0, 12)
      : [],
    warnings: Array.isArray(candidate.warnings)
      ? candidate.warnings.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean).slice(0, 12)
      : [],
  };
}

function buildAnthropicReviewStageSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "answer", "reviewFindings", "reviewSummary", "assumptions", "warnings"],
    properties: {
      mode: { type: "string", enum: ["review_summary", "answer_only"] },
      answer: { type: "string" },
      reviewFindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "finding", "category", "severity", "confidence"],
          properties: {
            title: { type: "string" },
            finding: { type: "string" },
            category: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            assumption: { type: "string" },
            needsConfirmation: { type: "string" },
            suggestedAction: { type: "string" },
            relatedCells: { type: "array", items: { type: "string" } },
            relatedRows: { type: "array", items: { type: "number" } },
          },
        },
      },
      reviewSummary: {
        type: "object",
        additionalProperties: false,
        required: ["presentItems", "possibleMissingItems", "keyRisks", "assumptions", "confirmationsNeeded"],
        properties: {
          presentItems: { type: "array", items: { type: "string" } },
          possibleMissingItems: { type: "array", items: { type: "string" } },
          keyRisks: { type: "array", items: { type: "string" } },
          assumptions: { type: "array", items: { type: "string" } },
          confirmationsNeeded: { type: "array", items: { type: "string" } },
        },
      },
      assumptions: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
    },
  } as const;
}

function normalizeAnthropicReviewPayload(value: unknown): {
  answer: string;
  assumptions: string[];
  warnings: string[];
  reviewFindings: PricingWorksheetAiReviewFinding[];
  reviewSummary: PricingWorksheetAiReviewSummary | null;
} {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const reviewFindings: PricingWorksheetAiReviewFinding[] = Array.isArray(candidate.reviewFindings)
    ? candidate.reviewFindings.flatMap((entry, index) => {
        const finding = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
        if (!finding || typeof finding.title !== "string" || typeof finding.finding !== "string") {
          return [];
        }
        return [
          {
            id: `review-finding-${index + 1}`,
            category:
              typeof finding.category === "string" &&
              [
                "missing_scope",
                "formula_risk",
                "quantity_risk",
                "labour_risk",
                "wastage_risk",
                "specification_uncertainty",
                "quote_readiness",
                "takeoff_readiness",
                "general_review",
              ].includes(finding.category)
                ? (finding.category as PricingWorksheetAiReviewFinding["category"])
                : "general_review",
            severity:
              finding.severity === "high" || finding.severity === "medium" || finding.severity === "low"
                ? finding.severity
                : "medium",
            confidence:
              finding.confidence === "high" || finding.confidence === "medium" || finding.confidence === "low"
                ? finding.confidence
                : "medium",
            title: finding.title.trim(),
            finding: finding.finding.trim(),
            assumption: typeof finding.assumption === "string" ? finding.assumption.trim() : undefined,
            needsConfirmation:
              typeof finding.needsConfirmation === "string" ? finding.needsConfirmation.trim() : undefined,
            suggestedAction: typeof finding.suggestedAction === "string" ? finding.suggestedAction.trim() : undefined,
            relatedCells: Array.isArray(finding.relatedCells)
              ? finding.relatedCells
                  .map((cell) => (typeof cell === "string" ? cell.trim().toUpperCase() : ""))
                  .filter((cell) => /^[A-Z]+\d+$/.test(cell))
              : [],
            relatedRows: Array.isArray(finding.relatedRows)
              ? finding.relatedRows.filter((row): row is number => typeof row === "number" && Number.isInteger(row))
              : [],
          },
        ];
      })
    : [];

  const reviewSummaryCandidate =
    candidate.reviewSummary && typeof candidate.reviewSummary === "object" && !Array.isArray(candidate.reviewSummary)
      ? (candidate.reviewSummary as Record<string, unknown>)
      : null;
  const toStringArray = (value: unknown) =>
    Array.isArray(value)
      ? value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean).slice(0, 12)
      : [];

  return {
    answer: typeof candidate.answer === "string" ? candidate.answer.trim() : "",
    assumptions: toStringArray(candidate.assumptions),
    warnings: toStringArray(candidate.warnings),
    reviewFindings,
    reviewSummary: reviewSummaryCandidate
      ? {
          presentItems: toStringArray(reviewSummaryCandidate.presentItems),
          possibleMissingItems: toStringArray(reviewSummaryCandidate.possibleMissingItems),
          keyRisks: toStringArray(reviewSummaryCandidate.keyRisks),
          assumptions: toStringArray(reviewSummaryCandidate.assumptions),
          confirmationsNeeded: toStringArray(reviewSummaryCandidate.confirmationsNeeded),
        }
      : null,
  };
}

function buildAnthropicCompactEditIntentStageSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "answer", "editIntents", "assumptions", "warnings"],
    properties: {
      mode: { type: "string", enum: ["edit_intent", "answer_only"] },
      answer: { type: "string" },
      editIntents: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action", "rationale"],
          properties: {
            action: { type: "string", enum: ["set_cell_value", "set_cells_value", "insert_row_after", "insert_subtotal"] },
            targetCell: { type: "string" },
            targetCells: { type: "array", items: { type: "string" } },
            values: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["value"],
                properties: {
                  ref: { type: "string" },
                  column: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
            afterRowNumber: { type: "number" },
            subtotalLabel: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
      assumptions: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
    },
  } as const;
}

function normalizeAnthropicCompactEditIntentPayload(value: unknown): {
  answer: string;
  assumptions: string[];
  warnings: string[];
  editIntents: PricingWorksheetAiEditIntentSuggestion[];
} {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const editIntents = Array.isArray(candidate.editIntents)
    ? candidate.editIntents.flatMap((entry) => {
        const intent = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
        if (!intent || typeof intent.action !== "string" || typeof intent.rationale !== "string") {
          return [];
        }
        if (!["set_cell_value", "set_cells_value", "insert_row_after", "insert_subtotal"].includes(intent.action)) {
          return [];
        }
        return [
          {
            action: intent.action as PricingWorksheetAiEditIntentSuggestion["action"],
            targetCell: typeof intent.targetCell === "string" ? intent.targetCell.trim().toUpperCase() : null,
            targetCells: Array.isArray(intent.targetCells)
              ? intent.targetCells
                  .map((cell) => (typeof cell === "string" ? cell.trim().toUpperCase() : ""))
                  .filter((cell) => /^[A-Z]+\d+$/.test(cell))
              : [],
            values: Array.isArray(intent.values)
              ? intent.values.flatMap((valueEntry) => {
                  const valueRecord =
                    valueEntry && typeof valueEntry === "object" ? (valueEntry as Record<string, unknown>) : null;
                  if (!valueRecord || typeof valueRecord.value !== "string") {
                    return [];
                  }
                  return [
                    {
                      ref: typeof valueRecord.ref === "string" ? valueRecord.ref.trim().toUpperCase() : null,
                      column: typeof valueRecord.column === "string" ? valueRecord.column.trim().toUpperCase() : null,
                      value: valueRecord.value.trim(),
                    },
                  ];
                })
              : [],
            afterRowNumber:
              typeof intent.afterRowNumber === "number" && Number.isInteger(intent.afterRowNumber)
                ? intent.afterRowNumber
                : null,
            subtotalLabel: typeof intent.subtotalLabel === "string" ? intent.subtotalLabel.trim() : null,
            rationale: intent.rationale.trim(),
          } satisfies PricingWorksheetAiEditIntentSuggestion,
        ];
      })
    : [];

  const toStringArray = (input: unknown) =>
    Array.isArray(input)
      ? input.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean).slice(0, 12)
      : [];

  return {
    answer: typeof candidate.answer === "string" ? candidate.answer.trim() : "",
    assumptions: toStringArray(candidate.assumptions),
    warnings: toStringArray(candidate.warnings),
    editIntents,
  };
}

function buildCompactEditOperations(params: {
  intents: PricingWorksheetAiEditIntentSuggestion[];
}) {
  const operations: PricingWorksheetAiOperation[] = [];
  const warnings: string[] = [];

  for (const intent of params.intents) {
    if (intent.action === "set_cell_value" && intent.targetCell && intent.values[0]?.value) {
      operations.push({
        type: "update_cell",
        target: {
          cell: intent.targetCell,
          cells: [intent.targetCell],
          row: Number.parseInt(intent.targetCell.replace(/^[A-Z]+/, ""), 10),
        },
        values: {
          cells: [
            {
              ref: intent.targetCell,
              value: intent.values[0].value,
            },
          ],
        },
        formulas: { cells: [] },
        rationale: intent.rationale,
      });
      continue;
    }

    if (intent.action === "set_cells_value" && intent.targetCells.length > 0 && intent.values.length > 0) {
      operations.push({
        type: "update_cells",
        target: {
          cells: intent.targetCells,
        },
        values: {
          cells: intent.values.map((entry, index) => ({
            ref: entry.ref ?? intent.targetCells[index] ?? null,
            column: entry.column,
            value: entry.value,
          })),
        },
        formulas: { cells: [] },
        rationale: intent.rationale,
      });
      continue;
    }

    if (intent.action === "insert_row_after" && intent.afterRowNumber && intent.values.length > 0) {
      operations.push({
        type: "insert_row",
        target: {
          insertAfterRow: intent.afterRowNumber,
          row: intent.afterRowNumber + 1,
        },
        values: {
          cells: intent.values.map((entry) => ({
            column: entry.column,
            value: entry.value,
          })),
        },
        formulas: { cells: [] },
        rationale: intent.rationale,
      });
      continue;
    }

    if (intent.action === "insert_subtotal" && intent.afterRowNumber) {
      operations.push({
        type: "insert_subtotal",
        target: {
          insertAfterRow: intent.afterRowNumber,
          row: intent.afterRowNumber + 1,
        },
        values: {
          cells: intent.subtotalLabel
            ? [
                {
                  column: "B",
                  value: intent.subtotalLabel,
                },
              ]
            : [],
        },
        formulas: { cells: [] },
        rationale: intent.rationale,
      });
      continue;
    }

    warnings.push(`Skipped compact edit intent "${intent.action}" because it could not be converted safely.`);
  }

  return {
    operations,
    warnings: Array.from(new Set(warnings)),
  };
}

function buildAnthropicFormulaStagePrompt(params: {
  prompt: string;
  snapshot: PricingWorksheetStructureSnapshot;
  constructionSummary: ReturnType<typeof buildAnthropicConstructionSummary>;
  assumptionRows: ReturnType<typeof buildAnthropicAssumptionRowSummary>;
  formulaContextSummary: PricingWorksheetAiFormulaContextSummary | null;
  stageAssumptions?: string[];
  stageWarnings?: string[];
}) {
  const compatibility = getPricingWorksheetAiFormulaCompatibility();
  return [
    `User request: ${params.prompt}`,
    `Construction intelligence summary: ${JSON.stringify(params.constructionSummary)}`,
    "The worksheet structure is now real. Suggest formulas only for rows that clearly need formulas.",
    "Use the construction intelligence summary for estimating logic, and use the worksheet snapshot only for real cell and row references.",
    "Use editable input and assumption rows where possible so component quantities are driven by visible worksheet assumptions rather than hidden constants.",
    "If trade or system assumptions are missing, prefer warnings or identify the input rows that should drive the formulas. Do not invent hidden constants or fake placeholders.",
    "Use only actual row numbers, actual column letters, and worksheet-compatible formula syntax.",
    "If the snapshot discloses omitted row ranges, do not claim those rows are visible. State the omitted ranges explicitly instead of guessing.",
    "Return mode=\"formula_suggestions\" when you can add formulas safely, otherwise answer_only.",
    "Each suggestion must target a real row number and a real column letter from the structure snapshot.",
    "The expression must compile to a spreadsheet formula using only supported syntax.",
    "You may reference actual cells like E8, F8, J14, or use worksheet-aware helper expressions such as currentRow.quantity, currentRow.materialRate, row(\"Ceiling Area\").quantity, section(\"Materials\").rows.total, section(\"Materials\").total.",
    "Do not use curly braces, fake refs like 8_Qty, named placeholders, or imaginary rows.",
    "If the worksheet is missing required inputs or assumptions, do not invent placeholders. Return warnings explaining what is missing, or answer_only if no safe formulas can be suggested.",
    `Allowed functions: ${compatibility.allowedFunctions.join(", ")}`,
    `Assumption and input row summary: ${JSON.stringify(params.assumptionRows)}`,
    `Relevant existing formula context: ${JSON.stringify(params.formulaContextSummary)}`,
    `Stage assumptions carried forward: ${JSON.stringify(params.stageAssumptions ?? [])}`,
    `Stage warnings carried forward: ${JSON.stringify(params.stageWarnings ?? [])}`,
    `Worksheet structure snapshot: ${JSON.stringify(params.snapshot)}`,
  ].join("\n\n");
}

function buildCompiledFormulaOperations(params: {
  suggestions: PricingWorksheetAiFormulaSuggestion[];
  snapshot: PricingWorksheetStructureSnapshot;
}) {
  const patches: Array<{
    rowNumber: number;
    column: string;
    formula: string;
    rationale: string;
  }> = [];
  const warnings: string[] = [];
  let successCount = 0;
  let failureCount = 0;
  let unresolvedReferenceCount = 0;

  for (const suggestion of params.suggestions) {
    const targetCell = `${suggestion.targetColumn}${suggestion.targetRowNumber}`;
    const rowTarget = params.snapshot.formulaTargets.rows.find((row) => row.rowNumber === suggestion.targetRowNumber) ?? null;
    const compileResult = compileAiWorksheetFormula({
      expression: suggestion.expression,
      targetCell,
      currentRowNumber: suggestion.targetRowNumber,
      currentSectionName: rowTarget?.sectionName ?? null,
      snapshot: params.snapshot,
    });

    if (!compileResult.success || !compileResult.formula) {
      failureCount += 1;
      unresolvedReferenceCount += compileResult.unresolvedReferences.length;
      warnings.push(
        compileResult.blockedReason === "formula_unresolved_reference"
          ? `Skipped formula for ${targetCell} because it referenced worksheet items that could not be resolved safely.`
          : `Skipped formula for ${targetCell} because it was not compatible with the worksheet formula rules.`,
      );
      continue;
    }

    successCount += 1;
    patches.push({
      rowNumber: suggestion.targetRowNumber,
      column: suggestion.targetColumn,
      formula: compileResult.formula,
      rationale: suggestion.rationale,
    });
    warnings.push(...compileResult.warnings);
  }

  return {
    patches,
    warnings: Array.from(new Set(warnings)),
    successCount,
    failureCount,
    unresolvedReferenceCount,
  };
}

function mergeFormulaPatchesIntoStructureOperations(params: {
  baseResponse: PricingWorksheetAiAssistantResponse;
  patches: Array<{
    rowNumber: number;
    column: string;
    formula: string;
    rationale: string;
  }>;
}): PricingWorksheetAiAssistantResponse {
  const patchesByRow = new Map<number, Array<{ column: string; formula: string; rationale: string }>>();
  for (const patch of params.patches) {
    const existing = patchesByRow.get(patch.rowNumber) ?? [];
    existing.push({
      column: patch.column,
      formula: patch.formula,
      rationale: patch.rationale,
    });
    patchesByRow.set(patch.rowNumber, existing);
  }

  return {
    ...params.baseResponse,
    operations: params.baseResponse.operations.map((operation) => {
      if (operation.type !== "insert_row") {
        return operation;
      }

      const rowNumber = operation.target?.insertBeforeRow ?? operation.target?.row ?? null;
      if (!rowNumber) {
        return operation;
      }

      const rowPatches = patchesByRow.get(rowNumber);
      if (!rowPatches || rowPatches.length === 0) {
        return operation;
      }

      const existingFormulaEntries = Array.isArray(operation.formulas?.cells) ? operation.formulas?.cells : [];
      const mergedFormulas = [...existingFormulaEntries];
      for (const patch of rowPatches) {
        const existingIndex = mergedFormulas.findIndex((entry) => entry.column === patch.column);
        const nextEntry = {
          column: patch.column,
          formula: patch.formula,
        };
        if (existingIndex >= 0) {
          mergedFormulas[existingIndex] = nextEntry;
        } else {
          mergedFormulas.push(nextEntry);
        }
      }

      return {
        ...operation,
        formulas: {
          cells: mergedFormulas,
        },
        rationale: rowPatches[0]?.rationale ?? operation.rationale,
      };
    }),
  };
}

function buildCompiledFormulaUpdateOperations(params: {
  suggestions: PricingWorksheetAiFormulaSuggestion[];
  snapshot: PricingWorksheetStructureSnapshot;
}) {
  const operations: PricingWorksheetAiOperation[] = [];
  const warnings: string[] = [];
  let successCount = 0;
  let failureCount = 0;
  let unresolvedReferenceCount = 0;

  for (const suggestion of params.suggestions) {
    const targetCell = `${suggestion.targetColumn}${suggestion.targetRowNumber}`;
    const rowTarget = params.snapshot.formulaTargets.rows.find((row) => row.rowNumber === suggestion.targetRowNumber) ?? null;
    const compileResult = compileAiWorksheetFormula({
      expression: suggestion.expression,
      targetCell,
      currentRowNumber: suggestion.targetRowNumber,
      currentSectionName: rowTarget?.sectionName ?? null,
      snapshot: params.snapshot,
    });

    if (!compileResult.success || !compileResult.formula) {
      failureCount += 1;
      unresolvedReferenceCount += compileResult.unresolvedReferences.length;
      warnings.push(
        compileResult.blockedReason === "formula_unresolved_reference"
          ? `Skipped formula for ${targetCell} because it referenced worksheet items that could not be resolved safely.`
          : `Skipped formula for ${targetCell} because it was not compatible with the worksheet formula rules.`,
      );
      continue;
    }

    successCount += 1;
    operations.push({
      type: "update_cell",
      target: {
        cell: targetCell,
        cells: [targetCell],
        row: suggestion.targetRowNumber,
      },
      values: {
        cells: [],
      },
      formulas: {
        cells: [
          {
            ref: targetCell,
            formula: compileResult.formula,
          },
        ],
      },
      rationale: suggestion.rationale,
    });
    warnings.push(...compileResult.warnings);
  }

  return {
    operations,
    warnings: Array.from(new Set(warnings)),
    successCount,
    failureCount,
    unresolvedReferenceCount,
  };
}

function appendUniqueWarnings(
  response: PricingWorksheetAiAssistantResponse,
  warnings: Array<string | null | undefined>,
): PricingWorksheetAiAssistantResponse {
  const nextWarnings = warnings
    .map((warning) => (typeof warning === "string" ? warning.trim() : ""))
    .filter((warning) => warning.length > 0);

  if (nextWarnings.length === 0) {
    return response;
  }

  return {
    ...response,
    warnings: Array.from(new Set([...(response.warnings ?? []), ...nextWarnings])),
  };
}

function buildStagedGenerationBatchTitle(batchIndex: number, totalBatchCount: number) {
  return `Safe worksheet build batch ${batchIndex} of ${totalBatchCount}`;
}

function maybeBuildContinuationPlan(params: {
  worksheet: WorksheetData;
  response: PricingWorksheetAiAssistantResponse;
  classification: PricingWorksheetConstructionIntent;
}): {
  response: PricingWorksheetAiAssistantResponse;
  continuation: PricingWorksheetAiContinuationPlan | null;
} {
  const isGenerationRequest =
    params.classification.primaryIntent === "worksheet_generation" ||
    params.classification.recommendedPromptPath === "generation";
  if (!isGenerationRequest || params.response.operations.length === 0) {
    return {
      response: params.response,
      continuation: null,
    };
  }

  const batching = batchPricingWorksheetAiOperationsForSafePreview({
    worksheet: params.worksheet,
    response: params.response,
  });
  if (!batching.ok || batching.batches.length <= 1) {
    return {
      response: params.response,
      continuation: null,
    };
  }

  const totalBatchCount = batching.batches.length;
  const currentBatch = batching.batches[0];
  const remainingBatches = batching.batches.slice(1).map((batch, index) => ({
    id: `continuation-batch-${index + 2}`,
    title: buildStagedGenerationBatchTitle(index + 2, totalBatchCount),
    purpose: "Continue building the generated worksheet with the next validator-safe batch.",
    operations: batch.operations,
    changedCellCount: batch.changedCellCount,
  }));
  const continuationMessage =
    totalBatchCount > 1
      ? `This is a large worksheet, so TradesStack is building it safely in stages. Review and apply batch 1 of ${totalBatchCount} to continue.`
      : "";

  return {
    response: appendUniqueWarnings(
      {
        ...params.response,
        operations: currentBatch.operations,
        summary:
          params.response.summary.trim().length > 0
            ? `${params.response.summary} Prepared batch 1 of ${totalBatchCount} safe worksheet build stages.`
            : `Prepared batch 1 of ${totalBatchCount} safe worksheet build stages.`,
        answer:
          continuationMessage.length > 0
            ? `${params.response.answer.trim()}\n\n${continuationMessage}`.trim()
            : params.response.answer,
      },
      [continuationMessage],
    ),
    continuation: {
      strategy: "safe_generation_batches",
      currentBatchIndex: 1,
      totalBatchCount,
      remainingBatchCount: remainingBatches.length,
      remainingOperationCount: remainingBatches.reduce((sum, batch) => sum + batch.operations.length, 0),
      message: continuationMessage,
      remainingBatches,
    },
  };
}

function buildFallbackResponse(prompt: string, fallbackReason?: string | null): PricingWorksheetAiAssistantResponse {
  const advicePrompt = isAdvicePrompt(prompt);
  const timeoutFailure = typeof fallbackReason === "string" && fallbackReason.includes("timed out");
  const failureAnswer = timeoutFailure
    ? advicePrompt
      ? "The AI request timed out while running web search and structured worksheet generation, so I couldn't answer that request. Please try again."
      : "The AI request timed out while running web search and structured worksheet generation, so no worksheet changes were proposed."
    : advicePrompt
      ? "AI provider connection failed, so I couldn't answer that request. Please check the AI configuration or try again."
      : "AI provider connection failed, so no worksheet changes were proposed.";
  const failureSummary = timeoutFailure
    ? advicePrompt
      ? "AI worksheet assistance timed out before an answer could be generated."
      : "AI worksheet generation timed out before worksheet changes could be proposed."
    : advicePrompt
      ? "AI provider connection failed before an answer could be generated."
      : "AI provider connection failed before worksheet changes could be proposed.";
  const failureWarning = timeoutFailure
    ? "AI worksheet generation timed out during web search and structured output."
    : advicePrompt
      ? "AI provider connection failed while trying to answer this request."
      : "AI provider connection failed, so no worksheet changes were generated.";

  return {
    mode: "answer_only",
    proposalName: "Worksheet assistant response",
    answer: failureAnswer,
    summary: failureSummary,
    confidence: "low",
    operations: [],
    assumptions: [],
    warnings: [failureWarning],
  };
}

async function callWorksheetAssistantModel(
  prompt: string,
  worksheet: WorksheetData,
  worksheetContext: PricingWorksheetAiCompactContext,
  memoryItems: AiMemoryItem[],
  classification: PricingWorksheetConstructionIntent,
  organizationConstructionContext?: string | null,
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null,
  followUpContext?: PricingWorksheetAiFollowUpContext | null,
  qualityRetryCount = 0,
  truncationRetryCount = 0,
  providerRecoveryRetryCount = 0,
  providerOptions?: {
    webSearchEnabled?: boolean;
  },
  executionOptions?: {
    disableGenerationRecoveryRetry?: boolean;
    disableQualityRetries?: boolean;
    formattingToGenerationFallbackUsed?: boolean;
    workflowStage?: "structure_generation" | "formula_generation" | "formatting_generation" | "default";
  },
): Promise<{
  response: PricingWorksheetAiAssistantResponse;
  rawText: string;
  provider: "openai" | "anthropic";
  model: string;
  effectiveWebSearchEnabled: boolean;
}> {
  const webSearchEnabled = providerOptions?.webSearchEnabled !== false;
  const providerSettings = getPricingWorksheetAiProviderSettings(classification, {
    truncationRetryCount,
    providerRecoveryRetryCount,
  });
  const provider = getPricingWorksheetAiProvider();
  const modelConfig = getPricingWorksheetEditAssistantModelConfig();
  const effectiveWorkflowStage = executionOptions?.workflowStage ?? "default";
  const effectiveMaxOutputTokens =
    provider.name === "anthropic" && effectiveWorkflowStage === "structure_generation"
      ? Math.min(providerSettings.maxOutputTokens, WORKSHEET_AI_ANTHROPIC_STAGE_A_MAX_OUTPUT_TOKENS)
      : providerSettings.maxOutputTokens;
  logEditAssistantDebug("provider_request_started", {
    promptLength: prompt.length,
    memoryCount: memoryItems.length,
    worksheetName: worksheetContext.worksheetName,
    provider: provider.name,
    model: modelConfig.model,
    classification,
    timeoutMs: providerSettings.timeoutMs,
    requiresRetrieval: classification.requiresRetrieval,
    recommendedPromptPath: classification.recommendedPromptPath,
    webSearchEnabled,
    workflowStage: effectiveWorkflowStage,
  });
  const requestTimeoutMs = providerSettings.timeoutMs;
  const maxProviderAttempts = providerSettings.maxProviderAttempts;
  logEditAssistantDebug("provider_model", {
    provider: provider.name,
    model: modelConfig.model,
    timeoutMs: requestTimeoutMs,
    maxProviderAttempts,
    maxOutputTokens: effectiveMaxOutputTokens,
    providerRecoveryRetryCount,
    requiresRetrieval: classification.requiresRetrieval,
    recommendedPromptPath: classification.recommendedPromptPath,
    webSearchEnabled,
    workflowStage: effectiveWorkflowStage,
  });
  const { systemPrompt, userPrompt } = buildWorksheetAssistantPrompts({
    prompt,
    worksheetContext,
    memoryItems,
    organizationConstructionContext,
    classification,
    organizationGuidance,
    followUpContext,
  });

  let lastError: Error | null = null;
  const providerRequestStartedAt = Date.now();

  for (let attemptNumber = 1; attemptNumber <= maxProviderAttempts; attemptNumber += 1) {
    const attemptStartedAt = Date.now();
    try {
      const providerResult = await provider.generateEditPlan({
        systemPrompt,
        userPrompt,
        schema: buildPricingWorksheetAiAssistantSchema(),
        model: modelConfig.model,
        timeoutMs: requestTimeoutMs,
        maxOutputTokens: effectiveMaxOutputTokens,
        enableWebSearch: webSearchEnabled,
        metadata: {
          classification,
          recommendedPromptPath: classification.recommendedPromptPath,
          requiresRetrieval: classification.requiresRetrieval,
          attemptNumber,
          workflowStage: effectiveWorkflowStage,
        },
      });

      const providerDurationMs = Date.now() - providerRequestStartedAt;
      logEditAssistantDebug("provider_response_received", {
        hasOutputText: providerResult.outputText.length > 0,
        hasStructuredObject: Boolean(providerResult.parsedJson),
        timeoutMs: requestTimeoutMs,
        requiresRetrieval: classification.requiresRetrieval,
        recommendedPromptPath: classification.recommendedPromptPath,
        webSearchEnabled,
        workflowStage: effectiveWorkflowStage,
        providerDurationMs,
        provider: providerResult.provider,
        model: providerResult.model,
      });
      logEditAssistantDebug("provider_response_snippet", {
        snippet: providerResult.outputText.slice(0, 400),
      });

      const providerAssistantPayload =
        providerResult.provider === "anthropic" &&
        isAnthropicWorksheetDraftResponse(providerResult.parsedJson)
          ? convertAnthropicWorksheetDraftToOperations({
              draft: providerResult.parsedJson,
              worksheet,
              worksheetContext,
              classification,
            })
          : providerResult.parsedJson;

      if (
        providerResult.provider === "anthropic" &&
        isAnthropicWorksheetDraftResponse(providerResult.parsedJson)
      ) {
        logEditAssistantDebug("anthropic_draft_converted", {
          draftMode: providerResult.parsedJson.mode,
          sectionCount: Array.isArray(providerResult.parsedJson.sections) ? providerResult.parsedJson.sections.length : 0,
          convertedOperationCount: Array.isArray(providerAssistantPayload?.operations) ? providerAssistantPayload.operations.length : 0,
          primaryIntent: classification.primaryIntent,
          recommendedPromptPath: classification.recommendedPromptPath,
        });
      }

      let normalized: PricingWorksheetAiAssistantResponse;
      const operationNormalizationDiagnostics = inspectPricingWorksheetAiOperationNormalization(
        providerAssistantPayload,
      );
      try {
        normalized = coerceExplicitFormulaWriteResponse(
          normalizePricingWorksheetAiAssistantResponse(providerAssistantPayload),
          prompt,
          worksheetContext,
        );
      } catch (error) {
        logEditAssistantDebug("schema_validation_error", {
          reason: "schema_normalization_failed",
          ...serializeError(error),
        });
        throw createPricingWorksheetProviderError({
          code: "provider_schema_validation_failed",
          provider: providerResult.provider,
          model: providerResult.model,
          retryable: false,
          message: "AI assistant returned an invalid structured response (schema_normalization_failed).",
          rawError: error,
        });
      }

      const withEvidenceSources = {
        ...normalized,
        warnings: Array.from(new Set([...(normalized.warnings ?? []), ...providerResult.warnings])),
        evidenceSources: mergeEvidenceSources(
          normalized.evidenceSources ?? [],
          providerResult.evidence,
        ),
      };
      const disciplined = applyEvidenceDiscipline(applyReviewRevisionDiscipline({
        response: withEvidenceSources,
        followUpContext,
      }));
      logEditAssistantDebug("parsed_response_mode", {
        mode: disciplined.mode,
        operationCount: disciplined.operations.length,
        rawOperationsPresent: operationNormalizationDiagnostics.rawOperationsPresent,
        rawOperationCount: operationNormalizationDiagnostics.rawOperationCount,
        normalizedOperationCount: operationNormalizationDiagnostics.normalizedOperationCount,
        droppedOperationCount: operationNormalizationDiagnostics.droppedOperationCount,
        droppedOperationReasons: operationNormalizationDiagnostics.droppedOperationReasons,
        invalidOperationTypes: operationNormalizationDiagnostics.invalidOperationTypes,
        provider: providerResult.provider,
        model: providerResult.model,
        primaryIntent: classification.primaryIntent,
        recommendedPromptPath: classification.recommendedPromptPath,
      });

      if (
        providerResult.provider === "anthropic" &&
        executionOptions?.disableQualityRetries !== true &&
        isAnthropicEmptyOperationRetryEnabled() &&
        qualityRetryCount < 1 &&
        shouldRetryForMissingMutationOperations(prompt, classification, disciplined)
      ) {
        logEditAssistantDebug("quality_retry_scheduled", {
          reason: "missing_mutation_operations",
          responseMode: disciplined.mode,
          recommendedPromptPath: classification.recommendedPromptPath,
          primaryIntent: classification.primaryIntent,
        });

        return callWorksheetAssistantModel(
          buildMissingMutationOperationsRetryPrompt(prompt),
          worksheet,
          worksheetContext,
          memoryItems,
          classification,
          organizationConstructionContext,
          organizationGuidance,
          followUpContext,
          qualityRetryCount + 1,
          truncationRetryCount,
          providerRecoveryRetryCount,
          providerOptions,
          executionOptions,
        );
      }

      if (
        executionOptions?.disableQualityRetries !== true &&
        qualityRetryCount < 1 &&
        shouldRetryForLowQualityProposal(prompt, worksheetContext, disciplined)
      ) {
        logEditAssistantDebug("quality_retry_scheduled", {
          reason: "low_quality_formula_proposal",
          worksheetPopulatedCellCount: worksheetContext.populatedCellCount,
          operationCount: normalized.operations.length,
          responseMode: normalized.mode,
        });

        return callWorksheetAssistantModel(
          `${prompt}\n\nCorrection: create a real worksheet formula edit. Do not use zero placeholders. If inputs are missing, leave those input cells blank and add the formula in a separate cell using IFERROR where appropriate.`,
          worksheet,
          worksheetContext,
          memoryItems,
          classification,
          organizationConstructionContext,
          organizationGuidance,
          followUpContext,
          qualityRetryCount + 1,
          truncationRetryCount,
          providerRecoveryRetryCount,
          providerOptions,
          executionOptions,
        );
      }

      return {
        response: disciplined,
        rawText: providerResult.outputText,
        provider: providerResult.provider,
        model: providerResult.model,
        effectiveWebSearchEnabled: providerResult.effectiveWebSearchEnabled,
      };
    } catch (error) {
      if (!isPricingWorksheetProviderError(error)) {
        lastError = error instanceof Error ? error : new Error(String(error));
        throw lastError;
      }

      lastError = error;
      const providerDurationMs = Date.now() - attemptStartedAt;
      const providerFailureReason = getProviderParseFailureReason(error);
      const logReason = error.status === null ? "provider_request_failed" : "provider_http_error";
      logEditAssistantDebug("provider_error", {
        reason: logReason,
        attemptNumber,
        maxAttempts: maxProviderAttempts,
        timeoutMs: requestTimeoutMs,
        requiresRetrieval: classification.requiresRetrieval,
        recommendedPromptPath: classification.recommendedPromptPath,
        webSearchEnabled,
        workflowStage: effectiveWorkflowStage,
        providerDurationMs,
        ...serializeError(error),
        ...buildProviderErrorLogPayload(error),
      });
      if (error.retryable && attemptNumber < maxProviderAttempts) {
        logEditAssistantDebug("provider_retry_scheduled", {
          attemptNumber,
          nextAttemptNumber: attemptNumber + 1,
          retryReason: error.status === null ? "request_failure" : `http_${error.status}`,
        });
        await waitForRetry(350 * attemptNumber);
        continue;
      }

      if (providerFailureReason) {
        logEditAssistantDebug("schema_validation_error", {
          reason: providerFailureReason,
          diagnostics:
            error.rawError && typeof error.rawError === "object" && !Array.isArray(error.rawError)
              ? (error.rawError as Record<string, unknown>).diagnostics
              : null,
        });

        if (providerFailureReason === "truncated_json" && truncationRetryCount < 1) {
          logEditAssistantDebug("provider_retry_scheduled", {
            retryReason: providerFailureReason,
            retryStrategy: "compact_retry",
            truncationRetryCount,
          });
          return callWorksheetAssistantModel(
            buildTruncationRetryPrompt(prompt),
            worksheet,
            worksheetContext,
            memoryItems,
            classification,
            organizationConstructionContext,
            organizationGuidance,
            followUpContext,
            qualityRetryCount,
            truncationRetryCount + 1,
            providerRecoveryRetryCount,
            providerOptions,
          );
        }
      }

      if (
        classification.primaryIntent === "worksheet_generation" &&
        isProviderTimeoutError(lastError) &&
        providerRecoveryRetryCount < 1 &&
        executionOptions?.disableGenerationRecoveryRetry !== true
      ) {
        logEditAssistantDebug("provider_retry_scheduled", {
          retryReason: "compact_generation_recovery",
          providerRecoveryRetryCount,
          timeoutMs: requestTimeoutMs,
          requiresRetrieval: classification.requiresRetrieval,
          recommendedPromptPath: classification.recommendedPromptPath,
        });
        return callWorksheetAssistantModel(
          buildCompactGenerationRetryPrompt(prompt),
          worksheet,
          worksheetContext,
          memoryItems,
          classification,
          organizationConstructionContext,
          organizationGuidance,
          followUpContext,
          qualityRetryCount,
          truncationRetryCount,
          providerRecoveryRetryCount + 1,
          providerOptions,
          executionOptions,
        );
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("OpenAI request failed before a response was received.");
}

async function callAnthropicFormulaStage(params: {
  prompt: string;
  worksheet: WorksheetData;
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  memoryItems: AiMemoryItem[];
  organizationConstructionContext?: string | null;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
  stageAssumptions?: string[];
  stageWarnings?: string[];
  model: string;
  providerOptions?: {
    webSearchEnabled?: boolean;
  };
}): Promise<{
  suggestions: PricingWorksheetAiFormulaSuggestion[];
  assumptions: string[];
  warnings: string[];
  answer: string;
  provider: "openai" | "anthropic";
  model: string;
  effectiveWebSearchEnabled: boolean;
}> {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const systemPrompt = [
    "You are TradesStack's worksheet-aware formula assistant.",
    "Return JSON only.",
    "Do not modify worksheet structure.",
    "Suggest formulas only for real target rows and columns from the provided worksheet snapshot.",
  ].join(" ");
  const constructionSummary = buildAnthropicConstructionSummary({
    worksheetContext: params.worksheetContext,
    classification: params.classification,
    memoryItems: params.memoryItems,
    organizationConstructionContext: params.organizationConstructionContext,
    organizationGuidance: params.organizationGuidance,
    followUpContext: params.followUpContext,
  });
  const contextBudget = buildFormulaStageContextBudget({
    workflow: "formula",
    prompt: params.prompt,
    systemPrompt,
    worksheet: params.worksheet,
    snapshot: params.snapshot,
    worksheetContext: params.worksheetContext,
    classification: params.classification,
    constructionSummary,
    assumptionRows: buildAnthropicAssumptionRowSummary(params.snapshot),
    stageAssumptions: params.stageAssumptions,
    stageWarnings: params.stageWarnings,
    promptBuilder: ({ snapshot, constructionSummary, assumptionRows, formulaContextSummary, stageAssumptions, stageWarnings }) =>
      buildAnthropicFormulaStagePrompt({
        prompt: params.prompt,
        snapshot,
        constructionSummary,
        assumptionRows,
        formulaContextSummary,
        stageAssumptions,
        stageWarnings,
      }),
  });
  if (contextBudget.blockedMessage) {
    const diagnostics = {
      estimatedTokenSize: contextBudget.tokenBreakdown.totalEstimatedTokens,
      maxAllowedTokens: contextBudget.tokenBreakdown.maxAllowedTokens,
      snapshotEstimatedTokenSize: contextBudget.snapshot.estimatedTokenSize,
      systemPromptTokenEstimate: contextBudget.tokenBreakdown.systemPromptTokens,
      userPromptTokenEstimate: contextBudget.tokenBreakdown.userPromptTokens,
      constructionSummaryTokenEstimate: contextBudget.tokenBreakdown.constructionSummaryTokens,
      assumptionRowsTokenEstimate: contextBudget.tokenBreakdown.assumptionRowsTokens,
      worksheetSnapshotTokenEstimate: contextBudget.tokenBreakdown.snapshotTokens,
      budgetTier: contextBudget.tokenBreakdown.budgetTier,
      formulaTargetRowCount: contextBudget.tokenBreakdown.formulaTargetRowCount,
      compactionLevel: contextBudget.tokenBreakdown.compactionLevel,
      blockedMessage: contextBudget.blockedMessage,
    };
    logEditAssistantDebug("formula_stage_token_budget_exceeded", diagnostics);
    throw createFormulaStageOversizeError(diagnostics);
  }

    logEditAssistantDebug("formula_stage_request_started", {
      provider: provider.name,
      model: params.model,
      worksheetState: contextBudget.snapshot.worksheetState,
      budgetTier: contextBudget.snapshot.budgetTier,
    estimatedTokenSize: contextBudget.tokenBreakdown.totalEstimatedTokens,
    snapshotSize: contextBudget.snapshot.estimatedTokenSize,
    promptPath: params.classification.recommendedPromptPath,
    maxAllowedTokens: WORKSHEET_AI_FORMULA_STAGE_MAX_INPUT_TOKENS,
    systemPromptTokenEstimate: contextBudget.tokenBreakdown.systemPromptTokens,
    userPromptTokenEstimate: contextBudget.tokenBreakdown.userPromptTokens,
    constructionSummaryTokenEstimate: contextBudget.tokenBreakdown.constructionSummaryTokens,
    assumptionRowsTokenEstimate: contextBudget.tokenBreakdown.assumptionRowsTokens,
    worksheetSnapshotTokenEstimate: contextBudget.tokenBreakdown.snapshotTokens,
    constructionSummarySize: contextBudget.tokenBreakdown.constructionSummaryTokens,
      formulaTargetRowCount: contextBudget.tokenBreakdown.formulaTargetRowCount,
      scopedFormulaRowCount: contextBudget.formulaContextSummary?.existingFormulaRows.length ?? 0,
      omittedFormulaRowRangeCount: contextBudget.formulaContextSummary?.omittedFormulaRowRanges.length ?? 0,
      assumptionRowCount: contextBudget.assumptionRows.length,
      stageAssumptionCount: contextBudget.stageAssumptions.length,
      stageWarningCount: contextBudget.stageWarnings.length,
      compactionLevel: contextBudget.compactionLevel,
    });

  const startedAt = Date.now();
  const providerResult = await provider.generateEditPlan({
    systemPrompt,
    userPrompt: contextBudget.userPrompt,
    schema: buildAnthropicFormulaStageSchema(),
    model: params.model,
    timeoutMs: WORKSHEET_AI_DEFAULT_TIMEOUT_MS,
    maxOutputTokens: WORKSHEET_AI_FORMULA_STAGE_MAX_OUTPUT_TOKENS,
    enableWebSearch: params.providerOptions?.webSearchEnabled === true,
    metadata: {
      classification: params.classification,
      recommendedPromptPath: params.classification.recommendedPromptPath,
      requiresRetrieval: false,
      workflowStage: "formula_generation",
      attemptNumber: 1,
    },
  });

  const parsed = normalizeFormulaSuggestionsPayload(providerResult.parsedJson);
  logEditAssistantDebug("formula_stage_response_received", {
    provider: providerResult.provider,
    model: providerResult.model,
    durationMs: Date.now() - startedAt,
    suggestionCount: parsed.suggestions.length,
    responseMode: parsed.mode,
  });

  return {
    suggestions: parsed.suggestions,
    assumptions: parsed.assumptions,
    warnings: Array.from(new Set([...(parsed.warnings ?? []), ...providerResult.warnings])),
    answer: parsed.answer,
    provider: providerResult.provider,
    model: providerResult.model,
    effectiveWebSearchEnabled: providerResult.effectiveWebSearchEnabled,
  };
}

async function callAnthropicFormattingStage(params: {
  prompt: string;
  worksheet: WorksheetData;
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  memoryItems: AiMemoryItem[];
  organizationConstructionContext?: string | null;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
  model: string;
}): Promise<{
  operations: PricingWorksheetAiFormattingSuggestion[];
  assumptions: string[];
  warnings: string[];
  answer: string;
  provider: "openai" | "anthropic";
  model: string;
  effectiveWebSearchEnabled: boolean;
}> {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const systemPrompt = [
    "You are TradesStack's worksheet formatting assistant.",
    "Return JSON only.",
    "Do not modify worksheet values, formulas, or structure.",
    "Suggest formatting only for real worksheet refs from the provided worksheet snapshot.",
  ].join(" ");
  const constructionSummary = buildAnthropicConstructionSummary({
    worksheetContext: params.worksheetContext,
    classification: params.classification,
    memoryItems: params.memoryItems,
    organizationConstructionContext: params.organizationConstructionContext,
    organizationGuidance: params.organizationGuidance,
    followUpContext: params.followUpContext,
  });
  const contextBudget = buildFormulaStageContextBudget({
    workflow: "formatting",
    prompt: params.prompt,
    systemPrompt,
    worksheet: params.worksheet,
    snapshot: params.snapshot,
    worksheetContext: params.worksheetContext,
    classification: params.classification,
    constructionSummary,
    assumptionRows: buildAnthropicAssumptionRowSummary(params.snapshot),
    promptBuilder: ({ snapshot, constructionSummary }) =>
      buildAnthropicFormattingStagePrompt({
        prompt: params.prompt,
        snapshot,
        constructionSummary,
        candidates: buildAnthropicFormattingCandidateSummary(snapshot),
      }),
  });
  if (contextBudget.blockedMessage) {
    logEditAssistantDebug("formatting_stage_token_budget_exceeded", {
      estimatedTokenSize: contextBudget.tokenBreakdown.totalEstimatedTokens,
      maxAllowedTokens: contextBudget.tokenBreakdown.maxAllowedTokens,
      snapshotEstimatedTokenSize: contextBudget.snapshot.estimatedTokenSize,
      systemPromptTokenEstimate: contextBudget.tokenBreakdown.systemPromptTokens,
      userPromptTokenEstimate: contextBudget.tokenBreakdown.userPromptTokens,
      constructionSummaryTokenEstimate: contextBudget.tokenBreakdown.constructionSummaryTokens,
      assumptionRowsTokenEstimate: contextBudget.tokenBreakdown.assumptionRowsTokens,
      worksheetSnapshotTokenEstimate: contextBudget.tokenBreakdown.snapshotTokens,
      budgetTier: contextBudget.tokenBreakdown.budgetTier,
      formulaTargetRowCount: contextBudget.tokenBreakdown.formulaTargetRowCount,
      compactionLevel: contextBudget.tokenBreakdown.compactionLevel,
    });
    throw new Error("Formatting-stage worksheet context exceeds the safe token budget.");
  }

  logEditAssistantDebug("formatting_stage_request_started", {
    provider: provider.name,
    model: params.model,
    worksheetState: contextBudget.snapshot.worksheetState,
    budgetTier: contextBudget.snapshot.budgetTier,
    estimatedTokenSize: contextBudget.tokenBreakdown.totalEstimatedTokens,
    snapshotSize: contextBudget.snapshot.estimatedTokenSize,
    promptPath: params.classification.recommendedPromptPath,
    maxAllowedTokens: WORKSHEET_AI_FORMULA_STAGE_MAX_INPUT_TOKENS,
    systemPromptTokenEstimate: contextBudget.tokenBreakdown.systemPromptTokens,
    userPromptTokenEstimate: contextBudget.tokenBreakdown.userPromptTokens,
    constructionSummaryTokenEstimate: contextBudget.tokenBreakdown.constructionSummaryTokens,
    assumptionRowsTokenEstimate: contextBudget.tokenBreakdown.assumptionRowsTokens,
    worksheetSnapshotTokenEstimate: contextBudget.tokenBreakdown.snapshotTokens,
    compactionLevel: contextBudget.compactionLevel,
  });

  const startedAt = Date.now();
  const providerResult = await provider.generateEditPlan({
    systemPrompt,
    userPrompt: contextBudget.userPrompt,
    schema: buildAnthropicFormattingStageSchema(),
    model: params.model,
    timeoutMs: WORKSHEET_AI_DEFAULT_TIMEOUT_MS,
    maxOutputTokens: 2200,
    enableWebSearch: false,
    metadata: {
      classification: params.classification,
      recommendedPromptPath: params.classification.recommendedPromptPath,
      requiresRetrieval: false,
      workflowStage: "formatting_generation",
      attemptNumber: 1,
    },
  });

  const parsed = normalizeFormattingSuggestionsPayload(providerResult.parsedJson);
  logEditAssistantDebug("formatting_stage_response_received", {
    provider: providerResult.provider,
    model: providerResult.model,
    durationMs: Date.now() - startedAt,
    operationCount: parsed.operations.length,
    responseMode: parsed.mode,
  });

  return {
    operations: parsed.operations,
    assumptions: parsed.assumptions,
    warnings: Array.from(new Set([...(parsed.warnings ?? []), ...providerResult.warnings])),
    answer: parsed.answer,
    provider: providerResult.provider,
    model: providerResult.model,
    effectiveWebSearchEnabled: providerResult.effectiveWebSearchEnabled,
  };
}

async function callAnthropicReviewStage(params: {
  prompt: string;
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  memoryItems: AiMemoryItem[];
  organizationConstructionContext?: string | null;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
  model: string;
}) {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const constructionSummary = buildAnthropicConstructionSummary({
    worksheetContext: params.worksheetContext,
    classification: params.classification,
    memoryItems: params.memoryItems,
    organizationConstructionContext: params.organizationConstructionContext,
    organizationGuidance: params.organizationGuidance,
    followUpContext: params.followUpContext,
  });
  const systemPrompt = "You are TradesStack's worksheet review assistant. Return JSON only. Do not create worksheet operations.";
  const userPrompt = [
    `User request: ${params.prompt}`,
    `Construction intelligence summary: ${JSON.stringify(constructionSummary)}`,
    "If the snapshot discloses omitted row ranges, do not claim those rows are visible. State the omitted ranges explicitly instead of guessing.",
    `Worksheet structure snapshot: ${JSON.stringify(params.snapshot)}`,
  ].join("\n\n");
  const providerResult = await provider.generateEditPlan({
    systemPrompt,
    userPrompt,
    schema: buildAnthropicReviewStageSchema(),
    model: params.model,
    timeoutMs: WORKSHEET_AI_DEFAULT_TIMEOUT_MS,
    maxOutputTokens: 2600,
    enableWebSearch: false,
    metadata: {
      classification: params.classification,
      recommendedPromptPath: params.classification.recommendedPromptPath,
      requiresRetrieval: false,
      workflowStage: "review_generation",
      attemptNumber: 1,
    },
  });

  return {
    parsed: normalizeAnthropicReviewPayload(providerResult.parsedJson),
    provider: providerResult.provider,
    model: providerResult.model,
    effectiveWebSearchEnabled: providerResult.effectiveWebSearchEnabled,
  };
}

async function callAnthropicCompactEditIntentStage(params: {
  prompt: string;
  snapshot: PricingWorksheetStructureSnapshot;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  memoryItems: AiMemoryItem[];
  organizationConstructionContext?: string | null;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
  model: string;
}) {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const constructionSummary = buildAnthropicConstructionSummary({
    worksheetContext: params.worksheetContext,
    classification: params.classification,
    memoryItems: params.memoryItems,
    organizationConstructionContext: params.organizationConstructionContext,
    organizationGuidance: params.organizationGuidance,
    followUpContext: params.followUpContext,
  });
  const userPrompt = [
    `User request: ${params.prompt}`,
    `Construction intelligence summary: ${JSON.stringify(constructionSummary)}`,
    "Return compact edit intents only. Use real worksheet refs or rows from the snapshot when possible.",
    "If the snapshot discloses omitted row ranges, do not claim those rows are visible. State the omitted ranges explicitly instead of guessing.",
    `Worksheet structure snapshot: ${JSON.stringify(params.snapshot)}`,
  ].join("\n\n");
  const providerResult = await provider.generateEditPlan({
    systemPrompt: "You are TradesStack's compact worksheet edit planner. Return JSON only. Do not emit low-level worksheet operations.",
    userPrompt,
    schema: buildAnthropicCompactEditIntentStageSchema(),
    model: params.model,
    timeoutMs: WORKSHEET_AI_DEFAULT_TIMEOUT_MS,
    maxOutputTokens: 2600,
    enableWebSearch: false,
    metadata: {
      classification: params.classification,
      recommendedPromptPath: params.classification.recommendedPromptPath,
      requiresRetrieval: false,
      workflowStage: "edit_intent_generation",
      attemptNumber: 1,
    },
  });

  return {
    parsed: normalizeAnthropicCompactEditIntentPayload(providerResult.parsedJson),
    provider: providerResult.provider,
    model: providerResult.model,
    effectiveWebSearchEnabled: providerResult.effectiveWebSearchEnabled,
  };
}

async function callAnthropicAnswerOnlyStage(params: {
  prompt: string;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  memoryItems: AiMemoryItem[];
  organizationConstructionContext?: string | null;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
  model: string;
}) {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const constructionSummary = buildAnthropicConstructionSummary({
    worksheetContext: params.worksheetContext,
    classification: params.classification,
    memoryItems: params.memoryItems,
    organizationConstructionContext: params.organizationConstructionContext,
    organizationGuidance: params.organizationGuidance,
    followUpContext: params.followUpContext,
  });
  const userPrompt = [
    `User request: ${params.prompt}`,
    `Construction intelligence summary: ${JSON.stringify(constructionSummary)}`,
    "Return a safe compact answer-only response if no worksheet-specific compact workflow applies.",
  ].join("\n\n");
  const providerResult = await provider.generateEditPlan({
    systemPrompt: "You are TradesStack's worksheet assistant. Return JSON only. Provide a safe answer-only response.",
    userPrompt,
    schema: buildAnthropicAnswerOnlyStageSchema(),
    model: params.model,
    timeoutMs: WORKSHEET_AI_DEFAULT_TIMEOUT_MS,
    maxOutputTokens: 1800,
    enableWebSearch: false,
    metadata: {
      classification: params.classification,
      recommendedPromptPath: params.classification.recommendedPromptPath,
      requiresRetrieval: false,
      workflowStage: "answer_only_generation",
      attemptNumber: 1,
    },
  });

  return {
    response: normalizeAnthropicAnswerOnlyPayload(providerResult.parsedJson),
    provider: providerResult.provider,
    model: providerResult.model,
    effectiveWebSearchEnabled: providerResult.effectiveWebSearchEnabled,
  };
}

export async function buildPricingWorksheetEditAssistantPreview(
  params: BuildPricingWorksheetEditAssistantParams,
): Promise<{
  preview: PricingWorksheetAiAssistantPreview;
  generationMeta: PricingWorksheetAiAssistantGenerationMeta;
  providerAudit: PricingWorksheetAiAssistantProviderAudit;
}> {
  const worksheetSummary = buildCurrentWorksheetSummary(params.worksheet);
  const matchedMemory = params.memoryItems[0]
    ? {
        id: params.memoryItems[0].id,
        title: params.memoryItems[0].title || "Worksheet example",
        summary: params.memoryItems[0].summary || "",
      }
    : null;

  const modelConfig = getPricingWorksheetEditAssistantModelConfig();
  const webSearchEnabled = params.providerOptions?.webSearchEnabled !== false;
  let generationMeta: PricingWorksheetAiAssistantGenerationMeta = {
    provider: modelConfig.provider,
    model: modelConfig.model,
    fallbackUsed: false,
    fallbackReason: null,
  };
  let providerAudit: PricingWorksheetAiAssistantProviderAudit = {
    requestedProvider: modelConfig.provider,
    requestedModel: modelConfig.model,
    actualProvider: null,
    actualModel: null,
    webSearchEnabled,
  };

  let aiResponse: PricingWorksheetAiAssistantResponse;
  let continuation: PricingWorksheetAiContinuationPlan | null = null;
  let formulaStageAttempted = false;
  let formulaStageProducedFormulas = false;
  const classification =
    params.classification ??
    classifyPricingWorksheetConstructionIntent({
      userPrompt: params.prompt,
      worksheetTradePackage: params.worksheetContext.tradePackage,
      worksheetName: params.worksheetContext.worksheetName,
      worksheetContext: params.worksheetContext,
      selection: params.worksheetContext.visibleSelection,
    });
  const worksheetState = detectPricingWorksheetState({
    worksheet: params.worksheet,
    worksheetContext: params.worksheetContext,
    currentWorksheetSummary: worksheetSummary,
  });
  const anthropicWorkflow =
    params.internalFlags?.anthropicWorkflowOverride ??
    routeAnthropicWorkflow({
      provider: modelConfig.provider,
      prompt: params.prompt,
      classification,
      worksheetState,
      selection: params.worksheetContext.visibleSelection,
    });
  const stagedAnthropicGeneration = anthropicWorkflow === "staged_generation";
  const anthropicFormattingStage = anthropicWorkflow === "formatting";
  const anthropicFormulaSuggestionStage = anthropicWorkflow === "formula_suggestions";

  try {
    logEditAssistantDebug("edit_assistant_request_received", {
      promptLength: params.prompt.length,
      worksheetName: params.worksheetContext.worksheetName,
      sectionCount: params.worksheetContext.sections.length,
      rowSummaryCount: params.worksheetContext.rows.length,
      classification,
      worksheetState,
      anthropicWorkflow,
      stagedAnthropicGeneration,
      anthropicFormattingStage,
      anthropicFormulaSuggestionStage,
    });
    if (anthropicFormattingStage) {
      const structureSnapshot = buildPricingWorksheetAiStructureSnapshot({
        worksheet: params.worksheet,
        worksheetContext: params.worksheetContext,
        classification,
        prompt: params.prompt,
      });
      logEditAssistantDebug("worksheet_snapshot_built", {
        ...summarizePricingWorksheetStructureSnapshot(structureSnapshot),
      });
      const formattingStageResult = await callAnthropicFormattingStage({
        prompt: params.prompt,
        worksheet: params.worksheet,
        snapshot: structureSnapshot,
        worksheetContext: params.worksheetContext,
        classification,
        memoryItems: params.memoryItems,
        organizationConstructionContext: params.organizationConstructionContext,
        organizationGuidance: params.organizationGuidance,
        followUpContext: params.followUpContext,
        model: modelConfig.model,
      });
      const compiledFormattingOperations = buildFormattingOperationsFromSuggestions({
        suggestions: formattingStageResult.operations,
      });

      if (
        compiledFormattingOperations.operations.length === 0 &&
        shouldPrioritizeGenerationWorkflow({
          classification,
          worksheetState,
        }) &&
        params.internalFlags?.formattingToGenerationFallbackUsed !== true
      ) {
        logEditAssistantDebug("formatting_to_generation_fallback", {
          worksheetState,
          primaryIntent: classification.primaryIntent,
          recommendedPromptPath: classification.recommendedPromptPath,
          responseMode: formattingStageResult.answer.length > 0 ? "answer_only" : "empty",
        });
        return buildPricingWorksheetEditAssistantPreview({
          ...params,
          internalFlags: {
            ...params.internalFlags,
            anthropicWorkflowOverride: null,
            formattingToGenerationFallbackUsed: true,
          },
        });
      }

      generationMeta = {
        provider: formattingStageResult.provider,
        model: formattingStageResult.model,
        fallbackUsed: false,
        fallbackReason: null,
      };
      providerAudit = {
        requestedProvider: modelConfig.provider,
        requestedModel: modelConfig.model,
        actualProvider: formattingStageResult.provider,
        actualModel: formattingStageResult.model,
        webSearchEnabled: formattingStageResult.effectiveWebSearchEnabled,
      };
      aiResponse = sanitizeDisplayedNoOperationMutationResponse(
        {
          mode: compiledFormattingOperations.operations.length > 0 ? "propose_edit" : "answer_only",
          proposalName: "Worksheet formatting suggestions",
          answer:
            compiledFormattingOperations.operations.length > 0
              ? formattingStageResult.answer || "Suggested worksheet formatting to highlight editable areas."
              : formattingStageResult.answer || "No safe worksheet formatting suggestions could be generated.",
          summary:
            compiledFormattingOperations.operations.length > 0
              ? "Prepared worksheet formatting suggestions for the current worksheet."
              : "No safe worksheet formatting changes could be prepared for the current worksheet.",
          confidence: compiledFormattingOperations.operations.length > 0 ? "medium" : "low",
          operations: compiledFormattingOperations.operations,
          assumptions: formattingStageResult.assumptions,
          warnings: Array.from(
            new Set([
              ...formattingStageResult.warnings,
              ...compiledFormattingOperations.warnings,
              ...(compiledFormattingOperations.operations.length === 0
                ? ["No safe worksheet formatting suggestions could be generated for the current worksheet state."]
                : []),
            ]),
          ),
        },
        params.prompt,
        classification,
      );
    } else if (anthropicFormulaSuggestionStage) {
      const structureSnapshot = buildPricingWorksheetAiStructureSnapshot({
        worksheet: params.worksheet,
        worksheetContext: params.worksheetContext,
        classification,
        prompt: params.prompt,
      });
      logEditAssistantDebug("worksheet_snapshot_built", {
        ...summarizePricingWorksheetStructureSnapshot(structureSnapshot),
      });
      try {
        const formulaStageResult = await callAnthropicFormulaStage({
          prompt: params.prompt,
          worksheet: params.worksheet,
          snapshot: structureSnapshot,
          worksheetContext: params.worksheetContext,
          classification,
          memoryItems: params.memoryItems,
          organizationConstructionContext: params.organizationConstructionContext,
          organizationGuidance: params.organizationGuidance,
          followUpContext: params.followUpContext,
          model: modelConfig.model,
          providerOptions: {
            webSearchEnabled: false,
          },
        });
        const compiledFormulaOperations = buildCompiledFormulaUpdateOperations({
          suggestions: formulaStageResult.suggestions,
          snapshot: structureSnapshot,
        });

        logEditAssistantDebug("formula_stage_compiled", {
          provider: formulaStageResult.provider,
          model: formulaStageResult.model,
          worksheetState,
          structureStageSuccess: null,
          formulaStageSuccess: compiledFormulaOperations.successCount > 0,
          formulaSuggestionCount: formulaStageResult.suggestions.length,
          aiFormulaCompileAttemptCount: formulaStageResult.suggestions.length,
          aiFormulaCompileSuccessCount: compiledFormulaOperations.successCount,
          aiFormulaCompileFailureCount: compiledFormulaOperations.failureCount,
          unresolvedReferenceCount: compiledFormulaOperations.unresolvedReferenceCount,
          skippedFormulaCount: compiledFormulaOperations.failureCount,
          providerCallCount: 1,
          snapshotSize: structureSnapshot.estimatedTokenSize,
        });

        generationMeta = {
          provider: formulaStageResult.provider,
          model: formulaStageResult.model,
          fallbackUsed: false,
          fallbackReason: null,
        };
        providerAudit = {
          requestedProvider: modelConfig.provider,
          requestedModel: modelConfig.model,
          actualProvider: formulaStageResult.provider,
          actualModel: formulaStageResult.model,
          webSearchEnabled: formulaStageResult.effectiveWebSearchEnabled,
        };
        aiResponse = sanitizeDisplayedNoOperationMutationResponse(
          {
            mode: compiledFormulaOperations.operations.length > 0 ? "propose_edit" : "answer_only",
            proposalName: "Worksheet formula suggestions",
            answer:
              compiledFormulaOperations.operations.length > 0
                ? formulaStageResult.answer || "Suggested worksheet-aware formulas for the existing worksheet."
                : formulaStageResult.answer ||
                  "No safe worksheet-aware formulas could be generated for the existing worksheet.",
            summary:
              compiledFormulaOperations.operations.length > 0
                ? "Compiled worksheet-aware formula suggestions for the existing worksheet."
                : "No safe worksheet-aware formulas could be compiled for the existing worksheet.",
            confidence: compiledFormulaOperations.operations.length > 0 ? "medium" : "low",
            operations: compiledFormulaOperations.operations,
            assumptions: formulaStageResult.assumptions,
            warnings: Array.from(
              new Set([
                ...formulaStageResult.warnings,
                ...compiledFormulaOperations.warnings,
                ...(compiledFormulaOperations.operations.length === 0
                  ? ["No safe worksheet-aware formulas could be generated for the current worksheet state."]
                  : []),
              ]),
            ),
          },
          params.prompt,
          classification,
        );

        if (
          shouldFallbackBlankStarterFormulaSuggestionsToGeneration({
            prompt: params.prompt,
            classification,
            worksheetState,
            response: aiResponse,
          }) &&
          params.internalFlags?.formulaToGenerationFallbackUsed !== true
        ) {
          logEditAssistantDebug("formula_to_generation_fallback", {
            worksheetState,
            primaryIntent: classification.primaryIntent,
            recommendedPromptPath: classification.recommendedPromptPath,
            responseMode: aiResponse.mode,
            operationCount: aiResponse.operations.length,
          });
          return buildPricingWorksheetEditAssistantPreview({
            ...params,
            internalFlags: {
              ...params.internalFlags,
              anthropicWorkflowOverride: "staged_generation",
              formulaToGenerationFallbackUsed: true,
            },
          });
        }
      } catch (error) {
        if (!isFormulaStageOversizeError(error)) {
          throw error;
        }

        logEditAssistantDebug("formula_stage_failed", {
          worksheetState,
          providerCallCount: 0,
          ...serializeError(error),
          diagnostics: error.diagnostics ?? null,
        });
        aiResponse = {
          mode: "answer_only",
          proposalName: "Worksheet formula suggestions",
          answer: WORKSHEET_AI_FORMULA_STAGE_OVERSIZE_WARNING,
          summary: WORKSHEET_AI_FORMULA_STAGE_OVERSIZE_WARNING,
          confidence: "low",
          operations: [],
          assumptions: [],
          warnings: [WORKSHEET_AI_FORMULA_STAGE_OVERSIZE_WARNING],
        };
      }
    } else if (anthropicWorkflow === "review") {
      const structureSnapshot = buildPricingWorksheetAiStructureSnapshot({
        worksheet: params.worksheet,
        worksheetContext: params.worksheetContext,
        classification,
        prompt: params.prompt,
      });
      const reviewResult = await callAnthropicReviewStage({
        prompt: params.prompt,
        snapshot: structureSnapshot,
        worksheetContext: params.worksheetContext,
        classification,
        memoryItems: params.memoryItems,
        organizationConstructionContext: params.organizationConstructionContext,
        organizationGuidance: params.organizationGuidance,
        followUpContext: params.followUpContext,
        model: modelConfig.model,
      });
      generationMeta = {
        provider: reviewResult.provider,
        model: reviewResult.model,
        fallbackUsed: false,
        fallbackReason: null,
      };
      providerAudit = {
        requestedProvider: modelConfig.provider,
        requestedModel: modelConfig.model,
        actualProvider: reviewResult.provider,
        actualModel: reviewResult.model,
        webSearchEnabled: reviewResult.effectiveWebSearchEnabled,
      };
      aiResponse = {
        mode: "answer_only",
        proposalName: "Worksheet review summary",
        answer: reviewResult.parsed.answer || "Reviewed the worksheet and summarized the key risks.",
        summary: "Reviewed the worksheet for risks and follow-up items.",
        confidence: reviewResult.parsed.reviewFindings.length > 0 ? "medium" : "low",
        operations: [],
        assumptions: reviewResult.parsed.assumptions,
        warnings: reviewResult.parsed.warnings,
        reviewFindings: reviewResult.parsed.reviewFindings,
        reviewSummary: reviewResult.parsed.reviewSummary,
        suggestedEditGroups: [],
        evidenceSources: [],
      };
    } else if (anthropicWorkflow === "compact_edit_intent") {
      const structureSnapshot = buildPricingWorksheetAiStructureSnapshot({
        worksheet: params.worksheet,
        worksheetContext: params.worksheetContext,
        classification,
        prompt: params.prompt,
      });
      const editIntentResult = await callAnthropicCompactEditIntentStage({
        prompt: params.prompt,
        snapshot: structureSnapshot,
        worksheetContext: params.worksheetContext,
        classification,
        memoryItems: params.memoryItems,
        organizationConstructionContext: params.organizationConstructionContext,
        organizationGuidance: params.organizationGuidance,
        followUpContext: params.followUpContext,
        model: modelConfig.model,
      });
      const compiledEditOperations = buildCompactEditOperations({
        intents: editIntentResult.parsed.editIntents,
      });
      generationMeta = {
        provider: editIntentResult.provider,
        model: editIntentResult.model,
        fallbackUsed: false,
        fallbackReason: null,
      };
      providerAudit = {
        requestedProvider: modelConfig.provider,
        requestedModel: modelConfig.model,
        actualProvider: editIntentResult.provider,
        actualModel: editIntentResult.model,
        webSearchEnabled: editIntentResult.effectiveWebSearchEnabled,
      };
      aiResponse = sanitizeDisplayedNoOperationMutationResponse(
        {
          mode: compiledEditOperations.operations.length > 0 ? "propose_edit" : "answer_only",
          proposalName: "Worksheet edit suggestions",
          answer:
            compiledEditOperations.operations.length > 0
              ? editIntentResult.parsed.answer || "Prepared compact worksheet edit suggestions."
              : editIntentResult.parsed.answer || "No safe worksheet edits could be converted from the request.",
          summary:
            compiledEditOperations.operations.length > 0
              ? "Prepared compact worksheet edit suggestions."
              : "No safe worksheet edits could be prepared.",
          confidence: compiledEditOperations.operations.length > 0 ? "medium" : "low",
          operations: compiledEditOperations.operations,
          assumptions: editIntentResult.parsed.assumptions,
          warnings: Array.from(new Set([...editIntentResult.parsed.warnings, ...compiledEditOperations.warnings])),
        },
        params.prompt,
        classification,
      );
    } else if (anthropicWorkflow === "answer_only" || anthropicWorkflow === "safe_unknown_fallback") {
      const answerOnlyResult = await callAnthropicAnswerOnlyStage({
        prompt: params.prompt,
        worksheetContext: params.worksheetContext,
        classification,
        memoryItems: params.memoryItems,
        organizationConstructionContext: params.organizationConstructionContext,
        organizationGuidance: params.organizationGuidance,
        followUpContext: params.followUpContext,
        model: modelConfig.model,
      });
      generationMeta = {
        provider: answerOnlyResult.provider,
        model: answerOnlyResult.model,
        fallbackUsed: anthropicWorkflow === "safe_unknown_fallback",
        fallbackReason: anthropicWorkflow === "safe_unknown_fallback" ? "anthropic_safe_unknown_fallback" : null,
      };
      providerAudit = {
        requestedProvider: modelConfig.provider,
        requestedModel: modelConfig.model,
        actualProvider: answerOnlyResult.provider,
        actualModel: answerOnlyResult.model,
        webSearchEnabled: answerOnlyResult.effectiveWebSearchEnabled,
      };
      aiResponse = answerOnlyResult.response;
    } else {
      const modelResult = await callWorksheetAssistantModel(
        params.prompt,
        params.worksheet,
        params.worksheetContext,
        params.memoryItems,
        classification,
        params.organizationConstructionContext,
        params.organizationGuidance,
        params.followUpContext,
        0,
        0,
        0,
        params.providerOptions,
        {
          disableGenerationRecoveryRetry: stagedAnthropicGeneration,
          disableQualityRetries: stagedAnthropicGeneration,
          workflowStage: stagedAnthropicGeneration ? "structure_generation" : "default",
        },
      );
      generationMeta = {
        provider: modelResult.provider,
        model: modelResult.model,
        fallbackUsed: false,
        fallbackReason: null,
      };
      providerAudit = {
        requestedProvider: modelConfig.provider,
        requestedModel: modelConfig.model,
        actualProvider: modelResult.provider,
        actualModel: modelResult.model,
        webSearchEnabled: modelResult.effectiveWebSearchEnabled,
      };
      aiResponse = sanitizeDisplayedNoOperationMutationResponse(
        modelResult.response,
        params.prompt,
        classification,
      );

      if (stagedAnthropicGeneration && aiResponse.mode !== "answer_only") {
        const stagedResponse = stripFormulaChangesFromResponse(aiResponse);
        const stagedPreviewCandidate = maybeBuildContinuationPlan({
          worksheet: params.worksheet,
          response: stagedResponse,
          classification,
        }).response;
        const stagedFormulaBatching = batchPricingWorksheetAiOperationsForSafePreview({
          worksheet: params.worksheet,
          response: stagedResponse,
        });
        const structurePreviewSimulation = simulatePricingWorksheetAiEditPlan(
          params.worksheet,
          stagedPreviewCandidate,
        );
        const structureSimulation = simulatePricingWorksheetAiEditPlan(params.worksheet, stagedResponse);
        const structureValidationIssues = [
          ...buildMutationIntentValidationIssues(stagedPreviewCandidate, params.prompt, classification),
          ...structurePreviewSimulation.validationIssues.filter((issue) => issue.code !== "mode_missing_operations"),
        ];
        const structureStageHasError = structureValidationIssues.some((issue) => issue.severity === "error");

        logEditAssistantDebug("structure_stage_evaluated", {
          provider: modelResult.provider,
          model: modelResult.model,
          worksheetState,
          structureStageSuccess: !structureStageHasError,
          operationCount: stagedResponse.operations.length,
          validationIssueCount: structureValidationIssues.length,
          providerCallCount: 1,
        });

        aiResponse = stagedResponse;

        if (!structureStageHasError && modelResult.provider === "anthropic") {
          const generatedWorksheet =
            stagedFormulaBatching.ok && stagedFormulaBatching.batches.length > 0
              ? (stagedFormulaBatching.batches[stagedFormulaBatching.batches.length - 1]?.worksheet ??
                structureSimulation.worksheet)
              : structureSimulation.worksheet;
          const generatedWorksheetContext = buildPricingWorksheetAiContext(generatedWorksheet, {
            worksheetId: params.worksheetContext.worksheetId,
            worksheetName: params.worksheetContext.worksheetName,
            tradePackage: params.worksheetContext.tradePackage,
            selection: params.worksheetContext.visibleSelection,
            maxRows: Math.max(params.worksheetContext.rows.length, 40),
            prompt: params.prompt,
          });
          const generatedWorksheetState = detectPricingWorksheetState({
            worksheet: generatedWorksheet,
            worksheetContext: generatedWorksheetContext,
          });
          const structureSnapshot = buildPricingWorksheetAiStructureSnapshot({
            worksheet: generatedWorksheet,
            worksheetContext: generatedWorksheetContext,
            classification,
            prompt: params.prompt,
          });
          const structureSnapshotSummary = summarizePricingWorksheetStructureSnapshot(structureSnapshot);

          logEditAssistantDebug("worksheet_snapshot_built", {
            ...structureSnapshotSummary,
          });

          try {
            formulaStageAttempted = true;
            const formulaStageResult = await callAnthropicFormulaStage({
              prompt: params.prompt,
              worksheet: generatedWorksheet,
              snapshot: structureSnapshot,
              worksheetContext: generatedWorksheetContext,
              classification,
              memoryItems: params.memoryItems,
              organizationConstructionContext: params.organizationConstructionContext,
              organizationGuidance: params.organizationGuidance,
              followUpContext: params.followUpContext,
              stageAssumptions: stagedResponse.assumptions,
              stageWarnings: stagedResponse.warnings,
              model: modelResult.model,
              providerOptions: {
                webSearchEnabled: false,
              },
            });
            const compiledPatches = buildCompiledFormulaOperations({
              suggestions: formulaStageResult.suggestions,
              snapshot: structureSnapshot,
            });
            formulaStageProducedFormulas = compiledPatches.successCount > 0;

            logEditAssistantDebug("formula_stage_compiled", {
              provider: formulaStageResult.provider,
              model: formulaStageResult.model,
              worksheetState: generatedWorksheetState,
              structureStageSuccess: true,
              formulaStageSuccess: compiledPatches.successCount > 0,
              formulaSuggestionCount: formulaStageResult.suggestions.length,
              aiFormulaCompileAttemptCount: formulaStageResult.suggestions.length,
              aiFormulaCompileSuccessCount: compiledPatches.successCount,
              aiFormulaCompileFailureCount: compiledPatches.failureCount,
              unresolvedReferenceCount: compiledPatches.unresolvedReferenceCount,
              skippedFormulaCount: compiledPatches.failureCount,
              providerCallCount: WORKSHEET_AI_STAGE_MAX_PROVIDER_CALLS,
              snapshotSize: structureSnapshot.estimatedTokenSize,
            });

            aiResponse = appendUniqueWarnings(
              mergeFormulaPatchesIntoStructureOperations({
                baseResponse: stagedResponse,
                patches: compiledPatches.patches,
              }),
              [
                ...formulaStageResult.warnings,
                ...compiledPatches.warnings,
                ...(formulaStageResult.suggestions.length === 0
                  ? [
                      formulaStageResult.answer.length > 0
                        ? "Formulas could not be generated safely, so the preview contains structure only."
                        : "No safe worksheet-aware formulas were generated, so the preview contains structure only.",
                    ]
                  : []),
                ...(compiledPatches.successCount === 0 && formulaStageResult.suggestions.length > 0
                  ? [
                      "Formula suggestions could not be compiled safely against the generated worksheet structure, so the preview contains structure only.",
                    ]
                  : []),
              ],
            );

            if (formulaStageResult.assumptions.length > 0) {
              aiResponse = {
                ...aiResponse,
                assumptions: Array.from(
                  new Set([...(aiResponse.assumptions ?? []), ...formulaStageResult.assumptions]),
                ),
              };
            }
            providerAudit = {
              ...providerAudit,
              actualProvider: formulaStageResult.provider,
              actualModel: formulaStageResult.model,
              webSearchEnabled: formulaStageResult.effectiveWebSearchEnabled,
            };
          } catch (error) {
            formulaStageAttempted = true;
            const warning = isFormulaStageOversizeError(error)
              ? WORKSHEET_AI_FORMULA_STAGE_OVERSIZE_WARNING
              : isPricingWorksheetProviderError(error)
                ? error.code === "provider_rate_limited"
                  ? "Formula generation was rate limited, so the preview contains structure only."
                  : error.code === "provider_timeout"
                    ? "Formula generation timed out, so the preview contains structure only."
                    : "Formula generation could not complete safely, so the preview contains structure only."
                : error instanceof Error
                  ? error.message
                  : "Formula generation could not complete safely, so the preview contains structure only.";
            logEditAssistantDebug("formula_stage_failed", {
              worksheetState: generatedWorksheetState,
              providerCallCount: 2,
              ...serializeError(error),
              ...(isFormulaStageOversizeError(error) ? { diagnostics: error.diagnostics ?? null } : {}),
              ...(isPricingWorksheetProviderError(error) ? buildProviderErrorLogPayload(error) : {}),
            });
            aiResponse = appendUniqueWarnings(stagedResponse, [warning]);
            if (isPricingWorksheetProviderError(error)) {
              providerAudit = {
                ...providerAudit,
                actualProvider: error.provider,
                actualModel: error.model,
                webSearchEnabled: false,
              };
            }
          }
        }
      }
    }
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : "Unknown AI assistant failure.";
    logEditAssistantDebug("fallback_reason", {
      reason: fallbackReason,
      requiresRetrieval: classification.requiresRetrieval,
      recommendedPromptPath: classification.recommendedPromptPath,
    });
    generationMeta = {
      provider: "tradesstack",
      model: "assistant-fallback",
      fallbackUsed: true,
      fallbackReason,
    };
    providerAudit = {
      requestedProvider: modelConfig.provider,
      requestedModel: modelConfig.model,
      actualProvider: isPricingWorksheetProviderError(error) ? error.provider : null,
      actualModel: isPricingWorksheetProviderError(error) ? error.model : null,
      webSearchEnabled: isPricingWorksheetProviderError(error) && error.provider === "anthropic" ? false : webSearchEnabled,
    };
    aiResponse = buildFallbackResponse(params.prompt, fallbackReason);
  }

  const continuationResult = maybeBuildContinuationPlan({
    worksheet: params.worksheet,
    response: aiResponse,
    classification,
  });
  aiResponse = continuationResult.response;
  continuation = continuationResult.continuation ?? continuation;

  const endSimulationMeasure = startPricingWorksheetPerformanceMeasure("ai-preview-local-simulation", {
    mode: aiResponse.mode,
    operationCount: aiResponse.operations.length,
    rowCount: params.worksheet.rows.length,
    columnCount: params.worksheet.columns.length,
  });
  const simulation = simulatePricingWorksheetAiEditPlan(params.worksheet, aiResponse);
  endSimulationMeasure({
    changedCellCount: simulation.diffSummary.changedCells.length,
    insertedRowCount: simulation.diffSummary.insertedRows.length,
    validationIssueCount: simulation.validationIssues.length,
  });
  const mutationIntentValidationIssues = buildMutationIntentValidationIssues(
    aiResponse,
    params.prompt,
    classification,
  );
  const stagedGenerationCompletionIssues = shouldBlockIncompleteStagedWorksheetGeneration({
    prompt: params.prompt,
    classification,
    worksheetState,
    formulaStageAttempted,
    formulaStageProducedFormulas,
  })
    ? [buildIncompleteStagedWorksheetGenerationIssue()]
    : [];
  const previewWorksheet =
    aiResponse.mode === "answer_only" ? params.worksheet : simulation.worksheet;
  const generatedPricingSheetCompletenessIssues = shouldValidateGeneratedPricingWorksheetCompleteness({
    classification,
    worksheetState,
    stagedAnthropicGeneration,
    responseMode: aiResponse.mode,
    hasContinuation: Boolean(continuation),
  })
    ? validateGeneratedPricingWorksheetCompleteness(previewWorksheet)
    : [];
  const validationIssues = [
    ...mutationIntentValidationIssues,
    ...stagedGenerationCompletionIssues,
    ...generatedPricingSheetCompletenessIssues,
    ...simulation.validationIssues.filter((issue) => issue.code !== "mode_missing_operations"),
  ];
  const hasError = validationIssues.some((issue) => issue.severity === "error");
  const diffPreview = buildDiffPreview(
    params.worksheet,
    previewWorksheet,
    params.worksheetContext,
    simulation.diffSummary,
  );
  const storageSummary = {
    responseMode: aiResponse.mode,
    sanitizedOperations: aiResponse.operations.map((operation) => sanitizeOperation(operation)).slice(0, 20),
    affectedCellRefs: simulation.diffSummary.changedCells.slice(0, 40),
    formulaChangeSummary: diffPreview.formulaChanges,
    formattingChangeSummary: diffPreview.formattingChanges.map((change) => ({
      ref: change.ref,
      beforeFormattingSummary: change.beforeFormattingSummary,
      afterFormattingSummary: change.afterFormattingSummary,
    })),
    insertedRowSummary: diffPreview.insertedRows.map((row) => ({
      row: row.row,
      sectionName: row.sectionName,
    })),
    affectedSections: diffPreview.affectedSections,
    assumptions: aiResponse.assumptions,
    warnings: aiResponse.warnings,
    organizationGuidance: params.organizationGuidance
      ? {
          itemCount: params.organizationGuidance.items.length,
          summary: params.organizationGuidance.summary,
          items: params.organizationGuidance.items.map((item) => ({
            type: item.type,
            title: item.title,
            guidance: item.guidance,
            confidence: item.confidence,
          })),
        }
      : undefined,
    evidenceSources: aiResponse.evidenceSources ?? [],
    webSearchEnabled: providerAudit.webSearchEnabled,
    requiresRetrieval: classification.requiresRetrieval,
    recommendedPromptPath: classification.recommendedPromptPath,
    retrievalReasons: classification.retrievalReasons ?? [],
    reviewFindings: aiResponse.reviewFindings ?? [],
    reviewSummary: aiResponse.reviewSummary ?? null,
    suggestedEditGroups: (aiResponse.suggestedEditGroups ?? []).map((group) => ({
      id: group.id,
      title: group.title,
      purpose: group.purpose,
      confidence: group.confidence,
      relatedFindingIds: group.relatedFindingIds,
      operationTypes: group.operations.map((operation) => operation.type),
    })),
    continuation:
      continuation
        ? {
            strategy: continuation.strategy,
            currentBatchIndex: continuation.currentBatchIndex,
            totalBatchCount: continuation.totalBatchCount,
            remainingBatchCount: continuation.remainingBatchCount,
            remainingOperationCount: continuation.remainingOperationCount,
          }
        : null,
  };

  const compactOutput = {
    worksheetName: params.worksheetContext.worksheetName,
    tradePackage: params.worksheetContext.tradePackage,
    suggestionSource: matchedMemory ? ("memory" as const) : ("default" as const),
    confidence: hasError ? ("low" as const) : aiResponse.confidence,
    rowCount: previewWorksheet.rows.length,
    columnCount: previewWorksheet.columns.length,
    formulaCount: countWorksheetFormulas(previewWorksheet),
    populatedCellCount: countWorksheetPopulatedCells(previewWorksheet),
    sectionCounts: {
      sections: params.worksheetContext.sections.length,
      rows: params.worksheetContext.rows.length,
      operations: aiResponse.operations.length,
    },
    headers: params.worksheetContext.headers,
    sections: params.worksheetContext.sections,
    assumptions: aiResponse.assumptions,
    warnings: aiResponse.warnings,
    promptHighlights: [params.prompt].filter((entry) => entry.trim().length > 0).slice(0, 3),
    sampleLineItems: aiResponse.operations.map((operation) => summarizeOperation(operation)).slice(0, 6),
  };
  if (compactOutput.sampleLineItems.length === 0 && (aiResponse.suggestedEditGroups?.length ?? 0) > 0) {
    compactOutput.sampleLineItems = (aiResponse.suggestedEditGroups ?? [])
      .map((group) => `${group.title}: ${group.purpose}`)
      .slice(0, 6);
  }

  const continuationWarnings =
    continuation && continuation.message.length > 0
      ? [
          {
            ruleKey: "ai_pricing_worksheet_generation_batched",
            severity: "info" as const,
            result: "passed" as const,
            message: continuation.message,
          },
        ]
      : [];

  return {
    generationMeta,
    providerAudit,
    preview: {
      mode: aiResponse.mode,
      proposalName: aiResponse.proposalName,
      answer: aiResponse.answer,
      summary: aiResponse.summary,
      confidence: aiResponse.confidence,
      operations: aiResponse.operations,
      assumptions: aiResponse.assumptions,
      warnings: aiResponse.warnings,
      evidenceSources: aiResponse.evidenceSources ?? [],
      reviewFindings: aiResponse.reviewFindings ?? [],
      reviewSummary: aiResponse.reviewSummary ?? null,
      suggestedEditGroups: aiResponse.suggestedEditGroups ?? [],
      worksheet: previewWorksheet,
      diffSummary: simulation.diffSummary,
      diffPreview,
      storageSummary,
      validationIssues,
      validationWarnings:
        validationIssues.length > 0
          ? [
              ...validationIssues.map((issue) => ({
                ruleKey: issue.code,
                severity: issue.severity === "error" ? "error" as const : "warning" as const,
                result: issue.severity === "error" ? "failed" as const : "warning" as const,
                message: issue.message,
              })),
              ...continuationWarnings,
            ]
          : [
              {
                ruleKey: "ai_pricing_worksheet_edit_preview_ready",
                severity: "info" as const,
                result: "passed" as const,
                message:
                  aiResponse.mode === "answer_only"
                    ? "AI answer is ready. No worksheet edits were applied."
                    : "AI worksheet changes passed the initial validation checks.",
              },
              ...continuationWarnings,
            ],
      compactOutput,
      matchedMemory,
      contextSummary: {
        matchedMemoryCount: params.memoryItems.length,
        organizationGuidanceCount: params.organizationGuidance?.items.length ?? 0,
        summary: [
          `Intent: ${classification.primaryIntent}`,
          `Headers: ${params.worksheetContext.headers.slice(0, 6).join(", ") || "None"}`,
          params.worksheetContext.sections.length > 0
            ? `Sections: ${params.worksheetContext.sections.slice(0, 5).join(", ")}`
            : "Sections: none detected",
          `Rows sent: ${params.worksheetContext.rows.length}`,
          `Nearby rows: ${params.worksheetContext.nearbyRows.length}`,
          `Current worksheet formulas: ${worksheetSummary.formulaCount}`,
          `Org guidance: ${params.organizationGuidance?.items.length ?? 0}`,
        ].join(" • "),
      },
      classification,
      continuation,
    },
  };
}

export function buildPricingWorksheetSelectedEditGroupPreview(params: {
  worksheet: WorksheetData;
  assistant: PricingWorksheetAiAssistantResponse;
  selectedEditGroupIds: string[];
}) {
  const response = buildPricingWorksheetAiSuggestedEditSelectionResponse(
    params.assistant,
    params.selectedEditGroupIds,
  );
  return simulatePricingWorksheetAiEditPlan(params.worksheet, response);
}

export function buildPricingWorksheetContinuationPreview(params: {
  preview: PricingWorksheetAiAssistantPreview;
  worksheet: WorksheetData;
}): PricingWorksheetAiAssistantPreview | null {
  const continuation = params.preview.continuation;
  const nextBatch = continuation?.remainingBatches[0] ?? null;
  if (!continuation || !nextBatch) {
    return null;
  }

  const response: PricingWorksheetAiAssistantResponse = {
    mode: "propose_edit",
    proposalName: nextBatch.title,
    answer: continuation.message,
    summary: nextBatch.purpose,
    confidence: params.preview.confidence,
    operations: nextBatch.operations,
    assumptions: params.preview.assumptions,
    warnings: params.preview.warnings,
    reviewFindings: params.preview.reviewFindings,
    reviewSummary: params.preview.reviewSummary,
    suggestedEditGroups: [],
    evidenceSources: params.preview.evidenceSources,
  };
  const simulation = simulatePricingWorksheetAiEditPlan(params.worksheet, response);
  const blockingIssue = simulation.validationIssues.find((issue) => issue.severity === "error");
  if (blockingIssue) {
    throw new Error(blockingIssue.message);
  }

  const nextWorksheetContext = buildPricingWorksheetAiContext(simulation.worksheet, {
    worksheetName: params.preview.compactOutput.worksheetName,
    tradePackage: params.preview.compactOutput.tradePackage,
  });
  const nextDiffPreview = buildDiffPreview(
    params.worksheet,
    simulation.worksheet,
    nextWorksheetContext,
    simulation.diffSummary,
  );
  const remainingBatches = continuation.remainingBatches.slice(1);
  const nextBatchIndex = continuation.currentBatchIndex + 1;
  const nextContinuationMessage =
    remainingBatches.length > 0
      ? `This is a large worksheet, so TradesStack is building it safely in stages. Review and apply batch ${nextBatchIndex} of ${continuation.totalBatchCount} to continue.`
      : `This is the final safe worksheet build batch. Apply batch ${nextBatchIndex} of ${continuation.totalBatchCount} to finish building the worksheet.`;
  const completenessIssues =
    remainingBatches.length === 0 ? validateGeneratedPricingWorksheetCompleteness(simulation.worksheet) : [];
  const validationWarnings =
    completenessIssues.length > 0
      ? [
          ...completenessIssues.map((issue) => ({
            ruleKey: issue.code,
            severity: issue.severity === "error" ? ("error" as const) : ("warning" as const),
            result: issue.severity === "error" ? ("failed" as const) : ("warning" as const),
            message: issue.message,
          })),
          ...(remainingBatches.length > 0
            ? [
                {
                  ruleKey: "ai_pricing_worksheet_generation_batched",
                  severity: "info" as const,
                  result: "passed" as const,
                  message: nextContinuationMessage,
                },
              ]
            : []),
        ]
      : [
          {
            ruleKey: "ai_pricing_worksheet_edit_preview_ready",
            severity: "info" as const,
            result: "passed" as const,
            message: "AI worksheet changes passed the initial validation checks.",
          },
          {
            ruleKey: "ai_pricing_worksheet_generation_batched",
            severity: "info" as const,
            result: "passed" as const,
            message: nextContinuationMessage,
          },
        ];

  return {
    ...params.preview,
    mode: "propose_edit",
    proposalName: nextBatch.title,
    answer: nextContinuationMessage,
    summary: nextBatch.purpose,
    operations: nextBatch.operations,
    warnings: Array.from(new Set([...(params.preview.warnings ?? []), nextContinuationMessage])),
    suggestedEditGroups: [],
    worksheet: simulation.worksheet,
    diffSummary: simulation.diffSummary,
    diffPreview: nextDiffPreview,
    storageSummary: {
      ...params.preview.storageSummary,
      responseMode: "propose_edit",
      sanitizedOperations: nextBatch.operations.map((operation) => sanitizeOperation(operation)).slice(0, 20),
      affectedCellRefs: simulation.diffSummary.changedCells.slice(0, 40),
      formulaChangeSummary: nextDiffPreview.formulaChanges,
      formattingChangeSummary: nextDiffPreview.formattingChanges.map((change) => ({
        ref: change.ref,
        beforeFormattingSummary: change.beforeFormattingSummary,
        afterFormattingSummary: change.afterFormattingSummary,
      })),
      insertedRowSummary: nextDiffPreview.insertedRows.map((row) => ({
        row: row.row,
        sectionName: row.sectionName,
      })),
      affectedSections: nextDiffPreview.affectedSections,
      assumptions: params.preview.assumptions,
      warnings: Array.from(new Set([...(params.preview.warnings ?? []), nextContinuationMessage])),
      continuation: {
        strategy: continuation.strategy,
        currentBatchIndex: nextBatchIndex,
        totalBatchCount: continuation.totalBatchCount,
        remainingBatchCount: remainingBatches.length,
        remainingOperationCount: remainingBatches.reduce((sum, batch) => sum + batch.operations.length, 0),
      },
    },
    validationIssues: completenessIssues,
    validationWarnings,
    compactOutput: {
      ...params.preview.compactOutput,
      rowCount: simulation.worksheet.rows.length,
      columnCount: simulation.worksheet.columns.length,
      formulaCount: countWorksheetFormulas(simulation.worksheet),
      populatedCellCount: countWorksheetPopulatedCells(simulation.worksheet),
      assumptions: params.preview.assumptions,
      warnings: Array.from(new Set([...(params.preview.warnings ?? []), nextContinuationMessage])),
      sampleLineItems: nextBatch.operations.map((operation) => summarizeOperation(operation)).slice(0, 6),
      sectionCounts: {
        ...params.preview.compactOutput.sectionCounts,
        operations: nextBatch.operations.length,
      },
    },
    continuation: {
      strategy: continuation.strategy,
      currentBatchIndex: nextBatchIndex,
      totalBatchCount: continuation.totalBatchCount,
      remainingBatchCount: remainingBatches.length,
      remainingOperationCount: remainingBatches.reduce((sum, batch) => sum + batch.operations.length, 0),
      message: nextContinuationMessage,
      remainingBatches,
    },
  };
}
