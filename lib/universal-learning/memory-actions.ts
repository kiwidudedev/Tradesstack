import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildUniversalLearningActionKey } from "@/lib/universal-learning/idempotency";
import { writeUniversalLearningActionResult } from "@/lib/universal-learning/review-action-results";
import type {
  UniversalLearningBusinessRecord,
  UniversalLearningLearningItem,
  UniversalLearningMemoryAction,
  UniversalLearningMemoryPackItem,
  UniversalLearningResponse,
  UniversalLearningRunSelection,
} from "@/lib/universal-learning/types";

type JsonRecord = Record<string, unknown>;
type ResolvedSourceScope = NonNullable<UniversalLearningLearningItem["evidence"]["supportingRecords"][number]["sourceScope"]>;
type SourceResolutionCandidate = {
  sourceScope: ResolvedSourceScope;
  sourceId: string;
  containerType?: UniversalLearningBusinessRecord["containerType"];
  memoryId?: string | null;
};

type UniversalLearningSourceRefCorrectionDiagnostic = {
  learningId: string;
  originalSourceId: string;
  resolvedSourceId: string;
  correctionReason: string;
  correctionMethod: "fuzzy_unique_source_ref";
  sourceScope: ResolvedSourceScope;
};

const sourceRefCorrectionDiagnostics: UniversalLearningSourceRefCorrectionDiagnostic[] = [];

