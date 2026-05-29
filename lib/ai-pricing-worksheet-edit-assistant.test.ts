import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "./opportunity-pricing-worksheet-mutations";
import { recalculateWorksheetFormulas } from "./opportunity-pricing-worksheet-formulas";
import { validateWorksheetBeforeSave } from "./opportunity-pricing-worksheet-save-validation";
import { buildPricingWorksheetAiContext } from "./pricing-worksheet-ai-context";
import { buildPricingWorksheetAiStructureSnapshot } from "./pricing-worksheet-ai-structure-snapshot";
import {
  buildPricingWorksheetContinuationPreview,
  buildPricingWorksheetEditAssistantPreview,
  buildFormulaStageContextBudgetForTest,
  extractBalancedJsonObject,
  extractPricingWorksheetAssistantPayload,
  getPricingWorksheetAiProviderSettings,
} from "./ai-pricing-worksheet-edit-assistant";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";
import type { PricingWorksheetConstructionIntent } from "./pricing-worksheet-construction-intent";
import type { PricingWorksheetAiAssistantPreview } from "./ai-pricing-worksheet-edit-assistant";
import {
  simulatePricingWorksheetAiEditPlan,
  type PricingWorksheetAiOperation,
} from "./pricing-worksheet-edit-plan";

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

function buildGenerationFixture() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Wall Framing",
    rowCount: 20,
    columnCount: 12,
  });

  const context = buildPricingWorksheetAiContext(worksheet, {
    worksheetId: "worksheet-generation-123",
    worksheetName: "Wall Framing",
    tradePackage: "Wall framing",
  });

  return { worksheet, context };
}

function buildStructuredFormulaFixture() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Ceilings",
    rowCount: 20,
    columnCount: 12,
  });

  setCellValue(worksheet, "A1", "Inputs");
  setCellValue(worksheet, "B2", "Ceiling Area");
  setCellValue(worksheet, "E2", 100);
  setCellValue(worksheet, "B3", "Main Tees");
  setCellValue(worksheet, "D3", "m2");
  setCellValue(worksheet, "E3", 100);
  setCellValue(worksheet, "F3", 1);
  setCellValue(worksheet, "H3", 7);
  setCellValue(worksheet, "B4", "Cross Tees");
  setCellValue(worksheet, "D4", "m2");
  setCellValue(worksheet, "E4", 100);
  setCellValue(worksheet, "F4", 0.8);
  setCellValue(worksheet, "H4", 7);
  setCellValue(worksheet, "B5", "Materials Subtotal");

  const context = buildPricingWorksheetAiContext(worksheet, {
    worksheetId: "worksheet-formula-123",
    worksheetName: "Ceilings",
    tradePackage: "Ceilings",
  });

  return { worksheet, context };
}

function buildMediumFormulaBudgetFixture() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Medium Formula Worksheet",
    rowCount: 28,
    columnCount: 12,
  });

  const sectionStarts = [1, 5, 9, 13, 17, 21];
  for (const [sectionIndex, startRow] of sectionStarts.entries()) {
    setCellValue(worksheet, `A${startRow}`, `Section ${sectionIndex + 1}`);
    for (let offset = 1; offset <= 2; offset += 1) {
      const row = startRow + offset;
      setCellValue(worksheet, `B${row}`, `Component ${sectionIndex + 1}-${offset}`);
      setCellValue(
        worksheet,
        `C${row}`,
        `Estimator input row ${sectionIndex + 1}-${offset} with spacing and wastage guidance.`,
      );
      setCellValue(worksheet, `D${row}`, "m2");
      setCellValue(worksheet, `E${row}`, 100 + row);
      setCellValue(worksheet, `F${row}`, 1.25);
      setCellValue(worksheet, `H${row}`, 7.5);
      setCellValue(
        worksheet,
        `K${row}`,
        `Editable assumption row ${sectionIndex + 1}-${offset} for area and spacing inputs.`,
      );
    }
  }

  const context = buildPricingWorksheetAiContext(worksheet, {
    worksheetId: "worksheet-formula-medium-123",
    worksheetName: "Medium Formula Worksheet",
    tradePackage: "Ceilings",
  });

  return { worksheet, context };
}

function buildLargeFormulaBudgetFixture() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Large Formula Worksheet",
    rowCount: 72,
    columnCount: 12,
  });

  const sectionStarts = [1, 8, 15, 22, 29, 36, 43, 50, 57, 64];
  for (const [sectionIndex, startRow] of sectionStarts.entries()) {
    setCellValue(worksheet, `A${startRow}`, `Section ${sectionIndex + 1}`);
    for (let offset = 1; offset <= 4; offset += 1) {
      const row = startRow + offset;
      setCellValue(worksheet, `B${row}`, `Component ${sectionIndex + 1}-${offset}`);
      setCellValue(
        worksheet,
        `C${row}`,
        `Estimator input row ${sectionIndex + 1}-${offset} with detailed notes about spacing, wastage, module sizes, labour productivity, and rate assumptions for worksheet budgeting coverage.`,
      );
      setCellValue(worksheet, `D${row}`, offset % 2 === 0 ? "lm" : "m2");
      setCellValue(worksheet, `E${row}`, 120 + row);
      setCellValue(worksheet, `F${row}`, 1.35 + sectionIndex * 0.05);
      setCellValue(worksheet, `G${row}`, 0.15 + offset * 0.02);
      setCellValue(worksheet, `H${row}`, 72 + sectionIndex);
      setCellValue(worksheet, `I${row}`, 0.15);
      setCellValue(
        worksheet,
        `K${row}`,
        `Editable assumption row ${sectionIndex + 1}-${offset} for area, spacing, productivity, wastage, and pricing inputs that should stay visible to estimators during follow-up AI requests.`,
      );
    }

    const subtotalRow = startRow + 5;
    setCellValue(worksheet, `B${subtotalRow}`, `${sectionIndex + 1} subtotal`);
    setCellFormula(worksheet, `J${subtotalRow}`, `SUM(J${startRow + 1}:J${startRow + 4})`);
  }

  const context = buildPricingWorksheetAiContext(worksheet, {
    worksheetId: "worksheet-formula-large-123",
    worksheetName: "Large Formula Worksheet",
    tradePackage: "Ceilings",
  });

  return { worksheet, context };
}

function buildMixedFormulaScopeFixture() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Mixed Formula Scope Worksheet",
    rowCount: 48,
    columnCount: 12,
  });

  setCellValue(worksheet, "A1", "Materials");
  setCellValue(worksheet, "B2", "Roof Area");
  setCellValue(worksheet, "E2", 240);
  setCellValue(worksheet, "B3", "Wastage");
  setCellValue(worksheet, "E3", 0.08);
  setCellValue(worksheet, "B4", "Long-run sheets");
  setCellValue(worksheet, "J4", 0);
  setCellFormula(worksheet, "J4", "E2*(1+E3)");
  setCellValue(worksheet, "B5", "Flashings");
  setCellFormula(worksheet, "J5", "J4*0.12");
  setCellValue(worksheet, "B6", "Materials subtotal");
  setCellFormula(worksheet, "J6", "SUM(J4:J5)");

  setCellValue(worksheet, "A16", "Labour");
  setCellValue(worksheet, "B17", "Crew Hours");
  setCellFormula(worksheet, "J17", "E2*0.14");
  setCellValue(worksheet, "B18", "Labour subtotal");
  setCellFormula(worksheet, "J18", "SUM(J17)");

  setCellValue(worksheet, "A28", "Dashboard");
  setCellValue(worksheet, "B29", "Gross Margin");
  setCellFormula(worksheet, "J29", "J6+J18");
  setCellValue(worksheet, "B30", "Margin %");
  setCellFormula(worksheet, "J30", "J29/1000");

  const context = buildPricingWorksheetAiContext(worksheet, {
    worksheetId: "worksheet-formula-mixed-123",
    worksheetName: worksheet.sheetName,
    tradePackage: "Roofing",
  });

  return { worksheet, context };
}

function buildContinuationPreviewFixture(params: {
  worksheet: ReturnType<typeof createDefaultWorksheetData>;
  operations: PricingWorksheetAiOperation[];
  continuation: PricingWorksheetAiAssistantPreview["continuation"];
}): PricingWorksheetAiAssistantPreview {
  return {
    mode: "propose_edit",
    proposalName: "Safe worksheet build batch",
    answer: "This is a large worksheet, so TradesStack is building it safely in stages.",
    summary: "Prepared the next safe worksheet build batch.",
    confidence: "medium",
    operations: params.operations,
    assumptions: [],
    warnings: [],
    reviewFindings: [],
    reviewSummary: null,
    suggestedEditGroups: [],
    evidenceSources: [],
    worksheet: params.worksheet,
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
      evidenceSources: [],
      reviewFindings: [],
      reviewSummary: null,
      suggestedEditGroups: [],
      continuation: params.continuation
        ? {
            strategy: params.continuation.strategy,
            currentBatchIndex: params.continuation.currentBatchIndex,
            totalBatchCount: params.continuation.totalBatchCount,
            remainingBatchCount: params.continuation.remainingBatchCount,
            remainingOperationCount: params.continuation.remainingOperationCount,
          }
        : null,
    },
    validationIssues: [],
    validationWarnings: [],
    compactOutput: {
      worksheetName: params.worksheet.sheetName,
      tradePackage: "Ceilings",
      suggestionSource: "default",
      confidence: "medium",
      rowCount: params.worksheet.rows.length,
      columnCount: params.worksheet.columns.length,
      formulaCount: 0,
      populatedCellCount: 0,
      sectionCounts: {
        sections: 0,
        rows: 0,
        operations: params.operations.length,
      },
      headers: params.worksheet.columns.map((column) => column.id),
      sections: [],
      assumptions: [],
      warnings: [],
      promptHighlights: [],
      sampleLineItems: [],
    },
    matchedMemory: null,
    contextSummary: {
      matchedMemoryCount: 0,
      summary: "Continuation preview test",
    },
    classification: {
      primaryIntent: "worksheet_generation",
      defaultJurisdiction: "AUS_NZ",
      requiresConstructionReasoning: true,
      requiresRetrieval: false,
      tradeHints: ["ceilings"],
      systemHints: [],
      confidence: "high",
      riskLevel: "high",
      shouldAskFollowUp: false,
      reason: "Continuation preview test",
      recommendedPromptPath: "generation",
    },
    continuation: params.continuation,
  };
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

