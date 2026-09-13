import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getPricingWorksheetAiProvider,
  getPricingWorksheetAiProviderName,
  getPricingWorksheetOpenAiModel,
} from "@/lib/ai/providers/pricing-worksheet/registry";
import { isPricingWorksheetProviderError } from "@/lib/ai/providers/pricing-worksheet/types";
import type { Json } from "@/lib/supabase/types";

export const WORKSHEET_SEMANTIC_CLASSIFIABLE_EVENT_TYPES = [
  "worksheet_cell_edited",
  "worksheet_formula_edited",
  "worksheet_rate_changed",
  "worksheet_assumption_changed",
  "worksheet_ai_rate_corrected",
  "worksheet_ai_assumption_corrected",
  "worksheet_ai_formula_corrected",
  "worksheet_ai_output_corrected",
] as const;

export type WorksheetSemanticClassifiableEventType =
  (typeof WORKSHEET_SEMANTIC_CLASSIFIABLE_EVENT_TYPES)[number];

export type WorksheetSemanticClassificationFieldName =
  | "costRole"
  | "cellRole"
  | "pageType"
  | "sectionType"
  | "itemCategory"
  | "measurementBasis"
  | "normalizedUnit"
  | "normalizedTradePackage"
  | "workCategory"
  | "systemCategory"
  | "assemblyCategory";

export type WorksheetSemanticClassificationField = {
  value: string | null;
  confidence: number | null;
};

export type WorksheetSemanticClassificationResult = Record<
  WorksheetSemanticClassificationFieldName,
  WorksheetSemanticClassificationField
> & {
  eventId: string;
  overallConfidence: number | null;
  reasoningSummary: string | null;
  interpretationSchemaVersion: number;
  interpretationPayload: Record<string, Json | null>;
  retryCount?: number;
};

export type PendingWorksheetSemanticClassificationEvent = {
  queueId: string | null;
  eventId: string;
  organizationId: string;
  projectId: string | null;
  opportunityId: string | null;
  eventType: WorksheetSemanticClassifiableEventType;
  occurredAt: string;
  classificationVersion: number;
  attemptNumber: number;
  claimToken: string | null;
  claimExpiresAt: string | null;
  metadata: Record<string, Json | undefined>;
  diffData: Record<string, Json | undefined>;
};

export type WorksheetSemanticClassificationRecordInput = {
  sourceEventId: string;
  organizationId: string;
  classificationVersion: number;
  attemptNumber: number;
  classificationStatus: "classified" | "low_confidence" | "failed";
  classificationSource: "llm";
  classificationProvider: string | null;
  classificationModel: string | null;
  classificationModelVersion: string | null;
  overallConfidence: number | null;
  reasoningSummary: string | null;
  semanticFields: Record<string, Json | null>;
  interpretationSchemaVersion: number;
  interpretationPayload: Record<string, Json | null>;
  interpretationPromptVersion: number;
  contextSources: Record<string, Json | null>;
  constructionIntelligenceInputs: Record<string, Json | null>;
  futureUseSummary: Record<string, Json | null>;
  confidenceDetail: Record<string, Json | null>;
  requestContext: Record<string, Json | null>;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryAfter?: string | null;
  batchKey?: string | null;
  classifiedAt?: string;
  claimToken?: string | null;
};

export type RunWorksheetSemanticClassificationResult = {
  selectedEventCount: number;
  processedBatchCount: number;
  persistedClassificationCount: number;
  classifiedCount: number;
  lowConfidenceCount: number;
  failedCount: number;
  skippedCount: number;
  provider: string | null;
  model: string | null;
  durationMs: number;
};

export type RunWorksheetSemanticClassificationInput = {
  limit?: number;
  groupSize?: number;
  provider?: "openai" | "anthropic";
  model?: string;
  classificationVersion?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  now?: string;
  organizationId?: string | null;
};

type WorksheetInterpretationPromptMode = "standard" | "compact_retry";

type WorksheetSemanticClassificationProviderBatchResponse = {
  classifications: Array<Record<string, unknown>>;
};

type WorksheetSemanticBatchProviderMeta = {
  provider: string | null;
  model: string | null;
};

type WorksheetSemanticAiInteractionContext = {
  aiInteractionId: string;
  organizationId: string;
  workbookId: string | null;
  sheetId: string | null;
  sheetName: string | null;
  worksheetName: string | null;
  tradePackage: string | null;
  organizationGuidanceSummary: string | null;
  constructionIntent: Record<string, Json | null>;
};

const FIELD_NAMES: WorksheetSemanticClassificationFieldName[] = [
  "costRole",
  "cellRole",
  "pageType",
  "sectionType",
  "itemCategory",
  "measurementBasis",
  "normalizedUnit",
  "normalizedTradePackage",
  "workCategory",
  "systemCategory",
  "assemblyCategory",
];

const DEFAULT_CLASSIFICATION_VERSION = 1;
const DEFAULT_INTERPRETATION_SCHEMA_VERSION = 2;
const DEFAULT_INTERPRETATION_PROMPT_VERSION = 4;
const DEFAULT_BATCH_LIMIT = 12;
const DEFAULT_GROUP_SIZE = 1;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const DEFAULT_CLAIM_LEASE_SECONDS = 10 * 60;
const DEFAULT_CLASSIFICATION_WORKER_ID = "worksheet-event-classification-runner";
const DEFAULT_WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_NEARBY_HEADERS = 6;
const MAX_NEARBY_ROWS = 5;
const MAX_VISIBLE_CELLS_PER_ROW = 4;
const MAX_STRING_VALUE_LENGTH = 120;
const MAX_CHANGED_ROW_CELLS = 8;
const MAX_RELATED_ROW_SIGNALS = 2;
const MAX_FORMULA_REFERENCE_SIGNALS = 4;
const INTERPRETATION_HEDGE_TERMS = [
  "appears",
  "may",
  "might",
  "possible",
  "possibly",
  "likely",
  "consider",
  "could",
  "suggests",
  "can indicate",
] as const;
const UNSUPPORTED_ENGINEERING_TERMS = [
  "structural capacity",
  "deflection risk",
  "load-bearing",
  "engineering intent",
  "structural performance",
  "adequacy",
  "design standard",
  "soil classification",
] as const;
const UNSUPPORTED_COMPLIANCE_TERMS = [
  "complies",
  "compliance",
  "code",
  "ncc",
  "as/nzs",
  "regulatory",
] as const;
const UNSUPPORTED_BUSINESS_MOTIVE_TERMS = [
  "competitiveness",
  "competitive",
  "commercial strategy",
  "procurement strategy",
  "supplier reliability",
  "margin estimate accuracy",
  "resource allocation",
] as const;

function isJsonRecord(value: unknown): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorksheetSemanticClassifiableEventType(value: unknown): value is WorksheetSemanticClassifiableEventType {
  return (
    typeof value === "string" &&
    (WORKSHEET_SEMANTIC_CLASSIFIABLE_EVENT_TYPES as readonly string[]).includes(value)
  );
}

function isFiniteConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function clampConfidence(value: unknown): number | null {
  if (!isFiniteConfidence(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, Number(value)));
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function truncateString(value: string | null | undefined, maxLength = MAX_STRING_VALUE_LENGTH) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function lowerIncludesAny(value: string, phrases: readonly string[]) {
  const normalized = value.toLowerCase();
  return phrases.some((phrase) => normalized.includes(phrase));
}

function hasInferenceHedge(value: string | null) {
  if (!value) {
    return false;
  }

  return lowerIncludesAny(value, INTERPRETATION_HEDGE_TERMS);
}

function sanitizeConstructionMeaning(value: string | null) {
  if (!value) {
    return null;
  }

  if (
    !hasInferenceHedge(value)
    && (lowerIncludesAny(value, UNSUPPORTED_ENGINEERING_TERMS) || lowerIncludesAny(value, UNSUPPORTED_COMPLIANCE_TERMS))
  ) {
    return "This appears to be a construction-related worksheet assumption change that may affect downstream quantities, layout, or estimating inputs.";
  }

  return value;
}

function sanitizeBusinessMeaning(value: string | null) {
  if (!value) {
    return null;
  }

  if (!hasInferenceHedge(value) && lowerIncludesAny(value, UNSUPPORTED_BUSINESS_MOTIVE_TERMS)) {
    return "This appears to reflect an estimator adjustment that may affect downstream cost, quantities, or commercial review assumptions.";
  }

  return value;
}

function buildWorksheetImpactSummary(params: {
  oldValue: Json | null;
  newValue: Json | null;
  oldFormula: string | null;
  newFormula: string | null;
  formulaMeaning: string | null;
}) {
  if (params.formulaMeaning) {
    return params.formulaMeaning;
  }

  if (params.oldFormula !== params.newFormula && (params.oldFormula || params.newFormula)) {
    return "This changes worksheet formula behavior for dependent cells, totals, or calculations.";
  }

  if (params.oldValue !== params.newValue) {
    return "This changes a worksheet input value and may affect downstream dependent quantities, totals, or rates.";
  }

  return null;
}

function buildEstimatorBehaviorSummary(params: {
  whatChanged: string | null;
  changeType: string | null;
  pageType: string | null;
}) {
  if (params.whatChanged) {
    return `Estimator changed this worksheet value or assumption: ${params.whatChanged}`;
  }

  if (params.changeType || params.pageType) {
    return `This appears to be an estimator-driven worksheet ${params.changeType ?? "change"} on a ${params.pageType ?? "relevant"} page.`;
  }

  return "This appears to be an estimator-driven worksheet change.";
}

function compactJsonScalar(value: Json | undefined): Json | null {
  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  return null;
}

function compactStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => truncateString(entry, 60))
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .slice(0, limit);
}

function compactStringArrayWithMaxLength(value: unknown, limit: number, maxLength: number) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => truncateString(entry, maxLength))
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .slice(0, limit);
}

