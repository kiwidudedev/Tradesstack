import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
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
  buildPricingWorksheetAiAssistantSchema,
  buildPricingWorksheetAiSuggestedEditSelectionResponse,
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
import { startPricingWorksheetPerformanceMeasure } from "@/lib/pricing-worksheet-performance";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_ASSISTANT_MODEL = "gpt-5.5";
const WORKSHEET_AI_TIMEOUT_MS = 75_000;
const WORKSHEET_AI_DEFAULT_TIMEOUT_MS = 45_000;
const WORKSHEET_AI_GENERATION_TIMEOUT_MS = 35_000;
const WORKSHEET_AI_MAX_OUTPUT_TOKENS = 5000;
const WORKSHEET_AI_GENERATION_MAX_OUTPUT_TOKENS = 6500;
const WORKSHEET_AI_GENERATION_COMPACT_RETRY_MAX_OUTPUT_TOKENS = 4500;
const WORKSHEET_AI_TRUNCATION_RETRY_MAX_OUTPUT_TOKENS = 10000;
const WORKSHEET_AI_MAX_PROVIDER_ATTEMPTS = 3;
const WORKSHEET_AI_MAX_GENERATION_PROVIDER_ATTEMPTS = 1;
const RETRYABLE_PROVIDER_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504, 520, 522, 524]);
const WORKSHEET_AI_WEB_SEARCH_TOOL = {
  type: "web_search",
} as const;

type PricingWorksheetProviderResponseFailureReason =
  | "missing_structured_output"
  | "malformed_json"
  | "truncated_json"
  | "schema_normalization_failed"
  | "no_assistant_message"
  | "unsupported_provider_shape"
  | "provider_tool_only_response"
  | "provider_returned_empty_response";

export type PricingWorksheetAssistantPayloadDiagnostics = {
  sourcePath: string;
  outputItemTypes: string[];
  contentItemTypes: string[];
  rawTextLength: number;
  structuredObjectFound: boolean;
  parseError?: string;
  possibleTruncatedJson?: boolean;
};

export type PricingWorksheetAssistantPayloadExtraction = {
  structuredObject: Record<string, unknown> | null;
  rawText: string;
  providerSources: PricingWorksheetAiEvidenceSource[];
  diagnostics: PricingWorksheetAssistantPayloadDiagnostics;
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

function isRetryableProviderStatus(status: number) {
  return RETRYABLE_PROVIDER_STATUS_CODES.has(status);
}

type BuildPricingWorksheetEditAssistantParams = {
  prompt: string;
  worksheet: WorksheetData;
  worksheetContext: PricingWorksheetAiCompactContext;
  memoryItems: AiMemoryItem[];
  classification?: PricingWorksheetConstructionIntent;
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
};

export type PricingWorksheetAiFollowUpContext = {
  previousReviewFindings?: PricingWorksheetAiReviewFinding[];
  previousReviewSummary?: PricingWorksheetAiReviewSummary | null;
  previousSuggestedEditGroups?: PricingWorksheetAiSuggestedEditGroup[];
  acceptedFindingIds?: string[];
  rejectedFindingIds?: string[];
  appliedEditGroupIds?: string[];
  userCorrection?: string | null;
};

export type PricingWorksheetAiAssistantGenerationMeta = {
  provider: "openai" | "tradesstack";
  model: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
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
  };
  storageSummary: {
    responseMode: PricingWorksheetAiAssistantMode;
    sanitizedOperations: Array<{
      type: string;
      target: Record<string, string | number | null>;
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

  return {
    changedCells,
    insertedRows,
    affectedSections,
    formulaChanges,
  };
}

export function getPricingWorksheetEditAssistantModelConfig() {
  return {
    provider: "openai" as const,
    model: process.env.OPENAI_PRICING_WORKSHEET_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectOpenAiOutputItemTypes(responseJson: unknown): string[] {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.output)) {
    return [];
  }

  return responseJson.output
    .map((outputItem) => (isRecord(outputItem) && typeof outputItem.type === "string" ? outputItem.type : null))
    .filter((value): value is string => Boolean(value));
}

function collectOpenAiContentItemTypes(responseJson: unknown): string[] {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.output)) {
    return [];
  }

  const contentTypes: string[] = [];
  for (const outputItem of responseJson.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && typeof contentItem.type === "string") {
        contentTypes.push(contentItem.type);
      }
    }
  }

  return contentTypes;
}

