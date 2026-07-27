import { describe, expect, it } from "vitest";

import { derivePaymentClaimRegisterMetrics } from "./payment-claim-register-summary";

describe("existing Payment Claim register payment cards", () => {
  it("updates Paid, Outstanding, and counts from existing status and paid_amount fields", () => {
    const before = derivePaymentClaimRegisterMetrics([
      { status: "Unpaid", claim_amount: 1_000, paid_amount: 0 },
      { status: "Overdue", claim_amount: 500, paid_amount: 100 },
    ]);
    expect(before).toMatchObject({ paidValue: 0, outstanding: 1_400, paidClaimsCount: 0, unpaidClaimsCount: 2 });

    const after = derivePaymentClaimRegisterMetrics([
      { status: "Paid", claim_amount: 1_000, paid_amount: 1_000 },
      { status: "Overdue", claim_amount: 500, paid_amount: 100 },
    ]);
    expect(after).toMatchObject({ paidValue: 1_000, outstanding: 400, paidClaimsCount: 1, unpaidClaimsCount: 1 });
  });

  it("excludes Draft and Cancelled claims from payment totals and counts", () => {
    expect(derivePaymentClaimRegisterMetrics([
      { status: "Draft", claim_amount: 2_000, paid_amount: 500 },
      { status: "Cancelled", claim_amount: 3_000, paid_amount: 1_000 },
    ])).toMatchObject({ paidValue: 0, dueValue: 0, overdueValue: 0, outstanding: 0, unpaidClaimsCount: 0 });
  });
});
