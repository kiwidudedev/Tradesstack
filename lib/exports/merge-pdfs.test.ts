import { createHash } from "node:crypto";
import { degrees, PDFDocument } from "pdf-lib";
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

async function pageFixture(dimensions: Array<[number, number]>, rotation?: number) {
  const pdf = await PDFDocument.create();
  dimensions.forEach(([width, height], index) => {
    const page = pdf.addPage([width, height]);
    if (index === 0 && rotation !== undefined) {
      page.setRotation(degrees(rotation));
    }
  });
  return pdf.save({ useObjectStreams: false });
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

  it("produces a valid PDF and preserves source order, dimensions, and rotation", async () => {
    const first = await pageFixture([[100, 200], [110, 210]], 90);
    const second = await pageFixture([[300, 400]]);
    const third = await pageFixture([[500, 600], [510, 610], [520, 620]]);

    const merged = await mergePdfDocuments([first, second, third]);
    const loaded = await PDFDocument.load(merged, { updateMetadata: false });

    expect(merged.slice(0, 5)).toEqual(new TextEncoder().encode("%PDF-"));
    expect(loaded.getPageCount()).toBe(6);
    expect(loaded.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
      [100, 200],
      [110, 210],
      [300, 400],
      [500, 600],
      [510, 610],
      [520, 620],
    ]);
    expect(loaded.getPages()[0].getRotation().angle).toBe(90);
  });

  it("rewrites a single input into a new PDF rather than returning the input bytes", async () => {
    const source = await pageFixture([[123, 456]]);
    const merged = await mergePdfDocuments([source]);

    expect(merged).not.toEqual(source);
    const loaded = await PDFDocument.load(merged, { updateMetadata: false });
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getPages()[0].getWidth()).toBe(123);
    expect(loaded.getPages()[0].getHeight()).toBe(456);
  });

  it("returns a valid one-page PDF for an empty input list", async () => {
    const merged = await mergePdfDocuments([]);
    const loaded = await PDFDocument.load(merged, { updateMetadata: false });

    expect(merged.slice(0, 5)).toEqual(new TextEncoder().encode("%PDF-"));
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getPages()[0].getWidth()).toBeCloseTo(595.28, 2);
    expect(loaded.getPages()[0].getHeight()).toBeCloseTo(841.89, 2);
  });

  it.each([
    ["empty bytes", new Uint8Array()],
    ["plain text", new TextEncoder().encode("not a PDF")],
    ["truncated PDF", new TextEncoder().encode("%PDF-1.7\n1 0 obj\n")],
  ])("rejects %s without returning partial output", async (_label, input) => {
    await expect(mergePdfDocuments([input])).rejects.toBeInstanceOf(Error);
  });

  it("fails the whole merge when a later input is invalid", async () => {
    const valid = await pageFixture([[100, 100]]);

    await expect(mergePdfDocuments([valid, new Uint8Array(), valid])).rejects.toBeInstanceOf(Error);
  });

  it("does not mutate input byte arrays", async () => {
    const source = await pageFixture([[100, 100]]);
    const before = new Uint8Array(source);

    await mergePdfDocuments([source]);

    expect(source).toEqual(before);
  });

  it("sets only caller-provided deterministic metadata and does not inherit source metadata", async () => {
    const sourceMetadata: DeterministicPdfMetadata = {
      ...metadata,
      title: "Source title",
      author: "Source author",
    };
    const sourcePdfWithMetadata = await PDFDocument.create();
    applyDeterministicPdfMetadata(sourcePdfWithMetadata, sourceMetadata);
    sourcePdfWithMetadata.addPage([100, 100]);

    const mergedWithoutMetadata = await mergePdfDocuments([await sourcePdfWithMetadata.save()]);
    const loadedWithoutMetadata = await PDFDocument.load(mergedWithoutMetadata, { updateMetadata: false });
    expect(loadedWithoutMetadata.getTitle()).not.toBe(sourceMetadata.title);
    expect(loadedWithoutMetadata.getAuthor()).not.toBe(sourceMetadata.author);

    const mergedWithMetadata = await mergePdfDocuments([await sourcePdfWithMetadata.save()], metadata);
    const loadedWithMetadata = await PDFDocument.load(mergedWithMetadata, { updateMetadata: false });
    expect(loadedWithMetadata.getTitle()).toBe(metadata.title);
    expect(loadedWithMetadata.getAuthor()).toBe(metadata.author);
    expect(loadedWithMetadata.getCreationDate()?.toISOString()).toBe(evidenceDate.toISOString());
    expect(loadedWithMetadata.getModificationDate()?.toISOString()).toBe(evidenceDate.toISOString());
  });
});
