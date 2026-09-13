import { describe, expect, it } from "vitest";
import {
  deriveBillPurchaseOrderAllocationPercent,
  derivePurchaseOrderPaymentProgressFillPresentation,
  derivePurchaseOrderStatusPresentation,
} from "@/lib/purchase-order-commercial-presentation";

describe("Purchase Order commercial presentation", () => {
  it("reconciles paid and outstanding percentages for the PO header card", () => {
    expect(derivePurchaseOrderStatusPresentation({
      purchaseOrderValue: 5_000,
      paidAgainstPurchaseOrder: 700,
      outstandingAgainstPurchaseOrder: 4_300,
      overpaidAmount: 0,
      paymentStatus: "partially_paid",
    })).toEqual({
      label: "Partially paid",
      paidPercent: 14,
      outstandingPercent: 86,
      overpaidPercent: 0,
      paidBarPercent: 14,
      outstandingBarPercent: 86,
    });
  });

  it.each([
    [{ paidAgainstPurchaseOrder: 0, outstandingAgainstPurchaseOrder: 1_000, overpaidAmount: 0, paymentStatus: "no_payments" as const }, "No payments"],
    [{ paidAgainstPurchaseOrder: 1_000, outstandingAgainstPurchaseOrder: 0, overpaidAmount: 0, paymentStatus: "fully_paid" as const }, "Fully paid"],
    [{ paidAgainstPurchaseOrder: 0, outstandingAgainstPurchaseOrder: 0, overpaidAmount: 0, paymentStatus: "unavailable" as const }, "Payment status unavailable"],
  ])("supports boundary and unavailable states", (values, label) => {
    const result = derivePurchaseOrderStatusPresentation({ purchaseOrderValue: 1_000, ...values });
    expect(result.label).toBe(label);
    expect(result.paidBarPercent + result.outstandingBarPercent).toBeLessThanOrEqual(100);
  });

  it("handles zero-value purchase orders without fabricating progress percentages", () => {
    const result = derivePurchaseOrderStatusPresentation({
      purchaseOrderValue: 0,
      paidAgainstPurchaseOrder: 0,
      outstandingAgainstPurchaseOrder: 0,
      overpaidAmount: 0,
      paymentStatus: "fully_paid",
    });
    expect(result).toMatchObject({
      label: "Fully paid",
      paidPercent: 0,
      outstandingPercent: 0,
      paidBarPercent: 0,
      outstandingBarPercent: 0,
    });
  });

  it("renders a grey-only bar when nothing has been paid", () => {
    expect(derivePurchaseOrderPaymentProgressFillPresentation({
      paidPercent: 0,
      paymentStatus: "no_payments",
    })).toEqual({
      variant: "empty",
      paidBarPercent: 0,
    });
  });

  it("renders a yellow in-progress fill for partially paid purchase orders", () => {
    expect(derivePurchaseOrderPaymentProgressFillPresentation({
      paidPercent: 14,
      paymentStatus: "partially_paid",
    })).toEqual({
      variant: "partial",
      paidBarPercent: 14,
    });
  });

  it("renders a solid green bar once fully paid or overpaid", () => {
    expect(derivePurchaseOrderPaymentProgressFillPresentation({
      paidPercent: 100,
      paymentStatus: "fully_paid",
    })).toEqual({
      variant: "complete",
      paidBarPercent: 100,
    });
    expect(derivePurchaseOrderPaymentProgressFillPresentation({
      paidPercent: 125,
      paymentStatus: "overpaid",
    })).toEqual({
      variant: "complete",
      paidBarPercent: 100,
    });
  });

  it("caps the standard bar and reports overpayment separately", () => {
    const result = derivePurchaseOrderStatusPresentation({
      purchaseOrderValue: 1_000,
      paidAgainstPurchaseOrder: 1_250,
      outstandingAgainstPurchaseOrder: 0,
      overpaidAmount: 250,
      paymentStatus: "overpaid",
    });
    expect(result).toMatchObject({
      label: "Overpaid",
      paidPercent: 125,
      paidBarPercent: 100,
      outstandingBarPercent: 0,
      overpaidPercent: 25,
    });
  });

  it.each([
    ["no allocation", 0, 5_000, 0],
    ["partial allocation", 700, 5_000, 14],
    ["full allocation", 5_000, 5_000, 100],
    ["allocation above the PO value", 6_250, 5_000, 125],
    ["zero-value PO", 700, 0, 0],
    ["one-decimal percentage rounding", 1, 3, 33.3],
    ["minor-unit arithmetic", 0.1 + 0.2, 1, 30],
  ] as const)("derives %s from current-PO allocation divided by PO value", (_case, allocatedAmount, purchaseOrderValue, expected) => {
    expect(deriveBillPurchaseOrderAllocationPercent({ allocatedAmount, purchaseOrderValue })).toBe(expected);
  });

  it("returns zero for missing or non-finite runtime values", () => {
    expect(deriveBillPurchaseOrderAllocationPercent({
      allocatedAmount: null as unknown as number,
      purchaseOrderValue: 5_000,
    })).toBe(0);
    expect(deriveBillPurchaseOrderAllocationPercent({
      allocatedAmount: undefined as unknown as number,
      purchaseOrderValue: 5_000,
    })).toBe(0);
    expect(deriveBillPurchaseOrderAllocationPercent({
      allocatedAmount: Number.NaN,
      purchaseOrderValue: 5_000,
    })).toBe(0);
  });
});
