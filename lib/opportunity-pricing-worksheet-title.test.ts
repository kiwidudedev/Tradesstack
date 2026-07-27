import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { resolveWorksheetPersistenceName } from "@/lib/opportunity-pricing-worksheet-title";

describe("resolveWorksheetPersistenceName", () => {
  it("prefers the live worksheet sheet name over stale local state", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Renamed Worksheet",
    });

    expect(
      resolveWorksheetPersistenceName({
        worksheet,
        worksheetName: "New Worksheet",
      }),
    ).toBe("Renamed Worksheet");
  });

  it("falls back to the local state name when the worksheet snapshot has no title", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Pricing Worksheet",
    });
    worksheet.sheetName = "   ";

    expect(
      resolveWorksheetPersistenceName({
        worksheet,
        worksheetName: "State Title",
      }),
    ).toBe("State Title");
  });
});
