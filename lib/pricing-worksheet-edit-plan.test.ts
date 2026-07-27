import { describe, expect, it } from "vitest";
import {
  createDefaultWorksheetData,
  normalizeWorksheetData,
  type WorksheetData,
} from "./opportunity-pricing-worksheet-defaults";
import { getCellFormat } from "./opportunity-pricing-worksheet-formatting";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";
import { validateWorksheetBeforeSave } from "./opportunity-pricing-worksheet-save-validation";
import {
  batchPricingWorksheetAiOperationsForSafePreview,
  buildPricingWorksheetAiAssistantSchema,
  buildPricingWorksheetAiSuggestedEditSelectionResponse,
  normalizePricingWorksheetAiAssistantResponse,
  simulatePricingWorksheetAiEditPlan,
  type PricingWorksheetAiAssistantResponse,
} from "./pricing-worksheet-edit-plan";

function setCell(
  worksheet: WorksheetData,
  ref: string,
  params: { value?: string | number | null; formula?: string | null },
) {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid ref ${ref}`);
  }

  const column = worksheet.columns.find((entry) => entry.id === match[1]);
  const row = worksheet.rows[Number(match[2]) - 1];
  if (!column || !row) {
    throw new Error(`Missing worksheet position for ${ref}`);
  }

  const cellKey = buildWorksheetCellKey(column.id, row.id);
  const value = params.formula ?? params.value ?? null;
  worksheet.cells[cellKey] = {
    value,
    type: typeof value === "number" ? "number" : value === null ? "empty" : "text",
    formula: params.formula ?? null,
    computedValue: value,
    displayValue: value === null ? "" : String(value),
    metadata: {},
  };
}

function getCell(worksheet: WorksheetData, ref: string) {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid ref ${ref}`);
  }

  const column = worksheet.columns.find((entry) => entry.id === match[1]);
  const row = worksheet.rows[Number(match[2]) - 1];
  if (!column || !row) {
    throw new Error(`Missing worksheet position for ${ref}`);
  }

  return worksheet.cells[buildWorksheetCellKey(column.id, row.id)] ?? null;
}

function findRowByCellValue(worksheet: WorksheetData, columnId: string, value: string) {
  for (let index = 0; index < worksheet.rows.length; index += 1) {
    const row = worksheet.rows[index];
    const cell = worksheet.cells[buildWorksheetCellKey(columnId, row.id)];
    if (cell?.value === value) {
      return index + 1;
    }
  }

  return null;
}

function buildBaseWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Wall Framing",
    rowCount: 8,
    columnCount: 6,
  });

  setCell(worksheet, "A1", { value: "Item" });
  setCell(worksheet, "B1", { value: "Description" });
  setCell(worksheet, "C1", { value: "Qty" });
  setCell(worksheet, "D1", { value: "Rate" });
  setCell(worksheet, "E1", { value: "Total" });

  setCell(worksheet, "B2", { value: "90x45 studs" });
  setCell(worksheet, "C2", { value: 10 });
  setCell(worksheet, "D2", { value: 2 });
  setCell(worksheet, "E2", { formula: "=C2*D2" });

  setCell(worksheet, "B3", { value: "Bottom plate" });
  setCell(worksheet, "C3", { value: 4 });
  setCell(worksheet, "D3", { value: 3 });
  setCell(worksheet, "E3", { formula: "=C3*D3" });

  setCell(worksheet, "B4", { value: "Timber total" });
  setCell(worksheet, "E4", { formula: "=SUM(E2:E3)" });

  return worksheet;
}

function buildGeneratedPricingWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Generated Pricing Sheet",
    rowCount: 20,
    columnCount: 20,
  });

  setCell(worksheet, "J3", { value: "Quantity" });
  setCell(worksheet, "M3", { value: "Labour" });
  setCell(worksheet, "N3", { value: "Mat. Rate" });
  setCell(worksheet, "O3", { value: "Material" });
  setCell(worksheet, "Q3", { value: "Total $" });
  setCell(worksheet, "B9", { value: "Track and stud" });

  return worksheet;
}

function walkStrictSchemaObjects(
  schema: unknown,
  visitor: (node: Record<string, unknown>, path: string[]) => void,
  path: string[] = [],
) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return;
  }

  const node = schema as Record<string, unknown>;
  if (node.properties && typeof node.properties === "object" && !Array.isArray(node.properties)) {
    visitor(node, path);
    Object.entries(node.properties as Record<string, unknown>).forEach(([key, value]) => {
      walkStrictSchemaObjects(value, visitor, [...path, "properties", key]);
    });
  }

  if (node.items) {
    walkStrictSchemaObjects(node.items, visitor, [...path, "items"]);
  }

  if (node.anyOf && Array.isArray(node.anyOf)) {
    node.anyOf.forEach((entry, index) => walkStrictSchemaObjects(entry, visitor, [...path, "anyOf", String(index)]));
  }

  if (node.oneOf && Array.isArray(node.oneOf)) {
    node.oneOf.forEach((entry, index) => walkStrictSchemaObjects(entry, visitor, [...path, "oneOf", String(index)]));
  }
}

