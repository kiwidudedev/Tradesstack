import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildPricingWorksheetAiContext } from "@/lib/pricing-worksheet-ai-context";

const requireOrganizationMemberForAi = vi.fn();
const validateOpportunityForOrganization = vi.fn();
const retrieveOrganizationMemoryForAi = vi.fn();
const buildAiRequestContextSummary = vi.fn();
const createAiLifecycleInteraction = vi.fn();
const recordAiInteractionValidation = vi.fn();
const transitionAiLifecycleInteraction = vi.fn();
const buildPricingWorksheetEditAssistantPreview = vi.fn();
const retrievePricingWorksheetOrganizationGuidance = vi.fn();
const buildOrganizationAiContext = vi.fn();

vi.mock("@/lib/ai-lifecycle-server", () => ({
  requireOrganizationMemberForAi,
  validateOpportunityForOrganization,
  retrieveOrganizationMemoryForAi,
  buildAiRequestContextSummary,
  createAiLifecycleInteraction,
  recordAiInteractionValidation,
  transitionAiLifecycleInteraction,
}));

vi.mock("@/lib/ai-pricing-worksheet-edit-assistant", () => ({
  getPricingWorksheetEditAssistantModelConfig: () => ({
    provider: "openai",
    model: "gpt-5.5",
  }),
  buildPricingWorksheetEditAssistantPreview,
}));

vi.mock("@/lib/pricing-worksheet-organization-guidance", () => ({
  retrievePricingWorksheetOrganizationGuidance,
}));

vi.mock("@/lib/organization-ai-context", () => ({
  buildOrganizationAiContext,
}));

