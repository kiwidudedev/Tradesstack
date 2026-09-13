import { describe, expect, it } from "vitest";
import { createCsvSourceParts, parseCsvMatrix } from "@/lib/document-intelligence/sources/delimited-text";

describe("neutral CSV transport", () => {
  it("preserves quoted commas, escaped quotes, multiline cells, and coordinates", () => {
    const rows = parseCsvMatrix('SKU,Description,Price\r\nA1,"Board, white",12.5\r\nA2,"Two\nlines","10"" special"');
    expect(rows).toEqual([
      ["SKU", "Description", "Price"],
      ["A1", "Board, white", "12.5"],
      ["A2", "Two\nlines", '10" special'],
    ]);
    const parts = createCsvSourceParts({ fileName: "prices.csv", bytes: new TextEncoder().encode('A,"B,C"') });
    expect(parts[0]?.content).toContain('A="A"');
    expect(parts[0]?.content).toContain('B="B,C"');
  });
});


describe("CSV resource limits", () => {
  it("rejects excessive rows and columns before constructing an unbounded matrix", () => {
    expect(() => parseCsvMatrix("a\n".repeat(20001))).toThrow(/limits/);
    expect(() => parseCsvMatrix("a,".repeat(300))).toThrow(/limits/);
  });
});
