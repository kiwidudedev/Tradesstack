import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeWorksheetData,
  type WorksheetCell,
  type WorksheetData,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import { parseWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import type { PricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import type {
  PricingWorksheetAiEvidenceSource,
  PricingWorksheetAiReviewFinding,
} from "@/lib/pricing-worksheet-edit-plan";
import { extractPricingWorksheetFormulaReferences } from "@/lib/pricing-worksheet-formula-references";
import type { Database, Json } from "@/lib/supabase/types";

type BrowserSupabaseClient = SupabaseClient<Database>;

function isJsonRecord(value: unknown): value is Record<string, Json | null> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type WorksheetStructureSummary = {
  rowCount: number;
  columnCount: number;
  formulaCount: number;
  populatedCellCount: number;
};

type WorksheetEntityRef = {
  entityType: string;
  entityId: string;
};

type WorksheetIntelligenceEventType =
  | "worksheet_created"
  | "worksheet_renamed"
  | "worksheet_duplicated"
  | "worksheet_archived"
  | "worksheet_saved"
  | "worksheet_cell_edited"
  | "worksheet_formula_edited"
  | "worksheet_rate_changed"
  | "worksheet_assumption_changed"
  | "worksheet_ai_preview_accepted"
  | "worksheet_ai_preview_rejected"
  | "worksheet_ai_output_corrected"
  | "worksheet_ai_formula_corrected"
  | "worksheet_ai_rate_corrected"
  | "worksheet_ai_assumption_corrected"
  | "worksheet_ai_review_generated"
  | "worksheet_ai_followup_submitted"
  | "worksheet_ai_finding_accepted"
  | "worksheet_ai_finding_rejected"
  | "worksheet_ai_finding_invalidated"
  | "worksheet_ai_finding_revised"
  | "worksheet_ai_finding_confirmed"
  | "worksheet_ai_suggested_edit_applied";

type WorksheetIntelligenceAction =
  | "created"
  | "renamed"
  | "duplicated"
  | "archived"
  | "saved"
  | "edited"
  | "corrected"
  | "reviewed"
  | "revised"
  | "accepted"
  | "rejected"
  | "invalidated"
  | "confirmed"
  | "applied";

type WorksheetIntelligenceEventFamily =
  | "entity_lifecycle"
  | "commercial_action"
  | "ai_review"
  | "field_change"
  | "correction";

export type WorksheetLearningSource = "manual" | "ai" | "system";

export type WorksheetLearningEventClassification =
  | "worksheet_cell_edited"
  | "worksheet_formula_edited"
  | "worksheet_rate_changed"
  | "worksheet_assumption_changed";

export type WorksheetMutationEvidenceV2EventType =
  | WorksheetLearningEventClassification
  | WorksheetAiCorrectionClassification;

export type WorksheetAiCorrectionClassification =
  | "worksheet_ai_output_corrected"
  | "worksheet_ai_formula_corrected"
  | "worksheet_ai_rate_corrected"
  | "worksheet_ai_assumption_corrected";

export type WorksheetLearningValidationResult = {
  status: "passed" | "warning" | "failed" | "not_applicable";
  code?: string | null;
  message?: string | null;
};

export type WorksheetLearningMemoryEligibility = {
  eligible: boolean;
  reason: string | null;
};

export type WorksheetAiProvenance = {
  generatedByAi: boolean;
  aiInteractionId: string | null;
  aiJobId: string | null;
  generatedAt: string | null;
  operationType: string | null;
  generationBatchId: string | null;
  promptSummary: string | null;
  sourcePromptHash: string | null;
  originalAiValue: string | number | boolean | null;
  originalAiFormula: string | null;
  lastCorrectedAt: string | null;
  correctedByUserId: string | null;
};

export type WorksheetLearningEventSample = {
  cell: string;
  cellAddress?: string | null;
  row: number | null;
  rowIndex?: number | null;
  column: string | null;
  columnId?: string | null;
  columnHeader: string | null;
  columnRole?: WorksheetColumnRole | null;
  nearbyHeaders: string[];
  nearbyRows: Array<Record<string, Json>>;
  sectionLabel: string | null;
  subsectionLabel?: string | null;
  sectionPath?: string[];
  rowLabel: string | null;
  itemLabel: string | null;
  unit: string | null;
  formula: string | null;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
  oldFormula: string | null;
  newFormula: string | null;
  formulaReferences: string[];
  referencedCellsSnapshot?: Array<Record<string, Json>>;
  rowSnapshotBefore?: Record<string, Json> | null;
  rowSnapshotAfter?: Record<string, Json> | null;
  rowSnapshotVisibleCells?: Array<Record<string, Json>>;
  pricingTuple?: Record<string, Json | null>;
  relatedRows?: Array<Record<string, Json>>;
  evidenceSchemaVersion?: number;
  captureCompletenessScore?: number;
  captureWarnings?: string[];
  labelExtractionMode?: string;
  sectionInferenceMode?: string;
  rowSnapshotCompleteness?: number;
  aiInteractionId: string | null;
  validationResult: WorksheetLearningValidationResult;
  memoryEligibility: WorksheetLearningMemoryEligibility;
};

export type WorksheetLearningDiffSummary = {
  changedCellCount: number;
  formulaCellCount: number;
  truncated: boolean;
  sampledChanges: WorksheetLearningEventSample[];
};

type WorksheetCellChangeRecord = {
  cellKey: string;
  previousCell: WorksheetCell | undefined;
  nextCell: WorksheetCell | undefined;
  eventType: WorksheetIntelligenceEventType;
  eventFamily: WorksheetIntelligenceEventFamily;
  action: WorksheetIntelligenceAction;
  aiInteractionId: string | null;
  corrected: boolean;
  correctionContext: WorksheetCorrectionContext | null;
  context: ReturnType<typeof inferWorksheetCellContext>;
};

type WorksheetNearbyRowSummary = {
  row: number;
  rowLabel: string | null;
  unit: string | null;
  visibleCells: Array<{
    column: string;
    header: string | null;
    value: string | number | boolean | null;
    formula: string | null;
  }>;
};

type WorksheetColumnRole =
  | "description"
  | "quantity"
  | "rate"
  | "amount"
  | "unit"
  | "labour"
  | "material"
  | "allowance"
  | "markup"
  | "margin"
  | "formula"
  | "notes"
  | "unknown";

type WorksheetRowSnapshotCell = {
  cell: string;
  column: string;
  columnIndex: number;
  header: string | null;
  columnRole: WorksheetColumnRole | null;
  value: string | number | boolean | null;
  formula: string | null;
  displayValue: string | null;
  unit: string | null;
};

type WorksheetRowSnapshot = {
  row: number;
  rowIndex: number;
  rowLabel: string | null;
  itemLabel: string | null;
  unit: string | null;
  nonEmptyCellCount: number;
  visibleCells: WorksheetRowSnapshotCell[];
};

type WorksheetSectionContext = {
  sectionLabel: string | null;
  subsectionLabel: string | null;
  sectionPath: string[];
  sectionInferenceMode: string;
};

type WorksheetHeaderContext = {
  headerRowIndex: number | null;
  columnHeaders: Record<string, string | null>;
  detectionMode: "stable_header_row" | "top_band_scan" | "none";
};

type WorksheetFormulaReferenceSnapshot = {
  ref: string;
  kind: "cell" | "range";
  startCell: string;
  endCell: string | null;
  rowLabel: string | null;
  itemLabel: string | null;
  columnHeader: string | null;
  value: string | number | boolean | null;
  formula: string | null;
  referencedCells: Array<{
    cell: string;
    row: number;
    rowIndex: number;
    rowLabel: string | null;
    itemLabel: string | null;
    column: string;
    columnIndex: number;
    columnHeader: string | null;
    value: string | number | boolean | null;
    formula: string | null;
  }>;
};

type WorksheetPricingTupleEntry = {
  cell: string;
  header: string | null;
  value: string | number | boolean | null;
  formula: string | null;
  columnRole: WorksheetColumnRole | null;
};

type WorksheetPricingTupleEvidence = {
  quantity: WorksheetPricingTupleEntry | null;
  rate: WorksheetPricingTupleEntry | null;
  amount: WorksheetPricingTupleEntry | null;
  unit: WorksheetPricingTupleEntry | null;
  labour: WorksheetPricingTupleEntry | null;
  material: WorksheetPricingTupleEntry | null;
};

type WorksheetEventCaptureQuality = {
  captureCompletenessScore: number;
  captureWarnings: string[];
  labelExtractionMode: string;
  sectionInferenceMode: string;
  rowSnapshotCompleteness: number;
};

export type WorksheetLearningEventBuildInput = {
  organizationId: string;
  userId: string | null;
  projectId?: string | null;
  opportunityId: string;
  workbookId: string;
  workbookName?: string | null;
  sheetId: string;
  sheetName: string;
  worksheetId?: string | null;
  worksheetName?: string;
  tradePackage: string | null;
  worksheet: WorksheetData;
  eventType: WorksheetLearningEventType;
  eventFamily: WorksheetIntelligenceEventFamily;
  action: WorksheetIntelligenceAction;
  source: WorksheetLearningSource;
  sourceRequestId?: string | null;
  aiInteractionId?: string | null;
  cell?: string | null;
  rowIndex?: number | null;
  range?: string | null;
  row?: number | null;
  column?: string | null;
  columnRole?: WorksheetColumnRole | null;
  sectionLabel?: string | null;
  subsectionLabel?: string | null;
  sectionPath?: string[];
  rowLabel?: string | null;
  itemLabel?: string | null;
  unit?: string | null;
  columnHeader?: string | null;
  nearbyHeaders?: string[];
  nearbyRows?: Array<Record<string, Json>>;
  rowSnapshotBefore?: Record<string, Json> | null;
  rowSnapshotAfter?: Record<string, Json> | null;
  rowSnapshotVisibleCells?: Array<Record<string, Json>>;
  pricingTuple?: Record<string, Json | null>;
  relatedRows?: Array<Record<string, Json>>;
  formula?: string | null;
  oldValue?: Json | null;
  newValue?: Json | null;
  oldFormula?: string | null;
  newFormula?: string | null;
  formulaReferences?: string[];
  referencedCellsSnapshot?: Array<Record<string, Json>>;
  validationResult?: WorksheetLearningValidationResult;
  memoryEligibility?: WorksheetLearningMemoryEligibility;
  changedCellCount?: number | null;
  formulaCellCount?: number | null;
  sampleChanges?: WorksheetLearningEventSample[];
  truncated?: boolean;
  evidenceSchemaVersion?: number | null;
  captureCompletenessScore?: number | null;
  captureWarnings?: string[];
  labelExtractionMode?: string | null;
  sectionInferenceMode?: string | null;
  rowSnapshotCompleteness?: number | null;
  occurredAt?: string;
  beforeData?: Record<string, Json | null>;
  afterData?: Record<string, Json | null>;
  diffData?: Record<string, Json | null>;
  reason?: string | null;
  relatedEntities?: WorksheetEntityRef[];
  lineageRefs?: Array<Record<string, Json>>;
};

export type WorksheetCorrectionEventInput = {
  organizationId: string;
  userId?: string | null;
  projectId?: string | null;
  opportunityId: string;
  workbookId: string;
  sheetId: string;
  sheetName: string;
  aiInteractionId: string;
  correctionType: "manual_override";
  correctionLabel: WorksheetAiCorrectionClassification;
  targetEntityId: string;
  correctedFieldName: string | null;
  incorrectValue: Json | null;
  correctedValue: Json | null;
  correctionReason: string;
  isTrainingEligible?: boolean;
};

export type WorksheetLearningArtifacts = {
  worksheet: WorksheetData;
  intelligenceEvents: Array<ReturnType<typeof buildPricingWorksheetIntelligenceEvent>>;
  correctionEvents: ReturnType<typeof buildWorksheetCorrectionEventInput>[];
};

export type WorksheetMutationEvidenceV2OutboxInput = {
  organizationId: string;
  userId: string | null;
  projectId?: string | null;
  opportunityId: string;
  workbookId: string;
  workbookName?: string | null;
  sheetId: string;
  sheetName: string;
  worksheetId?: string | null;
  worksheetName?: string;
  tradePackage: string | null;
  source: WorksheetLearningSource;
  clientMutationId: string;
  occurredAt?: string;
  previousWorksheet: WorksheetData;
  nextWorksheet: WorksheetData;
};

type WorksheetCorrectionContext = {
  generatedByAi: true;
  generatedAt: string | null;
  correctedAt: string;
  lastCorrectedAt: string;
  correctedByUserId: string | null;
  correctionWindowSeconds: number | null;
  aiJobId: string | null;
  operationType: string | null;
  generationBatchId: string | null;
  originalAiValue: string | number | boolean | null;
  originalAiFormula: string | null;
  promptSummary: string | null;
  sourcePromptHash: string | null;
};

const WORKSHEET_RAW_CONTEXT_EVENT_TYPES = new Set<WorksheetIntelligenceEventType>([
  "worksheet_cell_edited",
  "worksheet_formula_edited",
  "worksheet_rate_changed",
  "worksheet_assumption_changed",
  "worksheet_ai_output_corrected",
  "worksheet_ai_formula_corrected",
  "worksheet_ai_rate_corrected",
  "worksheet_ai_assumption_corrected",
]);

export type PricingWorksheetIntelligenceEventInput = {
  organizationId: string;
  userId?: string | null;
  projectId?: string | null;
  opportunityId: string;
  workbookId: string;
  workbookName?: string | null;
  sheetId: string;
  sheetName: string;
  worksheetId?: string | null;
  worksheetName?: string;
  tradePackage: string | null;
  worksheet: WorksheetData;
  eventType: WorksheetIntelligenceEventType;
  eventFamily: WorksheetIntelligenceEventFamily;
  action: WorksheetIntelligenceAction;
  source?: WorksheetLearningSource;
  sourceRequestId?: string | null;
  occurredAt?: string;
  beforeData?: Record<string, Json | null>;
  afterData?: Record<string, Json | null>;
  diffData?: Record<string, Json | null>;
  reason?: string | null;
  relatedEntities?: WorksheetEntityRef[];
  lineageRefs?: Array<Record<string, Json>>;
};

export function countWorksheetFormulas(worksheet: WorksheetData) {
  let formulaCount = 0;

  Object.values(worksheet.cells).forEach((cell) => {
    if (cell?.formula && cell.formula.trim().length > 0) {
      formulaCount += 1;
    }
  });

  return formulaCount;
}

export function countWorksheetPopulatedCells(worksheet: WorksheetData) {
  let populatedCellCount = 0;

  Object.values(worksheet.cells).forEach((cell) => {
    if (!cell) {
      return;
    }

    if (cell.formula && cell.formula.trim().length > 0) {
      populatedCellCount += 1;
      return;
    }

    if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
      populatedCellCount += 1;
      return;
    }

    if (typeof cell.value === "string" && cell.value.trim().length > 0) {
      populatedCellCount += 1;
    }
  });

  return populatedCellCount;
}

export function summarizeWorksheetStructure(worksheet: WorksheetData): WorksheetStructureSummary {
  return {
    rowCount: worksheet.rows.length || worksheet.rowCount,
    columnCount: worksheet.columns.length || worksheet.columnCount,
    formulaCount: countWorksheetFormulas(worksheet),
    populatedCellCount: countWorksheetPopulatedCells(worksheet),
  };
}

export function summarizeWorksheetStructureFromJson(worksheetData: Json | null | undefined) {
  return summarizeWorksheetStructure(normalizeWorksheetData(worksheetData));
}

export function buildWorksheetIntelligenceMetadata(params: {
  workbookId: string;
  workbookName?: string | null;
  sheetId: string;
  sheetName: string;
  worksheetId?: string | null;
  worksheetName?: string;
  tradePackage: string | null;
  worksheet: WorksheetData;
  userId?: string | null;
  projectId?: string | null;
  source?: WorksheetLearningSource;
}) {
  return {
    workbookId: params.workbookId,
    workbookName: params.workbookName ?? params.worksheetName ?? params.sheetName,
    worksheetId: params.worksheetId ?? params.workbookId,
    sheetId: params.sheetId,
    sheetName: params.sheetName,
    worksheetName: params.worksheetName ?? params.sheetName,
    tradePackage: params.tradePackage,
    userId: params.userId ?? null,
    projectId: params.projectId ?? null,
    source: params.source ?? "system",
    structureSummary: summarizeWorksheetStructure(params.worksheet),
  } satisfies Record<string, Json>;
}

export function buildPricingWorksheetIntelligenceEvent(
  params: PricingWorksheetIntelligenceEventInput
) {
  const metadata = buildWorksheetIntelligenceMetadata({
    workbookId: params.workbookId,
    workbookName: params.workbookName ?? params.worksheetName ?? params.sheetName,
    sheetId: params.sheetId,
    sheetName: params.sheetName,
    worksheetId: params.worksheetId ?? params.workbookId,
    worksheetName: params.worksheetName ?? params.sheetName,
    tradePackage: params.tradePackage,
    worksheet: params.worksheet,
    userId: params.userId ?? null,
    projectId: params.projectId ?? null,
    source: params.source ?? "system",
  });

  return {
    organizationId: params.organizationId,
    projectId: params.projectId ?? null,
    opportunityId: params.opportunityId,
    module: "pricing_worksheets",
    eventFamily: params.eventFamily,
    eventType: params.eventType,
    action: params.action,
    entityType: "pricing_worksheet_page",
    entityId: params.sheetId,
    parentEntityType: "pricing_workbook",
    parentEntityId: params.workbookId,
    sourceChannel:
      (params.source ?? "system") === "ai"
        ? "ai"
        : (params.source ?? "system") === "manual"
          ? "web"
          : "system",
    sourceRequestId: params.sourceRequestId ?? null,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
    diffData: params.diffData ?? {},
    reason: params.reason ?? null,
    relatedEntities:
      params.relatedEntities?.map((entity) => ({
        entityType: entity.entityType,
        entityId: entity.entityId,
      })) ?? [],
    lineageRefs: params.lineageRefs ?? [],
    metadata,
    privacyClassification: "financial_sensitive",
    visibilityScope: "organization",
    containsFinancialData: true,
    containsPersonalData: false,
    containsAttachmentContent: false,
    occurredAt: params.occurredAt,
  };
}

const IDEMPOTENT_WORKSHEET_EDIT_EVENT_TYPES = new Set<WorksheetMutationEvidenceV2EventType>([
  "worksheet_cell_edited",
  "worksheet_formula_edited",
  "worksheet_rate_changed",
  "worksheet_assumption_changed",
  "worksheet_ai_output_corrected",
  "worksheet_ai_formula_corrected",
  "worksheet_ai_rate_corrected",
  "worksheet_ai_assumption_corrected",
]);

export function buildWorksheetClientMutationId() {
  return crypto.randomUUID();
}

export function buildWorksheetEditEventSourceRequestId(params: {
  clientMutationId: string;
  eventType: WorksheetMutationEvidenceV2EventType;
}) {
  return `pw-edit:${params.clientMutationId}:${params.eventType}`;
}

const RATE_TOKENS = [
  "rate",
  "labour rate",
  "labor rate",
  "material rate",
  "unit rate",
  "sell rate",
  "cost",
  "install rate",
] as const;

const ASSUMPTION_TOKENS = [
  "assumption",
  "waste",
  "margin",
  "markup",
  "productivity",
  "spacing",
  "centres",
  "centers",
  "height",
  "length",
  "area",
  "inclusion",
  "exclusion",
  "note",
] as const;

function normalizeTextToken(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeWorksheetCellValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return null;
  }

  if (
    typeof cell.value === "string" ||
    typeof cell.value === "number" ||
    typeof cell.value === "boolean" ||
    cell.value === null
  ) {
    return cell.value ?? null;
  }

  return null;
}

function normalizeWorksheetCellDisplayValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return null;
  }

  return typeof cell.displayValue === "string" && cell.displayValue.trim().length > 0
    ? cell.displayValue
    : typeof cell.value === "string" || typeof cell.value === "number" || typeof cell.value === "boolean"
      ? String(cell.value)
      : cell.formula?.trim() || null;
}

function isWorksheetNumericLikeValue(value: string | number | boolean | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().replace(/,/g, "");
  if (normalized.length === 0) {
    return false;
  }

  return /^-?\d+(\.\d+)?$/.test(normalized);
}

function normalizeWorksheetUnitValue(value: string | number | boolean | null | undefined) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function extractUnitFromCells(cells: Array<WorksheetCell | undefined>) {
  return (
    cells
      .map((cell) => (typeof cell?.value === "string" ? cell.value.trim() : ""))
      .find((value) => /^(m2|m3|m|mm|cm|km|m²|m³|lm|ea|each|hr|hrs|hour|hours|sheet|sheets|pcs|pc|%|\$|sqm|sq m)$/i.test(value)) ?? null
  );
}

function inferWorksheetColumnRole(header: string | null | undefined, formula: string | null | undefined) {
  const normalizedHeader = normalizeTextToken(header);

  if (!normalizedHeader) {
    return formula?.trim() ? "formula" : "unknown";
  }

  if (/(^|[^a-z])(description|item|scope|name|line item|detail)([^a-z]|$)/.test(normalizedHeader)) {
    return "description";
  }
  if (/(^|[^a-z])(qty|quantity|quant|volume|area|length|count)([^a-z]|$)/.test(normalizedHeader)) {
    return "quantity";
  }
  if (/(^|[^a-z])(labour|labor|hours|hour|hrs)([^a-z]|$)/.test(normalizedHeader)) {
    return "labour";
  }
  if (/(^|[^a-z])(material|supply|product)([^a-z]|$)/.test(normalizedHeader)) {
    return "material";
  }
  if (/(^|[^a-z])(rate|unit rate|unit cost|sell rate|cost rate|price)([^a-z]|$)/.test(normalizedHeader)) {
    return "rate";
  }
  if (/(^|[^a-z])(amount|total|value|sum|subtotal|sell)([^a-z]|$)/.test(normalizedHeader)) {
    return "amount";
  }
  if (/(^|[^a-z])(unit|uom)([^a-z]|$)/.test(normalizedHeader)) {
    return "unit";
  }
  if (/(^|[^a-z])(allowance|contingency)([^a-z]|$)/.test(normalizedHeader)) {
    return "allowance";
  }
  if (/(^|[^a-z])(markup)([^a-z]|$)/.test(normalizedHeader)) {
    return "markup";
  }
  if (/(^|[^a-z])(margin|profit)([^a-z]|$)/.test(normalizedHeader)) {
    return "margin";
  }
  if (/(^|[^a-z])(formula|calc|calculation)([^a-z]|$)/.test(normalizedHeader)) {
    return "formula";
  }
  if (/(^|[^a-z])(note|notes|comment|comments)([^a-z]|$)/.test(normalizedHeader)) {
    return "notes";
  }

  return formula?.trim() ? "formula" : "unknown";
}

function getWorksheetRowCells(worksheet: WorksheetData, rowId: string) {
  return worksheet.columns.map((column) => ({
    column,
    cellKey: `${column.id}${rowId}`,
    cell: worksheet.cells[`${column.id}${rowId}`],
  }));
}

function buildWorksheetHeaderContext(worksheet: WorksheetData): WorksheetHeaderContext {
  const candidateLimit = Math.min(worksheet.rows.length, 10);
  let bestCandidate: {
    rowIndex: number;
    score: number;
    headers: Record<string, string | null>;
  } | null = null;

  for (let rowIndex = 0; rowIndex < candidateLimit; rowIndex += 1) {
    const row = worksheet.rows[rowIndex];
    if (!row) {
      continue;
    }

    const rowCells = getWorksheetRowCells(worksheet, row.id);
    const headers: Record<string, string | null> = {};
    let textCount = 0;
    let numericCount = 0;
    let formulaCount = 0;
    let recognizedRoleCount = 0;

    for (const { column, cell } of rowCells) {
      const rawValue = normalizeWorksheetCellValue(cell);
      const textValue = typeof rawValue === "string" ? rawValue.trim() : "";
      const hasFormula = Boolean(cell?.formula?.trim());
      if (hasFormula) {
        formulaCount += 1;
      }

      if (typeof rawValue === "number") {
        numericCount += 1;
      }

      if (textValue.length > 0) {
        textCount += 1;
        headers[column.id] = textValue;
        if (inferWorksheetColumnRole(textValue, null) !== "unknown") {
          recognizedRoleCount += 1;
        }
      } else {
        headers[column.id] = null;
      }
    }

    if (textCount < 2 || formulaCount > 0 || numericCount > 0 || recognizedRoleCount === 0) {
      continue;
    }

    const score = recognizedRoleCount * 10 + textCount;
    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = {
        rowIndex,
        score,
        headers,
      };
    }
  }

  if (bestCandidate) {
    return {
      headerRowIndex: bestCandidate.rowIndex,
      columnHeaders: bestCandidate.headers,
      detectionMode: "stable_header_row",
    };
  }

  const topBandHeaders: Record<string, string | null> = {};
  const firstRow = worksheet.rows[0];
  let hasHeader = false;
  for (const column of worksheet.columns) {
    const cell = firstRow ? worksheet.cells[`${column.id}${firstRow.id}`] : undefined;
    const header = typeof cell?.value === "string" && cell.value.trim().length > 0 ? cell.value.trim() : null;
    if (header) {
      hasHeader = true;
    }
    topBandHeaders[column.id] = header;
  }

  return {
    headerRowIndex: null,
    columnHeaders: topBandHeaders,
    detectionMode: hasHeader ? "top_band_scan" : "none",
  };
}

function buildWorksheetRowTextValues(worksheet: WorksheetData, rowId: string) {
  return getWorksheetRowCells(worksheet, rowId)
    .map(({ cell }) => (typeof cell?.value === "string" ? cell.value.trim() : ""))
    .filter((value) => value.length > 0);
}

function isWorksheetStructuralLabelRow(worksheet: WorksheetData, rowId: string) {
  const rowCells = getWorksheetRowCells(worksheet, rowId).slice(0, Math.min(worksheet.columns.length, 6));
  const textValues = rowCells
    .map(({ cell }) => (typeof cell?.value === "string" ? cell.value.trim() : ""))
    .filter((value) => value.length > 0);
  const hasFormula = rowCells.some(({ cell }) => Boolean(cell?.formula?.trim()));
  return !hasFormula && textValues.length > 0 && textValues.length <= 2 && !textValues.some((value) => /\d/.test(value));
}

function buildWorksheetSectionContext(worksheet: WorksheetData, rowIndex: number): WorksheetSectionContext {
  const labels: string[] = [];

  for (let cursor = rowIndex - 1; cursor >= 0; cursor -= 1) {
    const candidateRowId = worksheet.rows[cursor]?.id;
    if (!candidateRowId || !isWorksheetStructuralLabelRow(worksheet, candidateRowId)) {
      continue;
    }

    const label = buildWorksheetRowTextValues(worksheet, candidateRowId).join(" ").trim();
    if (label.length === 0) {
      continue;
    }

    labels.unshift(label);
    if (labels.length >= 4) {
      break;
    }
  }

  return {
    sectionLabel: labels[0] ?? null,
    subsectionLabel: labels.length >= 2 ? labels[labels.length - 1] : null,
    sectionPath: labels,
    sectionInferenceMode: "heuristic_upward_scan",
  };
}

function resolveWorksheetColumnHeader(params: {
  worksheet: WorksheetData;
  columnId: string;
  rowIndex: number;
  headerContext?: WorksheetHeaderContext;
}) {
  const headerContext = params.headerContext ?? buildWorksheetHeaderContext(params.worksheet);
  const stableHeader = headerContext.columnHeaders[params.columnId] ?? null;
  if (stableHeader) {
    return stableHeader;
  }

  return null;
}

