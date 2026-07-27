import "server-only";

import { createHash } from "node:crypto";
import { requirePlatformAdmin } from "@/lib/permissions-server";
import {
  listClassifiedWorksheetMemoryEvents,
  type ClassifiedWorksheetMemoryEvent,
  type WorksheetMemorySemanticFields,
} from "@/lib/worksheet-memory-derivation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export type WorksheetMemoryEvidencePoolMaturityStatus =
  | "emerging"
  | "ready_for_synthesis"
  | "reinforced"
  | "durable";

export type WorksheetMemoryEvidencePool = {
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
  firstSeenAt: string;
  lastSeenAt: string;
  poolRevisionHash: string;
  maturityStatus: WorksheetMemoryEvidencePoolMaturityStatus;
  sourceEventIds: string[];
  classificationRecordIds: string[];
  linkedEvents: WorksheetMemoryEvidencePoolEventLink[];
};

export type WorksheetMemoryEvidencePoolEventLink = {
  organizationId: string;
  sourceEventId: string;
  classificationRecordId: string | null;
  classificationVersion: number;
  classificationAttemptNumber: number;
  evidenceRole: "supporting" | "contradictory" | "ignored";
  eventConfidence: number | null;
  occurredAt: string;
};

export type WorksheetMemoryEvidencePoolBuildInput = {
  organizationId?: string | null;
  limit?: number;
};

export type WorksheetMemoryEvidencePoolQueueState =
  | "pending"
  | "claimed"
  | "retry_scheduled"
  | "completed"
  | "dead_lettered";

export type WorksheetMemoryEvidencePoolQueueRow = {
  id: string;
  organizationId: string;
  sourceEventId: string;
  classificationRecordId: string | null;
  classificationVersion: number;
  classificationAttemptNumber: number;
  queueState: WorksheetMemoryEvidencePoolQueueState;
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

export type WorksheetMemoryEvidencePoolBuildOutput = {
  fetchedCount: number;
  poolCount: number;
  persistedPoolCount: number;
  persistedLinkCount: number;
  maturityDistribution: Record<string, number>;
  pools: WorksheetMemoryEvidencePool[];
};

export type RunWorksheetMemoryEvidencePoolWorkerInput = {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
  eventLimit?: number;
};

export type RunWorksheetMemoryEvidencePoolWorkerOutput = {
  claimedJobCount: number;
  completedJobCount: number;
  retriedJobCount: number;
  deadLetteredJobCount: number;
  rebuiltOrganizationCount: number;
  fetchedEventCount: number;
  persistedPoolCount: number;
  persistedLinkCount: number;
  semanticQueueInsertCount: number;
  durationMs: number;
};

type WorksheetEvidenceScopeContext = {
  workbookId: string | null;
  sheetId: string | null;
  worksheetName: string | null;
  tradePackage: string | null;
  normalizedTradePackage: string | null;
  pageType: string | null;
  sectionType: string | null;
  itemCategory: string | null;
  normalizedUnit: string | null;
  costRole: string | null;
  itemLabel: string | null;
  rowLabel: string | null;
  columnHeader: string | null;
};

type WorksheetStructuralScopeIdentity = {
  isStrong: boolean;
  signaturePayload: Record<string, Json | null>;
  diagnosticPayload: Record<string, Json | null>;
  strengthScore: number;
};

type WorksheetMemoryEvidencePoolGroup = {
  organizationId: string;
  poolSignature: string;
  scopeSignature: string;
  targetSignature: string;
  poolKind: string;
  eventType: string;
  scopeContext: Record<string, Json | null>;
  targetContext: Record<string, Json | null>;
  linkedEvents: WorksheetMemoryEvidencePoolEventLink[];
};

const CLASSIFIED_EVENT_LIMIT = 1_000;
const DEFAULT_QUEUE_LIMIT = 25;
const DEFAULT_LEASE_SECONDS = 10 * 60;
const DEFAULT_WORKER_ID = "worksheet-memory-evidence-pool-runner";
const DEFAULT_MAX_ATTEMPTS = 5;

function isJsonRecord(value: unknown): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function roundNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function normalizeSignatureToken(value: unknown) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }

  return normalized.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSignatureArray(values: unknown, limit = 8) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }

  return values
    .map((value) => normalizeSignatureToken(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
}

function normalizeScalarValueType(value: Json | undefined) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (isJsonRecord(value)) {
    return "object";
  }
  return "unknown";
}

function getDiffStringArray(event: ClassifiedWorksheetMemoryEvent, field: string) {
  return normalizeSignatureArray(event.diffData[field]);
}

type WorksheetVisibleCellRecord = {
  columnRole: string | null;
  column: string | null;
  header: string | null;
  displayValue: string | null;
  unit: string | null;
};

function getVisibleCellsFromDiff(event: ClassifiedWorksheetMemoryEvent): WorksheetVisibleCellRecord[] {
  const direct = Array.isArray(event.diffData.rowSnapshotVisibleCells)
    ? event.diffData.rowSnapshotVisibleCells
    : isJsonRecord(event.diffData.rowSnapshotAfter) && Array.isArray(event.diffData.rowSnapshotAfter.visibleCells)
      ? event.diffData.rowSnapshotAfter.visibleCells
      : [];

  return direct
    .filter((entry): entry is Record<string, Json | undefined> => isJsonRecord(entry))
    .map((entry) => ({
      columnRole: toNullableString(entry.columnRole),
      column: toNullableString(entry.column),
      header: toNullableString(entry.header),
      displayValue:
        toNullableString(entry.displayValue)
        ?? toNullableString(entry.value),
      unit: toNullableString(entry.unit),
    }));
}

function getPreferredDescriptionToken(cells: WorksheetVisibleCellRecord[]) {
  const descriptionCell = cells.find((cell) =>
    cell.columnRole === "description"
    && cell.displayValue
    && cell.displayValue.length > 0
  );

  return normalizeSignatureToken(descriptionCell?.displayValue);
}

