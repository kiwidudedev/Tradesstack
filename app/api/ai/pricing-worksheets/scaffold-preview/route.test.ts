import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";

const requireOrganizationMemberForAi = vi.fn();
const validateOpportunityForOrganization = vi.fn();
const retrieveOrganizationMemoryForAi = vi.fn();
const buildAiRequestContextSummary = vi.fn();
const createAiLifecycleInteraction = vi.fn();
const recordAiInteractionValidation = vi.fn();
const summarizeAiValidationStatus = vi.fn(() => "passed");
const transitionAiLifecycleInteraction = vi.fn();
const buildPricingWorksheetScaffoldPreviewWithModel = vi.fn();
const buildOrganizationAiContext = vi.fn();

vi.mock("@/lib/ai-lifecycle-server", () => ({
  requireOrganizationMemberForAi,
  validateOpportunityForOrganization,
  retrieveOrganizationMemoryForAi,
  buildAiRequestContextSummary,
  createAiLifecycleInteraction,
  recordAiInteractionValidation,
  summarizeAiValidationStatus,
  transitionAiLifecycleInteraction,
}));

vi.mock("@/lib/ai-pricing-worksheet-model-generator", () => ({
  getPricingWorksheetModelConfig: () => ({
    provider: "openai",
    model: "gpt-5.5",
  }),
  buildPricingWorksheetScaffoldPreviewWithModel,
}));

vi.mock("@/lib/organization-ai-context", () => ({
  buildOrganizationAiContext,
}));

describe("POST /api/ai/pricing-worksheets/scaffold-preview", () => {
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
                  count: 0,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      },
    });
    validateOpportunityForOrganization.mockResolvedValue({
      workspace_project_id: "project-123",
    });
    retrieveOrganizationMemoryForAi.mockResolvedValue([]);
    buildAiRequestContextSummary.mockImplementation((payload) => payload);
    buildOrganizationAiContext.mockResolvedValue({
      constructionProfile: "We mostly work on commercial interiors.",
      organizationConstructionContext: "Company Construction Context:\n\nWe mostly work on commercial interiors.",
    });
    createAiLifecycleInteraction.mockResolvedValue("interaction-123");
    recordAiInteractionValidation.mockResolvedValue("validation-123");
    transitionAiLifecycleInteraction.mockResolvedValue("transition-123");
    buildPricingWorksheetScaffoldPreviewWithModel.mockResolvedValue({
      preview: {
        worksheet: createDefaultWorksheetData({
          sheetName: "Ceiling Worksheet",
          rowCount: 8,
          columnCount: 6,
        }),
        compactOutput: {
          confidence: 0.82,
          suggestionSource: "default",
        },
        matchedMemory: null,
        validationWarnings: [],
      },
      generationMeta: {
        provider: "openai",
        model: "gpt-5.5",
        fallbackUsed: false,
        fallbackReason: null,
      },
    });
  });

  it("passes organization construction context into scaffold generation", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/ai/pricing-worksheets/scaffold-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: "org-123",
        opportunityId: "opp-123",
        worksheetName: "Ceiling Worksheet",
        tradePackage: "Ceilings",
        prompt: "Generate a starter worksheet",
      }),
    }));

    expect(response.status).toBe(200);
    expect(buildPricingWorksheetScaffoldPreviewWithModel).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationConstructionContext: "Company Construction Context:\n\nWe mostly work on commercial interiors.",
      }),
    );
  });
});
