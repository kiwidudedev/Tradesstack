import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import {
  buildPricingWorksheetAiEvidenceFeedbackData,
  buildPricingWorksheetAiReviewSignalData,
  buildPricingWorksheetIntelligenceEvent,
} from "./pricing-worksheet-intelligence";
import type { PricingWorksheetConstructionIntent } from "./pricing-worksheet-construction-intent";
import type { PricingWorksheetAiEvidenceSource, PricingWorksheetAiReviewFinding } from "./pricing-worksheet-edit-plan";

const classification: PricingWorksheetConstructionIntent = {
  primaryIntent: "review_estimate",
  defaultJurisdiction: "AUS_NZ",
  requiresConstructionReasoning: true,
  requiresRetrieval: true,
  tradeHints: ["partitions"],
  systemHints: ["acoustic wall"],
  confidence: "medium",
  riskLevel: "high",
  shouldAskFollowUp: true,
  reason: "Review prompt with acoustic system references.",
  matchedIntentSignals: ["review this estimate"],
  matchedTradeSignals: ["partitions"],
  matchedSystemSignals: ["acoustic wall"],
  matchedRiskSignals: ["acoustic"],
  retrievalReasons: ["manufacturer/system context likely needed"],
  recommendedPromptPath: "review",
};

const evidenceSources: PricingWorksheetAiEvidenceSource[] = [
  {
    id: "source-1",
    title: "Rondo acoustic wall system guidance",
    url: "https://example.com/rondo-acoustic",
    sourceType: "manufacturer",
    jurisdiction: "AUS_NZ",
    confidence: "medium",
    supportedClaims: ["Acoustic partitions may require perimeter acoustic sealing."],
  },
];

function buildFinding(overrides: Partial<PricingWorksheetAiReviewFinding> = {}): PricingWorksheetAiReviewFinding {
  return {
    id: "finding-1",
    category: "missing_scope",
    severity: "medium",
    confidence: "medium",
    findingStatus: "active",
    title: "Potential missing acoustic sealant",
    finding: "This appears to be an acoustic partition but no sealant row was found.",
    evidenceSourceIds: ["source-1"],
    ...overrides,
  };
}

