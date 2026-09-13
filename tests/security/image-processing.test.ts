import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { imageOptimizer, optimizeImage, detectContentType } from "next/dist/server/image-optimizer";
import { createImageSourcePart } from "@/lib/document-intelligence/sources/image";
import { createDocumentSourceParts } from "@/lib/document-intelligence/sources";
import { validateSignaturePngArtifact } from "@/lib/quality-assurance/execution/signature-artifact-server";
import type { SignatureArtifactMetadata } from "@/components/ui/signature-pad-model";

vi.mock("server-only", () => ({}));

const pixels = { width: 32, height: 24, channels: 3 as const, background: { r: 20, g: 100, b: 200 } };
const formats = ["jpeg", "png", "webp", "avif"] as const;
const buffers = {} as Record<typeof formats[number], Buffer>;
const optimizerConfig = {
  images: { dangerouslyAllowSVG: false, minimumCacheTTL: 60 },
  experimental: { imgOptConcurrency: 1, imgOptMaxInputPixels: 4096, imgOptTimeoutInSeconds: 3 },
};
const signatureMetadata: SignatureArtifactMetadata = {
  schemaVersion: 1, rendererVersion: 1, mimeType: "image/png",
  logicalWidth: 600, logicalHeight: 200, pixelWidth: 1200, pixelHeight: 400, devicePixelRatio: 2,
  strokeCount: 1, pointCount: 4, totalDistance: 200,
  bounds: { x: 20, y: 40, width: 300, height: 80 },
};

beforeAll(async () => {
  for (const format of formats) buffers[format] = await sharp({ create: pixels }).toFormat(format).toBuffer();
});

describe("native image security compatibility", () => {
  it.each(formats)("decodes a synthetic %s and preserves dimensions", async (format) => {
    const { info } = await sharp(buffers[format], { failOn: "error", limitInputPixels: 4096 }).raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 32, height: 24, channels: 3 });
  });

  it.each(["jpeg", "png", "webp"] as const)("preserves the existing direct %s document transport", async (format) => {
    const part = await createDocumentSourceParts({ fileName: `synthetic.${format}`, mimeType: `image/${format}`, bytes: buffers[format] });
    expect(part[0]).toMatchObject({ kind: "image", mimeType: `image/${format}`, metadata: { transcoded: false } });
    expect(part[0].content).toEqual(buffers[format]);
  });

  it("transcodes a benign HEIF container with AV1 compression to PNG", async () => {
    const part = await createImageSourcePart({ fileName: "synthetic.heif", mimeType: "image/heif", bytes: buffers.avif });
    expect(part).toMatchObject({ mimeType: "image/png", metadata: { transcoded: true } });
    expect(await sharp(part.content as Uint8Array).metadata()).toMatchObject({ format: "png", width: 32, height: 24 });
  });

  it("handles the synthetic HEVC HEIC fixture without leaking a native error", async () => {
    // Generated locally from a 32x24 solid-color PNG using macOS sips; no customer data.
    const bytes = readFileSync(path.join(process.cwd(), "tests/fixtures/security/synthetic-solid.heic"));
    let nativeSupported = true;
    try { await sharp(bytes).png().toBuffer(); }
    catch (error) {
      // Both baseline and upgraded macOS prebuilt libvips lack the HEVC plugin.
      expect(String(error)).toContain("Support for this compression format has not been built in");
      nativeSupported = false;
    }
    const result = createImageSourcePart({ fileName: "synthetic.heic", mimeType: "image/heic", bytes });
    if (nativeSupported) {
      const part = await result;
      expect(await sharp(part.content as Uint8Array).metadata()).toMatchObject({ format: "png", width: 32, height: 24 });
    } else {
      await expect(result).rejects.toMatchObject({ code: "unsupported_source", message: "This HEIC/HEIF image could not be converted for interpretation." });
    }
  });

  it.each(["image/heic", "image/heif"])("rejects malformed %s through the controlled document error", async (mimeType) => {
    await expect(createImageSourcePart({ fileName: "truncated.heic", mimeType, bytes: buffers.avif.subarray(0, 16) }))
      .rejects.toMatchObject({ code: "unsupported_source", message: "This HEIC/HEIF image could not be converted for interpretation." });
  });

  it("sniffs actual PNG bytes in the existing HEIC conversion path despite the label", async () => {
    const part = await createImageSourcePart({ fileName: "mislabeled.heic", mimeType: "image/heic", bytes: buffers.png });
    expect(await sharp(part.content as Uint8Array).metadata()).toMatchObject({ format: "png", width: 32, height: 24 });
  });

  it("keeps unsupported document AVIF MIME and non-image input rejected", async () => {
    await expect(createImageSourcePart({ fileName: "synthetic.avif", mimeType: "image/avif", bytes: buffers.avif })).rejects.toMatchObject({ code: "unsupported_source" });
    await expect(createImageSourcePart({ fileName: "text.txt", mimeType: "text/plain", bytes: Buffer.from("not an image") })).rejects.toMatchObject({ code: "unsupported_source" });
  });

  it.each(["jpeg", "png"] as const)("rejects truncated %s pixels without crashing", async (format) => {
    await expect(sharp(buffers[format].subarray(0, 24), { failOn: "error" }).raw().toBuffer()).rejects.toThrow();
    expect((await sharp(buffers.png).metadata()).width).toBe(32);
  });

  it("continues enforcing the decoder pixel budget", async () => {
    await expect(sharp(buffers.png, { limitInputPixels: 32 }).raw().toBuffer()).rejects.toThrow(/pixel limit/i);
  });

  it("validates QA PNG dimensions and rejects a renamed JPEG", async () => {
    const png = await sharp({ create: { ...pixels, width: 1200, height: 400 } }).png().toBuffer();
    await expect(validateSignaturePngArtifact(png, signatureMetadata)).resolves.toMatchObject({ width: 1200, height: 400 });
    await expect(validateSignaturePngArtifact(buffers.jpeg, signatureMetadata)).rejects.toThrow("valid PNG");
    const huge = await sharp({ create: { ...pixels, width: 4097, height: 100 } }).png().toBuffer();
    await expect(validateSignaturePngArtifact(huge, signatureMetadata)).rejects.toThrow("dimensions are invalid");
    await expect(validateSignaturePngArtifact(png.subarray(0, 24), signatureMetadata)).rejects.toThrow();
  });
});

