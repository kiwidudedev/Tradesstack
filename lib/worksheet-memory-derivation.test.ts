import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();
const requirePlatformAdmin = vi.fn();
const runWorksheetMemoryAiProposalsShadowMode = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));
vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin,
}));
vi.mock("@/lib/worksheet-memory-ai-proposals", () => ({
  runWorksheetMemoryAiProposalsShadowMode,
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
      nearbyHeaders: ["Description", "Waste factor", "Unit"],
      nearbyRows: [
        {
          row: 6,
          rowLabel: "Inputs & Assumptions",
          unit: "%",
          visibleCells: [],
        },
      ],
      formulaReferences: [],
    },
    classificationStatus: "classified",
    classificationVersion: 1,
    classificationSource: "llm",
    classificationProvider: "openai",
    classificationModel: "gpt-5.5",
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
    classifiedAt: "2026-05-31T01:00:00.000Z",
    ...overrides,
  };
}

describe("worksheet memory derivation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requirePlatformAdmin.mockResolvedValue(undefined);
    runWorksheetMemoryAiProposalsShadowMode.mockResolvedValue({
      poolsBuilt: 1,
      proposalsReturned: 0,
      acceptedByGate: 0,
      rejectedByGate: 0,
      rejectionReasons: {},
      proposals: [],
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
  });

  it("derives assumption_pattern memories from repeated classified assumption events", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const events = [1, 2, 3].map((index) => buildEvent({ eventId: `event-${index}` }));

    const result = deriveWorksheetMemoryCandidates(events);
    const memory = result.candidates.find((candidate) => candidate.memoryType === "assumption_pattern");

    expect(memory).toBeDefined();
    expect(memory).toMatchObject({
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      evidenceCount: 3,
    });
    expect(memory?.memoryValue).toMatchObject({
      field: "waste_factor",
      preferredValue: 15,
    });
  });

  it("still derives memories from old shallow classification rows without interpretation payload", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const events = [1, 2, 3].map((index) =>
      buildEvent({
        eventId: `legacy-${index}`,
        interpretationPayload: undefined,
        interpretationSchemaVersion: undefined,
      }),
    );

    const result = deriveWorksheetMemoryCandidates(events);
    expect(result.candidates.some((candidate) => candidate.memoryType === "assumption_pattern")).toBe(true);
  });

  it("prefers interpretation payload context when present", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const events = [1, 2, 3].map((index) =>
      buildEvent({
        eventId: `interpreted-${index}`,
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: null, confidence: null },
          costRole: { value: null, confidence: null },
        },
        interpretationSchemaVersion: 2,
        interpretationPayload: {
          interpretedChange: {
            whatChanged: "Updated a labour rate.",
            changeType: "rate_update",
            oldValue: 80,
            newValue: 82,
            oldFormula: null,
            newFormula: null,
            unit: "hr",
            plainEnglishSummary: "Adjusted the labour rate.",
            businessMeaning: "Shows the preferred labour rate in this pricing context.",
            constructionContext: {
              tradeOrScope: "foundations",
              workCategory: "structural",
              systemCategory: null,
              workType: "pricing_input",
              pageType: "rates",
              sectionType: "pricing",
              itemCategory: "labour_rate",
            },
            pricingContext: {
              costRole: "labour",
              measurementBasis: "time",
              rateBasis: "hourly_rate",
            },
            formulaMeaning: null,
            aiCorrectionMeaning: null,
            futureUse: {
              memoryCandidate: true,
              memoryType: "rate_override_pattern",
              retrievalGuidance: "Prefer this labour rate in similar worksheets.",
              shouldInfluenceFutureGeneration: true,
              shouldInfluenceFutureReview: true,
            },
            confidence: {
              overall: 0.88,
              context: 0.86,
              futureUse: 0.82,
            },
          },
        },
      }),
    );

    const result = deriveWorksheetMemoryCandidates(events);
    const memory = result.candidates.find((candidate) => candidate.memoryType === "rate_override_pattern");

    expect(memory?.memoryValue).toMatchObject({
      costRole: "labour",
      pageType: "rates",
      businessMeaning: "Shows the preferred labour rate in this pricing context.",
      retrievalGuidance: "Prefer this labour rate in similar worksheets.",
    });
  });

  it("derives rate_override_pattern memories without mixing cost roles", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const labourEvents = [1, 2, 3].map((index) =>
      buildEvent({
        eventId: `labour-${index}`,
        eventType: "worksheet_rate_changed",
        diffData: {
          itemLabel: "Labour rate",
          rowLabel: "Labour",
          columnHeader: "Rate",
          unit: "hr",
          newValue: 82,
          oldValue: 80,
          nearbyHeaders: ["Description", "Rate", "Unit"],
          nearbyRows: [],
          formulaReferences: [],
        },
        semanticFields: {
          ...buildEvent().semanticFields,
          costRole: { value: "labour", confidence: 0.93 },
          itemCategory: { value: "labour_rate", confidence: 0.92 },
          normalizedUnit: { value: "hour", confidence: 0.95 },
          measurementBasis: { value: "time", confidence: 0.9 },
        },
      }),
    );
    const productivityEvents = [1, 2, 3].map((index) =>
      buildEvent({
        eventId: `prod-${index}`,
        eventType: "worksheet_rate_changed",
        diffData: {
          itemLabel: "Productivity",
          rowLabel: "Productivity",
          columnHeader: "Rate",
          unit: "m2/hr",
          newValue: 12,
          oldValue: 11,
          nearbyHeaders: ["Description", "Rate", "Unit"],
          nearbyRows: [],
          formulaReferences: [],
        },
        semanticFields: {
          ...buildEvent().semanticFields,
          costRole: { value: "productivity", confidence: 0.91 },
          itemCategory: { value: "productivity_rate", confidence: 0.9 },
          normalizedUnit: { value: "m2_per_hour", confidence: 0.95 },
          measurementBasis: { value: "area_time", confidence: 0.88 },
        },
      }),
    );

    const result = deriveWorksheetMemoryCandidates([...labourEvents, ...productivityEvents]);
    const rateMemories = result.candidates.filter((candidate) => candidate.memoryType === "rate_override_pattern");

    expect(rateMemories).toHaveLength(2);
    expect(rateMemories[0]?.memoryValue.costRole).not.toBe(rateMemories[1]?.memoryValue.costRole);
  });

  it("derives formula_pattern memories from repeated formula corrections", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const events = [1, 2, 3].map((index) =>
      buildEvent({
        eventId: `formula-${index}`,
        eventType: "worksheet_ai_formula_corrected",
        diffData: {
          itemLabel: "Stud qty",
          rowLabel: "Stud qty",
          columnHeader: "Formula",
          unit: null,
          oldFormula: "=ROUNDUP(A1/2.4,0)",
          newFormula: "=ROUNDUP(A1/2.1,0)",
          nearbyHeaders: ["Description", "Formula"],
          nearbyRows: [],
          formulaReferences: ["A1"],
        },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "materials", confidence: 0.8 },
          itemCategory: { value: "quantity_formula", confidence: 0.82 },
          costRole: { value: "material", confidence: 0.75 },
        },
      }),
    );

    const result = deriveWorksheetMemoryCandidates(events);
    const memory = result.candidates.find((candidate) => candidate.memoryType === "formula_pattern");

    expect(memory).toBeDefined();
    expect(memory?.memoryValue).toMatchObject({
      oldFormula: "=ROUNDUP(A1/2.4,0)",
      preferredFormula: "=ROUNDUP(A1/2.1,0)",
    });
  });

  it("derives worksheet_structure_pattern memories from repeated page-local structure", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const events = [1, 2, 3].map((index) =>
      buildEvent({
        eventId: `structure-${index}`,
        diffData: {
          itemLabel: "Margin",
          rowLabel: "Assumptions",
          columnHeader: "Margin markup",
          newValue: 0.15,
          oldValue: 0.12,
          nearbyHeaders: ["Description", "Unit rate", "Waste factor", "Margin markup"],
          nearbyRows: [
            { row: 3, rowLabel: "Inputs", unit: null, visibleCells: [] },
            { row: 4, rowLabel: "Materials", unit: null, visibleCells: [] },
          ],
          formulaReferences: [],
        },
      }),
    );

    const result = deriveWorksheetMemoryCandidates(events);
    const memory = result.candidates.find((candidate) => candidate.memoryType === "worksheet_structure_pattern");

    expect(memory).toBeDefined();
    expect(memory?.memoryValue).toMatchObject({
      nearbyHeaders: ["Description", "Unit rate", "Waste factor", "Margin markup"],
      pageType: "inputs",
    });
  });

  it("derives page_flow_pattern memories from repeated workbook page sequences", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const workbookIds = ["workbook-1", "workbook-2", "workbook-3"];
    const events = workbookIds.flatMap((workbookId, workbookIndex) => ([
      buildEvent({
        eventId: `${workbookId}-inputs`,
        metadata: { workbookId, sheetId: `${workbookId}-a`, sheetName: "1 Inputs", worksheetName: "1 Inputs", tradePackage: "Foundations" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "inputs", confidence: 0.9 },
        },
        classifiedAt: `2026-05-31T0${workbookIndex}:00:00.000Z`,
      }),
      buildEvent({
        eventId: `${workbookId}-materials`,
        metadata: { workbookId, sheetId: `${workbookId}-b`, sheetName: "2 Materials", worksheetName: "2 Materials", tradePackage: "Foundations" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "materials", confidence: 0.9 },
        },
        classifiedAt: `2026-05-31T0${workbookIndex}:10:00.000Z`,
      }),
      buildEvent({
        eventId: `${workbookId}-labour`,
        metadata: { workbookId, sheetId: `${workbookId}-c`, sheetName: "3 Labour", worksheetName: "3 Labour", tradePackage: "Foundations" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "labour", confidence: 0.9 },
        },
        classifiedAt: `2026-05-31T0${workbookIndex}:20:00.000Z`,
      }),
      buildEvent({
        eventId: `${workbookId}-summary`,
        metadata: { workbookId, sheetId: `${workbookId}-d`, sheetName: "4 Summary", worksheetName: "4 Summary", tradePackage: "Foundations" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "summary", confidence: 0.9 },
        },
        classifiedAt: `2026-05-31T0${workbookIndex}:30:00.000Z`,
      }),
    ]));

    const result = deriveWorksheetMemoryCandidates(events);
    const memory = result.candidates.find((candidate) => candidate.memoryType === "page_flow_pattern");

    expect(memory).toBeDefined();
    expect(memory?.memoryValue.pageTypeSequence).toEqual(["inputs", "materials", "labour", "summary"]);
  });

  it("does not create a memory from a one-off event", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const result = deriveWorksheetMemoryCandidates([buildEvent()]);

    expect(result.candidates).toEqual([]);
  });

  it("increases confidence with stronger evidence", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const lowEvidence = deriveWorksheetMemoryCandidates([1, 2, 3].map((index) => buildEvent({ eventId: `low-${index}` })));
    const highEvidence = deriveWorksheetMemoryCandidates(Array.from({ length: 10 }, (_, index) => buildEvent({ eventId: `high-${index}` })));

    const lowConfidence = lowEvidence.candidates[0]?.confidenceScore ?? 0;
    const highConfidence = highEvidence.candidates[0]?.confidenceScore ?? 0;

    expect(highConfidence).toBeGreaterThan(lowConfidence);
  });

  it("does not mix different units", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const events = [
      ...[1, 2].map((index) => buildEvent({ eventId: `m-${index}` })),
      buildEvent({
        eventId: "lm-1",
        diffData: { ...buildEvent().diffData, unit: "lm" },
        semanticFields: {
          ...buildEvent().semanticFields,
          normalizedUnit: { value: "linear_meter", confidence: 0.9 },
        },
      }),
    ];

    const result = deriveWorksheetMemoryCandidates(events);
    expect(result.candidates).toEqual([]);
  });

  it("does not mix different page types", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const events = [
      ...[1, 2].map((index) => buildEvent({ eventId: `inputs-${index}` })),
      buildEvent({
        eventId: "summary-1",
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "summary", confidence: 0.92 },
        },
      }),
    ];

    const result = deriveWorksheetMemoryCandidates(events);
    expect(result.candidates).toEqual([]);
  });

  it("keeps organization memory isolated", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const events = [
      ...[1, 2, 3].map((index) => buildEvent({ eventId: `org1-${index}`, organizationId: "org-1" })),
      ...[1, 2, 3].map((index) => buildEvent({ eventId: `org2-${index}`, organizationId: "org-2" })),
    ];

    const result = deriveWorksheetMemoryCandidates(events);
    expect(new Set(result.candidates.map((candidate) => candidate.organizationId))).toEqual(new Set(["org-1", "org-2"]));
  });

  it("ignores pending and failed events", async () => {
    const { deriveWorksheetMemoryCandidates } = await import("./worksheet-memory-derivation");
    const result = deriveWorksheetMemoryCandidates([
      buildEvent({ eventId: "classified-1" }),
      buildEvent({ eventId: "classified-2" }),
      buildEvent({ eventId: "classified-3" }),
      buildEvent({ eventId: "pending-1", classificationStatus: "pending" }),
      buildEvent({ eventId: "failed-1", classificationStatus: "failed" }),
    ]);

    const assumptionMemory = result.candidates.find((candidate) => candidate.memoryType === "assumption_pattern");
    expect(assumptionMemory?.evidenceCount).toBe(3);
  });

  it("persists derived worksheet memories into organization_memory_items", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [buildEvent(), buildEvent({ eventId: "event-2" }), buildEvent({ eventId: "event-3" })],
      error: null,
    });
    const select = vi.fn().mockResolvedValue({
      data: [
        {
          id: "memory-1",
          organization_id: "org-1",
          memory_category: "worksheet_pricing",
          memory_type: "assumption_pattern",
          memory_key: "key-1",
        },
      ],
      error: null,
    });
    const upsert = vi.fn(() => ({ select }));
    createAdminSupabaseClient.mockReturnValue({
      rpc,
      from: () => ({
        upsert,
      }),
    });

    const { runWorksheetMemoryDerivation } = await import("./worksheet-memory-derivation");
    const result = await runWorksheetMemoryDerivation({
      organizationId: "org-1",
      limit: 10,
    });

    expect(requirePlatformAdmin).toHaveBeenCalledWith("admin");
    expect(rpc).toHaveBeenCalledWith("list_classified_worksheet_memory_events", {
      p_organization_id: "org-1",
      p_limit: 10,
    });
    expect(upsert).toHaveBeenCalled();
    expect(result).toMatchObject({
      fetchedCount: 3,
      persistedCount: 1,
      aiShadow: {
        poolsBuilt: 1,
      },
    });
  });
});
