import { describe, expect, it } from "vitest";
import { QA_EVIDENCE_MAX_BYTES, QA_SIGNATURE_MAX_BYTES, validateQAEvidenceFile } from "./evidence-client";

function file(name: string, type: string, size = 1) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("Project QA evidence client validation", () => {
  it("accepts operational photo and document MIME types", () => {
    expect(() => validateQAEvidenceFile(file("site.jpg", "image/jpeg"), "photo")).not.toThrow();
    expect(() => validateQAEvidenceFile(file("check.pdf", "application/pdf"), "file")).not.toThrow();
    expect(() => validateQAEvidenceFile(file("iphone.heic", "image/heic"), "photo")).not.toThrow();
  });

  it("rejects invalid names, empty/oversized files, and type confusion", () => {
    expect(() => validateQAEvidenceFile(file("../site.jpg", "image/jpeg"), "photo")).toThrow("valid name");
    expect(() => validateQAEvidenceFile(new File([], "empty.jpg", { type: "image/jpeg" }), "photo")).toThrow("Empty");
    expect(() => validateQAEvidenceFile({ name: "large.pdf", type: "application/pdf", size: QA_EVIDENCE_MAX_BYTES + 1 } as File, "file")).toThrow("100 MB");
    expect(() => validateQAEvidenceFile(file("check.pdf", "application/pdf"), "photo")).toThrow("JPEG");
  });

  it("gives an actionable browser fallback for untyped HEIC input", () => {
    expect(() => validateQAEvidenceFile(file("iphone.heic", ""), "photo")).toThrow("did not identify the iPhone image type");
  });

  it("accepts only small PNG artifacts for signatures", () => {
    expect(() => validateQAEvidenceFile(file("signature.png", "image/png"), "signature")).not.toThrow();
    expect(() => validateQAEvidenceFile(file("signature.jpg", "image/jpeg"), "signature")).toThrow("PNG");
    expect(() => validateQAEvidenceFile({ name: "signature.png", type: "image/png", size: QA_SIGNATURE_MAX_BYTES + 1 } as File, "signature")).toThrow("2 MB");
  });
});
