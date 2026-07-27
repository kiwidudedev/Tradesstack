import "server-only";

import { createHash } from "node:crypto";
import { getPricingWorksheetAiProvider, getPricingWorksheetAnthropicModel } from "@/lib/ai/providers/pricing-worksheet/registry";
import {
  isPricingWorksheetProviderError,
  type PricingWorksheetProviderResponse,
} from "@/lib/ai/providers/pricing-worksheet/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  type ClassifiedWorksheetMemoryEvent,
} from "@/lib/worksheet-memory-derivation";

export type WorksheetMemorySemanticPoolQueueState =
  | "pending"
  | "claimed"
  | "retry_scheduled"
  | "completed"
  | "dead_lettered";

export type WorksheetMemorySemanticPoolStatus =
  | "active"
  | "contested"
  | "stale"
  | "superseded"
  | "rejected";

export type WorksheetMemorySemanticPoolMaturityStatus =
  | "emerging"
  | "ready_for_synthesis"
  | "reinforced"
  | "durable"
  | "contested";

export type WorksheetMemorySemanticPoolEvidenceRole = "included" | "excluded" | "adjacent" | "uncertain";
type SemanticNoPoolReasonCode =
  | "insufficient_diversity"
  | "structural_incoherence"
  | "mixed_behaviours"
  | "contradictory_evidence"
  | "weak_reusability"
  | "missing_context"
  | "already_represented"
  | "target_ambiguity"
  | "other";

export type WorksheetMemorySemanticPoolQueueRow = {
  id: string;
  organizationId: string;
  seedPoolId: string;
  seedPoolSignature: string;
  seedPoolRevisionHash: string;
  seedMaturityStatus: string;
  queueState: WorksheetMemorySemanticPoolQueueState;
  attemptCount: number;
  maxAttempts: number;
  priority: number;
  availableAt: string | null;
  retryAfter: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  claimedBy: string | null;
  claimToken: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type WorksheetMemoryEvidenceSeedPool = {
  id: string;
  organizationId: string;
  poolSignature: string;
  scopeSignature: string;
  targetSignature: string;
  poolKind: string;
  eventType: string;
  scopeContext: Record<string, Json | null>;
  targetContext: Record<string, Json | null>;
  evidenceCount: number;
  worksheetCount: number;
  workbookCount: number;
  projectCount: number;
  supportCount: number;
  contradictionCount: number;
  ignoredCount: number;
  averageConfidence: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  poolRevisionHash: string;
  maturityStatus: string;
};

type WorksheetMemorySemanticPoolRunRow = {
  id: string;
  requestedOrganizationId: string | null;
  claimedJobCount: number;
  completedJobCount: number;
  retriedJobCount: number;
  deadLetteredJobCount: number;
  semanticPoolCount: number;
  noPoolCount: number;
  candidateEventCount: number;
  provider: string | null;
  model: string | null;
  durationMs: number;
  diagnosticSummary: Record<string, Json | null>;
};

export type WorksheetMemorySemanticPool = {
  id: string;
  organizationId: string;
  semanticSignature: string;
  domainLabel: string | null;
  domainSummary: string | null;
  groupingRationale: string | null;
  variantSummary: string | null;
  semanticFamily: string | null;
  semanticType: string | null;
  poolStatus: WorksheetMemorySemanticPoolStatus;
  maturityStatus: WorksheetMemorySemanticPoolMaturityStatus;
  title: string | null;
  summary: string | null;
  retrievalGuidance: string | null;
  scopePayload: Record<string, Json | null>;
  poolValuePayload: Record<string, Json | null>;
  evidenceSummary: Record<string, Json | null>;
  contradictionSummary: Record<string, Json | null>;
  supportCount: number;
  contradictionCount: number;
  ignoredCount: number;
  includedCount: number;
  excludedCount: number;
  adjacentCount: number;
  uncertainCount: number;
  worksheetCount: number;
  workbookCount: number;
  projectCount: number;
  averageConfidence: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastGroupedAt: string | null;
  sourceRevisionHash: string;
  createdByRunId: string | null;
  lastUpdatedByRunId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WorksheetMemorySemanticPoolEvidenceItem = {
  sourceEventId: string;
  evidenceRole: WorksheetMemorySemanticPoolEvidenceRole;
  classificationRecordId: string | null;
  linkedByRunId: string | null;
  eventType: string | null;
  occurredAt: string | null;
  projectId: string | null;
  opportunityId: string | null;
  metadata: Record<string, Json | null>;
  diffData: Record<string, Json | null>;
  classification: {
    overallConfidence: number | null;
    reasoningSummary: string | null;
    semanticFields: Record<string, Json | null>;
    interpretationPayload: Record<string, Json | null>;
    classifiedAt: string | null;
  } | null;
};

export type WorksheetMemorySemanticPoolMetrics = {
  organizationId: string | null;
  queueStateCounts: Record<string, number>;
  poolStatusCounts: Record<string, number>;
  maturityDistribution: Record<string, number>;
  averageConfidence: number | null;
  averageIncludedCount: number | null;
  deadLetteredQueueCount: number;
};

type CompactWorksheetSemanticGroupingEvent = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  worksheet: {
    sheetName: string | null;
    worksheetName: string | null;
    tradePackage: string | null;
  };
  anchor: {
    rowLabel: string | null;
    itemLabel: string | null;
    columnHeader: string | null;
    unit: string | null;
  };
  change: {
    oldValue: Json | null;
    newValue: Json | null;
    oldFormula: string | null;
    newFormula: string | null;
  };
  semanticFields: Record<string, Json | null>;
  interpretation: Record<string, Json | null>;
  futureUseSummary: Record<string, Json | null>;
  confidenceDetail: Record<string, Json | null>;
  quality: {
    overallConfidence: number | null;
    captureCompletenessScore: number | null;
    missingCriticalContext: boolean | null;
  };
};

type SemanticGroupingBatch = {
  batchId: string;
  organizationId: string;
  seedQueueRowId: string;
  seedPoolId: string;
  seedPoolSignature: string;
  seedPoolRevisionHash: string;
  seedPoolMaturityStatus: string;
  stagingPools: WorksheetMemoryEvidenceSeedPool[];
  oppositeDirectionPools: WorksheetMemoryEvidenceSeedPool[];
  selectedPoolIds: string[];
  sourceLinks: SemanticGroupingSourceLink[];
  events: ClassifiedWorksheetMemoryEvent[];
  existingDomainContext: SemanticGroupingExistingDomainContext;
};

type SemanticCandidateSummary = {
  candidateDomainLabel: string | null;
  inputName: string | null;
  description: string | null;
  unit: string | null;
  repeatedTransition: string | null;
  evidenceSpread: string;
  structuralProof: string | null;
  downstreamRoleSummary: string | null;
  pricingTupleShapeSummary: string | null;
  stage6ConfidenceSummary: string | null;
};

type SemanticGroupingSourceLink = {
  organizationId: string;
  stage6PoolId: string;
  stage6PoolSignature: string;
  stage6PoolRevisionHash: string;
  sourceEventId: string;
  classificationRecordId: string;
  occurredAt: string | null;
};

type SemanticGroupingExistingSemanticPoolContext = {
  id: string;
  semanticSignature: string;
  domainLabel: string | null;
  domainSummary: string | null;
  variantSummary: string | null;
  semanticFamily: string | null;
  semanticType: string | null;
  poolStatus: string;
  maturityStatus: string;
  sourceRevisionHash: string;
  supportCount: number;
  contradictionCount: number;
  projectCount: number;
  worksheetCount: number;
  workbookCount: number;
  averageConfidence: number | null;
  lastSeenAt: string;
  targetEquivalenceKey: string | null;
  canonicalTargetSelectionReason: string | null;
  collapsedAlternativeSemanticPoolIds: string[];
  collapsedAlternativeMemoryIds: string[];
  targetRankingInputs: Record<string, Json | null>;
};

type SemanticGroupingExistingMemoryContext = {
  id: string;
  title: string | null;
  memoryCategory: string | null;
  memoryType: string | null;
  memoryKey: string | null;
  memoryDomainSignature: string | null;
  confidenceScore: number | null;
  reinforcementCount: number;
  contradictionCount: number;
  isActive: boolean;
  sourceSemanticPoolId: string | null;
};

type SemanticGroupingExistingDomainContext = {
  relatedSemanticPools: SemanticGroupingExistingSemanticPoolContext[];
  activeMemories: SemanticGroupingExistingMemoryContext[];
  canonicalTargetSemanticPoolId: string | null;
  canonicalTargetSelectionReason: string | null;
  collapsedAlternativeSemanticPoolIds: string[];
  collapsedAlternativeMemoryIds: string[];
  targetEquivalenceKey: string | null;
  providerSawCanonicalTargetsOnly: boolean;
};

type RawSemanticPoolProposal = {
  proposalKind: "evidence_domain" | "reinforce_existing_semantic_pool" | "no_pool";
  domainLabel: string | null;
  domainSummary: string | null;
  groupingRationale: string | null;
  variantSummary: string | null;
  confidence: number | null;
  noPoolReasonCode?: SemanticNoPoolReasonCode | null;
  noPoolReasonSummary?: string | null;
  targetSemanticPoolId?: string | null;
  reasonSummary?: string | null;
  includedEvidenceEventIds: string[];
  excludedEvidenceEventIds: string[];
  adjacentEvidenceEventIds: string[];
  uncertainEvidenceEventIds: string[];
};

type ValidatedSemanticPoolProposal = {
  proposalId: string;
  batchId: string;
  organizationId: string;
  proposalKind: "evidence_domain" | "reinforce_existing_semantic_pool" | "no_pool";
  domainLabel: string | null;
  domainSummary: string | null;
  groupingRationale: string | null;
  variantSummary: string | null;
  confidence: number | null;
  noPoolReasonCode: SemanticNoPoolReasonCode | null;
  noPoolReasonSummary: string | null;
  targetSemanticPoolId: string | null;
  reasonSummary: string | null;
  includedEvidenceEventIds: string[];
  excludedEvidenceEventIds: string[];
  adjacentEvidenceEventIds: string[];
  uncertainEvidenceEventIds: string[];
  evidenceSummary: Record<string, Json | null>;
  semanticSignature: string | null;
  sourceRevisionHash: string | null;
  poolStatus: WorksheetMemorySemanticPoolStatus;
  maturityStatus: WorksheetMemorySemanticPoolMaturityStatus;
};

type SemanticGroupingRunDiagnostic = {
  queueRowId: string;
  seedPoolId: string;
  candidatePoolIds: string[];
  oppositeDirectionPoolIds: string[];
  candidateEventCount: number;
  relatedSemanticPoolIds: string[];
  relatedMemoryIds: string[];
  canonicalTargetSemanticPoolId: string | null;
  canonicalTargetSelectionReason: string | null;
  collapsedAlternativeSemanticPoolIds: string[];
  collapsedAlternativeMemoryIds: string[];
  targetEquivalenceKey: string | null;
  targetRankingInputs: Record<string, Json | null> | null;
  providerSawCanonicalTargetsOnly: boolean;
  outcome: "semantic_pool" | "reinforce_existing_semantic_pool" | "no_pool";
  targetSemanticPoolId: string | null;
  includedEvidenceEventIds: string[];
  includedClassificationRecordIds: string[];
  sourceRevisionHash: string | null;
  stage8QueueInsertCount: number;
  reasonSummary: string | null;
  noPoolReasonCode: SemanticNoPoolReasonCode | null;
  noPoolReasonSummary: string | null;
  semanticCandidateSummaryPresent: boolean;
  rejectedDespiteStructuralIdentityStrong: boolean;
  deterministicMode: "provider" | "deterministic_bucket";
  deterministicReason: string | null;
};

export type RunWorksheetMemorySemanticPoolWorkerInput = {
  organizationId?: string | null;
  limit?: number;
  batchEventLimit?: number;
  maxSeedPoolCount?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  workerId?: string | null;
  leaseSeconds?: number;
};

export type RunWorksheetMemorySemanticPoolWorkerOutput = {
  runId: string;
  claimedJobCount: number;
  completedJobCount: number;
  retriedJobCount: number;
  deadLetteredJobCount: number;
  semanticPoolCount: number;
  noPoolCount: number;
  candidateEventCount: number;
  provider: "anthropic";
  model: string;
  durationMs: number;
};

const DEFAULT_LIMIT = 12;
const DEFAULT_MAX_SEED_POOL_COUNT = 8;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;
const DEFAULT_LEASE_SECONDS = 600;
const DEFAULT_WORKER_ID = "worksheet-memory-semantic-pool-runner";
const MAX_STAGE7_PROMPT_EVENT_COUNT = 12;
const MAX_STAGE7_STAGING_POOL_SUMMARY_COUNT = 6;
const MAX_STAGE7_EQUIVALENT_TARGET_COUNT = 4;

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

function isSemanticNoPoolReasonCode(value: string | null): value is SemanticNoPoolReasonCode {
  return value === "insufficient_diversity"
    || value === "structural_incoherence"
    || value === "mixed_behaviours"
    || value === "contradictory_evidence"
    || value === "weak_reusability"
    || value === "missing_context"
    || value === "already_represented"
    || value === "target_ambiguity"
    || value === "other";
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
      Object.entries(value).slice(0, 16).map(([key, entry]) => [key, compactJsonValue(entry)]),
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

function compactSeedPoolScopeContext(value: unknown) {
  const context = compactJsonRecord(value, 24);
  if (isJsonRecord(value) && isJsonRecord(value.structuralSignaturePayload)) {
    context.structuralSignaturePayload = compactJsonRecord(value.structuralSignaturePayload, 32) as Json;
  }
  return context;
}

function compactStringArray(value: unknown, maxItems = 6) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, maxItems);
}

function humanizeToken(value: unknown) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringifyCompactValue(value: Json | null) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function compactUniqueStrings(values: Array<string | null | undefined>, maxItems = 8) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = humanizeToken(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) {
      break;
    }
  }
  return result;
}

function firstJsonString(...values: unknown[]) {
  for (const value of values) {
    const normalized = toNullableString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function jsonPath(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const part of path) {
    if (!isJsonRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function normalizeSignatureToken(value: unknown) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }

  return normalized.toLowerCase().replace(/\s+/g, " ").trim();
}

function hashSignaturePayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactSortedArray(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => toNullableString(value)).filter((value): value is string => Boolean(value)))).sort();
}

function compactLimitedArray<T>(values: T[], limit: number) {
  return values.slice(0, Math.max(0, limit));
}

function countDefinedValues(values: Array<unknown>) {
  return values.filter((value) => value !== null && value !== undefined && value !== "").length;
}

