import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();
const getPricingWorksheetAiProvider = vi.fn();
const getPricingWorksheetAiProviderName = vi.fn();
const getPricingWorksheetAnthropicModel = vi.fn();
const getPricingWorksheetOpenAiModel = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));
vi.mock("@/lib/ai/providers/pricing-worksheet/registry", () => ({
  getPricingWorksheetAiProvider,
  getPricingWorksheetAiProviderName,
  getPricingWorksheetAnthropicModel,
  getPricingWorksheetOpenAiModel,
}));

function buildPendingEvent(overrides: Record<string, unknown> = {}) {
  const attemptNumber =
    typeof overrides.attemptNumber === "number" && Number.isFinite(overrides.attemptNumber)
      ? overrides.attemptNumber
      : typeof overrides.nextAttemptNumber === "number" && Number.isFinite(overrides.nextAttemptNumber)
        ? overrides.nextAttemptNumber
        : 1;

  return {
    queueId: "queue-1",
    eventId: "event-1",
    organizationId: "org-1",
    projectId: "project-1",
    opportunityId: "opp-1",
    eventType: "worksheet_assumption_changed",
    occurredAt: "2026-05-31T00:00:00.000Z",
    classificationVersion: 1,
    attemptNumber,
    nextAttemptNumber: attemptNumber,
    claimToken: "claim-token-1",
    claimExpiresAt: "2026-05-31T00:10:00.000Z",
    metadata: {
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Inputs",
      worksheetName: "Inputs",
      tradePackage: "Foundations",
    },
    diffData: {
      classificationStatus: "pending",
      rawContextVersion: 1,
      eventCaptureVersion: 1,
      rowLabel: "Inputs & Assumptions",
      itemLabel: "Embedment depth",
      columnHeader: "Waste factor",
      nearbyHeaders: ["Qty", "Unit", "Waste factor", "Total"],
      nearbyRows: [
        {
          row: 6,
          rowLabel: "Inputs & Assumptions",
          unit: "m",
          visibleCells: [
            {
              column: "D",
              header: "Unit",
              value: "m",
              formula: null,
            },
          ],
        },
      ],
      unit: "m",
      formula: null,
      formulaReferences: [],
      oldValue: null,
      newValue: 1.5,
      aiInteractionId: "ai-1",
      generatedByAi: false,
    },
    ...overrides,
  };
}

function buildPricingAwarePendingEvent(overrides: Record<string, unknown> = {}) {
  return buildPendingEvent({
    eventType: "worksheet_formula_edited",
    metadata: {
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Suspended Ceilings",
      worksheetName: "Suspended Ceilings",
      tradePackage: "Ceilings",
    },
    diffData: {
      classificationStatus: "pending",
      rawContextVersion: 1,
      eventCaptureVersion: 1,
      source: "manual",
      cell: "E8",
      cellAddress: "E8",
      row: 8,
      rowIndex: 7,
      column: "E",
      columnId: "E",
      columnHeader: "Quantity",
      columnRole: "quantity",
      rowLabel: "Component Quantities",
      itemLabel: "Main Tees (3600mm)",
      sectionLabel: "Component Quantities",
      subsectionLabel: null,
      sectionPath: ["Inputs", "Suspended Ceilings"],
      nearbyHeaders: ["Description", "Unit", "Quantity", "Material Rate", "Labour Hours"],
      nearbyRows: [
        {
          row: 7,
          rowLabel: "Inputs",
          unit: "%",
          visibleCells: [
            { column: "C", header: "Description", value: "Waste allowance for cutting and perimeter", formula: null },
            { column: "D", header: "Unit", value: "%", formula: null },
            { column: "E", header: "Quantity", value: 12.5, formula: null },
          ],
        },
        {
          row: 9,
          rowLabel: "Component Quantities",
          unit: "lm",
          visibleCells: [
            { column: "C", header: "Description", value: "Cross tee quantity", formula: null },
            { column: "D", header: "Unit", value: "lm", formula: null },
            { column: "E", header: "Quantity", value: 300, formula: "=E3*3" },
          ],
        },
      ],
      unit: "lm",
      formula: "=IFERROR(ROUNDUP((E3/(E4/1000))*(1+(E6/100)),1),\"\")",
      formulaReferences: ["E3", "E4", "E6", "Z99", "AA1"],
      referencedCellsSnapshot: [
        { ref: "E3", rowLabel: "Inputs", itemLabel: "Ceiling Area", columnHeader: "Quantity", value: 100 },
        { ref: "E4", rowLabel: "Inputs", itemLabel: "Grid Spacing", columnHeader: "Quantity", value: 600 },
        { ref: "E6", rowLabel: "Inputs", itemLabel: "Perimeter Waste Factor", columnHeader: "Quantity", value: 12.5 },
        { ref: "D8", rowLabel: "Component Quantities", itemLabel: "Main Tees (3600mm)", columnHeader: "Unit", value: "lm" },
        { ref: "H8", rowLabel: "Component Quantities", itemLabel: "Main Tees (3600mm)", columnHeader: "Labour Rate", value: 42 },
      ],
      oldValue: "=IFERROR(ROUNDUP((E3/(E4/1000))*(1+(E6/100)),0),\"\")",
      newValue: "=IFERROR(ROUNDUP((E3/(E4/1000))*(1+(E6/100)),1),\"\")",
      oldFormula: "=IFERROR(ROUNDUP((E3/(E4/1000))*(1+(E6/100)),0),\"\")",
      newFormula: "=IFERROR(ROUNDUP((E3/(E4/1000))*(1+(E6/100)),1),\"\")",
      pricingTuple: {
        quantity: 420,
        rate: null,
        amount: null,
        unit: "lm",
        labour: 42,
        material: null,
      },
      rowSnapshotAfter: {
        row: 8,
        rowIndex: 7,
        rowLabel: "Component Quantities",
        itemLabel: "Main Tees (3600mm)",
        unit: "lm",
      },
      rowSnapshotVisibleCells: [
        { column: "A", header: "Section", columnRole: "unknown", value: "Component Quantities", formula: null, displayValue: "Component Quantities" },
        { column: "B", header: "Item", columnRole: "unknown", value: "Main Tees (3600mm)", formula: null, displayValue: "Main Tees (3600mm)" },
        { column: "C", header: "Description", columnRole: "description", value: "Rondo DONN 24mm main tee - qty based on grid spacing and area", formula: null, displayValue: "Rondo DONN 24mm main tee - qty based on grid spacing and area" },
        { column: "D", header: "Unit", columnRole: "unit", value: "lm", formula: null, displayValue: "lm" },
        { column: "E", header: "Quantity", columnRole: "quantity", value: 420, formula: "=IFERROR(ROUNDUP((E3/(E4/1000))*(1+(E6/100)),1),\"\")", displayValue: "420" },
        { column: "H", header: "Labour Rate", columnRole: "labour", value: 42, formula: null, displayValue: "42" },
        { column: "K", header: "Notes", columnRole: "notes", value: "ceiling area divided by spacing then waste", formula: null, displayValue: "ceiling area divided by spacing then waste" },
      ],
      relatedRows: [
        {
          row: 7,
          rowLabel: "Inputs",
          itemLabel: "Perimeter Waste Factor",
          unit: "%",
          visibleCells: [
            { column: "D", header: "Unit", columnRole: "unit", value: "%", formula: null },
            { column: "E", header: "Quantity", columnRole: "quantity", value: 12.5, formula: null },
          ],
        },
        {
          row: 9,
          rowLabel: "Component Quantities",
          itemLabel: "Cross Tees",
          unit: "lm",
          visibleCells: [
            { column: "D", header: "Unit", columnRole: "unit", value: "lm", formula: null },
            { column: "E", header: "Quantity", columnRole: "quantity", value: 300, formula: null },
          ],
        },
        {
          row: 10,
          rowLabel: "Component Quantities",
          itemLabel: "Perimeter Trim",
          unit: "lm",
          visibleCells: [
            { column: "D", header: "Unit", columnRole: "unit", value: "lm", formula: null },
            { column: "E", header: "Quantity", columnRole: "quantity", value: 95, formula: null },
          ],
        },
      ],
      evidenceSchemaVersion: 2,
      captureCompletenessScore: 0.91,
      rowSnapshotCompleteness: 0.88,
      captureWarnings: [],
      aiInteractionId: "ai-1",
      generatedByAi: false,
    },
    ...overrides,
  });
}

