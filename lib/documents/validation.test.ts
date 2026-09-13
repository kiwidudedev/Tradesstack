import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_TUS_CHUNK_SIZE_BYTES,
  DOCUMENT_TUS_RETRY_DELAYS_MS,
} from "@/lib/documents/constants";
import {
  DocumentInputError,
  parseDocumentUploadInitiationInput,
  toSafeDocumentError,
  validateDocumentFile,
} from "@/lib/documents/validation";
import { getDocumentTusEndpoint } from "@/lib/documents/upload-client";

const OPPORTUNITY_ID = "10000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_ID = "10000000-0000-4000-8000-000000000002";

describe("document upload validation", () => {
  it.each([
    ["drawing.pdf", "application/pdf"],
    ["notes.txt", "text/plain"],
    ["register.csv", "text/csv"],
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["photo.png", "image/png"],
    ["photo.webp", "image/webp"],
    ["contract.doc", "application/msword"],
    ["contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["costs.xls", "application/vnd.ms-excel"],
    ["costs.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["brief.ppt", "application/vnd.ms-powerpoint"],
    ["brief.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ])("accepts %s with its allowed MIME", (displayName, claimedMimeType) => {
    expect(validateDocumentFile({ displayName, claimedMimeType, byteSize: 1 })).toMatchObject({
      displayName,
      claimedMimeType,
    });
  });

  it.each([
    ["invoice.pdf.exe", "application/pdf"],
    ["payload.js.pdf", "application/pdf"],
    ["archive.zip", "application/zip"],
    ["macro.docm", "application/vnd.ms-word.document.macroEnabled.12"],
    ["drawing.svg", "image/svg+xml"],
    ["page.html", "text/html"],
  ])("blocks dangerous or double-extension file %s", (displayName, claimedMimeType) => {
    expect(() =>
      validateDocumentFile({ displayName, claimedMimeType, byteSize: 10 })
    ).toThrow(DocumentInputError);
  });

  it("rejects empty and over-limit files while accepting exactly 2 GiB", () => {
    expect(() =>
      validateDocumentFile({
        displayName: "drawing.pdf",
        claimedMimeType: "application/pdf",
        byteSize: 0,
      })
    ).toThrow("Empty files");
    expect(
      validateDocumentFile({
        displayName: "drawing.pdf",
        claimedMimeType: "application/pdf",
        byteSize: DOCUMENT_MAX_FILE_SIZE_BYTES,
      }).byteSize,
    ).toBe(DOCUMENT_MAX_FILE_SIZE_BYTES);
    expect(() =>
      validateDocumentFile({
        displayName: "drawing.pdf",
        claimedMimeType: "application/pdf",
        byteSize: DOCUMENT_MAX_FILE_SIZE_BYTES + 1,
      })
    ).toThrow("2 GiB");
  });

  it("rejects MIME mismatches, paths, controls, blank extensions, and oversized names", () => {
    for (const input of [
      { displayName: "drawing.pdf", claimedMimeType: "image/png", byteSize: 10 },
      { displayName: "../drawing.pdf", claimedMimeType: "application/pdf", byteSize: 10 },
      { displayName: "folder\\drawing.pdf", claimedMimeType: "application/pdf", byteSize: 10 },
      { displayName: "bad\u0000.pdf", claimedMimeType: "application/pdf", byteSize: 10 },
      { displayName: "README", claimedMimeType: "text/plain", byteSize: 10 },
      { displayName: `${"a".repeat(247)}.pdf`, claimedMimeType: "application/pdf", byteSize: 10 },
    ]) {
      expect(() => validateDocumentFile(input)).toThrow(DocumentInputError);
    }
  });

  it("requires exactly one persisted entity UUID and an idempotency UUID", () => {
    const valid = parseDocumentUploadInitiationInput({
      opportunityId: OPPORTUNITY_ID,
      displayName: "drawing.pdf",
      claimedMimeType: "application/pdf",
      byteSize: 100,
      idempotencyKey: IDEMPOTENCY_ID,
    });
    expect(valid.opportunityId).toBe(OPPORTUNITY_ID);
    expect(valid.projectId).toBeNull();

    expect(() =>
      parseDocumentUploadInitiationInput({
        opportunityId: OPPORTUNITY_ID,
        projectId: OPPORTUNITY_ID,
        displayName: "drawing.pdf",
        claimedMimeType: "application/pdf",
        byteSize: 100,
        idempotencyKey: IDEMPOTENCY_ID,
      })
    ).toThrow("Exactly one");
  });

  it("maps internal failures without exposing Storage details", () => {
    expect(toSafeDocumentError(new Error("storage backend token=secret failed"))).toEqual({
      code: "document_operation_failed",
      message: "Unable to complete the document operation.",
      status: 500,
    });
    expect(toSafeDocumentError(new Error("Pending upload has expired."))).toMatchObject({
      code: "upload_expired",
      status: 409,
    });
  });

  it("uses the direct Storage hostname in production and a local gateway locally", () => {
    expect(getDocumentTusEndpoint("https://abc123.supabase.co")).toBe(
      "https://abc123.storage.supabase.co/storage/v1/upload/resumable",
    );
    expect(getDocumentTusEndpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable",
    );
    expect(DOCUMENT_TUS_CHUNK_SIZE_BYTES).toBe(6 * 1024 * 1024);
    expect(DOCUMENT_TUS_RETRY_DELAYS_MS).toEqual([
      0,
      1_000,
      3_000,
      5_000,
      10_000,
      20_000,
    ]);
  });
});
