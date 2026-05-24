import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "./opportunity-pricing-worksheet-mutations";
import { recalculateWorksheetFormulas } from "./opportunity-pricing-worksheet-formulas";
import { validateWorksheetBeforeSave } from "./opportunity-pricing-worksheet-save-validation";
import { buildPricingWorksheetAiContext } from "./pricing-worksheet-ai-context";
import {
  buildPricingWorksheetEditAssistantPreview,
  extractBalancedJsonObject,
  extractPricingWorksheetAssistantPayload,
} from "./ai-pricing-worksheet-edit-assistant";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";

function buildFixture() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Wall Framing",
    rowCount: 8,
    columnCount: 6,
  });

  const context = buildPricingWorksheetAiContext(worksheet, {
    worksheetId: "worksheet-123",
    worksheetName: "Wall Framing",
    tradePackage: "Wall framing",
  });

  return { worksheet, context };
}

function setCellValue(worksheet: ReturnType<typeof createDefaultWorksheetData>, ref: string, value: string | number) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) {
    throw new Error(`Invalid ref ${ref}`);
  }

  const column = worksheet.columns.find((entry) => entry.id === match[1]);
  const row = worksheet.rows[Number(match[2]) - 1];
  if (!column || !row) {
    throw new Error(`Missing worksheet position for ${ref}`);
  }

  worksheet.cells[buildWorksheetCellKey(column.id, row.id)] = {
    value,
    type: typeof value === "number" ? "number" : "text",
    formula: null,
    computedValue: value,
    displayValue: String(value),
    metadata: {},
  };
}

function readPromptTexts(fetchMock: ReturnType<typeof vi.spyOn>) {
  const fetchBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
    input?: Array<{ content?: Array<{ text?: string }> }>;
  };

  return {
    systemPromptText: fetchBody.input?.[0]?.content?.[0]?.text ?? "",
    userPromptText: fetchBody.input?.[1]?.content?.[0]?.text ?? "",
  };
}

function readRequestBody(fetchMock: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as Record<string, unknown>;
}

function mockMinimalAssistantResponse() {
  return {
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        mode: "answer_only",
        proposalName: "Worksheet assistant response",
        answer: "Here is the response.",
        summary: "Response summary.",
        confidence: "medium",
        operations: [],
        assumptions: [],
        warnings: [],
      }),
    }),
  } as Response;
}

function mockResponseWithProviderSources(payload: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      output_text: JSON.stringify(payload),
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              {
                title: "Rondo Key-Lock Concealed Ceiling System",
                url: "https://www.rondo.com.au/key-lock",
              },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Cited response.",
              annotations: [
                {
                  type: "url_citation",
                  title: "Rondo Key-Lock Concealed Ceiling System",
                  url: "https://www.rondo.com.au/key-lock",
                },
              ],
            },
          ],
        },
      ],
    }),
  } as Response;
}

