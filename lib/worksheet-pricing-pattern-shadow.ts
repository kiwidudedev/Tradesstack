import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPricingWorksheetAiProvider, getPricingWorksheetAnthropicModel } from "@/lib/ai/providers/pricing-worksheet/registry";
import type { PricingWorksheetProviderResponse } from "@/lib/ai/providers/pricing-worksheet/types";
import {
  listClassifiedWorksheetMemoryEvents,
  type ClassifiedWorksheetMemoryEvent,
} from "@/lib/worksheet-memory-derivation";
import type { Json } from "@/lib/supabase/types";

export type WorksheetPricingPatternFamily =
  | "pricing_preference"
  | "rate_adjustment_pattern"
  | "allowance_pattern"
  | "labour_productivity_pattern"
  | "formula_pattern"
  | "component_completeness_pattern"
  | "review_correction_pattern"
  | "worksheet_structure_pattern"
  | "estimator_behavior_pattern"
  | "no_pattern";

export type WorksheetPricingPatternStrength = "weak" | "reinforced" | "durable";

export type WorksheetPricingPatternShadowRejectionReason =
  | "confidence_below_threshold"
  | "contradiction_level_too_high"
  | "duplicate_evidence_ids"
  | "evidence_count_below_threshold"
  | "evidence_ids_missing"
  | "evidence_org_mismatch"
  | "invalid_no_pattern_payload"
  | "invalid_pattern_family"
  | "proposal_payload_invalid"
  | "scope_incoherent"
  | "support_diversity_below_threshold"
  | "supporting_and_contradictory_overlap";

export type WorksheetPricingPatternShadowGateStatus = "accepted" | "rejected" | "no_pattern";

export type WorksheetPricingPatternProposal = {
  proposalId: string;
  batchId: string;
  organizationId: string;
  gateStatus: WorksheetPricingPatternShadowGateStatus;
  proposalKind: "pattern" | "no_pattern";
  patternFamily: WorksheetPricingPatternFamily | null;
  patternType: string | null;
  title: string | null;
  summary: string | null;
  retrievalGuidance: string | null;
  confidence: number | null;
  proposedStrength: WorksheetPricingPatternStrength | null;
  scope: Record<string, Json | null>;
  patternValue: Record<string, Json | null>;
  supportingEvidenceEventIds: string[];
  contradictoryEvidenceEventIds: string[];
  ignoredEvidenceEventIds: string[];
  evidenceSummary: Record<string, Json | null>;
  contradictionSummary: Record<string, Json | null>;
  validation: Record<string, Json | null>;
  rejectionReasons: WorksheetPricingPatternShadowRejectionReason[];
};

export type WorksheetPricingPatternShadowSummary = {
  runId?: string;
  fetchedCount: number;
  poolsBuilt: number;
  eligiblePoolCount: number;
  skippedPoolCount: number;
  skippedPoolReasons: Record<string, number>;
  proposalsReturned: number;
  acceptedByGate: number;
  rejectedByGate: number;
  noPatternCount: number;
  familyDistribution: Record<string, number>;
  strengthDistribution: Record<string, number>;
  rejectionReasons: Record<string, number>;
  provider: "anthropic";
  model: string;
  durationMs: number;
  proposals: WorksheetPricingPatternProposal[];
  processedEventCount?: number;
  failedEventCount?: number;
  candidateCreatedCount?: number;
  candidateUpdatedCount?: number;
};

export type PatternPoolDiversity = {
  evidenceCount: number;
  worksheetCount: number;
  workbookCount: number;
  projectCount: number;
  sessionCount: number | null;
  estimatorCount: number | null;
  dateSpanDays: number;
};

export type PatternPoolEligibility = {
  eligible: boolean;
  reason:
    | "eligible"
    | "insufficient_evidence_count"
    | "single_worksheet_behavior"
    | "single_session_behavior"
    | "insufficient_cross_context_diversity";
  strengthCeiling: "none" | "weak" | "reinforced" | "durable";
};

export type PatternSupportEligibility = {
  eligible: boolean;
  reason:
    | "eligible"
    | "evidence_count_below_threshold"
    | "single_worksheet_behavior"
    | "single_session_behavior"
    | "insufficient_cross_context_diversity";
  strengthCeiling: "none" | "weak" | "reinforced" | "durable";
};

export type RunWorksheetPricingPatternProposalsShadowModeInput = {
  events: ClassifiedWorksheetMemoryEvent[];
  batchSize?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  minimumEvidenceCount?: number;
  minimumConfidence?: number;
  maximumContradictionRatio?: number;
};

export type RunWorksheetPricingPatternShadowDerivationInput = {
  organizationId?: string | null;
  limit?: number;
  batchSize?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  minimumEvidenceCount?: number;
  minimumConfidence?: number;
  maximumContradictionRatio?: number;
};

export type RunWorksheetPricingPatternShadowIncrementalInput = RunWorksheetPricingPatternShadowDerivationInput;

type WorksheetPricingPatternEvidenceProcessingRow = {
  id: string;
  organizationId: string;
  sourceEventId: string;
  classificationRecordId: string | null;
  classificationVersion: number;
  classificationAttemptNumber: number;
  processingStatus: "pending" | "claimed" | "processed" | "retry_scheduled" | "dead_lettered";
  processingRunId: string | null;
  attemptCount: number;
  maxAttempts: number;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  claimedBy: string | null;
  claimToken: string | null;
  processedAt: string | null;
  failedAt: string | null;
  retryAfter: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type WorksheetPricingPatternShadowCandidate = {
  id: string;
  organizationId: string;
  candidateStatus: "active" | "contested" | "stale" | "retired";
  patternFamily: WorksheetPricingPatternFamily | null;
  patternType: string | null;
  currentStrength: WorksheetPricingPatternStrength | null;
  confidence: number | null;
  title: string | null;
  summary: string | null;
  retrievalGuidance: string | null;
  scope: Record<string, Json | null>;
  patternValue: Record<string, Json | null>;
  supportCount: number;
  contradictionCount: number;
  ignoredCount: number;
  supportDiversity: Record<string, Json | null>;
  contradictionDiversity: Record<string, Json | null> | null;
  lastReinforcedAt: string | null;
  lastContradictedAt: string | null;
  staleAfter: string | null;
  createdByRunId: string | null;
  lastUpdatedByRunId: string | null;
  scopeSignature: string | null;
  patternValueSignature: string | null;
  candidateSignature: string | null;
  signatureUniquenessEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type WorksheetPricingPatternShadowCandidateEvidenceLink = {
  id: string;
  candidateId: string;
  sourceEventId: string;
  evidenceRole: "supporting" | "contradictory" | "ignored";
  linkedByRunId: string | null;
  createdAt: string | null;
};

type DiversitySnapshot = PatternPoolDiversity & {
  worksheetKeys: string[];
  workbookIds: string[];
  projectIds: string[];
  sessionIds: string[];
  estimatorIds: string[];
  occurredAtMin: string | null;
  occurredAtMax: string | null;
};

type CompactWorksheetPricingPatternEvent = {
  eventId: string;
  eventType: string;
  context: {
    tradePackage: string | null;
    worksheetName: string | null;
    pageType: string | null;
    sectionType: string | null;
    itemCategory: string | null;
    normalizedUnit: string | null;
    costRole: string | null;
  };
  anchor: {
    itemLabel: string | null;
    rowLabel: string | null;
    columnHeader: string | null;
    unit: string | null;
  };
  change: {
    summary: string | null;
    oldValue: Json | null;
    newValue: Json | null;
    formulaChanged: boolean;
    oldFormulaSnippet: string | null;
    newFormulaSnippet: string | null;
  };
  patternSignals: {
    meaning: string | null;
    memoryType: string | null;
  };
  quality: {
    overallConfidence: number | null;
    captureCompletenessScore: number | null;
    missingCriticalContext: boolean | null;
  };
};

type LegacyCompactWorksheetPricingPatternEvent = {
  eventId: string;
  organizationId: string;
  eventType: string;
  occurredAt: string;
  worksheet: {
    workbookId: string | null;
    sheetId: string | null;
    sheetName: string | null;
    worksheetName: string | null;
    tradePackage: string | null;
  };
  scope: {
    pageType: string | null;
    sectionType: string | null;
    itemCategory: string | null;
    normalizedUnit: string | null;
    normalizedTradePackage: string | null;
    costRole: string | null;
  };
  worksheetDiff: {
    rowLabel: string | null;
    itemLabel: string | null;
    columnHeader: string | null;
    unit: string | null;
    oldValue: Json | null;
    newValue: Json | null;
    oldFormula: string | null;
    newFormula: string | null;
  };
  interpretation: Record<string, Json | null>;
  futureUseSummary: Record<string, Json | null>;
  confidenceDetail: Record<string, Json | null>;
  captureQuality: {
    captureCompletenessScore: number | null;
    rowSnapshotCompleteness: number | null;
    missingCriticalContext: boolean | null;
  };
};

type WorksheetPricingPatternProposalBatch = {
  batchId: string;
  organizationId: string;
  events: ClassifiedWorksheetMemoryEvent[];
};

type RawWorksheetPricingPatternProposal = {
  proposalKind: "pattern" | "no_pattern";
  patternFamily: WorksheetPricingPatternFamily | null;
  patternType: string | null;
  title: string | null;
  summary: string | null;
  retrievalGuidance: string | null;
  confidence: number | null;
  scope: Record<string, Json | null>;
  patternValueSummary: string | null;
  patternSignals: string[];
  supportingEvidenceEventIds: string[];
  contradictoryEvidenceEventIds: string[];
  contradictionReason: string | null;
  dominantAlternativePatternType: string | null;
};

const DEFAULT_LIMIT = 500;
const DEFAULT_BATCH_SIZE = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
const DEFAULT_MINIMUM_EVIDENCE_COUNT = 2;
const MINIMUM_POOL_EVIDENCE_COUNT = 2;
const DEFAULT_MINIMUM_CONFIDENCE = 0.55;
const DEFAULT_MAXIMUM_CONTRADICTION_RATIO = 0.5;
const SUPPORT_MINIMUM_EVIDENCE_COUNT = 2;
const DEFAULT_PROCESSING_LEASE_SECONDS = 10 * 60;
const DEFAULT_PROCESSING_MAX_ATTEMPTS = 5;
const DURABLE_CONFIDENCE = 0.78;
const REINFORCED_CONFIDENCE = 0.68;
const ALLOWED_PATTERN_FAMILIES: WorksheetPricingPatternFamily[] = [
  "pricing_preference",
  "rate_adjustment_pattern",
  "allowance_pattern",
  "labour_productivity_pattern",
  "formula_pattern",
  "component_completeness_pattern",
  "review_correction_pattern",
  "worksheet_structure_pattern",
  "estimator_behavior_pattern",
];

function isJsonRecord(value: unknown): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, Number(value)));
}

function getProcessingRetryDelayMs(attemptCount: number) {
  const safeAttempt = Math.max(attemptCount, 1);
  const minutes = Math.min(5 * (2 ** (safeAttempt - 1)), 24 * 60);
  return minutes * 60 * 1000;
}

function buildProcessingRetryAfter(attemptCount: number, nowIso: string) {
  return new Date(Date.parse(nowIso) + getProcessingRetryDelayMs(attemptCount)).toISOString();
}

function compactJsonValue(value: Json | undefined): Json | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((entry) => compactJsonValue(entry as Json | undefined)) as Json;
  }

  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).slice(0, 12).map(([key, entry]) => [key, compactJsonValue(entry)]),
    ) as Json;
  }

  return null;
}

function compactJsonRecord(value: unknown, maxKeys = 16) {
  if (!isJsonRecord(value)) {
    return {} as Record<string, Json | null>;
  }

  return Object.fromEntries(
    Object.entries(value).slice(0, maxKeys).map(([key, entry]) => [key, compactJsonValue(entry)]),
  ) as Record<string, Json | null>;
}

function truncateText(value: string | null, maxLength: number) {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : value;
}

function normalizeCandidateSignatureText(value: unknown) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }

  return normalized.toLowerCase().replace(/\s+/g, " ").trim();
}

function hashCandidateSignaturePayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toCompactFormulaSnippet(value: unknown) {
  return truncateText(toNullableString(value), 80);
}

