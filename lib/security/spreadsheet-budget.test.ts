import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { assertSpreadsheetArchiveBudget, assertWorksheetBudget } from "./spreadsheet-budget";
describe("spreadsheet resource budgets", () => {
  it("accepts an ordinary workbook and rejects expansion beyond budget", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Prices").addRow(["Material", "Cost", "x".repeat(20000)]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    expect(() => assertSpreadsheetArchiveBudget(bytes)).not.toThrow();
    expect(() => assertSpreadsheetArchiveBudget(bytes, 1000)).toThrow(/limits/);
    expect(() => assertSpreadsheetArchiveBudget(bytes.subarray(0, bytes.length - 4))).toThrow(/limits/);
  });
  it("rejects malformed archives", () => {
    expect(() => assertSpreadsheetArchiveBudget(new Uint8Array(100))).toThrow(/invalid/);
  });
  it("bounds sparse dimensions and aggregate cells", () => {
    expect(() => assertWorksheetBudget([{ rowCount: 1000000, columnCount: 1 }])).toThrow();
    expect(() => assertWorksheetBudget([{ rowCount: 20000, columnCount: 20 }, { rowCount: 20000, columnCount: 20 }])).toThrow();
    expect(() => assertWorksheetBudget([{ rowCount: 100, columnCount: 10 }])).not.toThrow();
  });
});
