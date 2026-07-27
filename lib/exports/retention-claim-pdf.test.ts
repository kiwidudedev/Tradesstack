import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildRetentionClaimPdfFileName,
  composeRetentionClaimPdf,
  type RetentionClaimPdfModel,
} from "@/lib/exports/retention-claim-pdf";

function model(allocationCount = 2): RetentionClaimPdfModel {
  const allocations = Array.from({ length: allocationCount }, (_, index) => ({
    id: `allocation-${index + 1}`,
    sequence: index + 1,
    originatingPaymentClaimId: `payment-claim-${index + 1}`,
    paymentClaimNumber: `PC-${String(index + 1).padStart(3, "0")}`,
    paymentClaimDate: "2026-01-15",
    retentionOwnedAtSubmission: 100,
    previouslyClaimed: 0,
    claimedInThisRetentionClaim: 50,
    remainingAfterAllocation: 50,
  }));
  return {
    schemaVersion: 1,
    organizationName: "TradesStack Test",
    organizationBrandPrimaryColor: "#0B2739",
    organizationBusinessNumber: "NZBN 123",
    organizationGstNumber: "GST 456",
    organizationContactName: "Accounts",
    organizationContactEmail: "accounts@example.test",
    organizationContactPhone: "09 000 0000",
    projectName: "Harbour Apartments",
    projectLocation: "Auckland",
    clientCompanyName: "Example Client",
    clientContactName: "Client Contact",
    claimId: "retention-claim-1",
    claimNumber: "RC-001",
    title: "Practical completion retention",
    reference: "PC release",
    issueDate: "2026-07-20",
    dueDate: "2026-08-20",
    submittedAt: "2026-07-21T02:30:00.000Z",
    subtotalExclTax: allocationCount * 50,
    submissionStateHash: "a".repeat(64),
    submissionEligibilityStateHash: "b".repeat(64),
    sourceEvidenceHash: "c".repeat(64),
    allocations,
  };
}

describe("Retention Claim PDF", () => {
  it("renders byte-identical evidence for the same immutable model", async () => {
    const first = await composeRetentionClaimPdf(model());
    const second = await composeRetentionClaimPdf(model());
    expect(first.bytes).toEqual(second.bytes);
    expect(first.fileName).toBe("Retention-Claim-RC-001.pdf");
    expect(first.pageCount).toBe(1);
    expect(createHash("sha256").update(first.bytes).digest("hex")).toBe(
      createHash("sha256").update(second.bytes).digest("hex"),
    );
    const loaded = await PDFDocument.load(first.bytes);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getTitle()).toContain("RC-001");
    expect(loaded.getSubject()).toBe("Submitted Retention Claim");
    expect(loaded.getCreationDate()?.toISOString()).toBe(
      "2026-07-21T02:30:00.000Z",
    );
  });

  it("paginates large allocation sets deterministically", async () => {
    const result = await composeRetentionClaimPdf(model(65));
    expect(result.pageCount).toBe(4);
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(4);
  });

  it("requires submitted evidence and allocation lines", async () => {
    await expect(
      composeRetentionClaimPdf({ ...model(), submissionStateHash: "" }),
    ).rejects.toThrow("immutable submitted evidence");
    await expect(
      composeRetentionClaimPdf({ ...model(0), subtotalExclTax: 0 }),
    ).rejects.toThrow("at least one submitted allocation");
  });

  it("sanitizes download file names", () => {
    expect(buildRetentionClaimPdfFileName('RC/001: "Final"')).toBe(
      "Retention-Claim-RC 001 Final.pdf",
    );
    expect(buildRetentionClaimPdfFileName("")).toBe("Retention-Claim.pdf");
  });
});
