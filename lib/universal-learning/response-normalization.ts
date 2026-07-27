import type {
  UniversalLearningEvidenceReference,
  UniversalLearningLearningItem,
  UniversalLearningMemoryAction,
  UniversalLearningResponse,
} from "@/lib/universal-learning/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getObjectValue(
  value: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const next = value[key];
    if (isRecord(next)) {
      return next;
    }
  }
  return null;
}

function getArrayValue(
  value: Record<string, unknown>,
  keys: string[],
): unknown[] {
  for (const key of keys) {
    const next = value[key];
    if (Array.isArray(next)) {
      return next;
    }
  }
  return [];
}

function toStringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeConfidenceAdjustment(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  if (Math.abs(value) <= 1) {
    return value;
  }

  if (Number.isInteger(value) && Math.abs(value) <= 100) {
    return value / 100;
  }

  return Math.max(-1, Math.min(1, value));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function buildFallbackTimeSpan(provenance: Record<string, unknown>) {
  const start = toStringOrEmpty(provenance.reviewPeriodStart);
  const end = toStringOrEmpty(provenance.reviewPeriodEnd);
  if (start && end) {
    return `${start} to ${end}`;
  }
  return "Review period not provided.";
}

function coerceConfidence(value: unknown) {
  if (isRecord(value)) {
    const score = typeof value.score === "number" ? value.score : (
      typeof value.label === "string" ? confidenceLabelToScore(value.label) : 0.5
    );
    const label = normalizeConfidenceLabel(
      typeof value.label === "string" ? value.label : scoreToConfidenceLabel(score),
    );
    return {
      score,
      label,
      reasoning: toStringOrEmpty(value.reasoning ?? value.reason ?? value.basis ?? "Model supplied a confidence judgement."),
    };
  }

  if (typeof value === "string") {
    const label = normalizeConfidenceLabel(value);
    return {
      score: confidenceLabelToScore(label),
      label,
      reasoning: "Model supplied a confidence label only.",
    };
  }

  return {
    score: 0.5,
    label: "moderate" as const,
    reasoning: "Confidence details were not provided.",
  };
}

function normalizeConfidenceLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "very high" || normalized === "very_high") {
    return "very_high" as const;
  }
  if (normalized === "high") {
    return "high" as const;
  }
  if (normalized === "low") {
    return "low" as const;
  }
  return "moderate" as const;
}

function scoreToConfidenceLabel(value: number) {
  if (value >= 0.9) return "very_high" as const;
  if (value >= 0.7) return "high" as const;
  if (value <= 0.3) return "low" as const;
  return "moderate" as const;
}

function confidenceLabelToScore(value: string) {
  const normalized = normalizeConfidenceLabel(value);
  switch (normalized) {
    case "very_high":
      return 0.9;
    case "high":
      return 0.75;
    case "low":
      return 0.25;
    default:
      return 0.5;
  }
}

function coerceSupportingRecord(value: unknown): UniversalLearningEvidenceReference | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceId = typeof value.sourceId === "string"
    ? value.sourceId
    : typeof value.id === "string"
      ? value.id
      : "";

  if (!sourceId) {
    return null;
  }

  return {
    containerType: typeof value.containerType === "string" ? value.containerType as UniversalLearningEvidenceReference["containerType"] : undefined,
    sourceId,
    sourceScope:
      value.sourceScope === "reviewed_record" || value.sourceScope === "existing_memory" || value.sourceScope === "existing_memory_source"
        ? value.sourceScope
        : value.source_scope === "reviewed_record" || value.source_scope === "existing_memory" || value.source_scope === "existing_memory_source"
          ? value.source_scope
          : undefined,
    memoryId:
      value.memoryId === null || value.memory_id === null
        ? null
        : typeof value.memoryId === "string"
          ? value.memoryId
          : typeof value.memory_id === "string"
            ? value.memory_id
            : undefined,
    reason: typeof value.reason === "string"
      ? value.reason
      : typeof value.note === "string"
        ? value.note
        : "Evidence cited.",
  };
}