function getPatternMeaning(event: ClassifiedWorksheetMemoryEvent) {
  const interpretationPayload = compactJsonRecord(event.interpretationPayload);
  const interpretedChange =
    isJsonRecord(interpretationPayload.interpretedChange)
      ? compactJsonRecord(interpretationPayload.interpretedChange)
      : {};

  const plainEnglishSummary = truncateText(toNullableString(interpretedChange.plainEnglishSummary), 120);
  const pricingMeaning = truncateText(toNullableString(interpretedChange.pricingMeaning), 120);
  const whatChanged = truncateText(toNullableString(interpretedChange.whatChanged), 120);

  return plainEnglishSummary ?? pricingMeaning ?? whatChanged;
}

function getPatternMemoryType(event: ClassifiedWorksheetMemoryEvent) {
  const interpretationPayload = compactJsonRecord(event.interpretationPayload);
  const interpretedChange =
    isJsonRecord(interpretationPayload.interpretedChange)
      ? compactJsonRecord(interpretationPayload.interpretedChange)
      : {};

  return (
    toNullableString(interpretedChange.memoryType)
    ?? toNullableString(event.futureUseSummary?.memoryType)
    ?? null
  );
}

function getSemanticFieldValue(
  event: ClassifiedWorksheetMemoryEvent,
  field: string,
) {
  const record = event.semanticFields[field as keyof typeof event.semanticFields];
  return record && typeof record === "object" ? toNullableString(record.value) : null;
}

function getScopeContext(event: ClassifiedWorksheetMemoryEvent) {
  return {
    tradePackage: toNullableString(event.metadata.tradePackage),
    pageType: getSemanticFieldValue(event, "pageType"),
    sectionType: getSemanticFieldValue(event, "sectionType"),
    itemCategory: getSemanticFieldValue(event, "itemCategory"),
    normalizedUnit: getSemanticFieldValue(event, "normalizedUnit"),
    normalizedTradePackage: getSemanticFieldValue(event, "normalizedTradePackage"),
    costRole: getSemanticFieldValue(event, "costRole"),
  };
}

function buildCompactWorksheetPricingPatternEvent(event: ClassifiedWorksheetMemoryEvent): CompactWorksheetPricingPatternEvent {
  const meaning = getPatternMeaning(event);
  const oldFormulaSnippet = toCompactFormulaSnippet(event.diffData.oldFormula);
  const newFormulaSnippet = toCompactFormulaSnippet(event.diffData.newFormula);
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    context: {
      tradePackage: toNullableString(event.metadata.tradePackage),
      worksheetName: toNullableString(event.metadata.worksheetName),
      pageType: getSemanticFieldValue(event, "pageType"),
      sectionType: getSemanticFieldValue(event, "sectionType"),
      itemCategory: getSemanticFieldValue(event, "itemCategory"),
      normalizedUnit: getSemanticFieldValue(event, "normalizedUnit"),
      costRole: getSemanticFieldValue(event, "costRole"),
    },
    anchor: {
      itemLabel: toNullableString(event.diffData.itemLabel),
      rowLabel: toNullableString(event.diffData.rowLabel),
      columnHeader: toNullableString(event.diffData.columnHeader),
      unit: toNullableString(event.diffData.unit),
    },
    change: {
      summary: meaning,
      oldValue: compactJsonValue(event.diffData.oldValue as Json | undefined),
      newValue: compactJsonValue(event.diffData.newValue as Json | undefined),
      formulaChanged: Boolean(oldFormulaSnippet || newFormulaSnippet),
      oldFormulaSnippet,
      newFormulaSnippet,
    },
    patternSignals: {
      meaning,
      memoryType: getPatternMemoryType(event),
    },
    quality: {
      overallConfidence: toNullableNumber(event.overallConfidence),
      captureCompletenessScore: toNullableNumber(event.diffData.captureCompletenessScore),
      missingCriticalContext:
        typeof event.diffData.missingCriticalContext === "boolean"
          ? event.diffData.missingCriticalContext
          : isJsonRecord(event.diffData.captureQuality) && typeof event.diffData.captureQuality.missingCriticalContext === "boolean"
            ? Boolean(event.diffData.captureQuality.missingCriticalContext)
            : null,
    },
  };
}

function buildWorksheetPricingPatternProposalSystemPrompt() {
  return [
    "You are evaluating interpreted worksheet events in shadow mode for pricing pattern proposals.",
    "Anthropic owns semantic grouping and semantic sameness.",
    "TradesStack validates evidence integrity and organization isolation.",
    "Use only the supplied interpreted worksheet events.",
    "Do not assume backend synonyms, label dictionaries, or construction-specific hardcoded normalization.",
    "Focus on repeated estimator behavior, repeated pricing behavior, repeated formula behavior, repeated review corrections, and repeated worksheet behavior.",
    "Return no_pattern when evidence is weak, mixed, project-specific, or not reusable.",
    "If proposalKind = no_pattern, it means no reusable pattern and no support set.",
    "If proposalKind = no_pattern, supportingEvidenceEventIds and contradictoryEvidenceEventIds must both be empty arrays.",
    "If proposalKind = no_pattern, patternFamily, patternType, confidence, and retrievalGuidance must all be null.",
    "A reusable pattern proposal must be supported by at least 2 supporting evidence events across at least 2 worksheet instances and at least 2 projects.",
    "If two events show the same specific pricing behavior across 2 worksheet instances and 2 projects, return a weak pattern unless there is real contradiction.",
    "Do not return no_pattern for matching cross-project support evidence.",
    "If only one worksheet instance or one project genuinely supports the behavior, return no_pattern.",
    "Do not propose a pattern from a single support event.",
    "Do not propose a pattern when the broader pool is diverse but the actual supporting subset is narrow.",
    "Do not invent engineering rationale, compliance rationale, or business motive explanations that are not supported by the interpreted events.",
    "For weak patterns, use cautious descriptive language such as observed repeated adjustment. Avoid prescriptive phrasing like default to or company usually.",
    "Allowed pattern families: pricing_preference, rate_adjustment_pattern, allowance_pattern, labour_productivity_pattern, formula_pattern, component_completeness_pattern, review_correction_pattern, worksheet_structure_pattern, estimator_behavior_pattern.",
    "Return valid JSON only.",
  ].join("\n");
}

function buildWorksheetPricingPatternProposalUserPrompt(batch: WorksheetPricingPatternProposalBatch) {
  return [
    "Shadow mode only. No proposal will be used by Review AI or Ask AI yet.",
    "Review the interpreted worksheet events below.",
    "Decide whether any subset of the events represents a reusable pricing pattern proposal.",
    "If no reusable pattern is supported, return one proposal with proposalKind = no_pattern.",
    "If proposalKind = no_pattern, supportingEvidenceEventIds must be [], contradictoryEvidenceEventIds must be [], patternFamily and patternType must be null, confidence must be null, and retrievalGuidance must be null.",
    "no_pattern means no reusable pattern and no support set.",
    "A pattern proposal must include supportingEvidenceEventIds from at least 2 worksheet instances and at least 2 projects.",
    "If two events show the same specific pricing behavior across 2 worksheet instances and 2 projects, return a weak pattern unless there is real contradiction.",
    "Do not return no_pattern for matching cross-project support evidence.",
    "If only one worksheet instance or one project supports the behavior, return no_pattern.",
    "Do not propose a pattern from a single support event.",
    "Do not return a pattern when the broader pool is diverse but the actual supporting subset is narrow.",
    "For pattern proposals, include only supporting evidence event ids and any contradictory evidence event ids you think matter.",
    "Use scope to describe where the pattern likely applies. Keep scope generic and evidence-backed.",
    "Do not tell the backend what to do. Only return semantic grouping judgement and structured proposal payloads.",
    `Organization ID: ${batch.organizationId}`,
    `Event count: ${batch.events.length}`,
    `Events:\n${JSON.stringify(batch.events.map(buildCompactWorksheetPricingPatternEvent))}`,
  ].join("\n\n");
}

function buildWorksheetPricingPatternProposalSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "proposalKind",
            "patternFamily",
            "patternType",
            "title",
            "summary",
            "retrievalGuidance",
            "confidence",
            "scope",
            "patternValueSummary",
            "patternSignals",
            "supportingEvidenceEventIds",
            "contradictoryEvidenceEventIds",
            "contradictionReason",
            "dominantAlternativePatternType",
          ],
          properties: {
            proposalKind: { type: "string" },
            patternFamily: { anyOf: [{ type: "string" }, { type: "null" }] },
            patternType: { anyOf: [{ type: "string" }, { type: "null" }] },
            title: { anyOf: [{ type: "string" }, { type: "null" }] },
            summary: { anyOf: [{ type: "string" }, { type: "null" }] },
            retrievalGuidance: { anyOf: [{ type: "string" }, { type: "null" }] },
            confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
            scope: {
              type: "object",
              additionalProperties: false,
              required: [
                "tradePackage",
                "pageType",
                "worksheetNameHint",
                "itemCategory",
                "normalizedUnit",
                "costRole",
                "sectionType",
              ],
              properties: {
                tradePackage: { anyOf: [{ type: "string" }, { type: "null" }] },
                pageType: { anyOf: [{ type: "string" }, { type: "null" }] },
                worksheetNameHint: { anyOf: [{ type: "string" }, { type: "null" }] },
                itemCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
                normalizedUnit: { anyOf: [{ type: "string" }, { type: "null" }] },
                costRole: { anyOf: [{ type: "string" }, { type: "null" }] },
                sectionType: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
            },
            patternValueSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
            patternSignals: {
              type: "array",
              items: { type: "string" },
            },
            supportingEvidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
            contradictoryEvidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
            contradictionReason: { anyOf: [{ type: "string" }, { type: "null" }] },
            dominantAlternativePatternType: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
        },
      },
    },
  } as Record<string, unknown>;
}

function buildBatchesByOrganization(
  events: ClassifiedWorksheetMemoryEvent[],
  batchSize: number,
) {
  const grouped = new Map<string, ClassifiedWorksheetMemoryEvent[]>();
  for (const event of events) {
    if (event.classificationStatus !== "classified") {
      continue;
    }

    const existing = grouped.get(event.organizationId) ?? [];
    existing.push(event);
    grouped.set(event.organizationId, existing);
  }

  const batches: WorksheetPricingPatternProposalBatch[] = [];
  grouped.forEach((groupEvents, organizationId) => {
    const sorted = [...groupEvents].sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId),
    );

    for (let index = 0; index < sorted.length; index += batchSize) {
      batches.push({
        batchId: `${organizationId}:pricing-pattern-batch:${Math.floor(index / batchSize) + 1}`,
        organizationId,
        events: sorted.slice(index, index + batchSize),
      });
    }
  });

  return batches.sort((left, right) => left.batchId.localeCompare(right.batchId));
}

function normalizeRawPatternProposal(value: unknown): RawWorksheetPricingPatternProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const proposalKind = toNullableString(record.proposalKind);
  if (proposalKind !== "pattern" && proposalKind !== "no_pattern") {
    return null;
  }

  const normalized: RawWorksheetPricingPatternProposal = {
    proposalKind,
    patternFamily: ALLOWED_PATTERN_FAMILIES.includes(record.patternFamily as WorksheetPricingPatternFamily)
      ? (record.patternFamily as WorksheetPricingPatternFamily)
      : null,
    patternType: toNullableString(record.patternType),
    title: toNullableString(record.title),
    summary: toNullableString(record.summary),
    retrievalGuidance: toNullableString(record.retrievalGuidance),
    confidence: clampConfidence(record.confidence),
    scope: compactJsonRecord(record.scope),
    patternValueSummary: toNullableString(record.patternValueSummary),
    patternSignals: Array.isArray(record.patternSignals)
      ? record.patternSignals
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
          .slice(0, 8)
      : [],
    supportingEvidenceEventIds: Array.isArray(record.supportingEvidenceEventIds)
      ? record.supportingEvidenceEventIds
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [],
    contradictoryEvidenceEventIds: Array.isArray(record.contradictoryEvidenceEventIds)
      ? record.contradictoryEvidenceEventIds
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [],
    contradictionReason: toNullableString(record.contradictionReason),
    dominantAlternativePatternType: toNullableString(record.dominantAlternativePatternType),
  };

  if (proposalKind === "no_pattern") {
    return {
      ...normalized,
      patternFamily: null,
      patternType: null,
      retrievalGuidance: null,
      confidence: null,
      patternValueSummary: null,
      patternSignals: [],
      supportingEvidenceEventIds: [],
      contradictoryEvidenceEventIds: [],
      contradictionReason: null,
      dominantAlternativePatternType: null,
    };
  }

  return normalized;
}