describe("buildPricingWorksheetIntelligenceEvent", () => {
  it("builds organization-scoped AI review learning signals without global leakage defaults", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Wall Framing",
      rowCount: 8,
      columnCount: 6,
    });

    const event = buildPricingWorksheetIntelligenceEvent({
      organizationId: "org-123",
      opportunityId: "opp-123",
      entityId: "worksheet-123",
      worksheetName: "Wall Framing",
      tradePackage: "Partitions",
      worksheet,
      eventType: "worksheet_ai_finding_accepted",
      eventFamily: "ai_review",
      action: "accepted",
      diffData: {
        findingId: "finding-1",
        reviewFindingCount: 3,
      },
      reason: "AI worksheet review finding accepted.",
    });

    expect(event.eventType).toBe("worksheet_ai_finding_accepted");
    expect(event.eventFamily).toBe("ai_review");
    expect(event.visibilityScope).toBe("organization");
    expect(event.privacyClassification).toBe("financial_sensitive");
    expect(event.containsFinancialData).toBe(true);
    expect(event.diffData).toEqual({
      findingId: "finding-1",
      reviewFindingCount: 3,
    });
  });

  it("builds negative learning signal data for rejected or invalidated findings", () => {
    const signal = buildPricingWorksheetAiReviewSignalData({
      polarity: "negative",
      weight: -0.7,
      detail: {
        findingId: "finding-1",
      },
    });

    expect(signal).toEqual({
      signalPolarity: "negative",
      signalWeight: -0.7,
      findingId: "finding-1",
    });
  });

  it("builds positive learning signal data for applied edit groups", () => {
    const signal = buildPricingWorksheetAiReviewSignalData({
      polarity: "positive",
      weight: 0.9,
      detail: {
        suggestedEditGroupId: "group-1",
        operationCount: 2,
      },
    });

    expect(signal).toEqual({
      signalPolarity: "positive",
      signalWeight: 0.9,
      suggestedEditGroupId: "group-1",
      operationCount: 2,
    });
  });

  it("records positive evidence feedback when a finding is accepted", () => {
    const finding = buildFinding();
    const signal = buildPricingWorksheetAiEvidenceFeedbackData({
      outcome: "accepted",
      interactionId: "interaction-1",
      finding,
      evidenceSources,
      classification,
    });

    expect(signal.signalPolarity).toBe("positive");
    expect(signal.signalWeight).toBe(0.55);
    expect(signal.outcome).toBe("accepted");
    expect(signal.evidenceSourceIds).toEqual(["source-1"]);
    expect(signal.evidenceSources).toEqual([
      expect.objectContaining({
        id: "source-1",
        title: "Rondo acoustic wall system guidance",
        sourceType: "manufacturer",
      }),
    ]);
    expect(signal.claimFeedback).toEqual([
      expect.objectContaining({
        sourceId: "source-1",
        claim: "Acoustic partitions may require perimeter acoustic sealing.",
      }),
    ]);
    expect(signal.organizationScopedOnly).toBe(true);
    expect(signal.tradeHints).toEqual(["partitions"]);
  });

  it("records negative evidence feedback when a finding is rejected", () => {
    const signal = buildPricingWorksheetAiEvidenceFeedbackData({
      outcome: "rejected",
      interactionId: "interaction-1",
      finding: buildFinding(),
      evidenceSources,
      classification,
      userCorrectionSummary: "This wall is not acoustic rated.",
    });

    expect(signal.signalPolarity).toBe("negative");
    expect(signal.signalWeight).toBe(-0.7);
    expect(signal.userCorrectionSummary).toBe("This wall is not acoustic rated.");
  });

  it("records strong negative evidence feedback when a finding is invalidated", () => {
    const signal = buildPricingWorksheetAiEvidenceFeedbackData({
      outcome: "invalidated",
      interactionId: "interaction-2",
      finding: buildFinding({
        findingStatus: "invalidated",
        confidence: "low",
      }),
      previousFinding: buildFinding({
        confidence: "medium",
      }),
      evidenceSources,
      classification,
      removedSuggestedEditGroupIds: ["group-1"],
    });

    expect(signal.signalPolarity).toBe("negative");
    expect(signal.signalWeight).toBe(-0.9);
    expect(signal.findingConfidenceBefore).toBe("medium");
    expect(signal.findingConfidenceAfter).toBe("low");
    expect(signal.removedSuggestedEditGroupIds).toEqual(["group-1"]);
  });

  it("records strong positive evidence feedback when a suggested edit group is applied", () => {
    const signal = buildPricingWorksheetAiEvidenceFeedbackData({
      outcome: "applied",
      interactionId: "interaction-3",
      evidenceSources,
      evidenceSourceIds: ["source-1"],
      classification,
      affectedFindingIds: ["finding-1"],
      affectedSuggestedEditGroupIds: ["group-1"],
    });

    expect(signal.signalPolarity).toBe("positive");
    expect(signal.signalWeight).toBe(0.9);
    expect(signal.affectedSuggestedEditGroupIds).toEqual(["group-1"]);
    expect(signal.supportedClaims).toEqual([
      "Acoustic partitions may require perimeter acoustic sealing.",
    ]);
  });

  it("records follow-up correction context without marking a source permanently trusted", () => {
    const signal = buildPricingWorksheetAiEvidenceFeedbackData({
      outcome: "revised",
      interactionId: "interaction-4",
      finding: buildFinding({
        findingStatus: "revised",
        confidence: "low",
      }),
      previousFinding: buildFinding({
        confidence: "medium",
      }),
      evidenceSources,
      classification,
      userCorrectionSummary: "This wall is not acoustic rated.",
      removedSuggestedEditGroupIds: ["group-2"],
    });

    expect(signal.signalPolarity).toBe("mixed");
    expect(signal.signalWeight).toBe(-0.35);
    expect(signal.userCorrectionSummary).toBe("This wall is not acoustic rated.");
    expect(signal.contextualEvidenceOnly).toBe(true);
    expect(signal).not.toHaveProperty("trustScore");
    expect(signal).not.toHaveProperty("permanentlyTrusted");
  });

  it("handles missing evidence sources without breaking the payload", () => {
    const signal = buildPricingWorksheetAiEvidenceFeedbackData({
      outcome: "accepted",
      interactionId: "interaction-5",
      finding: buildFinding({
        evidenceSourceIds: [],
      }),
      evidenceSources: [],
      classification,
    });

    expect(signal.evidenceSourceIds).toEqual([]);
    expect(signal.evidenceSources).toEqual([]);
    expect(signal.claimFeedback).toEqual([]);
    expect(signal.supportedClaims).toEqual([]);
  });
});
