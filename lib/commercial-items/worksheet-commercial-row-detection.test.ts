import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { detectPublishedWorksheetRows } from "@/lib/commercial-items/worksheet-commercial-row-detection";

function setCell(worksheet: WorksheetData, columnIndex: number, rowIndex: number, value: string | number) {
  const column = worksheet.columns[columnIndex];
  const row = worksheet.rows[rowIndex];

  worksheet.cells[`${column.id}${row.id}`] = {
    value,
    type: typeof value === "number" ? "number" : "text",
    formula: null,
    computedValue: value,
    displayValue: String(value),
    metadata: {},
  };
}

function createCommercialWorksheet() {
  const worksheet = createDefaultWorksheetData({ rowCount: 12, columnCount: 5 });
  worksheet.columns[0]!.label = "Description";
  worksheet.columns[1]!.label = "Qty";
  worksheet.columns[2]!.label = "Unit";
  worksheet.columns[3]!.label = "Rate";
  worksheet.columns[4]!.label = "Total";

  setCell(worksheet, 0, 0, "Description");
  setCell(worksheet, 1, 0, "Qty");
  setCell(worksheet, 2, 0, "Unit");
  setCell(worksheet, 3, 0, "Rate");
  setCell(worksheet, 4, 0, "Total");

  return worksheet;
}

describe("worksheet commercial row detection", () => {
  it("detects a valid commercial row from a single-cell inferred row selection", () => {
    const worksheet = createCommercialWorksheet();
    setCell(worksheet, 0, 1, "Stud framing");
    setCell(worksheet, 1, 1, 10);
    setCell(worksheet, 2, 1, "lm");
    setCell(worksheet, 3, 1, 32.5);
    setCell(worksheet, 4, 1, 325);

    const result = detectPublishedWorksheetRows({
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 3,
        endColumnIndex: 3,
      },
    });

    expect(result.commercialRows).toHaveLength(1);
    expect(result.commercialRows[0]).toMatchObject({
      description: "Stud framing",
      quantity: 10,
      unit: "lm",
      rate: 32.5,
      total: 325,
    });
  });

  it("produces one published row per valid worksheet row in a multi-row selection", () => {
    const worksheet = createCommercialWorksheet();
    setCell(worksheet, 0, 1, "Stud framing");
    setCell(worksheet, 1, 1, 10);
    setCell(worksheet, 3, 1, 32.5);
    setCell(worksheet, 4, 1, 325);
    setCell(worksheet, 0, 2, "Ceiling grid");
    setCell(worksheet, 1, 2, 25);
    setCell(worksheet, 3, 2, 42);
    setCell(worksheet, 4, 2, 1050);

    const result = detectPublishedWorksheetRows({
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: 4,
      },
    });

    expect(result.commercialRows).toHaveLength(2);
    expect(result.skippedRows).toHaveLength(0);
  });

  it("skips headings, blank rows, subtotal rows, GST rows, grand total rows, and divider rows", () => {
    const worksheet = createCommercialWorksheet();
    setCell(worksheet, 0, 1, "Wall linings");
    setCell(worksheet, 0, 2, "");
    setCell(worksheet, 0, 3, "Subtotal");
    setCell(worksheet, 4, 3, 325);
    setCell(worksheet, 0, 4, "GST");
    setCell(worksheet, 4, 4, 48.75);
    setCell(worksheet, 0, 5, "Grand Total");
    setCell(worksheet, 4, 5, 373.75);
    setCell(worksheet, 0, 6, "------");

    const result = detectPublishedWorksheetRows({
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 6,
        startColumnIndex: 0,
        endColumnIndex: 4,
      },
    });

    expect(result.commercialRows).toHaveLength(0);
    expect(result.skippedRows.map((row) => row.reason)).toEqual([
      "missing_commercial_value",
      "blank_row",
      "subtotal_row",
      "tax_row",
      "grand_total_row",
      "divider_row",
    ]);
  });
});
