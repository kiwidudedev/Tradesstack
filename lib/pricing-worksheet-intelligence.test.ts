import { describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData, normalizeWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import {
  buildWorksheetEditEventSourceRequestId,
  buildWorksheetLearningArtifacts,
  buildPricingWorksheetAiEvidenceFeedbackData,
  buildPricingWorksheetAiReviewSignalData,
  buildPricingWorksheetIntelligenceEvent,
  listWorksheetChangedCellKeys,
  preparePricingWorksheetIntelligenceEventForPersistence,
  stampWorksheetAiProvenance,
  writePricingWorksheetIntelligenceEvents,
} from "./pricing-worksheet-intelligence";
import type { PricingWorksheetConstructionIntent } from "./pricing-worksheet-construction-intent";
import type { PricingWorksheetAiEvidenceSource, PricingWorksheetAiReviewFinding } from "./pricing-worksheet-edit-plan";

function buildWorksheetCell(value: string | number, metadata: Record<string, unknown> = {}) {
  const isNumber = typeof value === "number";

  return {
    value,
    type: isNumber ? "number" : "text",
    formula: typeof value === "string" && value.startsWith("=") ? value : null,
    computedValue: value,
    displayValue: String(value),
    metadata,
  } as const;
}

function buildCorrectionWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Estimate",
    rowCount: 8,
    columnCount: 4,
  });

  worksheet.cells.A1 = buildWorksheetCell("Section");
  worksheet.cells.B1 = buildWorksheetCell("Unit rate");
  worksheet.cells.C1 = buildWorksheetCell("Waste factor");
  worksheet.cells.D1 = buildWorksheetCell("Margin markup");
  worksheet.cells.A2 = buildWorksheetCell("Labour productivity");
  worksheet.cells.A3 = buildWorksheetCell("Total formula");
  worksheet.cells.A4 = buildWorksheetCell("General note");
  worksheet.cells.A5 = buildWorksheetCell("Labour rate");
  worksheet.cells.A6 = buildWorksheetCell("Plain text");

  return worksheet;
}

function buildEvidenceV2Worksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Detailed Estimate",
    rowCount: 12,
    columnCount: 8,
  });

  worksheet.metadata = {
    ...worksheet.metadata,
    workbookName: "School Pricing Workbook",
  };

  worksheet.cells.A1 = buildWorksheetCell("Section");
  worksheet.cells.B1 = buildWorksheetCell("Description");
  worksheet.cells.C1 = buildWorksheetCell("Qty");
  worksheet.cells.D1 = buildWorksheetCell("Unit");
  worksheet.cells.E1 = buildWorksheetCell("Labour Rate");
  worksheet.cells.F1 = buildWorksheetCell("Material Rate");
  worksheet.cells.G1 = buildWorksheetCell("Amount");
  worksheet.cells.H1 = buildWorksheetCell("Notes");

  worksheet.cells.A3 = buildWorksheetCell("Envelope");
  worksheet.cells.A4 = buildWorksheetCell("External Walls");
  worksheet.cells.B5 = buildWorksheetCell("110mm external wall framing with insulation");
  worksheet.cells.C5 = buildWorksheetCell(125);
  worksheet.cells.D5 = buildWorksheetCell("m2");
  worksheet.cells.E5 = buildWorksheetCell(42);
  worksheet.cells.F5 = buildWorksheetCell(58);
  worksheet.cells.G5 = buildWorksheetCell("=C5*(E5+F5)");
  worksheet.cells.H5 = buildWorksheetCell("Include trims and fixings");
  worksheet.cells.B6 = buildWorksheetCell("Sealant");
  worksheet.cells.C6 = buildWorksheetCell(45);
  worksheet.cells.D6 = buildWorksheetCell("lm");
  worksheet.cells.G6 = buildWorksheetCell("=C6*12");

  return worksheet;
}

function buildStableHeaderWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Suspended Ceilings",
    rowCount: 10,
    columnCount: 11,
  });

  worksheet.cells.A1 = buildWorksheetCell("Section");
  worksheet.cells.B1 = buildWorksheetCell("Item");
  worksheet.cells.C1 = buildWorksheetCell("Description");
  worksheet.cells.D1 = buildWorksheetCell("Unit");
  worksheet.cells.E1 = buildWorksheetCell("Quantity");
  worksheet.cells.F1 = buildWorksheetCell("Material Rate");
  worksheet.cells.G1 = buildWorksheetCell("Labour Hours");
  worksheet.cells.H1 = buildWorksheetCell("Labour Rate");
  worksheet.cells.I1 = buildWorksheetCell("Margin");
  worksheet.cells.J1 = buildWorksheetCell("Total");
  worksheet.cells.K1 = buildWorksheetCell("Notes");

  worksheet.cells.A2 = buildWorksheetCell("Inputs");
  worksheet.cells.A3 = buildWorksheetCell("Inputs");
  worksheet.cells.B3 = buildWorksheetCell("Ceiling Area");
  worksheet.cells.C3 = buildWorksheetCell("Total ceiling area to be gridded");
  worksheet.cells.D3 = buildWorksheetCell("m²");
  worksheet.cells.E3 = buildWorksheetCell(100);

  worksheet.cells.A4 = buildWorksheetCell("Inputs");
  worksheet.cells.B4 = buildWorksheetCell("Grid Spacing");
  worksheet.cells.C4 = buildWorksheetCell("Main tee spacing – typically 600mm or 1200mm");
  worksheet.cells.D4 = buildWorksheetCell("mm");
  worksheet.cells.E4 = buildWorksheetCell(600);

  worksheet.cells.A5 = buildWorksheetCell("Inputs");
  worksheet.cells.B5 = buildWorksheetCell("Cross Tee Spacing");
  worksheet.cells.C5 = buildWorksheetCell("Cross tee spacing – typically 600mm");
  worksheet.cells.D5 = buildWorksheetCell("mm");
  worksheet.cells.E5 = buildWorksheetCell(1200);

  worksheet.cells.A6 = buildWorksheetCell("Inputs");
  worksheet.cells.B6 = buildWorksheetCell("Perimeter Waste Factor");
  worksheet.cells.C6 = buildWorksheetCell("Waste allowance for cutting and perimeter");
  worksheet.cells.D6 = buildWorksheetCell("%");
  worksheet.cells.E6 = buildWorksheetCell(12.5);

  worksheet.cells.A8 = buildWorksheetCell("Component Quantities");
  worksheet.cells.B8 = buildWorksheetCell("Main Tees (3600mm)");
  worksheet.cells.C8 = buildWorksheetCell("Rondo DONN 24mm main tee – qty based on grid spacing and area");
  worksheet.cells.D8 = buildWorksheetCell("lm");
  worksheet.cells.E8 = buildWorksheetCell("=IFERROR(ROUNDUP((E3/(E4/1000))*(1+(E6/100)),1),\"\")");
  worksheet.cells.K8 = buildWorksheetCell("ceiling area divided by (grid spacing in m) then multiply by waste factor");

  return worksheet;
}

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
      workbookId: "workbook-123",
      sheetId: "sheet-123",
      sheetName: "Wall Framing",
      worksheetId: "workbook-123",
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
    expect(event.entityType).toBe("pricing_worksheet_page");
    expect(event.entityId).toBe("sheet-123");
    expect(event.parentEntityType).toBe("pricing_workbook");
    expect(event.parentEntityId).toBe("workbook-123");
    expect(event.visibilityScope).toBe("organization");
    expect(event.privacyClassification).toBe("financial_sensitive");
    expect(event.containsFinancialData).toBe(true);
    expect(event.diffData).toEqual({
      findingId: "finding-1",
      reviewFindingCount: 3,
    });
    expect(event.metadata).toMatchObject({
      workbookId: "workbook-123",
      worksheetId: "workbook-123",
      sheetId: "sheet-123",
      sheetName: "Wall Framing",
      worksheetName: "Wall Framing",
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

describe("worksheet learning artifacts", () => {
  it("classifies formula edits and extracts references", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Rates",
      rowCount: 6,
      columnCount: 4,
    });
    previousWorksheet.cells.A1 = {
      value: "Description",
      type: "text",
      formula: null,
      computedValue: "Description",
      displayValue: "Description",
      metadata: {},
    };
    previousWorksheet.cells.B1 = {
      value: "Unit rate",
      type: "text",
      formula: null,
      computedValue: "Unit rate",
      displayValue: "Unit rate",
      metadata: {},
    };
    previousWorksheet.cells.B2 = {
      value: "=A2*2",
      type: "text",
      formula: "=A2*2",
      computedValue: "=A2*2",
      displayValue: "=A2*2",
      metadata: {},
    };

    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.B2 = {
      ...nextWorksheet.cells.B2!,
      value: "=A2*3",
      formula: "=A2*3",
      computedValue: "=A2*3",
      displayValue: "=A2*3",
    };

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Rates",
      tradePackage: "Partitions",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      clientMutationId: "mutation-persist",
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    expect(artifacts.intelligenceEvents).toHaveLength(1);
    expect(artifacts.intelligenceEvents[0]?.eventType).toBe("worksheet_formula_edited");
    expect(artifacts.intelligenceEvents[0]?.diffData).toMatchObject({
      classificationStatus: "pending",
      rawContextVersion: 1,
      eventCaptureVersion: 1,
      contextCaptureSource: "worksheet_event_capture",
      cell: "B2",
      columnHeader: "Unit rate",
      nearbyHeaders: ["Description", "Unit rate"],
      oldFormula: "=A2*2",
      newFormula: "=A2*3",
      formula: "=A2*3",
      formulaReferences: ["A2"],
      changedCellCount: 1,
    });
    expect(Array.isArray(artifacts.intelligenceEvents[0]?.diffData.nearbyRows)).toBe(true);
    expect((artifacts.intelligenceEvents[0]?.diffData.nearbyRows as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it("writes AI correction intelligence and correction payloads for AI-generated cells", () => {
    const previousWorksheet = buildCorrectionWorksheet();
    previousWorksheet.cells.B2 = buildWorksheetCell(120);
    const aiWorksheet = stampWorksheetAiProvenance({
      worksheet: previousWorksheet,
      changedCellKeys: ["B2"],
      aiInteractionId: "ai-1",
      generatedAt: "2026-05-30T00:00:00.000Z",
      aiJobId: "job-1",
      operationType: "update_cell",
      promptSummary: "Review labour rate",
      sourcePromptHash: "hash-1",
    });
    const nextWorksheet = normalizeWorksheetData(aiWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.B2 = {
      ...nextWorksheet.cells.B2!,
      value: 135,
      computedValue: 135,
      displayValue: "135",
    };

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      tradePackage: "Partitions",
      source: "manual",
      previousWorksheet: aiWorksheet,
      nextWorksheet,
      clientMutationId: "mutation-ai-correction",
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    expect(artifacts.intelligenceEvents).toHaveLength(1);
    expect(artifacts.intelligenceEvents[0]?.eventType).toBe("worksheet_ai_rate_corrected");
    expect(artifacts.intelligenceEvents[0]?.diffData).toMatchObject({
      classificationStatus: "pending",
      generatedByAi: true,
      generatedAt: "2026-05-30T00:00:00.000Z",
      correctedAt: "2026-05-31T00:00:00.000Z",
      lastCorrectedAt: "2026-05-31T00:00:00.000Z",
      correctedByUserId: "user-1",
      correctionWindowSeconds: 86400,
      aiJobId: "job-1",
      operationType: "update_cell",
      generationBatchId: null,
      originalAiValue: 120,
      promptSummary: "Review labour rate",
      sourcePromptHash: "hash-1",
      columnHeader: "Unit rate",
      nearbyHeaders: ["Section", "Unit rate", "Waste factor", "Margin markup"],
      oldValue: 120,
      newValue: 135,
    });
    expect(Array.isArray(artifacts.intelligenceEvents[0]?.diffData.nearbyRows)).toBe(true);
    expect((artifacts.intelligenceEvents[0]?.diffData.nearbyRows as unknown[]).length).toBeGreaterThan(0);
    expect(artifacts.correctionEvents).toHaveLength(1);
    expect(artifacts.correctionEvents[0]).toMatchObject({
      linkedAiInteractionId: "ai-1",
      feedbackLabel: "worksheet_ai_rate_corrected",
      targetEntityId: "B2",
      correctedValue: 135,
    });
    expect(artifacts.worksheet.cells.B2?.metadata).toMatchObject({
      generatedByAi: true,
      aiInteractionId: "ai-1",
      lastCorrectedAt: "2026-05-31T00:00:00.000Z",
      correctedByUserId: "user-1",
    });
  });

  it("classifies AI-generated formula corrections with originalAiFormula and newFormula", () => {
    const previousWorksheet = buildCorrectionWorksheet();
    previousWorksheet.cells.B3 = buildWorksheetCell("=B2*2");

    const aiWorksheet = stampWorksheetAiProvenance({
      worksheet: previousWorksheet,
      changedCellKeys: ["B3"],
      aiInteractionId: "ai-formula",
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    const nextWorksheet = normalizeWorksheetData(aiWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.B3 = buildWorksheetCell("=B2*3", nextWorksheet.cells.B3?.metadata as Record<string, unknown>);

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      tradePackage: "Partitions",
      source: "manual",
      previousWorksheet: aiWorksheet,
      nextWorksheet,
      occurredAt: "2026-05-31T01:00:00.000Z",
    });

    expect(artifacts.intelligenceEvents[0]?.eventType).toBe("worksheet_ai_formula_corrected");
    expect(artifacts.intelligenceEvents[0]?.diffData).toMatchObject({
      classificationStatus: "pending",
      originalAiFormula: "=B2*2",
      formula: "=B2*3",
      oldFormula: "=B2*2",
      newFormula: "=B2*3",
      correctedAt: "2026-05-31T01:00:00.000Z",
    });
  });

  it("classifies waste and markup corrections as AI assumption corrections", () => {
    const previousWorksheet = buildCorrectionWorksheet();
    previousWorksheet.cells.C2 = buildWorksheetCell(0.1);
    previousWorksheet.cells.D2 = buildWorksheetCell(0.15);

    const aiWorksheet = stampWorksheetAiProvenance({
      worksheet: previousWorksheet,
      changedCellKeys: ["C2", "D2"],
      aiInteractionId: "ai-assumption",
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    const nextWorksheet = normalizeWorksheetData(aiWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.C2 = buildWorksheetCell(0.12, nextWorksheet.cells.C2?.metadata as Record<string, unknown>);
    nextWorksheet.cells.D2 = buildWorksheetCell(0.18, nextWorksheet.cells.D2?.metadata as Record<string, unknown>);

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      tradePackage: "Partitions",
      source: "manual",
      previousWorksheet: aiWorksheet,
      nextWorksheet,
      occurredAt: "2026-05-31T00:30:00.000Z",
    });

    expect(artifacts.intelligenceEvents).toHaveLength(1);
    expect(artifacts.intelligenceEvents[0]?.eventType).toBe("worksheet_ai_assumption_corrected");
    expect(artifacts.intelligenceEvents[0]?.metadata).toMatchObject({
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
    });
    expect(artifacts.intelligenceEvents[0]?.diffData).toMatchObject({
      classificationStatus: "pending",
      changedCellCount: 2,
      generatedByAi: true,
    });
  });

  it("classifies labour productivity corrections by context", () => {
    const previousWorksheet = buildCorrectionWorksheet();
    previousWorksheet.cells.C2 = buildWorksheetCell(0.85);
    previousWorksheet.cells.B5 = buildWorksheetCell(55);

    const aiWorksheet = stampWorksheetAiProvenance({
      worksheet: previousWorksheet,
      changedCellKeys: ["C2", "B5"],
      aiInteractionId: "ai-context",
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    const nextWorksheet = normalizeWorksheetData(aiWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.C2 = buildWorksheetCell(0.95, nextWorksheet.cells.C2?.metadata as Record<string, unknown>);
    nextWorksheet.cells.B5 = buildWorksheetCell(60, nextWorksheet.cells.B5?.metadata as Record<string, unknown>);

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      tradePackage: "Partitions",
      source: "manual",
      previousWorksheet: aiWorksheet,
      nextWorksheet,
      occurredAt: "2026-05-31T00:20:00.000Z",
    });

    const eventTypes = artifacts.intelligenceEvents.map((event) => event.eventType).sort();
    expect(eventTypes).toEqual([
      "worksheet_ai_assumption_corrected",
      "worksheet_ai_rate_corrected",
    ]);
  });

  it("falls back to generic manual edits for old cells without provenance", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Plain sheet",
      rowCount: 4,
      columnCount: 4,
    });
    previousWorksheet.cells.A1 = buildWorksheetCell("Alpha");
    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.A1 = buildWorksheetCell("Beta");

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Plain sheet",
      tradePackage: null,
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      clientMutationId: "mutation-persist",
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    expect(artifacts.intelligenceEvents).toHaveLength(1);
    expect(artifacts.intelligenceEvents[0]?.eventType).toBe("worksheet_cell_edited");
    expect(artifacts.intelligenceEvents[0]?.diffData).toMatchObject({
      classificationStatus: "pending",
      rawContextVersion: 1,
      contextCaptureSource: "worksheet_event_capture",
    });
    expect(artifacts.correctionEvents).toEqual([]);
  });

  it("aggregates bulk changes and caps samples", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Estimate",
      rowCount: 20,
      columnCount: 4,
    });
    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);

    for (let index = 1; index <= 12; index += 1) {
      nextWorksheet.cells[`A${index}`] = {
        value: `Value ${index}`,
        type: "text",
        formula: null,
        computedValue: `Value ${index}`,
        displayValue: `Value ${index}`,
        metadata: {},
      };
    }

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      tradePackage: null,
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    expect(artifacts.intelligenceEvents).toHaveLength(1);
    expect(artifacts.intelligenceEvents[0]?.diffData).toMatchObject({
      classificationStatus: "pending",
      changedCellCount: 12,
      truncated: true,
    });
    expect(Array.isArray(artifacts.intelligenceEvents[0]?.diffData.sampleChanges)).toBe(true);
    expect((artifacts.intelligenceEvents[0]?.diffData.sampleChanges as unknown[])).toHaveLength(10);
    expect(artifacts.intelligenceEvents[0]?.beforeData).toBeNull();
    expect(artifacts.intelligenceEvents[0]?.afterData).toBeNull();
  });

  it("captures nearby context compactly and caps it around the edited cell", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Estimate",
      rowCount: 12,
      columnCount: 6,
    });
    previousWorksheet.cells.A1 = buildWorksheetCell("Description");
    previousWorksheet.cells.B1 = buildWorksheetCell("Qty");
    previousWorksheet.cells.C1 = buildWorksheetCell("Rate");
    previousWorksheet.cells.D1 = buildWorksheetCell("Unit");
    previousWorksheet.cells.E1 = buildWorksheetCell("Total");
    previousWorksheet.cells.A4 = buildWorksheetCell("Stud wall");
    previousWorksheet.cells.D4 = buildWorksheetCell("m2");
    previousWorksheet.cells.A5 = buildWorksheetCell("Insulation");
    previousWorksheet.cells.D5 = buildWorksheetCell("m2");
    previousWorksheet.cells.A6 = buildWorksheetCell("Ceiling tile");
    previousWorksheet.cells.D6 = buildWorksheetCell("m2");
    previousWorksheet.cells.A7 = buildWorksheetCell("Paint");
    previousWorksheet.cells.D7 = buildWorksheetCell("m2");
    previousWorksheet.cells.A8 = buildWorksheetCell("Skirting");
    previousWorksheet.cells.D8 = buildWorksheetCell("lm");
    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.C6 = buildWorksheetCell(42);

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      tradePackage: null,
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    expect(artifacts.intelligenceEvents).toHaveLength(1);
    expect(artifacts.intelligenceEvents[0]?.diffData).toMatchObject({
      columnHeader: "Rate",
      nearbyHeaders: ["Description", "Qty", "Rate", "Unit", "Total"],
    });
    expect((artifacts.intelligenceEvents[0]?.diffData.nearbyRows as unknown[])).toHaveLength(5);
  });

  it("captures evidence v2 row snapshots, structure context, and pricing tuple siblings", () => {
    const previousWorksheet = buildEvidenceV2Worksheet();
    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.F5 = buildWorksheetCell(60);
    nextWorksheet.cells.G5 = buildWorksheetCell("=C5*(E5+F5)");

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      workbookName: "School Pricing Workbook",
      sheetId: "sheet-1",
      sheetName: "Detailed Estimate",
      worksheetName: "External Wall Pricing",
      tradePackage: "Envelope",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    const diffData = artifacts.intelligenceEvents[0]?.diffData as Record<string, unknown>;
    expect(diffData).toMatchObject({
      workbookId: "workbook-1",
      workbookName: "School Pricing Workbook",
      worksheetName: "External Wall Pricing",
      sheetName: "Detailed Estimate",
      evidenceSchemaVersion: 2,
      cellAddress: "F5",
      rowIndex: 4,
      columnId: "F",
      columnHeader: "Material Rate",
      columnRole: "material",
      sectionLabel: "Envelope",
      subsectionLabel: "External Walls",
      sectionPath: ["Envelope", "External Walls"],
      labelExtractionMode: "heuristic_first_text_cells",
      sectionInferenceMode: "heuristic_upward_scan",
    });
    expect(diffData.captureCompletenessScore).toEqual(expect.any(Number));
    expect(diffData.rowSnapshotCompleteness).toEqual(expect.any(Number));
    expect(diffData.rowSnapshotAfter).toMatchObject({
      row: 5,
      rowIndex: 4,
      rowLabel: "110mm external wall framing with insulation",
      itemLabel: "m2",
    });
    expect((diffData.rowSnapshotVisibleCells as Array<Record<string, unknown>>).map((cell) => cell.header)).toEqual([
      "Description",
      "Qty",
      "Unit",
      "Labour Rate",
      "Material Rate",
      "Amount",
      "Notes",
    ]);
    expect((diffData.rowSnapshotVisibleCells as Array<Record<string, unknown>>).map((cell) => cell.displayValue)).toContain(
      "Include trims and fixings",
    );
    expect(diffData.pricingTuple).toMatchObject({
      quantity: { cell: "C5", header: "Qty", value: 125, columnRole: "quantity" },
      rate: { cell: "E5", header: "Labour Rate", value: 42, columnRole: "labour" },
      amount: { cell: "G5", header: "Amount", formula: "=C5*(E5+F5)", columnRole: "amount" },
      unit: { cell: "D5", header: "Unit", value: "m2", columnRole: "unit" },
      labour: { cell: "E5", header: "Labour Rate", value: 42, columnRole: "labour" },
      material: { cell: "F5", header: "Material Rate", value: 60, columnRole: "material" },
    });
  });

  it("captures referenced cell snapshots for formula edits", () => {
    const previousWorksheet = buildEvidenceV2Worksheet();
    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.G5 = buildWorksheetCell("=C5*(E5+F5)+G6");

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      workbookName: "School Pricing Workbook",
      sheetId: "sheet-1",
      sheetName: "Detailed Estimate",
      worksheetName: "External Wall Pricing",
      tradePackage: "Envelope",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    const diffData = artifacts.intelligenceEvents[0]?.diffData as Record<string, unknown>;
    expect(diffData.formulaReferences).toEqual(["C5", "E5", "F5", "G6"]);
    expect(diffData.referencedCellsSnapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: "C5",
          rowLabel: "110mm external wall framing with insulation",
          columnHeader: "Qty",
          value: 125,
        }),
        expect.objectContaining({
          ref: "G6",
          rowLabel: "Sealant",
          columnHeader: "Amount",
          formula: "=C6*12",
        }),
      ]),
    );
  });

  it("uses stable worksheet headers for row snapshots, nearby rows, and pricing tuple extraction", () => {
    const previousWorksheet = buildStableHeaderWorksheet();
    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.E4 = buildWorksheetCell(1200);

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      workbookName: "Suspended Ceilings",
      sheetId: "sheet-1",
      sheetName: "Suspended Ceilings",
      tradePackage: null,
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      occurredAt: "2026-06-03T08:33:05.621Z",
    });

    const diffData = artifacts.intelligenceEvents[0]?.diffData as Record<string, unknown>;
    expect(diffData.columnHeader).toBe("Quantity");
    expect(diffData.nearbyHeaders).toEqual([
      "Description",
      "Unit",
      "Quantity",
      "Material Rate",
      "Labour Hours",
    ]);
    expect(diffData.rowSnapshotAfter).toMatchObject({
      row: 4,
      rowIndex: 3,
      rowLabel: "Inputs",
      itemLabel: "Grid Spacing",
      unit: "mm",
    });
    expect((diffData.rowSnapshotVisibleCells as Array<Record<string, unknown>>).map((cell) => cell.header)).toEqual([
      "Section",
      "Item",
      "Description",
      "Unit",
      "Quantity",
    ]);
    expect(diffData.pricingTuple).toMatchObject({
      quantity: { cell: "E4", header: "Quantity", value: 1200, columnRole: "quantity" },
      unit: { cell: "D4", header: "Unit", value: "mm", columnRole: "unit" },
      rate: null,
      amount: null,
    });

    const nearbyRows = diffData.nearbyRows as Array<Record<string, unknown>>;
    const row4 = nearbyRows.find((row) => row.row === 4) as Record<string, unknown> | undefined;
    expect((row4?.visibleCells as Array<Record<string, unknown>>).map((cell) => cell.header)).toEqual([
      "Description",
      "Unit",
      "Quantity",
    ]);
  });

  it("uses stable worksheet headers for referenced cell snapshots instead of previous populated rows", () => {
    const previousWorksheet = buildStableHeaderWorksheet();
    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.E8 = buildWorksheetCell("=IFERROR(ROUNDUP((E3/(E4/1000))*(1+(E6/100)),0),\"\")");

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      workbookName: "Suspended Ceilings",
      sheetId: "sheet-1",
      sheetName: "Suspended Ceilings",
      tradePackage: null,
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      occurredAt: "2026-06-03T08:33:05.621Z",
    });

    const diffData = artifacts.intelligenceEvents[0]?.diffData as Record<string, unknown>;
    expect(diffData.columnHeader).toBe("Quantity");
    expect(diffData.formulaReferences).toEqual(["E3", "E4", "E6"]);
    expect(diffData.referencedCellsSnapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: "E3",
          columnHeader: "Quantity",
          value: 100,
        }),
        expect.objectContaining({
          ref: "E4",
          columnHeader: "Quantity",
          value: 600,
          referencedCells: expect.arrayContaining([
            expect.objectContaining({
              cell: "E4",
              columnHeader: "Quantity",
            }),
          ]),
        }),
      ]),
    );
  });

  it("captures full changed-row context on wide worksheets beyond the nearby window", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Wide Sheet",
      rowCount: 8,
      columnCount: 10,
    });
    previousWorksheet.cells.A1 = buildWorksheetCell("Section");
    previousWorksheet.cells.B1 = buildWorksheetCell("Description");
    previousWorksheet.cells.C1 = buildWorksheetCell("Qty");
    previousWorksheet.cells.D1 = buildWorksheetCell("Unit");
    previousWorksheet.cells.E1 = buildWorksheetCell("Rate");
    previousWorksheet.cells.F1 = buildWorksheetCell("Amount");
    previousWorksheet.cells.G1 = buildWorksheetCell("Alt 1");
    previousWorksheet.cells.H1 = buildWorksheetCell("Alt 2");
    previousWorksheet.cells.I1 = buildWorksheetCell("Procurement Note");
    previousWorksheet.cells.J1 = buildWorksheetCell("Review Note");
    previousWorksheet.cells.A3 = buildWorksheetCell("Services");
    previousWorksheet.cells.B4 = buildWorksheetCell("Mechanical plant allowance");
    previousWorksheet.cells.C4 = buildWorksheetCell(1);
    previousWorksheet.cells.D4 = buildWorksheetCell("ea");
    previousWorksheet.cells.E4 = buildWorksheetCell(25000);
    previousWorksheet.cells.F4 = buildWorksheetCell("=C4*E4");
    previousWorksheet.cells.I4 = buildWorksheetCell("Obtain supplier quote before submission");
    previousWorksheet.cells.J4 = buildWorksheetCell("Confirm crane access");

    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.J4 = buildWorksheetCell("Confirm crane access and lead times");

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Wide Sheet",
      worksheetName: "Wide Sheet",
      tradePackage: "Services",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
    });

    const visibleCells = (artifacts.intelligenceEvents[0]?.diffData?.rowSnapshotVisibleCells as Array<Record<string, unknown>>) ?? [];
    expect(visibleCells.map((cell) => cell.header)).toContain("Procurement Note");
    expect(visibleCells.map((cell) => cell.header)).toContain("Review Note");
    expect(visibleCells.map((cell) => cell.displayValue)).toContain("Obtain supplier quote before submission");
  });

  it("handles sparse rows and preserves v2 sample row snapshots for grouped edits", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Sparse Sheet",
      rowCount: 8,
      columnCount: 6,
    });
    previousWorksheet.cells.A1 = buildWorksheetCell("Section");
    previousWorksheet.cells.B1 = buildWorksheetCell("Description");
    previousWorksheet.cells.C1 = buildWorksheetCell("Qty");
    previousWorksheet.cells.D1 = buildWorksheetCell("Unit");
    previousWorksheet.cells.E1 = buildWorksheetCell("Waste");
    previousWorksheet.cells.F1 = buildWorksheetCell("Amount");
    previousWorksheet.cells.A3 = buildWorksheetCell("Preliminaries");
    previousWorksheet.cells.B5 = buildWorksheetCell("Site establishment");
    previousWorksheet.cells.E5 = buildWorksheetCell(0.1);
    previousWorksheet.cells.F5 = buildWorksheetCell("=E5*1000");
    previousWorksheet.cells.B6 = buildWorksheetCell("Site fencing");
    previousWorksheet.cells.E6 = buildWorksheetCell(0.05);

    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.E5 = buildWorksheetCell(0.12);
    nextWorksheet.cells.E6 = buildWorksheetCell(0.08);

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Sparse Sheet",
      worksheetName: "Sparse Sheet",
      tradePackage: null,
      source: "manual",
      previousWorksheet,
      nextWorksheet,
    });

    const diffData = artifacts.intelligenceEvents[0]?.diffData as Record<string, unknown>;
    expect(diffData.changedCellCount).toBe(2);
    expect(diffData.sampleChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceSchemaVersion: 2,
          rowSnapshotAfter: expect.objectContaining({
            visibleCells: expect.any(Array),
          }),
        }),
      ]),
    );
  });

  it("can include metadata changes when detecting AI provenance stamping", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Estimate",
      rowCount: 4,
      columnCount: 4,
    });
    previousWorksheet.cells.A1 = {
      value: 100,
      type: "number",
      formula: null,
      computedValue: 100,
      displayValue: "100",
      metadata: {},
    };

    const nextWorksheet = stampWorksheetAiProvenance({
      worksheet: previousWorksheet,
      changedCellKeys: ["A1"],
      aiInteractionId: "ai-2",
      generatedAt: "2026-05-31T00:00:00.000Z",
    });

    expect(listWorksheetChangedCellKeys({
      previousWorksheet,
      nextWorksheet,
    })).toEqual([]);
    expect(listWorksheetChangedCellKeys({
      previousWorksheet,
      nextWorksheet,
      includeMetadata: true,
    })).toEqual(["A1"]);
  });

  it("reuses the same event replay key when the same mutation is replayed", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Estimate",
      rowCount: 8,
      columnCount: 6,
    });
    previousWorksheet.cells.A1 = buildWorksheetCell("Section");
    previousWorksheet.cells.B1 = buildWorksheetCell("Description");
    previousWorksheet.cells.C1 = buildWorksheetCell("Waste factor");
    previousWorksheet.cells.B6 = buildWorksheetCell("Post Embedment Depth");
    previousWorksheet.cells.C6 = buildWorksheetCell(1.2);

    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.C6 = buildWorksheetCell(1.5);

    const clientMutationId = "mutation-1";
    const firstArtifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetName: "Estimate",
      tradePackage: "Foundations",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      clientMutationId,
    });
    const secondArtifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetName: "Estimate",
      tradePackage: "Foundations",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      clientMutationId,
    });

    expect(firstArtifacts.intelligenceEvents).toHaveLength(1);
    expect(firstArtifacts.intelligenceEvents[0]?.sourceRequestId).toBe(
      buildWorksheetEditEventSourceRequestId({
        clientMutationId,
        eventType: "worksheet_assumption_changed",
      }),
    );
    expect(secondArtifacts.intelligenceEvents[0]?.sourceRequestId).toBe(
      firstArtifacts.intelligenceEvents[0]?.sourceRequestId,
    );
  });

  it("assigns unique event replay keys to grouped edit events from one mutation", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Grouped Edit Estimate",
      rowCount: 8,
      columnCount: 5,
    });
    previousWorksheet.cells.A1 = buildWorksheetCell("Description");
    previousWorksheet.cells.B1 = buildWorksheetCell("Labour Rate");
    previousWorksheet.cells.C1 = buildWorksheetCell("Total");
    previousWorksheet.cells.D1 = buildWorksheetCell("Waste factor");
    previousWorksheet.cells.E1 = buildWorksheetCell("Client code");
    previousWorksheet.cells.A2 = buildWorksheetCell("Partition line");
    previousWorksheet.cells.B2 = buildWorksheetCell(100);
    previousWorksheet.cells.C2 = buildWorksheetCell("=B2*2");
    previousWorksheet.cells.D2 = buildWorksheetCell(0.1);
    previousWorksheet.cells.E2 = buildWorksheetCell("A-100");

    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.B2 = buildWorksheetCell(120);
    nextWorksheet.cells.C2 = buildWorksheetCell("=B2*3");
    nextWorksheet.cells.D2 = buildWorksheetCell(0.15);
    nextWorksheet.cells.E2 = buildWorksheetCell("A-200");

    const clientMutationId = "mutation-grouped";
    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Grouped Edit Estimate",
      worksheetName: "Grouped Edit Estimate",
      tradePackage: "Partitions",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      clientMutationId,
    });

    const sourceRequestIds = artifacts.intelligenceEvents.map((event) => event.sourceRequestId);
    expect(artifacts.intelligenceEvents.map((event) => event.eventType).sort()).toEqual([
      "worksheet_assumption_changed",
      "worksheet_cell_edited",
      "worksheet_formula_edited",
      "worksheet_rate_changed",
    ]);
    expect(new Set(sourceRequestIds).size).toBe(4);
    expect(sourceRequestIds.every((value) => typeof value === "string" && value.includes(clientMutationId))).toBe(true);
    expect(
      artifacts.intelligenceEvents.every(
        (event) => (event.diffData as Record<string, unknown>).clientMutationId === clientMutationId,
      ),
    ).toBe(true);
    expect(
      artifacts.intelligenceEvents.every(
        (event) => (event.diffData as Record<string, unknown>).classificationStatus === "pending",
      ),
    ).toBe(true);
  });

  it("creates a new replay key for a later genuine edit to the same cell", () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Estimate",
      rowCount: 8,
      columnCount: 4,
    });
    previousWorksheet.cells.A1 = buildWorksheetCell("Description");
    previousWorksheet.cells.B1 = buildWorksheetCell("Waste factor");
    previousWorksheet.cells.A2 = buildWorksheetCell("Base item");
    previousWorksheet.cells.B2 = buildWorksheetCell(1.1);

    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.B2 = buildWorksheetCell(1.25);

    const firstArtifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetName: "Estimate",
      tradePackage: "Foundations",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      clientMutationId: "mutation-a",
    });
    const secondArtifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetName: "Estimate",
      tradePackage: "Foundations",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      clientMutationId: "mutation-b",
    });

    expect(firstArtifacts.intelligenceEvents[0]?.sourceRequestId).not.toBe(
      secondArtifacts.intelligenceEvents[0]?.sourceRequestId,
    );
  });

  it("treats undo and redo as separate mutation ids when building replay keys", () => {
    const originalWorksheet = createDefaultWorksheetData({
      sheetName: "Estimate",
      rowCount: 8,
      columnCount: 4,
    });
    originalWorksheet.cells.A1 = buildWorksheetCell("Description");
    originalWorksheet.cells.B1 = buildWorksheetCell("Waste factor");
    originalWorksheet.cells.A2 = buildWorksheetCell("Base item");
    originalWorksheet.cells.B2 = buildWorksheetCell(1.1);

    const editedWorksheet = normalizeWorksheetData(originalWorksheet as unknown as Record<string, unknown>);
    editedWorksheet.cells.B2 = buildWorksheetCell(1.25);

    const undoArtifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetName: "Estimate",
      tradePackage: "Foundations",
      source: "manual",
      previousWorksheet: editedWorksheet,
      nextWorksheet: originalWorksheet,
      clientMutationId: "mutation-undo",
    });
    const redoArtifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetName: "Estimate",
      tradePackage: "Foundations",
      source: "manual",
      previousWorksheet: originalWorksheet,
      nextWorksheet: editedWorksheet,
      clientMutationId: "mutation-redo",
    });

    expect(undoArtifacts.intelligenceEvents[0]?.sourceRequestId).not.toBe(
      redoArtifacts.intelligenceEvents[0]?.sourceRequestId,
    );
  });
});

