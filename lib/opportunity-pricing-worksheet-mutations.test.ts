import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetData } from "./opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";
import { applyWorksheetMutation } from "./opportunity-pricing-worksheet-mutations";
import { recalculateWorksheetFormulas } from "./opportunity-pricing-worksheet-formulas";
import { simulatePricingWorksheetAiEditPlan, type PricingWorksheetAiAssistantResponse } from "./pricing-worksheet-edit-plan";
import { applyFormattingToRange } from "./opportunity-pricing-worksheet-formatting";

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

function buildWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Stability Test",
    rowCount: 8,
    columnCount: 6,
  });

  setCell(worksheet, "A1", { value: "Item" });
  setCell(worksheet, "B1", { value: "Qty" });
  setCell(worksheet, "C1", { value: "Rate" });
  setCell(worksheet, "D1", { value: "Total" });
  setCell(worksheet, "B2", { value: 10 });
  setCell(worksheet, "C2", { value: 2 });
  setCell(worksheet, "D2", { formula: "=B2*C2" });
  setCell(worksheet, "D3", { formula: "=SUM(D2:D2)" });

  return worksheet;
}

describe("applyWorksheetMutation", () => {
  it("preserves the input snapshot while cloning only the mutable draft", () => {
    const worksheet = buildWorksheet();
    const originalSnapshot = JSON.stringify(worksheet);

    const result = applyWorksheetMutation(worksheet, (current) => {
      setCell(current, "B2", { value: 99 });
      return current;
    });

    expect(JSON.stringify(worksheet)).toBe(originalSnapshot);
    expect(result.previousWorksheet).toBe(worksheet);
    expect(getCell(result.nextWorksheet, "B2")?.value).toBe(99);
  });

  it("recalculates formulas when enabled", () => {
    const worksheet = buildWorksheet();

    const result = applyWorksheetMutation(worksheet, (current) => {
      setCell(current, "B2", { value: 12 });
      return current;
    });

    expect(result.validation.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(getCell(result.nextWorksheet, "D2")?.displayValue).toBe("24");
    expect(getCell(result.nextWorksheet, "D3")?.displayValue).toBe("24");
  });

  it("skips recalculation when disabled", () => {
    const worksheet = buildWorksheet();

    const result = applyWorksheetMutation(
      worksheet,
      (current) => {
        setCell(current, "B2", { value: 12 });
        return current;
      },
      { recalculateFormulas: false },
    );

    expect(result.validation.ok).toBe(true);
    expect(getCell(result.nextWorksheet, "D2")?.displayValue).toBe("=B2*C2");
  });

  it("detects invalid formula outputs when validation is enabled", () => {
    const worksheet = buildWorksheet();

    const result = applyWorksheetMutation(
      worksheet,
      (current) => {
        setCell(current, "D2", { formula: "=B2/0" });
        return current;
      },
      { validateFormulaOutputs: true },
    );

    expect(result.validation.ok).toBe(false);
    expect(result.formulaErrors).toContainEqual({
      cellKey: "D2",
      error: "#DIV/0!",
    });
  });

  it("reports no change for no-op mutations", () => {
    const worksheet = recalculateWorksheetFormulas(buildWorksheet());

    const result = applyWorksheetMutation(worksheet, (current) => current);

    expect(result.validation.ok).toBe(true);
    expect(result.changed).toBe(false);
  });

  it("reports no change for no-op formatting mutations", () => {
    const worksheet = recalculateWorksheetFormulas(buildWorksheet());

    const result = applyWorksheetMutation(
      worksheet,
      (current) =>
        applyFormattingToRange(
          current,
          {
            startRowIndex: 1,
            endRowIndex: 1,
            startColumnIndex: 1,
            endColumnIndex: 1,
          },
          {}
        ),
      { recalculateFormulas: false }
    );

    expect(result.validation.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.nextWorksheet).toEqual(worksheet);
  });

  it("reports no change for equivalent number-format mutations", () => {
    const worksheet = recalculateWorksheetFormulas(buildWorksheet());
    worksheet.cells.A1 = {
      ...worksheet.cells.A1,
      metadata: {
        format: {
          number: {
            kind: "number",
          },
        },
      },
    };

    const result = applyWorksheetMutation(
      worksheet,
      (current) =>
        applyFormattingToRange(
          current,
          {
            startRowIndex: 0,
            endRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: 0,
          },
          (format) => ({
            ...format,
            number: {
              ...(format.number ?? {}),
              kind: "number",
              decimalPlaces:
                typeof format.number?.decimalPlaces === "number"
                  ? format.number.decimalPlaces
                  : 2,
              negativeStyle: format.number?.negativeStyle ?? "minus",
              useGrouping: format.number?.useGrouping ?? true,
            },
          })
        ),
      { recalculateFormulas: false }
    );

    expect(result.validation.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.nextWorksheet).toEqual(worksheet);
  });

  it("supports AI-applied snapshot mutations through the same flow", () => {
    const worksheet = buildWorksheet();
    const response: PricingWorksheetAiAssistantResponse = {
      mode: "propose_edit",
      proposalName: "Insert row",
      answer: "",
      summary: "Insert row and subtotal shift.",
      confidence: "high",
      assumptions: [],
      warnings: [],
      operations: [
        {
          type: "insert_row",
          target: {
            insertAfterRow: 2,
          },
          values: {
            cells: [
              { column: "A", value: "AI Row" },
              { column: "B", value: 3 },
            ],
          },
          formulas: {
            cells: [{ column: "D", formula: "=B3*5" }],
          },
          rationale: "Add AI row.",
        },
      ],
    };

    const simulated = simulatePricingWorksheetAiEditPlan(worksheet, response);
    const result = applyWorksheetMutation(
      worksheet,
      () => simulated.worksheet,
      { validateFormulaOutputs: true },
    );

    expect(simulated.validationIssues).toEqual([]);
    expect(result.validation.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(getCell(result.nextWorksheet, "A3")?.value).toBe("AI Row");
    expect(getCell(result.nextWorksheet, "D3")?.displayValue).toBe("15");
  });
});