function coerceEvidence(value: unknown, provenance: Record<string, unknown>) {
  if (Array.isArray(value)) {
    const supportingRecords = value
      .map(coerceSupportingRecord)
      .filter((record): record is UniversalLearningEvidenceReference => record !== null);

    return {
      recordCount: supportingRecords.length,
      projectCount: 0,
      supplierCount: 0,
      timeSpan: buildFallbackTimeSpan(provenance),
      supportingRecords,
    };
  }

  if (isRecord(value)) {
    const supportingRecordsRaw = Array.isArray(value.supportingRecords)
      ? value.supportingRecords
      : Array.isArray(value.supporting_records)
        ? value.supporting_records
        : Array.isArray(value.sourceRefs)
          ? value.sourceRefs
          : Array.isArray(value.source_refs)
            ? value.source_refs
            : [];
    const supportingRecords = supportingRecordsRaw
      .map(coerceSupportingRecord)
      .filter((record): record is UniversalLearningEvidenceReference => record !== null);

    return {
      recordCount: typeof value.recordCount === "number"
        ? value.recordCount
        : typeof value.record_count === "number"
          ? value.record_count
          : supportingRecords.length,
      projectCount: typeof value.projectCount === "number"
        ? value.projectCount
        : typeof value.project_count === "number"
          ? value.project_count
          : 0,
      supplierCount: typeof value.supplierCount === "number"
        ? value.supplierCount
        : typeof value.supplier_count === "number"
          ? value.supplier_count
          : 0,
      timeSpan: toStringOrEmpty(value.timeSpan ?? value.time_span) || buildFallbackTimeSpan(provenance),
      supportingRecords,
    };
  }

  return {
    recordCount: 0,
    projectCount: 0,
    supplierCount: 0,
    timeSpan: buildFallbackTimeSpan(provenance),
    supportingRecords: [],
  };
}

function coerceRelationship(value: unknown): UniversalLearningLearningItem["relationshipToExistingMemory"] {
  if (!isRecord(value)) {
    return {
      status: "insufficient",
      memoryId: null,
      explanation: "Relationship to existing memory was not provided.",
    };
  }

  const rawStatus = typeof value.status === "string" ? value.status.trim().toLowerCase() : "";
  const status = rawStatus === "reinforces" || rawStatus === "reinforces_existing"
    ? "reinforces_existing"
    : rawStatus === "changes" || rawStatus === "changes_existing" || rawStatus === "update"
      ? "changes_existing"
      : rawStatus === "contradicts" || rawStatus === "contradicts_existing"
        ? "contradicts_existing"
        : rawStatus === "new"
          ? "new"
          : "insufficient";

  return {
    status,
    memoryId: typeof value.memoryId === "string"
      ? value.memoryId
      : typeof value.memory_id === "string"
        ? value.memory_id
        : null,
    explanation: toStringOrEmpty(value.explanation ?? value.reason ?? "Relationship inferred from the returned learning."),
  };
}

function coerceProvenance(value: unknown) {
  const record = isRecord(value) ? value : {};
  const relevantEntities = isRecord(record.relevantEntities)
    ? record.relevantEntities
    : isRecord(record.relevant_entities)
      ? record.relevant_entities
      : {};

  const projectIds = new Set<string>([
    ...toStringArray(relevantEntities.projectIds),
    ...toStringArray(relevantEntities.project_ids),
    ...(typeof record.projectId === "string" ? [record.projectId] : []),
  ]);
  const supplierIds = new Set<string>([
    ...toStringArray(relevantEntities.supplierIds),
    ...toStringArray(relevantEntities.supplier_ids),
    ...(typeof record.supplierId === "string" ? [record.supplierId] : []),
  ]);
  const clientIds = new Set<string>([
    ...toStringArray(relevantEntities.clientIds),
    ...toStringArray(relevantEntities.client_ids),
    ...(typeof record.clientId === "string" ? [record.clientId] : []),
  ]);
  const materialIds = new Set<string>([
    ...toStringArray(relevantEntities.materialIds),
    ...toStringArray(relevantEntities.material_ids),
    ...(typeof record.materialId === "string" ? [record.materialId] : []),
  ]);

  return {
    reviewPeriodStart: toStringOrEmpty(record.reviewPeriodStart ?? record.review_period_start ?? "unknown"),
    reviewPeriodEnd: toStringOrEmpty(record.reviewPeriodEnd ?? record.review_period_end ?? "unknown"),
    relevantEntities: {
      projectIds: Array.from(projectIds),
      supplierIds: Array.from(supplierIds),
      clientIds: Array.from(clientIds),
      materialIds: Array.from(materialIds),
    },
  };
}