function setCellFormula(worksheet: ReturnType<typeof createDefaultWorksheetData>, ref: string, formula: string) {
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
    value: null,
    type: "number",
    formula,
    computedValue: 0,
    displayValue: "0",
    metadata: {},
  };
}

function buildBudgetConstructionSummary() {
  return {
    worksheetName: "Ceilings",
    tradePackage: "Ceilings",
    primaryIntent: "formula_generate",
    recommendedPromptPath: "edit",
    tradeHints: ["ceilings", "commercial fitout", "interiors"],
    systemHints: ["grid spacing", "module size", "suspended ceiling"],
    riskLevel: "high",
    requiresRetrieval: true,
    retrievalReasons: ["system quantity logic", "manufacturer layout assumptions"],
    organizationMemorySummary:
      "Editable area, spacing, wastage, productivity, and margin assumptions should remain visible in estimator-friendly rows.",
    organizationGuidanceSummary:
      "Keep formula-driving assumptions explicit and connect component quantities back to visible worksheet inputs where possible.",
    followUpContextSummary: {
      userCorrection: "The worksheet still needs formulas based on SQM inputs.",
      previousSummary: "Earlier response created rows but not enough construction-specific formulas.",
      acceptedFindingCount: 0,
      rejectedFindingCount: 0,
      appliedEditGroupCount: 0,
    },
    assumptionCautionRules: [
      "Treat trade, manufacturer, and system logic as assumptions unless the worksheet confirms them.",
      "Prefer editable rows for area, spacing, wastage, productivity, and margin assumptions.",
      "Do not invent hidden constants.",
    ],
  } as const;
}

function shiftCellRefForBudgetTest(ref: string | null, rowOffset: number) {
  if (!ref) {
    return ref;
  }

  return ref.replace(/([A-Z]+)(\d+)/g, (_match, column: string, row: string) => `${column}${Number(row) + rowOffset}`);
}