describe("buildPricingWorksheetEditAssistantPreview", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    if (process.env.RUN_OPENAI_TESTS !== "1") {
      process.env.OPENAI_API_KEY = "test-key";
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  it("returns answer_only without fallback for the steel stud LM prompt when provider responds cleanly", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Steel stud formula advice",
          answer:
            "Steel stud LM = wall length x wall height x studs per metre. If spacing is in mm, studs per metre = 1000 / spacing. Example: =A2*(1000/B2)*C2.",
          summary: "Helpful formula advice only.",
          confidence: "high",
          operations: [],
          assumptions: ["Spacing is provided in millimetres."],
          warnings: [],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Write me a formula for calculating steel stud LM in wall",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(fetchMock).toHaveBeenCalled();
    const { userPromptText } = readPromptTexts(fetchMock);
    expect(userPromptText).toContain("Construction intent classification:");
    expect(userPromptText).toContain("\"defaultJurisdiction\": \"AUS_NZ\"");
    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.mode).toBe("answer_only");
    expect(result.preview.answer.length).toBeGreaterThan(0);
    expect(result.preview.operations).toEqual([]);
    expect(result.preview.validationIssues).toEqual([]);
  });

  it.runIf(process.env.RUN_OPENAI_TESTS === "1")(
    "calls the real provider for the steel stud LM prompt",
    async () => {
      const { worksheet, context } = buildFixture();
      const result = await buildPricingWorksheetEditAssistantPreview({
        prompt: "Write me a formula for calculating steel stud LM in wall",
        worksheet,
        worksheetContext: context,
        memoryItems: [],
      });

      expect(result.preview.mode).toBe("answer_only");
      expect(result.preview.answer.length).toBeGreaterThan(0);
      expect(result.preview.operations).toEqual([]);
      expect(result.preview.validationIssues).toEqual([]);
      expect(result.generationMeta.fallbackUsed).toBe(false);
    },
    120_000,
  );

  it.runIf(process.env.RUN_OPENAI_TESTS === "1")(
    "calls the real provider for the steel stud worksheet builder prompt without schema fallback",
    async () => {
      const { worksheet, context } = buildFixture();
      const result = await buildPricingWorksheetEditAssistantPreview({
        prompt:
          "Create me spreadsheet that I put in the LM of a steel stud, and it will calculate all material and labour required.",
        worksheet,
        worksheetContext: context,
        memoryItems: [],
      });

      expect(["propose_edit", "answer_and_propose_edit", "answer_only"]).toContain(result.preview.mode);
      expect(result.generationMeta.fallbackUsed).toBe(false);
      expect(result.generationMeta.provider).toBe("openai");
    },
    120_000,
  );

  it.runIf(process.env.RUN_OPENAI_TESTS === "1")(
    "calls the real provider for multiple worksheet-generation prompts without unreadable-response fallback",
    async () => {
      const prompts = [
        "Create a suspended ceiling calculator.",
        "Build a waterproofing estimate worksheet.",
        "Create an electrical rough-in pricing sheet.",
      ];

      for (const prompt of prompts) {
        const { worksheet, context } = buildFixture();
        const result = await buildPricingWorksheetEditAssistantPreview({
          prompt,
          worksheet,
          worksheetContext: context,
          memoryItems: [],
        });

        expect(result.generationMeta.fallbackUsed, prompt).toBe(false);
        expect(["propose_edit", "answer_and_propose_edit", "answer_only"]).toContain(result.preview.mode);
      }
    },
    240_000,
  );

  it.runIf(process.env.RUN_OPENAI_TESTS === "1")(
    "calls the real provider for the 90x45 nogs edit prompt",
    async () => {
      const { worksheet, context } = buildFixture();
      const result = await buildPricingWorksheetEditAssistantPreview({
        prompt: "Add a line item for 90x45 nogs",
        worksheet,
        worksheetContext: context,
        memoryItems: [],
      });

      expect(["propose_edit", "answer_and_propose_edit"]).toContain(result.preview.mode);
      expect(result.preview.operations.length).toBeGreaterThan(0);
      expect(result.preview.validationIssues).toEqual([]);
      expect(result.generationMeta.fallbackUsed).toBe(false);
    },
    120_000,
  );

  it("uses a provider-connection fallback message for advice prompts", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Write me a formula for calculating steel stud LM in wall",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.preview.mode).toBe("answer_only");
    expect(result.preview.answer).toContain("AI provider connection failed");
    expect(result.preview.answer).toContain("couldn't answer");
    expect(result.preview.operations).toEqual([]);
  });

  it("uses a no-changes fallback message for edit prompts", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Add a line item for 90x45 nogs",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.preview.answer).toContain("no worksheet changes were proposed");
    expect(result.preview.operations).toEqual([]);
  });

  it("uses the answer path prompt framing for explanation requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Explain this formula",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const { systemPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("helpful AUS/NZ construction worksheet assistant explaining worksheet logic clearly");
    expect(systemPromptText).toContain("Focus on explanation, not editing");
    expect(systemPromptText).toContain("Default to Australia/New Zealand construction estimating context and terminology");
    expect(systemPromptText).toContain("Web search is available for all worksheet assistant requests");
    expect(systemPromptText).toContain("Do not use web search unnecessarily for pure spreadsheet arithmetic");
    expect(systemPromptText).toContain("Worksheet facts are the highest-confidence data");
    expect(systemPromptText).toContain("what is known from worksheet data, what is assumed, and what is uncertain");
  });

  it("uses the review path prompt framing for estimate review requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this estimate",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const { systemPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("senior AUS/NZ construction estimator reviewing a commercial estimate inside TradesStack");
    expect(systemPromptText).toContain("Web search is available for all worksheet assistant requests");
    expect(systemPromptText).toContain("Follow an estimator review checklist");
    expect(systemPromptText).toContain("scope completeness, materials/components, fixings/sundries, labour allowance, wastage allowance");
    expect(systemPromptText).toContain("what is present, what may be missing, why it may matter, confidence, assumptions, and what needs confirmation");
    expect(systemPromptText).toContain("Separate worksheet facts, likely assumptions, and uncertainty");
    expect(systemPromptText).toContain("return structured reviewFindings whenever you can identify distinct findings");
  });

  it("injects compact organization guidance into the prompt without overriding worksheet facts", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this estimate",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      organizationGuidance: {
        items: [
          {
            id: "guidance-1",
            type: "suppressed_assumption",
            title: "Assumption caution",
            guidance: "Avoid assuming acoustic requirements unless explicit worksheet, project, or evidence context supports them.",
            confidence: "medium",
            relevanceScore: 1.24,
            evidenceCount: 2,
            tradeHints: ["partitions"],
            systemHints: ["acoustic wall"],
            sourceTypes: ["manufacturer"],
            supportingEventCount: 2,
          },
        ],
        summary:
          "1. Assumption caution - Avoid assuming acoustic requirements unless explicit worksheet, project, or evidence context supports them.",
        suppressionHints: [
          "Avoid assuming acoustic requirements unless explicit worksheet, project, or evidence context supports them.",
        ],
      },
    });

    const { systemPromptText, userPromptText } = readPromptTexts(fetchMock);
    expect(userPromptText).toContain("Organization estimating guidance (contextual tendencies only, not facts):");
    expect(userPromptText).toContain("Avoid assuming acoustic requirements unless explicit worksheet, project, or evidence context supports them.");
    expect(systemPromptText).toContain("Organization estimating guidance describes contextual tendencies only.");
    expect(userPromptText).toContain("it never overrides worksheet facts, project specs, user corrections, or retrieved evidence");
  });

  it("uses the edit path prompt framing for formula creation requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create formulas for these rows",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const { systemPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("AUS/NZ construction worksheet editing assistant generating safe worksheet edits and formulas");
    expect(systemPromptText).toContain("Web search is available for all worksheet assistant requests");
    expect(systemPromptText).toContain("formulas must begin with =");
    expect(systemPromptText).toContain("Do not generate formulas unless the target and input basis are clear");
    expect(systemPromptText).toContain("Target selected cells or nearby logical worksheet locations when appropriate");
    expect(systemPromptText).toContain("If inputs are missing, create blank input cells plus formula cells rather than fake zero values");
    expect(systemPromptText).toContain("Use IFERROR only where it makes commercial sense");
  });

  it("uses the generation path prompt framing for worksheet generation requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Build a waterproofing estimate worksheet",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const { systemPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("AUS/NZ construction estimator generating worksheet structures cautiously inside TradesStack");
    expect(systemPromptText).toContain("Web search is available for all worksheet assistant requests");
    expect(systemPromptText).toContain("Generate starter structures only, not a full autonomous estimate");
    expect(systemPromptText).toContain("Where appropriate, include input rows, formula rows, subtotal rows, and assumption rows");
    expect(systemPromptText).toContain("Explain assumptions and do not pretend construction requirements are verified");
    expect(systemPromptText).toContain("If trade, system, scope, or required inputs are unclear, ask follow-up questions");
  });

  it("uses high-risk caution instructions for seismic requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Update this estimate for seismic requirements",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const { systemPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("This request strongly requires web-backed evidence before making external construction, manufacturer, compliance, standards, or specification claims");
    expect(systemPromptText).toContain("Use web search before making those claims");
    expect(systemPromptText).toContain("For fire, acoustic, seismic, structural, waterproofing, electrical/plumbing compliance, safety, statutory/code/spec, or manufacturer-specific logic");
    expect(systemPromptText).toContain("do not generate confident edits unless evidence exists");
  });

  it("uses the quote/takeoff path framing without pretending sync exists", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Send this to quote",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const { systemPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("helping plan quote or takeoff linkage inside TradesStack");
    expect(systemPromptText).toContain("Web search is available for all worksheet assistant requests");
    expect(systemPromptText).toContain("Do not pretend quote sync or takeoff sync already exists");
    expect(systemPromptText).toContain("Provide preparation guidance only");
    expect(systemPromptText).toContain("traceability concepts");
    expect(systemPromptText).toContain("future linkage ideas only");
  });

  it("returns structured review findings without top-level operations", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Estimate review",
          answer: "Review complete.",
          summary: "One possible missing item.",
          confidence: "medium",
          operations: [],
          assumptions: ["Wall type inferred from row labels."],
          warnings: [],
          reviewFindings: [
            {
              id: "finding-1",
              category: "missing_scope",
              severity: "medium",
              confidence: "medium",
              title: "Potential missing wastage allowance",
              finding: "No wastage row is visible in the current worksheet excerpt.",
            },
          ],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this estimate",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.reviewFindings).toHaveLength(1);
    expect(result.preview.reviewFindings[0]?.title).toContain("wastage");
    expect(result.preview.operations).toEqual([]);
  });

  it("returns suggested edit groups separately from top-level operations for review responses", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Estimate review",
          answer: "Review complete.",
          summary: "One possible missing item.",
          confidence: "medium",
          operations: [],
          assumptions: [],
          warnings: [],
          reviewFindings: [
            {
              id: "finding-1",
              category: "missing_scope",
              severity: "medium",
              confidence: "medium",
              title: "Potential missing wastage allowance",
              finding: "No wastage row is visible in the current worksheet excerpt.",
              suggestedEditGroupId: "group-1",
              canSuggestWorksheetEdit: true,
            },
          ],
          suggestedEditGroups: [
            {
              id: "group-1",
              title: "Add wastage row",
              purpose: "Insert a wastage row.",
              confidence: "medium",
              assumptions: ["Only if wastage is handled in the worksheet rather than rate build-up."],
              warnings: [],
              relatedFindingIds: ["finding-1"],
              operations: [
                {
                  type: "insert_row",
                  target: { insertAfterRow: 2 },
                  values: { cells: [{ column: "B", value: "Wastage" }] },
                  formulas: { cells: [] },
                  rationale: "Add a wastage row for manual review.",
                },
              ],
            },
          ],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this estimate",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.operations).toEqual([]);
    expect(result.preview.suggestedEditGroups).toHaveLength(1);
    expect(result.preview.suggestedEditGroups[0]?.operations).toHaveLength(1);
  });

  it("preserves provider source metadata as evidenceSources when available", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponseWithProviderSources({
        mode: "answer_only",
        proposalName: "Estimate review",
        answer: "Review complete.",
        summary: "Source-backed review.",
        confidence: "medium",
        operations: [],
        assumptions: [],
        warnings: [],
      }),
    );

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "What does this Rondo line item mean?",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.evidenceSources).toHaveLength(1);
    expect(result.preview.evidenceSources[0]?.title).toContain("Rondo");
    expect(result.preview.evidenceSources[0]?.url).toBe("https://www.rondo.com.au/key-lock");
  });

  it("keeps high-risk findings uncertain when no evidence is available", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Estimate review",
          answer: "Review complete.",
          summary: "One high-risk issue.",
          confidence: "medium",
          operations: [],
          assumptions: [],
          warnings: [],
          reviewFindings: [
            {
              id: "finding-1",
              category: "specification_uncertainty",
              severity: "medium",
              confidence: "high",
              title: "Potential acoustic requirement",
              finding: "This may need acoustic sealant.",
            },
          ],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Explain if this acoustic sealant allowance makes sense",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.reviewFindings[0]?.confidence).toBe("low");
    expect(result.preview.reviewFindings[0]?.uncertainty).toContain("No supporting source evidence was captured");
  });

  it("does not create fake evidence sources for pure worksheet arithmetic", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Explain =A4*B4",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.evidenceSources).toEqual([]);
  });

  it("includes previous findings and rejection context in follow-up prompts", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "This wall is not acoustic rated.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      followUpContext: {
        previousReviewFindings: [
          {
            id: "finding-1",
            category: "specification_uncertainty",
            severity: "medium",
            confidence: "low",
            title: "Potential acoustic requirement",
            finding: "This may need acoustic sealant.",
            suggestedEditGroupId: "group-1",
            canSuggestWorksheetEdit: true,
          },
        ],
        previousReviewSummary: {
          presentItems: [],
          possibleMissingItems: ["Acoustic sealant"],
          keyRisks: ["Acoustic requirement unclear"],
          assumptions: ["Wall may be acoustic rated"],
          confirmationsNeeded: ["Confirm wall rating"],
        },
        previousSuggestedEditGroups: [
          {
            id: "group-1",
            title: "Add acoustic sealant",
            purpose: "Insert an acoustic sealant row.",
            confidence: "low",
            assumptions: ["Only if the wall is acoustic rated."],
            warnings: [],
            relatedFindingIds: ["finding-1"],
            operations: [],
          },
        ],
        acceptedFindingIds: [],
        rejectedFindingIds: ["finding-1"],
        appliedEditGroupIds: [],
        userCorrection: "This wall is not acoustic rated.",
      },
    });

    const { systemPromptText, userPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("do not treat previous findings as truth");
    expect(userPromptText).toContain("Previous review context");
    expect(userPromptText).toContain("\"rejectedFindingIds\": [");
    expect(userPromptText).toContain("This wall is not acoustic rated.");
    expect(userPromptText).toContain("revise that review instead of starting from scratch");
  });

  it("enables web search tooling for answer path requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Explain this formula",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const requestBody = readRequestBody(fetchMock);
    expect(requestBody.tools).toEqual([{ type: "web_search" }]);
    expect(requestBody.tool_choice).toBe("auto");
    expect(requestBody.include).toEqual(["web_search_call.action.sources"]);
  });

  it("enables web search tooling for review path requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this estimate",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(readRequestBody(fetchMock).tools).toEqual([{ type: "web_search" }]);
  });

  it("enables web search tooling for edit path requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create formulas for these rows",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(readRequestBody(fetchMock).tools).toEqual([{ type: "web_search" }]);
  });

  it("enables web search tooling for generation path requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Build a waterproofing estimate worksheet",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(readRequestBody(fetchMock).tools).toEqual([{ type: "web_search" }]);
  });

  it("enables web search tooling for quote/takeoff path requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Send this to quote",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(readRequestBody(fetchMock).tools).toEqual([{ type: "web_search" }]);
  });

  it("keeps search available without forcing external claims for pure spreadsheet explanations", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Explain =A4*B4",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const { systemPromptText, userPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("Do not use web search unnecessarily for pure spreadsheet arithmetic");
    expect(userPromptText).toContain("requiresRetrieval=false means web search is available but only needs to be used when it would materially improve construction accuracy.");
  });

  it("adds stronger search-required language when requiresRetrieval is true", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Explain if this acoustic sealant allowance makes sense",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    const { systemPromptText, userPromptText } = readPromptTexts(fetchMock);
    expect(systemPromptText).toContain("This request strongly requires web-backed evidence");
    expect(userPromptText).toContain("requiresRetrieval=true means web search is strongly expected before external construction claims.");
  });

  it("invalidates contradicted findings and removes stale edit groups on follow-up", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Revised review",
          answer: "Updated review after clarification.",
          summary: "The acoustic finding has been removed.",
          confidence: "low",
          operations: [],
          assumptions: [],
          warnings: [],
          reviewFindings: [],
          suggestedEditGroups: [
            {
              id: "group-1",
              title: "Add acoustic sealant",
              purpose: "Insert an acoustic sealant row.",
              confidence: "medium",
              assumptions: ["Only if the wall is acoustic rated."],
              warnings: [],
              relatedFindingIds: ["finding-1"],
              operations: [
                {
                  type: "insert_row",
                  target: { insertAfterRow: 2 },
                  values: { cells: [{ column: "B", value: "Acoustic sealant" }] },
                  formulas: { cells: [] },
                  rationale: "Add the missing sealant row.",
                },
              ],
            },
          ],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "This wall is not acoustic rated.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      followUpContext: {
        previousReviewFindings: [
          {
            id: "finding-1",
            category: "specification_uncertainty",
            severity: "medium",
            confidence: "medium",
            findingStatus: "active",
            title: "Potential acoustic requirement",
            finding: "This appears to need acoustic sealant.",
            assumption: "The wall may be acoustic rated.",
            suggestedEditGroupId: "group-1",
            canSuggestWorksheetEdit: true,
          },
        ],
        previousReviewSummary: {
          presentItems: [],
          possibleMissingItems: ["Acoustic sealant"],
          keyRisks: ["Acoustic requirement unclear"],
          assumptions: ["Wall may be acoustic rated"],
          confirmationsNeeded: ["Confirm wall rating"],
        },
        previousSuggestedEditGroups: [
          {
            id: "group-1",
            title: "Add acoustic sealant",
            purpose: "Insert an acoustic sealant row.",
            confidence: "medium",
            assumptions: ["Only if the wall is acoustic rated."],
            warnings: [],
            relatedFindingIds: ["finding-1"],
            operations: [
              {
                type: "insert_row",
                target: { insertAfterRow: 2 },
                values: { cells: [{ column: "B", value: "Acoustic sealant" }] },
                formulas: { cells: [] },
                rationale: "Add the missing sealant row.",
              },
            ],
          },
        ],
        acceptedFindingIds: [],
        rejectedFindingIds: ["finding-1"],
        appliedEditGroupIds: [],
        userCorrection: "This wall is not acoustic rated.",
      },
    });

    expect(result.preview.reviewFindings).toHaveLength(1);
    expect(result.preview.reviewFindings[0]?.findingStatus).toBe("invalidated");
    expect(result.preview.reviewFindings[0]?.confidence).toBe("low");
    expect(result.preview.suggestedEditGroups).toEqual([]);
    expect(result.preview.reviewSummary?.possibleMissingItems ?? []).not.toContain("Acoustic sealant");
  });

  it("does not let contradicted findings regain high confidence on later follow-ups", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Second revision",
          answer: "Updated review after another clarification.",
          summary: "The issue remains uncertain.",
          confidence: "medium",
          operations: [],
          assumptions: [],
          warnings: [],
          reviewFindings: [
            {
              id: "finding-1b",
              category: "specification_uncertainty",
              severity: "low",
              confidence: "high",
              title: "Potential acoustic requirement",
              finding: "There may still be an acoustic consideration.",
              assumption: "Wall type remains unclear.",
            },
          ],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Check if anything else changes.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      followUpContext: {
        previousReviewFindings: [
          {
            id: "finding-1",
            category: "specification_uncertainty",
            severity: "medium",
            confidence: "low",
            findingStatus: "invalidated",
            title: "Potential acoustic requirement",
            finding: "This appears to need acoustic sealant.",
            revisionReason: "Invalidated after clarification: This wall is not acoustic rated.",
          },
        ],
        previousReviewSummary: null,
        previousSuggestedEditGroups: [],
        acceptedFindingIds: [],
        rejectedFindingIds: [],
        appliedEditGroupIds: [],
        userCorrection: "We already established this is not acoustic rated.",
      },
    });

    expect(result.preview.reviewFindings[0]?.confidence).toBe("low");
    expect(["downgraded", "invalidated"]).toContain(result.preview.reviewFindings[0]?.findingStatus ?? "");
  });

  it("downgrades confidence after clarification when a finding remains but gets weaker", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Revised review",
          answer: "Updated review.",
          summary: "The issue is weaker after clarification.",
          confidence: "medium",
          operations: [],
          assumptions: [],
          warnings: [],
          reviewFindings: [
            {
              id: "finding-1",
              category: "labour_risk",
              severity: "low",
              confidence: "high",
              title: "Labour allowance may be low",
              finding: "There may still be a labour allowance gap.",
              assumption: "Access is standard.",
              uncertainty: "Confirm whether difficult access is already priced elsewhere.",
            },
          ],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Access is easier than assumed, so review the labour note again.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      followUpContext: {
        previousReviewFindings: [
          {
            id: "finding-1",
            category: "labour_risk",
            severity: "medium",
            confidence: "high",
            findingStatus: "active",
            title: "Labour allowance may be low",
            finding: "The labour row appears light.",
            assumption: "Difficult access may apply.",
          },
        ],
        previousReviewSummary: null,
        previousSuggestedEditGroups: [],
        acceptedFindingIds: [],
        rejectedFindingIds: [],
        appliedEditGroupIds: [],
        userCorrection: "Access is easier than assumed.",
      },
    });

    expect(result.preview.reviewFindings[0]?.confidence).toBe("low");
    expect(result.preview.reviewFindings[0]?.findingStatus).toBe("downgraded");
  });

  it("keeps revision consistency across multiple follow-ups", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Revised review",
          answer: "Updated review.",
          summary: "Labour still needs review.",
          confidence: "medium",
          operations: [],
          assumptions: [],
          warnings: [],
          reviewFindings: [
            {
              id: "finding-labour",
              category: "labour_risk",
              severity: "medium",
              confidence: "medium",
              title: "Labour allowance may be low",
              finding: "The labour row still appears light for the quantity shown.",
              assumption: "No special access issues are included.",
            },
          ],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Keep reviewing after removing the acoustic assumption.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      followUpContext: {
        previousReviewFindings: [
          {
            id: "finding-1",
            category: "specification_uncertainty",
            severity: "medium",
            confidence: "low",
            findingStatus: "invalidated",
            title: "Potential acoustic requirement",
            finding: "This appears to need acoustic sealant.",
          },
          {
            id: "finding-labour",
            category: "labour_risk",
            severity: "medium",
            confidence: "medium",
            findingStatus: "active",
            title: "Labour allowance may be low",
            finding: "The labour row appears light.",
          },
        ],
        previousReviewSummary: null,
        previousSuggestedEditGroups: [],
        acceptedFindingIds: [],
        rejectedFindingIds: ["finding-1"],
        appliedEditGroupIds: [],
        userCorrection: "The acoustic item is not relevant, but please keep checking the labour logic.",
      },
    });

    expect(result.preview.reviewFindings.some((finding) => finding.title.includes("acoustic"))).toBe(false);
    expect(result.preview.reviewFindings.some((finding) => finding.title.includes("Labour"))).toBe(true);
  });

  it("retries a transient provider 520 for edit prompts before falling back", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 520,
        statusText: "",
        text: async () => "temporary upstream error",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            mode: "propose_edit",
            proposalName: "Add steel stud LM row",
            answer: "",
            summary: "Adds a steel stud LM row with a formula based on wall length, spacing, and height.",
            confidence: "medium",
            operations: [
              {
                type: "insert_row",
                target: {
                  insertAfterRow: 2,
                  sectionName: "Framing",
                },
                values: {
                  cells: [
                    { column: "A", value: "Steel stud LM" },
                    { column: "B", value: "LM" },
                  ],
                },
                formulas: {
                  cells: [{ column: "C", formula: "=A2*(1000/B2)*C2" }],
                },
                rationale: "Adds the requested line item and calculation.",
              },
            ],
            assumptions: ["Wall length, spacing, and height inputs already exist nearby."],
            warnings: [],
          }),
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create a row for steel stud LM and add the formula to calculate it from wall length, stud spacing and wall height",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(["propose_edit", "answer_and_propose_edit"]).toContain(result.preview.mode);
    expect(result.preview.operations.length).toBeGreaterThan(0);
    expect(result.generationMeta.fallbackUsed).toBe(false);
  });

  it("retries low-quality blank-sheet formula proposals that use zero placeholders without formulas", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            mode: "propose_edit",
            proposalName: "Add steel stud LM row",
            answer: "",
            summary: "Create a starter row.",
            confidence: "low",
            operations: [
              {
                type: "update_cells",
                target: {
                  row: 1,
                },
                values: {
                  cells: [
                    { ref: "A1", value: "Steel stud" },
                    { ref: "B1", value: "LM" },
                    { ref: "C1", value: 0 },
                    { ref: "D1", value: 0 },
                    { ref: "E1", value: 0 },
                  ],
                },
                formulas: {
                  cells: [],
                },
                rationale: "Starter row",
              },
            ],
            assumptions: [],
            warnings: [],
          }),
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            mode: "answer_and_propose_edit",
            proposalName: "Add steel stud LM calculator row",
            answer: "I added a starter row with blank inputs and a formula cell.",
            summary: "Create a blank-input calculator row with an IFERROR formula.",
            confidence: "medium",
            operations: [
              {
                type: "update_cells",
                target: {
                  row: 1,
                },
                values: {
                  cells: [
                    { ref: "A1", value: "Steel stud LM" },
                    { ref: "B1", value: "LM" },
                    { ref: "C1", value: "" },
                    { ref: "D1", value: "" },
                    { ref: "E1", value: "" },
                  ],
                },
                formulas: {
                  cells: [{ ref: "F1", formula: '=IFERROR(C1*(1000/D1)*E1,"")' }],
                },
                rationale: "Leave inputs blank and place the formula in a separate cell.",
              },
            ],
            assumptions: ["C1 is wall length, D1 is stud spacing in mm, and E1 is wall height."],
            warnings: [],
          }),
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create a row for steel stud LM and add the formula to calculate it from wall length, stud spacing and wall height",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(["propose_edit", "answer_and_propose_edit"]).toContain(result.preview.mode);
    expect(result.preview.diffSummary.formulaCells).toContain("F1");
    expect(result.generationMeta.fallbackUsed).toBe(false);
  });

  it("promotes formula-like value entries into real formulas and recalculates them", async () => {
    const { worksheet, context } = buildFixture();
    setCellValue(worksheet, "A4", 10);
    setCellValue(worksheet, "B4", 20);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "propose_edit",
          proposalName: "Write selected-cell formula",
          answer: "",
          summary: "Put the provided formula into C4.",
          confidence: "high",
          operations: [
            {
              type: "update_cell",
              target: {
                cell: "C4",
              },
              values: {
                cells: [{ ref: "C4", value: "=A4*B4" }],
              },
              formulas: {
                cells: [],
              },
              rationale: "Write the formula into the requested cell.",
            },
          ],
          assumptions: [],
          warnings: [],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Put this formula in C4: =A4*B4",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.validationIssues).toEqual([]);
    expect(result.preview.operations[0]?.values?.cells ?? []).toEqual([]);
    expect(result.preview.operations[0]?.formulas?.cells?.[0]).toMatchObject({
      ref: "C4",
      formula: "=A4*B4",
    });
    expect(result.preview.worksheet.cells.C4?.formula).toBe("=A4*B4");
    expect(result.preview.worksheet.cells.C4?.displayValue).toBe("200");
  });

  it("builds a real selected-cell formula edit even when the provider answers with explanation text only", async () => {
    const { worksheet, context } = buildFixture();
    const worksheetContext = {
      ...context,
      visibleSelection: {
        activeCellKey: "C4",
        anchorCellKey: "C4",
        focusCellKey: "C4",
      },
    };
    setCellValue(worksheet, "A4", 10);
    setCellValue(worksheet, "B4", 20);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "answer_only",
          proposalName: "Formula explanation",
          answer: "Use =A4*B4 in C4.",
          summary: "Explains the requested formula.",
          confidence: "medium",
          operations: [],
          assumptions: [],
          warnings: [],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Put this formula in the selected cell: =A4*B4",
      worksheet,
      worksheetContext,
      memoryItems: [],
    });

    expect(result.preview.mode).toBe("answer_and_propose_edit");
    expect(result.preview.validationIssues).toEqual([]);
    expect(result.preview.diffSummary.changedCells).toEqual(["C4"]);
    expect(result.preview.worksheet.cells.C4?.formula).toBe("=A4*B4");
    expect(result.preview.worksheet.cells.C4?.displayValue).toBe("200");

    const applied = applyWorksheetMutation(worksheet, () => result.preview.worksheet, {
      validateFormulaOutputs: true,
    });
    expect(applied.validation.ok).toBe(true);
    expect(applied.changed).toBe(true);
    expect(applied.nextWorksheet.cells.C4?.formula).toBe("=A4*B4");
    expect(applied.nextWorksheet.cells.C4?.displayValue).toBe("200");

    const saveValidation = validateWorksheetBeforeSave(applied.nextWorksheet);
    expect(saveValidation.ok).toBe(true);
    if (!saveValidation.ok) {
      throw new Error(saveValidation.message);
    }

    const reloaded = recalculateWorksheetFormulas(
      JSON.parse(JSON.stringify(saveValidation.worksheet)),
    );
    expect(reloaded.cells.C4?.formula).toBe("=A4*B4");
    expect(reloaded.cells.C4?.displayValue).toBe("200");
  });

  it("allows bounded blank-sheet worksheet generation that touches more than the old small-edit cap", async () => {
    const { worksheet, context } = buildFixture();
    const operations = new Array(12).fill(null).map((_, index) => {
      const rowNumber = index + 1;
      return {
        type: "insert_row",
        target: { row: rowNumber },
        values: {
          cells: [
            { column: "A", value: rowNumber === 1 ? "Section" : rowNumber <= 4 ? "Inputs" : rowNumber <= 9 ? "Materials" : "Labour" },
            { column: "B", value: rowNumber === 1 ? "Item" : `Row ${rowNumber}` },
            { column: "C", value: rowNumber <= 4 ? null : undefined },
            { column: "D", value: rowNumber === 1 ? "Unit" : rowNumber <= 4 ? "lm" : rowNumber <= 9 ? "ea" : "hrs" },
            { column: "E", value: rowNumber === 1 ? "Rate" : null },
            { column: "F", value: rowNumber === 1 ? "Total" : null },
          ],
        },
        formulas:
          rowNumber <= 4
            ? { cells: [] }
            : {
                cells: [
                  {
                    column: "C",
                    formula: rowNumber <= 9 ? "=IFERROR(C2*1.0,\"\")" : "=IFERROR(C2*0.18,\"\")",
                  },
                  {
                    column: "F",
                    formula: `=IFERROR(C${rowNumber}*E${rowNumber},"")`,
                  },
                ],
              },
        rationale: "Bounded worksheet generation row.",
      };
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "propose_edit",
          proposalName: "Steel stud worksheet",
          answer: "Created a starter steel stud worksheet.",
          summary: "Adds inputs, material rows, labour rows, and formulas.",
          confidence: "medium",
          operations,
          assumptions: [],
          warnings: [],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt:
        "Create me spreadsheet that I put in the LM of a steel stud, and it will calculate all material and labour required.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.validationIssues).toEqual([]);
    expect(result.preview.diffSummary.changedCells.length).toBeGreaterThan(60);
    expect(result.preview.diffSummary.insertedRows.length).toBe(12);
  });

  it("extracts a structured object directly from output_parsed", () => {
    const extraction = extractPricingWorksheetAssistantPayload({
      output_parsed: {
        mode: "answer_only",
        proposalName: "Parsed output",
        answer: "Ready.",
        summary: "Done.",
        confidence: "medium",
        operations: [],
        assumptions: [],
        warnings: [],
      },
    });

    expect(extraction.structuredObject?.["proposalName"]).toBe("Parsed output");
    expect(extraction.diagnostics.sourcePath).toBe("output_parsed");
    expect(extraction.diagnostics.structuredObjectFound).toBe(true);
  });

  it("extracts a structured object from contentItem.parsed", () => {
    const extraction = extractPricingWorksheetAssistantPayload({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Provider text",
            },
            {
              type: "output_text",
              parsed: {
                mode: "answer_only",
                proposalName: "Parsed content",
                answer: "Ready.",
                summary: "Done.",
                confidence: "medium",
                operations: [],
                assumptions: [],
                warnings: [],
              },
            },
          ],
        },
      ],
    });

    expect(extraction.structuredObject?.["proposalName"]).toBe("Parsed content");
    expect(extraction.diagnostics.sourcePath).toContain(".parsed");
  });

  it("extracts a structured object from contentItem.json", () => {
    const extraction = extractPricingWorksheetAssistantPayload({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              json: {
                mode: "answer_only",
                proposalName: "JSON content",
                answer: "Ready.",
                summary: "Done.",
                confidence: "medium",
                operations: [],
                assumptions: [],
                warnings: [],
              },
            },
          ],
        },
      ],
    });

    expect(extraction.structuredObject?.["proposalName"]).toBe("JSON content");
    expect(extraction.diagnostics.sourcePath).toContain(".json");
  });

  it("extracts JSON from fenced output_text", () => {
    const extraction = extractPricingWorksheetAssistantPayload({
      output_text: "```json\n{\"mode\":\"answer_only\",\"proposalName\":\"Fenced\",\"answer\":\"Ok\",\"summary\":\"Done\",\"confidence\":\"medium\",\"operations\":[],\"assumptions\":[],\"warnings\":[]}\n```",
    });

    expect(extraction.structuredObject?.["proposalName"]).toBe("Fenced");
    expect(extraction.diagnostics.sourcePath).toBe("output_text");
  });

  it("extracts JSON from surrounding prose and ignores trailing annotation noise", () => {
    const extraction = extractPricingWorksheetAssistantPayload({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text:
                "Here is the worksheet response.\n{\"mode\":\"answer_only\",\"proposalName\":\"Prose wrapped\",\"answer\":\"Ok\",\"summary\":\"Done\",\"confidence\":\"medium\",\"operations\":[],\"assumptions\":[],\"warnings\":[]}\nSource note: Rondo manufacturer guide.",
            },
          ],
        },
      ],
    });

    expect(extraction.structuredObject?.["proposalName"]).toBe("Prose wrapped");
    expect(extraction.rawText).toContain("Source note");
  });

  it("preserves provider web-search sources without polluting JSON extraction", () => {
    const extraction = extractPricingWorksheetAssistantPayload({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              {
                title: "Rondo Key-Lock Concealed Ceiling System",
                url: "https://www.rondo.com.au/key-lock",
              },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text:
                "{\"mode\":\"answer_only\",\"proposalName\":\"Evidence aware\",\"answer\":\"Ok\",\"summary\":\"Done\",\"confidence\":\"medium\",\"operations\":[],\"assumptions\":[],\"warnings\":[]}",
              annotations: [
                {
                  type: "url_citation",
                  title: "Rondo Key-Lock Concealed Ceiling System",
                  url: "https://www.rondo.com.au/key-lock",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(extraction.structuredObject?.["proposalName"]).toBe("Evidence aware");
    expect(extraction.providerSources).toHaveLength(1);
    expect(extraction.providerSources[0]?.url).toBe("https://www.rondo.com.au/key-lock");
  });

  it("detects truncated JSON when braces never close", () => {
    const extraction = extractPricingWorksheetAssistantPayload({
      status: "incomplete",
      incomplete_details: {
        reason: "max_output_tokens",
      },
      output_text:
        "{\"mode\":\"propose_edit\",\"proposalName\":\"Truncated\",\"answer\":\"Ok\",\"summary\":\"Half-finished\",\"confidence\":\"medium\",\"operations\":[{\"type\":\"insert_row\"",
    });

    expect(extraction.structuredObject).toBeNull();
    expect(extraction.diagnostics.possibleTruncatedJson).toBe(true);
  });

  it("finds the first balanced JSON object while respecting quoted braces", () => {
    const balanced = extractBalancedJsonObject(
      "prefix {\"answer\":\"Use {A} here\",\"summary\":\"Done\",\"mode\":\"answer_only\"} suffix",
    );

    expect(balanced.jsonText).toBe("{\"answer\":\"Use {A} here\",\"summary\":\"Done\",\"mode\":\"answer_only\"}");
    expect(balanced.possibleTruncatedJson).toBe(false);
  });

  it("falls back with a specific malformed_json reason when provider text cannot be parsed", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: "{\"mode\":\"answer_only\",\"proposalName\":\"Broken\",",
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Build a worksheet",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.generationMeta.fallbackReason).toContain("truncated_json");
  });

  it("parses large worksheet-generation responses across multiple trade prompts without trade-specific assumptions", async () => {
    const prompts = [
      "Create a suspended ceiling calculator",
      "Build a waterproofing estimate worksheet",
      "Create an electrical rough-in pricing sheet",
      "Generate a painting labour/material worksheet",
      "Build a tiling calculator",
      "Create a partitions worksheet",
      "Create a steel stud wall calculator",
    ];

    for (const prompt of prompts) {
      const { worksheet, context } = buildFixture();
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    mode: "propose_edit",
                    proposalName: "Starter worksheet",
                    answer: "Created a starter worksheet.",
                    summary: "Adds input, material, labour, and total rows.",
                    confidence: "medium",
                    operations: [
                      {
                        type: "insert_row",
                        target: { row: 1 },
                        values: {
                          cells: [
                            { column: "A", value: "Section" },
                            { column: "B", value: "Item" },
                            { column: "C", value: "Qty" },
                            { column: "D", value: "Unit" },
                            { column: "E", value: "Rate" },
                            { column: "F", value: "Total" },
                          ],
                        },
                        formulas: {
                          cells: [{ column: "F", formula: "=IFERROR(C2*E2,\"\")" }],
                        },
                        rationale: "Add header row.",
                      },
                    ],
                    assumptions: ["Quantities are provided by the user."],
                    warnings: [],
                    reviewFindings: [],
                    suggestedEditGroups: [],
                    evidenceSources: [],
                  }),
                },
              ],
            },
          ],
        }),
      } as Response);

      const result = await buildPricingWorksheetEditAssistantPreview({
        prompt,
        worksheet,
        worksheetContext: context,
        memoryItems: [],
      });

      expect(result.generationMeta.fallbackUsed, prompt).toBe(false);
      expect(result.preview.mode).toBe("propose_edit");
      expect(result.preview.validationIssues).toEqual([]);
    }
  });

  it("parses evidenceSources with reviewFindings and suggestedEditGroups in one response", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text:
                  "```json\n" +
                  JSON.stringify({
                    mode: "answer_only",
                    proposalName: "Combined review",
                    answer: "Review complete.",
                    summary: "Source-backed finding.",
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
                        jurisdiction: "AU",
                        confidence: "medium",
                        supportedClaims: ["Explains perimeter trim requirements for the referenced system."],
                      },
                    ],
                    reviewFindings: [
                      {
                        id: "finding-1",
                        category: "missing_scope",
                        severity: "medium",
                        confidence: "medium",
                        title: "Potential missing perimeter trim",
                        finding: "Perimeter trim may be missing for the apparent system.",
                        evidenceSourceIds: ["source-1"],
                        suggestedEditGroupId: "group-1",
                        canSuggestWorksheetEdit: true,
                      },
                    ],
                    suggestedEditGroups: [
                      {
                        id: "group-1",
                        title: "Add perimeter trim row",
                        purpose: "Add a perimeter trim allowance row for review.",
                        confidence: "medium",
                        assumptions: ["Only if the detected system uses perimeter trim."],
                        warnings: [],
                        relatedFindingIds: ["finding-1"],
                        operations: [
                          {
                            type: "insert_row",
                            target: { insertAfterRow: 2 },
                            values: { cells: [{ column: "B", value: "Perimeter trim" }] },
                            formulas: { cells: [] },
                            rationale: "Add the row for review.",
                          },
                        ],
                      },
                    ],
                  }) +
                  "\n```",
              },
            ],
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this ceiling worksheet",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.evidenceSources).toHaveLength(1);
    expect(result.preview.reviewFindings[0]?.evidenceSourceIds).toEqual(["source-1"]);
    expect(result.preview.suggestedEditGroups[0]?.id).toBe("group-1");
  });

  it("still blocks invalid operations after broader provider parsing", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text:
          "Here you go:\n" +
          JSON.stringify({
            mode: "propose_edit",
            proposalName: "Unsafe formula",
            answer: "Tried to add a formula.",
            summary: "Contains an unsupported function.",
            confidence: "medium",
            operations: [
              {
                type: "update_cell",
                target: { cell: "C4" },
                values: { cells: [] },
                formulas: {
                  cells: [{ ref: "C4", formula: "=VLOOKUP(A1,B1:C4,2,FALSE)" }],
                },
                rationale: "Unsafe test formula.",
              },
            ],
            assumptions: [],
            warnings: [],
          }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create a formula here",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.validationIssues.some((issue) => issue.code === "formula_unsupported_function")).toBe(true);
  });

  it("uses a compact recovery retry for worksheet-generation provider failures instead of repeating large requests", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Upstream request timed out."))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            mode: "propose_edit",
            proposalName: "Compact starter worksheet",
            answer: "Created a compact starter worksheet.",
            summary: "Adds essential starter rows only.",
            confidence: "medium",
            operations: [
              {
                type: "insert_row",
                target: { row: 1 },
                values: {
                  cells: [
                    { column: "A", value: "Section" },
                    { column: "B", value: "Item" },
                    { column: "C", value: "Qty" },
                    { column: "D", value: "Rate" },
                    { column: "E", value: "Total" },
                  ],
                },
                formulas: {
                  cells: [{ column: "E", formula: "=IFERROR(C2*D2,\"\")" }],
                },
                rationale: "Compact starter row.",
              },
            ],
            assumptions: ["Additional rows can be added after review."],
            warnings: [],
          }),
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create me spreadsheet that I put in the LM of a steel stud, and it will calculate all material and labour required.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstRequestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      max_output_tokens?: number;
      input?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const secondRequestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      max_output_tokens?: number;
      input?: Array<{ content?: Array<{ text?: string }> }>;
    };

    expect(firstRequestBody.max_output_tokens).toBe(6500);
    expect(secondRequestBody.max_output_tokens).toBe(4500);
    expect(secondRequestBody.input?.[1]?.content?.[0]?.text ?? "").toContain("Retry instruction: return only the smallest useful starter worksheet");
    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.mode).toBe("propose_edit");
  });
});
