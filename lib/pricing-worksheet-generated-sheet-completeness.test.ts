import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetCell, type WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import { validateGeneratedPricingWorksheetCompleteness } from "@/lib/pricing-worksheet-generated-sheet-completeness";

function setCell(worksheet: WorksheetData, ref: string, partial: Partial<WorksheetCell>) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) {
    throw new Error(`Invalid ref ${ref}`);
  }

  const column = worksheet.columns.find((entry) => entry.id === match[1]);
  const row = worksheet.rows.find((entry) => entry.id === match[2]);
  if (!column || !row) {
    throw new Error(`Missing worksheet position for ${ref}`);
  }

  worksheet.cells[buildWorksheetCellKey(column.id, row.id)] = {
    value: null,
    type: "empty",
    formula: null,
    computedValue: null,
    displayValue: "",
    metadata: {},
    ...partial,
  };
}

function buildGeneratedPricingWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Generated Pricing Sheet",
    rowCount: 20,
    columnCount: 20,
  });

  setCell(worksheet, "J3", { value: "Quantity", type: "text", computedValue: "Quantity", displayValue: "Quantity" });
  setCell(worksheet, "M3", { value: "Labour", type: "text", computedValue: "Labour", displayValue: "Labour" });
  setCell(worksheet, "N3", { value: "Mat. Rate", type: "text", computedValue: "Mat. Rate", displayValue: "Mat. Rate" });
  setCell(worksheet, "O3", { value: "Material", type: "text", computedValue: "Material", displayValue: "Material" });
  setCell(worksheet, "Q3", { value: "Total $", type: "text", computedValue: "Total $", displayValue: "Total $" });
  setCell(worksheet, "B9", { value: "Track and stud", type: "text", computedValue: "Track and stud", displayValue: "Track and stud" });

  return worksheet;
}