function buildWorksheetRowSnapshot(
  worksheet: WorksheetData,
  rowIndex: number,
  headerContext: WorksheetHeaderContext = buildWorksheetHeaderContext(worksheet),
) {
  const row = worksheet.rows[rowIndex];
  if (!row) {
    return null;
  }

  const rowCells = getWorksheetRowCells(worksheet, row.id);
  const textValues = rowCells
    .map(({ cell }) => (typeof cell?.value === "string" ? cell.value.trim() : ""))
    .filter((value) => value.length > 0);

  const visibleCells: WorksheetRowSnapshotCell[] = rowCells
    .map(({ column, cell, cellKey }) => {
      const value = normalizeWorksheetCellValue(cell);
      const formula = cell?.formula?.trim() || null;
      if (value === null && !formula) {
        return null;
      }

      const header = resolveWorksheetColumnHeader({
        worksheet,
        columnId: column.id,
        rowIndex,
        headerContext,
      });
      const columnRole = inferWorksheetColumnRole(header, formula);

      return {
        cell: cellKey,
        column: column.id,
        columnIndex: column.index,
        header,
        columnRole,
        value,
        formula,
        displayValue: normalizeWorksheetCellDisplayValue(cell),
        unit: columnRole === "unit" ? normalizeWorksheetUnitValue(normalizeWorksheetCellValue(cell)) : null,
      } satisfies WorksheetRowSnapshotCell;
    })
    .filter((cell): cell is WorksheetRowSnapshotCell => cell !== null);

  const explicitUnitCell = visibleCells.find((cell) => cell.columnRole === "unit");

  return {
    row: Number(row.id),
    rowIndex,
    rowLabel: textValues[0] ?? null,
    itemLabel: textValues[1] ?? textValues[0] ?? null,
    unit: explicitUnitCell?.displayValue ?? explicitUnitCell?.unit ?? extractUnitFromCells(rowCells.map(({ cell }) => cell)),
    nonEmptyCellCount: visibleCells.length,
    visibleCells,
  } satisfies WorksheetRowSnapshot;
}

function buildWorksheetPricingTupleEvidence(rowSnapshot: WorksheetRowSnapshot | null): WorksheetPricingTupleEvidence {
  const cells = rowSnapshot?.visibleCells ?? [];
  const findEntry = (
    role: WorksheetColumnRole,
    options?: {
      preferNumeric?: boolean;
    },
  ) => {
    const matches = cells.filter((cell) => cell.columnRole === role);
    const match =
      options?.preferNumeric
        ? matches.find((cell) => isWorksheetNumericLikeValue(cell.value) || Boolean(cell.formula?.trim())) ?? matches[0]
        : matches[0];
    if (!match) {
      return null;
    }

    return {
      cell: match.cell,
      header: match.header,
      value: match.value,
      formula: match.formula,
      columnRole: match.columnRole,
    } satisfies WorksheetPricingTupleEntry;
  };
  const rateEntry =
    findEntry("rate", { preferNumeric: true }) ??
    findEntry("labour", { preferNumeric: true }) ??
    findEntry("material", { preferNumeric: true });

  return {
    quantity: findEntry("quantity", { preferNumeric: true }),
    rate: rateEntry,
    amount: findEntry("amount", { preferNumeric: true }),
    unit: findEntry("unit"),
    labour: findEntry("labour", { preferNumeric: true }),
    material: findEntry("material", { preferNumeric: true }),
  };
}

function getWorksheetRowLabelFromIndex(worksheet: WorksheetData, rowIndex: number) {
  const row = worksheet.rows[rowIndex];
  if (!row) {
    return null;
  }

  return buildWorksheetRowTextValues(worksheet, row.id)[0] ?? null;
}

function buildWorksheetReferencedCellsSnapshot(params: {
  worksheet: WorksheetData;
  rowIndex: number;
  formula: string | null | undefined;
  headerContext?: WorksheetHeaderContext;
}) {
  const formula = params.formula?.trim() || null;
  if (!formula) {
    return [] as WorksheetFormulaReferenceSnapshot[];
  }

  const headerContext = params.headerContext ?? buildWorksheetHeaderContext(params.worksheet);

  return extractPricingWorksheetFormulaReferences(formula).map((reference) => {
    const referencedCells: WorksheetFormulaReferenceSnapshot["referencedCells"] = [];
    const rowIndices =
      reference.kind === "cell"
        ? [reference.rowIndex]
        : Array.from(
            { length: reference.endRowIndex - reference.startRowIndex + 1 },
            (_, index) => reference.startRowIndex + index,
          );
    const columnIndices =
      reference.kind === "cell"
        ? [reference.columnIndex]
        : Array.from(
            { length: reference.endColumnIndex - reference.startColumnIndex + 1 },
            (_, index) => reference.startColumnIndex + index,
          );

    for (const rowIndex of rowIndices) {
      for (const columnIndex of columnIndices) {
        const row = params.worksheet.rows[rowIndex];
        const column = params.worksheet.columns[columnIndex];
        if (!row || !column) {
          continue;
        }

        const cellKey = `${column.id}${row.id}`;
        const cell = params.worksheet.cells[cellKey];
        const value = normalizeWorksheetCellValue(cell);
        const cellFormula = cell?.formula?.trim() || null;
        if (value === null && !cellFormula) {
          continue;
        }

        referencedCells.push({
          cell: cellKey,
          row: Number(row.id),
          rowIndex,
          rowLabel: getWorksheetRowLabelFromIndex(params.worksheet, rowIndex),
          itemLabel:
            buildWorksheetRowSnapshot(params.worksheet, rowIndex, headerContext)?.itemLabel ?? null,
          column: column.id,
          columnIndex,
          columnHeader: resolveWorksheetColumnHeader({
            worksheet: params.worksheet,
            columnId: column.id,
            rowIndex: Math.max(params.rowIndex, rowIndex),
            headerContext,
          }),
          value,
          formula: cellFormula,
        });
      }
    }

    const primary = referencedCells[0] ?? null;
    return {
      ref: reference.normalizedRef,
      kind: reference.kind,
      startCell: reference.kind === "cell" ? reference.normalizedRef : reference.startRef,
      endCell: reference.kind === "cell" ? null : reference.endRef,
      rowLabel: primary?.rowLabel ?? null,
      itemLabel: primary?.itemLabel ?? null,
      columnHeader: primary?.columnHeader ?? null,
      value: primary?.value ?? null,
      formula: primary?.formula ?? null,
      referencedCells,
    } satisfies WorksheetFormulaReferenceSnapshot;
  });
}

function calculateWorksheetCaptureQuality(params: {
  rowSnapshotAfter: WorksheetRowSnapshot | null;
  columnHeader: string | null;
  sectionContext: WorksheetSectionContext;
  referencedCellsSnapshot: WorksheetFormulaReferenceSnapshot[];
}) {
  const warnings: string[] = [];
  let score = 0.35;

  const rowSnapshotCompleteness = Math.max(
    0,
    Math.min(
      1,
      params.rowSnapshotAfter
        ? Math.min(params.rowSnapshotAfter.nonEmptyCellCount / 6, 1)
        : 0,
    ),
  );
  score += rowSnapshotCompleteness * 0.3;

  if (params.columnHeader) {
    score += 0.1;
  } else {
    warnings.push("missing_column_header");
  }

  if (params.sectionContext.sectionLabel) {
    score += 0.1;
  } else {
    warnings.push("missing_section_label");
  }

  if (params.rowSnapshotAfter?.itemLabel) {
    score += 0.1;
  } else {
    warnings.push("missing_item_label");
  }

  if (params.referencedCellsSnapshot.length > 0) {
    score += 0.05;
  }

  return {
    captureCompletenessScore: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000,
    captureWarnings: warnings,
    rowSnapshotCompleteness: Math.round(rowSnapshotCompleteness * 1000) / 1000,
  };
}

function serializeWorksheetRowSnapshot(snapshot: WorksheetRowSnapshot | null) {
  if (!snapshot) {
    return null;
  }

  return {
    row: snapshot.row,
    rowIndex: snapshot.rowIndex,
    rowLabel: snapshot.rowLabel,
    itemLabel: snapshot.itemLabel,
    unit: snapshot.unit,
    nonEmptyCellCount: snapshot.nonEmptyCellCount,
    visibleCells: snapshot.visibleCells,
  } satisfies Record<string, Json>;
}

function serializeWorksheetPricingTupleEvidence(evidence: WorksheetPricingTupleEvidence) {
  return {
    quantity: evidence.quantity,
    rate: evidence.rate,
    amount: evidence.amount,
    unit: evidence.unit,
    labour: evidence.labour,
    material: evidence.material,
  } satisfies Record<string, Json | null>;
}

function deriveRowSnapshotFromNearbyRows(params: {
  row: number | null;
  rowIndex: number | null;
  rowLabel: string | null;
  itemLabel: string | null;
  unit: string | null;
  nearbyRows: Array<Record<string, Json>>;
}) {
  if (params.row === null) {
    return null;
  }

  const matchingRow = params.nearbyRows.find((entry) => {
    return typeof entry.row === "number" && entry.row === params.row;
  });
  if (!matchingRow || !Array.isArray(matchingRow.visibleCells)) {
    return null;
  }

  const visibleCells = matchingRow.visibleCells
    .filter((entry): entry is Record<string, Json> => isJsonRecord(entry))
    .map((entry, index) => {
      const header = typeof entry.header === "string" ? entry.header : null;
      const formula = typeof entry.formula === "string" ? entry.formula : null;
      return {
        cell: `${typeof entry.column === "string" ? entry.column : ""}${params.row}`,
        column: typeof entry.column === "string" ? entry.column : "",
        columnIndex: index,
        header,
        columnRole: inferWorksheetColumnRole(header, formula),
        value:
          typeof entry.value === "string" || typeof entry.value === "number" || typeof entry.value === "boolean" || entry.value === null
            ? entry.value
            : null,
        formula,
        displayValue:
          typeof entry.value === "string" || typeof entry.value === "number" || typeof entry.value === "boolean"
            ? String(entry.value)
            : formula,
        unit: typeof entry.unit === "string" ? entry.unit : null,
      } satisfies WorksheetRowSnapshotCell;
    });

  return {
    row: params.row,
    rowIndex: params.rowIndex ?? Math.max(0, params.row - 1),
    rowLabel: params.rowLabel,
    itemLabel: params.itemLabel,
    unit: params.unit,
    nonEmptyCellCount: visibleCells.length,
    visibleCells,
  } satisfies WorksheetRowSnapshot;
}

function buildWorksheetNearbyHeaders(params: {
  worksheet: WorksheetData;
  columnIndex: number;
  rowIndex: number;
  headerLabel: string | null;
  headerContext?: WorksheetHeaderContext;
  windowRadius?: number;
}) {
  const radius = Math.max(params.windowRadius ?? 2, 0);
  const startColumnIndex = Math.max(0, params.columnIndex - radius);
  const endColumnIndex = Math.min(params.worksheet.columns.length - 1, params.columnIndex + radius);
  const headers: string[] = [];
  const headerContext = params.headerContext ?? buildWorksheetHeaderContext(params.worksheet);

  for (let columnIndex = startColumnIndex; columnIndex <= endColumnIndex; columnIndex += 1) {
    const column = params.worksheet.columns[columnIndex];
    if (!column) {
      continue;
    }

    let header = resolveWorksheetColumnHeader({
      worksheet: params.worksheet,
      columnId: column.id,
      rowIndex: params.rowIndex,
      headerContext,
    }) ?? "";

    if (!header && columnIndex === params.columnIndex && params.headerLabel) {
      header = params.headerLabel;
    }

    if (header.length > 0) {
      headers.push(header);
    }
  }

  return headers.filter((value, index, array) => array.indexOf(value) === index);
}

function buildWorksheetNearbyRows(params: {
  worksheet: WorksheetData;
  rowIndex: number;
  columnIndex: number;
  headerContext?: WorksheetHeaderContext;
  windowRadius?: number;
}) {
  const radius = Math.max(params.windowRadius ?? 2, 0);
  const startRowIndex = Math.max(0, params.rowIndex - radius);
  const endRowIndex = Math.min(params.worksheet.rows.length - 1, params.rowIndex + radius);
  const startColumnIndex = Math.max(0, params.columnIndex - radius);
  const endColumnIndex = Math.min(params.worksheet.columns.length - 1, params.columnIndex + radius);
  const nearbyRows: WorksheetNearbyRowSummary[] = [];
  const headerContext = params.headerContext ?? buildWorksheetHeaderContext(params.worksheet);

  for (let rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex += 1) {
    const row = params.worksheet.rows[rowIndex];
    if (!row) {
      continue;
    }

    const candidateCells = params.worksheet.columns
      .slice(0, Math.min(params.worksheet.columns.length, 8))
      .map((column) => params.worksheet.cells[`${column.id}${row.id}`]);
    const rowTextValues = candidateCells
      .map((cell) => (typeof cell?.value === "string" ? cell.value.trim() : ""))
      .filter((value) => value.length > 0);
    const rowLabel = rowTextValues[0] ?? null;
    const unit = extractUnitFromCells(candidateCells);
    const visibleCells: WorksheetNearbyRowSummary["visibleCells"] = [];

    for (let columnIndex = startColumnIndex; columnIndex <= endColumnIndex; columnIndex += 1) {
      const column = params.worksheet.columns[columnIndex];
      if (!column) {
        continue;
      }
      const cellKey = `${column.id}${row.id}`;
      const cell = params.worksheet.cells[cellKey];
      const value = normalizeWorksheetCellValue(cell);
      const formula = cell?.formula?.trim() || null;
      if (value === null && !formula) {
        continue;
      }

      const header = resolveWorksheetColumnHeader({
        worksheet: params.worksheet,
        columnId: column.id,
        rowIndex,
        headerContext,
      });

      visibleCells.push({
        column: column.id,
        header,
        value,
        formula,
      });
    }

    if (rowLabel || unit || visibleCells.length > 0) {
      nearbyRows.push({
        row: Number(row.id),
        rowLabel,
        unit,
        visibleCells,
      });
    }
  }

  return nearbyRows;
}

