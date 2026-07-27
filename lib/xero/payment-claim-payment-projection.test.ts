import { describe, expect, it } from "vitest";

import {
  deriveProjectClaimPaymentProjection,
  projectXeroPaidAmountToClaimBasis,
  type ProjectClaimPaymentProjectionInput,
} from "./payment-claim-payment-projection";

function input(overrides: Partial<ProjectClaimPaymentProjectionInput> = {}): ProjectClaimPaymentProjectionInput {
  return {
    currentStatus: "Submitted",
    dueDate: "2026-07-30",
    claimAmount: 13_835.38,
    totalPayable: 14_319.62,
    invoiceTotal: 14_319.62,
    amountPaid: 0,
    amountDue: 14_319.62,
    hasValidPaidEvidence: false,
    attentionRequired: false,
    asOfDate: "2026-07-22",
    ...overrides,
  };
}

describe("Xero payment projection into the existing Payment Claim workflow", () => {
  it("moves a Submitted linked claim to Unpaid before its due date", () => {
    expect(deriveProjectClaimPaymentProjection(input())).toMatchObject({
      shouldApply: true, status: "Unpaid", paidAmount: 0,
    });
  });

  it("moves a fully paid linked claim to Paid", () => {
    expect(deriveProjectClaimPaymentProjection(input({
      amountPaid: 14_319.62, amountDue: 0, hasValidPaidEvidence: true,
    }))).toMatchObject({ shouldApply: true, status: "Paid", paidAmount: 13_835.38 });
  });

  it("keeps partial payment Unpaid before the due date and projects exact claim-basis paid value", () => {
    expect(deriveProjectClaimPaymentProjection(input({ amountPaid: 7_159.81, amountDue: 7_159.81 }))).toMatchObject({
      status: "Unpaid", paidAmount: 6_917.69,
    });
  });

  it("makes partial payment Overdue after the due date", () => {
    expect(deriveProjectClaimPaymentProjection(input({
      dueDate: "2026-07-21", amountPaid: 7_159.81, amountDue: 7_159.81,
    }))).toMatchObject({ status: "Overdue", paidAmount: 6_917.69 });
  });

  it.each([
    ["before due date", "2026-07-30", "Unpaid"],
    ["past due date", "2026-07-21", "Overdue"],
  ] as const)("reverses Paid to the correct status %s", (_label, dueDate, status) => {
    expect(deriveProjectClaimPaymentProjection(input({
      currentStatus: "Paid", dueDate, amountPaid: 0, amountDue: 14_319.62,
    }))).toMatchObject({ shouldApply: true, status, paidAmount: 0 });
  });

  it.each(["Draft", "Cancelled"] as const)("never changes a protected %s claim", (currentStatus) => {
    expect(deriveProjectClaimPaymentProjection(input({
      currentStatus, amountPaid: 14_319.62, amountDue: 0, hasValidPaidEvidence: true,
    }))).toEqual({ shouldApply: false, status: currentStatus, paidAmount: null, reason: "protected_status" });
  });

  it("does not change the claim for voided, deleted, divergent, or invalid payment state", () => {
    expect(deriveProjectClaimPaymentProjection(input({ attentionRequired: true }))).toEqual({
      shouldApply: false, status: "Submitted", paidAmount: null, reason: "attention_required",
    });
  });

  it("supports valid fully credited paid evidence without inventing cash paid", () => {
    expect(deriveProjectClaimPaymentProjection(input({
      amountPaid: 0, amountDue: 0, hasValidPaidEvidence: true,
    }))).toMatchObject({ shouldApply: true, status: "Paid", paidAmount: 0 });
  });
});

describe("minor-unit monetary basis", () => {
  it("maps Xero tax-inclusive paid value to existing GST-exclusive gross claim basis", () => {
    expect(projectXeroPaidAmountToClaimBasis({
      claimAmount: 13_835.38,
      totalPayable: 14_319.62,
      invoiceTotal: 14_319.62,
      amountPaid: 7_159.81,
    })).toBe(6_917.69);
  });

  it("uses authoritative totals and rejects divergence instead of approximate GST division", () => {
    expect(() => projectXeroPaidAmountToClaimBasis({
      claimAmount: 1_000, totalPayable: 1_035, invoiceTotal: 1_050, amountPaid: 500,
    })).toThrow(/does not match/);
  });

  it("replaces legacy linked paid_amount rather than adding to it", () => {
    const projection = deriveProjectClaimPaymentProjection(input({
      amountPaid: 7_159.81,
      amountDue: 7_159.81,
    }));
    expect(projection.paidAmount).toBe(6_917.69);
    expect(projection.paidAmount).not.toBe(6_917.69 + 500);
  });
});
