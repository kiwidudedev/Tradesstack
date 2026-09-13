import "server-only";

import { requirePlatformAdmin } from "@/lib/permissions-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { runWorksheetMemoryDerivation } from "@/lib/worksheet-memory-derivation";

type JsonRecord = Record<string, Json | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type RunOrganizationMemoryDerivationInput = {
  organizationId?: string | null;
  patternLimit?: number;
  includeLegacyWorksheetMemoryDerivation?: boolean;
};

export type GetOrganizationMemoryContextInput = {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  memoryCategories?: string[];
  memoryTypes?: string[];
  limit?: number;
};

export type ListOrganizationMemoriesInput = {
  organizationId: string;
  page?: number;
  pageSize?: number;
  query?: string | null;
  memoryCategory?: string | null;
  memoryType?: string | null;
  isActive?: boolean | null;
};

export type OrganizationMemoryListItem = {
  id: string;
  memoryCategory: string;
  memoryType: string;
  title: string;
  summary: string;
  confidenceScore: number;
  isActive: boolean;
  memorySignature: string | null;
  sourceRevisionHash: string | null;
  supersededByMemoryId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  provenanceCounts: {
    totalLinks: number;
    rawEventLinks: number;
    classificationLinks: number;
    semanticPoolLinks: number;
    supersessionLinks: number;
  };
};

export type ListOrganizationMemoriesOutput = {
  organizationId: string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  query: string | null;
  memoryCategory: string | null;
  memoryType: string | null;
  isActive: boolean | null;
  items: OrganizationMemoryListItem[];
};

