import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
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

function setLiteralCell(
  worksheet: ReturnType<typeof createDefaultWorksheetData>,
  ref: string,
  value: string | number,
) {
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

function setFormattingOnlyCell(
  worksheet: ReturnType<typeof createDefaultWorksheetData>,
  ref: string,
) {
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
    type: "empty",
    formula: null,
    computedValue: null,
    displayValue: "",
    metadata: {
      format: {
        fill: {
          color: "#DBEAFE",
        },
      },
    },
  };
}

function buildDraft() {
  return {
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
  } satisfies AnthropicWorksheetDraft;
}

function getFirstInsertBeforeRow(converted: ReturnType<typeof convertAnthropicWorksheetDraftToOperations>) {
  const firstInsertRow = converted.operations.find((operation) => operation.type === "insert_row");
  return firstInsertRow?.target?.insertBeforeRow ?? null;
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
      draft: buildDraft(),
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

  it("starts at row 1 when the worksheet is visually empty but contains stale orphaned cell keys", () => {
    const { worksheet } = buildFixture();
    worksheet.cells.A28 = {
      value: "Old deleted row",
      type: "text",
      formula: null,
      computedValue: "Old deleted row",
      displayValue: "Old deleted row",
      metadata: {},
    };
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetName: worksheet.sheetName,
      worksheetId: "worksheet-stale-orphan",
      tradePackage: "Interiors",
    });

    const converted = convertAnthropicWorksheetDraftToOperations({
      draft: buildDraft(),
      worksheet,
      worksheetContext,
      classification: buildClassification(),
    });

    expect(getFirstInsertBeforeRow(converted)).toBe(1);
  });

  it("starts at row 1 when the worksheet only contains formatting-only rows", () => {
    const { worksheet } = buildFixture();
    setFormattingOnlyCell(worksheet, "B12");
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetName: worksheet.sheetName,
      worksheetId: "worksheet-formatting-only",
      tradePackage: "Interiors",
    });

    const converted = convertAnthropicWorksheetDraftToOperations({
      draft: buildDraft(),
      worksheet,
      worksheetContext,
      classification: buildClassification(),
    });

    expect(getFirstInsertBeforeRow(converted)).toBe(1);
  });

  it("restarts starter-generated worksheet rebuilds at row 1", () => {
    const { worksheet } = buildFixture();
    setLiteralCell(worksheet, "A1", "Inputs");
    setLiteralCell(worksheet, "B2", "Area");
    setLiteralCell(worksheet, "E2", 120);
    setLiteralCell(worksheet, "B3", "Material rate");
    setLiteralCell(worksheet, "F3", 8.75);
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetName: worksheet.sheetName,
      worksheetId: "worksheet-starter-rebuild",
      tradePackage: "Interiors",
    });

    const converted = convertAnthropicWorksheetDraftToOperations({
      draft: buildDraft(),
      worksheet,
      worksheetContext,
      classification: buildClassification(),
    });

    expect(getFirstInsertBeforeRow(converted)).toBe(1);
  });

  it("appends safely after meaningful existing worksheet rows for generation prompts", () => {
    const { worksheet } = buildFixture();
    setLiteralCell(worksheet, "A1", "Inputs");
    setLiteralCell(worksheet, "B2", "Area");
    setLiteralCell(worksheet, "C2", "Measured area");
    setLiteralCell(worksheet, "D2", "m2");
    setLiteralCell(worksheet, "E2", 120);
    setLiteralCell(worksheet, "F2", 1);
    setLiteralCell(worksheet, "G2", 0.2);
    setLiteralCell(worksheet, "H2", 68);
    setLiteralCell(worksheet, "I2", 0.15);
    setLiteralCell(worksheet, "J2", 0);
    setLiteralCell(worksheet, "K2", "Editable input");
    setLiteralCell(worksheet, "A4", "Materials");
    setLiteralCell(worksheet, "B5", "Plasterboard");
    setLiteralCell(worksheet, "C5", "Ceiling lining supply");
    setLiteralCell(worksheet, "D5", "m2");
    setLiteralCell(worksheet, "E5", 120);
    setLiteralCell(worksheet, "F5", 14.5);
    setLiteralCell(worksheet, "G5", 0.1);
    setLiteralCell(worksheet, "H5", 68);
    setLiteralCell(worksheet, "I5", 0.15);
    setLiteralCell(worksheet, "J5", 0);
    setLiteralCell(worksheet, "K5", "Starter material row");
    setLiteralCell(worksheet, "A7", "Labour");
    setLiteralCell(worksheet, "B8", "Fixing labour");
    setLiteralCell(worksheet, "C8", "Install ceiling linings");
    setLiteralCell(worksheet, "D8", "hrs");
    setLiteralCell(worksheet, "E8", 24);
    setLiteralCell(worksheet, "F8", 0);
    setLiteralCell(worksheet, "G8", 24);
    setLiteralCell(worksheet, "H8", 68);
    setLiteralCell(worksheet, "I8", 0.15);
    setLiteralCell(worksheet, "J8", 0);
    setLiteralCell(worksheet, "K8", "Starter labour row");
    setLiteralCell(worksheet, "B9", "Margin note");
    setLiteralCell(worksheet, "C9", "Existing estimator assumption");
    setLiteralCell(worksheet, "D9", "text");
    setLiteralCell(worksheet, "E9", 0.15);
    setLiteralCell(worksheet, "F9", 1);
    setLiteralCell(worksheet, "G9", 2);
    setLiteralCell(worksheet, "H9", 3);
    const worksheetContext = buildPricingWorksheetAiContext(worksheet, {
      worksheetName: worksheet.sheetName,
      worksheetId: "worksheet-meaningful-existing",
      tradePackage: "Interiors",
    });

    const converted = convertAnthropicWorksheetDraftToOperations({
      draft: buildDraft(),
      worksheet,
      worksheetContext,
      classification: buildClassification(),
    });

    expect(getFirstInsertBeforeRow(converted)).toBe(10);
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
