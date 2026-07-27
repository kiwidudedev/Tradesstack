const MONEY_TOLERANCE = 0.01;

export type PurchaseOrderStatusPresentation = {
  label: "No payments" | "Partially paid" | "Fully paid" | "Overpaid" | "Payment status unavailable";
  paidPercent: number;
  outstandingPercent: number;
  overpaidPercent: number;
  paidBarPercent: number;
  outstandingBarPercent: number;
};

export type PurchaseOrderPaymentProgressFillPresentation = {
  variant: "empty" | "partial" | "complete";
  paidBarPercent: number;
};

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function safePercent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= MONEY_TOLERANCE) return 0;
  return roundPercent((value / total) * 100);
}

export function derivePurchaseOrderStatusPresentation(params: {
  purchaseOrderValue: number;
  paidAgainstPurchaseOrder: number;
  outstandingAgainstPurchaseOrder: number;
  overpaidAmount: number;
  paymentStatus: "no_payments" | "partially_paid" | "fully_paid" | "overpaid" | "unavailable";
}): PurchaseOrderStatusPresentation {
  const paidPercent = safePercent(params.paidAgainstPurchaseOrder, params.purchaseOrderValue);
  const outstandingPercent = params.purchaseOrderValue <= MONEY_TOLERANCE
    ? 0
    : safePercent(Math.max(0, params.outstandingAgainstPurchaseOrder), params.purchaseOrderValue);
  const overpaidPercent = safePercent(Math.max(0, params.overpaidAmount), params.purchaseOrderValue);
  const paidBarPercent = Math.min(100, Math.max(0, paidPercent));
  const outstandingBarPercent = Math.min(
    Math.max(0, 100 - paidBarPercent),
    Math.max(0, outstandingPercent)
  );

  const label = params.paymentStatus === "overpaid"
    ? "Overpaid"
    : params.paymentStatus === "fully_paid"
      ? "Fully paid"
      : params.paymentStatus === "partially_paid"
        ? "Partially paid"
        : params.paymentStatus === "unavailable"
          ? "Payment status unavailable"
          : "No payments";

  return {
    label,
    paidPercent,
    outstandingPercent,
    overpaidPercent,
    paidBarPercent,
    outstandingBarPercent,
  };
}

export function derivePurchaseOrderPaymentProgressFillPresentation(params: {
  paidPercent: number;
  paymentStatus: "no_payments" | "partially_paid" | "fully_paid" | "overpaid" | "unavailable";
}): PurchaseOrderPaymentProgressFillPresentation {
  const paidBarPercent = Math.min(100, Math.max(0, params.paidPercent));

  if (params.paymentStatus === "fully_paid" || params.paymentStatus === "overpaid" || paidBarPercent >= 100) {
    return {
      variant: "complete",
      paidBarPercent: 100,
    };
  }

  if (paidBarPercent <= 0 || params.paymentStatus === "no_payments" || params.paymentStatus === "unavailable") {
    return {
      variant: "empty",
      paidBarPercent: 0,
    };
  }

  return {
    variant: "partial",
    paidBarPercent,
  };
}

export function deriveBillPurchaseOrderAllocationPercent(params: {
  allocatedAmount: number;
  purchaseOrderValue: number;
}) {
  return safePercent(params.allocatedAmount, params.purchaseOrderValue);
}