function compactJsonScalarWithMaxLength(value: Json | undefined, maxLength: number): Json | null {
  if (typeof value === "string") {
    return truncateString(value, maxLength);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  return null;
}

function coalesceNullableString(...values: unknown[]) {
  for (const value of values) {
    const normalized = toNullableString(value);
    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function coalesceJsonScalar(...values: Array<Json | undefined>) {
  for (const value of values) {
    const normalized = compactJsonScalar(value);
    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function inferPricingRoleFromHeaderOrColumn(header: string | null, column: string | null) {
  const normalized = `${header ?? ""} ${column ?? ""}`.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  if (normalized.includes("description")) {
    return "description";
  }
  if (normalized.includes("unit")) {
    return "unit";
  }
  if (normalized.includes("quantity") || normalized.includes("qty")) {
    return "quantity";
  }
  if (normalized.includes("amount") || normalized.includes("total")) {
    return "amount";
  }
  if (normalized.includes("labour")) {
    return normalized.includes("rate") ? "rate" : "labour";
  }
  if (normalized.includes("material")) {
    return normalized.includes("rate") ? "rate" : "material";
  }
  if (normalized.includes("rate")) {
    return "rate";
  }
  if (normalized.includes("allowance") || normalized.includes("waste")) {
    return "allowance";
  }
  if (normalized.includes("markup")) {
    return "markup";
  }
  if (normalized.includes("margin")) {
    return "margin";
  }
  if (normalized.includes("note")) {
    return "notes";
  }
  if (normalized.includes("formula")) {
    return "formula";
  }

  return "unknown";
}

function isPricingTupleRole(role: string | null) {
  return role === "quantity" || role === "rate" || role === "amount" || role === "labour" || role === "material" || role === "unit";
}

function summarizeFormulaPricingImpactFromHeader(value: string | null) {
  const normalized = value?.toLowerCase() ?? "";
  return (
    normalized.includes("quantity")
    || normalized.includes("qty")
    || normalized.includes("rate")
    || normalized.includes("amount")
    || normalized.includes("total")
    || normalized.includes("labour")
    || normalized.includes("material")
    || normalized.includes("unit")
  );
}

function buildChangedRowCells(diffData: Record<string, Json | undefined>) {
  const candidates =
    Array.isArray(diffData.rowSnapshotVisibleCells)
      ? diffData.rowSnapshotVisibleCells
      : isJsonRecord(diffData.rowSnapshotAfter) && Array.isArray(diffData.rowSnapshotAfter.visibleCells)
        ? (diffData.rowSnapshotAfter.visibleCells as unknown[])
        : [];

  return candidates
    .filter((entry): entry is Record<string, Json | undefined> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => {
      const header = truncateString(toNullableString(entry.header), 60);
      const column = truncateString(toNullableString(entry.column), 8);
      const formula = truncateString(toNullableString(entry.formula), 80);
      const role =
        toNullableString(entry.columnRole)
        ?? inferPricingRoleFromHeaderOrColumn(header, column);

      return {
        role,
        column,
        header,
        value: compactJsonScalarWithMaxLength(entry.value as Json | undefined, 60),
        formula,
      } satisfies Record<string, Json | null>;
    })
    .filter((cell) => cell.column !== null || cell.header !== null || cell.value !== null || cell.formula !== null)
    .slice(0, MAX_CHANGED_ROW_CELLS);
}

function buildChangedRowBestDescriptionText(params: {
  cells: Array<Record<string, Json | null>>;
  itemLabel: string | null;
  rowLabel: string | null;
}) {
  const descriptionCell = params.cells.find((cell) => {
    const role = toNullableString(cell.role);
    return role === "description" && typeof cell.value === "string" && cell.value.trim().length > 0;
  });

  const descriptionValue =
    descriptionCell && typeof descriptionCell.value === "string"
      ? descriptionCell.value
      : null;

  return truncateString(
    descriptionValue
    ?? params.itemLabel
    ?? params.rowLabel,
    160,
  );
}

function buildPricingRolesPresent(cells: Array<Record<string, Json | null>>) {
  const roles = cells
    .map((cell) => toNullableString(cell.role))
    .filter((role): role is string => role !== null && role !== "unknown");

  return Array.from(new Set(roles));
}

function buildRelatedRowKinds(relatedRows: unknown) {
  if (!Array.isArray(relatedRows)) {
    return [] as string[];
  }

  const kinds = new Set<string>();
  for (const entry of relatedRows) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const row = typeof record.row === "number" && Number.isFinite(record.row) ? record.row : null;
    if (row === null) {
      continue;
    }

    if (kinds.size === 0) {
      kinds.add("previous");
      continue;
    }
    if (!kinds.has("next")) {
      kinds.add("next");
      continue;
    }
    kinds.add("same_section");
    if (kinds.size >= 3) {
      break;
    }
  }

  return Array.from(kinds).slice(0, 3);
}

function buildRelatedRowSignals(relatedRows: Json | undefined) {
  if (!Array.isArray(relatedRows)) {
    return [] as Array<Record<string, Json | null>>;
  }

  return relatedRows
    .filter((entry): entry is Record<string, Json | undefined> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .slice(0, MAX_RELATED_ROW_SIGNALS)
    .map((entry, index) => {
      const visibleCells = Array.isArray(entry.visibleCells)
        ? entry.visibleCells.filter((cell): cell is Record<string, Json | undefined> => Boolean(cell) && typeof cell === "object" && !Array.isArray(cell))
        : [];

      const pricingTuple = {
        quantity: null as Json | null,
        rate: null as Json | null,
        amount: null as Json | null,
      };

      for (const cell of visibleCells) {
        const role = toNullableString(cell.columnRole) ?? inferPricingRoleFromHeaderOrColumn(
          truncateString(toNullableString(cell.header), 60),
          truncateString(toNullableString(cell.column), 8),
        );
        if (role === "quantity" && pricingTuple.quantity === null) {
          pricingTuple.quantity = compactJsonScalarWithMaxLength(cell.value as Json | undefined, 40);
        } else if (role === "rate" && pricingTuple.rate === null) {
          pricingTuple.rate = compactJsonScalarWithMaxLength(cell.value as Json | undefined, 40);
        } else if (role === "amount" && pricingTuple.amount === null) {
          pricingTuple.amount = compactJsonScalarWithMaxLength(cell.value as Json | undefined, 40);
        }
      }

      return {
        relation: index === 0 ? "previous" : "next",
        rowLabel: truncateString(toNullableString(entry.rowLabel), 80),
        itemLabel: truncateString(toNullableString(entry.itemLabel), 80),
        unit: truncateString(toNullableString(entry.unit), 24),
        pricingTuple,
      } satisfies Record<string, Json | null>;
    });
}

function buildFormulaReferenceSignals(diffData: Record<string, Json | undefined>) {
  if (Array.isArray(diffData.referencedCellsSnapshot)) {
    return diffData.referencedCellsSnapshot
      .filter((entry): entry is Record<string, Json | undefined> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      .slice(0, MAX_FORMULA_REFERENCE_SIGNALS)
      .map((entry) => ({
        ref: truncateString(coalesceNullableString(entry.ref, entry.startCell), 20),
        rowLabel: truncateString(toNullableString(entry.rowLabel), 80),
        itemLabel: truncateString(toNullableString(entry.itemLabel), 80),
        columnHeader: truncateString(toNullableString(entry.columnHeader), 60),
        value: compactJsonScalarWithMaxLength(entry.value as Json | undefined, 60),
      }) satisfies Record<string, Json | null>);
  }

  return compactStringArrayWithMaxLength(diffData.formulaReferences, MAX_FORMULA_REFERENCE_SIGNALS, 20)
    .map((ref) => ({
      ref,
      rowLabel: null,
      itemLabel: null,
      columnHeader: null,
      value: null,
    }) satisfies Record<string, Json | null>);
}

function buildFormulaAffectsPricingTuple(
  references: Array<Record<string, Json | null>>,
  changedRowCells: Array<Record<string, Json | null>>,
) {
  const pricingHeaders = new Set(
    changedRowCells
      .filter((cell) => isPricingTupleRole(toNullableString(cell.role)))
      .map((cell) => (toNullableString(cell.header) ?? "").toLowerCase())
      .filter((value) => value.length > 0),
  );

  return references.some((reference) => {
    const header = toNullableString(reference.columnHeader);
    if (header && summarizeFormulaPricingImpactFromHeader(header)) {
      return true;
    }

    return header !== null && pricingHeaders.has(header.toLowerCase());
  });
}

function buildPricingContext(diffData: Record<string, Json | undefined>, changedRowCells: Array<Record<string, Json | null>>) {
  const pricingTuple = isJsonRecord(diffData.pricingTuple) ? diffData.pricingTuple : {};
  const byRole = new Map<string, Json | null>();

  for (const cell of changedRowCells) {
    const role = toNullableString(cell.role);
    if (role && !byRole.has(role)) {
      byRole.set(role, compactJsonScalarWithMaxLength(cell.value as Json | undefined, 40));
    }
  }

  const quantity = coalesceJsonScalar(pricingTuple.quantity as Json | undefined, byRole.get("quantity") as Json | undefined);
  const rate = coalesceJsonScalar(pricingTuple.rate as Json | undefined, byRole.get("rate") as Json | undefined);
  const amount = coalesceJsonScalar(pricingTuple.amount as Json | undefined, byRole.get("amount") as Json | undefined);
  const labour = coalesceJsonScalar(pricingTuple.labour as Json | undefined, byRole.get("labour") as Json | undefined);
  const material = coalesceJsonScalar(pricingTuple.material as Json | undefined, byRole.get("material") as Json | undefined);
  const unit = truncateString(
    coalesceNullableString(pricingTuple.unit, byRole.get("unit")),
    24,
  );

  return {
    quantity,
    rate,
    amount,
    unit,
    labour,
    material,
    hasCompleteTuple:
      unit !== null
      && quantity !== null
      && (rate !== null || amount !== null || labour !== null || material !== null),
  };
}

function buildMissingCriticalContext(params: {
  bestDescriptionText: string | null;
  itemLabel: string | null;
  columnHeader: string | null;
  unit: string | null;
  oldValue: Json | null;
  newValue: Json | null;
}) {
  const numericValuePresent =
    typeof params.oldValue === "number"
    || typeof params.newValue === "number";

  return (
    (!params.bestDescriptionText && !params.itemLabel)
    || !params.columnHeader
    || (numericValuePresent && !params.unit)
  );
}

function pruneInterpretationPromptValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => pruneInterpretationPromptValue(entry))
      .filter((entry) => {
        if (entry === null || entry === undefined) {
          return false;
        }
        if (Array.isArray(entry)) {
          return entry.length > 0;
        }
        if (typeof entry === "object") {
          return Object.keys(entry as Record<string, unknown>).length > 0;
        }
        if (typeof entry === "string") {
          return entry.trim().length > 0;
        }
        return true;
      });
    return items;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, pruneInterpretationPromptValue(entry)] as const)
      .filter(([, entry]) => {
        if (entry === null || entry === undefined) {
          return false;
        }
        if (Array.isArray(entry)) {
          return entry.length > 0;
        }
        if (typeof entry === "object") {
          return Object.keys(entry as Record<string, unknown>).length > 0;
        }
        if (typeof entry === "string") {
          return entry.trim().length > 0;
        }
        return true;
      });
    return Object.fromEntries(entries);
  }

  return value;
}

function compactNearbyRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<Record<string, Json | null>>;
  }

  return value
    .slice(0, MAX_NEARBY_ROWS)
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return null;
      }

      const record = row as Record<string, unknown>;
      const visibleCells = Array.isArray(record.visibleCells)
        ? record.visibleCells
            .slice(0, MAX_VISIBLE_CELLS_PER_ROW)
            .map((cell) => {
              if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
                return null;
              }

              const cellRecord = cell as Record<string, unknown>;
              return {
                column: toNullableString(cellRecord.column),
                header: truncateString(toNullableString(cellRecord.header), 60),
                value: compactJsonScalar((cellRecord.value as Json | undefined) ?? null),
                formula: truncateString(toNullableString(cellRecord.formula), 80),
                unit: truncateString(toNullableString(cellRecord.unit), 24),
              } satisfies Record<string, Json | null>;
            })
            .filter((cell) => cell !== null)
        : [];

      return {
        row: typeof record.row === "number" && Number.isFinite(record.row) ? record.row : null,
        rowLabel: truncateString(toNullableString(record.rowLabel), 80),
        unit: truncateString(toNullableString(record.unit), 24),
        visibleCells,
      } satisfies Record<string, Json | null>;
    })
    .filter((row) => row !== null);
}

function normalizeSemanticField(value: unknown): WorksheetSemanticClassificationField {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      value: null,
      confidence: null,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    value: toNullableString(record.value),
    confidence: clampConfidence(record.confidence),
  };
}

function normalizeCompactSemanticSummaryField(
  summary: Record<string, unknown>,
  key: string,
  fallbackConfidence: number | null,
): WorksheetSemanticClassificationField | null {
  const value = toNullableString(summary[key]);
  if (value === null) {
    return null;
  }

  return {
    value,
    confidence: fallbackConfidence,
  };
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeNullableJsonRecord(value: unknown): Record<string, Json | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Json | null>;
}

