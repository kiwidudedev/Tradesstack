import { describe, expect, it } from "vitest";
import { createCsvSourceParts } from "@/lib/document-intelligence/sources/delimited-text";
import { interpretMaterialSupplierPricing } from "@/lib/materials/supplier-pricing-intelligence/interpret";
import { createSpreadsheetSourceParts } from "@/lib/document-intelligence/sources/spreadsheet";
import { createPdfSourceParts } from "@/lib/document-intelligence/sources/pdf";
import { createImageSourcePart } from "@/lib/document-intelligence/sources/image";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";

const liveIt = process.env.RUN_LIVE_MATERIAL_SUPPLIER_PRICING === "true" ? it : it.skip;

function recordRun(label: string, interpreted: Awaited<ReturnType<typeof interpretMaterialSupplierPricing>>) {
  const run = interpreted.runs[0]!;
  console.info("live_material_supplier_pricing_verification", {
    format: label, model: run.model, contractVersion: run.contractVersion, durationMs: run.durationMs,
    inputTokens: run.inputTokens, outputTokens: run.outputTokens, rowCount: interpreted.result.rows.length,
  });
}

describe("Anthropic Material supplier pricing live verification (opt-in)", () => {
  liveIt("interprets a synthetic GIB multi-price fixture", async () => {
    const sourceParts = createCsvSourceParts({
      fileName: "synthetic-gib-prices.csv",
      bytes: new TextEncoder().encode([
        "SKU,Description,Unit,FIS,DTS1",
        "GB10,GIB Standard 10mm,m2,12.30,11.80",
        "GB13,GIB Standard 13mm,m2,14.20,13.65",
      ].join("\n")),
    });
    const interpreted = await interpretMaterialSupplierPricing({ sourceParts, selectedSupplierName: "Fixture Supplier" });
    expect(interpreted.result.contractVersion).toBe("material_supplier_pricing_v1");
    expect(interpreted.result.rows).toHaveLength(2);
    expect(interpreted.result.rows[0]?.prices.map((price) => price.label.value?.toUpperCase())).toEqual(expect.arrayContaining(["FIS", "DTS1"]));
    recordRun("csv", interpreted);
  }, 120_000);

  liveIt("interprets a synthetic XLSX workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Prices").addRows([["SKU", "Description", "Unit", "Trade"], ["T9045", "Timber H1.2 90x45", "lm", 4.85]]);
    const sourceParts = await createSpreadsheetSourceParts({ fileName: "synthetic-prices.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: new Uint8Array(await workbook.xlsx.writeBuffer()) });
    const interpreted = await interpretMaterialSupplierPricing({ sourceParts, selectedSupplierName: "Fixture Supplier" });
    expect(interpreted.result.rows[0]?.supplierSku.value).toBe("T9045");
    expect(interpreted.result.rows[0]?.prices[0]?.amount.value).toBe(4.85);
    recordRun("xlsx", interpreted);
  }, 120_000);

  liveIt("interprets a synthetic native PDF", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    page.drawText("SKU: CEM20   Product: Cement 20kg   Unit: bag   Trade price: NZD 14.90", { x: 40, y: 740, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
    const sourceParts = await createPdfSourceParts({ fileName: "synthetic-prices.pdf", bytes: new Uint8Array(await pdf.save()) });
    const interpreted = await interpretMaterialSupplierPricing({ sourceParts, selectedSupplierName: "Fixture Supplier" });
    expect(interpreted.result.rows[0]?.supplierSku.value).toBe("CEM20");
    expect(interpreted.result.rows[0]?.prices[0]?.amount.value).toBe(14.9);
    recordRun("pdf", interpreted);
  }, 120_000);

  liveIt("interprets a synthetic scanned price image", async () => {
    const png = await sharp(Buffer.from('<svg width="900" height="220"><rect width="100%" height="100%" fill="white"/><text x="30" y="90" font-size="34" fill="black">SKU N90 | Framing nails 90mm | box 3000 | NZD 189.00</text></svg>')).png().toBuffer();
    const sourceParts = [await createImageSourcePart({ fileName: "synthetic-scan.png", mimeType: "image/png", bytes: new Uint8Array(png) })];
    const interpreted = await interpretMaterialSupplierPricing({ sourceParts, selectedSupplierName: "Fixture Supplier" });
    expect(interpreted.result.rows[0]?.supplierSku.value).toBe("N90");
    expect(interpreted.result.rows[0]?.prices[0]?.amount.value).toBe(189);
    recordRun("image", interpreted);
  }, 120_000);
});
