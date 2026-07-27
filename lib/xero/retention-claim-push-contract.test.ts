import { describe, expect, it } from "vitest";
import {
  calculateRetentionClaimPushHashes,
  verifyRetentionClaimXeroInvoice,
} from "./retention-claim-push-contract";
import type { RetentionClaimXeroPayload } from "./retention-claim-sales-invoice-payload";

const payload: RetentionClaimXeroPayload = {
  Type: "ACCREC",
  Status: "AUTHORISED",
  Contact: { ContactID: "contact-1" },
  InvoiceNumber: "26028-RC-01",
  Reference: "Retention release",
  Date: "2026-07-26",
  DueDate: "2026-08-20",
  CurrencyCode: "NZD",
  LineAmountTypes: "Exclusive",
  LineItems: [{
    Description: "Retention from 26028-CL-01",
    Quantity: 1,
    UnitAmount: 100,
    AccountCode: "700",
    TaxType: "OUTPUT2",
  }],
};

const exact = {
  InvoiceID: "invoice-1",
  Type: "ACCREC",
  Status: "AUTHORISED",
  Contact: { ContactID: "contact-1" },
  InvoiceNumber: "26028-RC-01",
  Reference: "Retention release",
  Date: "2026-07-26T00:00:00",
  DueDate: "2026-08-20T00:00:00",
  CurrencyCode: "NZD",
  LineAmountTypes: "Exclusive",
  LineItems: [{
    Description: "Retention from 26028-CL-01",
    Quantity: 1,
    UnitAmount: 100,
    LineAmount: 100,
    TaxAmount: 15,
    AccountCode: "700",
    TaxType: "OUTPUT2",
  }],
  SubTotal: 100,
  TotalTax: 15,
  Total: 115,
  AmountPaid: 0,
  AmountCredited: 0,
  Payments: [],
  CreditNotes: [],
};

describe("Retention Claim immutable Xero contract", () => {
  it("accepts an exact ACCREC AUTHORISED Retention Claim invoice", () => {
    expect(verifyRetentionClaimXeroInvoice({
      expected: payload,
      actual: exact,
      subtotalMinor: 10_000,
      taxMinor: 1_500,
      totalMinor: 11_500,
    })).toEqual({ exact: true, reasons: [] });
  });

  it.each([
    ["type", { Type: "ACCPAY" }, "wrong_type"],
    ["status", { Status: "DRAFT" }, "wrong_status"],
    ["number", { InvoiceNumber: "TSI-00000002" }, "wrong_number"],
    ["contact", { Contact: { ContactID: "other" } }, "wrong_contact"],
    ["currency", { CurrencyCode: "AUD" }, "wrong_currency"],
    ["paid", { AmountPaid: 10 }, "amount_paid_not_zero"],
    ["credited", { AmountCredited: 10 }, "amount_credited_not_zero"],
    ["payments", { Payments: [{ PaymentID: "p1" }] }, "payments_present"],
    ["credits", { CreditNotes: [{ CreditNoteID: "c1" }] }, "credits_present"],
  ])("rejects wrong %s evidence", (_label, change, reason) => {
    const result = verifyRetentionClaimXeroInvoice({
      expected: payload,
      actual: { ...exact, ...change },
      subtotalMinor: 10_000,
      taxMinor: 1_500,
      totalMinor: 11_500,
    });
    expect(result.exact).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it("hashes identical proposal inputs deterministically", () => {
    const input = {
      sourceEvidence: { claim: "26028-RC-01" },
      dependencies: { tenant: "tenant-1" },
      commercialSnapshot: { totalMinor: 11_500 },
      lines: [{
        sequence: 1,
        lineKind: "retention" as const,
        sourceLineType: "payment_claim_retention" as const,
        sourceLineId: "11111111-1111-4111-8111-111111111111",
        originatingPaymentClaimId: "22222222-2222-4222-8222-222222222222",
        description: "Retention from 26028-CL-01",
        quantity: 1 as const,
        unitAmountMinor: 10_000,
        lineAmountMinor: 10_000,
        taxMinor: 1_500,
        totalMinor: 11_500,
        accountSnapshot: { accountCode: "700" },
        taxSnapshot: { taxType: "OUTPUT2" },
        trackingSnapshot: {},
        sourceSnapshot: {},
      }],
      payload,
      pdfBytes: new TextEncoder().encode("%PDF-deterministic"),
    };
    expect(calculateRetentionClaimPushHashes(input))
      .toEqual(calculateRetentionClaimPushHashes(input));
  });

  it("changes the preview hash when a dependency changes", () => {
    const common = {
      sourceEvidence: { claim: "26028-RC-01" },
      commercialSnapshot: { totalMinor: 11_500 },
      lines: [],
      payload,
      pdfBytes: new TextEncoder().encode("%PDF-deterministic"),
    };
    expect(calculateRetentionClaimPushHashes({
      ...common,
      dependencies: { tenant: "tenant-1" },
    }).previewHash).not.toBe(calculateRetentionClaimPushHashes({
      ...common,
      dependencies: { tenant: "tenant-2" },
    }).previewHash);
  });
});