function inferWorksheetCellContext(worksheet: WorksheetData, cellKey: string) {
  const parsed = parseWorksheetCellKey(cellKey);
  if (!parsed) {
    return {
      row: null,
      rowIndex: null,
      column: null,
      cellAddress: cellKey,
      sectionLabel: null,
      subsectionLabel: null,
      sectionPath: [] as string[],
      sectionInferenceMode: "heuristic_upward_scan",
      rowLabel: null,
      itemLabel: null,
      unit: null,
      headerLabel: null,
      columnRole: null,
      rowSnapshot: null as WorksheetRowSnapshot | null,
      relatedRows: [] as WorksheetRowSnapshot[],
      pricingTuple: {
        quantity: null,
        rate: null,
        amount: null,
        unit: null,
        labour: null,
        material: null,
      } satisfies WorksheetPricingTupleEvidence,
      nearbyHeaders: [] as string[],
      nearbyRows: [] as WorksheetNearbyRowSummary[],
    };
  }

  const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);
  const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
  const row = rowIndex >= 0 ? worksheet.rows[rowIndex] : null;
  const column = columnIndex >= 0 ? worksheet.columns[columnIndex] : null;
  const headerContext = buildWorksheetHeaderContext(worksheet);

  const rowValues = rowIndex >= 0
    ? worksheet.columns
        .slice(0, Math.min(worksheet.columns.length, 8))
        .map((entry) => worksheet.cells[`${entry.id}${parsed.rowId}`])
    : [];

  const rowTextValues = rowValues
    .map((cell) => (typeof cell?.value === "string" ? cell.value.trim() : ""))
    .filter((value) => value.length > 0);

  const rowLabel = rowTextValues[0] ?? null;
  const itemLabel = rowTextValues[1] ?? rowLabel;
  const unit = extractUnitFromCells(rowValues);
  const sectionContext = rowIndex >= 0 ? buildWorksheetSectionContext(worksheet, rowIndex) : {
    sectionLabel: null,
    subsectionLabel: null,
    sectionPath: [],
    sectionInferenceMode: "heuristic_upward_scan",
  };

  const headerLabel =
    column && columnIndex >= 0
      ? resolveWorksheetColumnHeader({
          worksheet,
          columnId: column.id,
          rowIndex,
          headerContext,
        })
      : null;
  const columnRole = inferWorksheetColumnRole(headerLabel, worksheet.cells[cellKey]?.formula ?? null);
  const rowSnapshot = rowIndex >= 0 ? buildWorksheetRowSnapshot(worksheet, rowIndex, headerContext) : null;
  const currentSectionKey = sectionContext.sectionPath.join(">");
  const relatedRows =
    rowIndex >= 0
      ? Array.from({ length: 5 }, (_, offset) => offset - 2)
          .map((offset) => rowIndex + offset)
          .filter((candidateIndex) => candidateIndex >= 0 && candidateIndex < worksheet.rows.length && candidateIndex !== rowIndex)
          .filter((candidateIndex) => {
            if (!currentSectionKey) {
              return true;
            }
            return buildWorksheetSectionContext(worksheet, candidateIndex).sectionPath.join(">") === currentSectionKey;
          })
          .map((candidateIndex) => buildWorksheetRowSnapshot(worksheet, candidateIndex, headerContext))
          .filter((snapshot): snapshot is WorksheetRowSnapshot => snapshot !== null)
      : [];
  const pricingTuple = buildWorksheetPricingTupleEvidence(rowSnapshot);

  return {
    row: row ? Number(row.id) : null,
    rowIndex: rowIndex >= 0 ? rowIndex : null,
    column: column?.id ?? null,
    cellAddress: cellKey,
    sectionLabel: sectionContext.sectionLabel,
    subsectionLabel: sectionContext.subsectionLabel,
    sectionPath: sectionContext.sectionPath,
    sectionInferenceMode: sectionContext.sectionInferenceMode,
    rowLabel,
    itemLabel,
    unit,
    headerLabel,
    columnRole,
    rowSnapshot,
    relatedRows,
    pricingTuple,
    nearbyHeaders:
      rowIndex >= 0 && columnIndex >= 0
        ? buildWorksheetNearbyHeaders({
            worksheet,
            columnIndex,
            rowIndex,
            headerLabel,
            headerContext,
          })
        : [],
    nearbyRows:
      rowIndex >= 0 && columnIndex >= 0
        ? buildWorksheetNearbyRows({
            worksheet,
            rowIndex,
            columnIndex,
            headerContext,
          })
        : [],
  };
}

function classifyWorksheetLearningEvent(params: {
  cellKey: string;
  previousCell: WorksheetCell | undefined;
  nextCell: WorksheetCell | undefined;
  worksheet: WorksheetData;
}) {
  const context = inferWorksheetCellContext(params.worksheet, params.cellKey);
  const oldFormula = params.previousCell?.formula?.trim() || null;
  const newFormula = params.nextCell?.formula?.trim() || null;
  if (oldFormula !== newFormula) {
    return {
      eventType: "worksheet_formula_edited" as const,
      correctionType: "worksheet_ai_formula_corrected" as const,
      context,
    };
  }

  const haystack = [
    context.headerLabel,
    context.sectionLabel,
    context.rowLabel,
    context.itemLabel,
    context.unit,
  ]
    .map(normalizeTextToken)
    .join(" ");

  if (RATE_TOKENS.some((token) => haystack.includes(token))) {
    return {
      eventType: "worksheet_rate_changed" as const,
      correctionType: "worksheet_ai_rate_corrected" as const,
      context,
    };
  }

  if (ASSUMPTION_TOKENS.some((token) => haystack.includes(token))) {
    return {
      eventType: "worksheet_assumption_changed" as const,
      correctionType: "worksheet_ai_assumption_corrected" as const,
      context,
    };
  }

  return {
    eventType: "worksheet_cell_edited" as const,
    correctionType: "worksheet_ai_output_corrected" as const,
    context,
  };
}

function extractFormulaReferenceStrings(formula: string | null | undefined) {
  if (!formula) {
    return [];
  }

  return extractPricingWorksheetFormulaReferences(formula)
    .map((reference) => reference.normalizedRef)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function serializeWorksheetCellForLearning(cell: WorksheetCell | undefined, includeMetadata: boolean) {
  if (!cell) {
    return null;
  }

  return JSON.stringify({
    value: cell.value ?? null,
    type: cell.type,
    formula: cell.formula ?? null,
    metadata: includeMetadata ? (cell.metadata ?? {}) : undefined,
  });
}

export function listWorksheetChangedCellKeys(params: {
  previousWorksheet: WorksheetData;
  nextWorksheet: WorksheetData;
  includeMetadata?: boolean;
}) {
  const keys = new Set([
    ...Object.keys(params.previousWorksheet.cells),
    ...Object.keys(params.nextWorksheet.cells),
  ]);

  return Array.from(keys).filter((cellKey) => {
    const previousCell = params.previousWorksheet.cells[cellKey];
    const nextCell = params.nextWorksheet.cells[cellKey];
    return (
      serializeWorksheetCellForLearning(previousCell, params.includeMetadata ?? false) !==
      serializeWorksheetCellForLearning(nextCell, params.includeMetadata ?? false)
    );
  });
}

export function parseWorksheetAiProvenanceMetadata(value: unknown): WorksheetAiProvenance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.generatedByAi !== true) {
    return null;
  }

  return {
    generatedByAi: true,
    aiInteractionId: typeof record.aiInteractionId === "string" ? record.aiInteractionId : null,
    aiJobId: typeof record.aiJobId === "string" ? record.aiJobId : null,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : null,
    operationType: typeof record.operationType === "string" ? record.operationType : null,
    generationBatchId: typeof record.generationBatchId === "string" ? record.generationBatchId : null,
    promptSummary: typeof record.promptSummary === "string" ? record.promptSummary : null,
    sourcePromptHash: typeof record.sourcePromptHash === "string" ? record.sourcePromptHash : null,
    originalAiValue:
      typeof record.originalAiValue === "string" ||
      typeof record.originalAiValue === "number" ||
      typeof record.originalAiValue === "boolean" ||
      record.originalAiValue === null
        ? (record.originalAiValue as string | number | boolean | null)
        : null,
    originalAiFormula: typeof record.originalAiFormula === "string" ? record.originalAiFormula : null,
    lastCorrectedAt: typeof record.lastCorrectedAt === "string" ? record.lastCorrectedAt : null,
    correctedByUserId: typeof record.correctedByUserId === "string" ? record.correctedByUserId : null,
  };
}

export function stampWorksheetAiProvenance(params: {
  worksheet: WorksheetData;
  changedCellKeys: string[];
  aiInteractionId: string;
  aiJobId?: string | null;
  generatedAt: string;
  operationType?: string | null;
  generationBatchId?: string | null;
  promptSummary?: string | null;
  sourcePromptHash?: string | null;
}) {
  if (params.changedCellKeys.length === 0) {
    return params.worksheet;
  }

  const nextCells = { ...params.worksheet.cells };
  for (const cellKey of params.changedCellKeys) {
    const cell = nextCells[cellKey];
    if (!cell) {
      continue;
    }

    nextCells[cellKey] = {
      ...cell,
      metadata: {
        ...(cell.metadata ?? {}),
        generatedByAi: true,
        aiInteractionId: params.aiInteractionId,
        aiJobId: params.aiJobId ?? params.aiInteractionId,
        generatedAt: params.generatedAt,
        operationType: params.operationType ?? null,
        generationBatchId: params.generationBatchId ?? null,
        promptSummary: params.promptSummary ?? null,
        sourcePromptHash: params.sourcePromptHash ?? null,
        originalAiValue:
          typeof cell.value === "string" || typeof cell.value === "number" || cell.value === null
            ? cell.value
            : null,
        originalAiFormula: cell.formula ?? null,
        lastCorrectedAt: null,
        correctedByUserId: null,
      },
    };
  }

  return {
    ...params.worksheet,
    cells: nextCells,
  };
}

export function updateWorksheetCellCorrectionMetadata(params: {
  worksheet: WorksheetData;
  cellKey: string;
  correctedAt: string;
  correctedByUserId: string | null;
}) {
  const cell = params.worksheet.cells[params.cellKey];
  if (!cell) {
    return params.worksheet;
  }

  const provenance = parseWorksheetAiProvenanceMetadata(cell.metadata);
  if (!provenance) {
    return params.worksheet;
  }

  return {
    ...params.worksheet,
    cells: {
      ...params.worksheet.cells,
      [params.cellKey]: {
        ...cell,
        metadata: {
          ...(cell.metadata ?? {}),
          lastCorrectedAt: params.correctedAt,
          correctedByUserId: params.correctedByUserId,
        },
      },
    },
  };
}

export function buildWorksheetLearningDiffSummary(params: {
  previousWorksheet: WorksheetData;
  nextWorksheet: WorksheetData;
  changedCellKeys: string[];
  sampleLimit?: number;
}) {
  const sampleLimit = Math.max(params.sampleLimit ?? 10, 1);
  const samples: WorksheetLearningEventSample[] = [];
  let formulaCellCount = 0;
  const previousHeaderContext = buildWorksheetHeaderContext(params.previousWorksheet);
  const nextHeaderContext = buildWorksheetHeaderContext(params.nextWorksheet);

  for (const cellKey of params.changedCellKeys) {
    const previousCell = params.previousWorksheet.cells[cellKey];
    const nextCell = params.nextWorksheet.cells[cellKey];
    const oldFormula = previousCell?.formula ?? null;
    const newFormula = nextCell?.formula ?? null;
    if (oldFormula !== newFormula || Boolean(newFormula?.trim())) {
      formulaCellCount += 1;
    }

    if (samples.length >= sampleLimit) {
      continue;
    }

    const classified = classifyWorksheetLearningEvent({
      cellKey,
      previousCell,
      nextCell,
      worksheet: params.nextWorksheet,
    });
    const provenance = parseWorksheetAiProvenanceMetadata(nextCell?.metadata ?? previousCell?.metadata ?? null);
    const rowSnapshotBefore =
      classified.context.rowIndex !== null
        ? buildWorksheetRowSnapshot(params.previousWorksheet, classified.context.rowIndex, previousHeaderContext)
        : null;
    const rowSnapshotAfter =
      classified.context.rowIndex !== null
        ? buildWorksheetRowSnapshot(params.nextWorksheet, classified.context.rowIndex, nextHeaderContext)
        : null;
    const referencedCellsSnapshot =
      classified.context.rowIndex !== null
        ? buildWorksheetReferencedCellsSnapshot({
            worksheet: params.nextWorksheet,
            rowIndex: classified.context.rowIndex,
            formula: newFormula ?? oldFormula,
            headerContext: nextHeaderContext,
          })
        : [];
    const captureQuality = calculateWorksheetCaptureQuality({
      rowSnapshotAfter,
      columnHeader: classified.context.headerLabel,
      sectionContext: {
        sectionLabel: classified.context.sectionLabel,
        subsectionLabel: classified.context.subsectionLabel,
        sectionPath: classified.context.sectionPath,
        sectionInferenceMode: classified.context.sectionInferenceMode,
      },
      referencedCellsSnapshot,
    });
    samples.push({
      cell: cellKey,
      cellAddress: classified.context.cellAddress,
      row: classified.context.row,
      rowIndex: classified.context.rowIndex,
      column: classified.context.column,
      columnId: classified.context.column,
      columnHeader: classified.context.headerLabel,
      columnRole: classified.context.columnRole,
      nearbyHeaders: classified.context.nearbyHeaders,
      nearbyRows: classified.context.nearbyRows as Array<Record<string, Json>>,
      sectionLabel: classified.context.sectionLabel,
      subsectionLabel: classified.context.subsectionLabel,
      sectionPath: classified.context.sectionPath,
      rowLabel: classified.context.rowLabel,
      itemLabel: classified.context.itemLabel,
      unit: classified.context.unit,
      formula: newFormula ?? oldFormula,
      oldValue:
        normalizeWorksheetCellValue(previousCell),
      newValue:
        normalizeWorksheetCellValue(nextCell),
      oldFormula,
      newFormula,
      formulaReferences: extractFormulaReferenceStrings(newFormula ?? oldFormula),
      referencedCellsSnapshot: referencedCellsSnapshot as Array<Record<string, Json>>,
      rowSnapshotBefore: serializeWorksheetRowSnapshot(rowSnapshotBefore),
      rowSnapshotAfter: serializeWorksheetRowSnapshot(rowSnapshotAfter),
      rowSnapshotVisibleCells: rowSnapshotAfter?.visibleCells as Array<Record<string, Json>> | undefined,
      pricingTuple: serializeWorksheetPricingTupleEvidence(classified.context.pricingTuple),
      relatedRows: classified.context.relatedRows.map((snapshot) => serializeWorksheetRowSnapshot(snapshot) ?? {}) as Array<Record<string, Json>>,
      evidenceSchemaVersion: 2,
      captureCompletenessScore: captureQuality.captureCompletenessScore,
      captureWarnings: captureQuality.captureWarnings,
      labelExtractionMode: "heuristic_first_text_cells",
      sectionInferenceMode: classified.context.sectionInferenceMode,
      rowSnapshotCompleteness: captureQuality.rowSnapshotCompleteness,
      aiInteractionId: provenance?.aiInteractionId ?? null,
      validationResult: {
        status: newFormula || oldFormula ? "passed" : "not_applicable",
      },
      memoryEligibility: {
        eligible: classified.eventType !== "worksheet_cell_edited",
        reason:
          classified.eventType === "worksheet_cell_edited"
            ? "Generic cell edits are low-value by default."
            : "Structured pricing or formula edits are useful for future learning.",
      },
    });
  }

  return {
    changedCellCount: params.changedCellKeys.length,
    formulaCellCount,
    truncated: params.changedCellKeys.length > sampleLimit,
    sampledChanges: samples,
  } satisfies WorksheetLearningDiffSummary;
}