describe("simulatePricingWorksheetAiEditPlan", () => {
  it("copies a row variant and shifts copied formulas", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Copy studs row",
      answer: "",
      summary: "Duplicate the studs row as nogs.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "copy_row_variant",
          target: {
            sourceRow: 2,
            insertAfterRow: 2,
          },
          values: {
            cells: [{ column: "B", value: "90x45 nogs" }],
          },
          formulas: {
            cells: [],
          },
          rationale: "Reuse the existing timber row pattern.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(result.diffSummary.insertedRows).toEqual([3]);
    expect(getCell(result.worksheet, "B3")?.value).toBe("90x45 nogs");
    expect(getCell(result.worksheet, "E3")?.formula).toBe("=C3*D3");
  });

  it("inserts a row using structure utilities and shifts downstream formulas", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Insert labour row",
      answer: "",
      summary: "Insert a labour row under timber.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "insert_row",
          target: {
            insertAfterRow: 2,
          },
          values: {
            cells: [{ column: "B", value: "Timber labour" }],
          },
          formulas: {
            cells: [],
          },
          rationale: "Add a manual labour row without overwriting existing rows.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);
    const bottomPlateRow = findRowByCellValue(result.worksheet, "B", "Bottom plate");
    const subtotalRow = findRowByCellValue(result.worksheet, "B", "Timber total");

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "B3")?.value).toBe("Timber labour");
    expect(bottomPlateRow).not.toBeNull();
    expect(subtotalRow).not.toBeNull();
    expect((bottomPlateRow ?? 0) > 3).toBe(true);
    expect((subtotalRow ?? 0) > (bottomPlateRow ?? 0)).toBe(true);
    expect(getCell(result.worksheet, `E${subtotalRow}`)?.formula).toBe(`=SUM(E2:E${bottomPlateRow})`);
  });

  it("updates multiple cells and recalculates formulas", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Add waste",
      answer: "",
      summary: "Adjust quantity and rate together.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cells",
          target: {},
          values: {
            cells: [
              { ref: "C2", value: 12 },
              { ref: "D2", value: 2.5 },
            ],
          },
          formulas: {
            cells: [],
          },
          rationale: "Update qty and rate together.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "C2")?.value).toBe(12);
    expect(getCell(result.worksheet, "D2")?.value).toBe(2.5);
    expect(getCell(result.worksheet, "E2")?.displayValue).toBe("30");
  });

  it("stores AI numeric-looking string literals as numeric worksheet cells", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Update literals",
      answer: "",
      summary: "Store numeric-looking literals safely.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cells",
          target: {},
          values: {
            cells: [
              { ref: "C2", value: "51.75" },
              { ref: "D2", value: "4" },
            ],
          },
          formulas: { cells: [] },
          rationale: "Apply AI literal updates.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "C2")?.type).toBe("number");
    expect(getCell(result.worksheet, "C2")?.value).toBe(51.75);
    expect(getCell(result.worksheet, "D2")?.type).toBe("number");
    expect(getCell(result.worksheet, "D2")?.value).toBe(4);
  });

  it("keeps normal AI text literals as text cells", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Update text",
      answer: "",
      summary: "Keep descriptive text as text.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cell",
          target: { cell: "B2" },
          values: {
            cells: [{ ref: "B2", value: "Wall framing labour" }],
          },
          formulas: { cells: [] },
          rationale: "Update description.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "B2")?.type).toBe("text");
    expect(getCell(result.worksheet, "B2")?.value).toBe("Wall framing labour");
  });

  it("recalculates formulas successfully after AI writes numeric-looking string literals", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Formula inputs",
      rowCount: 20,
      columnCount: 20,
    });
    setCell(worksheet, "J9", { value: null });
    setCell(worksheet, "N9", { value: null });
    setCell(worksheet, "O9", { formula: "=J9*N9" });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Apply totals inputs",
      answer: "",
      summary: "Set numeric inputs used by formulas.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cells",
          target: {},
          values: {
            cells: [
              { ref: "J9", value: "51.750000000000001" },
              { ref: "N9", value: "5.78" },
            ],
          },
          formulas: { cells: [] },
          rationale: "Populate formula inputs.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "J9")?.type).toBe("number");
    expect(getCell(result.worksheet, "J9")?.displayValue).toBe("51.75");
    expect(getCell(result.worksheet, "N9")?.type).toBe("number");
    expect(getCell(result.worksheet, "O9")?.displayValue).toBe("299.115");
  });

  it("preserves corrected numeric typing after worksheet reload normalization", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Reload test",
      rowCount: 12,
      columnCount: 12,
    });
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Apply numeric literal",
      answer: "",
      summary: "Store a numeric AI literal.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cell",
          target: { cell: "J9" },
          values: {
            cells: [{ ref: "J9", value: "1.15" }],
          },
          formulas: { cells: [] },
          rationale: "Populate a quantity input.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);
    const reloaded = normalizeWorksheetData(result.worksheet as unknown as Record<string, unknown>);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(reloaded, "J9")?.type).toBe("number");
    expect(getCell(reloaded, "J9")?.value).toBe(1.15);
  });

  it("rejects dirty numeric-like AI literals instead of persisting broken text cells", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Dirty literals",
      rowCount: 20,
      columnCount: 20,
    });
    setCell(worksheet, "N9", { value: 5.78 });
    setCell(worksheet, "O9", { formula: "=J9*N9" });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Dirty literals",
      answer: "",
      summary: "Attempt to write dirty numeric-looking text.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cells",
          target: {},
          values: {
            cells: [
              { ref: "J9", value: "$5.78" },
              { ref: "J10", value: "1,250.50" },
              { ref: "J11", value: "51.75\n0" },
            ],
          },
          formulas: { cells: [] },
          rationale: "Unsafe decorated literals.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.map((issue) => issue.code)).toContain("dirty_numeric_literal_rejected");
    expect(getCell(result.worksheet, "J9")).toBeNull();
    expect(getCell(result.worksheet, "J10")).toBeNull();
    expect(getCell(result.worksheet, "J11")).toBeNull();
    expect(getCell(result.worksheet, "O9")?.displayValue).toBe("0");
  });

  it("stores generated material rates as numeric cells with currency formatting", () => {
    const worksheet = buildGeneratedPricingWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Generated pricing row",
      answer: "",
      summary: "Apply generated pricing inputs and formulas.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "insert_row",
          target: {
            insertAfterRow: 8,
          },
          values: {
            cells: [
              { column: "B", value: "Track and stud" },
              { column: "J", value: 51.75 },
              { column: "N", value: 5.78 },
            ],
          },
          formulas: {
            cells: [
              { column: "O", formula: "=J9*N9" },
              { column: "Q", formula: "=O9+M9" },
            ],
          },
          rationale: "Insert a generated pricing row with safe numeric values.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "N9")?.type).toBe("number");
    expect(getCell(result.worksheet, "N9")?.value).toBe(5.78);
    expect(getCellFormat(getCell(result.worksheet, "N9") ?? undefined).number).toMatchObject({
      kind: "currency",
      decimalPlaces: 2,
    });
    expect(getCell(result.worksheet, "O9")?.formula).toBe("=J9*N9");
    expect(getCell(result.worksheet, "Q9")?.formula).toBe("=O9+M9");
  });

  it("rejects generated placeholder and decorated literals in numeric and formula output columns", () => {
    const worksheet = buildGeneratedPricingWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Bad generated pricing row",
      answer: "",
      summary: "Reject placeholder-heavy generated output.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "insert_row",
          target: {
            insertAfterRow: 8,
          },
          values: {
            cells: [
              { column: "J", value: "-" },
              { column: "N", value: "$5.78" },
              { column: "O", value: "$0" },
              { column: "Q", value: "$0" },
            ],
          },
          formulas: {
            cells: [],
          },
          rationale: "Unsafe generated placeholders.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);
    const issueCodes = result.validationIssues.map((issue) => issue.code);

    expect(issueCodes).toContain("invalid_numeric_placeholder_literal");
    expect(issueCodes).toContain("dirty_numeric_literal_rejected");
    expect(issueCodes).toContain("formula_output_requires_formula");
    expect(getCell(result.worksheet, "J9")).toBeNull();
    expect(getCell(result.worksheet, "N9")).toBeNull();
    expect(getCell(result.worksheet, "O9")).toBeNull();
    expect(getCell(result.worksheet, "Q9")).toBeNull();
  });

  it("keeps formulas evaluable and save-valid after generated numeric and formula writes", () => {
    const worksheet = buildGeneratedPricingWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Generated formulas",
      answer: "",
      summary: "Apply generated formulas without text placeholders.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cells",
          target: {},
          values: {
            cells: [
              { ref: "J9", value: "51.75" },
              { ref: "N9", value: "5.78" },
            ],
          },
          formulas: {
            cells: [
              { ref: "M9", formula: "=12" },
              { ref: "O9", formula: "=J9*N9" },
              { ref: "Q9", formula: "=O9+M9" },
            ],
          },
          rationale: "Apply generated pricing formulas.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);
    const saveValidation = validateWorksheetBeforeSave(result.worksheet);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "O9")?.displayValue).toBe("299.115");
    expect(getCell(result.worksheet, "Q9")?.displayValue).toBe("311.115");
    expect(saveValidation.ok).toBe(true);
  });

  it("fixes a formula safely", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "E2", { formula: "=C2+D2" });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Fix total formula",
      answer: "",
      summary: "Correct the total formula.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: "=C2*D2" }],
          },
          rationale: "Use qty multiplied by rate.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe("=C2*D2");
    expect(getCell(result.worksheet, "E2")?.displayValue).toBe("20");
  });

  it("allows IFERROR formulas that the worksheet engine supports", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "E2", { formula: "=C2/D2" });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Guard total formula",
      answer: "",
      summary: "Wrap the formula with IFERROR.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: '=IFERROR(C2/D2,"")' }],
          },
          rationale: "Prevent visible errors when inputs are missing.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe('=IFERROR(C2/D2,"")');
  });

  it("allows OR and CEILING formulas and recalculates them", () => {
    const worksheet = buildBaseWorksheet();

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Guard and round formula",
      answer: "",
      summary: "Use OR and CEILING in a safe AI formula edit.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: '=IF(OR(C2>0,D2>0),CEILING(C2/D2,1),"")' }],
          },
          rationale: "Round up the derived value when either input is present.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe('=IF(OR(C2>0,D2>0),CEILING(C2/D2,1),"")');
    expect(getCell(result.worksheet, "E2")?.displayValue).toBe("5");
  });

  it("allows AND formulas that the worksheet engine supports", () => {
    const worksheet = buildBaseWorksheet();

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Guard multiplication with AND",
      answer: "",
      summary: "Use AND in a safe AI formula edit.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: '=IF(AND(C2<>"",D2<>""),C2*D2,"")' }],
          },
          rationale: "Only calculate when both inputs are present.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe('=IF(AND(C2<>"",D2<>""),C2*D2,"")');
    expect(getCell(result.worksheet, "E2")?.displayValue).toBe("20");
  });

  it("allows MAX and MIN formulas that the worksheet engine already supports", () => {
    const worksheet = buildBaseWorksheet();

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Clamp formula values",
      answer: "",
      summary: "Use MAX and MIN in safe AI formulas.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [
              { ref: "E2", formula: "=MAX(1,C2/20)" },
              { ref: "E3", formula: "=MIN(C2,D2)" },
            ],
          },
          rationale: "Clamp derived values using supported runtime functions.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe("=MAX(1,C2/20)");
    expect(getCell(result.worksheet, "E3")?.formula).toBe("=MIN(C2,D2)");
  });

  it("allows IFS formulas that the worksheet engine supports", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "C2", { value: "USG" });
    setCell(worksheet, "D2", { value: 24 });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Classify with IFS",
      answer: "",
      summary: "Use IFS in a safe AI formula.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: '=IFS(C2="USG",10,D2>=0,MAX(1,D2/20))' }],
          },
          rationale: "Choose the first matching estimating rule.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe('=IFS(C2="USG",10,D2>=0,MAX(1,D2/20))');
  });

  it("allows deterministic helper formulas that the worksheet engine supports", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "C2", { value: 2 });
    setCell(worksheet, "D2", { value: 5 });
    setCell(worksheet, "C3", { value: 0.1 });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Use helper formulas",
      answer: "",
      summary: "Use deterministic worksheet helper formulas.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [
              { ref: "E2", formula: "=QTY(C2,D2,F2,F3)" },
              { ref: "E3", formula: "=UNIT(D2,F2,F3)" },
              { ref: "E4", formula: "=WASTE(D2,C3)" },
              { ref: "E5", formula: "=PACKS(D2,20)" },
            ],
          },
          rationale: "Use local deterministic helper functions only.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe("=QTY(C2,D2,F2,F3)");
    expect(getCell(result.worksheet, "E3")?.formula).toBe("=UNIT(D2,F2,F3)");
    expect(getCell(result.worksheet, "E4")?.formula).toBe("=WASTE(D2,C3)");
    expect(getCell(result.worksheet, "E5")?.formula).toBe("=PACKS(D2,20)");
  });

  it("allows formulas using percentage and exponent syntax that the runtime supports", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "C3", { value: 100 });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Use percent and exponent syntax",
      answer: "",
      summary: "Use supported arithmetic syntax safely.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [
              { ref: "E2", formula: "=C2*10%" },
              { ref: "E3", formula: "=WASTE(C3,10%)" },
              { ref: "E4", formula: "=D2^2" },
            ],
          },
          rationale: "Keep manual and AI formula syntax aligned.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe("=C2*10%");
    expect(getCell(result.worksheet, "E3")?.formula).toBe("=WASTE(C3,10%)");
    expect(getCell(result.worksheet, "E4")?.formula).toBe("=D2^2");
  });

  it("applies formatting-only operations without changing values or formulas", () => {
    const worksheet = buildBaseWorksheet();
    const originalQtyValue = getCell(worksheet, "C2")?.value;
    const originalRateValue = getCell(worksheet, "D2")?.value;
    const originalFormula = getCell(worksheet, "E2")?.formula;

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Highlight inputs",
      answer: "Highlighted the manual inputs.",
      summary: "Manual inputs are blue and formula outputs stay neutral.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "format_cells",
          target: {
            cells: ["C2", "D2", "E2"],
          },
          values: { cells: [] },
          formulas: { cells: [] },
          format: {
            backgroundColor: "blue",
            bold: true,
          },
          rationale: "Highlight the manual input cells clearly.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(result.diffSummary.formattingCells).toEqual(["C2", "D2", "E2"]);
    expect(getCell(result.worksheet, "C2")?.value).toBe(originalQtyValue);
    expect(getCell(result.worksheet, "D2")?.value).toBe(originalRateValue);
    expect(getCell(result.worksheet, "E2")?.formula).toBe(originalFormula);
    expect(getCellFormat(getCell(result.worksheet, "C2") ?? undefined).fill?.color).toBe("#DBEAFE");
    expect(getCellFormat(getCell(result.worksheet, "D2") ?? undefined).fill?.color).toBe("#DBEAFE");
    expect(getCellFormat(getCell(result.worksheet, "E2") ?? undefined).fill?.color).toBe("#F3F4F6");
  });

  it("normalizes unsupported formatting colours to safe worksheet colours", () => {
    const response = normalizePricingWorksheetAiAssistantResponse({
      mode: "propose_edit",
      proposalName: "Format inputs",
      answer: "",
      summary: "",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      reviewFindings: [],
      reviewSummary: null,
      suggestedEditGroups: [],
      evidenceSources: [],
      operations: [
        {
          type: "format_cell",
          target: {
            cell: "C2",
            cells: [],
            row: null,
            sourceRow: null,
            insertAfterRow: null,
            insertBeforeRow: null,
            startRow: null,
            endRow: null,
            sectionName: null,
            totalColumn: null,
            labelColumn: null,
          },
          values: { cells: [] },
          formulas: { cells: [] },
          format: {
            backgroundColor: "#123456",
            textColor: "#abcdef",
            bold: true,
            italic: true,
            border: true,
          },
          rationale: "Highlight the inputs.",
        },
      ],
    });

    expect(response.operations[0]?.format).toEqual({
      backgroundColor: "#DBEAFE",
      textColor: "#111827",
      bold: true,
      italic: true,
      border: true,
    });
  });

  it("salvages formatting operations that include legacy values scaffolding", () => {
    const response = normalizePricingWorksheetAiAssistantResponse({
      mode: "propose_edit",
      proposalName: "Highlight inputs",
      answer: "",
      summary: "",
      confidence: "medium",
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
            cell: null,
            cells: [],
            row: null,
            sourceRow: null,
            insertAfterRow: null,
            insertBeforeRow: null,
            startRow: null,
            endRow: null,
            sectionName: null,
            totalColumn: null,
            labelColumn: null,
          },
          values: {
            cells: [
              { ref: "C2", value: "manual quantity" },
              { ref: "D2", value: "rate input" },
            ],
          },
          formulas: {
            cells: [
              { ref: "E2", formula: "=C2*D2" },
            ],
          },
          format: {
            backgroundColor: "blue",
            bold: true,
          },
          rationale: "Highlight the input cells only.",
        },
      ],
    });

    expect(response.operations[0]?.target?.cells).toEqual(["C2", "D2", "E2"]);
    expect(response.operations[0]?.values).toBeNull();
    expect(response.operations[0]?.formulas).toBeNull();
  });

  it("allows absolute-reference formulas with $ anchors", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "C2", { value: 4 });
    setCell(worksheet, "D2", { value: 5 });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Anchored total",
      answer: "",
      summary: "Use anchored refs in a safe formula.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: "=$C$2*$D$2" }],
          },
          rationale: "Keep both inputs absolutely anchored.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "E2")?.formula).toBe("=$C$2*$D$2");
    expect(getCell(result.worksheet, "E2")?.displayValue).toBe("20");
  });

  it("still blocks out-of-bounds absolute references", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Bad anchored ref",
      answer: "",
      summary: "Anchored out-of-bounds refs should still fail.",
      confidence: "low",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: "=$Z$999" }],
          },
          rationale: "This should still be rejected.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.some((issue) => issue.code === "formula_ref_out_of_bounds")).toBe(true);
  });

  it("blocks unsupported formulas", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Unsupported lookup",
      answer: "",
      summary: "Try to use unsupported function.",
      confidence: "low",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: "=VLOOKUP(B2,B2:E3,4,FALSE)" }],
          },
          rationale: "This should be blocked.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.some((issue) => issue.code === "formula_unsupported_function")).toBe(true);
  });

  it("keeps answer_only mode read-only even if operations are returned", () => {
    const worksheet = buildBaseWorksheet();
    const before = JSON.stringify(worksheet);
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "answer_only",
      proposalName: "Unsafe answer",
      answer: "Use qty multiplied by rate.",
      summary: "No edits should happen.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cell",
          target: {
            cell: "B2",
          },
          values: {
            cells: [{ ref: "B2", value: "Should not apply" }],
          },
          formulas: {
            cells: [],
          },
          rationale: "Invalid in answer_only mode.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.some((issue) => issue.code === "mode_answer_only_mutation")).toBe(true);
    expect(JSON.stringify(result.worksheet)).toBe(before);
  });

  it("blocks out-of-bounds references", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Bad ref",
      answer: "",
      summary: "Out of bounds should fail.",
      confidence: "low",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: "=Z99*2" }],
          },
          rationale: "Invalid ref.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.some((issue) => issue.code === "formula_ref_out_of_bounds")).toBe(true);
  });

  it("downgrades formulas that recalculate to runtime errors during AI preview simulation", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "D2", { value: 0 });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Introduce unsafe division",
      answer: "",
      summary: "This should be rejected after recalculation.",
      confidence: "low",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "fix_formula",
          target: {
            cell: "E2",
          },
          values: {
            cells: [],
          },
          formulas: {
            cells: [{ ref: "E2", formula: "=C2/D2" }],
          },
          rationale: "Unsafe divide by zero.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(getCell(result.worksheet, "E2")?.formula).toBe("=C2*D2");
    expect(getCell(result.worksheet, "E2")?.displayValue).toBe("0");
    expect(result.validationIssues).toContainEqual(
      expect.objectContaining({
        code: "formula_recalc_downgraded",
        severity: "warning",
        cellRef: "E2",
        formula: "=C2/D2",
        formulaError: "#DIV/0!",
      }),
    );
    expect(result.validationIssues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("keeps valid formulas while stripping only runtime-invalid formula edits", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "D2", { value: 0 });
    setCell(worksheet, "B3", { value: "m2" });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Mixed safe and unsafe formulas",
      answer: "",
      summary: "Only the invalid formulas should be removed.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cells",
          target: {},
          values: {
            cells: [],
          },
          formulas: {
            cells: [
              { ref: "E2", formula: "=C2/D2" },
              { ref: "E3", formula: "=C3*B3" },
              { ref: "E4", formula: "=SUM(E2:E3)" },
            ],
          },
          rationale: "Test mixed outcomes.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(getCell(result.worksheet, "E2")?.formula).toBe("=C2*D2");
    expect(getCell(result.worksheet, "E3")?.formula).toBe("=C3*D3");
    expect(getCell(result.worksheet, "E4")?.formula).toBe("=SUM(E2:E3)");
    expect(result.validationIssues.filter((issue) => issue.code === "formula_recalc_downgraded")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cellRef: "E2",
          formula: "=C2/D2",
          formulaError: "#DIV/0!",
        }),
        expect.objectContaining({
          cellRef: "E3",
          formula: "=C3*B3",
          formulaError: "#VALUE!",
        }),
      ]),
    );
    expect(result.validationIssues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("preserves surrounding rows when inserting a new row", () => {
    const worksheet = buildBaseWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Insert row safely",
      answer: "",
      summary: "Insert a row without overwriting surrounding values.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "insert_row",
          target: {
            insertAfterRow: 2,
          },
          values: {
            cells: [{ column: "B", value: "Inserted row" }],
          },
          formulas: {
            cells: [],
          },
          rationale: "No overwrite.",
        },
      ],
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);
    const bottomPlateRow = findRowByCellValue(result.worksheet, "B", "Bottom plate");
    const subtotalRow = findRowByCellValue(result.worksheet, "B", "Timber total");

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "B3")?.value).toBe("Inserted row");
    expect(bottomPlateRow).not.toBeNull();
    expect(subtotalRow).not.toBeNull();
    expect((bottomPlateRow ?? 0) > 3).toBe(true);
    expect((subtotalRow ?? 0) > (bottomPlateRow ?? 0)).toBe(true);
  });

  it("normalizes invalid review finding categories safely", () => {
    const response = normalizePricingWorksheetAiAssistantResponse({
      mode: "answer_only",
      proposalName: "Review",
      answer: "Review complete.",
      summary: "Found one issue.",
      confidence: "medium",
      operations: [],
      assumptions: [],
      warnings: [],
      reviewFindings: [
        {
          id: "finding-1",
          category: "not_real",
          severity: "mega",
          confidence: "medium",
          title: "Potential issue",
          finding: "This is longer than normal but should still normalize safely.",
        },
      ],
    });

    expect(response.reviewFindings?.[0]?.category).toBe("general_review");
    expect(response.reviewFindings?.[0]?.severity).toBe("medium");
    expect(response.reviewFindings?.[0]?.findingStatus).toBe("active");
  });

  it("caps overlong review finding text", () => {
    const longText = "a".repeat(500);
    const response = normalizePricingWorksheetAiAssistantResponse({
      mode: "answer_only",
      proposalName: "Review",
      answer: "Review complete.",
      summary: "Found one issue.",
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
          title: longText,
          finding: longText,
        },
      ],
    });

    expect(response.reviewFindings?.[0]?.title.length).toBeLessThanOrEqual(120);
    expect(response.reviewFindings?.[0]?.finding.length).toBeLessThanOrEqual(320);
  });

  it("promotes formula-like AI value strings into real formula updates", () => {
    const response = normalizePricingWorksheetAiAssistantResponse({
      mode: "propose_edit",
      proposalName: "Apply formula",
      answer: "",
      summary: "",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "update_cell",
          target: {
            cell: "E2",
          },
          values: {
            cells: [{ ref: "E2", value: "=C2*D2" }],
          },
          formulas: {
            cells: [],
          },
          rationale: "Apply formula via AI value payload.",
        },
      ],
    });

    expect(response.operations[0]?.values?.cells).toEqual([]);
    expect(response.operations[0]?.formulas?.cells).toEqual([{ ref: "E2", column: null, formula: "=C2*D2" }]);
  });

  it("does not auto-apply suggested edit group operations during review normalization", () => {
    const response = normalizePricingWorksheetAiAssistantResponse({
      mode: "answer_only",
      proposalName: "Review",
      answer: "Review complete.",
      summary: "Found one issue.",
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
          title: "Missing wastage row",
          finding: "A wastage row may be missing.",
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
          assumptions: [],
          warnings: [],
          relatedFindingIds: ["finding-1"],
          operations: [
            {
              type: "insert_row",
              target: { insertAfterRow: 2 },
              values: { cells: [{ column: "B", value: "Wastage" }] },
              formulas: { cells: [] },
              rationale: "Add a wastage row.",
            },
          ],
        },
      ],
    });

    const reviewSimulation = simulatePricingWorksheetAiEditPlan(buildBaseWorksheet(), response);
    expect(reviewSimulation.diffSummary.insertedRows).toEqual([]);
    expect(response.operations).toEqual([]);
  });

  it("simulates only the selected suggested edit group through the existing validator", () => {
    const reviewResponse = normalizePricingWorksheetAiAssistantResponse({
      mode: "answer_only",
      proposalName: "Review",
      answer: "Review complete.",
      summary: "Found two issues.",
      confidence: "medium",
      operations: [],
      assumptions: [],
      warnings: [],
      suggestedEditGroups: [
        {
          id: "group-1",
          title: "Add wastage row",
          purpose: "Insert a wastage row.",
          confidence: "medium",
          assumptions: [],
          warnings: [],
          relatedFindingIds: [],
          operations: [
            {
              type: "insert_row",
              target: { insertAfterRow: 2 },
              values: { cells: [{ column: "B", value: "Wastage" }] },
              formulas: { cells: [] },
              rationale: "Add a wastage row.",
            },
          ],
        },
        {
          id: "group-2",
          title: "Add labour row",
          purpose: "Insert a labour row.",
          confidence: "medium",
          assumptions: [],
          warnings: [],
          relatedFindingIds: [],
          operations: [
            {
              type: "insert_row",
              target: { insertAfterRow: 3 },
              values: { cells: [{ column: "B", value: "Labour" }] },
              formulas: { cells: [] },
              rationale: "Add a labour row.",
            },
          ],
        },
      ],
    });

    const selected = buildPricingWorksheetAiSuggestedEditSelectionResponse(reviewResponse, ["group-1"]);
    const result = simulatePricingWorksheetAiEditPlan(buildBaseWorksheet(), selected);

    expect(result.validationIssues).toEqual([]);
    expect(getCell(result.worksheet, "B3")?.value).toBe("Wastage");
    expect(findRowByCellValue(result.worksheet, "B", "Labour")).toBeNull();
  });

  it("normalizes evidence sources safely and deduplicates duplicate URLs", () => {
    const response = normalizePricingWorksheetAiAssistantResponse({
      mode: "answer_only",
      proposalName: "Review",
      answer: "Review complete.",
      summary: "Source-backed review.",
      confidence: "medium",
      operations: [],
      assumptions: [],
      warnings: [],
      evidenceSources: [
        {
          id: "source-1",
          title: "Rondo key-lock technical manual",
          url: "https://www.rondo.com.au/key-lock-guide",
          sourceType: "manufacturer",
          confidence: "high",
          supportedClaims: ["Explains the ceiling grid system."],
        },
        {
          id: "source-2",
          title: "Rondo guide duplicate",
          url: "https://www.rondo.com.au/key-lock-guide",
          sourceType: "web",
          confidence: "medium",
          supportedClaims: ["Duplicate should dedupe."],
        },
      ],
    });

    expect(response.evidenceSources).toHaveLength(1);
    expect(response.evidenceSources?.[0]?.url).toBe("https://www.rondo.com.au/key-lock-guide");
    expect(response.evidenceSources?.[0]?.supportedClaims).toContain("Explains the ceiling grid system.");
  });

  it("removes invalid evidence source ids from findings", () => {
    const response = normalizePricingWorksheetAiAssistantResponse({
      mode: "answer_only",
      proposalName: "Review",
      answer: "Review complete.",
      summary: "One issue.",
      confidence: "medium",
      operations: [],
      assumptions: [],
      warnings: [],
      evidenceSources: [
        {
          id: "source-1",
          title: "NZBC guidance",
          url: "https://example.nz/guide",
          sourceType: "standard_or_code",
          confidence: "high",
        },
      ],
      reviewFindings: [
        {
          id: "finding-1",
          category: "specification_uncertainty",
          severity: "medium",
          confidence: "medium",
          title: "Potential acoustic requirement",
          finding: "May require acoustic sealant.",
          evidenceSourceIds: ["source-1", "missing-source"],
        },
      ],
    });

    expect(response.reviewFindings?.[0]?.evidenceSourceIds).toEqual(["source-1"]);
  });
});