function isNumericJsonValue(value: Json | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildSeedPoolCoreScopeFingerprint(pool: Pick<WorksheetMemoryEvidenceSeedPool, "poolKind" | "eventType" | "scopeContext">) {
  return {
    poolKind: normalizeSignatureToken(pool.poolKind),
    eventType: normalizeSignatureToken(pool.eventType),
    normalizedTradePackage: normalizeSignatureToken(pool.scopeContext.normalizedTradePackage ?? pool.scopeContext.tradePackage),
    pageType: normalizeSignatureToken(pool.scopeContext.pageType),
    sectionType: normalizeSignatureToken(pool.scopeContext.sectionType),
    itemCategory: normalizeSignatureToken(pool.scopeContext.itemCategory),
    normalizedUnit: normalizeSignatureToken(pool.scopeContext.normalizedUnit),
    costRole: normalizeSignatureToken(pool.scopeContext.costRole),
    itemLabel: normalizeSignatureToken(pool.scopeContext.itemLabel),
    rowLabel: normalizeSignatureToken(pool.scopeContext.rowLabel),
    columnHeader: normalizeSignatureToken(pool.scopeContext.columnHeader),
  };
}

function buildSeedPoolChangeFingerprint(pool: Pick<WorksheetMemoryEvidenceSeedPool, "poolKind" | "targetContext">) {
  const oldFormula = toNullableString(pool.targetContext.oldFormula);
  const newFormula = toNullableString(pool.targetContext.newFormula);
  const oldValue = compactJsonValue(pool.targetContext.oldValue as Json | undefined);
  const newValue = compactJsonValue(pool.targetContext.newValue as Json | undefined);
  const itemCategory = normalizeSignatureToken(pool.targetContext.itemCategory ?? null);
  const targetKind = normalizeSignatureToken(pool.targetContext.kind ?? pool.poolKind);

  let direction: string | null = null;
  if (oldFormula || newFormula) {
    direction = "formula_change";
  } else if (isNumericJsonValue(oldValue) && isNumericJsonValue(newValue)) {
    direction = newValue > oldValue ? "increase" : newValue < oldValue ? "decrease" : "unchanged";
  } else if (oldValue === null && newValue !== null) {
    direction = "set";
  } else if (oldValue !== null && newValue === null) {
    direction = "cleared";
  } else if (oldValue !== null || newValue !== null) {
    direction = "changed";
  }

  return {
    targetKind,
    changeDimension:
      itemCategory
      ?? normalizeSignatureToken(pool.targetContext.columnHeader)
      ?? normalizeSignatureToken(pool.targetContext.summary)
      ?? targetKind,
    direction,
  };
}

function hasSameSemanticScope(seed: WorksheetMemoryEvidenceSeedPool, candidate: WorksheetMemoryEvidenceSeedPool) {
  const seedScope = buildSeedPoolCoreScopeFingerprint(seed);
  const candidateScope = buildSeedPoolCoreScopeFingerprint(candidate);

  const exactKeys: Array<keyof typeof seedScope> = [
    "normalizedTradePackage",
    "pageType",
    "sectionType",
    "itemCategory",
    "normalizedUnit",
    "costRole",
  ];
  for (const key of exactKeys) {
    if (seedScope[key] && candidateScope[key] && seedScope[key] !== candidateScope[key]) {
      return false;
    }
  }

  if (seedScope.columnHeader && candidateScope.columnHeader && seedScope.columnHeader !== candidateScope.columnHeader) {
    return false;
  }

  return true;
}

function classifySeedPoolDirectionRelationship(seed: WorksheetMemoryEvidenceSeedPool, candidate: WorksheetMemoryEvidenceSeedPool) {
  const seedChange = buildSeedPoolChangeFingerprint(seed);
  const candidateChange = buildSeedPoolChangeFingerprint(candidate);

  if (seedChange.targetKind && candidateChange.targetKind && seedChange.targetKind !== candidateChange.targetKind) {
    return "mismatch" as const;
  }
  if (seedChange.changeDimension && candidateChange.changeDimension && seedChange.changeDimension !== candidateChange.changeDimension) {
    return "mismatch" as const;
  }
  if (seedChange.direction && candidateChange.direction) {
    if (seedChange.direction === candidateChange.direction) {
      return "same" as const;
    }
    const oppositeDirections =
      (seedChange.direction === "increase" && candidateChange.direction === "decrease")
      || (seedChange.direction === "decrease" && candidateChange.direction === "increase")
      || (seedChange.direction === "set" && candidateChange.direction === "cleared")
      || (seedChange.direction === "cleared" && candidateChange.direction === "set");
    if (oppositeDirections) {
      return "opposite" as const;
    }
    return "mismatch" as const;
  }

  return "same" as const;
}

function buildStage6StructuralCoherenceSummary(pool: WorksheetMemoryEvidenceSeedPool) {
  const structuralPayloadRaw = isJsonRecord(pool.scopeContext.structuralSignaturePayload)
    ? pool.scopeContext.structuralSignaturePayload
    : {};
  const structuralPayload = isJsonRecord(structuralPayloadRaw)
    ? compactJsonRecord(structuralPayloadRaw, 18)
    : {};
  const structuralIdentityStrong =
    typeof pool.scopeContext.structuralIdentityStrong === "boolean"
      ? pool.scopeContext.structuralIdentityStrong
      : null;
  const structuralIdentityStrengthScore = toNullableNumber(pool.scopeContext.structuralIdentityStrengthScore);
  const sectionPath = compactStringArray(structuralPayloadRaw.sectionPath, 6);
  const relatedRowShape = compactStringArray(structuralPayloadRaw.relatedRowShape, 4);
  const pricingTupleShape = compactStringArray(structuralPayloadRaw.pricingTupleShape, 6);
  const oldValue = compactJsonValue(pool.targetContext.oldValue);
  const newValue = compactJsonValue(pool.targetContext.newValue);
  const oldFormula = compactJsonValue(pool.targetContext.oldFormula);
  const newFormula = compactJsonValue(pool.targetContext.newFormula);

  let valueDirection: string | null = null;
  if (oldFormula || newFormula) {
    valueDirection = "formula_transition";
  } else if (isNumericJsonValue(oldValue) && isNumericJsonValue(newValue)) {
    valueDirection = newValue > oldValue ? "increase" : newValue < oldValue ? "decrease" : "unchanged";
  } else if (oldValue === null && newValue !== null) {
    valueDirection = "set";
  } else if (oldValue !== null && newValue === null) {
    valueDirection = "cleared";
  } else if (oldValue !== null || newValue !== null) {
    valueDirection = "changed";
  }

  const structuralScopeSummary = {
    workbookDomain: compactJsonValue(structuralPayload.workbookDomain),
    worksheetDomain: compactJsonValue(structuralPayload.worksheetDomain),
    sectionPath,
    sectionLabel: compactJsonValue(structuralPayload.sectionLabel),
    subsectionLabel: compactJsonValue(structuralPayload.subsectionLabel),
    rowLabel: compactJsonValue(structuralPayload.rowLabel ?? pool.scopeContext.rowLabel),
    itemLabel: compactJsonValue(structuralPayload.itemLabel ?? pool.scopeContext.itemLabel),
    description: compactJsonValue(structuralPayload.description),
    columnRole: compactJsonValue(structuralPayload.columnRole),
    columnHeader: compactJsonValue(structuralPayload.columnHeader ?? pool.scopeContext.columnHeader),
    normalizedUnit: compactJsonValue(structuralPayload.normalizedUnit ?? pool.scopeContext.normalizedUnit),
  };

  return {
    structuralIdentityStrong,
    structuralIdentityStrengthScore,
    structuralIdentitySummary:
      structuralIdentityStrong === true
        ? "Stage 6 found strong worksheet-derived structural identity across the linked evidence."
        : "Stage 6 did not mark worksheet-derived structural identity as strong.",
    targetSignature: pool.targetSignature,
    structuralScopeSummary,
    diversitySummary: {
      evidenceCount: pool.evidenceCount,
      worksheetCount: pool.worksheetCount,
      workbookCount: pool.workbookCount,
      projectCount: pool.projectCount,
    },
    downstreamRoleSummary: {
      relatedRowShape,
      downstreamFormulaRoleShape: compactStringArray(
        structuralPayloadRaw.downstreamFormulaRoleShape ?? structuralPayloadRaw.downstreamRoleShape,
        4,
      ),
    },
    pricingTupleShapeSummary: pricingTupleShape,
    valueTransitionSummary: {
      targetKind: compactJsonValue(pool.targetContext.kind),
      oldValue,
      newValue,
      oldFormula,
      newFormula,
      valueDirection,
      valueType: compactJsonValue(structuralPayload.valueType),
      priorValueType: compactJsonValue(structuralPayload.priorValueType),
      transitionKind: compactJsonValue(structuralPayload.transitionKind),
    },
  } satisfies Record<string, Json | null>;
}

function summarizeRelatedRowShape(rows: string[]) {
  if (rows.length === 0) {
    return null;
  }
  return `Related downstream row shape includes ${rows.slice(0, 3).join("; ")}.`;
}

function buildSemanticCandidateSummary(batch: SemanticGroupingBatch): SemanticCandidateSummary | null {
  const seedPool = batch.stagingPools.find((pool) => pool.id === batch.seedPoolId) ?? batch.stagingPools[0];
  if (!seedPool) {
    return null;
  }

  const structuralPayload = isJsonRecord(seedPool.scopeContext.structuralSignaturePayload)
    ? seedPool.scopeContext.structuralSignaturePayload
    : {};
  const structuralSummary = buildStage6StructuralCoherenceSummary(seedPool);
  const structuralScope = isJsonRecord(structuralSummary.structuralScopeSummary)
    ? structuralSummary.structuralScopeSummary
    : {};
  const diversity = isJsonRecord(structuralSummary.diversitySummary)
    ? structuralSummary.diversitySummary
    : {};
  const downstream = isJsonRecord(structuralSummary.downstreamRoleSummary)
    ? structuralSummary.downstreamRoleSummary
    : {};

  const domain = humanizeToken(
    structuralPayload.workbookDomain
    ?? structuralPayload.worksheetDomain
    ?? seedPool.scopeContext.normalizedTradePackage
    ?? seedPool.scopeContext.tradePackage,
  );
  const inputName = humanizeToken(
    structuralPayload.itemLabel
    ?? seedPool.scopeContext.itemLabel
    ?? structuralPayload.rowLabel
    ?? seedPool.scopeContext.rowLabel,
  );
  const description = humanizeToken(
    structuralPayload.description
    ?? seedPool.targetContext.summary
    ?? batch.events.map((event) => jsonPath(event.interpretationPayload, ["interpretedChange", "observed", "changeSummary"]))
      .find((value) => toNullableString(value)),
  );
  const unit = humanizeToken(
    structuralPayload.normalizedUnit
    ?? seedPool.scopeContext.normalizedUnit
    ?? batch.events.map((event) => event.diffData.unit ?? jsonPath(event.interpretationPayload, ["interpretedChange", "unit"]))
      .find((value) => toNullableString(value)),
  );
  const roleTokens = compactUniqueStrings([
    seedPool.scopeContext.costRole as string | null,
    seedPool.scopeContext.itemCategory as string | null,
  ], 3);
  const candidateDomainLabel = compactUniqueStrings([
    domain,
    ...roleTokens,
    inputName,
  ], 5).join(" ") || null;
  const oldValue = compactJsonValue(seedPool.targetContext.oldValue);
  const newValue = compactJsonValue(seedPool.targetContext.newValue);
  const oldFormula = compactJsonValue(seedPool.targetContext.oldFormula);
  const newFormula = compactJsonValue(seedPool.targetContext.newFormula);
  const transition = oldFormula || newFormula
    ? `${stringifyCompactValue(oldFormula)} -> ${stringifyCompactValue(newFormula)}`
    : oldValue !== null || newValue !== null
      ? `${stringifyCompactValue(oldValue)} -> ${stringifyCompactValue(newValue)}`
      : null;
  const evidenceCount = toNullableNumber(diversity.evidenceCount) ?? seedPool.evidenceCount;
  const worksheetCount = toNullableNumber(diversity.worksheetCount) ?? seedPool.worksheetCount;
  const workbookCount = toNullableNumber(diversity.workbookCount) ?? seedPool.workbookCount;
  const projectCount = toNullableNumber(diversity.projectCount) ?? seedPool.projectCount;
  const relatedRowShape = compactStringArray(downstream.relatedRowShape, 4);
  const pricingTupleShape = compactStringArray(structuralSummary.pricingTupleShapeSummary, 6);
  const proofParts = compactUniqueStrings([
    structuralScope.workbookDomain as string | null,
    structuralScope.rowLabel as string | null,
    structuralScope.itemLabel as string | null,
    structuralScope.columnRole as string | null,
    structuralScope.normalizedUnit as string | null,
    relatedRowShape.length > 0 ? "related downstream row shape" : null,
  ], 8);

  return {
    candidateDomainLabel,
    inputName,
    description,
    unit,
    repeatedTransition: transition ? `${transition} repeated ${evidenceCount} ${evidenceCount === 1 ? "time" : "times"}` : null,
    evidenceSpread: `${evidenceCount} events across ${worksheetCount} worksheets, ${workbookCount} workbooks, ${projectCount} projects`,
    structuralProof:
      proofParts.length > 0
        ? `Stage 6 structural identity: ${proofParts.join("; ")}.`
        : structuralSummary.structuralIdentitySummary as string | null,
    downstreamRoleSummary: summarizeRelatedRowShape(relatedRowShape),
    pricingTupleShapeSummary: pricingTupleShape.length > 0 ? pricingTupleShape.join(" + ") : null,
    stage6ConfidenceSummary: `maturity=${seedPool.maturityStatus}; averageConfidence=${seedPool.averageConfidence ?? "unknown"}; structuralIdentityStrong=${structuralSummary.structuralIdentityStrong ?? "unknown"}; structuralIdentityStrengthScore=${structuralSummary.structuralIdentityStrengthScore ?? "unknown"}`,
  };
}

function semanticCandidateSummaryPresent(batch: SemanticGroupingBatch) {
  return buildSemanticCandidateSummary(batch) !== null;
}

function hasStrongStructuralIdentity(batch: SemanticGroupingBatch) {
  return batch.stagingPools.some((pool) => pool.scopeContext.structuralIdentityStrong === true);
}

function hasStrongStructuralIdentityThreshold(batch: SemanticGroupingBatch) {
  return batch.stagingPools.some((pool) =>
    pool.scopeContext.structuralIdentityStrong === true
    && (toNullableNumber(pool.scopeContext.structuralIdentityStrengthScore) ?? 0) >= 7,
  );
}

function hasEligibleMaturityStatus(batch: SemanticGroupingBatch) {
  return batch.stagingPools.every((pool) =>
    pool.maturityStatus === "ready_for_synthesis"
    || pool.maturityStatus === "reinforced"
    || pool.maturityStatus === "durable",
  );
}

function matchesExistingMaturityRules(batch: SemanticGroupingBatch) {
  return batch.stagingPools.every((pool) => {
    if (pool.maturityStatus === "durable") {
      return pool.evidenceCount >= 8 && pool.worksheetCount >= 4 && pool.projectCount >= 3;
    }
    if (pool.maturityStatus === "reinforced") {
      return pool.evidenceCount >= 5 && pool.worksheetCount >= 3 && pool.projectCount >= 2;
    }
    if (pool.maturityStatus === "ready_for_synthesis") {
      return pool.evidenceCount >= 2 && pool.worksheetCount >= 2 && pool.projectCount >= 2;
    }
    return false;
  });
}

function hasStableTargetSignature(batch: SemanticGroupingBatch) {
  const targetSignatures = compactSortedArray(batch.stagingPools.map((pool) => pool.targetSignature));
  return targetSignatures.length === 1 && targetSignatures[0]?.length > 0;
}

function hasExactClassificationProvenance(batch: SemanticGroupingBatch) {
  if (batch.events.length === 0 || batch.sourceLinks.length === 0) {
    return false;
  }

  const eventIds = new Set(batch.events.map((event) => event.eventId));
  return batch.sourceLinks.every((link) =>
    link.classificationRecordId.length > 0
    && link.stage6PoolRevisionHash.length > 0
    && eventIds.has(link.sourceEventId),
  );
}

function hasContradictoryEvidence(batch: SemanticGroupingBatch) {
  return batch.stagingPools.some((pool) => pool.contradictionCount > 0) || batch.oppositeDirectionPools.length > 0;
}

function hasMixedEvidence(batch: SemanticGroupingBatch) {
  const scopeSignatures = compactSortedArray(batch.stagingPools.map((pool) => pool.scopeSignature));
  const poolKinds = compactSortedArray(batch.stagingPools.map((pool) => pool.poolKind));
  const eventTypes = compactSortedArray(batch.stagingPools.map((pool) => pool.eventType));
  return scopeSignatures.length > 1 || poolKinds.length > 1 || eventTypes.length > 1;
}

function hasUnsafeDuplicateTarget(batch: SemanticGroupingBatch) {
  return batch.existingDomainContext.relatedSemanticPools.length > 1;
}

function buildDeterministicBucketSemanticSignature(batch: SemanticGroupingBatch) {
  const seedPool = batch.stagingPools.find((pool) => pool.id === batch.seedPoolId) ?? batch.stagingPools[0];
  return hashSignaturePayload({
    organizationId: normalizeSignatureToken(batch.organizationId),
    bucketVersion: 1,
    mode: "deterministic_behavior_bucket",
    poolKind: normalizeSignatureToken(seedPool?.poolKind),
    eventType: normalizeSignatureToken(seedPool?.eventType),
    scopeSignature: normalizeSignatureToken(seedPool?.scopeSignature),
    targetSignature: normalizeSignatureToken(seedPool?.targetSignature),
  });
}

function buildDeterministicBucketLabel(batch: SemanticGroupingBatch) {
  const seedPool = batch.stagingPools.find((pool) => pool.id === batch.seedPoolId) ?? batch.stagingPools[0];
  const itemLabel = humanizeToken(seedPool?.scopeContext.itemLabel);
  const costRole = humanizeToken(seedPool?.scopeContext.costRole);
  const itemCategory = humanizeToken(seedPool?.scopeContext.itemCategory);

  if (itemLabel) {
    return `Repeated worksheet parameter: ${itemLabel}`;
  }
  if (costRole) {
    return `Repeated pricing input: ${costRole}`;
  }
  if (itemCategory) {
    return `Repeated estimating input: ${itemCategory}`;
  }
  return "Repeated worksheet behaviour";
}

function buildDeterministicBucketSummary(batch: SemanticGroupingBatch) {
  const seedPool = batch.stagingPools.find((pool) => pool.id === batch.seedPoolId) ?? batch.stagingPools[0];
  const itemLabel = humanizeToken(seedPool?.scopeContext.itemLabel) ?? "worksheet parameter";
  const tradePackage = humanizeToken(
    seedPool?.scopeContext.normalizedTradePackage ?? seedPool?.scopeContext.tradePackage,
  );
  const pageType = humanizeToken(seedPool?.scopeContext.pageType) ?? "worksheet inputs";
  const unit = humanizeToken(seedPool?.scopeContext.normalizedUnit);
  const unitSummary = unit ? ` using ${unit}` : "";
  const tradeSummary = tradePackage ? ` for ${tradePackage}` : "";

  return `Neutral bucket for repeated worksheet behaviour around ${itemLabel}${tradeSummary} in ${pageType}${unitSummary}.`;
}

function buildDeterministicBucketReason(batch: SemanticGroupingBatch) {
  const seedPool = batch.stagingPools.find((pool) => pool.id === batch.seedPoolId) ?? batch.stagingPools[0];
  return [
    "Deterministic Stage 7 behaviour bucket created from strong Stage 6 structural proof.",
    `maturity=${seedPool?.maturityStatus ?? "unknown"}`,
    `evidenceCount=${seedPool?.evidenceCount ?? 0}`,
    `worksheetCount=${seedPool?.worksheetCount ?? 0}`,
    `workbookCount=${seedPool?.workbookCount ?? 0}`,
    `projectCount=${seedPool?.projectCount ?? 0}`,
  ].join(" ");
}

function getDeterministicBucketEligibilityFailure(batch: SemanticGroupingBatch) {
  if (!hasStrongStructuralIdentity(batch)) {
    return "Stage 6 did not prove strong structural identity.";
  }
  if (!hasStrongStructuralIdentityThreshold(batch)) {
    return "Stage 6 structural identity strength score was below the strong threshold.";
  }
  if (!hasEligibleMaturityStatus(batch)) {
    return "Stage 6 pool maturity was below the deterministic bucket threshold.";
  }
  if (!matchesExistingMaturityRules(batch)) {
    return "Stage 6 maturity counts did not satisfy the existing rules.";
  }
  if (!hasStableTargetSignature(batch)) {
    return "Stage 6 target signature was not stable across the candidate pools.";
  }
  if (!hasExactClassificationProvenance(batch)) {
    return "Exact classification provenance was incomplete for deterministic bucket creation.";
  }
  if (hasMixedEvidence(batch)) {
    return "Candidate evidence mixed multiple worksheet behaviours.";
  }
  if (hasContradictoryEvidence(batch)) {
    return "Candidate evidence contained contradictory or opposite-direction behaviour.";
  }
  if (hasUnsafeDuplicateTarget(batch)) {
    return "Multiple existing Stage 7 targets were present, so deterministic bucket selection was unsafe.";
  }
  return null;
}

function buildRetryAfter(attemptCount: number, nowIso: string) {
  const safeAttempt = Math.max(attemptCount, 1);
  const minutes = Math.min(5 * (2 ** (safeAttempt - 1)), 24 * 60);
  return new Date(Date.parse(nowIso) + minutes * 60 * 1000).toISOString();
}

function buildCompactWorksheetSemanticGroupingEvent(event: ClassifiedWorksheetMemoryEvent): CompactWorksheetSemanticGroupingEvent {
  const interpretationPayload = compactJsonRecord(event.interpretationPayload, 24);
  const interpretedChange =
    isJsonRecord(interpretationPayload.interpretedChange)
      ? compactJsonRecord(interpretationPayload.interpretedChange, 24)
      : {};
  const observed = isJsonRecord(interpretedChange.observed)
    ? compactJsonRecord(interpretedChange.observed, 16)
    : {};
  const interpretation = isJsonRecord(interpretedChange.interpretation)
    ? compactJsonRecord(interpretedChange.interpretation, 16)
    : {};
  const futureUse = isJsonRecord(interpretedChange.futureUse)
    ? compactJsonRecord(interpretedChange.futureUse, 16)
    : {};
  const futureUseSummary = compactJsonRecord(event.futureUseSummary, 8);
  const plainEnglishSummary = firstJsonString(
    interpretedChange.plainEnglishSummary,
    observed.plainEnglishSummary,
    observed.changeSummary,
    interpretedChange.whatChanged,
  );
  const constructionMeaning = firstJsonString(
    interpretedChange.constructionMeaning,
    interpretation.constructionContext,
    interpretedChange.constructionContext,
    interpretedChange.businessMeaning,
  );
  const memoryType = firstJsonString(
    interpretedChange.memoryType,
    futureUse.memoryType,
    futureUseSummary.memoryType,
  );

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    worksheet: {
      sheetName: toNullableString(event.metadata.sheetName),
      worksheetName: toNullableString(event.metadata.worksheetName),
      tradePackage: toNullableString(event.metadata.tradePackage),
    },
    anchor: {
      rowLabel: toNullableString(event.diffData.rowLabel),
      itemLabel: toNullableString(event.diffData.itemLabel),
      columnHeader: toNullableString(event.diffData.columnHeader),
      unit: toNullableString(event.diffData.unit),
    },
    change: {
      oldValue: compactJsonValue(event.diffData.oldValue as Json | undefined),
      newValue: compactJsonValue(event.diffData.newValue as Json | undefined),
      oldFormula: toNullableString(event.diffData.oldFormula),
      newFormula: toNullableString(event.diffData.newFormula),
    },
    semanticFields: {
      normalizedTradePackage: compactJsonValue(event.semanticFields.normalizedTradePackage),
      pageType: compactJsonValue(event.semanticFields.pageType),
      sectionType: compactJsonValue(event.semanticFields.sectionType),
      itemCategory: compactJsonValue(event.semanticFields.itemCategory),
      normalizedUnit: compactJsonValue(event.semanticFields.normalizedUnit),
      costRole: compactJsonValue(event.semanticFields.costRole),
    },
    interpretation: {
      plainEnglishSummary,
      constructionMeaning,
      pricingMeaning: compactJsonValue(interpretedChange.pricingMeaning as Json | undefined),
      memoryType,
    },
    futureUseSummary,
    confidenceDetail: compactJsonRecord(event.confidenceDetail, 8),
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

function buildSemanticPoolScopeFingerprint(pool: Pick<WorksheetMemorySemanticPool, "semanticFamily" | "semanticType" | "scopePayload" | "poolValuePayload">) {
  return {
    semanticFamily: normalizeSignatureToken(pool.semanticFamily),
    semanticType: normalizeSignatureToken(pool.semanticType),
    normalizedTradePackage:
      normalizeSignatureToken(pool.scopePayload.normalizedTradePackage ?? pool.scopePayload.tradePackage ?? pool.poolValuePayload.tradePackage),
    pageType: normalizeSignatureToken(pool.scopePayload.pageType),
    sectionType: normalizeSignatureToken(pool.scopePayload.sectionType),
    itemCategory: normalizeSignatureToken(pool.scopePayload.itemCategory),
    normalizedUnit: normalizeSignatureToken(pool.scopePayload.normalizedUnit),
    costRole: normalizeSignatureToken(pool.scopePayload.costRole),
    assumptionName:
      normalizeSignatureToken(pool.poolValuePayload.assumptionName ?? pool.poolValuePayload.assumptionLabel ?? pool.scopePayload.itemLabel),
    changeDimension:
      normalizeSignatureToken(pool.poolValuePayload.changeDimension ?? pool.poolValuePayload.assumptionName ?? pool.poolValuePayload.assumptionLabel),
    targetKind: normalizeSignatureToken(pool.poolValuePayload.targetKind),
  };
}

function buildSemanticPoolDirectionFingerprint(pool: Pick<WorksheetMemorySemanticPool, "poolValuePayload">) {
  const previousValue = compactJsonValue(pool.poolValuePayload.previousValue as Json | undefined);
  const currentValue = compactJsonValue(pool.poolValuePayload.currentValue as Json | undefined);

  let direction: string | null = null;
  if (isNumericJsonValue(previousValue) && isNumericJsonValue(currentValue)) {
    direction = currentValue > previousValue ? "increase" : currentValue < previousValue ? "decrease" : "unchanged";
  } else if (previousValue === null && currentValue !== null) {
    direction = "set";
  } else if (previousValue !== null && currentValue === null) {
    direction = "cleared";
  } else if (previousValue !== null || currentValue !== null) {
    direction = "changed";
  }

  return {
    previousValue,
    currentValue,
    direction,
    contextSensitive: Boolean(pool.poolValuePayload.contextSensitive),
    bidirectionalRevisionObserved: Boolean(pool.poolValuePayload.bidirectionalRevisionObserved),
  };
}

function buildCanonicalTargetRankingInputs(params: {
  pool: WorksheetMemorySemanticPool;
  linkedMemories: SemanticGroupingExistingMemoryContext[];
}) {
  const highestMemoryConfidence = params.linkedMemories.reduce<number | null>((best, memory) => {
    if (typeof memory.confidenceScore !== "number") {
      return best;
    }
    if (best === null || memory.confidenceScore > best) {
      return memory.confidenceScore;
    }
    return best;
  }, null);

  return {
    activeMemoryCount: params.linkedMemories.length,
    supportCount: params.pool.supportCount,
    projectCount: params.pool.projectCount,
    worksheetCount: params.pool.worksheetCount,
    workbookCount: params.pool.workbookCount,
    highestMemoryConfidence,
    lastSeenAt: params.pool.lastSeenAt,
  } satisfies Record<string, Json | null>;
}

function compareCanonicalTargetRanking(
  left: { pool: WorksheetMemorySemanticPool; linkedMemories: SemanticGroupingExistingMemoryContext[] },
  right: { pool: WorksheetMemorySemanticPool; linkedMemories: SemanticGroupingExistingMemoryContext[] },
) {
  if (left.pool.poolStatus !== right.pool.poolStatus) {
    return left.pool.poolStatus === "active" ? -1 : 1;
  }
  if ((left.linkedMemories.length > 0) !== (right.linkedMemories.length > 0)) {
    return left.linkedMemories.length > 0 ? -1 : 1;
  }
  if (left.pool.supportCount !== right.pool.supportCount) {
    return right.pool.supportCount - left.pool.supportCount;
  }
  if (left.pool.projectCount !== right.pool.projectCount) {
    return right.pool.projectCount - left.pool.projectCount;
  }
  if (left.pool.worksheetCount !== right.pool.worksheetCount) {
    return right.pool.worksheetCount - left.pool.worksheetCount;
  }
  if (left.pool.workbookCount !== right.pool.workbookCount) {
    return right.pool.workbookCount - left.pool.workbookCount;
  }

  const leftBestMemory = left.linkedMemories.reduce<number | null>((best, memory) => {
    if (typeof memory.confidenceScore !== "number") {
      return best;
    }
    return best === null || memory.confidenceScore > best ? memory.confidenceScore : best;
  }, null);
  const rightBestMemory = right.linkedMemories.reduce<number | null>((best, memory) => {
    if (typeof memory.confidenceScore !== "number") {
      return best;
    }
    return best === null || memory.confidenceScore > best ? memory.confidenceScore : best;
  }, null);
  if ((leftBestMemory ?? -1) !== (rightBestMemory ?? -1)) {
    return (rightBestMemory ?? -1) - (leftBestMemory ?? -1);
  }
  if (left.pool.lastSeenAt !== right.pool.lastSeenAt) {
    return right.pool.lastSeenAt.localeCompare(left.pool.lastSeenAt);
  }
  return left.pool.id.localeCompare(right.pool.id);
}

function buildSemanticTargetEquivalenceKey(params: {
  organizationId: string;
  pool: WorksheetMemorySemanticPool;
  linkedMemories: SemanticGroupingExistingMemoryContext[];
}) {
  const scope = buildSemanticPoolScopeFingerprint(params.pool);
  const direction = buildSemanticPoolDirectionFingerprint(params.pool);
  const memoryDomainSignatures = compactSortedArray(params.linkedMemories.map((memory) => memory.memoryDomainSignature));

  const baseFingerprint = {
    organizationId: normalizeSignatureToken(params.organizationId),
    semanticFamily: scope.semanticFamily,
    semanticType: scope.semanticType,
    normalizedTradePackage: scope.normalizedTradePackage,
    pageType: scope.pageType,
    sectionType: scope.sectionType,
    itemCategory: scope.itemCategory,
    normalizedUnit: scope.normalizedUnit,
    costRole: scope.costRole,
    assumptionName: scope.assumptionName,
    changeDimension: scope.changeDimension,
    targetKind: scope.targetKind,
  };

  if (memoryDomainSignatures.length > 0) {
    return hashSignaturePayload({
      ...baseFingerprint,
      memoryDomainSignatures,
    });
  }

  if (countDefinedValues(Object.values(baseFingerprint)) < 4) {
    return null;
  }

  return hashSignaturePayload({
    ...baseFingerprint,
    direction: direction.contextSensitive || direction.bidirectionalRevisionObserved ? "context_sensitive" : direction.direction,
    previousValueType: previousValueType(direction.previousValue),
    currentValueType: previousValueType(direction.currentValue),
    previousValue: direction.contextSensitive || direction.bidirectionalRevisionObserved ? null : direction.previousValue,
    currentValue: direction.contextSensitive || direction.bidirectionalRevisionObserved ? null : direction.currentValue,
  });
}

function previousValueType(value: Json | null) {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function buildSemanticEventStructuralFingerprint(event: ClassifiedWorksheetMemoryEvent) {
  return {
    eventType: normalizeSignatureToken(event.eventType),
    tradePackage: normalizeSignatureToken(toNullableString(event.metadata.tradePackage)),
    worksheetName: normalizeSignatureToken(toNullableString(event.metadata.worksheetName)),
    rowLabel: normalizeSignatureToken(toNullableString(event.diffData.rowLabel)),
    itemLabel: normalizeSignatureToken(toNullableString(event.diffData.itemLabel)),
    columnHeader: normalizeSignatureToken(toNullableString(event.diffData.columnHeader)),
    unit: normalizeSignatureToken(toNullableString(event.diffData.unit)),
    normalizedTradePackage: normalizeSignatureToken(
      isJsonRecord(event.semanticFields.normalizedTradePackage)
        ? toNullableString(event.semanticFields.normalizedTradePackage.value)
        : null,
    ),
    pageType: normalizeSignatureToken(
      isJsonRecord(event.semanticFields.pageType)
        ? toNullableString(event.semanticFields.pageType.value)
        : null,
    ),
    sectionType: normalizeSignatureToken(
      isJsonRecord(event.semanticFields.sectionType)
        ? toNullableString(event.semanticFields.sectionType.value)
        : null,
    ),
    itemCategory: normalizeSignatureToken(
      isJsonRecord(event.semanticFields.itemCategory)
        ? toNullableString(event.semanticFields.itemCategory.value)
        : null,
    ),
    normalizedUnit: normalizeSignatureToken(
      isJsonRecord(event.semanticFields.normalizedUnit)
        ? toNullableString(event.semanticFields.normalizedUnit.value)
        : null,
    ),
    costRole: normalizeSignatureToken(
      isJsonRecord(event.semanticFields.costRole)
        ? toNullableString(event.semanticFields.costRole.value)
        : null,
    ),
    changeKind:
      toNullableString(event.diffData.oldFormula) || toNullableString(event.diffData.newFormula)
        ? "formula_transition"
        : "value_transition",
  };
}

function buildWorksheetMemorySemanticGroupingSystemPrompt() {
  return [
    "You are grouping classified worksheet evidence into neutral evidence-domain clusters for later memory synthesis.",
    "Your job is only to organize which pieces of evidence belong together.",
    "Stage 7 does not decide company memory, company standards, future recommendations, reinforcement, contradiction, or confidence.",
    "Stage 7 only decides whether evidence records belong to a coherent neutral semantic evidence domain.",
    "Do not infer company preference, company standard, contradiction, company behavior, or company memory conclusions.",
    "Use only the supplied classified worksheet evidence.",
    "Read the supplied existing semantic-domain context as historical context only.",
    "Existing semantic pools or memories can indicate that a pattern is already represented, context-sensitive, or previously split, but they must not force grouping.",
    "Group by construction and pricing relatedness, not by exact labels.",
    "Do not rely on hardcoded synonyms, trade dictionaries, item mappings, or worksheet terminology.",
    "Use Stage 6 structural-coherence context as evidence about worksheet-derived identity when it is present.",
    "Repeated estimating assumptions can form neutral semantic domains, including productivity assumptions, labour assumptions, material assumptions, waste factors, margins, markups, rates, and quantity assumptions.",
    "Creating a semantic pool does not mean company preference, company standard, future recommendation, or organization memory.",
    "Stage 8 remains responsible for memory, no_memory, reinforcement, contradiction, and confidence decisions.",
    "Treat opposite-direction variants deliberately. They may share a neutral domain only when the evidence clearly shows a bidirectional or context-sensitive parameter, not by default.",
    "You may return one of three proposal kinds: evidence_domain, reinforce_existing_semantic_pool, or no_pool.",
    "Use evidence_domain only when the evidence forms a new neutral evidence domain.",
    "Use reinforce_existing_semantic_pool when the evidence clearly supports one existing semantic pool supplied in context and does not justify a duplicate domain.",
    "Evidence that is already represented is not automatically no_pool. If the packet adds net-new support to one existing semantic pool, prefer reinforce_existing_semantic_pool over no_pool.",
    "If multiple existing semantic pools appear equivalent in meaning, you may still choose reinforce_existing_semantic_pool by selecting the strongest ranked matching target rather than defaulting to no_pool.",
    "Do not reinforce based on vague similarity or when multiple targets remain plausible and ambiguous.",
    "Return included, excluded, adjacent, and uncertain evidence ids for every proposal that uses evidence.",
    "Return no_pool when the evidence is too weak, mixed, already represented, already fully credited, or ambiguous to form a coherent evidence-domain action from the provided candidate evidence.",
    "When you return no_pool, provide one noPoolReasonCode from the schema, a short truthful noPoolReasonSummary, and a reasonSummary that explains why reinforce_existing_semantic_pool was not safe or useful.",
    "If Stage 6 structuralIdentityStrong is true and you still return no_pool, explain exactly what overrode the worksheet-derived structural coherence.",
    "Do not write retrieval guidance or memory conclusions.",
    "Memory synthesis later decides what the grouped evidence means.",
    "Return valid JSON only.",
  ].join("\n");
}

function buildWorksheetMemorySemanticGroupingUserPrompt(batch: SemanticGroupingBatch) {
  const semanticCandidateSummary = buildSemanticCandidateSummary(batch);
  const stagingSummary = batch.stagingPools.slice(0, MAX_STAGE7_STAGING_POOL_SUMMARY_COUNT).map((pool) => ({
    poolId: pool.id,
    poolKind: pool.poolKind,
    eventType: pool.eventType,
    maturityStatus: pool.maturityStatus,
    scopeContext: {
      tradePackage: compactJsonValue(pool.scopeContext.tradePackage),
      normalizedTradePackage: compactJsonValue(pool.scopeContext.normalizedTradePackage),
      pageType: compactJsonValue(pool.scopeContext.pageType),
      itemCategory: compactJsonValue(pool.scopeContext.itemCategory),
      normalizedUnit: compactJsonValue(pool.scopeContext.normalizedUnit),
      costRole: compactJsonValue(pool.scopeContext.costRole),
    },
    targetContext: {
      oldValue: compactJsonValue(pool.targetContext.oldValue),
      newValue: compactJsonValue(pool.targetContext.newValue),
      oldFormula: compactJsonValue(pool.targetContext.oldFormula),
      newFormula: compactJsonValue(pool.targetContext.newFormula),
    },
    structuralCoherence: buildStage6StructuralCoherenceSummary(pool),
    evidenceCount: pool.evidenceCount,
    worksheetCount: pool.worksheetCount,
    workbookCount: pool.workbookCount,
    projectCount: pool.projectCount,
    averageConfidence: pool.averageConfidence,
  }));
  const compactEvents = batch.events
    .slice(0, MAX_STAGE7_PROMPT_EVENT_COUNT)
    .map(buildCompactWorksheetSemanticGroupingEvent);
  const existingSemanticPools = batch.existingDomainContext.relatedSemanticPools.map((pool) => ({
    semanticPoolId: pool.id,
    domainLabel: pool.domainLabel,
    domainSummary: pool.domainSummary,
    variantSummary: pool.variantSummary,
    semanticFamily: pool.semanticFamily,
    semanticType: pool.semanticType,
    poolStatus: pool.poolStatus,
    maturityStatus: pool.maturityStatus,
    supportCount: pool.supportCount,
    contradictionCount: pool.contradictionCount,
    projectCount: pool.projectCount,
    worksheetCount: pool.worksheetCount,
    workbookCount: pool.workbookCount,
    averageConfidence: pool.averageConfidence,
    lastSeenAt: pool.lastSeenAt,
    targetEquivalenceKey: pool.targetEquivalenceKey,
    canonicalTargetSelectionReason: pool.canonicalTargetSelectionReason,
    collapsedAlternativeSemanticPoolIds: pool.collapsedAlternativeSemanticPoolIds,
    collapsedAlternativeMemoryIds: pool.collapsedAlternativeMemoryIds,
    targetRankingInputs: pool.targetRankingInputs,
  }));
  const existingMemories = batch.existingDomainContext.activeMemories.map((memory) => ({
    memoryId: memory.id,
    title: memory.title,
    memoryCategory: memory.memoryCategory,
    memoryType: memory.memoryType,
    memoryKey: memory.memoryKey,
    confidenceScore: memory.confidenceScore,
    reinforcementCount: memory.reinforcementCount,
    contradictionCount: memory.contradictionCount,
    sourceSemanticPoolId: memory.sourceSemanticPoolId,
  }));
  const oppositeDirectionPools = batch.oppositeDirectionPools.slice(0, MAX_STAGE7_STAGING_POOL_SUMMARY_COUNT).map((pool) => ({
    poolId: pool.id,
    scopeContext: {
      itemCategory: compactJsonValue(pool.scopeContext.itemCategory),
      costRole: compactJsonValue(pool.scopeContext.costRole),
      itemLabel: compactJsonValue(pool.scopeContext.itemLabel),
      columnHeader: compactJsonValue(pool.scopeContext.columnHeader),
    },
    targetContext: {
      oldValue: compactJsonValue(pool.targetContext.oldValue),
      newValue: compactJsonValue(pool.targetContext.newValue),
      oldFormula: compactJsonValue(pool.targetContext.oldFormula),
      newFormula: compactJsonValue(pool.targetContext.newFormula),
    },
    evidenceCount: pool.evidenceCount,
    worksheetCount: pool.worksheetCount,
    projectCount: pool.projectCount,
  }));

  return [
    "Production semantic grouping stage only.",
    "Review the classified worksheet evidence below and decide which events belong in the same neutral evidence domain.",
    "Group related evidence only.",
    "Stage 7 only decides neutral semantic evidence-domain grouping; Stage 8 decides memory or no_memory.",
    "Treat semanticCandidateSummary as the Stage 6 distilled concept candidate. Use the event records to verify and provenance-check that summary.",
    "Do not treat semanticCandidateSummary as memory, company preference, company standard, or a future recommendation.",
    "Do not infer company preference, company standard, company behavior, contradiction, or memory conclusions.",
    "Repeated estimating assumptions may be valid neutral domains when the evidence is structurally coherent. Examples include productivity assumptions, labour assumptions, material assumptions, waste factors, margins, markups, rates, and quantity assumptions.",
    "Creating or reinforcing a semantic pool is not a claim that the organization has a preference, standard, future recommendation, or memory.",
    "You may group differently labeled worksheet events together when their full context refers to the same underlying parameter, topic, or evidence domain.",
    "You may keep same-labeled events separate when their broader meaning differs.",
    "Opposite-direction evidence is summarized separately below. Use it only as read-only context unless the evidence clearly supports a bidirectional or context-sensitive neutral domain.",
    "If the evidence clearly supports one existing semantic pool in context, return reinforce_existing_semantic_pool with that exact targetSemanticPoolId.",
    "Not a new domain is not enough for no_pool. If the evidence adds net-new support to one existing semantic target, prefer reinforce_existing_semantic_pool.",
    "Existing semantic pool context is ranked strongest-first. If multiple entries appear equivalent in meaning, prefer the strongest ranked matching target instead of defaulting to no_pool, unless the targets still conflict in meaning, direction, or scope.",
    "Do not create a duplicate semantic pool for a domain that is already represented.",
    "Do not reinforce a settled one-direction target with opposite-direction evidence unless the existing target is clearly bidirectional or context-sensitive.",
    "If an event does not belong in the same domain, mark it excluded, adjacent, or uncertain, or return no_pool with a short truthful noPoolReasonSummary.",
    "When returning no_pool, set noPoolReasonCode to one of insufficient_diversity, structural_incoherence, mixed_behaviours, contradictory_evidence, weak_reusability, missing_context, already_represented, target_ambiguity, or other.",
    "When returning no_pool for a staging pool whose structuralCoherence.structuralIdentityStrong is true, reasonSummary must state what overrode that structural coherence.",
    "When returning no_pool while existing semantic pools are present, use reasonSummary to state whether the problem was ambiguous_target, already_fully_credited, weak_alignment, no_net_new_support, or another truthful blocking reason.",
    `Organization ID: ${batch.organizationId}`,
    `Seed pool ID: ${batch.seedPoolId}`,
    `Seed pool signature: ${batch.seedPoolSignature}`,
    `Seed pool revision hash: ${batch.seedPoolRevisionHash}`,
    `Seed pool maturity status: ${batch.seedPoolMaturityStatus}`,
    `Staging pool count: ${batch.stagingPools.length}`,
    `Opposite-direction related pool count: ${batch.oppositeDirectionPools.length}`,
    `Staging pools included in prompt: ${stagingSummary.length}`,
    `Event count: ${batch.events.length}`,
    `Events included in prompt: ${compactEvents.length}`,
    `Semantic candidate summary:\n${JSON.stringify(semanticCandidateSummary)}`,
    `Staging seed summary:\n${JSON.stringify(stagingSummary)}`,
    `Opposite-direction context:\n${JSON.stringify(oppositeDirectionPools)}`,
    `Existing semantic pool context:\n${JSON.stringify(existingSemanticPools)}`,
    `Existing active memory context:\n${JSON.stringify(existingMemories)}`,
    `Canonical target semantic pool id: ${batch.existingDomainContext.canonicalTargetSemanticPoolId ?? "none"}`,
    `Canonical target selection reason: ${batch.existingDomainContext.canonicalTargetSelectionReason ?? "none"}`,
    `Collapsed alternative semantic pool ids: ${JSON.stringify(batch.existingDomainContext.collapsedAlternativeSemanticPoolIds)}`,
    `Collapsed alternative memory ids: ${JSON.stringify(batch.existingDomainContext.collapsedAlternativeMemoryIds)}`,
    `Provider saw canonical targets only: ${batch.existingDomainContext.providerSawCanonicalTargetsOnly ? "true" : "false"}`,
    `Classified events:\n${JSON.stringify(compactEvents)}`,
  ].join("\n\n");
}

function buildSemanticPoolQueueFailure(row: WorksheetMemorySemanticPoolQueueRow, error: unknown) {
  const providerError = isPricingWorksheetProviderError(error) ? error : null;
  const message = error instanceof Error ? error.message : "Worksheet memory semantic grouping failed.";
  const isTimeout = providerError?.code === "provider_timeout" && providerError.retryable === true;
  const queueState =
    row.attemptCount >= row.maxAttempts
      ? "dead_lettered"
      : "retry_scheduled";

  return {
    id: row.id,
    claimToken: row.claimToken ?? "",
    queueState,
    retryAfter: queueState === "dead_lettered" ? null : buildRetryAfter(row.attemptCount, new Date().toISOString()),
    errorCode: isTimeout ? "provider_timeout" : "semantic_grouping_failed",
    errorMessage: message,
  } satisfies {
    id: string;
    claimToken: string;
    queueState: "completed" | "retry_scheduled" | "dead_lettered";
    retryAfter?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  };
}

function buildWorksheetMemorySemanticGroupingSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["pools"],
    properties: {
      pools: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "proposalKind",
            "domainLabel",
            "domainSummary",
            "groupingRationale",
            "variantSummary",
            "confidence",
            "noPoolReasonCode",
            "noPoolReasonSummary",
            "targetSemanticPoolId",
            "reasonSummary",
            "includedEvidenceEventIds",
            "excludedEvidenceEventIds",
            "adjacentEvidenceEventIds",
            "uncertainEvidenceEventIds",
          ],
          properties: {
            proposalKind: { type: "string" },
            domainLabel: { anyOf: [{ type: "string" }, { type: "null" }] },
            domainSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
            groupingRationale: { anyOf: [{ type: "string" }, { type: "null" }] },
            variantSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
            confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
            noPoolReasonCode: {
              anyOf: [
                {
                  type: "string",
                  enum: [
                    "insufficient_diversity",
                    "structural_incoherence",
                    "mixed_behaviours",
                    "contradictory_evidence",
                    "weak_reusability",
                    "missing_context",
                    "already_represented",
                    "target_ambiguity",
                    "other",
                  ],
                },
                { type: "null" },
              ],
            },
            noPoolReasonSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
            targetSemanticPoolId: { anyOf: [{ type: "string" }, { type: "null" }] },
            reasonSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
            includedEvidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
            excludedEvidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
            adjacentEvidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
            uncertainEvidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
  } as Record<string, unknown>;
}

function parseQueueRow(value: Record<string, unknown>): WorksheetMemorySemanticPoolQueueRow {
  return {
    id: toNullableString(value.id) ?? crypto.randomUUID(),
    organizationId: toNullableString(value.organizationId ?? value.organization_id) ?? "",
    seedPoolId: toNullableString(value.seedPoolId ?? value.seed_pool_id) ?? "",
    seedPoolSignature: toNullableString(value.seedPoolSignature ?? value.seed_pool_signature) ?? "",
    seedPoolRevisionHash: toNullableString(value.seedPoolRevisionHash ?? value.seed_pool_revision_hash) ?? "",
    seedMaturityStatus: toNullableString(value.seedMaturityStatus ?? value.seed_maturity_status) ?? "emerging",
    queueState:
      (toNullableString(value.queueState ?? value.queue_state) as WorksheetMemorySemanticPoolQueueState) ?? "pending",
    attemptCount: toNullableNumber(value.attemptCount ?? value.attempt_count) ?? 0,
    maxAttempts: toNullableNumber(value.maxAttempts ?? value.max_attempts) ?? 5,
    priority: toNullableNumber(value.priority) ?? 0,
    availableAt: toNullableString(value.availableAt ?? value.available_at),
    retryAfter: toNullableString(value.retryAfter ?? value.retry_after),
    claimedAt: toNullableString(value.claimedAt ?? value.claimed_at),
    claimExpiresAt: toNullableString(value.claimExpiresAt ?? value.claim_expires_at),
    claimedBy: toNullableString(value.claimedBy ?? value.claimed_by),
    claimToken: toNullableString(value.claimToken ?? value.claim_token),
    lastErrorCode: toNullableString(value.lastErrorCode ?? value.last_error_code),
    lastErrorMessage: toNullableString(value.lastErrorMessage ?? value.last_error_message),
    createdAt: toNullableString(value.createdAt ?? value.created_at),
    updatedAt: toNullableString(value.updatedAt ?? value.updated_at),
  };
}

function parseSeedPoolRow(row: Record<string, unknown>): WorksheetMemoryEvidenceSeedPool {
  return {
    id: toNullableString(row.id) ?? "",
    organizationId: toNullableString(row.organization_id) ?? "",
    poolSignature: toNullableString(row.pool_signature) ?? "",
    scopeSignature: toNullableString(row.scope_signature) ?? "",
    targetSignature: toNullableString(row.target_signature) ?? "",
    poolKind: toNullableString(row.pool_kind) ?? "",
    eventType: toNullableString(row.event_type) ?? "",
    scopeContext: compactSeedPoolScopeContext(row.scope_context),
    targetContext: compactJsonRecord(row.target_context, 24),
    evidenceCount: toNullableNumber(row.evidence_count) ?? 0,
    worksheetCount: toNullableNumber(row.worksheet_count) ?? 0,
    workbookCount: toNullableNumber(row.workbook_count) ?? 0,
    projectCount: toNullableNumber(row.project_count) ?? 0,
    supportCount: toNullableNumber(row.support_count) ?? 0,
    contradictionCount: toNullableNumber(row.contradiction_count) ?? 0,
    ignoredCount: toNullableNumber(row.ignored_count) ?? 0,
    averageConfidence: toNullableNumber(row.average_confidence),
    firstSeenAt: toNullableString(row.first_seen_at),
    lastSeenAt: toNullableString(row.last_seen_at),
    poolRevisionHash: toNullableString(row.pool_revision_hash) ?? "",
    maturityStatus: toNullableString(row.maturity_status) ?? "emerging",
  };
}

function normalizeRawSemanticPoolProposal(value: unknown): RawSemanticPoolProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const proposalKind = toNullableString(record.proposalKind);
  if (proposalKind !== "evidence_domain" && proposalKind !== "reinforce_existing_semantic_pool" && proposalKind !== "no_pool") {
    return null;
  }
  const rawNoPoolReasonCode = toNullableString(record.noPoolReasonCode);
  const noPoolReasonCode = isSemanticNoPoolReasonCode(rawNoPoolReasonCode)
    ? rawNoPoolReasonCode
    : proposalKind === "no_pool"
      ? "other"
      : null;

  const normalized: RawSemanticPoolProposal = {
    proposalKind,
    domainLabel: toNullableString(record.domainLabel),
    domainSummary: toNullableString(record.domainSummary),
    groupingRationale: toNullableString(record.groupingRationale),
    variantSummary: toNullableString(record.variantSummary),
    confidence: clampConfidence(record.confidence),
    noPoolReasonCode,
    noPoolReasonSummary: toNullableString(record.noPoolReasonSummary),
    targetSemanticPoolId: toNullableString(record.targetSemanticPoolId),
    reasonSummary: toNullableString(record.reasonSummary),
    includedEvidenceEventIds: Array.isArray(record.includedEvidenceEventIds)
      ? record.includedEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    excludedEvidenceEventIds: Array.isArray(record.excludedEvidenceEventIds)
      ? record.excludedEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    adjacentEvidenceEventIds: Array.isArray(record.adjacentEvidenceEventIds)
      ? record.adjacentEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    uncertainEvidenceEventIds: Array.isArray(record.uncertainEvidenceEventIds)
      ? record.uncertainEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
  };

  if (proposalKind === "no_pool") {
    return {
      ...normalized,
      domainLabel: null,
      domainSummary: null,
      groupingRationale: null,
      variantSummary: null,
      confidence: null,
      noPoolReasonCode: normalized.noPoolReasonCode ?? "other",
      noPoolReasonSummary: normalized.noPoolReasonSummary,
      targetSemanticPoolId: null,
      reasonSummary: normalized.reasonSummary ?? normalized.noPoolReasonSummary,
      includedEvidenceEventIds: [],
      excludedEvidenceEventIds: [],
      adjacentEvidenceEventIds: [],
      uncertainEvidenceEventIds: [],
    };
  }

  return normalized;
}

function normalizeProviderSemanticPools(response: PricingWorksheetProviderResponse) {
  const pools = isJsonRecord(response.parsedJson) && Array.isArray(response.parsedJson.pools)
    ? response.parsedJson.pools
        .map(normalizeRawSemanticPoolProposal)
        .filter((proposal): proposal is RawSemanticPoolProposal => proposal !== null)
    : [];

  return pools;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getWorksheetKey(event: ClassifiedWorksheetMemoryEvent) {
  const sheetId = toNullableString(event.metadata.sheetId);
  if (sheetId) {
    return `sheet:${sheetId}`;
  }

  const workbookId = toNullableString(event.metadata.workbookId);
  const worksheetName = toNullableString(event.metadata.worksheetName);
  if (workbookId && worksheetName) {
    return `workbook:${workbookId}:worksheet:${worksheetName}`;
  }

  return `event:${event.eventId}`;
}

function computeSupportMetrics(events: ClassifiedWorksheetMemoryEvent[]) {
  return {
    worksheetCount: new Set(events.map((event) => getWorksheetKey(event))).size,
    workbookCount: new Set(events.map((event) => toNullableString(event.metadata.workbookId) ?? `event:${event.eventId}`)).size,
    projectCount: new Set(events.map((event) => event.projectId ?? `event:${event.eventId}`)).size,
    averageConfidence: average(
      events.map((event) => event.overallConfidence).filter((value): value is number => typeof value === "number"),
    ),
    firstSeenAt: [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))[0]?.occurredAt ?? new Date().toISOString(),
    lastSeenAt: [...events].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]?.occurredAt ?? new Date().toISOString(),
  };
}

