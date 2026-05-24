import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWorksheetData, type WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { PricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import type {
  PricingWorksheetAiEvidenceSource,
  PricingWorksheetAiReviewFinding,
} from "@/lib/pricing-worksheet-edit-plan";
import type { Database, Json } from "@/lib/supabase/types";

type BrowserSupabaseClient = SupabaseClient<Database>;

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
  | "reviewed"
  | "revised"
  | "accepted"
  | "rejected"
  | "invalidated"
  | "confirmed"
  | "applied";

type WorksheetIntelligenceEventFamily = "entity_lifecycle" | "commercial_action" | "ai_review";

export type PricingWorksheetIntelligenceEventInput = {
  organizationId: string;
  opportunityId: string;
  entityId: string;
  worksheetName: string;
  tradePackage: string | null;
  worksheet: WorksheetData;
  eventType: WorksheetIntelligenceEventType;
  eventFamily: WorksheetIntelligenceEventFamily;
  action: WorksheetIntelligenceAction;
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
  worksheetName: string;
  tradePackage: string | null;
  worksheet: WorksheetData;
}) {
  return {
    worksheetName: params.worksheetName,
    tradePackage: params.tradePackage,
    structureSummary: summarizeWorksheetStructure(params.worksheet),
  } satisfies Record<string, Json>;
}

export function buildPricingWorksheetIntelligenceEvent(
  params: PricingWorksheetIntelligenceEventInput
) {
  const metadata = buildWorksheetIntelligenceMetadata({
    worksheetName: params.worksheetName,
    tradePackage: params.tradePackage,
    worksheet: params.worksheet,
  });

  return {
    organizationId: params.organizationId,
    opportunityId: params.opportunityId,
    module: "pricing_worksheets",
    eventFamily: params.eventFamily,
    eventType: params.eventType,
    action: params.action,
    entityType: "pricing_worksheet",
    entityId: params.entityId,
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
  const { error } = await supabase.rpc("write_intelligence_event" as never, {
    p_input: event,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

export async function writePricingWorksheetIntelligenceEvents(
  supabase: BrowserSupabaseClient,
  events: Array<ReturnType<typeof buildPricingWorksheetIntelligenceEvent>>
) {
  const { error } = await supabase.rpc("write_intelligence_events" as never, {
    p_events: events,
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
    error: error instanceof Error ? error.message : error,
  });
}
