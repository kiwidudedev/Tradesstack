import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";
import { PDFDocument } from "pdf-lib";

export async function createPdfSourcePart(input: {
  id?: string;
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
}): Promise<DocumentSourcePart> {
  if (input.bytes.length < 5 || Buffer.from(input.bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new DocumentIntelligenceError({ code: "invalid_source", message: "The uploaded file is not a valid PDF." });
  }
  let pageCount: number | null = null;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: Uint8Array.from(input.bytes), disableFontFace: true, isEvalSupported: false });
    const pdf = await task.promise;
    pageCount = pdf.numPages;
    await task.destroy().catch(() => undefined);
    pdf.cleanup();
    await pdf.destroy();
  } catch {
    // Provider-native PDF interpretation can still report a more useful failure.
  }
  return {
    id: input.id ?? "source-1",
    kind: "pdf",
    fileName: input.fileName,
    mimeType: "application/pdf",
    sizeBytes: input.bytes.length,
    pageCount,
    content: input.bytes,
    metadata: {},
  };
}

export async function createPdfSourceParts(input: {
  fileName: string;
  bytes: Uint8Array;
  pagesPerChunk?: number;
}): Promise<DocumentSourcePart[]> {
  const base = await createPdfSourcePart(input);
  if (!base.pageCount || base.pageCount <= (input.pagesPerChunk ?? 25)) return [base];
  const source = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
  const size = Math.max(5, input.pagesPerChunk ?? 25);
  const parts: DocumentSourcePart[] = [];
  for (let startIndex = 0; startIndex < source.getPageCount(); startIndex += size) {
    const endIndex = Math.min(source.getPageCount(), startIndex + size);
    const chunk = await PDFDocument.create();
    const pages = await chunk.copyPages(source, Array.from({ length: endIndex - startIndex }, (_, index) => startIndex + index));
    pages.forEach((page) => chunk.addPage(page));
    const bytes = await chunk.save();
    parts.push({
      ...base,
      id: `pdf-pages-${startIndex + 1}-${endIndex}`,
      sizeBytes: bytes.length,
      pageCount: endIndex - startIndex,
      content: bytes,
      metadata: { pageStart: startIndex + 1, pageEnd: endIndex, originalPageCount: source.getPageCount() },
    });
  }
  return parts;
}