function buildVariantSummary(events: ClassifiedWorksheetMemoryEvent[]) {
  if (events.length === 0) {
    return null;
  }

  const variantCounts = new Map<string, number>();
  for (const event of events) {
    const itemLabel = toNullableString(event.diffData.itemLabel) ?? "worksheet parameter";
    const oldValue = event.diffData.oldValue ?? "unknown";
    const newValue = event.diffData.newValue ?? "unknown";
    const unit = toNullableString(event.diffData.unit);
    const transition = `${itemLabel}: ${String(oldValue)}${unit ?? ""} -> ${String(newValue)}${unit ?? ""}`;
    variantCounts.set(transition, (variantCounts.get(transition) ?? 0) + 1);
  }

  return Array.from(variantCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([variant, count]) => `${variant} (${count})`)
    .join("; ");
}

function deriveSemanticPoolStatus(params: {
  groupedCount: number;
}) {
  if (params.groupedCount === 0) {
    return "rejected" as const;
  }

  return "active" as const;
}

function deriveSemanticPoolMaturity(params: {
  groupedCount: number;
  worksheetCount: number;
  projectCount: number;
}) {
  if (params.groupedCount >= 8 && params.worksheetCount >= 4 && params.projectCount >= 3) {
    return "durable" as const;
  }
  if (params.groupedCount >= 5 && params.worksheetCount >= 3 && params.projectCount >= 2) {
    return "reinforced" as const;
  }
  if (params.groupedCount >= 2 && params.worksheetCount >= 2 && params.projectCount >= 2) {
    return "ready_for_synthesis" as const;
  }
  return "emerging" as const;
}