function normalizeProviderProposals(response: PricingWorksheetProviderResponse) {
  const proposals = isJsonRecord(response.parsedJson) && Array.isArray(response.parsedJson.proposals)
    ? response.parsedJson.proposals
        .map(normalizeRawPatternProposal)
        .filter((proposal): proposal is RawWorksheetPricingPatternProposal => proposal !== null)
    : [];

  return proposals;
}

function deriveProposedStrength(confidence: number | null, supportEligibility: PatternSupportEligibility) {
  if (confidence === null || !supportEligibility.eligible || supportEligibility.strengthCeiling === "none") {
    return null;
  }

  if (supportEligibility.strengthCeiling === "durable" && confidence >= DURABLE_CONFIDENCE) {
    return "durable" as const;
  }

  if (
    (supportEligibility.strengthCeiling === "durable" || supportEligibility.strengthCeiling === "reinforced")
    && confidence >= REINFORCED_CONFIDENCE
  ) {
    return "reinforced" as const;
  }
  return confidence >= DEFAULT_MINIMUM_CONFIDENCE ? "weak" as const : null;
}

function average(numbers: number[]) {
  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function getBatchWorksheetKey(event: ClassifiedWorksheetMemoryEvent) {
  const sheetId = toNullableString(event.metadata.sheetId);
  if (sheetId) {
    return `sheet:${sheetId}`;
  }

  const worksheetName = toNullableString(event.metadata.worksheetName);
  const workbookId = toNullableString(event.metadata.workbookId);
  if (workbookId && worksheetName) {
    return `workbook_worksheet:${workbookId}:${worksheetName}`;
  }

  if (event.opportunityId && worksheetName) {
    return `opportunity_worksheet:${event.opportunityId}:${worksheetName}`;
  }

  if (event.projectId && worksheetName) {
    return `project_worksheet:${event.projectId}:${worksheetName}`;
  }

  if (workbookId) {
    return `workbook:${workbookId}`;
  }

  return `event:${event.eventId}`;
}

function getDistinctNullableCount(values: Array<string | null>) {
  const filtered = values.filter((value): value is string => typeof value === "string" && value.length > 0);
  return filtered.length > 0 ? new Set(filtered).size : 0;
}

function computePatternPoolDiversity(events: ClassifiedWorksheetMemoryEvent[]): PatternPoolDiversity {
  const occurredAtMs = events
    .map((event) => Date.parse(event.occurredAt))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const sessionCount = getDistinctNullableCount(events.map((event) => toNullableString(event.metadata.sessionId)));
  const estimatorCount = getDistinctNullableCount(events.map((event) => toNullableString(event.metadata.userId)));

  return {
    evidenceCount: events.length,
    worksheetCount: new Set(events.map((event) => getBatchWorksheetKey(event))).size,
    workbookCount: getDistinctNullableCount(events.map((event) => toNullableString(event.metadata.workbookId))),
    projectCount: getDistinctNullableCount(events.map((event) => event.projectId)),
    sessionCount: sessionCount > 0 ? sessionCount : null,
    estimatorCount: estimatorCount > 0 ? estimatorCount : null,
    dateSpanDays:
      occurredAtMs.length >= 2
        ? Math.max(0, Math.round((occurredAtMs[occurredAtMs.length - 1]! - occurredAtMs[0]!) / (1000 * 60 * 60 * 24)))
        : 0,
  };
}

function computePatternPoolEligibility(diversity: PatternPoolDiversity): PatternPoolEligibility {
  if (diversity.evidenceCount < MINIMUM_POOL_EVIDENCE_COUNT) {
    return {
      eligible: false,
      reason: "insufficient_evidence_count",
      strengthCeiling: "none",
    };
  }

  if (diversity.worksheetCount < 2) {
    return {
      eligible: false,
      reason: "single_worksheet_behavior",
      strengthCeiling: "none",
    };
  }

  if (diversity.projectCount < 2) {
    return {
      eligible: false,
      reason: "insufficient_cross_context_diversity",
      strengthCeiling: "none",
    };
  }

  if (
    diversity.evidenceCount >= 8
    && diversity.worksheetCount >= 4
    && diversity.projectCount >= 3
  ) {
    return {
      eligible: true,
      reason: "eligible",
      strengthCeiling: "durable",
    };
  }

  if (diversity.evidenceCount >= 5 && diversity.worksheetCount >= 3 && diversity.projectCount >= 2) {
    return {
      eligible: true,
      reason: "eligible",
      strengthCeiling: "reinforced",
    };
  }

  if (diversity.evidenceCount >= 2 && diversity.worksheetCount >= 2 && diversity.projectCount >= 2) {
    return {
      eligible: true,
      reason: "eligible",
      strengthCeiling: "weak",
    };
  }

  return {
    eligible: false,
    reason: "insufficient_cross_context_diversity",
    strengthCeiling: "none",
  };
}

function computePatternSupportEligibility(diversity: PatternPoolDiversity): PatternSupportEligibility {
  if (diversity.evidenceCount < SUPPORT_MINIMUM_EVIDENCE_COUNT) {
    return {
      eligible: false,
      reason: "evidence_count_below_threshold",
      strengthCeiling: "none",
    };
  }

  if (diversity.worksheetCount < 2) {
    return {
      eligible: false,
      reason: "single_worksheet_behavior",
      strengthCeiling: "none",
    };
  }

  if (diversity.projectCount < 2) {
    return {
      eligible: false,
      reason: "insufficient_cross_context_diversity",
      strengthCeiling: "none",
    };
  }

  if (
    diversity.evidenceCount >= 8
    && diversity.worksheetCount >= 4
    && diversity.projectCount >= 3
  ) {
    return {
      eligible: true,
      reason: "eligible",
      strengthCeiling: "durable",
    };
  }

  if (diversity.evidenceCount >= 5 && diversity.worksheetCount >= 3 && diversity.projectCount >= 2) {
    return {
      eligible: true,
      reason: "eligible",
      strengthCeiling: "reinforced",
    };
  }

  if (diversity.evidenceCount >= 2 && diversity.worksheetCount >= 2 && diversity.projectCount >= 2) {
    return {
      eligible: true,
      reason: "eligible",
      strengthCeiling: "weak",
    };
  }

  return {
    eligible: false,
    reason: "insufficient_cross_context_diversity",
    strengthCeiling: "none",
  };
}

function parseJsonRecord(value: unknown) {
  return isJsonRecord(value) ? compactJsonRecord(value, 32) : {};
}

function buildDiversitySnapshot(events: ClassifiedWorksheetMemoryEvent[]): DiversitySnapshot {
  const worksheetKeys = Array.from(new Set(
    events.map((event) => getBatchWorksheetKey(event)).filter((value) => value.length > 0),
  ));
  const workbookIds = Array.from(new Set(
    events.map((event) => toNullableString(event.metadata.workbookId)).filter((value): value is string => Boolean(value)),
  ));
  const projectIds = Array.from(new Set(
    events.map((event) => event.projectId).filter((value): value is string => Boolean(value)),
  ));
  const sessionIds = Array.from(new Set(
    events.map((event) => toNullableString(event.metadata.sessionId)).filter((value): value is string => Boolean(value)),
  ));
  const estimatorIds = Array.from(new Set(
    events.map((event) => toNullableString(event.metadata.userId)).filter((value): value is string => Boolean(value)),
  ));
  const occurredAtValues = events
    .map((event) => toNullableString(event.occurredAt))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
  const base = computePatternPoolDiversity(events);

  return {
    ...base,
    worksheetKeys,
    workbookIds,
    projectIds,
    sessionIds,
    estimatorIds,
    occurredAtMin: occurredAtValues[0] ?? null,
    occurredAtMax: occurredAtValues[occurredAtValues.length - 1] ?? null,
  };
}

function parseDiversitySnapshot(value: unknown): DiversitySnapshot {
  const record = parseJsonRecord(value);
  const worksheetKeys = Array.isArray(record.worksheetKeys)
    ? record.worksheetKeys.filter((entry): entry is string => typeof entry === "string")
    : [];
  const workbookIds = Array.isArray(record.workbookIds)
    ? record.workbookIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const projectIds = Array.isArray(record.projectIds)
    ? record.projectIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const sessionIds = Array.isArray(record.sessionIds)
    ? record.sessionIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const estimatorIds = Array.isArray(record.estimatorIds)
    ? record.estimatorIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const occurredAtMin = toNullableString(record.occurredAtMin);
  const occurredAtMax = toNullableString(record.occurredAtMax);
  const evidenceCount = toNullableNumber(record.evidenceCount) ?? 0;
  const worksheetCount = worksheetKeys.length > 0 ? worksheetKeys.length : (toNullableNumber(record.worksheetCount) ?? 0);
  const workbookCount = workbookIds.length > 0 ? workbookIds.length : (toNullableNumber(record.workbookCount) ?? 0);
  const projectCount = projectIds.length > 0 ? projectIds.length : (toNullableNumber(record.projectCount) ?? 0);
  const sessionCount = sessionIds.length > 0 ? sessionIds.length : null;
  const estimatorCount = estimatorIds.length > 0 ? estimatorIds.length : null;
  const dateSpanDays =
    occurredAtMin && occurredAtMax
      ? Math.max(0, Math.round((Date.parse(occurredAtMax) - Date.parse(occurredAtMin)) / (1000 * 60 * 60 * 24)))
      : (toNullableNumber(record.dateSpanDays) ?? 0);

  return {
    evidenceCount,
    worksheetCount,
    workbookCount,
    projectCount,
    sessionCount,
    estimatorCount,
    dateSpanDays,
    worksheetKeys,
    workbookIds,
    projectIds,
    sessionIds,
    estimatorIds,
    occurredAtMin,
    occurredAtMax,
  };
}

function mergeDiversitySnapshot(existing: unknown, newEvents: ClassifiedWorksheetMemoryEvent[]) {
  const base = parseDiversitySnapshot(existing);
  const incoming = buildDiversitySnapshot(newEvents);
  const worksheetKeys = Array.from(new Set([...base.worksheetKeys, ...incoming.worksheetKeys]));
  const workbookIds = Array.from(new Set([...base.workbookIds, ...incoming.workbookIds]));
  const projectIds = Array.from(new Set([...base.projectIds, ...incoming.projectIds]));
  const sessionIds = Array.from(new Set([...base.sessionIds, ...incoming.sessionIds]));
  const estimatorIds = Array.from(new Set([...base.estimatorIds, ...incoming.estimatorIds]));
  const occurredAtMin = [base.occurredAtMin, incoming.occurredAtMin].filter((value): value is string => Boolean(value)).sort()[0] ?? null;
  const occurredAtMax = [base.occurredAtMax, incoming.occurredAtMax].filter((value): value is string => Boolean(value)).sort().slice(-1)[0] ?? null;
  const dateSpanDays =
    occurredAtMin && occurredAtMax
      ? Math.max(0, Math.round((Date.parse(occurredAtMax) - Date.parse(occurredAtMin)) / (1000 * 60 * 60 * 24)))
      : 0;

  return {
    evidenceCount: base.evidenceCount + newEvents.length,
    worksheetCount: worksheetKeys.length,
    workbookCount: workbookIds.length,
    projectCount: projectIds.length,
    sessionCount: sessionIds.length > 0 ? sessionIds.length : null,
    estimatorCount: estimatorIds.length > 0 ? estimatorIds.length : null,
    dateSpanDays,
    worksheetKeys,
    workbookIds,
    projectIds,
    sessionIds,
    estimatorIds,
    occurredAtMin,
    occurredAtMax,
  } satisfies DiversitySnapshot;
}

function serializeDiversitySnapshot(snapshot: DiversitySnapshot) {
  return {
    evidenceCount: snapshot.evidenceCount,
    worksheetCount: snapshot.worksheetCount,
    workbookCount: snapshot.workbookCount,
    projectCount: snapshot.projectCount,
    sessionCount: snapshot.sessionCount,
    estimatorCount: snapshot.estimatorCount,
    dateSpanDays: snapshot.dateSpanDays,
    worksheetKeys: snapshot.worksheetKeys,
    workbookIds: snapshot.workbookIds,
    projectIds: snapshot.projectIds,
    sessionIds: snapshot.sessionIds,
    estimatorIds: snapshot.estimatorIds,
    occurredAtMin: snapshot.occurredAtMin,
    occurredAtMax: snapshot.occurredAtMax,
  } satisfies Record<string, Json | null>;
}

function buildEvidenceSummary(
  supportEvents: ClassifiedWorksheetMemoryEvent[],
  contradictoryEvents: ClassifiedWorksheetMemoryEvent[],
  ignoredEventIds: string[],
  poolDiversity?: PatternPoolDiversity,
  supportDiversity?: PatternPoolDiversity,
) {
  const allEvents = [...supportEvents, ...contradictoryEvents];
  const occurredAtMs = supportEvents
    .map((event) => Date.parse(event.occurredAt))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const eventTypeCounts = new Map<string, number>();

  for (const event of supportEvents) {
    eventTypeCounts.set(event.eventType, (eventTypeCounts.get(event.eventType) ?? 0) + 1);
  }

  const dominantChangeKinds = Array.from(eventTypeCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([eventType]) => eventType);

  return {
    supportCount: supportEvents.length,
    contradictionCount: contradictoryEvents.length,
    ignoredCount: ignoredEventIds.length,
    averageClassificationConfidence: average(
      supportEvents.map((event) => event.overallConfidence).filter((value): value is number => typeof value === "number"),
    ),
    averageCaptureCompleteness: average(
      supportEvents
        .map((event) => toNullableNumber(event.diffData.captureCompletenessScore))
        .filter((value): value is number => value !== null),
    ),
    dominantChangeKinds,
    worksheetCount: new Set(allEvents.map((event) => getBatchWorksheetKey(event))).size,
    sheetCount: new Set(allEvents.map((event) => toNullableString(event.metadata.sheetId) ?? event.eventId)).size,
    dateSpanDays:
      occurredAtMs.length >= 2
        ? Math.max(0, Math.round((occurredAtMs[occurredAtMs.length - 1]! - occurredAtMs[0]!) / (1000 * 60 * 60 * 24)))
        : 0,
    poolDiversity: poolDiversity
      ? ({
          evidenceCount: poolDiversity.evidenceCount,
          worksheetCount: poolDiversity.worksheetCount,
          workbookCount: poolDiversity.workbookCount,
          projectCount: poolDiversity.projectCount,
          sessionCount: poolDiversity.sessionCount,
          estimatorCount: poolDiversity.estimatorCount,
          dateSpanDays: poolDiversity.dateSpanDays,
        } satisfies Record<string, Json | null>)
      : null,
    supportDiversity: supportDiversity
      ? ({
          evidenceCount: supportDiversity.evidenceCount,
          worksheetCount: supportDiversity.worksheetCount,
          workbookCount: supportDiversity.workbookCount,
          projectCount: supportDiversity.projectCount,
          sessionCount: supportDiversity.sessionCount,
          estimatorCount: supportDiversity.estimatorCount,
          dateSpanDays: supportDiversity.dateSpanDays,
        } satisfies Record<string, Json | null>)
      : null,
  } satisfies Record<string, Json | null>;
}

function buildScopeCoherence(
  scope: Record<string, Json | null>,
  supportEvents: ClassifiedWorksheetMemoryEvent[],
) {
  const comparableFields = [
    "tradePackage",
    "pageType",
    "worksheetNameHint",
    "itemCategory",
    "normalizedUnit",
    "costRole",
    "sectionType",
  ] as const;

  let comparableFieldCount = 0;
  for (const field of comparableFields) {
    const proposedValue = toNullableString(scope[field]);
    if (!proposedValue) {
      continue;
    }
    comparableFieldCount += 1;

    const hasMatch = supportEvents.some((event) => {
      const context = getScopeContext(event);
      if (field === "worksheetNameHint") {
        return toNullableString(event.metadata.worksheetName) === proposedValue;
      }
      return toNullableString(context[field as keyof typeof context]) === proposedValue;
    });

    if (!hasMatch) {
      return false;
    }
  }

  return comparableFieldCount > 0;
}

function validateShadowProposal(params: {
  batch: WorksheetPricingPatternProposalBatch;
  proposal: RawWorksheetPricingPatternProposal;
  minimumEvidenceCount: number;
  minimumConfidence: number;
  maximumContradictionRatio: number;
}) {
  const reasons: WorksheetPricingPatternShadowRejectionReason[] = [];
  const eventIds = new Set(params.batch.events.map((event) => event.eventId));
  const eventOrganizations = new Map(params.batch.events.map((event) => [event.eventId, event.organizationId]));
  const uniqueSupportIds = Array.from(new Set(params.proposal.supportingEvidenceEventIds));
  const uniqueContradictionIds = Array.from(new Set(params.proposal.contradictoryEvidenceEventIds));
  const overlap = uniqueSupportIds.filter((eventId) => uniqueContradictionIds.includes(eventId));

  if (params.proposal.proposalKind === "no_pattern") {
    if (
      uniqueSupportIds.length > 0
      || uniqueContradictionIds.length > 0
      || params.proposal.patternFamily
      || params.proposal.patternType
      || params.proposal.patternValueSummary
      || params.proposal.patternSignals.length > 0
    ) {
      reasons.push("invalid_no_pattern_payload");
    }

    return {
      gateStatus: "no_pattern" as const,
      rejectionReasons: Array.from(new Set(reasons)),
      supportEvents: [] as ClassifiedWorksheetMemoryEvent[],
      contradictionEvents: [] as ClassifiedWorksheetMemoryEvent[],
      ignoredEventIds: params.batch.events.map((event) => event.eventId),
      contradictionRatio: null,
      passedScopeCoherence: true,
      supportDiversity: computePatternPoolDiversity([]),
      supportEligibility: {
        eligible: false,
        reason: "evidence_count_below_threshold",
        strengthCeiling: "none",
      } satisfies PatternSupportEligibility,
    };
  }

  if (uniqueSupportIds.length !== params.proposal.supportingEvidenceEventIds.length) {
    reasons.push("duplicate_evidence_ids");
  }

  if (uniqueSupportIds.length < params.minimumEvidenceCount) {
    reasons.push("evidence_count_below_threshold");
  }

  if ((params.proposal.confidence ?? 0) < params.minimumConfidence) {
    reasons.push("confidence_below_threshold");
  }

  if (overlap.length > 0) {
    reasons.push("supporting_and_contradictory_overlap");
  }

  const allReferencedIds = [...uniqueSupportIds, ...uniqueContradictionIds];
  if (allReferencedIds.some((eventId) => !eventIds.has(eventId))) {
    reasons.push("evidence_ids_missing");
  }
  if (allReferencedIds.some((eventId) => eventOrganizations.get(eventId) !== params.batch.organizationId)) {
    reasons.push("evidence_org_mismatch");
  }

  if (!params.proposal.patternFamily || !ALLOWED_PATTERN_FAMILIES.includes(params.proposal.patternFamily)) {
    reasons.push("invalid_pattern_family");
  }
  if (!params.proposal.title || !params.proposal.summary || params.proposal.confidence === null) {
    reasons.push("proposal_payload_invalid");
  }
  if (!isJsonRecord(params.proposal.scope)) {
    reasons.push("proposal_payload_invalid");
  }

  const supportEvents = params.batch.events.filter((event) => uniqueSupportIds.includes(event.eventId));
  const contradictionEvents = params.batch.events.filter((event) => uniqueContradictionIds.includes(event.eventId));
  const ignoredEventIds = params.batch.events
    .map((event) => event.eventId)
    .filter((eventId) => !uniqueSupportIds.includes(eventId) && !uniqueContradictionIds.includes(eventId));
  const supportDiversity = computePatternPoolDiversity(supportEvents);
  const supportEligibility = computePatternSupportEligibility(supportDiversity);

  const contradictionRatio =
    uniqueSupportIds.length === 0
      ? null
      : uniqueContradictionIds.length / uniqueSupportIds.length;
  if ((contradictionRatio ?? 0) > params.maximumContradictionRatio) {
    reasons.push("contradiction_level_too_high");
  }

  const passedScopeCoherence = buildScopeCoherence(params.proposal.scope, supportEvents);
  if (!passedScopeCoherence) {
    reasons.push("scope_incoherent");
  }
  if (!supportEligibility.eligible) {
    reasons.push("support_diversity_below_threshold");
  }

  return {
    gateStatus: reasons.length === 0 ? "accepted" as const : "rejected" as const,
    rejectionReasons: Array.from(new Set(reasons)),
    supportEvents,
    contradictionEvents,
    ignoredEventIds,
    contradictionRatio,
    passedScopeCoherence,
    supportDiversity,
    supportEligibility,
  };
}

function sanitizeWeakPatternText(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/\bthis company usually\b/gi, "observed repeated estimator behavior")
    .replace(/\bcompany usually\b/gi, "observed repeated estimator behavior")
    .replace(/\bdefault to\b/gi, "observed repeated adjustment to")
    .replace(/\bconsistently revised upward\b/gi, "repeatedly adjusted upward");
}