function buildClassificationResult(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "event-1",
    costRole: { value: null, confidence: 0.18 },
    cellRole: { value: "assumption_input", confidence: 0.88 },
    pageType: { value: "inputs", confidence: 0.84 },
    sectionType: { value: "assumptions", confidence: 0.79 },
    itemCategory: { value: "dimension_input", confidence: 0.74 },
    measurementBasis: { value: "length", confidence: 0.7 },
    normalizedUnit: { value: "m", confidence: 0.95 },
    normalizedTradePackage: { value: "foundations", confidence: 0.63 },
    workCategory: { value: "structural", confidence: 0.52 },
    systemCategory: { value: null, confidence: 0.2 },
    assemblyCategory: { value: null, confidence: 0.18 },
    overallConfidence: 0.82,
    reasoningSummary: "The edit looks like an input assumption on an inputs page.",
    interpretationSchemaVersion: 2,
    interpretationPayload: {
      interpretedChange: {
        whatChanged: "Estimator updated an input assumption value.",
        changeType: "assumption_update",
        oldValue: null,
        newValue: 1.5,
        oldFormula: null,
        newFormula: null,
        unit: "m",
        plainEnglishSummary: "Updated the embedment depth assumption on the inputs page.",
        businessMeaning: "This changes a base estimating assumption that downstream quantities or rates may depend on.",
        constructionMeaning: "This is an estimating input tied to physical installation depth in the worksheet scope.",
        pricingMeaning: "Future AI should treat this as an editable quantity-driving assumption rather than a fixed constant.",
        constructionContext: {
          tradeOrScope: "foundations",
          workCategory: "structural",
          systemCategory: null,
          workType: "input_assumption",
          pageType: "inputs",
          sectionType: "assumptions",
          itemCategory: "dimension_input",
        },
        pricingContext: {
          costRole: null,
          measurementBasis: "length",
          rateBasis: null,
        },
        formulaMeaning: null,
        aiCorrectionMeaning: null,
        futureUse: {
          memoryCandidate: true,
          memoryType: "assumption_pattern",
          retrievalGuidance: "Use this as a likely preferred assumption in similar worksheet input sections.",
          shouldInfluenceFutureGeneration: true,
          shouldInfluenceFutureReview: true,
        },
        confidence: {
          overall: 0.82,
          context: 0.79,
          futureUse: 0.74,
        },
      },
    },
    ...overrides,
  };
}

function buildCompactAnthropicClassificationResult(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "event-1",
    overallConfidence: 0.67,
    reasoningSummary: "This looks like an assumption change that should guide future worksheet generation.",
    interpretationPayload: {
      whatChanged: "Estimator changed an assumption input value.",
      plainEnglishSummary: "Updated the worksheet assumption used for similar estimating inputs.",
      businessMeaning: "This reflects a company estimating preference that may affect downstream pricing logic.",
      constructionMeaning: "The change belongs to worksheet input assumptions for this scope.",
      pricingMeaning: "Future AI should treat this as a preferred assumption input rather than a fixed default.",
      futureUse: "Use this as a likely preference when generating or reviewing similar worksheet assumptions.",
      memoryCandidate: true,
      memoryType: "assumption_pattern",
      retrievalGuidance: "Prefer this assumption pattern on similar inputs pages.",
      shouldInfluenceFutureGeneration: true,
      shouldInfluenceFutureReview: true,
      changeType: "assumption_update",
      oldValue: "",
      newValue: "1.5",
      oldFormula: "",
      newFormula: "",
      unit: "m",
      formulaMeaning: "",
      aiCorrectionMeaning: "",
      contextConfidence: 0.61,
      futureUseConfidence: 0.64,
    },
    semanticSummary: {
      costRole: "",
      pageType: "inputs",
      itemCategory: "dimension_input",
      normalizedUnit: "m",
      normalizedTradePackage: "foundations",
    },
    ...overrides,
  };
}

function buildSemanticOnlyClassificationResult(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "event-1",
    costRole: { value: null, confidence: 0.18 },
    cellRole: { value: "assumption_input", confidence: 0.52 },
    pageType: { value: "inputs", confidence: 0.49 },
    sectionType: { value: "assumptions", confidence: 0.44 },
    itemCategory: { value: null, confidence: 0.22 },
    measurementBasis: { value: null, confidence: 0.19 },
    normalizedUnit: { value: "m", confidence: 0.93 },
    normalizedTradePackage: { value: "foundations", confidence: 0.41 },
    workCategory: { value: null, confidence: 0.25 },
    systemCategory: { value: null, confidence: 0.19 },
    assemblyCategory: { value: null, confidence: 0.17 },
    overallConfidence: 0.31,
    reasoningSummary: "This looks like an assumption input, but the context is limited.",
    interpretationSchemaVersion: 2,
    ...overrides,
  };
}