describe("bounded worksheet generation validation", () => {
  it("allows bounded starter worksheet generation on a blank sheet without changed-cell rejection", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Blank worksheet",
      rowCount: 8,
      columnCount: 6,
    });

    const operations: PricingWorksheetAiAssistantResponse["operations"] = [];
    for (let rowNumber = 1; rowNumber <= 12; rowNumber += 1) {
      operations.push({
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
        formulas: rowNumber <= 4
          ? { cells: [] }
          : {
              cells: [
                {
                  column: "C",
                  formula: rowNumber <= 9 ? "=IFERROR(C2*1.0,\"\")" : "=IFERROR(C2*0.18,\"\")",
                },
                {
                  column: "F",
                  formula: "=IFERROR(C" + rowNumber + "*E" + rowNumber + ",\"\")",
                },
              ],
            },
        rationale: "Bounded worksheet generation row.",
      });
    }

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Steel stud calculator",
      answer: "Created a starter calculator.",
      summary: "Adds material and labour inputs with formulas.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations,
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.some((issue) => issue.code === "too_many_cells_changed")).toBe(false);
    expect(result.validationIssues).toEqual([]);
    expect(result.diffSummary.changedCells.length).toBeGreaterThan(60);
    expect(result.diffSummary.insertedRows.length).toBe(12);
  });

  it("still blocks large uncontrolled rewrites on non-minimal worksheets", () => {
    const worksheet = buildBaseWorksheet();
    const operations = new Array(20).fill(null).map((_, index) => ({
      type: "update_cell" as const,
      target: { cell: `A${(index % 4) + 2}` },
      values: {
        cells: [{ ref: `A${(index % 4) + 2}`, value: `Rewrite ${index}` }],
      },
      formulas: { cells: [] },
      rationale: "Bulk rewrite.",
    }));

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Rewrite worksheet",
      answer: "",
      summary: "Rewrite many cells.",
      confidence: "low",
      assumptions: [],
      warnings: [],
      operations,
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.some((issue) => issue.code === "too_many_operations")).toBe(true);
  });

  it("splits large starter worksheet generation into validator-safe preview batches", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Blank worksheet",
      rowCount: 20,
      columnCount: 12,
    });

    const operations: PricingWorksheetAiAssistantResponse["operations"] = [];
    for (let rowNumber = 1; rowNumber <= 37; rowNumber += 1) {
      operations.push({
        type: "insert_row",
        target: { insertBeforeRow: rowNumber },
        values: {
          cells: [
            { column: "A", value: rowNumber === 1 ? "Inputs" : rowNumber <= 12 ? `Input ${rowNumber}` : `Line ${rowNumber}` },
            { column: "B", value: `Row ${rowNumber}` },
            { column: "D", value: rowNumber <= 12 ? "m2" : "ea" },
            { column: "F", value: rowNumber <= 12 ? null : 12.5 },
            { column: "K", value: rowNumber <= 12 ? "editable input row" : "quantity times rate" },
          ],
        },
        formulas: { cells: [] },
        rationale: "Large staged worksheet generation row.",
      });
    }

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Large calculator",
      answer: "Created a large calculator.",
      summary: "Creates a large estimator worksheet.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations,
      suggestedEditGroups: [],
    };

    const batched = batchPricingWorksheetAiOperationsForSafePreview({
      worksheet,
      response,
    });

    expect(batched.ok).toBe(true);
    if (!batched.ok) {
      throw new Error(batched.issue?.message ?? "Expected batching to succeed.");
    }

    expect(batched.batches.length).toBeGreaterThan(1);
    let workingWorksheet = worksheet;
    for (const batch of batched.batches) {
      const simulation = simulatePricingWorksheetAiEditPlan(workingWorksheet, {
        ...response,
        operations: batch.operations,
        suggestedEditGroups: [],
      });
      expect(simulation.validationIssues).toEqual([]);
      workingWorksheet = simulation.worksheet;
    }
  });

  it("allows a large formula-only batch when validation and simulation succeed", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Formula Batch",
      rowCount: 20,
      columnCount: 12,
    });

    for (let row = 2; row <= 15; row += 1) {
      setCell(worksheet, `E${row}`, { value: row });
      setCell(worksheet, `F${row}`, { value: 2 });
      setCell(worksheet, `J${row}`, { value: null });
    }

    const operations = new Array(14).fill(null).map((_, index) => {
      const row = index + 2;
      return {
        type: "fix_formula" as const,
        target: { cell: `J${row}`, row },
        values: { cells: [] },
        formulas: {
          cells: [{ ref: `J${row}`, formula: `=E${row}*F${row}` }],
        },
        rationale: "Apply total formula.",
      };
    });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Add formulas",
      answer: "",
      summary: "Apply formulas to visible rows.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations,
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(result.diffSummary.formulaCells.length).toBe(14);
  });

  it("still blocks a large formula-only batch when formula validation fails", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Formula Errors",
      rowCount: 20,
      columnCount: 12,
    });

    for (let row = 2; row <= 15; row += 1) {
      setCell(worksheet, `E${row}`, { value: row });
      setCell(worksheet, `F${row}`, { value: 2 });
    }

    const operations = new Array(14).fill(null).map((_, index) => {
      const row = index + 2;
      return {
        type: "fix_formula" as const,
        target: { cell: `J${row}`, row },
        values: { cells: [] },
        formulas: {
          cells: [{ ref: `J${row}`, formula: `=BADFUNC(E${row},F${row})` }],
        },
        rationale: "Apply broken formula.",
      };
    });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Broken formulas",
      answer: "",
      summary: "Apply formulas to visible rows.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations,
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.some((issue) => issue.code === "formula_unsupported_function")).toBe(true);
  });

  it("allows a large formatting-only batch when all refs are valid", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Formatting Batch",
      rowCount: 20,
      columnCount: 12,
    });

    const operations = new Array(14).fill(null).map((_, index) => {
      const row = index + 2;
      return {
        type: "format_cell" as const,
        target: { cell: `E${row}` },
        values: { cells: [] },
        formulas: { cells: [] },
        format: {
          backgroundColor: "blue",
          bold: true,
        },
        rationale: "Highlight estimator inputs.",
      };
    });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Highlight inputs",
      answer: "",
      summary: "Format input cells.",
      confidence: "medium",
      assumptions: [],
      warnings: [],
      operations,
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues).toEqual([]);
    expect(result.diffSummary.formattingCells.length).toBe(14);
  });

  it("still blocks a mixed batch with many value edits even when formula count is high", () => {
    const worksheet = buildBaseWorksheet();
    const operations = new Array(14).fill(null).map((_, index) => {
      const row = (index % 4) + 2;
      if (index < 7) {
        return {
          type: "update_cell" as const,
          target: { cell: `B${row}`, row },
          values: {
            cells: [{ ref: `B${row}`, value: `Rewrite ${index}` }],
          },
          formulas: { cells: [] },
          rationale: "Bulk value rewrite.",
        };
      }

      return {
        type: "fix_formula" as const,
        target: { cell: `E${row}`, row },
        values: { cells: [] },
        formulas: {
          cells: [{ ref: `E${row}`, formula: `=C${row}*D${row}` }],
        },
        rationale: "Bulk formula rewrite.",
      };
    });

    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Mixed rewrite",
      answer: "",
      summary: "Bulk rewrite values and formulas.",
      confidence: "low",
      assumptions: [],
      warnings: [],
      operations,
    };

    const result = simulatePricingWorksheetAiEditPlan(worksheet, response);

    expect(result.validationIssues.some((issue) => issue.code === "too_many_operations")).toBe(true);
  });
});