function buildSemanticPoolStableSignature(params: {
  organizationId: string;
  roleFingerprints: {
    included: string[];
    adjacent: string[];
    uncertain: string[];
  };
  poolKinds: string[];
  eventTypes: string[];
}) {
  return hashSignaturePayload({
    organizationId: normalizeSignatureToken(params.organizationId),
    poolKinds: params.poolKinds,
    eventTypes: params.eventTypes,
    roleFingerprints: params.roleFingerprints,
  });
}

function buildSemanticPoolSourceRevisionHash(params: {
  organizationId: string;
  seedPoolId: string;
  selectedPoolMemberships: Array<{
    stage6PoolId: string;
    stage6PoolSignature: string;
    stage6PoolRevisionHash: string;
    sourceEventId: string;
    classificationRecordId: string;
    evidenceRole: "included" | "adjacent" | "uncertain" | "excluded";
  }>;
  selectedPoolIds: string[];
}) {
  return hashSignaturePayload({
    organizationId: normalizeSignatureToken(params.organizationId),
    seedPoolId: params.seedPoolId,
    groupingSchemaVersion: 1,
    selectedPoolIds: [...params.selectedPoolIds].sort(),
    selectedPoolMemberships: [...params.selectedPoolMemberships]
      .sort((left, right) =>
        left.stage6PoolId.localeCompare(right.stage6PoolId)
        || left.sourceEventId.localeCompare(right.sourceEventId)
        || left.classificationRecordId.localeCompare(right.classificationRecordId)
        || left.evidenceRole.localeCompare(right.evidenceRole),
      ),
  });
}

function buildNoPoolReasonSummary(batch: SemanticGroupingBatch, proposal: RawSemanticPoolProposal) {
  const genericSummary = "The candidate evidence did not form a coherent neutral evidence domain.";
  const noPoolReasonCode = proposal.noPoolReasonCode ?? "other";
  const hasStrongStructuralCoherence = hasStrongStructuralIdentity(batch);
  const suppliedReasonSummary = proposal.reasonSummary ?? proposal.noPoolReasonSummary;

  if (hasStrongStructuralCoherence && (!suppliedReasonSummary || suppliedReasonSummary === genericSummary)) {
    return {
      noPoolReasonCode,
      noPoolReasonSummary:
        !proposal.noPoolReasonSummary || proposal.noPoolReasonSummary === genericSummary
          ? "No pool was selected despite strong Stage 6 structural identity."
          : proposal.noPoolReasonSummary,
      reasonSummary:
        "No pool was selected despite strong Stage 6 structural identity; the provider did not supply a specific override beyond the selected noPoolReasonCode.",
    };
  }

  return {
    noPoolReasonCode,
    noPoolReasonSummary: proposal.noPoolReasonSummary ?? genericSummary,
    reasonSummary: proposal.reasonSummary ?? proposal.noPoolReasonSummary ?? genericSummary,
  };
}

function validateSemanticPoolProposal(batch: SemanticGroupingBatch, proposal: RawSemanticPoolProposal): ValidatedSemanticPoolProposal {
  if (proposal.proposalKind === "no_pool") {
    const noPoolReason = buildNoPoolReasonSummary(batch, proposal);
    return {
      proposalId: `${batch.batchId}:no-pool`,
      batchId: batch.batchId,
      organizationId: batch.organizationId,
      proposalKind: "no_pool",
      domainLabel: null,
      domainSummary: null,
      groupingRationale: null,
      variantSummary: null,
      confidence: null,
      noPoolReasonCode: noPoolReason.noPoolReasonCode,
      noPoolReasonSummary: noPoolReason.noPoolReasonSummary,
      targetSemanticPoolId: null,
      reasonSummary: noPoolReason.reasonSummary,
      includedEvidenceEventIds: [],
      excludedEvidenceEventIds: batch.events.map((event) => event.eventId),
      adjacentEvidenceEventIds: [],
      uncertainEvidenceEventIds: [],
      evidenceSummary: {},
      semanticSignature: null,
      sourceRevisionHash: null,
      poolStatus: "rejected",
      maturityStatus: "emerging",
    };
  }

  const eventIds = new Set(batch.events.map((event) => event.eventId));
  const uniqueIncludedIds = Array.from(new Set(proposal.includedEvidenceEventIds)).filter((eventId) => eventIds.has(eventId));
  const uniqueAdjacentIds = Array.from(new Set(proposal.adjacentEvidenceEventIds))
    .filter((eventId) => eventIds.has(eventId) && !uniqueIncludedIds.includes(eventId));
  const uniqueUncertainIds = Array.from(new Set(proposal.uncertainEvidenceEventIds))
    .filter((eventId) => eventIds.has(eventId) && !uniqueIncludedIds.includes(eventId) && !uniqueAdjacentIds.includes(eventId));
  const uniqueExcludedIds = Array.from(new Set(proposal.excludedEvidenceEventIds))
    .filter((eventId) => eventIds.has(eventId)
      && !uniqueIncludedIds.includes(eventId)
      && !uniqueAdjacentIds.includes(eventId)
      && !uniqueUncertainIds.includes(eventId));
  const groupedEvents = batch.events.filter((event) =>
    uniqueIncludedIds.includes(event.eventId)
    || uniqueAdjacentIds.includes(event.eventId)
    || uniqueUncertainIds.includes(event.eventId),
  );
  const groupedMetrics = computeSupportMetrics(groupedEvents);
  const variantSummary = proposal.variantSummary ?? buildVariantSummary(batch.events.filter((event) =>
    uniqueIncludedIds.includes(event.eventId) || uniqueAdjacentIds.includes(event.eventId) || uniqueUncertainIds.includes(event.eventId),
  ));
  const groupedLinks = batch.sourceLinks.filter((link) =>
    uniqueIncludedIds.includes(link.sourceEventId)
    || uniqueAdjacentIds.includes(link.sourceEventId)
    || uniqueUncertainIds.includes(link.sourceEventId)
    || uniqueExcludedIds.includes(link.sourceEventId),
  );
  const fingerprintByRole = {
    included: uniqueIncludedIds
      .map((eventId) => batch.events.find((event) => event.eventId === eventId))
      .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event))
      .map(buildSemanticEventStructuralFingerprint)
      .map((entry) => hashSignaturePayload(entry))
      .sort(),
    adjacent: uniqueAdjacentIds
      .map((eventId) => batch.events.find((event) => event.eventId === eventId))
      .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event))
      .map(buildSemanticEventStructuralFingerprint)
      .map((entry) => hashSignaturePayload(entry))
      .sort(),
    uncertain: uniqueUncertainIds
      .map((eventId) => batch.events.find((event) => event.eventId === eventId))
      .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event))
      .map(buildSemanticEventStructuralFingerprint)
      .map((entry) => hashSignaturePayload(entry))
      .sort(),
  };
  const poolStatus = deriveSemanticPoolStatus({
    groupedCount: groupedEvents.length,
  });
  const maturityStatus = deriveSemanticPoolMaturity({
    groupedCount: groupedEvents.length,
    worksheetCount: groupedMetrics.worksheetCount,
    projectCount: groupedMetrics.projectCount,
  });

  return {
    proposalId: `${batch.batchId}:${proposal.domainLabel ?? "evidence-domain"}:${uniqueIncludedIds.join(",") || "empty"}`,
    batchId: batch.batchId,
    organizationId: batch.organizationId,
    proposalKind: proposal.proposalKind,
    domainLabel: proposal.domainLabel,
    domainSummary: proposal.domainSummary,
    groupingRationale: proposal.groupingRationale,
    variantSummary,
    confidence: proposal.confidence,
    noPoolReasonCode: null,
    noPoolReasonSummary: null,
    targetSemanticPoolId: proposal.proposalKind === "reinforce_existing_semantic_pool" ? proposal.targetSemanticPoolId ?? null : null,
    reasonSummary: proposal.reasonSummary ?? proposal.groupingRationale ?? proposal.domainSummary ?? null,
    includedEvidenceEventIds: uniqueIncludedIds,
    excludedEvidenceEventIds: uniqueExcludedIds,
    adjacentEvidenceEventIds: uniqueAdjacentIds,
    uncertainEvidenceEventIds: uniqueUncertainIds,
    evidenceSummary: {
      groupedCount: groupedEvents.length,
      includedCount: uniqueIncludedIds.length,
      excludedCount: uniqueExcludedIds.length,
      adjacentCount: uniqueAdjacentIds.length,
      uncertainCount: uniqueUncertainIds.length,
      worksheetCount: groupedMetrics.worksheetCount,
      workbookCount: groupedMetrics.workbookCount,
      projectCount: groupedMetrics.projectCount,
      averageConfidence: groupedMetrics.averageConfidence,
      firstSeenAt: groupedMetrics.firstSeenAt,
      lastSeenAt: groupedMetrics.lastSeenAt,
    },
    semanticSignature: buildSemanticPoolStableSignature({
      organizationId: batch.organizationId,
      roleFingerprints: fingerprintByRole,
      poolKinds: compactSortedArray(groupedEvents.map((event) => event.eventType.includes("formula") ? "formula_transition" : event.eventType.includes("rate") ? "rate_transition" : event.eventType.includes("assumption") ? "assumption_transition" : "generic_transition")),
      eventTypes: compactSortedArray(groupedEvents.map((event) => event.eventType)),
    }),
    sourceRevisionHash: buildSemanticPoolSourceRevisionHash({
      organizationId: batch.organizationId,
      seedPoolId: batch.seedPoolId,
      selectedPoolIds: batch.selectedPoolIds,
      selectedPoolMemberships: groupedLinks.map((link) => ({
        stage6PoolId: link.stage6PoolId,
        stage6PoolSignature: link.stage6PoolSignature,
        stage6PoolRevisionHash: link.stage6PoolRevisionHash,
        sourceEventId: link.sourceEventId,
        classificationRecordId: link.classificationRecordId,
        evidenceRole:
          uniqueIncludedIds.includes(link.sourceEventId)
            ? "included"
            : uniqueAdjacentIds.includes(link.sourceEventId)
              ? "adjacent"
              : uniqueUncertainIds.includes(link.sourceEventId)
                ? "uncertain"
                : "excluded",
      })),
    }),
    poolStatus,
    maturityStatus,
  };
}

