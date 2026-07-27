import type {
  UniversalLearningEvidenceReference,
  UniversalLearningLearningItem,
  UniversalLearningMemoryAction,
  UniversalLearningResponse,
} from "@/lib/universal-learning/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateEvidenceReference(value: unknown): value is UniversalLearningEvidenceReference {
  return (
    isRecord(value) &&
    isString(value.sourceId) &&
    isString(value.reason)
  );
}

function validateLearningItem(value: unknown): value is UniversalLearningLearningItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.learningId) &&
    isString(value.title) &&
    isString(value.statement) &&
    isString(value.whyItMatters) &&
    isRecord(value.confidence) &&
    isFiniteNumber(value.confidence.score) &&
    value.confidence.score >= 0 &&
    value.confidence.score <= 1 &&
    isString(value.confidence.label) &&
    isString(value.confidence.reasoning) &&
    isRecord(value.evidence) &&
    isFiniteNumber(value.evidence.recordCount) &&
    (value.evidence.projectCount === undefined || isFiniteNumber(value.evidence.projectCount)) &&
    (value.evidence.supplierCount === undefined || isFiniteNumber(value.evidence.supplierCount)) &&
    (value.evidence.timeSpan === undefined || isString(value.evidence.timeSpan)) &&
    Array.isArray(value.evidence.supportingRecords) &&
    value.evidence.supportingRecords.every(validateEvidenceReference) &&
    isRecord(value.relationshipToExistingMemory) &&
    (value.relationshipToExistingMemory.memoryId === null || isString(value.relationshipToExistingMemory.memoryId)) &&
    isString(value.relationshipToExistingMemory.status) &&
    isString(value.relationshipToExistingMemory.explanation) &&
    isRecord(value.provenance) &&
    isString(value.provenance.reviewPeriodStart) &&
    isString(value.provenance.reviewPeriodEnd) &&
    isRecord(value.provenance.relevantEntities) &&
    Array.isArray(value.provenance.relevantEntities.projectIds) &&
    Array.isArray(value.provenance.relevantEntities.supplierIds) &&
    Array.isArray(value.provenance.relevantEntities.clientIds) &&
    Array.isArray(value.provenance.relevantEntities.materialIds)
  );
}

function validateMemoryAction(value: unknown): value is UniversalLearningMemoryAction {
  return (
    isRecord(value) &&
    isString(value.action) &&
    (value.targetMemoryId === null || isString(value.targetMemoryId)) &&
    isString(value.basedOnLearningId) &&
    (value.proposedMemoryTitle === null || isString(value.proposedMemoryTitle)) &&
    typeof value.proposedMemorySummary === "string" &&
    isFiniteNumber(value.confidenceAdjustment) &&
    value.confidenceAdjustment >= -1 &&
    value.confidenceAdjustment <= 1 &&
    isString(value.reason)
  );
}

function validateLearningList(value: unknown) {
  return Array.isArray(value) && value.every(validateLearningItem);
}

export function validateUniversalConstructionLearningResponse(
  value: unknown,
): { success: true; data: UniversalLearningResponse } | { success: false; error: string } {
  if (!isRecord(value)) {
    return { success: false, error: "Response must be an object." };
  }
  if (!isRecord(value.reviewSummary) || !isRecord(value.learnings) || !isRecord(value.memoryActions)) {
    return { success: false, error: "Response must include reviewSummary, learnings, and memoryActions." };
  }
  if (
    !isString(value.reviewSummary.overallAssessment) ||
    !Array.isArray(value.reviewSummary.dominantThemes) ||
    !isString(value.reviewSummary.confidenceNotes)
  ) {
    return { success: false, error: "Invalid reviewSummary." };
  }

  const learningKeys = [
    "observations",
    "emergingPatterns",
    "reinforcedPatterns",
    "durablePatterns",
    "changingBehaviors",
    "contradictions",
    "needsMoreEvidence",
  ] as const;

  for (const key of learningKeys) {
    if (!validateLearningList(value.learnings[key])) {
      return { success: false, error: `Invalid learnings.${key}.` };
    }
  }

  const actionKeys = ["create", "reinforce", "update", "retireOrDeactivate", "noAction"] as const;
  for (const key of actionKeys) {
    if (!Array.isArray(value.memoryActions[key]) || !value.memoryActions[key].every(validateMemoryAction)) {
      return { success: false, error: `Invalid memoryActions.${key}.` };
    }
  }

  return {
    success: true,
    data: value as UniversalLearningResponse,
  };
}
