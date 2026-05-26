import { describe, expect, it } from "vitest";
import {
  compileAiWorksheetFormula,
  type PricingWorksheetAiFormulaCompileInput,
} from "@/lib/pricing-worksheet-ai-formula-compiler";
import type { PricingWorksheetStructureSnapshot } from "@/lib/pricing-worksheet-ai-structure-snapshot";

const snapshot: PricingWorksheetStructureSnapshot = {
  worksheetState: "starter_generated",
  budgetTier: "small",
  estimatedTokenSize: 120,
  bounds: {
    rowCount: 40,
    columnCount: 12,
  },
  columns: [],
  rows: [],
  sections: [
    {
      title: "Inputs",
      startRow: 2,
      endRow: 3,
      subtotalRow: null,
      totalCells: [],
    },
    {
      title: "Materials",
      startRow: 4,
      endRow: 6,
      subtotalRow: 7,
      totalCells: ["J7"],
    },
  ],
  totals: [],
  formulaTargets: {
    rows: [
      {
        rowNumber: 3,
        label: "Ceiling Area",
        sectionName: "Inputs",
        cells: {
          quantity: "E3",
          materialRate: "F3",
          labourHours: "G3",
          labourRate: "H3",
          margin: "I3",
          total: "J3",
          notes: "K3",
        },
        primaryRef: "E3",
      },
      {
        rowNumber: 4,
        label: "Wastage Factor",
        sectionName: "Inputs",
        cells: {
          quantity: "E4",
          materialRate: "F4",
          labourHours: "G4",
          labourRate: "H4",
          margin: "I4",
          total: "J4",
          notes: "K4",
        },
        primaryRef: "E4",
      },
      {
        rowNumber: 6,
        label: "Grid and Tile Supply",
        sectionName: "Materials",
        cells: {
          quantity: "E6",
          materialRate: "F6",
          labourHours: "G6",
          labourRate: "H6",
          margin: "I6",
          total: "J6",
          notes: "K6",
        },
        primaryRef: "J6",
      },
    ],
    namedRefs: {
      ceilingarea: "E3",
      wastagefactor: "E4",
    },
    sectionTotals: {
      materials: "J7",
    },
    sectionTotalRanges: {
      materials: "J5:J6",
    },
  },
  formulaCompatibility: {
    allowedFunctions: [
      "SUM",
      "MIN",
      "MAX",
      "ROUND",
      "ROUNDUP",
      "ROUNDDOWN",
      "IF",
      "IFERROR",
      "IFS",
      "AND",
      "OR",
      "CEILING",
      "QTY",
      "UNIT",
      "WASTE",
      "PACKS",
    ],
    allowedOperators: ["+", "-", "*", "/", "(", ")", ".", ",", ":", "<", ">", "=", "$", "\"", "_"],
    supportedCellRefFormat: "A1",
    supportedRangeFormat: "A1:B2",
    unsupportedSyntaxWarnings: [
      "Curly-brace placeholders are not supported.",
      "Named spreadsheet references are not supported unless explicitly resolved to real cells.",
    ],
    allowedCharacterPattern: "A-Z0-9+-*/().,:<>= $\"_",
  },
};

function compile(overrides: Partial<PricingWorksheetAiFormulaCompileInput>) {
  return compileAiWorksheetFormula({
    expression: "=SUM(J5:J6)",
    targetCell: "J10",
    currentRowNumber: 6,
    currentSectionName: "Materials",
    snapshot,
    ...overrides,
  });
}