describe("installed Next image optimizer", () => {
  const optimize = (buffer: Buffer, contentType: string, href = "/synthetic.png") => imageOptimizer(
    { buffer, contentType, cacheControl: "public, max-age=120", etag: "synthetic-input" },
    { href, width: 16, quality: 75, mimeType: "image/webp" }, optimizerConfig, { silent: true },
  );

  it.each(["jpeg", "png", "webp"] as const)("resizes %s with the patched decoder", async (format) => {
    const result = await optimize(buffers[format], `image/${format}`);
    expect(result.contentType).toBe("image/webp");
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 16, height: 12 });
    expect(result.maxAge).toBe(120);
  });

  it("uses AVIF passthrough mitigation rather than decoding it in the public optimizer", async () => {
    const result = await optimize(buffers.avif, "image/avif", "/synthetic.avif");
    expect(result.contentType).toBe("image/avif");
    expect(result.buffer).toEqual(buffers.avif);
  });

  it("uses magic bytes instead of a misleading extension or upstream MIME", async () => {
    expect(await detectContentType(buffers.png)).toBe("image/png");
    const result = await optimize(buffers.png, "text/html", "/misleading.jpg");
    expect(await sharp(result.buffer).metadata()).toMatchObject({ format: "webp", width: 16 });
  });

  it("rejects non-image and SVG input with controlled errors", async () => {
    await expect(optimize(Buffer.from("not an image"), "image/png")).rejects.toMatchObject({ statusCode: 400 });
    await expect(optimize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("enforces the native optimizer pixel limit", async () => {
    await expect(optimizeImage({ buffer: buffers.png, contentType: "image/png", quality: 75, width: 16, limitInputPixels: 32 })).rejects.toThrow(/pixel limit/i);
  });
});

describe("PDF to image compatibility", () => {
  it("renders a synthetic document page and produces a bounded takeoff-style thumbnail", async () => {
    const { PDFDocument, rgb } = await import("pdf-lib");
    const { createCanvas } = await import("@napi-rs/canvas");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await PDFDocument.create();
    pdf.addPage([64, 48]).drawRectangle({ x: 0, y: 0, width: 64, height: 48, color: rgb(0.2, 0.4, 0.6) });
    const task = getDocument({ data: new Uint8Array(await pdf.save()), isEvalSupported: false });
    const document = await task.promise;
    try {
      const page = await document.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, canvas: null, viewport }).promise;
      const preview = canvas.toBuffer("image/png");
      expect(await sharp(preview).metadata()).toMatchObject({ format: "png", width: 128, height: 96 });
      const thumbnail = await optimizeImage({ buffer: preview, contentType: "image/webp", width: 32, quality: 75, limitInputPixels: 16384 });
      expect(await sharp(thumbnail).metadata()).toMatchObject({ format: "webp", width: 32, height: 24 });
    } finally { await document.destroy(); }
  });
});
