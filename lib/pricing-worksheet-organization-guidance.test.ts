import { describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { buildPricingWorksheetAiContext } from "./pricing-worksheet-ai-context";
import { rankPricingWorksheetOrganizationGuidance } from "./pricing-worksheet-organization-guidance";
import type { AiMemoryItem } from "./ai-lifecycle-server";
import type { PricingWorksheetConstructionIntent } from "./pricing-worksheet-construction-intent";
import type { Json } from "./supabase/types";

vi.mock("server-only", () => ({}));

function buildContext() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Acoustic Wall Estimate",
    rowCount: 10,
    columnCount: 6,
  });

  return buildPricingWorksheetAiContext(worksheet, {
    worksheetId: "worksheet-1",
    worksheetName: "Acoustic Wall Estimate",
    tradePackage: "Partitions",
  });
}

function buildClassification(overrides: Partial<PricingWorksheetConstructionIntent> = {}): PricingWorksheetConstructionIntent {
  return {
    primaryIntent: "review_estimate",
    defaultJurisdiction: "AUS_NZ",
    requiresConstructionReasoning: true,
    requiresRetrieval: true,
    tradeHints: ["partitions"],
    systemHints: ["acoustic wall"],
    confidence: "medium",
    riskLevel: "high",
    shouldAskFollowUp: true,
    reason: "Review request",
    matchedIntentSignals: ["review"],
    matchedTradeSignals: ["partitions"],
    matchedSystemSignals: ["acoustic wall"],
    matchedRiskSignals: ["acoustic"],
    retrievalReasons: ["system context matters"],
    recommendedPromptPath: "review",
    ...overrides,
  };
}

function buildEvent(params: {
  id: string;
  eventType: string;
  outcome: string;
  occurredAt: string;
  tradeHints?: string[];
  systemHints?: string[];
  supportedClaims?: string[];
  evidenceSources?: Array<Record<string, unknown>>;
  userCorrectionSummary?: string | null;
  findingCategory?: string;
  promptPath?: string;
  organizationId?: string;
}) {
  return {
    id: params.id,
    event_type: params.eventType,
    action: params.outcome,
    occurred_at: params.occurredAt,
    project_id: null,
    opportunity_id: null,
    diff_data: {
      outcome: params.outcome,
      findingCategory: params.findingCategory ?? "missing_scope",
      tradeHints: params.tradeHints ?? ["partitions"],
      systemHints: params.systemHints ?? ["acoustic wall"],
      supportedClaims: params.supportedClaims ?? [],
      evidenceSources: params.evidenceSources ?? [],
      evidenceSourceIds: (params.evidenceSources ?? []).map((_, index) => `source-${index + 1}`),
      recommendedPromptPath: params.promptPath ?? "review",
      userCorrectionSummary: params.userCorrectionSummary ?? null,
    } as Json,
  };
}

const memoryItems: AiMemoryItem[] = [
  {
    id: "memory-1",
    memoryCategory: "worksheet_structure",
    memoryType: "pricing_worksheet_layout",
    title: "Partition worksheet layout",
    summary: "This organization typically separates labour rows from material rows.",
    confidenceScore: 0.82,
    derivedFromTotalCount: 6,
    memoryValue: {},
    evidenceSummary: {},
    updatedAt: "2026-05-20T12:00:00.000Z",
    projectId: null,
    opportunityId: null,
  },
];