describe("worksheet learning persistence payloads", () => {
  it("persists Phase 1.2 raw context for manual worksheet assumption events", async () => {
    const previousWorksheet = createDefaultWorksheetData({
      sheetName: "Estimate",
      rowCount: 8,
      columnCount: 6,
    });
    previousWorksheet.cells.A1 = buildWorksheetCell("Section");
    previousWorksheet.cells.B1 = buildWorksheetCell("Description");
    previousWorksheet.cells.C1 = buildWorksheetCell("Qty");
    previousWorksheet.cells.D1 = buildWorksheetCell("Unit");
    previousWorksheet.cells.E1 = buildWorksheetCell("Waste factor");
    previousWorksheet.cells.F1 = buildWorksheetCell("Total");
    previousWorksheet.cells.A6 = buildWorksheetCell("1. Inputs & Assumptions");
    previousWorksheet.cells.B6 = buildWorksheetCell("Post Embedment Depth");
    previousWorksheet.cells.D6 = buildWorksheetCell("m");
    const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.E6 = buildWorksheetCell(1.5);

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetName: "Estimate",
      tradePackage: "Foundations",
      source: "manual",
      previousWorksheet,
      nextWorksheet,
      clientMutationId: "mutation-persist",
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    expect(artifacts.intelligenceEvents[0]?.eventType).toBe("worksheet_assumption_changed");

    const rpc = vi.fn(async () => ({ error: null }));
    await writePricingWorksheetIntelligenceEvents({ rpc } as never, artifacts.intelligenceEvents);

    expect(rpc).toHaveBeenCalledTimes(1);
    const persistedPayload = rpc.mock.calls[0]?.[1]?.p_events?.[0];
    expect(persistedPayload?.eventType).toBe("worksheet_assumption_changed");
    expect(persistedPayload?.diffData).toMatchObject({
      classificationStatus: "pending",
      rawContextVersion: 1,
      eventCaptureVersion: 1,
      contextCaptureSource: "worksheet_event_capture",
      columnHeader: "Waste factor",
    });
    expect(Array.isArray(persistedPayload?.diffData?.nearbyHeaders)).toBe(true);
    expect(persistedPayload?.diffData?.nearbyHeaders).toContain("Waste factor");
    expect(Array.isArray(persistedPayload?.diffData?.nearbyRows)).toBe(true);
    expect((persistedPayload?.diffData?.nearbyRows as unknown[])?.length).toBeGreaterThan(0);
    expect((persistedPayload?.diffData?.nearbyRows as unknown[])?.length).toBeLessThanOrEqual(5);
    expect(persistedPayload?.diffData?.beforeData).toBeUndefined();
    expect(persistedPayload?.diffData?.afterData).toBeUndefined();
    expect(persistedPayload?.sourceRequestId).toBe(
      buildWorksheetEditEventSourceRequestId({
        clientMutationId: "mutation-persist",
        eventType: "worksheet_assumption_changed",
      }),
    );
    expect(persistedPayload?.diffData?.clientMutationId).toBe("mutation-persist");
  });

  it("persists Phase 1.2 raw context for AI correction events alongside provenance", async () => {
    const previousWorksheet = buildCorrectionWorksheet();
    previousWorksheet.cells.B2 = buildWorksheetCell(120);
    const aiWorksheet = stampWorksheetAiProvenance({
      worksheet: previousWorksheet,
      changedCellKeys: ["B2"],
      aiInteractionId: "ai-1",
      generatedAt: "2026-05-30T00:00:00.000Z",
      aiJobId: "job-1",
      operationType: "update_cell",
      promptSummary: "Review labour rate",
      sourcePromptHash: "hash-1",
    });
    const nextWorksheet = normalizeWorksheetData(aiWorksheet as unknown as Record<string, unknown>);
    nextWorksheet.cells.B2 = {
      ...nextWorksheet.cells.B2!,
      value: 135,
      computedValue: 135,
      displayValue: "135",
    };

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetName: "Estimate",
      tradePackage: "Partitions",
      source: "manual",
      previousWorksheet: aiWorksheet,
      nextWorksheet,
      clientMutationId: "mutation-ai-correction",
      occurredAt: "2026-05-31T00:00:00.000Z",
    });

    const rpc = vi.fn(async () => ({ error: null }));
    await writePricingWorksheetIntelligenceEvents({ rpc } as never, artifacts.intelligenceEvents);

    expect(rpc).toHaveBeenCalledTimes(1);
    const persistedPayload = rpc.mock.calls[0]?.[1]?.p_events?.[0];
    expect(persistedPayload?.eventType).toBe("worksheet_ai_rate_corrected");
    expect(persistedPayload?.diffData).toMatchObject({
      classificationStatus: "pending",
      rawContextVersion: 1,
      eventCaptureVersion: 1,
      columnHeader: "Unit rate",
      generatedByAi: true,
      generatedAt: "2026-05-30T00:00:00.000Z",
      correctedByUserId: "user-1",
      aiJobId: "job-1",
    });
    expect(Array.isArray(persistedPayload?.diffData?.nearbyHeaders)).toBe(true);
    expect(persistedPayload?.diffData?.nearbyHeaders).toContain("Unit rate");
    expect(Array.isArray(persistedPayload?.diffData?.nearbyRows)).toBe(true);
    expect(persistedPayload?.sourceRequestId).toBe(
      buildWorksheetEditEventSourceRequestId({
        clientMutationId: "mutation-ai-correction",
        eventType: "worksheet_ai_rate_corrected",
      }),
    );
  });

  it("backfills missing Phase 1.2 context before persistence for sparse worksheet learning events", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Estimate",
      rowCount: 8,
      columnCount: 6,
    });

    const event = buildPricingWorksheetIntelligenceEvent({
      organizationId: "org-1",
      userId: "user-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Estimate",
      worksheetId: "workbook-1",
      worksheetName: "Estimate",
      tradePackage: "Foundations",
      worksheet,
          eventType: "worksheet_assumption_changed",
      eventFamily: "field_change",
      action: "edited",
      source: "manual",
      diffData: {
        row: 6,
        cell: "E6",
        unit: "m",
        column: "E",
        source: "manual",
        newValue: 1.5,
        oldValue: null,
        rowLabel: "1. Inputs & Assumptions",
        itemLabel: "Post Embedment Depth",
        sectionLabel: null,
        sampleChanges: [
          {
            cell: "E6",
            row: 6,
            column: "E",
            columnHeader: "Waste factor",
            nearbyHeaders: ["Description", "Qty", "Unit", "Waste factor", "Total"],
            nearbyRows: [
              {
                row: 6,
                rowLabel: "1. Inputs & Assumptions",
                unit: "m",
                visibleCells: [
                  { column: "B", header: "Description", value: "Post Embedment Depth", formula: null },
                ],
              },
            ],
            sectionLabel: null,
            rowLabel: "1. Inputs & Assumptions",
            itemLabel: "Post Embedment Depth",
            unit: "m",
            formula: null,
            oldValue: null,
            newValue: 1.5,
            oldFormula: null,
            newFormula: null,
            formulaReferences: [],
            aiInteractionId: null,
          },
        ],
      },
    });

    const prepared = preparePricingWorksheetIntelligenceEventForPersistence(event);

    expect(prepared.diffData).toMatchObject({
      classificationStatus: "pending",
      rawContextVersion: 1,
      eventCaptureVersion: 1,
      evidenceSchemaVersion: 2,
      contextCaptureSource: "worksheet_event_capture",
      columnHeader: "Waste factor",
      nearbyHeaders: ["Description", "Qty", "Unit", "Waste factor", "Total"],
    });
    expect(Array.isArray(prepared.diffData.nearbyRows)).toBe(true);
    expect(Array.isArray(prepared.diffData.sampleChanges)).toBe(true);
    expect(prepared.diffData.rowSnapshotAfter).toMatchObject({
      rowLabel: "1. Inputs & Assumptions",
      itemLabel: "Post Embedment Depth",
    });
    expect(Array.isArray(prepared.diffData.referencedCellsSnapshot)).toBe(true);
    expect((prepared.diffData.sampleChanges as Array<Record<string, unknown>>)[0]).toMatchObject({
      columnHeader: "Waste factor",
      evidenceSchemaVersion: 2,
      nearbyHeaders: ["Description", "Qty", "Unit", "Waste factor", "Total"],
    });
  });
});
