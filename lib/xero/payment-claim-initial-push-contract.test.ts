import { describe, expect, it } from "vitest";
import {
  buildInitialPushLineEvidence,
  calculateInitialPushHashes,
  initialPushProposalMatchesToken,
  matchesInitialPushRecoveryCandidate,
  verifyInitialPushXeroInvoice,
} from "./payment-claim-initial-push-contract";
import type { PaymentClaimXeroSalesInvoicePayload } from "./payment-claim-sales-invoice-payload";

const payload: PaymentClaimXeroSalesInvoicePayload = {
  Type: "ACCREC",
  Status: "AUTHORISED",
  InvoiceNumber: "26028-PC-01",
  Reference: "Project A | Claim PC-012",
  Date: "2026-07-25",
  DueDate: "2026-08-20",
  CurrencyCode: "NZD",
  LineAmountTypes: "Exclusive",
  Contact: { ContactID: "contact-1" },
  LineItems: [{
    Description: "Payment Claim PC-012 — July",
    Quantity: 1,
    UnitAmount: 1000,
    AccountCode: "200",
    TaxType: "OUTPUT2",
  }, {
    Description: "Retention withheld — Payment Claim PC-012",
    Quantity: 1,
    UnitAmount: -100,
    AccountCode: "700",
    TaxType: "OUTPUT2",
  }],
};

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    InvoiceID: "invoice-1",
    Type: "ACCREC",
    Status: "AUTHORISED",
    InvoiceNumber: "26028-PC-01",
    Reference: "Project A | Claim PC-012",
    Date: "2026-07-25",
    DueDate: "2026-08-20",
    CurrencyCode: "NZD",
    LineAmountTypes: "Exclusive",
    Contact: { ContactID: "contact-1" },
    LineItems: [
      { ...payload.LineItems[0], LineAmount: 1000 },
      { ...payload.LineItems[1], LineAmount: -100 },
    ],
    SubTotal: 900,
    TotalTax: 135,
    Total: 1035,
    AmountPaid: 0,
    AmountCredited: 0,
    Payments: [],
    CreditNotes: [],
    ...overrides,
  };
}

