import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  applyDeterministicPdfMetadata,
  mergePdfDocuments,
  type DeterministicPdfMetadata,
} from "@/lib/exports/merge-pdfs";

const evidenceDate = new Date("2026-07-14T00:00:00.000Z");
const metadata: DeterministicPdfMetadata = {
  title: "Synthetic Payment Claim",
  author: "Synthetic Organisation",
  subject: "Payment Claim PC-001",
  creator: "Tradesstack",
  producer: "Tradesstack Payment Claim Export",
  creationDate: evidenceDate,
  modificationDate: evidenceDate,
};

async function sourcePdf() {
  const pdf = await PDFDocument.create();
  applyDeterministicPdfMetadata(pdf, metadata);
  pdf.addPage([100, 100]);
  return pdf.save();
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("mergePdfDocuments", () => {
  it("does not inject clock or random evidence into a delayed deterministic merge", async () => {
    const source = await sourcePdf();
    const first = await mergePdfDocuments([source], metadata);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const second = await mergePdfDocuments([source], metadata);

    expect(first).toEqual(second);
    expect(sha256(first)).toBe(sha256(second));
    const loaded = await PDFDocument.load(first, { updateMetadata: false });
    expect(loaded.getCreationDate()?.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(loaded.getModificationDate()?.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(loaded.getTitle()).toBe(metadata.title);
    expect(loaded.getAuthor()).toBe(metadata.author);
    expect(loaded.getSubject()).toBe(metadata.subject);
    expect(loaded.getCreator()).toBe(metadata.creator);
    expect(loaded.getProducer()).toBe(metadata.producer);
  });
});
