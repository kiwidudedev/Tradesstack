import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";

export type EmailDocumentEnvelope = {
  messageId: string;
  subject: string | null;
  sender: string | null;
  receivedAt: string | null;
  textBody: string | null;
  attachmentParts: DocumentSourcePart[];
};

export function createEmailDocumentSourceParts(envelope: EmailDocumentEnvelope): DocumentSourcePart[] {
  const body = envelope.textBody?.trim();
  const bodyPart: DocumentSourcePart[] = body ? [{
    id: `email-body-${envelope.messageId}`,
    kind: "email_body",
    fileName: envelope.subject?.trim() || "email-body.txt",
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(body, "utf8"),
    pageCount: null,
    content: body,
    metadata: {
      messageId: envelope.messageId,
      subject: envelope.subject,
      sender: envelope.sender,
      receivedAt: envelope.receivedAt,
    },
  }] : [];
  return [...bodyPart, ...envelope.attachmentParts];
}