export const UNIVERSAL_LEARNING_ALLOWED_WRITE_TABLES = [
  "organization_memory_items",
  "organization_memory_links",
  "organization_memory_lifecycle_history",
  "organization_memory_confidence_history",
  "learning_review_action_results",
  "learning_review_cursors",
  "learning_review_runs",
  "learning_review_run_records",
] as const;

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function hashString(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildMemoryKey(input: {
  organizationId: string;
  containerType: string;
  title: string;
}) {
  return hashString(`${input.organizationId}:${input.containerType}:${input.title.trim().toLowerCase()}`);
}

function buildMemoryDomainSignature(input: {
  containerType: string;
  title: string;
}) {
  return hashString(`${input.containerType}:${input.title.trim().toLowerCase()}`);
}

function summarizeRecordEvidence(recordCount: number) {
  return recordCount <= 1 ? "Supported by 1 reviewed record." : `Supported by ${recordCount} reviewed records.`;
}

function flattenLearnings(response: UniversalLearningResponse) {
  const pairs: Array<{ bucket: string; learning: UniversalLearningLearningItem }> = [];
  for (const [bucket, items] of Object.entries(response.learnings)) {
    for (const learning of items as UniversalLearningLearningItem[]) {
      pairs.push({ bucket, learning });
    }
  }
  return new Map(pairs.map((entry) => [entry.learning.learningId, entry]));
}

function resolveReviewedRecordSourceEntityType(record: UniversalLearningBusinessRecord | undefined) {
  const sourceTable = record?.source.table;
  if (sourceTable === "opportunity_quotes") {
    return "opportunity_quote";
  }
  if (sourceTable === "project_quotes") {
    return "project_quote";
  }
  return record?.containerType ?? null;
}

function flattenActions(response: UniversalLearningResponse) {
  return [
    ...response.memoryActions.create,
    ...response.memoryActions.reinforce,
    ...response.memoryActions.update,
    ...response.memoryActions.retireOrDeactivate,
    ...response.memoryActions.noAction,
  ];
}

function mapLearningBuckets(
  response: UniversalLearningResponse,
  mapper: (learning: UniversalLearningLearningItem) => UniversalLearningLearningItem,
): UniversalLearningResponse["learnings"] {
  return {
    observations: response.learnings.observations.map(mapper),
    emergingPatterns: response.learnings.emergingPatterns.map(mapper),
    reinforcedPatterns: response.learnings.reinforcedPatterns.map(mapper),
    durablePatterns: response.learnings.durablePatterns.map(mapper),
    changingBehaviors: response.learnings.changingBehaviors.map(mapper),
    contradictions: response.learnings.contradictions.map(mapper),
    needsMoreEvidence: response.learnings.needsMoreEvidence.map(mapper),
  };
}

export class UniversalLearningSourceIdNormalizationError extends Error {
  code = "provenance_source_id_invalid";

  constructor(message: string) {
    super(message);
    this.name = "UniversalLearningSourceIdNormalizationError";
  }
}

export class UniversalLearningTargetMemoryIdNormalizationError extends Error {
  code = "target_memory_id_invalid";

  constructor(message: string) {
    super(message);
    this.name = "UniversalLearningTargetMemoryIdNormalizationError";
  }
}

export class UniversalLearningActionPreflightError extends Error {
  code = "memory_action_preflight_failed";

  constructor(message: string) {
    super(message);
    this.name = "UniversalLearningActionPreflightError";
  }
}

export function resetUniversalLearningSourceRefCorrectionDiagnostics() {
  sourceRefCorrectionDiagnostics.length = 0;
}

export function getUniversalLearningSourceRefCorrectionDiagnostics() {
  return [...sourceRefCorrectionDiagnostics];
}

function normalizeSupportingRecordSourceIds(input: {
  learning: UniversalLearningLearningItem;
  reviewedSourceIds: string[];
  reviewedRecords?: UniversalLearningBusinessRecord[];
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
  sourceResolutionCandidates?: SourceResolutionCandidate[];
}) {
  return {
    ...input.learning,
    evidence: {
      ...input.learning.evidence,
      supportingRecords: input.learning.evidence.supportingRecords.map((reference) => {
        const sourceId = reference.sourceId.trim();
        if (!sourceId) {
          throw new UniversalLearningSourceIdNormalizationError(
            `Learning ${input.learning.learningId} included an empty supporting record sourceId.`,
          );
        }

        const candidate = resolveSourceReference({
          reference: {
            ...reference,
            sourceId,
          },
          sourceResolutionCandidates: input.sourceResolutionCandidates ?? buildReviewedRecordSourceCandidates({
            reviewedSourceIds: input.reviewedSourceIds,
            reviewedRecords: input.reviewedRecords,
            recordsBySourceId: input.recordsBySourceId,
          }),
          learningId: input.learning.learningId,
        });

        return {
          ...reference,
          sourceId: candidate.sourceId,
          sourceScope: candidate.sourceScope,
          memoryId: candidate.memoryId === undefined ? reference.memoryId : candidate.memoryId,
          containerType: reference.containerType ?? candidate.containerType,
        };
      }),
    },
  };
}

function buildReviewedRecordSourceCandidates(input: {
  reviewedSourceIds: string[];
  reviewedRecords?: UniversalLearningBusinessRecord[];
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
}): SourceResolutionCandidate[] {
  const candidates: SourceResolutionCandidate[] = [];
  const reviewedRecords = input.reviewedRecords ?? input.reviewedSourceIds
    .map((sourceId) => input.recordsBySourceId.get(sourceId))
    .filter((record): record is UniversalLearningBusinessRecord => Boolean(record));

  for (const sourceId of input.reviewedSourceIds) {
    candidates.push({
      sourceScope: "reviewed_record",
      sourceId,
      containerType: input.recordsBySourceId.get(sourceId)?.containerType,
    });
  }

  for (const record of reviewedRecords) {
    candidates.push(...buildReviewedLineageSourceCandidates(record));
  }

  return candidates;
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildReviewedLineageSourceCandidates(record: UniversalLearningBusinessRecord): SourceResolutionCandidate[] {
  if (record.containerType !== "project_actual_cost_event") {
    return [];
  }

  const payload = toRecord(record.payload);
  const sourceEvidence = toRecord(payload.sourceEvidence);
  const sourceAllocation = toRecord(sourceEvidence.sourceAllocation);
  const supplierInvoice = toRecord(sourceEvidence.supplierInvoice);
  const purchaseOrder = toRecord(sourceEvidence.purchaseOrder);
  const lineageContext = toRecord(payload.lineageContext);

  const candidateSpecs: Array<{
    sourceId: string | null;
    containerType: UniversalLearningBusinessRecord["containerType"];
  }> = [
    {
      sourceId: asTrimmedString(sourceAllocation.allocationId) ?? asTrimmedString(sourceAllocation.supplierInvoiceLineAllocationId),
      containerType: "supplier_invoice_allocation",
    },
    {
      sourceId: asTrimmedString(lineageContext.supplierInvoiceLineAllocationId) ?? asTrimmedString(lineageContext.sourceInvoiceAllocationId),
      containerType: "supplier_invoice_allocation",
    },
    {
      sourceId: asTrimmedString(supplierInvoice.invoiceId) ?? asTrimmedString(lineageContext.supplierInvoiceId),
      containerType: "supplier_invoice",
    },
    {
      sourceId: asTrimmedString(purchaseOrder.purchaseOrderId) ?? asTrimmedString(lineageContext.purchaseOrderId),
      containerType: "project_purchase_order",
    },
    {
      sourceId: asTrimmedString(lineageContext.eventId),
      containerType: "project_actual_cost_event",
    },
    {
      sourceId: asTrimmedString(lineageContext.reversesEventId),
      containerType: "project_actual_cost_event",
    },
    {
      sourceId: asTrimmedString(lineageContext.correctionRootEventId),
      containerType: "project_actual_cost_event",
    },
  ];

  return candidateSpecs
    .filter((spec): spec is { sourceId: string; containerType: UniversalLearningBusinessRecord["containerType"] } => Boolean(spec.sourceId))
    .map((spec) => ({
      sourceScope: "reviewed_record",
      sourceId: spec.sourceId,
      containerType: spec.containerType,
    }));
}

function buildUniversalLearningRecordLookupMap(records: UniversalLearningBusinessRecord[]) {
  const lookup = new Map<string, UniversalLearningBusinessRecord>();

  for (const record of records) {
    lookup.set(record.source.sourceId, record);
  }

  for (const record of records) {
    for (const candidate of buildReviewedLineageSourceCandidates(record)) {
      if (!lookup.has(candidate.sourceId)) {
        lookup.set(candidate.sourceId, record);
      }
    }
  }

  return lookup;
}

function evidenceSupportingRecordsFromMemory(memory: UniversalLearningMemoryPackItem) {
  const evidenceSummary = toRecord(memory.evidenceSummary);
  const evidence = toRecord(evidenceSummary.evidence);
  const directSupportingRecords = Array.isArray(evidence.supportingRecords)
    ? evidence.supportingRecords
    : Array.isArray(evidence.supporting_records)
      ? evidence.supporting_records
      : [];
  const memoryValue = toRecord(memory.memoryValue);
  const provenance = toRecord(memoryValue.provenance);
  const provenanceSupportingRecords = Array.isArray(provenance.supportingRecords)
    ? provenance.supportingRecords
    : Array.isArray(provenance.supporting_records)
      ? provenance.supporting_records
      : [];

  return [...directSupportingRecords, ...provenanceSupportingRecords];
}

function buildSourceResolutionCandidates(input: {
  reviewedSourceIds: string[];
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
  existingMemories?: UniversalLearningMemoryPackItem[];
}): SourceResolutionCandidate[] {
  const candidates = buildReviewedRecordSourceCandidates(input);
  for (const memory of input.existingMemories ?? []) {
    candidates.push({
      sourceScope: "existing_memory",
      sourceId: memory.id,
      memoryId: memory.id,
    });

    for (const rawRecord of evidenceSupportingRecordsFromMemory(memory)) {
      const record = toRecord(rawRecord);
      const sourceId = typeof record.sourceId === "string"
        ? record.sourceId
        : typeof record.source_id === "string"
          ? record.source_id
          : "";
      if (!sourceId) {
        continue;
      }

      candidates.push({
        sourceScope: "existing_memory_source",
        sourceId,
        containerType: typeof record.containerType === "string"
          ? record.containerType as UniversalLearningBusinessRecord["containerType"]
          : typeof record.container_type === "string"
            ? record.container_type as UniversalLearningBusinessRecord["containerType"]
            : undefined,
        memoryId: memory.id,
      });
    }
  }

  return candidates;
}

function sourceScopeSortOrder(scope: ResolvedSourceScope) {
  if (scope === "reviewed_record") return 0;
  if (scope === "existing_memory") return 1;
  return 2;
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + substitutionCost,
      );
    }
    for (let index = 0; index < current.length; index += 1) {
      previous[index] = current[index]!;
    }
  }

  return previous[right.length]!;
}

