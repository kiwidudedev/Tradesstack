import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { signatureMetadataIsMeaningful, type SignatureArtifactMetadata } from "@/components/ui/signature-pad-model";

export const QA_SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function validateSignaturePngArtifact(bytes: Buffer, metadata: SignatureArtifactMetadata) {
  if (!signatureMetadataIsMeaningful(metadata)) throw new Error("Draw a fuller signature before saving.");
  if (bytes.length < PNG_SIGNATURE.length || bytes.length > QA_SIGNATURE_MAX_BYTES || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Signature image must be a valid PNG no larger than 2 MB.");
  }
  const image = await sharp(bytes, { failOn: "error" }).metadata();
  if (image.format !== "png" || !image.width || !image.height || image.width < 100 || image.height < 100 || image.width > 4096 || image.height > 2048) {
    throw new Error("Signature image dimensions are invalid.");
  }
  if (image.width !== metadata.pixelWidth || image.height !== metadata.pixelHeight) {
    throw new Error("Signature image dimensions do not match the captured signature.");
  }
  return { sha256: createHash("sha256").update(bytes).digest("hex"), width: image.width, height: image.height };
}