function getPricingTupleShape(event: ClassifiedWorksheetMemoryEvent) {
  const pricingTuple = isJsonRecord(event.diffData.pricingTuple)
    ? event.diffData.pricingTuple
    : {};

  const roles = ["quantity", "rate", "amount", "labour", "material", "unit"]
    .filter((role) => pricingTuple[role] !== undefined && pricingTuple[role] !== null);

  if (roles.length > 0) {
    return roles;
  }

  const columnRole = normalizeSignatureToken(event.diffData.columnRole);
  return columnRole ? [columnRole] : [];
}

function getRelatedRowStructuralShape(event: ClassifiedWorksheetMemoryEvent) {
  if (!Array.isArray(event.diffData.relatedRows)) {
    return [] as string[];
  }

  return event.diffData.relatedRows
    .filter((entry): entry is Record<string, Json | undefined> => isJsonRecord(entry))
    .map((entry) => {
      const rowLabel = normalizeSignatureToken(entry.rowLabel);
      const itemLabel = normalizeSignatureToken(entry.itemLabel);
      const unit = normalizeSignatureToken(entry.unit);
      const visibleCells = Array.isArray(entry.visibleCells)
        ? entry.visibleCells.filter((cell): cell is Record<string, Json | undefined> => isJsonRecord(cell))
        : [];
      const roles = visibleCells
        .map((cell) => normalizeSignatureToken(cell.columnRole))
        .filter((value): value is string => Boolean(value))
        .sort();

      return JSON.stringify({
        rowLabel,
        itemLabel,
        unit,
        roles,
      });
    })
    .filter((value) => value !== JSON.stringify({ rowLabel: null, itemLabel: null, unit: null, roles: [] }))
    .slice(0, 6);
}

function buildWorksheetStructuralScopeIdentity(
  event: ClassifiedWorksheetMemoryEvent,
): WorksheetStructuralScopeIdentity {
  const scope = getScopeContext(event);
  const visibleCells = getVisibleCellsFromDiff(event);
  const descriptionToken = getPreferredDescriptionToken(visibleCells);
  const sectionPath = getDiffStringArray(event, "sectionPath");
  const sectionLabel = normalizeSignatureToken(event.diffData.sectionLabel);
  const subsectionLabel = normalizeSignatureToken(event.diffData.subsectionLabel);
  const rowLabel = normalizeSignatureToken(event.diffData.rowLabel);
  const itemLabel = normalizeSignatureToken(event.diffData.itemLabel);
  const columnHeader = normalizeSignatureToken(event.diffData.columnHeader);
  const columnRole = normalizeSignatureToken(event.diffData.columnRole);
  const normalizedUnit =
    normalizeSignatureToken(
      isJsonRecord(event.diffData.pricingTuple) && isJsonRecord(event.diffData.pricingTuple.unit)
        ? event.diffData.pricingTuple.unit.value
        : isJsonRecord(event.diffData.rowSnapshotAfter)
          ? event.diffData.rowSnapshotAfter.unit
          : event.diffData.unit,
    )
    ?? normalizeSignatureToken(scope.normalizedUnit);
  const workbookDomain = normalizeSignatureToken(event.metadata.tradePackage)
    ?? normalizeSignatureToken(event.metadata.worksheetName)
    ?? normalizeSignatureToken(event.metadata.sheetName);
  const worksheetDomain = normalizeSignatureToken(event.metadata.worksheetName)
    ?? normalizeSignatureToken(event.metadata.sheetName);
  const targetCellColumn = normalizeSignatureToken(event.diffData.columnId)
    ?? normalizeSignatureToken(event.diffData.column);
  const targetValueType = normalizeScalarValueType(event.diffData.newValue as Json | undefined);
  const priorValueType = normalizeScalarValueType(event.diffData.oldValue as Json | undefined);
  const transitionKind = event.eventType.includes("formula")
    ? "formula_transition"
    : event.eventType.includes("rate")
      ? "rate_transition"
      : event.eventType.includes("assumption")
        ? "assumption_transition"
        : "value_transition";
  const pricingTupleShape = getPricingTupleShape(event);
  const relatedRowShape = getRelatedRowStructuralShape(event);

  const requiredSignals = [
    workbookDomain,
    worksheetDomain,
    rowLabel,
    itemLabel,
    descriptionToken,
    columnRole ?? columnHeader,
    normalizedUnit,
    targetCellColumn,
  ];
  const presentCount = requiredSignals.filter((value) => Boolean(value)).length;
  const hasLocationIdentity =
    (sectionPath.length > 0 || sectionLabel || subsectionLabel)
    && (columnRole || columnHeader)
    && Boolean(targetCellColumn);
  const hasRowIdentity = Boolean(rowLabel && itemLabel && descriptionToken);
  const hasTypeIdentity = Boolean(normalizedUnit && targetValueType && transitionKind);
  const isStrong = hasLocationIdentity && hasRowIdentity && hasTypeIdentity && presentCount >= 7;
  const signaturePayload = {
    signatureVersion: 2,
    poolKind: getPoolKind(event),
    eventType: event.eventType,
    sectionPath,
    sectionLabel,
    subsectionLabel,
    rowLabel,
    itemLabel,
    description: descriptionToken,
    columnHeader,
    columnRole,
    columnKey: targetCellColumn,
    normalizedUnit,
    valueType: targetValueType,
    priorValueType,
    transitionKind,
    pricingTupleShape,
    relatedRowShape,
  } satisfies Record<string, Json | null>;
  const diagnosticPayload = {
    ...signaturePayload,
    workbookDomain,
    worksheetDomain,
  } satisfies Record<string, Json | null>;

  return {
    isStrong,
    strengthScore: presentCount,
    signaturePayload,
    diagnosticPayload,
  };
}

function hasRateTransitionScope(event: ClassifiedWorksheetMemoryEvent) {
  return getPoolKind(event) === "rate_transition" || event.eventType === "worksheet_rate_changed";
}

