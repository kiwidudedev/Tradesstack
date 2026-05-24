import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import {
  applyBordersToRange,
  applyFormattingToRange,
  type WorksheetCellFormat,
} from "./opportunity-pricing-worksheet-formatting";
import { buildWorksheetCellKey } from "./opportunity-pricing-worksheet-paste";

function buildWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Formatting Test",
    rowCount: 4,
    columnCount: 4,
  });

  worksheet.cells[buildWorksheetCellKey("A", "1")] = {
    value: 1234,
    type: "number",
    formula: null,
    computedValue: 1234,
    displayValue: "1234",
    metadata: {
      format: {
        number: {
          kind: "number",
        },
      },
    },
  };

  worksheet.cells[buildWorksheetCellKey("B", "1")] = {
    value: 99,
    type: "number",
    formula: null,
    computedValue: 99,
    displayValue: "99",
    metadata: {},
  };

  return worksheet;
}

const a1Range = {
  startRowIndex: 0,
  endRowIndex: 0,
  startColumnIndex: 0,
  endColumnIndex: 0,
} as const;

const b1Range = {
  startRowIndex: 0,
  endRowIndex: 0,
  startColumnIndex: 1,
  endColumnIndex: 1,
} as const;

function buildExplicitNumberFormatPatch(format: WorksheetCellFormat): WorksheetCellFormat {
  const currentNumberFormat = format.number ?? {};
  return {
    ...format,
    number: {
      ...currentNumberFormat,
      kind: "number",
      decimalPlaces:
        typeof currentNumberFormat.decimalPlaces === "number"
          ? currentNumberFormat.decimalPlaces
          : 2,
      negativeStyle: currentNumberFormat.negativeStyle ?? "minus",
      useGrouping: currentNumberFormat.useGrouping ?? true,
    },
  };
}

describe("worksheet formatting helpers", () => {
  it("treats reapplying the same number format as a no-op", () => {
    const worksheet = buildWorksheet();

    const result = applyFormattingToRange(worksheet, a1Range, (format) =>
      buildExplicitNumberFormatPatch(format)
    );

    expect(result).toBe(worksheet);
  });

  it("treats border clear on an unbordered cell as a no-op", () => {
    const worksheet = buildWorksheet();

    const result = applyBordersToRange(worksheet, b1Range, "clear");

    expect(result).toBe(worksheet);
  });

  it("still reports a real number format change", () => {
    const worksheet = buildWorksheet();

    const result = applyFormattingToRange(worksheet, a1Range, {
      number: {
        kind: "currency",
        decimalPlaces: 2,
        negativeStyle: "minus",
        currencyCode: "NZD",
        useGrouping: true,
      },
    });

    expect(result).not.toBe(worksheet);
    expect(result.cells[buildWorksheetCellKey("A", "1")]?.metadata?.format).toEqual({
      number: {
        kind: "currency",
      },
    });
  });
});
