import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractMaterialImportRows } from "@/lib/materials/extraction";

describe("material import extraction", () => {
  it("extracts candidate rows from csv price lists", async () => {
    const csv = [
      "Material,Unit,Unit Cost,Supplier Description",
      "100 x 50 H1.2 SG8 Timber,lm,4.05,Framing timber",
      "13mm GIB Standard,sheet,22.5,Wall lining board",
    ].join("\n");

    const result = await extractMaterialImportRows({
      fileName: "prices.csv",
      mimeType: "text/csv",
      buffer: new TextEncoder().encode(csv).buffer,
    });

    expect(result.extractionMethod).toBe("csv");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      extractedName: "100 x 50 H1.2 SG8 Timber",
      extractedUnit: "lm",
      extractedUnitCost: 4.05,
    });
    expect(result.rows[1]).toMatchObject({
      extractedName: "13mm GIB Standard",
      extractedUnit: "sheet",
      extractedUnitCost: 22.5,
    });
  });

  it("extracts candidate rows from a PDF price list", async () => {
    const pdf = await readFile(
      new URL("../../tests/fixtures/supplier-invoices/TradeSupplier_Invoice_OCR_Test.pdf", import.meta.url)
    );

    const result = await extractMaterialImportRows({
      fileName: "TradeSupplier_Invoice_OCR_Test.pdf",
      mimeType: "application/pdf",
      buffer: Uint8Array.from(pdf).buffer,
    });

    expect(result.extractionMethod).toBe("pdf_text");
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.some((row) => row.extractedName.length > 0)).toBe(true);
  });

  it("stages image uploads for manual review when OCR is not available", async () => {
    const result = await extractMaterialImportRows({
      fileName: "price-list.png",
      mimeType: "image/png",
      buffer: new ArrayBuffer(0),
    });

    expect(result.extractionMethod).toBe("image_manual_review");
    expect(result.rows).toEqual([]);
    expect(result.summary.message).toContain("manual review");
  });
});