export type OrganizationMemorySnapshot = {
  id: string;
  organizationId: string;
  memoryCategory: string;
  memoryType: string;
  memoryKey: string;
  title: string;
  summary: string;
  memoryValue: JsonRecord;
  evidenceSummary: JsonRecord;
  confidenceScore: number;
  isActive: boolean;
  memorySignature: string | null;
  memoryDomainSignature: string | null;
  sourceRevisionHash: string | null;
  retiredAt: string | null;
  retiredLifecycleHistoryId: string | null;
  retiredBySynthesisHistoryId: string | null;
  retirementBasisHash: string | null;
  retirementReasonSummary: string | null;
  supersededAt: string | null;
  supersededByMemoryId: string | null;
  supersededLifecycleHistoryId: string | null;
  supersededBySynthesisHistoryId: string | null;
  supersessionBasisHash: string | null;
  supersessionReasonSummary: string | null;
  reinforcementCount: number;
  contradictionCount: number;
  derivedFromTotalCount: number;
  firstDerivedAt: string | null;
  lastDerivedAt: string | null;
  lastReinforcedAt: string | null;
  lastReinforcedSynthesisHistoryId: string | null;
  lastReinforcedLifecycleHistoryId: string | null;
  lastReinforcedSourceRevisionHash: string | null;
  reinforcementBasisHash: string | null;
  reinforcedSupportingClassificationCount: number;
  lastContradictedSynthesisHistoryId: string | null;
  lastContradictedLifecycleHistoryId: string | null;
  lastContradictedSourceRevisionHash: string | null;
  contradictionBasisHash: string | null;
  contradictedSupportingClassificationCount: number;
  contradictionStrengthScore: number | null;
  confidenceCalculationVersion: number;
  lastConfidenceHistoryId: string | null;
  lastConfidenceCalculatedAt: string | null;
  baseConfidenceScore: number | null;
  confidenceReasonSummary: string | null;
  lastContradictedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OrganizationMemoryProvenanceSummary = {
  rawEventCount: number;
  classificationCount: number;
  semanticPoolCount: number;
  evidencePoolCount: number;
  supersessionCount: number;
  missingRawEvents: number;
  missingClassifications: number;
  missingSemanticPools: number;
  missingEvidencePools: number;
  missingSupersededMemories: number;
};

export type OrganizationMemoryFieldNote = {
  field: string;
  authority: "authoritative" | "inferred";
  note: string;
};

export type OrganizationMemorySemanticPoolSummary = {
  id: string;
  semanticSignature: string;
  domainLabel: string | null;
  domainSummary: string | null;
  evidenceSummary: JsonRecord;
  groupingRationale: string | null;
  variantSummary: string | null;
  maturityStatus: string;
  poolStatus: string;
  includedCount: number;
  excludedCount: number;
  adjacentCount: number;
  uncertainCount: number;
  projectCount: number;
  workbookCount: number;
  worksheetCount: number;
  averageConfidence: number | null;
  sourceRevisionHash: string;
  createdByRunId: string | null;
  lastUpdatedByRunId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OrganizationMemoryQueueRecord = {
  id: string;
  semanticPoolId: string;
  sourceRevisionHash: string;
  queueState: string;
  attemptCount: number;
  maxAttempts: number;
  priority: number;
  availableAt: string | null;
  retryAfter: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastAttemptAt: string | null;
  lastCompletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OrganizationMemorySynthesisHistoryEntry = {
  id: string;
  memoryId: string | null;
  sourceSemanticPoolId: string;
  sourceRevisionHash: string;
  synthesisQueueRowId: string;
  synthesisRunId: string;
  synthesisDecision: string;
  persistenceOutcome: string;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  schemaVersion: number | null;
  decisionSchemaVersion: number | null;
  evidenceSnapshot: JsonRecord;
  beforeMemorySnapshot: JsonRecord | null;
  afterMemorySnapshot: JsonRecord | null;
  duplicateDeactivationSnapshot: JsonRecord;
  reasoningSummary: string | null;
  createdAt: string | null;
};

export type OrganizationMemoryLifecycleHistoryEntry = {
  id: string;
  memoryId: string;
  lifecycleEventType: string;
  eventOriginType: string;
  sourceSemanticPoolId: string | null;
  sourceRevisionHash: string | null;
  synthesisHistoryId: string | null;
  synthesisQueueRowId: string | null;
  synthesisRunId: string | null;
  beforeMemorySnapshot: JsonRecord | null;
  afterMemorySnapshot: JsonRecord | null;
  lifecycleMetadata: JsonRecord;
  reasonSummary: string | null;
  schemaVersion: number | null;
  createdAt: string | null;
};

export type OrganizationMemoryConfidenceHistoryEntry = {
  id: string;
  memoryId: string;
  confidenceBefore: number | null;
  confidenceAfter: number;
  confidenceDelta: number | null;
  reasonType: string;
  reasonSummary: string | null;
  calculationVersion: number | null;
  calculationInputs: JsonRecord;
  contributorSnapshot: JsonRecord;
  lifecycleHistoryId: string | null;
  synthesisHistoryId: string | null;
  sourceSemanticPoolId: string | null;
  sourceRevisionHash: string | null;
  synthesisQueueRowId: string | null;
  synthesisRunId: string | null;
  isRecalculation: boolean;
  createdAt: string | null;
};

export type OrganizationMemoryRetirementEvaluationEntry = {
  id: string;
  memoryId: string;
  queueState: string;
  evaluationOutcome: "retired" | "no_action" | "pending" | "claimed" | "retry_scheduled" | "dead_lettered";
  attemptCount: number;
  maxAttempts: number;
  priority: number;
  availableAt: string | null;
  retryAfter: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  claimedBy: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastNoActionReason: string | null;
  evaluationSummary: string;
  replacementSearchExplanation: string | null;
  replacementCandidate: null | {
    id: string;
    title: string;
    confidenceScore: number;
    reinforcementCount: number;
    reinforcedSupportingClassificationCount: number;
  };
  currentMemoryState: "active" | "superseded" | "retired" | "inactive";
  retiredLifecycleHistoryId: string | null;
  retiredAt: string | null;
  retirementReasonSummary: string | null;
  lastAttemptAt: string | null;
  lastCompletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OrganizationMemoryDetail = {
  organizationId: string;
  memory: OrganizationMemorySnapshot;
  evidenceSummary: JsonRecord;
  memoryValue: JsonRecord;
  provenanceSummary: OrganizationMemoryProvenanceSummary;
  semanticPoolSummary: OrganizationMemorySemanticPoolSummary | null;
  synthesisInfo: {
    exactQueueRecords: OrganizationMemoryQueueRecord[];
    exactRunRecords: Array<Record<string, Json | null>>;
    inferredRunRecords: Array<Record<string, Json | null>>;
  };
  fieldNotes: OrganizationMemoryFieldNote[];
};

export type OrganizationMemorySemanticPoolLink = {
  linkId: string;
  linkType: string;
  semanticPoolId: string;
  note: string | null;
  createdAt: string | null;
  semanticPool: OrganizationMemorySemanticPoolSummary | null;
  missing: boolean;
};

export type OrganizationMemoryRawEventLink = {
  linkId: string;
  linkType: string;
  sourceEventId: string;
  note: string | null;
  createdAt: string | null;
  event: {
    id: string;
    eventType: string | null;
    occurredAt: string | null;
    projectId: string | null;
    opportunityId: string | null;
    workbookId: string | null;
    sheetId: string | null;
    sheetName: string | null;
    worksheetName: string | null;
    sourceRequestId: string | null;
    diffData: JsonRecord;
  } | null;
  missing: boolean;
};

export type OrganizationMemoryClassificationLink = {
  linkId: string;
  linkType: string;
  classificationRecordId: string;
  note: string | null;
  createdAt: string | null;
  classification: {
    id: string;
    sourceEventId: string;
    classificationStatus: string | null;
    overallConfidence: number | null;
    reasoningSummary: string | null;
    semanticFields: JsonRecord;
    interpretationPayload: JsonRecord;
    classifiedAt: string | null;
  } | null;
  missing: boolean;
};

export type OrganizationMemorySupersessionLink = {
  linkId: string;
  linkType: string;
  relatedMemoryId: string;
  note: string | null;
  confidenceDelta: number | null;
  createdAt: string | null;
  relatedMemory: Pick<
    OrganizationMemorySnapshot,
    "id" | "memoryCategory" | "memoryType" | "title" | "summary" | "confidenceScore" | "isActive" | "updatedAt"
  > | null;
  missing: boolean;
};

export type OrganizationMemoryEvidencePoolLink = {
  linkId: string;
  linkType: string;
  evidencePoolId: string;
  note: string | null;
  createdAt: string | null;
  evidencePool: {
    id: string;
    poolKind: string;
    maturityStatus: string;
    eventCount: number;
    projectCount: number;
    supplierCount: number;
    averageConfidence: number | null;
    targetContext: JsonRecord;
    lastSeenAt: string | null;
  } | null;
  missing: boolean;
};

export type OrganizationMemoryProvenance = {
  organizationId: string;
  memoryId: string;
  summary: OrganizationMemoryProvenanceSummary;
  completeness: {
    isComplete: boolean;
    missingRawEvents: string[];
    missingClassifications: string[];
    missingSemanticPools: string[];
    missingEvidencePools: string[];
    missingSupersededMemories: string[];
  };
  semanticPoolLinks: OrganizationMemorySemanticPoolLink[];
  evidencePoolLinks: OrganizationMemoryEvidencePoolLink[];
  rawEventLinks: OrganizationMemoryRawEventLink[];
  classificationLinks: OrganizationMemoryClassificationLink[];
  supersessionLinks: OrganizationMemorySupersessionLink[];
};

export type OrganizationMemoryLinkedEvent = {
  linkId: string;
  linkType: string;
  sourceEventId: string;
  eventType: string | null;
  occurredAt: string | null;
  projectId: string | null;
  opportunityId: string | null;
  workbookId: string | null;
  sheetId: string | null;
  sheetName: string | null;
  worksheetName: string | null;
  sourceRequestId: string | null;
  diffData: JsonRecord;
  diffSummary: string | null;
  metadataSummary: JsonRecord;
};

export type OrganizationMemoryLinkedEventsOutput = {
  organizationId: string;
  memoryId: string;
  events: OrganizationMemoryLinkedEvent[];
};

export type OrganizationMemoryLinkedClassification = {
  linkId: string;
  linkType: string;
  classificationRecordId: string;
  sourceEventId: string;
  classificationStatus: string | null;
  overallConfidence: number | null;
  semanticFields: JsonRecord;
  interpretationPayload: JsonRecord;
  reasoningSummary: string | null;
  classifiedAt: string | null;
};

export type OrganizationMemoryLinkedClassificationsOutput = {
  organizationId: string;
  memoryId: string;
  classifications: OrganizationMemoryLinkedClassification[];
  completeness: {
    missingClassificationIds: string[];
  };
};

export type OrganizationMemoryHistoryOutput = {
  organizationId: string;
  memoryId: string;
  supersededByMemoryId: string | null;
  supersedes: Array<Pick<OrganizationMemorySnapshot, "id" | "title" | "memoryCategory" | "memoryType" | "isActive" | "updatedAt">>;
  supersededByChain: Array<Pick<OrganizationMemorySnapshot, "id" | "title" | "memoryCategory" | "memoryType" | "isActive" | "updatedAt">>;
  lifecycleMoments: Array<{
    label: string;
    at: string | null;
    authority: "authoritative" | "inferred";
    note: string;
    lifecycleHistoryId?: string | null;
  }>;
  relatedSynthesis: {
    queueRecords: OrganizationMemoryQueueRecord[];
    exactRunRecords: Array<Record<string, Json | null>>;
    inferredRunRecords: Array<Record<string, Json | null>>;
    immutableHistory: OrganizationMemorySynthesisHistoryEntry[];
  };
  relatedLifecycle: {
    immutableHistory: OrganizationMemoryLifecycleHistoryEntry[];
  };
  relatedConfidence: {
    immutableHistory: OrganizationMemoryConfidenceHistoryEntry[];
  };
  relatedRetirement: {
    evaluations: OrganizationMemoryRetirementEvaluationEntry[];
  };
  fieldNotes: OrganizationMemoryFieldNote[];
};

export type RepairOrganizationMemoryConfidenceMetadataOutput = {
  organizationId: string;
  memoryId: string | null;
  apply: boolean;
  scannedCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedNoHistoryCount: number;
  records: Array<{
    memoryId: string;
    status: "updated" | "unchanged" | "no_history_unchanged";
    latestConfidenceHistoryId: string | null;
    confidenceBefore: number | null;
    confidenceAfter: number | null;
    baseConfidenceScoreBefore: number | null;
    baseConfidenceScoreAfter: number | null;
    lastConfidenceHistoryIdBefore: string | null;
    lastConfidenceHistoryIdAfter: string | null;
    lastConfidenceCalculatedAtBefore: string | null;
    lastConfidenceCalculatedAtAfter: string | null;
    confidenceReasonSummaryBefore: string | null;
    confidenceReasonSummaryAfter: string | null;
  }>;
};

type OrganizationMemoryRow = Record<string, unknown>;
type OrganizationMemoryLinkRow = Record<string, unknown>;

const DEFAULT_LIST_PAGE_SIZE = 12;
const MAX_LIST_PAGE_SIZE = 50;
const MAX_CHAIN_DEPTH = 8;
const RETIREMENT_REPLACEMENT_CONFIDENCE_THRESHOLD = 0.75;
const RETIREMENT_REPLACEMENT_REINFORCEMENT_COUNT_THRESHOLD = 2;
const RETIREMENT_REPLACEMENT_SUPPORTING_CLASSIFICATION_THRESHOLD = 4;

function ensureOrganizationId(organizationId: string) {
  if (typeof organizationId !== "string" || organizationId.trim().length === 0) {
    throw new Error("organizationId is required.");
  }

  return organizationId.trim();
}

function ensureMemoryId(memoryId: string) {
  if (typeof memoryId !== "string" || memoryId.trim().length === 0) {
    throw new Error("memoryId is required.");
  }

  return memoryId.trim();
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function clampConfidence(value: unknown) {
  const numeric = toNullableNumber(value);
  if (numeric === null) {
    return null;
  }

  return Math.min(1, Math.max(0, numeric));
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactJsonRecord(value: unknown, limit = 16): JsonRecord {
  if (!isJsonRecord(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).slice(0, limit)) as JsonRecord;
}

function mapMemorySnapshot(row: OrganizationMemoryRow): OrganizationMemorySnapshot {
  return {
    id: toNullableString(row.id) ?? "",
    organizationId: toNullableString(row.organization_id) ?? "",
    memoryCategory: toNullableString(row.memory_category) ?? "",
    memoryType: toNullableString(row.memory_type) ?? "",
    memoryKey: toNullableString(row.memory_key) ?? "",
    title: toNullableString(row.title) ?? "",
    summary: toNullableString(row.summary) ?? "",
    memoryValue: compactJsonRecord(row.memory_value, 48),
    evidenceSummary: compactJsonRecord(row.evidence_summary, 48),
    confidenceScore: toNullableNumber(row.confidence_score) ?? 0,
    isActive: Boolean(row.is_active),
    memorySignature: toNullableString(row.memory_signature),
    memoryDomainSignature: toNullableString(row.memory_domain_signature),
    sourceRevisionHash: toNullableString(row.source_revision_hash),
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
    reinforcementCount: toNullableNumber(row.reinforcement_count) ?? 0,
    contradictionCount: toNullableNumber(row.contradiction_count) ?? 0,
    derivedFromTotalCount: toNullableNumber(row.derived_from_total_count) ?? 0,
    firstDerivedAt: toNullableString(row.first_derived_at),
    lastDerivedAt: toNullableString(row.last_derived_at),
    lastReinforcedAt: toNullableString(row.last_reinforced_at),
    lastReinforcedSynthesisHistoryId: toNullableString(row.last_reinforced_synthesis_history_id),
    lastReinforcedLifecycleHistoryId: toNullableString(row.last_reinforced_lifecycle_history_id),
    lastReinforcedSourceRevisionHash: toNullableString(row.last_reinforced_source_revision_hash),
    reinforcementBasisHash: toNullableString(row.reinforcement_basis_hash),
    reinforcedSupportingClassificationCount: toNullableNumber(row.reinforced_supporting_classification_count) ?? 0,
    lastContradictedSynthesisHistoryId: toNullableString(row.last_contradicted_synthesis_history_id),
    lastContradictedLifecycleHistoryId: toNullableString(row.last_contradicted_lifecycle_history_id),
    lastContradictedSourceRevisionHash: toNullableString(row.last_contradicted_source_revision_hash),
    contradictionBasisHash: toNullableString(row.contradiction_basis_hash),
    contradictedSupportingClassificationCount: toNullableNumber(row.contradicted_supporting_classification_count) ?? 0,
    contradictionStrengthScore: toNullableNumber(row.contradiction_strength_score),
    confidenceCalculationVersion: toNullableNumber(row.confidence_calculation_version) ?? 1,
    lastConfidenceHistoryId: toNullableString(row.last_confidence_history_id),
    lastConfidenceCalculatedAt: toNullableString(row.last_confidence_calculated_at),
    baseConfidenceScore: toNullableNumber(row.base_confidence_score),
    confidenceReasonSummary: toNullableString(row.confidence_reason_summary),
    lastContradictedAt: toNullableString(row.last_contradicted_at),
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
  };
}

function mapQueueRecord(row: Record<string, unknown>): OrganizationMemoryQueueRecord {
  return {
    id: toNullableString(row.id) ?? "",
    semanticPoolId: toNullableString(row.semantic_pool_id) ?? "",
    sourceRevisionHash: toNullableString(row.source_revision_hash) ?? "",
    queueState: toNullableString(row.queue_state) ?? "pending",
    attemptCount: toNullableNumber(row.attempt_count) ?? 0,
    maxAttempts: toNullableNumber(row.max_attempts) ?? 0,
    priority: toNullableNumber(row.priority) ?? 0,
    availableAt: toNullableString(row.available_at),
    retryAfter: toNullableString(row.retry_after),
    lastErrorCode: toNullableString(row.last_error_code),
    lastErrorMessage: toNullableString(row.last_error_message),
    lastAttemptAt: toNullableString(row.last_attempt_at),
    lastCompletedAt: toNullableString(row.last_completed_at),
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
  };
}

function mapSynthesisHistoryEntry(row: Record<string, unknown>): OrganizationMemorySynthesisHistoryEntry {
  return {
    id: toNullableString(row.id) ?? "",
    memoryId: toNullableString(row.memory_id),
    sourceSemanticPoolId: toNullableString(row.source_semantic_pool_id) ?? "",
    sourceRevisionHash: toNullableString(row.source_revision_hash) ?? "",
    synthesisQueueRowId: toNullableString(row.synthesis_queue_row_id) ?? "",
    synthesisRunId: toNullableString(row.synthesis_run_id) ?? "",
    synthesisDecision: toNullableString(row.synthesis_decision) ?? "",
    persistenceOutcome: toNullableString(row.persistence_outcome) ?? "",
    provider: toNullableString(row.provider),
    model: toNullableString(row.model),
    promptVersion: toNullableString(row.prompt_version),
    schemaVersion: toNullableNumber(row.schema_version),
    decisionSchemaVersion: toNullableNumber(row.decision_schema_version),
    evidenceSnapshot: compactJsonRecord(row.evidence_snapshot, 64),
    beforeMemorySnapshot: isJsonRecord(row.before_memory_snapshot)
      ? compactJsonRecord(row.before_memory_snapshot, 64)
      : null,
    afterMemorySnapshot: isJsonRecord(row.after_memory_snapshot)
      ? compactJsonRecord(row.after_memory_snapshot, 64)
      : null,
    duplicateDeactivationSnapshot: compactJsonRecord(row.duplicate_deactivation_snapshot, 32),
    reasoningSummary: toNullableString(row.reasoning_summary),
    createdAt: toNullableString(row.created_at),
  };
}

function mapLifecycleHistoryEntry(row: Record<string, unknown>): OrganizationMemoryLifecycleHistoryEntry {
  return {
    id: toNullableString(row.id) ?? "",
    memoryId: toNullableString(row.memory_id) ?? "",
    lifecycleEventType: toNullableString(row.lifecycle_event_type) ?? "",
    eventOriginType: toNullableString(row.event_origin_type) ?? "synthesis",
    sourceSemanticPoolId: toNullableString(row.source_semantic_pool_id),
    sourceRevisionHash: toNullableString(row.source_revision_hash),
    synthesisHistoryId: toNullableString(row.synthesis_history_id),
    synthesisQueueRowId: toNullableString(row.synthesis_queue_row_id),
    synthesisRunId: toNullableString(row.synthesis_run_id),
    beforeMemorySnapshot: isJsonRecord(row.before_memory_snapshot)
      ? compactJsonRecord(row.before_memory_snapshot, 64)
      : null,
    afterMemorySnapshot: isJsonRecord(row.after_memory_snapshot)
      ? compactJsonRecord(row.after_memory_snapshot, 64)
      : null,
    lifecycleMetadata: compactJsonRecord(row.lifecycle_metadata, 64),
    reasonSummary: toNullableString(row.reason_summary),
    schemaVersion: toNullableNumber(row.schema_version),
    createdAt: toNullableString(row.created_at),
  };
}

function mapConfidenceHistoryEntry(row: Record<string, unknown>): OrganizationMemoryConfidenceHistoryEntry {
  return {
    id: toNullableString(row.id) ?? "",
    memoryId: toNullableString(row.memory_id) ?? "",
    confidenceBefore: toNullableNumber(row.confidence_before),
    confidenceAfter: toNullableNumber(row.confidence_after) ?? 0,
    confidenceDelta: toNullableNumber(row.confidence_delta),
    reasonType: toNullableString(row.reason_type) ?? "",
    reasonSummary: toNullableString(row.reason_summary),
    calculationVersion: toNullableNumber(row.calculation_version),
    calculationInputs: compactJsonRecord(row.calculation_inputs, 64),
    contributorSnapshot: compactJsonRecord(row.contributor_snapshot, 64),
    lifecycleHistoryId: toNullableString(row.lifecycle_history_id),
    synthesisHistoryId: toNullableString(row.synthesis_history_id),
    sourceSemanticPoolId: toNullableString(row.source_semantic_pool_id),
    sourceRevisionHash: toNullableString(row.source_revision_hash),
    synthesisQueueRowId: toNullableString(row.synthesis_queue_row_id),
    synthesisRunId: toNullableString(row.synthesis_run_id),
    isRecalculation: Boolean(row.is_recalculation),
    createdAt: toNullableString(row.created_at),
  };
}

function getMemoryRetirementState(memory: OrganizationMemorySnapshot): "active" | "superseded" | "retired" | "inactive" {
  if (memory.retiredAt || memory.retiredLifecycleHistoryId || memory.retirementBasisHash) {
    return "retired";
  }
  if (memory.supersededAt || memory.supersededByMemoryId) {
    return "superseded";
  }
  return memory.isActive ? "active" : "inactive";
}

function buildRetirementNoActionSummary(params: {
  reason: string;
  memory: OrganizationMemorySnapshot | null;
}) {
  const { reason, memory } = params;
  switch (reason) {
    case "not_low_confidence":
      return `This memory was not retired because confidence remains ${memory ? formatFixedNumber(memory.confidenceScore) : "above threshold"}.`;
    case "not_enough_contradiction":
      return "This memory was not retired because contradiction evidence has not yet met the deterministic retirement threshold.";
    case "replacement_candidate_exists":
      return "This memory was not retired because a stronger replacement candidate already exists in the same memory domain, so supersession is preferred over retirement.";
    case "recently_reinforced":
      return "This memory was not retired because it was reinforced after its latest contradiction, so the contradiction has not remained unresolved.";
    case "grace_period_not_elapsed":
      return "This memory was not retired because the contradiction grace period has not elapsed yet.";
    case "already_inactive":
      return "This memory was not retired because it is already inactive.";
    case "already_retired":
      return "This memory was not retired because an exact retirement state is already stored on the memory.";
    case "already_superseded":
      return "This memory was not retired because supersession has already been recorded and retirement would duplicate that state transition.";
    case "user_confirmed":
      return "This memory was not retired because user-confirmed memories are excluded from automatic retirement.";
    case "no_domain_signature":
      return "This memory was not retired because it does not yet have a deterministic memory domain signature.";
    case "missing_memory":
      return "This retirement evaluation completed without action because the memory could not be found.";
    default:
      return "This retirement evaluation completed without retiring the memory.";
  }
}

function formatFixedNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function buildDiffSummary(diffData: JsonRecord) {
  const rowLabel = toNullableString(diffData.rowLabel);
  const itemLabel = toNullableString(diffData.itemLabel);
  const columnHeader = toNullableString(diffData.columnHeader);
  const oldValue = diffData.oldValue;
  const newValue = diffData.newValue;
  const oldFormula = toNullableString(diffData.oldFormula);
  const newFormula = toNullableString(diffData.newFormula);

  const anchor = [rowLabel, itemLabel, columnHeader].filter(Boolean).join(" / ");
  if (oldValue !== null && oldValue !== undefined && newValue !== null && newValue !== undefined) {
    return `${anchor || "Value"}: ${String(oldValue)} -> ${String(newValue)}`;
  }
  if (oldFormula || newFormula) {
    return `${anchor || "Formula"}: ${oldFormula ?? "—"} -> ${newFormula ?? "—"}`;
  }

  return anchor || null;
}

async function getMemoryRowOrNull(memoryId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("id", memoryId as never)
    .eq("organization_id", organizationId as never)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? (data as OrganizationMemoryRow) : null;
}

async function getMemoryLinks(memoryId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_links" as never)
    .select("*")
    .eq("organization_memory_item_id", memoryId as never)
    .eq("organization_id", organizationId as never)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as OrganizationMemoryLinkRow[]) : [];
}

async function getOrganizationMemorySynthesisHistoryRows(params: {
  organizationId: string;
  memoryId?: string | null;
  semanticPoolId?: string | null;
  queueRowId?: string | null;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("organization_memory_synthesis_history" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never);

  if (params.memoryId) {
    query = query.eq("memory_id", params.memoryId as never);
  }
  if (params.semanticPoolId) {
    query = query.eq("source_semantic_pool_id", params.semanticPoolId as never);
  }
  if (params.queueRowId) {
    query = query.eq("synthesis_queue_row_id", params.queueRowId as never);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 50, 200)));

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data)
    ? data.map((row) => mapSynthesisHistoryEntry((row ?? {}) as Record<string, unknown>))
    : [];
}

async function getOrganizationMemoryLifecycleHistoryRows(params: {
  organizationId: string;
  memoryId?: string | null;
  semanticPoolId?: string | null;
  queueRowId?: string | null;
  synthesisHistoryId?: string | null;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("organization_memory_lifecycle_history" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never);

  if (params.memoryId) {
    query = query.eq("memory_id", params.memoryId as never);
  }
  if (params.semanticPoolId) {
    query = query.eq("source_semantic_pool_id", params.semanticPoolId as never);
  }
  if (params.queueRowId) {
    query = query.eq("synthesis_queue_row_id", params.queueRowId as never);
  }
  if (params.synthesisHistoryId) {
    query = query.eq("synthesis_history_id", params.synthesisHistoryId as never);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 50, 200)));

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data)
    ? data.map((row) => mapLifecycleHistoryEntry((row ?? {}) as Record<string, unknown>))
    : [];
}

async function getOrganizationMemoryConfidenceHistoryRows(params: {
  organizationId: string;
  memoryId?: string | null;
  semanticPoolId?: string | null;
  queueRowId?: string | null;
  lifecycleHistoryId?: string | null;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("organization_memory_confidence_history" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never);

  if (params.memoryId) {
    query = query.eq("memory_id", params.memoryId as never);
  }
  if (params.semanticPoolId) {
    query = query.eq("source_semantic_pool_id", params.semanticPoolId as never);
  }
  if (params.queueRowId) {
    query = query.eq("synthesis_queue_row_id", params.queueRowId as never);
  }
  if (params.lifecycleHistoryId) {
    query = query.eq("lifecycle_history_id", params.lifecycleHistoryId as never);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 50, 200)));

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data)
    ? data.map((row) => mapConfidenceHistoryEntry((row ?? {}) as Record<string, unknown>))
    : [];
}

