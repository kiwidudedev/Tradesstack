import { beforeEach, describe, expect, it, vi } from "vitest";

const getPricingWorksheetAiProvider = vi.fn();
const getPricingWorksheetAnthropicModel = vi.fn();
const createAdminSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/providers/pricing-worksheet/registry", () => ({
  getPricingWorksheetAiProvider,
  getPricingWorksheetAnthropicModel,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "event-1",
    organizationId: "org-1",
    projectId: null,
    opportunityId: null,
    eventType: "worksheet_assumption_changed",
    occurredAt: "2026-05-31T00:00:00.000Z",
    metadata: {
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Inputs",
      worksheetName: "Inputs",
      tradePackage: "Foundations",
    },
    diffData: {
      itemLabel: "Waste factor",
      rowLabel: "Inputs & Assumptions",
      columnHeader: "Waste factor",
      unit: "%",
      newValue: 15,
      oldValue: 10,
      oldFormula: null,
      newFormula: null,
    },
    classificationStatus: "classified",
    classificationVersion: 1,
    classificationSource: "llm",
    classificationProvider: "anthropic",
    classificationModel: "claude-sonnet-4-6",
    classificationModelVersion: "1",
    overallConfidence: 0.88,
    reasoningSummary: "Looks like an assumption input.",
    semanticFields: {
      costRole: { value: "assumption", confidence: 0.72 },
      cellRole: { value: "assumption_input", confidence: 0.85 },
      pageType: { value: "inputs", confidence: 0.84 },
      sectionType: { value: "assumptions", confidence: 0.8 },
      itemCategory: { value: "general_assumption", confidence: 0.79 },
      measurementBasis: { value: "percentage", confidence: 0.9 },
      normalizedUnit: { value: "percent", confidence: 0.93 },
      normalizedTradePackage: { value: "foundations", confidence: 0.65 },
      workCategory: { value: "structural", confidence: 0.61 },
      systemCategory: { value: null, confidence: 0.2 },
      assemblyCategory: { value: null, confidence: 0.2 },
    },
    interpretationSchemaVersion: 2,
    interpretationPayload: {
      interpretedChange: {
        whatChanged: "Estimator updated the worksheet assumption.",
        plainEnglishSummary: "Updated a worksheet assumption.",
        businessMeaning: "This changes an estimating assumption.",
        futureUse: {
          memoryCandidate: true,
          memoryType: "input_assumption_adjustment",
          retrievalGuidance: "Consider this in similar worksheets.",
        },
        observed: {
          changeSummary: "Estimator updated the worksheet assumption.",
        },
        knownImpact: {
          worksheetImpact: "May change downstream totals.",
          pricingImpact: "May change estimate pricing.",
        },
        interpretation: {
          estimatorBehavior: "Estimator adjusted a worksheet assumption.",
        },
      },
    },
    futureUseSummary: {
      memoryCandidate: true,
      memoryType: "input_assumption_adjustment",
      retrievalGuidance: "Consider this in similar worksheets.",
    },
    confidenceDetail: {
      overall: 0.88,
      context: 0.8,
      futureUse: 0.78,
    },
    classifiedAt: "2026-05-31T01:00:00.000Z",
    ...overrides,
  };
}

function buildProviderResponse(proposals: Array<Record<string, unknown>>) {
  return {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-6",
    rawProviderResponse: {},
    parsedJson: {
      proposals,
    },
    outputText: "",
    evidence: [],
    citations: [],
    warnings: [],
    usage: undefined,
    webSearchUsed: false,
    effectiveWebSearchEnabled: false,
  };
}