function normalizeCompactAnthropicInterpretationPayload(
  value: unknown,
  overallConfidence: number | null,
  semanticSummary?: Record<string, unknown> | null,
): Record<string, Json | null> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const whatChanged = toNullableString(record.whatChanged);
  const plainEnglishSummary = toNullableString(record.plainEnglishSummary);
  const businessMeaning = toNullableString(record.businessMeaning);
  const futureUseText = toNullableString(record.futureUse);

  if (!whatChanged || !plainEnglishSummary || !businessMeaning || !futureUseText) {
    return null;
  }

  const constructionMeaning = toNullableString(record.constructionMeaning);
  const pricingMeaning = toNullableString(record.pricingMeaning);
  const memoryCandidate = typeof record.memoryCandidate === "boolean" ? record.memoryCandidate : null;
  const memoryType = toNullableString(record.memoryType);
  const retrievalGuidance = toNullableString(record.retrievalGuidance);
  const shouldInfluenceFutureGeneration =
    typeof record.shouldInfluenceFutureGeneration === "boolean" ? record.shouldInfluenceFutureGeneration : null;
  const shouldInfluenceFutureReview =
    typeof record.shouldInfluenceFutureReview === "boolean" ? record.shouldInfluenceFutureReview : null;
  const contextConfidence = clampConfidence(record.contextConfidence);
  const futureUseConfidence = clampConfidence(record.futureUseConfidence);
  const pageType = semanticSummary ? toNullableString(semanticSummary.pageType) : null;
  const itemCategory = semanticSummary ? toNullableString(semanticSummary.itemCategory) : null;
  const normalizedTradePackage = semanticSummary ? toNullableString(semanticSummary.normalizedTradePackage) : null;
  const costRole = semanticSummary ? toNullableString(semanticSummary.costRole) : null;
  const sanitizedBusinessMeaning = sanitizeBusinessMeaning(businessMeaning);
  const sanitizedConstructionMeaning = sanitizeConstructionMeaning(constructionMeaning);
  const oldValue = compactJsonScalar(record.oldValue as Json | undefined);
  const newValue = compactJsonScalar(record.newValue as Json | undefined);
  const oldFormula = toNullableString(record.oldFormula);
  const newFormula = toNullableString(record.newFormula);
  const formulaMeaning = toNullableString(record.formulaMeaning);

  return {
    interpretedChange: {
      whatChanged,
      changeType: toNullableString(record.changeType),
      oldValue,
      newValue,
      oldFormula,
      newFormula,
      unit: toNullableString(record.unit),
      plainEnglishSummary,
      businessMeaning: sanitizedBusinessMeaning,
      constructionMeaning: sanitizedConstructionMeaning,
      pricingMeaning,
      constructionContext: {
        tradeOrScope: normalizedTradePackage,
        workCategory: null,
        systemCategory: null,
        workType: null,
        pageType,
        sectionType: null,
        itemCategory,
      },
      pricingContext: {
        costRole,
        measurementBasis: null,
        rateBasis: null,
      },
      formulaMeaning,
      aiCorrectionMeaning: toNullableString(record.aiCorrectionMeaning),
      observed: {
        changeSummary: whatChanged,
        oldValue,
        newValue,
        oldFormula,
        newFormula,
        unit: toNullableString(record.unit),
        plainEnglishSummary,
      },
      knownImpact: {
        worksheetImpact: buildWorksheetImpactSummary({
          oldValue,
          newValue,
          oldFormula,
          newFormula,
          formulaMeaning,
        }),
        pricingImpact: pricingMeaning,
      },
      interpretation: {
        estimatorBehavior: buildEstimatorBehaviorSummary({
          whatChanged,
          changeType: toNullableString(record.changeType),
          pageType,
        }),
        constructionContext: sanitizedConstructionMeaning,
        businessContext: sanitizedBusinessMeaning,
      },
      futureUse: {
        memoryCandidate,
        memoryType,
        retrievalGuidance,
        shouldInfluenceFutureGeneration,
        shouldInfluenceFutureReview,
        summary: futureUseText,
      },
      confidence: {
        overall: overallConfidence,
        context: contextConfidence,
        futureUse: futureUseConfidence,
      },
    } satisfies Json,
  };
}

function refineInterpretationPayload(
  interpretationPayload: Record<string, Json | null>,
  semanticSummary?: Record<string, unknown> | null,
) {
  const interpretedChange = interpretationPayload.interpretedChange;
  if (!isJsonRecord(interpretedChange)) {
    return interpretationPayload;
  }

  const whatChanged = toNullableString(interpretedChange.whatChanged);
  const changeType = toNullableString(interpretedChange.changeType);
  const oldValue = compactJsonScalar(interpretedChange.oldValue as Json | undefined);
  const newValue = compactJsonScalar(interpretedChange.newValue as Json | undefined);
  const oldFormula = toNullableString(interpretedChange.oldFormula);
  const newFormula = toNullableString(interpretedChange.newFormula);
  const unit = toNullableString(interpretedChange.unit);
  const plainEnglishSummary = toNullableString(interpretedChange.plainEnglishSummary);
  const businessMeaning = sanitizeBusinessMeaning(toNullableString(interpretedChange.businessMeaning));
  const constructionMeaning = sanitizeConstructionMeaning(toNullableString(interpretedChange.constructionMeaning));
  const pricingMeaning = toNullableString(interpretedChange.pricingMeaning);
  const formulaMeaning = toNullableString(interpretedChange.formulaMeaning);

  const pageType =
    semanticSummary
      ? toNullableString(semanticSummary.pageType)
      : isJsonRecord(interpretedChange.constructionContext)
        ? toNullableString(interpretedChange.constructionContext.pageType)
        : null;

  return {
    ...interpretationPayload,
    interpretedChange: {
      ...interpretedChange,
      oldValue,
      newValue,
      oldFormula,
      newFormula,
      unit,
      plainEnglishSummary,
      businessMeaning,
      constructionMeaning,
      pricingMeaning,
      observed: {
        changeSummary: whatChanged,
        oldValue,
        newValue,
        oldFormula,
        newFormula,
        unit,
        plainEnglishSummary,
      },
      knownImpact: {
        worksheetImpact: buildWorksheetImpactSummary({
          oldValue,
          newValue,
          oldFormula,
          newFormula,
          formulaMeaning,
        }),
        pricingImpact: pricingMeaning,
      },
      interpretation: {
        estimatorBehavior: buildEstimatorBehaviorSummary({
          whatChanged,
          changeType,
          pageType,
        }),
        constructionContext: constructionMeaning,
        businessContext: businessMeaning,
      },
    } satisfies Json,
  };
}

function compactJsonRecord(
  value: unknown,
  options: {
    maxStringLength?: number;
    maxArrayItems?: number;
    maxKeys?: number;
  } = {},
): Record<string, Json | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const maxStringLength = options.maxStringLength ?? 180;
  const maxArrayItems = options.maxArrayItems ?? 6;
  const maxKeys = options.maxKeys ?? 16;
  const entries = Object.entries(value as Record<string, unknown>).slice(0, maxKeys);

  return Object.fromEntries(
    entries.map(([key, entry]) => {
      if (typeof entry === "string") {
        return [key, truncateString(entry, maxStringLength)];
      }
      if (typeof entry === "number" || typeof entry === "boolean" || entry === null) {
        return [key, entry as Json];
      }
      if (Array.isArray(entry)) {
        const compacted = entry
          .slice(0, maxArrayItems)
          .map((item) => {
            if (typeof item === "string") {
              return truncateString(item, maxStringLength);
            }
            if (typeof item === "number" || typeof item === "boolean" || item === null) {
              return item;
            }
            return null;
          })
          .filter((item): item is Json => item !== undefined);
        return [key, compacted as Json];
      }

      return [key, null];
    }),
  );
}

function getFutureUseSummary(interpretationPayload: Record<string, Json | null>) {
  const interpretedChange = interpretationPayload.interpretedChange;
  if (!isJsonRecord(interpretedChange)) {
    return {} as Record<string, Json | null>;
  }
  return isJsonRecord(interpretedChange.futureUse)
    ? compactJsonRecord(interpretedChange.futureUse, { maxStringLength: 220, maxArrayItems: 4, maxKeys: 8 })
    : {};
}

function getConfidenceDetail(interpretationPayload: Record<string, Json | null>, overallConfidence: number | null) {
  const interpretedChange = interpretationPayload.interpretedChange;
  if (!isJsonRecord(interpretedChange)) {
    return overallConfidence === null ? {} : { overall: overallConfidence };
  }

  const confidence = isJsonRecord(interpretedChange.confidence)
    ? compactJsonRecord(interpretedChange.confidence, { maxKeys: 8 })
    : {};

  if (overallConfidence !== null && confidence.overall === undefined) {
    confidence.overall = overallConfidence;
  }

  return confidence;
}

function normalizeWorksheetSemanticClassificationResult(
  eventId: string,
  value: unknown,
): WorksheetSemanticClassificationResult {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const overallConfidence = clampConfidence(record.overallConfidence);
  const semanticSummary =
    record.semanticSummary && typeof record.semanticSummary === "object" && !Array.isArray(record.semanticSummary)
      ? (record.semanticSummary as Record<string, unknown>)
      : null;
  const compactInterpretationPayload = normalizeCompactAnthropicInterpretationPayload(
    record.interpretationPayload,
    overallConfidence,
    semanticSummary,
  );
  const normalizedInterpretationPayload = refineInterpretationPayload(
    compactInterpretationPayload ?? normalizeNullableJsonRecord(record.interpretationPayload),
    semanticSummary,
  );

  return {
    eventId,
    costRole:
      normalizeCompactSemanticSummaryField(semanticSummary ?? {}, "costRole", overallConfidence)
      ?? normalizeSemanticField(record.costRole),
    cellRole: normalizeSemanticField(record.cellRole),
    pageType:
      normalizeCompactSemanticSummaryField(semanticSummary ?? {}, "pageType", overallConfidence)
      ?? normalizeSemanticField(record.pageType),
    sectionType: normalizeSemanticField(record.sectionType),
    itemCategory:
      normalizeCompactSemanticSummaryField(semanticSummary ?? {}, "itemCategory", overallConfidence)
      ?? normalizeSemanticField(record.itemCategory),
    measurementBasis: normalizeSemanticField(record.measurementBasis),
    normalizedUnit:
      normalizeCompactSemanticSummaryField(semanticSummary ?? {}, "normalizedUnit", overallConfidence)
      ?? normalizeSemanticField(record.normalizedUnit),
    normalizedTradePackage:
      normalizeCompactSemanticSummaryField(semanticSummary ?? {}, "normalizedTradePackage", overallConfidence)
      ?? normalizeSemanticField(record.normalizedTradePackage),
    workCategory: normalizeSemanticField(record.workCategory),
    systemCategory: normalizeSemanticField(record.systemCategory),
    assemblyCategory: normalizeSemanticField(record.assemblyCategory),
    overallConfidence,
    reasoningSummary: toNullableString(record.reasoningSummary),
    interpretationSchemaVersion: normalizePositiveInteger(
      record.interpretationSchemaVersion,
      DEFAULT_INTERPRETATION_SCHEMA_VERSION,
    ),
    interpretationPayload: normalizedInterpretationPayload,
    retryCount:
      typeof record.retryCount === "number" && Number.isFinite(record.retryCount)
        ? Math.max(0, Math.floor(record.retryCount))
        : 0,
  };
}

function isValidInterpretationPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  if (!payload.interpretedChange || typeof payload.interpretedChange !== "object" || Array.isArray(payload.interpretedChange)) {
    return false;
  }

  const interpretedChange = payload.interpretedChange as Record<string, unknown>;
  const hasWhatChanged = typeof interpretedChange.whatChanged === "string" && interpretedChange.whatChanged.trim().length > 0;
  const hasPlainEnglishSummary =
    typeof interpretedChange.plainEnglishSummary === "string" && interpretedChange.plainEnglishSummary.trim().length > 0;
  const hasBusinessMeaning =
    typeof interpretedChange.businessMeaning === "string" && interpretedChange.businessMeaning.trim().length > 0;
  const hasFutureUse =
    Boolean(interpretedChange.futureUse)
    && typeof interpretedChange.futureUse === "object"
    && !Array.isArray(interpretedChange.futureUse);

  return hasWhatChanged && hasPlainEnglishSummary && hasBusinessMeaning && hasFutureUse;
}

