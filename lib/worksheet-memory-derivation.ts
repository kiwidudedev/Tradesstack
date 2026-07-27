import "server-only";

import { requirePlatformAdmin } from "@/lib/permissions-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import type { WorksheetMemoryAiShadowSummary } from "@/lib/worksheet-memory-ai-proposals";
import { runWorksheetMemoryAiProposalsShadowMode } from "@/lib/worksheet-memory-ai-proposals";

export type WorksheetMemoryCategory =
  | "worksheet_pricing"
  | "worksheet_formula"
  | "worksheet_structure"
  | "worksheet_workflow";

export type WorksheetMemoryType =
  | "assumption_pattern"
  | "rate_override_pattern"
  | "formula_pattern"
  | "worksheet_structure_pattern"
  | "page_flow_pattern";

export type WorksheetSemanticFieldValue = {
  value: string | null;
  confidence: number | null;
};

export type WorksheetMemorySemanticFields = {
  costRole?: WorksheetSemanticFieldValue | null;
  cellRole?: WorksheetSemanticFieldValue | null;
  pageType?: WorksheetSemanticFieldValue | null;
  sectionType?: WorksheetSemanticFieldValue | null;
  itemCategory?: WorksheetSemanticFieldValue | null;
  measurementBasis?: WorksheetSemanticFieldValue | null;
  normalizedUnit?: WorksheetSemanticFieldValue | null;
  normalizedTradePackage?: WorksheetSemanticFieldValue | null;
  workCategory?: WorksheetSemanticFieldValue | null;
  systemCategory?: WorksheetSemanticFieldValue | null;
  assemblyCategory?: WorksheetSemanticFieldValue | null;
};

export type ClassifiedWorksheetMemoryEvent = {
  eventId: string;
  organizationId: string;
  classificationRecordId?: string | null;
  classificationAttemptNumber?: number | null;
  projectId: string | null;
  opportunityId: string | null;
  eventType: string;
  occurredAt: string;
  metadata: Record<string, Json | undefined>;
  diffData: Record<string, Json | undefined>;
  classificationStatus: "classified" | "pending" | "failed" | "low_confidence";
  classificationVersion: number;
  classificationSource: string | null;
  classificationProvider: string | null;
  classificationModel: string | null;
  classificationModelVersion: string | null;
  overallConfidence: number | null;
  reasoningSummary: string | null;
  semanticFields: WorksheetMemorySemanticFields;
  interpretationSchemaVersion: number | null;
  interpretationPayload: Record<string, Json | undefined>;
  interpretationPromptVersion?: number | null;
  contextSources?: Record<string, Json | undefined>;
  constructionIntelligenceInputs?: Record<string, Json | undefined>;
  futureUseSummary?: Record<string, Json | undefined>;
  confidenceDetail?: Record<string, Json | undefined>;
  classifiedAt: string | null;
};

export type WorksheetMemoryCandidate = {
  organizationId: string;
  memoryCategory: WorksheetMemoryCategory;
  memoryType: WorksheetMemoryType;
  memoryKey: string;
  title: string;
  summary: string;
  memoryValue: Record<string, Json | null>;
  evidenceSummary: Record<string, Json | null>;
  confidenceScore: number;
  evidenceCount: number;
  sourceEventIds: string[];
};

export type WorksheetMemoryDerivationResult = {
  candidates: WorksheetMemoryCandidate[];
  summary: {
    createdCount: number;
    updatedCount: number;
    memoryTypeDistribution: Record<string, number>;
    memoryConfidenceDistribution: Record<string, number>;
    evidenceCountDistribution: Record<string, number>;
  };
};

export type RunWorksheetMemoryDerivationInput = {
  organizationId?: string | null;
  limit?: number;
};

export type RunWorksheetMemoryDerivationOutput = {
  fetchedCount: number;
  persistedCount: number;
  memoryTypeDistribution: Record<string, number>;
  memoryConfidenceDistribution: Record<string, number>;
  evidenceCountDistribution: Record<string, number>;
  aiShadow: WorksheetMemoryAiShadowSummary;
};

type WorksheetMemoryPatternEntry = {
  organizationId: string;
  memoryCategory: WorksheetMemoryCategory;
  memoryType: WorksheetMemoryType;
  patternScopeKey: string;
  targetSignature: string;
  title: string;
  summary: string;
  memoryValue: Record<string, Json | null>;
  sourceEventId: string;
  eventType: string;
  confidence: number;
};

type WorkbookPageTypeRow = {
  sheetId: string;
  sheetName: string | null;
  pageType: string;
  classifiedAt: string;
};

