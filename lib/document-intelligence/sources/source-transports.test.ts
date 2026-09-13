import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createImageSourcePart } from "@/lib/document-intelligence/sources/image";
import { createPdfSourceParts } from "@/lib/document-intelligence/sources/pdf";
import { createSpreadsheetSourceParts } from "@/lib/document-intelligence/sources/spreadsheet";
import { createEmailDocumentSourceParts } from "@/lib/document-intelligence/sources/email";

describe("neutral document source transports", () => {
  it("chunks large PDFs without OCR or domain inference", async () => {
    const pdf = await PDFDocument.create();
    for (let page = 0; page < 26; page += 1) pdf.addPage();
    const parts = await createPdfSourceParts({ fileName: "prices.pdf", bytes: new Uint8Array(await pdf.save()), pagesPerChunk: 25 });
    expect(parts.map((part) => part.id)).toEqual(["pdf-pages-1-25", "pdf-pages-26-26"]);
    expect(parts.map((part) => part.pageCount)).toEqual([25, 1]);
  });

  it("serializes every worksheet with cell, formula and merged-range provenance", async () => {
    const workbook = new ExcelJS.Workbook();
    const first = workbook.addWorksheet("Timber");
    first.mergeCells("A1:B1");
    first.getCell("A1").value = "TIMBER";
    first.getCell("A2").value = "T1";
    first.getCell("B2").value = { formula: "10+2", result: 12 };
    workbook.addWorksheet("Fixings").addRow(["F1", "Bolt"]);
    const parts = await createSpreadsheetSourceParts({ fileName: "prices.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: new Uint8Array(await workbook.xlsx.writeBuffer()) });
    expect(parts).toHaveLength(2);
    expect(String(parts[0]?.content)).toContain("MERGED RANGES: A1:B1");
    expect(String(parts[0]?.content)).toContain("B2=\"12\" formula=10+2");
    expect(String(parts[1]?.content)).toContain("WORKSHEET \"Fixings\"");
  });

  it("infers direct image media type from a safe extension", async () => {
    const part = await createImageSourcePart({ fileName: "phone-photo.jpg", mimeType: "", bytes: new Uint8Array([1, 2, 3]) });
    expect(part).toMatchObject({ kind: "image", mimeType: "image/jpeg" });
  });

  it("provides a neutral future email-body and attachment envelope", () => {
    const parts = createEmailDocumentSourceParts({ messageId: "message-1", subject: "August prices", sender: "supplier@example.com", receivedAt: "2026-08-01T00:00:00Z", textBody: "Please see attached pricing.", attachmentParts: [] });
    expect(parts[0]).toMatchObject({ id: "email-body-message-1", kind: "email_body", content: "Please see attached pricing." });
  });
});