function extractOpenAiResponseTextChunks(responseJson: unknown): string[] {
  if (!isRecord(responseJson)) {
    return [];
  }

  const chunks: string[] = [];
  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim().length > 0) {
    chunks.push(responseJson.output_text.trim());
  }

  const output = responseJson.output;
  if (!Array.isArray(output)) {
    return chunks;
  }

  for (const outputItem of output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (
        isRecord(contentItem) &&
        (contentItem.type === "output_text" || contentItem.type === "text") &&
        typeof contentItem.text === "string" &&
        contentItem.text.trim().length > 0
      ) {
        chunks.push(contentItem.text);
      }
    }
  }

  return chunks;
}

function extractOpenAiResponseText(responseJson: unknown): string {
  return extractOpenAiResponseTextChunks(responseJson).join("\n").trim();
}

function extractOpenAiStructuredObject(responseJson: unknown): Record<string, unknown> | null {
  if (!isRecord(responseJson)) {
    return null;
  }

  if (isRecord(responseJson.output_parsed)) {
    return responseJson.output_parsed;
  }

  const output = responseJson.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const outputItem of output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (isRecord(contentItem.json)) {
        return contentItem.json;
      }

      if (isRecord(contentItem.parsed)) {
        return contentItem.parsed;
      }
    }
  }

  return null;
}

function buildProviderResponseDiagnostics(
  responseJson: unknown,
  overrides?: Partial<PricingWorksheetAssistantPayloadDiagnostics>,
): PricingWorksheetAssistantPayloadDiagnostics {
  return {
    sourcePath: overrides?.sourcePath ?? "none",
    outputItemTypes: overrides?.outputItemTypes ?? collectOpenAiOutputItemTypes(responseJson),
    contentItemTypes: overrides?.contentItemTypes ?? collectOpenAiContentItemTypes(responseJson),
    rawTextLength: overrides?.rawTextLength ?? 0,
    structuredObjectFound: overrides?.structuredObjectFound ?? false,
    parseError: overrides?.parseError,
    possibleTruncatedJson: overrides?.possibleTruncatedJson ?? false,
  };
}

export function extractBalancedJsonObject(text: string): {
  jsonText: string | null;
  possibleTruncatedJson: boolean;
} {
  const source = text.trim();
  if (!source) {
    return { jsonText: null, possibleTruncatedJson: false };
  }

  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        return {
          jsonText: source.slice(startIndex, index + 1),
          possibleTruncatedJson: false,
        };
      }
    }
  }

  return {
    jsonText: null,
    possibleTruncatedJson: startIndex >= 0 && depth > 0,
  };
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function parseJsonObjectCandidate(payload: string): {
  structuredObject: Record<string, unknown> | null;
  parseError?: string;
  possibleTruncatedJson?: boolean;
} {
  const trimmed = stripMarkdownCodeFence(payload);
  if (!trimmed) {
    return { structuredObject: null };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      structuredObject: isRecord(parsed) ? parsed : null,
      parseError: isRecord(parsed) ? undefined : "parsed_value_was_not_an_object",
    };
  } catch (error) {
    const balanced = extractBalancedJsonObject(trimmed);
    if (!balanced.jsonText) {
      return {
        structuredObject: null,
        parseError: error instanceof Error ? error.message : "json_parse_failed",
        possibleTruncatedJson: balanced.possibleTruncatedJson,
      };
    }

    try {
      const parsed = JSON.parse(balanced.jsonText);
      return {
        structuredObject: isRecord(parsed) ? parsed : null,
        parseError: isRecord(parsed) ? undefined : "parsed_balanced_json_was_not_an_object",
        possibleTruncatedJson: false,
      };
    } catch (balancedError) {
      return {
        structuredObject: null,
        parseError: balancedError instanceof Error ? balancedError.message : "balanced_json_parse_failed",
        possibleTruncatedJson: balanced.possibleTruncatedJson,
      };
    }
  }
}

