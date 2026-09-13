import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";

const DIRECT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function createImageSourcePart(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<DocumentSourcePart> {
  let bytes = input.bytes;
  const extension = input.fileName.toLowerCase().split(".").pop();
  let mimeType = input.mimeType.toLowerCase() || ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif" } as Record<string, string>)[extension ?? ""] || "";
  let transcoded = false;
  if (!DIRECT_IMAGE_TYPES.has(mimeType)) {
    if (!new Set(["image/heic", "image/heif"]).has(mimeType)) {
      throw new DocumentIntelligenceError({ code: "unsupported_source", message: "This image format is not supported." });
    }
    try {
      const sharp = (await import("sharp")).default;
      bytes = new Uint8Array(await sharp(input.bytes).png().toBuffer());
      mimeType = "image/png";
      transcoded = true;
    } catch {
      throw new DocumentIntelligenceError({ code: "unsupported_source", message: "This HEIC/HEIF image could not be converted for interpretation." });
    }
  }
  return {
    id: "source-1",
    kind: "image",
    fileName: input.fileName,
    mimeType,
    sizeBytes: bytes.length,
    pageCount: null,
    content: bytes,
    metadata: { originalMimeType: input.mimeType, transcoded },
  };
}
