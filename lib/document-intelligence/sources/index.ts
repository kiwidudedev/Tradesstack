import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";
import { createCsvSourceParts } from "@/lib/document-intelligence/sources/delimited-text";
import { createImageSourcePart } from "@/lib/document-intelligence/sources/image";
import { createPdfSourceParts } from "@/lib/document-intelligence/sources/pdf";
import { createSpreadsheetSourceParts } from "@/lib/document-intelligence/sources/spreadsheet";

export async function createDocumentSourceParts(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<DocumentSourcePart[]> {
  const name = input.fileName.toLowerCase();
  const mime = input.mimeType.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return createPdfSourceParts(input);
  if (mime === "text/csv" || mime === "application/csv" || name.endsWith(".csv")) return createCsvSourceParts(input);
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || mime.includes("spreadsheet") || mime === "application/vnd.ms-excel") return createSpreadsheetSourceParts(input);
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/i.test(name)) return [await createImageSourcePart(input)];
  throw new DocumentIntelligenceError({ code: "unsupported_source", message: "This supplier document format is not supported." });
}
