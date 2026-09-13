import { describe, expect, it } from "vitest";

import { parseWorksheetClipboardText } from "./opportunity-pricing-worksheet-paste";

describe("parseWorksheetClipboardText", () => {
  it("treats newline-only clipboard content as a multi-row paste", () => {
    expect(parseWorksheetClipboardText("Labour\nMaterials")).toMatchObject({
      isTabular: true,
      rowCount: 2,
      columnCount: 1,
      rows: [["Labour"], ["Materials"]],
    });
  });

  it("keeps a single clipboard value as a scalar paste", () => {
    expect(parseWorksheetClipboardText("Labour")).toMatchObject({
      isTabular: false,
      rowCount: 1,
      columnCount: 1,
    });
  });
});