function buildDeterministicBehaviourBucketProposal(batch: SemanticGroupingBatch) {
  const ineligibleReason = getDeterministicBucketEligibilityFailure(batch);
  if (ineligibleReason) {
    return {
      proposal: null,
      reason: ineligibleReason,
    };
  }

  const seedPool = batch.stagingPools.find((pool) => pool.id === batch.seedPoolId) ?? batch.stagingPools[0];
  if (!seedPool) {
    return {
      proposal: null,
      reason: "No Stage 6 seed pool was available for deterministic bucket creation.",
    };
  }

  const sortedEvents = [...batch.events]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId));
  const includedEvidenceEventIds = sortedEvents.map((event) => event.eventId);
  const groupedMetrics = computeSupportMetrics(sortedEvents);
  const evidenceSummary = {
    groupedCount: sortedEvents.length,
    includedCount: includedEvidenceEventIds.length,
    excludedCount: 0,
    adjacentCount: 0,
    uncertainCount: 0,
    worksheetCount: groupedMetrics.worksheetCount,
    workbookCount: groupedMetrics.workbookCount,
    projectCount: groupedMetrics.projectCount,
    averageConfidence: groupedMetrics.averageConfidence,
    firstSeenAt: groupedMetrics.firstSeenAt,
    lastSeenAt: groupedMetrics.lastSeenAt,
    deterministicCreation: true,
    deterministicReason: buildDeterministicBucketReason(batch),
    structuralProofSummary: buildStage6StructuralCoherenceSummary(seedPool),
  } satisfies Record<string, Json | null>;

  const proposal = {
    proposalId: `${batch.batchId}:deterministic-behaviour-bucket`,
    batchId: batch.batchId,
    organizationId: batch.organizationId,
    proposalKind: "evidence_domain" as const,
    domainLabel: buildDeterministicBucketLabel(batch),
    domainSummary: buildDeterministicBucketSummary(batch),
    groupingRationale: buildDeterministicBucketReason(batch),
    variantSummary: buildVariantSummary(sortedEvents),
    confidence: groupedMetrics.averageConfidence,
    noPoolReasonCode: null,
    noPoolReasonSummary: null,
    targetSemanticPoolId:
      batch.existingDomainContext.relatedSemanticPools.length === 1
        ? batch.existingDomainContext.relatedSemanticPools[0]?.id ?? null
        : null,
    reasonSummary: buildDeterministicBucketReason(batch),
    includedEvidenceEventIds,
    excludedEvidenceEventIds: [],
    adjacentEvidenceEventIds: [],
    uncertainEvidenceEventIds: [],
    evidenceSummary,
    semanticSignature: buildDeterministicBucketSemanticSignature(batch),
    sourceRevisionHash: buildSemanticPoolSourceRevisionHash({
      organizationId: batch.organizationId,
      seedPoolId: batch.seedPoolId,
      selectedPoolIds: batch.selectedPoolIds,
      selectedPoolMemberships: batch.sourceLinks.map((link) => ({
        stage6PoolId: link.stage6PoolId,
        stage6PoolSignature: link.stage6PoolSignature,
        stage6PoolRevisionHash: link.stage6PoolRevisionHash,
        sourceEventId: link.sourceEventId,
        classificationRecordId: link.classificationRecordId,
        evidenceRole: "included" as const,
      })),
    }),
    poolStatus: "active" as const,
    maturityStatus: deriveSemanticPoolMaturity({
      groupedCount: sortedEvents.length,
      worksheetCount: groupedMetrics.worksheetCount,
      projectCount: groupedMetrics.projectCount,
    }),
  } satisfies ValidatedSemanticPoolProposal;

  return {
    proposal,
    reason: null,
  };
}

