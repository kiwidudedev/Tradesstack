import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildPricingWorksheetAiContext } from "@/lib/pricing-worksheet-ai-context";
import {
  convertAnthropicWorksheetDraftToOperations,
  normalizeAnthropicWorksheetDraft,
  type AnthropicWorksheetDraft,
} from "@/lib/ai/providers/pricing-worksheet/anthropic-draft-to-operations";
import {
  normalizePricingWorksheetAiAssistantResponse,
  simulatePricingWorksheetAiEditPlan,
} from "@/lib/pricing-worksheet-edit-plan";

function buildClassification() {
  return {
    primaryIntent: "worksheet_generation",
    defaultJurisdiction: "AUS_NZ",
    requiresConstructionReasoning: true,
    requiresRetrieval: false,
    tradeHints: [],
    systemHints: [],
    confidence: "high" as const,
    riskLevel: "medium" as const,
    shouldAskFollowUp: false,
    reason: "Test generation classification",
    matchedIntentSignals: [],
    matchedTradeSignals: [],
    matchedSystemSignals: [],
    matchedRiskSignals: [],
    retrievalReasons: [],
    recommendedPromptPath: "generation" as const,
  };
}

function buildFixture() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Pricing Worksheet",
    rowCount: 20,
    columnCount: 12,
  });
  const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
    worksheetName: worksheet.sheetName,
    worksheetId: "worksheet-1",
    tradePackage: "Interiors",
  });

  return {
    worksheet,
    worksheetContext,
  };
}

describe("anthropic draft to operations", () => {
  it("normalizes a worksheet draft response", () => {
    const draft = normalizeAnthropicWorksheetDraft({
      mode: "worksheet_draft",
      proposalName: "Starter worksheet",
      answer: "Generated a pricing draft.",
      sections: [
        {
          title: "Inputs",
          rows: [
              {
                label: "Area",
                description: "Measured area",
                unit: "m2",
                rowPurpose: "input",
                quantityValue: 120,
                materialRate: null,
                labourRate: null,
                formulaIntent: null,
              },
            ],
          },
      ],
      assumptions: ["Measured quantity is available."],
      warnings: [],
    } satisfies AnthropicWorksheetDraft);

    expect(draft.mode).toBe("worksheet_draft");
    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]?.rows).toHaveLength(1);
  });

  it("converts worksheet draft sections and rows into supported insert_row operations", () => {
    const { worksheet, worksheetContext } = buildFixture();
    const converted = convertAnthropicWorksheetDraftToOperations({
      draft: {
        mode: "worksheet_draft",
        proposalName: "Partitions worksheet",
        answer: "Built a starter pricing worksheet.",
        sections: [
          {
            title: "Materials",
            rows: [
              {
                label: "Track and stud",
                description: "Main framing line",
                unit: "lm",
                rowPurpose: "material",
                quantityValue: null,
                materialRate: 8.75,
                labourRate: 72,
                formulaIntent: "quantity times material rate plus labour and margin",
              },
            ],
          },
        ],
        assumptions: ["Draft starter structure only."],
        warnings: [],
      },
      worksheet,
      worksheetContext,
      classification: buildClassification(),
    });

    expect(converted.mode).toBe("propose_edit");
    expect(converted.operations.length).toBeGreaterThan(0);
    expect(converted.operations.every((operation) => operation.type === "insert_row")).toBe(true);

    const normalized = normalizePricingWorksheetAiAssistantResponse(converted);
    const simulation = simulatePricingWorksheetAiEditPlan(worksheet, normalized);

    expect(simulation.validationIssues).toEqual([]);
    expect(simulation.diffSummary.insertedRows.length).toBeGreaterThan(0);
    expect(simulation.diffSummary.formulaCells.length).toBe(0);
  });

  it("keeps Stage A draft conversion structure-only and carries lightweight formula intent as notes", () => {
    const { worksheet, worksheetContext } = buildFixture();
    const converted = convertAnthropicWorksheetDraftToOperations({
      draft: {
        mode: "worksheet_draft",
        proposalName: "Flooring worksheet",
        answer: "Generated worksheet.",
        sections: [
          {
            title: "Labour",
            rows: [
              {
                label: "Install hours",
                description: null,
                unit: "hrs",
                rowPurpose: "labour",
                quantityValue: 20,
                materialRate: null,
                labourRate: 68,
                formulaIntent: "labour hours times labour rate",
              },
            ],
          },
        ],
        assumptions: [],
        warnings: [],
      },
      worksheet,
      worksheetContext,
      classification: buildClassification(),
    });

    const formulaEntries = converted.operations.flatMap((operation) => operation.formulas?.cells ?? []);
    expect(formulaEntries).toEqual([]);
    const noteCells = converted.operations.flatMap((operation) => operation.values?.cells ?? []);
    expect(noteCells.some((entry) => entry.value === "labour hours times labour rate")).toBe(true);
  });

  it("returns answer_only with no operations when the draft is not safely convertible", () => {
    const { worksheet, worksheetContext } = buildFixture();
    const converted = convertAnthropicWorksheetDraftToOperations({
      draft: {
        mode: "worksheet_draft",
        proposalName: "Empty draft",
        answer: "I created the worksheet.",
        sections: [],
        assumptions: [],
        warnings: [],
      },
      worksheet,
      worksheetContext,
      classification: buildClassification(),
    });

    expect(converted.mode).toBe("answer_only");
    expect(converted.operations).toEqual([]);
    expect(converted.warnings).toContain("anthropic_draft_conversion_failed");
  });
});