describe("buildPricingWorksheetAiAssistantSchema", () => {
  it("ensures every schema object with properties declares required keys for all properties", () => {
    const schema = buildPricingWorksheetAiAssistantSchema();
    const failures: string[] = [];

    walkStrictSchemaObjects(schema, (node, path) => {
      const properties = node.properties as Record<string, unknown>;
      const propertyKeys = Object.keys(properties);
      const required = Array.isArray(node.required) ? node.required : null;

      if (!required) {
        failures.push(`${path.join(".") || "root"} is missing required[]`);
        return;
      }

      const missingKeys = propertyKeys.filter((key) => !required.includes(key));
      if (missingKeys.length > 0) {
        failures.push(`${path.join(".") || "root"} missing required keys: ${missingKeys.join(", ")}`);
      }
    });

    expect(failures).toEqual([]);
  });

  it("includes all review finding properties in required[] for strict provider schemas", () => {
    const schema = buildPricingWorksheetAiAssistantSchema() as {
      properties?: {
        reviewFindings?: {
          items?: {
            required?: string[];
          };
        };
      };
    };

    expect(schema.properties?.reviewFindings?.items?.required).toEqual(
      expect.arrayContaining([
        "findingStatus",
        "revisionReason",
        "revisedFromFindingId",
        "supersededByFindingId",
        "evidenceSourceIds",
      ]),
    );
  });
});