function buildProviderTimeoutError(provider: "openai" | "anthropic", model: string) {
  return Object.assign(new Error("Upstream request timed out."), {
    code: "provider_timeout",
    provider,
    model,
    status: null,
    retryable: true,
    rawError: {
      originalError: {
        name: "TimeoutError",
        message: "Upstream request timed out.",
      },
      requestSummary: {
        workflowStage: "worksheet_event_interpretation",
        schemaKind: "worksheet_event_interpretation",
        schemaSizeBytes: 1750,
        unsupportedKeywordCount: 0,
        optionalParameterCount: 0,
        hasWorksheetEventInterpretationSchema: true,
        hasTools: false,
        hasToolChoice: false,
        hasOutputConfig: false,
        outputConfigFormatType: null,
        anthropicVersion: "2023-06-01",
        hasAnthropicBetaHeader: false,
      },
    },
  });
}

function buildProviderSchemaParseError(params: {
  model: string;
  parseFailureReason: "truncated_json" | "malformed_json";
  retryable?: boolean;
  stopReason?: string | null;
  outputTextLength?: number | null;
  parseErrorType?: string | null;
}) {
  return Object.assign(
    new Error(`AI assistant returned an unreadable response (${params.parseFailureReason}).`),
    {
      code: "provider_schema_parse_failed",
      provider: "anthropic",
      model: params.model,
      status: null,
      retryable: params.retryable ?? (params.parseFailureReason === "truncated_json"),
      rawError: {
        parseFailureReason: params.parseFailureReason,
        stopReason: params.stopReason ?? (params.parseFailureReason === "truncated_json" ? "max_tokens" : "end_turn"),
        outputTextLength: params.outputTextLength ?? 4200,
        maxTokens: 1200,
        parseErrorType: params.parseErrorType ?? "json_parse_failed",
      },
    },
  );
}

