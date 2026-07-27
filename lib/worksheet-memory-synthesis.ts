import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  getPricingWorksheetAiProvider,
  getPricingWorksheetAnthropicModel,
} from "@/lib/ai/providers/pricing-worksheet/registry";
import type { PricingWorksheetProviderResponse } from "@/lib/ai/providers/pricing-worksheet/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  getWorksheetMemorySemanticPoolDetail,
  getWorksheetMemorySemanticPoolEvidence,
  type WorksheetMemorySemanticPool,
  type WorksheetMemorySemanticPoolEvidenceItem,
} from "@/lib/worksheet-memory-semantic-pools";
import { enqueueOrganizationMemoryRetirementCheck } from "@/lib/organization-memory-retirement";

export type WorksheetMemorySynthesisQueueState =
  | "pending"
  | "claimed"
  | "retry_scheduled"
  | "completed"
  | "dead_lettered";

export type WorksheetMemorySynthesisDecision =
  | "no_memory"
  | "create_memory"
  | "reinforce_existing_memory"
  | "supersede_existing_memory";

export type WorksheetMemorySynthesisQueueRow = {
  id: string;
  organizationId: string;
  semanticPoolId: string;
  semanticPoolSignature: string;
  sourceRevisionHash: string;
  maturityStatus: string;
  queueState: WorksheetMemorySynthesisQueueState;
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

type OrganizationMemoryContextRow = {
  id: string;
  organizationId: string;
  memoryCategory: string;
  memoryType: string;
  memoryKey: string;
  memorySignature: string | null;
  title: string;
  summary: string;
  memoryValue: Record<string, Json | null>;
  evidenceSummary: Record<string, Json | null>;
  confidenceScore: number;
  reinforcementCount: number;
  contradictionCount: number;
  isActive: boolean;
  sourceSemanticPoolId: string | null;
  sourceRevisionHash: string | null;
  supersededByMemoryId: string | null;
  firstDerivedAt: string | null;
  lastDerivedAt: string | null;
  lastReinforcedAt: string | null;
  lastContradictedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ReinforcementEvidenceContext = {
  supportingClassificationRecordIds: string[];
  supportingEventIds: string[];
};

type ContradictionEvidenceContext = {
  contradictingClassificationRecordIds: string[];
  contradictingEventIds: string[];
  contradictingEvidenceItems: CompactSemanticPoolEvidence[];
  distinctProjectIds: string[];
  distinctWorkbookIds: string[];
  distinctWorksheetIds: string[];
};

type ReinforcementEligibility = {
  shouldReinforce: boolean;
  reason:
    | "eligible"
    | "no_memory"
    | "created"
    | "same_revision_rerun"
    | "same_last_reinforced_revision"
    | "contradiction_present"
    | "no_supporting_classifications"
    | "no_net_new_support"
    | "meaning_changed";
  netNewSupportingClassificationRecordIds: string[];
  netNewSupportingEventIds: string[];
  reinforcementBasisHash: string | null;
};

type AppliedReinforcementResult = {
  applied: boolean;
  lifecycleHistoryId: string | null;
  reinforcementBasisHash: string | null;
  netNewSupportingClassificationRecordIds: string[];
  netNewSupportingEventIds: string[];
  updatedMemoryRow: Record<string, unknown> | null;
  confidenceHistoryId: string | null;
  confidenceChanged: boolean;
};

type ContradictionEligibility = {
  shouldContradict: boolean;
  reason:
    | "eligible"
    | "no_memory"
    | "created"
    | "same_revision_rerun"
    | "same_last_contradicted_revision"
    | "no_contradicting_classifications"
    | "meaning_changed"
    | "no_net_new_contradiction"
    | "insufficient_threshold";
  netNewContradictingClassificationRecordIds: string[];
  netNewContradictingEventIds: string[];
  contradictionBasisHash: string | null;
  contradictionStrength: number | null;
  conflictType: string | null;
  conflictMagnitude: string | null;
  distinctProjectIds: string[];
  distinctWorkbookIds: string[];
  distinctWorksheetIds: string[];
};

type AppliedContradictionResult = {
  applied: boolean;
  lifecycleHistoryId: string | null;
  contradictionBasisHash: string | null;
  contradictionStrength: number | null;
  netNewContradictingClassificationRecordIds: string[];
  netNewContradictingEventIds: string[];
  updatedMemoryRow: Record<string, unknown> | null;
  confidenceHistoryId: string | null;
  confidenceChanged: boolean;
};

type DeterministicSupersessionCandidate = {
  incumbentMemoryId: string;
  reasonType: "contradiction_threshold" | "confidence_decay" | "replacement_evidence_advantage";
  reasonSummary: string;
  supersessionBasisHash: string;
};

type AppliedSupersessionResult = {
  applied: boolean;
  supersededMemoryIds: string[];
  supersededCount: number;
};

type CompactSemanticPoolEvidence = {
  sourceEventId: string;
  classificationRecordId: string | null;
  eventType: string | null;
  occurredAt: string | null;
  projectId: string | null;
  opportunityId: string | null;
  worksheet: {
    workbookId: string | null;
    sheetId: string | null;
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
  quality: {
    overallConfidence: number | null;
    captureCompletenessScore: number | null;
    missingCriticalContext: boolean | null;
  };
};

type MemorySynthesisPacket = {
  packetId: string;
  organizationId: string;
  queueRowId: string;
  semanticPool: {
    id: string;
    semanticSignature: string;
    domainLabel: string | null;
    domainSummary: string | null;
    groupingRationale: string | null;
    variantSummary: string | null;
    maturityStatus: string;
    includedCount: number;
    adjacentCount: number;
    uncertainCount: number;
    excludedCount: number;
    worksheetCount: number;
    workbookCount: number;
    projectCount: number;
    averageConfidence: number | null;
    firstSeenAt: string;
    lastSeenAt: string;
    sourceRevisionHash: string;
  };
  evidence: {
    included: CompactSemanticPoolEvidence[];
    uncertain: CompactSemanticPoolEvidence[];
    adjacent: CompactSemanticPoolEvidence[];
    excluded: CompactSemanticPoolEvidence[];
  };
  existingMemories: Array<{
    id: string;
    memoryCategory: string;
    memoryType: string;
    title: string;
    summary: string;
    memoryValue: Record<string, Json | null>;
    confidenceScore: number;
    reinforcementCount: number;
    contradictionCount: number;
    memorySignature: string | null;
    sourceRevisionHash: string | null;
    updatedAt: string | null;
  }>;
};

function getMemorySynthesisPacketEvidenceCounts(packet: MemorySynthesisPacket) {
  return {
    includedCount: packet.evidence.included.length,
    uncertainCount: packet.evidence.uncertain.length,
    adjacentCount: packet.evidence.adjacent.length,
    excludedCount: packet.evidence.excluded.length,
  };
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function buildEvidenceRoleSnapshot(evidenceItems: CompactSemanticPoolEvidence[]) {
  return {
    eventIds: dedupeStrings(evidenceItems.map((item) => item.sourceEventId)),
    classificationRecordIds: dedupeStrings(evidenceItems.map((item) => item.classificationRecordId)),
    items: evidenceItems,
  };
}

function mapMemoryHistorySnapshot(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  const evidenceSummary = compactJsonRecord(row.evidence_summary, 64);
  return {
    id: toNullableString(row.id),
    memoryCategory: toNullableString(row.memory_category),
    memoryType: toNullableString(row.memory_type),
    title: toNullableString(row.title),
    summary: toNullableString(row.summary),
    confidenceScore: clampConfidence(row.confidence_score),
    sourceRevisionHash: toNullableString(row.source_revision_hash),
    sourceSemanticPoolId: toNullableString(row.source_semantic_pool_id),
    memoryKey: toNullableString(row.memory_key),
    memorySignature: toNullableString(row.memory_signature),
    memoryDomainSignature: toNullableString(row.memory_domain_signature),
    isActive: typeof row.is_active === "boolean" ? row.is_active : null,
    retiredAt: toNullableString(row.retired_at),
    retiredLifecycleHistoryId: toNullableString(row.retired_lifecycle_history_id),
    retiredBySynthesisHistoryId: toNullableString(row.retired_by_synthesis_history_id),
    retirementBasisHash: toNullableString(row.retirement_basis_hash),
    retirementReasonSummary: toNullableString(row.retirement_reason_summary),
    supersededAt: toNullableString(row.superseded_at),
    supersededByMemoryId: toNullableString(row.superseded_by_memory_id),
    supersededLifecycleHistoryId: toNullableString(row.superseded_lifecycle_history_id),
    supersededBySynthesisHistoryId: toNullableString(row.superseded_by_synthesis_history_id),
    supersessionBasisHash: toNullableString(row.supersession_basis_hash),
    supersessionReasonSummary: toNullableString(row.supersession_reason_summary),
    reinforcementCount: toNullableNumber(row.reinforcement_count),
    reinforcedSupportingClassificationCount: toNullableNumber(row.reinforced_supporting_classification_count),
    lastReinforcedAt: toNullableString(row.last_reinforced_at),
    lastReinforcedSynthesisHistoryId: toNullableString(row.last_reinforced_synthesis_history_id),
    lastReinforcedLifecycleHistoryId: toNullableString(row.last_reinforced_lifecycle_history_id),
    lastReinforcedSourceRevisionHash: toNullableString(row.last_reinforced_source_revision_hash),
    reinforcementBasisHash: toNullableString(row.reinforcement_basis_hash),
    confidenceCalculationVersion: toNullableNumber(row.confidence_calculation_version),
    lastConfidenceHistoryId: toNullableString(row.last_confidence_history_id),
    lastConfidenceCalculatedAt: toNullableString(row.last_confidence_calculated_at),
    baseConfidenceScore: clampConfidence(row.base_confidence_score),
    confidenceReasonSummary: toNullableString(row.confidence_reason_summary),
    evidenceCounts: {
      includedCount: toNullableNumber(evidenceSummary.includedCount),
      uncertainCount: toNullableNumber(evidenceSummary.uncertainCount),
      adjacentCount: toNullableNumber(evidenceSummary.adjacentCount),
      excludedCount: toNullableNumber(evidenceSummary.excludedCount),
      supportingEvidenceCount: toNullableNumber(evidenceSummary.supportingEvidenceCount),
      uncertainEvidenceCount: toNullableNumber(evidenceSummary.uncertainEvidenceCount),
      adjacentEvidenceCount: toNullableNumber(evidenceSummary.adjacentEvidenceCount),
      excludedEvidenceCount: toNullableNumber(evidenceSummary.excludedEvidenceCount),
      contradictoryEvidenceCount: toNullableNumber(evidenceSummary.contradictoryEvidenceCount),
    },
  } satisfies Record<string, Json | null>;
}

type RawMemorySynthesisDecision = {
  decision: WorksheetMemorySynthesisDecision | string | null;
  targetMemoryId: string | null;
  supersededMemoryIds: string[];
  memoryCategory: string | null;
  memoryType: string | null;
  title: string | null;
  summary: string | null;
  confidence: number | null;
  scope: Record<string, Json | null>;
  memoryValue: Record<string, Json | null>;
  retrievalGuidance: string | null;
  supportingEvidenceEventIds: string[];
  uncertainEvidenceEventIds: string[];
  adjacentEvidenceEventIds: string[];
  excludedEvidenceEventIds: string[];
  contradictoryEvidenceEventIds: string[];
  reasoningSummary: string | null;
};

type ValidatedMemorySynthesisDecision = {
  decision: WorksheetMemorySynthesisDecision;
  targetMemoryId: string | null;
  supersededMemoryIds: string[];
  memoryCategory: string | null;
  memoryType: string | null;
  title: string | null;
  summary: string | null;
  confidence: number | null;
  scope: Record<string, Json | null>;
  memoryValue: Record<string, Json | null>;
  retrievalGuidance: string | null;
  supportingEvidenceEventIds: string[];
  uncertainEvidenceEventIds: string[];
  adjacentEvidenceEventIds: string[];
  excludedEvidenceEventIds: string[];
  contradictoryEvidenceEventIds: string[];
  reasoningSummary: string | null;
  memorySignature: string | null;
};

function buildNoIncludedEvidenceDecision(): ValidatedMemorySynthesisDecision {
  return {
    decision: "no_memory",
    targetMemoryId: null,
    supersededMemoryIds: [],
    memoryCategory: null,
    memoryType: null,
    title: null,
    summary: null,
    confidence: null,
    scope: {},
    memoryValue: {},
    retrievalGuidance: null,
    supportingEvidenceEventIds: [],
    uncertainEvidenceEventIds: [],
    adjacentEvidenceEventIds: [],
    excludedEvidenceEventIds: [],
    contradictoryEvidenceEventIds: [],
    reasoningSummary: "no_included_evidence: No included evidence available for synthesis.",
    memorySignature: null,
  };
}

export type RunWorksheetMemorySynthesisWorkerInput = {
  organizationId?: string | null;
  semanticPoolId?: string | null;
  limit?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxEvidenceItems?: number;
  maxExistingMemories?: number;
  workerId?: string | null;
  leaseSeconds?: number;
};

export type RunWorksheetMemorySynthesisWorkerOutput = {
  runId: string;
  claimedJobCount: number;
  completedJobCount: number;
  retriedJobCount: number;
  deadLetteredJobCount: number;
  noMemoryCount: number;
  createdMemoryCount: number;
  updatedMemoryCount: number;
  reusedMemoryCount: number;
  reconciledMemoryCount: number;
  deactivatedDuplicateMemoryCount: number;
  reinforcedMemoryCount: number;
  contradictedMemoryCount: number;
  supersededMemoryCount: number;
  organizationMemoryWriteCount: number;
  provenanceLinkCount: number;
  provider: string;
  model: string;
  durationMs: number;
};

export type WorksheetMemorySynthesisMetrics = {
  organizationId: string | null;
  queueStateCounts: Record<string, number>;
  maturityDistribution: Record<string, number>;
  activeMemoryCount: number;
  inactiveMemoryCount: number;
  supersededMemoryCount: number;
  averageConfidence: number | null;
  deadLetteredQueueCount: number;
};

type MemorySynthesisPersistenceOutcome = "none" | "created" | "reused" | "updated";
type OrganizationMemoryLifecycleEventType =
  | "memory_created"
  | "memory_reused"
  | "memory_updated"
  | "memory_reconciled"
  | "memory_reinforced"
  | "memory_contradicted"
  | "memory_superseded"
  | "memory_retired";
type OrganizationMemoryLifecycleEventOriginType =
  | "synthesis"
  | "retirement_evaluator"
  | "manual_admin";
type OrganizationMemoryConfidenceHistoryReasonType =
  | "memory_created"
  | "reinforcement"
  | "recalculation"
  | "contradiction"
  | "supersession"
  | "retirement"
  | "manual_adjustment";

const DEFAULT_LIMIT = 12;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_600;
const DEFAULT_MAX_EVIDENCE_ITEMS = 18;
const DEFAULT_MAX_EXISTING_MEMORIES = 12;
const DEFAULT_WORKER_ID = "worksheet-memory-synthesis-worker";
const DEFAULT_LEASE_SECONDS = 600;
const WORKSHEET_MEMORY_SYNTHESIS_PROMPT_VERSION = "worksheet-memory-synthesis-v1";
const WORKSHEET_MEMORY_SYNTHESIS_DECISION_SCHEMA_VERSION = 1;
const WORKSHEET_MEMORY_SYNTHESIS_HISTORY_SCHEMA_VERSION = 1;
const ORGANIZATION_MEMORY_LIFECYCLE_HISTORY_SCHEMA_VERSION = 1;
const ORGANIZATION_MEMORY_CONFIDENCE_HISTORY_SCHEMA_VERSION = 1;
const ORGANIZATION_MEMORY_CONFIDENCE_CALCULATION_VERSION = 1;
const DEFAULT_MEMORY_CONFIDENCE_CEILING = 0.92;
const DEFAULT_MEMORY_CONFIDENCE_FLOOR = 0.15;
const MIN_NET_NEW_CONTRADICTING_CLASSIFICATIONS = 2;
const MIN_CONTRADICTION_DIVERSITY_COUNT = 2;
const MIN_CONTRADICTION_STRENGTH = 0.8;
const MIN_SUPERSESSION_REPLACEMENT_CONFIDENCE = 0.75;
const MIN_SUPERSESSION_REPLACEMENT_REINFORCEMENT_COUNT = 2;
const MIN_SUPERSESSION_REPLACEMENT_SUPPORTING_CLASSIFICATIONS = 4;
const MIN_SUPERSESSION_CONFIDENCE_DELTA = 0.1;
const MAX_SUPERSESSION_INCUMBENT_CONFIDENCE = 0.45;
const MIN_SUPERSESSION_INCUMBENT_CONTRADICTION_COUNT = 2;
const MIN_SUPERSESSION_SUPPORTING_CLASSIFICATION_ADVANTAGE = 2;

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function isJsonRecord(value: unknown): value is Record<string, Json | null> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactJsonRecord(value: unknown, limit = 32): Record<string, Json | null> {
  if (!isJsonRecord(value)) {
    return {};
  }

  const entries = Object.entries(value).slice(0, limit);
  return Object.fromEntries(entries);
}

function parseCompactJsonRecordString(value: unknown, limit = 32): Record<string, Json | null> {
  if (isJsonRecord(value)) {
    return compactJsonRecord(value, limit);
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return compactJsonRecord(parsed, limit);
  } catch {
    return {};
  }
}

function clampConfidence(value: unknown) {
  const numeric = toNullableNumber(value);
  if (numeric === null) {
    return null;
  }

  return Math.min(1, Math.max(0, numeric));
}

function roundConfidence(value: number) {
  return Number(value.toFixed(6));
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashSignaturePayload(value: unknown) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function stableScopeFingerprint(value: unknown) {
  if (!isJsonRecord(value) || !isJsonRecord(value.scope) || Object.keys(value.scope).length === 0) {
    return null;
  }

  return hashSignaturePayload(value.scope);
}

function normalizeToken(value: string | null) {
  return value
    ? value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

function tokenizeText(value: string | null) {
  return normalizeToken(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function buildSemanticPoolNeighborhoodTokens(params: {
  semanticPool: WorksheetMemorySemanticPool;
  evidenceItems: WorksheetMemorySemanticPoolEvidenceItem[];
}) {
  const tokens = new Set<string>();
  for (const token of tokenizeText(params.semanticPool.domainLabel)) {
    tokens.add(token);
  }
  for (const token of tokenizeText(params.semanticPool.domainSummary)) {
    tokens.add(token);
  }
  for (const token of tokenizeText(params.semanticPool.variantSummary)) {
    tokens.add(token);
  }
  for (const item of params.evidenceItems) {
    for (const token of tokenizeText(toNullableString(item.metadata.tradePackage))) {
      tokens.add(token);
    }
    for (const token of tokenizeText(toNullableString(item.diffData.itemLabel))) {
      tokens.add(token);
    }
    for (const token of tokenizeText(toNullableString(item.diffData.rowLabel))) {
      tokens.add(token);
    }
  }
  return tokens;
}

function scoreExistingMemoryNeighborhood(params: {
  row: Record<string, unknown>;
  semanticPool: WorksheetMemorySemanticPool;
  evidenceItems: WorksheetMemorySemanticPoolEvidenceItem[];
}) {
  const memoryCategory = toNullableString(params.row.memory_category);
  if (!memoryCategory?.startsWith("worksheet_")) {
    return Number.NEGATIVE_INFINITY;
  }

  const memoryValue = compactJsonRecord(params.row.memory_value, 48);
  const evidenceSummary = compactJsonRecord(params.row.evidence_summary, 48);
  const memoryScope = compactJsonRecord(memoryValue.scope, 24);
  const candidateTokens = new Set<string>();
  for (const token of tokenizeText(toNullableString(params.row.title))) {
    candidateTokens.add(token);
  }
  for (const token of tokenizeText(toNullableString(params.row.summary))) {
    candidateTokens.add(token);
  }
  for (const token of tokenizeText(toNullableString(memoryScope.tradePackage))) {
    candidateTokens.add(token);
  }
  for (const token of tokenizeText(toNullableString(memoryScope.itemLabel))) {
    candidateTokens.add(token);
  }
  const neighborhoodTokens = buildSemanticPoolNeighborhoodTokens({
    semanticPool: params.semanticPool,
    evidenceItems: params.evidenceItems,
  });

  let score = 0;
  if (toNullableString(evidenceSummary.semanticPoolId) === params.semanticPool.id) {
    score += 100;
  }
  if (toNullableString(evidenceSummary.semanticPoolSignature) === params.semanticPool.semanticSignature) {
    score += 80;
  }

  const candidateTrade = normalizeToken(toNullableString(memoryScope.tradePackage));
  const poolTrade = normalizeToken(
    params.evidenceItems
      .map((item) => toNullableString(item.metadata.tradePackage))
      .find((value) => Boolean(value)) ?? null,
  );
  if (candidateTrade && poolTrade && candidateTrade === poolTrade) {
    score += 12;
  }

  let overlapCount = 0;
  for (const token of candidateTokens) {
    if (neighborhoodTokens.has(token)) {
      overlapCount += 1;
    }
  }
  score += overlapCount;

  return score;
}

function buildRetryAfter(attemptCount: number, nowIso: string) {
  const baseDelaySeconds = Math.max(30, Math.min(60 * 60, 30 * 2 ** Math.max(attemptCount - 1, 0)));
  return new Date(new Date(nowIso).getTime() + baseDelaySeconds * 1_000).toISOString();
}

function parseQueueRow(value: Record<string, unknown>): WorksheetMemorySynthesisQueueRow {
  return {
    id: toNullableString(value.id) ?? randomUUID(),
    organizationId: toNullableString(value.organizationId ?? value.organization_id) ?? "",
    semanticPoolId: toNullableString(value.semanticPoolId ?? value.semantic_pool_id) ?? "",
    semanticPoolSignature: toNullableString(value.semanticPoolSignature ?? value.semantic_pool_signature) ?? "",
    sourceRevisionHash: toNullableString(value.sourceRevisionHash ?? value.source_revision_hash) ?? "",
    maturityStatus: toNullableString(value.maturityStatus ?? value.maturity_status) ?? "emerging",
    queueState:
      (toNullableString(value.queueState ?? value.queue_state) as WorksheetMemorySynthesisQueueState) ?? "pending",
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

function buildCompactEvidenceItem(event: WorksheetMemorySemanticPoolEvidenceItem): CompactSemanticPoolEvidence {
  const interpretedChange = compactJsonRecord(event.classification?.interpretationPayload?.interpretedChange, 24);
  return {
    sourceEventId: event.sourceEventId,
    classificationRecordId: event.classificationRecordId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    projectId: event.projectId,
    opportunityId: event.opportunityId,
    worksheet: {
      workbookId: toNullableString(event.metadata.workbookId),
      sheetId: toNullableString(event.metadata.sheetId),
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
      oldValue: (event.diffData.oldValue as Json | null) ?? null,
      newValue: (event.diffData.newValue as Json | null) ?? null,
      oldFormula: toNullableString(event.diffData.oldFormula),
      newFormula: toNullableString(event.diffData.newFormula),
    },
    semanticFields: event.classification?.semanticFields ?? {},
    interpretation: interpretedChange,
    futureUseSummary: compactJsonRecord(event.metadata.futureUseSummary ?? event.classification?.interpretationPayload?.futureUse, 24),
    quality: {
      overallConfidence: event.classification?.overallConfidence ?? null,
      captureCompletenessScore: toNullableNumber(event.diffData.captureCompletenessScore),
      missingCriticalContext: typeof event.diffData.missingCriticalContext === "boolean"
        ? event.diffData.missingCriticalContext
        : null,
    },
  };
}

function buildWorksheetMemorySynthesisSystemPrompt() {
  return [
    "You are performing production worksheet company-memory synthesis from a mature semantic evidence pool.",
    "The semantic pool already groups related evidence. Do not regroup it.",
    "Decide what company behavior, if any, emerges from the supplied evidence domain.",
    "You may return one of: no_memory, create_memory, reinforce_existing_memory, supersede_existing_memory.",
    "Return no_memory when the evidence is weak, mixed, unstable, contradictory, or too project-specific.",
    "Use variants and uncertain evidence to reduce confidence when appropriate.",
    "Scope must be cautious, concrete, and evidence-backed.",
    "Do not invent trade rules, label mappings, or assumptions outside the supplied evidence.",
    "If a similar existing memory already exists, prefer reinforcing or superseding it instead of duplicating it.",
    "supportingEvidenceEventIds may reference only included evidence.",
    "uncertainEvidenceEventIds may reference only uncertain evidence.",
    "adjacentEvidenceEventIds may reference only adjacent evidence.",
    "excludedEvidenceEventIds may reference only excluded evidence.",
    "Do not relabel adjacent or excluded evidence as support.",
    "Return valid JSON only.",
  ].join("\n");
}

function buildWorksheetMemorySynthesisUserPrompt(packet: MemorySynthesisPacket) {
  return [
    "Production worksheet memory synthesis stage only.",
    "The semantic pool below is a neutral evidence-domain cluster. Decide whether it should become durable organization memory.",
    "Do not regroup the evidence.",
    `Organization ID: ${packet.organizationId}`,
    `Semantic pool ID: ${packet.semanticPool.id}`,
    `Semantic pool signature: ${packet.semanticPool.semanticSignature}`,
    `Semantic pool revision hash: ${packet.semanticPool.sourceRevisionHash}`,
    `Semantic pool maturity status: ${packet.semanticPool.maturityStatus}`,
    `Semantic pool summary:\n${JSON.stringify(packet.semanticPool)}`,
    `Included evidence:\n${JSON.stringify(packet.evidence.included)}`,
    `Uncertain evidence:\n${JSON.stringify(packet.evidence.uncertain)}`,
    `Adjacent evidence:\n${JSON.stringify(packet.evidence.adjacent)}`,
    `Excluded evidence:\n${JSON.stringify(packet.evidence.excluded)}`,
    `Existing active organization memories:\n${JSON.stringify(packet.existingMemories)}`,
  ].join("\n\n");
}

function buildWorksheetMemorySynthesisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "decision",
      "targetMemoryId",
      "supersededMemoryIds",
      "memoryCategory",
      "memoryType",
      "title",
      "summary",
      "confidence",
      "scope",
      "memoryValue",
      "retrievalGuidance",
      "supportingEvidenceEventIds",
      "uncertainEvidenceEventIds",
      "adjacentEvidenceEventIds",
      "excludedEvidenceEventIds",
      "contradictoryEvidenceEventIds",
      "reasoningSummary",
    ],
    properties: {
      decision: {
        type: "string",
        enum: [
          "no_memory",
          "create_memory",
          "reinforce_existing_memory",
          "supersede_existing_memory",
        ],
      },
      targetMemoryId: { anyOf: [{ type: "string" }, { type: "null" }] },
      supersededMemoryIds: {
        type: "array",
        items: { type: "string" },
      },
      memoryCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
      memoryType: { anyOf: [{ type: "string" }, { type: "null" }] },
      title: { anyOf: [{ type: "string" }, { type: "null" }] },
      summary: { anyOf: [{ type: "string" }, { type: "null" }] },
      confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
      // Anthropic rejects free-form object schemas in json_schema mode,
      // so structured JSON payloads are returned as compact JSON strings.
      scope: { anyOf: [{ type: "string" }, { type: "null" }] },
      memoryValue: { anyOf: [{ type: "string" }, { type: "null" }] },
      retrievalGuidance: { anyOf: [{ type: "string" }, { type: "null" }] },
      supportingEvidenceEventIds: {
        type: "array",
        items: { type: "string" },
      },
      uncertainEvidenceEventIds: {
        type: "array",
        items: { type: "string" },
      },
      adjacentEvidenceEventIds: {
        type: "array",
        items: { type: "string" },
      },
      excludedEvidenceEventIds: {
        type: "array",
        items: { type: "string" },
      },
      contradictoryEvidenceEventIds: {
        type: "array",
        items: { type: "string" },
      },
      reasoningSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  } as Record<string, unknown>;
}

function normalizeRawDecision(value: unknown): RawMemorySynthesisDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    decision: toNullableString(record.decision),
    targetMemoryId: toNullableString(record.targetMemoryId),
    supersededMemoryIds: Array.isArray(record.supersededMemoryIds)
      ? record.supersededMemoryIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    memoryCategory: toNullableString(record.memoryCategory),
    memoryType: toNullableString(record.memoryType),
    title: toNullableString(record.title),
    summary: toNullableString(record.summary),
    confidence: clampConfidence(record.confidence),
    scope: parseCompactJsonRecordString(record.scope, 32),
    memoryValue: parseCompactJsonRecordString(record.memoryValue, 32),
    retrievalGuidance: toNullableString(record.retrievalGuidance),
    supportingEvidenceEventIds: Array.isArray(record.supportingEvidenceEventIds)
      ? record.supportingEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    uncertainEvidenceEventIds: Array.isArray(record.uncertainEvidenceEventIds)
      ? record.uncertainEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    adjacentEvidenceEventIds: Array.isArray(record.adjacentEvidenceEventIds)
      ? record.adjacentEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    excludedEvidenceEventIds: Array.isArray(record.excludedEvidenceEventIds)
      ? record.excludedEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    contradictoryEvidenceEventIds: Array.isArray(record.contradictoryEvidenceEventIds)
      ? record.contradictoryEvidenceEventIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    reasoningSummary: toNullableString(record.reasoningSummary),
  };
}

function buildMemorySignature(params: {
  organizationId: string;
  memoryCategory: string;
  memoryType: string;
  scope: Record<string, Json | null>;
  memoryValue: Record<string, Json | null>;
}) {
  return hashSignaturePayload({
    organizationId: params.organizationId,
    memoryCategory: params.memoryCategory,
    memoryType: params.memoryType,
    scope: params.scope,
    memoryValue: params.memoryValue,
  });
}

function buildDomainShapeFingerprint(value: unknown): Json | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return "__string__";
  }
  if (typeof value === "number") {
    return "__number__";
  }
  if (typeof value === "boolean") {
    return "__boolean__";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => buildDomainShapeFingerprint(entry));
  }
  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, buildDomainShapeFingerprint(entry)]),
    ) as Json;
  }
  return "__other__";
}

