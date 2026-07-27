export type SupplierInvoicePurchaseOrderLineAmounts = {
  poLineValue: number;
  previouslyInvoiced: number;
  thisInvoice: number;
  totalInvoiced: number;
  remaining: number;
  percentage: number;
  displayedPercentage: number;
  progressState: "incomplete" | "complete" | "over";
};

export function deriveSupplierInvoicePurchaseOrderLineAmounts(params: {
  poLineValue: number;
  authoritativePreviouslyInvoiced: number;
  currentInvoiceAllocationAmounts: number[];
}): SupplierInvoicePurchaseOrderLineAmounts {
  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const poLineValue = Number.isFinite(params.poLineValue) ? params.poLineValue : 0;
  const previouslyInvoiced = Number.isFinite(params.authoritativePreviouslyInvoiced)
    ? params.authoritativePreviouslyInvoiced
    : 0;
  const thisInvoice = roundMoney(params.currentInvoiceAllocationAmounts.reduce(
    (sum, amount) => sum + (Number.isFinite(amount) ? amount : 0),
    0
  ));
  const totalInvoiced = roundMoney(previouslyInvoiced + thisInvoice);
  const remaining = roundMoney(poLineValue - totalInvoiced);
  const percentage = poLineValue > 0 ? (totalInvoiced / poLineValue) * 100 : 0;
  const displayedPercentage = Math.max(0, Math.min(100, percentage));
  const progressState = percentage > 100.0001
    ? "over"
    : percentage >= 99.9999
      ? "complete"
      : "incomplete";

  return {
    poLineValue,
    previouslyInvoiced,
    thisInvoice,
    totalInvoiced,
    remaining,
    percentage,
    displayedPercentage,
    progressState,
  };
}

export function isActiveSupplierInvoicePurchaseOrderMatch(matchStatus: string) {
  return matchStatus === "accepted" || matchStatus === "adjusted";
}

export function deriveSupplierInvoicePreviewThisInvoiceAmount(params: {
  persistedThisInvoice: number;
  activeSourceAllocationAmount: number;
  previewAmount: number;
  isPreviewActive: boolean;
  isPreviewTarget: boolean;
}) {
  const persistedThisInvoice = Number.isFinite(params.persistedThisInvoice)
    ? params.persistedThisInvoice
    : 0;
  const activeSourceAllocationAmount = Number.isFinite(params.activeSourceAllocationAmount)
    ? params.activeSourceAllocationAmount
    : 0;
  const previewAmount = Number.isFinite(params.previewAmount) ? params.previewAmount : 0;
  const withoutActiveSource = Math.max(0, persistedThisInvoice - activeSourceAllocationAmount);

  if (!params.isPreviewActive) {
    return withoutActiveSource + activeSourceAllocationAmount;
  }

  return withoutActiveSource + (params.isPreviewTarget ? previewAmount : 0);
}