const MINIMUM_EVIDENCE_FOR_MEMORY = 3;
const MEDIUM_CONFIDENCE_EVIDENCE_COUNT = 10;
const HIGH_CONFIDENCE_EVIDENCE_COUNT = 25;
const MINIMUM_DOMINANCE_RATIO = 0.6;
const CLASSIFIED_EVENT_LIMIT = 1_000;

function isJsonRecord(value: unknown): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function normalizeToken(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized.length > 0 ? normalized : null;
}

function roundConfidence(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function serializeValue(value: Json | undefined) {
  if (value === undefined) {
    return "null";
  }

  return JSON.stringify(value);
}

function getSemanticFieldValue(
  event: ClassifiedWorksheetMemoryEvent,
  field: keyof WorksheetMemorySemanticFields,
) {
  const record = event.semanticFields[field];
  return record && typeof record === "object" ? toNullableString(record.value) : null;
}

function getMetadataString(event: ClassifiedWorksheetMemoryEvent, field: string) {
  return toNullableString(event.metadata[field]);
}

function getDiffString(event: ClassifiedWorksheetMemoryEvent, field: string) {
  return toNullableString(event.diffData[field]);
}

function getDiffStringArray(event: ClassifiedWorksheetMemoryEvent, field: string) {
  return Array.isArray(event.diffData[field])
    ? (event.diffData[field] as Json[])
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
}

function getInterpretationRecord(event: ClassifiedWorksheetMemoryEvent) {
  return isJsonRecord(event.interpretationPayload) ? event.interpretationPayload : {};
}

function getInterpretedChangeRecord(event: ClassifiedWorksheetMemoryEvent) {
  const interpretation = getInterpretationRecord(event);
  return isJsonRecord(interpretation.interpretedChange) ? interpretation.interpretedChange : {};
}

function getInterpretationString(event: ClassifiedWorksheetMemoryEvent, field: string) {
  return toNullableString(getInterpretedChangeRecord(event)[field]);
}

function getNestedInterpretationString(
  event: ClassifiedWorksheetMemoryEvent,
  parentField: string,
  field: string,
) {
  const interpreted = getInterpretedChangeRecord(event);
  const nested = interpreted[parentField];
  return isJsonRecord(nested) ? toNullableString(nested[field]) : null;
}

function getNestedInterpretationBoolean(
  event: ClassifiedWorksheetMemoryEvent,
  parentField: string,
  field: string,
) {
  const interpreted = getInterpretedChangeRecord(event);
  const nested = interpreted[parentField];
  return isJsonRecord(nested) && typeof nested[field] === "boolean"
    ? (nested[field] as boolean)
    : null;
}

function getScopeContext(event: ClassifiedWorksheetMemoryEvent) {
  const itemLabel = getDiffString(event, "itemLabel");
  const rowLabel = getDiffString(event, "rowLabel");
  const columnHeader = getDiffString(event, "columnHeader");

  return {
    workbookId: getMetadataString(event, "workbookId"),
    sheetId: getMetadataString(event, "sheetId"),
    sheetName: getMetadataString(event, "sheetName"),
    worksheetName: getMetadataString(event, "worksheetName"),
    tradePackage: getMetadataString(event, "tradePackage"),
    normalizedTradePackage:
      getSemanticFieldValue(event, "normalizedTradePackage")
      ?? getNestedInterpretationString(event, "constructionContext", "tradeOrScope"),
    workCategory:
      getSemanticFieldValue(event, "workCategory")
      ?? getNestedInterpretationString(event, "constructionContext", "workCategory"),
    systemCategory:
      getSemanticFieldValue(event, "systemCategory")
      ?? getNestedInterpretationString(event, "constructionContext", "systemCategory"),
    assemblyCategory: getSemanticFieldValue(event, "assemblyCategory"),
    pageType:
      getSemanticFieldValue(event, "pageType")
      ?? getNestedInterpretationString(event, "constructionContext", "pageType"),
    sectionType:
      getSemanticFieldValue(event, "sectionType")
      ?? getNestedInterpretationString(event, "constructionContext", "sectionType"),
    itemCategory:
      getSemanticFieldValue(event, "itemCategory")
      ?? getNestedInterpretationString(event, "constructionContext", "itemCategory"),
    measurementBasis:
      getSemanticFieldValue(event, "measurementBasis")
      ?? getNestedInterpretationString(event, "pricingContext", "measurementBasis"),
    normalizedUnit: getSemanticFieldValue(event, "normalizedUnit") ?? getDiffString(event, "unit"),
    costRole:
      getSemanticFieldValue(event, "costRole")
      ?? getNestedInterpretationString(event, "pricingContext", "costRole"),
    cellRole: getSemanticFieldValue(event, "cellRole"),
    itemLabel,
    rowLabel,
    columnHeader,
    itemLabelNormalized: normalizeToken(itemLabel),
    rowLabelNormalized: normalizeToken(rowLabel),
    columnHeaderNormalized: normalizeToken(columnHeader),
  };
}

function getPreferredSummary(event: ClassifiedWorksheetMemoryEvent, fallback: string) {
  return (
    getInterpretationString(event, "plainEnglishSummary")
    ?? getInterpretationString(event, "businessMeaning")
    ?? event.reasoningSummary
    ?? fallback
  );
}

function buildScopeKey(
  event: ClassifiedWorksheetMemoryEvent,
  extra: Array<[string, string | null | undefined]> = [],
) {
  const scope = getScopeContext(event);
  const entries: Array<[string, string | null | undefined]> = [
    ["tradePackage", scope.normalizedTradePackage],
    ["workCategory", scope.workCategory],
    ["systemCategory", scope.systemCategory],
    ["pageType", scope.pageType],
    ["sectionType", scope.sectionType],
    ["itemCategory", scope.itemCategory],
    ["normalizedUnit", scope.normalizedUnit],
    ["measurementBasis", scope.measurementBasis],
    ["costRole", scope.costRole],
    ["itemLabel", scope.itemLabelNormalized],
    ["rowLabel", scope.rowLabelNormalized],
    ["columnHeader", scope.columnHeaderNormalized],
    ...extra,
  ];

  return entries
    .map(([key, value]) => `${key}=${value ?? "unknown"}`)
    .join("|");
}

function confidenceFromEvidenceCount(evidenceCount: number, dominanceRatio: number, averageClassificationConfidence: number) {
  let base = 0;
  if (evidenceCount >= HIGH_CONFIDENCE_EVIDENCE_COUNT) {
    base = 0.92;
  } else if (evidenceCount >= MEDIUM_CONFIDENCE_EVIDENCE_COUNT) {
    base = 0.78;
  } else if (evidenceCount >= MINIMUM_EVIDENCE_FOR_MEMORY) {
    base = 0.62;
  }

  const dominanceBoost = Math.max(dominanceRatio - MINIMUM_DOMINANCE_RATIO, 0) * 0.18;
  const classificationBoost = Math.max(Math.min(averageClassificationConfidence, 0.95) - 0.6, 0) * 0.12;
  return roundConfidence(Math.min(0.99, base + dominanceBoost + classificationBoost));
}

function confidenceBucket(confidence: number) {
  if (confidence >= 0.9) {
    return "high";
  }
  if (confidence >= 0.75) {
    return "medium";
  }
  return "low";
}

function evidenceBucket(evidenceCount: number) {
  if (evidenceCount >= HIGH_CONFIDENCE_EVIDENCE_COUNT) {
    return "25_plus";
  }
  if (evidenceCount >= MEDIUM_CONFIDENCE_EVIDENCE_COUNT) {
    return "10_to_24";
  }
  return "3_to_9";
}

function isClassifiedEvent(event: ClassifiedWorksheetMemoryEvent) {
  return event.classificationStatus === "classified";
}

function isAssumptionEvent(event: ClassifiedWorksheetMemoryEvent) {
  const memoryCandidate = getNestedInterpretationBoolean(event, "futureUse", "memoryCandidate");
  const memoryType = getNestedInterpretationString(event, "futureUse", "memoryType");
  if (memoryCandidate === true && memoryType === "assumption_pattern") {
    return true;
  }

  if (event.eventType === "worksheet_assumption_changed" || event.eventType === "worksheet_ai_assumption_corrected") {
    return true;
  }

  const cellRole = getSemanticFieldValue(event, "cellRole");
  if (cellRole !== null && cellRole.includes("assumption")) {
    return true;
  }

  return memoryType === "assumption_pattern";
}

function isRateEvent(event: ClassifiedWorksheetMemoryEvent) {
  const memoryCandidate = getNestedInterpretationBoolean(event, "futureUse", "memoryCandidate");
  const memoryType = getNestedInterpretationString(event, "futureUse", "memoryType");
  if (memoryCandidate === true && memoryType === "rate_override_pattern") {
    return true;
  }

  if (event.eventType === "worksheet_rate_changed" || event.eventType === "worksheet_ai_rate_corrected") {
    return true;
  }

  const costRole = getSemanticFieldValue(event, "costRole");
  if (costRole !== null && ["labour", "material", "plant", "subcontract"].some((token) => costRole.includes(token))) {
    return true;
  }

  return memoryType === "rate_override_pattern";
}

function isFormulaEvent(event: ClassifiedWorksheetMemoryEvent) {
  return (
    event.eventType === "worksheet_formula_edited"
	    || event.eventType === "worksheet_ai_formula_corrected"
	    || (getDiffString(event, "oldFormula") !== null && getDiffString(event, "newFormula") !== null)
	    || getInterpretationString(event, "formulaMeaning") !== null
      || (
        getNestedInterpretationBoolean(event, "futureUse", "memoryCandidate") === true
        && getNestedInterpretationString(event, "futureUse", "memoryType") === "formula_pattern"
      )
	  );
}

function buildAssumptionPatternEntries(events: ClassifiedWorksheetMemoryEvent[]) {
  return events.flatMap<WorksheetMemoryPatternEntry>((event) => {
    if (!isClassifiedEvent(event) || !isAssumptionEvent(event)) {
      return [];
    }

    const newValue = event.diffData.newValue;
    if (newValue === undefined || newValue === null) {
      return [];
    }

    const scope = getScopeContext(event);
    const fieldKey = scope.itemLabelNormalized ?? scope.columnHeaderNormalized ?? scope.rowLabelNormalized ?? "assumption";
    const targetSignature = serializeValue(newValue);
    const preferredSummary = getPreferredSummary(
      event,
      `Repeated classified worksheet edits indicate this organization tends to use ${fieldKey.replace(/_/g, " ")} = ${String(newValue)} in similar contexts.`,
    );
    const retrievalGuidance = getNestedInterpretationString(event, "futureUse", "retrievalGuidance");
    const businessMeaning = getInterpretationString(event, "businessMeaning");

    return [{
      organizationId: event.organizationId,
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      patternScopeKey: buildScopeKey(event, [["fieldKey", fieldKey]]),
      targetSignature,
      title: `${scope.pageType ?? "worksheet"}: preferred assumption for ${fieldKey.replace(/_/g, " ")}`,
      summary: preferredSummary,
      memoryValue: {
        schemaVersion: 1,
        classificationVersion: event.classificationVersion,
        classificationSource: event.classificationSource,
        field: fieldKey,
        preferredValue: newValue ?? null,
        workbookId: scope.workbookId,
        sheetId: scope.sheetId,
        sheetName: scope.sheetName,
        pageType: scope.pageType,
        sectionType: scope.sectionType,
        itemCategory: scope.itemCategory,
        itemLabel: scope.itemLabel,
        rowLabel: scope.rowLabel,
        normalizedTradePackage: scope.normalizedTradePackage,
        workCategory: scope.workCategory,
        systemCategory: scope.systemCategory,
        normalizedUnit: scope.normalizedUnit,
        measurementBasis: scope.measurementBasis,
        costRole: scope.costRole,
        businessMeaning,
        retrievalGuidance,
      },
      sourceEventId: event.eventId,
      eventType: event.eventType,
      confidence: event.overallConfidence ?? 0.6,
    }];
  });
}

function buildRatePatternEntries(events: ClassifiedWorksheetMemoryEvent[]) {
  return events.flatMap<WorksheetMemoryPatternEntry>((event) => {
    if (!isClassifiedEvent(event) || !isRateEvent(event)) {
      return [];
    }

    const newValue = event.diffData.newValue;
    if (newValue === undefined || newValue === null) {
      return [];
    }

    const scope = getScopeContext(event);
    const rateKey = scope.itemLabelNormalized ?? scope.columnHeaderNormalized ?? "rate";
    const preferredSummary = getPreferredSummary(
      event,
      `Repeated classified worksheet edits indicate this organization tends to use ${String(newValue)} for ${rateKey.replace(/_/g, " ")} in similar contexts.`,
    );
    return [{
      organizationId: event.organizationId,
      memoryCategory: "worksheet_pricing",
      memoryType: "rate_override_pattern",
      patternScopeKey: buildScopeKey(event, [["rateKey", rateKey]]),
      targetSignature: serializeValue(newValue),
      title: `${scope.costRole ?? scope.itemCategory ?? "worksheet"}: preferred rate for ${rateKey.replace(/_/g, " ")}`,
      summary: preferredSummary,
      memoryValue: {
        schemaVersion: 1,
        classificationVersion: event.classificationVersion,
        classificationSource: event.classificationSource,
        preferredValue: newValue ?? null,
        itemCategory: scope.itemCategory,
        itemLabel: scope.itemLabel,
        rowLabel: scope.rowLabel,
        costRole: scope.costRole,
        normalizedUnit: scope.normalizedUnit,
        measurementBasis: scope.measurementBasis,
        normalizedTradePackage: scope.normalizedTradePackage,
        workCategory: scope.workCategory,
        systemCategory: scope.systemCategory,
        pageType: scope.pageType,
        businessMeaning: getInterpretationString(event, "businessMeaning"),
        pricingMeaning: getInterpretationString(event, "pricingMeaning"),
        retrievalGuidance: getNestedInterpretationString(event, "futureUse", "retrievalGuidance"),
      },
      sourceEventId: event.eventId,
      eventType: event.eventType,
      confidence: event.overallConfidence ?? 0.6,
    }];
  });
}

function buildFormulaPatternEntries(events: ClassifiedWorksheetMemoryEvent[]) {
  return events.flatMap<WorksheetMemoryPatternEntry>((event) => {
    if (!isClassifiedEvent(event) || !isFormulaEvent(event)) {
      return [];
    }

    const oldFormula = getDiffString(event, "oldFormula");
    const newFormula = getDiffString(event, "newFormula");
    if (!oldFormula || !newFormula || oldFormula === newFormula) {
      return [];
    }

    const scope = getScopeContext(event);
    const preferredSummary =
      getInterpretationString(event, "formulaMeaning")
      ?? getPreferredSummary(
        event,
        "Repeated classified formula edits indicate this organization prefers the corrected formula in similar worksheet contexts.",
      );
    return [{
      organizationId: event.organizationId,
      memoryCategory: "worksheet_formula",
      memoryType: "formula_pattern",
      patternScopeKey: buildScopeKey(event, [["oldFormula", oldFormula]]),
      targetSignature: newFormula,
      title: `${scope.pageType ?? "worksheet"}: repeated formula correction`,
      summary: preferredSummary,
      memoryValue: {
        schemaVersion: 1,
        classificationVersion: event.classificationVersion,
        classificationSource: event.classificationSource,
        oldFormula,
        preferredFormula: newFormula,
        formulaReferences: getDiffStringArray(event, "formulaReferences"),
        itemCategory: scope.itemCategory,
        itemLabel: scope.itemLabel,
        rowLabel: scope.rowLabel,
        pageType: scope.pageType,
        sectionType: scope.sectionType,
        normalizedUnit: scope.normalizedUnit,
        measurementBasis: scope.measurementBasis,
        costRole: scope.costRole,
        normalizedTradePackage: scope.normalizedTradePackage,
      },
      sourceEventId: event.eventId,
      eventType: event.eventType,
      confidence: event.overallConfidence ?? 0.6,
    }];
  });
}

function buildWorksheetStructurePatternEntries(events: ClassifiedWorksheetMemoryEvent[]) {
  return events.flatMap<WorksheetMemoryPatternEntry>((event) => {
    if (!isClassifiedEvent(event)) {
      return [];
    }

    const nearbyHeaders = getDiffStringArray(event, "nearbyHeaders");
    const nearbyRows = Array.isArray(event.diffData.nearbyRows)
      ? (event.diffData.nearbyRows as Json[])
          .map((row) => (isJsonRecord(row) ? toNullableString(row.rowLabel) : null))
          .filter((value): value is string => value !== null)
      : [];
    const scope = getScopeContext(event);
    const pageType = scope.pageType;
    if (!pageType || nearbyHeaders.length === 0) {
      return [];
    }

    const targetSignature = [
      nearbyHeaders.map((entry) => normalizeToken(entry) ?? entry).join(","),
      nearbyRows.map((entry) => normalizeToken(entry) ?? entry).join(","),
    ].join("|");

    return [{
      organizationId: event.organizationId,
      memoryCategory: "worksheet_structure",
      memoryType: "worksheet_structure_pattern",
      patternScopeKey: buildScopeKey(event, [["structurePageType", pageType]]),
      targetSignature,
      title: `${pageType}: preferred worksheet structure`,
      summary: "Repeated classified worksheet edits indicate a stable page-local structure in similar contexts.",
      memoryValue: {
        schemaVersion: 1,
        classificationVersion: event.classificationVersion,
        classificationSource: event.classificationSource,
        pageType,
        sectionType: scope.sectionType,
        nearbyHeaders,
        nearbyRowLabels: nearbyRows,
        sheetName: scope.sheetName,
        worksheetName: scope.worksheetName,
        normalizedTradePackage: scope.normalizedTradePackage,
        workCategory: scope.workCategory,
        systemCategory: scope.systemCategory,
        formulaMeaning: getInterpretationString(event, "formulaMeaning"),
        retrievalGuidance: getNestedInterpretationString(event, "futureUse", "retrievalGuidance"),
      },
      sourceEventId: event.eventId,
      eventType: event.eventType,
      confidence: event.overallConfidence ?? 0.6,
    }];
  });
}

function buildPageFlowPatternEntries(events: ClassifiedWorksheetMemoryEvent[]) {
  const workbookMap = new Map<string, { organizationId: string; scopeKey: string; rows: WorkbookPageTypeRow[]; sourceEventIds: string[]; averageConfidence: number[]; scope: ReturnType<typeof getScopeContext> }>();

  for (const event of events) {
    if (!isClassifiedEvent(event)) {
      continue;
    }

    const scope = getScopeContext(event);
    if (!scope.workbookId || !scope.sheetId || !scope.pageType) {
      continue;
    }

    const workbookKey = `${event.organizationId}:${scope.workbookId}`;
    const existing = workbookMap.get(workbookKey) ?? {
      organizationId: event.organizationId,
      scopeKey: buildScopeKey(event),
      rows: [],
      sourceEventIds: [],
      averageConfidence: [],
      scope,
    };

    if (!existing.rows.some((row) => row.sheetId === scope.sheetId && row.pageType === scope.pageType)) {
      existing.rows.push({
        sheetId: scope.sheetId,
        sheetName: scope.sheetName,
        pageType: scope.pageType,
        classifiedAt: event.classifiedAt ?? event.occurredAt,
      });
    }
    existing.sourceEventIds.push(event.eventId);
    existing.averageConfidence.push(event.overallConfidence ?? 0.6);
    workbookMap.set(workbookKey, existing);
  }

  const entries: WorksheetMemoryPatternEntry[] = [];
  workbookMap.forEach((workbook) => {
    const orderedRows = workbook.rows.sort((left, right) =>
      (left.sheetName ?? left.classifiedAt).localeCompare(right.sheetName ?? right.classifiedAt)
      || left.sheetId.localeCompare(right.sheetId)
    );
    const pageTypeSequence = orderedRows.map((row) => row.pageType);
    if (pageTypeSequence.length < 2) {
      return;
    }

    entries.push({
      organizationId: workbook.organizationId,
      memoryCategory: "worksheet_workflow",
      memoryType: "page_flow_pattern",
      patternScopeKey: workbook.scopeKey,
      targetSignature: pageTypeSequence.join(">"),
      title: `${workbook.scope.pageType ?? "worksheet"}: repeated page flow`,
      summary: "Repeated classified worksheet activity across workbook pages indicates a reusable page flow sequence.",
      memoryValue: {
        schemaVersion: 1,
        classificationVersion: 1,
        classificationSource: "llm",
        pageTypeSequence,
        workbookId: workbook.scope.workbookId,
        normalizedTradePackage: workbook.scope.normalizedTradePackage,
        workCategory: workbook.scope.workCategory,
        systemCategory: workbook.scope.systemCategory,
      },
      sourceEventId: workbook.sourceEventIds[0] ?? crypto.randomUUID(),
      eventType: "page_flow_pattern",
      confidence:
        workbook.averageConfidence.reduce((total, value) => total + value, 0) / Math.max(workbook.averageConfidence.length, 1),
    });
  });

  return entries;
}

function aggregatePatternEntries(entries: WorksheetMemoryPatternEntry[]) {
  const grouped = new Map<string, WorksheetMemoryPatternEntry[]>();
  for (const entry of entries) {
    const key = `${entry.organizationId}|${entry.memoryCategory}|${entry.memoryType}|${entry.patternScopeKey}|${entry.targetSignature}`;
    const existing = grouped.get(key) ?? [];
    existing.push(entry);
    grouped.set(key, existing);
  }

  type AggregatedPattern = {
    organizationId: string;
    memoryCategory: WorksheetMemoryCategory;
    memoryType: WorksheetMemoryType;
    patternScopeKey: string;
    targetSignature: string;
    title: string;
    summary: string;
    memoryValue: Record<string, Json | null>;
    sourceEventIds: string[];
    evidenceCount: number;
    averageClassificationConfidence: number;
    sourceEventTypes: string[];
  };

  const aggregatedByScope = new Map<string, AggregatedPattern[]>();
  grouped.forEach((groupEntries) => {
    const [first] = groupEntries;
    const scopeKey = `${first.organizationId}|${first.memoryCategory}|${first.memoryType}|${first.patternScopeKey}`;
    const aggregate: AggregatedPattern = {
      organizationId: first.organizationId,
      memoryCategory: first.memoryCategory,
      memoryType: first.memoryType,
      patternScopeKey: first.patternScopeKey,
      targetSignature: first.targetSignature,
      title: first.title,
      summary: first.summary,
      memoryValue: first.memoryValue,
      sourceEventIds: Array.from(new Set(groupEntries.map((entry) => entry.sourceEventId))),
      evidenceCount: groupEntries.length,
      averageClassificationConfidence:
        groupEntries.reduce((total, entry) => total + entry.confidence, 0) / Math.max(groupEntries.length, 1),
      sourceEventTypes: Array.from(new Set(groupEntries.map((entry) => entry.eventType))),
    };
    const existing = aggregatedByScope.get(scopeKey) ?? [];
    existing.push(aggregate);
    aggregatedByScope.set(scopeKey, existing);
  });

  const candidates: WorksheetMemoryCandidate[] = [];

  aggregatedByScope.forEach((aggregates) => {
    const totalEvidenceCount = aggregates.reduce((total, aggregate) => total + aggregate.evidenceCount, 0);
    const winner = [...aggregates].sort((left, right) =>
      right.evidenceCount - left.evidenceCount
      || right.averageClassificationConfidence - left.averageClassificationConfidence
      || left.targetSignature.localeCompare(right.targetSignature)
    )[0];

    if (!winner || winner.evidenceCount < MINIMUM_EVIDENCE_FOR_MEMORY) {
      return;
    }

    const dominanceRatio = winner.evidenceCount / Math.max(totalEvidenceCount, 1);
    if (dominanceRatio < MINIMUM_DOMINANCE_RATIO) {
      return;
    }

    const confidenceScore = confidenceFromEvidenceCount(
      winner.evidenceCount,
      dominanceRatio,
      winner.averageClassificationConfidence,
    );

    candidates.push({
      organizationId: winner.organizationId,
      memoryCategory: winner.memoryCategory,
      memoryType: winner.memoryType,
      memoryKey: `${winner.patternScopeKey}|${winner.targetSignature}`,
      title: winner.title,
      summary: winner.summary,
      memoryValue: {
        ...winner.memoryValue,
        patternScopeKey: winner.patternScopeKey,
        targetSignature: winner.targetSignature,
      },
      evidenceSummary: {
        sourceType: "worksheet_event_classifications",
        sourceEventTypes: winner.sourceEventTypes,
        evidenceCount: winner.evidenceCount,
        totalEvidenceCount,
        dominanceRatio: roundConfidence(dominanceRatio),
        averageClassificationConfidence: roundConfidence(winner.averageClassificationConfidence),
        classificationSource: "llm",
        classificationVersion: winner.memoryValue.classificationVersion ?? 1,
        schemaVersion: 1,
      },
      confidenceScore,
      evidenceCount: winner.evidenceCount,
      sourceEventIds: winner.sourceEventIds,
    });
  });

  return candidates;
}

export function deriveWorksheetMemoryCandidates(events: ClassifiedWorksheetMemoryEvent[]) {
  const eligibleEvents = events.filter((event) => isClassifiedEvent(event));

  const candidates = [
    ...aggregatePatternEntries(buildAssumptionPatternEntries(eligibleEvents)),
    ...aggregatePatternEntries(buildRatePatternEntries(eligibleEvents)),
    ...aggregatePatternEntries(buildFormulaPatternEntries(eligibleEvents)),
    ...aggregatePatternEntries(buildWorksheetStructurePatternEntries(eligibleEvents)),
    ...aggregatePatternEntries(buildPageFlowPatternEntries(eligibleEvents)),
  ];

  const summary = {
    createdCount: candidates.length,
    updatedCount: 0,
    memoryTypeDistribution: {} as Record<string, number>,
    memoryConfidenceDistribution: {} as Record<string, number>,
    evidenceCountDistribution: {} as Record<string, number>,
  };

  for (const candidate of candidates) {
    summary.memoryTypeDistribution[candidate.memoryType] = (summary.memoryTypeDistribution[candidate.memoryType] ?? 0) + 1;
    const confidenceKey = confidenceBucket(candidate.confidenceScore);
    summary.memoryConfidenceDistribution[confidenceKey] = (summary.memoryConfidenceDistribution[confidenceKey] ?? 0) + 1;
    const evidenceKey = evidenceBucket(candidate.evidenceCount);
    summary.evidenceCountDistribution[evidenceKey] = (summary.evidenceCountDistribution[evidenceKey] ?? 0) + 1;
  }

  return {
    candidates,
    summary,
  } satisfies WorksheetMemoryDerivationResult;
}

function parseClassifiedWorksheetMemoryEvent(value: unknown): ClassifiedWorksheetMemoryEvent | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const eventId = toNullableString(value.eventId);
  const organizationId = toNullableString(value.organizationId);
  const occurredAt = toNullableString(value.occurredAt);
  if (!eventId || !organizationId || !occurredAt) {
    return null;
  }

  return {
    eventId,
    organizationId,
    classificationRecordId: toNullableString(value.classificationRecordId),
    classificationAttemptNumber: toNullableNumber(value.classificationAttemptNumber),
    projectId: toNullableString(value.projectId),
    opportunityId: toNullableString(value.opportunityId),
    eventType: toNullableString(value.eventType) ?? "worksheet_cell_edited",
    occurredAt,
    metadata: isJsonRecord(value.metadata) ? value.metadata : {},
    diffData: isJsonRecord(value.diffData) ? value.diffData : {},
    classificationStatus: (toNullableString(value.classificationStatus) as ClassifiedWorksheetMemoryEvent["classificationStatus"]) ?? "classified",
    classificationVersion: toNullableNumber(value.classificationVersion) ?? 1,
    classificationSource: toNullableString(value.classificationSource),
    classificationProvider: toNullableString(value.classificationProvider),
    classificationModel: toNullableString(value.classificationModel),
    classificationModelVersion: toNullableString(value.classificationModelVersion),
    overallConfidence: toNullableNumber(value.overallConfidence),
    reasoningSummary: toNullableString(value.reasoningSummary),
    semanticFields: isJsonRecord(value.semanticFields) ? (value.semanticFields as WorksheetMemorySemanticFields) : {},
    interpretationSchemaVersion: toNullableNumber(value.interpretationSchemaVersion),
    interpretationPayload: isJsonRecord(value.interpretationPayload) ? value.interpretationPayload : {},
    interpretationPromptVersion: toNullableNumber(value.interpretationPromptVersion),
    contextSources: isJsonRecord(value.contextSources) ? value.contextSources : {},
    constructionIntelligenceInputs: isJsonRecord(value.constructionIntelligenceInputs) ? value.constructionIntelligenceInputs : {},
    futureUseSummary: isJsonRecord(value.futureUseSummary) ? value.futureUseSummary : {},
    confidenceDetail: isJsonRecord(value.confidenceDetail) ? value.confidenceDetail : {},
    classifiedAt: toNullableString(value.classifiedAt),
  };
}