function applyStrengthLanguagePolicy(params: {
  proposal: RawWorksheetPricingPatternProposal;
  proposedStrength: WorksheetPricingPatternStrength | null;
}) {
  if (params.proposedStrength !== "weak") {
    return params.proposal;
  }

  return {
    ...params.proposal,
    title: sanitizeWeakPatternText(params.proposal.title),
    summary: sanitizeWeakPatternText(params.proposal.summary),
    retrievalGuidance: sanitizeWeakPatternText(params.proposal.retrievalGuidance),
  };
}

function parseProcessingRow(value: Record<string, unknown>): WorksheetPricingPatternEvidenceProcessingRow {
  return {
    id: toNullableString(value.id) ?? toNullableString(value.rowId) ?? crypto.randomUUID(),
    organizationId: toNullableString(value.organization_id) ?? toNullableString(value.organizationId) ?? "",
    sourceEventId: toNullableString(value.source_event_id) ?? toNullableString(value.sourceEventId) ?? "",
    classificationRecordId: toNullableString(value.classification_record_id) ?? toNullableString(value.classificationRecordId),
    classificationVersion: toNullableNumber(value.classification_version) ?? toNullableNumber(value.classificationVersion) ?? 1,
    classificationAttemptNumber:
      toNullableNumber(value.classification_attempt_number) ?? toNullableNumber(value.classificationAttemptNumber) ?? 1,
    processingStatus:
      (toNullableString(value.processing_status ?? value.processingStatus) as WorksheetPricingPatternEvidenceProcessingRow["processingStatus"]) ?? "pending",
    processingRunId: toNullableString(value.processing_run_id) ?? toNullableString(value.processingRunId),
    attemptCount: toNullableNumber(value.attempt_count) ?? toNullableNumber(value.attemptCount) ?? 0,
    maxAttempts: toNullableNumber(value.max_attempts) ?? toNullableNumber(value.maxAttempts) ?? DEFAULT_PROCESSING_MAX_ATTEMPTS,
    claimedAt: toNullableString(value.claimed_at) ?? toNullableString(value.claimedAt),
    claimExpiresAt: toNullableString(value.claim_expires_at) ?? toNullableString(value.claimExpiresAt),
    claimedBy: toNullableString(value.claimed_by) ?? toNullableString(value.claimedBy),
    claimToken: toNullableString(value.claim_token) ?? toNullableString(value.claimToken),
    processedAt: toNullableString(value.processed_at) ?? toNullableString(value.processedAt),
    failedAt: toNullableString(value.failed_at) ?? toNullableString(value.failedAt),
    retryAfter: toNullableString(value.retry_after) ?? toNullableString(value.retryAfter),
    errorCode: toNullableString(value.error_code) ?? toNullableString(value.errorCode),
    errorMessage: toNullableString(value.error_message) ?? toNullableString(value.errorMessage),
    lastErrorCode: toNullableString(value.last_error_code) ?? toNullableString(value.lastErrorCode),
    lastErrorMessage: toNullableString(value.last_error_message) ?? toNullableString(value.lastErrorMessage),
    createdAt: toNullableString(value.created_at) ?? toNullableString(value.createdAt),
    updatedAt: toNullableString(value.updated_at) ?? toNullableString(value.updatedAt),
  };
}