function resolveFuzzySourceReference(input: {
  sourceId: string;
  learningId: string;
  scopedCandidates: SourceResolutionCandidate[];
  preferredScopes: readonly ResolvedSourceScope[];
  requestedScope?: ResolvedSourceScope;
}) {
  const leadingPrefix = input.sourceId.slice(0, 8).toLowerCase();
  if (leadingPrefix.length < 8) {
    return null;
  }

  const samePrefixCandidates = input.scopedCandidates.filter((candidate) =>
    candidate.sourceId.slice(0, 8).toLowerCase() === leadingPrefix,
  );
  if (samePrefixCandidates.length === 0) {
    return null;
  }
  const uniqueBySourceId = new Map<string, SourceResolutionCandidate[]>();
  for (const candidate of samePrefixCandidates) {
    const bucket = uniqueBySourceId.get(candidate.sourceId) ?? [];
    bucket.push(candidate);
    uniqueBySourceId.set(candidate.sourceId, bucket);
  }
  if (uniqueBySourceId.size !== 1) {
    return null;
  }

  const candidate = Array.from(uniqueBySourceId.values())[0]!
    .sort((left, right) => sourceScopeSortOrder(left.sourceScope) - sourceScopeSortOrder(right.sourceScope))[0]!;
  if (!input.preferredScopes.includes(candidate.sourceScope)) {
    return null;
  }

  const lengthGap = Math.abs(candidate.sourceId.length - input.sourceId.length);
  if (lengthGap > 4) {
    return null;
  }

  const distance = levenshteinDistance(input.sourceId.toLowerCase(), candidate.sourceId.toLowerCase());
  const maxLength = Math.max(input.sourceId.length, candidate.sourceId.length);
  const similarity = maxLength === 0 ? 1 : 1 - (distance / maxLength);

  if (distance > 4 || similarity < 0.88) {
    return null;
  }

  const scopeLabel = input.requestedScope ?? candidate.sourceScope;
  sourceRefCorrectionDiagnostics.push({
    learningId: input.learningId,
    originalSourceId: input.sourceId,
    resolvedSourceId: candidate.sourceId,
    correctionReason: `Unique ${scopeLabel} candidate matched first 8 chars with edit distance ${distance}.`,
    correctionMethod: "fuzzy_unique_source_ref",
    sourceScope: candidate.sourceScope,
  });

  return candidate;
}

function uniqueSourceResolutionCandidates(candidates: SourceResolutionCandidate[]) {
  const byEntity = new Map<string, SourceResolutionCandidate & { memoryIds: Set<string> }>();
  for (const candidate of candidates) {
    const key = [
      candidate.sourceScope,
      candidate.containerType ?? "",
      candidate.sourceId,
    ].join(":");
    const existing = byEntity.get(key);
    if (existing) {
      if (candidate.memoryId) {
        existing.memoryIds.add(candidate.memoryId);
      }
      continue;
    }
    byEntity.set(key, {
      ...candidate,
      memoryIds: new Set(candidate.memoryId ? [candidate.memoryId] : []),
    });
  }

  return Array.from(byEntity.values()).map((candidate) => ({
    sourceScope: candidate.sourceScope,
    sourceId: candidate.sourceId,
    containerType: candidate.containerType,
    memoryId: candidate.memoryIds.size === 1 ? Array.from(candidate.memoryIds)[0] : null,
  }));
}

function resolveSourceReference(input: {
  reference: UniversalLearningLearningItem["evidence"]["supportingRecords"][number];
  sourceResolutionCandidates: SourceResolutionCandidate[];
  learningId: string;
}): SourceResolutionCandidate {
  const sourceId = input.reference.sourceId.trim();
  const preferredScopes = input.reference.sourceScope
    ? [input.reference.sourceScope]
    : ["reviewed_record", "existing_memory", "existing_memory_source"] as const;

  const allCandidates = uniqueSourceResolutionCandidates(input.sourceResolutionCandidates)
    .sort((left, right) => sourceScopeSortOrder(left.sourceScope) - sourceScopeSortOrder(right.sourceScope));
  const scopedCandidates = allCandidates.filter((candidate) => preferredScopes.includes(candidate.sourceScope));

  for (const scope of preferredScopes) {
    const matches = scopedCandidates.filter((candidate) =>
      candidate.sourceScope === scope && candidate.sourceId.startsWith(sourceId),
    );
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new UniversalLearningSourceIdNormalizationError(
        `Learning ${input.learningId} referenced ambiguous ${scope} sourceId prefix "${sourceId}".`,
      );
    }
  }

  const fuzzyMatch = resolveFuzzySourceReference({
    sourceId,
    learningId: input.learningId,
    scopedCandidates,
    preferredScopes,
    requestedScope: input.reference.sourceScope,
  });
  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  const scopeLabel = input.reference.sourceScope ? `${input.reference.sourceScope} ` : "";
  throw new UniversalLearningSourceIdNormalizationError(
    `Learning ${input.learningId} referenced unknown ${scopeLabel}supporting record sourceId prefix "${sourceId}".`,
  );
}