function buildAdminClient(params: {
  rpc: ReturnType<typeof vi.fn>;
  aiInteractionRows?: Array<Record<string, unknown>>;
}) {
  const builder: {
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
    select: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
  } = {
    data: params.aiInteractionRows ?? [],
    error: null,
    select: vi.fn(),
    in: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);

  return {
    rpc: params.rpc,
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "ai_interactions") {
        return builder;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("worksheet event semantic classification", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalClassificationProvider = process.env.WORKSHEET_EVENT_CLASSIFICATION_PROVIDER;
  const originalWorksheetEventClassificationAnthropicModel = process.env.WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL;
  const originalAnthropicWorksheetEventClassificationModel = process.env.ANTHROPIC_WORKSHEET_EVENT_CLASSIFICATION_MODEL;
  const originalAnthropicWorksheetModel = process.env.ANTHROPIC_WORKSHEET_MODEL;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.WORKSHEET_EVENT_CLASSIFICATION_PROVIDER;
    delete process.env.WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_WORKSHEET_EVENT_CLASSIFICATION_MODEL;
    delete process.env.ANTHROPIC_WORKSHEET_MODEL;
    getPricingWorksheetAiProviderName.mockReturnValue("openai");
    getPricingWorksheetOpenAiModel.mockReturnValue("gpt-5.5");
    getPricingWorksheetAnthropicModel.mockReturnValue("claude-sonnet-4-6");
  });

  afterAll(() => {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    }

    if (originalClassificationProvider === undefined) {
      delete process.env.WORKSHEET_EVENT_CLASSIFICATION_PROVIDER;
    } else {
      process.env.WORKSHEET_EVENT_CLASSIFICATION_PROVIDER = originalClassificationProvider;
    }

    if (originalWorksheetEventClassificationAnthropicModel === undefined) {
      delete process.env.WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL;
    } else {
      process.env.WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL = originalWorksheetEventClassificationAnthropicModel;
    }

    if (originalAnthropicWorksheetEventClassificationModel === undefined) {
      delete process.env.ANTHROPIC_WORKSHEET_EVENT_CLASSIFICATION_MODEL;
    } else {
      process.env.ANTHROPIC_WORKSHEET_EVENT_CLASSIFICATION_MODEL = originalAnthropicWorksheetEventClassificationModel;
    }

    if (originalAnthropicWorksheetModel === undefined) {
      delete process.env.ANTHROPIC_WORKSHEET_MODEL;
    } else {
      process.env.ANTHROPIC_WORKSHEET_MODEL = originalAnthropicWorksheetModel;
    }
  });

  it("builds interpretation_input_v1 with compact estimator-facing row, pricing, and formula signals", async () => {
    const { buildInterpretationInputV1 } = await import("./worksheet-event-semantic-classification");
    const input = buildInterpretationInputV1(buildPricingAwarePendingEvent());

    expect(input.rowEvidence.changedRow.bestDescriptionText).toContain("Rondo DONN 24mm main tee");
    expect(input.rowEvidence.changedRow.pricingRolesPresent).toEqual([
      "description",
      "unit",
      "quantity",
      "labour",
      "notes",
    ]);
    expect(input.pricingContext).toMatchObject({
      quantity: 420,
      unit: "lm",
      labour: 42,
      hasCompleteTuple: true,
      changedPricingField: "quantity",
    });
    expect(input.formulaContext.affectsPricingTuple).toBe(true);
    expect(input.formulaContext.references).toHaveLength(4);
    expect(input.rowEvidence.relatedRowKinds).toEqual(["previous", "next", "same_section"]);
    expect(input.rowEvidence.relatedRowSignals).toHaveLength(2);
    expect(JSON.stringify(input)).not.toContain("\"nearbyRows\"");
    expect(JSON.stringify(input)).not.toContain("\"rowSnapshotAfter\"");
    expect(JSON.stringify(input)).not.toContain("\"referencedCellsSnapshot\"");
  });

  it("flags missing critical context when row meaning is weak", async () => {
    const { buildInterpretationInputV1 } = await import("./worksheet-event-semantic-classification");
    const input = buildInterpretationInputV1(buildPendingEvent({
      diffData: {
        classificationStatus: "pending",
        rawContextVersion: 1,
        eventCaptureVersion: 1,
        source: "manual",
        rowLabel: "",
        itemLabel: "",
        columnHeader: "",
        unit: "",
        oldValue: 100,
        newValue: 120,
        rowSnapshotVisibleCells: [],
        relatedRows: [],
        formulaReferences: [],
        captureWarnings: ["missing_column_header"],
      },
    }));

    expect(input.captureQuality.missingCriticalContext).toBe(true);
    expect(input.pricingContext.hasCompleteTuple).toBe(false);
  });

  it("uses a smaller compact interpretation input than a row-heavy raw evidence payload", async () => {
    const { buildInterpretationInputV1, buildWorksheetSemanticClassificationUserPrompt } = await import("./worksheet-event-semantic-classification");
    const event = buildPricingAwarePendingEvent();
    const interpretationInput = buildInterpretationInputV1(event);

    const prompt = buildWorksheetSemanticClassificationUserPrompt(
      [event],
      1,
      new Map(),
      { directJsonMode: true },
    );

    const legacyShape = {
      ...event.diffData,
      workbookId: event.metadata.workbookId,
      sheetId: event.metadata.sheetId,
      sheetName: event.metadata.sheetName,
      worksheetName: event.metadata.worksheetName,
      tradePackage: event.metadata.tradePackage,
    };
    expect(Buffer.byteLength(JSON.stringify(interpretationInput), "utf8")).toBeLessThan(
      Buffer.byteLength(JSON.stringify(legacyShape), "utf8"),
    );
    expect(Buffer.byteLength(prompt, "utf8")).toBeGreaterThan(0);
    expect(prompt).not.toContain("\"nearbyRows\"");
    expect(prompt).toContain("changedRow.bestDescriptionText");
    expect(prompt).toContain("relatedRowKinds");
  });

  it("classifies pending worksheet events and links records to source events", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({
      rpc,
      aiInteractionRows: [{
        id: "ai-1",
        organization_id: "org-1",
        input_context_summary: {
          workbookId: "workbook-1",
          sheetId: "sheet-1",
          sheetName: "Inputs",
          worksheetName: "Inputs",
          tradePackage: "Foundations",
          constructionIntent: {
            primaryIntent: "worksheet_edit",
            defaultJurisdiction: "AUS_NZ",
            tradeHints: ["foundations"],
            systemHints: ["concrete"],
            confidence: "high",
            riskLevel: "medium",
            requiresRetrieval: false,
            recommendedPromptPath: "edit",
            reason: "Matched worksheet editing intent.",
            retrievalReasons: ["pricing logic"],
          },
          organizationGuidanceSummary: "This company usually keeps quantity-driving assumptions explicit on input pages.",
        },
      }],
    }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification();

    expect(result).toMatchObject({
      selectedEventCount: 1,
      classifiedCount: 1,
      lowConfidenceCount: 0,
      failedCount: 0,
      skippedCount: 0,
      provider: "openai",
      model: "gpt-5.5",
    });
    expect(rpc.mock.calls[0]?.[0]).toBe("claim_worksheet_event_classification_batch");
    expect(rpc.mock.calls[1]?.[0]).toBe("finalize_worksheet_event_classification_claims");
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]).toMatchObject({
      sourceEventId: "event-1",
      classificationStatus: "classified",
      classificationSource: "llm",
      classificationVersion: 1,
      attemptNumber: 1,
      claimToken: "claim-token-1",
      interpretationSchemaVersion: 2,
      semanticFields: {
        cellRole: { value: "assumption_input", confidence: 0.88 },
      },
      interpretationPayload: {
        interpretedChange: {
          whatChanged: "Estimator updated an input assumption value.",
        },
      },
      interpretationPromptVersion: 4,
      contextSources: {
        rawWorksheetEvent: true,
        constructionIntent: true,
      },
      constructionIntelligenceInputs: {
        organizationGuidanceSummary: expect.any(String),
      },
      futureUseSummary: {
        memoryCandidate: true,
      },
      confidenceDetail: {
        overall: 0.82,
      },
    });
  });

  it("prioritizes fresh pending events ahead of retryable failed events", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [
        buildPendingEvent({
          eventId: "retry-old",
          occurredAt: "2026-05-31T00:00:00.000Z",
          nextAttemptNumber: 2,
        }),
        buildPendingEvent({
          eventId: "fresh-new",
          occurredAt: "2026-05-31T02:00:00.000Z",
          nextAttemptNumber: 1,
        }),
      ],
      error: null,
    });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));

    const { listPendingWorksheetSemanticClassificationBatch } = await import("./worksheet-event-semantic-classification");
    const events = await listPendingWorksheetSemanticClassificationBatch();

    expect(events.map((event) => event.eventId)).toEqual(["fresh-new", "retry-old"]);
  });

  it("orders fresh pending events newest first", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [
        buildPendingEvent({
          eventId: "fresh-older",
          occurredAt: "2026-05-31T01:00:00.000Z",
          nextAttemptNumber: 1,
        }),
        buildPendingEvent({
          eventId: "fresh-newer",
          occurredAt: "2026-05-31T03:00:00.000Z",
          nextAttemptNumber: 1,
        }),
      ],
      error: null,
    });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));

    const { listPendingWorksheetSemanticClassificationBatch } = await import("./worksheet-event-semantic-classification");
    const events = await listPendingWorksheetSemanticClassificationBatch();

    expect(events.map((event) => event.eventId)).toEqual(["fresh-newer", "fresh-older"]);
  });

  it("keeps retryable failed events available when no fresh pending events remain", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [
        buildPendingEvent({
          eventId: "retry-earlier",
          occurredAt: "2026-05-31T00:30:00.000Z",
          nextAttemptNumber: 2,
        }),
        buildPendingEvent({
          eventId: "retry-later-attempt",
          occurredAt: "2026-05-31T00:45:00.000Z",
          nextAttemptNumber: 3,
        }),
      ],
      error: null,
    });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));

    const { listPendingWorksheetSemanticClassificationBatch } = await import("./worksheet-event-semantic-classification");
    const events = await listPendingWorksheetSemanticClassificationBatch();

    expect(events.map((event) => event.eventId)).toEqual(["retry-earlier", "retry-later-attempt"]);
  });

  it("uses PRICING_WORKSHEET_AI_PROVIDER before raw API-key presence", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });
    const provider = {
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    };

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification();

    expect(getPricingWorksheetAiProvider).toHaveBeenCalledWith("anthropic");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  it("uses WORKSHEET_EVENT_CLASSIFICATION_PROVIDER ahead of worksheet defaults", async () => {
    process.env.WORKSHEET_EVENT_CLASSIFICATION_PROVIDER = "openai";

    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });
    const provider = {
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    };

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification();

    expect(getPricingWorksheetAiProvider).toHaveBeenCalledWith("openai");
    expect(result.provider).toBe("openai");
  });

  it("does not select OpenAI merely because OPENAI_API_KEY exists", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });
    const provider = {
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    };

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(getPricingWorksheetAiProvider).not.toHaveBeenCalledWith("openai");
    expect(getPricingWorksheetAiProvider).toHaveBeenCalledWith("anthropic");
  });

  it("defaults Anthropic worksheet interpretation to a faster classification model when no env override is set", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });
    const provider = {
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    };

    delete process.env.WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_WORKSHEET_EVENT_CLASSIFICATION_MODEL;
    process.env.ANTHROPIC_WORKSHEET_MODEL = "claude-sonnet-4-6";
    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(provider.generateEditPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
        maxOutputTokens: 1200,
        timeoutMs: 20000,
      }),
    );
  });

  it("prefers WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL when set", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });
    const provider = {
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-custom-fast",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    };

    process.env.WORKSHEET_EVENT_CLASSIFICATION_ANTHROPIC_MODEL = "claude-custom-fast";
    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(provider.generateEditPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-custom-fast",
      }),
    );
  });

  it("stores low confidence classifications safely", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [
            buildClassificationResult({
              overallConfidence: 0.31,
              reasoningSummary: "Context is weak, so this is only a tentative classification.",
            }),
          ],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification({
      organizationId: "org-1",
    });

    expect(result.lowConfidenceCount).toBe(1);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_organization_id: "org-1",
    });
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]).toMatchObject({
      classificationStatus: "low_confidence",
      overallConfidence: 0.31,
      interpretationPayload: {
        interpretedChange: {
          plainEnglishSummary: expect.any(String),
        },
      },
      futureUseSummary: {
        memoryCandidate: true,
      },
    });
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).not.toEqual({});
  });

  it("uses interpretation_input_v1 in classifier input and asks for bounded interpretation output", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [buildPendingEvent()], error: null })
      .mockResolvedValueOnce({ data: { count: 1, ids: ["classification-1"] }, error: null });
    const provider = {
      defaultModel: "anthropic",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        rawProviderResponse: {},
        parsedJson: { classifications: [buildClassificationResult()] },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    };

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({
      rpc,
      aiInteractionRows: [{
        id: "ai-1",
        organization_id: "org-1",
        input_context_summary: {
          workbookId: "workbook-1",
          sheetId: "sheet-1",
          sheetName: "Inputs",
          worksheetName: "Inputs",
          tradePackage: "Foundations",
          constructionIntent: {
            primaryIntent: "worksheet_edit",
            defaultJurisdiction: "AUS_NZ",
            tradeHints: ["foundations"],
            systemHints: ["concrete"],
            confidence: "high",
            riskLevel: "medium",
            requiresRetrieval: false,
            recommendedPromptPath: "edit",
            reason: "Matched worksheet editing intent.",
            retrievalReasons: ["pricing logic"],
          },
          organizationGuidanceSummary: "Keep assumptions explicit and editable.",
        },
      }],
    }));
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification({ provider: "anthropic" });

    const call = provider.generateEditPlan.mock.calls[0]?.[0];
    expect(call?.metadata).toMatchObject({
      workflow: "worksheet_event_semantic_classification",
      workflowStage: "worksheet_event_interpretation",
    });
    expect(call?.systemPrompt).toContain("Interpret each worksheet change as a reusable construction intelligence learning record.");
    expect(call?.systemPrompt).toContain("Distinguish facts from assumptions and uncertainty.");
    expect(call?.systemPrompt).toContain("Never present assumptions as facts.");
    expect(call?.systemPrompt).toContain("Prioritize trustworthiness over creativity.");
    expect(call?.userPrompt).toContain("businessMeaning");
    expect(call?.userPrompt).toContain("constructionMeaning");
    expect(call?.userPrompt).toContain("pricingMeaning");
    expect(call?.userPrompt).toContain("futureUse");
    expect(call?.userPrompt).toContain("Separate the result into Observed, KnownImpact, Interpretation, and FutureUse.");
    expect(call?.userPrompt).toContain("Do not state unsupported structural adequacy, compliance, engineering intent, design intent, or commercial strategy claims as facts.");
    expect(call?.userPrompt).toContain("changedRow.bestDescriptionText");
    expect(call?.userPrompt).toContain("relatedRowKinds");
    expect(call?.userPrompt).toContain("missingCriticalContext");
    expect(call?.userPrompt).toContain("Foundations");
  });

  it("stores interpretedChange for assumption edits", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [buildPendingEvent()], error: null })
      .mockResolvedValueOnce({ data: { count: 1, ids: ["classification-1"] }, error: null });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: { classifications: [buildClassificationResult()] },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).toMatchObject({
      interpretedChange: {
        whatChanged: expect.any(String),
        plainEnglishSummary: expect.any(String),
      },
    });
  });

  it("maps compact Anthropic interpretation payloads into the internal interpretedChange shape", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [buildPendingEvent()], error: null })
      .mockResolvedValueOnce({ data: { count: 1, ids: ["classification-1"] }, error: null });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildCompactAnthropicClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).toMatchObject({
      interpretedChange: {
        whatChanged: "Estimator changed an assumption input value.",
        plainEnglishSummary: expect.any(String),
        businessMeaning: expect.any(String),
        constructionMeaning: expect.any(String),
        pricingMeaning: expect.any(String),
        observed: {
          changeSummary: "Estimator changed an assumption input value.",
        },
        knownImpact: {
          worksheetImpact: expect.any(String),
          pricingImpact: expect.any(String),
        },
        interpretation: {
          estimatorBehavior: expect.stringContaining("Estimator changed"),
        },
        futureUse: {
          memoryCandidate: true,
          memoryType: "assumption_pattern",
          retrievalGuidance: "Prefer this assumption pattern on similar inputs pages.",
        },
        constructionContext: {
          tradeOrScope: "foundations",
          pageType: "inputs",
          itemCategory: "dimension_input",
        },
      },
    });
  });

  it("downgrades unsupported engineering claims into cautious construction meaning", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [buildPendingEvent()], error: null })
      .mockResolvedValueOnce({ data: { count: 1, ids: ["classification-1"] }, error: null });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [
            buildCompactAnthropicClassificationResult({
              interpretationPayload: {
                ...buildCompactAnthropicClassificationResult().interpretationPayload,
                constructionMeaning:
                  "Tighter spacing improves structural capacity, reduces deflection risk, and complies with structural code requirements.",
              },
            }),
          ],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).toMatchObject({
      interpretedChange: {
        constructionMeaning:
          "This appears to be a construction-related worksheet assumption change that may affect downstream quantities, layout, or estimating inputs.",
      },
    });
  });

  it("downgrades unsupported business motive claims into cautious estimator-behavior language", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [buildPendingEvent()], error: null })
      .mockResolvedValueOnce({ data: { count: 1, ids: ["classification-1"] }, error: null });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [
            buildCompactAnthropicClassificationResult({
              interpretationPayload: {
                ...buildCompactAnthropicClassificationResult().interpretationPayload,
                businessMeaning:
                  "This improves competitiveness and reflects a stronger commercial strategy for client pricing.",
              },
            }),
          ],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).toMatchObject({
      interpretedChange: {
        businessMeaning:
          "This appears to reflect an estimator adjustment that may affect downstream cost, quantities, or commercial review assumptions.",
      },
    });
  });

  it("stores interpretedChange for rate edits", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [buildPendingEvent({ eventType: "worksheet_rate_changed" })], error: null })
      .mockResolvedValueOnce({ data: { count: 1, ids: ["classification-1"] }, error: null });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [
            buildClassificationResult({
              interpretationPayload: {
                interpretedChange: {
                  whatChanged: "Estimator changed a rate input.",
                  changeType: "rate_update",
                  plainEnglishSummary: "Updated the rate used for pricing.",
                  businessMeaning: "Changes the organization-preferred pricing rate in this context.",
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
                    retrievalGuidance: "Prefer this rate when generating similar labour pricing rows.",
                    shouldInfluenceFutureGeneration: true,
                    shouldInfluenceFutureReview: true,
                  },
                  confidence: {
                    overall: 0.86,
                    context: 0.84,
                    futureUse: 0.8,
                  },
                },
              },
            }),
          ],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).toMatchObject({
      interpretedChange: {
        changeType: "rate_update",
        pricingContext: {
          costRole: "labour",
        },
      },
    });
  });

  it("stores formulaMeaning for formula edits", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [buildPendingEvent({ eventType: "worksheet_formula_edited" })], error: null })
      .mockResolvedValueOnce({ data: { count: 1, ids: ["classification-1"] }, error: null });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [
            buildClassificationResult({
              interpretationPayload: {
                interpretedChange: {
                  whatChanged: "Estimator corrected a formula.",
                  changeType: "formula_update",
                  oldValue: null,
                  newValue: null,
                  oldFormula: "=ROUNDUP(A1/2.4,0)",
                  newFormula: "=ROUNDUP(A1/2.1,0)",
                  unit: null,
                  plainEnglishSummary: "Adjusted the rounding formula.",
                  businessMeaning: "This changes the preferred quantity calculation rule.",
                  constructionContext: {
                    tradeOrScope: "foundations",
                    workCategory: "structural",
                    systemCategory: null,
                    workType: "formula_logic",
                    pageType: "materials",
                    sectionType: "quantities",
                    itemCategory: "quantity_formula",
                  },
                  pricingContext: {
                    costRole: "material",
                    measurementBasis: "count",
                    rateBasis: null,
                  },
                  formulaMeaning: "Use the tighter divisor when calculating rounded-up quantities in similar rows.",
                  aiCorrectionMeaning: null,
                  futureUse: {
                    memoryCandidate: true,
                    memoryType: "formula_pattern",
                    retrievalGuidance: "Apply this formula preference when generating similar quantity rows.",
                    shouldInfluenceFutureGeneration: true,
                    shouldInfluenceFutureReview: true,
                  },
                  confidence: {
                    overall: 0.89,
                    context: 0.86,
                    futureUse: 0.84,
                  },
                },
              },
            }),
          ],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).toMatchObject({
      interpretedChange: {
        formulaMeaning: expect.any(String),
      },
    });
  });

  it("stores aiCorrectionMeaning for AI corrections", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [buildPendingEvent({ eventType: "worksheet_ai_output_corrected" })], error: null })
      .mockResolvedValueOnce({ data: { count: 1, ids: ["classification-1"] }, error: null });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [
            buildClassificationResult({
              interpretationPayload: {
                interpretedChange: {
                  whatChanged: "Estimator corrected an AI-generated worksheet value.",
                  changeType: "ai_correction",
                  oldValue: 10,
                  newValue: 15,
                  oldFormula: null,
                  newFormula: null,
                  unit: "%",
                  plainEnglishSummary: "Adjusted the AI-suggested waste factor.",
                  businessMeaning: "Shows the company prefers a different assumption than the AI suggested.",
                  constructionContext: {
                    tradeOrScope: "foundations",
                    workCategory: "structural",
                    systemCategory: null,
                    workType: "ai_correction",
                    pageType: "inputs",
                    sectionType: "assumptions",
                    itemCategory: "general_assumption",
                  },
                  pricingContext: {
                    costRole: null,
                    measurementBasis: "percentage",
                    rateBasis: null,
                  },
                  formulaMeaning: null,
                  aiCorrectionMeaning: "Future AI should bias toward the corrected assumption value in similar contexts.",
                  futureUse: {
                    memoryCandidate: true,
                    memoryType: "assumption_pattern",
                    retrievalGuidance: "Treat this correction as a strong preference signal during generation and review.",
                    shouldInfluenceFutureGeneration: true,
                    shouldInfluenceFutureReview: true,
                  },
                  confidence: {
                    overall: 0.9,
                    context: 0.88,
                    futureUse: 0.89,
                  },
                },
              },
            }),
          ],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).toMatchObject({
      interpretedChange: {
        aiCorrectionMeaning: expect.any(String),
      },
    });
  });

  it("supports null classifications without forcing values", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [
            buildClassificationResult({
              costRole: { value: null, confidence: null },
              systemCategory: { value: null, confidence: null },
              overallConfidence: 0.61,
            }),
          ],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.semanticFields).toMatchObject({
      costRole: { value: null, confidence: null },
      systemCategory: { value: null, confidence: null },
    });
  });

  it("supports reclassification versions", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent({ classificationVersion: 2, nextAttemptNumber: 3 })],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-2"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification({ classificationVersion: 2 });

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]).toMatchObject({
      classificationVersion: 2,
      attemptNumber: 3,
      claimToken: "claim-token-1",
    });
  });

  it("leaves original pending events unchanged", async () => {
    const pending = buildPendingEvent();
    const snapshot = JSON.stringify(pending);
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [pending],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification();

    expect(JSON.stringify(pending)).toBe(snapshot);
  });

  it("batches events by organization and worksheet context", async () => {
    const events = [
      buildPendingEvent({ eventId: "event-1" }),
      buildPendingEvent({ eventId: "event-2" }),
      buildPendingEvent({ eventId: "event-3", metadata: { workbookId: "workbook-2", sheetId: "sheet-2", sheetName: "Rates" } }),
    ];
    const provider = {
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn()
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-5.5",
          rawProviderResponse: {},
          parsedJson: {
            classifications: [
              buildClassificationResult({ eventId: "event-1" }),
              buildClassificationResult({ eventId: "event-2" }),
            ],
          },
          outputText: "",
          evidence: [],
          citations: [],
          warnings: [],
          webSearchUsed: false,
          effectiveWebSearchEnabled: false,
        })
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-5.5",
          rawProviderResponse: {},
          parsedJson: {
            classifications: [buildClassificationResult({ eventId: "event-3" })],
          },
          outputText: "",
          evidence: [],
          citations: [],
          warnings: [],
          webSearchUsed: false,
          effectiveWebSearchEnabled: false,
        }),
    };

    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: events,
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 3, ids: ["classification-1", "classification-2", "classification-3"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification({ groupSize: 2 });

    expect(result.processedBatchCount).toBe(2);
    expect(provider.generateEditPlan).toHaveBeenCalledTimes(2);
  });

  it("splits timed-out batches into smaller retries before persisting failures", async () => {
    const events = [
      buildPendingEvent({ eventId: "event-1" }),
      buildPendingEvent({ eventId: "event-2" }),
    ];
    const provider = {
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn()
        .mockRejectedValueOnce(buildProviderTimeoutError("anthropic", "claude-sonnet-4-6"))
        .mockResolvedValueOnce({
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          rawProviderResponse: {},
          parsedJson: {
            classifications: [buildClassificationResult({ eventId: "event-1" })],
          },
          outputText: "",
          evidence: [],
          citations: [],
          warnings: [],
          webSearchUsed: false,
          effectiveWebSearchEnabled: false,
        })
        .mockResolvedValueOnce({
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          rawProviderResponse: {},
          parsedJson: {
            classifications: [buildClassificationResult({ eventId: "event-2" })],
          },
          outputText: "",
          evidence: [],
          citations: [],
          warnings: [],
          webSearchUsed: false,
          effectiveWebSearchEnabled: false,
        }),
    };
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: events,
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 2, ids: ["classification-1", "classification-2"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification({
      provider: "anthropic",
      groupSize: 2,
    });

    expect(result.classifiedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(provider.generateEditPlan).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[1]?.[1]?.p_inputs).toHaveLength(2);
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.classificationStatus).toBe("classified");
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[1]?.classificationStatus).toBe("classified");
  });

  it("persists timeout diagnostics for failed Anthropic interpretation runs", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockRejectedValue(
        buildProviderTimeoutError("anthropic", "claude-3-5-haiku-latest"),
      ),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification({
      now: "2026-05-31T00:00:00.000Z",
      groupSize: 1,
      provider: "anthropic",
    });

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]).toMatchObject({
      classificationStatus: "failed",
      classificationProvider: "anthropic",
      classificationModel: "claude-3-5-haiku-latest",
      errorCode: "provider_timeout",
      errorMessage: "Upstream request timed out.",
      requestContext: {
        providerDiagnostics: {
          provider: "anthropic",
          model: "claude-3-5-haiku-latest",
          providerErrorMessage: "Upstream request timed out.",
          requestSummary: {
            workflowStage: "worksheet_event_interpretation",
            schemaKind: "worksheet_event_interpretation",
            schemaSizeBytes: 1750,
          },
        },
      },
    });
  });

  it("retries truncated Anthropic interpretation once with a compact prompt and persists the recovered payload", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    const provider = {
      defaultModel: "claude-haiku-4-5-20251001",
      generateEditPlan: vi.fn()
        .mockRejectedValueOnce(
          buildProviderSchemaParseError({
            model: "claude-haiku-4-5-20251001",
            parseFailureReason: "truncated_json",
          }),
        )
        .mockResolvedValueOnce({
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          rawProviderResponse: {},
          parsedJson: {
            classifications: [buildCompactAnthropicClassificationResult()],
          },
          outputText: "",
          evidence: [],
          citations: [],
          warnings: [],
          webSearchUsed: false,
          effectiveWebSearchEnabled: false,
        }),
    };

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification({
      groupSize: 1,
      provider: "anthropic",
    });

    expect(result.classifiedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(provider.generateEditPlan).toHaveBeenCalledTimes(2);
    expect(provider.generateEditPlan.mock.calls[1]?.[0]).toMatchObject({
      maxOutputTokens: 1400,
    });
    expect(String(provider.generateEditPlan.mock.calls[1]?.[0]?.userPrompt ?? "")).toContain(
      "Required interpretationPayload fields only: whatChanged, plainEnglishSummary, businessMeaning, futureUse, memoryCandidate, memoryType, retrievalGuidance.",
    );
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.interpretationPayload).toMatchObject({
      interpretedChange: {
        whatChanged: expect.any(String),
        futureUse: {
          memoryCandidate: true,
        },
      },
    });
  });

  it("splits a truncated two-event Anthropic batch into single-event retries before persisting failure", async () => {
    const events = [
      buildPricingAwarePendingEvent({ eventId: "event-1" }),
      buildPricingAwarePendingEvent({
        eventId: "event-2",
        diffData: {
          ...buildPricingAwarePendingEvent().diffData,
          itemLabel: "Cross Tees (1200mm)",
        },
      }),
    ];

    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: events,
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 2, ids: ["classification-1", "classification-2"] },
        error: null,
      });

    const provider = {
      defaultModel: "claude-haiku-4-5-20251001",
      generateEditPlan: vi.fn()
        .mockRejectedValueOnce(
          buildProviderSchemaParseError({
            model: "claude-haiku-4-5-20251001",
            parseFailureReason: "truncated_json",
          }),
        )
        .mockResolvedValueOnce({
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          rawProviderResponse: {},
          parsedJson: {
            classifications: [
              buildCompactAnthropicClassificationResult({ eventId: "event-1" }),
            ],
          },
          outputText: "",
          evidence: [],
          citations: [],
          warnings: [],
          webSearchUsed: false,
          effectiveWebSearchEnabled: false,
        })
        .mockResolvedValueOnce({
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          rawProviderResponse: {},
          parsedJson: {
            classifications: [
              buildCompactAnthropicClassificationResult({ eventId: "event-2" }),
            ],
          },
          outputText: "",
          evidence: [],
          citations: [],
          warnings: [],
          webSearchUsed: false,
          effectiveWebSearchEnabled: false,
        }),
    };

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification({
      groupSize: 2,
      provider: "anthropic",
    });

    expect(result.classifiedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(provider.generateEditPlan).toHaveBeenCalledTimes(3);
    expect(provider.generateEditPlan.mock.calls[0]?.[0]?.metadata).toMatchObject({ eventCount: 2 });
    expect(provider.generateEditPlan.mock.calls[1]?.[0]?.metadata).toMatchObject({ eventCount: 1 });
    expect(provider.generateEditPlan.mock.calls[2]?.[0]?.metadata).toMatchObject({ eventCount: 1 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]?.[1]?.p_inputs).toHaveLength(2);
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.every((input: { classificationStatus: string }) => input.classificationStatus === "classified")).toBe(true);
  });

  it("does not retry malformed Anthropic interpretation JSON and still fails safely", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    const provider = {
      defaultModel: "claude-haiku-4-5-20251001",
      generateEditPlan: vi.fn().mockRejectedValue(
        buildProviderSchemaParseError({
          model: "claude-haiku-4-5-20251001",
          parseFailureReason: "malformed_json",
          retryable: false,
        }),
      ),
    };

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAiProvider.mockReturnValue(provider);

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification({
      groupSize: 1,
      provider: "anthropic",
    });

    expect(result.failedCount).toBe(1);
    expect(provider.generateEditPlan).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]).toMatchObject({
      classificationStatus: "failed",
      errorCode: "provider_schema_parse_failed",
      errorMessage: "AI assistant returned an unreadable response (malformed_json).",
      requestContext: {
        providerDiagnostics: {
          stopReason: "end_turn",
          outputTextLength: 4200,
          parseErrorType: "json_parse_failed",
        },
      },
    });
  });

  it("respects the max run cap when a larger limit is requested", async () => {
    const events = Array.from({ length: 2 }, (_, index) => buildPendingEvent({
      eventId: `event-${index + 1}`,
    }));
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: events,
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 2, ids: ["classification-1", "classification-2"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [
            buildClassificationResult({ eventId: "event-1" }),
            buildClassificationResult({ eventId: "event-2" }),
          ],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification({ limit: 250 });

    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_limit: 100,
    });
    expect(result.skippedCount).toBe(150);
  });

  it("records failed classifications safely when the provider errors", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "gpt-5.5",
      generateEditPlan: vi.fn().mockRejectedValue(new Error("Provider unavailable")),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification({ now: "2026-05-31T00:00:00.000Z" });

    expect(result.failedCount).toBe(1);
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]).toMatchObject({
      classificationStatus: "failed",
      errorMessage: "Provider unavailable",
      claimToken: "claim-token-1",
    });
    expect(typeof rpc.mock.calls[1]?.[1]?.p_inputs?.[0]?.retryAfter).toBe("string");
  });

  it("preserves safe provider diagnostics for Anthropic 400 failures", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockRejectedValue(Object.assign(
        new Error("Anthropic request failed with status 400."),
        {
          code: "provider_bad_response",
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          status: 400,
          retryable: false,
          rawError: {
            status: 400,
            statusText: "Bad Request",
            responseBodySnippet: "{\"error\":{\"type\":\"invalid_request_error\",\"message\":\"output_config.format.schema is invalid\"}}",
            errorType: "invalid_request_error",
            errorMessage: "output_config.format.schema is invalid",
            requestSummary: {
              workflowStage: "worksheet_event_interpretation",
              schemaKind: "worksheet_event_interpretation",
              schemaSizeBytes: 4673,
              unsupportedKeywordCount: 0,
              optionalParameterCount: 0,
              hasWorksheetEventInterpretationSchema: true,
              hasTools: false,
              hasToolChoice: false,
              hasOutputConfig: false,
              outputConfigFormatType: null,
              anthropicVersion: "2023-06-01",
              hasAnthropicBetaHeader: false,
            },
          },
        },
      )),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    await runPendingWorksheetSemanticClassification({ now: "2026-05-31T00:00:00.000Z" });

    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]).toMatchObject({
      classificationStatus: "failed",
      classificationProvider: "anthropic",
      classificationModel: "claude-sonnet-4-6",
      errorCode: "provider_bad_response",
      errorMessage: "Anthropic request failed with status 400.",
      requestContext: {
        providerDiagnostics: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          status: 400,
          statusText: "Bad Request",
          responseBodySnippet: expect.stringContaining("invalid_request_error"),
          errorType: "invalid_request_error",
          providerErrorMessage: "output_config.format.schema is invalid",
          requestSummary: {
            workflowStage: "worksheet_event_interpretation",
            schemaKind: "worksheet_event_interpretation",
            schemaSizeBytes: 4673,
            unsupportedKeywordCount: 0,
            optionalParameterCount: 0,
            hasWorksheetEventInterpretationSchema: true,
            hasTools: false,
            hasToolChoice: false,
            hasOutputConfig: false,
            outputConfigFormatType: null,
            anthropicVersion: "2023-06-01",
            hasAnthropicBetaHeader: false,
          },
        },
      },
    });
  });

  it("rejects semantic-only responses that omit interpretationPayload", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [buildPendingEvent()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { count: 1, ids: ["classification-1"] },
        error: null,
      });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient({ rpc }));
    getPricingWorksheetAiProvider.mockReturnValue({
      defaultModel: "anthropic",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        rawProviderResponse: {},
        parsedJson: {
          classifications: [buildSemanticOnlyClassificationResult()],
        },
        outputText: "",
        evidence: [],
        citations: [],
        warnings: [],
        webSearchUsed: false,
        effectiveWebSearchEnabled: false,
      }),
    });

    const { runPendingWorksheetSemanticClassification } = await import("./worksheet-event-semantic-classification");
    const result = await runPendingWorksheetSemanticClassification();

    expect(result.failedCount).toBe(1);
    expect(result.classifiedCount).toBe(0);
    expect(result.lowConfidenceCount).toBe(0);
    expect(rpc.mock.calls[1]?.[1]?.p_inputs?.[0]).toMatchObject({
      classificationStatus: "failed",
      errorCode: "invalid_interpretation_payload",
      errorMessage: "Provider returned a classification without the required interpretation payload structure.",
      interpretationPayload: {},
    });
  });
});