describe("worksheet memory ai proposals", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getPricingWorksheetAnthropicModel.mockReturnValue("claude-sonnet-4-6");
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([
        {
          proposalKind: "no_memory",
          memoryCategory: null,
          memoryFamily: null,
          title: null,
          summary: "No durable memory found.",
          confidence: null,
          evidenceEventIds: [],
          contradictoryEventIds: [],
          retrievalGuidance: null,
          memoryValue: {},
        },
      ])),
    });
  });

  it("does not mix organizations in the same Anthropic batch", async () => {
    const generateEditPlan = vi.fn()
      .mockResolvedValueOnce(buildProviderResponse([{
        proposalKind: "no_memory",
        memoryCategory: null,
        memoryFamily: null,
        title: null,
        summary: "No durable memory found.",
        confidence: null,
        evidenceEventIds: [],
        contradictoryEventIds: [],
        retrievalGuidance: null,
        memoryValue: {},
      }]))
      .mockResolvedValueOnce(buildProviderResponse([{
        proposalKind: "no_memory",
        memoryCategory: null,
        memoryFamily: null,
        title: null,
        summary: "No durable memory found.",
        confidence: null,
        evidenceEventIds: [],
        contradictoryEventIds: [],
        retrievalGuidance: null,
        memoryValue: {},
      }]));
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan,
    });

    const { runWorksheetMemoryAiProposalsShadowMode } = await import("./worksheet-memory-ai-proposals");
    await runWorksheetMemoryAiProposalsShadowMode({
      events: [
        buildEvent({ eventId: "org1-a", organizationId: "org-1" }),
        buildEvent({ eventId: "org1-b", organizationId: "org-1", occurredAt: "2026-05-31T00:01:00.000Z" }),
        buildEvent({ eventId: "org1-c", organizationId: "org-1", occurredAt: "2026-05-31T00:02:00.000Z" }),
        buildEvent({ eventId: "org2-a", organizationId: "org-2", occurredAt: "2026-05-31T00:03:00.000Z" }),
        buildEvent({ eventId: "org2-b", organizationId: "org-2", occurredAt: "2026-05-31T00:04:00.000Z" }),
        buildEvent({ eventId: "org2-c", organizationId: "org-2", occurredAt: "2026-05-31T00:05:00.000Z" }),
      ],
    });

    expect(generateEditPlan).toHaveBeenCalledTimes(2);
    expect(generateEditPlan.mock.calls[0]?.[0]?.metadata).toMatchObject({ organizationId: "org-1" });
    expect(generateEditPlan.mock.calls[1]?.[0]?.metadata).toMatchObject({ organizationId: "org-2" });
  });

  it("rejects proposals with fewer than 3 evidence ids", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "assumption_preference",
        memoryCategory: "worksheet_pricing",
        memoryFamily: "assumption_preference",
        title: "Preferred assumption",
        summary: "Repeated preference.",
        confidence: 0.9,
        evidenceEventIds: ["event-1", "event-2"],
        contradictoryEventIds: [],
        retrievalGuidance: "Use when similar.",
        memoryValue: { preferredValue: 15 },
      }])),
    });

    const { runWorksheetMemoryAiProposalsShadowMode } = await import("./worksheet-memory-ai-proposals");
    const result = await runWorksheetMemoryAiProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1" }),
        buildEvent({ eventId: "event-2", occurredAt: "2026-05-31T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", occurredAt: "2026-05-31T00:02:00.000Z" }),
      ],
    });

    expect(result.acceptedByGate).toBe(0);
    expect(result.rejectedByGate).toBe(1);
    expect(result.proposals[0]?.rejectionReasons).toContain("evidence_count_below_threshold");
  });

  it("rejects invalid evidence ids", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "assumption_preference",
        memoryCategory: "worksheet_pricing",
        memoryFamily: "assumption_preference",
        title: "Preferred assumption",
        summary: "Repeated preference.",
        confidence: 0.9,
        evidenceEventIds: ["event-1", "missing-event", "event-2"],
        contradictoryEventIds: [],
        retrievalGuidance: "Use when similar.",
        memoryValue: { preferredValue: 15 },
      }])),
    });

    const { runWorksheetMemoryAiProposalsShadowMode } = await import("./worksheet-memory-ai-proposals");
    const result = await runWorksheetMemoryAiProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1" }),
        buildEvent({ eventId: "event-2", occurredAt: "2026-05-31T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", occurredAt: "2026-05-31T00:02:00.000Z" }),
      ],
    });

    expect(result.acceptedByGate).toBe(0);
    expect(result.proposals[0]?.rejectionReasons).toContain("evidence_ids_missing");
  });

  it("accepts same-organization evidence into a shadow proposal", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "assumption_preference",
        memoryCategory: "worksheet_pricing",
        memoryFamily: "assumption_preference",
        title: "Preferred waste factor",
        summary: "The estimator repeatedly prefers a lower waste factor in similar worksheets.",
        confidence: 0.84,
        evidenceEventIds: ["event-1", "event-2", "event-3"],
        contradictoryEventIds: [],
        retrievalGuidance: "Use cautiously in similar worksheets.",
        memoryValue: { preferredValue: 10, derivationMethod: "ai_assisted_v1" },
      }])),
    });

    const { runWorksheetMemoryAiProposalsShadowMode } = await import("./worksheet-memory-ai-proposals");
    const result = await runWorksheetMemoryAiProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1" }),
        buildEvent({ eventId: "event-2", occurredAt: "2026-05-31T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", occurredAt: "2026-05-31T00:02:00.000Z" }),
      ],
    });

    expect(result.acceptedByGate).toBe(1);
    expect(result.rejectedByGate).toBe(0);
    expect(result.proposals[0]).toMatchObject({
      gateStatus: "accepted",
      memoryFamily: "assumption_preference",
      memoryCategory: "worksheet_pricing",
    });
  });

  it("does not use backend keyword logic to decide semantic meaning", async () => {
    const generateEditPlan = vi.fn().mockResolvedValue(buildProviderResponse([{
      proposalKind: "assumption_preference",
      memoryCategory: "worksheet_pricing",
      memoryFamily: "assumption_preference",
      title: "Repeated spacing preference",
      summary: "These interpreted events describe the same repeated estimator preference.",
      confidence: 0.82,
      evidenceEventIds: ["event-1", "event-2", "event-3"],
      contradictoryEventIds: [],
      retrievalGuidance: "Use in similar worksheet contexts.",
      memoryValue: { preferredValue: "same-concept" },
    }]));
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan,
    });

    const { runWorksheetMemoryAiProposalsShadowMode } = await import("./worksheet-memory-ai-proposals");
    const result = await runWorksheetMemoryAiProposalsShadowMode({
      events: [
        buildEvent({
          eventId: "event-1",
          diffData: { ...buildEvent().diffData, itemLabel: "Post spacing", unit: "meter" },
        }),
        buildEvent({
          eventId: "event-2",
          occurredAt: "2026-05-31T00:01:00.000Z",
          diffData: { ...buildEvent().diffData, itemLabel: "Structural spacing", unit: "metres" },
        }),
        buildEvent({
          eventId: "event-3",
          occurredAt: "2026-05-31T00:02:00.000Z",
          diffData: { ...buildEvent().diffData, itemLabel: "Stud spacing", unit: "m" },
        }),
      ],
    });

    expect(result.acceptedByGate).toBe(1);
    expect(generateEditPlan).toHaveBeenCalledTimes(1);
    expect(generateEditPlan.mock.calls[0]?.[0]?.userPrompt).toContain("Post spacing");
    expect(generateEditPlan.mock.calls[0]?.[0]?.userPrompt).toContain("Structural spacing");
    expect(generateEditPlan.mock.calls[0]?.[0]?.userPrompt).toContain("Stud spacing");
  });

  it("does not write organization_memory_items in shadow mode", async () => {
    const { runWorksheetMemoryAiProposalsShadowMode } = await import("./worksheet-memory-ai-proposals");
    await runWorksheetMemoryAiProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1" }),
        buildEvent({ eventId: "event-2", occurredAt: "2026-05-31T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", occurredAt: "2026-05-31T00:02:00.000Z" }),
      ],
    });

    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("handles no_memory proposals safely", async () => {
    const { runWorksheetMemoryAiProposalsShadowMode } = await import("./worksheet-memory-ai-proposals");
    const result = await runWorksheetMemoryAiProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1" }),
        buildEvent({ eventId: "event-2", occurredAt: "2026-05-31T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", occurredAt: "2026-05-31T00:02:00.000Z" }),
      ],
    });

    expect(result.proposalsReturned).toBe(1);
    expect(result.acceptedByGate).toBe(0);
    expect(result.rejectedByGate).toBe(0);
    expect(result.proposals[0]).toMatchObject({
      gateStatus: "no_memory",
      proposalKind: "no_memory",
    });
  });
});