async function getMemoryRowsByIds(organizationId: string, memoryIds: string[]) {
  if (memoryIds.length === 0) {
    return new Map<string, OrganizationMemorySnapshot>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .in("id", memoryIds as never);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    (Array.isArray(data) ? data : [])
      .map((row) => mapMemorySnapshot((row ?? {}) as Record<string, unknown>))
      .map((memory) => [memory.id, memory] as const),
  );
}

async function findRetirementReplacementCandidate(params: {
  organizationId: string;
  memoryId: string;
  memoryDomainSignature: string | null;
}) {
  if (!params.memoryDomainSignature) {
    return null;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_domain_signature", params.memoryDomainSignature as never)
    .eq("is_active", true as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (Array.isArray(data) ? data : [])
    .map((row) => mapMemorySnapshot((row ?? {}) as Record<string, unknown>))
    .filter((candidate) => candidate.id !== params.memoryId)
    .filter((candidate) => !candidate.retiredAt && !candidate.supersededAt && !candidate.supersededByMemoryId)
    .filter((candidate) => candidate.confidenceScore >= RETIREMENT_REPLACEMENT_CONFIDENCE_THRESHOLD)
    .filter((candidate) =>
      candidate.reinforcementCount >= RETIREMENT_REPLACEMENT_REINFORCEMENT_COUNT_THRESHOLD
      || candidate.reinforcedSupportingClassificationCount >= RETIREMENT_REPLACEMENT_SUPPORTING_CLASSIFICATION_THRESHOLD,
    )
    .sort((left, right) => {
      if (right.confidenceScore !== left.confidenceScore) {
        return right.confidenceScore - left.confidenceScore;
      }
      if (right.reinforcementCount !== left.reinforcementCount) {
        return right.reinforcementCount - left.reinforcementCount;
      }
      return right.reinforcedSupportingClassificationCount - left.reinforcedSupportingClassificationCount;
    });

  return rows[0] ?? null;
}

async function getOrganizationMemoryRetirementEvaluationRows(params: {
  organizationId: string;
  memoryId?: string | null;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("organization_memory_retirement_queue" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never);

  if (params.memoryId) {
    query = query.eq("memory_id", params.memoryId as never);
  }

  const { data, error } = await query
    .order("last_completed_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 50, 200)));

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  const memoryIds = Array.from(new Set(rows.map((row) => toNullableString(row.memory_id)).filter((value): value is string => Boolean(value))));
  const memoriesById = await getMemoryRowsByIds(params.organizationId, memoryIds);

  const candidateCache = new Map<string, Awaited<ReturnType<typeof findRetirementReplacementCandidate>>>();

  return Promise.all(rows.map(async (row) => {
    const memoryId = toNullableString(row.memory_id) ?? "";
    const memory = memoriesById.get(memoryId) ?? null;
    const currentMemoryState = memory ? getMemoryRetirementState(memory) : "inactive";
    const lastNoActionReason = toNullableString(row.last_no_action_reason);

    let replacementCandidate = null as OrganizationMemoryRetirementEvaluationEntry["replacementCandidate"];
    let replacementSearchExplanation: string | null = null;
    if (lastNoActionReason === "replacement_candidate_exists" && memory?.memoryDomainSignature) {
      const cacheKey = `${params.organizationId}:${memory.id}:${memory.memoryDomainSignature}`;
      if (!candidateCache.has(cacheKey)) {
        candidateCache.set(cacheKey, await findRetirementReplacementCandidate({
          organizationId: params.organizationId,
          memoryId: memory.id,
          memoryDomainSignature: memory.memoryDomainSignature,
        }));
      }
      const candidate = candidateCache.get(cacheKey) ?? null;
      if (candidate) {
        replacementCandidate = {
          id: candidate.id,
          title: candidate.title,
          confidenceScore: candidate.confidenceScore,
          reinforcementCount: candidate.reinforcementCount,
          reinforcedSupportingClassificationCount: candidate.reinforcedSupportingClassificationCount,
        };
        replacementSearchExplanation = `Replacement memory ${candidate.id} exists with confidence ${formatFixedNumber(candidate.confidenceScore)}, reinforcement count ${candidate.reinforcementCount}, and ${candidate.reinforcedSupportingClassificationCount} supporting classifications.`;
      } else {
        replacementSearchExplanation = "The last recorded no-action outcome indicates a replacement candidate existed at evaluation time, but no current eligible replacement candidate was found during inspection.";
      }
    } else if (memory?.retiredAt) {
      replacementSearchExplanation = "No eligible replacement memory was found, so retirement remained the authoritative outcome.";
    }

    const evaluationOutcome: OrganizationMemoryRetirementEvaluationEntry["evaluationOutcome"] =
      currentMemoryState === "retired"
        ? "retired"
        : lastNoActionReason
          ? "no_action"
          : ((toNullableString(row.queue_state) ?? "pending") as OrganizationMemoryRetirementEvaluationEntry["evaluationOutcome"]);

    return {
      id: toNullableString(row.id) ?? "",
      memoryId,
      queueState: toNullableString(row.queue_state) ?? "pending",
      evaluationOutcome,
      attemptCount: toNullableNumber(row.attempt_count) ?? 0,
      maxAttempts: toNullableNumber(row.max_attempts) ?? 0,
      priority: toNullableNumber(row.priority) ?? 0,
      availableAt: toNullableString(row.available_at),
      retryAfter: toNullableString(row.retry_after),
      claimedAt: toNullableString(row.claimed_at),
      claimExpiresAt: toNullableString(row.claim_expires_at),
      claimedBy: toNullableString(row.claimed_by),
      lastErrorCode: toNullableString(row.last_error_code),
      lastErrorMessage: toNullableString(row.last_error_message),
      lastNoActionReason,
      evaluationSummary: currentMemoryState === "retired"
        ? (memory?.retirementReasonSummary ?? "This memory was retired and the exact retirement state is stored directly on the memory item.")
        : lastNoActionReason
          ? buildRetirementNoActionSummary({ reason: lastNoActionReason, memory })
          : (toNullableString(row.last_error_message) ?? "Retirement evaluation is queued or in progress."),
      replacementSearchExplanation,
      replacementCandidate,
      currentMemoryState,
      retiredLifecycleHistoryId: memory?.retiredLifecycleHistoryId ?? null,
      retiredAt: memory?.retiredAt ?? null,
      retirementReasonSummary: memory?.retirementReasonSummary ?? null,
      lastAttemptAt: toNullableString(row.last_attempt_at),
      lastCompletedAt: toNullableString(row.last_completed_at),
      createdAt: toNullableString(row.created_at),
      updatedAt: toNullableString(row.updated_at),
    } satisfies OrganizationMemoryRetirementEvaluationEntry;
  }));
}

async function getSemanticPoolsById(organizationId: string, poolIds: string[]) {
  if (poolIds.length === 0) {
    return new Map<string, OrganizationMemorySemanticPoolSummary>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_memory_semantic_pools" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .in("id", poolIds as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return new Map(rows.map((row) => {
    const id = toNullableString(row.id) ?? "";
    return [id, {
      id,
      semanticSignature: toNullableString(row.semantic_signature) ?? "",
      domainLabel: toNullableString(row.domain_label),
      domainSummary: toNullableString(row.domain_summary),
      evidenceSummary: compactJsonRecord(row.evidence_summary),
      groupingRationale: toNullableString(row.grouping_rationale),
      variantSummary: toNullableString(row.variant_summary),
      maturityStatus: toNullableString(row.maturity_status) ?? "emerging",
      poolStatus: toNullableString(row.pool_status) ?? "active",
      includedCount: toNullableNumber(row.included_count) ?? 0,
      excludedCount: toNullableNumber(row.excluded_count) ?? 0,
      adjacentCount: toNullableNumber(row.adjacent_count) ?? 0,
      uncertainCount: toNullableNumber(row.uncertain_count) ?? 0,
      projectCount: toNullableNumber(row.project_count) ?? 0,
      workbookCount: toNullableNumber(row.workbook_count) ?? 0,
      worksheetCount: toNullableNumber(row.worksheet_count) ?? 0,
      averageConfidence: toNullableNumber(row.average_confidence),
      sourceRevisionHash: toNullableString(row.source_revision_hash) ?? "",
      createdByRunId: toNullableString(row.created_by_run_id),
      lastUpdatedByRunId: toNullableString(row.last_updated_by_run_id),
      createdAt: toNullableString(row.created_at),
      updatedAt: toNullableString(row.updated_at),
    } satisfies OrganizationMemorySemanticPoolSummary] as const;
  }));
}

async function getConstructionSemanticPoolsById(organizationId: string, poolIds: string[]) {
  if (poolIds.length === 0) {
    return new Map<string, OrganizationMemorySemanticPoolSummary>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("construction_memory_semantic_pools" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .in("id", poolIds as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return new Map(rows.map((row) => {
    const id = toNullableString(row.id) ?? "";
    return [id, {
      id,
      semanticSignature: toNullableString(row.semantic_signature) ?? "",
      domainLabel: toNullableString(row.title),
      domainSummary: toNullableString(row.summary),
      evidenceSummary: compactJsonRecord(row.evidence_summary, 48),
      groupingRationale: toNullableString(row.retrieval_guidance),
      variantSummary: toNullableString(row.semantic_type),
      maturityStatus: toNullableString(row.maturity_status) ?? "emerging",
      poolStatus: toNullableString(row.pool_status) ?? "active",
      includedCount: toNullableNumber(row.support_count) ?? 0,
      excludedCount: toNullableNumber(row.ignored_count) ?? 0,
      adjacentCount: 0,
      uncertainCount: 0,
      projectCount: toNullableNumber(row.project_count) ?? 0,
      workbookCount: 0,
      worksheetCount: 0,
      averageConfidence: toNullableNumber(row.average_confidence),
      sourceRevisionHash: toNullableString(row.source_revision_hash) ?? "",
      createdByRunId: toNullableString(row.created_by_run_id),
      lastUpdatedByRunId: toNullableString(row.last_updated_by_run_id),
      createdAt: toNullableString(row.created_at),
      updatedAt: toNullableString(row.updated_at),
    } satisfies OrganizationMemorySemanticPoolSummary] as const;
  }));
}

async function getConstructionEvidencePoolsById(organizationId: string, poolIds: string[]) {
  if (poolIds.length === 0) {
    return new Map<string, {
      id: string;
      poolKind: string;
      maturityStatus: string;
      eventCount: number;
      projectCount: number;
      supplierCount: number;
      averageConfidence: number | null;
      targetContext: JsonRecord;
      lastSeenAt: string | null;
    }>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("construction_memory_evidence_pools" as never)
    .select("id, pool_signature, pool_kind, maturity_status, event_count, project_count, supplier_count, average_confidence, target_context, last_seen_at")
    .eq("organization_id", organizationId as never)
    .in("id", poolIds as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return new Map(rows.map((row) => {
    const id = toNullableString(row.id) ?? "";
    return [id, {
      id,
      poolKind: toNullableString(row.pool_kind) ?? "",
      maturityStatus: toNullableString(row.maturity_status) ?? "emerging",
      eventCount: toNullableNumber(row.event_count) ?? 0,
      projectCount: toNullableNumber(row.project_count) ?? 0,
      supplierCount: toNullableNumber(row.supplier_count) ?? 0,
      averageConfidence: toNullableNumber(row.average_confidence),
      targetContext: compactJsonRecord(row.target_context, 24),
      lastSeenAt: toNullableString(row.last_seen_at),
    }] as const;
  }));
}

async function getConstructionEvidencePoolsBySignature(organizationId: string, poolSignatures: string[]) {
  if (poolSignatures.length === 0) {
    return new Map<string, {
      id: string;
      poolKind: string;
      maturityStatus: string;
      eventCount: number;
      projectCount: number;
      supplierCount: number;
      averageConfidence: number | null;
      targetContext: JsonRecord;
      lastSeenAt: string | null;
    }>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("construction_memory_evidence_pools" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .in("pool_signature", poolSignatures as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return new Map(rows.map((row) => {
    const signature = toNullableString(row.pool_signature) ?? "";
    return [signature, {
      id: toNullableString(row.id) ?? "",
      poolKind: toNullableString(row.pool_kind) ?? "",
      maturityStatus: toNullableString(row.maturity_status) ?? "emerging",
      eventCount: toNullableNumber(row.event_count) ?? 0,
      projectCount: toNullableNumber(row.project_count) ?? 0,
      supplierCount: toNullableNumber(row.supplier_count) ?? 0,
      averageConfidence: toNullableNumber(row.average_confidence),
      targetContext: compactJsonRecord(row.target_context, 32),
      lastSeenAt: toNullableString(row.last_seen_at),
    }] as const;
  }));
}

async function getEventsById(organizationId: string, eventIds: string[]) {
  if (eventIds.length === 0) {
    return new Map<string, Record<string, unknown>>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("intelligence_events" as never)
    .select("id, organization_id, event_type, occurred_at, project_id, opportunity_id, metadata, diff_data, source_request_id")
    .eq("organization_id", organizationId as never)
    .in("id", eventIds as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return new Map(rows.map((row) => [toNullableString(row.id) ?? "", row] as const));
}

async function getConstructionEventsById(organizationId: string, eventIds: string[]) {
  if (eventIds.length === 0) {
    return new Map<string, Record<string, unknown>>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("cost_construction_intelligence_events" as never)
    .select("id, organization_id, description, project_id, supplier_name_snapshot, quantity, unit, rate, amount, document_context, processed_at, created_at")
    .eq("organization_id", organizationId as never)
    .in("id", eventIds as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return new Map(rows.map((row) => [toNullableString(row.id) ?? "", row] as const));
}

async function getClassificationsById(organizationId: string, classificationIds: string[]) {
  if (classificationIds.length === 0) {
    return new Map<string, Record<string, unknown>>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_event_classifications" as never)
    .select(
      [
        "id",
        "organization_id",
        "source_event_id",
        "classification_status",
        "overall_confidence",
        "reasoning_summary",
        "semantic_fields",
        "interpretation_payload",
        "classified_at",
      ].join(", ")
    )
    .eq("organization_id", organizationId as never)
    .in("id", classificationIds as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return new Map(rows.map((row) => [toNullableString(row.id) ?? "", row] as const));
}

async function getMemoriesById(organizationId: string, memoryIds: string[]) {
  if (memoryIds.length === 0) {
    return new Map<string, OrganizationMemorySnapshot>();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .in("id", memoryIds as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as OrganizationMemoryRow[] : [];
  return new Map(rows.map((row) => {
    const snapshot = mapMemorySnapshot(row);
    return [snapshot.id, snapshot] as const;
  }));
}

function summarizeProvenance(links: OrganizationMemoryLinkRow[], resolved: {
  eventIds: Set<string>;
  constructionEventIds: Set<string>;
  classificationIds: Set<string>;
  semanticPoolIds: Set<string>;
  constructionSemanticPoolIds: Set<string>;
  constructionEvidencePoolIds: Set<string>;
  supersededMemoryIds: Set<string>;
}) {
  const rawEventLinks = links.filter((link) =>
    Boolean(toNullableString(link.source_event_id))
    || (
      toNullableString(link.source_entity_type) === "cost_construction_intelligence_event"
      && Boolean(toNullableString(link.source_entity_id))
    )
  );
  const classificationLinks = links.filter((link) =>
    toNullableString(link.source_entity_type) === "worksheet_event_classification"
      && Boolean(toNullableString(link.source_entity_id))
  );
  const semanticPoolLinks = links.filter((link) =>
    (
      toNullableString(link.source_entity_type) === "worksheet_memory_semantic_pool"
      || toNullableString(link.source_entity_type) === "construction_memory_semantic_pool"
    )
      && Boolean(toNullableString(link.source_entity_id))
  );
  const evidencePoolLinks = links.filter((link) =>
    toNullableString(link.source_entity_type) === "construction_memory_evidence_pool"
      && Boolean(toNullableString(link.source_entity_id))
  );
  const supersessionLinks = links.filter((link) =>
    toNullableString(link.source_entity_type) === "organization_memory_item"
      && toNullableString(link.link_type) === "supersession"
      && Boolean(toNullableString(link.source_entity_id))
  );

  const missingRawEvents = rawEventLinks
    .map((link) =>
      toNullableString(link.source_event_id)
      ?? (
        toNullableString(link.source_entity_type) === "cost_construction_intelligence_event"
          ? toNullableString(link.source_entity_id)
          : null
      )
    )
    .filter((id): id is string => Boolean(id))
    .filter((id) => !resolved.eventIds.has(id) && !resolved.constructionEventIds.has(id));
  const missingClassifications = classificationLinks
    .map((link) => toNullableString(link.source_entity_id))
    .filter((id): id is string => Boolean(id))
    .filter((id) => !resolved.classificationIds.has(id));
  const missingSemanticPools = semanticPoolLinks
    .map((link) => toNullableString(link.source_entity_id))
    .filter((id): id is string => Boolean(id))
    .filter((id) => !resolved.semanticPoolIds.has(id) && !resolved.constructionSemanticPoolIds.has(id));
  const missingEvidencePools = evidencePoolLinks
    .map((link) => toNullableString(link.source_entity_id))
    .filter((id): id is string => Boolean(id))
    .filter((id) => !resolved.constructionEvidencePoolIds.has(id));
  const missingSupersededMemories = supersessionLinks
    .map((link) => toNullableString(link.source_entity_id))
    .filter((id): id is string => Boolean(id))
    .filter((id) => !resolved.supersededMemoryIds.has(id));

  return {
    summary: {
      rawEventCount: rawEventLinks.length,
      classificationCount: classificationLinks.length,
      semanticPoolCount: semanticPoolLinks.length,
      evidencePoolCount: evidencePoolLinks.length,
      supersessionCount: supersessionLinks.length,
      missingRawEvents: missingRawEvents.length,
      missingClassifications: missingClassifications.length,
      missingSemanticPools: missingSemanticPools.length,
      missingEvidencePools: missingEvidencePools.length,
      missingSupersededMemories: missingSupersededMemories.length,
    } satisfies OrganizationMemoryProvenanceSummary,
    completeness: {
      isComplete: missingRawEvents.length === 0
        && missingClassifications.length === 0
        && missingSemanticPools.length === 0
        && missingEvidencePools.length === 0
        && missingSupersededMemories.length === 0,
      missingRawEvents,
      missingClassifications,
      missingSemanticPools,
      missingEvidencePools,
      missingSupersededMemories,
    },
  };
}

async function buildSynthesisInfo(params: {
  organizationId: string;
  memory: OrganizationMemorySnapshot;
  semanticPoolId: string | null;
  semanticPoolType?: string | null;
}) {
  const exactQueueId = toNullableString(params.memory.evidenceSummary.synthesisQueueRowId);
  const exactRunId = toNullableString(params.memory.evidenceSummary.synthesisRunId);
  const sourceType =
    params.semanticPoolType
    ?? toNullableString(params.memory.evidenceSummary.sourceType)
    ?? "worksheet_memory_semantic_pool";
  const queueTable = sourceType === "construction_memory_semantic_pool"
    ? "construction_memory_synthesis_queue"
    : "worksheet_memory_synthesis_queue";
  const runTable = sourceType === "construction_memory_semantic_pool"
    ? "construction_memory_synthesis_runs"
    : "worksheet_memory_synthesis_runs";
  const admin = createAdminSupabaseClient();

  const exactQueueRecords = exactQueueId
    ? await (async () => {
        const { data, error } = await admin
          .from(queueTable as never)
          .select("*")
          .eq("organization_id", params.organizationId as never)
          .eq("id", exactQueueId as never)
          .limit(1);

        if (error) {
          throw new Error(error.message);
        }

        return Array.isArray(data)
          ? data.map((row) => mapQueueRecord((row ?? {}) as Record<string, unknown>))
          : [];
      })()
    : [];
  const exactRunRecords = exactRunId
    ? await (async () => {
        const { data, error } = await admin
          .from(runTable as never)
          .select("*")
          .eq("id", exactRunId as never)
          .limit(1);

        if (error) {
          throw new Error(error.message);
        }

        return Array.isArray(data)
          ? data.map((row) => compactJsonRecord(row, 32))
          : [];
      })()
    : [];

  if (!params.semanticPoolId || !params.memory.sourceRevisionHash) {
    return {
      exactQueueRecords,
      exactRunRecords,
      inferredRunRecords: [] as Array<Record<string, Json | null>>,
    };
  }

  const { data: queueData, error: queueError } = await admin
    .from(queueTable as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq(sourceType === "construction_memory_semantic_pool" ? "semantic_pool_id" : "semantic_pool_id", params.semanticPoolId as never)
    .eq("source_revision_hash", params.memory.sourceRevisionHash as never)
    .order("created_at", { ascending: false });

  if (queueError) {
    throw new Error(queueError.message);
  }

  return {
    exactQueueRecords: exactQueueRecords.length > 0
      ? exactQueueRecords
      : Array.isArray(queueData)
        ? queueData.map((row) => mapQueueRecord((row ?? {}) as Record<string, unknown>))
        : [],
    exactRunRecords,
    inferredRunRecords: [] as Array<Record<string, Json | null>>,
  };
}

async function buildSupersededByChain(organizationId: string, startId: string | null) {
  const chain: Array<Pick<OrganizationMemorySnapshot, "id" | "title" | "memoryCategory" | "memoryType" | "isActive" | "updatedAt">> = [];
  let nextId = startId;
  let depth = 0;

  while (nextId && depth < MAX_CHAIN_DEPTH) {
    const row = await getMemoryRowOrNull(nextId, organizationId);
    if (!row) {
      break;
    }

    const snapshot = mapMemorySnapshot(row);
    chain.push({
      id: snapshot.id,
      title: snapshot.title,
      memoryCategory: snapshot.memoryCategory,
      memoryType: snapshot.memoryType,
      isActive: snapshot.isActive,
      updatedAt: snapshot.updatedAt,
    });
    nextId = snapshot.supersededByMemoryId;
    depth += 1;
  }

  return chain;
}

function buildFieldNotes(memory: OrganizationMemorySnapshot, synthesisInfo: {
  exactQueueRecords: OrganizationMemoryQueueRecord[];
  exactRunRecords: Array<Record<string, Json | null>>;
}, synthesisHistoryCount = 0, lifecycleHistoryCount = 0, confidenceHistoryCount = 0) {
  const notes: OrganizationMemoryFieldNote[] = [];
  const hasExactQueueLink = Boolean(toNullableString(memory.evidenceSummary.synthesisQueueRowId));
  const hasExactRunLink = Boolean(toNullableString(memory.evidenceSummary.synthesisRunId));

  notes.push({
    field: "memory",
    authority: "authoritative",
    note: "Memory snapshot fields are read directly from organization_memory_items.",
  });
  notes.push({
    field: "provenance",
    authority: "authoritative",
    note: "Provenance links are read directly from organization_memory_links and revalidated against organization-scoped source tables.",
  });

  if (memory.sourceRevisionHash) {
    notes.push({
      field: "sourceRevisionHash",
      authority: "authoritative",
      note: "The source revision hash is stored directly on the memory item.",
    });
  }

  if (memory.memoryDomainSignature) {
    notes.push({
      field: "memoryDomainSignature",
      authority: "authoritative",
      note: "The memory domain signature is stored directly on the memory item for future deterministic supersession candidate matching.",
    });
  }

  if (memory.lastReinforcedAt || memory.lastReinforcedLifecycleHistoryId || memory.lastReinforcedSynthesisHistoryId) {
    notes.push({
      field: "reinforcement",
      authority: "authoritative",
      note: "Reinforcement counters and exact reinforcement linkage fields are read directly from organization_memory_items.",
    });
  }

  if (
    memory.lastContradictedAt
    || memory.lastContradictedLifecycleHistoryId
    || memory.lastContradictedSynthesisHistoryId
    || memory.lastContradictedSourceRevisionHash
    || memory.contradictionBasisHash
    || memory.contradictionCount > 0
    || memory.contradictedSupportingClassificationCount > 0
    || memory.contradictionStrengthScore !== null
  ) {
    notes.push({
      field: "contradiction",
      authority: "authoritative",
      note: "Contradiction fields are read directly from organization_memory_items and are populated only by immutable memory_contradicted lifecycle events.",
    });
  }

  if (
    memory.retiredAt
    || memory.retiredLifecycleHistoryId
    || memory.retiredBySynthesisHistoryId
    || memory.retirementBasisHash
    || memory.retirementReasonSummary
  ) {
    notes.push({
      field: "retirement",
      authority: "authoritative",
      note: "Exact retirement fields are read directly from organization_memory_items and linked to immutable lifecycle and synthesis history when present.",
    });
  }

  if (memory.lastConfidenceHistoryId || memory.lastConfidenceCalculatedAt || memory.baseConfidenceScore !== null) {
    notes.push({
      field: "confidence",
      authority: "authoritative",
      note: "Current confidence and confidence metadata are read directly from organization_memory_items.",
    });
  }

  if (memory.supersededAt || memory.supersededLifecycleHistoryId || memory.supersededBySynthesisHistoryId) {
    notes.push({
      field: "supersession",
      authority: "authoritative",
      note: "Exact supersession fields are read directly from organization_memory_items and linked to immutable lifecycle and synthesis history.",
    });
  } else if (memory.supersededByMemoryId) {
    notes.push({
      field: "supersession",
      authority: "inferred",
      note: "This memory only has legacy superseded_by_memory_id linkage, so supersession timing remains inferred until exact supersession fields are populated.",
    });
  }

  notes.push({
    field: "synthesisRuns",
    authority: hasExactQueueLink || hasExactRunLink ? "authoritative" : "inferred",
    note: synthesisInfo.exactRunRecords.length > 0
      ? "Exact synthesis queue and run linkage is persisted on the memory evidence summary."
      : hasExactQueueLink
        ? "Exact synthesis queue linkage is persisted on the memory evidence summary, but exact worksheet_memory_synthesis_runs linkage is not stored for older writes."
        : "Memory v1 persists matching synthesis queue records by semantic pool and revision hash when exact queue linkage was not stored.",
  });

  if (synthesisHistoryCount > 0) {
    notes.push({
      field: "synthesisHistory",
      authority: "authoritative",
      note: "Immutable Stage 8 synthesis history is read directly from organization_memory_synthesis_history.",
    });
  }

  if (lifecycleHistoryCount > 0) {
    notes.push({
      field: "lifecycleHistory",
      authority: "authoritative",
      note: "Immutable memory lifecycle history is read directly from organization_memory_lifecycle_history.",
    });
  }

  if (confidenceHistoryCount > 0) {
    notes.push({
      field: "confidenceHistory",
      authority: "authoritative",
      note: "Immutable confidence history is read directly from organization_memory_confidence_history.",
    });
  }

  return notes;
}

export async function runOrganizationMemoryDerivation(
  input: RunOrganizationMemoryDerivationInput = {}
) {
  await requirePlatformAdmin("admin");

  const supabase = createAdminSupabaseClient();
  const payload = {
    organizationId: input.organizationId ?? null,
    patternLimit: input.patternLimit ?? 500,
  };

  const { data, error } = await supabase.rpc("run_organization_memory_derivation" as never, {
    p_input: payload,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const includeLegacyWorksheetMemoryDerivation = input.includeLegacyWorksheetMemoryDerivation === true;
  const worksheetMemory = includeLegacyWorksheetMemoryDerivation
    ? await runWorksheetMemoryDerivation({
        organizationId: input.organizationId ?? null,
        limit: input.patternLimit ?? 500,
      })
    : null;

  return {
    ...(data && typeof data === "object" ? data : {}),
    legacyWorksheetMemoryDerivationEnabled: includeLegacyWorksheetMemoryDerivation,
    worksheetSemanticMemories: worksheetMemory,
  };
}

export async function getOrganizationMemoryContext(input: GetOrganizationMemoryContextInput) {
  await requirePlatformAdmin("viewer");

  const supabase = createAdminSupabaseClient();
  const payload = {
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    opportunityId: input.opportunityId ?? null,
    memoryCategories: input.memoryCategories ?? [],
    memoryTypes: input.memoryTypes ?? [],
    limit: input.limit ?? 50,
  };

  const { data, error } = await supabase.rpc("get_organization_memory_context" as never, {
    p_input: payload,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listOrganizationMemories(
  input: ListOrganizationMemoriesInput,
): Promise<ListOrganizationMemoriesOutput> {
  const organizationId = ensureOrganizationId(input.organizationId);
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.max(1, Math.min(Math.floor(input.pageSize ?? DEFAULT_LIST_PAGE_SIZE), MAX_LIST_PAGE_SIZE));
  const query = toNullableString(input.query);
  const memoryCategory = toNullableString(input.memoryCategory);
  const memoryType = toNullableString(input.memoryType);
  const isActive = typeof input.isActive === "boolean" ? input.isActive : null;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const admin = createAdminSupabaseClient();

  let countQuery = admin
    .from("organization_memory_items" as never)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId as never);

  let dataQuery = admin
    .from("organization_memory_items" as never)
    .select(
      [
        "id",
        "organization_id",
        "memory_category",
        "memory_type",
        "memory_key",
        "title",
        "summary",
        "confidence_score",
        "is_active",
        "memory_signature",
        "source_revision_hash",
        "superseded_by_memory_id",
        "created_at",
        "updated_at",
      ].join(", ")
    )
    .eq("organization_id", organizationId as never)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (memoryCategory) {
    countQuery = countQuery.eq("memory_category", memoryCategory as never);
    dataQuery = dataQuery.eq("memory_category", memoryCategory as never);
  }
  if (memoryType) {
    countQuery = countQuery.eq("memory_type", memoryType as never);
    dataQuery = dataQuery.eq("memory_type", memoryType as never);
  }
  if (isActive !== null) {
    countQuery = countQuery.eq("is_active", isActive as never);
    dataQuery = dataQuery.eq("is_active", isActive as never);
  }
  if (query) {
    countQuery = countQuery.or(`title.ilike.%${query}%,summary.ilike.%${query}%`);
    dataQuery = dataQuery.or(`title.ilike.%${query}%,summary.ilike.%${query}%`);
  }

  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (countError) {
    throw new Error(countError.message);
  }
  if (dataError) {
    throw new Error(dataError.message);
  }

  const rows = Array.isArray(data) ? data as OrganizationMemoryRow[] : [];
  const memoryIds = rows
    .map((row) => toNullableString(row.id))
    .filter((value): value is string => Boolean(value));

  const { data: linksData, error: linksError } = memoryIds.length > 0
    ? await admin
        .from("organization_memory_links" as never)
        .select("organization_memory_item_id, link_type, source_event_id, source_entity_type, source_entity_id")
        .eq("organization_id", organizationId as never)
        .in("organization_memory_item_id", memoryIds as never)
    : { data: [], error: null };

  if (linksError) {
    throw new Error(linksError.message);
  }

  const links = Array.isArray(linksData) ? linksData as Array<Record<string, unknown>> : [];
  const countsByMemoryId = new Map<string, OrganizationMemoryListItem["provenanceCounts"]>();

  for (const link of links) {
    const memoryId = toNullableString(link.organization_memory_item_id);
    if (!memoryId) {
      continue;
    }

    const current = countsByMemoryId.get(memoryId) ?? {
      totalLinks: 0,
      rawEventLinks: 0,
      classificationLinks: 0,
      semanticPoolLinks: 0,
      supersessionLinks: 0,
    };

    current.totalLinks += 1;
    if (
      toNullableString(link.source_event_id)
      || toNullableString(link.source_entity_type) === "cost_construction_intelligence_event"
    ) {
      current.rawEventLinks += 1;
    }
    const sourceEntityType = toNullableString(link.source_entity_type);
    if (sourceEntityType === "worksheet_event_classification") {
      current.classificationLinks += 1;
    }
    if (sourceEntityType === "worksheet_memory_semantic_pool" || sourceEntityType === "construction_memory_semantic_pool") {
      current.semanticPoolLinks += 1;
    }
    if (sourceEntityType === "organization_memory_item" && toNullableString(link.link_type) === "supersession") {
      current.supersessionLinks += 1;
    }

    countsByMemoryId.set(memoryId, current);
  }

  const items = rows.map((row) => ({
    id: toNullableString(row.id) ?? "",
    memoryCategory: toNullableString(row.memory_category) ?? "",
    memoryType: toNullableString(row.memory_type) ?? "",
    title: toNullableString(row.title) ?? "",
    summary: toNullableString(row.summary) ?? "",
    confidenceScore: toNullableNumber(row.confidence_score) ?? 0,
    isActive: Boolean(row.is_active),
    memorySignature: toNullableString(row.memory_signature),
    sourceRevisionHash: toNullableString(row.source_revision_hash),
    supersededByMemoryId: toNullableString(row.superseded_by_memory_id),
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
    provenanceCounts: countsByMemoryId.get(toNullableString(row.id) ?? "") ?? {
      totalLinks: 0,
      rawEventLinks: 0,
      classificationLinks: 0,
      semanticPoolLinks: 0,
      supersessionLinks: 0,
    },
  }));

  const totalCount = count ?? 0;
  return {
    organizationId,
    page,
    pageSize,
    totalCount,
    totalPages: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1,
    query,
    memoryCategory,
    memoryType,
    isActive,
    items,
  };
}

export async function getOrganizationMemoryProvenance(
  organizationIdInput: string,
  memoryIdInput: string,
): Promise<OrganizationMemoryProvenance | null> {
  const organizationId = ensureOrganizationId(organizationIdInput);
  const memoryId = ensureMemoryId(memoryIdInput);
  const memoryRow = await getMemoryRowOrNull(memoryId, organizationId);
  if (!memoryRow) {
    return null;
  }

  const links = await getMemoryLinks(memoryId, organizationId);
  const memorySourcePoolType = toNullableString(memoryRow.source_memory_pool_type);
  const memorySourcePoolId = toNullableString(memoryRow.source_memory_pool_id);
  const memoryEvidenceSummary = isRecord(memoryRow.evidence_summary)
    ? memoryRow.evidence_summary as Record<string, Json | null>
    : {};
  const eventIds = Array.from(new Set(
    links.map((link) => toNullableString(link.source_event_id)).filter((value): value is string => Boolean(value)),
  ));
  const constructionEventIds = Array.from(new Set(
    links
      .filter((link) => toNullableString(link.source_entity_type) === "cost_construction_intelligence_event")
      .map((link) => toNullableString(link.source_entity_id))
      .filter((value): value is string => Boolean(value)),
  ));
  const classificationIds = Array.from(new Set(
    links
      .filter((link) => toNullableString(link.source_entity_type) === "worksheet_event_classification")
      .map((link) => toNullableString(link.source_entity_id))
      .filter((value): value is string => Boolean(value)),
  ));
  const semanticPoolIds = Array.from(new Set(
    links
      .filter((link) => toNullableString(link.source_entity_type) === "worksheet_memory_semantic_pool")
      .map((link) => toNullableString(link.source_entity_id))
      .filter((value): value is string => Boolean(value)),
  ));
  const constructionSemanticPoolIds = Array.from(new Set(
    links
      .filter((link) => toNullableString(link.source_entity_type) === "construction_memory_semantic_pool")
      .map((link) => toNullableString(link.source_entity_id))
      .filter((value): value is string => Boolean(value)),
  ));
  const constructionEvidencePoolIds = Array.from(new Set(
    links
      .filter((link) => toNullableString(link.source_entity_type) === "construction_memory_evidence_pool")
      .map((link) => toNullableString(link.source_entity_id))
      .filter((value): value is string => Boolean(value)),
  ));
  const supersededMemoryIds = Array.from(new Set(
    links
      .filter((link) => toNullableString(link.source_entity_type) === "organization_memory_item")
      .map((link) => toNullableString(link.source_entity_id))
      .filter((value): value is string => Boolean(value)),
  ));

  const fallbackConstructionSemanticPoolIds = Array.from(new Set([
    ...constructionSemanticPoolIds,
    ...(memorySourcePoolType === "construction_memory_semantic_pool" && memorySourcePoolId ? [memorySourcePoolId] : []),
    ...(typeof memoryEvidenceSummary.semanticPoolId === "string" ? [memoryEvidenceSummary.semanticPoolId] : []),
  ]));

  const [eventsById, constructionEventsById, classificationsById, semanticPoolsById, constructionSemanticPoolsById, constructionEvidencePoolsById, memoriesById] = await Promise.all([
    getEventsById(organizationId, eventIds),
    getConstructionEventsById(organizationId, constructionEventIds),
    getClassificationsById(organizationId, classificationIds),
    getSemanticPoolsById(organizationId, semanticPoolIds),
    getConstructionSemanticPoolsById(organizationId, fallbackConstructionSemanticPoolIds),
    getConstructionEvidencePoolsById(organizationId, constructionEvidencePoolIds),
    getMemoriesById(organizationId, supersededMemoryIds),
  ]);

  const syntheticLinks: Array<Record<string, unknown>> = [];
  const hasConstructionSemanticLink = links.some((link) => toNullableString(link.source_entity_type) === "construction_memory_semantic_pool");
  if (!hasConstructionSemanticLink && memorySourcePoolType === "construction_memory_semantic_pool" && memorySourcePoolId) {
    syntheticLinks.push({
      id: `derived-semantic:${memoryId}:${memorySourcePoolId}`,
      organization_memory_item_id: memoryId,
      organization_id: organizationId,
      link_type: "seed",
      source_entity_type: "construction_memory_semantic_pool",
      source_entity_id: memorySourcePoolId,
      source_event_id: null,
      note: "Derived semantic pool provenance from memory source pointer.",
      created_at: toNullableString(memoryRow.updated_at) ?? toNullableString(memoryRow.created_at) ?? new Date(0).toISOString(),
    });
  }

  const allConstructionSemanticPoolIds = Array.from(new Set([
    ...fallbackConstructionSemanticPoolIds,
    ...syntheticLinks
      .filter((link) => toNullableString(link.source_entity_type) === "construction_memory_semantic_pool")
      .map((link) => toNullableString(link.source_entity_id))
      .filter((value): value is string => Boolean(value)),
  ]));

  const fallbackEvidencePoolIds = Array.from(new Set([
    ...constructionEvidencePoolIds,
    ...allConstructionSemanticPoolIds.flatMap((poolId) => {
      const semanticPool = constructionSemanticPoolsById.get(poolId);
      const evidenceSummary = semanticPool?.evidenceSummary;
      return Array.isArray(evidenceSummary?.evidencePoolIds)
        ? evidenceSummary.evidencePoolIds.flatMap((entry) => typeof entry === "string" ? [entry] : [])
        : [];
    }),
  ]));
  const fallbackEvidencePoolUuidIds = fallbackEvidencePoolIds.filter((value) => isUuid(value));
  const fallbackEvidencePoolSignatures = fallbackEvidencePoolIds.filter((value) => !isUuid(value));

  const fallbackRawEventIds = Array.from(new Set([
    ...constructionEventIds,
    ...allConstructionSemanticPoolIds.flatMap((poolId) => {
      const semanticPool = constructionSemanticPoolsById.get(poolId);
      const evidenceSummary = semanticPool?.evidenceSummary;
      return Array.isArray(evidenceSummary?.supportingEventIds)
        ? evidenceSummary.supportingEventIds.flatMap((entry) => typeof entry === "string" ? [entry] : [])
        : [];
    }),
    ...(Array.isArray(memoryEvidenceSummary.supportingEvidenceEventIds)
      ? memoryEvidenceSummary.supportingEvidenceEventIds.flatMap((entry) => typeof entry === "string" ? [entry] : [])
      : []),
  ]));

  const missingEvidenceIds = fallbackEvidencePoolUuidIds.filter((poolId) => !constructionEvidencePoolsById.has(poolId));
  const missingRawEventIds = fallbackRawEventIds.filter((eventId) => !constructionEventsById.has(eventId));
  const missingEvidenceSignatures = fallbackEvidencePoolSignatures;
  const [fallbackEvidencePoolsById, fallbackEvidencePoolsBySignature, fallbackConstructionEventsById] = await Promise.all([
    missingEvidenceIds.length > 0
      ? getConstructionEvidencePoolsById(organizationId, missingEvidenceIds)
      : Promise.resolve(new Map()),
    missingEvidenceSignatures.length > 0
      ? getConstructionEvidencePoolsBySignature(organizationId, missingEvidenceSignatures)
      : Promise.resolve(new Map()),
    missingRawEventIds.length > 0
      ? getConstructionEventsById(organizationId, missingRawEventIds)
      : Promise.resolve(new Map()),
  ]);
  for (const [id, value] of fallbackEvidencePoolsById.entries()) {
    constructionEvidencePoolsById.set(id, value);
  }
  for (const value of fallbackEvidencePoolsBySignature.values()) {
    constructionEvidencePoolsById.set(value.id, value);
  }
  for (const [id, value] of fallbackConstructionEventsById.entries()) {
    constructionEventsById.set(id, value);
  }

  const hasConstructionEvidenceLink = links.some((link) => toNullableString(link.source_entity_type) === "construction_memory_evidence_pool");
  if (!hasConstructionEvidenceLink) {
    for (const evidencePoolId of fallbackEvidencePoolIds) {
      const resolvedEvidencePool =
        constructionEvidencePoolsById.get(evidencePoolId)
        ?? fallbackEvidencePoolsBySignature.get(evidencePoolId)
        ?? null;
      syntheticLinks.push({
        id: `derived-evidence:${memoryId}:${resolvedEvidencePool?.id ?? evidencePoolId}`,
        organization_memory_item_id: memoryId,
        organization_id: organizationId,
        link_type: "supporting",
        source_entity_type: "construction_memory_evidence_pool",
        source_entity_id: resolvedEvidencePool?.id ?? evidencePoolId,
        source_event_id: null,
        note: "Derived evidence pool provenance from linked semantic pool evidence summary.",
        created_at: toNullableString(memoryRow.updated_at) ?? toNullableString(memoryRow.created_at) ?? new Date(0).toISOString(),
      });
    }
  }

  const hasConstructionRawEventLink = links.some((link) =>
    Boolean(toNullableString(link.source_event_id))
    || toNullableString(link.source_entity_type) === "cost_construction_intelligence_event",
  );
  if (!hasConstructionRawEventLink) {
    for (const sourceEventId of fallbackRawEventIds) {
      syntheticLinks.push({
        id: `derived-event:${memoryId}:${sourceEventId}`,
        organization_memory_item_id: memoryId,
        organization_id: organizationId,
        link_type: "supporting",
        source_entity_type: "cost_construction_intelligence_event",
        source_entity_id: sourceEventId,
        source_event_id: sourceEventId,
        note: "Derived raw event provenance from construction semantic evidence summary.",
        created_at: toNullableString(memoryRow.updated_at) ?? toNullableString(memoryRow.created_at) ?? new Date(0).toISOString(),
      });
    }
  }

  const effectiveLinks = [...links, ...syntheticLinks];

  const { summary, completeness } = summarizeProvenance(effectiveLinks, {
    eventIds: new Set(eventsById.keys()),
    constructionEventIds: new Set(constructionEventsById.keys()),
    classificationIds: new Set(classificationsById.keys()),
    semanticPoolIds: new Set(semanticPoolsById.keys()),
    constructionSemanticPoolIds: new Set(constructionSemanticPoolsById.keys()),
    constructionEvidencePoolIds: new Set(constructionEvidencePoolsById.keys()),
    supersededMemoryIds: new Set(memoriesById.keys()),
  });

  return {
    organizationId,
    memoryId,
    summary,
    completeness,
    semanticPoolLinks: effectiveLinks
      .filter((link) => {
        const entityType = toNullableString(link.source_entity_type);
        return entityType === "worksheet_memory_semantic_pool" || entityType === "construction_memory_semantic_pool";
      })
      .map((link) => {
        const semanticPoolId = toNullableString(link.source_entity_id) ?? "";
        const semanticPoolType = toNullableString(link.source_entity_type);
        return {
          linkId: toNullableString(link.id) ?? "",
          linkType: toNullableString(link.link_type) ?? "seed",
          semanticPoolId,
          note: toNullableString(link.note),
          createdAt: toNullableString(link.created_at),
          semanticPool:
            semanticPoolType === "construction_memory_semantic_pool"
              ? constructionSemanticPoolsById.get(semanticPoolId) ?? null
              : semanticPoolsById.get(semanticPoolId) ?? null,
          missing:
            semanticPoolType === "construction_memory_semantic_pool"
              ? !constructionSemanticPoolsById.has(semanticPoolId)
              : !semanticPoolsById.has(semanticPoolId),
        } satisfies OrganizationMemorySemanticPoolLink;
      }),
    evidencePoolLinks: effectiveLinks
      .filter((link) => toNullableString(link.source_entity_type) === "construction_memory_evidence_pool")
      .map((link) => {
        const evidencePoolId = toNullableString(link.source_entity_id) ?? "";
        const evidencePool = constructionEvidencePoolsById.get(evidencePoolId) ?? null;
        return {
          linkId: toNullableString(link.id) ?? "",
          linkType: toNullableString(link.link_type) ?? "supporting",
          evidencePoolId,
          note: toNullableString(link.note),
          createdAt: toNullableString(link.created_at),
          evidencePool,
          missing: !evidencePool,
        } satisfies OrganizationMemoryEvidencePoolLink;
      }),
    rawEventLinks: effectiveLinks
      .filter((link) =>
        Boolean(toNullableString(link.source_event_id))
        || toNullableString(link.source_entity_type) === "cost_construction_intelligence_event"
      )
      .map((link) => {
        const sourceEventId = toNullableString(link.source_event_id)
          ?? (
            toNullableString(link.source_entity_type) === "cost_construction_intelligence_event"
              ? toNullableString(link.source_entity_id)
              : null
          )
          ?? "";
        const event = eventsById.get(sourceEventId);
        const constructionEvent = constructionEventsById.get(sourceEventId);
        const metadata = compactJsonRecord(event?.metadata, 16);
        return {
          linkId: toNullableString(link.id) ?? "",
          linkType: toNullableString(link.link_type) ?? "supporting",
          sourceEventId,
          note: toNullableString(link.note),
          createdAt: toNullableString(link.created_at),
          event: event
            ? {
                id: sourceEventId,
                eventType: toNullableString(event.event_type),
                occurredAt: toNullableString(event.occurred_at),
                projectId: toNullableString(event.project_id),
                opportunityId: toNullableString(event.opportunity_id),
                workbookId: toNullableString(metadata.workbookId),
                sheetId: toNullableString(metadata.sheetId),
                sheetName: toNullableString(metadata.sheetName),
                worksheetName: toNullableString(metadata.worksheetName),
                sourceRequestId: toNullableString(event.source_request_id),
                diffData: compactJsonRecord(event.diff_data, 24),
              }
            : constructionEvent
              ? {
                  id: sourceEventId,
                  eventType: "cost_construction_intelligence_event",
                  occurredAt: toNullableString(constructionEvent.processed_at) ?? toNullableString(constructionEvent.created_at),
                  projectId: toNullableString(constructionEvent.project_id),
                  opportunityId: null,
                  workbookId: null,
                  sheetId: null,
                  sheetName: null,
                  worksheetName: toNullableString(constructionEvent.supplier_name_snapshot),
                  sourceRequestId: null,
                  diffData: compactJsonRecord({
                    description: constructionEvent.description,
                    quantity: constructionEvent.quantity,
                    unit: constructionEvent.unit,
                    rate: constructionEvent.rate,
                    amount: constructionEvent.amount,
                    documentContext: constructionEvent.document_context,
                  }, 24),
                }
            : null,
          missing: !event && !constructionEvent,
        } satisfies OrganizationMemoryRawEventLink;
      }),
    classificationLinks: effectiveLinks
      .filter((link) => toNullableString(link.source_entity_type) === "worksheet_event_classification")
      .map((link) => {
        const classificationRecordId = toNullableString(link.source_entity_id) ?? "";
        const classification = classificationsById.get(classificationRecordId);
        return {
          linkId: toNullableString(link.id) ?? "",
          linkType: toNullableString(link.link_type) ?? "supporting",
          classificationRecordId,
          note: toNullableString(link.note),
          createdAt: toNullableString(link.created_at),
          classification: classification
            ? {
                id: classificationRecordId,
                sourceEventId: toNullableString(classification.source_event_id) ?? "",
                classificationStatus: toNullableString(classification.classification_status),
                overallConfidence: toNullableNumber(classification.overall_confidence),
                reasoningSummary: toNullableString(classification.reasoning_summary),
                semanticFields: compactJsonRecord(classification.semantic_fields, 24),
                interpretationPayload: compactJsonRecord(classification.interpretation_payload, 24),
                classifiedAt: toNullableString(classification.classified_at),
              }
            : null,
          missing: !classification,
        } satisfies OrganizationMemoryClassificationLink;
      }),
    supersessionLinks: effectiveLinks
      .filter((link) =>
        toNullableString(link.source_entity_type) === "organization_memory_item"
          && toNullableString(link.link_type) === "supersession"
      )
      .map((link) => {
        const relatedMemoryId = toNullableString(link.source_entity_id) ?? "";
        const relatedMemory = memoriesById.get(relatedMemoryId);
        return {
          linkId: toNullableString(link.id) ?? "",
          linkType: toNullableString(link.link_type) ?? "supersession",
          relatedMemoryId,
          note: toNullableString(link.note),
          confidenceDelta: toNullableNumber(link.confidence_delta),
          createdAt: toNullableString(link.created_at),
          relatedMemory: relatedMemory
            ? {
                id: relatedMemory.id,
                memoryCategory: relatedMemory.memoryCategory,
                memoryType: relatedMemory.memoryType,
                title: relatedMemory.title,
                summary: relatedMemory.summary,
                confidenceScore: relatedMemory.confidenceScore,
                isActive: relatedMemory.isActive,
                updatedAt: relatedMemory.updatedAt,
              }
            : null,
          missing: !relatedMemory,
        } satisfies OrganizationMemorySupersessionLink;
      }),
  };
}

export async function getOrganizationMemoryLinkedEvents(
  organizationIdInput: string,
  memoryIdInput: string,
): Promise<OrganizationMemoryLinkedEventsOutput | null> {
  const provenance = await getOrganizationMemoryProvenance(organizationIdInput, memoryIdInput);
  if (!provenance) {
    return null;
  }

  return {
    organizationId: provenance.organizationId,
    memoryId: provenance.memoryId,
    events: provenance.rawEventLinks
      .filter((link) => link.event)
      .map((link) => ({
        linkId: link.linkId,
        linkType: link.linkType,
        sourceEventId: link.sourceEventId,
        eventType: link.event?.eventType ?? null,
        occurredAt: link.event?.occurredAt ?? null,
        projectId: link.event?.projectId ?? null,
        opportunityId: link.event?.opportunityId ?? null,
        workbookId: link.event?.workbookId ?? null,
        sheetId: link.event?.sheetId ?? null,
        sheetName: link.event?.sheetName ?? null,
        worksheetName: link.event?.worksheetName ?? null,
        sourceRequestId: link.event?.sourceRequestId ?? null,
        diffData: link.event?.diffData ?? {},
        diffSummary: buildDiffSummary(link.event?.diffData ?? {}),
        metadataSummary: {
          workbookId: link.event?.workbookId ?? null,
          sheetId: link.event?.sheetId ?? null,
          sheetName: link.event?.sheetName ?? null,
          worksheetName: link.event?.worksheetName ?? null,
        },
      })),
  };
}

export async function getOrganizationMemoryLinkedClassifications(
  organizationIdInput: string,
  memoryIdInput: string,
): Promise<OrganizationMemoryLinkedClassificationsOutput | null> {
  const provenance = await getOrganizationMemoryProvenance(organizationIdInput, memoryIdInput);
  if (!provenance) {
    return null;
  }

  return {
    organizationId: provenance.organizationId,
    memoryId: provenance.memoryId,
    classifications: provenance.classificationLinks
      .filter((link) => link.classification)
      .map((link) => ({
        linkId: link.linkId,
        linkType: link.linkType,
        classificationRecordId: link.classificationRecordId,
        sourceEventId: link.classification?.sourceEventId ?? "",
        classificationStatus: link.classification?.classificationStatus ?? null,
        overallConfidence: link.classification?.overallConfidence ?? null,
        semanticFields: link.classification?.semanticFields ?? {},
        interpretationPayload: link.classification?.interpretationPayload ?? {},
        reasoningSummary: link.classification?.reasoningSummary ?? null,
        classifiedAt: link.classification?.classifiedAt ?? null,
      })),
    completeness: {
      missingClassificationIds: provenance.classificationLinks
        .filter((link) => link.missing)
        .map((link) => link.classificationRecordId),
    },
  };
}

export async function getOrganizationMemoryDetail(
  organizationIdInput: string,
  memoryIdInput: string,
): Promise<OrganizationMemoryDetail | null> {
  const organizationId = ensureOrganizationId(organizationIdInput);
  const memoryId = ensureMemoryId(memoryIdInput);
  const memoryRow = await getMemoryRowOrNull(memoryId, organizationId);
  if (!memoryRow) {
    return null;
  }

  const memory = mapMemorySnapshot(memoryRow);
  const provenance = await getOrganizationMemoryProvenance(organizationId, memoryId);
  const semanticPoolLink = provenance?.semanticPoolLinks[0] ?? null;
  const synthesisInfo = await buildSynthesisInfo({
    organizationId,
    memory,
    semanticPoolId: semanticPoolLink?.semanticPoolId ?? null,
  });

  return {
    organizationId,
    memory,
    evidenceSummary: memory.evidenceSummary,
    memoryValue: memory.memoryValue,
    provenanceSummary: provenance?.summary ?? {
      rawEventCount: 0,
      classificationCount: 0,
      semanticPoolCount: 0,
      evidencePoolCount: 0,
      supersessionCount: 0,
      missingRawEvents: 0,
      missingClassifications: 0,
      missingSemanticPools: 0,
      missingEvidencePools: 0,
      missingSupersededMemories: 0,
    },
    semanticPoolSummary: semanticPoolLink?.semanticPool ?? null,
    synthesisInfo,
    fieldNotes: buildFieldNotes(memory, synthesisInfo),
  };
}

export async function getOrganizationMemoryHistory(
  organizationIdInput: string,
  memoryIdInput: string,
): Promise<OrganizationMemoryHistoryOutput | null> {
  const organizationId = ensureOrganizationId(organizationIdInput);
  const memoryId = ensureMemoryId(memoryIdInput);
  const memoryRow = await getMemoryRowOrNull(memoryId, organizationId);
  if (!memoryRow) {
    return null;
  }

  const memory = mapMemorySnapshot(memoryRow);
  const provenance = await getOrganizationMemoryProvenance(organizationId, memoryId);
  const synthesisInfo = await buildSynthesisInfo({
    organizationId,
    memory,
    semanticPoolId: provenance?.semanticPoolLinks[0]?.semanticPoolId ?? null,
  });
  const synthesisHistory = await getOrganizationMemorySynthesisHistoryRows({
    organizationId,
    memoryId,
    limit: 50,
  });
  const lifecycleHistory = await getOrganizationMemoryLifecycleHistoryRows({
    organizationId,
    memoryId,
    limit: 50,
  });
  const confidenceHistory = await getOrganizationMemoryConfidenceHistoryRows({
    organizationId,
    memoryId,
    limit: 50,
  });
  const retirementEvaluations = await getOrganizationMemoryRetirementEvaluationRows({
    organizationId,
    memoryId,
    limit: 10,
  });
  const supersedes = provenance?.supersessionLinks
    .map((link) => link.relatedMemory)
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .map((memoryItem) => ({
      id: memoryItem.id,
      title: memoryItem.title,
      memoryCategory: memoryItem.memoryCategory,
      memoryType: memoryItem.memoryType,
      isActive: memoryItem.isActive,
      updatedAt: memoryItem.updatedAt,
    })) ?? [];

  return {
    organizationId,
    memoryId,
    supersededByMemoryId: memory.supersededByMemoryId,
    supersedes,
    supersededByChain: await buildSupersededByChain(organizationId, memory.supersededByMemoryId),
    lifecycleMoments: [
      {
        label: "Created",
        at: memory.createdAt ?? memory.firstDerivedAt,
        authority: "authoritative",
        note: "Created timestamp is read directly from organization_memory_items.",
      },
      {
        label: "First derived",
        at: memory.firstDerivedAt,
        authority: "authoritative",
        note: "Derived timestamps are read directly from organization_memory_items.",
      },
      {
        label: "Last reinforced",
        at: memory.lastReinforcedAt,
        authority: "authoritative",
        note: "Reinforcement timestamps are read directly from organization_memory_items.",
      },
      {
        label: "Last contradicted",
        at: memory.lastContradictedAt,
        authority: "authoritative",
        note: "Contradiction timestamps are read directly from organization_memory_items.",
      },
      {
        label: "Retired",
        at: memory.retiredAt,
        authority: "authoritative",
        note: memory.retiredAt
          ? `Exact retirement state is stored directly on organization_memory_items${memory.retiredLifecycleHistoryId ? ` and linked to immutable lifecycle history ${memory.retiredLifecycleHistoryId}` : ""}.`
          : "No retirement is currently recorded on this memory.",
        lifecycleHistoryId: memory.retiredLifecycleHistoryId,
      },
      {
        label: "Superseded",
        at: memory.supersededAt ?? (memory.supersededByMemoryId ? memory.updatedAt : null),
        authority: memory.supersededAt ? "authoritative" : memory.supersededByMemoryId ? "inferred" : "authoritative",
        note: memory.supersededAt
          ? `Exact supersession state is stored directly on organization_memory_items${memory.supersededLifecycleHistoryId ? ` and linked to immutable lifecycle history ${memory.supersededLifecycleHistoryId}` : ""}.`
          : memory.supersededByMemoryId
            ? "Legacy supersession linkage exists, but the exact supersession timestamp was not persisted and is inferred from update history."
            : "No supersession is currently recorded on this memory.",
        lifecycleHistoryId: memory.supersededLifecycleHistoryId,
      },
    ],
    relatedSynthesis: {
      queueRecords: synthesisInfo.exactQueueRecords,
      exactRunRecords: synthesisInfo.exactRunRecords,
      inferredRunRecords: synthesisInfo.inferredRunRecords,
      immutableHistory: synthesisHistory,
    },
    relatedLifecycle: {
      immutableHistory: lifecycleHistory,
    },
    relatedConfidence: {
      immutableHistory: confidenceHistory,
    },
    relatedRetirement: {
      evaluations: retirementEvaluations,
    },
    fieldNotes: buildFieldNotes(
      memory,
      synthesisInfo,
      synthesisHistory.length,
      lifecycleHistory.length,
      confidenceHistory.length,
    ),
  };
}

export async function listOrganizationMemorySynthesisHistory(input: {
  organizationId: string;
  memoryId?: string | null;
  semanticPoolId?: string | null;
  queueRowId?: string | null;
  limit?: number;
}) {
  const organizationId = ensureOrganizationId(input.organizationId);
  const memoryId = input.memoryId ? ensureMemoryId(input.memoryId) : null;
  const semanticPoolId = toNullableString(input.semanticPoolId);
  const queueRowId = toNullableString(input.queueRowId);

  return {
    organizationId,
    memoryId,
    semanticPoolId,
    queueRowId,
    records: await getOrganizationMemorySynthesisHistoryRows({
      organizationId,
      memoryId,
      semanticPoolId,
      queueRowId,
      limit: input.limit ?? 50,
    }),
  };
}

export async function listOrganizationMemoryLifecycleHistory(input: {
  organizationId: string;
  memoryId?: string | null;
  semanticPoolId?: string | null;
  queueRowId?: string | null;
  synthesisHistoryId?: string | null;
  limit?: number;
}) {
  const organizationId = ensureOrganizationId(input.organizationId);
  const memoryId = input.memoryId ? ensureMemoryId(input.memoryId) : null;
  const semanticPoolId = toNullableString(input.semanticPoolId);
  const queueRowId = toNullableString(input.queueRowId);
  const synthesisHistoryId = toNullableString(input.synthesisHistoryId);

  return {
    organizationId,
    memoryId,
    semanticPoolId,
    queueRowId,
    synthesisHistoryId,
    records: await getOrganizationMemoryLifecycleHistoryRows({
      organizationId,
      memoryId,
      semanticPoolId,
      queueRowId,
      synthesisHistoryId,
      limit: input.limit ?? 50,
    }),
  };
}

export async function listOrganizationMemoryConfidenceHistory(input: {
  organizationId: string;
  memoryId?: string | null;
  semanticPoolId?: string | null;
  queueRowId?: string | null;
  lifecycleHistoryId?: string | null;
  limit?: number;
}) {
  const organizationId = ensureOrganizationId(input.organizationId);
  const memoryId = input.memoryId ? ensureMemoryId(input.memoryId) : null;
  const semanticPoolId = toNullableString(input.semanticPoolId);
  const queueRowId = toNullableString(input.queueRowId);
  const lifecycleHistoryId = toNullableString(input.lifecycleHistoryId);

  return {
    organizationId,
    memoryId,
    semanticPoolId,
    queueRowId,
    lifecycleHistoryId,
    records: await getOrganizationMemoryConfidenceHistoryRows({
      organizationId,
      memoryId,
      semanticPoolId,
      queueRowId,
      lifecycleHistoryId,
      limit: input.limit ?? 50,
    }),
  };
}

export async function listOrganizationMemoryRetirementHistory(input: {
  organizationId: string;
  memoryId?: string | null;
  limit?: number;
}) {
  const organizationId = ensureOrganizationId(input.organizationId);
  const memoryId = input.memoryId ? ensureMemoryId(input.memoryId) : null;

  return {
    organizationId,
    memoryId,
    records: await getOrganizationMemoryRetirementEvaluationRows({
      organizationId,
      memoryId,
      limit: input.limit ?? 50,
    }),
  };
}

export async function repairOrganizationMemoryConfidenceMetadata(input: {
  organizationId: string;
  memoryId?: string | null;
  apply?: boolean;
  limit?: number;
}): Promise<RepairOrganizationMemoryConfidenceMetadataOutput> {
  const organizationId = ensureOrganizationId(input.organizationId);
  const memoryId = input.memoryId ? ensureMemoryId(input.memoryId) : null;
  const apply = input.apply === true;
  const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
  const admin = createAdminSupabaseClient();

  let memoryQuery = admin
    .from("organization_memory_items" as never)
    .select("id, organization_id, confidence_score, confidence_calculation_version, last_confidence_history_id, last_confidence_calculated_at, base_confidence_score, confidence_reason_summary, memory_category, updated_at")
    .eq("organization_id", organizationId as never)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (memoryId) {
    memoryQuery = memoryQuery.eq("id", memoryId as never);
  }

  const { data: memoryRows, error: memoryError } = await memoryQuery;
  if (memoryError) {
    throw new Error(memoryError.message);
  }

  const rows = Array.isArray(memoryRows) ? memoryRows as Array<Record<string, unknown>> : [];
  const targetIds = rows
    .map((row) => toNullableString(row.id))
    .filter((value): value is string => Boolean(value));

  if (targetIds.length === 0) {
    return {
      organizationId,
      memoryId,
      apply,
      scannedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      skippedNoHistoryCount: 0,
      records: [],
    };
  }

  const { data: historyRows, error: historyError } = await admin
    .from("organization_memory_confidence_history" as never)
    .select("id, memory_id, confidence_after, calculation_version, reason_summary, created_at")
    .eq("organization_id", organizationId as never)
    .in("memory_id", targetIds as never)
    .order("created_at", { ascending: false });

  if (historyError) {
    throw new Error(historyError.message);
  }

  const historyByMemoryId = new Map<string, Array<Record<string, unknown>>>();
  for (const row of Array.isArray(historyRows) ? historyRows as Array<Record<string, unknown>> : []) {
    const rowMemoryId = toNullableString(row.memory_id);
    if (!rowMemoryId) {
      continue;
    }
    const list = historyByMemoryId.get(rowMemoryId) ?? [];
    list.push(row);
    historyByMemoryId.set(rowMemoryId, list);
  }

  const records: RepairOrganizationMemoryConfidenceMetadataOutput["records"] = [];
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedNoHistoryCount = 0;

  for (const row of rows) {
    const rowMemoryId = toNullableString(row.id);
    if (!rowMemoryId) {
      continue;
    }

    const orderedHistory = historyByMemoryId.get(rowMemoryId) ?? [];
    const latestHistory = orderedHistory[0] ?? null;
    const earliestHistory = orderedHistory[orderedHistory.length - 1] ?? null;
    const currentConfidence = toNullableNumber(row.confidence_score);
    const currentBaseConfidence = toNullableNumber(row.base_confidence_score);
    const currentLastHistoryId = toNullableString(row.last_confidence_history_id);
    const currentLastCalculatedAt = toNullableString(row.last_confidence_calculated_at);
    const currentReasonSummary = toNullableString(row.confidence_reason_summary);

    if (!latestHistory) {
      skippedNoHistoryCount += 1;
      records.push({
        memoryId: rowMemoryId,
        status: "no_history_unchanged",
        latestConfidenceHistoryId: null,
        confidenceBefore: currentConfidence,
        confidenceAfter: currentConfidence,
        baseConfidenceScoreBefore: currentBaseConfidence,
        baseConfidenceScoreAfter: currentBaseConfidence,
        lastConfidenceHistoryIdBefore: currentLastHistoryId,
        lastConfidenceHistoryIdAfter: currentLastHistoryId,
        lastConfidenceCalculatedAtBefore: currentLastCalculatedAt,
        lastConfidenceCalculatedAtAfter: currentLastCalculatedAt,
        confidenceReasonSummaryBefore: currentReasonSummary,
        confidenceReasonSummaryAfter: currentReasonSummary,
      });
      continue;
    }

    const desiredConfidence = toNullableNumber(latestHistory.confidence_after);
    const desiredBaseConfidence = currentBaseConfidence ?? toNullableNumber(earliestHistory?.confidence_after);
    const desiredLastHistoryId = toNullableString(latestHistory.id);
    const desiredLastCalculatedAt = toNullableString(latestHistory.created_at);
    const desiredReasonSummary = toNullableString(latestHistory.reason_summary) ?? currentReasonSummary;
    const desiredCalculationVersion = toNullableNumber(latestHistory.calculation_version)
      ?? toNullableNumber(row.confidence_calculation_version)
      ?? 1;

    const needsUpdate = (
      desiredConfidence !== null
      && currentConfidence !== desiredConfidence
    ) || currentBaseConfidence !== desiredBaseConfidence
      || currentLastHistoryId !== desiredLastHistoryId
      || currentLastCalculatedAt !== desiredLastCalculatedAt
      || currentReasonSummary !== desiredReasonSummary;

    let status: "updated" | "unchanged" = "unchanged";

    if (needsUpdate && apply) {
      const { error: updateError } = await admin
        .from("organization_memory_items" as never)
        .update({
          confidence_score: desiredConfidence ?? currentConfidence,
          base_confidence_score: desiredBaseConfidence,
          last_confidence_history_id: desiredLastHistoryId,
          last_confidence_calculated_at: desiredLastCalculatedAt,
          confidence_reason_summary: desiredReasonSummary,
          confidence_calculation_version: desiredCalculationVersion,
        } as never)
        .eq("organization_id", organizationId as never)
        .eq("id", rowMemoryId as never);

      if (updateError) {
        throw new Error(updateError.message);
      }
      updatedCount += 1;
      status = "updated";
    } else if (needsUpdate) {
      status = "updated";
      updatedCount += 1;
    } else {
      unchangedCount += 1;
    }

    records.push({
      memoryId: rowMemoryId,
      status: apply ? status : needsUpdate ? "updated" : "unchanged",
      latestConfidenceHistoryId: desiredLastHistoryId,
      confidenceBefore: currentConfidence,
      confidenceAfter: desiredConfidence ?? currentConfidence,
      baseConfidenceScoreBefore: currentBaseConfidence,
      baseConfidenceScoreAfter: desiredBaseConfidence,
      lastConfidenceHistoryIdBefore: currentLastHistoryId,
      lastConfidenceHistoryIdAfter: desiredLastHistoryId,
      lastConfidenceCalculatedAtBefore: currentLastCalculatedAt,
      lastConfidenceCalculatedAtAfter: desiredLastCalculatedAt,
      confidenceReasonSummaryBefore: currentReasonSummary,
      confidenceReasonSummaryAfter: desiredReasonSummary,
    });
  }

  if (!apply) {
    unchangedCount = records.filter((record) => record.status === "unchanged").length;
    updatedCount = records.filter((record) => record.status === "updated").length;
  }

  return {
    organizationId,
    memoryId,
    apply,
    scannedCount: rows.length,
    updatedCount,
    unchangedCount,
    skippedNoHistoryCount,
    records,
  };
}