function hasAssumptionTransitionScope(event: ClassifiedWorksheetMemoryEvent) {
  return getPoolKind(event) === "assumption_transition" || event.eventType === "worksheet_assumption_changed";
}

function matchesScopeToken(value: string | null | undefined, pattern: RegExp) {
  return typeof value === "string" && pattern.test(value);
}

function canonicalizeRatePageType(scope: WorksheetEvidenceScopeContext, event: ClassifiedWorksheetMemoryEvent) {
  const candidateValues = [
    scope.pageType,
    scope.sectionType,
    toNullableString(event.metadata.sheetName),
    toNullableString(event.metadata.worksheetName),
    scope.rowLabel,
    scope.columnHeader,
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\b(summary|total|markup|margin)\b/i))) {
    return "pricing_summary";
  }

  if (candidateValues.some((value) => matchesScopeToken(value, /\b(input|assumption|rate|price|pricing|cost|estimate|audit|worksheet)\b/i))) {
    return "pricing_worksheet";
  }

  return "pricing_worksheet";
}

function canonicalizeRateSectionType(scope: WorksheetEvidenceScopeContext, event: ClassifiedWorksheetMemoryEvent) {
  const candidateValues = [
    scope.sectionType,
    scope.rowLabel,
    scope.columnHeader,
    toNullableString(event.metadata.sheetName),
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\b(summary|total|margin|markup)\b/i))) {
    return "pricing_summary";
  }

  if (candidateValues.some((value) => matchesScopeToken(value, /\b(input|assumption|rate|price|pricing|cost)\b/i))) {
    return "pricing_inputs";
  }

  return "pricing_inputs";
}

function canonicalizeRateRowLabel(scope: WorksheetEvidenceScopeContext, event: ClassifiedWorksheetMemoryEvent) {
  const sectionType = canonicalizeRateSectionType(scope, event);
  if (sectionType === "pricing_summary") {
    return "Pricing Summary";
  }

  return "Pricing Inputs";
}

function canonicalizeRateItemCategory(scope: WorksheetEvidenceScopeContext) {
  const candidateValues = [
    scope.itemCategory,
    scope.costRole,
    scope.columnHeader,
    scope.itemLabel,
    scope.rowLabel,
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\bmarkup|mark\s*up|margin\b/i))) {
    return "margin_rate";
  }
  if (candidateValues.some((value) => matchesScopeToken(value, /\blabou?r\b/i))) {
    return "labour_rate";
  }
  if (candidateValues.some((value) => matchesScopeToken(value, /\bmaterial|supply\b/i))) {
    return "material_rate";
  }
  if (candidateValues.some((value) => matchesScopeToken(value, /\bsubcontract|subbie\b/i))) {
    return "subcontract_rate";
  }
  if (candidateValues.some((value) => matchesScopeToken(value, /\bpercentage|percent|%\b/i))) {
    return "percentage_rate";
  }

  return "rate";
}

function canonicalizeRateUnit(scope: WorksheetEvidenceScopeContext) {
  const candidateValues = [
    scope.normalizedUnit,
    scope.columnHeader,
    scope.itemCategory,
    scope.costRole,
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\bpercentage|percent|%\b/i))) {
    return "rate_percent";
  }

  return "rate_per_unit";
}

function canonicalizeAssumptionPageType(scope: WorksheetEvidenceScopeContext, event: ClassifiedWorksheetMemoryEvent) {
  const candidateValues = [
    scope.pageType,
    scope.sectionType,
    toNullableString(event.metadata.sheetName),
    toNullableString(event.metadata.worksheetName),
    scope.rowLabel,
    scope.columnHeader,
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\b(input|assumption|estimate|audit|worksheet)\b/i))) {
    return "worksheet_inputs";
  }

  return "worksheet_inputs";
}

function canonicalizeAssumptionSectionType(scope: WorksheetEvidenceScopeContext, event: ClassifiedWorksheetMemoryEvent) {
  const candidateValues = [
    scope.sectionType,
    scope.rowLabel,
    scope.columnHeader,
    toNullableString(event.metadata.sheetName),
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\b(input|assumption|estimate|audit|worksheet)\b/i))) {
    return "worksheet_inputs";
  }

  return "worksheet_inputs";
}

function canonicalizeAssumptionItemCategory(scope: WorksheetEvidenceScopeContext) {
  const candidateValues = [
    scope.itemCategory,
    scope.costRole,
    scope.columnHeader,
    scope.itemLabel,
    scope.rowLabel,
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\bwaste|scrap|loss|allowance|factor\b/i))) {
    return "waste_factor";
  }

  if (candidateValues.some((value) => matchesScopeToken(value, /\bmargin|markup\b/i))) {
    return "margin_assumption";
  }

  return "assumption";
}

function canonicalizeAssumptionUnit(scope: WorksheetEvidenceScopeContext) {
  const candidateValues = [
    scope.normalizedUnit,
    scope.columnHeader,
    scope.itemCategory,
    scope.costRole,
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\bpercentage|percent|%\b/i))) {
    return "%";
  }

  return normalizeSignatureToken(scope.normalizedUnit) ?? "value";
}

function canonicalizeAssumptionCostRole(scope: WorksheetEvidenceScopeContext) {
  const candidateValues = [
    scope.costRole,
    scope.itemCategory,
    scope.itemLabel,
    scope.rowLabel,
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\bwaste|scrap|loss|allowance|contingency\b/i))) {
    return "material_waste_contingency";
  }

  if (candidateValues.some((value) => matchesScopeToken(value, /\bmargin|markup\b/i))) {
    return "margin_assumption";
  }

  return normalizeSignatureToken(scope.costRole) ?? "input_assumption";
}

function canonicalizeAssumptionItemLabel(scope: WorksheetEvidenceScopeContext) {
  const candidateValues = [
    scope.itemLabel,
    scope.rowLabel,
    scope.columnHeader,
  ];

  if (candidateValues.some((value) => matchesScopeToken(value, /\bperimeter\b/i))
    && candidateValues.some((value) => matchesScopeToken(value, /\bwaste|scrap|loss|allowance|factor\b/i))) {
    return "Perimeter Waste Factor";
  }

  if (candidateValues.some((value) => matchesScopeToken(value, /\bgrid spacing\b/i))) {
    return "Grid Spacing";
  }

  return scope.itemLabel ?? scope.rowLabel;
}

