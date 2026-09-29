import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  mergePdfDocuments,
  type DeterministicPdfMetadata,
  type PdfOperationTiming,
} from "@tradesstack/pdf-utils";

const metadata: DeterministicPdfMetadata = {
  title: "PDF utility characterization",
  author: "Tradesstack",
  subject: "Pure PDF bytes",
  creator: "Tradesstack",
  producer: "Tradesstack PDF utility",
  creationDate: new Date("2026-07-14T00:00:00.000Z"),
  modificationDate: new Date("2026-07-14T00:00:00.000Z"),
};

async function fixture(dimensions: Array<[number, number]>) {
  const pdf = await PDFDocument.create();
  dimensions.forEach(([width, height]) => pdf.addPage([width, height]));
  return pdf.save();
}

function timingRecorder(events: string[]): PdfOperationTiming {
  return {
    start: (stage) => events.push("start:" + stage),
    mark: (stage) => events.push("mark:" + stage),
    end: (stage) => events.push("end:" + stage),
  };
}

describe("@tradesstack/pdf-utils", () => {
  it("preserves the characterized merge behavior", async () => {
    const a = await fixture([[100, 200], [110, 210]]);
    const b = await fixture([[300, 400]]);
    const c = await fixture([[500, 600], [510, 610], [520, 620]]);

    const bytes = await mergePdfDocuments([a, b, c], metadata);
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });

    expect(bytes.slice(0, 5)).toEqual(new TextEncoder().encode("%PDF-"));
    expect(pdf.getPageCount()).toBe(6);
    expect(pdf.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
      [100, 200],
      [110, 210],
      [300, 400],
      [500, 600],
      [510, 610],
      [520, 620],
    ]);
    expect(pdf.getTitle()).toBe(metadata.title);
    expect(pdf.getCreationDate()?.toISOString()).toBe(metadata.creationDate.toISOString());
  });

  it("uses a package-neutral optional timing contract with the current stage order", async () => {
    const events: string[] = [];
    const source = await fixture([[100, 100]]);

    await mergePdfDocuments([source], undefined, timingRecorder(events));

    expect(events).toEqual([
      "start:merge",
      "mark:merge-start",
      "start:merge-source-load",
      "end:merge-source-load",
      "start:merge-page-copy",
      "end:merge-page-copy",
      "start:merge-save",
      "end:merge-save",
      "end:merge",
    ]);
  });

  it("produces byte-identical output with and without timing", async () => {
    const source = await fixture([[100, 100]]);
    const withoutTiming = await mergePdfDocuments([source], metadata);
    const events: string[] = [];
    const withTiming = await mergePdfDocuments([source], metadata, timingRecorder(events));

    expect(withTiming).toEqual(withoutTiming);
    expect(events.length).toBeGreaterThan(0);
  });

  it("propagates timing callback failures", async () => {
    const source = await fixture([[100, 100]]);
    const timing: PdfOperationTiming = {
      start() {
        throw new Error("timing failure");
      },
      mark() {},
      end() {},
    };

    await expect(mergePdfDocuments([source], undefined, timing)).rejects.toThrow("timing failure");
  });
});
