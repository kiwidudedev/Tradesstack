import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  AnthropicPricingWorksheetProvider,
  buildAnthropicProviderSchema,
  countAnthropicOptionalParametersForTest,
  collectUnsupportedAnthropicSchemaKeywordsForTest,
  getAnthropicSchemaKindForTest,
  preflightAnthropicSchemaForTest,
  sanitizeAnthropicSchema,
  sanitizeSchemaForAnthropic,
} from "@/lib/ai/providers/pricing-worksheet/anthropic-provider";
import { buildPricingWorksheetAiAssistantSchema } from "@/lib/pricing-worksheet-edit-plan";
import { isPricingWorksheetProviderError } from "@/lib/ai/providers/pricing-worksheet/types";
import { worksheetMemorySynthesisTestUtils } from "@/lib/worksheet-memory-synthesis";

function buildRequest() {
  return {
    systemPrompt: "You are the pricing worksheet assistant.",
    userPrompt: "Build a compact worksheet edit plan.",
    schema: {
      type: "object",
      required: ["mode", "proposalName", "answer", "summary", "confidence", "operations", "assumptions", "warnings"],
      properties: {
        mode: { type: "string" },
        proposalName: { type: "string" },
        answer: { type: "string" },
        summary: { type: "string" },
        confidence: { type: "string" },
        operations: { type: "array" },
        assumptions: { type: "array" },
        warnings: { type: "array" },
      },
    },
    model: "claude-sonnet-4-6",
    timeoutMs: 5_000,
    maxOutputTokens: 2_000,
    enableWebSearch: false,
    metadata: {},
  };
}

function buildWorksheetEventInterpretationRequest() {
  return {
    ...buildRequest(),
    userPrompt: "Interpret this worksheet change.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["classifications"],
      properties: {
        classifications: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "eventId",
              "costRole",
              "cellRole",
              "pageType",
              "sectionType",
              "itemCategory",
              "measurementBasis",
              "normalizedUnit",
              "normalizedTradePackage",
              "workCategory",
              "systemCategory",
              "assemblyCategory",
              "overallConfidence",
              "reasoningSummary",
              "interpretationSchemaVersion",
              "interpretationPayload",
            ],
            properties: {
              eventId: { type: "string" },
              costRole: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              cellRole: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              pageType: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              sectionType: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              itemCategory: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              measurementBasis: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              normalizedUnit: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              normalizedTradePackage: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              workCategory: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              systemCategory: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              assemblyCategory: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { anyOf: [{ type: "string" }, { type: "null" }] },
                  confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
              overallConfidence: { anyOf: [{ type: "number" }, { type: "null" }] },
              reasoningSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
              interpretationSchemaVersion: { type: "integer" },
              interpretationPayload: {
                type: "object",
                additionalProperties: false,
                required: ["interpretedChange"],
                properties: {
                  interpretedChange: {
                    type: "object",
                    additionalProperties: false,
                    required: ["whatChanged", "plainEnglishSummary", "businessMeaning", "futureUse"],
                    properties: {
                      whatChanged: { anyOf: [{ type: "string" }, { type: "null" }] },
                      plainEnglishSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
                      businessMeaning: { anyOf: [{ type: "string" }, { type: "null" }] },
                      futureUse: {
                        type: "object",
                        additionalProperties: false,
                        required: ["memoryCandidate", "retrievalGuidance"],
                        properties: {
                          memoryCandidate: { anyOf: [{ type: "boolean" }, { type: "null" }] },
                          retrievalGuidance: { anyOf: [{ type: "string" }, { type: "null" }] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    metadata: {
      workflowStage: "worksheet_event_interpretation",
    },
  };
}

function buildWorksheetPricingPatternShadowProposalRequest() {
  return {
    ...buildRequest(),
    userPrompt: "Propose reusable worksheet pricing patterns from interpreted events.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["proposals"],
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "proposalKind",
              "patternFamily",
              "patternType",
              "title",
              "summary",
              "retrievalGuidance",
              "confidence",
              "scope",
              "patternValueSummary",
              "patternSignals",
              "supportingEvidenceEventIds",
              "contradictoryEvidenceEventIds",
              "contradictionReason",
              "dominantAlternativePatternType",
            ],
            properties: {
              proposalKind: { type: "string" },
              patternFamily: { anyOf: [{ type: "string" }, { type: "null" }] },
              patternType: { anyOf: [{ type: "string" }, { type: "null" }] },
              title: { anyOf: [{ type: "string" }, { type: "null" }] },
              summary: { anyOf: [{ type: "string" }, { type: "null" }] },
              retrievalGuidance: { anyOf: [{ type: "string" }, { type: "null" }] },
              confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
              scope: {
                type: "object",
                additionalProperties: false,
                required: [
                  "tradePackage",
                  "pageType",
                  "worksheetNameHint",
                  "itemCategory",
                  "normalizedUnit",
                  "costRole",
                  "sectionType",
                ],
                properties: {
                  tradePackage: { anyOf: [{ type: "string" }, { type: "null" }] },
                  pageType: { anyOf: [{ type: "string" }, { type: "null" }] },
                  worksheetNameHint: { anyOf: [{ type: "string" }, { type: "null" }] },
                  itemCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
                  normalizedUnit: { anyOf: [{ type: "string" }, { type: "null" }] },
                  costRole: { anyOf: [{ type: "string" }, { type: "null" }] },
                  sectionType: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
              },
              patternValueSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
              patternSignals: {
                type: "array",
                items: { type: "string" },
              },
              supportingEvidenceEventIds: {
                type: "array",
                items: { type: "string" },
              },
              contradictoryEvidenceEventIds: {
                type: "array",
                items: { type: "string" },
              },
              contradictionReason: { anyOf: [{ type: "string" }, { type: "null" }] },
              dominantAlternativePatternType: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
          },
        },
      },
    },
    metadata: {
      workflowStage: "worksheet_pricing_pattern_shadow_proposals",
    },
  };
}

function collectSchemaProblems(node: unknown, path = "$"): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => collectSchemaProblems(entry, `${path}[${index}]`));
  }

  if (!node || typeof node !== "object") {
    return [];
  }

  const record = node as Record<string, unknown>;
  const problems: string[] = [];
  if (Array.isArray(record.type)) {
    problems.push(`${path}.type`);
  }
  if (Object.keys(record).length === 0 && !path.endsWith(".properties")) {
    problems.push(`${path} empty`);
  }

  return problems.concat(
    Object.entries(record).flatMap(([key, value]) => collectSchemaProblems(value, `${path}.${key}`)),
  );
}

function collectSchemaKeywordPaths(node: unknown, keyword: string, path = "$"): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => collectSchemaKeywordPaths(entry, keyword, `${path}[${index}]`));
  }

  if (!node || typeof node !== "object") {
    return [];
  }

  const record = node as Record<string, unknown>;
  const matches = Object.keys(record).includes(keyword) ? [`${path}.${keyword}`] : [];
  return matches.concat(
    Object.entries(record).flatMap(([key, value]) => collectSchemaKeywordPaths(value, keyword, `${path}.${key}`)),
  );
}