function buildWorksheetCorrectionContext(params: {
  provenance: WorksheetAiProvenance;
  correctedAt: string;
  correctedByUserId: string | null;
}) {
  const correctionWindowSeconds = (() => {
    if (!params.provenance.generatedAt) {
      return null;
    }

    const generatedAtMs = Date.parse(params.provenance.generatedAt);
    const correctedAtMs = Date.parse(params.correctedAt);
    if (!Number.isFinite(generatedAtMs) || !Number.isFinite(correctedAtMs)) {
      return null;
    }

    return Math.max(0, Math.round((correctedAtMs - generatedAtMs) / 1000));
  })();

  return {
    generatedByAi: true,
    generatedAt: params.provenance.generatedAt,
    correctedAt: params.correctedAt,
    lastCorrectedAt: params.correctedAt,
    correctedByUserId: params.correctedByUserId,
    correctionWindowSeconds,
    aiJobId: params.provenance.aiJobId,
    operationType: params.provenance.operationType,
    generationBatchId: params.provenance.generationBatchId,
    originalAiValue: params.provenance.originalAiValue,
    originalAiFormula: params.provenance.originalAiFormula,
    promptSummary: params.provenance.promptSummary,
    sourcePromptHash: params.provenance.sourcePromptHash,
  } satisfies WorksheetCorrectionContext;
}

function collapseWorksheetCorrectionContext(
  contexts: WorksheetCorrectionContext[]
): Partial<WorksheetCorrectionContext> {
  if (contexts.length === 0) {
    return {};
  }

  const firstContext = contexts[0];
  const resolveCommonValue = <T,>(selector: (context: WorksheetCorrectionContext) => T) => {
    const firstValue = selector(firstContext);
    return contexts.every((context) => selector(context) === firstValue) ? firstValue : null;
  };

  return {
    generatedByAi: true,
    generatedAt: resolveCommonValue((context) => context.generatedAt),
    correctedAt: resolveCommonValue((context) => context.correctedAt) ?? firstContext.correctedAt,
    lastCorrectedAt: resolveCommonValue((context) => context.lastCorrectedAt) ?? firstContext.lastCorrectedAt,
    correctedByUserId: resolveCommonValue((context) => context.correctedByUserId),
    correctionWindowSeconds: resolveCommonValue((context) => context.correctionWindowSeconds),
    aiJobId: resolveCommonValue((context) => context.aiJobId),
    operationType: resolveCommonValue((context) => context.operationType),
    generationBatchId: resolveCommonValue((context) => context.generationBatchId),
    originalAiValue: contexts.length === 1 ? firstContext.originalAiValue : null,
    originalAiFormula: contexts.length === 1 ? firstContext.originalAiFormula : null,
    promptSummary: resolveCommonValue((context) => context.promptSummary),
    sourcePromptHash: resolveCommonValue((context) => context.sourcePromptHash),
  };
}

function buildWorksheetClassificationHints(params: {
  eventType: WorksheetIntelligenceEventType;
  source: WorksheetLearningSource;
  aiInteractionId: string | null;
  columnHeader: string | null;
  nearbyHeaders: string[];
  rowLabel: string | null;
  sectionLabel: string | null;
  itemLabel: string | null;
  unit: string | null;
  tradePackage: string | null;
  formula: string | null;
}) {
  return {
    operationalEventType: params.eventType,
    source: params.source,
    aiInteractionId: params.aiInteractionId,
    tradePackage: params.tradePackage,
    columnHeader: params.columnHeader,
    nearbyHeaders: params.nearbyHeaders,
    rowLabel: params.rowLabel,
    sectionLabel: params.sectionLabel,
    itemLabel: params.itemLabel,
    unit: params.unit,
    hasFormula: Boolean(params.formula?.trim()),
  } satisfies Record<string, Json | null>;
}

function deriveWorksheetLearningSourceFromChannel(sourceChannel: string | null | undefined): WorksheetLearningSource {
  if (sourceChannel === "ai") {
    return "ai";
  }
  if (sourceChannel === "web") {
    return "manual";
  }
  return "system";
}

function normalizeWorksheetLearningSampleChange(
  sample: unknown,
  fallback: {
    cell: string | null;
    cellAddress: string | null;
    row: number | null;
    rowIndex: number | null;
    column: string | null;
    columnId: string | null;
    columnHeader: string | null;
    columnRole: WorksheetColumnRole | null;
    nearbyHeaders: string[];
    nearbyRows: Array<Record<string, Json>>;
    sectionLabel: string | null;
    subsectionLabel: string | null;
    sectionPath: string[];
    rowLabel: string | null;
    itemLabel: string | null;
    unit: string | null;
    formula: string | null;
    oldValue: Json | null;
    newValue: Json | null;
    oldFormula: string | null;
    newFormula: string | null;
    formulaReferences: string[];
    referencedCellsSnapshot: Array<Record<string, Json>>;
    rowSnapshotBefore: Record<string, Json> | null;
    rowSnapshotAfter: Record<string, Json> | null;
    rowSnapshotVisibleCells: Array<Record<string, Json>>;
    pricingTuple: Record<string, Json | null>;
    relatedRows: Array<Record<string, Json>>;
    evidenceSchemaVersion: number;
    captureCompletenessScore: number | null;
    captureWarnings: string[];
    labelExtractionMode: string;
    sectionInferenceMode: string;
    rowSnapshotCompleteness: number | null;
    aiInteractionId: string | null;
  }
) {
  if (!isJsonRecord(sample)) {
    return null;
  }

  return {
    ...sample,
    cell: typeof sample.cell === "string" ? sample.cell : fallback.cell,
    cellAddress: typeof sample.cellAddress === "string" ? sample.cellAddress : fallback.cellAddress,
    row: typeof sample.row === "number" ? sample.row : fallback.row,
    rowIndex: typeof sample.rowIndex === "number" ? sample.rowIndex : fallback.rowIndex,
    column: typeof sample.column === "string" ? sample.column : fallback.column,
    columnId: typeof sample.columnId === "string" ? sample.columnId : fallback.columnId,
    columnHeader: typeof sample.columnHeader === "string" ? sample.columnHeader : fallback.columnHeader,
    columnRole:
      typeof sample.columnRole === "string"
        ? (sample.columnRole as WorksheetColumnRole)
        : fallback.columnRole,
    nearbyHeaders:
      Array.isArray(sample.nearbyHeaders) && sample.nearbyHeaders.every((entry) => typeof entry === "string")
        ? sample.nearbyHeaders
        : fallback.nearbyHeaders,
    nearbyRows:
      Array.isArray(sample.nearbyRows) && sample.nearbyRows.every((entry) => isJsonRecord(entry))
        ? (sample.nearbyRows as Array<Record<string, Json>>)
        : fallback.nearbyRows,
    sectionLabel: typeof sample.sectionLabel === "string" ? sample.sectionLabel : fallback.sectionLabel,
    subsectionLabel:
      typeof sample.subsectionLabel === "string" ? sample.subsectionLabel : fallback.subsectionLabel,
    sectionPath:
      Array.isArray(sample.sectionPath) && sample.sectionPath.every((entry) => typeof entry === "string")
        ? sample.sectionPath
        : fallback.sectionPath,
    rowLabel: typeof sample.rowLabel === "string" ? sample.rowLabel : fallback.rowLabel,
    itemLabel: typeof sample.itemLabel === "string" ? sample.itemLabel : fallback.itemLabel,
    unit: typeof sample.unit === "string" ? sample.unit : fallback.unit,
    formula: typeof sample.formula === "string" ? sample.formula : fallback.formula,
    oldValue: "oldValue" in sample ? (sample.oldValue as Json | null) : fallback.oldValue,
    newValue: "newValue" in sample ? (sample.newValue as Json | null) : fallback.newValue,
    oldFormula: typeof sample.oldFormula === "string" ? sample.oldFormula : fallback.oldFormula,
    newFormula: typeof sample.newFormula === "string" ? sample.newFormula : fallback.newFormula,
    formulaReferences:
      Array.isArray(sample.formulaReferences) && sample.formulaReferences.every((entry) => typeof entry === "string")
        ? sample.formulaReferences
        : fallback.formulaReferences,
    referencedCellsSnapshot:
      Array.isArray(sample.referencedCellsSnapshot) && sample.referencedCellsSnapshot.every((entry) => isJsonRecord(entry))
        ? (sample.referencedCellsSnapshot as Array<Record<string, Json>>)
        : fallback.referencedCellsSnapshot,
    rowSnapshotBefore:
      isJsonRecord(sample.rowSnapshotBefore) ? (sample.rowSnapshotBefore as Record<string, Json>) : fallback.rowSnapshotBefore,
    rowSnapshotAfter:
      isJsonRecord(sample.rowSnapshotAfter) ? (sample.rowSnapshotAfter as Record<string, Json>) : fallback.rowSnapshotAfter,
    rowSnapshotVisibleCells:
      Array.isArray(sample.rowSnapshotVisibleCells) && sample.rowSnapshotVisibleCells.every((entry) => isJsonRecord(entry))
        ? (sample.rowSnapshotVisibleCells as Array<Record<string, Json>>)
        : fallback.rowSnapshotVisibleCells,
    pricingTuple:
      isJsonRecord(sample.pricingTuple) ? (sample.pricingTuple as Record<string, Json | null>) : fallback.pricingTuple,
    relatedRows:
      Array.isArray(sample.relatedRows) && sample.relatedRows.every((entry) => isJsonRecord(entry))
        ? (sample.relatedRows as Array<Record<string, Json>>)
        : fallback.relatedRows,
    evidenceSchemaVersion:
      typeof sample.evidenceSchemaVersion === "number" ? sample.evidenceSchemaVersion : fallback.evidenceSchemaVersion,
    captureCompletenessScore:
      typeof sample.captureCompletenessScore === "number" ? sample.captureCompletenessScore : fallback.captureCompletenessScore,
    captureWarnings:
      Array.isArray(sample.captureWarnings) && sample.captureWarnings.every((entry) => typeof entry === "string")
        ? sample.captureWarnings
        : fallback.captureWarnings,
    labelExtractionMode:
      typeof sample.labelExtractionMode === "string" ? sample.labelExtractionMode : fallback.labelExtractionMode,
    sectionInferenceMode:
      typeof sample.sectionInferenceMode === "string" ? sample.sectionInferenceMode : fallback.sectionInferenceMode,
    rowSnapshotCompleteness:
      typeof sample.rowSnapshotCompleteness === "number" ? sample.rowSnapshotCompleteness : fallback.rowSnapshotCompleteness,
    aiInteractionId: typeof sample.aiInteractionId === "string" ? sample.aiInteractionId : fallback.aiInteractionId,
  } satisfies Record<string, Json | null>;
}