function normalizeTargetMemoryId(input: {
  memoryId: string | null;
  existingMemoryIds: string[];
  context: string;
}) {
  if (input.memoryId === null) {
    return null;
  }

  const memoryId = input.memoryId.trim();
  if (!memoryId) {
    return null;
  }
  if (isUuid(memoryId)) {
    return memoryId;
  }

  const matches = input.existingMemoryIds.filter((candidate) => candidate.startsWith(memoryId));
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length === 0) {
    throw new UniversalLearningTargetMemoryIdNormalizationError(
      `${input.context} referenced unknown target memory id prefix "${memoryId}".`,
    );
  }

  throw new UniversalLearningTargetMemoryIdNormalizationError(
    `${input.context} referenced ambiguous target memory id prefix "${memoryId}".`,
  );
}

function mapActions(
  response: UniversalLearningResponse,
  mapper: (action: UniversalLearningMemoryAction) => UniversalLearningMemoryAction,
): UniversalLearningResponse["memoryActions"] {
  return {
    create: response.memoryActions.create.map(mapper),
    reinforce: response.memoryActions.reinforce.map(mapper),
    update: response.memoryActions.update.map(mapper),
    retireOrDeactivate: response.memoryActions.retireOrDeactivate.map(mapper),
    noAction: response.memoryActions.noAction.map(mapper),
  };
}

function buildReviewPeriodFromMonth(reviewMonth: string) {
  const start = `${reviewMonth}-01T00:00:00.000Z`;
  const endDate = new Date(start);
  if (Number.isNaN(endDate.getTime())) {
    return {
      reviewPeriodStart: "unknown",
      reviewPeriodEnd: "unknown",
    };
  }
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  return {
    reviewPeriodStart: start,
    reviewPeriodEnd: endDate.toISOString(),
  };
}

function deriveLearningProvenance(input: {
  learning: UniversalLearningLearningItem;
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
  reviewMonth: string;
}) {
  const projectIds = new Set<string>();
  const supplierIds = new Set<string>();
  const clientIds = new Set<string>();

  for (const reference of input.learning.evidence.supportingRecords) {
    const record = input.recordsBySourceId.get(reference.sourceId);
    if (!record) {
      continue;
    }
    if (record.projectId) {
      projectIds.add(record.projectId);
    }
    if (record.supplierId) {
      supplierIds.add(record.supplierId);
    }
    if (record.clientId) {
      clientIds.add(record.clientId);
    }
  }

  const reviewPeriod = buildReviewPeriodFromMonth(input.reviewMonth);
  return {
    ...input.learning,
    provenance: {
      reviewPeriodStart:
        input.learning.provenance.reviewPeriodStart !== "unknown"
          ? input.learning.provenance.reviewPeriodStart
          : reviewPeriod.reviewPeriodStart,
      reviewPeriodEnd:
        input.learning.provenance.reviewPeriodEnd !== "unknown"
          ? input.learning.provenance.reviewPeriodEnd
          : reviewPeriod.reviewPeriodEnd,
      relevantEntities: {
        projectIds: Array.from(new Set([
          ...input.learning.provenance.relevantEntities.projectIds,
          ...projectIds,
        ])),
        supplierIds: Array.from(new Set([
          ...input.learning.provenance.relevantEntities.supplierIds,
          ...supplierIds,
        ])),
        clientIds: Array.from(new Set([
          ...input.learning.provenance.relevantEntities.clientIds,
          ...clientIds,
        ])),
        materialIds: input.learning.provenance.relevantEntities.materialIds,
      },
    },
  };
}

function deriveResponseProvenance(input: {
  response: UniversalLearningResponse;
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
  reviewMonth: string;
}) {
  return {
    ...input.response,
    learnings: mapLearningBuckets(input.response, (learning) => deriveLearningProvenance({
      learning,
      recordsBySourceId: input.recordsBySourceId,
      reviewMonth: input.reviewMonth,
    })),
  };
}

export function normalizeUniversalLearningResponseTargetMemoryIds(input: {
  response: UniversalLearningResponse;
  existingMemoryIds: string[];
}): UniversalLearningResponse {
  const normalizeLearning = (learning: UniversalLearningLearningItem) => ({
    ...learning,
    relationshipToExistingMemory: {
      ...learning.relationshipToExistingMemory,
      memoryId: normalizeTargetMemoryId({
        memoryId: learning.relationshipToExistingMemory.memoryId,
        existingMemoryIds: input.existingMemoryIds,
        context: `Learning ${learning.learningId}`,
      }),
    },
  });

  return {
    ...input.response,
    learnings: mapLearningBuckets(input.response, normalizeLearning),
    memoryActions: mapActions(input.response, (action) => ({
      ...action,
      targetMemoryId: normalizeTargetMemoryId({
        memoryId: action.targetMemoryId,
        existingMemoryIds: input.existingMemoryIds,
        context: `Memory action ${action.action} for learning ${action.basedOnLearningId}`,
      }),
    })),
  };
}

export function normalizeUniversalLearningResponseSourceIds(input: {
  response: UniversalLearningResponse;
  reviewedSourceIds: string[];
  reviewedRecords?: UniversalLearningBusinessRecord[];
  recordsBySourceId?: Map<string, UniversalLearningBusinessRecord>;
  existingMemories?: UniversalLearningMemoryPackItem[];
}): UniversalLearningResponse {
  const recordsBySourceId = input.recordsBySourceId ?? new Map<string, UniversalLearningBusinessRecord>();
  const sourceResolutionCandidates = buildSourceResolutionCandidates({
    reviewedSourceIds: input.reviewedSourceIds,
    recordsBySourceId,
    existingMemories: input.existingMemories,
  });
  return {
    ...input.response,
    learnings: mapLearningBuckets(
      input.response,
      (learning) => normalizeSupportingRecordSourceIds({
        learning,
        reviewedSourceIds: input.reviewedSourceIds,
        reviewedRecords: input.reviewedRecords,
        recordsBySourceId,
        sourceResolutionCandidates,
      }),
    ),
  };
}

