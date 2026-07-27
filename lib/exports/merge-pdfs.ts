import { PDFDocument } from "pdf-lib";

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
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  if (metadata) applyDeterministicPdfMetadata(merged, metadata);

  for (const part of parts) {
    const normalizedPart = Uint8Array.from(part);
    const source = await PDFDocument.load(normalizedPart);
    const copiedPages = await merged.copyPages(source, source.getPageIndices());
    for (const copiedPage of copiedPages) {
      merged.addPage(copiedPage);
    }
  }

  return merged.save();
}