function coerceLearningItem(value: unknown, index: number): UniversalLearningLearningItem {
  const record = isRecord(value) ? value : {};
  const provenance = coerceProvenance(record.provenance);
  const learningId = toStringOrEmpty(record.learningId ?? record.learning_id ?? record.id) || `learning-${index + 1}`;
  const statement = toStringOrEmpty(record.statement ?? record.summary) || "Construction behavior supported by the cited evidence.";

  return {
    learningId,
    title: toStringOrEmpty(record.title) || statement.slice(0, 96) || `Learning ${index + 1}`,
    statement,
    whyItMatters: toStringOrEmpty(record.whyItMatters ?? record.why_it_matters ?? record.importance) || "This may matter to estimating, procurement, delivery, or commercial control.",
    confidence: coerceConfidence(record.confidence),
    evidence: coerceEvidence(record.evidence, provenance),
    relationshipToExistingMemory: coerceRelationship(
      record.relationshipToExistingMemory ?? record.relationship_to_existing_memory ?? record.existingMemory ?? record.existing_memory,
    ),
    provenance,
  };
}

function coerceLearningList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => coerceLearningItem(item, index));
}

function normalizeActionName(value: unknown, fallback: UniversalLearningMemoryAction["action"]) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "create" || raw === "create_memory") {
    return "create" as const;
  }
  if (raw === "reinforce" || raw === "reinforce_existing" || raw === "reinforce_memory") {
    return "reinforce" as const;
  }
  if (raw === "update" || raw === "update_memory" || raw === "changes_existing") {
    return "update" as const;
  }
  if (raw === "retire" || raw === "retire_memory" || raw === "deactivate" || raw === "retire_or_deactivate") {
    return "retire" as const;
  }
  if (raw === "no_action" || raw === "noaction" || raw === "none" || raw === "skip") {
    return "no_action" as const;
  }
  return fallback;
}

function coerceMemoryAction(value: unknown, fallbackAction: UniversalLearningMemoryAction["action"]): UniversalLearningMemoryAction | null {
  if (!isRecord(value)) {
    return null;
  }

  const basedOnLearningId = toStringOrEmpty(
    value.basedOnLearningId
    ?? value.based_on_learning_id
    ?? value.learningId
    ?? value.learning_id,
  );
  if (!basedOnLearningId) {
    return null;
  }

  const proposedMemoryTitle =
    value.proposedMemoryTitle === null || value.proposed_memory_title === null
      ? null
      : toStringOrEmpty(value.proposedMemoryTitle ?? value.proposed_memory_title ?? value.title) || null;

  return {
    action: normalizeActionName(value.action ?? value.actionType ?? value.action_type, fallbackAction),
    targetMemoryId:
      value.targetMemoryId === null || value.target_memory_id === null
        ? null
        : toStringOrEmpty(value.targetMemoryId ?? value.target_memory_id ?? value.memoryId ?? value.memory_id) || null,
    basedOnLearningId,
    proposedMemoryTitle,
    proposedMemorySummary: toStringOrEmpty(
      value.proposedMemorySummary
      ?? value.proposed_memory_summary
      ?? value.summary
      ?? value.statement,
    ),
    confidenceAdjustment: normalizeConfidenceAdjustment(
      value.confidenceAdjustment
      ?? value.confidence_adjustment,
    ),
    reason: toStringOrEmpty(value.reason ?? value.explanation ?? value.rationale) || "Model did not provide an action reason.",
  };
}

function coerceMemoryActionList(value: unknown[], fallbackAction: UniversalLearningMemoryAction["action"]) {
  return value
    .map((action) => coerceMemoryAction(action, fallbackAction))
    .filter((action): action is UniversalLearningMemoryAction => action !== null);
}

const v2StageToBucket = {
  observation: "observations",
  emerging: "emergingPatterns",
  reinforced: "reinforcedPatterns",
  durable: "durablePatterns",
  changing: "changingBehaviors",
  contradiction: "contradictions",
  needs_more_evidence: "needsMoreEvidence",
} as const;