export function buildUniversalLearningProvenanceLinkRows(input: {
  organizationId: string;
  memoryId: string;
  learning: UniversalLearningLearningItem;
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
  contradiction: boolean;
}) {
  const rows = input.learning.evidence.supportingRecords.map((reference) => {
    const record = input.recordsBySourceId.get(reference.sourceId);
    const reviewedRecordEntityType = reference.containerType ?? resolveReviewedRecordSourceEntityType(record);
    const sourceEntityType =
      reference.sourceScope === "existing_memory"
        ? "organization_memory_item"
        : reference.sourceScope === "existing_memory_source"
          ? reference.containerType ?? resolveReviewedRecordSourceEntityType(record)
          : reviewedRecordEntityType ?? null;
    const sourceEntityId =
      reference.sourceScope === "existing_memory"
        ? reference.memoryId ?? reference.sourceId
        : reference.sourceId;

    if (!sourceEntityType || !sourceEntityId) {
      throw new UniversalLearningSourceIdNormalizationError(
        `Learning ${input.learning.learningId} produced an invalid provenance link payload.`,
      );
    }

    return {
      organization_memory_item_id: input.memoryId,
      organization_id: input.organizationId,
      link_type: input.contradiction ? "contradiction" : "supporting",
      source_event_id: null,
      source_ai_interaction_id: null,
      source_correction_event_id: null,
      source_validation_case_id: null,
      source_entity_type: sourceEntityType,
      source_entity_id: sourceEntityId,
      weight: 1,
      confidence_delta: input.contradiction ? -0.08 : 0.08,
      note:
        reference.sourceScope === "existing_memory_source" && reference.memoryId
          ? `${reference.reason} (via memory ${reference.memoryId})`
          : reference.reason,
    };
  });

  const deduped = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    deduped.set(
      [
        row.organization_memory_item_id,
        row.link_type,
        row.source_event_id ?? "",
        row.source_ai_interaction_id ?? "",
        row.source_correction_event_id ?? "",
        row.source_validation_case_id ?? "",
        row.source_entity_type ?? "",
        row.source_entity_id ?? "",
      ].join(":"),
      row,
    );
  }

  return Array.from(deduped.values());
}

function assertUniversalLearningProvenancePayloads(input: {
  organizationId: string;
  response: UniversalLearningResponse;
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
}) {
  for (const { learning } of flattenLearnings(input.response).values()) {
    buildUniversalLearningProvenanceLinkRows({
      organizationId: input.organizationId,
      memoryId: "00000000-0000-0000-0000-000000000000",
      learning,
      recordsBySourceId: input.recordsBySourceId,
      contradiction: false,
    });
  }
}

function preflightUniversalLearningMemoryActions(input: {
  response: UniversalLearningResponse;
}) {
  const learnings = flattenLearnings(input.response);
  const seenActionKeys = new Set<string>();

  for (const action of flattenActions(input.response)) {
    if (!learnings.has(action.basedOnLearningId)) {
      throw new UniversalLearningActionPreflightError(
        `Memory action ${action.action} referenced missing learningId "${action.basedOnLearningId}".`,
      );
    }

    if (action.action === "create" && action.targetMemoryId !== null) {
      throw new UniversalLearningActionPreflightError(
        `Create action for learning ${action.basedOnLearningId} must not include targetMemoryId.`,
      );
    }

    if ((action.action === "reinforce" || action.action === "update" || action.action === "retire") && !action.targetMemoryId) {
      throw new UniversalLearningActionPreflightError(
        `${action.action} action for learning ${action.basedOnLearningId} must include targetMemoryId.`,
      );
    }

    const learning = learnings.get(action.basedOnLearningId)?.learning;
    if (
      learning &&
      (action.action === "create" || action.action === "reinforce" || action.action === "update") &&
      !learning.evidence.supportingRecords.some((reference) => reference.sourceScope === "reviewed_record")
    ) {
      throw new UniversalLearningActionPreflightError(
        `${action.action} action for learning ${action.basedOnLearningId} must cite at least one current reviewed record.`,
      );
    }

    const actionKey = `${action.action}:${action.targetMemoryId ?? "new"}:${action.basedOnLearningId}`;
    if (seenActionKeys.has(actionKey)) {
      continue;
    }
    seenActionKeys.add(actionKey);
  }
}