function parseCandidateRow(value: Record<string, unknown>): WorksheetPricingPatternShadowCandidate {
  return {
    id: toNullableString(value.id) ?? crypto.randomUUID(),
    organizationId: toNullableString(value.organization_id) ?? "",
    candidateStatus: (toNullableString(value.candidate_status) as WorksheetPricingPatternShadowCandidate["candidateStatus"]) ?? "active",
    patternFamily: (toNullableString(value.pattern_family) as WorksheetPricingPatternFamily | null) ?? null,
    patternType: toNullableString(value.pattern_type),
    currentStrength: (toNullableString(value.current_strength) as WorksheetPricingPatternStrength | null) ?? null,
    confidence: clampConfidence(value.confidence),
    title: toNullableString(value.title),
    summary: toNullableString(value.summary),
    retrievalGuidance: toNullableString(value.retrieval_guidance),
    scope: parseJsonRecord(value.scope),
    patternValue: parseJsonRecord(value.pattern_value),
    supportCount: toNullableNumber(value.support_count) ?? 0,
    contradictionCount: toNullableNumber(value.contradiction_count) ?? 0,
    ignoredCount: toNullableNumber(value.ignored_count) ?? 0,
    supportDiversity: parseJsonRecord(value.support_diversity),
    contradictionDiversity: value.contradiction_diversity === null ? null : parseJsonRecord(value.contradiction_diversity),
    lastReinforcedAt: toNullableString(value.last_reinforced_at),
    lastContradictedAt: toNullableString(value.last_contradicted_at),
    staleAfter: toNullableString(value.stale_after),
    createdByRunId: toNullableString(value.created_by_run_id),
    lastUpdatedByRunId: toNullableString(value.last_updated_by_run_id),
    scopeSignature: toNullableString(value.scope_signature),
    patternValueSignature: toNullableString(value.pattern_value_signature),
    candidateSignature: toNullableString(value.candidate_signature),
    signatureUniquenessEnabled:
      typeof value.signature_uniqueness_enabled === "boolean"
        ? value.signature_uniqueness_enabled
        : true,
    createdAt: toNullableString(value.created_at),
    updatedAt: toNullableString(value.updated_at),
  };
}

function buildNormalizedCandidateScope(scope: Record<string, Json | null>) {
  return {
    tradePackage: normalizeCandidateSignatureText(scope.tradePackage),
    pageType: normalizeCandidateSignatureText(scope.pageType),
    worksheetNameHint: normalizeCandidateSignatureText(scope.worksheetNameHint),
    itemCategory: normalizeCandidateSignatureText(scope.itemCategory),
    normalizedUnit: normalizeCandidateSignatureText(scope.normalizedUnit),
    costRole: normalizeCandidateSignatureText(scope.costRole),
    sectionType: normalizeCandidateSignatureText(scope.sectionType),
  } satisfies Record<string, string | null>;
}