function compactConstructionIntent(value: unknown): Record<string, Json> {
  const record = normalizeNullableJsonRecord(value);
  if (Object.keys(record).length === 0) {
    return {};
  }

  return {
    primaryIntent: toNullableString(record.primaryIntent),
    defaultJurisdiction: toNullableString(record.defaultJurisdiction),
    tradeHints: compactStringArray(record.tradeHints, 6),
    systemHints: compactStringArray(record.systemHints, 6),
    confidence: toNullableString(record.confidence),
    riskLevel: toNullableString(record.riskLevel),
    requiresRetrieval: record.requiresRetrieval === true,
    recommendedPromptPath: toNullableString(record.recommendedPromptPath),
    reason: truncateString(toNullableString(record.reason), 180),
    retrievalReasons: compactStringArray(record.retrievalReasons, 6),
  } satisfies Record<string, Json | null>;
}

function getRetryDelayMs(attemptNumber: number) {
  const safeAttempt = Math.max(attemptNumber, 1);
  const minutes = Math.min(5 * 2 ** (safeAttempt - 1), 24 * 60);
  return minutes * 60 * 1000;
}

function buildRetryAfter(attemptNumber: number, nowIso: string) {
  return new Date(Date.parse(nowIso) + getRetryDelayMs(attemptNumber)).toISOString();
}

