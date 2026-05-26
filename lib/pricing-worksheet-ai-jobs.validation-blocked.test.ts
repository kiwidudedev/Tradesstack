import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { buildPricingWorksheetAiContext } from "./pricing-worksheet-ai-context";

const requireOrganizationMemberForAi = vi.fn();
const validateOpportunityForOrganization = vi.fn();
const retrieveOrganizationMemoryForAi = vi.fn();
const buildAiRequestContextSummary = vi.fn();
const createAiLifecycleInteraction = vi.fn();
const recordAiInteractionValidation = vi.fn();
const transitionAiLifecycleInteraction = vi.fn();
const retrievePricingWorksheetOrganizationGuidance = vi.fn();
const buildPricingWorksheetEditAssistantPreview = vi.fn();

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

vi.mock("server-only", () => ({}));

describe("pricing worksheet ai jobs validation blocked", () => {
  let interactionId: string;
  let aiInteractionState: {
    id: string;
    organization_id: string;
    opportunity_id: string | null;
    project_id: string | null;
    run_status: "queued" | "running" | "completed" | "failed" | "cancelled";
    lifecycle_state: string;
    validation_status: string | null;
    output_structured: unknown;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    interactionId = `interaction-${Math.random().toString(36).slice(2, 10)}`;

    aiInteractionState = {
      id: interactionId,
      organization_id: "org-123",
      opportunity_id: "opp-123",
      project_id: "project-123",
      run_status: "queued",
      lifecycle_state: "requested",
      validation_status: "pending",
      output_structured: null,
    };

    const worksheet = createDefaultWorksheetData({
      sheetName: "Ceiling Grid",
      rowCount: 8,
      columnCount: 6,
    });
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetId: "worksheet-123",
      worksheetName: "Ceiling Grid",
      tradePackage: "Ceilings",
    });

    const supabase = {
      from: (table: string) => {
        if (table === "opportunity_pricing_worksheets") {
          return {
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
          };
        }

        if (table === "ai_interactions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: aiInteractionState,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    requireOrganizationMemberForAi.mockResolvedValue({
      supabase,
      member: {
        role: "admin",
      },
    });
    validateOpportunityForOrganization.mockResolvedValue({
      workspace_project_id: "project-123",
    });
    retrieveOrganizationMemoryForAi.mockResolvedValue([]);
    buildAiRequestContextSummary.mockImplementation((value: unknown) => value);
    retrievePricingWorksheetOrganizationGuidance.mockResolvedValue({
      items: [],
      summary: "No strong organization estimating guidance was available for this worksheet request.",
      suppressionHints: [],
    });
    createAiLifecycleInteraction.mockResolvedValue(interactionId);
    transitionAiLifecycleInteraction.mockImplementation(async (_supabase: unknown, input: Record<string, unknown>) => {
      aiInteractionState = {
        ...aiInteractionState,
        run_status: (input.runStatus as typeof aiInteractionState.run_status | undefined) ?? aiInteractionState.run_status,
        lifecycle_state: (input.lifecycleState as string | undefined) ?? aiInteractionState.lifecycle_state,
        validation_status: (input.validationStatus as string | undefined) ?? aiInteractionState.validation_status,
        output_structured: input.outputStructured ?? aiInteractionState.output_structured,
      };
      return interactionId;
    });
    recordAiInteractionValidation.mockResolvedValue("validation-123");

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue({
      generationMeta: {
        provider: "openai",
        model: "gpt-5.5",
        fallbackUsed: false,
        fallbackReason: null,
      },
      providerAudit: {
        requestedProvider: "openai",
        requestedModel: "gpt-5.5",
        actualProvider: "openai",
        actualModel: "gpt-5.5",
        webSearchEnabled: true,
      },
      preview: {
        mode: "propose_edit",
        proposalName: "Ceiling starter",
        answer: "Built a compact ceiling worksheet.",
        summary: "Compact worksheet preview ready.",
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
          webSearchEnabled: true,
        },
        validationIssues: [
          {
            code: "formula_invalid_reference",
            message: "Formula reference is invalid.",
            severity: "error",
          },
        ],
        validationWarnings: [],
        compactOutput: {
          worksheetName: "Ceiling Grid",
          tradePackage: "Ceilings",
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
          promptHighlights: ["Rondo Donn exposed ceiling grid"],
          sampleLineItems: [],
        },
        matchedMemory: null,
        contextSummary: {
          matchedMemoryCount: 0,
          summary: "Headers: A, B, C, D, E, F",
        },
        classification: {
          primaryIntent: "worksheet_generation",
          defaultJurisdiction: "AUS_NZ",
          requiresConstructionReasoning: true,
          requiresRetrieval: true,
          tradeHints: ["ceilings"],
          systemHints: ["rondo"],
          confidence: "medium",
          riskLevel: "medium",
          shouldAskFollowUp: false,
          reason: "Worksheet generation request",
          recommendedPromptPath: "generation",
        },
      },
    });

    (globalThis as unknown as { __request?: unknown }).__request = {
      organizationId: "org-123",
      opportunityId: "opp-123",
      worksheetId: "worksheet-123",
      worksheetName: "Ceiling Grid",
      tradePackage: "Ceilings",
      prompt:
        "I need you to build me a spreadsheet that will provide me with all the components for a 24mm Rondo Donn exposed ceiling grid. I want to put in m2 and LM and it will calculate all the components. Material and labour.",
      currentWorksheetSummary: {
        rowCount: worksheet.rows.length,
        columnCount: worksheet.columns.length,
        formulaCount: 0,
        populatedCellCount: 0,
        hasExistingContent: false,
      },
      worksheetData: worksheet,
      worksheetContext,
      followUpContext: null,
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("returns structured preview data when validation is blocked", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const request = (globalThis as unknown as { __request: Record<string, unknown> }).__request;

    await createPricingWorksheetEditAssistantJob(request as never);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: "org-123",
      aiInteractionId: interactionId,
    });

    expect(job.status).toBe("ready");
    expect(job.error?.code).toBe("validation_blocked");
    expect(job.preview?.assistant?.mode).toBe("propose_edit");
  });
});
