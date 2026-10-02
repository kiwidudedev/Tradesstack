import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { renderTakeoffPdfPreviews } from "@/lib/takeoff-pdf-preview-renderer";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("takeoff PDF preview renderer", () => {
  it("renders a PDF page to a bounded PNG without a platform-specific binary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tradesstack-takeoff-renderer-test-"));
    temporaryDirectories.push(directory);

    const pdf = await PDFDocument.create();
    pdf.addPage([64, 48]).drawRectangle({
      x: 0,
      y: 0,
      width: 64,
      height: 48,
      color: rgb(0.2, 0.4, 0.6),
    });
    const outputPath = join(directory, "page-0001.png");

    await renderTakeoffPdfPreviews({
      sourcePdfBytes: await pdf.save(),
      pages: [{
        pageNumber: 1,
        outputPath,
        outputWidthPts: 64,
        outputHeightPts: 48,
        rotationDegrees: 0,
      }],
    });

    const metadata = await sharp(await readFile(outputPath)).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 192, height: 144 });
  });
});