export function preparePricingWorksheetIntelligenceEventForPersistence(
  event: ReturnType<typeof buildPricingWorksheetIntelligenceEvent>
) {
  if (!WORKSHEET_RAW_CONTEXT_EVENT_TYPES.has(event.eventType)) {
    return event;
  }

  const diffData = isJsonRecord(event.diffData) ? event.diffData : {};
  const metadata = isJsonRecord(event.metadata) ? event.metadata : {};
  const rawSamples = Array.isArray(diffData.sampleChanges) ? diffData.sampleChanges : [];
  const firstSample = rawSamples.find((entry) => isJsonRecord(entry));

  const cell = typeof diffData.cell === "string" ? diffData.cell : typeof firstSample?.cell === "string" ? firstSample.cell : null;
  const cellAddress =
    typeof diffData.cellAddress === "string"
      ? diffData.cellAddress
      : typeof firstSample?.cellAddress === "string"
        ? firstSample.cellAddress
        : cell;
  const row = typeof diffData.row === "number" ? diffData.row : typeof firstSample?.row === "number" ? firstSample.row : null;
  const rowIndex =
    typeof diffData.rowIndex === "number"
      ? diffData.rowIndex
      : typeof firstSample?.rowIndex === "number"
        ? firstSample.rowIndex
        : typeof row === "number"
          ? Math.max(0, row - 1)
          : null;
  const column =
    typeof diffData.column === "string" ? diffData.column : typeof firstSample?.column === "string" ? firstSample.column : null;
  const columnId =
    typeof diffData.columnId === "string"
      ? diffData.columnId
      : typeof firstSample?.columnId === "string"
        ? firstSample.columnId
        : column;
  const columnHeader =
    typeof diffData.columnHeader === "string"
      ? diffData.columnHeader
      : typeof firstSample?.columnHeader === "string"
        ? firstSample.columnHeader
        : null;
  const columnRole =
    typeof diffData.columnRole === "string"
      ? diffData.columnRole
      : typeof firstSample?.columnRole === "string"
        ? firstSample.columnRole
        : inferWorksheetColumnRole(columnHeader, typeof diffData.formula === "string" ? diffData.formula : null);
  const nearbyHeaders =
    Array.isArray(diffData.nearbyHeaders) && diffData.nearbyHeaders.every((entry) => typeof entry === "string")
      ? (diffData.nearbyHeaders as string[])
      : Array.isArray(firstSample?.nearbyHeaders) && firstSample.nearbyHeaders.every((entry) => typeof entry === "string")
        ? (firstSample.nearbyHeaders as string[])
        : [];
  const nearbyRows =
    Array.isArray(diffData.nearbyRows) && diffData.nearbyRows.every((entry) => isJsonRecord(entry))
      ? (diffData.nearbyRows as Array<Record<string, Json>>)
      : Array.isArray(firstSample?.nearbyRows) && firstSample.nearbyRows.every((entry) => isJsonRecord(entry))
        ? (firstSample.nearbyRows as Array<Record<string, Json>>)
        : [];
  const sectionLabel =
    typeof diffData.sectionLabel === "string"
      ? diffData.sectionLabel
      : typeof firstSample?.sectionLabel === "string"
        ? firstSample.sectionLabel
        : null;
  const subsectionLabel =
    typeof diffData.subsectionLabel === "string"
      ? diffData.subsectionLabel
      : typeof firstSample?.subsectionLabel === "string"
        ? firstSample.subsectionLabel
        : null;
  const sectionPath =
    Array.isArray(diffData.sectionPath) && diffData.sectionPath.every((entry) => typeof entry === "string")
      ? (diffData.sectionPath as string[])
      : Array.isArray(firstSample?.sectionPath) && firstSample.sectionPath.every((entry) => typeof entry === "string")
        ? (firstSample.sectionPath as string[])
        : sectionLabel
          ? [sectionLabel]
          : [];
  const rowLabel =
    typeof diffData.rowLabel === "string" ? diffData.rowLabel : typeof firstSample?.rowLabel === "string" ? firstSample.rowLabel : null;
  const itemLabel =
    typeof diffData.itemLabel === "string"
      ? diffData.itemLabel
      : typeof firstSample?.itemLabel === "string"
        ? firstSample.itemLabel
        : null;
  const unit = typeof diffData.unit === "string" ? diffData.unit : typeof firstSample?.unit === "string" ? firstSample.unit : null;
  const formula =
    typeof diffData.formula === "string" ? diffData.formula : typeof firstSample?.formula === "string" ? firstSample.formula : null;
  const oldValue = "oldValue" in diffData ? (diffData.oldValue as Json | null) : ((firstSample?.oldValue as Json | null) ?? null);
  const newValue = "newValue" in diffData ? (diffData.newValue as Json | null) : ((firstSample?.newValue as Json | null) ?? null);
  const oldFormula =
    typeof diffData.oldFormula === "string"
      ? diffData.oldFormula
      : typeof firstSample?.oldFormula === "string"
        ? firstSample.oldFormula
        : null;
  const newFormula =
    typeof diffData.newFormula === "string"
      ? diffData.newFormula
      : typeof firstSample?.newFormula === "string"
        ? firstSample.newFormula
        : null;
  const formulaReferences =
    Array.isArray(diffData.formulaReferences) && diffData.formulaReferences.every((entry) => typeof entry === "string")
      ? (diffData.formulaReferences as string[])
      : Array.isArray(firstSample?.formulaReferences) && firstSample.formulaReferences.every((entry) => typeof entry === "string")
        ? (firstSample.formulaReferences as string[])
        : [];
  const referencedCellsSnapshot =
    Array.isArray(diffData.referencedCellsSnapshot) && diffData.referencedCellsSnapshot.every((entry) => isJsonRecord(entry))
      ? (diffData.referencedCellsSnapshot as Array<Record<string, Json>>)
      : Array.isArray(firstSample?.referencedCellsSnapshot) && firstSample.referencedCellsSnapshot.every((entry) => isJsonRecord(entry))
        ? (firstSample.referencedCellsSnapshot as Array<Record<string, Json>>)
        : [];
  const rowSnapshotBefore =
    isJsonRecord(diffData.rowSnapshotBefore)
      ? (diffData.rowSnapshotBefore as Record<string, Json>)
      : isJsonRecord(firstSample?.rowSnapshotBefore)
        ? (firstSample.rowSnapshotBefore as Record<string, Json>)
        : null;
  let rowSnapshotAfter =
    isJsonRecord(diffData.rowSnapshotAfter)
      ? (diffData.rowSnapshotAfter as Record<string, Json>)
      : isJsonRecord(firstSample?.rowSnapshotAfter)
        ? (firstSample.rowSnapshotAfter as Record<string, Json>)
        : null;
  if (!rowSnapshotAfter) {
    const fallbackSnapshot = deriveRowSnapshotFromNearbyRows({
      row,
      rowIndex,
      rowLabel,
      itemLabel,
      unit,
      nearbyRows,
    });
    rowSnapshotAfter = fallbackSnapshot ? serializeWorksheetRowSnapshot(fallbackSnapshot) : null;
  }
  const rowSnapshotVisibleCells =
    Array.isArray(diffData.rowSnapshotVisibleCells) && diffData.rowSnapshotVisibleCells.every((entry) => isJsonRecord(entry))
      ? (diffData.rowSnapshotVisibleCells as Array<Record<string, Json>>)
      : Array.isArray(firstSample?.rowSnapshotVisibleCells) && firstSample.rowSnapshotVisibleCells.every((entry) => isJsonRecord(entry))
        ? (firstSample.rowSnapshotVisibleCells as Array<Record<string, Json>>)
        : isJsonRecord(rowSnapshotAfter) && Array.isArray(rowSnapshotAfter.visibleCells) && rowSnapshotAfter.visibleCells.every((entry) => isJsonRecord(entry))
          ? (rowSnapshotAfter.visibleCells as Array<Record<string, Json>>)
          : [];
  const pricingTuple =
    isJsonRecord(diffData.pricingTuple)
      ? (diffData.pricingTuple as Record<string, Json | null>)
      : isJsonRecord(firstSample?.pricingTuple)
        ? (firstSample.pricingTuple as Record<string, Json | null>)
        : {};
  const relatedRows =
    Array.isArray(diffData.relatedRows) && diffData.relatedRows.every((entry) => isJsonRecord(entry))
      ? (diffData.relatedRows as Array<Record<string, Json>>)
      : Array.isArray(firstSample?.relatedRows) && firstSample.relatedRows.every((entry) => isJsonRecord(entry))
        ? (firstSample.relatedRows as Array<Record<string, Json>>)
        : [];
  const aiInteractionId =
    typeof diffData.aiInteractionId === "string"
      ? diffData.aiInteractionId
      : typeof firstSample?.aiInteractionId === "string"
        ? firstSample.aiInteractionId
        : null;
  const source =
    typeof diffData.source === "string"
      ? diffData.source
      : deriveWorksheetLearningSourceFromChannel(event.sourceChannel);
  const evidenceSchemaVersion =
    typeof diffData.evidenceSchemaVersion === "number"
      ? diffData.evidenceSchemaVersion
      : typeof firstSample?.evidenceSchemaVersion === "number"
        ? firstSample.evidenceSchemaVersion
        : 2;

  const normalizedDiffData = {
    ...diffData,
    workbookId: typeof metadata.workbookId === "string" ? metadata.workbookId : event.parentEntityId,
    workbookName:
      typeof diffData.workbookName === "string"
        ? diffData.workbookName
        : typeof metadata.workbookName === "string"
          ? metadata.workbookName
          : typeof metadata.worksheetName === "string"
            ? metadata.worksheetName
            : typeof metadata.sheetName === "string"
              ? metadata.sheetName
              : null,
    worksheetId: typeof metadata.worksheetId === "string" ? metadata.worksheetId : event.parentEntityId,
    worksheetName: typeof metadata.worksheetName === "string" ? metadata.worksheetName : null,
    sheetId: typeof metadata.sheetId === "string" ? metadata.sheetId : event.entityId,
    sheetName: typeof metadata.sheetName === "string" ? metadata.sheetName : null,
    tradePackage: typeof metadata.tradePackage === "string" ? metadata.tradePackage : null,
    source,
    aiInteractionId,
    generatedByAi: diffData.generatedByAi === true,
    classificationStatus:
      typeof diffData.classificationStatus === "string" ? diffData.classificationStatus : "pending",
    rawContextVersion:
      typeof diffData.rawContextVersion === "number" ? diffData.rawContextVersion : 1,
    eventCaptureVersion:
      typeof diffData.eventCaptureVersion === "number" ? diffData.eventCaptureVersion : 1,
    contextCaptureSource:
      typeof diffData.contextCaptureSource === "string"
        ? diffData.contextCaptureSource
        : "worksheet_event_capture",
    cell,
    cellAddress,
    row,
    rowIndex,
    column,
    columnId,
    columnHeader,
    columnRole,
    nearbyHeaders,
    nearbyRows,
    sectionLabel,
    subsectionLabel,
    sectionPath,
    rowLabel,
    itemLabel,
    unit,
    formula,
    oldValue,
    newValue,
    oldFormula,
    newFormula,
    formulaReferences,
    referencedCellsSnapshot,
    rowSnapshotBefore,
    rowSnapshotAfter,
    rowSnapshotVisibleCells,
    pricingTuple,
    relatedRows,
    evidenceSchemaVersion,
    captureCompletenessScore:
      typeof diffData.captureCompletenessScore === "number"
        ? diffData.captureCompletenessScore
        : typeof firstSample?.captureCompletenessScore === "number"
          ? firstSample.captureCompletenessScore
          : null,
    captureWarnings:
      Array.isArray(diffData.captureWarnings) && diffData.captureWarnings.every((entry) => typeof entry === "string")
        ? (diffData.captureWarnings as string[])
        : Array.isArray(firstSample?.captureWarnings) && firstSample.captureWarnings.every((entry) => typeof entry === "string")
          ? (firstSample.captureWarnings as string[])
          : [],
    labelExtractionMode:
      typeof diffData.labelExtractionMode === "string"
        ? diffData.labelExtractionMode
        : typeof firstSample?.labelExtractionMode === "string"
          ? firstSample.labelExtractionMode
          : "heuristic_first_text_cells",
    sectionInferenceMode:
      typeof diffData.sectionInferenceMode === "string"
        ? diffData.sectionInferenceMode
        : typeof firstSample?.sectionInferenceMode === "string"
          ? firstSample.sectionInferenceMode
          : "heuristic_upward_scan",
    rowSnapshotCompleteness:
      typeof diffData.rowSnapshotCompleteness === "number"
        ? diffData.rowSnapshotCompleteness
        : typeof firstSample?.rowSnapshotCompleteness === "number"
          ? firstSample.rowSnapshotCompleteness
          : null,
    classificationHints:
      isJsonRecord(diffData.classificationHints)
        ? diffData.classificationHints
        : buildWorksheetClassificationHints({
            eventType: event.eventType,
            source,
            aiInteractionId,
            columnHeader,
            nearbyHeaders,
            rowLabel,
            sectionLabel,
            itemLabel,
            unit,
            tradePackage: typeof metadata.tradePackage === "string" ? metadata.tradePackage : null,
            formula,
          }),
    sampleChanges: rawSamples
      .map((sample) =>
        normalizeWorksheetLearningSampleChange(sample, {
          cell,
          cellAddress,
          row,
          rowIndex,
          column,
          columnId,
          columnHeader,
          columnRole,
          nearbyHeaders,
          nearbyRows,
          sectionLabel,
          subsectionLabel,
          sectionPath,
          rowLabel,
          itemLabel,
          unit,
          formula,
          oldValue,
          newValue,
          oldFormula,
          newFormula,
          formulaReferences,
          referencedCellsSnapshot,
          rowSnapshotBefore,
          rowSnapshotAfter,
          rowSnapshotVisibleCells,
          pricingTuple,
          relatedRows,
          evidenceSchemaVersion,
          captureCompletenessScore:
            typeof diffData.captureCompletenessScore === "number" ? diffData.captureCompletenessScore : null,
          captureWarnings:
            Array.isArray(diffData.captureWarnings) && diffData.captureWarnings.every((entry) => typeof entry === "string")
              ? (diffData.captureWarnings as string[])
              : [],
          labelExtractionMode:
            typeof diffData.labelExtractionMode === "string" ? diffData.labelExtractionMode : "heuristic_first_text_cells",
          sectionInferenceMode:
            typeof diffData.sectionInferenceMode === "string" ? diffData.sectionInferenceMode : "heuristic_upward_scan",
          rowSnapshotCompleteness:
            typeof diffData.rowSnapshotCompleteness === "number" ? diffData.rowSnapshotCompleteness : null,
          aiInteractionId,
        })
      )
      .filter((sample): sample is Record<string, Json | null> => sample !== null),
  } satisfies Record<string, Json | null>;

  return {
    ...event,
    diffData: normalizedDiffData,
  };
}

