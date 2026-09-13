import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { SignatureArtifactMetadata } from "@/components/ui/signature-pad-model";

vi.mock("server-only", () => ({}));

const metadata: SignatureArtifactMetadata = {
  schemaVersion: 1, rendererVersion: 1, mimeType: "image/png",
  logicalWidth: 600, logicalHeight: 200, pixelWidth: 1200, pixelHeight: 400, devicePixelRatio: 2,
  strokeCount: 1, pointCount: 4, totalDistance: 200,
  bounds: { x: 20, y: 40, width: 300, height: 80 },
};

describe("drawn signature PNG validation", () => {
  it("reads the exact PNG bytes, verifies dimensions, and returns their SHA-256", async () => {
    const { validateSignaturePngArtifact } = await import("./signature-artifact-server");
    const bytes = await sharp({ create: { width: 1200, height: 400, channels: 4, background: "white" } }).png().toBuffer();
    await expect(validateSignaturePngArtifact(bytes, metadata)).resolves.toEqual({
      sha256: createHash("sha256").update(bytes).digest("hex"), width: 1200, height: 400,
    });
  });

  it("rejects non-PNG, oversized, dimension-mismatched, and non-meaningful artifacts", async () => {
    const { QA_SIGNATURE_MAX_BYTES, validateSignaturePngArtifact } = await import("./signature-artifact-server");
    const jpeg = await sharp({ create: { width: 1200, height: 400, channels: 3, background: "white" } }).jpeg().toBuffer();
    await expect(validateSignaturePngArtifact(jpeg, metadata)).rejects.toThrow("valid PNG");
    const oversized = Buffer.alloc(QA_SIGNATURE_MAX_BYTES + 1); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversized);
    await expect(validateSignaturePngArtifact(oversized, metadata)).rejects.toThrow("2 MB");
    const wrongSize = await sharp({ create: { width: 600, height: 200, channels: 4, background: "white" } }).png().toBuffer();
    await expect(validateSignaturePngArtifact(wrongSize, metadata)).rejects.toThrow("do not match");
    await expect(validateSignaturePngArtifact(wrongSize, { ...metadata, pointCount: 1 })).rejects.toThrow("fuller signature");
  });
});