function canonicalizeAssumptionRowLabel(scope: WorksheetEvidenceScopeContext) {
  if (matchesScopeToken(scope.rowLabel, /\binputs?\b/i)) {
    return "Inputs";
  }

  return "Inputs";
}

function canonicalizeScopeContext(
  scope: WorksheetEvidenceScopeContext,
  event: ClassifiedWorksheetMemoryEvent,
): WorksheetEvidenceScopeContext {
  if (hasRateTransitionScope(event)) {
    return {
      ...scope,
      pageType: canonicalizeRatePageType(scope, event),
      sectionType: canonicalizeRateSectionType(scope, event),
      itemCategory: canonicalizeRateItemCategory(scope),
      normalizedUnit: canonicalizeRateUnit(scope),
      rowLabel: canonicalizeRateRowLabel(scope, event),
    };
  }

  if (hasAssumptionTransitionScope(event)) {
    return {
      ...scope,
      pageType: canonicalizeAssumptionPageType(scope, event),
      sectionType: canonicalizeAssumptionSectionType(scope, event),
      itemCategory: canonicalizeAssumptionItemCategory(scope),
      normalizedUnit: canonicalizeAssumptionUnit(scope),
      costRole: canonicalizeAssumptionCostRole(scope),
      itemLabel: canonicalizeAssumptionItemLabel(scope),
      rowLabel: canonicalizeAssumptionRowLabel(scope),
    };
  }

  return scope;
}

function hashSignaturePayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function getSemanticFieldValue(
  event: ClassifiedWorksheetMemoryEvent,
  field: keyof WorksheetMemorySemanticFields,
) {
  const record = event.semanticFields[field];
  return record && typeof record === "object" ? toNullableString(record.value) : null;
}