function sanitizeDomainScope(...scopeCandidates: unknown[]) {
  const merged: Record<string, Json | null> = {};
  for (const candidate of scopeCandidates) {
    if (!isJsonRecord(candidate)) {
      continue;
    }
    for (const [key, value] of Object.entries(candidate)) {
      if (value === undefined) {
        continue;
      }
      merged[key] = value as Json | null;
    }
  }
  return merged;
}

function sanitizeDomainMemoryValue(value: unknown) {
  if (!isJsonRecord(value)) {
    return null;
  }

  const entries = Object.entries(value)
    .filter(([key]) => key !== "scope" && key !== "retrievalGuidance")
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries.map(([key, entry]) => [key, buildDomainShapeFingerprint(entry)])) as Json;
}

function buildMemoryDomainSignature(params: {
  organizationId: string;
  memoryCategory: string;
  memoryType: string;
  semanticFamily?: string | null;
  semanticType?: string | null;
  scope?: Record<string, Json | null>;
  semanticScope?: Record<string, Json | null>;
  memoryValue?: Record<string, Json | null>;
  semanticPoolValue?: Record<string, Json | null>;
}) {
  return hashSignaturePayload({
    organizationId: params.organizationId,
    memoryCategory: params.memoryCategory,
    memoryType: params.memoryType,
    semanticFamily: params.semanticFamily ?? null,
    semanticType: params.semanticType ?? null,
    scope: sanitizeDomainScope(params.semanticScope, params.scope),
    memoryShape: sanitizeDomainMemoryValue(params.memoryValue),
    semanticPoolValueShape: sanitizeDomainMemoryValue(params.semanticPoolValue),
  });
}

function buildSemanticPoolMemoryIdentitySignature(params: {
  organizationId: string;
  semanticPoolId: string;
}) {
  return hashSignaturePayload({
    organizationId: params.organizationId,
    sourceType: "worksheet_memory_semantic_pool",
    semanticPoolId: params.semanticPoolId,
  });
}

function validateMemorySynthesisDecision(packet: MemorySynthesisPacket, decision: RawMemorySynthesisDecision | null) {
  const allowedDecisions = new Set<WorksheetMemorySynthesisDecision>([
    "no_memory",
    "create_memory",
    "reinforce_existing_memory",
    "supersede_existing_memory",
  ]);
  const normalizedDecision = decision?.decision && allowedDecisions.has(decision.decision as WorksheetMemorySynthesisDecision)
    ? (decision.decision as WorksheetMemorySynthesisDecision)
    : "no_memory";
  const includedEventIds = new Set(packet.evidence.included.map((event) => event.sourceEventId));
  const uncertainEventIds = new Set(packet.evidence.uncertain.map((event) => event.sourceEventId));
  const adjacentEventIds = new Set(packet.evidence.adjacent.map((event) => event.sourceEventId));
  const excludedEventIds = new Set(packet.evidence.excluded.map((event) => event.sourceEventId));
  const knownEventIds = new Set([
    ...includedEventIds,
    ...uncertainEventIds,
    ...adjacentEventIds,
    ...excludedEventIds,
  ]);
  const knownMemoryIds = new Set(packet.existingMemories.map((memory) => memory.id));
  const requestedSupportingIds = Array.from(new Set(decision?.supportingEvidenceEventIds ?? []))
    .filter((id) => knownEventIds.has(id));
  const requestedUncertainIds = Array.from(new Set(decision?.uncertainEvidenceEventIds ?? []))
    .filter((id) => knownEventIds.has(id));
  const requestedAdjacentIds = Array.from(new Set(decision?.adjacentEvidenceEventIds ?? []))
    .filter((id) => knownEventIds.has(id));
  const requestedExcludedIds = Array.from(new Set(decision?.excludedEvidenceEventIds ?? []))
    .filter((id) => knownEventIds.has(id));
  const requestedContradictoryIds = Array.from(new Set(decision?.contradictoryEvidenceEventIds ?? []))
    .filter((id) => knownEventIds.has(id));
  const supportingEvidenceEventIds = requestedSupportingIds.filter((id) => includedEventIds.has(id));
  const uncertainEvidenceEventIds = requestedUncertainIds.filter((id) => uncertainEventIds.has(id));
  const adjacentEvidenceEventIds = requestedAdjacentIds.filter((id) => adjacentEventIds.has(id));
  const excludedEvidenceEventIds = requestedExcludedIds.filter((id) => excludedEventIds.has(id));
  const contradictoryEvidenceEventIds = requestedContradictoryIds.filter((id) => includedEventIds.has(id));
  const supersededMemoryIds = Array.from(new Set(decision?.supersededMemoryIds ?? [])).filter((id) => knownMemoryIds.has(id));
  const targetMemoryId = decision?.targetMemoryId && knownMemoryIds.has(decision.targetMemoryId)
    ? decision.targetMemoryId
    : null;
  const roleDriftDetected =
    supportingEvidenceEventIds.length !== requestedSupportingIds.length
    || uncertainEvidenceEventIds.length !== requestedUncertainIds.length
    || adjacentEvidenceEventIds.length !== requestedAdjacentIds.length
    || excludedEvidenceEventIds.length !== requestedExcludedIds.length
    || contradictoryEvidenceEventIds.length !== requestedContradictoryIds.length;
  const safeNoMemoryReason = roleDriftDetected
    ? "Stage 8 rejected the synthesis conclusion because evidence-role reassignment drifted from Stage 7 semantic evidence."
    : (decision?.reasoningSummary ?? null);

  if (normalizedDecision === "no_memory" || roleDriftDetected) {
    return {
      decision: "no_memory" as const,
      targetMemoryId: null,
      supersededMemoryIds: [],
      memoryCategory: null,
      memoryType: null,
      title: null,
      summary: null,
      confidence: null,
      scope: {},
      memoryValue: {},
      retrievalGuidance: null,
      supportingEvidenceEventIds: [],
      uncertainEvidenceEventIds: [],
      adjacentEvidenceEventIds: [],
      excludedEvidenceEventIds: [],
      contradictoryEvidenceEventIds: [],
      reasoningSummary: safeNoMemoryReason,
      memorySignature: null,
    } satisfies ValidatedMemorySynthesisDecision;
  }

  if (
    !decision?.memoryCategory
    || !decision.memoryType
    || !decision.title
    || !decision.summary
    || decision.confidence === null
    || supportingEvidenceEventIds.length === 0
  ) {
    throw new Error("Memory synthesis response is missing required conclusion fields.");
  }

  const scope = decision.scope ?? {};
  const memoryValue = {
    ...(decision.memoryValue ?? {}),
    scope,
    retrievalGuidance: decision.retrievalGuidance,
  };
  return {
    decision: normalizedDecision,
    targetMemoryId,
    supersededMemoryIds,
    memoryCategory: decision.memoryCategory,
    memoryType: decision.memoryType,
    title: decision.title,
    summary: decision.summary,
    confidence: decision.confidence,
    scope,
    memoryValue,
    retrievalGuidance: decision.retrievalGuidance,
    supportingEvidenceEventIds,
    uncertainEvidenceEventIds,
    adjacentEvidenceEventIds,
    excludedEvidenceEventIds,
    contradictoryEvidenceEventIds,
    reasoningSummary: decision.reasoningSummary,
    memorySignature: buildSemanticPoolMemoryIdentitySignature({
      organizationId: packet.organizationId,
      semanticPoolId: packet.semanticPool.id,
    }),
  } satisfies ValidatedMemorySynthesisDecision;
}