function buildWorksheetEventClassificationSchema() {
  const semanticFieldSchema = {
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence"],
    properties: {
      value: {
        anyOf: [
          { type: "string" },
          { type: "null" },
        ],
      },
      confidence: {
        anyOf: [
          { type: "number" },
          { type: "null" },
        ],
      },
    },
  } as const;

  const nullableStringSchema = {
    anyOf: [
      { type: "string" },
      { type: "null" },
    ],
  } as const;
  const nullableNumberSchema = {
    anyOf: [
      { type: "number" },
      { type: "null" },
    ],
  } as const;
  const nullableBooleanSchema = {
    anyOf: [
      { type: "boolean" },
      { type: "null" },
    ],
  } as const;
  const nullableJsonScalarSchema = {
    anyOf: [
      { type: "string" },
      { type: "number" },
      { type: "boolean" },
      { type: "null" },
    ],
  } as const;

  const properties = Object.fromEntries(
    FIELD_NAMES.map((field) => [field, semanticFieldSchema]),
  );

  return {
    type: "object",
    additionalProperties: false,
    required: ["classifications"],
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "eventId",
            ...FIELD_NAMES,
            "overallConfidence",
            "reasoningSummary",
            "interpretationSchemaVersion",
            "interpretationPayload",
          ],
          properties: {
            eventId: { type: "string" },
            ...properties,
            overallConfidence: {
              anyOf: [
                { type: "number" },
                { type: "null" },
              ],
            },
            reasoningSummary: {
              anyOf: [
                { type: "string" },
                { type: "null" },
              ],
            },
            interpretationSchemaVersion: { type: "integer" },
            interpretationPayload: {
              type: "object",
              additionalProperties: false,
              required: ["interpretedChange"],
              properties: {
                interpretedChange: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "whatChanged",
                    "changeType",
                    "oldValue",
                    "newValue",
                    "oldFormula",
                    "newFormula",
                    "unit",
                    "plainEnglishSummary",
                    "businessMeaning",
                    "constructionContext",
                    "pricingContext",
                    "formulaMeaning",
                    "aiCorrectionMeaning",
                    "futureUse",
                    "confidence",
                  ],
                  properties: {
                    whatChanged: nullableStringSchema,
                    changeType: nullableStringSchema,
                    oldValue: nullableJsonScalarSchema,
                    newValue: nullableJsonScalarSchema,
                    oldFormula: nullableStringSchema,
                    newFormula: nullableStringSchema,
                    unit: nullableStringSchema,
	                    plainEnglishSummary: nullableStringSchema,
	                    businessMeaning: nullableStringSchema,
	                    constructionMeaning: nullableStringSchema,
	                    pricingMeaning: nullableStringSchema,
	                    constructionContext: {
                      type: "object",
                      additionalProperties: false,
                      required: ["tradeOrScope", "workCategory", "systemCategory", "workType", "pageType", "sectionType", "itemCategory"],
                      properties: {
                        tradeOrScope: nullableStringSchema,
                        workCategory: nullableStringSchema,
                        systemCategory: nullableStringSchema,
                        workType: nullableStringSchema,
                        pageType: nullableStringSchema,
                        sectionType: nullableStringSchema,
                        itemCategory: nullableStringSchema,
                      },
                    },
                    pricingContext: {
                      type: "object",
                      additionalProperties: false,
                      required: ["costRole", "measurementBasis", "rateBasis"],
                      properties: {
                        costRole: nullableStringSchema,
                        measurementBasis: nullableStringSchema,
                        rateBasis: nullableStringSchema,
                      },
                    },
                    formulaMeaning: nullableStringSchema,
                    aiCorrectionMeaning: nullableStringSchema,
                    futureUse: {
                      type: "object",
                      additionalProperties: false,
                      required: [
                        "memoryCandidate",
                        "memoryType",
                        "retrievalGuidance",
                        "shouldInfluenceFutureGeneration",
                        "shouldInfluenceFutureReview",
                      ],
                      properties: {
                        memoryCandidate: nullableBooleanSchema,
                        memoryType: nullableStringSchema,
                        retrievalGuidance: nullableStringSchema,
                        shouldInfluenceFutureGeneration: nullableBooleanSchema,
                        shouldInfluenceFutureReview: nullableBooleanSchema,
                      },
                    },
                    confidence: {
                      type: "object",
                      additionalProperties: false,
                      required: ["overall", "context", "futureUse"],
                      properties: {
                        overall: nullableNumberSchema,
                        context: nullableNumberSchema,
                        futureUse: nullableNumberSchema,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  } as Record<string, unknown>;
}

function buildWorksheetSemanticClassificationSystemPrompt() {
  return [
    "Interpret each worksheet change as a reusable construction intelligence learning record.",
    "You are not judging whether the change was correct or incorrect.",
    "Separate each interpretation into: Observed, KnownImpact, Interpretation, and FutureUse.",
    "Observed should contain only facts directly shown in the worksheet event context.",
    "KnownImpact should contain direct worksheet or pricing consequences that follow from the visible change.",
    "Interpretation should stay cautious and focus on estimator behavior, worksheet role, and likely estimating context.",
    "FutureUse should describe how future AI may use the observed estimator behavior in similar worksheet contexts.",
    "The primary output is interpretationPayload. semantic fields are secondary support fields.",
    "Use only the provided compact event context and compact construction intelligence context.",
    "Do not invent certainty. Use null for unknown values and low confidence when evidence is weak.",
    "Distinguish facts from assumptions and uncertainty.",
    "Never present assumptions as facts.",
    "Prioritize trustworthiness over creativity.",
    "Use words like appears, may, possible, likely, and consider when something is inferred rather than directly shown.",
    "Do not infer structural adequacy, compliance, engineering intent, design intent, or commercial strategy unless the event context explicitly supports it.",
    "Prefer describing estimator behavior and worksheet consequences over speculative engineering explanations.",
    "Low confidence should still include useful interpretation text when possible.",
    "Keep interpretations trade-agnostic and workflow-agnostic.",
    "Return valid JSON only.",
  ].join("\n");
}

async function listWorksheetSemanticAiInteractionContexts(params: {
  organizationIds: string[];
  aiInteractionIds: string[];
}) {
  const uniqueInteractionIds = Array.from(new Set(params.aiInteractionIds.filter((value) => value.trim().length > 0)));
  const uniqueOrganizationIds = Array.from(new Set(params.organizationIds.filter((value) => value.trim().length > 0)));

  if (uniqueInteractionIds.length === 0 || uniqueOrganizationIds.length === 0) {
    return new Map<string, WorksheetSemanticAiInteractionContext>();
  }

  const admin = createAdminSupabaseClient();
  const query = await admin
    .from("ai_interactions")
    .select("id, organization_id, input_context_summary")
    .in("id", uniqueInteractionIds)
    .in("organization_id", uniqueOrganizationIds);

  if (query.error) {
    throw new Error(query.error.message);
  }

  const rows = Array.isArray(query.data) ? query.data : [];
  return new Map<string, WorksheetSemanticAiInteractionContext>(
    rows.flatMap((row) => {
      if (!row || typeof row !== "object") {
        return [];
      }
      const record = row as Record<string, unknown>;
      const aiInteractionId = toNullableString(record.id);
      const organizationId = toNullableString(record.organization_id);
      const inputContextSummary = normalizeNullableJsonRecord(record.input_context_summary);
      if (!aiInteractionId || !organizationId) {
        return [];
      }

      return [[
        aiInteractionId,
        {
          aiInteractionId,
          organizationId,
          workbookId: toNullableString(inputContextSummary.workbookId),
          sheetId: toNullableString(inputContextSummary.sheetId),
          sheetName: toNullableString(inputContextSummary.sheetName),
          worksheetName: toNullableString(inputContextSummary.worksheetName),
          tradePackage: toNullableString(inputContextSummary.tradePackage),
          organizationGuidanceSummary: truncateString(
            toNullableString(inputContextSummary.organizationGuidanceSummary),
            220,
          ),
          constructionIntent: compactConstructionIntent(inputContextSummary.constructionIntent),
        } satisfies WorksheetSemanticAiInteractionContext,
      ]];
    }),
  );
}

async function buildWorksheetSemanticClassificationContextMap(
  events: PendingWorksheetSemanticClassificationEvent[],
) {
  const aiInteractionIds = events
    .map((event) => toNullableString(event.diffData.aiInteractionId))
    .filter((value): value is string => value !== null);
  const organizationIds = events.map((event) => event.organizationId);
  return listWorksheetSemanticAiInteractionContexts({
    aiInteractionIds,
    organizationIds,
  });
}

export function buildInterpretationInputV1(
  event: PendingWorksheetSemanticClassificationEvent,
  _aiContext?: WorksheetSemanticAiInteractionContext | null,
) {
  const changedRowCells = buildChangedRowCells(event.diffData);
  const rowLabel = truncateString(
    coalesceNullableString(
      event.diffData.rowLabel,
      isJsonRecord(event.diffData.rowSnapshotAfter) ? event.diffData.rowSnapshotAfter.rowLabel : null,
    ),
    80,
  );
  const itemLabel = truncateString(
    coalesceNullableString(
      event.diffData.itemLabel,
      isJsonRecord(event.diffData.rowSnapshotAfter) ? event.diffData.rowSnapshotAfter.itemLabel : null,
    ),
    80,
  );
  const pricingContext = buildPricingContext(event.diffData, changedRowCells);
  const bestDescriptionText = buildChangedRowBestDescriptionText({
    cells: changedRowCells,
    itemLabel,
    rowLabel,
  });
  const formulaReferences = buildFormulaReferenceSignals(event.diffData);
  const relatedRowKinds = buildRelatedRowKinds(event.diffData.relatedRows);

  return {
    version: 1,
    event: {
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      source: toNullableString(event.diffData.source),
      aiCorrection: event.eventType.startsWith("worksheet_ai_") && event.eventType.endsWith("_corrected"),
    },
    worksheet: {
      workbookId: coalesceNullableString(event.diffData.workbookId, event.metadata.workbookId),
      sheetId: coalesceNullableString(event.diffData.sheetId, event.metadata.sheetId),
      sheetName: truncateString(coalesceNullableString(event.diffData.sheetName, event.metadata.sheetName), 80),
      worksheetName: truncateString(coalesceNullableString(event.diffData.worksheetName, event.metadata.worksheetName), 80),
      tradePackage: truncateString(coalesceNullableString(event.diffData.tradePackage, event.metadata.tradePackage), 80),
    },
    anchor: {
      cell: truncateString(coalesceNullableString(event.diffData.cell, event.diffData.cellAddress), 16),
      row: typeof event.diffData.row === "number" && Number.isFinite(event.diffData.row) ? event.diffData.row : null,
      column: truncateString(coalesceNullableString(event.diffData.column, event.diffData.columnId), 8),
      columnHeader: truncateString(toNullableString(event.diffData.columnHeader), 60),
      columnRole:
        toNullableString(event.diffData.columnRole)
        ?? inferPricingRoleFromHeaderOrColumn(
          truncateString(toNullableString(event.diffData.columnHeader), 60),
          truncateString(coalesceNullableString(event.diffData.column, event.diffData.columnId), 8),
        ),
      sectionLabel: truncateString(toNullableString(event.diffData.sectionLabel), 80),
      subsectionLabel: truncateString(toNullableString(event.diffData.subsectionLabel), 80),
      sectionPath: compactStringArrayWithMaxLength(event.diffData.sectionPath, 4, 40),
      rowLabel,
      itemLabel,
      unit: truncateString(
        coalesceNullableString(
          event.diffData.unit,
          isJsonRecord(event.diffData.pricingTuple) ? event.diffData.pricingTuple.unit : null,
          isJsonRecord(event.diffData.rowSnapshotAfter) ? event.diffData.rowSnapshotAfter.unit : null,
        ),
        24,
      ),
    },
    change: {
      kind:
        event.eventType === "worksheet_formula_edited"
          ? "formula"
          : event.eventType === "worksheet_rate_changed"
            ? "rate"
            : event.eventType === "worksheet_assumption_changed"
              ? "assumption"
              : event.eventType.startsWith("worksheet_ai_") && event.eventType.endsWith("_corrected")
                ? "ai_correction"
                : event.eventType === "worksheet_cell_edited"
                  ? "value"
                  : "generic",
      oldValue: compactJsonScalarWithMaxLength(event.diffData.oldValue as Json | undefined, 80),
      newValue: compactJsonScalarWithMaxLength(event.diffData.newValue as Json | undefined, 80),
      oldFormula: truncateString(toNullableString(event.diffData.oldFormula), 120),
      newFormula: truncateString(toNullableString(event.diffData.newFormula), 120),
      formulaChanged:
        toNullableString(event.diffData.oldFormula) !== toNullableString(event.diffData.newFormula)
        && (toNullableString(event.diffData.oldFormula) !== null || toNullableString(event.diffData.newFormula) !== null),
      numericDelta:
        typeof event.diffData.oldValue === "number" && typeof event.diffData.newValue === "number"
          ? Number(event.diffData.newValue) - Number(event.diffData.oldValue)
          : null,
      direction:
        typeof event.diffData.oldValue === "number" && typeof event.diffData.newValue === "number"
          ? Number(event.diffData.newValue) > Number(event.diffData.oldValue)
            ? "increase"
            : Number(event.diffData.newValue) < Number(event.diffData.oldValue)
              ? "decrease"
              : "unknown"
          : event.diffData.oldValue == null && event.diffData.newValue != null
            ? "set"
            : event.diffData.oldValue != null && event.diffData.newValue == null
              ? "clear"
              : compactJsonScalar(event.diffData.oldValue as Json | undefined) !== compactJsonScalar(event.diffData.newValue as Json | undefined)
                || toNullableString(event.diffData.oldFormula) !== toNullableString(event.diffData.newFormula)
                ? "replace"
                : "unknown",
    },
    pricingContext: {
      ...pricingContext,
      changedPricingField: (() => {
        const role =
          toNullableString(event.diffData.columnRole)
          ?? inferPricingRoleFromHeaderOrColumn(
            truncateString(toNullableString(event.diffData.columnHeader), 60),
            truncateString(coalesceNullableString(event.diffData.column, event.diffData.columnId), 8),
          );
        return isPricingTupleRole(role) ? role : null;
      })(),
    },
    headers: {
      stable: changedRowCells.map((cell) => ({
        role: toNullableString(cell.role),
        column: toNullableString(cell.column),
        header: toNullableString(cell.header),
      })),
      nearby: compactStringArrayWithMaxLength(event.diffData.nearbyHeaders, MAX_NEARBY_HEADERS, 40),
    },
    rowEvidence: {
      changedRow: {
        rowLabel,
        itemLabel,
        unit: truncateString(
          coalesceNullableString(
            event.diffData.unit,
            isJsonRecord(event.diffData.rowSnapshotAfter) ? event.diffData.rowSnapshotAfter.unit : null,
          ),
          24,
        ),
        bestDescriptionText,
        pricingRolesPresent: buildPricingRolesPresent(changedRowCells),
        cells: changedRowCells,
      },
      relatedRowKinds,
      relatedRowSignals: buildRelatedRowSignals(event.diffData.relatedRows),
    },
    formulaContext: {
      references: formulaReferences,
      referenceSummary: compactStringArrayWithMaxLength(event.diffData.formulaReferences, MAX_FORMULA_REFERENCE_SIGNALS, 20),
      affectsPricingTuple: buildFormulaAffectsPricingTuple(formulaReferences, changedRowCells),
    },
    captureQuality: {
      evidenceSchemaVersion: typeof event.diffData.evidenceSchemaVersion === "number" ? event.diffData.evidenceSchemaVersion : null,
      captureCompletenessScore:
        typeof event.diffData.captureCompletenessScore === "number" ? event.diffData.captureCompletenessScore : null,
      rowSnapshotCompleteness:
        typeof event.diffData.rowSnapshotCompleteness === "number" ? event.diffData.rowSnapshotCompleteness : null,
      warnings: compactStringArrayWithMaxLength(event.diffData.captureWarnings, 6, 40),
      missingCriticalContext: buildMissingCriticalContext({
        bestDescriptionText,
        itemLabel,
        columnHeader: truncateString(toNullableString(event.diffData.columnHeader), 60),
        unit: truncateString(
          coalesceNullableString(
            event.diffData.unit,
            isJsonRecord(event.diffData.pricingTuple) ? event.diffData.pricingTuple.unit : null,
          ),
          24,
        ),
        oldValue: compactJsonScalar(event.diffData.oldValue as Json | undefined),
        newValue: compactJsonScalar(event.diffData.newValue as Json | undefined),
      }),
    },
    aiContext: {
      generatedByAi: event.diffData.generatedByAi === true,
      aiInteractionId: toNullableString(event.diffData.aiInteractionId),
      operationType: toNullableString(event.diffData.operationType),
      originalAiValue: compactJsonScalar(event.diffData.originalAiValue as Json | undefined),
      originalAiFormula: truncateString(toNullableString(event.diffData.originalAiFormula), 120),
    },
  };
}

export function buildWorksheetSemanticClassificationUserPrompt(
  events: PendingWorksheetSemanticClassificationEvent[],
  classificationVersion: number,
  aiContextMap: Map<string, WorksheetSemanticAiInteractionContext>,
  options: {
    directJsonMode?: boolean;
    promptMode?: WorksheetInterpretationPromptMode;
  } = {},
) {
  const compactEvents = events.map((event) =>
    pruneInterpretationPromptValue(
      buildInterpretationInputV1(
        event,
        aiContextMap.get(toNullableString(event.diffData.aiInteractionId) ?? "") ?? null,
      ),
    ),
  );

  const directJsonMode = options.directJsonMode === true;
  const promptMode = options.promptMode ?? "standard";

  if (directJsonMode && promptMode === "compact_retry") {
    return [
      `Classification schema version: ${classificationVersion}.`,
      `Interpretation prompt version: ${DEFAULT_INTERPRETATION_PROMPT_VERSION}.`,
      "Interpret the worksheet change as a reusable construction intelligence learning record.",
      "Separate the result into Observed, KnownImpact, Interpretation, and FutureUse.",
      "Return one JSON object only with a top-level classifications array.",
      "Return exactly one classification object per event.",
      "Use compact JSON only. No markdown. No code fences. No commentary outside JSON.",
      "Keep the output minimal and concise.",
      "Treat anchor, change, and pricingContext as the primary facts.",
      "changedRow.bestDescriptionText is the best available estimator-facing description for the row.",
      "relatedRowKinds and relatedRowSignals are weak context only and must not override primary facts.",
      "If captureQuality.missingCriticalContext is true or captureQuality warnings exist, lower confidence and avoid strong claims.",
      "Observed must stay factual. KnownImpact may only include direct worksheet or pricing consequences. Interpretation must stay cautious and focus on estimator behavior, not engineering or compliance rationale.",
      "Never present assumptions as facts. Use appears, may, likely, possible, or consider when context is inferred.",
      "Do not state unsupported structural, compliance, engineering, design, or business motive claims as facts.",
      "Required classification object fields: eventId, overallConfidence, reasoningSummary, interpretationPayload, semanticSummary.",
      "Required interpretationPayload fields only: whatChanged, plainEnglishSummary, businessMeaning, futureUse, memoryCandidate, memoryType, retrievalGuidance.",
      "Required semanticSummary fields only: costRole, pageType, itemCategory, normalizedUnit, normalizedTradePackage.",
      "If a value is unknown, use an empty string for strings, false for booleans, and 0 for numbers.",
      `Events:\n${JSON.stringify(compactEvents)}`,
    ].join("\n\n");
  }

  if (directJsonMode) {
    return [
      `Classification schema version: ${classificationVersion}.`,
      `Interpretation prompt version: ${DEFAULT_INTERPRETATION_PROMPT_VERSION}.`,
      "Interpret the worksheet change as a reusable construction intelligence learning record.",
      "Separate the result into Observed, KnownImpact, Interpretation, and FutureUse.",
      "Return one JSON object only with a top-level classifications array.",
      "Return compact JSON only. No markdown. No code fences. No commentary outside JSON.",
      "The primary output is interpretationPayload. semanticSummary is short secondary scoping context.",
      "Keep every field concise and avoid repeating the same meaning in multiple places.",
      "Treat anchor, change, and pricingContext as the primary facts.",
      "changedRow.bestDescriptionText is the best available estimator-facing description for the row.",
      "relatedRowKinds and relatedRowSignals are weak context only and must not override primary facts.",
      "If captureQuality.missingCriticalContext is true or captureQuality warnings exist, lower confidence and avoid strong claims.",
      "Observed must stay factual. KnownImpact may only include direct worksheet or pricing consequences. Interpretation must stay cautious and focus on estimator behavior, not engineering or compliance rationale.",
      "Distinguish facts from assumptions and uncertainty. Never present assumptions as facts.",
      "Use words like appears, may, possible, likely, and consider when something is inferred rather than directly shown.",
      "Do not state unsupported structural adequacy, compliance, engineering intent, design intent, or commercial strategy claims as facts.",
      "Required classification object fields: eventId, overallConfidence, reasoningSummary, interpretationPayload, semanticSummary.",
      "Required interpretationPayload fields: whatChanged, plainEnglishSummary, businessMeaning, constructionMeaning, pricingMeaning, futureUse, memoryCandidate, memoryType, retrievalGuidance.",
      "Optional interpretationPayload fields only when helpful: formulaMeaning, aiCorrectionMeaning, shouldInfluenceFutureGeneration, shouldInfluenceFutureReview, changeType, oldValue, newValue, oldFormula, newFormula, unit, contextConfidence, futureUseConfidence.",
      "Required semanticSummary fields: costRole, pageType, itemCategory, normalizedUnit, normalizedTradePackage.",
      "If a value is unknown, use an empty string for strings, false for booleans, and 0 for numbers.",
      `Events:\n${JSON.stringify(compactEvents)}`,
    ].join("\n\n");
  }

  return [
    `Classification schema version: ${classificationVersion}.`,
    `Interpretation prompt version: ${DEFAULT_INTERPRETATION_PROMPT_VERSION}.`,
    "For each event return both backward-compatible semantic tags and a rich interpretation payload.",
    "Interpret the worksheet change as a reusable construction intelligence learning record.",
    "The primary task is interpretation, not tagging. interpretationPayload is required for every event.",
    "Separate the interpretation into Observed, KnownImpact, Interpretation, and FutureUse.",
    "Treat anchor, change, and pricingContext as the primary facts.",
    "changedRow.bestDescriptionText is the best available estimator-facing description for the row.",
    "relatedRowKinds and relatedRowSignals are weak context only and must not override primary facts.",
    "If captureQuality.missingCriticalContext is true or captureQuality warnings exist, lower confidence and avoid strong claims.",
    "Observed should contain only facts directly shown in the worksheet event context.",
    "KnownImpact should contain direct worksheet or pricing consequences only.",
    "Interpretation should stay cautious and focus on estimator behavior, worksheet role, and likely estimating context.",
    "FutureUse should explain how future AI may use the observed estimator behavior during worksheet generation and review.",
    "Low confidence should still include useful interpretation text when possible.",
    "Use null when the context is ambiguous or insufficient.",
    "Distinguish worksheet facts from assumptions and uncertainty.",
    "Never present assumptions as facts.",
    "Prioritize trustworthiness over creativity.",
    "Use words like appears, may, possible, likely, and consider when something is inferred rather than directly shown.",
    "Do not state unsupported structural, compliance, engineering, design, or commercial strategy claims as facts.",
    "Required interpretation content includes: whatChanged, plainEnglishSummary, businessMeaning, constructionMeaning, pricingMeaning, formulaMeaning when relevant, aiCorrectionMeaning when relevant, futureUse, memoryCandidate, retrievalGuidance, shouldInfluenceFutureGeneration, shouldInfluenceFutureReview, and confidence details.",
    "Required fields: costRole, cellRole, pageType, sectionType, itemCategory, measurementBasis, normalizedUnit, normalizedTradePackage, workCategory, systemCategory, assemblyCategory, overallConfidence, reasoningSummary, interpretationSchemaVersion, interpretationPayload.",
    `Events:\n${JSON.stringify(compactEvents)}`,
  ].join("\n\n");
}

function parsePendingWorksheetSemanticClassificationEvent(value: unknown): PendingWorksheetSemanticClassificationEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!isWorksheetSemanticClassifiableEventType(record.eventType)) {
    return null;
  }

  const eventId = toNullableString(record.eventId);
  const organizationId = toNullableString(record.organizationId);
  const occurredAt = toNullableString(record.occurredAt);
  if (!eventId || !organizationId || !occurredAt) {
    return null;
  }

  return {
    queueId: toNullableString(record.queueId),
    eventId,
    organizationId,
    projectId: toNullableString(record.projectId),
    opportunityId: toNullableString(record.opportunityId),
    eventType: record.eventType,
    occurredAt,
    classificationVersion:
      typeof record.classificationVersion === "number" && Number.isFinite(record.classificationVersion)
        ? Math.max(1, Math.floor(record.classificationVersion))
        : DEFAULT_CLASSIFICATION_VERSION,
    attemptNumber:
      typeof record.attemptNumber === "number" && Number.isFinite(record.attemptNumber)
        ? Math.max(1, Math.floor(record.attemptNumber))
        : typeof record.nextAttemptNumber === "number" && Number.isFinite(record.nextAttemptNumber)
          ? Math.max(1, Math.floor(record.nextAttemptNumber))
        : 1,
    claimToken: toNullableString(record.claimToken),
    claimExpiresAt: toNullableString(record.claimExpiresAt),
    metadata: isJsonRecord(record.metadata) ? record.metadata : {},
    diffData: isJsonRecord(record.diffData) ? record.diffData : {},
  };
}

function buildBatchKey(events: PendingWorksheetSemanticClassificationEvent[]) {
  const first = events[0];
  const workbookId = toNullableString(first?.metadata.workbookId) ?? "no-workbook";
  const sheetId = toNullableString(first?.metadata.sheetId) ?? "no-sheet";
  return `${first?.organizationId ?? "no-org"}:${workbookId}:${sheetId}:${first?.classificationVersion ?? 1}`;
}

function partitionWorksheetClassificationBatches(
  events: PendingWorksheetSemanticClassificationEvent[],
  batchSize: number,
) {
  const grouped = new Map<string, PendingWorksheetSemanticClassificationEvent[]>();

  for (const event of events) {
    const key = `${event.organizationId}:${toNullableString(event.metadata.workbookId) ?? "no-workbook"}:${toNullableString(event.metadata.sheetId) ?? "no-sheet"}`;
    const existing = grouped.get(key) ?? [];
    existing.push(event);
    grouped.set(key, existing);
  }

  const batches: PendingWorksheetSemanticClassificationEvent[][] = [];
  for (const group of grouped.values()) {
    for (let index = 0; index < group.length; index += batchSize) {
      batches.push(group.slice(index, index + batchSize));
    }
  }

  return batches;
}

function comparePendingWorksheetSemanticClassificationEvents(
  left: PendingWorksheetSemanticClassificationEvent,
  right: PendingWorksheetSemanticClassificationEvent,
) {
  const leftHasNoPriorAttempt = left.attemptNumber <= 1;
  const rightHasNoPriorAttempt = right.attemptNumber <= 1;
  if (leftHasNoPriorAttempt !== rightHasNoPriorAttempt) {
    return leftHasNoPriorAttempt ? -1 : 1;
  }

  if (leftHasNoPriorAttempt && rightHasNoPriorAttempt) {
    const occurredAtDelta = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    if (Number.isFinite(occurredAtDelta) && occurredAtDelta !== 0) {
      return occurredAtDelta;
    }

    return 0;
  }

  const attemptDelta = left.attemptNumber - right.attemptNumber;
  if (attemptDelta !== 0) {
    return attemptDelta;
  }

  const occurredAtDelta = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  if (Number.isFinite(occurredAtDelta) && occurredAtDelta !== 0) {
    return occurredAtDelta;
  }

  return 0;
}

function resolveWorksheetSemanticClassificationProvider(
  explicitProvider?: "openai" | "anthropic",
) {
  if (explicitProvider) {
    return explicitProvider;
  }

  const envProvider = process.env.WORKSHEET_EVENT_CLASSIFICATION_PROVIDER?.trim().toLowerCase();
  if (envProvider === "openai" || envProvider === "anthropic") {
    return envProvider;
  }

  const pricingWorksheetProvider = getPricingWorksheetAiProviderName();
  if (pricingWorksheetProvider === "openai" || pricingWorksheetProvider === "anthropic") {
    return pricingWorksheetProvider;
  }

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return "anthropic" as const;
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    return "openai" as const;
  }

  return pricingWorksheetProvider;
}

function resolveWorksheetSemanticClassificationModel(
  provider: "openai" | "anthropic" | undefined,
  explicitModel?: string,
) {
  if (typeof explicitModel === "string" && explicitModel.trim().length > 0) {
    return explicitModel.trim();
  }

  if (provider === "anthropic") {
    return (
      process.env.WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL?.trim() ||
      process.env.ANTHROPIC_WORKSHEET_EVENT_CLASSIFICATION_MODEL?.trim() ||
      DEFAULT_WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL
    );
  }

  return (
    process.env.WORKSHEET_EVENT_CLASSIFICATION_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_WORKSHEET_EVENT_CLASSIFICATION_MODEL?.trim() ||
    getPricingWorksheetOpenAiModel()
  );
}

function shouldSplitTimedOutClassificationBatch(error: unknown, batchSize: number) {
  return (
    batchSize > 1 &&
    isPricingWorksheetProviderError(error) &&
    error.code === "provider_timeout" &&
    error.retryable === true
  );
}

function incrementResultRetryCounts(results: WorksheetSemanticClassificationResult[], increment = 1) {
  return results.map((result) => ({
    ...result,
    retryCount: Math.max(0, (result.retryCount ?? 0) + increment),
  }));
}

function shouldSplitTruncatedClassificationBatch(error: unknown, batchSize: number) {
  return (
    batchSize > 1 &&
    isPricingWorksheetProviderError(error) &&
    error.provider === "anthropic" &&
    error.code === "provider_schema_parse_failed" &&
    error.retryable === true &&
    Boolean(
      error.rawError
      && typeof error.rawError === "object"
      && !Array.isArray(error.rawError)
      && (error.rawError as Record<string, unknown>).parseFailureReason === "truncated_json",
    )
  );
}

function isRetryableTruncatedClassificationError(error: unknown) {
  return (
    isPricingWorksheetProviderError(error) &&
    error.provider === "anthropic" &&
    error.code === "provider_schema_parse_failed" &&
    error.retryable === true &&
    Boolean(
      error.rawError
      && typeof error.rawError === "object"
      && !Array.isArray(error.rawError)
      && (error.rawError as Record<string, unknown>).parseFailureReason === "truncated_json",
    )
  );
}

async function classifyWorksheetSemanticBatchWithFallback(params: {
  events: PendingWorksheetSemanticClassificationEvent[];
  provider?: "openai" | "anthropic";
  model?: string;
  classificationVersion?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  promptMode?: WorksheetInterpretationPromptMode;
}): Promise<WorksheetSemanticBatchProviderMeta & {
  results: WorksheetSemanticClassificationResult[];
}> {
  try {
    return await classifyWorksheetSemanticBatch(params);
  } catch (error) {
    const isTruncatedAnthropicInterpretation =
      params.events.length === 1 &&
      params.promptMode !== "compact_retry" &&
      isRetryableTruncatedClassificationError(error);

    if (isTruncatedAnthropicInterpretation) {
      const retried = await classifyWorksheetSemanticBatch({
        ...params,
        promptMode: "compact_retry",
        maxOutputTokens: Math.min(Math.max(params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS, 1400), 1600),
      });
      return {
        ...retried,
        results: incrementResultRetryCounts(retried.results, 1),
      };
    }

    if (shouldSplitTruncatedClassificationBatch(error, params.events.length)) {
      const results: WorksheetSemanticClassificationResult[] = [];
      let resolvedProvider: string | null = null;
      let resolvedModel: string | null = null;

      for (const event of params.events) {
        const single = await classifyWorksheetSemanticBatchWithFallback({
          ...params,
          events: [event],
        });
        resolvedProvider = resolvedProvider ?? single.provider;
        resolvedModel = resolvedModel ?? single.model;
        results.push(...single.results);
      }

      return {
        provider: resolvedProvider ?? params.provider ?? null,
        model: resolvedModel ?? params.model ?? null,
        results,
      };
    }

    if (!shouldSplitTimedOutClassificationBatch(error, params.events.length)) {
      throw error;
    }

    const midpoint = Math.ceil(params.events.length / 2);
    const left = await classifyWorksheetSemanticBatchWithFallback({
      ...params,
      events: params.events.slice(0, midpoint),
    });
    const right = await classifyWorksheetSemanticBatchWithFallback({
      ...params,
      events: params.events.slice(midpoint),
    });

    return {
      provider: left.provider ?? right.provider,
      model: left.model ?? right.model,
      results: [...left.results, ...right.results],
    };
  }
}

function buildClassificationContextSources(event: PendingWorksheetSemanticClassificationEvent, aiContext?: WorksheetSemanticAiInteractionContext | null) {
  return {
    rawWorksheetEvent: true,
    workbookPageContext: true,
    aiProvenance: event.diffData.generatedByAi === true || toNullableString(event.diffData.aiInteractionId) !== null,
    aiInteractionContext: aiContext ? true : false,
    constructionIntent: Boolean(aiContext && Object.keys(aiContext.constructionIntent).length > 0),
    organizationGuidanceSummary: aiContext?.organizationGuidanceSummary ? true : false,
  } satisfies Record<string, Json | null>;
}

function logWorksheetClassificationEvent(params: {
  event: PendingWorksheetSemanticClassificationEvent;
  classificationStatus: "classified" | "low_confidence" | "failed";
  provider: string | null;
  model: string | null;
  durationMs: number;
  retryCount: number;
  errorCode?: string | null;
}) {
  console.info("[worksheet-event-classification] Event processed", {
    eventId: params.event.eventId,
    organizationId: params.event.organizationId,
    eventType: params.event.eventType,
    provider: params.provider,
    model: params.model,
    classificationStatus: params.classificationStatus,
    durationMs: params.durationMs,
    retryCount: params.retryCount,
    errorCode: params.errorCode ?? null,
  });
}

function buildConstructionIntelligenceInputs(event: PendingWorksheetSemanticClassificationEvent, aiContext?: WorksheetSemanticAiInteractionContext | null) {
  return {
    workbookId: toNullableString(event.metadata.workbookId) ?? aiContext?.workbookId ?? null,
    sheetId: toNullableString(event.metadata.sheetId) ?? aiContext?.sheetId ?? null,
    sheetName: toNullableString(event.metadata.sheetName) ?? aiContext?.sheetName ?? null,
    worksheetName: toNullableString(event.metadata.worksheetName) ?? aiContext?.worksheetName ?? null,
    tradePackage: toNullableString(event.metadata.tradePackage) ?? aiContext?.tradePackage ?? null,
    constructionIntent: aiContext?.constructionIntent ?? {},
    organizationGuidanceSummary: aiContext?.organizationGuidanceSummary ?? null,
  } satisfies Record<string, Json | null>;
}

function extractSafeProviderDiagnostics(error: unknown) {
  if (!isPricingWorksheetProviderError(error) || !error.rawError || typeof error.rawError !== "object" || Array.isArray(error.rawError)) {
    return null;
  }

  const rawError = error.rawError as Record<string, unknown>;
  const requestSummary =
    rawError.requestSummary && typeof rawError.requestSummary === "object" && !Array.isArray(rawError.requestSummary)
      ? (rawError.requestSummary as Record<string, unknown>)
      : null;

  const originalError =
    rawError.originalError && typeof rawError.originalError === "object" && !Array.isArray(rawError.originalError)
      ? (rawError.originalError as Record<string, unknown>)
      : null;

  return {
    provider: error.provider,
    model: error.model,
    status: typeof rawError.status === "number" ? rawError.status : error.status ?? null,
    statusText: toNullableString(rawError.statusText),
    responseBodySnippet: truncateString(toNullableString(rawError.responseBodySnippet), 1200),
    errorType: toNullableString(rawError.errorType),
    stopReason: toNullableString(rawError.stopReason),
    outputTextLength: typeof rawError.outputTextLength === "number" ? rawError.outputTextLength : null,
    parseErrorType: toNullableString(rawError.parseErrorType),
    providerErrorMessage: truncateString(
      toNullableString(rawError.errorMessage) ?? toNullableString(originalError?.message) ?? error.message,
      600,
    ),
    requestSummary: requestSummary
      ? {
          workflowStage: toNullableString(requestSummary.workflowStage),
          schemaKind: toNullableString(requestSummary.schemaKind),
          schemaSizeBytes: typeof requestSummary.schemaSizeBytes === "number" ? requestSummary.schemaSizeBytes : null,
          unsupportedKeywordCount:
            typeof requestSummary.unsupportedKeywordCount === "number" ? requestSummary.unsupportedKeywordCount : null,
          optionalParameterCount:
            typeof requestSummary.optionalParameterCount === "number" ? requestSummary.optionalParameterCount : null,
          hasWorksheetEventInterpretationSchema:
            typeof requestSummary.hasWorksheetEventInterpretationSchema === "boolean"
              ? requestSummary.hasWorksheetEventInterpretationSchema
              : null,
          hasTools: typeof requestSummary.hasTools === "boolean" ? requestSummary.hasTools : null,
          hasToolChoice: typeof requestSummary.hasToolChoice === "boolean" ? requestSummary.hasToolChoice : null,
          hasOutputConfig: typeof requestSummary.hasOutputConfig === "boolean" ? requestSummary.hasOutputConfig : null,
          outputConfigFormatType: toNullableString(requestSummary.outputConfigFormatType),
          maxTokens: typeof requestSummary.maxTokens === "number" ? requestSummary.maxTokens : null,
          anthropicVersion: toNullableString(requestSummary.anthropicVersion),
          hasAnthropicBetaHeader:
            typeof requestSummary.hasAnthropicBetaHeader === "boolean" ? requestSummary.hasAnthropicBetaHeader : null,
        }
      : null,
  } satisfies Record<string, Json | null>;
}

function buildWorksheetSemanticClassificationFailureRecord(params: {
  event: PendingWorksheetSemanticClassificationEvent;
  provider: string | null;
  model: string | null;
  errorCode: string;
  errorMessage: string;
  now: string;
  batchKey: string;
  aiContext?: WorksheetSemanticAiInteractionContext | null;
  providerDiagnostics?: Record<string, Json | null> | null;
}) {
  const { event } = params;

  return {
    sourceEventId: event.eventId,
    organizationId: event.organizationId,
    classificationVersion: event.classificationVersion,
    attemptNumber: event.attemptNumber,
    classificationStatus: "failed",
    classificationSource: "llm",
    classificationProvider: params.provider,
    classificationModel: params.model,
    classificationModelVersion: String(event.classificationVersion),
    overallConfidence: null,
    reasoningSummary: null,
    semanticFields: {},
    interpretationSchemaVersion: DEFAULT_INTERPRETATION_SCHEMA_VERSION,
    interpretationPayload: {},
    interpretationPromptVersion: DEFAULT_INTERPRETATION_PROMPT_VERSION,
    contextSources: buildClassificationContextSources(event, params.aiContext ?? null),
    constructionIntelligenceInputs: buildConstructionIntelligenceInputs(event, params.aiContext ?? null),
    futureUseSummary: {},
    confidenceDetail: {},
    requestContext: {
      rawContextVersion: typeof event.diffData.rawContextVersion === "number" ? event.diffData.rawContextVersion : 1,
      eventCaptureVersion: typeof event.diffData.eventCaptureVersion === "number" ? event.diffData.eventCaptureVersion : 1,
      eventType: event.eventType,
      providerDiagnostics: params.providerDiagnostics ?? null,
    },
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
    retryAfter: buildRetryAfter(event.attemptNumber, params.now),
    batchKey: params.batchKey,
    classifiedAt: params.now,
    claimToken: event.claimToken,
  } satisfies WorksheetSemanticClassificationRecordInput;
}

export async function listPendingWorksheetSemanticClassificationBatch(params?: {
  limit?: number;
  classificationVersion?: number;
  organizationId?: string | null;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("list_pending_worksheet_event_classification_batch", {
    p_limit: Math.max(params?.limit ?? DEFAULT_BATCH_LIMIT, 1),
    p_classification_version: Math.max(params?.classificationVersion ?? DEFAULT_CLASSIFICATION_VERSION, 1),
    p_organization_id: params?.organizationId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data)) {
    return [] as PendingWorksheetSemanticClassificationEvent[];
  }

  return data
    .map(parsePendingWorksheetSemanticClassificationEvent)
    .filter((event): event is PendingWorksheetSemanticClassificationEvent => event !== null)
    .sort(comparePendingWorksheetSemanticClassificationEvents);
}

export async function claimWorksheetSemanticClassificationBatch(params?: {
  limit?: number;
  classificationVersion?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_worksheet_event_classification_batch", {
    p_limit: Math.max(params?.limit ?? DEFAULT_BATCH_LIMIT, 1),
    p_classification_version: Math.max(params?.classificationVersion ?? DEFAULT_CLASSIFICATION_VERSION, 1),
    p_organization_id: params?.organizationId ?? null,
    p_worker_id: params?.workerId ?? DEFAULT_CLASSIFICATION_WORKER_ID,
    p_lease_seconds: Math.max(params?.leaseSeconds ?? DEFAULT_CLAIM_LEASE_SECONDS, 30),
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data)) {
    return [] as PendingWorksheetSemanticClassificationEvent[];
  }

  return data
    .map(parsePendingWorksheetSemanticClassificationEvent)
    .filter((event): event is PendingWorksheetSemanticClassificationEvent => event !== null)
    .sort(comparePendingWorksheetSemanticClassificationEvents);
}

export async function finalizeWorksheetSemanticClassificationClaims(
  records: WorksheetSemanticClassificationRecordInput[],
) {
  if (records.length === 0) {
    return {
      count: 0,
      ids: [],
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("finalize_worksheet_event_classification_claims", {
    p_inputs: records,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    count: isJsonRecord(data) && typeof data.count === "number" ? data.count : records.length,
    ids: isJsonRecord(data) && Array.isArray(data.ids) ? data.ids : [],
    completedCount: isJsonRecord(data) && typeof data.completedCount === "number" ? data.completedCount : 0,
    retriedCount: isJsonRecord(data) && typeof data.retriedCount === "number" ? data.retriedCount : 0,
    deadLetteredCount: isJsonRecord(data) && typeof data.deadLetteredCount === "number" ? data.deadLetteredCount : 0,
  };
}

export async function classifyWorksheetSemanticBatch(params: {
  events: PendingWorksheetSemanticClassificationEvent[];
  provider?: "openai" | "anthropic";
  model?: string;
  classificationVersion?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  promptMode?: WorksheetInterpretationPromptMode;
}) {
  if (params.events.length === 0) {
    return {
      provider: params.provider ?? null,
      model: params.model ?? null,
      results: [] as WorksheetSemanticClassificationResult[],
    };
  }

  const providerName = resolveWorksheetSemanticClassificationProvider(params.provider);
  const resolvedModel = resolveWorksheetSemanticClassificationModel(providerName, params.model);
  const provider = getPricingWorksheetAiProvider(providerName);
  const aiContextMap = await buildWorksheetSemanticClassificationContextMap(params.events);
  const response = await provider.generateEditPlan({
    systemPrompt: buildWorksheetSemanticClassificationSystemPrompt(),
    userPrompt: buildWorksheetSemanticClassificationUserPrompt(
      params.events,
      Math.max(params.classificationVersion ?? DEFAULT_CLASSIFICATION_VERSION, 1),
      aiContextMap,
      {
        directJsonMode: providerName === "anthropic",
        promptMode: params.promptMode,
      },
    ),
    schema: buildWorksheetEventClassificationSchema(),
    model: resolvedModel,
    timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputTokens: params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    enableWebSearch: false,
    metadata: {
      workflow: "worksheet_event_semantic_classification",
      workflowStage: "worksheet_event_interpretation",
      eventCount: params.events.length,
    },
  });

  const payload = response.parsedJson as WorksheetSemanticClassificationProviderBatchResponse | null;
  const rawClassifications = Array.isArray(payload?.classifications) ? payload.classifications : [];
  const classificationsByEventId = new Map<string, WorksheetSemanticClassificationResult>();

  for (const rawEntry of rawClassifications) {
    const eventId = toNullableString((rawEntry as Record<string, unknown>)?.eventId);
    if (!eventId) {
      continue;
    }
    classificationsByEventId.set(
      eventId,
      normalizeWorksheetSemanticClassificationResult(eventId, rawEntry),
    );
  }

  return {
    provider: response.provider,
    model: response.model,
    results: params.events.map((event) =>
      classificationsByEventId.get(event.eventId) ??
      normalizeWorksheetSemanticClassificationResult(event.eventId, {
        overallConfidence: null,
        reasoningSummary: "Provider did not return a classification for this event.",
      }),
    ),
  } satisfies WorksheetSemanticBatchProviderMeta & {
    results: WorksheetSemanticClassificationResult[];
  };
}

export async function runPendingWorksheetSemanticClassification(
  params: RunWorksheetSemanticClassificationInput = {},
) {
  const startedAt = Date.now();
  const requestedLimit = Math.max(params?.limit ?? DEFAULT_BATCH_LIMIT, 1);
  const effectiveLimit = Math.min(requestedLimit, 100);
  const pendingEvents = await claimWorksheetSemanticClassificationBatch({
    limit: effectiveLimit,
    classificationVersion: params?.classificationVersion,
    organizationId: params?.organizationId ?? null,
    workerId: DEFAULT_CLASSIFICATION_WORKER_ID,
    leaseSeconds: DEFAULT_CLAIM_LEASE_SECONDS,
  });

  if (pendingEvents.length === 0) {
    return {
      selectedEventCount: 0,
      processedBatchCount: 0,
      persistedClassificationCount: 0,
      classifiedCount: 0,
      lowConfidenceCount: 0,
      failedCount: 0,
      skippedCount: 0,
      provider: params?.provider ?? null,
      model: params?.model ?? null,
      durationMs: Date.now() - startedAt,
    } satisfies RunWorksheetSemanticClassificationResult;
  }

  const now = params?.now ?? new Date().toISOString();
  const groupSize = Math.max(params?.groupSize ?? DEFAULT_GROUP_SIZE, 1);
  const batches = partitionWorksheetClassificationBatches(pendingEvents, groupSize);
  const records: WorksheetSemanticClassificationRecordInput[] = [];
  let resolvedProvider: string | null = params?.provider ?? null;
  let resolvedModel: string | null = params?.model ?? null;
  const aiContextMap = await buildWorksheetSemanticClassificationContextMap(pendingEvents);

  for (const batch of batches) {
    const batchKey = buildBatchKey(batch);
    const batchStartedAt = Date.now();

    try {
      const classificationBatch = await classifyWorksheetSemanticBatchWithFallback({
        events: batch,
        provider: params?.provider,
        model: params?.model,
        classificationVersion: params?.classificationVersion,
        timeoutMs: params?.timeoutMs,
        maxOutputTokens: params?.maxOutputTokens,
      });
      resolvedProvider = classificationBatch.provider;
      resolvedModel = classificationBatch.model;
      const batchDurationMs = Date.now() - batchStartedAt;
      const perEventDurationMs = Math.max(1, Math.round(batchDurationMs / Math.max(batch.length, 1)));

      for (const event of batch) {
        const result = classificationBatch.results.find((entry) => entry.eventId === event.eventId);
        if (!result) {
          records.push({
            sourceEventId: event.eventId,
            organizationId: event.organizationId,
            classificationVersion: event.classificationVersion,
            attemptNumber: event.attemptNumber,
            classificationStatus: "failed",
            classificationSource: "llm",
            classificationProvider: classificationBatch.provider,
            classificationModel: classificationBatch.model,
            classificationModelVersion: String(event.classificationVersion),
          overallConfidence: null,
            reasoningSummary: "No classification result returned for event.",
            semanticFields: {},
            interpretationSchemaVersion: DEFAULT_INTERPRETATION_SCHEMA_VERSION,
            interpretationPayload: {},
            interpretationPromptVersion: DEFAULT_INTERPRETATION_PROMPT_VERSION,
            contextSources: buildClassificationContextSources(
              event,
              aiContextMap.get(toNullableString(event.diffData.aiInteractionId) ?? "") ?? null,
            ),
            constructionIntelligenceInputs: buildConstructionIntelligenceInputs(
              event,
              aiContextMap.get(toNullableString(event.diffData.aiInteractionId) ?? "") ?? null,
            ),
            futureUseSummary: {},
            confidenceDetail: {},
            requestContext: {
              rawContextVersion: typeof event.diffData.rawContextVersion === "number" ? event.diffData.rawContextVersion : 1,
              eventCaptureVersion: typeof event.diffData.eventCaptureVersion === "number" ? event.diffData.eventCaptureVersion : 1,
              eventType: event.eventType,
            },
            errorCode: "missing_classification_result",
            errorMessage: "Provider did not return a classification result for the event.",
            retryAfter: buildRetryAfter(event.attemptNumber, now),
            batchKey,
            classifiedAt: now,
            claimToken: event.claimToken,
          });
          logWorksheetClassificationEvent({
            event,
            classificationStatus: "failed",
            provider: classificationBatch.provider,
            model: classificationBatch.model,
            durationMs: perEventDurationMs,
            retryCount: 0,
            errorCode: "missing_classification_result",
          });
          continue;
        }

        if (!isValidInterpretationPayload(result.interpretationPayload)) {
          records.push({
            sourceEventId: event.eventId,
            organizationId: event.organizationId,
            classificationVersion: event.classificationVersion,
            attemptNumber: event.attemptNumber,
            classificationStatus: "failed",
            classificationSource: "llm",
            classificationProvider: classificationBatch.provider,
            classificationModel: classificationBatch.model,
            classificationModelVersion: String(event.classificationVersion),
            overallConfidence: result.overallConfidence,
            reasoningSummary: result.reasoningSummary,
            semanticFields: Object.fromEntries(
              FIELD_NAMES.map((field) => [field, result[field] as unknown as Json]),
            ) as Record<string, Json | null>,
            interpretationSchemaVersion: result.interpretationSchemaVersion,
            interpretationPayload: {},
            interpretationPromptVersion: DEFAULT_INTERPRETATION_PROMPT_VERSION,
            contextSources: buildClassificationContextSources(
              event,
              aiContextMap.get(toNullableString(event.diffData.aiInteractionId) ?? "") ?? null,
            ),
            constructionIntelligenceInputs: buildConstructionIntelligenceInputs(
              event,
              aiContextMap.get(toNullableString(event.diffData.aiInteractionId) ?? "") ?? null,
            ),
            futureUseSummary: {},
            confidenceDetail: {},
            requestContext: {
              rawContextVersion: typeof event.diffData.rawContextVersion === "number" ? event.diffData.rawContextVersion : 1,
              eventCaptureVersion: typeof event.diffData.eventCaptureVersion === "number" ? event.diffData.eventCaptureVersion : 1,
              eventType: event.eventType,
              workbookId: event.metadata.workbookId ?? null,
              sheetId: event.metadata.sheetId ?? null,
              sheetName: event.metadata.sheetName ?? null,
            },
            errorCode: "invalid_interpretation_payload",
            errorMessage: "Provider returned a classification without the required interpretation payload structure.",
            retryAfter: buildRetryAfter(event.attemptNumber, now),
            batchKey,
            classifiedAt: now,
            claimToken: event.claimToken,
          });
          logWorksheetClassificationEvent({
            event,
            classificationStatus: "failed",
            provider: classificationBatch.provider,
            model: classificationBatch.model,
            durationMs: perEventDurationMs,
            retryCount: result.retryCount ?? 0,
            errorCode: "invalid_interpretation_payload",
          });
          continue;
        }

        const classificationStatus =
          result.overallConfidence !== null && result.overallConfidence >= LOW_CONFIDENCE_THRESHOLD
            ? "classified"
            : "low_confidence";

        records.push({
          sourceEventId: event.eventId,
          organizationId: event.organizationId,
          classificationVersion: event.classificationVersion,
          attemptNumber: event.attemptNumber,
          classificationStatus,
          classificationSource: "llm",
          classificationProvider: classificationBatch.provider,
          classificationModel: classificationBatch.model,
          classificationModelVersion: String(event.classificationVersion),
          overallConfidence: result.overallConfidence,
          reasoningSummary: result.reasoningSummary,
          semanticFields: Object.fromEntries(
            FIELD_NAMES.map((field) => [field, result[field] as unknown as Json]),
          ) as Record<string, Json | null>,
          interpretationSchemaVersion: result.interpretationSchemaVersion,
          interpretationPayload: result.interpretationPayload,
          interpretationPromptVersion: DEFAULT_INTERPRETATION_PROMPT_VERSION,
          contextSources: buildClassificationContextSources(
            event,
            aiContextMap.get(toNullableString(event.diffData.aiInteractionId) ?? "") ?? null,
          ),
          constructionIntelligenceInputs: buildConstructionIntelligenceInputs(
            event,
            aiContextMap.get(toNullableString(event.diffData.aiInteractionId) ?? "") ?? null,
          ),
          futureUseSummary: getFutureUseSummary(result.interpretationPayload),
          confidenceDetail: getConfidenceDetail(result.interpretationPayload, result.overallConfidence),
          requestContext: {
            rawContextVersion: typeof event.diffData.rawContextVersion === "number" ? event.diffData.rawContextVersion : 1,
            eventCaptureVersion: typeof event.diffData.eventCaptureVersion === "number" ? event.diffData.eventCaptureVersion : 1,
            eventType: event.eventType,
            workbookId: event.metadata.workbookId ?? null,
            sheetId: event.metadata.sheetId ?? null,
            sheetName: event.metadata.sheetName ?? null,
          },
          batchKey,
          classifiedAt: now,
          claimToken: event.claimToken,
        });
        logWorksheetClassificationEvent({
          event,
          classificationStatus,
          provider: classificationBatch.provider,
          model: classificationBatch.model,
          durationMs: perEventDurationMs,
          retryCount: result.retryCount ?? 0,
        });
      }
    } catch (error) {
      const provider = isPricingWorksheetProviderError(error) ? error.provider : params?.provider ?? null;
      const model = isPricingWorksheetProviderError(error) ? error.model : params?.model ?? null;
      const errorCode = isPricingWorksheetProviderError(error) ? error.code : "provider_unknown_error";
      const errorMessage = error instanceof Error ? error.message : "Worksheet semantic classification failed.";
      const providerDiagnostics = extractSafeProviderDiagnostics(error);
      const batchDurationMs = Date.now() - batchStartedAt;
      const perEventDurationMs = Math.max(1, Math.round(batchDurationMs / Math.max(batch.length, 1)));

      for (const event of batch) {
        records.push(
          buildWorksheetSemanticClassificationFailureRecord({
            event,
            provider,
            model,
            errorCode,
            errorMessage,
            now,
            batchKey,
            aiContext: aiContextMap.get(toNullableString(event.diffData.aiInteractionId) ?? "") ?? null,
            providerDiagnostics,
          }),
        );
        logWorksheetClassificationEvent({
          event,
          classificationStatus: "failed",
          provider,
          model,
          durationMs: perEventDurationMs,
          retryCount: 0,
          errorCode,
        });
      }
    }
  }

  const persisted = await finalizeWorksheetSemanticClassificationClaims(records);

  return {
    selectedEventCount: pendingEvents.length,
    processedBatchCount: batches.length,
    persistedClassificationCount: persisted.count,
    classifiedCount: records.filter((record) => record.classificationStatus === "classified").length,
    lowConfidenceCount: records.filter((record) => record.classificationStatus === "low_confidence").length,
    failedCount: records.filter((record) => record.classificationStatus === "failed").length,
    skippedCount: Math.max(requestedLimit - effectiveLimit, 0),
    provider: resolvedProvider,
    model: resolvedModel,
    durationMs: Date.now() - startedAt,
  } satisfies RunWorksheetSemanticClassificationResult;
}

export async function runWorksheetEventSemanticClassificationRunner(
  params: RunWorksheetSemanticClassificationInput = {},
) {
  return runPendingWorksheetSemanticClassification(params);
}