function inferEvidenceSourceType(params: { title?: string; url?: string }): PricingWorksheetAiEvidenceSource["sourceType"] {
  const haystack = `${params.title ?? ""} ${params.url ?? ""}`.toLowerCase();
  if (
    haystack.includes("ncc") ||
    haystack.includes("nzbc") ||
    haystack.includes("as/nzs") ||
    haystack.includes("building code") ||
    haystack.includes("standards")
  ) {
    return "standard_or_code";
  }

  if (
    haystack.includes("rondo") ||
    haystack.includes("gib") ||
    haystack.includes("knauf") ||
    haystack.includes("sika") ||
    haystack.includes("csr") ||
    haystack.includes("bostik")
  ) {
    return "manufacturer";
  }

  if (haystack.includes("supplier") || haystack.includes("mitre10") || haystack.includes("bunnings") || haystack.includes("placemakers")) {
    return "supplier";
  }

  if (haystack.includes("guide") || haystack.includes("manual") || haystack.includes("technical") || haystack.includes("guidance")) {
    return "industry_guidance";
  }

  return params.url ? "web" : "unknown";
}

function inferEvidenceJurisdiction(params: { title?: string; url?: string }): PricingWorksheetAiEvidenceSource["jurisdiction"] {
  const haystack = `${params.title ?? ""} ${params.url ?? ""}`.toLowerCase();
  if (
    haystack.includes(".au") ||
    haystack.includes("australia") ||
    haystack.includes("ncc") ||
    haystack.includes("au/")
  ) {
    return "AU";
  }

  if (
    haystack.includes(".nz") ||
    haystack.includes("new zealand") ||
    haystack.includes("nzbc") ||
    haystack.includes("nz/")
  ) {
    return "NZ";
  }

  if (haystack.includes("as/nzs") || (haystack.includes(".au") && haystack.includes(".nz"))) {
    return "AUS_NZ";
  }

  return "unknown";
}

function inferEvidenceConfidence(sourceType: PricingWorksheetAiEvidenceSource["sourceType"]): PricingWorksheetAiConfidence {
  if (sourceType === "standard_or_code") {
    return "high";
  }

  if (sourceType === "manufacturer" || sourceType === "industry_guidance" || sourceType === "project_document") {
    return "medium";
  }

  if (sourceType === "supplier" || sourceType === "unknown") {
    return "low";
  }

  return "medium";
}

function sanitizeEvidenceSourceText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function sanitizeEvidenceSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().slice(0, 280);
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