async function claimWorksheetMemorySynthesisBatch(params?: {
  limit?: number;
  organizationId?: string | null;
  semanticPoolId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_worksheet_memory_synthesis_batch" as never, {
    p_limit: Math.max(params?.limit ?? DEFAULT_LIMIT, 1),
    p_organization_id: params?.organizationId ?? null,
    p_semantic_pool_id: params?.semanticPoolId ?? null,
    p_worker_id: params?.workerId ?? DEFAULT_WORKER_ID,
    p_lease_seconds: Math.max(params?.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 30),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  return rows.map((row) => parseQueueRow(row));
}

async function finalizeWorksheetMemorySynthesisBatch(inputs: Array<{
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
  const { data, error } = await admin.rpc("finalize_worksheet_memory_synthesis_batch" as never, {
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

async function insertSynthesisRun(params: {
  runId: string;
  requestedOrganizationId: string | null;
  summary: RunWorksheetMemorySynthesisWorkerOutput;
}) {
  const admin = createAdminSupabaseClient();
  const payload = {
    id: params.runId,
    requested_organization_id: params.requestedOrganizationId,
    claimed_job_count: params.summary.claimedJobCount,
    completed_job_count: params.summary.completedJobCount,
    retried_job_count: params.summary.retriedJobCount,
    dead_lettered_job_count: params.summary.deadLetteredJobCount,
    no_memory_count: params.summary.noMemoryCount,
    created_memory_count: params.summary.createdMemoryCount,
    updated_memory_count: params.summary.updatedMemoryCount,
    reused_memory_count: params.summary.reusedMemoryCount,
    reconciled_memory_count: params.summary.reconciledMemoryCount,
    deactivated_duplicate_memory_count: params.summary.deactivatedDuplicateMemoryCount,
    reinforced_memory_count: params.summary.reinforcedMemoryCount,
    superseded_memory_count: params.summary.supersededMemoryCount,
    organization_memory_write_count: params.summary.organizationMemoryWriteCount,
    provenance_link_count: params.summary.provenanceLinkCount,
    provider: params.summary.provider,
    model: params.summary.model,
    duration_ms: params.summary.durationMs,
  };

  const { error } = await admin
    .from("worksheet_memory_synthesis_runs" as never)
    .insert(payload as never);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateSynthesisRun(params: {
  runId: string;
  requestedOrganizationId: string | null;
  summary: RunWorksheetMemorySynthesisWorkerOutput;
}) {
  const admin = createAdminSupabaseClient();
  const payload = {
    requested_organization_id: params.requestedOrganizationId,
    claimed_job_count: params.summary.claimedJobCount,
    completed_job_count: params.summary.completedJobCount,
    retried_job_count: params.summary.retriedJobCount,
    dead_lettered_job_count: params.summary.deadLetteredJobCount,
    no_memory_count: params.summary.noMemoryCount,
    created_memory_count: params.summary.createdMemoryCount,
    updated_memory_count: params.summary.updatedMemoryCount,
    reused_memory_count: params.summary.reusedMemoryCount,
    reconciled_memory_count: params.summary.reconciledMemoryCount,
    deactivated_duplicate_memory_count: params.summary.deactivatedDuplicateMemoryCount,
    reinforced_memory_count: params.summary.reinforcedMemoryCount,
    superseded_memory_count: params.summary.supersededMemoryCount,
    organization_memory_write_count: params.summary.organizationMemoryWriteCount,
    provenance_link_count: params.summary.provenanceLinkCount,
    provider: params.summary.provider,
    model: params.summary.model,
    duration_ms: params.summary.durationMs,
  };

  const { error } = await admin
    .from("worksheet_memory_synthesis_runs" as never)
    .update(payload as never)
    .eq("id", params.runId as never);

  if (error) {
    throw new Error(error.message);
  }
}

async function loadExistingOrganizationMemoryContext(params: {
  organizationId: string;
  limit: number;
  semanticPool: WorksheetMemorySemanticPool;
  evidenceItems: WorksheetMemorySemanticPoolEvidenceItem[];
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("is_active", true as never)
    .order("updated_at", { ascending: false })
    .limit(Math.max(params.limit * 4, params.limit));

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return rows
    .map((row) => ({
    id: toNullableString(row.id) ?? "",
    organizationId: toNullableString(row.organization_id) ?? "",
    memoryCategory: toNullableString(row.memory_category) ?? "",
    memoryType: toNullableString(row.memory_type) ?? "",
    memoryKey: toNullableString(row.memory_key) ?? "",
    memorySignature: toNullableString(row.memory_signature),
    title: toNullableString(row.title) ?? "",
    summary: toNullableString(row.summary) ?? "",
    memoryValue: compactJsonRecord(row.memory_value, 32),
    evidenceSummary: compactJsonRecord(row.evidence_summary, 32),
    confidenceScore: toNullableNumber(row.confidence_score) ?? 0,
    reinforcementCount: toNullableNumber(row.reinforcement_count) ?? 0,
    contradictionCount: toNullableNumber(row.contradiction_count) ?? 0,
    isActive: Boolean(row.is_active),
    sourceSemanticPoolId: toNullableString(row.source_semantic_pool_id),
    sourceRevisionHash: toNullableString(row.source_revision_hash),
    supersededByMemoryId: toNullableString(row.superseded_by_memory_id),
    firstDerivedAt: toNullableString(row.first_derived_at),
    lastDerivedAt: toNullableString(row.last_derived_at),
    lastReinforcedAt: toNullableString(row.last_reinforced_at),
    lastContradictedAt: toNullableString(row.last_contradicted_at),
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
    } satisfies OrganizationMemoryContextRow))
    .filter((row) => row.memoryCategory.startsWith("worksheet_"))
    .sort((left, right) => {
      const leftScore = scoreExistingMemoryNeighborhood({
        row: {
          title: left.title,
          summary: left.summary,
          memory_category: left.memoryCategory,
          memory_value: left.memoryValue,
          evidence_summary: left.evidenceSummary,
        },
        semanticPool: params.semanticPool,
        evidenceItems: params.evidenceItems,
      });
      const rightScore = scoreExistingMemoryNeighborhood({
        row: {
          title: right.title,
          summary: right.summary,
          memory_category: right.memoryCategory,
          memory_value: right.memoryValue,
          evidence_summary: right.evidenceSummary,
        },
        semanticPool: params.semanticPool,
        evidenceItems: params.evidenceItems,
      });
      return rightScore - leftScore || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
    })
    .slice(0, params.limit);
}

async function buildMemorySynthesisPacket(params: {
  queueRow: WorksheetMemorySynthesisQueueRow;
  maxEvidenceItems: number;
  maxExistingMemories: number;
}) {
  const semanticPool = await getWorksheetMemorySemanticPoolDetail(
    params.queueRow.semanticPoolId,
    params.queueRow.organizationId,
  );
  if (!semanticPool) {
    throw new Error("Semantic pool was not found.");
  }

  const evidencePayload = await getWorksheetMemorySemanticPoolEvidence(
    params.queueRow.semanticPoolId,
    params.queueRow.organizationId,
  );
  if (!evidencePayload) {
    throw new Error("Semantic pool evidence was not found.");
  }

  const groupedEvidence = Array.isArray(evidencePayload.groupedEvidence) ? evidencePayload.groupedEvidence : [];
  const uncertainEvidence = Array.isArray(evidencePayload.uncertainEvidence) ? evidencePayload.uncertainEvidence : [];
  const adjacentEvidence = Array.isArray(evidencePayload.adjacentEvidence) ? evidencePayload.adjacentEvidence : [];
  const excludedEvidence = Array.isArray(evidencePayload.excludedEvidence) ? evidencePayload.excludedEvidence : [];
  const allEvidenceItems = [...groupedEvidence, ...uncertainEvidence, ...adjacentEvidence, ...excludedEvidence];
  const existingMemories = await loadExistingOrganizationMemoryContext({
    organizationId: params.queueRow.organizationId,
    limit: params.maxExistingMemories,
    semanticPool,
    evidenceItems: allEvidenceItems,
  });

  return {
    packetId: `${params.queueRow.organizationId}:synthesis:${params.queueRow.id}`,
    organizationId: params.queueRow.organizationId,
    queueRowId: params.queueRow.id,
    semanticPool: {
      id: semanticPool.id,
      semanticSignature: semanticPool.semanticSignature,
      domainLabel: semanticPool.domainLabel,
      domainSummary: semanticPool.domainSummary,
      groupingRationale: semanticPool.groupingRationale,
      variantSummary: semanticPool.variantSummary,
      maturityStatus: semanticPool.maturityStatus,
      includedCount: groupedEvidence.length,
      adjacentCount: adjacentEvidence.length,
      uncertainCount: uncertainEvidence.length,
      excludedCount: excludedEvidence.length,
      worksheetCount: semanticPool.worksheetCount,
      workbookCount: semanticPool.workbookCount,
      projectCount: semanticPool.projectCount,
      averageConfidence: semanticPool.averageConfidence,
      firstSeenAt: semanticPool.firstSeenAt,
      lastSeenAt: semanticPool.lastSeenAt,
      sourceRevisionHash: semanticPool.sourceRevisionHash,
    },
    evidence: {
      included: groupedEvidence.slice(0, params.maxEvidenceItems).map(buildCompactEvidenceItem),
      uncertain: uncertainEvidence.slice(0, params.maxEvidenceItems).map(buildCompactEvidenceItem),
      adjacent: adjacentEvidence.slice(0, params.maxEvidenceItems).map(buildCompactEvidenceItem),
      excluded: excludedEvidence.slice(0, params.maxEvidenceItems).map(buildCompactEvidenceItem),
    },
    existingMemories: existingMemories.slice(0, params.maxExistingMemories).map((memory) => ({
      id: memory.id,
      memoryCategory: memory.memoryCategory,
      memoryType: memory.memoryType,
      title: memory.title,
      summary: memory.summary,
      memoryValue: memory.memoryValue,
      confidenceScore: memory.confidenceScore,
      reinforcementCount: memory.reinforcementCount,
      contradictionCount: memory.contradictionCount,
      memorySignature: memory.memorySignature,
      sourceRevisionHash: memory.sourceRevisionHash,
      updatedAt: memory.updatedAt,
    })),
  } satisfies MemorySynthesisPacket;
}

async function callAnthropicWorksheetMemorySynthesis(
  packet: MemorySynthesisPacket,
  params: {
    timeoutMs: number;
    maxOutputTokens: number;
  },
) {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const providerResult = await provider.generateEditPlan({
    systemPrompt: buildWorksheetMemorySynthesisSystemPrompt(),
    userPrompt: buildWorksheetMemorySynthesisUserPrompt(packet),
    schema: buildWorksheetMemorySynthesisSchema(),
    model: getPricingWorksheetAnthropicModel(),
    timeoutMs: params.timeoutMs,
    maxOutputTokens: params.maxOutputTokens,
    enableWebSearch: false,
    metadata: {
      workflowStage: "worksheet_memory_synthesis",
      organizationId: packet.organizationId,
      semanticPoolId: packet.semanticPool.id,
      packetId: packet.packetId,
    },
  });

  return {
    providerResult,
    decision: normalizeRawDecision(providerResult.parsedJson),
  };
}

async function findExistingMemoryForDecision(params: {
  organizationId: string;
  semanticPool: WorksheetMemorySemanticPool;
  validatedDecision: ValidatedMemorySynthesisDecision;
}) {
  const admin = createAdminSupabaseClient();
  const { data: samePoolData, error: samePoolError } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("source_semantic_pool_id", params.semanticPool.id as never)
    .order("created_at", { ascending: true });

  if (samePoolError) {
    throw new Error(samePoolError.message);
  }

  const samePoolRows = Array.isArray(samePoolData)
    ? samePoolData as Array<Record<string, unknown>>
    : [];
  if (samePoolRows.length > 0) {
    const canonicalRow = samePoolRows.find((row) => row.is_active === true) ?? samePoolRows[0] ?? null;
    if (!canonicalRow) {
      return null;
    }

    return {
      id: toNullableString(canonicalRow.id) ?? "",
      row: canonicalRow,
      duplicateIds: samePoolRows
        .filter((row) => toNullableString(row.id) !== toNullableString(canonicalRow.id))
        .map((row) => toNullableString(row.id))
        .filter((value): value is string => Boolean(value)),
    };
  }

  if (params.validatedDecision.targetMemoryId) {
    const { data, error } = await admin
      .from("organization_memory_items" as never)
      .select("*")
      .eq("id", params.validatedDecision.targetMemoryId as never)
      .eq("organization_id", params.organizationId as never)
      .single();

    if (!error && data) {
      return {
        id: toNullableString((data as Record<string, unknown>).id) ?? "",
        row: data as Record<string, unknown>,
        duplicateIds: [] as string[],
      };
    }
  }

  if (!params.validatedDecision.memorySignature) {
    return null;
  }

  if (params.validatedDecision.memoryCategory && params.validatedDecision.memoryType) {
    const { data: uniqueIdentityData, error: uniqueIdentityError } = await admin
      .from("organization_memory_items" as never)
      .select("*")
      .eq("organization_id", params.organizationId as never)
      .eq("memory_category", params.validatedDecision.memoryCategory as never)
      .eq("memory_type", params.validatedDecision.memoryType as never)
      .eq("memory_key", params.validatedDecision.memorySignature as never)
      .order("created_at", { ascending: true });

    if (uniqueIdentityError) {
      throw new Error(uniqueIdentityError.message);
    }

    const uniqueIdentityRows = Array.isArray(uniqueIdentityData)
      ? uniqueIdentityData as Array<Record<string, unknown>>
      : [];

    if (uniqueIdentityRows.length > 0) {
      const canonicalRow = uniqueIdentityRows.find((row) => row.is_active === true) ?? uniqueIdentityRows[0] ?? null;
      if (!canonicalRow) {
        return null;
      }

      return {
        id: toNullableString(canonicalRow.id) ?? "",
        row: canonicalRow,
        duplicateIds: uniqueIdentityRows
          .filter((row) => toNullableString(row.id) !== toNullableString(canonicalRow.id))
          .map((row) => toNullableString(row.id))
          .filter((value): value is string => Boolean(value)),
      };
    }
  }

  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_signature", params.validatedDecision.memorySignature as never)
    .eq("is_active", true as never)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (row) {
    return {
      id: toNullableString(row.id) ?? "",
      row,
      duplicateIds: [] as string[],
    };
  }

  if (!params.validatedDecision.memoryCategory || !params.validatedDecision.memoryType) {
    return null;
  }

  const { data: sameRevisionData, error: sameRevisionError } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("source_revision_hash", params.semanticPool.sourceRevisionHash as never)
    .eq("memory_category", params.validatedDecision.memoryCategory as never)
    .eq("memory_type", params.validatedDecision.memoryType as never)
    .eq("is_active", true as never)
    .order("created_at", { ascending: true })
    .limit(1);

  if (sameRevisionError) {
    throw new Error(sameRevisionError.message);
  }

  const sameRevisionRow = Array.isArray(sameRevisionData)
    ? sameRevisionData[0] as Record<string, unknown> | undefined
    : undefined;
  if (!sameRevisionRow) {
    return null;
  }

  return {
    id: toNullableString(sameRevisionRow.id) ?? "",
    row: sameRevisionRow,
    duplicateIds: [] as string[],
  };
}

async function findCanonicalMemoryByUniqueIdentity(params: {
  organizationId: string;
  memoryCategory: string | null;
  memoryType: string | null;
  memorySignature: string | null;
}) {
  if (!params.memoryCategory || !params.memoryType || !params.memorySignature) {
    return null;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_category", params.memoryCategory as never)
    .eq("memory_type", params.memoryType as never)
    .eq("memory_key", params.memorySignature as never)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  if (rows.length === 0) {
    return null;
  }

  const canonicalRow = rows.find((row) => row.is_active === true) ?? rows[0] ?? null;
  if (!canonicalRow) {
    return null;
  }

  return {
    id: toNullableString(canonicalRow.id) ?? "",
    row: canonicalRow,
    duplicateIds: rows
      .filter((row) => toNullableString(row.id) !== toNullableString(canonicalRow.id))
      .map((row) => toNullableString(row.id))
      .filter((value): value is string => Boolean(value)),
  };
}

async function deactivateDuplicateActiveMemories(params: {
  organizationId: string;
  keepMemoryId: string;
  duplicateMemoryIds: string[];
}) {
  if (params.duplicateMemoryIds.length === 0) {
    return 0;
  }

  const admin = createAdminSupabaseClient();
  const idsToDeactivate = params.duplicateMemoryIds.filter((id) => id !== params.keepMemoryId);
  if (idsToDeactivate.length === 0) {
    return 0;
  }

  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .update({
      is_active: false,
    } as never)
    .eq("organization_id", params.organizationId as never)
    .in("id", idsToDeactivate as never)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data.length : idsToDeactivate.length;
}

async function upsertOrganizationMemoryItem(params: {
  packet: MemorySynthesisPacket;
  runId: string;
  queueRowId: string;
  organizationId: string;
  semanticPool: WorksheetMemorySemanticPool;
  validatedDecision: ValidatedMemorySynthesisDecision;
  existingMemoryRow: Record<string, unknown> | null;
}) {
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const supportCount = params.validatedDecision.supportingEvidenceEventIds.length;
  const uncertaintyCount = params.validatedDecision.uncertainEvidenceEventIds.length;
  const adjacentCount = params.validatedDecision.adjacentEvidenceEventIds.length;
  const excludedCount = params.validatedDecision.excludedEvidenceEventIds.length;
  const contradictionCount = params.validatedDecision.contradictoryEvidenceEventIds.length;
  const totalEvidenceCount = new Set([
    ...params.validatedDecision.supportingEvidenceEventIds,
    ...params.validatedDecision.uncertainEvidenceEventIds,
    ...params.validatedDecision.adjacentEvidenceEventIds,
    ...params.validatedDecision.excludedEvidenceEventIds,
    ...params.validatedDecision.contradictoryEvidenceEventIds,
  ]).size;
  const existingSourceRevisionHash = toNullableString(params.existingMemoryRow?.source_revision_hash);
  const sameRevision = existingSourceRevisionHash !== null && existingSourceRevisionHash === params.semanticPool.sourceRevisionHash;
  const priorReinforcementCount = toNullableNumber(params.existingMemoryRow?.reinforcement_count) ?? 0;
  const existingId = toNullableString(params.existingMemoryRow?.id);
  const packetEvidenceCounts = getMemorySynthesisPacketEvidenceCounts(params.packet);
  const memoryDomainSignature = buildMemoryDomainSignature({
    organizationId: params.organizationId,
    memoryCategory: params.validatedDecision.memoryCategory ?? "unknown",
    memoryType: params.validatedDecision.memoryType ?? "unknown",
    semanticFamily: params.semanticPool.semanticFamily,
    semanticType: params.semanticPool.semanticType,
    scope: params.validatedDecision.scope,
    semanticScope: params.semanticPool.scopePayload,
    memoryValue: params.validatedDecision.memoryValue,
    semanticPoolValue: params.semanticPool.poolValuePayload,
  });

  const payload = {
    id: existingId ?? undefined,
    organization_id: params.organizationId,
    memory_category: params.validatedDecision.memoryCategory,
    memory_type: params.validatedDecision.memoryType,
    memory_key: params.validatedDecision.memorySignature,
    memory_signature: params.validatedDecision.memorySignature,
    memory_domain_signature: memoryDomainSignature,
    source_semantic_pool_id: params.semanticPool.id,
    title: params.validatedDecision.title,
    summary: params.validatedDecision.summary,
    memory_value: params.validatedDecision.memoryValue,
    evidence_summary: {
      sourceType: "worksheet_memory_semantic_pool",
      semanticPoolId: params.semanticPool.id,
      semanticPoolSignature: params.semanticPool.semanticSignature,
      semanticPoolRevisionHash: params.semanticPool.sourceRevisionHash,
      synthesisQueueRowId: params.queueRowId,
      synthesisRunId: params.runId,
      synthesisDecision: params.validatedDecision.decision,
      includedCount: packetEvidenceCounts.includedCount,
      uncertainCount: packetEvidenceCounts.uncertainCount,
      adjacentCount: packetEvidenceCounts.adjacentCount,
      excludedCount: packetEvidenceCounts.excludedCount,
      worksheetCount: params.semanticPool.worksheetCount,
      workbookCount: params.semanticPool.workbookCount,
      projectCount: params.semanticPool.projectCount,
      averageConfidence: params.semanticPool.averageConfidence,
      synthesisReasoningSummary: params.validatedDecision.reasoningSummary,
      supportingEvidenceEventIds: params.validatedDecision.supportingEvidenceEventIds,
      uncertainEvidenceEventIds: params.validatedDecision.uncertainEvidenceEventIds,
      adjacentEvidenceEventIds: params.validatedDecision.adjacentEvidenceEventIds,
      excludedEvidenceEventIds: params.validatedDecision.excludedEvidenceEventIds,
      contradictoryEvidenceEventIds: params.validatedDecision.contradictoryEvidenceEventIds,
      supportingEvidenceCount: supportCount,
      uncertainEvidenceCount: uncertaintyCount,
      adjacentEvidenceCount: adjacentCount,
      excludedEvidenceCount: excludedCount,
      contradictoryEvidenceCount: contradictionCount,
      schemaVersion: 1,
    },
    confidence_score: existingId
      ? clampConfidence(params.existingMemoryRow?.confidence_score)
      : params.validatedDecision.confidence,
    derived_from_event_count: supportCount,
    derived_from_ai_interaction_count: 0,
    derived_from_correction_count: 0,
    derived_from_validation_count: 0,
    derived_from_total_count: totalEvidenceCount,
    reinforcement_count: existingId ? priorReinforcementCount : 0,
    contradiction_count: existingId
      ? Math.max(0, toNullableNumber(params.existingMemoryRow?.contradiction_count) ?? 0)
      : 0,
    reinforced_supporting_classification_count:
      toNullableNumber(params.existingMemoryRow?.reinforced_supporting_classification_count) ?? 0,
    contradicted_supporting_classification_count:
      Math.max(0, toNullableNumber(params.existingMemoryRow?.contradicted_supporting_classification_count) ?? 0),
    confidence_calculation_version:
      toNullableNumber(params.existingMemoryRow?.confidence_calculation_version)
      ?? ORGANIZATION_MEMORY_CONFIDENCE_CALCULATION_VERSION,
    last_confidence_history_id: toNullableString(params.existingMemoryRow?.last_confidence_history_id),
    last_confidence_calculated_at: toNullableString(params.existingMemoryRow?.last_confidence_calculated_at),
    base_confidence_score: clampConfidence(params.existingMemoryRow?.base_confidence_score),
    confidence_reason_summary: toNullableString(params.existingMemoryRow?.confidence_reason_summary),
    last_reinforced_synthesis_history_id:
      toNullableString(params.existingMemoryRow?.last_reinforced_synthesis_history_id),
    last_reinforced_lifecycle_history_id:
      toNullableString(params.existingMemoryRow?.last_reinforced_lifecycle_history_id),
    last_reinforced_source_revision_hash:
      toNullableString(params.existingMemoryRow?.last_reinforced_source_revision_hash),
    reinforcement_basis_hash:
      toNullableString(params.existingMemoryRow?.reinforcement_basis_hash),
    last_contradicted_synthesis_history_id:
      toNullableString(params.existingMemoryRow?.last_contradicted_synthesis_history_id),
    last_contradicted_lifecycle_history_id:
      toNullableString(params.existingMemoryRow?.last_contradicted_lifecycle_history_id),
    last_contradicted_source_revision_hash:
      toNullableString(params.existingMemoryRow?.last_contradicted_source_revision_hash),
    contradiction_basis_hash:
      toNullableString(params.existingMemoryRow?.contradiction_basis_hash),
    contradiction_strength_score:
      toNullableNumber(params.existingMemoryRow?.contradiction_strength_score),
    is_active: true,
    is_user_confirmed: Boolean(params.existingMemoryRow?.is_user_confirmed) ?? false,
    first_derived_at: toNullableString(params.existingMemoryRow?.first_derived_at) ?? now,
    last_derived_at: now,
    last_reinforced_at: toNullableString(params.existingMemoryRow?.last_reinforced_at),
    last_contradicted_at: toNullableString(params.existingMemoryRow?.last_contradicted_at),
    privacy_classification: "financial_sensitive",
    visibility_scope: "organization",
    source_revision_hash: params.semanticPool.sourceRevisionHash,
    superseded_by_memory_id: null,
    superseded_at: null,
    superseded_lifecycle_history_id: null,
    superseded_by_synthesis_history_id: null,
    supersession_basis_hash: null,
    supersession_reason_summary: null,
  };

  const query = existingId
    ? admin
        .from("organization_memory_items" as never)
        .update(payload as never)
        .eq("id", existingId as never)
        .eq("organization_id", params.organizationId as never)
    : admin
        .from("organization_memory_items" as never)
        .upsert(payload as never, {
          onConflict: "organization_id,memory_category,memory_type,memory_key",
        } as never);

  const { data, error } = await query
    .select("*")
    .single();

  if (error?.code === "23505" && !existingId) {
    const canonical = await findCanonicalMemoryByUniqueIdentity({
      organizationId: params.organizationId,
      memoryCategory: params.validatedDecision.memoryCategory,
      memoryType: params.validatedDecision.memoryType,
      memorySignature: params.validatedDecision.memorySignature,
    });

    if (canonical?.id) {
      const { data: recoveredData, error: recoveredError } = await admin
        .from("organization_memory_items" as never)
        .update({
          ...payload,
          id: canonical.id,
        } as never)
        .eq("id", canonical.id as never)
        .eq("organization_id", params.organizationId as never)
        .select("*")
        .single();

      if (recoveredError) {
        throw new Error(recoveredError.message);
      }

      return {
        row: (recoveredData ?? {}) as Record<string, unknown>,
        writeDisposition: sameRevision ? "reused" : "updated",
        sameRevision,
      } as const;
    }
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    row: (data ?? {}) as Record<string, unknown>,
    writeDisposition: existingId
      ? sameRevision
        ? "reused"
        : "updated"
      : "created",
    sameRevision,
  } as const;
}

function buildReinforcementEvidenceContext(params: {
  packet: MemorySynthesisPacket;
  validatedDecision: ValidatedMemorySynthesisDecision;
}) {
  const allEvidence = [
    ...params.packet.evidence.included,
    ...params.packet.evidence.uncertain,
    ...params.packet.evidence.adjacent,
    ...params.packet.evidence.excluded,
  ];

  return {
    supportingClassificationRecordIds: mapEvidenceIdsToClassificationIds(
      allEvidence,
      params.validatedDecision.supportingEvidenceEventIds,
    ),
    supportingEventIds: dedupeStrings(params.validatedDecision.supportingEvidenceEventIds),
  } satisfies ReinforcementEvidenceContext;
}

async function getPriorReinforcementLifecycleRows(params: {
  organizationId: string;
  memoryId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_lifecycle_history" as never)
    .select("id, synthesis_history_id, lifecycle_metadata")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_id", params.memoryId as never)
    .eq("lifecycle_event_type", "memory_reinforced" as never)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
}

function extractCreditedSupportingClassificationIds(rows: Array<Record<string, unknown>>) {
  return new Set(
    rows.flatMap((row) => {
      const metadata = compactJsonRecord(row.lifecycle_metadata, 64);
      const ids = metadata.netNewSupportingClassificationRecordIds;
      return Array.isArray(ids)
        ? ids.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [];
    }),
  );
}

async function getPriorContradictionLifecycleRows(params: {
  organizationId: string;
  memoryId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_lifecycle_history" as never)
    .select("id, synthesis_history_id, lifecycle_metadata")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_id", params.memoryId as never)
    .eq("lifecycle_event_type", "memory_contradicted" as never)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
}

function extractCreditedContradictingClassificationIds(rows: Array<Record<string, unknown>>) {
  return new Set(
    rows.flatMap((row) => {
      const metadata = compactJsonRecord(row.lifecycle_metadata, 64);
      const ids = metadata.contradictingClassificationRecordIds;
      return Array.isArray(ids)
        ? ids.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [];
    }),
  );
}

function meaningIsStableForLifecycleComparison(params: {
  beforeRow: Record<string, unknown>;
  afterRow: Record<string, unknown>;
}) {
  return (
    toNullableString(params.beforeRow.id) === toNullableString(params.afterRow.id)
    && toNullableString(params.beforeRow.source_semantic_pool_id) === toNullableString(params.afterRow.source_semantic_pool_id)
    && toNullableString(params.beforeRow.memory_category) === toNullableString(params.afterRow.memory_category)
    && toNullableString(params.beforeRow.memory_type) === toNullableString(params.afterRow.memory_type)
    && toNullableString(params.beforeRow.memory_key) === toNullableString(params.afterRow.memory_key)
    && toNullableString(params.beforeRow.memory_signature) === toNullableString(params.afterRow.memory_signature)
    && stableScopeFingerprint(params.beforeRow.memory_value) === stableScopeFingerprint(params.afterRow.memory_value)
  );
}

function buildReinforcementBasisHash(params: {
  organizationId: string;
  memoryId: string;
  semanticPoolId: string;
  sourceRevisionHash: string;
  netNewSupportingClassificationRecordIds: string[];
  netNewSupportingEventIds: string[];
}) {
  return hashSignaturePayload({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
    sourceSemanticPoolId: params.semanticPoolId,
    sourceRevisionHash: params.sourceRevisionHash,
    netNewSupportingClassificationRecordIds: [...params.netNewSupportingClassificationRecordIds].sort(),
    netNewSupportingEventIds: [...params.netNewSupportingEventIds].sort(),
  });
}

function buildContradictionBasisHash(params: {
  organizationId: string;
  memoryId: string;
  semanticPoolId: string;
  sourceRevisionHash: string;
  netNewContradictingClassificationRecordIds: string[];
  netNewContradictingEventIds: string[];
}) {
  return hashSignaturePayload({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
    sourceSemanticPoolId: params.semanticPoolId,
    sourceRevisionHash: params.sourceRevisionHash,
    netNewContradictingClassificationRecordIds: [...params.netNewContradictingClassificationRecordIds].sort(),
    netNewContradictingEventIds: [...params.netNewContradictingEventIds].sort(),
  });
}

function getSupportingClassificationStrengthFromMemoryRow(row: Record<string, unknown>) {
  const evidenceSummary = compactJsonRecord(row.evidence_summary, 64);
  return Math.max(
    0,
    toNullableNumber(row.reinforced_supporting_classification_count) ?? 0,
    toNullableNumber(evidenceSummary.supportingEvidenceCount) ?? 0,
  );
}

function buildDeterministicSupersessionBasisHash(params: {
  organizationId: string;
  memoryDomainSignature: string;
  incumbentMemoryId: string;
  replacementMemoryId: string;
  replacementConfidence: number;
  incumbentConfidence: number;
  replacementReinforcementCount: number;
  incumbentContradictionCount: number;
}) {
  return hashSignaturePayload({
    organizationId: params.organizationId,
    memoryDomainSignature: params.memoryDomainSignature,
    oldMemoryId: params.incumbentMemoryId,
    replacementMemoryId: params.replacementMemoryId,
    replacementConfidence: roundConfidence(params.replacementConfidence),
    oldConfidence: roundConfidence(params.incumbentConfidence),
    replacementReinforcementCount: params.replacementReinforcementCount,
    oldContradictionCount: params.incumbentContradictionCount,
  });
}

function buildContradictionEvidenceContext(params: {
  packet: MemorySynthesisPacket;
  validatedDecision: ValidatedMemorySynthesisDecision;
}) {
  const allEvidence = [
    ...params.packet.evidence.included,
    ...params.packet.evidence.uncertain,
    ...params.packet.evidence.adjacent,
    ...params.packet.evidence.excluded,
  ];
  const wantedEventIds = new Set(params.validatedDecision.contradictoryEvidenceEventIds);
  const contradictingEvidenceItems = allEvidence.filter((item) => wantedEventIds.has(item.sourceEventId));

  return {
    contradictingClassificationRecordIds: mapEvidenceIdsToClassificationIds(
      allEvidence,
      params.validatedDecision.contradictoryEvidenceEventIds,
    ),
    contradictingEventIds: dedupeStrings(contradictingEvidenceItems.map((item) => item.sourceEventId)),
    contradictingEvidenceItems,
    distinctProjectIds: dedupeStrings(contradictingEvidenceItems.map((item) => item.projectId)),
    distinctWorkbookIds: dedupeStrings(contradictingEvidenceItems.map((item) => item.worksheet.workbookId)),
    distinctWorksheetIds: dedupeStrings(
      contradictingEvidenceItems.map((item) => {
        const workbookId = item.worksheet.workbookId ?? "unknown-workbook";
        const sheetId = item.worksheet.sheetId ?? "unknown-sheet";
        return `${workbookId}:${sheetId}`;
      }),
    ),
  } satisfies ContradictionEvidenceContext;
}

async function evaluateReinforcementEligibility(params: {
  organizationId: string;
  memoryId: string | null;
  packet: MemorySynthesisPacket;
  semanticPool: WorksheetMemorySemanticPool;
  validatedDecision: ValidatedMemorySynthesisDecision;
  writeDisposition: MemorySynthesisPersistenceOutcome;
  sameRevision: boolean;
  beforeMemoryRow: Record<string, unknown> | null;
  afterMemoryRow: Record<string, unknown>;
}) {
  if (!params.memoryId) {
    return {
      shouldReinforce: false,
      reason: "no_memory",
      netNewSupportingClassificationRecordIds: [],
      netNewSupportingEventIds: [],
      reinforcementBasisHash: null,
    } satisfies ReinforcementEligibility;
  }

  if (params.writeDisposition === "created") {
    return {
      shouldReinforce: false,
      reason: "created",
      netNewSupportingClassificationRecordIds: [],
      netNewSupportingEventIds: [],
      reinforcementBasisHash: null,
    } satisfies ReinforcementEligibility;
  }

  if (params.sameRevision) {
    return {
      shouldReinforce: false,
      reason: "same_revision_rerun",
      netNewSupportingClassificationRecordIds: [],
      netNewSupportingEventIds: [],
      reinforcementBasisHash: null,
    } satisfies ReinforcementEligibility;
  }

  const lastReinforcedSourceRevisionHash = toNullableString(
    params.afterMemoryRow.last_reinforced_source_revision_hash ?? params.beforeMemoryRow?.last_reinforced_source_revision_hash,
  );
  if (
    lastReinforcedSourceRevisionHash !== null
    && lastReinforcedSourceRevisionHash === params.semanticPool.sourceRevisionHash
  ) {
    return {
      shouldReinforce: false,
      reason: "same_last_reinforced_revision",
      netNewSupportingClassificationRecordIds: [],
      netNewSupportingEventIds: [],
      reinforcementBasisHash: null,
    } satisfies ReinforcementEligibility;
  }

  if (params.validatedDecision.contradictoryEvidenceEventIds.length > 0) {
    return {
      shouldReinforce: false,
      reason: "contradiction_present",
      netNewSupportingClassificationRecordIds: [],
      netNewSupportingEventIds: [],
      reinforcementBasisHash: null,
    } satisfies ReinforcementEligibility;
  }

  if (!params.beforeMemoryRow || !meaningIsStableForLifecycleComparison({
    beforeRow: params.beforeMemoryRow,
    afterRow: params.afterMemoryRow,
  })) {
    return {
      shouldReinforce: false,
      reason: "meaning_changed",
      netNewSupportingClassificationRecordIds: [],
      netNewSupportingEventIds: [],
      reinforcementBasisHash: null,
    } satisfies ReinforcementEligibility;
  }

  const evidenceContext = buildReinforcementEvidenceContext({
    packet: params.packet,
    validatedDecision: params.validatedDecision,
  });
  if (evidenceContext.supportingClassificationRecordIds.length === 0) {
    return {
      shouldReinforce: false,
      reason: "no_supporting_classifications",
      netNewSupportingClassificationRecordIds: [],
      netNewSupportingEventIds: [],
      reinforcementBasisHash: null,
    } satisfies ReinforcementEligibility;
  }

  const priorRows = await getPriorReinforcementLifecycleRows({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
  });
  const creditedClassificationIds = extractCreditedSupportingClassificationIds(priorRows);
  const netNewSupportingClassificationRecordIds = evidenceContext.supportingClassificationRecordIds
    .filter((id) => !creditedClassificationIds.has(id));

  if (netNewSupportingClassificationRecordIds.length === 0) {
    return {
      shouldReinforce: false,
      reason: "no_net_new_support",
      netNewSupportingClassificationRecordIds: [],
      netNewSupportingEventIds: [],
      reinforcementBasisHash: null,
    } satisfies ReinforcementEligibility;
  }

  const currentSupportingIds = new Set(netNewSupportingClassificationRecordIds);
  const netNewSupportingEventIds = dedupeStrings(
    params.packet.evidence.included
      .filter((item) => item.classificationRecordId && currentSupportingIds.has(item.classificationRecordId))
      .map((item) => item.sourceEventId),
  );
  const reinforcementBasisHash = buildReinforcementBasisHash({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
    semanticPoolId: params.semanticPool.id,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    netNewSupportingClassificationRecordIds,
    netNewSupportingEventIds,
  });

  return {
    shouldReinforce: true,
    reason: "eligible",
    netNewSupportingClassificationRecordIds,
    netNewSupportingEventIds,
    reinforcementBasisHash,
  } satisfies ReinforcementEligibility;
}

function computeContradictionStrength(params: {
  netNewContradictingClassificationRecordIds: string[];
  netNewContradictingEventIds: string[];
  distinctProjectIds: string[];
  distinctWorkbookIds: string[];
  distinctWorksheetIds: string[];
}) {
  const classificationStrength = Math.min(1, params.netNewContradictingClassificationRecordIds.length / 4);
  const eventStrength = Math.min(1, params.netNewContradictingEventIds.length / 4);
  const diversityStrength = Math.max(
    Math.min(1, params.distinctProjectIds.length / MIN_CONTRADICTION_DIVERSITY_COUNT),
    Math.min(1, params.distinctWorkbookIds.length / MIN_CONTRADICTION_DIVERSITY_COUNT),
    Math.min(1, params.distinctWorksheetIds.length / MIN_CONTRADICTION_DIVERSITY_COUNT),
  );

  return roundConfidence(
    Math.min(
      1,
      (classificationStrength * 0.45)
      + (eventStrength * 0.2)
      + (diversityStrength * 0.35),
    ),
  );
}

function deriveContradictionConflictType(params: {
  distinctProjectIds: string[];
  distinctWorkbookIds: string[];
  distinctWorksheetIds: string[];
  contradictionStrength: number;
}) {
  if (
    params.distinctProjectIds.length >= MIN_CONTRADICTION_DIVERSITY_COUNT
    || params.distinctWorkbookIds.length >= MIN_CONTRADICTION_DIVERSITY_COUNT
    || params.distinctWorksheetIds.length >= MIN_CONTRADICTION_DIVERSITY_COUNT
  ) {
    return "cross_context_behavior_conflict";
  }

  if (params.contradictionStrength >= MIN_CONTRADICTION_STRENGTH) {
    return "high_volume_single_context_conflict";
  }

  return "insufficient_conflict_signal";
}

function deriveContradictionConflictMagnitude(contradictionStrength: number) {
  if (contradictionStrength >= 0.8) {
    return "strong";
  }
  if (contradictionStrength >= 0.5) {
    return "moderate";
  }
  return "weak";
}

async function evaluateContradictionEligibility(params: {
  organizationId: string;
  memoryId: string | null;
  packet: MemorySynthesisPacket;
  semanticPool: WorksheetMemorySemanticPool;
  validatedDecision: ValidatedMemorySynthesisDecision;
  writeDisposition: MemorySynthesisPersistenceOutcome;
  sameRevision: boolean;
  beforeMemoryRow: Record<string, unknown> | null;
  afterMemoryRow: Record<string, unknown>;
}) {
  const emptyResult = {
    shouldContradict: false,
    netNewContradictingClassificationRecordIds: [],
    netNewContradictingEventIds: [],
    contradictionBasisHash: null,
    contradictionStrength: null,
    conflictType: null,
    conflictMagnitude: null,
    distinctProjectIds: [],
    distinctWorkbookIds: [],
    distinctWorksheetIds: [],
  } as const;

  if (!params.memoryId) {
    return { ...emptyResult, reason: "no_memory" } satisfies ContradictionEligibility;
  }

  if (params.writeDisposition === "created") {
    return { ...emptyResult, reason: "created" } satisfies ContradictionEligibility;
  }

  if (params.sameRevision) {
    return { ...emptyResult, reason: "same_revision_rerun" } satisfies ContradictionEligibility;
  }

  const lastContradictedSourceRevisionHash = toNullableString(
    params.afterMemoryRow.last_contradicted_source_revision_hash ?? params.beforeMemoryRow?.last_contradicted_source_revision_hash,
  );
  if (
    lastContradictedSourceRevisionHash !== null
    && lastContradictedSourceRevisionHash === params.semanticPool.sourceRevisionHash
  ) {
    return { ...emptyResult, reason: "same_last_contradicted_revision" } satisfies ContradictionEligibility;
  }

  if (!params.beforeMemoryRow || !meaningIsStableForLifecycleComparison({
    beforeRow: params.beforeMemoryRow,
    afterRow: params.afterMemoryRow,
  })) {
    return { ...emptyResult, reason: "meaning_changed" } satisfies ContradictionEligibility;
  }

  const evidenceContext = buildContradictionEvidenceContext({
    packet: params.packet,
    validatedDecision: params.validatedDecision,
  });
  if (evidenceContext.contradictingClassificationRecordIds.length === 0) {
    return {
      ...emptyResult,
      reason: "no_contradicting_classifications",
      distinctProjectIds: evidenceContext.distinctProjectIds,
      distinctWorkbookIds: evidenceContext.distinctWorkbookIds,
      distinctWorksheetIds: evidenceContext.distinctWorksheetIds,
    } satisfies ContradictionEligibility;
  }

  const priorRows = await getPriorContradictionLifecycleRows({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
  });
  const creditedClassificationIds = extractCreditedContradictingClassificationIds(priorRows);
  const netNewContradictingClassificationRecordIds = evidenceContext.contradictingClassificationRecordIds
    .filter((id) => !creditedClassificationIds.has(id));

  if (netNewContradictingClassificationRecordIds.length === 0) {
    return {
      ...emptyResult,
      reason: "no_net_new_contradiction",
      distinctProjectIds: evidenceContext.distinctProjectIds,
      distinctWorkbookIds: evidenceContext.distinctWorkbookIds,
      distinctWorksheetIds: evidenceContext.distinctWorksheetIds,
    } satisfies ContradictionEligibility;
  }

  const currentContradictingIds = new Set(netNewContradictingClassificationRecordIds);
  const netNewContradictingEventIds = dedupeStrings(
    evidenceContext.contradictingEvidenceItems
      .filter((item) => item.classificationRecordId && currentContradictingIds.has(item.classificationRecordId))
      .map((item) => item.sourceEventId),
  );
  const contradictionStrength = computeContradictionStrength({
    netNewContradictingClassificationRecordIds,
    netNewContradictingEventIds,
    distinctProjectIds: evidenceContext.distinctProjectIds,
    distinctWorkbookIds: evidenceContext.distinctWorkbookIds,
    distinctWorksheetIds: evidenceContext.distinctWorksheetIds,
  });
  const conflictType = deriveContradictionConflictType({
    distinctProjectIds: evidenceContext.distinctProjectIds,
    distinctWorkbookIds: evidenceContext.distinctWorkbookIds,
    distinctWorksheetIds: evidenceContext.distinctWorksheetIds,
    contradictionStrength,
  });
  const conflictMagnitude = deriveContradictionConflictMagnitude(contradictionStrength);
  const hasRequiredDiversity = (
    evidenceContext.distinctProjectIds.length >= MIN_CONTRADICTION_DIVERSITY_COUNT
    || evidenceContext.distinctWorkbookIds.length >= MIN_CONTRADICTION_DIVERSITY_COUNT
    || evidenceContext.distinctWorksheetIds.length >= MIN_CONTRADICTION_DIVERSITY_COUNT
  );

  if (
    netNewContradictingClassificationRecordIds.length < MIN_NET_NEW_CONTRADICTING_CLASSIFICATIONS
    || (!hasRequiredDiversity && contradictionStrength < MIN_CONTRADICTION_STRENGTH)
  ) {
    return {
      shouldContradict: false,
      reason: "insufficient_threshold",
      netNewContradictingClassificationRecordIds,
      netNewContradictingEventIds,
      contradictionBasisHash: null,
      contradictionStrength,
      conflictType,
      conflictMagnitude,
      distinctProjectIds: evidenceContext.distinctProjectIds,
      distinctWorkbookIds: evidenceContext.distinctWorkbookIds,
      distinctWorksheetIds: evidenceContext.distinctWorksheetIds,
    } satisfies ContradictionEligibility;
  }

  return {
    shouldContradict: true,
    reason: "eligible",
    netNewContradictingClassificationRecordIds,
    netNewContradictingEventIds,
    contradictionBasisHash: buildContradictionBasisHash({
      organizationId: params.organizationId,
      memoryId: params.memoryId,
      semanticPoolId: params.semanticPool.id,
      sourceRevisionHash: params.semanticPool.sourceRevisionHash,
      netNewContradictingClassificationRecordIds,
      netNewContradictingEventIds,
    }),
    contradictionStrength,
    conflictType,
    conflictMagnitude,
    distinctProjectIds: evidenceContext.distinctProjectIds,
    distinctWorkbookIds: evidenceContext.distinctWorkbookIds,
    distinctWorksheetIds: evidenceContext.distinctWorksheetIds,
  } satisfies ContradictionEligibility;
}

async function evaluateDeterministicSupersessionCandidates(params: {
  organizationId: string;
  replacementMemoryId: string | null;
  replacementMemoryRow: Record<string, unknown>;
}) {
  if (!params.replacementMemoryId) {
    return [] as DeterministicSupersessionCandidate[];
  }

  const replacementDomainSignature = toNullableString(params.replacementMemoryRow.memory_domain_signature);
  const replacementConfidence = clampConfidence(params.replacementMemoryRow.confidence_score);
  const replacementReinforcementCount = Math.max(
    0,
    toNullableNumber(params.replacementMemoryRow.reinforcement_count) ?? 0,
  );
  const replacementSupportingClassificationCount = getSupportingClassificationStrengthFromMemoryRow(
    params.replacementMemoryRow,
  );

  if (
    !replacementDomainSignature
    || params.replacementMemoryRow.is_active !== true
    || toNullableString(params.replacementMemoryRow.superseded_by_memory_id)
    || replacementConfidence === null
    || replacementConfidence < MIN_SUPERSESSION_REPLACEMENT_CONFIDENCE
    || (
      replacementReinforcementCount < MIN_SUPERSESSION_REPLACEMENT_REINFORCEMENT_COUNT
      && replacementSupportingClassificationCount < MIN_SUPERSESSION_REPLACEMENT_SUPPORTING_CLASSIFICATIONS
    )
  ) {
    return [] as DeterministicSupersessionCandidate[];
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_domain_signature", replacementDomainSignature as never)
    .eq("is_active", true as never)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const domainRows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  const candidates: DeterministicSupersessionCandidate[] = [];

  for (const row of domainRows) {
    const incumbentMemoryId = toNullableString(row.id);
    if (!incumbentMemoryId || incumbentMemoryId === params.replacementMemoryId) {
      continue;
    }
    if (toNullableString(row.superseded_by_memory_id)) {
      continue;
    }

    const incumbentConfidence = clampConfidence(row.confidence_score);
    if (incumbentConfidence === null) {
      continue;
    }

    const confidenceDelta = roundConfidence(replacementConfidence - incumbentConfidence);
    if (confidenceDelta < MIN_SUPERSESSION_CONFIDENCE_DELTA) {
      continue;
    }

    const incumbentContradictionCount = Math.max(0, toNullableNumber(row.contradiction_count) ?? 0);
    const incumbentSupportingClassificationCount = getSupportingClassificationStrengthFromMemoryRow(row);
    const replacementEvidenceSubstantiallyStronger = (
      replacementSupportingClassificationCount >= Math.max(
        MIN_SUPERSESSION_REPLACEMENT_SUPPORTING_CLASSIFICATIONS,
        incumbentSupportingClassificationCount + MIN_SUPERSESSION_SUPPORTING_CLASSIFICATION_ADVANTAGE,
      )
      && replacementReinforcementCount >= Math.max(
        MIN_SUPERSESSION_REPLACEMENT_REINFORCEMENT_COUNT,
        (toNullableNumber(row.reinforcement_count) ?? 0) + 1,
      )
    );

    let reasonType: DeterministicSupersessionCandidate["reasonType"] | null = null;
    let reasonSummary = "";
    if (incumbentContradictionCount >= MIN_SUPERSESSION_INCUMBENT_CONTRADICTION_COUNT) {
      reasonType = "contradiction_threshold";
      reasonSummary = [
        `Replacement memory exceeded the incumbent by ${confidenceDelta.toFixed(2)} confidence.`,
        `Incumbent contradiction count ${incumbentContradictionCount} met the supersession threshold while replacement confidence remained ${replacementConfidence.toFixed(2)}.`,
      ].join(" ");
    } else if (incumbentConfidence <= MAX_SUPERSESSION_INCUMBENT_CONFIDENCE) {
      reasonType = "confidence_decay";
      reasonSummary = [
        `Replacement memory exceeded the incumbent by ${confidenceDelta.toFixed(2)} confidence.`,
        `Incumbent confidence fell to ${incumbentConfidence.toFixed(2)} while replacement confidence remained ${replacementConfidence.toFixed(2)}.`,
      ].join(" ");
    } else if (replacementEvidenceSubstantiallyStronger) {
      reasonType = "replacement_evidence_advantage";
      reasonSummary = [
        `Replacement memory exceeded the incumbent by ${confidenceDelta.toFixed(2)} confidence.`,
        `Replacement evidence was substantially stronger (${replacementSupportingClassificationCount} supporting classifications, ${replacementReinforcementCount} reinforcements) than the incumbent (${incumbentSupportingClassificationCount} supporting classifications, ${Math.max(0, toNullableNumber(row.reinforcement_count) ?? 0)} reinforcements).`,
      ].join(" ");
    }

    if (!reasonType) {
      continue;
    }

    candidates.push({
      incumbentMemoryId,
      reasonType,
      reasonSummary,
      supersessionBasisHash: buildDeterministicSupersessionBasisHash({
        organizationId: params.organizationId,
        memoryDomainSignature: replacementDomainSignature,
        incumbentMemoryId,
        replacementMemoryId: params.replacementMemoryId,
        replacementConfidence,
        incumbentConfidence,
        replacementReinforcementCount,
        incumbentContradictionCount,
      }),
    });
  }

  return candidates;
}

async function updateMemoryItemForReinforcement(params: {
  organizationId: string;
  memoryId: string;
  synthesisHistoryId: string;
  sourceRevisionHash: string;
  reinforcementBasisHash: string;
  netNewSupportingClassificationRecordIds: string[];
}) {
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("id", params.memoryId as never)
    .single();

  if (existingError || !existing) {
    throw new Error(existingError?.message ?? "Organization memory item not found for reinforcement.");
  }

  const row = existing as Record<string, unknown>;
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .update({
      reinforcement_count: (toNullableNumber(row.reinforcement_count) ?? 0) + 1,
      last_reinforced_at: now,
      last_reinforced_synthesis_history_id: params.synthesisHistoryId,
      last_reinforced_source_revision_hash: params.sourceRevisionHash,
      reinforcement_basis_hash: params.reinforcementBasisHash,
      reinforced_supporting_classification_count:
        (toNullableNumber(row.reinforced_supporting_classification_count) ?? 0)
        + params.netNewSupportingClassificationRecordIds.length,
    } as never)
    .eq("organization_id", params.organizationId as never)
    .eq("id", params.memoryId as never)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? {}) as Record<string, unknown>;
}

async function updateMemoryItemForContradiction(params: {
  organizationId: string;
  memoryId: string;
  synthesisHistoryId: string;
  sourceRevisionHash: string;
  contradictionBasisHash: string;
  contradictionStrength: number;
  netNewContradictingClassificationRecordIds: string[];
}) {
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("id", params.memoryId as never)
    .single();

  if (existingError || !existing) {
    throw new Error(existingError?.message ?? "Organization memory item not found for contradiction.");
  }

  const row = existing as Record<string, unknown>;
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .update({
      contradiction_count: Math.max(0, toNullableNumber(row.contradiction_count) ?? 0) + 1,
      last_contradicted_at: now,
      last_contradicted_synthesis_history_id: params.synthesisHistoryId,
      last_contradicted_source_revision_hash: params.sourceRevisionHash,
      contradiction_basis_hash: params.contradictionBasisHash,
      contradicted_supporting_classification_count:
        Math.max(0, toNullableNumber(row.contradicted_supporting_classification_count) ?? 0)
        + params.netNewContradictingClassificationRecordIds.length,
      contradiction_strength_score: params.contradictionStrength,
    } as never)
    .eq("organization_id", params.organizationId as never)
    .eq("id", params.memoryId as never)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? {}) as Record<string, unknown>;
}

async function updateMemoryItemConfidenceState(params: {
  organizationId: string;
  memoryId: string;
  confidenceScore?: number;
  confidenceCalculationVersion: number;
  lastConfidenceHistoryId: string;
  lastConfidenceCalculatedAt: string;
  baseConfidenceScore?: number | null;
  confidenceReasonSummary: string | null;
}) {
  const admin = createAdminSupabaseClient();
  const payload: Record<string, unknown> = {
    confidence_calculation_version: params.confidenceCalculationVersion,
    last_confidence_history_id: params.lastConfidenceHistoryId,
    last_confidence_calculated_at: params.lastConfidenceCalculatedAt,
    confidence_reason_summary: params.confidenceReasonSummary,
  };

  if (typeof params.confidenceScore === "number") {
    payload.confidence_score = params.confidenceScore;
  }
  if (params.baseConfidenceScore !== undefined) {
    payload.base_confidence_score = params.baseConfidenceScore;
  }

  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .update(payload as never)
    .eq("organization_id", params.organizationId as never)
    .eq("id", params.memoryId as never)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? {}) as Record<string, unknown>;
}

async function insertOrganizationMemoryConfidenceHistory(params: {
  organizationId: string;
  memoryId: string;
  confidenceBefore: number | null;
  confidenceAfter: number;
  confidenceDelta: number | null;
  reasonType: OrganizationMemoryConfidenceHistoryReasonType;
  reasonSummary: string | null;
  calculationInputs: Record<string, Json | null>;
  contributorSnapshot: Record<string, Json | null>;
  lifecycleHistoryId?: string | null;
  synthesisHistoryId?: string | null;
  semanticPoolId?: string | null;
  sourceRevisionHash?: string | null;
  synthesisQueueRowId?: string | null;
  synthesisRunId?: string | null;
  isRecalculation?: boolean;
  manualActorUserId?: string | null;
}) {
  const admin = createAdminSupabaseClient();
  const payload = {
    organization_id: params.organizationId,
    memory_id: params.memoryId,
    confidence_before: params.confidenceBefore,
    confidence_after: params.confidenceAfter,
    confidence_delta: params.confidenceDelta,
    reason_type: params.reasonType,
    reason_summary: params.reasonSummary,
    calculation_version: ORGANIZATION_MEMORY_CONFIDENCE_HISTORY_SCHEMA_VERSION,
    calculation_inputs: params.calculationInputs,
    contributor_snapshot: params.contributorSnapshot,
    lifecycle_history_id: params.lifecycleHistoryId ?? null,
    synthesis_history_id: params.synthesisHistoryId ?? null,
    source_semantic_pool_id: params.semanticPoolId ?? null,
    source_revision_hash: params.sourceRevisionHash ?? null,
    synthesis_queue_row_id: params.synthesisQueueRowId ?? null,
    synthesis_run_id: params.synthesisRunId ?? null,
    is_recalculation: params.isRecalculation ?? false,
    manual_actor_user_id: params.manualActorUserId ?? null,
  };

  const { data, error } = await admin
    .from("organization_memory_confidence_history" as never)
    .insert(payload as never)
    .select("id, created_at, confidence_after")
    .single();

  if (!error) {
    const row = (data ?? {}) as Record<string, unknown>;
    const id = toNullableString(row.id);
    if (!id) {
      throw new Error("Inserted organization memory confidence history row is missing an id.");
    }
    return {
      id,
      createdAt: toNullableString(row.created_at) ?? new Date().toISOString(),
      confidenceAfter: clampConfidence(row.confidence_after) ?? params.confidenceAfter,
    };
  }

  const code = toNullableString((error as { code?: unknown }).code);
  if (code === "23505" && params.lifecycleHistoryId) {
    const { data: existing, error: existingError } = await admin
      .from("organization_memory_confidence_history" as never)
      .select("id, created_at, confidence_after")
      .eq("organization_id", params.organizationId as never)
      .eq("memory_id", params.memoryId as never)
      .eq("lifecycle_history_id", params.lifecycleHistoryId as never)
      .eq("reason_type", params.reasonType as never)
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const row = Array.isArray(existing) ? existing[0] as Record<string, unknown> | undefined : undefined;
    const id = toNullableString(row?.id);
    if (!id) {
      throw new Error("Existing organization memory confidence history row is missing an id.");
    }
    return {
      id,
      createdAt: toNullableString(row?.created_at) ?? new Date().toISOString(),
      confidenceAfter: clampConfidence(row?.confidence_after) ?? params.confidenceAfter,
    };
  }

  throw new Error(error.message);
}

function buildCreatedConfidenceHistory(params: {
  packet: MemorySynthesisPacket;
  semanticPool: WorksheetMemorySemanticPool;
  validatedDecision: ValidatedMemorySynthesisDecision;
  memoryRow: Record<string, unknown>;
  synthesisHistoryId: string;
  lifecycleHistoryId: string;
  synthesisQueueRowId: string;
  synthesisRunId: string;
}) {
  const createdConfidence = clampConfidence(params.memoryRow.confidence_score)
    ?? clampConfidence(params.validatedDecision.confidence)
    ?? 0;
  const allEvidence = [
    ...params.packet.evidence.included,
    ...params.packet.evidence.uncertain,
    ...params.packet.evidence.adjacent,
    ...params.packet.evidence.excluded,
  ];
  const supportingClassificationRecordIds = mapEvidenceIdsToClassificationIds(
    allEvidence,
    params.validatedDecision.supportingEvidenceEventIds,
  );

  return {
    confidenceBefore: null,
    confidenceAfter: createdConfidence,
    confidenceDelta: createdConfidence,
    reasonType: "memory_created" as const,
    reasonSummary: `Initial memory confidence set from Stage 8 create_memory decision at ${createdConfidence.toFixed(2)}.`,
    calculationInputs: {
      calculationVersion: ORGANIZATION_MEMORY_CONFIDENCE_CALCULATION_VERSION,
      source: "stage8_create_memory_v1",
      initialDecisionConfidence: createdConfidence,
      supportingEvidenceCount: params.validatedDecision.supportingEvidenceEventIds.length,
      uncertainEvidenceCount: params.validatedDecision.uncertainEvidenceEventIds.length,
      adjacentEvidenceCount: params.validatedDecision.adjacentEvidenceEventIds.length,
      excludedEvidenceCount: params.validatedDecision.excludedEvidenceEventIds.length,
    },
    contributorSnapshot: {
      supportingEvidenceEventIds: params.validatedDecision.supportingEvidenceEventIds,
      supportingClassificationRecordIds,
      uncertainEvidenceEventIds: params.validatedDecision.uncertainEvidenceEventIds,
      adjacentEvidenceEventIds: params.validatedDecision.adjacentEvidenceEventIds,
      excludedEvidenceEventIds: params.validatedDecision.excludedEvidenceEventIds,
      contradictoryEvidenceEventIds: params.validatedDecision.contradictoryEvidenceEventIds,
    },
    lifecycleHistoryId: params.lifecycleHistoryId,
    synthesisHistoryId: params.synthesisHistoryId,
    semanticPoolId: params.semanticPool.id,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    synthesisQueueRowId: params.synthesisQueueRowId,
    synthesisRunId: params.synthesisRunId,
    isRecalculation: false,
  };
}

function computeReinforcementConfidence(params: {
  memoryRow: Record<string, unknown>;
  semanticPool: WorksheetMemorySemanticPool;
  synthesisQueueRowId: string;
  synthesisRunId: string;
  synthesisHistoryId: string;
  lifecycleHistoryId: string;
  netNewSupportingClassificationRecordIds: string[];
  netNewSupportingEventIds: string[];
  reinforcementBasisHash: string;
}) {
  const previousConfidence = clampConfidence(params.memoryRow.confidence_score) ?? 0;
  const baseConfidence = clampConfidence(params.memoryRow.base_confidence_score) ?? previousConfidence;
  const reinforcedSupportingClassificationCount = Math.max(
    0,
    toNullableNumber(params.memoryRow.reinforced_supporting_classification_count) ?? 0,
  );
  const reinforcementCount = Math.max(
    0,
    toNullableNumber(params.memoryRow.reinforcement_count) ?? 0,
  );
  const isUserConfirmed = Boolean(params.memoryRow.is_user_confirmed);
  const ceiling = isUserConfirmed ? 1 : DEFAULT_MEMORY_CONFIDENCE_CEILING;
  const supportLift = 0.015 * Math.log1p(reinforcedSupportingClassificationCount);
  const reinforcementLift = 0.02 * Math.log1p(reinforcementCount);
  const computedConfidence = Math.min(
    ceiling,
    Math.max(0, baseConfidence + supportLift + reinforcementLift),
  );
  const confidenceAfter = roundConfidence(Math.max(previousConfidence, computedConfidence));
  const confidenceDelta = roundConfidence(confidenceAfter - previousConfidence);
  const reasonSummary = [
    `Reinforcement recalculated confidence from ${previousConfidence.toFixed(2)} to ${confidenceAfter.toFixed(2)}.`,
    `Base ${baseConfidence.toFixed(2)}, ${reinforcementCount} reinforcement events, ${reinforcedSupportingClassificationCount} credited supporting classifications.`,
  ].join(" ");

  return {
    confidenceBefore: previousConfidence,
    confidenceAfter,
    confidenceDelta,
    reasonType: "reinforcement" as const,
    reasonSummary,
    calculationInputs: {
      calculationVersion: ORGANIZATION_MEMORY_CONFIDENCE_CALCULATION_VERSION,
      source: "memory_reinforced_v1",
      baseConfidenceScore: baseConfidence,
      previousConfidenceScore: previousConfidence,
      reinforcementCount,
      reinforcedSupportingClassificationCount,
      supportLift,
      reinforcementLift,
      ceiling,
      isUserConfirmed,
    },
    contributorSnapshot: {
      reinforcementBasisHash: params.reinforcementBasisHash,
      netNewSupportingClassificationRecordIds: params.netNewSupportingClassificationRecordIds,
      netNewSupportingEventIds: params.netNewSupportingEventIds,
      totalReinforcementCount: reinforcementCount,
      totalCreditedSupportingClassificationCount: reinforcedSupportingClassificationCount,
    },
    lifecycleHistoryId: params.lifecycleHistoryId,
    synthesisHistoryId: params.synthesisHistoryId,
    semanticPoolId: params.semanticPool.id,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    synthesisQueueRowId: params.synthesisQueueRowId,
    synthesisRunId: params.synthesisRunId,
    isRecalculation: true,
  };
}

function computeContradictionConfidence(params: {
  memoryRow: Record<string, unknown>;
  semanticPool: WorksheetMemorySemanticPool;
  synthesisQueueRowId: string;
  synthesisRunId: string;
  synthesisHistoryId: string;
  lifecycleHistoryId: string;
  contradictionBasisHash: string;
  contradictionStrength: number;
  netNewContradictingClassificationRecordIds: string[];
  netNewContradictingEventIds: string[];
}) {
  const previousConfidence = clampConfidence(params.memoryRow.confidence_score) ?? 0;
  const contradictionCount = Math.max(
    0,
    toNullableNumber(params.memoryRow.contradiction_count) ?? 0,
  );
  const contradictedSupportingClassificationCount = Math.max(
    0,
    toNullableNumber(params.memoryRow.contradicted_supporting_classification_count) ?? 0,
  );
  const floor = DEFAULT_MEMORY_CONFIDENCE_FLOOR;
  const contradictionCountPenalty = 0.025 * Math.log1p(contradictionCount);
  const contradictedClassificationPenalty = 0.02 * Math.log1p(contradictedSupportingClassificationCount);
  const contradictionStrengthPenalty = 0.02 * params.contradictionStrength;
  const penalty = contradictionCountPenalty + contradictedClassificationPenalty + contradictionStrengthPenalty;
  const confidenceAfter = roundConfidence(Math.max(floor, previousConfidence - penalty));
  const confidenceDelta = roundConfidence(confidenceAfter - previousConfidence);
  const reasonSummary = [
    `Contradiction recalculated confidence from ${previousConfidence.toFixed(2)} to ${confidenceAfter.toFixed(2)}.`,
    `${contradictionCount} contradiction events, ${contradictedSupportingClassificationCount} contradicted supporting classifications, contradiction strength ${params.contradictionStrength.toFixed(3)}, floor ${floor.toFixed(2)}.`,
  ].join(" ");

  return {
    confidenceBefore: previousConfidence,
    confidenceAfter,
    confidenceDelta,
    reasonType: "contradiction" as const,
    reasonSummary,
    calculationInputs: {
      calculationVersion: ORGANIZATION_MEMORY_CONFIDENCE_CALCULATION_VERSION,
      source: "memory_contradicted_v1",
      confidenceBefore: previousConfidence,
      contradictionCount,
      contradictedSupportingClassificationCount,
      contradictionStrengthScore: params.contradictionStrength,
      contradictionCountPenalty,
      contradictedClassificationPenalty,
      contradictionStrengthPenalty,
      penalty,
      floor,
      confidenceAfter,
    },
    contributorSnapshot: {
      contradictionBasisHash: params.contradictionBasisHash,
      contradictionLifecycleHistoryId: params.lifecycleHistoryId,
      synthesisHistoryId: params.synthesisHistoryId,
      contradictingClassificationRecordIds: params.netNewContradictingClassificationRecordIds,
      contradictingEventIds: params.netNewContradictingEventIds,
      sourceSemanticPoolId: params.semanticPool.id,
      sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    },
    lifecycleHistoryId: params.lifecycleHistoryId,
    synthesisHistoryId: params.synthesisHistoryId,
    semanticPoolId: params.semanticPool.id,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    synthesisQueueRowId: params.synthesisQueueRowId,
    synthesisRunId: params.synthesisRunId,
    isRecalculation: true,
  };
}

async function attachReinforcementLifecycleHistoryId(params: {
  organizationId: string;
  memoryId: string;
  reinforcementLifecycleHistoryId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .update({
      last_reinforced_lifecycle_history_id: params.reinforcementLifecycleHistoryId,
    } as never)
    .eq("organization_id", params.organizationId as never)
    .eq("id", params.memoryId as never)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? {}) as Record<string, unknown>;
}

async function attachContradictionLifecycleHistoryId(params: {
  organizationId: string;
  memoryId: string;
  contradictionLifecycleHistoryId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .update({
      last_contradicted_lifecycle_history_id: params.contradictionLifecycleHistoryId,
    } as never)
    .eq("organization_id", params.organizationId as never)
    .eq("id", params.memoryId as never)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? {}) as Record<string, unknown>;
}

async function applyMemoryReinforcement(params: {
  organizationId: string;
  packet: MemorySynthesisPacket;
  semanticPool: WorksheetMemorySemanticPool;
  validatedDecision: ValidatedMemorySynthesisDecision;
  memoryItemId: string | null;
  writeDisposition: MemorySynthesisPersistenceOutcome;
  sameRevision: boolean;
  beforeMemoryRow: Record<string, unknown> | null;
  afterMemoryRow: Record<string, unknown>;
  synthesisHistoryId: string;
  synthesisQueueRowId: string;
  synthesisRunId: string;
  reasonSummary: string | null;
}) {
  const eligibility = await evaluateReinforcementEligibility({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    packet: params.packet,
    semanticPool: params.semanticPool,
    validatedDecision: params.validatedDecision,
    writeDisposition: params.writeDisposition,
    sameRevision: params.sameRevision,
    beforeMemoryRow: params.beforeMemoryRow,
    afterMemoryRow: params.afterMemoryRow,
  });

  if (
    !eligibility.shouldReinforce
    || !params.memoryItemId
    || !eligibility.reinforcementBasisHash
  ) {
    return {
      applied: false,
      lifecycleHistoryId: null,
      reinforcementBasisHash: eligibility.reinforcementBasisHash,
      netNewSupportingClassificationRecordIds: eligibility.netNewSupportingClassificationRecordIds,
      netNewSupportingEventIds: eligibility.netNewSupportingEventIds,
      updatedMemoryRow: null,
      confidenceHistoryId: null,
      confidenceChanged: false,
    } satisfies AppliedReinforcementResult;
  }

  const priorRows = await getPriorReinforcementLifecycleRows({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
  });
  const duplicateBySynthesisHistory = priorRows.some((row) =>
    toNullableString(row.synthesis_history_id) === params.synthesisHistoryId,
  );
  const duplicateByBasisHash = priorRows.some((row) => {
    const metadata = compactJsonRecord(row.lifecycle_metadata, 64);
    return toNullableString(metadata.reinforcementBasisHash) === eligibility.reinforcementBasisHash;
  });

  if (duplicateBySynthesisHistory || duplicateByBasisHash) {
    return {
      applied: false,
      lifecycleHistoryId: null,
      reinforcementBasisHash: eligibility.reinforcementBasisHash,
      netNewSupportingClassificationRecordIds: eligibility.netNewSupportingClassificationRecordIds,
      netNewSupportingEventIds: eligibility.netNewSupportingEventIds,
      updatedMemoryRow: null,
      confidenceHistoryId: null,
      confidenceChanged: false,
    } satisfies AppliedReinforcementResult;
  }

  const reinforcementLifecycleHistoryId = randomUUID();
  const updatedMemoryRow = await updateMemoryItemForReinforcement({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    synthesisHistoryId: params.synthesisHistoryId,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    reinforcementBasisHash: eligibility.reinforcementBasisHash,
    netNewSupportingClassificationRecordIds: eligibility.netNewSupportingClassificationRecordIds,
  });

  await insertOrganizationMemoryLifecycleHistory({
    id: reinforcementLifecycleHistoryId,
    organizationId: params.organizationId,
    memoryItemId: params.memoryItemId,
    lifecycleEventType: "memory_reinforced",
    semanticPoolId: params.semanticPool.id,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    synthesisHistoryId: params.synthesisHistoryId,
    synthesisQueueRowId: params.synthesisQueueRowId,
    synthesisRunId: params.synthesisRunId,
    beforeMemorySnapshot: mapMemoryHistorySnapshot(params.afterMemoryRow),
    afterMemorySnapshot: mapMemoryHistorySnapshot(updatedMemoryRow),
    reasonSummary: params.reasonSummary,
    lifecycleMetadata: {
      reinforcementBasisHash: eligibility.reinforcementBasisHash,
      netNewSupportingClassificationRecordIds: eligibility.netNewSupportingClassificationRecordIds,
      netNewSupportingEventIds: eligibility.netNewSupportingEventIds,
      reinforcementSource: "stage8_post_persist_v1",
    },
  });

  const finalizedMemoryRow = await attachReinforcementLifecycleHistoryId({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    reinforcementLifecycleHistoryId,
  });

  const confidenceComputation = computeReinforcementConfidence({
    memoryRow: finalizedMemoryRow,
    semanticPool: params.semanticPool,
    synthesisQueueRowId: params.synthesisQueueRowId,
    synthesisRunId: params.synthesisRunId,
    synthesisHistoryId: params.synthesisHistoryId,
    lifecycleHistoryId: reinforcementLifecycleHistoryId,
    netNewSupportingClassificationRecordIds: eligibility.netNewSupportingClassificationRecordIds,
    netNewSupportingEventIds: eligibility.netNewSupportingEventIds,
    reinforcementBasisHash: eligibility.reinforcementBasisHash,
  });
  const confidenceHistory = await insertOrganizationMemoryConfidenceHistory({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    confidenceBefore: confidenceComputation.confidenceBefore,
    confidenceAfter: confidenceComputation.confidenceAfter,
    confidenceDelta: confidenceComputation.confidenceDelta,
    reasonType: confidenceComputation.reasonType,
    reasonSummary: confidenceComputation.reasonSummary,
    calculationInputs: confidenceComputation.calculationInputs,
    contributorSnapshot: confidenceComputation.contributorSnapshot,
    lifecycleHistoryId: confidenceComputation.lifecycleHistoryId,
    synthesisHistoryId: confidenceComputation.synthesisHistoryId,
    semanticPoolId: confidenceComputation.semanticPoolId,
    sourceRevisionHash: confidenceComputation.sourceRevisionHash,
    synthesisQueueRowId: confidenceComputation.synthesisQueueRowId,
    synthesisRunId: confidenceComputation.synthesisRunId,
    isRecalculation: confidenceComputation.isRecalculation,
  });
  const confidenceUpdatedMemoryRow = await updateMemoryItemConfidenceState({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    confidenceScore: confidenceHistory.confidenceAfter,
    confidenceCalculationVersion: ORGANIZATION_MEMORY_CONFIDENCE_CALCULATION_VERSION,
    lastConfidenceHistoryId: confidenceHistory.id,
    lastConfidenceCalculatedAt: confidenceHistory.createdAt,
    baseConfidenceScore:
      clampConfidence(finalizedMemoryRow.base_confidence_score)
      ?? clampConfidence(finalizedMemoryRow.confidence_score),
    confidenceReasonSummary: confidenceComputation.reasonSummary,
  });

  return {
    applied: true,
    lifecycleHistoryId: reinforcementLifecycleHistoryId,
    reinforcementBasisHash: eligibility.reinforcementBasisHash,
    netNewSupportingClassificationRecordIds: eligibility.netNewSupportingClassificationRecordIds,
    netNewSupportingEventIds: eligibility.netNewSupportingEventIds,
    updatedMemoryRow: confidenceUpdatedMemoryRow,
    confidenceHistoryId: confidenceHistory.id,
    confidenceChanged: confidenceHistory.confidenceAfter !== confidenceComputation.confidenceBefore,
  } satisfies AppliedReinforcementResult;
}

async function applyMemoryContradiction(params: {
  organizationId: string;
  packet: MemorySynthesisPacket;
  semanticPool: WorksheetMemorySemanticPool;
  validatedDecision: ValidatedMemorySynthesisDecision;
  memoryItemId: string | null;
  writeDisposition: MemorySynthesisPersistenceOutcome;
  sameRevision: boolean;
  beforeMemoryRow: Record<string, unknown> | null;
  afterMemoryRow: Record<string, unknown>;
  synthesisHistoryId: string;
  synthesisQueueRowId: string;
  synthesisRunId: string;
  reasonSummary: string | null;
}) {
  const eligibility = await evaluateContradictionEligibility({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    packet: params.packet,
    semanticPool: params.semanticPool,
    validatedDecision: params.validatedDecision,
    writeDisposition: params.writeDisposition,
    sameRevision: params.sameRevision,
    beforeMemoryRow: params.beforeMemoryRow,
    afterMemoryRow: params.afterMemoryRow,
  });

  if (
    !eligibility.shouldContradict
    || !params.memoryItemId
    || !eligibility.contradictionBasisHash
    || eligibility.contradictionStrength === null
  ) {
    return {
      applied: false,
      lifecycleHistoryId: null,
      contradictionBasisHash: eligibility.contradictionBasisHash,
      contradictionStrength: eligibility.contradictionStrength,
      netNewContradictingClassificationRecordIds: eligibility.netNewContradictingClassificationRecordIds,
      netNewContradictingEventIds: eligibility.netNewContradictingEventIds,
      updatedMemoryRow: null,
      confidenceHistoryId: null,
      confidenceChanged: false,
    } satisfies AppliedContradictionResult;
  }

  const priorRows = await getPriorContradictionLifecycleRows({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
  });
  const duplicateBySynthesisHistory = priorRows.some((row) =>
    toNullableString(row.synthesis_history_id) === params.synthesisHistoryId,
  );
  const duplicateByBasisHash = priorRows.some((row) => {
    const metadata = compactJsonRecord(row.lifecycle_metadata, 64);
    return toNullableString(metadata.contradictionBasisHash) === eligibility.contradictionBasisHash;
  });

  if (duplicateBySynthesisHistory || duplicateByBasisHash) {
    return {
      applied: false,
      lifecycleHistoryId: null,
      contradictionBasisHash: eligibility.contradictionBasisHash,
      contradictionStrength: eligibility.contradictionStrength,
      netNewContradictingClassificationRecordIds: eligibility.netNewContradictingClassificationRecordIds,
      netNewContradictingEventIds: eligibility.netNewContradictingEventIds,
      updatedMemoryRow: null,
      confidenceHistoryId: null,
      confidenceChanged: false,
    } satisfies AppliedContradictionResult;
  }

  const contradictionLifecycleHistoryId = randomUUID();
  const updatedMemoryRow = await updateMemoryItemForContradiction({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    synthesisHistoryId: params.synthesisHistoryId,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    contradictionBasisHash: eligibility.contradictionBasisHash,
    contradictionStrength: eligibility.contradictionStrength,
    netNewContradictingClassificationRecordIds: eligibility.netNewContradictingClassificationRecordIds,
  });

  await insertOrganizationMemoryLifecycleHistory({
    id: contradictionLifecycleHistoryId,
    organizationId: params.organizationId,
    memoryItemId: params.memoryItemId,
    lifecycleEventType: "memory_contradicted",
    semanticPoolId: params.semanticPool.id,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    synthesisHistoryId: params.synthesisHistoryId,
    synthesisQueueRowId: params.synthesisQueueRowId,
    synthesisRunId: params.synthesisRunId,
    beforeMemorySnapshot: mapMemoryHistorySnapshot(params.afterMemoryRow),
    afterMemorySnapshot: mapMemoryHistorySnapshot(updatedMemoryRow),
    reasonSummary: params.reasonSummary,
    lifecycleMetadata: {
      contradictionBasisHash: eligibility.contradictionBasisHash,
      contradictingClassificationRecordIds: eligibility.netNewContradictingClassificationRecordIds,
      contradictingEventIds: eligibility.netNewContradictingEventIds,
      contradictionStrength: eligibility.contradictionStrength,
      conflictType: eligibility.conflictType,
      conflictMagnitude: eligibility.conflictMagnitude,
      distinctProjectIds: eligibility.distinctProjectIds,
      distinctWorkbookIds: eligibility.distinctWorkbookIds,
      distinctWorksheetIds: eligibility.distinctWorksheetIds,
      contradictionSource: "stage8_post_persist_v1",
    },
  });

  const finalizedMemoryRow = await attachContradictionLifecycleHistoryId({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    contradictionLifecycleHistoryId,
  });

  const confidenceComputation = computeContradictionConfidence({
    memoryRow: finalizedMemoryRow,
    semanticPool: params.semanticPool,
    synthesisQueueRowId: params.synthesisQueueRowId,
    synthesisRunId: params.synthesisRunId,
    synthesisHistoryId: params.synthesisHistoryId,
    lifecycleHistoryId: contradictionLifecycleHistoryId,
    contradictionBasisHash: eligibility.contradictionBasisHash,
    contradictionStrength: eligibility.contradictionStrength,
    netNewContradictingClassificationRecordIds: eligibility.netNewContradictingClassificationRecordIds,
    netNewContradictingEventIds: eligibility.netNewContradictingEventIds,
  });
  const confidenceHistory = await insertOrganizationMemoryConfidenceHistory({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    confidenceBefore: confidenceComputation.confidenceBefore,
    confidenceAfter: confidenceComputation.confidenceAfter,
    confidenceDelta: confidenceComputation.confidenceDelta,
    reasonType: confidenceComputation.reasonType,
    reasonSummary: confidenceComputation.reasonSummary,
    calculationInputs: confidenceComputation.calculationInputs,
    contributorSnapshot: confidenceComputation.contributorSnapshot,
    lifecycleHistoryId: confidenceComputation.lifecycleHistoryId,
    synthesisHistoryId: confidenceComputation.synthesisHistoryId,
    semanticPoolId: confidenceComputation.semanticPoolId,
    sourceRevisionHash: confidenceComputation.sourceRevisionHash,
    synthesisQueueRowId: confidenceComputation.synthesisQueueRowId,
    synthesisRunId: confidenceComputation.synthesisRunId,
    isRecalculation: confidenceComputation.isRecalculation,
  });
  const confidenceUpdatedMemoryRow = await updateMemoryItemConfidenceState({
    organizationId: params.organizationId,
    memoryId: params.memoryItemId,
    confidenceScore: confidenceHistory.confidenceAfter,
    confidenceCalculationVersion: ORGANIZATION_MEMORY_CONFIDENCE_CALCULATION_VERSION,
    lastConfidenceHistoryId: confidenceHistory.id,
    lastConfidenceCalculatedAt: confidenceHistory.createdAt,
    baseConfidenceScore:
      clampConfidence(finalizedMemoryRow.base_confidence_score)
      ?? clampConfidence(finalizedMemoryRow.confidence_score),
    confidenceReasonSummary: confidenceComputation.reasonSummary,
  });

  return {
    applied: true,
    lifecycleHistoryId: contradictionLifecycleHistoryId,
    contradictionBasisHash: eligibility.contradictionBasisHash,
    contradictionStrength: eligibility.contradictionStrength,
    netNewContradictingClassificationRecordIds: eligibility.netNewContradictingClassificationRecordIds,
    netNewContradictingEventIds: eligibility.netNewContradictingEventIds,
    updatedMemoryRow: confidenceUpdatedMemoryRow,
    confidenceHistoryId: confidenceHistory.id,
    confidenceChanged: confidenceHistory.confidenceAfter !== confidenceComputation.confidenceBefore,
  } satisfies AppliedContradictionResult;
}

async function applyDeterministicMemorySupersession(params: {
  organizationId: string;
  memoryItemId: string | null;
  replacementMemoryRow: Record<string, unknown>;
  semanticPool: WorksheetMemorySemanticPool;
  synthesisHistoryId: string;
  synthesisQueueRowId: string;
  synthesisRunId: string;
  reasonSummary: string | null;
}) {
  if (!params.memoryItemId) {
    return {
      applied: false,
      supersededMemoryIds: [],
      supersededCount: 0,
    } satisfies AppliedSupersessionResult;
  }

  const candidates = await evaluateDeterministicSupersessionCandidates({
    organizationId: params.organizationId,
    replacementMemoryId: params.memoryItemId,
    replacementMemoryRow: params.replacementMemoryRow,
  });

  if (candidates.length === 0) {
    return {
      applied: false,
      supersededMemoryIds: [],
      supersededCount: 0,
    } satisfies AppliedSupersessionResult;
  }

  const supersededMemoryIds = await markSupersededMemories({
    organizationId: params.organizationId,
    supersededCandidates: candidates,
    replacementMemoryId: params.memoryItemId,
    replacementMemoryRow: params.replacementMemoryRow,
    replacementSemanticPoolId: params.semanticPool.id,
    replacementSourceRevisionHash: params.semanticPool.sourceRevisionHash,
    replacementSynthesisHistoryId: params.synthesisHistoryId,
    replacementQueueRowId: params.synthesisQueueRowId,
    replacementRunId: params.synthesisRunId,
    defaultReasonSummary: params.reasonSummary,
  });

  return {
    applied: supersededMemoryIds.length > 0,
    supersededMemoryIds,
    supersededCount: supersededMemoryIds.length,
  } satisfies AppliedSupersessionResult;
}

async function markSupersededMemories(params: {
  organizationId: string;
  supersededCandidates: DeterministicSupersessionCandidate[];
  replacementMemoryId: string;
  replacementMemoryRow: Record<string, unknown>;
  replacementSemanticPoolId: string;
  replacementSourceRevisionHash: string;
  replacementSynthesisHistoryId: string;
  replacementQueueRowId: string;
  replacementRunId: string;
  defaultReasonSummary: string | null;
}) {
  if (params.supersededCandidates.length === 0) {
    return [] as string[];
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never);

  if (error) {
    throw new Error(error.message);
  }

  const targetIds = new Set(params.supersededCandidates.map((candidate) => candidate.incumbentMemoryId));
  const candidatesById = new Map(
    params.supersededCandidates.map((candidate) => [candidate.incumbentMemoryId, candidate] as const),
  );
  const rows = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>).filter((row) => targetIds.has(toNullableString(row.id) ?? ""))
    : [];
  const supersededAt = new Date().toISOString();
  const updatedMemoryIds: string[] = [];

  for (const row of rows) {
    const memoryId = toNullableString(row.id);
    if (!memoryId) {
      continue;
    }
    const candidate = candidatesById.get(memoryId);
    if (!candidate) {
      continue;
    }
    if (row.is_active !== true) {
      continue;
    }
    if (toNullableString(row.superseded_by_memory_id)) {
      continue;
    }

    const lifecycleId = toNullableString(row.superseded_lifecycle_history_id) ?? randomUUID();
    const supersessionBasisHash = candidate.supersessionBasisHash;
    const reasonSummary = candidate.reasonSummary || params.defaultReasonSummary;
    const nextRow = {
      ...row,
      is_active: false,
      superseded_at: supersededAt,
      superseded_by_memory_id: params.replacementMemoryId,
      superseded_lifecycle_history_id: lifecycleId,
      superseded_by_synthesis_history_id: params.replacementSynthesisHistoryId,
      supersession_basis_hash: supersessionBasisHash,
      supersession_reason_summary: reasonSummary,
    };
    const lifecycleHistory = await insertOrganizationMemoryLifecycleHistory({
      id: lifecycleId,
      organizationId: params.organizationId,
      memoryItemId: memoryId,
      lifecycleEventType: "memory_superseded",
      semanticPoolId: params.replacementSemanticPoolId,
      sourceRevisionHash: params.replacementSourceRevisionHash,
      synthesisHistoryId: params.replacementSynthesisHistoryId,
      synthesisQueueRowId: params.replacementQueueRowId,
      synthesisRunId: params.replacementRunId,
      beforeMemorySnapshot: mapMemoryHistorySnapshot(row),
      afterMemorySnapshot: mapMemoryHistorySnapshot(nextRow),
      reasonSummary,
      lifecycleMetadata: {
        replacementMemoryId: params.replacementMemoryId,
        replacementSynthesisHistoryId: params.replacementSynthesisHistoryId,
        replacementSourceSemanticPoolId: params.replacementSemanticPoolId,
        replacementSourceRevisionHash: params.replacementSourceRevisionHash,
        supersessionBasisHash,
        incumbentConfidenceBefore: clampConfidence(row.confidence_score),
        replacementConfidenceAtDecision: clampConfidence(params.replacementMemoryRow.confidence_score),
        incumbentContradictionCount: toNullableNumber(row.contradiction_count),
        replacementReinforcementCount: toNullableNumber(params.replacementMemoryRow.reinforcement_count),
        replacementSupportingClassificationCount: getSupportingClassificationStrengthFromMemoryRow(
          params.replacementMemoryRow,
        ),
        domainSignature: toNullableString(row.memory_domain_signature)
          ?? toNullableString(params.replacementMemoryRow.memory_domain_signature),
        reasonType: candidate.reasonType,
        reasonSummary,
      },
    });

    const { data: updatedRows, error: updateError } = await admin
      .from("organization_memory_items" as never)
      .update({
        is_active: false,
        superseded_at: supersededAt,
        superseded_by_memory_id: params.replacementMemoryId,
        superseded_lifecycle_history_id: lifecycleHistory.id,
        superseded_by_synthesis_history_id: params.replacementSynthesisHistoryId,
        supersession_basis_hash: supersessionBasisHash,
        supersession_reason_summary: reasonSummary,
      } as never)
      .eq("organization_id", params.organizationId as never)
      .eq("id", memoryId as never)
      .select("id")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }
    if (updatedRows) {
      updatedMemoryIds.push(memoryId);
    }
  }

  return updatedMemoryIds;
}

async function getExistingSupersessionLinkMemoryIds(params: {
  organizationId: string;
  memoryItemId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_links" as never)
    .select("source_entity_id")
    .eq("organization_id", params.organizationId as never)
    .eq("organization_memory_item_id", params.memoryItemId as never)
    .eq("source_entity_type", "organization_memory_item" as never)
    .eq("link_type", "supersession" as never);

  if (error) {
    throw new Error(error.message);
  }

  return dedupeStrings(
    (Array.isArray(data) ? data as Array<Record<string, unknown>> : [])
      .map((row) => toNullableString(row.source_entity_id))
      .filter((value): value is string => Boolean(value)),
  );
}

async function upsertOrganizationMemoryLinks(params: {
  organizationId: string;
  organizationMemoryItemId: string;
  semanticPoolId: string;
  eventIdsByRole: {
    supporting: string[];
    uncertain: string[];
    adjacent: string[];
    excluded: string[];
    contradiction: string[];
  };
  classificationIdsByRole: {
    supporting: string[];
    uncertain: string[];
    adjacent: string[];
    excluded: string[];
    contradiction: string[];
  };
  supersededMemoryIds: string[];
}) {
  const admin = createAdminSupabaseClient();
  const dedupeLinkRows = (
    rows: Array<Record<string, Json | null>>,
    keyBuilder: (row: Record<string, Json | null>) => string,
  ) => {
    const deduped = new Map<string, Record<string, Json | null>>();
    for (const row of rows) {
      deduped.set(keyBuilder(row), row);
    }
    return Array.from(deduped.values());
  };

  const rawEventLinks = [
    ...params.eventIdsByRole.supporting.map((sourceEventId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "supporting",
      source_event_id: sourceEventId,
      source_entity_type: null,
      source_entity_id: null,
      weight: 1,
      confidence_delta: 0,
      note: null,
    })),
    ...params.eventIdsByRole.uncertain.map((sourceEventId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "uncertain",
      source_event_id: sourceEventId,
      source_entity_type: null,
      source_entity_id: null,
      weight: 1,
      confidence_delta: 0,
      note: null,
    })),
    ...params.eventIdsByRole.adjacent.map((sourceEventId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "adjacent",
      source_event_id: sourceEventId,
      source_entity_type: null,
      source_entity_id: null,
      weight: 1,
      confidence_delta: 0,
      note: null,
    })),
    ...params.eventIdsByRole.excluded.map((sourceEventId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "excluded",
      source_event_id: sourceEventId,
      source_entity_type: null,
      source_entity_id: null,
      weight: 1,
      confidence_delta: 0,
      note: null,
    })),
    ...params.eventIdsByRole.contradiction.map((sourceEventId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "contradiction",
      source_event_id: sourceEventId,
      source_entity_type: null,
      source_entity_id: null,
      weight: 1,
      confidence_delta: 0,
      note: null,
    })),
  ];
  const dedupedRawEventLinks = dedupeLinkRows(rawEventLinks, (row) =>
    `${String(row.organization_memory_item_id)}:${String(row.source_event_id)}`,
  );

  const entityLinks = [
    {
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "seed",
      source_event_id: null,
      source_entity_type: "worksheet_memory_semantic_pool",
      source_entity_id: params.semanticPoolId,
      weight: 1,
      confidence_delta: 0,
      note: "Semantic pool provenance",
    },
    ...params.classificationIdsByRole.supporting.map((sourceEntityId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "supporting",
      source_event_id: null,
      source_entity_type: "worksheet_event_classification",
      source_entity_id: sourceEntityId,
      weight: 1,
      confidence_delta: 0,
      note: "Worksheet classification provenance",
    })),
    ...params.classificationIdsByRole.uncertain.map((sourceEntityId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "uncertain",
      source_event_id: null,
      source_entity_type: "worksheet_event_classification",
      source_entity_id: sourceEntityId,
      weight: 1,
      confidence_delta: 0,
      note: "Worksheet classification provenance",
    })),
    ...params.classificationIdsByRole.adjacent.map((sourceEntityId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "adjacent",
      source_event_id: null,
      source_entity_type: "worksheet_event_classification",
      source_entity_id: sourceEntityId,
      weight: 1,
      confidence_delta: 0,
      note: "Worksheet classification provenance",
    })),
    ...params.classificationIdsByRole.excluded.map((sourceEntityId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "excluded",
      source_event_id: null,
      source_entity_type: "worksheet_event_classification",
      source_entity_id: sourceEntityId,
      weight: 1,
      confidence_delta: 0,
      note: "Worksheet classification provenance",
    })),
    ...params.classificationIdsByRole.contradiction.map((sourceEntityId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "contradiction",
      source_event_id: null,
      source_entity_type: "worksheet_event_classification",
      source_entity_id: sourceEntityId,
      weight: 1,
      confidence_delta: 0,
      note: "Worksheet classification provenance",
    })),
    ...params.supersededMemoryIds.map((sourceEntityId) => ({
      organization_memory_item_id: params.organizationMemoryItemId,
      organization_id: params.organizationId,
      link_type: "supersession",
      source_event_id: null,
      source_entity_type: "organization_memory_item",
      source_entity_id: sourceEntityId,
      weight: 1,
      confidence_delta: -0.2,
      note: "Supersedes prior memory",
    })),
  ];
  const dedupedEntityLinks = dedupeLinkRows(entityLinks, (row) =>
    `${String(row.organization_memory_item_id)}:${String(row.source_entity_type)}:${String(row.source_entity_id)}:${String(row.link_type)}`,
  );

  const { error } = await admin.rpc("replace_organization_memory_provenance_links" as never, {
    p_organization_memory_item_id: params.organizationMemoryItemId,
    p_organization_id: params.organizationId,
    p_records: [...dedupedRawEventLinks, ...dedupedEntityLinks],
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return dedupedRawEventLinks.length + dedupedEntityLinks.length;
}

function mapEvidenceIdsToClassificationIds(evidenceItems: CompactSemanticPoolEvidence[], eventIds: string[]) {
  const wanted = new Set(eventIds);
  return Array.from(
    new Set(
      evidenceItems
        .filter((item) => wanted.has(item.sourceEventId))
        .map((item) => item.classificationRecordId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function buildSynthesisHistoryEvidenceSnapshot(params: {
  packet: MemorySynthesisPacket;
  validatedDecision: ValidatedMemorySynthesisDecision;
}) {
  const allEvidence = [
    ...params.packet.evidence.included,
    ...params.packet.evidence.uncertain,
    ...params.packet.evidence.adjacent,
    ...params.packet.evidence.excluded,
  ];
  const supportingClassificationRecordIds = mapEvidenceIdsToClassificationIds(
    allEvidence,
    params.validatedDecision.supportingEvidenceEventIds,
  );
  const uncertainClassificationRecordIds = mapEvidenceIdsToClassificationIds(
    allEvidence,
    params.validatedDecision.uncertainEvidenceEventIds,
  );
  const adjacentClassificationRecordIds = mapEvidenceIdsToClassificationIds(
    allEvidence,
    params.validatedDecision.adjacentEvidenceEventIds,
  );
  const excludedClassificationRecordIds = mapEvidenceIdsToClassificationIds(
    allEvidence,
    params.validatedDecision.excludedEvidenceEventIds,
  );
  const contradictoryClassificationRecordIds = mapEvidenceIdsToClassificationIds(
    allEvidence,
    params.validatedDecision.contradictoryEvidenceEventIds,
  );

  return {
    packetEvidenceByRole: {
      included: buildEvidenceRoleSnapshot(params.packet.evidence.included),
      uncertain: buildEvidenceRoleSnapshot(params.packet.evidence.uncertain),
      adjacent: buildEvidenceRoleSnapshot(params.packet.evidence.adjacent),
      excluded: buildEvidenceRoleSnapshot(params.packet.evidence.excluded),
    },
    selectedEvidenceByRole: {
      supportingEvidenceEventIds: params.validatedDecision.supportingEvidenceEventIds,
      supportingClassificationRecordIds,
      uncertainEvidenceEventIds: params.validatedDecision.uncertainEvidenceEventIds,
      uncertainClassificationRecordIds,
      adjacentEvidenceEventIds: params.validatedDecision.adjacentEvidenceEventIds,
      adjacentClassificationRecordIds,
      excludedEvidenceEventIds: params.validatedDecision.excludedEvidenceEventIds,
      excludedClassificationRecordIds,
      contradictoryEvidenceEventIds: params.validatedDecision.contradictoryEvidenceEventIds,
      contradictoryClassificationRecordIds,
    },
    semanticPoolEventIds: dedupeStrings(allEvidence.map((item) => item.sourceEventId)),
    classificationRecordIds: dedupeStrings(allEvidence.map((item) => item.classificationRecordId)),
    evidenceCounts: {
      ...getMemorySynthesisPacketEvidenceCounts(params.packet),
      supportingEvidenceCount: params.validatedDecision.supportingEvidenceEventIds.length,
      uncertainEvidenceCount: params.validatedDecision.uncertainEvidenceEventIds.length,
      adjacentEvidenceCount: params.validatedDecision.adjacentEvidenceEventIds.length,
      excludedEvidenceCount: params.validatedDecision.excludedEvidenceEventIds.length,
      contradictoryEvidenceCount: params.validatedDecision.contradictoryEvidenceEventIds.length,
    },
  } satisfies Record<string, Json | null>;
}

async function insertOrganizationMemorySynthesisHistory(params: {
  organizationId: string;
  memoryItemId: string | null;
  semanticPoolId: string;
  sourceRevisionHash: string;
  synthesisQueueRowId: string;
  synthesisRunId: string;
  synthesisDecision: WorksheetMemorySynthesisDecision;
  persistenceOutcome: MemorySynthesisPersistenceOutcome;
  provider: string;
  model: string;
  validatedDecision: ValidatedMemorySynthesisDecision;
  packet: MemorySynthesisPacket;
  beforeMemorySnapshot: Record<string, Json | null> | null;
  afterMemorySnapshot: Record<string, Json | null> | null;
  deactivatedDuplicateCount: number;
  deactivatedDuplicateMemoryIds: string[];
}) {
  const admin = createAdminSupabaseClient();
  const payload = {
    organization_id: params.organizationId,
    memory_id: params.memoryItemId,
    source_semantic_pool_id: params.semanticPoolId,
    source_revision_hash: params.sourceRevisionHash,
    synthesis_queue_row_id: params.synthesisQueueRowId,
    synthesis_run_id: params.synthesisRunId,
    synthesis_decision: params.synthesisDecision,
    persistence_outcome: params.persistenceOutcome,
    provider: params.provider,
    model: params.model,
    prompt_version: WORKSHEET_MEMORY_SYNTHESIS_PROMPT_VERSION,
    schema_version: WORKSHEET_MEMORY_SYNTHESIS_HISTORY_SCHEMA_VERSION,
    evidence_snapshot: buildSynthesisHistoryEvidenceSnapshot({
      packet: params.packet,
      validatedDecision: params.validatedDecision,
    }),
    before_memory_snapshot: params.beforeMemorySnapshot,
    after_memory_snapshot: params.afterMemorySnapshot,
    duplicate_deactivation_snapshot: {
      duplicateCount: params.deactivatedDuplicateCount,
      duplicateMemoryIds: params.deactivatedDuplicateMemoryIds,
    },
    reasoning_summary: params.validatedDecision.reasoningSummary,
    decision_schema_version: WORKSHEET_MEMORY_SYNTHESIS_DECISION_SCHEMA_VERSION,
  };

  const { data, error } = await admin
    .from("organization_memory_synthesis_history" as never)
    .insert(payload as never)
    .select("id")
    .single();

  if (!error) {
    const id = toNullableString((data as Record<string, unknown> | null)?.id);
    if (!id) {
      throw new Error("Inserted organization memory synthesis history row is missing an id.");
    }
    return { id };
  }

  const code = toNullableString((error as { code?: unknown }).code);
  if (code === "23505") {
    const { data: existing, error: existingError } = await admin
      .from("organization_memory_synthesis_history" as never)
      .select("id")
      .eq("organization_id", params.organizationId as never)
      .eq("synthesis_queue_row_id", params.synthesisQueueRowId as never)
      .eq("synthesis_run_id", params.synthesisRunId as never)
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingRow = Array.isArray(existing)
      ? existing[0] as Record<string, unknown> | undefined
      : undefined;
    const id = toNullableString(existingRow?.id);
    if (!id) {
      throw new Error("Existing organization memory synthesis history row is missing an id.");
    }
    return { id };
  }

  throw new Error(error.message);
}

function deriveOrganizationMemoryLifecycleEventType(params: {
  action: ValidatedMemorySynthesisDecision["decision"];
  writeDisposition: Exclude<MemorySynthesisPersistenceOutcome, "none">;
}) {
  if (params.writeDisposition === "created") {
    return "memory_created" as const;
  }
  if (params.writeDisposition === "reused") {
    return "memory_reused" as const;
  }
  if (params.action === "create_memory") {
    return "memory_reconciled" as const;
  }
  return "memory_updated" as const;
}

async function insertOrganizationMemoryLifecycleHistory(params: {
  id?: string;
  organizationId: string;
  memoryItemId: string;
  lifecycleEventType: OrganizationMemoryLifecycleEventType;
  eventOriginType?: OrganizationMemoryLifecycleEventOriginType;
  semanticPoolId?: string | null;
  sourceRevisionHash?: string | null;
  synthesisHistoryId?: string | null;
  synthesisQueueRowId?: string | null;
  synthesisRunId?: string | null;
  beforeMemorySnapshot: Record<string, Json | null> | null;
  afterMemorySnapshot: Record<string, Json | null> | null;
  reasonSummary: string | null;
  lifecycleMetadata?: Record<string, Json | null>;
}) {
  const admin = createAdminSupabaseClient();
  const lifecycleHistoryId = params.id ?? randomUUID();
  const payload = {
    id: lifecycleHistoryId,
    organization_id: params.organizationId,
    memory_id: params.memoryItemId,
    lifecycle_event_type: params.lifecycleEventType,
    event_origin_type: params.eventOriginType ?? "synthesis",
    source_semantic_pool_id: params.semanticPoolId ?? null,
    source_revision_hash: params.sourceRevisionHash ?? null,
    synthesis_history_id: params.synthesisHistoryId ?? null,
    synthesis_queue_row_id: params.synthesisQueueRowId ?? null,
    synthesis_run_id: params.synthesisRunId ?? null,
    before_memory_snapshot: params.beforeMemorySnapshot,
    after_memory_snapshot: params.afterMemorySnapshot,
    reason_summary: params.reasonSummary,
    lifecycle_metadata: params.lifecycleMetadata ?? {},
    schema_version: ORGANIZATION_MEMORY_LIFECYCLE_HISTORY_SCHEMA_VERSION,
  };

  const { error } = await admin
    .from("organization_memory_lifecycle_history" as never)
    .insert(payload as never);

  if (!error) {
    return { id: lifecycleHistoryId };
  }

  const code = toNullableString((error as { code?: unknown }).code);
  if (code === "23505" && params.synthesisHistoryId) {
    const { data: existing, error: existingError } = await admin
      .from("organization_memory_lifecycle_history" as never)
      .select("id")
      .eq("organization_id", params.organizationId as never)
      .eq("memory_id", params.memoryItemId as never)
      .eq("synthesis_history_id", params.synthesisHistoryId as never)
      .eq("lifecycle_event_type", params.lifecycleEventType as never)
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const row = Array.isArray(existing) ? existing[0] as Record<string, unknown> | undefined : undefined;
    const existingId = toNullableString(row?.id);
    if (existingId) {
      return { id: existingId };
    }

    if (params.lifecycleEventType === "memory_superseded") {
      const supersessionBasisHash = toNullableString(params.lifecycleMetadata?.supersessionBasisHash);
      if (supersessionBasisHash) {
        const { data: supersessionRows, error: supersessionError } = await admin
          .from("organization_memory_lifecycle_history" as never)
          .select("id, lifecycle_metadata")
          .eq("organization_id", params.organizationId as never)
          .eq("memory_id", params.memoryItemId as never)
          .eq("lifecycle_event_type", params.lifecycleEventType as never)
          .order("created_at", { ascending: false })
          .limit(10);

        if (supersessionError) {
          throw new Error(supersessionError.message);
        }

        const matchingRow = (Array.isArray(supersessionRows) ? supersessionRows : [])
          .find((candidate) => toNullableString(
            compactJsonRecord((candidate as Record<string, unknown>).lifecycle_metadata, 64).supersessionBasisHash,
          ) === supersessionBasisHash) as Record<string, unknown> | undefined;

        const matchingId = toNullableString(matchingRow?.id);
        if (matchingId) {
          return { id: matchingId };
        }
      }
    }

    return { id: lifecycleHistoryId };
  }

  throw new Error(error.message);
}

async function persistMemorySynthesisDecision(params: {
  runId: string;
  packet: MemorySynthesisPacket;
  semanticPool: WorksheetMemorySemanticPool;
  validatedDecision: ValidatedMemorySynthesisDecision;
  provider: string;
  model: string;
}) {
  if (params.validatedDecision.decision === "no_memory") {
    await insertOrganizationMemorySynthesisHistory({
      organizationId: params.packet.organizationId,
      memoryItemId: null,
      semanticPoolId: params.semanticPool.id,
      sourceRevisionHash: params.semanticPool.sourceRevisionHash,
      synthesisQueueRowId: params.packet.queueRowId,
      synthesisRunId: params.runId,
      synthesisDecision: params.validatedDecision.decision,
      persistenceOutcome: "none",
      provider: params.provider,
      model: params.model,
      validatedDecision: params.validatedDecision,
      packet: params.packet,
      beforeMemorySnapshot: null,
      afterMemorySnapshot: null,
      deactivatedDuplicateCount: 0,
      deactivatedDuplicateMemoryIds: [],
    });

    return {
      memoryItemId: null,
      action: "no_memory" as const,
      writeDisposition: "none" as const,
      linkCount: 0,
      supersededCount: 0,
      deactivatedDuplicateCount: 0,
      reinforcementApplied: false,
      contradictionApplied: false,
    };
  }

  const existing = await findExistingMemoryForDecision({
    organizationId: params.packet.organizationId,
    semanticPool: params.semanticPool,
    validatedDecision: params.validatedDecision,
  });
  const beforeMemorySnapshot = mapMemoryHistorySnapshot(existing?.row ?? null);
  const memoryWrite = await upsertOrganizationMemoryItem({
    packet: params.packet,
    runId: params.runId,
    queueRowId: params.packet.queueRowId,
    organizationId: params.packet.organizationId,
    semanticPool: params.semanticPool,
    validatedDecision: params.validatedDecision,
    existingMemoryRow: existing?.row ?? null,
  });
  const memoryItemId = toNullableString(memoryWrite.row.id);
  if (!memoryItemId) {
    throw new Error("Persisted organization memory item is missing an id.");
  }
  const deactivatedDuplicateCount = await deactivateDuplicateActiveMemories({
    organizationId: params.packet.organizationId,
    keepMemoryId: memoryItemId,
    duplicateMemoryIds: existing?.duplicateIds ?? [],
  });

  const allEvidence = [
    ...params.packet.evidence.included,
    ...params.packet.evidence.uncertain,
    ...params.packet.evidence.adjacent,
    ...params.packet.evidence.excluded,
  ];
  const classificationIdsByRole = {
    supporting: mapEvidenceIdsToClassificationIds(allEvidence, params.validatedDecision.supportingEvidenceEventIds),
    uncertain: mapEvidenceIdsToClassificationIds(allEvidence, params.validatedDecision.uncertainEvidenceEventIds),
    adjacent: mapEvidenceIdsToClassificationIds(allEvidence, params.validatedDecision.adjacentEvidenceEventIds),
    excluded: mapEvidenceIdsToClassificationIds(allEvidence, params.validatedDecision.excludedEvidenceEventIds),
    contradiction: mapEvidenceIdsToClassificationIds(allEvidence, params.validatedDecision.contradictoryEvidenceEventIds),
  };

  const synthesisHistory = await insertOrganizationMemorySynthesisHistory({
    organizationId: params.packet.organizationId,
    memoryItemId,
    semanticPoolId: params.semanticPool.id,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    synthesisQueueRowId: params.packet.queueRowId,
    synthesisRunId: params.runId,
    synthesisDecision: params.validatedDecision.decision,
    persistenceOutcome: memoryWrite.writeDisposition,
    provider: params.provider,
    model: params.model,
    validatedDecision: params.validatedDecision,
    packet: params.packet,
    beforeMemorySnapshot,
    afterMemorySnapshot: mapMemoryHistorySnapshot(memoryWrite.row),
    deactivatedDuplicateCount,
    deactivatedDuplicateMemoryIds: existing?.duplicateIds ?? [],
  });

  const lifecycleHistory = await insertOrganizationMemoryLifecycleHistory({
    organizationId: params.packet.organizationId,
    memoryItemId,
    lifecycleEventType: deriveOrganizationMemoryLifecycleEventType({
      action: params.validatedDecision.decision,
      writeDisposition: memoryWrite.writeDisposition,
    }),
    semanticPoolId: params.semanticPool.id,
    sourceRevisionHash: params.semanticPool.sourceRevisionHash,
    synthesisHistoryId: synthesisHistory.id,
    synthesisQueueRowId: params.packet.queueRowId,
    synthesisRunId: params.runId,
    beforeMemorySnapshot,
    afterMemorySnapshot: mapMemoryHistorySnapshot(memoryWrite.row),
    reasonSummary: params.validatedDecision.reasoningSummary,
  });

  const createdConfidenceHistory = memoryWrite.writeDisposition === "created"
    ? await insertOrganizationMemoryConfidenceHistory({
        organizationId: params.packet.organizationId,
        memoryId: memoryItemId,
        ...buildCreatedConfidenceHistory({
          packet: params.packet,
          semanticPool: params.semanticPool,
          validatedDecision: params.validatedDecision,
          memoryRow: memoryWrite.row,
          synthesisHistoryId: synthesisHistory.id,
          lifecycleHistoryId: lifecycleHistory.id,
          synthesisQueueRowId: params.packet.queueRowId,
          synthesisRunId: params.runId,
        }),
      })
    : null;

  const baseConfidence = clampConfidence(memoryWrite.row.confidence_score)
    ?? clampConfidence(params.validatedDecision.confidence)
    ?? 0;
  const postCreateMemoryRow = createdConfidenceHistory
    ? await updateMemoryItemConfidenceState({
        organizationId: params.packet.organizationId,
        memoryId: memoryItemId,
        confidenceScore: baseConfidence,
        confidenceCalculationVersion: ORGANIZATION_MEMORY_CONFIDENCE_CALCULATION_VERSION,
        lastConfidenceHistoryId: createdConfidenceHistory.id,
        lastConfidenceCalculatedAt: createdConfidenceHistory.createdAt,
        baseConfidenceScore: baseConfidence,
        confidenceReasonSummary: `Initial memory confidence set from Stage 8 create_memory decision at ${baseConfidence.toFixed(2)}.`,
      })
    : memoryWrite.row;

  const reinforcement = await applyMemoryReinforcement({
    organizationId: params.packet.organizationId,
    packet: params.packet,
    semanticPool: params.semanticPool,
    validatedDecision: params.validatedDecision,
    memoryItemId,
    writeDisposition: memoryWrite.writeDisposition,
    sameRevision: memoryWrite.sameRevision,
    beforeMemoryRow: existing?.row ?? null,
    afterMemoryRow: postCreateMemoryRow,
    synthesisHistoryId: synthesisHistory.id,
    synthesisQueueRowId: params.packet.queueRowId,
    synthesisRunId: params.runId,
    reasonSummary: params.validatedDecision.reasoningSummary,
  });

  const contradiction = await applyMemoryContradiction({
    organizationId: params.packet.organizationId,
    packet: params.packet,
    semanticPool: params.semanticPool,
    validatedDecision: params.validatedDecision,
    memoryItemId,
    writeDisposition: memoryWrite.writeDisposition,
    sameRevision: memoryWrite.sameRevision,
    beforeMemoryRow: existing?.row ?? null,
    afterMemoryRow: reinforcement.updatedMemoryRow ?? postCreateMemoryRow,
    synthesisHistoryId: synthesisHistory.id,
    synthesisQueueRowId: params.packet.queueRowId,
    synthesisRunId: params.runId,
    reasonSummary: params.validatedDecision.reasoningSummary,
  });
  if (contradiction.applied && memoryItemId) {
    await enqueueOrganizationMemoryRetirementCheck({
      organizationId: params.packet.organizationId,
      memoryId: memoryItemId,
    });
  }

  const finalizedMemoryRow = contradiction.updatedMemoryRow
    ?? reinforcement.updatedMemoryRow
    ?? postCreateMemoryRow;
  const supersession = await applyDeterministicMemorySupersession({
    organizationId: params.packet.organizationId,
    memoryItemId,
    replacementMemoryRow: finalizedMemoryRow,
    semanticPool: params.semanticPool,
    synthesisHistoryId: synthesisHistory.id,
    synthesisQueueRowId: params.packet.queueRowId,
    synthesisRunId: params.runId,
    reasonSummary: params.validatedDecision.reasoningSummary,
  });
  const existingSupersessionLinkMemoryIds = await getExistingSupersessionLinkMemoryIds({
    organizationId: params.packet.organizationId,
    memoryItemId,
  });

  const linkCount = await upsertOrganizationMemoryLinks({
    organizationId: params.packet.organizationId,
    organizationMemoryItemId: memoryItemId,
    semanticPoolId: params.packet.semanticPool.id,
    eventIdsByRole: {
      supporting: params.validatedDecision.supportingEvidenceEventIds,
      uncertain: params.validatedDecision.uncertainEvidenceEventIds,
      adjacent: params.validatedDecision.adjacentEvidenceEventIds,
      excluded: params.validatedDecision.excludedEvidenceEventIds,
      contradiction: params.validatedDecision.contradictoryEvidenceEventIds,
    },
    classificationIdsByRole,
    supersededMemoryIds: dedupeStrings([
      ...existingSupersessionLinkMemoryIds,
      ...supersession.supersededMemoryIds,
    ]),
  });

  return {
    memoryItemId,
    action: params.validatedDecision.decision,
    writeDisposition: memoryWrite.writeDisposition,
    linkCount,
    supersededCount: supersession.supersededCount,
    deactivatedDuplicateCount,
    reinforcementApplied: reinforcement.applied,
    contradictionApplied: contradiction.applied,
  };
}

export async function runWorksheetMemorySynthesisWorker(
  input: RunWorksheetMemorySynthesisWorkerInput = {},
) {
  const startedAt = Date.now();
  const runId = randomUUID();
  const summary: RunWorksheetMemorySynthesisWorkerOutput = {
    runId,
    claimedJobCount: 0,
    completedJobCount: 0,
    retriedJobCount: 0,
    deadLetteredJobCount: 0,
    noMemoryCount: 0,
    createdMemoryCount: 0,
    updatedMemoryCount: 0,
    reusedMemoryCount: 0,
    reconciledMemoryCount: 0,
    deactivatedDuplicateMemoryCount: 0,
    reinforcedMemoryCount: 0,
    contradictedMemoryCount: 0,
    supersededMemoryCount: 0,
    organizationMemoryWriteCount: 0,
    provenanceLinkCount: 0,
    provider: "anthropic",
    model: getPricingWorksheetAnthropicModel(),
    durationMs: 0,
  };

  await insertSynthesisRun({
    runId,
    requestedOrganizationId: input.organizationId ?? null,
    summary,
  });

  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, 100));
  const maxEvidenceItems = Math.max(2, Math.min(input.maxEvidenceItems ?? DEFAULT_MAX_EVIDENCE_ITEMS, 32));
  const maxExistingMemories = Math.max(1, Math.min(input.maxExistingMemories ?? DEFAULT_MAX_EXISTING_MEMORIES, 24));
  const claimedRows = await claimWorksheetMemorySynthesisBatch({
    limit,
    organizationId: input.organizationId ?? null,
    semanticPoolId: input.semanticPoolId ?? null,
    workerId: input.workerId ?? DEFAULT_WORKER_ID,
    leaseSeconds: input.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
  });
  summary.claimedJobCount = claimedRows.length;

  const finalizeInputs: Array<{
    id: string;
    claimToken: string;
    queueState: "completed" | "retry_scheduled" | "dead_lettered";
    retryAfter?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }> = [];

  try {
    for (const row of claimedRows) {
      if (!row.claimToken) {
        continue;
      }

      try {
        const packet = await buildMemorySynthesisPacket({
          queueRow: row,
          maxEvidenceItems,
          maxExistingMemories,
        });

        const semanticPool = await getWorksheetMemorySemanticPoolDetail(row.semanticPoolId, row.organizationId);
        if (!semanticPool) {
          finalizeInputs.push({
            id: row.id,
            claimToken: row.claimToken,
            queueState: "dead_lettered",
            errorCode: "missing_semantic_pool",
            errorMessage: "Semantic pool was not found for synthesis.",
          });
          continue;
        }

        if (packet.evidence.included.length === 0) {
          const persisted = await persistMemorySynthesisDecision({
            runId,
            packet,
            semanticPool,
            validatedDecision: buildNoIncludedEvidenceDecision(),
            provider: summary.provider,
            model: summary.model,
          });

          summary.noMemoryCount += 1;
          summary.provenanceLinkCount += persisted.linkCount;
          finalizeInputs.push({
            id: row.id,
            claimToken: row.claimToken,
            queueState: "completed",
          });
          continue;
        }

        const response = await callAnthropicWorksheetMemorySynthesis(packet, {
          timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        });
        void response.providerResult;
        const validatedDecision = validateMemorySynthesisDecision(packet, response.decision);
        const persisted = await persistMemorySynthesisDecision({
          runId,
          packet,
          semanticPool,
          validatedDecision,
          provider: summary.provider,
          model: summary.model,
        });

        if (persisted.action === "no_memory") {
          summary.noMemoryCount += 1;
        } else {
          if (persisted.writeDisposition === "created") {
            summary.createdMemoryCount += 1;
          } else if (persisted.writeDisposition === "reused") {
            summary.reusedMemoryCount += 1;
          } else if (persisted.writeDisposition === "updated") {
            summary.updatedMemoryCount += 1;
            if (persisted.action === "create_memory") {
              summary.reconciledMemoryCount += 1;
            }
          }
          summary.deactivatedDuplicateMemoryCount += persisted.deactivatedDuplicateCount;
          summary.organizationMemoryWriteCount += 1;
        }

        if (persisted.reinforcementApplied) {
          summary.reinforcedMemoryCount += 1;
        }
        if (persisted.contradictionApplied) {
          summary.contradictedMemoryCount += 1;
        }
        summary.supersededMemoryCount += persisted.supersededCount;
        summary.provenanceLinkCount += persisted.linkCount;

        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: "completed",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Worksheet memory synthesis failed.";
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: row.attemptCount >= row.maxAttempts ? "dead_lettered" : "retry_scheduled",
          retryAfter: row.attemptCount >= row.maxAttempts ? null : buildRetryAfter(row.attemptCount, new Date().toISOString()),
          errorCode: "worksheet_memory_synthesis_failed",
          errorMessage: message,
        });
      }
    }

    const finalizeSummary = await finalizeWorksheetMemorySynthesisBatch(finalizeInputs);
    summary.completedJobCount = finalizeSummary.completedCount;
    summary.retriedJobCount = finalizeSummary.retriedCount;
    summary.deadLetteredJobCount = finalizeSummary.deadLetteredCount;
  } finally {
    summary.durationMs = Date.now() - startedAt;
    await updateSynthesisRun({
      runId,
      requestedOrganizationId: input.organizationId ?? null,
      summary,
    });
  }

  return summary;
}

export async function getWorksheetMemorySynthesisMetrics(organizationId?: string | null) {
  const admin = createAdminSupabaseClient();
  let queueQuery = admin
    .from("worksheet_memory_synthesis_queue" as never)
    .select("queue_state, maturity_status");
  let memoryQuery = admin
    .from("organization_memory_items" as never)
    .select("is_active, confidence_score, superseded_by_memory_id, memory_category");

  if (organizationId) {
    queueQuery = queueQuery.eq("organization_id", organizationId as never);
    memoryQuery = memoryQuery.eq("organization_id", organizationId as never);
  }

  const [{ data: queueRows, error: queueError }, { data: memoryRows, error: memoryError }] = await Promise.all([
    queueQuery,
    memoryQuery,
  ]);

  if (queueError) {
    throw new Error(queueError.message);
  }
  if (memoryError) {
    throw new Error(memoryError.message);
  }

  const queueStateCounts: Record<string, number> = {};
  const maturityDistribution: Record<string, number> = {};
  for (const row of Array.isArray(queueRows) ? queueRows : []) {
    const state = toNullableString((row as Record<string, unknown>).queue_state) ?? "pending";
    const maturity = toNullableString((row as Record<string, unknown>).maturity_status) ?? "emerging";
    queueStateCounts[state] = (queueStateCounts[state] ?? 0) + 1;
    maturityDistribution[maturity] = (maturityDistribution[maturity] ?? 0) + 1;
  }

  const confidences: number[] = [];
  let activeMemoryCount = 0;
  let inactiveMemoryCount = 0;
  let supersededMemoryCount = 0;
  for (const row of Array.isArray(memoryRows) ? memoryRows : []) {
    if (toNullableString((row as Record<string, unknown>).memory_category)?.startsWith("worksheet_") !== true) {
      continue;
    }
    const isActive = Boolean((row as Record<string, unknown>).is_active);
    if (isActive) {
      activeMemoryCount += 1;
    } else {
      inactiveMemoryCount += 1;
    }
    if (toNullableString((row as Record<string, unknown>).superseded_by_memory_id)) {
      supersededMemoryCount += 1;
    }
    const confidence = toNullableNumber((row as Record<string, unknown>).confidence_score);
    if (confidence !== null) {
      confidences.push(confidence);
    }
  }

  return {
    organizationId: organizationId ?? null,
    queueStateCounts,
    maturityDistribution,
    activeMemoryCount,
    inactiveMemoryCount,
    supersededMemoryCount,
    averageConfidence: average(confidences),
    deadLetteredQueueCount: queueStateCounts.dead_lettered ?? 0,
  } satisfies WorksheetMemorySynthesisMetrics;
}

export const worksheetMemorySynthesisTestUtils = {
  buildMemorySignature,
  buildMemoryDomainSignature,
  buildSemanticPoolMemoryIdentitySignature,
  buildWorksheetMemorySynthesisSchema,
  buildWorksheetMemorySynthesisSystemPrompt,
  buildWorksheetMemorySynthesisUserPrompt,
  validateMemorySynthesisDecision,
};
