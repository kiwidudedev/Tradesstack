import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("returns a warning and disables web search when requested", async () => {
    const provider = new AnthropicPricingWorksheetProvider("claude-sonnet-4-6");
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

    const result = await provider.generateEditPlan({
      ...buildRequest(),
      enableWebSearch: true,
    });

    expect(result.warnings).toContain("web_search_unavailable_for_provider");
    expect(result.effectiveWebSearchEnabled).toBe(false);
    expect(result.webSearchUsed).toBe(false);
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