function inflateSnapshotForBudgetTest(
  snapshot: ReturnType<typeof buildPricingWorksheetAiStructureSnapshot>,
  copies = 3,
) {
  const rows: typeof snapshot.rows = [];
  const formulaRows: typeof snapshot.formulaTargets.rows = [];
  const sections: typeof snapshot.sections = [];
  const totals: typeof snapshot.totals = [];

  for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
    const rowOffset = copyIndex * 100;
    rows.push(
      ...snapshot.rows.map((row) => ({
        ...row,
        rowNumber: row.rowNumber + rowOffset,
        formulaRefs: row.formulaRefs.map((ref) => shiftCellRefForBudgetTest(ref, rowOffset) ?? ref),
      })),
    );
    formulaRows.push(
      ...snapshot.formulaTargets.rows.map((row) => ({
        ...row,
        rowNumber: row.rowNumber + rowOffset,
        primaryRef: shiftCellRefForBudgetTest(row.primaryRef, rowOffset),
        cells: {
          quantity: shiftCellRefForBudgetTest(row.cells.quantity, rowOffset),
          materialRate: shiftCellRefForBudgetTest(row.cells.materialRate, rowOffset),
          labourHours: shiftCellRefForBudgetTest(row.cells.labourHours, rowOffset),
          labourRate: shiftCellRefForBudgetTest(row.cells.labourRate, rowOffset),
          margin: shiftCellRefForBudgetTest(row.cells.margin, rowOffset),
          total: shiftCellRefForBudgetTest(row.cells.total, rowOffset),
          notes: shiftCellRefForBudgetTest(row.cells.notes, rowOffset),
        },
      })),
    );
    sections.push(
      ...snapshot.sections.map((section) => ({
        ...section,
        startRow: section.startRow + rowOffset,
        endRow: section.endRow + rowOffset,
        subtotalRow: section.subtotalRow ? section.subtotalRow + rowOffset : null,
        totalCells: section.totalCells.map((ref) => shiftCellRefForBudgetTest(ref, rowOffset) ?? ref),
      })),
    );
    totals.push(
      ...snapshot.totals.map((total) => ({
        ...total,
        rowNumber: total.rowNumber + rowOffset,
      })),
    );
  }

  const nextSnapshot = {
    ...snapshot,
    rows,
    sections,
    totals,
    formulaTargets: {
      ...snapshot.formulaTargets,
      rows: formulaRows,
    },
  };

  return {
    ...nextSnapshot,
    estimatedTokenSize: Math.ceil(JSON.stringify(nextSnapshot).length / 4),
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

function readRequestBody(fetchMock: ReturnType<typeof vi.spyOn>, callIndex = 0) {
  return JSON.parse(String(fetchMock.mock.calls[callIndex]?.[1]?.body ?? "{}")) as Record<string, unknown>;
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

function buildClassification(overrides: Partial<PricingWorksheetConstructionIntent> = {}): PricingWorksheetConstructionIntent {
  return {
    primaryIntent: "review_estimate",
    defaultJurisdiction: "AUS_NZ",
    requiresConstructionReasoning: true,
    requiresRetrieval: false,
    tradeHints: [],
    systemHints: [],
    confidence: "medium",
    riskLevel: "medium",
    shouldAskFollowUp: false,
    reason: "Test classification",
    matchedIntentSignals: [],
    matchedTradeSignals: [],
    matchedSystemSignals: [],
    matchedRiskSignals: [],
    retrievalReasons: [],
    recommendedPromptPath: "review",
    ...overrides,
  };
}

describe("buildPricingWorksheetEditAssistantPreview", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalProvider = process.env.PRICING_WORKSHEET_AI_PROVIDER;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalAnthropicModel = process.env.ANTHROPIC_WORKSHEET_MODEL;
  const originalAnthropicEmptyOperationRetry = process.env.PRICING_WORKSHEET_ANTHROPIC_EMPTY_OPERATION_RETRY;

  beforeEach(() => {
    if (process.env.RUN_OPENAI_TESTS !== "1") {
      process.env.OPENAI_API_KEY = "test-key";
    }
    delete process.env.PRICING_WORKSHEET_AI_PROVIDER;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalProvider === undefined) {
      delete process.env.PRICING_WORKSHEET_AI_PROVIDER;
    } else {
      process.env.PRICING_WORKSHEET_AI_PROVIDER = originalProvider;
    }
    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    }
    if (originalAnthropicModel === undefined) {
      delete process.env.ANTHROPIC_WORKSHEET_MODEL;
    } else {
      process.env.ANTHROPIC_WORKSHEET_MODEL = originalAnthropicModel;
    }
    if (originalAnthropicEmptyOperationRetry === undefined) {
      delete process.env.PRICING_WORKSHEET_ANTHROPIC_EMPTY_OPERATION_RETRY;
    } else {
      process.env.PRICING_WORKSHEET_ANTHROPIC_EMPTY_OPERATION_RETRY = originalAnthropicEmptyOperationRetry;
    }
  });

  it("uses a longer timeout for worksheet_generation requests that require retrieval", () => {
    const settings = getPricingWorksheetAiProviderSettings(
      buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: true,
        recommendedPromptPath: "generation",
        tradeHints: ["ceilings"],
        systemHints: ["rondo"],
      }),
    );

    expect(settings.timeoutMs).toBe(90_000);
    expect(settings.maxProviderAttempts).toBe(1);
    expect(settings.webSearchEnabled).toBe(true);
  });

  it("keeps the shorter timeout for simple formula and answer prompts", () => {
    const formulaSettings = getPricingWorksheetAiProviderSettings(
      buildClassification({
        primaryIntent: "formula_explain",
        requiresRetrieval: false,
        recommendedPromptPath: "answer",
      }),
    );
    const answerSettings = getPricingWorksheetAiProviderSettings(
      buildClassification({
        primaryIntent: "answer_only",
        requiresRetrieval: false,
        recommendedPromptPath: "answer",
      }),
    );

    expect(formulaSettings.timeoutMs).toBe(45_000);
    expect(answerSettings.timeoutMs).toBe(45_000);
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

  it("records disabled web search in preview metadata when the provider request runs without search", async () => {
    const { worksheet, context } = buildFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMinimalAssistantResponse());

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Build a compact starter pricing worksheet.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: true,
        recommendedPromptPath: "generation",
      }),
      providerOptions: {
        webSearchEnabled: false,
      },
    });

    expect(result.providerAudit.webSearchEnabled).toBe(false);
    expect(result.preview.storageSummary.webSearchEnabled).toBe(false);
  });

  it("fails safely when anthropic is selected without an Anthropic API key", async () => {
    const { worksheet, context } = buildFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this pricing worksheet.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.generationMeta.provider).toBe("tradesstack");
    expect(result.generationMeta.fallbackReason).toContain("ANTHROPIC_API_KEY is not configured.");
    expect(result.providerAudit.requestedProvider).toBe("anthropic");
    expect(result.providerAudit.actualProvider).toBe("anthropic");
    expect(result.providerAudit.webSearchEnabled).toBe(false);
  });

  it("uses the anthropic provider without requiring OPENAI_API_KEY", async () => {
    const { worksheet, context } = buildFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_test",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "answer_only",
              proposalName: "Anthropic worksheet response",
              answer: "Here is the Anthropic answer.",
              summary: "Anthropic summary.",
              confidence: "medium",
              operations: [],
              assumptions: [],
              warnings: [],
            }),
          },
        ],
        usage: {
          input_tokens: 12,
          output_tokens: 24,
        },
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this pricing worksheet.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      providerOptions: {
        webSearchEnabled: true,
      },
    });

    expect(fetchMock).toHaveBeenCalled();
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(requestBody.model).toBe("claude-sonnet-4-6");
    expect(requestBody).toHaveProperty("output_config");
    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.generationMeta.provider).toBe("anthropic");
    expect(result.providerAudit.requestedProvider).toBe("anthropic");
    expect(result.providerAudit.actualProvider).toBe("anthropic");
    expect(result.providerAudit.webSearchEnabled).toBe(false);
    expect(result.preview.storageSummary.webSearchEnabled).toBe(false);
    expect(result.preview.warnings).not.toContain("web_search_unavailable_for_provider");
  });

  it("converts Anthropic worksheet drafts into previewable operations for generation prompts", async () => {
    const { worksheet, context } = buildGenerationFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_draft_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "worksheet_draft",
                proposalName: "Ceilings starter worksheet",
                answer: "Built a compact starter worksheet draft.",
                sections: [
                  {
                    title: "Inputs",
                    rows: [
                      {
                        label: "Ceiling area",
                        description: "Measured suspended ceiling area",
                        unit: "m2",
                        rowPurpose: "input",
                        quantityValue: 100,
                        materialRate: null,
                        labourRate: null,
                        formulaIntent: "input row for area-based calculations",
                      },
                    ],
                  },
                  {
                    title: "Materials",
                    rows: [
                      {
                        label: "Grid and tile supply",
                        description: "Main ceiling material",
                        unit: "m2",
                        rowPurpose: "material",
                        quantityValue: 100,
                        materialRate: 42.5,
                        labourRate: 72,
                        formulaIntent: "material total plus labour and margin",
                      },
                    ],
                  },
                ],
                assumptions: ["Starter structure only."],
                warnings: [],
              }),
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_formula_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "formula_suggestions",
                answer: "Added worksheet-aware formulas to generated rows.",
                assumptions: ["Margin is applied to combined material and labour cost."],
                warnings: [],
                suggestions: [
                  {
                    targetRowNumber: 5,
                    targetColumn: "G",
                    expression: "=E5*0.18",
                    rationale: "Labour hours based on quantity.",
                  },
                  {
                    targetRowNumber: 5,
                    targetColumn: "I",
                    expression: "=(E5*F5+G5*H5)*0.15",
                    rationale: "Margin on combined cost.",
                  },
                  {
                    targetRowNumber: 5,
                    targetColumn: "J",
                    expression: "=(E5*F5)+(G5*H5)+I5",
                    rationale: "Total including margin.",
                  },
                ],
              }),
            },
          ],
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt:
        "Create a suspended ceilings pricing worksheet with materials, labour, wastage, margins, formulas and totals.",
      worksheet,
      worksheetContext: context,
      memoryItems: [
        {
          id: "memory-1",
          title: "Suspended ceiling estimating example",
          summary: "Editable area, module spacing, wastage, and margin inputs are usually surfaced as worksheet rows.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workspaceId: "org-1",
          similarity: 0.9,
        },
      ],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: true,
        recommendedPromptPath: "generation",
        tradeHints: ["ceilings"],
        systemHints: ["suspended ceiling grid"],
        retrievalReasons: ["manufacturer layout assumptions"],
      }),
      organizationGuidance: {
        items: [
          {
            title: "Ceiling quantity assumptions",
            guidance: "Keep spacing, wastage, productivity, and margin assumptions editable in visible rows.",
          },
        ],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const structureRequestBody = readRequestBody(fetchMock, 0);
    const formulaRequestBody = readRequestBody(fetchMock, 1);
    const formulaUserPrompt = String(
      ((formulaRequestBody.messages as Array<{ content?: Array<{ text?: string }> }> | undefined)?.[0]?.content?.[0]
        ?.text) ?? "",
    );
    expect(String(structureRequestBody.system ?? "")).toContain("Return mode=\"worksheet_draft\"");
    expect(
      (((structureRequestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema as Record<
        string,
        unknown
      >).properties,
    ).not.toHaveProperty("operations");
    expect(String(formulaRequestBody.system ?? "")).toContain("worksheet-aware formula assistant");
    expect(formulaUserPrompt).toContain("Construction intelligence summary:");
    expect(formulaUserPrompt).toContain("suspended ceiling grid");
    expect(formulaUserPrompt).toContain("Starter structure only.");
    expect(formulaUserPrompt).toContain("Assumption and input row summary:");
    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.generationMeta.provider).toBe("anthropic");
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.operations.length).toBeGreaterThan(0);
    expect(result.preview.diffSummary.formulaCells.length).toBeGreaterThan(0);
    expect(result.preview.validationIssues).toEqual([]);
  });

  it("routes blank worksheet generation prompts with highlight-input phrasing to staged generation instead of formatting", async () => {
    const { worksheet, context } = buildGenerationFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_draft_highlight_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "worksheet_draft",
                proposalName: "Ceiling grid starter worksheet",
                answer: "Built a compact starter worksheet draft.",
                sections: [
                  {
                    title: "Inputs",
                    rows: [
                      {
                        label: "Area",
                        description: "Editable measured area",
                        unit: "m2",
                        rowPurpose: "input",
                        quantityValue: null,
                        materialRate: null,
                        labourRate: null,
                        formulaIntent: "editable input row",
                      },
                    ],
                  },
                  {
                    title: "Pricing",
                    rows: [
                      {
                        label: "Supply and install",
                        description: "Starter pricing row",
                        unit: "m2",
                        rowPurpose: "line_item",
                        quantityValue: null,
                        materialRate: null,
                        labourRate: null,
                        formulaIntent: "quantity times material rate plus labour and margin",
                      },
                    ],
                  },
                ],
                assumptions: ["Starter worksheet only."],
                warnings: [],
              }),
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_formula_highlight_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "formula_suggestions",
                answer: "Added worksheet-aware formulas.",
                assumptions: [],
                warnings: [],
                suggestions: [
                  {
                    targetRowNumber: 5,
                    targetColumn: "J",
                    expression: '=IFERROR((E5*F5)+(G5*H5)+I5,"")',
                    rationale: "Build the starter total row.",
                  },
                ],
              }),
            },
          ],
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt:
        "I need you to create me a spreadsheet that when i put in SQM it will calculate all the material and labour components for a 24mm rondo donn 1200 x 600 ceiling grid. Please highlight the cells i need to fill in",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: true,
        recommendedPromptPath: "generation",
        tradeHints: ["ceilings"],
        systemHints: ["rondo"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstRequestBody = readRequestBody(fetchMock, 0);
    const firstSchemaProperties =
      (((firstRequestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema as Record<
        string,
        unknown
      >).properties as Record<string, unknown>;
    expect(String(firstRequestBody.system ?? "")).not.toContain("worksheet formatting assistant");
    expect((firstSchemaProperties.mode as Record<string, unknown>).enum).toEqual(["worksheet_draft", "answer_only"]);
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.operations.length).toBeGreaterThan(0);
    expect(result.preview.validationIssues).toEqual([]);
    expect(result.preview.answer).not.toContain("The AI returned an explanation but no worksheet changes");
  });

  it("falls back to a structure-only preview when the Anthropic formula stage fails", async () => {
    const { worksheet, context } = buildGenerationFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_draft_2",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "worksheet_draft",
                proposalName: "Partitions starter worksheet",
                answer: "Built the worksheet structure.",
                sections: [
                  {
                    title: "Materials",
                    rows: [
                      {
                        label: "Track and stud",
                        description: "Primary framing line",
                        unit: "lm",
                        rowPurpose: "material",
                        quantityValue: 80,
                        materialRate: 8.75,
                        labourRate: 68,
                        formulaIntent: "structure only",
                      },
                    ],
                  },
                ],
                assumptions: [],
                warnings: [],
              }),
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => JSON.stringify({ error: { message: "rate limit" } }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create a partitions pricing worksheet with materials, labour, wastage, margins, formulas and totals.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: true,
        recommendedPromptPath: "generation",
        tradeHints: ["partitions"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.operations.length).toBeGreaterThan(0);
    expect(result.preview.diffSummary.formulaCells).toEqual([]);
    expect(result.preview.warnings).toContain(
      "Formula generation was rate limited, so the preview contains structure only.",
    );
  });

  it("routes Anthropic formula-generation prompts on structured worksheets to the worksheet-aware formula stage", async () => {
    const { worksheet, context } = buildStructuredFormulaFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_formula_existing_1",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "formula_suggestions",
              answer: "Added formulas for totals from the existing worksheet inputs.",
              assumptions: ["Main tee and cross tee rates are already entered."],
              warnings: [],
              suggestions: [
                {
                  targetRowNumber: 3,
                  targetColumn: "J",
                  expression: "=E3*F3",
                  rationale: "Calculate main tee total from quantity and rate.",
                },
                {
                  targetRowNumber: 4,
                  targetColumn: "J",
                  expression: "=E4*F4",
                  rationale: "Calculate cross tee total from quantity and rate.",
                },
                {
                  targetRowNumber: 5,
                  targetColumn: "J",
                  expression: "=SUM(J3:J4)",
                  rationale: "Subtotal materials rows.",
                },
              ],
            }),
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "It did not provide the formulas to calculate the components based on the SQM.",
      worksheet,
      worksheetContext: context,
      memoryItems: [
        {
          id: "memory-2",
          title: "Ceiling worksheet logic",
          summary: "Component quantities should be driven from area and visible estimating assumptions where possible.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workspaceId: "org-1",
          similarity: 0.85,
        },
      ],
      classification: buildClassification({
        primaryIntent: "formula_generate",
        requiresRetrieval: true,
        recommendedPromptPath: "edit",
        tradeHints: ["ceilings"],
        systemHints: ["grid spacing"],
        retrievalReasons: ["system quantity logic"],
      }),
      organizationGuidance: {
        items: [
          {
            title: "Editable assumptions",
            guidance: "Tie component formulas to visible area, spacing, wastage, productivity, and margin rows when available.",
          },
        ],
      },
      followUpContext: {
        userCorrection: "The worksheet still needs formulas based on the SQM inputs.",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = readRequestBody(fetchMock, 0);
    const formulaUserPrompt = String(
      ((requestBody.messages as Array<{ content?: Array<{ text?: string }> }> | undefined)?.[0]?.content?.[0]
        ?.text) ?? "",
    );
    expect(String(requestBody.system ?? "")).toContain("worksheet-aware formula assistant");
    expect(
      (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema as Record<
        string,
        unknown
      >).properties,
    ).not.toHaveProperty("operations");
    expect(formulaUserPrompt).toContain("Construction intelligence summary:");
    expect(formulaUserPrompt).toContain("system quantity logic");
    expect(formulaUserPrompt).toContain("grid spacing");
    expect(formulaUserPrompt).toContain("Ceiling worksheet logic");
    expect(formulaUserPrompt).toContain("The worksheet still needs formulas based on the SQM inputs.");
    expect(formulaUserPrompt).toContain("Assumption and input row summary:");
    expect(result.generationMeta.provider).toBe("anthropic");
    expect(result.providerAudit.actualProvider).toBe("anthropic");
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.diffSummary.formulaCells.length).toBeGreaterThan(0);
    expect(result.preview.validationIssues).toEqual([]);
  });

  it("does not double-count the worksheet snapshot in Anthropic formula-stage token budgeting", async () => {
    const { worksheet, context } = buildMediumFormulaBudgetFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_formula_budget_ok",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "formula_suggestions",
              answer: "Added formulas for the visible worksheet rows.",
              assumptions: [],
              warnings: [],
              suggestions: [
                {
                  targetRowNumber: 2,
                  targetColumn: "J",
                  expression: "=E2*F2",
                  rationale: "Calculate total from visible quantity and rate inputs.",
                },
              ],
            }),
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Add formulas based on the visible worksheet assumptions and section inputs.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "formula_generate",
        recommendedPromptPath: "edit",
        tradeHints: ["ceilings"],
      }),
    });

    const requestLog = infoSpy.mock.calls
      .map((call) => call[1])
      .find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).action === "formula_stage_request_started") as
      | Record<string, unknown>
      | undefined;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestLog).toBeDefined();
    expect(Number(requestLog?.estimatedTokenSize ?? 0)).toBeLessThan(7000);
    expect(Number(requestLog?.worksheetSnapshotTokenEstimate ?? 0)).toBeGreaterThan(0);
    expect(result.preview.mode).toBe("propose_edit");
  });

  it("compacts large Anthropic formula-stage contexts through scoped levels while preserving construction intelligence", () => {
    const { worksheet, context } = buildLargeFormulaBudgetFixture();
    const classification = buildClassification({
      primaryIntent: "formula_generate",
      recommendedPromptPath: "edit",
      tradeHints: ["ceilings"],
      systemHints: ["grid spacing", "module size"],
      requiresRetrieval: true,
      retrievalReasons: ["system quantity logic"],
      riskLevel: "high",
    });
    const snapshot = buildPricingWorksheetAiStructureSnapshot({
      worksheet,
      worksheetContext: context,
      classification,
      prompt: "Add formulas for the labour, wastage, and total rows in the affected sections.",
    });
    const constructionSummary = {
      ...buildBudgetConstructionSummary(),
      organizationMemorySummary: `${buildBudgetConstructionSummary().organizationMemorySummary} `.repeat(20),
      organizationGuidanceSummary: `${buildBudgetConstructionSummary().organizationGuidanceSummary} `.repeat(20),
    };

    const budget = buildFormulaStageContextBudgetForTest({
      workflow: "formula",
      prompt: "Add formulas for the labour, wastage, and total rows in the affected sections.",
      systemPrompt: "You are TradesStack's worksheet-aware formula assistant.",
      worksheet,
      snapshot,
      worksheetContext: context,
      classification,
      constructionSummary,
      assumptionRows: [],
      promptBuilder: ({ snapshot: nextSnapshot, constructionSummary, assumptionRows, formulaContextSummary, stageAssumptions, stageWarnings }) =>
        [
          `Construction intelligence summary: ${JSON.stringify(constructionSummary)}`,
          `Assumption and input row summary: ${JSON.stringify(assumptionRows)}`,
          `Relevant existing formula context: ${JSON.stringify(formulaContextSummary)}`,
          `Stage assumptions carried forward: ${JSON.stringify(stageAssumptions)}`,
          `Stage warnings carried forward: ${JSON.stringify(stageWarnings)}`,
          `Worksheet structure snapshot: ${JSON.stringify(nextSnapshot)}`,
        ].join("\n\n"),
    });

    expect(budget.compactionLevel).toBeGreaterThan(0);
    expect(budget.compactionLevel).toBeLessThan(4);
    expect(budget.tokenBreakdown.totalEstimatedTokens).toBeLessThanOrEqual(7000);
    expect(budget.constructionSummary.organizationMemorySummary.length).toBeLessThan(
      constructionSummary.organizationMemorySummary.length,
    );
    expect(budget.constructionSummary.tradeHints).toContain("ceilings");
    expect(budget.constructionSummary.systemHints).toContain("grid spacing");
    expect(budget.assumptionRows.length).toBeGreaterThan(0);
  });

  it("scopes Anthropic formula-fix budgets to formula-bearing and nearby rows", () => {
    const { worksheet, context } = buildLargeFormulaBudgetFixture();
    context.visibleSelection.activeCellKey = "J41";
    const classification = buildClassification({
      primaryIntent: "formula_fix",
      recommendedPromptPath: "edit",
      tradeHints: ["ceilings"],
      systemHints: ["module size"],
      riskLevel: "high",
    });
    const snapshot = inflateSnapshotForBudgetTest(
      buildPricingWorksheetAiStructureSnapshot({
        worksheet,
        worksheetContext: context,
        classification,
        prompt: "Fix the formulas in the selected subtotal area and the nearby total rows.",
      }),
      3,
    );

    const budget = buildFormulaStageContextBudgetForTest({
      workflow: "formula",
      prompt: "Fix the formulas in the selected subtotal area and the nearby total rows.",
      systemPrompt: "You are TradesStack's worksheet-aware formula assistant.",
      worksheet,
      snapshot,
      worksheetContext: context,
      classification,
      constructionSummary: {
        ...buildBudgetConstructionSummary(),
        organizationMemorySummary: `${buildBudgetConstructionSummary().organizationMemorySummary} `.repeat(12),
      },
      assumptionRows: [],
      promptBuilder: ({ snapshot: nextSnapshot }) => `Worksheet structure snapshot: ${JSON.stringify(nextSnapshot)}`,
    });

    expect(budget.compactionLevel).toBeLessThan(4);
    expect(budget.tokenBreakdown.totalEstimatedTokens).toBeLessThanOrEqual(7000);
    expect(
      budget.snapshot.rows.some(
        (row) => row.rowTypeHint === "subtotal" || row.formulaRefs.length > 0 || row.rowPurposeHint === "formula_target",
      ),
    ).toBe(true);
  });

  it("scopes Anthropic formatting budgets to likely input, assumption, and formula-role rows", () => {
    const { worksheet, context } = buildLargeFormulaBudgetFixture();
    const classification = buildClassification({
      primaryIntent: "worksheet_edit",
      recommendedPromptPath: "edit",
      tradeHints: ["ceilings"],
      riskLevel: "medium",
    });
    const snapshot = inflateSnapshotForBudgetTest(
      buildPricingWorksheetAiStructureSnapshot({
        worksheet,
        worksheetContext: context,
        classification,
        prompt: "Highlight the cells users need to fill in and shade formulas grey.",
      }),
      4,
    );

    const budget = buildFormulaStageContextBudgetForTest({
      workflow: "formatting",
      prompt: "Highlight the cells users need to fill in and shade formulas grey.",
      systemPrompt: "You are TradesStack's worksheet formatting assistant.",
      worksheet,
      snapshot,
      worksheetContext: context,
      classification,
      constructionSummary: {
        ...buildBudgetConstructionSummary(),
        organizationGuidanceSummary: `${buildBudgetConstructionSummary().organizationGuidanceSummary} `.repeat(12),
      },
      assumptionRows: [],
      promptBuilder: ({ snapshot: nextSnapshot, constructionSummary }) =>
        [
          `Construction intelligence summary: ${JSON.stringify(constructionSummary)}`,
          `Worksheet structure snapshot: ${JSON.stringify(nextSnapshot)}`,
        ].join("\n\n"),
    });

    expect(budget.compactionLevel).toBeGreaterThan(0);
    expect(
      budget.snapshot.rows.some((row) => row.isLikelyInputRow || row.isLikelyAssumptionRow || row.rowPurposeHint === "assumption_input"),
    ).toBe(true);
    expect(
      budget.snapshot.rows.some(
        (row) => row.rowPurposeHint === "formula_target" || row.rowTypeHint === "subtotal" || row.formulaRefs.length > 0,
      ),
    ).toBe(true);
  });

  it("targets formula-stage context to relevant material quantity regions instead of unrelated sections", () => {
    const { worksheet, context } = buildMixedFormulaScopeFixture();
    const classification = buildClassification({
      primaryIntent: "formula_generate",
      recommendedPromptPath: "edit",
      tradeHints: ["roofing"],
      systemHints: ["long-run roofing"],
      riskLevel: "high",
    });
    const snapshot = buildPricingWorksheetAiStructureSnapshot({
      worksheet,
      worksheetContext: context,
      classification,
      prompt: "The formulas for calculating material quantities are wrong.",
    });

    const budget = buildFormulaStageContextBudgetForTest({
      workflow: "formula",
      prompt: "The formulas for calculating material quantities are wrong.",
      systemPrompt: "You are TradesStack's worksheet-aware formula assistant.",
      worksheet,
      snapshot,
      worksheetContext: context,
      classification,
      constructionSummary: buildBudgetConstructionSummary(),
      assumptionRows: [],
      promptBuilder: ({ snapshot: nextSnapshot, formulaContextSummary }) =>
        [
          `Relevant existing formula context: ${JSON.stringify(formulaContextSummary)}`,
          `Worksheet structure snapshot: ${JSON.stringify(nextSnapshot)}`,
        ].join("\n\n"),
    });

    const scopedLabels = budget.snapshot.rows.map((row) => row.label ?? "");
    expect(scopedLabels).toContain("Long-run sheets");
    expect(scopedLabels).toContain("Materials subtotal");
    expect(scopedLabels).not.toContain("Crew Hours");
    expect(scopedLabels).not.toContain("Gross Margin");
    expect(
      budget.formulaContextSummary?.existingFormulaRows.some((row) => row.label === "Long-run sheets"),
    ).toBe(true);
    expect(
      budget.formulaContextSummary?.existingFormulaRows.some((row) => row.label === "Crew Hours"),
    ).toBe(false);
  });

  it("progressively narrows formula context and discloses omitted formula regions on large worksheets", () => {
    const { worksheet, context } = buildLargeFormulaBudgetFixture();
    const classification = buildClassification({
      primaryIntent: "formula_generate",
      recommendedPromptPath: "edit",
      tradeHints: ["ceilings"],
      riskLevel: "high",
    });
    const snapshot = inflateSnapshotForBudgetTest(
      buildPricingWorksheetAiStructureSnapshot({
        worksheet,
        worksheetContext: context,
        classification,
        prompt: "Check the formulas for the selected quantity rows and nearby subtotals.",
      }),
      4,
    );

    const budget = buildFormulaStageContextBudgetForTest({
      workflow: "formula",
      prompt: "Check the formulas for the selected quantity rows and nearby subtotals.",
      systemPrompt: "You are TradesStack's worksheet-aware formula assistant.",
      worksheet,
      snapshot,
      worksheetContext: context,
      classification,
      constructionSummary: {
        ...buildBudgetConstructionSummary(),
        organizationMemorySummary: `${buildBudgetConstructionSummary().organizationMemorySummary} `.repeat(10),
      },
      assumptionRows: [],
      promptBuilder: ({ snapshot: nextSnapshot, formulaContextSummary }) =>
        [
          `Relevant existing formula context: ${JSON.stringify(formulaContextSummary)}`,
          `Worksheet structure snapshot: ${JSON.stringify(nextSnapshot)}`,
        ].join("\n\n"),
    });

    expect(budget.tokenBreakdown.totalEstimatedTokens).toBeLessThanOrEqual(7000);
    expect(budget.formulaContextSummary?.omittedFormulaRowRanges.length ?? 0).toBeGreaterThan(0);
    expect(budget.formulaContextSummary?.note).toContain("Omitted formula row ranges");
    expect(budget.snapshot.rowCoverage.note).toContain("Formula context is scoped");
  });

  it("blocks genuinely oversized Anthropic formula-stage prompts locally with a clear warning and token breakdown", async () => {
    const { worksheet, context } = buildStructuredFormulaFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch should not be called for a locally oversized formula-stage prompt");
    });

    const hugePrompt = `Add formulas for this worksheet using the visible assumptions. ${"context ".repeat(6000)}`;
    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: hugePrompt,
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "formula_generate",
        recommendedPromptPath: "edit",
        tradeHints: ["ceilings"],
      }),
    });

    const oversizeLog = infoSpy.mock.calls
      .map((call) => call[1])
      .find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).action === "formula_stage_token_budget_exceeded") as
      | Record<string, unknown>
      | undefined;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(oversizeLog).toMatchObject({
      maxAllowedTokens: 7000,
      budgetTier: "small",
      formulaTargetRowCount: expect.any(Number),
      estimatedTokenSize: expect.any(Number),
      systemPromptTokenEstimate: expect.any(Number),
      userPromptTokenEstimate: expect.any(Number),
      constructionSummaryTokenEstimate: expect.any(Number),
      assumptionRowsTokenEstimate: expect.any(Number),
      worksheetSnapshotTokenEstimate: expect.any(Number),
    });
    expect(result.preview.mode).toBe("answer_only");
    expect(result.preview.warnings).toContain(
      "Formula generation was skipped because the worksheet formula context was too large. Try selecting a smaller section or asking for formulas for one section at a time.",
    );
  });

  it("routes Anthropic highlight prompts to the compact formatting stage and previews formatting changes", async () => {
    const { worksheet, context } = buildStructuredFormulaFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_formatting_existing_1",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "formatting_suggestions",
              answer: "Highlighted the editable input cells for the worksheet.",
              assumptions: [],
              warnings: [],
              operations: [
                {
                  type: "format_cells",
                  targetCells: ["E2", "E3", "E4"],
                  backgroundColor: "#DBEAFE",
                  textColor: "#1D4ED8",
                  bold: true,
                  rationale: "Highlight manual quantity inputs.",
                },
                {
                  type: "format_cells",
                  targetCells: ["F3", "H3", "F4", "H4"],
                  backgroundColor: "#DCFCE7",
                  textColor: "#15803D",
                  rationale: "Highlight rate inputs separately from formula outputs.",
                },
                {
                  type: "format_cell",
                  targetCells: ["J5"],
                  backgroundColor: "#E5E7EB",
                  textColor: "#4B5563",
                  rationale: "Identify subtotal output cell.",
                },
              ],
            }),
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Highlight the cells to fill in for the inputs.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_edit",
        requiresRetrieval: false,
        recommendedPromptPath: "edit",
        tradeHints: ["ceilings"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = readRequestBody(fetchMock, 0);
    const schemaProperties =
      (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema as Record<
        string,
        unknown
      >).properties as Record<string, unknown>;
    expect(String(requestBody.system ?? "")).toContain("worksheet formatting assistant");
    expect(schemaProperties.operations).toBeTruthy();
    expect(schemaProperties.proposalName).toBeUndefined();
    const operationItemProperties = ((schemaProperties.operations as Record<string, unknown>).items as Record<
      string,
      unknown
    >).properties as Record<string, unknown>;
    expect(operationItemProperties.targetCells).toBeTruthy();
    expect(operationItemProperties.target).toBeUndefined();
    expect(operationItemProperties.values).toBeUndefined();
    expect(result.generationMeta.provider).toBe("anthropic");
    expect(result.providerAudit.actualProvider).toBe("anthropic");
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.diffSummary.formattingCells).toEqual(
      expect.arrayContaining(["E2", "E3", "E4", "F3", "H3", "F4", "H4", "J5"]),
    );
    expect(result.preview.diffSummary.changedCells).toEqual(
      expect.arrayContaining(["E2", "E3", "E4", "F3", "H3", "F4", "H4", "J5"]),
    );
    expect(result.preview.validationIssues).toEqual([]);
  });

  it("still routes existing worksheet highlight requests to the formatting stage", async () => {
    const { worksheet, context } = buildStructuredFormulaFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_formatting_existing_2",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "formatting_suggestions",
              answer: "Highlighted the worksheet input cells.",
              assumptions: [],
              warnings: [],
              operations: [
                {
                  type: "format_cells",
                  targetCells: ["E2", "E3", "E4"],
                  backgroundColor: "#DBEAFE",
                  rationale: "Highlight editable quantity inputs.",
                },
              ],
            }),
          },
        ],
      }),
    } as Response);

    await buildPricingWorksheetEditAssistantPreview({
      prompt: "Please highlight the input cells I need to fill in.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_edit",
        requiresRetrieval: false,
        recommendedPromptPath: "edit",
        tradeHints: ["ceilings"],
      }),
    });

    const requestBody = readRequestBody(fetchMock, 0);
    expect(String(requestBody.system ?? "")).toContain("worksheet formatting assistant");
  });

  it("routes Anthropic review prompts through the compact review workflow instead of the old operation schema", async () => {
    const { worksheet, context } = buildStructuredFormulaFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_review_existing_1",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "review_summary",
              answer: "Reviewed the worksheet and found a formula gap in the subtotal flow.",
              assumptions: ["Ceiling area remains the main driver input."],
              warnings: [],
              reviewFindings: [
                {
                  title: "Subtotal formula missing",
                  finding: "The worksheet does not yet calculate the materials subtotal from the component rows.",
                  category: "formula_risk",
                  severity: "medium",
                  confidence: "medium",
                  relatedCells: ["J5"],
                  relatedRows: [5],
                },
              ],
              reviewSummary: {
                presentItems: ["Area input row", "Component quantity rows"],
                possibleMissingItems: ["Materials subtotal formula"],
                keyRisks: ["Totals may be incomplete without a subtotal formula."],
                assumptions: ["Manual rates are already entered."],
                confirmationsNeeded: ["Confirm whether labour totals should also feed the subtotal."],
              },
            }),
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Review this worksheet for formula errors.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "review_estimate",
        recommendedPromptPath: "review",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = readRequestBody(fetchMock, 0);
    const schemaProperties =
      (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema as Record<
        string,
        unknown
      >).properties as Record<string, unknown>;
    expect(schemaProperties.reviewFindings).toBeTruthy();
    expect(schemaProperties.operations).toBeUndefined();
    expect(result.preview.reviewFindings.length).toBe(1);
    expect(result.preview.operations).toEqual([]);
  });

  it("uses the Anthropic safe unknown fallback instead of the old operation schema", async () => {
    const { worksheet, context } = buildStructuredFormulaFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_unknown_existing_1",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "answer_only",
              proposalName: "Worksheet assistant response",
              answer: "I can review, format, add formulas, or suggest worksheet edits if you describe the change you want.",
              summary: "A safer clarification is needed before making worksheet changes.",
              confidence: "low",
              assumptions: [],
              warnings: ["anthropic_safe_unknown_fallback"],
            }),
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Can you sort this out for me?",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "unknown",
        recommendedPromptPath: "unknown",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = readRequestBody(fetchMock, 0);
    const schemaProperties =
      (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema as Record<
        string,
        unknown
      >).properties as Record<string, unknown>;
    expect(schemaProperties.operations).toBeUndefined();
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.preview.mode).toBe("answer_only");
  });

  it("routes Anthropic bounded edit prompts through the compact edit-intent workflow", async () => {
    const { worksheet, context } = buildStructuredFormulaFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_edit_existing_1",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "edit_intent",
              answer: "Added a subtotal row after the current component rows.",
              assumptions: [],
              warnings: [],
              editIntents: [
                {
                  action: "insert_row_after",
                  afterRowNumber: 5,
                  values: [
                    { column: "B", value: "Component notes" },
                    { column: "C", value: "Add estimator notes here" },
                  ],
                  rationale: "Insert a bounded helper row below the subtotal.",
                },
              ],
            }),
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Insert a notes row below the subtotal.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_edit",
        recommendedPromptPath: "edit",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = readRequestBody(fetchMock, 0);
    const schemaProperties =
      (((requestBody.output_config as Record<string, unknown>).format as Record<string, unknown>).schema as Record<
        string,
        unknown
      >).properties as Record<string, unknown>;
    expect(schemaProperties.editIntents).toBeTruthy();
    expect(schemaProperties.operations).toBeUndefined();
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.operations.length).toBeGreaterThan(0);
  });

  it("skips invalid Anthropic formula suggestions on structured worksheets and warns safely", async () => {
    const { worksheet, context } = buildStructuredFormulaFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_formula_existing_2",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "formula_suggestions",
              answer: "Tried to add formulas.",
              assumptions: [],
              warnings: [],
              suggestions: [
                {
                  targetRowNumber: 3,
                  targetColumn: "J",
                  expression: "{CostSubtotal}+8_Qty",
                  rationale: "Bad symbolic formula.",
                },
              ],
            }),
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Add the missing formulas to this worksheet.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "formula_generate",
        requiresRetrieval: false,
        recommendedPromptPath: "edit",
        tradeHints: ["ceilings"],
      }),
    });

    expect(result.preview.diffSummary.formulaCells).toEqual([]);
    expect(result.preview.warnings).toContain(
      "Skipped formula for J3 because it referenced worksheet items that could not be resolved safely.",
    );
  });

  it("blocks Anthropic worksheet creation responses that explain changes without returning operations", async () => {
    const { worksheet, context } = buildFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "msg_empty_ops",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "answer_only",
                proposalName: "Suspended ceilings worksheet",
                answer: "I created the suspended ceilings pricing worksheet for you.",
                summary: "Worksheet created.",
                confidence: "medium",
                operations: [],
                assumptions: [],
                warnings: [],
              }),
            },
          ],
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt:
        "Create a suspended ceilings pricing worksheet with materials, labour, wastage, margins, formulas and totals.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: true,
        recommendedPromptPath: "generation",
        tradeHints: ["ceilings"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.operations).toEqual([]);
    expect(result.preview.answer).toBe(
      "The AI returned an explanation but no worksheet changes. Please retry or adjust the prompt.",
    );
    expect(result.preview.answer.toLowerCase()).not.toContain("created");
    expect(result.preview.summary.toLowerCase()).not.toContain("created");
    expect(result.preview.validationIssues).toContainEqual({
      code: "mutation_intent_missing_operations",
      message: "The AI returned an explanation but no worksheet changes. Please retry or adjust the prompt.",
      severity: "error",
    });
  });

  it("does not use the legacy Anthropic operation-normalization path for compact edit intents", async () => {
    const { worksheet, context } = buildFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_bad_ops",
        type: "message",
        model: "claude-sonnet-4-6",
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "edit_intent",
              answer: "Tried to prepare worksheet edits.",
              assumptions: [],
              warnings: [],
              editIntents: [
                { action: "unsupported_op", rationale: "Nope." },
              ],
            }),
          },
        ],
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Insert missing material rows into this worksheet.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_edit",
        requiresRetrieval: false,
        recommendedPromptPath: "edit",
        tradeHints: ["partitions"],
      }),
    });

    const diagnosticLog = infoSpy.mock.calls
      .map((call) => call[1])
      .find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).action === "parsed_response_mode") as
      | Record<string, unknown>
      | undefined;
    expect(diagnosticLog).toBeUndefined();
    expect(result.preview.mode).toBe("answer_only");
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

  it("surfaces timeout fallback reasons clearly for timeout-heavy worksheet generation", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Upstream request timed out."))
      .mockRejectedValueOnce(new Error("Upstream request timed out."));

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt:
        "I need you to build me a spreadsheet that will provide me with all the components for a 24mm Rondo Donn exposed ceiling grid. I want to put in m2 and LM and it will calculate all the components. Material and labour.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: true,
        recommendedPromptPath: "generation",
        tradeHints: ["ceilings"],
        systemHints: ["rondo"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.generationMeta.fallbackReason).toContain("Upstream request timed out.");
    expect(result.preview.answer).toContain("timed out");
    expect(result.preview.warnings[0]).toContain("timed out");
  });

  it("retries Rondo worksheet generation with a compact prompt after an initial timeout and still reaches preview", async () => {
    const { worksheet, context } = buildFixture();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Upstream request timed out."))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            mode: "propose_edit",
            proposalName: "Rondo ceiling starter",
            answer: "Built a compact Rondo ceiling starter worksheet.",
            summary: "Starter worksheet created after retry.",
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
                rationale: "Seed a compact starter worksheet.",
              },
            ],
            assumptions: ["Starter worksheet only."],
            warnings: [],
          }),
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt:
        "I need you to build me a spreadsheet that will provide me with all the components for a 24mm Rondo Donn exposed ceiling grid. I want to put in m2 and LM and it will calculate all the components. Material and labour.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: true,
        recommendedPromptPath: "generation",
        tradeHints: ["ceilings"],
        systemHints: ["rondo"],
      }),
    });

    const secondRequestBody = readRequestBody(fetchMock, 1);
    const secondUserPrompt = ((secondRequestBody.input as Array<{ content?: Array<{ text?: string }> }> | undefined)?.[1]?.content?.[0]
      ?.text ?? "") as string;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.mode).toBe("propose_edit");
    expect(secondUserPrompt).toContain("Retry instruction: return only the smallest useful estimator-style starter worksheet");
  });

  it("keeps normal blank worksheet generation on the staged generation path", async () => {
    const { worksheet, context } = buildGenerationFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_draft_normal_generation_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "worksheet_draft",
                proposalName: "Starter worksheet",
                answer: "Built a compact starter worksheet draft.",
                sections: [
                  {
                    title: "Inputs",
                    rows: [
                      {
                        label: "Measured quantity",
                        description: "Editable input",
                        unit: "m2",
                        rowPurpose: "input",
                        quantityValue: null,
                        materialRate: null,
                        labourRate: null,
                        formulaIntent: "editable input row",
                      },
                    ],
                  },
                ],
                assumptions: [],
                warnings: [],
              }),
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_formula_normal_generation_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "answer_only",
                answer: "No additional formulas were required.",
                assumptions: [],
                warnings: [],
                suggestions: [],
              }),
            },
          ],
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create a compact starter pricing worksheet.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: false,
        recommendedPromptPath: "generation",
      }),
    });

    const firstRequestBody = readRequestBody(fetchMock, 0);
    expect(String(firstRequestBody.system ?? "")).not.toContain("worksheet formatting assistant");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.operations.length).toBeGreaterThan(0);
  });

  it("reroutes formatting-stage answer_only responses back to generation once for blank worksheet generation prompts", async () => {
    const { worksheet, context } = buildGenerationFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_formatting_blank_fallback_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "answer_only",
                answer: "There are no worksheet cells to highlight yet.",
                assumptions: [],
                warnings: ["No formatting targets exist yet."],
                operations: [],
              }),
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_draft_blank_fallback_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "worksheet_draft",
                proposalName: "Fallback starter worksheet",
                answer: "Built a compact starter worksheet draft.",
                sections: [
                  {
                    title: "Inputs",
                    rows: [
                      {
                        label: "Area",
                        description: "Editable input",
                        unit: "m2",
                        rowPurpose: "input",
                        quantityValue: null,
                        materialRate: null,
                        labourRate: null,
                        formulaIntent: "editable input row",
                      },
                    ],
                  },
                ],
                assumptions: [],
                warnings: [],
              }),
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_formula_blank_fallback_1",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "answer_only",
                answer: "No additional formulas were required.",
                assumptions: [],
                warnings: [],
                suggestions: [],
              }),
            },
          ],
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt:
        "Create me a spreadsheet that calculates the components from sqm. Please highlight the cells I need to fill in.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
      classification: buildClassification({
        primaryIntent: "worksheet_generation",
        requiresRetrieval: false,
        recommendedPromptPath: "generation",
      }),
      internalFlags: {
        anthropicWorkflowOverride: "formatting",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.operations.length).toBeGreaterThan(0);
    expect(result.preview.answer).not.toContain("The AI returned an explanation but no worksheet changes");
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

  it("returns format_cells operations for highlight-input-cells prompts and shows formatting preview", async () => {
    const { worksheet, context } = buildFixture();
    setCellValue(worksheet, "C2", 12);
    setCellValue(worksheet, "D2", 2.5);
    worksheet.cells[buildWorksheetCellKey("E", "2")] = {
      value: "=C2*D2",
      type: "text",
      formula: "=C2*D2",
      computedValue: "=C2*D2",
      displayValue: "=C2*D2",
      metadata: {},
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "propose_edit",
          proposalName: "Highlight input cells",
          answer: "Highlighted the editable worksheet inputs.",
          summary: "Manual inputs are highlighted without changing worksheet values.",
          confidence: "high",
          assumptions: [],
          warnings: [],
          reviewFindings: [],
          reviewSummary: null,
          suggestedEditGroups: [],
          evidenceSources: [],
          operations: [
            {
              type: "format_cells",
              target: {
                cells: ["C2", "D2", "E2"],
              },
              values: {
                cells: [],
              },
              formulas: {
                cells: [],
              },
              format: {
                backgroundColor: "blue",
                bold: true,
              },
              rationale: "Highlight the manual input cells.",
            },
          ],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Can you highlight the cells I need to input into different colours please?",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.mode).toBe("propose_edit");
    expect(result.preview.operations[0]?.type).toBe("format_cells");
    expect(result.preview.diffSummary.formattingCells).toEqual(["C2", "D2", "E2"]);
    expect(result.preview.diffPreview.formattingChanges).toHaveLength(3);
    expect(result.preview.diffPreview.formattingChanges.find((change) => change.ref === "E2")?.afterFormattingSummary).toContain("#F3F4F6");
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
    expect(systemPromptText).toContain("Generate compact estimator-style pricing workbook scaffolds, not generic spreadsheets or tiny standalone calculators");
    expect(systemPromptText).toContain("clear grouped sections for inputs, calculations, subtotals, and outputs");
    expect(systemPromptText).toContain("visible quantity transformations, editable assumptions, auditable formulas, structured subtotals, and final pricing outputs where relevant");
    expect(systemPromptText).toContain("Prefer dense commercial workbook layouts with compact grouped pricing blocks rather than long linear walkthroughs");
    expect(systemPromptText).toContain("Keep related inputs, quantity calculations, pricing rows, and subtotals close together");
    expect(systemPromptText).toContain("Use concise estimator-style row naming and avoid repeated descriptions, unnecessary note rows, and row-by-row explanation behaviour");
    expect(systemPromptText).toContain("Prefer editable input or assumption rows when information is missing instead of blocking generation");
    expect(systemPromptText).toContain("Explain assumptions and do not pretend construction requirements are verified");
    expect(systemPromptText).toContain("If trade, system, scope, or required inputs are unclear, ask follow-up questions");
    expect(systemPromptText).toContain("Do not create database sheets, hidden pricing libraries, lookup-driven assemblies, autonomous estimating engines, or opaque formula chains");
    expect(systemPromptText).toContain("Do not invent compliance-driven, specification-driven, fire-rated, acoustic-rated, seismic, or manufacturer-specific requirements unless they were explicitly provided");
    expect(systemPromptText).toContain("Do not hardcode trade-specific workflows, systems, assemblies, or estimating patterns into the generated structure");
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

  it("batches a large NZ roofing calculator into safe staged-generation previews", async () => {
    const { worksheet, context } = buildGenerationFixture();
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    delete process.env.OPENAI_API_KEY;

    const largeSections = new Array(6).fill(null).map((_, sectionIndex) => ({
      title: sectionIndex === 0 ? "Inputs" : sectionIndex === 5 ? "Summary Dashboard" : `Section ${sectionIndex + 1}`,
      rows: new Array(5).fill(null).map((__, rowIndex) => ({
        label: `Roofing row ${sectionIndex + 1}-${rowIndex + 1}`,
        description: "NZ roofing calculator row",
        unit: sectionIndex === 0 ? "m2" : rowIndex % 2 === 0 ? "lm" : "ea",
        rowPurpose: sectionIndex === 0 ? "input" : rowIndex === 4 ? "subtotal" : "line_item",
        quantityValue: null,
        materialRate: rowIndex % 2 === 0 ? 18.5 : null,
        labourRate: rowIndex % 2 === 1 ? 72 : null,
        formulaIntent: rowIndex === 4 ? "section subtotal" : "quantity times material rate plus labour and margin",
      })),
    }));

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_roofing_large_draft",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "worksheet_draft",
                proposalName: "NZ roofing calculator",
                answer: "Built a large NZ roofing calculator.",
                sections: largeSections,
                assumptions: ["NZD pricing inputs will be provided by the estimator."],
                warnings: [],
              }),
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_roofing_large_formula",
          type: "message",
          model: "claude-sonnet-4-6",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "formula_suggestions",
                answer: "Added worksheet-aware formulas for the first safe batch.",
                suggestions: [
                  {
                    targetRowNumber: 4,
                    targetColumn: "J",
                    expression: "quantity times material rate",
                    rationale: "Calculate the material total for the current row.",
                  },
                ],
                assumptions: [],
                warnings: [],
              }),
            },
          ],
        }),
      } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt:
        "Create a large multi-tab NZ QS-style corrugated long-run roofing calculator with Inputs, Material Takeoff, Material Rates, Labour Calculator, Summary Dashboard, Benchmarks, formulas, dropdowns, formatting, and NZD styling.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.validationIssues).toEqual([]);
    expect(result.preview.continuation).not.toBeNull();
    expect(result.preview.continuation?.totalBatchCount).toBeGreaterThan(1);
    expect(result.preview.answer).toContain("building it safely in stages");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.preview.operations.length).toBeLessThan(37);
  });

  it("batches a large suspended ceiling calculator even on the direct provider path", async () => {
    const { worksheet, context } = buildGenerationFixture();
    delete process.env.PRICING_WORKSHEET_AI_PROVIDER;

    const operations = new Array(37).fill(null).map((_, index) => {
      const rowNumber = index + 1;
      return {
        type: "insert_row",
        target: { insertBeforeRow: rowNumber },
        values: {
          cells: [
            { column: "A", value: rowNumber === 1 ? "Inputs" : rowNumber <= 8 ? "Ceiling inputs" : "Ceiling pricing" },
            { column: "B", value: `Ceiling row ${rowNumber}` },
            { column: "D", value: rowNumber <= 8 ? "m2" : rowNumber % 2 === 0 ? "lm" : "ea" },
            { column: "F", value: rowNumber <= 8 ? null : 14.25 },
            { column: "K", value: rowNumber <= 8 ? "editable input row" : "quantity times rate" },
          ],
        },
        formulas: { cells: [] },
        rationale: "Large ceiling worksheet row.",
      };
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "propose_edit",
          proposalName: "Suspended ceiling calculator",
          answer: "Created a suspended ceiling calculator.",
          summary: "Adds a large ceiling estimator worksheet.",
          confidence: "medium",
          operations,
          assumptions: [],
          warnings: [],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create a large suspended ceiling calculator with inputs, rates, labour, summaries, formulas, and styling.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.validationIssues).toEqual([]);
    expect(result.preview.continuation).not.toBeNull();
    expect(result.preview.continuation?.remainingBatchCount).toBeGreaterThan(0);
    expect(result.preview.operations.length).toBeLessThan(37);
  });

  it("keeps small worksheet generation in a single preview batch", async () => {
    const { worksheet, context } = buildFixture();
    const operations = new Array(6).fill(null).map((_, index) => ({
      type: "insert_row",
      target: { insertBeforeRow: index + 1 },
      values: {
        cells: [
          { column: "A", value: index === 0 ? "Inputs" : "Pricing" },
          { column: "B", value: `Simple row ${index + 1}` },
          { column: "D", value: index <= 1 ? "m2" : "ea" },
        ],
      },
      formulas: { cells: [] },
      rationale: "Simple calculator row.",
    }));

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          mode: "propose_edit",
          proposalName: "Simple calculator",
          answer: "Created a simple calculator.",
          summary: "Adds a small estimator worksheet.",
          confidence: "medium",
          operations,
          assumptions: [],
          warnings: [],
        }),
      }),
    } as Response);

    const result = await buildPricingWorksheetEditAssistantPreview({
      prompt: "Create a simple labour calculator.",
      worksheet,
      worksheetContext: context,
      memoryItems: [],
    });

    expect(result.preview.validationIssues).toEqual([]);
    expect(result.preview.continuation).toBeNull();
    expect(result.preview.operations).toHaveLength(6);
  });

  it("advances continuation from batch 1 to batch 2 and mutates the worksheet snapshot", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Continuation worksheet",
      rowCount: 20,
      columnCount: 12,
    });
    const batch1Operations: PricingWorksheetAiOperation[] = [
      {
        type: "insert_row",
        target: { insertBeforeRow: 1 },
        values: { cells: [{ column: "A", value: "Batch 1 row" }] },
        formulas: { cells: [] },
        rationale: "Batch 1",
      },
    ];
    const batch2Operations: PricingWorksheetAiOperation[] = [
      {
        type: "insert_row",
        target: { insertBeforeRow: 2 },
        values: { cells: [{ column: "A", value: "Batch 2 row" }] },
        formulas: { cells: [] },
        rationale: "Batch 2",
      },
    ];
    const batch3Operations: PricingWorksheetAiOperation[] = [
      {
        type: "insert_row",
        target: { insertBeforeRow: 3 },
        values: { cells: [{ column: "A", value: "Batch 3 row" }] },
        formulas: { cells: [] },
        rationale: "Batch 3",
      },
    ];

    const batch1Worksheet = simulatePricingWorksheetAiEditPlan(worksheet, {
      mode: "propose_edit",
      proposalName: "Batch 1 preview",
      answer: "Batch 1 ready.",
      summary: "Batch 1 ready.",
      confidence: "medium",
      operations: batch1Operations,
      assumptions: [],
      warnings: [],
      suggestedEditGroups: [],
    }).worksheet;
    const batch1Preview = buildContinuationPreviewFixture({
      worksheet: batch1Worksheet,
      operations: batch1Operations,
      continuation: {
        strategy: "safe_generation_batches",
        currentBatchIndex: 1,
        totalBatchCount: 3,
        remainingBatchCount: 2,
        remainingOperationCount: 2,
        message: "Review and apply batch 1 of 3 to continue.",
        remainingBatches: [
          {
            id: "batch-2",
            title: "Safe worksheet build batch 2 of 3",
            purpose: "Continue building the generated worksheet with the next validator-safe batch.",
            operations: batch2Operations,
            changedCellCount: 1,
          },
          {
            id: "batch-3",
            title: "Safe worksheet build batch 3 of 3",
            purpose: "Continue building the generated worksheet with the next validator-safe batch.",
            operations: batch3Operations,
            changedCellCount: 1,
          },
        ],
      },
    });

    const batch2Preview = buildPricingWorksheetContinuationPreview({
      preview: batch1Preview,
      worksheet: batch1Preview.worksheet,
    });

    expect(batch2Preview).not.toBeNull();
    expect(batch2Preview?.continuation?.currentBatchIndex).toBe(2);
    expect(batch2Preview?.continuation?.remainingBatchCount).toBe(1);
    expect(batch2Preview?.operations[0]?.rationale).toBe("Batch 2");
    expect(Object.values(batch2Preview?.worksheet.cells ?? {}).some((cell) => cell?.value === "Batch 2 row")).toBe(true);

    const batch3Preview = buildPricingWorksheetContinuationPreview({
      preview: batch2Preview!,
      worksheet: batch2Preview!.worksheet,
    });

    expect(batch3Preview).not.toBeNull();
    expect(batch3Preview?.continuation?.currentBatchIndex).toBe(3);
    expect(batch3Preview?.continuation?.remainingBatchCount).toBe(0);
    expect(Object.values(batch3Preview?.worksheet.cells ?? {}).some((cell) => cell?.value === "Batch 3 row")).toBe(true);

    const completionPreview = buildPricingWorksheetContinuationPreview({
      preview: batch3Preview!,
      worksheet: batch3Preview!.worksheet,
    });
    expect(completionPreview).toBeNull();
  });

  it("includes continuation-generated rows in later worksheet snapshots after staged apply", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Continuation snapshot worksheet",
      rowCount: 60,
      columnCount: 12,
    });
    setCellValue(worksheet, "A1", "Inputs");
    setCellValue(worksheet, "B24", "Original row 24");

    const batch1Operations: PricingWorksheetAiOperation[] = [
      {
        type: "insert_row",
        target: { insertBeforeRow: 25 },
        values: { cells: [{ column: "B", value: "Batch 1 generated row" }] },
        formulas: { cells: [] },
        rationale: "Batch 1",
      },
    ];
    const batch2Operations: PricingWorksheetAiOperation[] = [
      {
        type: "insert_row",
        target: { insertBeforeRow: 31 },
        values: { cells: [{ column: "B", value: "Batch 2 generated row" }] },
        formulas: { cells: [{ ref: "J31", formula: "=E31*F31" }] },
        rationale: "Batch 2",
      },
    ];

    const batch1Worksheet = simulatePricingWorksheetAiEditPlan(worksheet, {
      mode: "propose_edit",
      proposalName: "Batch 1 preview",
      answer: "Batch 1 ready.",
      summary: "Batch 1 ready.",
      confidence: "medium",
      operations: batch1Operations,
      assumptions: [],
      warnings: [],
      suggestedEditGroups: [],
    }).worksheet;
    const batch1Preview = buildContinuationPreviewFixture({
      worksheet: batch1Worksheet,
      operations: batch1Operations,
      continuation: {
        strategy: "safe_generation_batches",
        currentBatchIndex: 1,
        totalBatchCount: 2,
        remainingBatchCount: 1,
        remainingOperationCount: 1,
        message: "Review and apply batch 1 of 2 to continue.",
        remainingBatches: [
          {
            id: "batch-2",
            title: "Safe worksheet build batch 2 of 2",
            purpose: "Continue building the generated worksheet with the next validator-safe batch.",
            operations: batch2Operations,
            changedCellCount: 2,
          },
        ],
      },
    });

    const batch2Preview = buildPricingWorksheetContinuationPreview({
      preview: batch1Preview,
      worksheet: batch1Preview.worksheet,
    });

    expect(batch2Preview).not.toBeNull();

    const context = buildPricingWorksheetAiContext(batch2Preview!.worksheet, {
      worksheetId: "continuation-snapshot-worksheet",
      worksheetName: batch2Preview!.worksheet.sheetName,
      tradePackage: "Roofing",
      prompt: "The formulas from row 24 are not there. Check rows from row 24 onward.",
    });
    const snapshot = buildPricingWorksheetAiStructureSnapshot({
      worksheet: batch2Preview!.worksheet,
      worksheetContext: context,
      classification: {
        primaryIntent: "formula_fix",
        defaultJurisdiction: "AUS_NZ",
        requiresConstructionReasoning: true,
        requiresRetrieval: false,
        tradeHints: ["roofing"],
        systemHints: [],
        confidence: "high",
        riskLevel: "high",
        shouldAskFollowUp: false,
        reason: "Continuation snapshot test",
        matchedIntentSignals: [],
        matchedTradeSignals: [],
        matchedSystemSignals: [],
        matchedRiskSignals: [],
        retrievalReasons: [],
        recommendedPromptPath: "edit",
      },
      prompt: "The formulas from row 24 are not there. Check rows from row 24 onward.",
    });

    expect(snapshot.rows.map((row) => row.rowNumber)).toEqual(expect.arrayContaining([24, 25, 31]));
    expect(snapshot.formulaTargets.rows.some((row) => row.rowNumber === 31)).toBe(true);
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
    expect(secondRequestBody.input?.[1]?.content?.[0]?.text ?? "").toContain(
      "Retry instruction: return only the smallest useful estimator-style starter worksheet",
    );
    expect(result.generationMeta.fallbackUsed).toBe(false);
    expect(result.preview.mode).toBe("propose_edit");
  });
});
