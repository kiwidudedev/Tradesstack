import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import { buildPricingWorksheetAiContext } from "@/lib/pricing-worksheet-ai-context";
import { classifyPricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";

function buildContext(params?: {
  worksheetName?: string;
  tradePackage?: string | null;
  rows?: Array<[string, string]>;
}) {
  const worksheet = createDefaultWorksheetData({
    sheetName: params?.worksheetName ?? "Pricing Worksheet",
    rowCount: 10,
    columnCount: 6,
  });

  for (const [index, [label, value]] of (params?.rows ?? []).entries()) {
    const row = worksheet.rows[index];
    const colA = worksheet.columns[0];
    const colB = worksheet.columns[1];
    worksheet.cells[buildWorksheetCellKey(colA.id, row.id)] = {
      value: label,
      type: "text",
      formula: null,
      computedValue: label,
      displayValue: label,
      metadata: {},
    };
    worksheet.cells[buildWorksheetCellKey(colB.id, row.id)] = {
      value,
      type: "text",
      formula: null,
      computedValue: value,
      displayValue: value,
      metadata: {},
    };
  }

  return buildPricingWorksheetAiContext(worksheet, {
    worksheetId: "worksheet-1",
    worksheetName: params?.worksheetName ?? "Pricing Worksheet",
    tradePackage: params?.tradePackage ?? null,
  });
}

describe("classifyPricingWorksheetConstructionIntent", () => {
  it("keeps AUS/NZ as the default jurisdiction", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Explain this formula",
      worksheetContext: buildContext(),
    });

    expect(classification.defaultJurisdiction).toBe("AUS_NZ");
  });

  it("uses scoring instead of first-match ordering for mixed explain/fix prompts", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Explain this formula and fix it with IFERROR",
      worksheetContext: buildContext(),
    });

    expect(classification.primaryIntent).toBe("formula_fix");
    expect(classification.matchedIntentSignals).toContain("iferror");
  });

  it("classifies explain-formula prompts without construction reasoning by default", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Explain this formula",
      worksheetName: "Wall estimate",
      worksheetTradePackage: "Partitions",
      worksheetContext: buildContext({
        worksheetName: "Wall estimate",
        tradePackage: "Partitions",
        rows: [
          ["Studs", "m"],
          ["Head track", "lm"],
          ["Acoustic sealant", "ea"],
        ],
      }),
    });

    expect(["formula_explain", "answer_only"]).toContain(classification.primaryIntent);
    expect(classification.requiresConstructionReasoning).toBe(false);
    expect(classification.recommendedPromptPath).toBe("answer");
  });

  it("does not let worksheet trade context override a prompt-only explain request", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Explain this formula",
      worksheetName: "Ceiling estimate",
      worksheetTradePackage: "Ceilings",
      worksheetContext: buildContext({
        worksheetName: "Ceiling estimate",
        tradePackage: "Ceilings",
        rows: [
          ["Rondo Key-Lock", "grid"],
          ["Seismic trim", "lm"],
        ],
      }),
    });

    expect(classification.primaryIntent).not.toBe("worksheet_edit");
    expect(classification.primaryIntent).not.toBe("review_estimate");
  });

  it("classifies review estimate prompts with no trade context", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Review this estimate and tell me what I'm missing",
      worksheetContext: buildContext(),
    });

    expect(classification.primaryIntent).toBe("review_estimate");
    expect(classification.recommendedPromptPath).toBe("review");
    expect(classification.requiresConstructionReasoning).toBe(true);
  });

  it("classifies review estimate prompts with trade context", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Review this painting estimate and tell me what I'm missing",
      worksheetName: "Painting estimate",
      worksheetTradePackage: "Painting",
      worksheetContext: buildContext({ worksheetName: "Painting estimate", tradePackage: "Painting" }),
    });

    expect(classification.primaryIntent).toBe("review_estimate");
    expect(classification.tradeHints).toContain("painting");
  });

  it("classifies manufacturer-linked formula prompts as requiring retrieval", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Create formulas for a Rondo Key-Lock ceiling grid",
      worksheetName: "Ceiling estimate",
      worksheetTradePackage: "Ceilings",
      worksheetContext: buildContext({ worksheetName: "Ceiling estimate", tradePackage: "Ceilings" }),
    });

    expect(classification.primaryIntent).toBe("formula_generate");
    expect(classification.requiresConstructionReasoning).toBe(true);
    expect(classification.requiresRetrieval).toBe(true);
    expect(classification.retrievalReasons).toContain("manufacturer_or_system_named");
  });

  it("classifies missing-item edit prompts as worksheet edits", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Add acoustic sealant to this wall estimate",
      worksheetName: "Wall estimate",
      worksheetTradePackage: "Partitions",
      worksheetContext: buildContext({ worksheetName: "Wall estimate", tradePackage: "Partitions" }),
    });

    expect(classification.primaryIntent).toBe("worksheet_edit");
    expect(classification.recommendedPromptPath).toBe("edit");
    expect(classification.requiresConstructionReasoning).toBe(true);
  });

  it("marks seismic updates as high risk, retrieval-oriented, and follow-up worthy", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Update this estimate for seismic requirements",
      worksheetName: "Ceiling estimate",
      worksheetTradePackage: "Ceilings",
      worksheetContext: buildContext({ worksheetName: "Ceiling estimate", tradePackage: "Ceilings" }),
    });

    expect(classification.requiresConstructionReasoning).toBe(true);
    expect(classification.requiresRetrieval).toBe(true);
    expect(classification.riskLevel).toBe("high");
    expect(classification.shouldAskFollowUp).toBe(true);
    expect(classification.matchedRiskSignals).toContain("risk:seismic");
  });

  it("marks fire and acoustic high-risk requests for follow-up", () => {
    const fire = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Update this estimate for fire compliance",
      worksheetContext: buildContext(),
    });
    const acoustic = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Add acoustic compliance allowances",
      worksheetContext: buildContext(),
    });

    expect(fire.riskLevel).toBe("high");
    expect(fire.shouldAskFollowUp).toBe(true);
    expect(acoustic.riskLevel).toBe("high");
    expect(acoustic.shouldAskFollowUp).toBe(true);
  });

  it("classifies quote preparation prompts and maps them to quote_takeoff", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Send this subtotal to quote",
      worksheetName: "Fitout estimate",
      worksheetTradePackage: "Fitout",
      worksheetContext: buildContext({ worksheetName: "Fitout estimate", tradePackage: "Fitout" }),
    });

    expect(classification.primaryIntent).toBe("quote_prepare");
    expect(classification.recommendedPromptPath).toBe("quote_takeoff");
  });

  it("classifies takeoff measurement binding prompts and maps them to quote_takeoff", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Use the measured ceiling area from takeoff",
      worksheetName: "Ceiling estimate",
      worksheetTradePackage: "Ceilings",
      worksheetContext: buildContext({ worksheetName: "Ceiling estimate", tradePackage: "Ceilings" }),
    });

    expect(classification.primaryIntent).toBe("takeoff_bind");
    expect(classification.recommendedPromptPath).toBe("quote_takeoff");
  });

  it("classifies wastage adjustments", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Add 10% wastage to materials",
      worksheetName: "Joinery estimate",
      worksheetTradePackage: "Joinery",
      worksheetContext: buildContext({ worksheetName: "Joinery estimate", tradePackage: "Joinery" }),
    });

    expect(classification.primaryIntent).toBe("wastage_adjustment");
  });

  it("classifies labour adjustments", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: "Change labour to 0.35 hours per m2",
      worksheetName: "Flooring estimate",
      worksheetTradePackage: "Flooring",
      worksheetContext: buildContext({ worksheetName: "Flooring estimate", tradePackage: "Flooring" }),
    });

    expect(classification.primaryIntent).toBe("labour_adjustment");
  });

  it("classifies steel stud spreadsheet-builder prompts as worksheet generation", () => {
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt:
        "Create me spreadsheet that I put in the LM of a steel stud, and it will calculate all material and labour required.",
      worksheetName: "Blank worksheet",
      worksheetTradePackage: "Partitions",
      worksheetContext: buildContext({ worksheetName: "Blank worksheet", tradePackage: "Partitions" }),
    });

    expect(classification.primaryIntent).toBe("worksheet_generation");
    expect(classification.recommendedPromptPath).toBe("generation");
  });

  it("treats broad create/build pricing worksheet prompts as worksheet generation even with competing pricing keywords", () => {
    const prompts = [
      "Create a suspended ceilings pricing worksheet with materials, labour, wastage, margins, formulas and totals.",
      "Create a partitions pricing worksheet.",
      "Build a flooring pricing worksheet with labour and materials.",
      "Generate a fire stopping pricing template.",
      "Create a commercial interiors estimate worksheet.",
      "Build a full pricing template for seismic ceilings.",
    ];

    for (const prompt of prompts) {
      const classification = classifyPricingWorksheetConstructionIntent({
        userPrompt: prompt,
        worksheetName: "Blank worksheet",
        worksheetTradePackage: "Commercial",
        worksheetContext: buildContext({ worksheetName: "Blank worksheet", tradePackage: "Commercial" }),
      });

      expect(classification.primaryIntent, prompt).toBe("worksheet_generation");
      expect(classification.recommendedPromptPath, prompt).toBe("generation");
    }
  });

  it("classifies worksheet edit prompts by primary action before secondary pricing keywords", () => {
    const cases = [
      "Add formulas to this worksheet.",
      "Insert missing material rows.",
      "Update labour allowances by 15%.",
      "Add wastage calculations to the totals section.",
    ];

    for (const prompt of cases) {
      const classification = classifyPricingWorksheetConstructionIntent({
        userPrompt: prompt,
        worksheetName: "Pricing worksheet",
        worksheetTradePackage: "Fitout",
        worksheetContext: buildContext({ worksheetName: "Pricing worksheet", tradePackage: "Fitout" }),
      });

      expect(classification.primaryIntent, prompt).toBe("worksheet_edit");
      expect(classification.recommendedPromptPath, prompt).toBe("edit");
    }
  });

  it("classifies highlight and colour prompts as worksheet edits instead of unknown", () => {
    const cases = [
      "Highlight the input cells in this worksheet.",
      "Colour the fillable cells so the team knows what to enter.",
      "Mark the areas to fill in for pricing inputs.",
      "Shade the assumption cells and identify input cells.",
    ];

    for (const prompt of cases) {
      const classification = classifyPricingWorksheetConstructionIntent({
        userPrompt: prompt,
        worksheetName: "Pricing worksheet",
        worksheetTradePackage: "Fitout",
        worksheetContext: buildContext({ worksheetName: "Pricing worksheet", tradePackage: "Fitout" }),
      });

      expect(classification.primaryIntent, prompt).toBe("worksheet_edit");
      expect(classification.recommendedPromptPath, prompt).toBe("edit");
    }
  });

  it("classifies worksheet review prompts separately from generation and mutation requests", () => {
    const cases = [
      "Review this worksheet for pricing risks.",
      "Audit formulas and totals.",
      "Find missing labour items.",
    ];

    for (const prompt of cases) {
      const classification = classifyPricingWorksheetConstructionIntent({
        userPrompt: prompt,
        worksheetName: "Pricing worksheet",
        worksheetTradePackage: "Fitout",
        worksheetContext: buildContext({ worksheetName: "Pricing worksheet", tradePackage: "Fitout" }),
      });

      expect(classification.primaryIntent, prompt).toBe("review_estimate");
      expect(classification.recommendedPromptPath, prompt).toBe("review");
    }
  });

  it("keeps formula and pricing advice prompts on the answer path", () => {
    const cases = [
      "What formula should I use for wastage?",
      "How do I calculate labour burden?",
      "Explain markup vs margin.",
    ];

    for (const prompt of cases) {
      const classification = classifyPricingWorksheetConstructionIntent({
        userPrompt: prompt,
        worksheetName: "Pricing worksheet",
        worksheetTradePackage: "Fitout",
        worksheetContext: buildContext({ worksheetName: "Pricing worksheet", tradePackage: "Fitout" }),
      });

      expect(["answer_only", "formula_explain", "formula_generate"]).toContain(classification.primaryIntent);
      expect(classification.recommendedPromptPath, prompt).toBe("answer");
    }
  });

  it("detects trade-agnostic signals across multiple trades", () => {
    const cases = [
      {
        prompt: "Review this painting estimate",
        worksheetName: "Painting estimate",
        tradePackage: "Painting",
        expectedTrade: "painting",
      },
      {
        prompt: "Add waterproofing allowance",
        worksheetName: "Bathroom works",
        tradePackage: "Waterproofing",
        expectedTrade: "waterproofing",
      },
      {
        prompt: "Create an electrical cable tray formula",
        worksheetName: "Electrical estimate",
        tradePackage: "Electrical",
        expectedTrade: "electrical",
      },
      {
        prompt: "Update HVAC ductwork quantity",
        worksheetName: "Mechanical estimate",
        tradePackage: "HVAC",
        expectedTrade: "hvac_mechanical",
      },
      {
        prompt: "Review this civil drainage estimate",
        worksheetName: "Civil drainage estimate",
        tradePackage: "Drainage",
        expectedTrade: "drainage",
      },
      {
        prompt: "Review this structural steel estimate",
        worksheetName: "Structural steel estimate",
        tradePackage: "Structural Steel",
        expectedTrade: "structural_steel",
      },
      {
        prompt: "Review this glazing estimate",
        worksheetName: "Glazing estimate",
        tradePackage: "Glazing",
        expectedTrade: "glazing",
      },
      {
        prompt: "Review this roofing estimate",
        worksheetName: "Roofing estimate",
        tradePackage: "Roofing",
        expectedTrade: "roofing",
      },
      {
        prompt: "Review this tiling estimate",
        worksheetName: "Tiling estimate",
        tradePackage: "Tiling",
        expectedTrade: "tiling",
      },
      {
        prompt: "Review this flooring estimate",
        worksheetName: "Flooring estimate",
        tradePackage: "Flooring",
        expectedTrade: "flooring",
      },
    ];

    for (const testCase of cases) {
      const classification = classifyPricingWorksheetConstructionIntent({
        userPrompt: testCase.prompt,
        worksheetName: testCase.worksheetName,
        worksheetTradePackage: testCase.tradePackage,
        worksheetContext: buildContext({
          worksheetName: testCase.worksheetName,
          tradePackage: testCase.tradePackage,
        }),
      });

      expect(classification.tradeHints).toContain(testCase.expectedTrade);
      expect(classification.matchedTradeSignals?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