describe("validateGeneratedPricingWorksheetCompleteness", () => {
  it("accepts calculator-ready generated pricing rows with numeric rates and formulas", () => {
    const worksheet = buildGeneratedPricingWorksheet();
    setCell(worksheet, "J9", { value: 51.75, type: "number", computedValue: 51.75, displayValue: "51.75" });
    setCell(worksheet, "M9", { value: "=12", type: "text", formula: "=12", computedValue: 12, displayValue: "12" });
    setCell(worksheet, "N9", {
      value: 5.78,
      type: "number",
      computedValue: 5.78,
      displayValue: "$5.78",
      metadata: {
        format: {
          number: {
            kind: "currency",
            decimalPlaces: 2,
            useGrouping: true,
          },
        },
      },
    });
    setCell(worksheet, "O9", { value: "=J9*N9", type: "text", formula: "=J9*N9", computedValue: 299.115, displayValue: "$299.12" });
    setCell(worksheet, "Q9", { value: "=O9+M9", type: "text", formula: "=O9+M9", computedValue: 311.115, displayValue: "$311.12" });

    expect(validateGeneratedPricingWorksheetCompleteness(worksheet)).toEqual([]);
  });

  it("rejects placeholders, decorated rate literals, and literal output cells", () => {
    const worksheet = buildGeneratedPricingWorksheet();
    setCell(worksheet, "J9", { value: "-", type: "text", computedValue: "-", displayValue: "-" });
    setCell(worksheet, "N9", { value: "$5.78", type: "text", computedValue: "$5.78", displayValue: "$5.78" });
    setCell(worksheet, "O9", { value: "$0", type: "text", computedValue: "$0", displayValue: "$0" });
    setCell(worksheet, "Q9", { value: "$0", type: "text", computedValue: "$0", displayValue: "$0" });

    const issues = validateGeneratedPricingWorksheetCompleteness(worksheet);

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "generated_pricing_placeholder_input",
        "generated_pricing_decorated_rate_literal",
        "generated_pricing_output_requires_formula",
      ]),
    );
  });

  it("does not require output formulas on input-only setup rows", () => {
    const worksheet = buildGeneratedPricingWorksheet();
    setCell(worksheet, "A4", { value: "Inputs", type: "text", computedValue: "Inputs", displayValue: "Inputs" });
    setCell(worksheet, "B4", { value: "Wall Length (LM)", type: "text", computedValue: "Wall Length (LM)", displayValue: "Wall Length (LM)" });
    setCell(worksheet, "C4", {
      value: "Total lineal metres of walls to be lined",
      type: "text",
      computedValue: "Total lineal metres of walls to be lined",
      displayValue: "Total lineal metres of walls to be lined",
    });
    setCell(worksheet, "D4", { value: "LM", type: "text", computedValue: "LM", displayValue: "LM" });
    setCell(worksheet, "J4", { value: 24, type: "number", computedValue: 24, displayValue: "24" });

    expect(validateGeneratedPricingWorksheetCompleteness(worksheet)).toEqual([]);
  });

  it("does not require output formulas on saved rate rows without quantity outputs", () => {
    const worksheet = buildGeneratedPricingWorksheet();
    setCell(worksheet, "A12", { value: "Material", type: "text", computedValue: "Material", displayValue: "Material" });
    setCell(worksheet, "B12", { value: "Plasterboard Rate", type: "text", computedValue: "Plasterboard Rate", displayValue: "Plasterboard Rate" });
    setCell(worksheet, "C12", {
      value: "$/M2 supplied - edit to suit",
      type: "text",
      computedValue: "$/M2 supplied - edit to suit",
      displayValue: "$/M2 supplied - edit to suit",
    });
    setCell(worksheet, "D12", { value: "$/M2", type: "text", computedValue: "$/M2", displayValue: "$/M2" });
    setCell(worksheet, "N12", {
      value: 18,
      type: "number",
      computedValue: 18,
      displayValue: "$18.00",
      metadata: {
        format: {
          number: {
            kind: "currency",
            decimalPlaces: 2,
            useGrouping: true,
          },
        },
      },
    });

    expect(validateGeneratedPricingWorksheetCompleteness(worksheet)).toEqual([]);
  });

  it("accepts multi-section generated worksheets with setup rows and later priced outputs", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Plasterboard Wall Linings",
      rowCount: 24,
      columnCount: 12,
    });

    setCell(worksheet, "A1", { value: "Section", type: "text", computedValue: "Section", displayValue: "Section" });
    setCell(worksheet, "B1", { value: "Item", type: "text", computedValue: "Item", displayValue: "Item" });
    setCell(worksheet, "C1", { value: "Description", type: "text", computedValue: "Description", displayValue: "Description" });
    setCell(worksheet, "D1", { value: "Unit", type: "text", computedValue: "Unit", displayValue: "Unit" });
    setCell(worksheet, "E1", { value: "Quantity", type: "text", computedValue: "Quantity", displayValue: "Quantity" });
    setCell(worksheet, "F1", { value: "Material Rate", type: "text", computedValue: "Material Rate", displayValue: "Material Rate" });
    setCell(worksheet, "H1", { value: "Labour Rate", type: "text", computedValue: "Labour Rate", displayValue: "Labour Rate" });
    setCell(worksheet, "J1", { value: "Total", type: "text", computedValue: "Total", displayValue: "Total" });

    setCell(worksheet, "A5", { value: "Inputs", type: "text", computedValue: "Inputs", displayValue: "Inputs" });
    setCell(worksheet, "B5", { value: "Board Rate", type: "text", computedValue: "Board Rate", displayValue: "Board Rate" });
    setCell(worksheet, "C5", { value: "Supply cost per M2", type: "text", computedValue: "Supply cost per M2", displayValue: "Supply cost per M2" });
    setCell(worksheet, "F5", {
      value: 18.5,
      type: "number",
      computedValue: 18.5,
      displayValue: "$18.50",
      metadata: {
        format: {
          number: {
            kind: "currency",
            decimalPlaces: 2,
            useGrouping: true,
          },
        },
      },
    });
    setCell(worksheet, "B6", { value: "Fix Labour Rate", type: "text", computedValue: "Fix Labour Rate", displayValue: "Fix Labour Rate" });
    setCell(worksheet, "C6", {
      value: "Fix & set labour rate per M2",
      type: "text",
      computedValue: "Fix & set labour rate per M2",
      displayValue: "Fix & set labour rate per M2",
    });
    setCell(worksheet, "H6", {
      value: 28,
      type: "number",
      computedValue: 28,
      displayValue: "$28.00",
      metadata: {
        format: {
          number: {
            kind: "currency",
            decimalPlaces: 2,
            useGrouping: true,
          },
        },
      },
    });

    setCell(worksheet, "A9", { value: "Wall Zone Quantities", type: "text", computedValue: "Wall Zone Quantities", displayValue: "Wall Zone Quantities" });
    setCell(worksheet, "B9", { value: "Zone 1 – Net M2", type: "text", computedValue: "Zone 1 – Net M2", displayValue: "Zone 1 – Net M2" });
    setCell(worksheet, "C9", { value: "LM × ceiling height", type: "text", computedValue: "LM × ceiling height", displayValue: "LM × ceiling height" });
    setCell(worksheet, "D9", { value: "m²", type: "text", computedValue: "m²", displayValue: "m²" });
    setCell(worksheet, "E9", { value: "=IF(E8=\"\",\"\",E8*E3)", type: "text", formula: "=IF(E8=\"\",\"\",E8*E3)", computedValue: "", displayValue: "" });
    setCell(worksheet, "K9", {
      value: "zone LM × ceiling height input",
      type: "text",
      computedValue: "zone LM × ceiling height input",
      displayValue: "zone LM × ceiling height input",
    });

    setCell(worksheet, "A17", { value: "Material & Labour", type: "text", computedValue: "Material & Labour", displayValue: "Material & Labour" });
    setCell(worksheet, "B17", { value: "Material Cost", type: "text", computedValue: "Material Cost", displayValue: "Material Cost" });
    setCell(worksheet, "C17", { value: "Material M2 × board rate", type: "text", computedValue: "Material M2 × board rate", displayValue: "Material M2 × board rate" });
    setCell(worksheet, "D17", { value: "$", type: "text", computedValue: "$", displayValue: "$" });
    setCell(worksheet, "E17", { value: "=ROUND(E16*E5,2)", type: "text", formula: "=ROUND(E16*E5,2)", computedValue: 0, displayValue: "0" });
    setCell(worksheet, "J17", {
      value: "=E17",
      type: "text",
      formula: "=E17",
      computedValue: 0,
      displayValue: "0",
      metadata: {
        format: {
          number: {
            kind: "currency",
            decimalPlaces: 2,
            useGrouping: true,
          },
        },
      },
    });

    expect(validateGeneratedPricingWorksheetCompleteness(worksheet)).toEqual([]);
  });
});