describe("rankPricingWorksheetOrganizationGuidance", () => {
  it("repeated accepted findings produce stronger organization guidance", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Review this estimate",
      worksheetContext: buildContext(),
      classification: buildClassification(),
      memoryItems: [],
      events: [
        buildEvent({
          id: "e1",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-20T12:00:00.000Z",
          findingCategory: "wastage_risk",
        }),
        buildEvent({
          id: "e2",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-22T12:00:00.000Z",
          findingCategory: "wastage_risk",
        }),
      ],
    });

    expect(result.items[0]?.guidance).toContain("wastage allowances");
  });

  it("repeated rejected assumptions trigger suppression guidance", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Review this acoustic wall estimate",
      worksheetContext: buildContext(),
      classification: buildClassification(),
      memoryItems: [],
      events: [
        buildEvent({
          id: "e1",
          eventType: "worksheet_ai_finding_rejected",
          outcome: "rejected",
          occurredAt: "2026-05-20T12:00:00.000Z",
          userCorrectionSummary: "This wall is not acoustic rated.",
        }),
        buildEvent({
          id: "e2",
          eventType: "worksheet_ai_finding_invalidated",
          outcome: "invalidated",
          occurredAt: "2026-05-22T12:00:00.000Z",
          userCorrectionSummary: "Do not assume acoustic requirements without explicit rating.",
        }),
      ],
    });

    expect(result.suppressionHints[0]).toContain("Avoid assuming acoustic requirements");
  });

  it("one-off rejected finding does not permanently suppress an assumption", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Review this acoustic wall estimate",
      worksheetContext: buildContext(),
      classification: buildClassification(),
      memoryItems: [],
      events: [
        buildEvent({
          id: "e1",
          eventType: "worksheet_ai_finding_rejected",
          outcome: "rejected",
          occurredAt: "2026-05-22T12:00:00.000Z",
          userCorrectionSummary: "This wall is not acoustic rated.",
        }),
      ],
    });

    expect(result.suppressionHints).toEqual([]);
  });

  it("trade and system matching affect ranking relevance", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Review this acoustic wall estimate",
      worksheetContext: buildContext(),
      classification: buildClassification(),
      memoryItems: [],
      events: [
        buildEvent({
          id: "matched",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-22T12:00:00.000Z",
          findingCategory: "labour_risk",
          tradeHints: ["partitions"],
          systemHints: ["acoustic wall"],
        }),
        buildEvent({
          id: "mismatched",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-22T12:00:00.000Z",
          findingCategory: "labour_risk",
          tradeHints: ["roofing"],
          systemHints: ["metal roof"],
        }),
        buildEvent({
          id: "matched2",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-23T12:00:00.000Z",
          findingCategory: "labour_risk",
          tradeHints: ["partitions"],
          systemHints: ["acoustic wall"],
        }),
        buildEvent({
          id: "mismatched2",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-23T12:00:00.000Z",
          findingCategory: "labour_risk",
          tradeHints: ["roofing"],
          systemHints: ["metal roof"],
        }),
      ],
    });

    expect(result.items[0]?.tradeHints).toContain("partitions");
    expect(result.items[0]?.systemHints).toContain("acoustic wall");
  });

  it("recent signals influence ranking", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Review this estimate",
      worksheetContext: buildContext(),
      classification: buildClassification(),
      memoryItems: [],
      events: [
        buildEvent({
          id: "old-1",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2025-01-01T12:00:00.000Z",
          findingCategory: "labour_risk",
        }),
        buildEvent({
          id: "old-2",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2025-01-02T12:00:00.000Z",
          findingCategory: "labour_risk",
        }),
        buildEvent({
          id: "new-1",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-22T12:00:00.000Z",
          findingCategory: "wastage_risk",
        }),
        buildEvent({
          id: "new-2",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-23T12:00:00.000Z",
          findingCategory: "wastage_risk",
        }),
      ],
    });

    expect(result.items[0]?.guidance).toContain("wastage");
  });

  it("evidence-backed accepted findings rank higher than unsupported ones", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Review this estimate",
      worksheetContext: buildContext(),
      classification: buildClassification(),
      memoryItems: [],
      events: [
        buildEvent({
          id: "unsupported-1",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-22T12:00:00.000Z",
          findingCategory: "missing_scope",
        }),
        buildEvent({
          id: "unsupported-2",
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-23T12:00:00.000Z",
          findingCategory: "missing_scope",
        }),
        buildEvent({
          id: "supported-1",
          eventType: "worksheet_ai_finding_confirmed",
          outcome: "confirmed",
          occurredAt: "2026-05-22T12:00:00.000Z",
          findingCategory: "missing_scope",
          evidenceSources: [{ sourceType: "manufacturer" }],
          supportedClaims: ["Perimeter trim may be required for this system."],
        }),
        buildEvent({
          id: "supported-2",
          eventType: "worksheet_ai_finding_confirmed",
          outcome: "confirmed",
          occurredAt: "2026-05-23T12:00:00.000Z",
          findingCategory: "missing_scope",
          evidenceSources: [{ sourceType: "manufacturer" }],
          supportedClaims: ["Perimeter trim may be required for this system."],
        }),
      ],
    });

    expect(result.items[0]?.type).toBe("evidence_preference");
  });

  it("keeps guidance compact and bounded", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Review this estimate",
      worksheetContext: buildContext(),
      classification: buildClassification(),
      memoryItems,
      events: new Array(12).fill(null).map((_, index) =>
        buildEvent({
          id: `e-${index}`,
          eventType: "worksheet_ai_finding_accepted",
          outcome: "accepted",
          occurredAt: "2026-05-23T12:00:00.000Z",
          findingCategory: index % 2 === 0 ? "labour_risk" : "wastage_risk",
        })
      ),
    });

    expect(result.items.length).toBeLessThanOrEqual(6);
    expect(result.summary.length).toBeLessThan(1400);
  });

  it("includes structure memory and avoids cross-organization leakage in output shape", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Review this estimate",
      worksheetContext: buildContext(),
      classification: buildClassification(),
      memoryItems,
      events: [],
    });

    expect(result.items[0]?.type).toBe("worksheet_structure_preference");
    expect(result.summary).toContain("separates labour rows from material rows");
    expect(result.summary).not.toContain("organization-2");
  });

  it("returns a safe empty summary when no organization guidance exists", () => {
    const result = rankPricingWorksheetOrganizationGuidance({
      prompt: "Explain =A4*B4",
      worksheetContext: buildContext(),
      classification: buildClassification({
        primaryIntent: "formula_explain",
        recommendedPromptPath: "answer",
        requiresRetrieval: false,
        riskLevel: "low",
        shouldAskFollowUp: false,
      }),
      memoryItems: [],
      events: [],
    });

    expect(result.items).toEqual([]);
    expect(result.summary).toContain("No strong organization estimating guidance");
  });
});
