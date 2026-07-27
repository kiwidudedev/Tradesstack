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
let mockModelConfig: {
  provider: "openai" | "anthropic";
  model: string;
} = {
  provider: "openai",
  model: "gpt-5.5",
};

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
  getPricingWorksheetEditAssistantModelConfig: () => mockModelConfig,
  buildPricingWorksheetEditAssistantPreview,
}));

vi.mock("@/lib/pricing-worksheet-organization-guidance", () => ({
  retrievePricingWorksheetOrganizationGuidance,
}));

vi.mock("server-only", () => ({}));

function buildFixture() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Ceiling Grid",
    rowCount: 8,
    columnCount: 6,
  });

  const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
    workbookId: "worksheet-123",
    worksheetId: "worksheet-123",
    sheetId: "sheet-123",
    sheetName: "Ceiling Grid",
    worksheetName: "Ceiling Grid",
    tradePackage: "Ceilings",
  });

  return {
    request: {
      organizationId: "org-123",
      opportunityId: "opp-123",
      workbookId: "worksheet-123",
      worksheetId: "worksheet-123",
      sheetId: "sheet-123",
      sheetName: "Ceiling Grid",
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
    },
    worksheet,
  };
}

function buildPreviewResult(overrides?: Partial<Awaited<ReturnType<typeof buildPricingWorksheetEditAssistantPreview>>>) {
  const { worksheet } = buildFixture();

  return {
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
      operations: [
        {
          type: "update_cell",
          target: {
            cell: "C4",
          },
          formulas: {
            cells: [
              {
                ref: "C4",
                formula: "=A4*B4",
              },
            ],
          },
          rationale: "Add a starter formula.",
        },
      ],
      assumptions: [],
      warnings: [],
      reviewFindings: [],
      reviewSummary: null,
      suggestedEditGroups: [],
      evidenceSources: [],
      worksheet,
      diffSummary: {
        changedCells: ["C4"],
        formulaCells: ["C4"],
        insertedRows: [],
        affectedRows: [4],
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
        affectedCellRefs: ["C4"],
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
      validationIssues: [],
      validationWarnings: [],
      compactOutput: {
        worksheetName: "Ceiling Grid",
        tradePackage: "Ceilings",
        suggestionSource: "default",
        confidence: "medium",
        rowCount: worksheet.rows.length,
        columnCount: worksheet.columns.length,
        formulaCount: 1,
        populatedCellCount: 1,
        sectionCounts: {
          sections: 0,
          rows: 0,
          operations: 1,
        },
        headers: ["A", "B", "C", "D", "E", "F"],
        sections: [],
        assumptions: [],
        warnings: [],
        promptHighlights: ["Rondo Donn exposed ceiling grid"],
        sampleLineItems: ["Main tee", "Cross tee", "Hanger wire"],
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
    ...overrides,
  };
}

describe("pricing worksheet ai jobs", () => {
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
    provider?: string | null;
    model?: string | null;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    mockModelConfig = {
      provider: "openai",
      model: "gpt-5.5",
    };
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
      provider: "openai",
      model: "gpt-5.5",
    };

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
        provider: (input.provider as string | null | undefined) ?? aiInteractionState.provider,
        model: (input.model as string | null | undefined) ?? aiInteractionState.model,
      };
      return interactionId;
    });
    recordAiInteractionValidation.mockResolvedValue("validation-123");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("returns a job quickly without waiting for provider completion", async () => {
    const { createPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue(buildPreviewResult());

    const job = await createPricingWorksheetEditAssistantJob(request);

    expect(job.aiInteractionId).toBe(interactionId);
    expect(job.status).toBe("queued");
    expect(createAiLifecycleInteraction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inputContextSummary: expect.objectContaining({
          workbookId: "worksheet-123",
          worksheetId: "worksheet-123",
          sheetId: "sheet-123",
          sheetName: "Ceiling Grid",
        }),
      }),
    );
    expect(buildPricingWorksheetEditAssistantPreview).not.toHaveBeenCalled();
  });

  it("transitions queued to running to ready and exposes preview for polling", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue(buildPreviewResult());

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const statuses = transitionAiLifecycleInteraction.mock.calls.map((call) => call[1]?.runStatus);
    expect(statuses).toContain("queued");
    expect(statuses).toContain("running");
    expect(statuses).toContain("completed");

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    if (job.status !== "ready") {
      throw new Error(JSON.stringify(job));
    }
    expect(job.workbookId).toBe("worksheet-123");
    expect(job.worksheetId).toBe("worksheet-123");
    expect(job.sheetId).toBe("sheet-123");
    expect(job.sheetName).toBe("Ceiling Grid");
    expect(aiInteractionState.output_structured).toMatchObject({
      job: {
        request: {
          workbookId: "worksheet-123",
          worksheetId: "worksheet-123",
          sheetId: "sheet-123",
          sheetName: "Ceiling Grid",
        },
        result: {
          workbookId: "worksheet-123",
          worksheetId: "worksheet-123",
          sheetId: "sheet-123",
          sheetName: "Ceiling Grid",
        },
      },
    });
    expect(job.preview?.assistant?.mode).toBe("propose_edit");
  });

  it("preserves continuation through job serialization and polling", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();

    const previewResult = buildPreviewResult();
    previewResult.preview.continuation = {
      strategy: "safe_generation_batches",
      currentBatchIndex: 1,
      totalBatchCount: 3,
      remainingBatchCount: 2,
      remainingOperationCount: 5,
      message: "This is a large worksheet, so TradesStack is building it safely in stages.",
      remainingBatches: [
        {
          id: "continuation-batch-2",
          title: "Safe worksheet build batch 2 of 3",
          purpose: "Continue building the generated worksheet with the next validator-safe batch.",
          operations: [
            {
              type: "insert_row",
              target: { insertBeforeRow: 4 },
              values: { cells: [{ column: "A", value: "Batch 2" }] },
              formulas: { cells: [] },
              rationale: "Batch 2 op",
            },
          ],
          changedCellCount: 1,
        },
      ],
    };
    buildPricingWorksheetEditAssistantPreview.mockResolvedValue(previewResult);

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    expect(job.status).toBe("ready");
    expect(job.preview?.continuation).toMatchObject({
      currentBatchIndex: 1,
      totalBatchCount: 3,
      remainingBatchCount: 2,
    });
    expect((job.preview?.continuation as { remainingBatches?: Array<{ id: string }> } | null)?.remainingBatches?.[0]?.id).toBe(
      "continuation-batch-2",
    );
  });

  it("records requested and actual provider metadata on successful jobs", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue(buildPreviewResult());

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    expect(job.status).toBe("ready");
    const storedJob = aiInteractionState.output_structured as {
      job?: {
        providerStatus?: Record<string, unknown>;
      };
    };
    expect(storedJob.job?.providerStatus).toMatchObject({
      requestedProvider: "openai",
      requestedModel: "gpt-5.5",
      actualProvider: "openai",
      actualModel: "gpt-5.5",
      webSearchEnabled: true,
    });
    expect(aiInteractionState.provider).toBe("openai");
    expect(aiInteractionState.model).toBe("gpt-5.5");
    const completedTransition = transitionAiLifecycleInteraction.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(completedTransition.provider).toBe("openai");
    expect(completedTransition.model).toBe("gpt-5.5");
  });

  it("does not immediately fall back to answer_only when timeout recovery succeeds", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();

    buildPricingWorksheetEditAssistantPreview
      .mockResolvedValueOnce(buildPreviewResult({
        generationMeta: {
          provider: "tradesstack",
          model: "assistant-fallback",
          fallbackUsed: true,
          fallbackReason: "Upstream request timed out.",
        },
        preview: {
          ...buildPreviewResult().preview,
          mode: "answer_only",
          operations: [],
        },
      }))
      .mockResolvedValueOnce(buildPreviewResult({
        providerAudit: {
          requestedProvider: "openai",
          requestedModel: "gpt-5.5",
          actualProvider: "openai",
          actualModel: "gpt-5.5",
          webSearchEnabled: false,
        },
        preview: {
          ...buildPreviewResult().preview,
          storageSummary: {
            ...buildPreviewResult().preview.storageSummary,
            webSearchEnabled: false,
          },
        },
      }));

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    expect(buildPricingWorksheetEditAssistantPreview).toHaveBeenCalledTimes(2);
    expect(buildPricingWorksheetEditAssistantPreview.mock.calls[1]?.[0]?.providerOptions).toMatchObject({
      webSearchEnabled: false,
    });
    expect(job.status).toBe("ready");
    expect(job.preview?.assistant?.mode).toBe("propose_edit");
    const storedJob = aiInteractionState.output_structured as {
      job?: {
        providerStatus?: Record<string, unknown>;
      };
    };
    expect(storedJob.job?.providerStatus).toMatchObject({
      webSearchEnabled: false,
      actualProvider: "openai",
      actualModel: "gpt-5.5",
    });
  });

  it("marks provider 520 failures as retryable failed jobs", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();

    const fallback520 = buildPreviewResult({
      generationMeta: {
        provider: "tradesstack",
        model: "assistant-fallback",
        fallbackUsed: true,
        fallbackReason: "OpenAI request failed with status 520.",
      },
      preview: {
        ...buildPreviewResult().preview,
        mode: "answer_only",
        operations: [],
      },
    });

    buildPricingWorksheetEditAssistantPreview
      .mockResolvedValueOnce(fallback520)
      .mockResolvedValueOnce(fallback520);

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("provider_520");
    expect(job.error?.retryable).toBe(true);
    expect(job.preview).toBeNull();
  });

  it("preserves provider metadata on failed jobs after a provider fallback", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue(
      buildPreviewResult({
        generationMeta: {
          provider: "tradesstack",
          model: "assistant-fallback",
          fallbackUsed: true,
          fallbackReason: "OpenAI request failed with status 520.",
        },
        providerAudit: {
          requestedProvider: "openai",
          requestedModel: "gpt-5.5",
          actualProvider: "openai",
          actualModel: "gpt-5.5",
          webSearchEnabled: true,
        },
        preview: {
          ...buildPreviewResult().preview,
          mode: "answer_only",
          operations: [],
        },
      }),
    );

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    expect(job.status).toBe("failed");
    const storedJob = aiInteractionState.output_structured as {
      job?: {
        providerStatus?: Record<string, unknown>;
      };
    };
    expect(storedJob.job?.providerStatus).toMatchObject({
      requestedProvider: "openai",
      requestedModel: "gpt-5.5",
      actualProvider: "openai",
      actualModel: "gpt-5.5",
      phase: "failed",
    });
    expect(aiInteractionState.provider).toBe("openai");
    expect(aiInteractionState.model).toBe("gpt-5.5");
  });

  it("records anthropic requested and actual provider metadata when anthropic is selected", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();
    mockModelConfig = {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    };

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue(
      buildPreviewResult({
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
          webSearchEnabled: false,
        },
        preview: {
          ...buildPreviewResult().preview,
          storageSummary: {
            ...buildPreviewResult().preview.storageSummary,
            webSearchEnabled: false,
          },
        },
      }),
    );

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    expect(job.status).toBe("ready");
    const storedJob = aiInteractionState.output_structured as {
      job?: {
        providerStatus?: Record<string, unknown>;
      };
    };
    expect(storedJob.job?.providerStatus).toMatchObject({
      requestedProvider: "anthropic",
      requestedModel: "claude-sonnet-4-6",
      actualProvider: "anthropic",
      actualModel: "claude-sonnet-4-6",
      webSearchEnabled: false,
    });
    expect(aiInteractionState.provider).toBe("anthropic");
    expect(aiInteractionState.model).toBe("claude-sonnet-4-6");
  });

  it("returns Anthropic safe unknown fallbacks as ready answer-only previews", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();
    mockModelConfig = {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    };

    buildPricingWorksheetEditAssistantPreview.mockResolvedValue(
      buildPreviewResult({
        generationMeta: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          fallbackUsed: true,
          fallbackReason: "anthropic_safe_unknown_fallback",
        },
        providerAudit: {
          requestedProvider: "anthropic",
          requestedModel: "claude-sonnet-4-6",
          actualProvider: "anthropic",
          actualModel: "claude-sonnet-4-6",
          webSearchEnabled: false,
        },
        preview: {
          ...buildPreviewResult().preview,
          mode: "answer_only",
          answer: "I can help build that worksheet, but I need more detail before proposing safe worksheet edits.",
          summary: "The assistant returned a safe answer instead of worksheet edits.",
          confidence: "low",
          operations: [],
          warnings: ["anthropic_safe_unknown_fallback"],
          diffSummary: {
            changedCells: [],
            formulaCells: [],
            insertedRows: [],
            affectedRows: [],
          },
        },
      }),
    );

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    expect(job.status).toBe("ready");
    expect(job.error).toBeNull();
    expect(job.validationStatus).toBe("warning");
    expect(job.preview?.assistant?.mode).toBe("answer_only");
    expect(job.preview?.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleKey: "anthropic_safe_unknown_fallback",
          message: expect.stringContaining("safe answer"),
        }),
      ]),
    );
  });

  it("surfaces quota-specific failure messaging", async () => {
    const { createPricingWorksheetEditAssistantJob, getPricingWorksheetEditAssistantJob } = await import("./pricing-worksheet-ai-jobs");
    const { request } = buildFixture();

    const fallback429 = buildPreviewResult({
      generationMeta: {
        provider: "tradesstack",
        model: "assistant-fallback",
        fallbackUsed: true,
        fallbackReason: "OpenAI request failed with status 429.",
      },
      preview: {
        ...buildPreviewResult().preview,
        mode: "answer_only",
        operations: [],
      },
    });

    buildPricingWorksheetEditAssistantPreview
      .mockResolvedValueOnce(fallback429)
      .mockResolvedValueOnce(fallback429);

    await createPricingWorksheetEditAssistantJob(request);
    await vi.runAllTimersAsync();

    const job = await getPricingWorksheetEditAssistantJob({
      organizationId: request.organizationId,
      aiInteractionId: interactionId,
    });

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("provider_quota");
    expect(job.error?.message).toContain("quota");
  });

});
