import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import { buildPricingWorksheetAiContext } from "@/lib/pricing-worksheet-ai-context";
import {
  buildPricingWorksheetAiStructureSnapshot,
  detectPricingWorksheetState,
} from "@/lib/pricing-worksheet-ai-structure-snapshot";

function setTextCell(
  worksheet: ReturnType<typeof createDefaultWorksheetData>,
  ref: string,
  value: string,
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
    type: "text",
    formula: null,
    computedValue: value,
    displayValue: value,
    metadata: {},
  };
}

function setFormulaCell(
  worksheet: ReturnType<typeof createDefaultWorksheetData>,
  ref: string,
  formula: string,
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
    type: "formula",
    formula,
    computedValue: null,
    displayValue: `=${formula}`,
    metadata: {},
  };
}

function buildClassification(path: "generation" | "edit" | "review" | "answer") {
  return {
    primaryIntent:
      path === "generation"
        ? ("worksheet_generation" as const)
        : path === "edit"
          ? ("worksheet_edit" as const)
          : path === "review"
            ? ("review_estimate" as const)
            : ("answer_only" as const),
    defaultJurisdiction: "AUS_NZ" as const,
    requiresConstructionReasoning: true,
    requiresRetrieval: false,
    tradeHints: [],
    systemHints: [],
    confidence: "medium" as const,
    riskLevel: "medium" as const,
    shouldAskFollowUp: false,
    reason: "test",
    matchedIntentSignals: [],
    matchedTradeSignals: [],
    matchedSystemSignals: [],
    matchedRiskSignals: [],
    retrievalReasons: [],
    recommendedPromptPath: path,
  };
}

describe("pricing worksheet AI structure snapshot", () => {
  it("detects blank worksheets and sends no existing rows for blank generation prompts", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Blank Worksheet",
      rowCount: 20,
      columnCount: 12,
    });
    const context = buildPricingWorksheetAiContext(worksheet, {
      worksheetName: worksheet.sheetName,
      worksheetId: "blank-worksheet",
      tradePackage: "Interiors",
    });

    expect(
      detectPricingWorksheetState({
        worksheet,
        worksheetContext: context,
      }),
    ).toBe("blank");

    const snapshot = buildPricingWorksheetAiStructureSnapshot({
      worksheet,
      worksheetContext: context,
      classification: buildClassification("generation"),
      prompt: "Create a pricing worksheet with materials and labour.",
    });

    expect(snapshot.worksheetState).toBe("blank");
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.formulaTargets.rows).toEqual([]);
    expect(snapshot.formulaCompatibility.allowedFunctions).toContain("SUM");
  });

  it("detects formula-heavy worksheets from real formula-bearing rows", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Formula Worksheet",
      rowCount: 24,
      columnCount: 12,
    });
    for (let row = 1; row <= 16; row += 1) {
      setTextCell(worksheet, `B${row}`, `Line ${row}`);
      setFormulaCell(worksheet, `J${row}`, `SUM(E${row}:I${row})`);
    }
    const context = buildPricingWorksheetAiContext(worksheet, {
      worksheetName: worksheet.sheetName,
      worksheetId: "formula-worksheet",
      tradePackage: "Interiors",
    });

    expect(
      detectPricingWorksheetState({
        worksheet,
        worksheetContext: context,
        currentWorksheetSummary: {
          formulaCount: 16,
        },
      }),
    ).toBe("formula_heavy");
  });

  it("builds a deterministic structure snapshot with real sections and formula target refs", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Structured Worksheet",
      rowCount: 20,
      columnCount: 12,
    });
    setTextCell(worksheet, "A1", "Materials");
    setTextCell(worksheet, "K1", "Editable project assumptions");
    setTextCell(worksheet, "B2", "Track and stud");
    setTextCell(worksheet, "B3", "Insulation");
    setTextCell(worksheet, "B4", "Materials subtotal");
    setTextCell(worksheet, "K2", "Input row for area and spacing assumptions");
    setFormulaCell(worksheet, "J2", "E2*F2");
    setFormulaCell(worksheet, "J3", "E3*F3");
    setFormulaCell(worksheet, "J4", "SUM(J2:J3)");

    const context = buildPricingWorksheetAiContext(worksheet, {
      worksheetName: worksheet.sheetName,
      worksheetId: "structured-worksheet",
      tradePackage: "Interiors",
    });
    const snapshot = buildPricingWorksheetAiStructureSnapshot({
      worksheet,
      worksheetContext: context,
      classification: buildClassification("review"),
      prompt: "Review this worksheet for pricing risks.",
    });

    expect(snapshot.bounds).toEqual({ rowCount: 20, columnCount: 12 });
    expect(snapshot.sections[0]).toMatchObject({
      title: "Materials",
      startRow: 1,
      endRow: 4,
    });
    expect(snapshot.formulaTargets.rows.find((row) => row.label === "Track and stud")?.cells.total).toBe("J2");
    expect(snapshot.formulaTargets.sectionTotals.materials).toBe("J4");
    expect(snapshot.formulaTargets.sectionTotalRanges.materials).toBe("J2:J4");
    expect(snapshot.rows.find((row) => row.label === "Track and stud")).toMatchObject({
      notesPreview: "Input row for area and spacing assumptions",
      rowPurposeHint: "formula_target",
      isLikelyInputRow: true,
      isLikelyAssumptionRow: true,
    });
    expect(snapshot.formulaTargets.rows.find((row) => row.label === "Track and stud")).toMatchObject({
      rowPurposeHint: "formula_target",
      isLikelyInputRow: true,
      isLikelyAssumptionRow: true,
      notesPreview: "Input row for area and spacing assumptions",
    });
  });
});