export async function listClassifiedWorksheetMemoryEvents(params: {
  organizationId?: string | null;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("list_classified_worksheet_memory_events" as never, {
    p_organization_id: params.organizationId ?? null,
    p_limit: Math.min(Math.max(params.limit ?? CLASSIFIED_EVENT_LIMIT, 1), CLASSIFIED_EVENT_LIMIT),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data)) {
    return [] as ClassifiedWorksheetMemoryEvent[];
  }

  return data
    .map(parseClassifiedWorksheetMemoryEvent)
    .filter((event): event is ClassifiedWorksheetMemoryEvent => event !== null);
}

type MemoryItemUpsertRow = {
  id: string;
  organization_id: string;
  memory_category: string;
  memory_type: string;
  memory_key: string;
};

type MemoryItemsUpsertResponse = {
  data: MemoryItemUpsertRow[] | null;
  error: { message: string } | null;
};

async function persistWorksheetMemoryCandidates(candidates: WorksheetMemoryCandidate[]) {
  if (candidates.length === 0) {
    return { count: 0 };
  }

  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const payload = candidates.map((candidate) => ({
    organization_id: candidate.organizationId,
    memory_category: candidate.memoryCategory,
    memory_type: candidate.memoryType,
    memory_key: candidate.memoryKey,
    title: candidate.title,
    summary: candidate.summary,
    memory_value: candidate.memoryValue,
    evidence_summary: candidate.evidenceSummary,
    confidence_score: candidate.confidenceScore,
    derived_from_event_count: candidate.evidenceCount,
    derived_from_ai_interaction_count: 0,
    derived_from_correction_count: 0,
    derived_from_validation_count: 0,
    derived_from_total_count: candidate.evidenceCount,
    reinforcement_count: candidate.evidenceCount,
    contradiction_count: 0,
    is_active: true,
    is_user_confirmed: false,
    first_derived_at: now,
    last_derived_at: now,
    last_reinforced_at: now,
    privacy_classification: "financial_sensitive",
    visibility_scope: "organization",
  }));

  const response = await (admin
    .from("organization_memory_items")
    .upsert(payload, {
      onConflict: "organization_id,memory_category,memory_type,memory_key",
    })
    .select("id, organization_id, memory_category, memory_type, memory_key")) as unknown as MemoryItemsUpsertResponse;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return {
    count: response.data?.length ?? candidates.length,
  };
}

export async function runWorksheetMemoryDerivation(
  input: RunWorksheetMemoryDerivationInput = {},
) {
  await requirePlatformAdmin("admin");

  const events = await listClassifiedWorksheetMemoryEvents({
    organizationId: input.organizationId ?? null,
    limit: input.limit ?? CLASSIFIED_EVENT_LIMIT,
  });
  const derivation = deriveWorksheetMemoryCandidates(events);
  const aiShadow = await runWorksheetMemoryAiProposalsShadowMode({
    events,
  });
  const persisted = await persistWorksheetMemoryCandidates(derivation.candidates);

  return {
    fetchedCount: events.length,
    persistedCount: persisted.count,
    memoryTypeDistribution: derivation.summary.memoryTypeDistribution,
    memoryConfidenceDistribution: derivation.summary.memoryConfidenceDistribution,
    evidenceCountDistribution: derivation.summary.evidenceCountDistribution,
    aiShadow,
  } satisfies RunWorksheetMemoryDerivationOutput;
}
