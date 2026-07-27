import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildPaymentClaimXeroCurrentStateHashFromPayload } from "./payment-claim-sales-invoice-hash";
import type { PaymentClaimXeroPayloadResult } from "./payment-claim-sales-invoice-payload";
import type { PaymentClaimXeroReadinessSnapshot } from "./payment-claim-readiness";

const snapshot = {
  organization: { id: "org-1" },
  claim: {
    id: "claim-1",
    claim_title: "Progress to July",
    status: "Submitted",
    claim_amount: 1000,
    retention_withheld_amount: 100,
    retention_released_amount: 0,
    net_claim_excl_gst: 900,
    gst_amount: 135,
    total_payable: 1035,
    internal_note: "ignore me",
  },
  project: { id: "project-1" },
  client: { id: "client-1" },
  connection: null,
  contactLinks: [],
  importedContacts: [],
  mappings: [],
  costCodes: [],
  taxRates: [],
  accountingDocuments: [],
} satisfies PaymentClaimXeroReadinessSnapshot;

const payloadResult: PaymentClaimXeroPayloadResult = {
  payload: {
    Type: "ACCREC",
    Contact: { ContactID: "contact-1" },
    InvoiceNumber: "PC-0042",
    Reference: "Harbour Apartments | Claim PC-0042",
    Date: "2026-07-20",
    DueDate: "2026-08-20",
    CurrencyCode: "NZD",
    LineAmountTypes: "Exclusive",
    Status: "AUTHORISED",
    LineItems: [
      { Description: "Revenue", Quantity: 1, UnitAmount: 1000, AccountCode: "200", TaxType: "OUTPUT" },
      { Description: "Retention", Quantity: 1, UnitAmount: -100, AccountCode: "620", TaxType: "OUTPUT" },
    ],
  },
  reconciliation: { revenueAmount: 1000, signedRetentionAmount: -100, subtotal: 900, gst: 135, total: 1035 },
};

describe("Payment Claim Xero current-state hash", () => {
  it("is deterministic and ignores fields outside the authoritative invoice state", () => {
    const first = buildPaymentClaimXeroCurrentStateHashFromPayload({ snapshot, payloadResult });
    const second = buildPaymentClaimXeroCurrentStateHashFromPayload({
      snapshot: { ...snapshot, claim: { ...snapshot.claim, internal_note: "changed", updated_at: "later" } },
      payloadResult,
    });
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["claim", { ...snapshot, claim: { ...snapshot.claim, id: "claim-2" } }, payloadResult],
    ["claim number and reference", snapshot, {
      ...payloadResult,
      payload: { ...payloadResult.payload, InvoiceNumber: "PC-0043", Reference: "Harbour Apartments | Claim PC-0043" },
    }],
    ["claim title", { ...snapshot, claim: { ...snapshot.claim, claim_title: "August progress" } }, {
      ...payloadResult,
      payload: {
        ...payloadResult.payload,
        LineItems: [{ ...payloadResult.payload.LineItems[0], Description: "August progress" }, payloadResult.payload.LineItems[1]],
      },
    }],
    ["client", { ...snapshot, client: { id: "client-2" } }, payloadResult],
    ["contact", snapshot, { ...payloadResult, payload: { ...payloadResult.payload, Contact: { ContactID: "contact-2" } } }],
    ["date", snapshot, { ...payloadResult, payload: { ...payloadResult.payload, DueDate: "2026-08-21" } }],
    ["financial", { ...snapshot, claim: { ...snapshot.claim, total_payable: 1036 } }, {
      ...payloadResult, reconciliation: { ...payloadResult.reconciliation, total: 1036 },
    }],
    ["TaxType", snapshot, {
      ...payloadResult,
      payload: {
        ...payloadResult.payload,
        LineItems: payloadResult.payload.LineItems.map((line) => ({ ...line, TaxType: "OUTPUT2" })),
      },
    }],
    ["account", snapshot, {
      ...payloadResult,
      payload: {
        ...payloadResult.payload,
        LineItems: [{ ...payloadResult.payload.LineItems[0], AccountCode: "201" }, payloadResult.payload.LineItems[1]],
      },
    }],
  ])("changes when the authoritative %s state changes", (_label, nextSnapshot, nextPayload) => {
    const baseline = buildPaymentClaimXeroCurrentStateHashFromPayload({ snapshot, payloadResult });
    const changed = buildPaymentClaimXeroCurrentStateHashFromPayload({
      snapshot: nextSnapshot as PaymentClaimXeroReadinessSnapshot,
      payloadResult: nextPayload as PaymentClaimXeroPayloadResult,
    });
    expect(changed.hash).not.toBe(baseline.hash);
  });

  it("includes withheld and released amounts independently even when their signed net is unchanged", () => {
    const baseline = buildPaymentClaimXeroCurrentStateHashFromPayload({ snapshot, payloadResult });
    const changed = buildPaymentClaimXeroCurrentStateHashFromPayload({
      snapshot: {
        ...snapshot,
        claim: {
          ...snapshot.claim,
          retention_withheld_amount: 110,
          retention_released_amount: 10,
        },
      },
      payloadResult,
    });
    expect(changed.hash).not.toBe(baseline.hash);
  });

  it("omits retention AccountCode when the payload has no retention line", () => {
    const result = buildPaymentClaimXeroCurrentStateHashFromPayload({
      snapshot,
      payloadResult: {
        payload: { ...payloadResult.payload, LineItems: [payloadResult.payload.LineItems[0]] },
        reconciliation: { ...payloadResult.reconciliation, signedRetentionAmount: 0, subtotal: 1000 },
      },
    });
    expect(result.canonicalState.retentionAccountCode).toBeNull();
  });
});
