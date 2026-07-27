import { describe, expect, it } from "vitest";
import { resolveRetentionClaimProposalInvoiceNumber } from "./retention-claim-proposal-identity";

describe("Retention Claim proposal invoice identity", () => {
  it("keeps the active R2 number for a same-InvoiceID update", () => {
    expect(resolveRetentionClaimProposalInvoiceNumber({
      operation: "UPDATE_EXISTING_INVOICE",
      claimNumber: "26028-RC-01",
      activeInvoiceNumber: "26028-RC-01-R2",
      replacementNumber: null,
    })).toBe("26028-RC-01-R2");
  });

  it("uses an allocated number only for a replacement", () => {
    expect(resolveRetentionClaimProposalInvoiceNumber({
      operation: "REPLACEMENT_EXPORT",
      claimNumber: "26028-RC-01",
      activeInvoiceNumber: "26028-RC-01-R2",
      replacementNumber: "26028-RC-01-R3",
    })).toBe("26028-RC-01-R3");
  });

  it("refuses an update without a confirmed active invoice number", () => {
    expect(() => resolveRetentionClaimProposalInvoiceNumber({
      operation: "UPDATE_EXISTING_INVOICE",
      claimNumber: "26028-RC-01",
      activeInvoiceNumber: null,
    })).toThrow("active Xero invoice number");
  });
});