describe("Payment Claim immutable initial push contract", () => {
  it("freezes ordered signed retention lines and reconciled tax", () => {
    const lines = buildInitialPushLineEvidence({
      claimId: "claim-1",
      payload,
      subtotalMinor: 90_000,
      taxMinor: 13_500,
    });
    expect(lines.map((line) => line.sequence)).toEqual([1, 2]);
    expect(lines[1]).toMatchObject({
      lineKind: "retention",
      lineAmountMinor: -10_000,
      taxMinor: -1_500,
      totalMinor: -11_500,
    });
  });

  it("hashes source, payload, lines and exact PDF bytes", () => {
    const lines = buildInitialPushLineEvidence({
      claimId: "claim-1", payload, subtotalMinor: 90_000, taxMinor: 13_500,
    });
    const first = calculateInitialPushHashes({
      sourceEvidence: { claimId: "claim-1" },
      commercialSnapshot: { totalMinor: 103_500 },
      lines,
      readinessEvidence: { tenantId: "tenant-1" },
      payloadTemplate: payload,
      pdfBytes: new TextEncoder().encode("%PDF-exact"),
    });
    const changed = calculateInitialPushHashes({
      sourceEvidence: { claimId: "claim-1" },
      commercialSnapshot: { totalMinor: 103_500 },
      lines,
      readinessEvidence: { tenantId: "tenant-1" },
      payloadTemplate: payload,
      pdfBytes: new TextEncoder().encode("%PDF-changed"),
    });
    expect(first.pdfHash).not.toBe(changed.pdfHash);
    expect(first.previewHash).not.toBe(changed.previewHash);
  });

  it("accepts an unchanged proposal token and rejects genuine preview or project changes", () => {
    const proposal = { projectId: "project-1", previewHash: "preview-1" };
    expect(initialPushProposalMatchesToken({
      proposal,
      token: { projectId: "project-1", previewHash: "preview-1" },
    })).toBe(true);
    expect(initialPushProposalMatchesToken({
      proposal,
      token: { projectId: "project-1", previewHash: "preview-changed" },
    })).toBe(false);
    expect(initialPushProposalMatchesToken({
      proposal,
      token: { projectId: "project-changed", previewHash: "preview-1" },
    })).toBe(false);
  });

  it("changes the preview hash for genuine source, dependency, payload, or line evidence changes", () => {
    const lines = buildInitialPushLineEvidence({
      claimId: "claim-1", payload, subtotalMinor: 90_000, taxMinor: 13_500,
    });
    const base = {
      sourceEvidence: { claimId: "claim-1", amountMinor: 100_000 },
      commercialSnapshot: { totalMinor: 103_500 },
      lines,
      readinessEvidence: { tenantId: "tenant-1", contactUpdatedAt: "2026-07-01T00:00:00Z" },
      payloadTemplate: payload,
      pdfBytes: new TextEncoder().encode("%PDF-deterministic"),
    };
    const first = calculateInitialPushHashes(base);
    const changes = [
      calculateInitialPushHashes({
        ...base,
        sourceEvidence: { ...base.sourceEvidence, amountMinor: 100_001 },
      }),
      calculateInitialPushHashes({
        ...base,
        readinessEvidence: { ...base.readinessEvidence, contactUpdatedAt: "2026-07-02T00:00:00Z" },
      }),
      calculateInitialPushHashes({
        ...base,
        payloadTemplate: { ...payload, DueDate: "2026-08-21" },
      }),
      calculateInitialPushHashes({
        ...base,
        lines: lines.map((line, index) =>
          index === 0 ? { ...line, description: "Changed line evidence" } : line),
      }),
    ];
    expect(changes.every((changed) => changed.previewHash !== first.previewHash)).toBe(true);
  });

  it("accepts only a complete equivalent authorised ACCREC response", () => {
    expect(verifyInitialPushXeroInvoice({
      expected: payload,
      actual: invoice(),
      expectedTotals: { subtotalMinor: 90_000, taxMinor: 13_500, totalMinor: 103_500 },
    })).toEqual({ exact: true, reasons: [] });
  });

  it("preserves a historical CL claim number as the immutable Xero identity", () => {
    const historicalPayload = { ...payload, InvoiceNumber: "26028-CL-01" };
    expect(verifyInitialPushXeroInvoice({
      expected: historicalPayload,
      actual: invoice({ InvoiceNumber: "26028-CL-01" }),
      expectedTotals: { subtotalMinor: 90_000, taxMinor: 13_500, totalMinor: 103_500 },
    })).toEqual({ exact: true, reasons: [] });
  });

  it("recovers only the same claim number, contact and totals", () => {
    const expectedTotals = { subtotalMinor: 90_000, taxMinor: 13_500, totalMinor: 103_500 };
    expect(matchesInitialPushRecoveryCandidate({
      expected: payload,
      candidate: invoice(),
      expectedTotals,
    })).toBe(true);
    expect(matchesInitialPushRecoveryCandidate({
      expected: payload,
      candidate: invoice({ Contact: { ContactID: "other" } }),
      expectedTotals,
    })).toBe(false);
    expect(matchesInitialPushRecoveryCandidate({
      expected: payload,
      candidate: invoice({ Total: 1034 }),
      expectedTotals,
    })).toBe(false);
  });

  it.each([
    ["DRAFT status", { Status: "DRAFT" }, "wrong_status"],
    ["SUBMITTED status", { Status: "SUBMITTED" }, "wrong_status"],
    ["wrong contact", { Contact: { ContactID: "other" } }, "wrong_contact"],
    ["wrong invoice number", { InvoiceNumber: "TSI-00000001" }, "wrong_number"],
    ["wrong subtotal", { SubTotal: 901 }, "wrong_subtotal"],
    ["wrong GST", { TotalTax: 134 }, "wrong_tax"],
    ["wrong total", { Total: 1034 }, "wrong_total"],
    ["paid invoice", { AmountPaid: 1, Payments: [{ PaymentID: "p-1" }] }, "amount_paid_not_zero"],
  ])("rejects %s", (_label, override, reason) => {
    const result = verifyInitialPushXeroInvoice({
      expected: payload,
      actual: invoice(override),
      expectedTotals: { subtotalMinor: 90_000, taxMinor: 13_500, totalMinor: 103_500 },
    });
    expect(result.exact).toBe(false);
    expect(result.reasons).toContain(reason);
  });
});
