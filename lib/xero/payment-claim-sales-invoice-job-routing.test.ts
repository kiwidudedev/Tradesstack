import { describe, expect, it } from "vitest";

import { selectPaymentClaimSalesInvoiceSyncMode } from "./payment-claim-sales-invoice-job-routing";

describe("Payment Claim Sales Invoice sync job routing", () => {
  it.each([null, undefined, "", "   "])("routes a missing InvoiceID (%s) to Stage 5 create", (value) => {
    expect(selectPaymentClaimSalesInvoiceSyncMode(value)).toBe("create");
  });

  it("routes an existing InvoiceID to Stage 6 update", () => {
    expect(selectPaymentClaimSalesInvoiceSyncMode("invoice-1")).toBe("update");
  });
});