function buildNormalizedCandidatePatternValue(params: {
  patternFamily: WorksheetPricingPatternFamily | null;
  patternType: string | null;
  patternValue: Record<string, Json | null>;
}) {
  const rawSignals = Array.isArray(params.patternValue.signals)
    ? params.patternValue.signals
    : [];

  const signals = Array.from(
    new Set(
      rawSignals
        .map((entry) => normalizeCandidateSignatureText(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    patternFamily: normalizeCandidateSignatureText(params.patternFamily),
    patternType: normalizeCandidateSignatureText(params.patternType),
    summary: normalizeCandidateSignatureText(params.patternValue.summary),
    signals,
  } satisfies Record<string, string | string[] | null>;
}

function buildShadowCandidateSignatures(params: {
  organizationId: string;
  patternFamily: WorksheetPricingPatternFamily | null;
  patternType: string | null;
  scope: Record<string, Json | null>;
  patternValue: Record<string, Json | null>;
}) {
  const normalizedScope = buildNormalizedCandidateScope(params.scope);
  const normalizedPatternValue = buildNormalizedCandidatePatternValue({
    patternFamily: params.patternFamily,
    patternType: params.patternType,
    patternValue: params.patternValue,
  });

  const scopeSignature = hashCandidateSignaturePayload(normalizedScope);
  const patternValueSignature = hashCandidateSignaturePayload(normalizedPatternValue);
  const candidateSignature = hashCandidateSignaturePayload({
    organizationId: normalizeCandidateSignatureText(params.organizationId),
    patternFamily: normalizedPatternValue.patternFamily,
    patternType: normalizedPatternValue.patternType,
    scopeSignature,
    patternValueSignature,
  });

  return {
    scopeSignature,
    patternValueSignature,
    candidateSignature,
    normalizedScope,
    normalizedPatternValue,
  };
}

function parseCandidateEvidenceRow(value: Record<string, unknown>): WorksheetPricingPatternShadowCandidateEvidenceLink {
  return {
    id: toNullableString(value.id) ?? crypto.randomUUID(),
    candidateId: toNullableString(value.candidate_id) ?? "",
    sourceEventId: toNullableString(value.source_event_id) ?? "",
    evidenceRole: (toNullableString(value.evidence_role) as WorksheetPricingPatternShadowCandidateEvidenceLink["evidenceRole"]) ?? "ignored",
    linkedByRunId: toNullableString(value.linked_by_run_id),
    createdAt: toNullableString(value.created_at),
  };
}

function getEventFamilyHints(event: ClassifiedWorksheetMemoryEvent) {
  const hints = new Set<WorksheetPricingPatternFamily>();
  const costRole = getSemanticFieldValue(event, "costRole") ?? "";
  const memoryType = getPatternMemoryType(event) ?? "";

  if (event.eventType.includes("formula") || memoryType.includes("formula")) {
    hints.add("formula_pattern");
  }
  if (event.eventType.includes("rate")) {
    hints.add("rate_adjustment_pattern");
    if (costRole.includes("labour") || costRole.includes("productivity")) {
      hints.add("labour_productivity_pattern");
    }
  }
  if (event.eventType.includes("assumption")) {
    if (/(allowance|waste|markup|margin)/i.test(costRole)) {
      hints.add("allowance_pattern");
    } else {
      hints.add("pricing_preference");
    }
  }
  if (event.eventType.includes("ai_") || memoryType.includes("correction")) {
    hints.add("review_correction_pattern");
  }
  if (hints.size === 0) {
    hints.add("pricing_preference");
  }

  return Array.from(hints);
}

function getEventScopeForCandidateMatch(event: ClassifiedWorksheetMemoryEvent) {
  return {
    tradePackage: toNullableString(event.metadata.tradePackage),
    pageType: getSemanticFieldValue(event, "pageType"),
    worksheetNameHint: toNullableString(event.metadata.worksheetName),
    itemCategory: getSemanticFieldValue(event, "itemCategory"),
    normalizedUnit: getSemanticFieldValue(event, "normalizedUnit"),
    costRole: getSemanticFieldValue(event, "costRole"),
    sectionType: getSemanticFieldValue(event, "sectionType"),
  };
}

function scoreCandidateScopeMatch(
  candidateScope: Record<string, Json | null>,
  eventScope: ReturnType<typeof getEventScopeForCandidateMatch>,
) {
  const fields = ["tradePackage", "pageType", "worksheetNameHint", "itemCategory", "normalizedUnit", "costRole", "sectionType"] as const;
  let score = 0;
  for (const field of fields) {
    const candidateValue = toNullableString(candidateScope[field]);
    const eventValue = eventScope[field];
    if (candidateValue && eventValue && candidateValue === eventValue) {
      score += field === "tradePackage" || field === "itemCategory" || field === "costRole" ? 2 : 1;
    }
  }
  return score;
}

function determineCandidateRelation(
  candidate: WorksheetPricingPatternShadowCandidate,
  event: ClassifiedWorksheetMemoryEvent,
) {
  if (!candidate.patternFamily || !getEventFamilyHints(event).includes(candidate.patternFamily)) {
    return { relation: "unrelated" as const, score: 0 };
  }

  const scopeScore = scoreCandidateScopeMatch(candidate.scope, getEventScopeForCandidateMatch(event));
  if (scopeScore < 3) {
    return { relation: "unrelated" as const, score: scopeScore };
  }

  const candidateSignals = Array.isArray(candidate.patternValue.signals)
    ? candidate.patternValue.signals.filter((entry): entry is string => typeof entry === "string")
    : [];
  const eventMeaning = `${getPatternMeaning(event) ?? ""} ${toNullableString(event.diffData.itemLabel) ?? ""}`.toLowerCase();
  const hasSignalOverlap = candidateSignals.some((signal) => eventMeaning.includes(signal.toLowerCase()));
  const candidateSummary = toNullableString(candidate.patternValue.summary)?.toLowerCase() ?? "";
  const candidateValueString = `${candidateSummary} ${candidate.title ?? ""} ${candidate.summary ?? ""}`.toLowerCase();
  const newValueToken = toNullableString(event.diffData.newValue);
  const oldValueToken = toNullableString(event.diffData.oldValue);
  const valueAligned =
    (newValueToken !== null && candidateValueString.includes(newValueToken))
    || (oldValueToken !== null && candidateValueString.includes(oldValueToken));

  if (hasSignalOverlap || valueAligned || candidate.patternType === null) {
    return { relation: "reinforce" as const, score: scopeScore + (hasSignalOverlap ? 2 : 0) + (valueAligned ? 1 : 0) };
  }

  return { relation: "contradict" as const, score: scopeScore };
}

function chooseBestCandidateMatch(
  event: ClassifiedWorksheetMemoryEvent,
  candidates: WorksheetPricingPatternShadowCandidate[],
) {
  const ranked = candidates
    .filter((candidate) => candidate.candidateStatus !== "retired" && candidate.organizationId === event.organizationId)
    .map((candidate) => ({
      candidate,
      ...determineCandidateRelation(candidate, event),
    }))
    .filter((entry) => entry.relation !== "unrelated")
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));

  return ranked[0] ?? null;
}

async function callAnthropicWorksheetPricingPatternBatch(
  batch: WorksheetPricingPatternProposalBatch,
  params: {
    timeoutMs: number;
    maxOutputTokens: number;
  },
) {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const systemPrompt = buildWorksheetPricingPatternProposalSystemPrompt();
  const userPrompt = buildWorksheetPricingPatternProposalUserPrompt(batch);
  const schema = buildWorksheetPricingPatternProposalSchema();
  console.info("[worksheet-pricing-pattern-shadow-batch]", {
    batchId: batch.batchId,
    organizationId: batch.organizationId,
    eventCount: batch.events.length,
    workflowStage: "worksheet_pricing_pattern_shadow_proposals",
    systemPromptBytes: Buffer.byteLength(systemPrompt, "utf8"),
    userPromptBytes: Buffer.byteLength(userPrompt, "utf8"),
    schemaSizeBytes: Buffer.byteLength(JSON.stringify(schema), "utf8"),
    timeoutMs: params.timeoutMs,
    maxOutputTokens: params.maxOutputTokens,
  });
  const providerResult = await provider.generateEditPlan({
    systemPrompt,
    userPrompt,
    schema,
    model: getPricingWorksheetAnthropicModel(),
    timeoutMs: params.timeoutMs,
    maxOutputTokens: params.maxOutputTokens,
    enableWebSearch: false,
    metadata: {
      workflowStage: "worksheet_pricing_pattern_shadow_proposals",
      batchId: batch.batchId,
      organizationId: batch.organizationId,
      shadowMode: true,
    },
  });

  return {
    providerResult,
    proposals: normalizeProviderProposals(providerResult),
  };
}

async function enqueuePendingProcessingRows(events: ClassifiedWorksheetMemoryEvent[]) {
  if (events.length === 0) {
    return {
      count: 0,
      ids: [] as string[],
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("enqueue_worksheet_pricing_pattern_evidence_processing" as never, {
    p_inputs: events.map((event) => ({
      organizationId: event.organizationId,
      sourceEventId: event.eventId,
      classificationRecordId: event.classificationRecordId ?? null,
      classificationVersion: event.classificationVersion,
      classificationAttemptNumber: Math.max(1, Math.floor(event.classificationAttemptNumber ?? 1)),
    })),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;

  return {
    count: typeof payload.count === "number" ? payload.count : events.length,
    ids: Array.isArray(payload.ids) ? payload.ids : [],
  };
}

async function claimPatternProcessingRows(params: {
  events: ClassifiedWorksheetMemoryEvent[];
  organizationId?: string | null;
  limit: number;
  runId: string;
  workerId?: string | null;
  leaseSeconds?: number;
}) {
  if (params.events.length === 0) {
    return [] as WorksheetPricingPatternEvidenceProcessingRow[];
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_worksheet_pricing_pattern_evidence_processing_batch" as never, {
    p_limit: Math.max(params.limit, 1),
    p_organization_id: params.organizationId ?? null,
    p_source_event_ids: params.events.map((event) => event.eventId),
    p_worker_id: params.workerId ?? "worksheet-pricing-pattern-shadow-runner",
    p_processing_run_id: params.runId,
    p_lease_seconds: Math.max(params.leaseSeconds ?? DEFAULT_PROCESSING_LEASE_SECONDS, 30),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];

  return Array.isArray(rows)
    ? rows.map((row) => parseProcessingRow(row))
    : [];
}

async function finalizePatternProcessingRows(params: {
  rows: WorksheetPricingPatternEvidenceProcessingRow[];
  status: "processed" | "retry_scheduled" | "dead_lettered";
  errorCode?: string | null;
  errorMessage?: string | null;
  now?: string;
}) {
  if (params.rows.length === 0) {
    return {
      count: 0,
      ids: [] as string[],
      processedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
    };
  }

  const admin = createAdminSupabaseClient();
  const now = params.now ?? new Date().toISOString();
  const { data, error } = await admin.rpc("finalize_worksheet_pricing_pattern_evidence_processing_batch" as never, {
    p_inputs: params.rows.map((row) => ({
      sourceEventId: row.sourceEventId,
      organizationId: row.organizationId,
      classificationVersion: row.classificationVersion,
      attemptCount: row.attemptCount,
      claimToken: row.claimToken,
      processingStatus: params.status,
      processedAt: params.status === "processed" ? now : null,
      failedAt: params.status !== "processed" ? now : null,
      retryAfter:
        params.status === "retry_scheduled"
          ? buildProcessingRetryAfter(row.attemptCount, now)
          : null,
      errorCode: params.status === "processed" ? null : (params.errorCode ?? "processing_failed"),
      errorMessage:
        params.status === "processed"
          ? null
          : (params.errorMessage ?? "Worksheet pricing pattern processing failed."),
    })),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;

  return {
    count: typeof payload.count === "number" ? payload.count : params.rows.length,
    ids: Array.isArray(payload.ids) ? payload.ids : [],
    processedCount: typeof payload.processedCount === "number" ? payload.processedCount : 0,
    retriedCount: typeof payload.retriedCount === "number" ? payload.retriedCount : 0,
    deadLetteredCount: typeof payload.deadLetteredCount === "number" ? payload.deadLetteredCount : 0,
  };
}

async function loadExistingShadowCandidates(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_pricing_pattern_shadow_candidates" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .neq("candidate_status", "retired" as never);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data)
    ? data.map((row) => parseCandidateRow(row as Record<string, unknown>))
    : [];
}

async function loadCandidateEvidenceLinks(candidateIds: string[]) {
  if (candidateIds.length === 0) {
    return [] as WorksheetPricingPatternShadowCandidateEvidenceLink[];
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_pricing_pattern_shadow_candidate_evidence" as never)
    .select("*")
    .in("candidate_id", candidateIds as never);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data)
    ? data.map((row) => parseCandidateEvidenceRow(row as Record<string, unknown>))
    : [];
}

function buildCandidateFromAcceptedProposal(params: {
  organizationId: string;
  runId: string;
  proposal: WorksheetPricingPatternProposal;
  supportEvents: ClassifiedWorksheetMemoryEvent[];
  contradictoryEvents: ClassifiedWorksheetMemoryEvent[];
  ignoredCount: number;
}) {
  const now = new Date().toISOString();
  const supportSnapshot = buildDiversitySnapshot(params.supportEvents);
  const contradictionSnapshot = params.contradictoryEvents.length > 0
    ? buildDiversitySnapshot(params.contradictoryEvents)
    : null;

  return {
    organization_id: params.organizationId,
    candidate_status: "active",
    pattern_family: params.proposal.patternFamily,
    pattern_type: params.proposal.patternType,
    current_strength: params.proposal.proposedStrength,
    confidence: params.proposal.confidence,
    title: params.proposal.title,
    summary: params.proposal.summary,
    retrieval_guidance: params.proposal.retrievalGuidance,
    scope: params.proposal.scope,
    pattern_value: params.proposal.patternValue,
    support_count: params.supportEvents.length,
    contradiction_count: params.contradictoryEvents.length,
    ignored_count: params.ignoredCount,
    support_diversity: serializeDiversitySnapshot(supportSnapshot),
    contradiction_diversity: contradictionSnapshot ? serializeDiversitySnapshot(contradictionSnapshot) : null,
    last_reinforced_at: params.supportEvents.length > 0 ? now : null,
    last_contradicted_at: params.contradictoryEvents.length > 0 ? now : null,
    stale_after: null,
    created_by_run_id: params.runId,
    last_updated_by_run_id: params.runId,
  };
}

async function upsertShadowCandidate(payload: Record<string, unknown>) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("upsert_worksheet_pricing_pattern_shadow_candidate" as never, {
    p_input: payload,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const response = (data ?? {}) as Record<string, unknown>;
  const candidateRecord =
    response.candidate && typeof response.candidate === "object" && !Array.isArray(response.candidate)
      ? response.candidate as Record<string, unknown>
      : response;

  return {
    candidate: parseCandidateRow(candidateRecord),
    inserted: typeof response.inserted === "boolean" ? response.inserted : true,
  };
}

async function updateShadowCandidate(candidateId: string, payload: Record<string, unknown>) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_pricing_pattern_shadow_candidates" as never)
    .update(payload as never)
    .eq("id", candidateId as never)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return parseCandidateRow((data ?? {}) as Record<string, unknown>);
}

async function upsertCandidateEvidenceLinks(links: Array<{
  candidateId: string;
  sourceEventId: string;
  evidenceRole: "supporting" | "contradictory" | "ignored";
  linkedByRunId: string;
}>) {
  if (links.length === 0) {
    return;
  }

  const admin = createAdminSupabaseClient();
  const payload = links.map((link) => ({
    candidate_id: link.candidateId,
    source_event_id: link.sourceEventId,
    evidence_role: link.evidenceRole,
    linked_by_run_id: link.linkedByRunId,
  }));

  const { error } = await admin
    .from("worksheet_pricing_pattern_shadow_candidate_evidence" as never)
    .upsert(payload as never, {
      onConflict: "candidate_id,source_event_id",
    } as never);

  if (error) {
    throw new Error(error.message);
  }
}

function buildShadowRunPayload(params: {
  runId?: string;
  requestedOrganizationId: string | null;
  limit: number;
  batchSize: number;
  summary: WorksheetPricingPatternShadowSummary;
}) {
  return {
    id: params.runId,
    requested_organization_id: params.requestedOrganizationId,
    input_limit_count: params.limit,
    input_batch_size: params.batchSize,
    fetched_event_count: params.summary.fetchedCount,
    pools_built: params.summary.poolsBuilt,
    proposals_returned: params.summary.proposalsReturned,
    accepted_by_gate_count: params.summary.acceptedByGate,
    rejected_by_gate_count: params.summary.rejectedByGate,
    no_pattern_count: params.summary.noPatternCount,
    family_distribution: params.summary.familyDistribution,
    strength_distribution: params.summary.strengthDistribution,
    rejection_reasons: params.summary.rejectionReasons,
    provider: params.summary.provider,
    model: params.summary.model,
    duration_ms: params.summary.durationMs,
  };
}

async function insertWorksheetPricingPatternShadowRun(params: {
  runId?: string;
  requestedOrganizationId: string | null;
  limit: number;
  batchSize: number;
  summary: WorksheetPricingPatternShadowSummary;
}) {
  const admin = createAdminSupabaseClient();
  const payload = buildShadowRunPayload(params);

  const query = await admin
    .from("worksheet_pricing_pattern_shadow_runs" as never)
    .insert(payload as never)
    .select("id")
    .single();

  if (query.error) {
    throw new Error(query.error.message);
  }

  return toNullableString((query.data as Record<string, unknown> | null)?.id);
}

async function updateWorksheetPricingPatternShadowRun(params: {
  runId: string;
  requestedOrganizationId: string | null;
  limit: number;
  batchSize: number;
  summary: WorksheetPricingPatternShadowSummary;
}) {
  const admin = createAdminSupabaseClient();
  const payload = buildShadowRunPayload(params);
  delete (payload as Record<string, unknown>).id;

  const { error } = await admin
    .from("worksheet_pricing_pattern_shadow_runs" as never)
    .update(payload as never)
    .eq("id", params.runId as never);

  if (error) {
    throw new Error(error.message);
  }
}

async function persistWorksheetPricingPatternShadowProposals(runId: string, proposals: WorksheetPricingPatternProposal[]) {
  const persistedProposals = proposals.filter((proposal) => proposal.gateStatus !== "no_pattern");
  if (persistedProposals.length === 0) {
    return;
  }

  const admin = createAdminSupabaseClient();
  const payload = persistedProposals.map((proposal) => ({
    run_id: runId,
    batch_id: proposal.batchId,
    organization_id: proposal.organizationId,
    gate_status: proposal.gateStatus,
    proposal_kind: proposal.proposalKind,
    pattern_family: proposal.patternFamily,
    pattern_type: proposal.patternType,
    title: proposal.title,
    summary: proposal.summary,
    retrieval_guidance: proposal.retrievalGuidance,
    confidence: proposal.confidence,
    proposed_strength: proposal.proposedStrength,
    scope: proposal.scope,
    pattern_value: proposal.patternValue,
    supporting_evidence_event_ids: proposal.supportingEvidenceEventIds,
    contradictory_evidence_event_ids: proposal.contradictoryEvidenceEventIds,
    ignored_evidence_event_ids: proposal.ignoredEvidenceEventIds,
    evidence_summary: proposal.evidenceSummary,
    contradiction_summary: proposal.contradictionSummary,
    validation: proposal.validation,
    rejection_reasons: proposal.rejectionReasons,
  }));

  const { error } = await admin
    .from("worksheet_pricing_pattern_shadow_proposals" as never)
    .insert(payload as never);

  if (error) {
    throw new Error(error.message);
  }
}

export async function runWorksheetPricingPatternProposalsShadowMode(
  input: RunWorksheetPricingPatternProposalsShadowModeInput,
) {
  const startedAt = Date.now();
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE));
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputTokens = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const minimumEvidenceCount = input.minimumEvidenceCount ?? DEFAULT_MINIMUM_EVIDENCE_COUNT;
  const minimumConfidence = input.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE;
  const maximumContradictionRatio = input.maximumContradictionRatio ?? DEFAULT_MAXIMUM_CONTRADICTION_RATIO;
  const providerModel = getPricingWorksheetAnthropicModel();
  const effectiveBatchSize = Math.max(batchSize, MINIMUM_POOL_EVIDENCE_COUNT);
  const batches = buildBatchesByOrganization(input.events, effectiveBatchSize);
  const proposals: WorksheetPricingPatternProposal[] = [];
  const rejectionReasons: Record<string, number> = {};
  const familyDistribution: Record<string, number> = {};
  const strengthDistribution: Record<string, number> = {};
  const skippedPoolReasons: Record<string, number> = {};
  let eligiblePoolCount = 0;
  let skippedPoolCount = 0;

  for (const batch of batches) {
    const poolDiversity = computePatternPoolDiversity(batch.events);
    const poolEligibility = computePatternPoolEligibility(poolDiversity);
    if (!poolEligibility.eligible) {
      skippedPoolCount += 1;
      skippedPoolReasons[poolEligibility.reason] = (skippedPoolReasons[poolEligibility.reason] ?? 0) + 1;
      console.info("[worksheet-pricing-pattern-shadow-skip]", {
        batchId: batch.batchId,
        organizationId: batch.organizationId,
        reason: poolEligibility.reason,
        strengthCeiling: poolEligibility.strengthCeiling,
        diversity: poolDiversity,
      });
      continue;
    }

    eligiblePoolCount += 1;
    const result = await callAnthropicWorksheetPricingPatternBatch(batch, {
      timeoutMs,
      maxOutputTokens,
    });

    const batchProposals = result.proposals.length > 0
      ? result.proposals
      : [{
          proposalKind: "no_pattern",
          patternFamily: null,
          patternType: null,
          title: null,
          summary: "No structured pricing pattern proposals returned.",
          retrievalGuidance: null,
          confidence: null,
          scope: {},
          patternValueSummary: null,
          patternSignals: [],
          supportingEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          contradictionReason: null,
          dominantAlternativePatternType: null,
        } satisfies RawWorksheetPricingPatternProposal];

    for (const proposal of batchProposals) {
      const validation = validateShadowProposal({
        batch,
        proposal,
        minimumEvidenceCount,
        minimumConfidence,
        maximumContradictionRatio,
      });
      for (const reason of validation.rejectionReasons) {
        rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
      }

      const evidenceSummary = buildEvidenceSummary(
        validation.supportEvents,
        validation.contradictionEvents,
        validation.ignoredEventIds,
        poolDiversity,
        validation.supportDiversity,
      );
      const proposedStrength = deriveProposedStrength(proposal.confidence, validation.supportEligibility);
      const normalizedProposal = applyStrengthLanguagePolicy({
        proposal,
        proposedStrength,
      });
      const gateStatus = validation.gateStatus;

      if (normalizedProposal.patternFamily) {
        familyDistribution[normalizedProposal.patternFamily] = (familyDistribution[normalizedProposal.patternFamily] ?? 0) + 1;
      } else if (gateStatus === "no_pattern") {
        familyDistribution.no_pattern = (familyDistribution.no_pattern ?? 0) + 1;
      }
      if (proposedStrength) {
        strengthDistribution[proposedStrength] = (strengthDistribution[proposedStrength] ?? 0) + 1;
      }

      proposals.push({
        proposalId: `${batch.batchId}:${proposals.length + 1}`,
        batchId: batch.batchId,
        organizationId: batch.organizationId,
        gateStatus,
        proposalKind: normalizedProposal.proposalKind,
        patternFamily: normalizedProposal.patternFamily,
        patternType: normalizedProposal.patternType,
        title: normalizedProposal.title,
        summary: normalizedProposal.summary,
        retrievalGuidance: normalizedProposal.retrievalGuidance,
        confidence: normalizedProposal.confidence,
        proposedStrength,
        scope: normalizedProposal.scope,
        patternValue: {
          summary: normalizedProposal.patternValueSummary,
          signals: normalizedProposal.patternSignals,
        },
        supportingEvidenceEventIds: Array.from(new Set(normalizedProposal.supportingEvidenceEventIds)),
        contradictoryEvidenceEventIds: Array.from(new Set(normalizedProposal.contradictoryEvidenceEventIds)),
        ignoredEvidenceEventIds: validation.ignoredEventIds,
        evidenceSummary,
        contradictionSummary: {
          contradictionRatio: validation.contradictionRatio,
          contradictionReason: normalizedProposal.contradictionReason,
          dominantAlternativePatternType: normalizedProposal.dominantAlternativePatternType,
        },
        validation: {
          structurallyValid: !validation.rejectionReasons.includes("proposal_payload_invalid"),
          passedMinimumEvidence: !validation.rejectionReasons.includes("evidence_count_below_threshold"),
          passedConfidenceThreshold: !validation.rejectionReasons.includes("confidence_below_threshold"),
          passedContradictionThreshold: !validation.rejectionReasons.includes("contradiction_level_too_high"),
          passedScopeCoherence: validation.passedScopeCoherence,
          poolEligibilityReason: poolEligibility.reason,
          poolStrengthCeiling: poolEligibility.strengthCeiling,
          poolDiversity,
          supportEligibilityReason: validation.supportEligibility.reason,
          supportStrengthCeiling: validation.supportEligibility.strengthCeiling,
          supportDiversity: validation.supportDiversity,
        },
        rejectionReasons: validation.rejectionReasons,
      });
    }

    void result.providerResult;
  }

  const summary = {
    fetchedCount: input.events.filter((event) => event.classificationStatus === "classified").length,
    poolsBuilt: batches.length,
    eligiblePoolCount,
    skippedPoolCount,
    skippedPoolReasons,
    proposalsReturned: proposals.length,
    acceptedByGate: proposals.filter((proposal) => proposal.gateStatus === "accepted").length,
    rejectedByGate: proposals.filter((proposal) => proposal.gateStatus === "rejected").length,
    noPatternCount: proposals.filter((proposal) => proposal.gateStatus === "no_pattern").length,
    familyDistribution,
    strengthDistribution,
    rejectionReasons,
    provider: "anthropic" as const,
    model: providerModel,
    durationMs: Date.now() - startedAt,
    proposals,
  } satisfies WorksheetPricingPatternShadowSummary;

  console.info("[worksheet-pricing-pattern-shadow]", {
    fetchedCount: summary.fetchedCount,
    poolsBuilt: summary.poolsBuilt,
    eligiblePoolCount: summary.eligiblePoolCount,
    skippedPoolCount: summary.skippedPoolCount,
    skippedPoolReasons: summary.skippedPoolReasons,
    proposalsReturned: summary.proposalsReturned,
    acceptedByGate: summary.acceptedByGate,
    rejectedByGate: summary.rejectedByGate,
    noPatternCount: summary.noPatternCount,
    familyDistribution: summary.familyDistribution,
    strengthDistribution: summary.strengthDistribution,
    rejectionReasons: summary.rejectionReasons,
    provider: summary.provider,
    model: summary.model,
    durationMs: summary.durationMs,
  });

  return summary;
}

async function processCandidateMatchedEvents(params: {
  runId: string;
  organizationId: string;
  events: ClassifiedWorksheetMemoryEvent[];
  candidates: WorksheetPricingPatternShadowCandidate[];
  candidateLinks: WorksheetPricingPatternShadowCandidateEvidenceLink[];
}) {
  const proposals: WorksheetPricingPatternProposal[] = [];
  const candidateMap = new Map(params.candidates.map((candidate) => [candidate.id, candidate]));
  const candidateLinksById = new Map<string, WorksheetPricingPatternShadowCandidateEvidenceLink[]>();
  for (const link of params.candidateLinks) {
    const existing = candidateLinksById.get(link.candidateId) ?? [];
    existing.push(link);
    candidateLinksById.set(link.candidateId, existing);
  }

  let candidateUpdatedCount = 0;
  for (const event of params.events) {
    const match = chooseBestCandidateMatch(event, Array.from(candidateMap.values()));
    if (!match) {
      continue;
    }

    const candidate = match.candidate;
    const existingLinks = candidateLinksById.get(candidate.id) ?? [];
    const existingEventIds = new Set(existingLinks.map((link) => link.sourceEventId));
    if (existingEventIds.has(event.eventId)) {
      continue;
    }

    const role = match.relation === "contradict" ? "contradictory" as const : "supporting" as const;
    await upsertCandidateEvidenceLinks([{
      candidateId: candidate.id,
      sourceEventId: event.eventId,
      evidenceRole: role,
      linkedByRunId: params.runId,
    }]);

    const now = new Date().toISOString();
    const supportEvents = role === "supporting" ? [event] : [];
    const contradictionEvents = role === "contradictory" ? [event] : [];
    const updatedSupportCount = candidate.supportCount + supportEvents.length;
    const updatedContradictionCount = candidate.contradictionCount + contradictionEvents.length;
    const updatedSupportSnapshot = supportEvents.length > 0
      ? mergeDiversitySnapshot(candidate.supportDiversity, supportEvents)
      : parseDiversitySnapshot(candidate.supportDiversity);
    const updatedContradictionSnapshot = contradictionEvents.length > 0
      ? mergeDiversitySnapshot(candidate.contradictionDiversity ?? {}, contradictionEvents)
      : (candidate.contradictionDiversity ? parseDiversitySnapshot(candidate.contradictionDiversity) : null);
    const supportEligibility = computePatternSupportEligibility(updatedSupportSnapshot);
    const updatedStrength = deriveProposedStrength(candidate.confidence, supportEligibility) ?? candidate.currentStrength;
    const contradictionRatio = updatedSupportCount === 0 ? 0 : updatedContradictionCount / updatedSupportCount;
    const updatedStatus = contradictionRatio > DEFAULT_MAXIMUM_CONTRADICTION_RATIO ? "contested" : "active";

    const updatedCandidate = await updateShadowCandidate(candidate.id, {
      candidate_status: updatedStatus,
      current_strength: updatedStrength,
      support_count: updatedSupportCount,
      contradiction_count: updatedContradictionCount,
      ignored_count: candidate.ignoredCount,
      support_diversity: serializeDiversitySnapshot(updatedSupportSnapshot),
      contradiction_diversity: updatedContradictionSnapshot ? serializeDiversitySnapshot(updatedContradictionSnapshot) : null,
      last_reinforced_at: supportEvents.length > 0 ? now : candidate.lastReinforcedAt,
      last_contradicted_at: contradictionEvents.length > 0 ? now : candidate.lastContradictedAt,
      last_updated_by_run_id: params.runId,
      updated_at: now,
    });

    candidateMap.set(updatedCandidate.id, updatedCandidate);
    candidateLinksById.set(updatedCandidate.id, [
      ...existingLinks,
      {
        id: `${updatedCandidate.id}:${event.eventId}`,
        candidateId: updatedCandidate.id,
        sourceEventId: event.eventId,
        evidenceRole: role,
        linkedByRunId: params.runId,
        createdAt: now,
      },
    ]);
    candidateUpdatedCount += 1;

    proposals.push({
      proposalId: `${params.organizationId}:candidate-update:${proposals.length + 1}`,
      batchId: `${params.organizationId}:candidate-update`,
      organizationId: params.organizationId,
      gateStatus: "accepted",
      proposalKind: "pattern",
      patternFamily: updatedCandidate.patternFamily,
      patternType: updatedCandidate.patternType,
      title: updatedCandidate.title,
      summary: updatedCandidate.summary,
      retrievalGuidance: updatedCandidate.retrievalGuidance,
      confidence: updatedCandidate.confidence,
      proposedStrength: updatedCandidate.currentStrength,
      scope: updatedCandidate.scope,
      patternValue: updatedCandidate.patternValue,
      supportingEvidenceEventIds: role === "supporting" ? [event.eventId] : [],
      contradictoryEvidenceEventIds: role === "contradictory" ? [event.eventId] : [],
      ignoredEvidenceEventIds: [],
      evidenceSummary: {
        supportCount: updatedCandidate.supportCount,
        contradictionCount: updatedCandidate.contradictionCount,
        ignoredCount: updatedCandidate.ignoredCount,
        supportDiversity: serializeDiversitySnapshot(updatedSupportSnapshot),
      },
      contradictionSummary: {
        contradictionRatio,
      },
      validation: {
        incrementalCandidateUpdate: true,
        relation: match.relation,
      },
      rejectionReasons: [],
    });
  }

  return {
    proposals,
    candidateUpdatedCount,
    updatedCandidates: Array.from(candidateMap.values()),
  };
}

async function createCandidatesFromAcceptedProposals(params: {
  runId: string;
  proposals: WorksheetPricingPatternProposal[];
  eventsById: Map<string, ClassifiedWorksheetMemoryEvent>;
}) {
  const createdCandidates: WorksheetPricingPatternShadowCandidate[] = [];
  let insertedCount = 0;

  for (const proposal of params.proposals.filter((proposal) => proposal.gateStatus === "accepted" && proposal.proposalKind === "pattern")) {
    const supportEvents = proposal.supportingEvidenceEventIds
      .map((eventId) => params.eventsById.get(eventId))
      .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event));
    const contradictionEvents = proposal.contradictoryEvidenceEventIds
      .map((eventId) => params.eventsById.get(eventId))
      .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event));
    const candidatePayload = buildCandidateFromAcceptedProposal({
      organizationId: proposal.organizationId,
      runId: params.runId,
      proposal,
      supportEvents,
      contradictoryEvents: contradictionEvents,
      ignoredCount: proposal.ignoredEvidenceEventIds.length,
    });
    const signatures = buildShadowCandidateSignatures({
      organizationId: proposal.organizationId,
      patternFamily: proposal.patternFamily,
      patternType: proposal.patternType,
      scope: proposal.scope,
      patternValue: proposal.patternValue,
    });
    const upsertedCandidate = await upsertShadowCandidate({
      ...candidatePayload,
      scope_signature: signatures.scopeSignature,
      pattern_value_signature: signatures.patternValueSignature,
      candidate_signature: signatures.candidateSignature,
      signature_uniqueness_enabled: true,
    });
    const candidate = upsertedCandidate.candidate;

    await upsertCandidateEvidenceLinks([
      ...supportEvents.map((event) => ({
        candidateId: candidate.id,
        sourceEventId: event.eventId,
        evidenceRole: "supporting" as const,
        linkedByRunId: params.runId,
      })),
      ...contradictionEvents.map((event) => ({
        candidateId: candidate.id,
        sourceEventId: event.eventId,
        evidenceRole: "contradictory" as const,
        linkedByRunId: params.runId,
      })),
      ...proposal.ignoredEvidenceEventIds.map((eventId) => ({
        candidateId: candidate.id,
        sourceEventId: eventId,
        evidenceRole: "ignored" as const,
        linkedByRunId: params.runId,
      })),
    ]);

    createdCandidates.push(candidate);
    if (upsertedCandidate.inserted) {
      insertedCount += 1;
    }
  }

  return {
    candidates: createdCandidates,
    insertedCount,
  };
}

export async function runWorksheetPricingPatternShadowDerivation(
  input: RunWorksheetPricingPatternShadowDerivationInput = {},
) {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT));
  const events = await listClassifiedWorksheetMemoryEvents({
    organizationId: input.organizationId ?? null,
    limit,
  });

  const summary = await runWorksheetPricingPatternProposalsShadowMode({
    events,
    batchSize: input.batchSize,
    timeoutMs: input.timeoutMs,
    maxOutputTokens: input.maxOutputTokens,
    minimumEvidenceCount: input.minimumEvidenceCount,
    minimumConfidence: input.minimumConfidence,
    maximumContradictionRatio: input.maximumContradictionRatio,
  });

  const runId = await insertWorksheetPricingPatternShadowRun({
    requestedOrganizationId: input.organizationId ?? null,
    limit,
    batchSize: Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE)),
    summary,
  });

  if (runId) {
    await persistWorksheetPricingPatternShadowProposals(runId, summary.proposals);
  }

  return {
    ...summary,
    runId: runId ?? undefined,
  } satisfies WorksheetPricingPatternShadowSummary;
}