function buildWorksheetLearningEventGroup(params: {
  changes: WorksheetCellChangeRecord[];
  previousWorksheet: WorksheetData;
  nextWorksheet: WorksheetData;
  sampleLimit?: number;
}) {
  const changedCellKeys = params.changes.map((change) => change.cellKey);
  const summary = buildWorksheetLearningDiffSummary({
    previousWorksheet: params.previousWorksheet,
    nextWorksheet: params.nextWorksheet,
    changedCellKeys,
    sampleLimit: params.sampleLimit,
  });
  const firstChange = params.changes[0];

  return {
    eventType: firstChange.eventType,
    eventFamily: firstChange.eventFamily,
    action: firstChange.action,
    aiInteractionId:
      params.changes.length === 1
        ? firstChange.aiInteractionId
        : params.changes.every((change) => change.aiInteractionId === firstChange.aiInteractionId)
          ? firstChange.aiInteractionId
          : null,
    cell: params.changes.length === 1 ? firstChange.context.cellAddress : null,
    row: params.changes.length === 1 ? firstChange.context.row : null,
    rowIndex: params.changes.length === 1 ? firstChange.context.rowIndex : null,
    column: params.changes.length === 1 ? firstChange.context.column : null,
    columnHeader: params.changes.length === 1 ? firstChange.context.headerLabel : null,
    columnRole: params.changes.length === 1 ? firstChange.context.columnRole : null,
    nearbyHeaders: params.changes.length === 1 ? firstChange.context.nearbyHeaders : [],
    nearbyRows:
      params.changes.length === 1
        ? (firstChange.context.nearbyRows as Array<Record<string, Json>>)
        : [],
    sectionLabel: params.changes.length === 1 ? firstChange.context.sectionLabel : null,
    subsectionLabel: params.changes.length === 1 ? firstChange.context.subsectionLabel : null,
    sectionPath: params.changes.length === 1 ? firstChange.context.sectionPath : [],
    rowLabel: params.changes.length === 1 ? firstChange.context.rowLabel : null,
    itemLabel: params.changes.length === 1 ? firstChange.context.itemLabel : null,
    unit: params.changes.length === 1 ? firstChange.context.unit : null,
    rowSnapshotBefore:
      params.changes.length === 1 && firstChange.context.rowIndex !== null
        ? serializeWorksheetRowSnapshot(buildWorksheetRowSnapshot(params.previousWorksheet, firstChange.context.rowIndex))
        : null,
    rowSnapshotAfter:
      params.changes.length === 1 && firstChange.context.rowIndex !== null
        ? serializeWorksheetRowSnapshot(buildWorksheetRowSnapshot(params.nextWorksheet, firstChange.context.rowIndex))
        : null,
    rowSnapshotVisibleCells:
      params.changes.length === 1 && firstChange.context.rowSnapshot
        ? (firstChange.context.rowSnapshot.visibleCells as Array<Record<string, Json>>)
        : [],
    pricingTuple:
      params.changes.length === 1
        ? serializeWorksheetPricingTupleEvidence(firstChange.context.pricingTuple)
        : serializeWorksheetPricingTupleEvidence({
            quantity: null,
            rate: null,
            amount: null,
            unit: null,
            labour: null,
            material: null,
          }),
    relatedRows:
      params.changes.length === 1
        ? firstChange.context.relatedRows
            .map((snapshot) => serializeWorksheetRowSnapshot(snapshot))
            .filter((snapshot): snapshot is Record<string, Json> => snapshot !== null)
        : [],
    formula:
      params.changes.length === 1
        ? firstChange.nextCell?.formula ?? firstChange.previousCell?.formula ?? null
        : null,
    oldValue:
      params.changes.length === 1
        ? normalizeWorksheetCellValue(firstChange.previousCell)
        : null,
    newValue:
      params.changes.length === 1
        ? normalizeWorksheetCellValue(firstChange.nextCell)
        : null,
    oldFormula: params.changes.length === 1 ? firstChange.previousCell?.formula ?? null : null,
    newFormula: params.changes.length === 1 ? firstChange.nextCell?.formula ?? null : null,
    formulaReferences:
      params.changes.length === 1
        ? extractFormulaReferenceStrings(firstChange.nextCell?.formula ?? firstChange.previousCell?.formula ?? null)
        : [],
    referencedCellsSnapshot:
      params.changes.length === 1 && firstChange.context.rowIndex !== null
        ? (buildWorksheetReferencedCellsSnapshot({
            worksheet: params.nextWorksheet,
            rowIndex: firstChange.context.rowIndex,
            formula: firstChange.nextCell?.formula ?? firstChange.previousCell?.formula ?? null,
          }) as Array<Record<string, Json>>)
        : [],
    correctionContext: collapseWorksheetCorrectionContext(
      params.changes
        .map((change) => change.correctionContext)
        .filter((context): context is WorksheetCorrectionContext => context !== null)
    ),
    validationResult: {
      status: summary.formulaCellCount > 0 ? "passed" : "not_applicable",
    } satisfies WorksheetLearningValidationResult,
    memoryEligibility: {
      eligible: firstChange.eventType !== "worksheet_cell_edited",
      reason:
        firstChange.eventType === "worksheet_cell_edited"
          ? "Generic cell edits are low-value by default."
          : "Structured pricing, formula, or AI correction edits are useful for future learning.",
    } satisfies WorksheetLearningMemoryEligibility,
    evidenceSchemaVersion: 2,
    labelExtractionMode: "heuristic_first_text_cells",
    sectionInferenceMode: firstChange.context.sectionInferenceMode,
    captureQuality: calculateWorksheetCaptureQuality({
      rowSnapshotAfter:
        params.changes.length === 1 && firstChange.context.rowIndex !== null
          ? buildWorksheetRowSnapshot(params.nextWorksheet, firstChange.context.rowIndex)
          : null,
      columnHeader: params.changes.length === 1 ? firstChange.context.headerLabel : null,
      sectionContext: {
        sectionLabel: params.changes.length === 1 ? firstChange.context.sectionLabel : null,
        subsectionLabel: params.changes.length === 1 ? firstChange.context.subsectionLabel : null,
        sectionPath: params.changes.length === 1 ? firstChange.context.sectionPath : [],
        sectionInferenceMode: firstChange.context.sectionInferenceMode,
      },
      referencedCellsSnapshot:
        params.changes.length === 1 && firstChange.context.rowIndex !== null
          ? buildWorksheetReferencedCellsSnapshot({
              worksheet: params.nextWorksheet,
              rowIndex: firstChange.context.rowIndex,
              formula: firstChange.nextCell?.formula ?? firstChange.previousCell?.formula ?? null,
            })
          : [],
    }),
    summary,
  };
}

export function buildWorksheetLearningArtifacts(params: {
  organizationId: string;
  userId: string | null;
  projectId?: string | null;
  opportunityId: string;
  workbookId: string;
  workbookName?: string | null;
  sheetId: string;
  sheetName: string;
  worksheetId?: string | null;
  worksheetName?: string;
  tradePackage: string | null;
  source: WorksheetLearningSource;
  previousWorksheet: WorksheetData;
  nextWorksheet: WorksheetData;
  clientMutationId?: string | null;
  sampleLimit?: number;
  occurredAt?: string;
}) {
  const changedCellKeys = listWorksheetChangedCellKeys({
    previousWorksheet: params.previousWorksheet,
    nextWorksheet: params.nextWorksheet,
  });

  if (changedCellKeys.length === 0) {
    return {
      worksheet: params.nextWorksheet,
      intelligenceEvents: [],
      correctionEvents: [],
    } satisfies WorksheetLearningArtifacts;
  }

  const correctionEvents: ReturnType<typeof buildWorksheetCorrectionEventInput>[] = [];
  let nextWorksheet = params.nextWorksheet;
  const changes: WorksheetCellChangeRecord[] = [];
  const correctedAt = params.occurredAt ?? new Date().toISOString();

  for (const cellKey of changedCellKeys) {
    const previousCell = params.previousWorksheet.cells[cellKey];
    const nextCell = nextWorksheet.cells[cellKey];
    const classified = classifyWorksheetLearningEvent({
      cellKey,
      previousCell,
      nextCell,
      worksheet: nextWorksheet,
    });
    const provenance = parseWorksheetAiProvenanceMetadata(previousCell?.metadata ?? nextCell?.metadata ?? null);
    const aiInteractionId = provenance?.aiInteractionId ?? null;
    const corrected = params.source === "manual" && provenance?.generatedByAi === true && aiInteractionId !== null;
    const eventType = corrected ? classified.correctionType : classified.eventType;
    let correctionContext: WorksheetCorrectionContext | null = null;

    if (corrected) {
      nextWorksheet = updateWorksheetCellCorrectionMetadata({
        worksheet: nextWorksheet,
        cellKey,
        correctedAt,
        correctedByUserId: params.userId,
      });
      const currentCorrectedCell = nextWorksheet.cells[cellKey];
      correctionContext = buildWorksheetCorrectionContext({
        provenance,
        correctedAt,
        correctedByUserId: params.userId,
      });
      correctionEvents.push(
        buildWorksheetCorrectionEventInput({
          organizationId: params.organizationId,
          userId: params.userId,
          projectId: params.projectId ?? null,
          opportunityId: params.opportunityId,
          workbookId: params.workbookId,
          sheetId: params.sheetId,
          sheetName: params.sheetName,
          aiInteractionId,
          correctionType: "manual_override",
          correctionLabel: eventType,
          targetEntityId: cellKey,
          correctedFieldName:
            previousCell?.formula !== currentCorrectedCell?.formula
              ? "formula"
              : typeof currentCorrectedCell?.value === "number"
                ? "value"
                : "displayValue",
          incorrectValue:
            previousCell?.formula !== currentCorrectedCell?.formula
              ? previousCell?.formula ?? provenance.originalAiFormula ?? null
              : previousCell?.value ?? provenance.originalAiValue ?? null,
          correctedValue:
            previousCell?.formula !== currentCorrectedCell?.formula
              ? currentCorrectedCell?.formula ?? null
              : currentCorrectedCell?.value ?? null,
          correctionReason: "Estimator corrected AI-generated worksheet output.",
          isTrainingEligible: true,
        })
      );
    }

    changes.push({
      cellKey,
      previousCell,
      nextCell: nextWorksheet.cells[cellKey],
      eventType,
      eventFamily: corrected ? "correction" : "field_change",
      action: corrected ? "corrected" : "edited",
      aiInteractionId,
      corrected,
      correctionContext,
      context: classified.context,
    });
  }

  const groupedChanges = new Map<WorksheetIntelligenceEventType, WorksheetCellChangeRecord[]>();
  for (const change of changes) {
    const existingGroup = groupedChanges.get(change.eventType);
    if (existingGroup) {
      existingGroup.push(change);
      continue;
    }
    groupedChanges.set(change.eventType, [change]);
  }

  const intelligenceEvents = Array.from(groupedChanges.values()).map((group) => {
    const eventGroup = buildWorksheetLearningEventGroup({
      changes: group,
      previousWorksheet: params.previousWorksheet,
      nextWorksheet,
      sampleLimit: params.sampleLimit,
    });
    const clientMutationId =
      typeof params.clientMutationId === "string" && params.clientMutationId.trim().length > 0
        ? params.clientMutationId
        : null;
    const sourceRequestId =
      clientMutationId && IDEMPOTENT_WORKSHEET_EDIT_EVENT_TYPES.has(eventGroup.eventType as WorksheetMutationEvidenceV2EventType)
        ? buildWorksheetEditEventSourceRequestId({
            clientMutationId,
            eventType: eventGroup.eventType as WorksheetMutationEvidenceV2EventType,
          })
        : null;

    return buildWorksheetLearningEvent({
      organizationId: params.organizationId,
      userId: params.userId,
      projectId: params.projectId ?? null,
      opportunityId: params.opportunityId,
      workbookId: params.workbookId,
      workbookName: params.workbookName ?? params.worksheetName ?? params.sheetName,
      sheetId: params.sheetId,
      sheetName: params.sheetName,
      worksheetId: params.worksheetId ?? params.workbookId,
      worksheetName: params.worksheetName ?? params.sheetName,
      tradePackage: params.tradePackage,
      worksheet: nextWorksheet,
      eventType: eventGroup.eventType,
      eventFamily: eventGroup.eventFamily,
      action: eventGroup.action,
      source: params.source,
      sourceRequestId,
      aiInteractionId: eventGroup.aiInteractionId,
      cell: eventGroup.cell,
      row: eventGroup.row,
      rowIndex: eventGroup.rowIndex,
      column: eventGroup.column,
      columnHeader: eventGroup.columnHeader,
      columnRole: eventGroup.columnRole,
      nearbyHeaders: eventGroup.nearbyHeaders,
      nearbyRows: eventGroup.nearbyRows,
      sectionLabel: eventGroup.sectionLabel,
      subsectionLabel: eventGroup.subsectionLabel,
      sectionPath: eventGroup.sectionPath,
      rowLabel: eventGroup.rowLabel,
      itemLabel: eventGroup.itemLabel,
      unit: eventGroup.unit,
      formula: eventGroup.formula,
      oldValue: eventGroup.oldValue as Json | null,
      newValue: eventGroup.newValue as Json | null,
      oldFormula: eventGroup.oldFormula,
      newFormula: eventGroup.newFormula,
      formulaReferences: eventGroup.formulaReferences,
      validationResult: eventGroup.validationResult,
      memoryEligibility: eventGroup.memoryEligibility,
      changedCellCount: eventGroup.summary.changedCellCount,
      formulaCellCount: eventGroup.summary.formulaCellCount,
      sampleChanges: eventGroup.summary.sampledChanges,
      truncated: eventGroup.summary.truncated,
      occurredAt: params.occurredAt,
      diffData: {
        clientMutationId,
        ...eventGroup.correctionContext,
        rowSnapshotBefore: eventGroup.rowSnapshotBefore,
        rowSnapshotAfter: eventGroup.rowSnapshotAfter,
        rowSnapshotVisibleCells: eventGroup.rowSnapshotVisibleCells,
        pricingTuple: eventGroup.pricingTuple,
        relatedRows: eventGroup.relatedRows,
        referencedCellsSnapshot: eventGroup.referencedCellsSnapshot,
        evidenceSchemaVersion: eventGroup.evidenceSchemaVersion,
        captureCompletenessScore: eventGroup.captureQuality.captureCompletenessScore,
        captureWarnings: eventGroup.captureQuality.captureWarnings,
        labelExtractionMode: eventGroup.labelExtractionMode,
        sectionInferenceMode: eventGroup.sectionInferenceMode,
        rowSnapshotCompleteness: eventGroup.captureQuality.rowSnapshotCompleteness,
      },
    });
  });

  return {
    worksheet: nextWorksheet,
    intelligenceEvents,
    correctionEvents,
  } satisfies WorksheetLearningArtifacts;
}

