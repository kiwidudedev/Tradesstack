import { PDFDocument } from "pdf-lib";
import type { PdfExportTiming } from "@/lib/exports/pdf-export-timing";

export type DeterministicPdfMetadata = {
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  creationDate: Date;
  modificationDate: Date;
};

export function applyDeterministicPdfMetadata(
  pdf: PDFDocument,
  metadata: DeterministicPdfMetadata,
) {
  pdf.setTitle(metadata.title);
  pdf.setAuthor(metadata.author);
  pdf.setSubject(metadata.subject);
  pdf.setCreator(metadata.creator);
  pdf.setProducer(metadata.producer);
  pdf.setCreationDate(metadata.creationDate);
  pdf.setModificationDate(metadata.modificationDate);
}

export async function mergePdfDocuments(
  parts: Uint8Array[],
  metadata?: DeterministicPdfMetadata,
  timing?: PdfExportTiming,
): Promise<Uint8Array> {
  timing?.start("merge");
  timing?.mark("merge-start");
  const merged = await PDFDocument.create();
  if (metadata) applyDeterministicPdfMetadata(merged, metadata);

  for (const part of parts) {
    timing?.start("merge-source-load");
    const source = await PDFDocument.load(part);
    timing?.end("merge-source-load");
    timing?.start("merge-page-copy");
    const copiedPages = await merged.copyPages(source, source.getPageIndices());
    for (const copiedPage of copiedPages) {
      merged.addPage(copiedPage);
    }
    timing?.end("merge-page-copy");
  }

  timing?.start("merge-save");
  const bytes = await merged.save();
  timing?.end("merge-save");
  timing?.end("merge");
  return bytes;
}