export async function runWorksheetPricingPatternShadowIncremental(
  input: RunWorksheetPricingPatternShadowIncrementalInput = {},
) {
  const startedAt = Date.now();
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT));
  const runId = crypto.randomUUID();
  const initialSummary = {
    runId,
    fetchedCount: 0,
    poolsBuilt: 0,
    eligiblePoolCount: 0,
    skippedPoolCount: 0,
    skippedPoolReasons: {},
    proposalsReturned: 0,
    acceptedByGate: 0,
    rejectedByGate: 0,
    noPatternCount: 0,
    familyDistribution: {},
    strengthDistribution: {},
    rejectionReasons: {},
    provider: "anthropic" as const,
    model: getPricingWorksheetAnthropicModel(),
    durationMs: 0,
    proposals: [],
    processedEventCount: 0,
    failedEventCount: 0,
    candidateCreatedCount: 0,
    candidateUpdatedCount: 0,
  } satisfies WorksheetPricingPatternShadowSummary;
  await insertWorksheetPricingPatternShadowRun({
    runId,
    requestedOrganizationId: input.organizationId ?? null,
    limit,
    batchSize: Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE)),
    summary: initialSummary,
  });
  const allClassifiedEvents = await listClassifiedWorksheetMemoryEvents({
    organizationId: input.organizationId ?? null,
    limit,
  }) as ClassifiedWorksheetMemoryEvent[];
  const classifiedEvents = allClassifiedEvents.filter((event: ClassifiedWorksheetMemoryEvent) => event.classificationStatus === "classified");

  await enqueuePendingProcessingRows(classifiedEvents);
  const claimedRows = await claimPatternProcessingRows({
    events: classifiedEvents,
    organizationId: input.organizationId ?? null,
    limit,
    runId,
  });
  const classifiedEventsByKey = new Map(
    classifiedEvents.map((event: ClassifiedWorksheetMemoryEvent) => [`${event.eventId}:${event.classificationVersion}`, event] as const),
  );
  const claimableEvents = claimedRows
    .map((row) => classifiedEventsByKey.get(`${row.sourceEventId}:${row.classificationVersion}`) ?? null)
    .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event));

  const organizations = Array.from(new Set(claimableEvents.map((event: ClassifiedWorksheetMemoryEvent) => event.organizationId)));
  const fullScanProposals: WorksheetPricingPatternProposal[] = [];
  const incrementalProposals: WorksheetPricingPatternProposal[] = [];
  let failedEventCount = 0;
  let candidateCreatedCount = 0;
  let candidateUpdatedCount = 0;

  try {
    for (const organizationId of organizations) {
      const orgEvents = claimableEvents.filter((event: ClassifiedWorksheetMemoryEvent) => event.organizationId === organizationId);
      const existingCandidates = await loadExistingShadowCandidates(organizationId);
      const existingLinks = await loadCandidateEvidenceLinks(existingCandidates.map((candidate) => candidate.id));

      const matchedEventIds = new Set<string>();
      const candidateMatchedEvents = orgEvents.filter((event) => {
        const match = chooseBestCandidateMatch(event, existingCandidates);
        if (match) {
          matchedEventIds.add(event.eventId);
          return true;
        }
        return false;
      });
      const unmatchedEvents = orgEvents.filter((event) => !matchedEventIds.has(event.eventId));

      const candidateUpdateResult = await processCandidateMatchedEvents({
        runId,
        organizationId,
        events: candidateMatchedEvents,
        candidates: existingCandidates,
        candidateLinks: existingLinks,
      });
      incrementalProposals.push(...candidateUpdateResult.proposals);
      candidateUpdatedCount += candidateUpdateResult.candidateUpdatedCount;

      if (unmatchedEvents.length > 0) {
        const fullScanSummary = await runWorksheetPricingPatternProposalsShadowMode({
          events: unmatchedEvents,
          batchSize: input.batchSize,
          timeoutMs: input.timeoutMs,
          maxOutputTokens: input.maxOutputTokens,
          minimumEvidenceCount: input.minimumEvidenceCount,
          minimumConfidence: input.minimumConfidence,
          maximumContradictionRatio: input.maximumContradictionRatio,
        });
        fullScanProposals.push(...fullScanSummary.proposals);
        const created = await createCandidatesFromAcceptedProposals({
          runId,
          proposals: fullScanSummary.proposals,
          eventsById: new Map(unmatchedEvents.map((event: ClassifiedWorksheetMemoryEvent) => [event.eventId, event])),
        });
        candidateCreatedCount += created.insertedCount;
      }
    }

    await finalizePatternProcessingRows({
      rows: claimedRows,
      status: "processed",
    });
  } catch (error) {
    failedEventCount = claimableEvents.length;
    await finalizePatternProcessingRows({
      rows: claimedRows,
      status: "retry_scheduled",
      errorCode: "incremental_processing_failed",
      errorMessage: error instanceof Error ? error.message : "Incremental worksheet pricing pattern processing failed.",
    });
    const failedSummary = {
      runId,
      fetchedCount: classifiedEvents.length,
      poolsBuilt: organizations.length,
      eligiblePoolCount: 0,
      skippedPoolCount: 0,
      skippedPoolReasons: {},
      proposalsReturned: [...incrementalProposals, ...fullScanProposals].length,
      acceptedByGate: [...incrementalProposals, ...fullScanProposals].filter((proposal) => proposal.gateStatus === "accepted").length,
      rejectedByGate: [...incrementalProposals, ...fullScanProposals].filter((proposal) => proposal.gateStatus === "rejected").length,
      noPatternCount: [...incrementalProposals, ...fullScanProposals].filter((proposal) => proposal.gateStatus === "no_pattern").length,
      familyDistribution: [...incrementalProposals, ...fullScanProposals].reduce<Record<string, number>>((acc, proposal) => {
        const key = proposal.patternFamily ?? proposal.gateStatus;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
      strengthDistribution: [...incrementalProposals, ...fullScanProposals].reduce<Record<string, number>>((acc, proposal) => {
        if (proposal.proposedStrength) {
          acc[proposal.proposedStrength] = (acc[proposal.proposedStrength] ?? 0) + 1;
        }
        return acc;
      }, {}),
      rejectionReasons: [...incrementalProposals, ...fullScanProposals].reduce<Record<string, number>>((acc, proposal) => {
        for (const reason of proposal.rejectionReasons) {
          acc[reason] = (acc[reason] ?? 0) + 1;
        }
        return acc;
      }, {}),
      provider: "anthropic" as const,
      model: getPricingWorksheetAnthropicModel(),
      durationMs: Date.now() - startedAt,
      proposals: [...incrementalProposals, ...fullScanProposals],
      processedEventCount: 0,
      failedEventCount,
      candidateCreatedCount,
      candidateUpdatedCount,
    } satisfies WorksheetPricingPatternShadowSummary;
    await updateWorksheetPricingPatternShadowRun({
      runId,
      requestedOrganizationId: input.organizationId ?? null,
      limit,
      batchSize: Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE)),
      summary: failedSummary,
    });
    throw error;
  }

  const proposals = [...incrementalProposals, ...fullScanProposals];
  const summary = {
    runId,
    fetchedCount: classifiedEvents.length,
    poolsBuilt: organizations.length,
    eligiblePoolCount: 0,
    skippedPoolCount: 0,
    skippedPoolReasons: {},
    proposalsReturned: proposals.length,
    acceptedByGate: proposals.filter((proposal) => proposal.gateStatus === "accepted").length,
    rejectedByGate: proposals.filter((proposal) => proposal.gateStatus === "rejected").length,
    noPatternCount: proposals.filter((proposal) => proposal.gateStatus === "no_pattern").length,
    familyDistribution: proposals.reduce<Record<string, number>>((acc, proposal) => {
      const key = proposal.patternFamily ?? proposal.gateStatus;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    strengthDistribution: proposals.reduce<Record<string, number>>((acc, proposal) => {
      if (proposal.proposedStrength) {
        acc[proposal.proposedStrength] = (acc[proposal.proposedStrength] ?? 0) + 1;
      }
      return acc;
    }, {}),
    rejectionReasons: proposals.reduce<Record<string, number>>((acc, proposal) => {
      for (const reason of proposal.rejectionReasons) {
        acc[reason] = (acc[reason] ?? 0) + 1;
      }
      return acc;
    }, {}),
    provider: "anthropic" as const,
    model: getPricingWorksheetAnthropicModel(),
    durationMs: Date.now() - startedAt,
    proposals,
    processedEventCount: claimableEvents.length - failedEventCount,
    failedEventCount,
    candidateCreatedCount,
    candidateUpdatedCount,
  } satisfies WorksheetPricingPatternShadowSummary;

  await updateWorksheetPricingPatternShadowRun({
    runId,
    requestedOrganizationId: input.organizationId ?? null,
    limit,
    batchSize: Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE)),
    summary,
  });
  await persistWorksheetPricingPatternShadowProposals(runId, proposals);

  return summary;
}

export const worksheetPricingPatternShadowTestUtils = {
  buildBatchesByOrganization,
  buildShadowCandidateSignatures,
  buildCompactWorksheetPricingPatternEvent,
  computePatternPoolDiversity,
  computePatternPoolEligibility,
  computePatternSupportEligibility,
  buildDiversitySnapshot,
  mergeDiversitySnapshot,
  chooseBestCandidateMatch,
  buildWorksheetPricingPatternProposalUserPrompt,
  buildWorksheetPricingPatternProposalSchema,
  buildWorksheetPricingPatternProposalSystemPrompt,
  createCandidatesFromAcceptedProposals,
  normalizeRawPatternProposal,
  validateShadowProposal,
};