function buildEvidenceSourceId(index: number, title?: string, url?: string): string {
  const seed = (url || title || `source-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return seed.length > 0 ? seed : `source-${index + 1}`;
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

function extractOpenAiEvidenceSources(responseJson: unknown): PricingWorksheetAiEvidenceSource[] {
  if (!isRecord(responseJson)) {
    return [];
  }

  const collected: PricingWorksheetAiEvidenceSource[] = [];
  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const retrievedAt = new Date().toISOString();

  for (const outputItem of output) {
    if (!isRecord(outputItem)) {
      continue;
    }

    if (
      outputItem.type === "web_search_call" &&
      isRecord(outputItem.action) &&
      Array.isArray(outputItem.action.sources)
    ) {
      for (const [index, sourceEntry] of outputItem.action.sources.entries()) {
        if (!isRecord(sourceEntry)) {
          continue;
        }

        const title = sanitizeEvidenceSourceText(sourceEntry.title, 120);
        const url = sanitizeEvidenceSourceUrl(sourceEntry.url);
        if (!title && !url) {
          continue;
        }
        const sourceType = inferEvidenceSourceType({ title, url });
        collected.push({
          id: buildEvidenceSourceId(index, title, url),
          title: title || (url ?? `Source ${index + 1}`),
          url,
          sourceType,
          jurisdiction: inferEvidenceJurisdiction({ title, url }),
          confidence: inferEvidenceConfidence(sourceType),
          retrievedAt,
          supportedClaims: [],
        });
      }
    }

    if (!Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem) || !Array.isArray(contentItem.annotations)) {
        continue;
      }

      for (const [index, annotation] of contentItem.annotations.entries()) {
        if (!isRecord(annotation) || annotation.type !== "url_citation") {
          continue;
        }

        const title = sanitizeEvidenceSourceText(annotation.title, 120);
        const url = sanitizeEvidenceSourceUrl(annotation.url);
        if (!title && !url) {
          continue;
        }

        const sourceType = inferEvidenceSourceType({ title, url });
        collected.push({
          id: buildEvidenceSourceId(index, title, url),
          title: title || (url ?? `Citation ${index + 1}`),
          url,
          sourceType,
          jurisdiction: inferEvidenceJurisdiction({ title, url }),
          confidence: inferEvidenceConfidence(sourceType),
          retrievedAt,
          supportedClaims: [],
        });
      }
    }
  }

  return mergeEvidenceSources([], collected);
}

function hasIncompleteProviderSignal(responseJson: unknown): boolean {
  if (!isRecord(responseJson)) {
    return false;
  }

  if (responseJson.status === "incomplete") {
    return true;
  }

  if (isRecord(responseJson.incomplete_details)) {
    return true;
  }

  if (!Array.isArray(responseJson.output)) {
    return false;
  }

  return responseJson.output.some((outputItem) => isRecord(outputItem) && outputItem.status === "incomplete");
}

function classifyProviderResponseFailureReason(
  responseJson: unknown,
  extraction: PricingWorksheetAssistantPayloadExtraction,
): PricingWorksheetProviderResponseFailureReason {
  const { diagnostics, rawText } = extraction;
  const hasOutputItems = diagnostics.outputItemTypes.length > 0;
  const hasMessageOutput = diagnostics.outputItemTypes.includes("message");
  const hasToolOnlyOutput =
    hasOutputItems &&
    diagnostics.outputItemTypes.every((type) => type !== "message") &&
    diagnostics.outputItemTypes.some((type) => type.includes("tool") || type.includes("search"));

  if (!hasOutputItems && !rawText.trim()) {
    return "provider_returned_empty_response";
  }

  if (hasToolOnlyOutput && !rawText.trim()) {
    return "provider_tool_only_response";
  }

  if (!hasMessageOutput && !rawText.trim()) {
    return "no_assistant_message";
  }

  if (diagnostics.possibleTruncatedJson || hasIncompleteProviderSignal(responseJson)) {
    return "truncated_json";
  }

  if (diagnostics.parseError) {
    return rawText.trim() ? "malformed_json" : "missing_structured_output";
  }

  if (rawText.trim()) {
    return "missing_structured_output";
  }

  return "unsupported_provider_shape";
}

function buildTruncationRetryPrompt(prompt: string): string {
  return `${prompt}\n\nIf returning a larger worksheet-generation or calculator scaffold, keep the response compact: include only essential rows, concise assumptions, and bounded operations so the JSON response fits fully in one reply.`;
}

function buildCompactGenerationRetryPrompt(prompt: string): string {
  return `${prompt}\n\nRetry instruction: return only the smallest useful starter worksheet for this request. Keep it compact and previewable. Use essential input rows, key formula rows, and a simple subtotal only. Avoid long explanations, extra review findings, and non-essential rows.`;
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
    return providerRecoveryRetryCount > 0
      ? Math.min(WORKSHEET_AI_GENERATION_TIMEOUT_MS, WORKSHEET_AI_DEFAULT_TIMEOUT_MS)
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

export function extractPricingWorksheetAssistantPayload(
  responseJson: unknown,
): PricingWorksheetAssistantPayloadExtraction {
  const providerSources = extractOpenAiEvidenceSources(responseJson);
  const outputItemTypes = collectOpenAiOutputItemTypes(responseJson);
  const contentItemTypes = collectOpenAiContentItemTypes(responseJson);

  if (!isRecord(responseJson)) {
    return {
      structuredObject: null,
      rawText: "",
      providerSources,
      diagnostics: buildProviderResponseDiagnostics(responseJson, {
        outputItemTypes,
        contentItemTypes,
      }),
    };
  }

  if (isRecord(responseJson.output_parsed)) {
    return {
      structuredObject: responseJson.output_parsed,
      rawText: extractOpenAiResponseText(responseJson),
      providerSources,
      diagnostics: buildProviderResponseDiagnostics(responseJson, {
        sourcePath: "output_parsed",
        outputItemTypes,
        contentItemTypes,
        rawTextLength: extractOpenAiResponseText(responseJson).length,
        structuredObjectFound: true,
      }),
    };
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const [outputIndex, outputItem] of output.entries()) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const [contentIndex, contentItem] of outputItem.content.entries()) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (isRecord(contentItem.parsed)) {
        return {
          structuredObject: contentItem.parsed,
          rawText: extractOpenAiResponseText(responseJson),
          providerSources,
          diagnostics: buildProviderResponseDiagnostics(responseJson, {
            sourcePath: `output[${outputIndex}].content[${contentIndex}].parsed`,
            outputItemTypes,
            contentItemTypes,
            rawTextLength: extractOpenAiResponseText(responseJson).length,
            structuredObjectFound: true,
          }),
        };
      }

      if (isRecord(contentItem.json)) {
        return {
          structuredObject: contentItem.json,
          rawText: extractOpenAiResponseText(responseJson),
          providerSources,
          diagnostics: buildProviderResponseDiagnostics(responseJson, {
            sourcePath: `output[${outputIndex}].content[${contentIndex}].json`,
            outputItemTypes,
            contentItemTypes,
            rawTextLength: extractOpenAiResponseText(responseJson).length,
            structuredObjectFound: true,
          }),
        };
      }
    }
  }

  const rawChunks = extractOpenAiResponseTextChunks(responseJson);
  const rawText = rawChunks.join("\n").trim();
  const topLevelOutputText = typeof responseJson.output_text === "string" ? responseJson.output_text.trim() : "";
  const candidates = [
    { label: "output_text", value: topLevelOutputText },
    ...rawChunks.map((chunk, index) => ({ label: `output_text_chunk_${index + 1}`, value: chunk })),
    { label: "joined_output_text", value: rawText },
  ].filter((candidate, index, array) => {
    if (!candidate.value) {
      return false;
    }
    return array.findIndex((entry) => entry.value === candidate.value) === index;
  });

  for (const candidate of candidates) {
    const parsedCandidate = parseJsonObjectCandidate(candidate.value);
    if (parsedCandidate.structuredObject) {
      return {
        structuredObject: parsedCandidate.structuredObject,
        rawText,
        providerSources,
        diagnostics: buildProviderResponseDiagnostics(responseJson, {
          sourcePath: candidate.label,
          outputItemTypes,
          contentItemTypes,
          rawTextLength: rawText.length,
          structuredObjectFound: true,
        }),
      };
    }
  }

  const finalCandidate = candidates[0]?.value ?? rawText;
  const parseAttempt = parseJsonObjectCandidate(finalCandidate);
  return {
    structuredObject: null,
    rawText,
    providerSources,
    diagnostics: buildProviderResponseDiagnostics(responseJson, {
      sourcePath: candidates[0]?.label ?? "none",
      outputItemTypes,
      contentItemTypes,
      rawTextLength: rawText.length,
      structuredObjectFound: false,
      parseError: parseAttempt.parseError,
      possibleTruncatedJson: parseAttempt.possibleTruncatedJson || hasIncompleteProviderSignal(responseJson),
    }),
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
    "Only propose the supported operations: update_cell, update_cells, insert_row, copy_row_variant, fix_formula, explain_formula, insert_subtotal.",
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
        "Generate practical rows, formulas, and worksheet structure in a bounded way.",
        "Group rows logically and keep the output auditable.",
        "Where appropriate, include input rows, formula rows, subtotal rows, and assumption rows.",
        "Keep formulas simple and auditable.",
        "Explain assumptions and do not pretend construction requirements are verified.",
        "If trade, system, scope, or required inputs are unclear, ask follow-up questions instead of overcommitting.",
        "Do not invent spec-driven, rating-driven, or manufacturer-driven requirements.",
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
  ].join("\n");

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

function buildFallbackResponse(prompt: string): PricingWorksheetAiAssistantResponse {
  const advicePrompt = isAdvicePrompt(prompt);
  return {
    mode: "answer_only",
    proposalName: "Worksheet assistant response",
    answer: advicePrompt
      ? "AI provider connection failed, so I couldn't answer that request. Please check the AI configuration or try again."
      : "AI provider connection failed, so no worksheet changes were proposed.",
    summary: advicePrompt
      ? "AI provider connection failed before an answer could be generated."
      : "AI provider connection failed before worksheet changes could be proposed.",
    confidence: "low",
    operations: [],
    assumptions: [],
    warnings: [
      advicePrompt
        ? "AI provider connection failed while trying to answer this request."
        : "AI provider connection failed, so no worksheet changes were generated.",
    ],
  };
}

async function callWorksheetAssistantModel(
  prompt: string,
  worksheetContext: PricingWorksheetAiCompactContext,
  memoryItems: AiMemoryItem[],
  classification: PricingWorksheetConstructionIntent,
  organizationGuidance?: PricingWorksheetOrganizationGuidance | null,
  followUpContext?: PricingWorksheetAiFollowUpContext | null,
  qualityRetryCount = 0,
  truncationRetryCount = 0,
  providerRecoveryRetryCount = 0,
): Promise<{ response: PricingWorksheetAiAssistantResponse; rawText: string }> {
  logEditAssistantDebug("provider_request_started", {
    promptLength: prompt.length,
    memoryCount: memoryItems.length,
    worksheetName: worksheetContext.worksheetName,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    classification,
    webSearchEnabled: true,
  });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    logEditAssistantDebug("provider_error", {
      reason: "missing_api_key",
    });
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const modelConfig = getPricingWorksheetEditAssistantModelConfig();
  const requestTimeoutMs = getWorksheetAiTimeoutMs(classification, providerRecoveryRetryCount);
  const maxProviderAttempts = getWorksheetAiMaxProviderAttempts(classification, providerRecoveryRetryCount);
  const maxOutputTokens = getWorksheetAiMaxOutputTokens(
    classification,
    truncationRetryCount,
    providerRecoveryRetryCount,
  );
  logEditAssistantDebug("provider_model", {
    provider: "openai",
    model: modelConfig.model,
    requestTimeoutMs,
    maxProviderAttempts,
    maxOutputTokens,
    providerRecoveryRetryCount,
  });
  const { systemPrompt, userPrompt } = buildWorksheetAssistantPrompts({
    prompt,
    worksheetContext,
    memoryItems,
    classification,
    organizationGuidance,
    followUpContext,
  });

  const requestBody = JSON.stringify({
    model: modelConfig.model,
    max_output_tokens: maxOutputTokens,
    tools: [WORKSHEET_AI_WEB_SEARCH_TOOL],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "pricing_worksheet_edit_assistant",
        schema: buildPricingWorksheetAiAssistantSchema(),
        strict: true,
      },
    },
  });

  let response: Response | null = null;
  let lastError: Error | null = null;

  for (let attemptNumber = 1; attemptNumber <= maxProviderAttempts; attemptNumber += 1) {
    try {
      response = await fetchWithTimeout(
        OPENAI_API_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
        },
        requestTimeoutMs,
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logEditAssistantDebug("provider_error", {
        reason: "provider_request_failed",
        attemptNumber,
        maxAttempts: maxProviderAttempts,
        ...serializeError(error),
        baseUrl: OPENAI_API_URL,
        model: modelConfig.model,
      });
      if (attemptNumber < maxProviderAttempts) {
        logEditAssistantDebug("provider_retry_scheduled", {
          attemptNumber,
          nextAttemptNumber: attemptNumber + 1,
          retryReason: "request_failure",
        });
        await waitForRetry(350 * attemptNumber);
        continue;
      }

      if (
        classification.primaryIntent === "worksheet_generation" &&
        providerRecoveryRetryCount < 1
      ) {
        logEditAssistantDebug("provider_retry_scheduled", {
          retryReason: "compact_generation_recovery",
          providerRecoveryRetryCount,
        });
        return callWorksheetAssistantModel(
          buildCompactGenerationRetryPrompt(prompt),
          worksheetContext,
          memoryItems,
          classification,
          organizationGuidance,
          followUpContext,
          qualityRetryCount,
          truncationRetryCount,
          providerRecoveryRetryCount + 1,
        );
      }
      throw lastError;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const retryable = isRetryableProviderStatus(response.status);
      logEditAssistantDebug("provider_error", {
        reason: "provider_http_error",
        attemptNumber,
        maxAttempts: maxProviderAttempts,
        status: response.status,
        statusText: response.statusText,
        retryable,
        responseBodySnippet: errorBody.slice(0, 1200),
      });

      if (retryable && attemptNumber < maxProviderAttempts) {
        logEditAssistantDebug("provider_retry_scheduled", {
          attemptNumber,
          nextAttemptNumber: attemptNumber + 1,
          retryReason: `http_${response.status}`,
        });
        await waitForRetry(350 * attemptNumber);
        continue;
      }

      if (
        retryable &&
        classification.primaryIntent === "worksheet_generation" &&
        providerRecoveryRetryCount < 1
      ) {
        logEditAssistantDebug("provider_retry_scheduled", {
          retryReason: `compact_generation_recovery_http_${response.status}`,
          providerRecoveryRetryCount,
        });
        return callWorksheetAssistantModel(
          buildCompactGenerationRetryPrompt(prompt),
          worksheetContext,
          memoryItems,
          classification,
          organizationGuidance,
          followUpContext,
          qualityRetryCount,
          truncationRetryCount,
          providerRecoveryRetryCount + 1,
        );
      }

      throw new Error(`OpenAI request failed with status ${response.status}.`);
    }

    break;
  }

  if (!response) {
    throw lastError ?? new Error("OpenAI request failed before a response was received.");
  }

  const responseJson = (await response.json()) as unknown;
  const extraction = extractPricingWorksheetAssistantPayload(responseJson);
  logEditAssistantDebug("provider_response_received", {
    hasOutputText: extraction.rawText.length > 0,
    hasStructuredObject: extraction.diagnostics.structuredObjectFound,
    webSearchEnabled: true,
    extractionDiagnostics: extraction.diagnostics,
  });
  logEditAssistantDebug("provider_response_snippet", {
    snippet: extraction.rawText.slice(0, 400),
  });
  if (!extraction.structuredObject) {
    const failureReason = classifyProviderResponseFailureReason(responseJson, extraction);
    logEditAssistantDebug("schema_validation_error", {
      reason: failureReason,
      diagnostics: extraction.diagnostics,
    });

    if (failureReason === "truncated_json" && truncationRetryCount < 1) {
      logEditAssistantDebug("provider_retry_scheduled", {
        retryReason: failureReason,
        retryStrategy: "compact_retry",
        truncationRetryCount,
      });
      return callWorksheetAssistantModel(
        buildTruncationRetryPrompt(prompt),
        worksheetContext,
        memoryItems,
        classification,
        organizationGuidance,
        followUpContext,
        qualityRetryCount,
        truncationRetryCount + 1,
        providerRecoveryRetryCount,
      );
    }

    throw new Error(`AI assistant returned an unreadable response (${failureReason}).`);
  }

  let normalized: PricingWorksheetAiAssistantResponse;
  try {
    normalized = coerceExplicitFormulaWriteResponse(
      normalizePricingWorksheetAiAssistantResponse(extraction.structuredObject),
      prompt,
      worksheetContext,
    );
  } catch (error) {
    logEditAssistantDebug("schema_validation_error", {
      reason: "schema_normalization_failed",
      diagnostics: extraction.diagnostics,
      ...serializeError(error),
    });
    throw new Error("AI assistant returned an invalid structured response (schema_normalization_failed).");
  }
  const withEvidenceSources = {
    ...normalized,
    evidenceSources: mergeEvidenceSources(
      normalized.evidenceSources ?? [],
      extraction.providerSources,
    ),
  };
  const disciplined = applyEvidenceDiscipline(applyReviewRevisionDiscipline({
    response: withEvidenceSources,
    followUpContext,
  }));
  logEditAssistantDebug("parsed_response_mode", {
    mode: disciplined.mode,
    operationCount: disciplined.operations.length,
  });

  if (qualityRetryCount < 1 && shouldRetryForLowQualityProposal(prompt, worksheetContext, disciplined)) {
    logEditAssistantDebug("quality_retry_scheduled", {
      reason: "low_quality_formula_proposal",
      worksheetPopulatedCellCount: worksheetContext.populatedCellCount,
      operationCount: normalized.operations.length,
      responseMode: normalized.mode,
    });

    return callWorksheetAssistantModel(
      `${prompt}\n\nCorrection: create a real worksheet formula edit. Do not use zero placeholders. If inputs are missing, leave those input cells blank and add the formula in a separate cell using IFERROR where appropriate.`,
      worksheetContext,
      memoryItems,
      classification,
      organizationGuidance,
      followUpContext,
      qualityRetryCount + 1,
      truncationRetryCount,
      providerRecoveryRetryCount,
    );
  }

  return {
    response: disciplined,
    rawText: extraction.rawText,
  };
}

export async function buildPricingWorksheetEditAssistantPreview(
  params: BuildPricingWorksheetEditAssistantParams,
): Promise<{
  preview: PricingWorksheetAiAssistantPreview;
  generationMeta: PricingWorksheetAiAssistantGenerationMeta;
}> {
  const worksheetSummary = buildCurrentWorksheetSummary(params.worksheet);
  const matchedMemory = params.memoryItems[0]
    ? {
        id: params.memoryItems[0].id,
        title: params.memoryItems[0].title || "Worksheet example",
        summary: params.memoryItems[0].summary || "",
      }
    : null;

  let generationMeta: PricingWorksheetAiAssistantGenerationMeta = {
    provider: "openai",
    model: getPricingWorksheetEditAssistantModelConfig().model,
    fallbackUsed: false,
    fallbackReason: null,
  };

  let aiResponse: PricingWorksheetAiAssistantResponse;
  const classification =
    params.classification ??
    classifyPricingWorksheetConstructionIntent({
      userPrompt: params.prompt,
      worksheetTradePackage: params.worksheetContext.tradePackage,
      worksheetName: params.worksheetContext.worksheetName,
      worksheetContext: params.worksheetContext,
      selection: params.worksheetContext.visibleSelection,
    });

  try {
    logEditAssistantDebug("edit_assistant_request_received", {
      promptLength: params.prompt.length,
      worksheetName: params.worksheetContext.worksheetName,
      sectionCount: params.worksheetContext.sections.length,
      rowSummaryCount: params.worksheetContext.rows.length,
      classification,
    });
    const modelResult = await callWorksheetAssistantModel(
      params.prompt,
      params.worksheetContext,
      params.memoryItems,
      classification,
      params.organizationGuidance,
      params.followUpContext,
    );
    aiResponse = modelResult.response;
  } catch (error) {
    logEditAssistantDebug("fallback_reason", {
      reason: error instanceof Error ? error.message : "Unknown AI assistant failure.",
    });
    generationMeta = {
      provider: "tradesstack",
      model: "assistant-fallback",
      fallbackUsed: true,
      fallbackReason: error instanceof Error ? error.message : "Unknown AI assistant failure.",
    };
    aiResponse = buildFallbackResponse(params.prompt);
  }

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
  const validationIssues = simulation.validationIssues;
  const previewWorksheet =
    aiResponse.mode === "answer_only" ? params.worksheet : simulation.worksheet;
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
    webSearchEnabled: true,
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

  return {
    generationMeta,
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
          ? validationIssues.map((issue) => ({
              ruleKey: issue.code,
              severity: issue.severity === "error" ? "error" as const : "warning" as const,
              result: issue.severity === "error" ? "failed" as const : "warning" as const,
              message: issue.message,
            }))
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