async function getMemoryById(admin: any, organizationId: string, memoryId: string) {
  const { data, error } = await admin
    .from("organization_memory_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", memoryId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toRecord(data) : null;
}

async function upsertMemoryItem(admin: any, input: {
  organizationId: string;
  containerType: string;
  title: string;
  summary: string;
  learning: UniversalLearningLearningItem;
  reviewRunId: string;
  bucket: string;
}) {
  const now = new Date().toISOString();
  const memoryKey = buildMemoryKey({
    organizationId: input.organizationId,
    containerType: input.containerType,
    title: input.title,
  });
  const memoryType = `${input.containerType}_learning`;
  const memoryValue = {
    containerType: input.containerType,
    statement: input.learning.statement,
    whyItMatters: input.learning.whyItMatters,
    relationshipToExistingMemory: input.learning.relationshipToExistingMemory,
    provenance: input.learning.provenance,
    learningBucket: input.bucket,
  };
  const evidenceSummary = {
    reviewRunId: input.reviewRunId,
    evidence: input.learning.evidence,
    confidence: input.learning.confidence,
    reviewSummary: summarizeRecordEvidence(input.learning.evidence.recordCount),
  };

  const payload = {
    organization_id: input.organizationId,
    memory_category: "construction_decision",
    memory_type: memoryType,
    memory_key: memoryKey,
    title: input.title,
    summary: input.summary,
    memory_value: memoryValue,
    evidence_summary: evidenceSummary,
    confidence_score: clampConfidence(input.learning.confidence.score),
    base_confidence_score: clampConfidence(input.learning.confidence.score),
    confidence_reason_summary: input.learning.confidence.reasoning,
    derived_from_total_count: Math.max(1, input.learning.evidence.recordCount),
    is_active: true,
    first_derived_at: now,
    last_derived_at: now,
    memory_domain_signature: buildMemoryDomainSignature({
      containerType: input.containerType,
      title: input.title,
    }),
  };

  const { data, error } = await admin
    .from("organization_memory_items")
    .upsert(payload, {
      onConflict: "organization_id,memory_category,memory_type,memory_key",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toRecord(data);
}

async function updateMemoryItem(admin: any, input: {
  memoryId: string;
  organizationId: string;
  patch: JsonRecord;
}) {
  const { data, error } = await admin
    .from("organization_memory_items")
    .update(input.patch)
    .eq("organization_id", input.organizationId)
    .eq("id", input.memoryId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toRecord(data);
}

async function insertLifecycleHistory(admin: any, input: {
  organizationId: string;
  memoryId: string;
  lifecycleEventType: string;
  reasonSummary: string;
  beforeSnapshot: JsonRecord | null;
  afterSnapshot: JsonRecord | null;
}) {
  const lifecycleId = randomUUID();
  const { error } = await admin
    .from("organization_memory_lifecycle_history")
    .insert({
      id: lifecycleId,
      organization_id: input.organizationId,
      memory_id: input.memoryId,
      lifecycle_event_type: input.lifecycleEventType,
      event_origin_type: "manual_admin",
      reason_summary: input.reasonSummary,
      before_memory_snapshot: input.beforeSnapshot,
      after_memory_snapshot: input.afterSnapshot,
    });

  if (error) {
    throw new Error(error.message);
  }

  return lifecycleId;
}

async function insertConfidenceHistory(admin: any, input: {
  organizationId: string;
  memoryId: string;
  lifecycleHistoryId: string | null;
  beforeScore: number | null;
  afterScore: number;
  reasonType: "memory_created" | "reinforcement" | "recalculation" | "retirement";
  reasonSummary: string;
  contributorSnapshot: JsonRecord;
}) {
  const { data, error } = await admin
    .from("organization_memory_confidence_history")
    .insert({
      organization_id: input.organizationId,
      memory_id: input.memoryId,
      confidence_before: input.beforeScore,
      confidence_after: clampConfidence(input.afterScore),
      confidence_delta:
        input.beforeScore === null ? null : clampConfidence(input.afterScore) - input.beforeScore,
      reason_type: input.reasonType,
      reason_summary: input.reasonSummary,
      contributor_snapshot: input.contributorSnapshot,
      lifecycle_history_id: input.lifecycleHistoryId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.id === "string" ? data.id : null;
}

async function writeProvenanceLinks(admin: any, input: {
  organizationId: string;
  memoryId: string;
  learning: UniversalLearningLearningItem;
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
  contradiction: boolean;
}) {
  const rows = buildUniversalLearningProvenanceLinkRows(input);

  if (rows.length === 0) {
    return;
  }

  const { error } = await admin
    .from("organization_memory_links")
    .upsert(rows, {
      onConflict: "organization_memory_item_id,source_entity_type,source_entity_id,link_type",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(error.message);
  }
}

async function applyCreateOrUpdate(admin: any, input: {
  reviewRunId: string;
  selection: UniversalLearningRunSelection;
  action: UniversalLearningMemoryAction;
  learning: UniversalLearningLearningItem;
  bucket: string;
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
  targetMode: "create" | "update" | "reinforce";
}) {
  const existing =
    input.action.targetMemoryId
      ? await getMemoryById(admin, input.selection.organizationId, input.action.targetMemoryId)
      : null;
  const beforeSnapshot = existing;
  const memoryTitle =
    input.action.proposedMemoryTitle
    ?? (typeof existing?.title === "string" ? existing.title : null)
    ?? input.learning.title;
  const memorySummary =
    input.action.proposedMemorySummary.trim().length > 0
      ? input.action.proposedMemorySummary
      : typeof existing?.summary === "string"
        ? existing.summary
        : input.learning.statement;

  let row: JsonRecord;
  let lifecycleType: string;
  let reasonType: "memory_created" | "reinforcement" | "recalculation";

  if (!existing && input.targetMode !== "update" && input.targetMode !== "reinforce") {
    row = await upsertMemoryItem(admin, {
      organizationId: input.selection.organizationId,
      containerType: input.selection.containerType,
      title: memoryTitle,
      summary: memorySummary,
      learning: input.learning,
      reviewRunId: input.reviewRunId,
      bucket: input.bucket,
    });
    lifecycleType = "memory_created";
    reasonType = "memory_created";
  } else {
    const baseline = existing
      ?? await upsertMemoryItem(admin, {
        organizationId: input.selection.organizationId,
        containerType: input.selection.containerType,
        title: memoryTitle,
        summary: memorySummary,
        learning: input.learning,
        reviewRunId: input.reviewRunId,
        bucket: input.bucket,
      });
    const previousConfidence =
      typeof baseline.confidence_score === "number" ? baseline.confidence_score : Number(baseline.confidence_score ?? 0);
    const nextConfidence =
      input.targetMode === "reinforce"
        ? clampConfidence(Math.max(previousConfidence, input.learning.confidence.score) + Math.max(0, input.action.confidenceAdjustment))
        : clampConfidence(Math.max(previousConfidence, input.learning.confidence.score));
    row = await updateMemoryItem(admin, {
      memoryId: String(baseline.id),
      organizationId: input.selection.organizationId,
      patch: {
        title: memoryTitle,
        summary: memorySummary,
        memory_value: {
          ...(toRecord(baseline.memory_value)),
          containerType: input.selection.containerType,
          statement: input.learning.statement,
          whyItMatters: input.learning.whyItMatters,
          provenance: input.learning.provenance,
          learningBucket: input.bucket,
        },
        evidence_summary: {
          ...(toRecord(baseline.evidence_summary)),
          reviewRunId: input.reviewRunId,
          evidence: input.learning.evidence,
          confidence: input.learning.confidence,
        },
        confidence_score: nextConfidence,
        base_confidence_score: clampConfidence(input.learning.confidence.score),
        confidence_reason_summary: input.learning.confidence.reasoning,
        derived_from_total_count:
          Math.max(0, Number(baseline.derived_from_total_count ?? 0)) + Math.max(1, input.learning.evidence.recordCount),
        reinforcement_count:
          input.targetMode === "reinforce"
            ? Math.max(0, Number(baseline.reinforcement_count ?? 0)) + 1
            : Math.max(0, Number(baseline.reinforcement_count ?? 0)),
        last_reinforced_at:
          input.targetMode === "reinforce" ? new Date().toISOString() : baseline.last_reinforced_at ?? null,
        last_derived_at: new Date().toISOString(),
        is_active: true,
        retired_at: null,
        retirement_reason_summary: null,
      },
    });
    lifecycleType = input.targetMode === "reinforce" ? "memory_reinforced" : "memory_updated";
    reasonType = input.targetMode === "reinforce" ? "reinforcement" : "recalculation";
  }

  const afterConfidence =
    typeof row.confidence_score === "number" ? row.confidence_score : Number(row.confidence_score ?? 0);
  const lifecycleHistoryId = await insertLifecycleHistory(admin, {
    organizationId: input.selection.organizationId,
    memoryId: String(row.id),
    lifecycleEventType: lifecycleType,
    reasonSummary: input.action.reason,
    beforeSnapshot,
    afterSnapshot: row,
  });

  const confidenceHistoryId = await insertConfidenceHistory(admin, {
    organizationId: input.selection.organizationId,
    memoryId: String(row.id),
    lifecycleHistoryId,
    beforeScore:
      beforeSnapshot && beforeSnapshot.confidence_score !== undefined
        ? Number(beforeSnapshot.confidence_score)
        : null,
    afterScore: afterConfidence,
    reasonType,
    reasonSummary: input.action.reason,
    contributorSnapshot: {
      learningId: input.learning.learningId,
      reviewRunId: input.reviewRunId,
      targetMode: input.targetMode,
    },
  });

  await updateMemoryItem(admin, {
    memoryId: String(row.id),
    organizationId: input.selection.organizationId,
    patch: {
      last_confidence_history_id: confidenceHistoryId,
      last_confidence_calculated_at: new Date().toISOString(),
      ...(input.targetMode === "reinforce"
        ? {
            last_reinforced_lifecycle_history_id: lifecycleHistoryId,
          }
        : {}),
    },
  });

  await writeProvenanceLinks(admin, {
    organizationId: input.selection.organizationId,
    memoryId: String(row.id),
    learning: input.learning,
    recordsBySourceId: input.recordsBySourceId,
    contradiction: false,
  });

  await writeUniversalLearningActionResult({
    reviewRunId: input.reviewRunId,
    organizationId: input.selection.organizationId,
    learningId: input.learning.learningId,
    actionKey: buildUniversalLearningActionKey({
      reviewRunId: input.reviewRunId,
      action: input.action.action,
      basedOnLearningId: input.action.basedOnLearningId,
      targetMemoryId: String(row.id),
    }),
    actionType: input.action.action,
    resultStatus: "applied",
    targetMemoryId: String(row.id),
    createdMemoryId: input.targetMode === "create" ? String(row.id) : null,
    updatedMemoryId: input.targetMode !== "create" ? String(row.id) : null,
    confidenceAdjustment: input.action.confidenceAdjustment,
    reason: input.action.reason,
  });

  return String(row.id);
}

async function applyRetirement(admin: any, input: {
  reviewRunId: string;
  selection: UniversalLearningRunSelection;
  action: UniversalLearningMemoryAction;
  learning: UniversalLearningLearningItem;
  recordsBySourceId: Map<string, UniversalLearningBusinessRecord>;
}) {
  if (!input.action.targetMemoryId) {
    await writeUniversalLearningActionResult({
      reviewRunId: input.reviewRunId,
      organizationId: input.selection.organizationId,
      learningId: input.learning.learningId,
      actionKey: buildUniversalLearningActionKey({
        reviewRunId: input.reviewRunId,
        action: input.action.action,
        basedOnLearningId: input.action.basedOnLearningId,
      }),
      actionType: input.action.action,
      resultStatus: "skipped",
      reason: "Retire action skipped because targetMemoryId was missing.",
    });
    return;
  }

  const existing = await getMemoryById(admin, input.selection.organizationId, input.action.targetMemoryId);
  if (!existing) {
    await writeUniversalLearningActionResult({
      reviewRunId: input.reviewRunId,
      organizationId: input.selection.organizationId,
      learningId: input.learning.learningId,
      actionKey: buildUniversalLearningActionKey({
        reviewRunId: input.reviewRunId,
        action: input.action.action,
        basedOnLearningId: input.action.basedOnLearningId,
        targetMemoryId: input.action.targetMemoryId,
      }),
      actionType: input.action.action,
      resultStatus: "skipped",
      targetMemoryId: input.action.targetMemoryId,
      reason: "Retire action skipped because the target memory was not found.",
    });
    return;
  }

  const updated = await updateMemoryItem(admin, {
    memoryId: input.action.targetMemoryId,
    organizationId: input.selection.organizationId,
    patch: {
      is_active: false,
      retired_at: new Date().toISOString(),
      retirement_basis_hash: hashString(`${input.reviewRunId}:${input.learning.learningId}:${input.action.reason}`),
      retirement_reason_summary: input.action.reason,
      contradiction_count: Math.max(0, Number(existing.contradiction_count ?? 0)) + 1,
      last_contradicted_at: new Date().toISOString(),
    },
  });

  const lifecycleHistoryId = await insertLifecycleHistory(admin, {
    organizationId: input.selection.organizationId,
    memoryId: input.action.targetMemoryId,
    lifecycleEventType: "memory_retired",
    reasonSummary: input.action.reason,
    beforeSnapshot: existing,
    afterSnapshot: updated,
  });

  const confidenceHistoryId = await insertConfidenceHistory(admin, {
    organizationId: input.selection.organizationId,
    memoryId: input.action.targetMemoryId,
    lifecycleHistoryId,
    beforeScore: Number(existing.confidence_score ?? 0),
    afterScore: clampConfidence(Math.max(0, Number(existing.confidence_score ?? 0) - 0.15)),
    reasonType: "retirement",
    reasonSummary: input.action.reason,
    contributorSnapshot: {
      learningId: input.learning.learningId,
      reviewRunId: input.reviewRunId,
      targetMode: "retire",
    },
  });

  await updateMemoryItem(admin, {
    memoryId: input.action.targetMemoryId,
    organizationId: input.selection.organizationId,
    patch: {
      retired_lifecycle_history_id: lifecycleHistoryId,
      last_confidence_history_id: confidenceHistoryId,
      last_confidence_calculated_at: new Date().toISOString(),
    },
  });

  await writeProvenanceLinks(admin, {
    organizationId: input.selection.organizationId,
    memoryId: input.action.targetMemoryId,
    learning: input.learning,
    recordsBySourceId: input.recordsBySourceId,
    contradiction: true,
  });

  await writeUniversalLearningActionResult({
    reviewRunId: input.reviewRunId,
    organizationId: input.selection.organizationId,
    learningId: input.learning.learningId,
    actionKey: buildUniversalLearningActionKey({
      reviewRunId: input.reviewRunId,
      action: input.action.action,
      basedOnLearningId: input.action.basedOnLearningId,
      targetMemoryId: input.action.targetMemoryId,
    }),
    actionType: input.action.action,
    resultStatus: "applied",
    targetMemoryId: input.action.targetMemoryId,
    updatedMemoryId: input.action.targetMemoryId,
    confidenceAdjustment: input.action.confidenceAdjustment,
    reason: input.action.reason,
  });
}

export async function applyUniversalLearningMemoryActions(input: {
  reviewRunId: string;
  selection: UniversalLearningRunSelection;
  response: UniversalLearningResponse;
  records: UniversalLearningBusinessRecord[];
  existingMemories?: UniversalLearningMemoryPackItem[];
}) {
  resetUniversalLearningSourceRefCorrectionDiagnostics();
  const reviewedSourceIds = input.records.map((record) => record.source.sourceId);
  const recordsBySourceId = buildUniversalLearningRecordLookupMap(input.records);
  const sourceNormalizedResponse = normalizeUniversalLearningResponseSourceIds({
    response: input.response,
    reviewedSourceIds,
    reviewedRecords: input.records,
    recordsBySourceId,
    existingMemories: input.existingMemories,
  });
  const normalizedResponse = normalizeUniversalLearningResponseTargetMemoryIds({
    response: sourceNormalizedResponse,
    existingMemoryIds: (input.existingMemories ?? []).map((memory) => memory.id),
  });
  const provenanceNormalizedResponse = deriveResponseProvenance({
    response: normalizedResponse,
    recordsBySourceId,
    reviewMonth: input.selection.reviewMonth,
  });
  preflightUniversalLearningMemoryActions({
    response: provenanceNormalizedResponse,
  });
  assertUniversalLearningProvenancePayloads({
    organizationId: input.selection.organizationId,
    response: provenanceNormalizedResponse,
    recordsBySourceId,
  });

  const admin = createAdminSupabaseClient() as any;
  const learnings = flattenLearnings(provenanceNormalizedResponse);
  let appliedCount = 0;

  for (const action of flattenActions(provenanceNormalizedResponse)) {
    const learningEntry = learnings.get(action.basedOnLearningId);
    if (!learningEntry) {
      await writeUniversalLearningActionResult({
        reviewRunId: input.reviewRunId,
        organizationId: input.selection.organizationId,
        learningId: action.basedOnLearningId,
        actionKey: buildUniversalLearningActionKey({
          reviewRunId: input.reviewRunId,
          action: action.action,
          basedOnLearningId: action.basedOnLearningId,
          targetMemoryId: action.targetMemoryId,
        }),
        actionType: action.action,
        resultStatus: "failed",
        targetMemoryId: action.targetMemoryId,
        reason: "Memory action referenced a learningId that was not present in the review response.",
      });
      continue;
    }

    try {
      if (action.action === "no_action") {
        await writeUniversalLearningActionResult({
          reviewRunId: input.reviewRunId,
          organizationId: input.selection.organizationId,
          learningId: learningEntry.learning.learningId,
          actionKey: buildUniversalLearningActionKey({
            reviewRunId: input.reviewRunId,
            action: action.action,
            basedOnLearningId: action.basedOnLearningId,
            targetMemoryId: action.targetMemoryId,
          }),
          actionType: action.action,
          resultStatus: "skipped",
          targetMemoryId: action.targetMemoryId,
          reason: action.reason,
        });
        continue;
      }

      if (action.action === "retire") {
        await applyRetirement(admin, {
          reviewRunId: input.reviewRunId,
          selection: input.selection,
          action,
          learning: learningEntry.learning,
          recordsBySourceId,
        });
        appliedCount += 1;
        continue;
      }

      const mode = action.action === "create"
        ? "create"
        : action.action === "reinforce"
          ? "reinforce"
          : "update";

      await applyCreateOrUpdate(admin, {
        reviewRunId: input.reviewRunId,
        selection: input.selection,
        action,
        learning: learningEntry.learning,
        bucket: learningEntry.bucket,
        recordsBySourceId,
        targetMode: mode,
      });
      appliedCount += 1;
    } catch (error) {
      await writeUniversalLearningActionResult({
        reviewRunId: input.reviewRunId,
        organizationId: input.selection.organizationId,
        learningId: learningEntry.learning.learningId,
        actionKey: buildUniversalLearningActionKey({
          reviewRunId: input.reviewRunId,
          action: action.action,
          basedOnLearningId: action.basedOnLearningId,
          targetMemoryId: action.targetMemoryId,
        }),
        actionType: action.action,
        resultStatus: "failed",
        targetMemoryId: action.targetMemoryId,
        reason: error instanceof Error ? error.message : "Memory action failed.",
      });
      throw error;
    }
  }

  return { appliedCount };
}