describe("AnthropicPricingWorksheetProvider", () => {
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    process.env.OPENAI_API_KEY = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  });

  it("does not require OPENAI_API_KEY when anthropic is selected", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "answer_only",
              proposalName: "Anthropic response",
              answer: "Anthropic answer",
              summary: "Anthropic summary",
              confidence: "medium",
              operations: [],
              assumptions: [],
              warnings: [],
            }),
          },
        ],
        usage: {
          input_tokens: 11,
          output_tokens: 19,
        },
      }),
    } as Response);

    const result = await provider.generateEditPlan(buildRequest());

    expect(fetchMock).toHaveBeenCalled();
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.parsedJson?.proposalName).toBe("Anthropic response");
    expect(result.usage).toMatchObject({
      inputTokens: 11,
      outputTokens: 19,
      totalTokens: 30,
    });
  });

  it("enables Anthropic web search when requested", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "server_tool_use",
            id: "srvtoolu_123",
            name: "web_search",
            input: {
              query: "steel stud partition nz rondo",
            },
          },
          {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_123",
            content: [
              {
                type: "web_search_result",
                url: "https://www.rondo.co.nz/steel-stud-partitions",
                title: "Rondo Steel Stud Partitions",
                encrypted_content: "encrypted",
              },
            ],
          },
          {
            type: "text",
            text: JSON.stringify({
              mode: "answer_only",
              proposalName: "Anthropic response",
              answer: "Anthropic answer",
              summary: "Anthropic summary",
              confidence: "medium",
              operations: [],
              assumptions: [],
              warnings: [],
            }),
          },
        ],
      }),
    } as Response);

    const result = await provider.generateEditPlan({
      ...buildRequest(),
      enableWebSearch: true,
    });

    expect(fetchMock).toHaveBeenCalled();
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;

    expect(requestBody.tools).toEqual([
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
        allowed_callers: ["direct"],
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.effectiveWebSearchEnabled).toBe(true);
    expect(result.webSearchUsed).toBe(true);
    expect(result.citations).toEqual([
      {
        title: "Rondo Steel Stud Partitions",
        url: "https://www.rondo.co.nz/steel-stud-partitions",
      },
    ]);
  });

  it("routes worksheet generation prompts to the Anthropic draft schema", () => {
    const request = {
      ...buildRequest(),
      metadata: {
        classification: {
          primaryIntent: "worksheet_generation",
          recommendedPromptPath: "generation",
        },
      },
    };

    const schema = buildAnthropicProviderSchema(request);
    const properties = schema.properties as Record<string, unknown>;
    const sectionsSchema = properties.sections as Record<string, unknown>;
    const sectionItemSchema = sectionsSchema.items as Record<string, unknown>;
    const rowSchema = ((sectionItemSchema.properties as Record<string, unknown>).rows as Record<string, unknown>)
      .items as Record<string, unknown>;

    expect(getAnthropicSchemaKindForTest(request)).toBe("draft_generation");
    expect(properties.operations).toBeUndefined();
    expect((properties.mode as Record<string, unknown>).enum).toEqual(["worksheet_draft", "answer_only"]);
    expect((rowSchema.properties as Record<string, unknown>).label).toBeTruthy();
    expect((rowSchema.properties as Record<string, unknown>).rowPurpose).toBeTruthy();
    expect((rowSchema.properties as Record<string, unknown>).formulaIntent).toBeTruthy();
    expect(countAnthropicOptionalParametersForTest(schema)).toBeLessThan(24);
    expect(collectSchemaProblems(schema)).toEqual([]);
  });

  it("adds estimator-style Stage A generation guidance to the Anthropic system prompt", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "answer_only",
              proposalName: "Anthropic response",
              answer: "Anthropic answer",
              assumptions: [],
              warnings: [],
              sections: [],
            }),
          },
        ],
      }),
    } as Response);

    await provider.generateEditPlan({
      ...buildRequest(),
      metadata: {
        classification: {
          primaryIntent: "worksheet_generation",
          recommendedPromptPath: "generation",
        },
      },
    });

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    const systemPrompt = String(requestBody.system ?? "");

    expect(systemPrompt).toContain("Populate sections with compact estimator-style starter rows for the worksheet, not generic spreadsheet filler.");
    expect(systemPrompt).toContain("Separate the worksheet draft into practical groups such as inputs, calculations, subtotals, and outputs when relevant.");
    expect(systemPrompt).toContain("Prefer dense commercial workbook structure with compact pricing blocks instead of long linear row-by-row walkthroughs.");
    expect(systemPrompt).toContain("Prefer visible quantity transformations, editable assumption rows, material or labour rows, waste or allowance rows, structured subtotals, and output rows where relevant.");
    expect(systemPrompt).toContain("Keep related quantity, pricing, labour, and subtotal rows adjacent where possible so the draft reads like a practical pricing workbook.");
    expect(systemPrompt).toContain("Use concise estimator-style row labels and avoid repeated descriptions, unnecessary note rows, and explanatory filler.");
    expect(systemPrompt).toContain("Do not imply hidden pricing libraries, lookup tables, database sheets, autonomous estimating engines, or opaque formula chains.");
    expect(systemPrompt).toContain("Do not invent compliance-driven, specification-driven, fire-rated, acoustic-rated, seismic, or manufacturer-specific requirements unless they were explicitly provided.");
    expect(systemPrompt).toContain("If information is missing, prefer editable input or assumption rows unless the missing information would materially change the worksheet structure.");
  });

  it("routes formula-generation workflow calls to the compact formula suggestion schema", () => {
    const request = {
      ...buildRequest(),
      metadata: {
        classification: {
          primaryIntent: "worksheet_generation",
          recommendedPromptPath: "generation",
        },
        workflowStage: "formula_generation",
      },
    };

    const schema = buildAnthropicProviderSchema(request);
    const properties = schema.properties as Record<string, unknown>;
    const suggestionsSchema = properties.suggestions as Record<string, unknown>;
    const suggestionItemSchema = suggestionsSchema.items as Record<string, unknown>;

    expect(getAnthropicSchemaKindForTest(request)).toBe("formula_generation");
    expect((properties.mode as Record<string, unknown>).enum).toEqual(["formula_suggestions", "answer_only"]);
    expect((suggestionItemSchema.properties as Record<string, unknown>).targetRowNumber).toBeTruthy();
    expect((suggestionItemSchema.properties as Record<string, unknown>).expression).toBeTruthy();
    expect((suggestionItemSchema.properties as Record<string, unknown>).targetColumn).toBeTruthy();
    expect(countAnthropicOptionalParametersForTest(schema)).toBeLessThan(24);
  });

  it("routes worksheet event interpretation calls to a dedicated interpretation schema kind", () => {
    const request = buildWorksheetEventInterpretationRequest();

    const schema = buildAnthropicProviderSchema(request);
    const properties = schema.properties as Record<string, unknown>;
    const classificationsSchema = properties.classifications as Record<string, unknown>;
    const classificationItemSchema = classificationsSchema.items as Record<string, unknown>;
    const itemProperties = classificationItemSchema.properties as Record<string, unknown>;
    const interpretationPayloadSchema = itemProperties.interpretationPayload as Record<string, unknown>;
    const semanticSummarySchema = itemProperties.semanticSummary as Record<string, unknown>;
    const schemaSizeBytes = Buffer.byteLength(JSON.stringify(schema), "utf8");

    expect(getAnthropicSchemaKindForTest(request)).toBe("worksheet_event_interpretation");
    expect(properties.mode).toBeUndefined();
    expect(itemProperties.interpretationPayload).toBeTruthy();
    expect(itemProperties.semanticSummary).toBeTruthy();
    expect(itemProperties.reasoningSummary).toBeTruthy();
    expect((classificationItemSchema.required as string[])).toContain("interpretationPayload");
    expect((classificationItemSchema.required as string[])).toContain("semanticSummary");
    expect((interpretationPayloadSchema.required as string[])).toEqual([
      "whatChanged",
      "plainEnglishSummary",
      "businessMeaning",
      "constructionMeaning",
      "pricingMeaning",
      "futureUse",
      "memoryCandidate",
      "memoryType",
      "retrievalGuidance",
    ]);
    expect((semanticSummarySchema.required as string[])).toEqual([
      "costRole",
      "pageType",
      "itemCategory",
      "normalizedUnit",
      "normalizedTradePackage",
    ]);
    expect(collectSchemaKeywordPaths(schema, "anyOf")).toEqual([]);
    expect(countAnthropicOptionalParametersForTest(schema)).toBeLessThan(24);
    expect(schemaSizeBytes).toBeLessThan(3000);
  });

  it("routes worksheet pricing pattern shadow proposal calls to a dedicated schema kind", () => {
    const request = buildWorksheetPricingPatternShadowProposalRequest();

    const schema = buildAnthropicProviderSchema(request);
    const properties = schema.properties as Record<string, unknown>;
    const proposalsSchema = properties.proposals as Record<string, unknown>;
    const proposalItemSchema = proposalsSchema.items as Record<string, unknown>;
    const itemProperties = proposalItemSchema.properties as Record<string, unknown>;
    const scopeSchema = itemProperties.scope as Record<string, unknown>;

    expect(getAnthropicSchemaKindForTest(request)).toBe("worksheet_pricing_pattern_shadow_proposals");
    expect((properties.mode as Record<string, unknown> | undefined)?.enum).toBeUndefined();
    expect(properties.proposals).toBeTruthy();
    expect(scopeSchema.additionalProperties).toBe(false);
    expect(itemProperties.supportingEvidenceEventIds).toBeTruthy();
    expect(itemProperties.contradictoryEvidenceEventIds).toBeTruthy();
    expect(itemProperties.patternValue).toBeUndefined();
    expect(itemProperties.patternValueSummary).toBeTruthy();
    expect(itemProperties.patternSignals).toBeTruthy();
    expect(JSON.stringify(schema)).not.toContain("\"additionalProperties\":true");
    expect(countAnthropicOptionalParametersForTest(schema)).toBeLessThan(24);
  });

  it("routes worksheet memory synthesis calls to a dedicated schema kind", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              decision: "no_memory",
              targetMemoryId: null,
              supersededMemoryIds: [],
              memoryCategory: null,
              memoryType: null,
              title: null,
              summary: null,
              confidence: null,
              scope: null,
              memoryValue: null,
              retrievalGuidance: null,
              supportingEvidenceEventIds: [],
              uncertainEvidenceEventIds: [],
              contradictoryEvidenceEventIds: [],
              reasoningSummary: "Insufficient evidence.",
            }),
          },
        ],
      }),
    } as Response);

    const request = {
      ...buildRequest(),
      userPrompt: "Synthesize worksheet company memory.",
      schema: worksheetMemorySynthesisTestUtils.buildWorksheetMemorySynthesisSchema(),
      metadata: {
        workflowStage: "worksheet_memory_synthesis",
      },
    };

    expect(getAnthropicSchemaKindForTest(request)).toBe("worksheet_memory_synthesis");

    const schema = buildAnthropicProviderSchema(request);
    expect(collectSchemaProblems(schema)).toEqual([]);
    expect(collectUnsupportedAnthropicSchemaKeywordsForTest(schema)).toEqual([]);
    expect(JSON.stringify(schema)).not.toContain("\"additionalProperties\":true");

    await provider.generateEditPlan(request);

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    const requestSchema = (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema ?? {}) as Record<string, unknown>;
    const properties = requestSchema.properties as Record<string, unknown>;

    expect(properties.decision).toBeTruthy();
    expect(properties.supportingEvidenceEventIds).toBeTruthy();
    expect(properties.scope).toMatchObject({
      anyOf: [{ type: "string" }, { type: "null" }],
    });
    expect(properties.memoryValue).toMatchObject({
      anyOf: [{ type: "string" }, { type: "null" }],
    });
  });

  it("bypasses output_config for worksheet event interpretation and parses JSON text directly", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-haiku-4-5-20251001");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-haiku-4-5-20251001",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              classifications: [
                {
                  eventId: "event-1",
                  overallConfidence: 0.86,
                  reasoningSummary: "This looks like a reusable assumption preference update.",
                  interpretationPayload: {
                    whatChanged: "Estimator changed an assumption input.",
                    plainEnglishSummary: "Updated a worksheet assumption value.",
                    businessMeaning: "This reflects a likely business preference for similar estimates.",
                    constructionMeaning: "This belongs to an assumptions/input area of the worksheet.",
                    pricingMeaning: "Future AI should treat this as a preferred assumption input.",
                    futureUse: "Use this as guidance in future worksheet generation and review.",
                    memoryCandidate: true,
                    memoryType: "assumption_pattern",
                    retrievalGuidance: "Prefer this assumption in similar contexts.",
                    shouldInfluenceFutureGeneration: true,
                    shouldInfluenceFutureReview: true,
                    changeType: "assumption_update",
                    oldValue: "15",
                    newValue: "10",
                    oldFormula: "",
                    newFormula: "",
                    unit: "%",
                    formulaMeaning: "",
                    aiCorrectionMeaning: "",
                    contextConfidence: 0.8,
                    futureUseConfidence: 0.82,
                  },
                  semanticSummary: {
                    costRole: "",
                    pageType: "inputs",
                    itemCategory: "general_assumption",
                    normalizedUnit: "%",
                    normalizedTradePackage: "partitions",
                  },
                },
              ],
            }),
          },
        ],
      }),
    } as Response);

    const result = await provider.generateEditPlan(buildWorksheetEventInterpretationRequest());

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;

    expect(requestBody.output_config).toBeUndefined();
    expect(result.parsedJson).toMatchObject({
      classifications: [
        {
          eventId: "event-1",
          interpretationPayload: {
            whatChanged: expect.any(String),
          },
        },
      ],
    });
  });

  it("preserves the caller schema for cost construction intelligence", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-haiku-4-5-20251001");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-haiku-4-5-20251001",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              trade: "Wall Linings",
              system: "Plasterboard Linings",
              product: "13mm GIB Standard",
              activity: "Supply",
              likely_use: "Internal wall lining",
              subtrade: null,
              work_package: null,
              assembly: null,
              component: null,
              product_family: null,
              manufacturer: null,
              brand: "GIB",
              supplier: "PlaceMakers",
              install_method: null,
              application_area: null,
              location_context: null,
              project_context: null,
              related_components: [],
              exclusions_or_risks: [],
              normalization_tokens: [],
              confidence: 0.86,
              reasoning: "Obvious plasterboard product wording.",
              evidence: ["13mm", "GIB Standard", "plasterboard"],
            }),
          },
        ],
      }),
    } as Response);

    const request = {
      ...buildRequest(),
      userPrompt: "Classify construction meaning.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["trade", "system", "product", "activity", "likely_use"],
        properties: {
          trade: { type: ["string", "null"] },
          system: { type: ["string", "null"] },
          product: { type: ["string", "null"] },
          activity: { type: ["string", "null"] },
          likely_use: { type: ["string", "null"] },
        },
      },
      metadata: {
        engine: "cost_construction_intelligence",
      },
    };

    expect(getAnthropicSchemaKindForTest(request)).toBe("cost_construction_intelligence");

    const schema = buildAnthropicProviderSchema(request);
    expect(schema).toMatchObject({
      properties: expect.objectContaining({
        trade: expect.any(Object),
        system: expect.any(Object),
        product: expect.any(Object),
      }),
    });

    await provider.generateEditPlan(request);

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    const requestSchema = (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema ?? {}) as Record<string, unknown>;
    const properties = requestSchema.properties as Record<string, unknown>;

    expect(properties.trade).toBeTruthy();
    expect(properties.system).toBeTruthy();
    expect(properties.product).toBeTruthy();
  });

  it("uses json_schema output_config for worksheet pricing pattern shadow proposals", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-haiku-4-5-20251001");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-haiku-4-5-20251001",
        structured_output: {
          proposals: [
            {
              proposalKind: "no_pattern",
              patternFamily: null,
              patternType: null,
              title: null,
              summary: "No reusable pattern found.",
              retrievalGuidance: null,
              confidence: null,
              scope: {
                tradePackage: null,
                pageType: null,
                worksheetNameHint: null,
                itemCategory: null,
                normalizedUnit: null,
                costRole: null,
                sectionType: null,
              },
              patternValueSummary: null,
              patternSignals: [],
              supportingEvidenceEventIds: [],
              contradictoryEvidenceEventIds: [],
              contradictionReason: null,
              dominantAlternativePatternType: null,
            },
          ],
        },
        content: [],
      }),
    } as Response);

    const result = await provider.generateEditPlan(buildWorksheetPricingPatternShadowProposalRequest());

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    const outputConfig = requestBody.output_config as Record<string, unknown>;
    const format = outputConfig.format as Record<string, unknown>;
    const schema = format.schema as Record<string, unknown>;
    const schemaProperties = schema.properties as Record<string, unknown>;
    const proposalItemProperties = (((schemaProperties.proposals as Record<string, unknown>).items as Record<string, unknown>).properties as Record<string, unknown>);
    const systemPrompt = String(requestBody.system ?? "");

    expect(format.type).toBe("json_schema");
    expect(schemaProperties.proposals).toBeTruthy();
    expect(proposalItemProperties.patternValue).toBeUndefined();
    expect(systemPrompt).toContain("supportingEvidenceEventIds from at least 2 worksheet instances and at least 2 projects");
    expect(systemPrompt).toContain("Do not propose a pattern from a single support event.");
    expect(systemPrompt).toContain("If proposalKind = no_pattern, supportingEvidenceEventIds and contradictoryEvidenceEventIds must both be empty arrays.");
    expect(systemPrompt).toContain("If two events show the same specific pricing behavior across 2 worksheet instances and 2 projects, return a weak pattern");
    expect((proposalItemProperties.scope as Record<string, unknown>).additionalProperties).toBe(false);
    expect(result.parsedJson).toMatchObject({
      proposals: [
        {
          proposalKind: "no_pattern",
        },
      ],
    });
  });

  it("routes formatting workflow calls to the compact formatting suggestion schema", () => {
    const request = {
      ...buildRequest(),
      metadata: {
        classification: {
          primaryIntent: "worksheet_edit",
          recommendedPromptPath: "edit",
        },
        workflowStage: "formatting_generation",
      },
    };

    const schema = buildAnthropicProviderSchema(request);
    const properties = schema.properties as Record<string, unknown>;
    const operationsSchema = properties.operations as Record<string, unknown>;
    const operationItemSchema = operationsSchema.items as Record<string, unknown>;
    const operationProperties = operationItemSchema.properties as Record<string, unknown>;

    expect(getAnthropicSchemaKindForTest(request)).toBe("formatting_generation");
    expect((properties.mode as Record<string, unknown>).enum).toEqual(["formatting_suggestions", "answer_only"]);
    expect(operationProperties.targetCells).toBeTruthy();
    expect(operationProperties.target).toBeUndefined();
    expect(operationProperties.formulas).toBeUndefined();
    expect(operationProperties.values).toBeUndefined();
    expect(countAnthropicOptionalParametersForTest(schema)).toBeLessThan(24);
  });

  it("routes review workflow calls to the compact review schema", () => {
    const request = {
      ...buildRequest(),
      metadata: {
        classification: {
          primaryIntent: "review_estimate",
          recommendedPromptPath: "review",
        },
        workflowStage: "review_generation",
      },
    };

    const schema = buildAnthropicProviderSchema(request);
    const properties = schema.properties as Record<string, unknown>;

    expect(getAnthropicSchemaKindForTest(request)).toBe("review_generation");
    expect(properties.reviewFindings).toBeTruthy();
    expect(properties.operations).toBeUndefined();
    expect(countAnthropicOptionalParametersForTest(schema)).toBeLessThan(24);
  });

  it("uses a compact answer-only schema for unknown Anthropic fallbacks instead of the old operation schema", () => {
    const request = {
      ...buildRequest(),
      metadata: {
        classification: {
          primaryIntent: "unknown",
          recommendedPromptPath: "unknown",
        },
        workflowStage: "answer_only_generation",
      },
    };

    const schema = buildAnthropicProviderSchema(request);
    const properties = schema.properties as Record<string, unknown>;

    expect(getAnthropicSchemaKindForTest(request)).toBe("answer_only");
    expect(properties.operations).toBeUndefined();
    expect(properties.reviewFindings).toBeUndefined();
    expect((properties.mode as Record<string, unknown>).enum).toEqual(["answer_only"]);
    expect(countAnthropicOptionalParametersForTest(schema)).toBeLessThan(24);
  });

  it("builds an answer schema that does not require operations.minItems = 1", () => {
    const request = {
      ...buildRequest(),
      metadata: {
        classification: {
          primaryIntent: "answer_only",
          recommendedPromptPath: "answer",
        },
      },
    };

    const schema = buildAnthropicProviderSchema(request);
    const properties = schema.properties as Record<string, unknown>;

    expect(schema).not.toHaveProperty("anyOf");
    expect(properties.operations).toBeUndefined();
    expect(countAnthropicOptionalParametersForTest(schema)).toBeLessThan(24);
    expect(collectSchemaProblems(schema)).toEqual([]);
  });

  it("removes unsupported Anthropic schema keywords from the final outbound schema without mutating the canonical schema", () => {
    const canonicalSchema = buildPricingWorksheetAiAssistantSchema();
    const canonicalSnapshot = JSON.parse(JSON.stringify(canonicalSchema));
    const sanitized = sanitizeSchemaForAnthropic({
      anyOf: [
        {
          type: "object",
          properties: {
            operations: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: {
                    type: "string",
                    enum: ["insert_row", "update_cell"],
                  },
                },
              },
            },
          },
        },
      ],
    });

    expect(collectSchemaKeywordPaths(sanitized, "maxItems")).toEqual([]);
    expect(collectSchemaKeywordPaths(sanitized, "minItems")).toEqual([]);
    expect(canonicalSchema).toEqual(canonicalSnapshot);
  });

  it("sanitizes nullable string enums into Anthropic-compatible single-type enums without mutating the original schema", () => {
    const originalSchema = {
      type: "object",
      properties: {
        findingStatus: {
          type: ["string", "null"],
          enum: ["active", "inactive", null],
        },
      },
    };

    const sanitized = sanitizeAnthropicSchema(originalSchema);
    const findingStatusSchema = (
      (sanitized.properties as Record<string, unknown>).findingStatus as Record<string, unknown>
    );

    expect(findingStatusSchema.type).toBe("string");
    expect(findingStatusSchema.enum).toEqual(["active", "inactive"]);
    expect(findingStatusSchema.anyOf).toBeUndefined();
    expect(originalSchema).toEqual({
      type: "object",
      properties: {
        findingStatus: {
          type: ["string", "null"],
          enum: ["active", "inactive", null],
        },
      },
    });
  });

  it("sanitizes nested nullable enums recursively", () => {
    const schema = {
      type: "object",
      properties: {
        reviewFindings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              findingStatus: {
                type: ["string", "null"],
                enum: ["active", "confirmed", null],
              },
            },
          },
        },
      },
      $defs: {
        evidenceSource: {
          type: "object",
          properties: {
            jurisdiction: {
              type: ["string", "null"],
              enum: ["AUS_NZ", "unknown", null],
            },
          },
        },
      },
    };

    const sanitized = sanitizeAnthropicSchema(schema);
    const findingStatusSchema = (
      ((((sanitized.properties as Record<string, unknown>).reviewFindings as Record<string, unknown>).items as Record<
        string,
        unknown
      >).properties as Record<string, unknown>).findingStatus as Record<string, unknown>
    );
    const jurisdictionSchema = (
      ((((sanitized.$defs as Record<string, unknown>).evidenceSource as Record<string, unknown>).properties as Record<
        string,
        unknown
      >).jurisdiction as Record<string, unknown>)
    );

    expect(findingStatusSchema.type).toBe("string");
    expect(findingStatusSchema.enum).toEqual(["active", "confirmed"]);
    expect(jurisdictionSchema.type).toBe("string");
    expect(jurisdictionSchema.enum).toEqual(["AUS_NZ", "unknown"]);
  });

  it("fails with provider_auth_error when ANTHROPIC_API_KEY is missing", async () => {
    process.env.ANTHROPIC_API_KEY = "";
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");

    await expect(provider.generateEditPlan(buildRequest())).rejects.toMatchObject({
      code: "provider_auth_error",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
  });

  it("maps malformed JSON to provider_schema_parse_failed", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: "{\"mode\":",
          },
        ],
        stop_reason: "end_turn",
      }),
    } as Response);

    try {
      await provider.generateEditPlan(buildRequest());
      throw new Error("Expected schema parse failure.");
    } catch (error) {
      expect(isPricingWorksheetProviderError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "provider_schema_parse_failed",
        provider: "anthropic",
        rawError: {
          parseFailureReason: "truncated_json",
          stopReason: "end_turn",
          outputTextLength: 8,
          maxTokens: 2000,
          parseErrorType: expect.any(String),
        },
      });
    }
  });

  it("fails locally with provider_schema_validation_failed for incompatible enum values", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      provider.generateEditPlan({
        ...buildRequest(),
        schema: {
          type: "object",
          properties: {
            invalidStatus: {
              type: ["string", "null"],
              enum: ["active", 1],
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "provider_schema_validation_failed",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails locally before network when unsupported schema keywords remain after final preflight", () => {
    expect(() =>
      preflightAnthropicSchemaForTest({
        type: "object",
        unsupportedKeyword: true,
      } as unknown as Record<string, unknown>),
    ).toThrowError(/unsupported schema keywords remain/i);
  });

  it("logs final Anthropic schema preflight diagnostics before request", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "answer_only",
              proposalName: "Anthropic response",
              answer: "Anthropic answer",
              summary: "Anthropic summary",
              confidence: "medium",
              operations: [],
              assumptions: [],
              warnings: [],
            }),
          },
        ],
      }),
    } as Response);

    await provider.generateEditPlan({
      ...buildRequest(),
      metadata: {
        classification: {
          primaryIntent: "worksheet_generation",
          recommendedPromptPath: "generation",
        },
      },
    });

    const preflightLog = infoSpy.mock.calls
      .map((call) => call[1])
      .find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).action === "anthropic_schema_preflight") as
      | Record<string, unknown>
      | undefined;
    expect(preflightLog).toMatchObject({
      unsupportedKeywordCount: 0,
      hasDraftSchema: true,
    });
  });

  it("sends sanitized non-union schema to Anthropic", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "answer_only",
              proposalName: "Anthropic response",
              answer: "Anthropic answer",
              summary: "Anthropic summary",
              confidence: "medium",
              operations: [],
              assumptions: [],
              warnings: [],
            }),
          },
        ],
      }),
    } as Response);

    await provider.generateEditPlan({
      ...buildRequest(),
      schema: {
        type: "object",
        required: ["mode", "proposalName", "answer", "summary", "confidence", "operations", "assumptions", "warnings"],
        properties: {
          mode: { type: "string" },
          proposalName: { type: "string" },
          answer: { type: "string" },
          summary: { type: "string" },
          confidence: { type: "string" },
          operations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["insert_row", "update_cell"] },
              },
            },
          },
          assumptions: { type: "array", items: { type: "string" } },
          warnings: { type: "array", items: { type: "string" } },
          reviewFindings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                findingStatus: {
                  type: ["string", "null"],
                  enum: ["active", null],
                },
              },
            },
          },
        },
      },
      metadata: {
        classification: {
          primaryIntent: "worksheet_edit",
          recommendedPromptPath: "edit",
        },
      },
    });

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    const requestSchema = (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>)
      .schema ?? {}) as Record<string, unknown>;

    expect(collectSchemaProblems(requestSchema)).toEqual([]);
    expect(collectSchemaKeywordPaths(requestSchema, "maxItems")).toEqual([]);
    expect(collectSchemaKeywordPaths(requestSchema, "minItems")).toEqual([]);
    expect(collectUnsupportedAnthropicSchemaKeywordsForTest(requestSchema)).toEqual([]);
    expect(requestSchema).not.toHaveProperty("anyOf");
    expect((requestSchema.properties as Record<string, unknown>).operations).toBeUndefined();
  });

  it("rejects free-form object schemas during Anthropic preflight", () => {
    expect(() =>
      preflightAnthropicSchemaForTest({
        type: "object",
        additionalProperties: false,
        required: ["payload"],
        properties: {
          payload: {
            type: "object",
            additionalProperties: true,
          },
        },
      }),
    ).toThrow(/free-form object schemas are not allowed/);
  });

  it("collapses non-enum nullable unions so the outbound Anthropic schema avoids type arrays", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "message",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "answer_only",
              proposalName: "Anthropic response",
              answer: "Anthropic answer",
              summary: "Anthropic summary",
              confidence: "medium",
              operations: [],
              assumptions: [],
              warnings: [],
            }),
          },
        ],
      }),
    } as Response);

    await provider.generateEditPlan({
      ...buildRequest(),
      schema: {
        type: "object",
        required: ["mode", "proposalName", "answer", "summary", "confidence", "operations", "assumptions", "warnings"],
        properties: {
          mode: { type: "string" },
          proposalName: { type: "string" },
          answer: { type: "string" },
          summary: { type: "string" },
          confidence: { type: "string" },
          operations: { type: "array" },
          assumptions: { type: "array", items: { type: "string" } },
          warnings: { type: "array", items: { type: "string" } },
          nullableString: { type: ["string", "null"] },
          mixedPrimitive: { type: ["string", "number", "boolean", "null"] },
          nullableObject: {
            type: ["object", "null"],
            properties: {
              title: { type: ["string", "null"] },
            },
          },
        },
      },
      metadata: {
        classification: {
          primaryIntent: "answer_only",
          recommendedPromptPath: "answer",
        },
      },
    });

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    const requestSchema = (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>)
      .schema ?? {}) as Record<string, unknown>;

    expect(collectSchemaProblems(requestSchema)).toEqual([]);
    expect(collectSchemaKeywordPaths(requestSchema, "maxItems")).toEqual([]);
    expect(collectSchemaKeywordPaths(requestSchema, "minItems")).toEqual([]);
  });

  it("maps rate limits to provider_rate_limited", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "{\"error\":{\"message\":\"rate limited\"}}",
    } as Response);

    await expect(provider.generateEditPlan(buildRequest())).rejects.toMatchObject({
      code: "provider_rate_limited",
      provider: "anthropic",
      status: 429,
      retryable: true,
    });
  });

  it("maps server errors to provider_server_error", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "{\"error\":{\"message\":\"server unavailable\"}}",
    } as Response);

    await expect(provider.generateEditPlan(buildRequest())).rejects.toMatchObject({
      code: "provider_server_error",
      provider: "anthropic",
      status: 503,
      retryable: true,
    });
  });
});
