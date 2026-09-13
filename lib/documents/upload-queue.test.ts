import { describe, expect, it } from "vitest";
import {
  canRetryDocumentUpload,
  canTransitionDocumentUpload,
  documentUploadPersistenceKey,
} from "@/lib/documents/upload-queue";

describe("document upload queue", () => {
  it("allows retry only from failure and keeps terminal states terminal", () => {
    expect(canRetryDocumentUpload("failed")).toBe(true);
    expect(canRetryDocumentUpload("completed")).toBe(false);
    expect(canRetryDocumentUpload("abandoned")).toBe(false);
    expect(canTransitionDocumentUpload("uploading", "completed")).toBe(true);
    expect(canTransitionDocumentUpload("completed", "uploading")).toBe(false);
  });

  it("builds a stable per-file initiation identity without a Storage key", () => {
    const key = documentUploadPersistenceKey({
      entityKind: "opportunity",
      entityId: "opportunity-id",
      parentNodeId: null,
      file: { name: "Contract.pdf", size: 123, lastModified: 456 },
    });
    expect(key).toBe(
      "tradesstack-document-upload:opportunity:opportunity-id:root:Contract.pdf:123:456",
    );
    expect(key).not.toContain("organization-documents");
  });
});
