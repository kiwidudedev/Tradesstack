import { describe, expect, it } from "vitest";
import { analyzeSignature, signatureMetadataIsMeaningful } from "./signature-pad-model";

describe("signature pad model", () => {
  it("rejects taps and tiny marks but accepts a meaningful stroke", () => {
    expect(analyzeSignature([[{ x: 0.5, y: 0.5 }]], 600, 200).meaningful).toBe(false);
    expect(analyzeSignature([[{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.51 }, { x: 0.52, y: 0.51 }]], 600, 200).meaningful).toBe(false);
    expect(analyzeSignature([[
      { x: 0.1, y: 0.7 }, { x: 0.25, y: 0.25 }, { x: 0.4, y: 0.65 }, { x: 0.65, y: 0.3 },
    ]], 600, 200).meaningful).toBe(true);
  });

  it("strictly validates exported metadata", () => {
    const metadata = {
      schemaVersion: 1, rendererVersion: 1, mimeType: "image/png",
      logicalWidth: 600, logicalHeight: 200, pixelWidth: 1200, pixelHeight: 400, devicePixelRatio: 2,
      strokeCount: 1, pointCount: 4, totalDistance: 180,
      bounds: { x: 50, y: 40, width: 300, height: 90 },
    } as const;
    expect(signatureMetadataIsMeaningful(metadata)).toBe(true);
    expect(signatureMetadataIsMeaningful({ ...metadata, bounds: null })).toBe(false);
    expect(signatureMetadataIsMeaningful({ ...metadata, pixelWidth: 1190 })).toBe(false);
    expect(signatureMetadataIsMeaningful({ ...metadata, pointCount: 1 })).toBe(false);
  });
});