function normalizeV2Stage(value: unknown): keyof typeof v2StageToBucket {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "observations") return "observation";
  if (raw === "emerging_pattern" || raw === "emerging_patterns") return "emerging";
  if (raw === "reinforced_pattern" || raw === "reinforced_patterns") return "reinforced";
  if (raw === "durable_pattern" || raw === "durable_patterns") return "durable";
  if (raw === "changing_behavior" || raw === "changing_behaviour" || raw === "changing_behaviors" || raw === "changing_behaviours") return "changing";
  if (raw === "contradictions") return "contradiction";
  if (raw === "needs_more_evidence" || raw === "needs-more-evidence" || raw === "insufficient") return "needs_more_evidence";
  if (raw in v2StageToBucket) return raw as keyof typeof v2StageToBucket;
  return "observation";
}

function coerceV2Learnings(value: unknown[]) {
  const learnings: UniversalLearningResponse["learnings"] = {
    observations: [],
    emergingPatterns: [],
    reinforcedPatterns: [],
    durablePatterns: [],
    changingBehaviors: [],
    contradictions: [],
    needsMoreEvidence: [],
  };

  value.forEach((item, index) => {
    const record = isRecord(item) ? item : {};
    const stage = normalizeV2Stage(record.stage);
    learnings[v2StageToBucket[stage]].push(coerceLearningItem(record, index));
  });

  return learnings;
}

function coerceV2MemoryActions(value: unknown[]) {
  const memoryActions: UniversalLearningResponse["memoryActions"] = {
    create: [],
    reinforce: [],
    update: [],
    retireOrDeactivate: [],
    noAction: [],
  };

  for (const item of value) {
    const action = coerceMemoryAction(item, "no_action");
    if (!action) {
      continue;
    }

    if (action.action === "create") {
      memoryActions.create.push(action);
      continue;
    }
    if (action.action === "reinforce") {
      memoryActions.reinforce.push(action);
      continue;
    }
    if (action.action === "update") {
      memoryActions.update.push(action);
      continue;
    }
    if (action.action === "retire") {
      memoryActions.retireOrDeactivate.push(action);
      continue;
    }
    memoryActions.noAction.push(action);
  }

  return memoryActions;
}

function coerceV2Response(root: Record<string, unknown>) {
  const reviewSummary = getObjectValue(root, ["reviewSummary", "review_summary", "summary"]);
  const learnings = Array.isArray(root.learnings)
    ? root.learnings
    : Array.isArray(root.learning)
      ? root.learning
      : Array.isArray(root.findings)
        ? root.findings
        : null;
  const memoryActions = Array.isArray(root.memoryActions)
    ? root.memoryActions
    : Array.isArray(root.memory_actions)
      ? root.memory_actions
      : Array.isArray(root.actions)
        ? root.actions
        : null;

  if (!reviewSummary || !learnings || !memoryActions) {
    return null;
  }

  return {
    reviewSummary: {
      overallAssessment:
        reviewSummary.overallAssessment
        ?? reviewSummary.overall_assessment
        ?? reviewSummary.assessment
        ?? "",
      dominantThemes:
        reviewSummary.dominantThemes
        ?? reviewSummary.dominant_themes
        ?? reviewSummary.themes
        ?? [],
      confidenceNotes:
        reviewSummary.confidenceNotes
        ?? reviewSummary.confidence_notes
        ?? reviewSummary.notes
        ?? reviewSummary.confidence
        ?? "",
    },
    learnings: coerceV2Learnings(learnings),
    memoryActions: coerceV2MemoryActions(memoryActions),
  };
}

