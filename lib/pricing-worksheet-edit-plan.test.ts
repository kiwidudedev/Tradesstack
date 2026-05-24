import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";
import {
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

  it("allows absolute-reference formulas with $ anchors", () => {
    const worksheet = buildBaseWorksheet();
    setCell(worksheet, "C2", { value: 4, type: "number" });
    setCell(worksheet, "D2", { value: 5, type: "number" });

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

  it("flags formulas that recalculate to runtime errors during AI preview simulation", () => {
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

    expect(getCell(result.worksheet, "E2")?.displayValue).toBe("#DIV/0!");
    expect(result.validationIssues).toContainEqual({
      code: "formula_recalc_error",
      message: "Generated formula at E2 recalculated to #DIV/0!.",
      severity: "error",
    });
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