export function buildWorksheetLearningEvent(params: WorksheetLearningEventBuildInput) {
  const baseDiffData = {
    workbookId: params.workbookId,
    workbookName: params.workbookName ?? params.worksheetName ?? params.sheetName,
    worksheetId: params.worksheetId ?? params.workbookId,
    worksheetName: params.worksheetName ?? params.sheetName,
    sheetId: params.sheetId,
    sheetName: params.sheetName,
    tradePackage: params.tradePackage,
    source: params.source,
    aiInteractionId: params.aiInteractionId ?? null,
    generatedByAi: params.diffData?.generatedByAi ?? false,
    classificationStatus: "pending",
    rawContextVersion: 1,
    eventCaptureVersion: 1,
    contextCaptureSource: "worksheet_event_capture",
    evidenceSchemaVersion: params.evidenceSchemaVersion ?? 2,
    cell: params.cell ?? null,
    cellAddress: params.cell ?? null,
    range: params.range ?? null,
    row: params.row ?? null,
    rowIndex: params.rowIndex ?? null,
    column: params.column ?? null,
    columnId: params.column ?? null,
    columnHeader: params.columnHeader ?? null,
    columnRole: params.columnRole ?? null,
    nearbyHeaders: params.nearbyHeaders ?? [],
    nearbyRows: params.nearbyRows ?? [],
    sectionLabel: params.sectionLabel ?? null,
    subsectionLabel: params.subsectionLabel ?? null,
    sectionPath: params.sectionPath ?? [],
    rowLabel: params.rowLabel ?? null,
    itemLabel: params.itemLabel ?? null,
    unit: params.unit ?? null,
    formula: params.formula ?? params.newFormula ?? params.oldFormula ?? null,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
    oldFormula: params.oldFormula ?? null,
    newFormula: params.newFormula ?? null,
    formulaReferences: params.formulaReferences ?? [],
    classificationHints: buildWorksheetClassificationHints({
      eventType: params.eventType,
      source: params.source,
      aiInteractionId: params.aiInteractionId ?? null,
      columnHeader: params.columnHeader ?? null,
      nearbyHeaders: params.nearbyHeaders ?? [],
      rowLabel: params.rowLabel ?? null,
      sectionLabel: params.sectionLabel ?? null,
      itemLabel: params.itemLabel ?? null,
      unit: params.unit ?? null,
      tradePackage: params.tradePackage,
      formula: params.formula ?? params.newFormula ?? params.oldFormula ?? null,
    }),
    validationResult: {
      status: params.validationResult?.status ?? "not_applicable",
      code: params.validationResult?.code ?? null,
      message: params.validationResult?.message ?? null,
    },
    memoryEligibility: {
      eligible: params.memoryEligibility?.eligible ?? false,
      reason: params.memoryEligibility?.reason ?? null,
    },
    financialSensitivity: "financial_sensitive",
    schemaVersion: 2,
    changedCellCount: params.changedCellCount ?? null,
    formulaCellCount: params.formulaCellCount ?? null,
    sampleChanges: params.sampleChanges ?? [],
    rowSnapshotBefore: params.rowSnapshotBefore ?? null,
    rowSnapshotAfter: params.rowSnapshotAfter ?? null,
    rowSnapshotVisibleCells: params.rowSnapshotVisibleCells ?? [],
    pricingTuple: params.pricingTuple ?? {},
    relatedRows: params.relatedRows ?? [],
    referencedCellsSnapshot: params.referencedCellsSnapshot ?? [],
    captureCompletenessScore: params.captureCompletenessScore ?? null,
    captureWarnings: params.captureWarnings ?? [],
    labelExtractionMode: params.labelExtractionMode ?? "heuristic_first_text_cells",
    sectionInferenceMode: params.sectionInferenceMode ?? "heuristic_upward_scan",
    rowSnapshotCompleteness: params.rowSnapshotCompleteness ?? null,
    truncated: params.truncated ?? false,
    ...(params.diffData ?? {}),
  } satisfies Record<string, Json | null>;

  return buildPricingWorksheetIntelligenceEvent({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    projectId: params.projectId ?? null,
    opportunityId: params.opportunityId,
    workbookId: params.workbookId,
    workbookName: params.workbookName ?? params.worksheetName ?? params.sheetName,
    sheetId: params.sheetId,
    sheetName: params.sheetName,
    worksheetId: params.worksheetId ?? params.workbookId,
    worksheetName: params.worksheetName ?? params.sheetName,
    tradePackage: params.tradePackage,
    worksheet: params.worksheet,
    eventType: params.eventType,
    eventFamily: params.eventFamily,
    action: params.action,
    source: params.source,
    sourceRequestId: params.sourceRequestId ?? null,
    occurredAt: params.occurredAt,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
    diffData: baseDiffData,
    reason: params.reason ?? null,
    relatedEntities: params.relatedEntities,
    lineageRefs: params.lineageRefs,
  });
}

export function buildWorksheetCorrectionEventInput(
  params: WorksheetCorrectionEventInput
) {
  return {
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    projectId: params.projectId ?? null,
    opportunityId: params.opportunityId,
    module: "pricing_worksheets",
    correctionType: params.correctionType,
    targetEntityType: "pricing_worksheet_cell",
    targetEntityId: params.targetEntityId,
    linkedAiInteractionId: params.aiInteractionId,
    correctedFieldName: params.correctedFieldName,
    incorrectValue: params.incorrectValue,
    correctedValue: params.correctedValue,
    correctionReason: params.correctionReason,
    feedbackLabel: params.correctionLabel,
    isTrainingEligible: params.isTrainingEligible ?? true,
    privacyClassification: "financial_sensitive",
    visibilityScope: "organization",
    metadata: {
      workbookId: params.workbookId,
      sheetId: params.sheetId,
      sheetName: params.sheetName,
    },
  } satisfies Record<string, Json | null>;
}

export function buildPricingWorksheetAiReviewSignalData(params: {
  polarity: "positive" | "negative" | "neutral" | "mixed";
  weight: number;
  detail?: Record<string, Json | null>;
}): Record<string, Json | null> & {
  signalPolarity: "positive" | "negative" | "neutral" | "mixed";
  signalWeight: number;
} {
  return {
    signalPolarity: params.polarity,
    signalWeight: params.weight,
    ...(params.detail ?? {}),
  };
}

export type PricingWorksheetAiEvidenceFeedbackOutcome =
  | "accepted"
  | "rejected"
  | "invalidated"
  | "revised"
  | "applied"
  | "confirmed";

type PricingWorksheetAiEvidenceFeedbackParams = {
  outcome: PricingWorksheetAiEvidenceFeedbackOutcome;
  interactionId?: string | null;
  finding?: PricingWorksheetAiReviewFinding | null;
  previousFinding?: PricingWorksheetAiReviewFinding | null;
  evidenceSources?: PricingWorksheetAiEvidenceSource[];
  evidenceSourceIds?: string[];
  classification?: PricingWorksheetConstructionIntent | null;
  userCorrectionSummary?: string | null;
  affectedFindingIds?: string[];
  affectedSuggestedEditGroupIds?: string[];
  removedSuggestedEditGroupIds?: string[];
};

function normalizeEvidenceSourceRecord(source: PricingWorksheetAiEvidenceSource) {
  return {
    id: source.id,
    title: source.title,
    url: source.url ?? null,
    sourceType: source.sourceType,
    jurisdiction: source.jurisdiction ?? "unknown",
    confidence: source.confidence,
    supportedClaims: source.supportedClaims ?? [],
  } satisfies Record<string, Json | null>;
}

function resolveEvidenceSources(params: {
  evidenceSources?: PricingWorksheetAiEvidenceSource[];
  evidenceSourceIds?: string[];
  finding?: PricingWorksheetAiReviewFinding | null;
  previousFinding?: PricingWorksheetAiReviewFinding | null;
}) {
  const availableSources = params.evidenceSources ?? [];
  const requestedIds = new Set<string>([
    ...(params.evidenceSourceIds ?? []),
    ...(params.finding?.evidenceSourceIds ?? []),
    ...(params.previousFinding?.evidenceSourceIds ?? []),
  ]);

  if (requestedIds.size === 0) {
    return [] as PricingWorksheetAiEvidenceSource[];
  }

  return availableSources.filter((source) => requestedIds.has(source.id));
}

function buildEvidenceFeedbackSignal(
  outcome: PricingWorksheetAiEvidenceFeedbackOutcome
): Pick<Parameters<typeof buildPricingWorksheetAiReviewSignalData>[0], "polarity" | "weight"> {
  switch (outcome) {
    case "accepted":
      return { polarity: "positive", weight: 0.55 };
    case "rejected":
      return { polarity: "negative", weight: -0.7 };
    case "invalidated":
      return { polarity: "negative", weight: -0.9 };
    case "revised":
      return { polarity: "mixed", weight: -0.35 };
    case "confirmed":
      return { polarity: "positive", weight: 0.65 };
    case "applied":
      return { polarity: "positive", weight: 0.9 };
    default:
      return { polarity: "neutral", weight: 0 };
  }
}

export function buildPricingWorksheetAiEvidenceFeedbackData(
  params: PricingWorksheetAiEvidenceFeedbackParams
) {
  const signal = buildEvidenceFeedbackSignal(params.outcome);
  const relatedSources = resolveEvidenceSources({
    evidenceSources: params.evidenceSources,
    evidenceSourceIds: params.evidenceSourceIds,
    finding: params.finding,
    previousFinding: params.previousFinding,
  });

  const claimFeedback = relatedSources.flatMap((source) =>
    (source.supportedClaims ?? []).map((claim) => ({
      sourceId: source.id,
      sourceTitle: source.title,
      sourceUrl: source.url ?? null,
      sourceType: source.sourceType,
      claim,
    }))
  );

  return buildPricingWorksheetAiReviewSignalData({
    polarity: signal.polarity,
    weight: signal.weight,
    detail: {
      interactionId: params.interactionId ?? null,
      outcome: params.outcome,
      findingId: params.finding?.id ?? null,
      findingCategory: params.finding?.category ?? null,
      findingStatus: params.finding?.findingStatus ?? null,
      findingConfidenceBefore: params.previousFinding?.confidence ?? params.finding?.confidence ?? null,
      findingConfidenceAfter: params.finding?.confidence ?? null,
      evidenceSourceIds: relatedSources.map((source) => source.id),
      evidenceSources: relatedSources.map(normalizeEvidenceSourceRecord),
      claimFeedback,
      supportedClaims: claimFeedback.map((entry) => entry.claim),
      tradeHints: params.classification?.tradeHints ?? [],
      systemHints: params.classification?.systemHints ?? [],
      recommendedPromptPath: params.classification?.recommendedPromptPath ?? null,
      requiresRetrieval: params.classification?.requiresRetrieval ?? null,
      retrievalReasons: params.classification?.retrievalReasons ?? [],
      userCorrectionSummary: params.userCorrectionSummary ?? null,
      affectedFindingIds: params.affectedFindingIds ?? [],
      affectedSuggestedEditGroupIds: params.affectedSuggestedEditGroupIds ?? [],
      removedSuggestedEditGroupIds: params.removedSuggestedEditGroupIds ?? [],
      contextualEvidenceOnly: true,
      organizationScopedOnly: true,
    },
  });
}

export async function writePricingWorksheetIntelligenceEvent(
  supabase: BrowserSupabaseClient,
  event: ReturnType<typeof buildPricingWorksheetIntelligenceEvent>
) {
  const preparedEvent = preparePricingWorksheetIntelligenceEventForPersistence(event);
  const { error } = await supabase.rpc("write_intelligence_event" as never, {
    p_input: preparedEvent,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

export async function writePricingWorksheetIntelligenceEvents(
  supabase: BrowserSupabaseClient,
  events: Array<ReturnType<typeof buildPricingWorksheetIntelligenceEvent>>
) {
  const preparedEvents = events.map(preparePricingWorksheetIntelligenceEventForPersistence);
  const { error } = await supabase.rpc("write_intelligence_events" as never, {
    p_events: preparedEvents,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

export async function enqueueWorksheetMutationEvidenceV2Outbox(
  supabase: BrowserSupabaseClient,
  input: WorksheetMutationEvidenceV2OutboxInput
) {
  const { data, error } = await supabase.rpc("enqueue_worksheet_mutation_evidence_v2_outbox" as never, {
    p_input: {
      organizationId: input.organizationId,
      userId: input.userId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId,
      workbookId: input.workbookId,
      workbookName: input.workbookName ?? null,
      sheetId: input.sheetId,
      sheetName: input.sheetName,
      worksheetId: input.worksheetId ?? input.workbookId,
      worksheetName: input.worksheetName ?? input.sheetName,
      tradePackage: input.tradePackage,
      source: input.source,
      clientMutationId: input.clientMutationId,
      occurredAt: input.occurredAt ?? null,
      previousWorksheet: input.previousWorksheet as unknown as Json,
      nextWorksheet: input.nextWorksheet as unknown as Json,
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: typeof data?.id === "string" ? data.id : null,
    inserted: data?.inserted === true,
  };
}

export async function writePricingWorksheetCorrectionEvent(
  supabase: BrowserSupabaseClient,
  input: ReturnType<typeof buildWorksheetCorrectionEventInput>
) {
  const { error } = await supabase.rpc("write_correction_event" as never, {
    p_input: input,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

export function logPricingWorksheetIntelligenceFailure(eventType: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.warn("[pricing-worksheet-intelligence] event write failed", {
    eventType,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}