export function coerceUniversalConstructionLearningResponseShape(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const nestedCandidate = getObjectValue(value, ["response", "result", "output"]);
  const root = nestedCandidate ?? value;

  const v2Response = coerceV2Response(root);
  if (v2Response) {
    return v2Response;
  }

  const reviewSummary = getObjectValue(root, ["reviewSummary", "review_summary", "summary"]);
  const learnings = getObjectValue(root, ["learnings", "learning", "findings"]);
  const memoryActions = getObjectValue(root, ["memoryActions", "memory_actions", "actions"]);

  if (!reviewSummary || !learnings || !memoryActions) {
    return value;
  }

  return {
    reviewSummary: {
      overallAssessment:
        reviewSummary.overallAssessment
        ?? reviewSummary.overall_assessment
        ?? reviewSummary.assessment
        ?? "",
      dominantThemes:
        reviewSummary.dominantThemes
        ?? reviewSummary.dominant_themes
        ?? reviewSummary.themes
        ?? [],
      confidenceNotes:
        reviewSummary.confidenceNotes
        ?? reviewSummary.confidence_notes
        ?? reviewSummary.notes
        ?? "",
    },
    learnings: {
      observations: coerceLearningList(getArrayValue(learnings, ["observations"])),
      emergingPatterns: coerceLearningList(getArrayValue(learnings, ["emergingPatterns", "emerging_patterns"])),
      reinforcedPatterns: coerceLearningList(getArrayValue(learnings, ["reinforcedPatterns", "reinforced_patterns"])),
      durablePatterns: coerceLearningList(getArrayValue(learnings, ["durablePatterns", "durable_patterns"])),
      changingBehaviors: coerceLearningList(getArrayValue(learnings, ["changingBehaviors", "changing_behaviors"])),
      contradictions: coerceLearningList(getArrayValue(learnings, ["contradictions"])),
      needsMoreEvidence: coerceLearningList(getArrayValue(learnings, ["needsMoreEvidence", "needs_more_evidence"])),
    },
    memoryActions: {
      create: coerceMemoryActionList(getArrayValue(memoryActions, ["create", "createMemory", "create_memory"]), "create"),
      reinforce: coerceMemoryActionList(getArrayValue(memoryActions, ["reinforce", "reinforceExisting", "reinforce_existing"]), "reinforce"),
      update: coerceMemoryActionList(getArrayValue(memoryActions, ["update", "updateMemory", "update_memory"]), "update"),
      retireOrDeactivate: coerceMemoryActionList(getArrayValue(memoryActions, ["retireOrDeactivate", "retire_or_deactivate", "retire", "deactivate"]), "retire"),
      noAction: coerceMemoryActionList(getArrayValue(memoryActions, ["noAction", "no_action", "skip"]), "no_action"),
    },
  };
}

function dedupeLearningItems(items: UniversalLearningLearningItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.learningId}:${item.title.trim().toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeActions(actions: UniversalLearningMemoryAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.action}:${action.targetMemoryId ?? "new"}:${action.basedOnLearningId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeSupportingRecords(items: UniversalLearningLearningItem[]) {
  return items.map((item) => ({
    ...item,
    statement: item.statement.trim(),
    whyItMatters: item.whyItMatters.trim(),
    evidence: {
      recordCount: item.evidence.recordCount,
      projectCount: item.evidence.projectCount ?? 0,
      supplierCount: item.evidence.supplierCount ?? 0,
      timeSpan: item.evidence.timeSpan ?? `${item.provenance.reviewPeriodStart} to ${item.provenance.reviewPeriodEnd}`,
      supportingRecords: item.evidence.supportingRecords
        .map((record) => ({
          containerType: record.containerType,
          sourceId: record.sourceId,
          sourceScope: record.sourceScope,
          memoryId: record.memoryId,
          reason: record.reason.trim(),
        }))
        .filter((record, index, array) =>
          array.findIndex((candidate) =>
            candidate.sourceId === record.sourceId && candidate.reason === record.reason,
          ) === index,
        ),
    },
  }));
}

export function normalizeUniversalConstructionLearningResponse(
  response: UniversalLearningResponse,
): UniversalLearningResponse {
  return {
    reviewSummary: response.reviewSummary,
    learnings: {
      observations: normalizeSupportingRecords(dedupeLearningItems(response.learnings.observations)),
      emergingPatterns: normalizeSupportingRecords(dedupeLearningItems(response.learnings.emergingPatterns)),
      reinforcedPatterns: normalizeSupportingRecords(dedupeLearningItems(response.learnings.reinforcedPatterns)),
      durablePatterns: normalizeSupportingRecords(dedupeLearningItems(response.learnings.durablePatterns)),
      changingBehaviors: normalizeSupportingRecords(dedupeLearningItems(response.learnings.changingBehaviors)),
      contradictions: normalizeSupportingRecords(dedupeLearningItems(response.learnings.contradictions)),
      needsMoreEvidence: normalizeSupportingRecords(dedupeLearningItems(response.learnings.needsMoreEvidence)),
    },
    memoryActions: {
      create: dedupeActions(response.memoryActions.create),
      reinforce: dedupeActions(response.memoryActions.reinforce),
      update: dedupeActions(response.memoryActions.update),
      retireOrDeactivate: dedupeActions(response.memoryActions.retireOrDeactivate),
      noAction: dedupeActions(response.memoryActions.noAction),
    },
  };
}