describe("compileAiWorksheetFormula", () => {
  it("preserves valid spreadsheet formulas", () => {
    const result = compile({
      expression: "=SUM(J5:J6)",
    });

    expect(result).toMatchObject({
      success: true,
      formula: "=SUM(J5:J6)",
      blockedReason: null,
    });
  });

  it("preserves MAX and MIN formulas during compilation", () => {
    const maxResult = compile({
      expression: "=MAX(1,E3/20)",
    });
    const minResult = compile({
      expression: "=MIN(E3,E4)",
    });

    expect(maxResult).toMatchObject({
      success: true,
      formula: "=MAX(1,E3/20)",
      blockedReason: null,
    });
    expect(minResult).toMatchObject({
      success: true,
      formula: "=MIN(E3,E4)",
      blockedReason: null,
    });
  });

  it("preserves AND formulas during compilation", () => {
    const result = compile({
      expression: '=IF(AND(E3<>"",E4<>""),E3*E4,"")',
    });

    expect(result).toMatchObject({
      success: true,
      formula: '=IF(AND(E3<>"",E4<>""),E3*E4,"")',
      blockedReason: null,
    });
  });

  it("preserves IFS formulas during compilation", () => {
    const result = compile({
      expression: '=IFS(E3="USG",10,E3="Rondo",MAX(1,E4/20))',
    });

    expect(result).toMatchObject({
      success: true,
      formula: '=IFS(E3="USG",10,E3="Rondo",MAX(1,E4/20))',
      blockedReason: null,
    });
  });

  it("preserves helper formulas during compilation", () => {
    const qtyResult = compile({ expression: "=QTY(E3,E4,E6,I6)" });
    const unitResult = compile({ expression: "=UNIT(E3,E4,I6)" });
    const wasteResult = compile({ expression: "=WASTE(E3,E4)" });
    const packsResult = compile({ expression: "=PACKS(E3,20)" });

    expect(qtyResult).toMatchObject({
      success: true,
      formula: "=QTY(E3,E4,E6,I6)",
      blockedReason: null,
    });
    expect(unitResult).toMatchObject({
      success: true,
      formula: "=UNIT(E3,E4,I6)",
      blockedReason: null,
    });
    expect(wasteResult).toMatchObject({
      success: true,
      formula: "=WASTE(E3,E4)",
      blockedReason: null,
    });
    expect(packsResult).toMatchObject({
      success: true,
      formula: "=PACKS(E3,20)",
      blockedReason: null,
    });
  });

  it("preserves percentage and exponent formulas during compilation", () => {
    const percentResult = compile({ expression: "=E3*10%" });
    const wastePercentResult = compile({ expression: "=WASTE(E3,10%)" });
    const powerResult = compile({ expression: "=E3^2" });

    expect(percentResult).toMatchObject({
      success: true,
      formula: "=E3*10%",
      blockedReason: null,
    });
    expect(wastePercentResult).toMatchObject({
      success: true,
      formula: "=WASTE(E3,10%)",
      blockedReason: null,
    });
    expect(powerResult).toMatchObject({
      success: true,
      formula: "=E3^2",
      blockedReason: null,
    });
  });

  it("compiles worksheet-aware row, section, and current-row references into real refs", () => {
    const result = compile({
      targetCell: "J20",
      expression:
        'IFERROR(row("Ceiling Area").quantity * row("Wastage Factor").quantity + SUM(section("Materials").rows.total) + currentRow.margin, 0)',
    });

    expect(result.success).toBe(true);
    expect(result.formula).toBe("=IFERROR(E3 * E4 + SUM(J5:J6) + I6, 0)");
    expect(result.unresolvedReferences).toEqual([]);
  });

  it("blocks unresolved placeholders and fake refs", () => {
    const result = compile({
      expression: '=IFERROR({CostSubtotal} + 8_Qty, "")',
    });

    expect(result.success).toBe(false);
    expect(result.blockedReason).toBe("formula_unresolved_reference");
    expect(result.unresolvedReferences).toEqual(
      expect.arrayContaining(["{CostSubtotal}", "8_Qty"]),
    );
  });

  it("blocks unsupported functions", () => {
    const result = compile({
      expression: "=VLOOKUP(E3,A1:B10,2,FALSE)",
    });

    expect(result.success).toBe(false);
    expect(result.blockedReason).toBe("formula_unsupported_function:VLOOKUP");
  });

  it("blocks out-of-bounds refs", () => {
    const result = compile({
      expression: "=SUM(Z99:Z100)",
    });

    expect(result.success).toBe(false);
    expect(result.blockedReason).toBe("formula_ref_out_of_bounds");
  });

  it("blocks circular self-references", () => {
    const result = compile({
      targetCell: "J6",
      expression: "=J6*0.15",
    });

    expect(result.success).toBe(false);
    expect(result.blockedReason).toBe("formula_self_reference");
  });

  it.each([
    '=IFERROR(E3*E4,"")G7',
    "=ROUNDUP(E3/1.2,0)E4",
    "=SUM(E3:E10)J12",
    "=E3E4",
    "=MAX()",
    "=MIN()",
    "=AND()",
    "=IFS()",
    '=IFS(E3="USG",10,E3="Rondo")',
    "=QTY(E3,E4,E6)",
    "=UNIT(E3,E4)",
    "=WASTE(E3)",
    "=PACKS(E3,20,5)",
  ])("blocks structurally invalid spreadsheet formula %s", (expression) => {
    const result = compile({
      expression,
    });

    expect(result.success).toBe(false);
    expect(result.blockedReason).toBe("formula_invalid_structure");
  });
});