function getInterpretedChangeRecord(event: ClassifiedWorksheetMemoryEvent) {
  return isJsonRecord(event.interpretationPayload)
    && isJsonRecord(event.interpretationPayload.interpretedChange)
    ? event.interpretationPayload.interpretedChange
    : {};
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

function getScopeContext(event: ClassifiedWorksheetMemoryEvent): WorksheetEvidenceScopeContext {
  return canonicalizeScopeContext({
    workbookId: toNullableString(event.metadata.workbookId),
    sheetId: toNullableString(event.metadata.sheetId),
    worksheetName: toNullableString(event.metadata.worksheetName),
    tradePackage: toNullableString(event.metadata.tradePackage),
    normalizedTradePackage:
      getSemanticFieldValue(event, "normalizedTradePackage")
      ?? getNestedInterpretationString(event, "constructionContext", "tradeOrScope"),
    pageType:
      getSemanticFieldValue(event, "pageType")
      ?? getNestedInterpretationString(event, "constructionContext", "pageType"),
    sectionType:
      getSemanticFieldValue(event, "sectionType")
      ?? getNestedInterpretationString(event, "constructionContext", "sectionType"),
    itemCategory:
      getSemanticFieldValue(event, "itemCategory")
      ?? getNestedInterpretationString(event, "constructionContext", "itemCategory"),
    normalizedUnit: getSemanticFieldValue(event, "normalizedUnit") ?? toNullableString(event.diffData.unit),
    costRole:
      getSemanticFieldValue(event, "costRole")
      ?? getNestedInterpretationString(event, "pricingContext", "costRole"),
    itemLabel: toNullableString(event.diffData.itemLabel),
    rowLabel: toNullableString(event.diffData.rowLabel),
    columnHeader: toNullableString(event.diffData.columnHeader),
  }, event);
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

  if (event.projectId && worksheetName) {
    return `project:${event.projectId}:worksheet:${worksheetName}`;
  }

  return `event:${event.eventId}`;
}

function getPoolKind(event: ClassifiedWorksheetMemoryEvent) {
  if (event.eventType.includes("formula")) {
    return "formula_transition";
  }
  if (event.eventType.includes("rate")) {
    return "rate_transition";
  }
  if (event.eventType.includes("assumption")) {
    return "assumption_transition";
  }
  return "generic_transition";
}

function buildScopeSignaturePayload(event: ClassifiedWorksheetMemoryEvent) {
  const scope = getScopeContext(event);
  const structuralIdentity = buildWorksheetStructuralScopeIdentity(event);

  if (structuralIdentity.isStrong) {
    return structuralIdentity.signaturePayload;
  }

  return {
    poolKind: getPoolKind(event),
    eventType: event.eventType,
    tradePackage: normalizeSignatureToken(scope.tradePackage),
    normalizedTradePackage: normalizeSignatureToken(scope.normalizedTradePackage),
    pageType: normalizeSignatureToken(scope.pageType),
    sectionType: normalizeSignatureToken(scope.sectionType),
    itemCategory: normalizeSignatureToken(scope.itemCategory),
    normalizedUnit: normalizeSignatureToken(scope.normalizedUnit),
    costRole: normalizeSignatureToken(scope.costRole),
    itemLabel: normalizeSignatureToken(scope.itemLabel),
    rowLabel: normalizeSignatureToken(scope.rowLabel),
    columnHeader: normalizeSignatureToken(scope.columnHeader),
  };
}

function buildTargetSignaturePayload(event: ClassifiedWorksheetMemoryEvent) {
  const oldFormula = toNullableString(event.diffData.oldFormula);
  const newFormula = toNullableString(event.diffData.newFormula);
  const oldValue = compactJsonValue(event.diffData.oldValue as Json | undefined);
  const newValue = compactJsonValue(event.diffData.newValue as Json | undefined);

  if (oldFormula || newFormula) {
    return {
      kind: "formula_transition",
      oldFormula,
      newFormula,
    };
  }

  if (hasRateTransitionScope(event)) {
    const direction =
      typeof oldValue === "number" && typeof newValue === "number"
        ? newValue > oldValue
          ? "increase"
          : newValue < oldValue
            ? "decrease"
            : "unchanged"
        : oldValue === null && newValue !== null
          ? "set"
          : oldValue !== null && newValue === null
            ? "cleared"
            : "changed";

    return {
      kind: "rate_transition",
      changeType: "value_update",
      direction,
    };
  }

  return {
    kind: "value_transition",
    oldValue,
    newValue,
  };
}

function buildScopeContextRecord(event: ClassifiedWorksheetMemoryEvent) {
  const scope = getScopeContext(event);
  const structuralIdentity = buildWorksheetStructuralScopeIdentity(event);
  return {
    tradePackage: scope.tradePackage,
    normalizedTradePackage: scope.normalizedTradePackage,
    pageType: scope.pageType,
    sectionType: scope.sectionType,
    itemCategory: scope.itemCategory,
    normalizedUnit: scope.normalizedUnit,
    costRole: scope.costRole,
    itemLabel: scope.itemLabel,
    rowLabel: scope.rowLabel,
    columnHeader: scope.columnHeader,
    structuralIdentityStrong: structuralIdentity.isStrong,
    structuralIdentityStrengthScore: structuralIdentity.strengthScore,
    structuralSignaturePayload: structuralIdentity.diagnosticPayload,
    structuralHashSignaturePayload: structuralIdentity.signaturePayload,
    classifierCostRole: getSemanticFieldValue(event, "costRole"),
    classifierPageType: getSemanticFieldValue(event, "pageType"),
    classifierItemCategory: getSemanticFieldValue(event, "itemCategory"),
  } satisfies Record<string, Json | null>;
}

function buildTargetContextRecord(event: ClassifiedWorksheetMemoryEvent) {
  const interpreted = getInterpretedChangeRecord(event);
  return {
    kind: getPoolKind(event),
    oldValue: compactJsonValue(event.diffData.oldValue as Json | undefined),
    newValue: compactJsonValue(event.diffData.newValue as Json | undefined),
    oldFormula: toNullableString(event.diffData.oldFormula),
    newFormula: toNullableString(event.diffData.newFormula),
    summary:
      toNullableString(interpreted.plainEnglishSummary)
      ?? toNullableString(interpreted.whatChanged)
      ?? toNullableString(event.reasoningSummary),
  } satisfies Record<string, Json | null>;
}

function computeMaturityStatus(params: {
  evidenceCount: number;
  worksheetCount: number;
  projectCount: number;
}): WorksheetMemoryEvidencePoolMaturityStatus {
  if (
    params.evidenceCount >= 8
    && params.worksheetCount >= 4
    && params.projectCount >= 3
  ) {
    return "durable";
  }

  if (
    params.evidenceCount >= 5
    && params.worksheetCount >= 3
    && params.projectCount >= 2
  ) {
    return "reinforced";
  }

  if (
    params.evidenceCount >= 2
    && params.worksheetCount >= 2
    && params.projectCount >= 2
  ) {
    return "ready_for_synthesis";
  }

  return "emerging";
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildWorksheetMemoryEvidencePools(
  events: ClassifiedWorksheetMemoryEvent[],
): WorksheetMemoryEvidencePool[] {
  const eventById = new Map(events.map((event) => [event.eventId, event] as const));
  const grouped = new Map<string, WorksheetMemoryEvidencePoolGroup>();

  for (const event of events) {
    if (event.classificationStatus !== "classified") {
      continue;
    }

    const scopePayload = buildScopeSignaturePayload(event);
    const targetPayload = buildTargetSignaturePayload(event);
    const scopeSignature = hashSignaturePayload(scopePayload);
    const targetSignature = hashSignaturePayload(targetPayload);
    const poolSignature = hashSignaturePayload({
      organizationId: event.organizationId,
      scope: scopePayload,
      target: targetPayload,
    });
    const groupingKey = `${event.organizationId}:${poolSignature}`;

    const existing: WorksheetMemoryEvidencePoolGroup = grouped.get(groupingKey) ?? {
      organizationId: event.organizationId,
      poolSignature,
      scopeSignature,
      targetSignature,
      poolKind: getPoolKind(event),
      eventType: event.eventType,
      scopeContext: buildScopeContextRecord(event),
      targetContext: buildTargetContextRecord(event),
      linkedEvents: [],
    };

    existing.linkedEvents.push({
      organizationId: event.organizationId,
      sourceEventId: event.eventId,
      classificationRecordId: event.classificationRecordId ?? null,
      classificationVersion: Math.max(1, Math.floor(event.classificationVersion ?? 1)),
      classificationAttemptNumber: Math.max(1, Math.floor(event.classificationAttemptNumber ?? 1)),
      evidenceRole: "supporting" as const,
      eventConfidence: event.overallConfidence ?? null,
      occurredAt: event.occurredAt,
    });

    grouped.set(groupingKey, existing);
  }

  return Array.from(grouped.values())
    .map((group) => {
      const worksheetKeys = new Set<string>();
      const workbookIds = new Set<string>();
      const projectIds = new Set<string>();
      const classificationRecordIds = new Set<string>();
      const sourceEventIds = new Set<string>();
      const confidences: number[] = [];

      const linkedEvents = [...group.linkedEvents].sort((left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) || left.sourceEventId.localeCompare(right.sourceEventId),
      );

      for (const linkedEvent of linkedEvents) {
        sourceEventIds.add(linkedEvent.sourceEventId);
        if (linkedEvent.classificationRecordId) {
          classificationRecordIds.add(linkedEvent.classificationRecordId);
        }
        if (typeof linkedEvent.eventConfidence === "number") {
          confidences.push(linkedEvent.eventConfidence);
        }

        const sourceEvent = eventById.get(linkedEvent.sourceEventId);
        if (sourceEvent) {
          worksheetKeys.add(getWorksheetKey(sourceEvent));
          const workbookId = toNullableString(sourceEvent.metadata.workbookId);
          if (workbookId) {
            workbookIds.add(workbookId);
          }
          if (sourceEvent.projectId) {
            projectIds.add(sourceEvent.projectId);
          }
        }
      }

      const firstSeenAt = linkedEvents[0]?.occurredAt ?? new Date(0).toISOString();
      const lastSeenAt = linkedEvents[linkedEvents.length - 1]?.occurredAt ?? firstSeenAt;
      const evidenceCount = linkedEvents.length;
      const worksheetCount = worksheetKeys.size;
      const workbookCount = workbookIds.size;
      const projectCount = projectIds.size;
      const averageConfidence = roundNumber(average(confidences));
      const maturityStatus = computeMaturityStatus({
        evidenceCount,
        worksheetCount,
        projectCount,
      });
      const poolRevisionHash = hashSignaturePayload({
        poolSignature: group.poolSignature,
        sourceEventIds: [...sourceEventIds].sort(),
        classificationRecordIds: [...classificationRecordIds].sort(),
      });

      return {
        organizationId: group.organizationId,
        poolSignature: group.poolSignature,
        scopeSignature: group.scopeSignature,
        targetSignature: group.targetSignature,
        poolKind: group.poolKind,
        eventType: group.eventType,
        scopeContext: group.scopeContext,
        targetContext: group.targetContext,
        evidenceCount,
        worksheetCount,
        workbookCount,
        projectCount,
        supportCount: evidenceCount,
        contradictionCount: 0,
        ignoredCount: 0,
        averageConfidence,
        firstSeenAt,
        lastSeenAt,
        poolRevisionHash,
        maturityStatus,
        sourceEventIds: [...sourceEventIds].sort(),
        classificationRecordIds: [...classificationRecordIds].sort(),
        linkedEvents,
      } satisfies WorksheetMemoryEvidencePool;
    })
    .sort((left, right) =>
      left.organizationId.localeCompare(right.organizationId)
      || right.evidenceCount - left.evidenceCount
      || left.poolSignature.localeCompare(right.poolSignature),
    );
}

type PersistedPoolRow = {
  id: string;
  organization_id: string;
  pool_signature: string;
};

type UpsertResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type UpsertSelectBuilder<TPayload, TResult> = {
  upsert: (payload: TPayload, options?: { onConflict?: string }) => {
    select: (columns: string) => Promise<UpsertResponse<TResult>>;
  };
};

type DeleteResponse = {
  error: { message: string } | null;
};

type RpcResponse<T> = {
  data: T | null;
  error: { message: string } | null;
};

function toPositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function parseQueueRow(row: Record<string, unknown>): WorksheetMemoryEvidencePoolQueueRow {
  return {
    id: toNullableString(row.id) ?? "",
    organizationId: toNullableString(row.organizationId) ?? "",
    sourceEventId: toNullableString(row.sourceEventId) ?? "",
    classificationRecordId: toNullableString(row.classificationRecordId),
    classificationVersion: toPositiveInteger(row.classificationVersion, 1),
    classificationAttemptNumber: toPositiveInteger(row.classificationAttemptNumber, 1),
    queueState:
      row.queueState === "pending"
      || row.queueState === "claimed"
      || row.queueState === "retry_scheduled"
      || row.queueState === "completed"
      || row.queueState === "dead_lettered"
        ? row.queueState
        : "pending",
    attemptCount: toPositiveInteger(row.attemptCount, 1),
    maxAttempts: toPositiveInteger(row.maxAttempts, DEFAULT_MAX_ATTEMPTS),
    priority: typeof row.priority === "number" && Number.isFinite(row.priority) ? Math.floor(row.priority) : 0,
    availableAt: toNullableString(row.availableAt),
    retryAfter: toNullableString(row.retryAfter),
    claimedAt: toNullableString(row.claimedAt),
    claimExpiresAt: toNullableString(row.claimExpiresAt),
    claimedBy: toNullableString(row.claimedBy),
    claimToken: toNullableString(row.claimToken),
    lastErrorCode: toNullableString(row.lastErrorCode),
    lastErrorMessage: toNullableString(row.lastErrorMessage),
    createdAt: toNullableString(row.createdAt),
    updatedAt: toNullableString(row.updatedAt),
  };
}

function buildRetryAfter(attemptCount: number, now = new Date()) {
  const seconds = Math.min(60 * 60, 30 * 2 ** Math.max(attemptCount - 1, 0));
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

async function persistWorksheetMemoryEvidencePools(
  pools: WorksheetMemoryEvidencePool[],
) {
  if (pools.length === 0) {
    return {
      poolCount: 0,
      linkCount: 0,
    };
  }

  const admin = createAdminSupabaseClient();
  const poolsTable = admin.from("worksheet_memory_evidence_pools" as never) as unknown as UpsertSelectBuilder<
    Array<Record<string, unknown>>,
    PersistedPoolRow
  >;
  const poolPayload = pools.map((pool) => ({
    organization_id: pool.organizationId,
    pool_signature: pool.poolSignature,
    scope_signature: pool.scopeSignature,
    target_signature: pool.targetSignature,
    pool_kind: pool.poolKind,
    event_type: pool.eventType,
    scope_context: pool.scopeContext,
    target_context: pool.targetContext,
    evidence_count: pool.evidenceCount,
    worksheet_count: pool.worksheetCount,
    workbook_count: pool.workbookCount,
    project_count: pool.projectCount,
    support_count: pool.supportCount,
    contradiction_count: pool.contradictionCount,
    ignored_count: pool.ignoredCount,
    average_confidence: pool.averageConfidence,
    first_seen_at: pool.firstSeenAt,
    last_seen_at: pool.lastSeenAt,
    pool_revision_hash: pool.poolRevisionHash,
    maturity_status: pool.maturityStatus,
    last_built_at: new Date().toISOString(),
  }));

  const poolResponse = await poolsTable
    .upsert(poolPayload, {
      onConflict: "organization_id,pool_signature",
    })
    .select("id, organization_id, pool_signature");

  if (poolResponse.error) {
    throw new Error(poolResponse.error.message);
  }

  const persistedPools = Array.isArray(poolResponse.data) ? poolResponse.data : [];
  const poolIdByKey = new Map(
    persistedPools.map((row) => [`${row.organization_id}:${row.pool_signature}`, row.id] as const),
  );

  const linkPayload = pools.flatMap((pool) => {
    const poolId = poolIdByKey.get(`${pool.organizationId}:${pool.poolSignature}`);
    if (!poolId) {
      return [];
    }

    return pool.linkedEvents.map((linkedEvent) => ({
      pool_id: poolId,
      organization_id: pool.organizationId,
      source_event_id: linkedEvent.sourceEventId,
      classification_record_id: linkedEvent.classificationRecordId,
      classification_version: linkedEvent.classificationVersion,
      classification_attempt_number: linkedEvent.classificationAttemptNumber,
      evidence_role: linkedEvent.evidenceRole,
      event_confidence: linkedEvent.eventConfidence,
      occurred_at: linkedEvent.occurredAt,
    }));
  });

  if (linkPayload.length === 0) {
    return {
      poolCount: persistedPools.length,
      linkCount: 0,
    };
  }

  const poolEventsTable = admin.from("worksheet_memory_evidence_pool_events" as never) as unknown as UpsertSelectBuilder<
    Array<Record<string, unknown>>,
    { id: string }
  >;
  const linkResponse = await poolEventsTable
    .upsert(linkPayload, {
      onConflict: "pool_id,source_event_id",
    })
    .select("id");

  if (linkResponse.error) {
    throw new Error(linkResponse.error.message);
  }

  return {
    poolCount: persistedPools.length,
    linkCount: Array.isArray(linkResponse.data) ? linkResponse.data.length : linkPayload.length,
  };
}

async function reconcileWorksheetMemoryEvidencePoolsForOrganization(
  organizationId: string,
  pools: WorksheetMemoryEvidencePool[],
) {
  const admin = createAdminSupabaseClient();
  const existingResponse = await (admin
    .from("worksheet_memory_evidence_pools" as never)
    .select("id, organization_id, pool_signature")
    .eq("organization_id", organizationId as never)) as unknown as UpsertResponse<PersistedPoolRow>;

  if (existingResponse.error) {
    throw new Error(existingResponse.error.message);
  }

  const existingPools = Array.isArray(existingResponse.data) ? existingResponse.data : [];
  const desiredSignatures = new Set(pools.map((pool) => pool.poolSignature));
  const stalePoolIds = existingPools
    .filter((row) => !desiredSignatures.has(row.pool_signature))
    .map((row) => row.id);

  if (stalePoolIds.length > 0) {
    const staleDeleteResponse = await (admin
      .from("worksheet_memory_evidence_pools" as never)
      .delete()
      .eq("organization_id", organizationId as never)
      .in("id", stalePoolIds as never)) as unknown as DeleteResponse;

    if (staleDeleteResponse.error) {
      throw new Error(staleDeleteResponse.error.message);
    }
  }

  if (pools.length === 0) {
    return {
      poolCount: 0,
      linkCount: 0,
    };
  }

  const persisted = await persistWorksheetMemoryEvidencePools(pools);
  const refreshedResponse = await (admin
    .from("worksheet_memory_evidence_pools" as never)
    .select("id, organization_id, pool_signature")
    .eq("organization_id", organizationId as never)) as unknown as UpsertResponse<PersistedPoolRow>;

  if (refreshedResponse.error) {
    throw new Error(refreshedResponse.error.message);
  }

  const refreshedPools = Array.isArray(refreshedResponse.data) ? refreshedResponse.data : [];
  const persistedPoolIds = refreshedPools
    .filter((row) => desiredSignatures.has(row.pool_signature))
    .map((row) => row.id);

  if (persistedPoolIds.length > 0) {
    const deleteLinksResponse = await (admin
      .from("worksheet_memory_evidence_pool_events" as never)
      .delete()
      .eq("organization_id", organizationId as never)
      .in("pool_id", persistedPoolIds as never)) as unknown as DeleteResponse;

    if (deleteLinksResponse.error) {
      throw new Error(deleteLinksResponse.error.message);
    }
  }

  const refreshedPersisted = await persistWorksheetMemoryEvidencePools(pools);
  return {
    poolCount: refreshedPersisted.poolCount,
    linkCount: refreshedPersisted.linkCount,
  };
}

async function buildWorksheetMemoryEvidencePoolsForOrganization(
  organizationId: string,
  limit = CLASSIFIED_EVENT_LIMIT,
) {
  const events = await listClassifiedWorksheetMemoryEvents({
    organizationId,
    limit: Math.min(Math.max(limit, 1), CLASSIFIED_EVENT_LIMIT),
  });
  const pools = buildWorksheetMemoryEvidencePools(events).filter((pool) => pool.organizationId === organizationId);
  const persisted = await reconcileWorksheetMemoryEvidencePoolsForOrganization(organizationId, pools);
  const maturityDistribution = pools.reduce<Record<string, number>>((acc, pool) => {
    acc[pool.maturityStatus] = (acc[pool.maturityStatus] ?? 0) + 1;
    return acc;
  }, {});

  return {
    fetchedCount: events.length,
    poolCount: pools.length,
    persistedPoolCount: persisted.poolCount,
    persistedLinkCount: persisted.linkCount,
    maturityDistribution,
    pools,
  } satisfies WorksheetMemoryEvidencePoolBuildOutput;
}

async function claimWorksheetMemoryEvidencePoolBatch(params?: {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
}) {
  const admin = createAdminSupabaseClient();
  const response = await admin.rpc("claim_worksheet_memory_evidence_pool_batch" as never, {
    p_limit: Math.max(params?.limit ?? DEFAULT_QUEUE_LIMIT, 1),
    p_organization_id: params?.organizationId ?? null,
    p_worker_id: params?.workerId ?? DEFAULT_WORKER_ID,
    p_lease_seconds: Math.max(params?.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 30),
  } as never) as unknown as RpcResponse<Array<Record<string, unknown>>>;
  const { data, error } = response;

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data)) {
    return [] as WorksheetMemoryEvidencePoolQueueRow[];
  }

  return data
    .map((row) => parseQueueRow((row ?? {}) as Record<string, unknown>))
    .filter((row) => row.id.length > 0 && row.organizationId.length > 0 && row.claimToken);
}

async function finalizeWorksheetMemoryEvidencePoolBatch(inputs: Array<{
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
  const response = await admin.rpc("finalize_worksheet_memory_evidence_pool_batch" as never, {
    p_inputs: inputs,
  } as never) as unknown as RpcResponse<Record<string, unknown>>;
  const { data, error } = response;

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

async function enqueueWorksheetMemorySemanticPoolQueue(organizationId: string, limit: number) {
  const admin = createAdminSupabaseClient();
  const response = await admin.rpc("enqueue_worksheet_memory_semantic_pool_queue" as never, {
    p_limit: Math.max(limit, 1),
    p_organization_id: organizationId,
  } as never) as unknown as RpcResponse<Record<string, unknown>>;
  const { data, error } = response;

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return typeof payload.count === "number" ? payload.count : 0;
}

export async function runWorksheetMemoryEvidencePoolBuild(
  input: WorksheetMemoryEvidencePoolBuildInput = {},
): Promise<WorksheetMemoryEvidencePoolBuildOutput> {
  await requirePlatformAdmin("admin");

  if (input.organizationId) {
    return buildWorksheetMemoryEvidencePoolsForOrganization(
      input.organizationId,
      input.limit ?? CLASSIFIED_EVENT_LIMIT,
    );
  }

  const events = await listClassifiedWorksheetMemoryEvents({
    organizationId: input.organizationId ?? null,
    limit: Math.min(Math.max(input.limit ?? CLASSIFIED_EVENT_LIMIT, 1), CLASSIFIED_EVENT_LIMIT),
  });
  const pools = buildWorksheetMemoryEvidencePools(events);
  const persisted = await persistWorksheetMemoryEvidencePools(pools);
  const maturityDistribution = pools.reduce<Record<string, number>>((acc, pool) => {
    acc[pool.maturityStatus] = (acc[pool.maturityStatus] ?? 0) + 1;
    return acc;
  }, {});

  return {
    fetchedCount: events.length,
    poolCount: pools.length,
    persistedPoolCount: persisted.poolCount,
    persistedLinkCount: persisted.linkCount,
    maturityDistribution,
    pools,
  };
}

export async function runWorksheetMemoryEvidencePoolWorker(
  input: RunWorksheetMemoryEvidencePoolWorkerInput = {},
): Promise<RunWorksheetMemoryEvidencePoolWorkerOutput> {
  const startedAt = Date.now();
  const claimedRows = await claimWorksheetMemoryEvidencePoolBatch({
    limit: input.limit,
    organizationId: input.organizationId ?? null,
    workerId: input.workerId,
    leaseSeconds: input.leaseSeconds,
  });

  if (claimedRows.length === 0) {
    return {
      claimedJobCount: 0,
      completedJobCount: 0,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      rebuiltOrganizationCount: 0,
      fetchedEventCount: 0,
      persistedPoolCount: 0,
      persistedLinkCount: 0,
      semanticQueueInsertCount: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const rowsByOrganization = new Map<string, WorksheetMemoryEvidencePoolQueueRow[]>();
  for (const row of claimedRows) {
    const current = rowsByOrganization.get(row.organizationId) ?? [];
    current.push(row);
    rowsByOrganization.set(row.organizationId, current);
  }

  const finalizationInputs: Array<{
    id: string;
    claimToken: string;
    queueState: "completed" | "retry_scheduled" | "dead_lettered";
    retryAfter?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }> = [];
  let rebuiltOrganizationCount = 0;
  let fetchedEventCount = 0;
  let persistedPoolCount = 0;
  let persistedLinkCount = 0;
  let semanticQueueInsertCount = 0;

  for (const [organizationId, rows] of rowsByOrganization.entries()) {
    try {
      const result = await buildWorksheetMemoryEvidencePoolsForOrganization(
        organizationId,
        input.eventLimit ?? CLASSIFIED_EVENT_LIMIT,
      );
      rebuiltOrganizationCount += 1;
      fetchedEventCount += result.fetchedCount;
      persistedPoolCount += result.persistedPoolCount;
      persistedLinkCount += result.persistedLinkCount;
      semanticQueueInsertCount += await enqueueWorksheetMemorySemanticPoolQueue(
        organizationId,
        Math.max(result.persistedPoolCount, 1),
      );

      for (const row of rows) {
        if (!row.claimToken) {
          continue;
        }
        finalizationInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: "completed",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to rebuild worksheet memory evidence pools.";
      for (const row of rows) {
        if (!row.claimToken) {
          continue;
        }
        finalizationInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: row.attemptCount >= row.maxAttempts ? "dead_lettered" : "retry_scheduled",
          retryAfter: row.attemptCount >= row.maxAttempts ? null : buildRetryAfter(row.attemptCount),
          errorCode: "stage6_build_failed",
          errorMessage: message,
        });
      }
    }
  }

  const finalized = await finalizeWorksheetMemoryEvidencePoolBatch(finalizationInputs);
  return {
    claimedJobCount: claimedRows.length,
    completedJobCount: finalized.completedCount,
    retriedJobCount: finalized.retriedCount,
    deadLetteredJobCount: finalized.deadLetteredCount,
    rebuiltOrganizationCount,
    fetchedEventCount,
    persistedPoolCount,
    persistedLinkCount,
    semanticQueueInsertCount,
    durationMs: Date.now() - startedAt,
  };
}

export const worksheetMemoryEvidencePoolTestUtils = {
  buildScopeSignaturePayload,
  buildTargetSignaturePayload,
  computeMaturityStatus,
};