async function claimWorksheetMemorySemanticPoolBatch(params?: {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_worksheet_memory_semantic_pool_batch" as never, {
    p_limit: Math.max(params?.limit ?? DEFAULT_LIMIT, 1),
    p_organization_id: params?.organizationId ?? null,
    p_worker_id: params?.workerId ?? DEFAULT_WORKER_ID,
    p_lease_seconds: Math.max(params?.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 30),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return rows.map((row) => parseQueueRow(row));
}

async function finalizeWorksheetMemorySemanticPoolBatch(inputs: Array<{
  id: string;
  claimToken: string;
  queueState: "completed" | "retry_scheduled" | "dead_lettered";
  retryAfter?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}>) {
  if (inputs.length === 0) {
    return {
      count: 0,
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("finalize_worksheet_memory_semantic_pool_batch" as never, {
    p_inputs: inputs,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    count: typeof payload.count === "number" ? payload.count : inputs.length,
    completedCount: typeof payload.completedCount === "number" ? payload.completedCount : 0,
    retriedCount: typeof payload.retriedCount === "number" ? payload.retriedCount : 0,
    deadLetteredCount: typeof payload.deadLetteredCount === "number" ? payload.deadLetteredCount : 0,
  };
}

function buildSemanticGroupingRunDiagnosticSummary(diagnostics: SemanticGroupingRunDiagnostic[]) {
  return {
    jobs: compactLimitedArray(
      diagnostics.map((diagnostic) => ({
        queueRowId: diagnostic.queueRowId,
        seedPoolId: diagnostic.seedPoolId,
        candidatePoolIds: diagnostic.candidatePoolIds,
        oppositeDirectionPoolIds: diagnostic.oppositeDirectionPoolIds,
        candidateEventCount: diagnostic.candidateEventCount,
        relatedSemanticPoolIds: diagnostic.relatedSemanticPoolIds,
        relatedMemoryIds: diagnostic.relatedMemoryIds,
        canonicalTargetSemanticPoolId: diagnostic.canonicalTargetSemanticPoolId,
        canonicalTargetSelectionReason: diagnostic.canonicalTargetSelectionReason,
        collapsedAlternativeSemanticPoolIds: diagnostic.collapsedAlternativeSemanticPoolIds,
        collapsedAlternativeMemoryIds: diagnostic.collapsedAlternativeMemoryIds,
        targetEquivalenceKey: diagnostic.targetEquivalenceKey,
        targetRankingInputs: diagnostic.targetRankingInputs,
        providerSawCanonicalTargetsOnly: diagnostic.providerSawCanonicalTargetsOnly,
        outcome: diagnostic.outcome,
        semanticCandidateSummaryPresent: diagnostic.semanticCandidateSummaryPresent,
        rejectedDespiteStructuralIdentityStrong: diagnostic.rejectedDespiteStructuralIdentityStrong,
        deterministicMode: diagnostic.deterministicMode,
        deterministicReason: diagnostic.deterministicReason,
        targetSemanticPoolId: diagnostic.targetSemanticPoolId,
        includedEvidenceEventIds: diagnostic.includedEvidenceEventIds,
        includedClassificationRecordIds: diagnostic.includedClassificationRecordIds,
        sourceRevisionHash: diagnostic.sourceRevisionHash,
        stage8QueueInsertCount: diagnostic.stage8QueueInsertCount,
        reasonSummary: diagnostic.reasonSummary,
        noPoolReasonCode: diagnostic.noPoolReasonCode,
        noPoolReasonSummary: diagnostic.noPoolReasonSummary,
      })),
      12,
    ),
  } satisfies Record<string, Json | null>;
}

function isMissingDiagnosticSummaryColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("diagnostic_summary") && message.includes("column");
}

async function insertSemanticPoolRun(params: {
  runId?: string;
  requestedOrganizationId: string | null;
  summary: RunWorksheetMemorySemanticPoolWorkerOutput;
  diagnosticSummary?: Record<string, Json | null>;
}) {
  const admin = createAdminSupabaseClient();
  const payload = {
    id: params.runId,
    requested_organization_id: params.requestedOrganizationId,
    claimed_job_count: params.summary.claimedJobCount,
    completed_job_count: params.summary.completedJobCount,
    retried_job_count: params.summary.retriedJobCount,
    dead_lettered_job_count: params.summary.deadLetteredJobCount,
    semantic_pool_count: params.summary.semanticPoolCount,
    no_pool_count: params.summary.noPoolCount,
    candidate_event_count: params.summary.candidateEventCount,
    provider: params.summary.provider,
    model: params.summary.model,
    duration_ms: params.summary.durationMs,
    diagnostic_summary: params.diagnosticSummary ?? {},
  };

  const insertRun = async (nextPayload: Record<string, unknown>) => {
    const { data, error } = await admin
      .from("worksheet_memory_semantic_pool_runs" as never)
      .insert(nextPayload as never)
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return toNullableString((data as Record<string, unknown> | null)?.id);
  };

  try {
    return await insertRun(payload);
  } catch (error) {
    if (!isMissingDiagnosticSummaryColumnError(error)) {
      throw error;
    }
    const { diagnostic_summary: _diagnosticSummary, ...legacyPayload } = payload;
    return insertRun(legacyPayload);
  }
}

async function updateSemanticPoolRun(params: {
  runId: string;
  requestedOrganizationId: string | null;
  summary: RunWorksheetMemorySemanticPoolWorkerOutput;
  diagnosticSummary?: Record<string, Json | null>;
}) {
  const admin = createAdminSupabaseClient();
  const payload = {
    requested_organization_id: params.requestedOrganizationId,
    claimed_job_count: params.summary.claimedJobCount,
    completed_job_count: params.summary.completedJobCount,
    retried_job_count: params.summary.retriedJobCount,
    dead_lettered_job_count: params.summary.deadLetteredJobCount,
    semantic_pool_count: params.summary.semanticPoolCount,
    no_pool_count: params.summary.noPoolCount,
    candidate_event_count: params.summary.candidateEventCount,
    provider: params.summary.provider,
    model: params.summary.model,
    duration_ms: params.summary.durationMs,
    diagnostic_summary: params.diagnosticSummary ?? {},
  };

  const updateRun = async (nextPayload: Record<string, unknown>) => {
    const { error } = await admin
      .from("worksheet_memory_semantic_pool_runs" as never)
      .update(nextPayload as never)
      .eq("id", params.runId as never);

    if (error) {
      throw new Error(error.message);
    }
  };

  try {
    await updateRun(payload);
  } catch (error) {
    if (!isMissingDiagnosticSummaryColumnError(error)) {
      throw error;
    }
    const { diagnostic_summary: _diagnosticSummary, ...legacyPayload } = payload;
    await updateRun(legacyPayload);
  }
}

async function loadSeedPoolById(poolId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_memory_evidence_pools" as never)
    .select("*")
    .eq("id", poolId as never)
    .eq("organization_id", organizationId as never)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return parseSeedPoolRow((data ?? {}) as Record<string, unknown>);
}

async function loadCandidateSeedPools(seed: WorksheetMemoryEvidenceSeedPool, maxSeedPoolCount: number) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_memory_evidence_pools" as never)
    .select("*")
    .eq("organization_id", seed.organizationId as never)
    .eq("pool_kind", seed.poolKind as never)
    .eq("event_type", seed.eventType as never)
    .in("maturity_status", ["ready_for_synthesis", "reinforced", "durable"] as never)
    .order("last_seen_at", { ascending: false })
    .limit(Math.max(maxSeedPoolCount * 4, maxSeedPoolCount));

  if (error) {
    throw new Error(error.message);
  }

  const all = Array.isArray(data)
    ? data.map((row) => parseSeedPoolRow(row as Record<string, unknown>))
    : [];

  const sameDirection = all
    .filter((pool) => hasSameSemanticScope(seed, pool))
    .map((pool) => {
      const relationship = classifySeedPoolDirectionRelationship(seed, pool);
      return { pool, relationship };
    })
    .filter((entry) => entry.relationship !== "mismatch");

  const scoreCandidate = (pool: WorksheetMemoryEvidenceSeedPool) => {
    let score = pool.id === seed.id ? 100 : 0;
    if (pool.scopeSignature === seed.scopeSignature) {
      score += 20;
    }
    if (normalizeSignatureToken(pool.scopeContext.itemLabel) === normalizeSignatureToken(seed.scopeContext.itemLabel)) {
      score += 12;
    }
    if (normalizeSignatureToken(pool.scopeContext.columnHeader) === normalizeSignatureToken(seed.scopeContext.columnHeader)) {
      score += 8;
    }
    if (normalizeSignatureToken(pool.scopeContext.rowLabel) === normalizeSignatureToken(seed.scopeContext.rowLabel)) {
      score += 6;
    }
    if (normalizeSignatureToken(pool.scopeContext.costRole) === normalizeSignatureToken(seed.scopeContext.costRole)) {
      score += 4;
    }
    if (normalizeSignatureToken(pool.scopeContext.itemCategory) === normalizeSignatureToken(seed.scopeContext.itemCategory)) {
      score += 4;
    }

    return score;
  };

  const primaryPools = sameDirection
    .filter((entry) => entry.relationship === "same")
    .map((entry) => ({ pool: entry.pool, score: scoreCandidate(entry.pool) }))
    .sort((left, right) => right.score - left.score || (right.pool.lastSeenAt ?? "").localeCompare(left.pool.lastSeenAt ?? ""))
    .slice(0, maxSeedPoolCount)
    .map((entry) => entry.pool);

  const oppositeDirectionPools = sameDirection
    .filter((entry) => entry.relationship === "opposite")
    .map((entry) => ({ pool: entry.pool, score: scoreCandidate(entry.pool) }))
    .sort((left, right) => right.score - left.score || (right.pool.lastSeenAt ?? "").localeCompare(left.pool.lastSeenAt ?? ""))
    .slice(0, maxSeedPoolCount)
    .map((entry) => entry.pool);

  return {
    primaryPools: primaryPools.length > 0 ? primaryPools : [seed],
    oppositeDirectionPools,
  };
}

async function loadSeedPoolEventLinks(poolIds: string[], organizationId: string) {
  if (poolIds.length === 0) {
    return [] as Array<Record<string, unknown>>;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_memory_evidence_pool_events" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .in("pool_id", poolIds as never)
    .order("occurred_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

async function loadExistingDomainContext(params: {
  organizationId: string;
  sourceEventIds: string[];
}) {
  if (params.sourceEventIds.length === 0) {
    return {
      relatedSemanticPools: [] as SemanticGroupingExistingSemanticPoolContext[],
      activeMemories: [] as SemanticGroupingExistingMemoryContext[],
      canonicalTargetSemanticPoolId: null,
      canonicalTargetSelectionReason: null,
      collapsedAlternativeSemanticPoolIds: [] as string[],
      collapsedAlternativeMemoryIds: [] as string[],
      targetEquivalenceKey: null,
      providerSawCanonicalTargetsOnly: true,
    } satisfies SemanticGroupingExistingDomainContext;
  }

  const admin = createAdminSupabaseClient();
  const { data: semanticPoolEventRows, error: semanticPoolEventError } = await admin
    .from("worksheet_memory_semantic_pool_events" as never)
    .select("semantic_pool_id")
    .eq("organization_id", params.organizationId as never)
    .in("source_event_id", params.sourceEventIds as never);

  if (semanticPoolEventError) {
    throw new Error(semanticPoolEventError.message);
  }

  const semanticPoolIds = compactSortedArray(
    (Array.isArray(semanticPoolEventRows) ? semanticPoolEventRows : []).map((row) =>
      toNullableString((row as Record<string, unknown>).semantic_pool_id),
    ),
  );

  if (semanticPoolIds.length === 0) {
    return {
      relatedSemanticPools: [],
      activeMemories: [],
      canonicalTargetSemanticPoolId: null,
      canonicalTargetSelectionReason: null,
      collapsedAlternativeSemanticPoolIds: [],
      collapsedAlternativeMemoryIds: [],
      targetEquivalenceKey: null,
      providerSawCanonicalTargetsOnly: true,
    } satisfies SemanticGroupingExistingDomainContext;
  }

  const [{ data: semanticPoolRows, error: semanticPoolError }, { data: memoryRows, error: memoryError }] = await Promise.all([
    admin
      .from("worksheet_memory_semantic_pools" as never)
      .select("*")
      .eq("organization_id", params.organizationId as never)
      .in("id", semanticPoolIds as never),
    admin
      .from("organization_memory_items" as never)
      .select("id, title, memory_category, memory_type, memory_key, memory_domain_signature, confidence_score, reinforcement_count, contradiction_count, is_active, source_semantic_pool_id")
      .eq("organization_id", params.organizationId as never)
      .eq("is_active", true as never)
      .in("source_semantic_pool_id", semanticPoolIds as never),
  ]);

  if (semanticPoolError) {
    throw new Error(semanticPoolError.message);
  }
  if (memoryError) {
    throw new Error(memoryError.message);
  }

  const allActiveMemories = (Array.isArray(memoryRows) ? memoryRows : [])
      .map((row) => ({
        id: toNullableString((row as Record<string, unknown>).id) ?? "",
        title: toNullableString((row as Record<string, unknown>).title),
        memoryCategory: toNullableString((row as Record<string, unknown>).memory_category),
        memoryType: toNullableString((row as Record<string, unknown>).memory_type),
        memoryKey: toNullableString((row as Record<string, unknown>).memory_key),
        memoryDomainSignature: toNullableString((row as Record<string, unknown>).memory_domain_signature),
        confidenceScore: toNullableNumber((row as Record<string, unknown>).confidence_score),
        reinforcementCount: toNullableNumber((row as Record<string, unknown>).reinforcement_count) ?? 0,
        contradictionCount: toNullableNumber((row as Record<string, unknown>).contradiction_count) ?? 0,
        isActive: Boolean((row as Record<string, unknown>).is_active),
        sourceSemanticPoolId: toNullableString((row as Record<string, unknown>).source_semantic_pool_id),
      }))
      .filter((memory) => memory.id.length > 0)
      .sort((left, right) =>
        (right.confidenceScore ?? 0) - (left.confidenceScore ?? 0)
        || right.reinforcementCount - left.reinforcementCount
        || left.id.localeCompare(right.id),
      );

  const semanticPools = (Array.isArray(semanticPoolRows) ? semanticPoolRows : [])
    .map((row) => mapSemanticPoolRow((row ?? {}) as Record<string, unknown>))
    .sort((left, right) =>
      right.supportCount - left.supportCount
      || right.projectCount - left.projectCount
      || right.lastSeenAt.localeCompare(left.lastSeenAt),
    );

  const poolsWithMemories = semanticPools.map((pool) => ({
    pool,
    linkedMemories: allActiveMemories.filter((memory) => memory.sourceSemanticPoolId === pool.id),
  }));

  const equivalenceGroups = new Map<string, typeof poolsWithMemories>();
  const standalonePools: typeof poolsWithMemories = [];
  for (const entry of poolsWithMemories) {
    const equivalenceKey = buildSemanticTargetEquivalenceKey({
      organizationId: params.organizationId,
      pool: entry.pool,
      linkedMemories: entry.linkedMemories,
    });
    if (!equivalenceKey) {
      standalonePools.push(entry);
      continue;
    }

    const existingGroup = equivalenceGroups.get(equivalenceKey) ?? [];
    existingGroup.push(entry);
    equivalenceGroups.set(equivalenceKey, existingGroup);
  }

  const canonicalizedPools: SemanticGroupingExistingSemanticPoolContext[] = [];
  const canonicalMemoryIds = new Set<string>();
  const appendCanonicalPool = (
    entry: typeof poolsWithMemories[number],
    options: {
      equivalenceKey: string | null;
      reason: string | null;
      alternativePools: string[];
      alternativeMemories: string[];
    },
  ) => {
    entry.linkedMemories.forEach((memory) => canonicalMemoryIds.add(memory.id));
    canonicalizedPools.push({
      id: entry.pool.id,
      semanticSignature: entry.pool.semanticSignature,
      domainLabel: entry.pool.domainLabel,
      domainSummary: entry.pool.domainSummary,
      variantSummary: entry.pool.variantSummary,
      semanticFamily: entry.pool.semanticFamily,
      semanticType: entry.pool.semanticType,
      poolStatus: entry.pool.poolStatus,
      maturityStatus: entry.pool.maturityStatus,
      sourceRevisionHash: entry.pool.sourceRevisionHash,
      supportCount: entry.pool.supportCount,
      contradictionCount: entry.pool.contradictionCount,
      projectCount: entry.pool.projectCount,
      worksheetCount: entry.pool.worksheetCount,
      workbookCount: entry.pool.workbookCount,
      averageConfidence: entry.pool.averageConfidence,
      lastSeenAt: entry.pool.lastSeenAt,
      targetEquivalenceKey: options.equivalenceKey,
      canonicalTargetSelectionReason: options.reason,
      collapsedAlternativeSemanticPoolIds: options.alternativePools,
      collapsedAlternativeMemoryIds: options.alternativeMemories,
      targetRankingInputs: buildCanonicalTargetRankingInputs(entry),
    });
  };

  for (const [equivalenceKey, group] of equivalenceGroups.entries()) {
    const ordered = [...group].sort(compareCanonicalTargetRanking);
    const canonical = ordered[0];
    if (!canonical) {
      continue;
    }
    const alternativePools = ordered.slice(1).map((entry) => entry.pool.id);
    const alternativeMemories = compactSortedArray(
      ordered.slice(1).flatMap((entry) => entry.linkedMemories.map((memory) => memory.id)),
    );
    const reason = alternativePools.length > 0
      ? "Collapsed duplicate-equivalent semantic targets and selected the strongest ranked canonical target."
      : "Single equivalent semantic target remained after structural equivalence analysis.";
    appendCanonicalPool(canonical, {
      equivalenceKey,
      reason,
      alternativePools,
      alternativeMemories,
    });
  }

  standalonePools.forEach((entry) => {
    appendCanonicalPool(entry, {
      equivalenceKey: null,
      reason: null,
      alternativePools: [],
      alternativeMemories: [],
    });
  });

  const relatedSemanticPools = compactLimitedArray(
    canonicalizedPools.sort((left, right) =>
      right.supportCount - left.supportCount
      || right.projectCount - left.projectCount
      || right.lastSeenAt.localeCompare(left.lastSeenAt)
      || left.id.localeCompare(right.id),
    ),
    MAX_STAGE7_EQUIVALENT_TARGET_COUNT,
  );

  const activeMemories = compactLimitedArray(
    allActiveMemories
      .filter((memory) => canonicalMemoryIds.has(memory.id) || !memory.sourceSemanticPoolId || relatedSemanticPools.some((pool) => pool.id === memory.sourceSemanticPoolId))
      .sort((left, right) =>
        (right.confidenceScore ?? 0) - (left.confidenceScore ?? 0)
        || right.reinforcementCount - left.reinforcementCount
        || left.id.localeCompare(right.id),
      ),
    4,
  );

  const providerSawCanonicalTargetsOnly = relatedSemanticPools.length < semanticPools.length || relatedSemanticPools.length <= 1;
  const singleCanonicalTarget = relatedSemanticPools.length === 1 ? relatedSemanticPools[0] : null;

  return {
    relatedSemanticPools,
    activeMemories,
    canonicalTargetSemanticPoolId: singleCanonicalTarget?.id ?? null,
    canonicalTargetSelectionReason: singleCanonicalTarget?.canonicalTargetSelectionReason ?? null,
    collapsedAlternativeSemanticPoolIds: singleCanonicalTarget?.collapsedAlternativeSemanticPoolIds ?? [],
    collapsedAlternativeMemoryIds: singleCanonicalTarget?.collapsedAlternativeMemoryIds ?? [],
    targetEquivalenceKey: singleCanonicalTarget?.targetEquivalenceKey ?? null,
    providerSawCanonicalTargetsOnly,
  } satisfies SemanticGroupingExistingDomainContext;
}

async function loadSemanticPoolEventLinks(params: {
  organizationId: string;
  semanticPoolId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_memory_semantic_pool_events" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("semantic_pool_id", params.semanticPoolId as never)
    .order("linked_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

function buildNoPoolDiagnosticProposal(
  batch: SemanticGroupingBatch,
  reasonSummary: string,
  options: {
    noPoolReasonCode?: SemanticNoPoolReasonCode | null;
    targetSemanticPoolId?: string | null;
    retainedReasonSummary?: string | null;
  } = {},
) {
  const proposal = validateSemanticPoolProposal(batch, {
    proposalKind: "no_pool",
    domainLabel: null,
    domainSummary: null,
    groupingRationale: null,
    variantSummary: null,
    confidence: null,
    noPoolReasonCode: options.noPoolReasonCode ?? "other",
    noPoolReasonSummary: reasonSummary,
    targetSemanticPoolId: options.targetSemanticPoolId ?? null,
    reasonSummary: options.retainedReasonSummary ?? reasonSummary,
    includedEvidenceEventIds: [],
    excludedEvidenceEventIds: [],
    adjacentEvidenceEventIds: [],
    uncertainEvidenceEventIds: [],
  });

  return {
    ...proposal,
    targetSemanticPoolId: options.targetSemanticPoolId ?? null,
    reasonSummary: options.retainedReasonSummary ?? reasonSummary,
  } satisfies ValidatedSemanticPoolProposal;
}

async function validateReinforcementSemanticPoolProposal(batch: SemanticGroupingBatch, proposal: ValidatedSemanticPoolProposal) {
  if (proposal.proposalKind !== "reinforce_existing_semantic_pool") {
    return proposal;
  }

  const targetSemanticPoolId = proposal.targetSemanticPoolId;
  if (!targetSemanticPoolId) {
    return buildNoPoolDiagnosticProposal(batch, "Stage 7 reinforcement target was missing.", {
      retainedReasonSummary: proposal.reasonSummary,
    });
  }

  const targetPool = batch.existingDomainContext.relatedSemanticPools.find((pool) => pool.id === targetSemanticPoolId);
  if (!targetPool || targetPool.poolStatus !== "active") {
    return buildNoPoolDiagnosticProposal(batch, "Stage 7 reinforcement target was invalid or inactive.", {
      targetSemanticPoolId,
      retainedReasonSummary: proposal.reasonSummary,
    });
  }

  const eventIds = new Set(batch.events.map((event) => event.eventId));
  const classificationIdsByEventId = new Map(
    batch.events.map((event) => [event.eventId, event.classificationRecordId ?? ""] as const),
  );
  const allRoleIds = new Set<string>();
  for (const eventId of [
    ...proposal.includedEvidenceEventIds,
    ...proposal.uncertainEvidenceEventIds,
    ...proposal.adjacentEvidenceEventIds,
    ...proposal.excludedEvidenceEventIds,
  ]) {
    if (allRoleIds.has(eventId)) {
      return buildNoPoolDiagnosticProposal(batch, "Stage 7 reinforcement roles overlapped across the same evidence ids.", {
        targetSemanticPoolId,
        retainedReasonSummary: proposal.reasonSummary,
      });
    }
    allRoleIds.add(eventId);
  }

  if (proposal.includedEvidenceEventIds.length === 0) {
    return buildNoPoolDiagnosticProposal(batch, "Stage 7 reinforcement had no included evidence.", {
      targetSemanticPoolId,
      retainedReasonSummary: proposal.reasonSummary,
    });
  }

  for (const eventId of proposal.includedEvidenceEventIds) {
    if (!eventIds.has(eventId)) {
      return buildNoPoolDiagnosticProposal(batch, "Stage 7 reinforcement referenced evidence outside the candidate packet.", {
        targetSemanticPoolId,
        retainedReasonSummary: proposal.reasonSummary,
      });
    }
    if (!classificationIdsByEventId.get(eventId)) {
      return buildNoPoolDiagnosticProposal(batch, "Stage 7 reinforcement included evidence without exact classification provenance.", {
        targetSemanticPoolId,
        retainedReasonSummary: proposal.reasonSummary,
      });
    }
  }

  const currentLinks = await loadSemanticPoolEventLinks({
    organizationId: batch.organizationId,
    semanticPoolId: targetSemanticPoolId,
  });
  const creditedClassificationIds = new Set(
    currentLinks
      .map((row) => toNullableString(row.classification_record_id))
      .filter((value): value is string => Boolean(value)),
  );
  const netNewClassificationIds = proposal.includedEvidenceEventIds
    .map((eventId) => classificationIdsByEventId.get(eventId) ?? "")
    .filter((classificationId) => classificationId.length > 0 && !creditedClassificationIds.has(classificationId));

  if (netNewClassificationIds.length === 0) {
    return buildNoPoolDiagnosticProposal(batch, "Stage 7 reinforcement had no net-new classified support for the target semantic pool.", {
      targetSemanticPoolId,
      retainedReasonSummary: proposal.reasonSummary,
    });
  }

  return proposal;
}

function buildExactClassifiedWorksheetMemoryEvent(params: {
  eventRow: Record<string, unknown>;
  classificationRow: Record<string, unknown>;
}): ClassifiedWorksheetMemoryEvent | null {
  const eventId = toNullableString(params.eventRow.id);
  const organizationId = toNullableString(params.eventRow.organization_id);
  const occurredAt = toNullableString(params.eventRow.occurred_at);
  if (!eventId || !organizationId || !occurredAt) {
    return null;
  }

  return {
    eventId,
    organizationId,
    classificationRecordId: toNullableString(params.classificationRow.id),
    classificationAttemptNumber: toNullableNumber(params.classificationRow.attempt_number),
    projectId: toNullableString(params.eventRow.project_id),
    opportunityId: toNullableString(params.eventRow.opportunity_id),
    eventType: toNullableString(params.eventRow.event_type) ?? "worksheet_cell_edited",
    occurredAt,
    metadata: compactJsonRecord(params.eventRow.metadata, 64),
    diffData: compactJsonRecord(params.eventRow.diff_data, 64),
    classificationStatus: "classified",
    classificationVersion: toNullableNumber(params.classificationRow.classification_version) ?? 1,
    classificationSource: toNullableString(params.classificationRow.classification_source),
    classificationProvider: toNullableString(params.classificationRow.classification_provider),
    classificationModel: toNullableString(params.classificationRow.classification_model),
    classificationModelVersion: toNullableString(params.classificationRow.classification_model_version),
    overallConfidence: toNullableNumber(params.classificationRow.overall_confidence),
    reasoningSummary: toNullableString(params.classificationRow.reasoning_summary),
    semanticFields: compactJsonRecord(params.classificationRow.semantic_fields, 32) as ClassifiedWorksheetMemoryEvent["semanticFields"],
    interpretationSchemaVersion: toNullableNumber(params.classificationRow.interpretation_schema_version),
    interpretationPayload: compactJsonRecord(params.classificationRow.interpretation_payload, 64),
    interpretationPromptVersion: toNullableNumber(params.classificationRow.interpretation_prompt_version),
    contextSources: compactJsonRecord(params.classificationRow.context_sources, 32),
    constructionIntelligenceInputs: compactJsonRecord(params.classificationRow.construction_intelligence_inputs, 32),
    futureUseSummary: compactJsonRecord(params.classificationRow.future_use_summary, 32),
    confidenceDetail: compactJsonRecord(params.classificationRow.confidence_detail, 32),
    classifiedAt: toNullableString(params.classificationRow.classified_at),
  };
}

async function loadExactClassifiedEventsForSourceLinks(params: {
  organizationId: string;
  sourceLinks: SemanticGroupingSourceLink[];
}) {
  if (params.sourceLinks.length === 0) {
    return {
      events: [] as ClassifiedWorksheetMemoryEvent[],
      unresolvedLinks: [] as SemanticGroupingSourceLink[],
    };
  }

  const admin = createAdminSupabaseClient();
  const eventIds = Array.from(new Set(params.sourceLinks.map((link) => link.sourceEventId)));
  const classificationIds = Array.from(new Set(params.sourceLinks.map((link) => link.classificationRecordId)));

  const [{ data: eventRows, error: eventError }, { data: classificationRows, error: classificationError }] = await Promise.all([
    admin
      .from("intelligence_events" as never)
      .select("id, organization_id, project_id, opportunity_id, event_type, occurred_at, metadata, diff_data")
      .eq("organization_id", params.organizationId as never)
      .in("id", eventIds as never),
    admin
      .from("worksheet_event_classifications" as never)
      .select([
        "id",
        "organization_id",
        "source_event_id",
        "classification_version",
        "attempt_number",
        "classification_source",
        "classification_provider",
        "classification_model",
        "classification_model_version",
        "overall_confidence",
        "reasoning_summary",
        "semantic_fields",
        "interpretation_schema_version",
        "interpretation_payload",
        "interpretation_prompt_version",
        "context_sources",
        "construction_intelligence_inputs",
        "future_use_summary",
        "confidence_detail",
        "classified_at",
      ].join(", "))
      .eq("organization_id", params.organizationId as never)
      .in("id", classificationIds as never),
  ]);

  if (eventError) {
    throw new Error(eventError.message);
  }
  if (classificationError) {
    throw new Error(classificationError.message);
  }

  const eventById = new Map(
    (Array.isArray(eventRows) ? eventRows : []).map((row) => [toNullableString((row as Record<string, unknown>).id) ?? "", row as Record<string, unknown>] as const),
  );
  const classificationById = new Map(
    (Array.isArray(classificationRows) ? classificationRows : []).map((row) => [toNullableString((row as Record<string, unknown>).id) ?? "", row as Record<string, unknown>] as const),
  );

  const events: ClassifiedWorksheetMemoryEvent[] = [];
  const unresolvedLinks: SemanticGroupingSourceLink[] = [];

  for (const link of params.sourceLinks) {
    const eventRow = eventById.get(link.sourceEventId);
    const classificationRow = classificationById.get(link.classificationRecordId);

    if (!eventRow || !classificationRow) {
      unresolvedLinks.push(link);
      continue;
    }

    if (toNullableString(classificationRow.source_event_id) !== link.sourceEventId) {
      unresolvedLinks.push(link);
      continue;
    }

    const event = buildExactClassifiedWorksheetMemoryEvent({
      eventRow,
      classificationRow,
    });

    if (!event) {
      unresolvedLinks.push(link);
      continue;
    }

    events.push(event);
  }

  return {
    events,
    unresolvedLinks,
  };
}

async function buildSemanticGroupingBatch(params: {
  queueRow: WorksheetMemorySemanticPoolQueueRow;
  maxSeedPoolCount: number;
}) {
  const seedPool = await loadSeedPoolById(params.queueRow.seedPoolId, params.queueRow.organizationId);
  const candidatePools = await loadCandidateSeedPools(seedPool, params.maxSeedPoolCount);
  const seedPools = candidatePools.primaryPools;
  const oppositeDirectionPools = candidatePools.oppositeDirectionPools;
  const links = await loadSeedPoolEventLinks(seedPools.map((pool) => pool.id), params.queueRow.organizationId);
  const seedPoolById = new Map(seedPools.map((pool) => [pool.id, pool] as const));
  const sourceLinks = links
    .map((row) => {
      const stage6PoolId = toNullableString(row.pool_id) ?? "";
      const stage6Pool = seedPoolById.get(stage6PoolId);
      return {
        organizationId: params.queueRow.organizationId,
        stage6PoolId,
        stage6PoolSignature: stage6Pool?.poolSignature ?? "",
        stage6PoolRevisionHash: stage6Pool?.poolRevisionHash ?? "",
        sourceEventId: toNullableString(row.source_event_id) ?? "",
        classificationRecordId: toNullableString(row.classification_record_id) ?? "",
        occurredAt: toNullableString(row.occurred_at),
      } satisfies SemanticGroupingSourceLink;
    })
    .filter((link) =>
      link.stage6PoolId.length > 0
      && link.sourceEventId.length > 0
      && link.classificationRecordId.length > 0
      && link.stage6PoolRevisionHash.length > 0,
    );
  const exactEvents = await loadExactClassifiedEventsForSourceLinks({
    organizationId: params.queueRow.organizationId,
    sourceLinks,
  });
  if (exactEvents.unresolvedLinks.length > 0) {
    const unresolvedIds = exactEvents.unresolvedLinks
      .map((link) => `${link.sourceEventId}:${link.classificationRecordId}`)
      .join(", ");
    throw new Error(`Stage 7 exact classification provenance was unresolved for ${unresolvedIds}.`);
  }
  const events = exactEvents.events
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId));
  const existingDomainContext = await loadExistingDomainContext({
    organizationId: params.queueRow.organizationId,
    sourceEventIds: events.map((event) => event.eventId),
  });

  return {
    batchId: `${params.queueRow.organizationId}:semantic-pool:${params.queueRow.id}`,
    organizationId: params.queueRow.organizationId,
    seedQueueRowId: params.queueRow.id,
    seedPoolId: params.queueRow.seedPoolId,
    seedPoolSignature: params.queueRow.seedPoolSignature,
    seedPoolRevisionHash: params.queueRow.seedPoolRevisionHash,
    seedPoolMaturityStatus: params.queueRow.seedMaturityStatus,
    stagingPools: seedPools,
    oppositeDirectionPools,
    selectedPoolIds: seedPools.map((pool) => pool.id).sort(),
    sourceLinks,
    events,
    existingDomainContext,
  } satisfies SemanticGroupingBatch;
}

async function callAnthropicSemanticGroupingBatch(batch: SemanticGroupingBatch, params: {
  timeoutMs: number;
  maxOutputTokens: number;
}) {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const systemPrompt = buildWorksheetMemorySemanticGroupingSystemPrompt();
  const userPrompt = buildWorksheetMemorySemanticGroupingUserPrompt(batch);
  const schema = buildWorksheetMemorySemanticGroupingSchema();

  console.info("[worksheet-memory-semantic-pools-batch]", {
    batchId: batch.batchId,
    organizationId: batch.organizationId,
    seedPoolId: batch.seedPoolId,
    stagingPoolCount: batch.stagingPools.length,
    oppositeDirectionPoolCount: batch.oppositeDirectionPools.length,
    existingSemanticPoolContextCount: batch.existingDomainContext.relatedSemanticPools.length,
    existingMemoryContextCount: batch.existingDomainContext.activeMemories.length,
    eventCount: batch.events.length,
    workflowStage: "worksheet_memory_semantic_pool_grouping",
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
      workflowStage: "worksheet_memory_semantic_pool_grouping",
      batchId: batch.batchId,
      organizationId: batch.organizationId,
      seedPoolId: batch.seedPoolId,
    },
  });

  return {
    providerResult,
    pools: normalizeProviderSemanticPools(providerResult),
  };
}

function mapSemanticPoolRow(row: Record<string, unknown>): WorksheetMemorySemanticPool {
  return {
    id: toNullableString(row.id) ?? "",
    organizationId: toNullableString(row.organization_id) ?? "",
    semanticSignature: toNullableString(row.semantic_signature) ?? "",
    domainLabel: toNullableString(row.domain_label) ?? toNullableString(row.title),
    domainSummary: toNullableString(row.domain_summary) ?? toNullableString(row.summary),
    groupingRationale: toNullableString(row.grouping_rationale),
    variantSummary: toNullableString(row.variant_summary),
    semanticFamily: toNullableString(row.semantic_family),
    semanticType: toNullableString(row.semantic_type),
    poolStatus: (toNullableString(row.pool_status) as WorksheetMemorySemanticPoolStatus) ?? "active",
    maturityStatus: (toNullableString(row.maturity_status) as WorksheetMemorySemanticPoolMaturityStatus) ?? "emerging",
    title: toNullableString(row.title),
    summary: toNullableString(row.summary),
    retrievalGuidance: toNullableString(row.retrieval_guidance),
    scopePayload: compactJsonRecord(row.scope_payload, 32),
    poolValuePayload: compactJsonRecord(row.pool_value_payload, 32),
    evidenceSummary: compactJsonRecord(row.evidence_summary, 32),
    contradictionSummary: compactJsonRecord(row.contradiction_summary, 32),
    supportCount: toNullableNumber(row.support_count) ?? 0,
    contradictionCount: toNullableNumber(row.contradiction_count) ?? 0,
    ignoredCount: toNullableNumber(row.ignored_count) ?? 0,
    includedCount: toNullableNumber(row.included_count) ?? 0,
    excludedCount: toNullableNumber(row.excluded_count) ?? 0,
    adjacentCount: toNullableNumber(row.adjacent_count) ?? 0,
    uncertainCount: toNullableNumber(row.uncertain_count) ?? 0,
    worksheetCount: toNullableNumber(row.worksheet_count) ?? 0,
    workbookCount: toNullableNumber(row.workbook_count) ?? 0,
    projectCount: toNullableNumber(row.project_count) ?? 0,
    averageConfidence: toNullableNumber(row.average_confidence),
    firstSeenAt: toNullableString(row.first_seen_at) ?? new Date().toISOString(),
    lastSeenAt: toNullableString(row.last_seen_at) ?? new Date().toISOString(),
    lastGroupedAt: toNullableString(row.last_grouped_at),
    sourceRevisionHash: toNullableString(row.source_revision_hash) ?? "",
    createdByRunId: toNullableString(row.created_by_run_id),
    lastUpdatedByRunId: toNullableString(row.last_updated_by_run_id),
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
  };
}

async function upsertSemanticPool(params: {
  runId: string;
  sourceRevisionHash: string;
  proposal: ValidatedSemanticPoolProposal;
}) {
  const admin = createAdminSupabaseClient();
  const evidenceSummary = compactJsonRecord(params.proposal.evidenceSummary, 32);

  const payload = {
    organization_id: params.proposal.organizationId,
    semantic_signature: params.proposal.semanticSignature,
    domain_label: params.proposal.domainLabel,
    domain_summary: params.proposal.domainSummary,
    grouping_rationale: params.proposal.groupingRationale,
    variant_summary: params.proposal.variantSummary,
    semantic_family: null,
    semantic_type: null,
    pool_status: params.proposal.poolStatus,
    maturity_status: params.proposal.maturityStatus,
    title: params.proposal.domainLabel,
    summary: params.proposal.domainSummary,
    retrieval_guidance: null,
    scope_payload: {},
    pool_value_payload: {},
    evidence_summary: evidenceSummary,
    contradiction_summary: {
      adjacentCount: toNullableNumber(evidenceSummary.adjacentCount) ?? 0,
      uncertainCount: toNullableNumber(evidenceSummary.uncertainCount) ?? 0,
      excludedCount: toNullableNumber(evidenceSummary.excludedCount) ?? 0,
    },
    support_count: toNullableNumber(evidenceSummary.includedCount) ?? 0,
    contradiction_count: toNullableNumber(evidenceSummary.uncertainCount) ?? 0,
    ignored_count: toNullableNumber(evidenceSummary.excludedCount) ?? 0,
    included_count: toNullableNumber(evidenceSummary.includedCount) ?? 0,
    excluded_count: toNullableNumber(evidenceSummary.excludedCount) ?? 0,
    adjacent_count: toNullableNumber(evidenceSummary.adjacentCount) ?? 0,
    uncertain_count: toNullableNumber(evidenceSummary.uncertainCount) ?? 0,
    worksheet_count: toNullableNumber(evidenceSummary.worksheetCount) ?? 0,
    workbook_count: toNullableNumber(evidenceSummary.workbookCount) ?? 0,
    project_count: toNullableNumber(evidenceSummary.projectCount) ?? 0,
    average_confidence: toNullableNumber(evidenceSummary.averageConfidence),
    first_seen_at: toNullableString(evidenceSummary.firstSeenAt) ?? new Date().toISOString(),
    last_seen_at: toNullableString(evidenceSummary.lastSeenAt) ?? new Date().toISOString(),
    last_grouped_at: new Date().toISOString(),
    source_revision_hash: params.sourceRevisionHash,
    created_by_run_id: params.runId,
    last_updated_by_run_id: params.runId,
  };

  const { data, error } = await admin
    .from("worksheet_memory_semantic_pools" as never)
    .upsert(payload as never, {
      onConflict: "organization_id,semantic_signature",
    } as never)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapSemanticPoolRow((data ?? {}) as Record<string, unknown>);
}

async function replaceSemanticPoolEvidenceLinks(params: {
  semanticPoolId: string;
  organizationId: string;
  runId: string;
  proposal: ValidatedSemanticPoolProposal;
  eventsById: Map<string, ClassifiedWorksheetMemoryEvent>;
}) {
  const admin = createAdminSupabaseClient();
  const records = [
    ...params.proposal.includedEvidenceEventIds.map((sourceEventId) => ({
      semantic_pool_id: params.semanticPoolId,
      organization_id: params.organizationId,
      source_event_id: sourceEventId,
      classification_record_id: params.eventsById.get(sourceEventId)?.classificationRecordId ?? null,
      evidence_role: "included",
      linked_by_run_id: params.runId,
    })),
    ...params.proposal.excludedEvidenceEventIds.map((sourceEventId) => ({
      semantic_pool_id: params.semanticPoolId,
      organization_id: params.organizationId,
      source_event_id: sourceEventId,
      classification_record_id: params.eventsById.get(sourceEventId)?.classificationRecordId ?? null,
      evidence_role: "excluded",
      linked_by_run_id: params.runId,
    })),
    ...params.proposal.adjacentEvidenceEventIds.map((sourceEventId) => ({
      semantic_pool_id: params.semanticPoolId,
      organization_id: params.organizationId,
      source_event_id: sourceEventId,
      classification_record_id: params.eventsById.get(sourceEventId)?.classificationRecordId ?? null,
      evidence_role: "adjacent",
      linked_by_run_id: params.runId,
    })),
    ...params.proposal.uncertainEvidenceEventIds.map((sourceEventId) => ({
      semantic_pool_id: params.semanticPoolId,
      organization_id: params.organizationId,
      source_event_id: sourceEventId,
      classification_record_id: params.eventsById.get(sourceEventId)?.classificationRecordId ?? null,
      evidence_role: "uncertain",
      linked_by_run_id: params.runId,
    })),
  ];

  if (records.length === 0) {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.rpc("replace_worksheet_memory_semantic_pool_events" as never, {
      p_semantic_pool_id: params.semanticPoolId,
      p_organization_id: params.organizationId,
      p_records: [],
    } as never);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await admin.rpc("replace_worksheet_memory_semantic_pool_events" as never, {
    p_semantic_pool_id: params.semanticPoolId,
    p_organization_id: params.organizationId,
    p_records: records,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

async function recomputeSemanticPoolCounts(params: {
  semanticPoolId: string;
  semanticPool: WorksheetMemorySemanticPool;
  runId: string;
  sourceRevisionHash: string;
  proposal?: Pick<
    ValidatedSemanticPoolProposal,
    "domainLabel" | "domainSummary" | "groupingRationale" | "evidenceSummary"
  >;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_memory_semantic_pool_events" as never)
    .select("*")
    .eq("semantic_pool_id", params.semanticPoolId as never)
    .eq("organization_id", params.semanticPool.organizationId as never);

  if (error) {
    throw new Error(error.message);
  }

  const links = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  const exactLinks = links
    .map((row) => ({
      organizationId: params.semanticPool.organizationId,
      stage6PoolId: "",
      stage6PoolSignature: "",
      stage6PoolRevisionHash: "",
      sourceEventId: toNullableString(row.source_event_id) ?? "",
      classificationRecordId: toNullableString(row.classification_record_id) ?? "",
      occurredAt: toNullableString(row.occurred_at),
    } satisfies SemanticGroupingSourceLink))
    .filter((link) => link.sourceEventId.length > 0 && link.classificationRecordId.length > 0);
  const exactEvents = await loadExactClassifiedEventsForSourceLinks({
    organizationId: params.semanticPool.organizationId,
    sourceLinks: exactLinks,
  });
  const exactEventsById = new Map(exactEvents.events.map((event) => [event.eventId, event] as const));
  const includedEvents = links
    .filter((row) => toNullableString(row.evidence_role) === "included")
    .map((row) => exactEventsById.get(toNullableString(row.source_event_id) ?? ""))
    .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event));
  const adjacentEvents = links
    .filter((row) => toNullableString(row.evidence_role) === "adjacent")
    .map((row) => exactEventsById.get(toNullableString(row.source_event_id) ?? ""))
    .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event));
  const uncertainEvents = links
    .filter((row) => toNullableString(row.evidence_role) === "uncertain")
    .map((row) => exactEventsById.get(toNullableString(row.source_event_id) ?? ""))
    .filter((event): event is ClassifiedWorksheetMemoryEvent => Boolean(event));
  const excludedCount = links.filter((row) => toNullableString(row.evidence_role) === "excluded").length;
  const groupedEvents = [...includedEvents, ...adjacentEvents, ...uncertainEvents];
  const groupMetrics = computeSupportMetrics(groupedEvents);
  const poolStatus = deriveSemanticPoolStatus({
    groupedCount: groupedEvents.length,
  });
  const maturityStatus = deriveSemanticPoolMaturity({
    groupedCount: groupedEvents.length,
    worksheetCount: groupMetrics.worksheetCount,
    projectCount: groupMetrics.projectCount,
  });

  const evidenceSummary = {
    ...(params.proposal?.evidenceSummary ?? params.semanticPool.evidenceSummary),
    groupedCount: groupedEvents.length,
    includedCount: includedEvents.length,
    excludedCount,
    adjacentCount: adjacentEvents.length,
    uncertainCount: uncertainEvents.length,
    worksheetCount: groupMetrics.worksheetCount,
    workbookCount: groupMetrics.workbookCount,
    projectCount: groupMetrics.projectCount,
    averageConfidence: groupMetrics.averageConfidence,
    firstSeenAt: groupMetrics.firstSeenAt,
    lastSeenAt: groupMetrics.lastSeenAt,
  };

  const { data: updated, error: updateError } = await admin
    .from("worksheet_memory_semantic_pools" as never)
    .update({
      pool_status: poolStatus,
      maturity_status: maturityStatus,
      domain_label: params.proposal?.domainLabel ?? params.semanticPool.domainLabel,
      domain_summary: params.proposal?.domainSummary ?? params.semanticPool.domainSummary,
      grouping_rationale: params.proposal?.groupingRationale ?? params.semanticPool.groupingRationale,
      variant_summary: buildVariantSummary(groupedEvents),
      title: params.proposal?.domainLabel ?? params.semanticPool.domainLabel,
      summary: params.proposal?.domainSummary ?? params.semanticPool.domainSummary,
      evidence_summary: evidenceSummary,
      contradiction_summary: {
        adjacentCount: adjacentEvents.length,
        uncertainCount: uncertainEvents.length,
        excludedCount,
      },
      support_count: includedEvents.length,
      contradiction_count: uncertainEvents.length,
      ignored_count: excludedCount,
      included_count: includedEvents.length,
      excluded_count: excludedCount,
      adjacent_count: adjacentEvents.length,
      uncertain_count: uncertainEvents.length,
      worksheet_count: groupMetrics.worksheetCount,
      workbook_count: groupMetrics.workbookCount,
      project_count: groupMetrics.projectCount,
      average_confidence: groupMetrics.averageConfidence,
      first_seen_at: groupMetrics.firstSeenAt,
      last_seen_at: groupMetrics.lastSeenAt,
      last_grouped_at: new Date().toISOString(),
      source_revision_hash: params.sourceRevisionHash,
      last_updated_by_run_id: params.runId,
    } as never)
    .eq("id", params.semanticPoolId as never)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(updateError.message);
  }

  return mapSemanticPoolRow((updated ?? {}) as Record<string, unknown>);
}

async function enqueueWorksheetMemorySynthesisForSemanticPool(params: {
  organizationId: string;
  semanticPoolId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("enqueue_worksheet_memory_synthesis_queue" as never, {
    p_limit: 1,
    p_organization_id: params.organizationId,
    p_semantic_pool_id: params.semanticPoolId,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return toNullableNumber(payload.count) ?? 0;
}

async function reviseExistingSemanticPool(params: {
  runId: string;
  batch: SemanticGroupingBatch;
  proposal: ValidatedSemanticPoolProposal;
  sourceRevisionHashOverride?: string | null;
}) {
  const targetSemanticPoolId = params.proposal.targetSemanticPoolId;
  if (!targetSemanticPoolId) {
    throw new Error("Existing semantic pool reinforcement is missing a targetSemanticPoolId.");
  }

  const targetSemanticPool = await getWorksheetMemorySemanticPoolDetail(targetSemanticPoolId, params.batch.organizationId);
  if (!targetSemanticPool || targetSemanticPool.poolStatus !== "active") {
    throw new Error("Existing semantic pool reinforcement target was not found or inactive.");
  }

  const existingLinks = await loadSemanticPoolEventLinks({
    organizationId: params.batch.organizationId,
    semanticPoolId: targetSemanticPoolId,
  });
  const exactEventsById = new Map(params.batch.events.map((event) => [event.eventId, event] as const));
  const existingByEventId = new Map(
    existingLinks.map((row) => [
      toNullableString(row.source_event_id) ?? "",
      {
        sourceEventId: toNullableString(row.source_event_id) ?? "",
        classificationRecordId: toNullableString(row.classification_record_id),
        evidenceRole: (toNullableString(row.evidence_role) as WorksheetMemorySemanticPoolEvidenceRole | null) ?? "excluded",
      },
    ] as const),
  );

  const nextRoleByEventId = new Map<string, WorksheetMemorySemanticPoolEvidenceRole>();
  for (const row of existingByEventId.values()) {
    if (row.sourceEventId) {
      nextRoleByEventId.set(row.sourceEventId, row.evidenceRole);
    }
  }
  for (const eventId of params.proposal.excludedEvidenceEventIds) {
    nextRoleByEventId.set(eventId, "excluded");
  }
  for (const eventId of params.proposal.adjacentEvidenceEventIds) {
    nextRoleByEventId.set(eventId, "adjacent");
  }
  for (const eventId of params.proposal.uncertainEvidenceEventIds) {
    nextRoleByEventId.set(eventId, "uncertain");
  }
  for (const eventId of params.proposal.includedEvidenceEventIds) {
    nextRoleByEventId.set(eventId, "included");
  }

  const allEventIds = compactSortedArray([
    ...Array.from(existingByEventId.keys()),
    ...Array.from(nextRoleByEventId.keys()),
  ]);
  const mergedRecords = allEventIds.map((eventId) => ({
    semantic_pool_id: targetSemanticPoolId,
    organization_id: params.batch.organizationId,
    source_event_id: eventId,
    classification_record_id:
      exactEventsById.get(eventId)?.classificationRecordId
      ?? existingByEventId.get(eventId)?.classificationRecordId
      ?? null,
    evidence_role: nextRoleByEventId.get(eventId) ?? existingByEventId.get(eventId)?.evidenceRole ?? "excluded",
    linked_by_run_id: params.runId,
  })).filter((record) => toNullableString(record.source_event_id) && toNullableString(record.classification_record_id));

  const revisionMemberships = mergedRecords
    .map((record) => {
      const classificationRecordId = toNullableString(record.classification_record_id);
      if (!classificationRecordId) {
        return null;
      }

      return {
        stage6PoolId: targetSemanticPoolId,
        stage6PoolSignature: targetSemanticPool.semanticSignature,
        stage6PoolRevisionHash: targetSemanticPool.sourceRevisionHash,
        sourceEventId: record.source_event_id,
        classificationRecordId,
        evidenceRole: record.evidence_role as "included" | "adjacent" | "uncertain" | "excluded",
      };
    })
    .filter((record): record is {
      stage6PoolId: string;
      stage6PoolSignature: string;
      stage6PoolRevisionHash: string;
      sourceEventId: string;
      classificationRecordId: string;
      evidenceRole: "included" | "adjacent" | "uncertain" | "excluded";
    } => Boolean(record));

  const sourceRevisionHash =
    params.sourceRevisionHashOverride
    ?? buildSemanticPoolSourceRevisionHash({
      organizationId: params.batch.organizationId,
      seedPoolId: params.batch.seedPoolId,
      selectedPoolIds: compactSortedArray([targetSemanticPoolId, ...params.batch.selectedPoolIds]),
      selectedPoolMemberships: revisionMemberships,
    });

  if (sourceRevisionHash === targetSemanticPool.sourceRevisionHash) {
    return {
      semanticPool: targetSemanticPool,
      stage8QueueInsertCount: 0,
      sourceRevisionHash,
      includedClassificationRecordIds: params.proposal.includedEvidenceEventIds
        .map((eventId) => exactEventsById.get(eventId)?.classificationRecordId ?? existingByEventId.get(eventId)?.classificationRecordId ?? null)
        .filter((value): value is string => Boolean(value)),
      noAction: true,
    };
  }

  const { error: replaceError } = await createAdminSupabaseClient().rpc("replace_worksheet_memory_semantic_pool_events" as never, {
    p_semantic_pool_id: targetSemanticPoolId,
    p_organization_id: params.batch.organizationId,
    p_records: mergedRecords,
  } as never);
  if (replaceError) {
    throw new Error(replaceError.message);
  }

  const recomputed = await recomputeSemanticPoolCounts({
    semanticPoolId: targetSemanticPoolId,
    semanticPool: targetSemanticPool,
    runId: params.runId,
    sourceRevisionHash,
    proposal: params.proposal,
  });
  const stage8QueueInsertCount = await enqueueWorksheetMemorySynthesisForSemanticPool({
    organizationId: params.batch.organizationId,
    semanticPoolId: targetSemanticPoolId,
  });

  return {
    semanticPool: recomputed,
    stage8QueueInsertCount,
    sourceRevisionHash,
    includedClassificationRecordIds: params.proposal.includedEvidenceEventIds
      .map((eventId) => exactEventsById.get(eventId)?.classificationRecordId ?? existingByEventId.get(eventId)?.classificationRecordId ?? null)
      .filter((value): value is string => Boolean(value)),
    noAction: false,
  };
}

export async function runWorksheetMemorySemanticPoolWorker(
  input: RunWorksheetMemorySemanticPoolWorkerInput = {},
) {
  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  const diagnostics: SemanticGroupingRunDiagnostic[] = [];
  const summary: RunWorksheetMemorySemanticPoolWorkerOutput = {
    runId,
    claimedJobCount: 0,
    completedJobCount: 0,
    retriedJobCount: 0,
    deadLetteredJobCount: 0,
    semanticPoolCount: 0,
    noPoolCount: 0,
    candidateEventCount: 0,
    provider: "anthropic",
    model: getPricingWorksheetAnthropicModel(),
    durationMs: 0,
  };

  await insertSemanticPoolRun({
    runId,
    requestedOrganizationId: input.organizationId ?? null,
    summary,
    diagnosticSummary: buildSemanticGroupingRunDiagnosticSummary(diagnostics),
  });

  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, 100));
  const maxSeedPoolCount = Math.max(1, Math.min(input.maxSeedPoolCount ?? DEFAULT_MAX_SEED_POOL_COUNT, 12));
  const claimedRows = await claimWorksheetMemorySemanticPoolBatch({
    limit,
    organizationId: input.organizationId ?? null,
    workerId: input.workerId ?? DEFAULT_WORKER_ID,
    leaseSeconds: input.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
  });
  summary.claimedJobCount = claimedRows.length;
  const accumulateFinalizeSummary = (finalizeSummary: {
    count: number;
    completedCount: number;
    retriedCount: number;
    deadLetteredCount: number;
  }) => {
    summary.completedJobCount += finalizeSummary.completedCount;
    summary.retriedJobCount += finalizeSummary.retriedCount;
    summary.deadLetteredJobCount += finalizeSummary.deadLetteredCount;
  };

  try {
    for (const row of claimedRows) {
      if (!row.claimToken) {
        continue;
      }

      try {
        const batch = await buildSemanticGroupingBatch({
          queueRow: row,
          maxSeedPoolCount,
        });

        if (batch.events.length === 0) {
          accumulateFinalizeSummary(await finalizeWorksheetMemorySemanticPoolBatch([{
            id: row.id,
            claimToken: row.claimToken,
            queueState: "dead_lettered",
            errorCode: "no_classified_events",
            errorMessage: "No classified worksheet evidence was available for the semantic grouping seed.",
          }]));
          continue;
        }

        summary.candidateEventCount += batch.events.length;
        const deterministicBucket = buildDeterministicBehaviourBucketProposal(batch);
        const deterministicMode: SemanticGroupingRunDiagnostic["deterministicMode"] =
          deterministicBucket.proposal ? "deterministic_bucket" : "provider";
        const deterministicReason = deterministicBucket.proposal?.reasonSummary ?? deterministicBucket.reason;
        const validatedProposals = deterministicBucket.proposal
          ? [deterministicBucket.proposal]
          : await (async () => {
              const response = await callAnthropicSemanticGroupingBatch(batch, {
                timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
              });

              const proposals = response.pools.length > 0
                ? response.pools.map((proposal, index) => ({
                  ...validateSemanticPoolProposal(batch, proposal),
                  proposalId: `${batch.batchId}:proposal:${index + 1}`,
                }))
                : [validateSemanticPoolProposal(batch, {
                    proposalKind: "no_pool",
                    domainLabel: null,
                    domainSummary: null,
                    groupingRationale: null,
                    variantSummary: null,
                    confidence: null,
                    noPoolReasonCode: "other",
                    noPoolReasonSummary: "The candidate evidence did not form a coherent neutral evidence domain.",
                    includedEvidenceEventIds: [],
                    excludedEvidenceEventIds: [],
                    adjacentEvidenceEventIds: [],
                    uncertainEvidenceEventIds: [],
                  })];
              return Promise.all(
                proposals.map((proposal) => validateReinforcementSemanticPoolProposal(batch, proposal)),
              );
            })();

        const exactEventsById = new Map(batch.events.map((event) => [event.eventId, event] as const));
        let completed = true;
        let queueOutcome: SemanticGroupingRunDiagnostic["outcome"] = "no_pool";
        let noPoolReasonCode: SemanticNoPoolReasonCode | null = null;
        let noPoolReasonSummary: string | null = null;
        let targetSemanticPoolId: string | null = null;
        let includedEvidenceEventIds: string[] = [];
        let includedClassificationRecordIds: string[] = [];
        let sourceRevisionHash: string | null = null;
        let stage8QueueInsertCount = 0;
        let reasonSummary: string | null = null;
        let diagnosticCanonicalTargetSemanticPoolId = batch.existingDomainContext.canonicalTargetSemanticPoolId;
        let diagnosticCanonicalTargetSelectionReason = batch.existingDomainContext.canonicalTargetSelectionReason;
        let diagnosticCollapsedAlternativeSemanticPoolIds = batch.existingDomainContext.collapsedAlternativeSemanticPoolIds;
        let diagnosticCollapsedAlternativeMemoryIds = batch.existingDomainContext.collapsedAlternativeMemoryIds;
        let diagnosticTargetEquivalenceKey = batch.existingDomainContext.targetEquivalenceKey;
        let diagnosticTargetRankingInputs: Record<string, Json | null> | null =
          batch.existingDomainContext.canonicalTargetSemanticPoolId
            ? batch.existingDomainContext.relatedSemanticPools.find((pool) => pool.id === batch.existingDomainContext.canonicalTargetSemanticPoolId)?.targetRankingInputs ?? null
            : null;

        for (const proposal of validatedProposals) {
          if (proposal.proposalKind === "no_pool") {
            summary.noPoolCount += 1;
            noPoolReasonCode = proposal.noPoolReasonCode;
            noPoolReasonSummary = proposal.noPoolReasonSummary;
            targetSemanticPoolId = proposal.targetSemanticPoolId ?? targetSemanticPoolId;
            reasonSummary =
              proposal.reasonSummary
              ?? reasonSummary
              ?? (
                batch.existingDomainContext.canonicalTargetSemanticPoolId
                  ? "Provider rejected the canonical semantic target after duplicate-equivalent collapse."
                  : batch.existingDomainContext.providerSawCanonicalTargetsOnly
                    ? "No canonical semantic target was available after structural equivalence analysis."
                    : "Multiple non-equivalent semantic targets remained in context."
              );
            continue;
          }

          includedEvidenceEventIds = proposal.includedEvidenceEventIds;
          includedClassificationRecordIds = proposal.includedEvidenceEventIds
            .map((eventId) => exactEventsById.get(eventId)?.classificationRecordId ?? null)
            .filter((value): value is string => Boolean(value));

          if (deterministicMode === "deterministic_bucket" && proposal.targetSemanticPoolId) {
            const revised = await reviseExistingSemanticPool({
              runId,
              batch,
              proposal,
              sourceRevisionHashOverride: proposal.sourceRevisionHash,
            });
            if (revised.noAction) {
              summary.noPoolCount += 1;
              queueOutcome = "no_pool";
              noPoolReasonCode = "already_represented";
              noPoolReasonSummary = "The deterministic Stage 7 behaviour bucket was already fully credited on the target bucket.";
              targetSemanticPoolId = proposal.targetSemanticPoolId;
              sourceRevisionHash = revised.sourceRevisionHash;
              reasonSummary = proposal.reasonSummary;
              stage8QueueInsertCount = 0;
              continue;
            }

            queueOutcome = "semantic_pool";
            targetSemanticPoolId = revised.semanticPool.id;
            sourceRevisionHash = revised.sourceRevisionHash;
            reasonSummary = proposal.reasonSummary;
            stage8QueueInsertCount = revised.stage8QueueInsertCount;
            includedClassificationRecordIds = revised.includedClassificationRecordIds;
            summary.semanticPoolCount += 1;
            continue;
          }

          if (proposal.proposalKind === "reinforce_existing_semantic_pool") {
            const revised = await reviseExistingSemanticPool({
              runId,
              batch,
              proposal,
            });
            if (revised.noAction) {
              summary.noPoolCount += 1;
              queueOutcome = "no_pool";
              noPoolReasonCode = "already_represented";
              noPoolReasonSummary = "The candidate evidence was already fully credited on the target semantic pool.";
              targetSemanticPoolId = proposal.targetSemanticPoolId;
              sourceRevisionHash = revised.sourceRevisionHash;
              reasonSummary = proposal.reasonSummary;
              stage8QueueInsertCount = 0;
              continue;
            }

            queueOutcome = "reinforce_existing_semantic_pool";
            targetSemanticPoolId = revised.semanticPool.id;
            sourceRevisionHash = revised.sourceRevisionHash;
            reasonSummary = proposal.reasonSummary;
            stage8QueueInsertCount = revised.stage8QueueInsertCount;
            includedClassificationRecordIds = revised.includedClassificationRecordIds;
            summary.semanticPoolCount += 1;
            continue;
          }

          queueOutcome = "semantic_pool";
          const semanticPool = await upsertSemanticPool({
            runId,
            sourceRevisionHash: proposal.sourceRevisionHash ?? row.seedPoolRevisionHash,
            proposal,
          });
          await replaceSemanticPoolEvidenceLinks({
            semanticPoolId: semanticPool.id,
            organizationId: semanticPool.organizationId,
            runId,
            proposal,
            eventsById: exactEventsById,
          });
          const recomputed = await recomputeSemanticPoolCounts({
            semanticPoolId: semanticPool.id,
            semanticPool,
            runId,
            sourceRevisionHash: proposal.sourceRevisionHash ?? row.seedPoolRevisionHash,
          });
          stage8QueueInsertCount = await enqueueWorksheetMemorySynthesisForSemanticPool({
            organizationId: semanticPool.organizationId,
            semanticPoolId: semanticPool.id,
          });
          sourceRevisionHash = recomputed.sourceRevisionHash;
          reasonSummary = proposal.reasonSummary;
          summary.semanticPoolCount += 1;
        }

        diagnostics.push({
          queueRowId: row.id,
          seedPoolId: row.seedPoolId,
          candidatePoolIds: batch.selectedPoolIds,
          oppositeDirectionPoolIds: batch.oppositeDirectionPools.map((pool) => pool.id),
          candidateEventCount: batch.events.length,
          relatedSemanticPoolIds: batch.existingDomainContext.relatedSemanticPools.map((pool) => pool.id),
          relatedMemoryIds: batch.existingDomainContext.activeMemories.map((memory) => memory.id),
          canonicalTargetSemanticPoolId: diagnosticCanonicalTargetSemanticPoolId,
          canonicalTargetSelectionReason: diagnosticCanonicalTargetSelectionReason,
          collapsedAlternativeSemanticPoolIds: diagnosticCollapsedAlternativeSemanticPoolIds,
          collapsedAlternativeMemoryIds: diagnosticCollapsedAlternativeMemoryIds,
          targetEquivalenceKey: diagnosticTargetEquivalenceKey,
          targetRankingInputs: diagnosticTargetRankingInputs,
          providerSawCanonicalTargetsOnly: batch.existingDomainContext.providerSawCanonicalTargetsOnly,
          outcome: queueOutcome,
          semanticCandidateSummaryPresent: semanticCandidateSummaryPresent(batch),
          rejectedDespiteStructuralIdentityStrong: queueOutcome === "no_pool" && hasStrongStructuralIdentity(batch),
          deterministicMode,
          deterministicReason,
          targetSemanticPoolId,
          includedEvidenceEventIds,
          includedClassificationRecordIds,
          sourceRevisionHash,
          stage8QueueInsertCount,
          reasonSummary,
          noPoolReasonCode,
          noPoolReasonSummary,
        });

        if (completed) {
          accumulateFinalizeSummary(await finalizeWorksheetMemorySemanticPoolBatch([{
            id: row.id,
            claimToken: row.claimToken,
            queueState: "completed",
          }]));
        }
      } catch (error) {
        const failure = buildSemanticPoolQueueFailure(row, error);
        console.error("[worksheet-memory-semantic-pools] Row failed", {
          queueRowId: row.id,
          organizationId: row.organizationId,
          seedPoolId: row.seedPoolId,
          error: failure.errorMessage,
          errorCode: failure.errorCode,
        });
        accumulateFinalizeSummary(await finalizeWorksheetMemorySemanticPoolBatch([failure]));
      }
    }
  } finally {
    summary.durationMs = Date.now() - startedAt;
    await updateSemanticPoolRun({
      runId,
      requestedOrganizationId: input.organizationId ?? null,
      summary,
      diagnosticSummary: buildSemanticGroupingRunDiagnosticSummary(diagnostics),
    });
  }

  return summary;
}

export async function listWorksheetMemorySemanticPools(params: {
  organizationId: string;
  status?: string | null;
  maturityStatus?: string | null;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  const limit = Math.max(1, Math.min(Math.floor(params.limit ?? 100), 500));
  let query = admin
    .from("worksheet_memory_semantic_pools" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (params.status) {
    query = query.eq("pool_status", params.status as never);
  }
  if (params.maturityStatus) {
    query = query.eq("maturity_status", params.maturityStatus as never);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const pools = Array.isArray(data)
    ? data.map((row) => mapSemanticPoolRow((row ?? {}) as Record<string, unknown>))
    : [];

  return {
    organizationId: params.organizationId,
    count: pools.length,
    pools,
  };
}

export async function getWorksheetMemorySemanticPoolDetail(poolId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_memory_semantic_pools" as never)
    .select("*")
    .eq("id", poolId as never)
    .eq("organization_id", organizationId as never)
    .single();

  if (error) {
    if ("code" in error && error.code === "PGRST116") {
      return null;
    }
    throw new Error(error.message);
  }

  return mapSemanticPoolRow((data ?? {}) as Record<string, unknown>);
}

export async function getWorksheetMemorySemanticPoolEvidence(poolId: string, organizationId: string) {
  const pool = await getWorksheetMemorySemanticPoolDetail(poolId, organizationId);
  if (!pool) {
    return null;
  }

  const admin = createAdminSupabaseClient();
  const { data: links, error: linksError } = await admin
    .from("worksheet_memory_semantic_pool_events" as never)
    .select("*")
    .eq("semantic_pool_id", poolId as never)
    .eq("organization_id", organizationId as never);

  if (linksError) {
    throw new Error(linksError.message);
  }

  const evidenceLinks = Array.isArray(links) ? (links as Array<Record<string, unknown>>) : [];
  const eventIds = evidenceLinks
    .map((row) => toNullableString(row.source_event_id))
    .filter((value): value is string => Boolean(value));
  const classificationIds = evidenceLinks
    .map((row) => toNullableString(row.classification_record_id))
    .filter((value): value is string => Boolean(value));

  if (eventIds.length === 0) {
    return {
      poolId,
      evidence: [] as WorksheetMemorySemanticPoolEvidenceItem[],
    };
  }

  const { data: events, error: eventsError } = await admin
    .from("intelligence_events" as never)
    .select("id, event_type, occurred_at, project_id, opportunity_id, metadata, diff_data")
    .in("id", eventIds as never)
    .eq("organization_id", organizationId as never);

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const classificationResponse = classificationIds.length > 0
    ? await admin
        .from("worksheet_event_classifications" as never)
        .select("id, source_event_id, overall_confidence, reasoning_summary, semantic_fields, interpretation_payload, classified_at")
        .in("id", classificationIds as never)
        .eq("organization_id", organizationId as never)
    : { data: [], error: null };
  const { data: classifications, error: classificationsError } = classificationResponse;

  if (classificationsError) {
    throw new Error(classificationsError.message);
  }

  const eventsById = new Map(
    (Array.isArray(events) ? events : []).map((row) => [toNullableString((row as Record<string, unknown>).id) ?? "", row as Record<string, unknown>] as const),
  );
  const classificationsById = new Map(
    (Array.isArray(classifications) ? classifications : []).map((row) => [
      toNullableString((row as Record<string, unknown>).id) ?? "",
      row as Record<string, unknown>,
    ] as const),
  );

  const evidence = evidenceLinks.map((link) => {
    const sourceEventId = toNullableString(link.source_event_id) ?? "";
    const event = eventsById.get(sourceEventId) ?? {};
    const classification = classificationsById.get(toNullableString(link.classification_record_id) ?? "");
    return {
      sourceEventId,
      evidenceRole: (toNullableString(link.evidence_role) as WorksheetMemorySemanticPoolEvidenceRole) ?? "excluded",
      classificationRecordId: toNullableString(link.classification_record_id),
      linkedByRunId: toNullableString(link.linked_by_run_id),
      eventType: toNullableString(event.event_type),
      occurredAt: toNullableString(event.occurred_at),
      projectId: toNullableString(event.project_id),
      opportunityId: toNullableString(event.opportunity_id),
      metadata: compactJsonRecord(event.metadata, 48),
      diffData: compactJsonRecord(event.diff_data, 48),
      classification: classification
        ? {
            overallConfidence: toNullableNumber(classification.overall_confidence),
            reasoningSummary: toNullableString(classification.reasoning_summary),
            semanticFields: compactJsonRecord(classification.semantic_fields, 32),
            interpretationPayload: compactJsonRecord(classification.interpretation_payload, 48),
            classifiedAt: toNullableString(classification.classified_at),
          }
        : null,
    } satisfies WorksheetMemorySemanticPoolEvidenceItem;
  });

  return {
    poolId,
    domainLabel: pool.domainLabel,
    domainSummary: pool.domainSummary,
    groupingRationale: pool.groupingRationale,
    variantSummary: pool.variantSummary,
    roleCounts: {
      included: evidence.filter((entry) => entry.evidenceRole === "included").length,
      excluded: evidence.filter((entry) => entry.evidenceRole === "excluded").length,
      adjacent: evidence.filter((entry) => entry.evidenceRole === "adjacent").length,
      uncertain: evidence.filter((entry) => entry.evidenceRole === "uncertain").length,
    },
    groupedEvidence: evidence.filter((entry) => entry.evidenceRole === "included"),
    adjacentEvidence: evidence.filter((entry) => entry.evidenceRole === "adjacent"),
    uncertainEvidence: evidence.filter((entry) => entry.evidenceRole === "uncertain"),
    excludedEvidence: evidence.filter((entry) => entry.evidenceRole === "excluded"),
    evidence,
  };
}

export async function getWorksheetMemorySemanticPoolMetrics(organizationId?: string | null) {
  const admin = createAdminSupabaseClient();
  let queueQuery = admin
    .from("worksheet_memory_semantic_pool_queue" as never)
    .select("queue_state");
  let poolQuery = admin
    .from("worksheet_memory_semantic_pools" as never)
    .select("pool_status, maturity_status, average_confidence, included_count");

  if (organizationId) {
    queueQuery = queueQuery.eq("organization_id", organizationId as never);
    poolQuery = poolQuery.eq("organization_id", organizationId as never);
  }

  const [{ data: queueRows, error: queueError }, { data: poolRows, error: poolError }] = await Promise.all([
    queueQuery,
    poolQuery,
  ]);

  if (queueError) {
    throw new Error(queueError.message);
  }
  if (poolError) {
    throw new Error(poolError.message);
  }

  const queueStateCounts: Record<string, number> = {};
  for (const row of Array.isArray(queueRows) ? queueRows : []) {
    const state = toNullableString((row as Record<string, unknown>).queue_state) ?? "pending";
    queueStateCounts[state] = (queueStateCounts[state] ?? 0) + 1;
  }

  const poolStatusCounts: Record<string, number> = {};
  const maturityDistribution: Record<string, number> = {};
  const confidences: number[] = [];
  const includedCounts: number[] = [];
  for (const row of Array.isArray(poolRows) ? poolRows : []) {
    const status = toNullableString((row as Record<string, unknown>).pool_status) ?? "active";
    const maturity = toNullableString((row as Record<string, unknown>).maturity_status) ?? "emerging";
    poolStatusCounts[status] = (poolStatusCounts[status] ?? 0) + 1;
    maturityDistribution[maturity] = (maturityDistribution[maturity] ?? 0) + 1;
    const confidence = toNullableNumber((row as Record<string, unknown>).average_confidence);
    if (confidence !== null) {
      confidences.push(confidence);
    }
    const includedCount = toNullableNumber((row as Record<string, unknown>).included_count);
    if (includedCount !== null) {
      includedCounts.push(includedCount);
    }
  }

  return {
    organizationId: organizationId ?? null,
    queueStateCounts,
    poolStatusCounts,
    maturityDistribution,
    averageConfidence: average(confidences),
    averageIncludedCount: average(includedCounts),
    deadLetteredQueueCount: queueStateCounts.dead_lettered ?? 0,
  } satisfies WorksheetMemorySemanticPoolMetrics;
}

export {
  buildCompactWorksheetSemanticGroupingEvent,
  buildWorksheetMemorySemanticGroupingSchema,
  buildWorksheetMemorySemanticGroupingSystemPrompt,
  buildWorksheetMemorySemanticGroupingUserPrompt,
  buildSemanticPoolStableSignature as buildSemanticPoolSignature,
  normalizeProviderSemanticPools,
  validateSemanticPoolProposal,
};