describe("POST /api/ai/pricing-worksheets/edit-assistant", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    requireOrganizationMemberForAi.mockResolvedValue({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  count: 1,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      },
      member: {
        role: "member",
      },
    });
    validateOpportunityForOrganization.mockResolvedValue({
      workspace_project_id: "project-123",
    });
    retrieveOrganizationMemoryForAi.mockResolvedValue([]);
    buildAiRequestContextSummary.mockReturnValue({
      module: "pricing_worksheets",
    });
    retrievePricingWorksheetOrganizationGuidance.mockResolvedValue({
      items: [],
      summary: "No strong organization estimating guidance was available for this worksheet request.",
      suppressionHints: [],
    });
    buildOrganizationAiContext.mockResolvedValue({
      constructionProfile: "We mostly work on office fitouts and suspended ceilings.",
      organizationConstructionContext: [
        "Company Construction Context:",
        "",
        "The following is user-provided background context about this organization.",
        "",
        "We mostly work on office fitouts and suspended ceilings.",
      ].join("\n"),
    });
    createAiLifecycleInteraction.mockResolvedValue("interaction-123");
    recordAiInteractionValidation.mockResolvedValue("validation-123");
    transitionAiLifecycleInteraction.mockResolvedValue("transition-123");
  });

  it("returns answer_only preview payload for the steel stud LM prompt", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Wall Framing",
      rowCount: 8,
      columnCount: 6,
    });
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      workbookId: "worksheet-123",
      worksheetId: "worksheet-123",
      sheetName: "Wall Framing",
      worksheetName: "Wall Framing",
      tradePackage: "Wall framing",
    });

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue({
      generationMeta: {
        provider: "openai",
        model: "gpt-5.5",
        fallbackUsed: false,
        fallbackReason: null,
      },
      preview: {
        mode: "answer_only",
        proposalName: "Steel stud formula advice",
        answer: "Steel stud LM = wall length x wall height x studs per metre.",
        summary: "Helpful formula advice only.",
        confidence: "high",
        operations: [],
        assumptions: [],
        warnings: [],
        evidenceSources: [],
        reviewFindings: [],
        reviewSummary: null,
        suggestedEditGroups: [],
        worksheet,
        diffSummary: {
          changedCells: [],
          formulaCells: [],
          insertedRows: [],
          affectedRows: [],
        },
        diffPreview: {
          changedCells: [],
          insertedRows: [],
          affectedSections: [],
          formulaChanges: [],
        },
        storageSummary: {
          responseMode: "answer_only",
          sanitizedOperations: [],
          affectedCellRefs: [],
          formulaChangeSummary: [],
          insertedRowSummary: [],
          affectedSections: [],
          assumptions: [],
          warnings: [],
          evidenceSources: [],
          reviewFindings: [],
          reviewSummary: null,
          suggestedEditGroups: [],
        },
        validationIssues: [],
        validationWarnings: [
          {
            ruleKey: "ai_pricing_worksheet_edit_preview_ready",
            severity: "info",
            result: "passed",
            message: "AI answer is ready. No worksheet edits were applied.",
          },
        ],
        compactOutput: {
          worksheetName: "Wall Framing",
          tradePackage: "Wall framing",
          suggestionSource: "default",
          confidence: "high",
          rowCount: worksheet.rows.length,
          columnCount: worksheet.columns.length,
          formulaCount: 0,
          populatedCellCount: 0,
          sectionCounts: {
            sections: 0,
            rows: 0,
            operations: 0,
          },
          headers: ["A", "B", "C", "D", "E", "F"],
          sections: [],
          assumptions: [],
          warnings: [],
          promptHighlights: ["Write me a formula for calculating steel stud LM in wall"],
          sampleLineItems: [],
        },
        matchedMemory: null,
        contextSummary: {
          matchedMemoryCount: 0,
          summary: "Headers: A, B, C, D, E, F",
        },
        classification: {
          primaryIntent: "answer_only",
          defaultJurisdiction: "AUS_NZ",
          requiresConstructionReasoning: false,
          requiresRetrieval: false,
          tradeHints: [],
          systemHints: [],
          confidence: "high",
          riskLevel: "low",
          shouldAskFollowUp: false,
          reason: "Advice request",
          recommendedPromptPath: "answer",
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/pricing-worksheets/edit-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org-123",
          opportunityId: "opp-123",
          workbookId: "worksheet-123",
          worksheetId: "worksheet-123",
          sheetName: "Wall Framing",
          worksheetName: "Wall Framing",
          tradePackage: "Wall framing",
          prompt: "Write me a formula for calculating steel stud LM in wall",
          currentWorksheetSummary: {
            rowCount: worksheet.rows.length,
            columnCount: worksheet.columns.length,
            formulaCount: 0,
            populatedCellCount: 0,
            hasExistingContent: false,
          },
          worksheetData: worksheet,
          worksheetContext,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(retrievePricingWorksheetOrganizationGuidance).toHaveBeenCalled();
    expect(buildPricingWorksheetEditAssistantPreview).toHaveBeenCalled();
    expect(buildPricingWorksheetEditAssistantPreview.mock.calls[0]?.[0]?.classification).toMatchObject({
      defaultJurisdiction: "AUS_NZ",
    });
    expect(buildPricingWorksheetEditAssistantPreview.mock.calls[0]?.[0]?.organizationGuidance).toMatchObject({
      items: [],
    });
    expect(buildPricingWorksheetEditAssistantPreview.mock.calls[0]?.[0]?.organizationConstructionContext).toContain(
      "Company Construction Context:"
    );
    expect(buildAiRequestContextSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        relatedCounts: expect.objectContaining({
          constructionProfileLength: 56,
          hasConstructionProfile: 1,
        }),
      }),
    );
    expect(createAiLifecycleInteraction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inputContextSummary: expect.objectContaining({
          workbookId: "worksheet-123",
          worksheetId: "worksheet-123",
          sheetName: "Wall Framing",
        }),
      }),
    );
    expect(transitionAiLifecycleInteraction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outputStructured: expect.objectContaining({
          workbookId: "worksheet-123",
          worksheetId: "worksheet-123",
          sheetName: "Wall Framing",
        }),
      }),
    );
    expect(payload.workbookId).toBe("worksheet-123");
    expect(payload.worksheetId).toBe("worksheet-123");
    expect(payload.sheetName).toBe("Wall Framing");
    expect(payload.preview.assistant.mode).toBe("answer_only");
    expect(payload.preview.assistant.answer.length).toBeGreaterThan(0);
    expect(payload.preview.assistant.operations).toEqual([]);
    expect(payload.generationMeta.fallbackUsed).toBe(false);
  });

  it("passes follow-up context into preview generation", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Wall Framing",
      rowCount: 8,
      columnCount: 6,
    });
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetId: "worksheet-123",
      worksheetName: "Wall Framing",
      tradePackage: "Wall framing",
    });

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue({
      generationMeta: {
        provider: "openai",
        model: "gpt-5.5",
        fallbackUsed: false,
        fallbackReason: null,
      },
      preview: {
        mode: "answer_only",
        proposalName: "Review revision",
        answer: "Updated review.",
        summary: "Updated summary.",
        confidence: "medium",
        operations: [],
        assumptions: [],
        warnings: [],
        evidenceSources: [],
        reviewFindings: [],
        reviewSummary: null,
        suggestedEditGroups: [],
        worksheet,
        diffSummary: {
          changedCells: [],
          formulaCells: [],
          insertedRows: [],
          affectedRows: [],
        },
        diffPreview: {
          changedCells: [],
          insertedRows: [],
          affectedSections: [],
          formulaChanges: [],
        },
        storageSummary: {
          responseMode: "answer_only",
          sanitizedOperations: [],
          affectedCellRefs: [],
          formulaChangeSummary: [],
          insertedRowSummary: [],
          affectedSections: [],
          assumptions: [],
          warnings: [],
          evidenceSources: [],
          reviewFindings: [],
          reviewSummary: null,
          suggestedEditGroups: [],
        },
        validationIssues: [],
        validationWarnings: [],
        compactOutput: {
          worksheetName: "Wall Framing",
          tradePackage: "Wall framing",
          suggestionSource: "default",
          confidence: "medium",
          rowCount: worksheet.rows.length,
          columnCount: worksheet.columns.length,
          formulaCount: 0,
          populatedCellCount: 0,
          sectionCounts: {
            sections: 0,
            rows: 0,
            operations: 0,
          },
          headers: ["A", "B", "C", "D", "E", "F"],
          sections: [],
          assumptions: [],
          warnings: [],
          promptHighlights: ["This wall is not acoustic rated."],
          sampleLineItems: [],
        },
        matchedMemory: null,
        contextSummary: {
          matchedMemoryCount: 0,
          summary: "Headers: A, B, C, D, E, F",
        },
        classification: {
          primaryIntent: "review_estimate",
          defaultJurisdiction: "AUS_NZ",
          requiresConstructionReasoning: true,
          requiresRetrieval: false,
          tradeHints: [],
          systemHints: [],
          confidence: "medium",
          riskLevel: "medium",
          shouldAskFollowUp: false,
          reason: "Review request",
          recommendedPromptPath: "review",
        },
      },
    });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/ai/pricing-worksheets/edit-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org-123",
          opportunityId: "opp-123",
          worksheetId: "worksheet-123",
          worksheetName: "Wall Framing",
          tradePackage: "Wall framing",
          prompt: "This wall is not acoustic rated.",
          worksheetData: worksheet,
          worksheetContext,
          followUpContext: {
            previousReviewFindings: [{ id: "finding-1", title: "Potential acoustic requirement" }],
            rejectedFindingIds: ["finding-1"],
            userCorrection: "This wall is not acoustic rated.",
          },
        }),
      }),
    );

    expect(buildPricingWorksheetEditAssistantPreview.mock.calls.at(-1)?.[0]?.followUpContext).toMatchObject({
      rejectedFindingIds: ["finding-1"],
      userCorrection: "This wall is not acoustic rated.",
    });
  });

  it("returns continuation metadata in the direct API preview response", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Roofing",
      rowCount: 20,
      columnCount: 12,
    });
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetId: "worksheet-123",
      worksheetName: "Roofing",
      tradePackage: "Roofing",
    });

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue({
      generationMeta: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        fallbackUsed: false,
        fallbackReason: null,
      },
      providerAudit: {
        requestedProvider: "anthropic",
        requestedModel: "claude-sonnet-4-6",
        actualProvider: "anthropic",
        actualModel: "claude-sonnet-4-6",
        webSearchEnabled: true,
      },
      preview: {
        mode: "propose_edit",
        proposalName: "Roofing batch 1",
        answer: "Batch 1 ready.",
        summary: "Batch 1 ready.",
        confidence: "medium",
        operations: [],
        assumptions: [],
        warnings: [],
        reviewFindings: [],
        reviewSummary: null,
        suggestedEditGroups: [],
        evidenceSources: [],
        worksheet,
        diffSummary: {
          changedCells: [],
          formulaCells: [],
          formattingCells: [],
          insertedRows: [],
          affectedRows: [],
        },
        diffPreview: {
          changedCells: [],
          insertedRows: [],
          affectedSections: [],
          formulaChanges: [],
          formattingChanges: [],
        },
        storageSummary: {
          responseMode: "propose_edit",
          sanitizedOperations: [],
          affectedCellRefs: [],
          formulaChangeSummary: [],
          formattingChangeSummary: [],
          insertedRowSummary: [],
          affectedSections: [],
          assumptions: [],
          warnings: [],
        },
        validationIssues: [],
        validationWarnings: [],
        compactOutput: {
          worksheetName: "Roofing",
          tradePackage: "Roofing",
          suggestionSource: "default",
          confidence: "medium",
          rowCount: worksheet.rows.length,
          columnCount: worksheet.columns.length,
          formulaCount: 0,
          populatedCellCount: 0,
          sectionCounts: {
            sections: 0,
            rows: 0,
            operations: 0,
          },
          headers: worksheet.columns.map((column) => column.id),
          sections: [],
          assumptions: [],
          warnings: [],
          promptHighlights: ["roofing"],
          sampleLineItems: [],
        },
        matchedMemory: null,
        contextSummary: {
          matchedMemoryCount: 0,
          summary: "Continuation test",
        },
        classification: {
          primaryIntent: "worksheet_generation",
          defaultJurisdiction: "AUS_NZ",
          requiresConstructionReasoning: true,
          requiresRetrieval: false,
          tradeHints: ["roofing"],
          systemHints: [],
          confidence: "high",
          riskLevel: "high",
          shouldAskFollowUp: false,
          reason: "Large generation",
          recommendedPromptPath: "generation",
        },
        continuation: {
          strategy: "safe_generation_batches",
          currentBatchIndex: 1,
          totalBatchCount: 3,
          remainingBatchCount: 2,
          remainingOperationCount: 12,
          message: "This is a large worksheet, so TradesStack is building it safely in stages.",
          remainingBatches: [
            {
              id: "continuation-batch-2",
              title: "Safe worksheet build batch 2 of 3",
              purpose: "Continue building safely.",
              operations: [],
              changedCellCount: 0,
            },
          ],
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/pricing-worksheets/edit-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org-123",
          opportunityId: "opp-123",
          worksheetId: "worksheet-123",
          worksheetName: "Roofing",
          tradePackage: "Roofing",
          prompt: "Create a large roofing worksheet",
          currentWorksheetSummary: {
            rowCount: worksheet.rows.length,
            columnCount: worksheet.columns.length,
            formulaCount: 0,
            populatedCellCount: 0,
            hasExistingContent: false,
          },
          worksheetData: worksheet,
          worksheetContext,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.preview.continuation).toMatchObject({
      currentBatchIndex: 1,
      totalBatchCount: 3,
      remainingBatchCount: 2,
    });
    expect(payload.preview.continuation.remainingBatches[0].id).toBe("continuation-batch-2");
  });

  it("returns evidence sources in the preview assistant payload when available", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Wall Framing",
      rowCount: 8,
      columnCount: 6,
    });
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetId: "worksheet-123",
      worksheetName: "Wall Framing",
      tradePackage: "Wall framing",
    });

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue({
      generationMeta: {
        provider: "openai",
        model: "gpt-5.5",
        fallbackUsed: false,
        fallbackReason: null,
      },
      preview: {
        mode: "answer_only",
        proposalName: "Review revision",
        answer: "Updated review.",
        summary: "Updated summary.",
        confidence: "medium",
        operations: [],
        assumptions: [],
        warnings: [],
        evidenceSources: [
          {
            id: "source-1",
            title: "Rondo Key-Lock Concealed Ceiling System",
            url: "https://www.rondo.com.au/key-lock",
            sourceType: "manufacturer",
            confidence: "medium",
            jurisdiction: "AU",
            supportedClaims: ["Defines the Rondo Key-Lock ceiling system."],
          },
        ],
        reviewFindings: [],
        reviewSummary: null,
        suggestedEditGroups: [],
        worksheet,
        diffSummary: {
          changedCells: [],
          formulaCells: [],
          insertedRows: [],
          affectedRows: [],
        },
        diffPreview: {
          changedCells: [],
          insertedRows: [],
          affectedSections: [],
          formulaChanges: [],
        },
        storageSummary: {
          responseMode: "answer_only",
          sanitizedOperations: [],
          affectedCellRefs: [],
          formulaChangeSummary: [],
          insertedRowSummary: [],
          affectedSections: [],
          assumptions: [],
          warnings: [],
          evidenceSources: [],
          reviewFindings: [],
          reviewSummary: null,
          suggestedEditGroups: [],
        },
        validationIssues: [],
        validationWarnings: [],
        compactOutput: {
          worksheetName: "Wall Framing",
          tradePackage: "Wall framing",
          suggestionSource: "default",
          confidence: "medium",
          rowCount: worksheet.rows.length,
          columnCount: worksheet.columns.length,
          formulaCount: 0,
          populatedCellCount: 0,
          sectionCounts: {
            sections: 0,
            rows: 0,
            operations: 0,
          },
          headers: ["A", "B", "C", "D", "E", "F"],
          sections: [],
          assumptions: [],
          warnings: [],
          promptHighlights: ["What does this Rondo line item mean?"],
          sampleLineItems: [],
        },
        matchedMemory: null,
        contextSummary: {
          matchedMemoryCount: 0,
          summary: "Headers: A, B, C, D, E, F",
        },
        classification: {
          primaryIntent: "answer_only",
          defaultJurisdiction: "AUS_NZ",
          requiresConstructionReasoning: true,
          requiresRetrieval: true,
          tradeHints: [],
          systemHints: ["rondo"],
          confidence: "medium",
          riskLevel: "medium",
          shouldAskFollowUp: false,
          reason: "Advice request",
          recommendedPromptPath: "answer",
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/pricing-worksheets/edit-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org-123",
          opportunityId: "opp-123",
          worksheetId: "worksheet-123",
          worksheetName: "Wall Framing",
          tradePackage: "Wall framing",
          prompt: "What does this Rondo line item mean?",
          worksheetData: worksheet,
          worksheetContext,
        }),
      }),
    );

    const payload = await response.json();
    expect(payload.preview.assistant.evidenceSources).toHaveLength(1);
    expect(payload.preview.assistant.evidenceSources[0].title).toContain("Rondo");
  });

  it("continues targeting only the active worksheet payload for AI edits", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Active Default Sheet",
      rowCount: 8,
      columnCount: 6,
    });
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetId: "workbook-123",
      worksheetName: "Active Default Sheet",
      tradePackage: "Ceilings",
    });

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue({
      generationMeta: {
        provider: "openai",
        model: "gpt-5.5",
        fallbackUsed: false,
        fallbackReason: null,
      },
      preview: {
        mode: "propose_edit",
        proposalName: "Active sheet only",
        answer: "Edited the active sheet only.",
        summary: "No other sheet context was used.",
        confidence: "high",
        operations: [],
        assumptions: [],
        warnings: [],
        evidenceSources: [],
        reviewFindings: [],
        reviewSummary: null,
        suggestedEditGroups: [],
        worksheet,
        diffSummary: {
          changedCells: [],
          formulaCells: [],
          insertedRows: [],
          affectedRows: [],
        },
        diffPreview: {
          changedCells: [],
          insertedRows: [],
          affectedSections: [],
          formulaChanges: [],
        },
        storageSummary: {
          responseMode: "propose_edit",
          sanitizedOperations: [],
          affectedCellRefs: [],
          formulaChangeSummary: [],
          insertedRowSummary: [],
          affectedSections: [],
          assumptions: [],
          warnings: [],
          evidenceSources: [],
          reviewFindings: [],
          reviewSummary: null,
          suggestedEditGroups: [],
        },
        validationIssues: [],
        validationWarnings: [],
        compactOutput: {
          worksheetName: "Active Default Sheet",
          tradePackage: "Ceilings",
          suggestionSource: "default",
          confidence: "high",
          rowCount: worksheet.rows.length,
          columnCount: worksheet.columns.length,
          formulaCount: 0,
          populatedCellCount: 0,
          sectionCounts: {
            sections: 0,
            rows: 0,
            operations: 0,
          },
          headers: ["A", "B", "C", "D", "E", "F"],
          sections: [],
          assumptions: [],
          warnings: [],
          promptHighlights: ["Update the active sheet only"],
          sampleLineItems: [],
        },
        matchedMemory: null,
        contextSummary: {
          matchedMemoryCount: 0,
          summary: "Headers: A, B, C, D, E, F",
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/pricing-worksheets/edit-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org-123",
          opportunityId: "opp-123",
          workbookId: "workbook-123",
          worksheetId: "workbook-123",
          sheetId: "sheet-page-2",
          sheetName: "Active Default Sheet",
          worksheetName: "Active Default Sheet",
          tradePackage: "Ceilings",
          prompt: "Update the active sheet only",
          currentWorksheetSummary: {
            rowCount: worksheet.rows.length,
            columnCount: worksheet.columns.length,
            formulaCount: 0,
            populatedCellCount: 0,
            hasExistingContent: false,
          },
          worksheetData: worksheet,
          worksheetContext,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.workbookId).toBe("workbook-123");
    expect(payload.worksheetId).toBe("workbook-123");
    expect(payload.sheetId).toBe("sheet-page-2");
    expect(payload.sheetName).toBe("Active Default Sheet");
    expect(buildPricingWorksheetEditAssistantPreview.mock.calls[0]?.[0]?.worksheet).toEqual(worksheet);
    expect(buildPricingWorksheetEditAssistantPreview.mock.calls[0]?.[0]?.worksheetContext).toEqual(worksheetContext);
  });
});
