export const COMMERCIAL_TOLERANCE = {
  quantity: 0.001,
  money: 0.01,
  rate: 0.0001,
} as const;

export type CommercialVarianceType =
  | "quantity_variance"
  | "rate_variance"
  | "value_variance"
  | "over_invoiced_quantity"
  | "over_invoiced_value"
  | "supplier_mismatch"
  | "tax_variance"
  | "unexpected_line"
  | "duplicate_invoice"
  | "missing_invoice_number"
  | "unallocated_amount"
  | "missing_accounting_mapping"
  | "missing_tax_treatment"
  | "partial_invoice"
  | "multiple_purchase_orders"
  | "final_invoice_below_commitment";

export type CommercialVarianceSeverity = "information" | "warning" | "blocking";

export type CommercialVariance = {
  key: string;
  type: CommercialVarianceType;
  severity: CommercialVarianceSeverity;
  message: string;
  invoiceLineId: string | null;
  allocationId: string | null;
  purchaseOrderId: string | null;
  purchaseOrderLineItemId: string | null;
  expectedValue: number | string | null;
  actualValue: number | string | null;
  varianceAmount: number | null;
};

export type PurchaseOrderLineProgressInput = {
  id: string;
  purchaseOrderId: string;
  description: string;
  orderedQuantity: number;
  orderedRate: number;
  orderedValue: number;
  previouslyApprovedQuantity: number;
  previouslyApprovedValue: number;
  currentQuantity: number;
  currentValue: number;
  currentUnitRate: number | null;
};

export type PurchaseOrderLineInvoicingProgress = PurchaseOrderLineProgressInput & {
  remainingQuantityBeforeCurrent: number;
  remainingValueBeforeCurrent: number;
  projectedRemainingQuantity: number;
  projectedRemainingValue: number;
  overInvoicedQuantity: number;
  overInvoicedValue: number;
  releasedCommitmentValue: number;
  reportingRemainingValue: number;
};

export type PurchaseOrderInvoicingState =
  | "not_invoiced"
  | "partially_invoiced"
  | "fully_invoiced"
  | "over_invoiced";

export type SupplierInvoiceTaxResolutionStatus =
  | "resolved"
  | "not_applicable"
  | "unresolved";

function round(value: number, precision: number) {
  const multiplier = 10 ** precision;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function calculateSupplierInvoiceLineTax(params: {
  lineAmount: number;
  taxResolutionStatus: SupplierInvoiceTaxResolutionStatus;
  effectiveRate: number | null;
}) {
  if (params.taxResolutionStatus === "not_applicable") {
    return 0;
  }
  if (
    params.taxResolutionStatus !== "resolved" ||
    params.effectiveRate === null ||
    !Number.isFinite(params.effectiveRate) ||
    params.effectiveRate < 0 ||
    !Number.isFinite(params.lineAmount) ||
    params.lineAmount < 0
  ) {
    return null;
  }
  return round((params.lineAmount * params.effectiveRate) / 100, 2);
}

export function normalizeSupplierInvoiceNumber(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeCommercialLineDescription(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s*\(\s*remaining\s+balance\s*\)\s*$/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function calculatePurchaseOrderLineInvoicingProgress(
  input: PurchaseOrderLineProgressInput
): PurchaseOrderLineInvoicingProgress {
  const remainingQuantityBeforeCurrent = round(
    input.orderedQuantity - input.previouslyApprovedQuantity,
    3
  );
  const remainingValueBeforeCurrent = round(
    input.orderedValue - input.previouslyApprovedValue,
    2
  );
  const projectedRemainingQuantity = round(
    remainingQuantityBeforeCurrent - input.currentQuantity,
    3
  );
  const projectedRemainingValue = round(
    remainingValueBeforeCurrent - input.currentValue,
    2
  );

  return {
    ...input,
    remainingQuantityBeforeCurrent,
    remainingValueBeforeCurrent,
    projectedRemainingQuantity,
    projectedRemainingValue,
    overInvoicedQuantity: round(Math.max(0, -projectedRemainingQuantity), 3),
    overInvoicedValue: round(Math.max(0, -projectedRemainingValue), 2),
    releasedCommitmentValue: 0,
    reportingRemainingValue: projectedRemainingValue,
  };
}

export function derivePurchaseOrderInvoicingState(params: {
  currentPurchaseOrderValue: number;
  commerciallyApprovedInvoiceValue: number;
}): PurchaseOrderInvoicingState {
  if (params.commerciallyApprovedInvoiceValue <= COMMERCIAL_TOLERANCE.money) {
    return "not_invoiced";
  }
  const difference =
    params.currentPurchaseOrderValue - params.commerciallyApprovedInvoiceValue;
  if (difference < -COMMERCIAL_TOLERANCE.money) {
    return "over_invoiced";
  }
  if (Math.abs(difference) <= COMMERCIAL_TOLERANCE.money) {
    return "fully_invoiced";
  }
  return "partially_invoiced";
}

export function sortPurchaseOrderProgressLines(
  lines: PurchaseOrderLineInvoicingProgress[],
  sortOrderByLineId: ReadonlyMap<string, number>
) {
  return [...lines].sort((left, right) => {
    const orderDifference =
      (sortOrderByLineId.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (sortOrderByLineId.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    return orderDifference || left.id.localeCompare(right.id);
  });
}

export function isCommercialSnapshotHistoricalForInvoice(params: {
  snapshotInvoiceId: string;
  currentInvoiceId: string;
  snapshotApprovedAt: string;
  currentApprovalApprovedAt: string | null;
}) {
  if (params.snapshotInvoiceId === params.currentInvoiceId) {
    return false;
  }
  return (
    params.currentApprovalApprovedAt === null ||
    params.snapshotApprovedAt < params.currentApprovalApprovedAt
  );
}

export function buildLineCommercialVariances(
  line: PurchaseOrderLineInvoicingProgress
): CommercialVariance[] {
  const variances: CommercialVariance[] = [];
  const makeKey = (type: CommercialVarianceType) =>
    [type, line.id].join(":");

  if (
    line.currentUnitRate !== null &&
    Math.abs(line.currentUnitRate - line.orderedRate) > COMMERCIAL_TOLERANCE.rate
  ) {
    variances.push({
      key: makeKey("rate_variance"),
      type: "rate_variance",
      severity: "warning",
      message: `Invoice rate differs from the PO rate for ${line.description}.`,
      invoiceLineId: null,
      allocationId: null,
      purchaseOrderId: line.purchaseOrderId,
      purchaseOrderLineItemId: line.id,
      expectedValue: line.orderedRate,
      actualValue: line.currentUnitRate,
      varianceAmount: round(line.currentUnitRate - line.orderedRate, 4),
    });
  }

  if (line.overInvoicedQuantity > COMMERCIAL_TOLERANCE.quantity) {
    variances.push({
      key: makeKey("over_invoiced_quantity"),
      type: "over_invoiced_quantity",
      severity: "blocking",
      message: `The invoiced quantity exceeds the PO quantity for ${line.description}.`,
      invoiceLineId: null,
      allocationId: null,
      purchaseOrderId: line.purchaseOrderId,
      purchaseOrderLineItemId: line.id,
      expectedValue: line.orderedQuantity,
      actualValue:
        line.previouslyApprovedQuantity + line.currentQuantity,
      varianceAmount: line.overInvoicedQuantity,
    });
  }

  if (line.overInvoicedValue > COMMERCIAL_TOLERANCE.money) {
    variances.push({
      key: makeKey("over_invoiced_value"),
      type: "over_invoiced_value",
      severity: "blocking",
      message: `The invoiced value exceeds the PO line value for ${line.description}.`,
      invoiceLineId: null,
      allocationId: null,
      purchaseOrderId: line.purchaseOrderId,
      purchaseOrderLineItemId: line.id,
      expectedValue: line.orderedValue,
      actualValue: line.previouslyApprovedValue + line.currentValue,
      varianceAmount: line.overInvoicedValue,
    });
  }

  const expectedCurrentValue = round(line.currentQuantity * line.orderedRate, 2);
  if (
    line.currentQuantity > 0 &&
    Math.abs(line.currentValue - expectedCurrentValue) > COMMERCIAL_TOLERANCE.money
  ) {
    variances.push({
      key: makeKey("value_variance"),
      type: "value_variance",
      severity: "warning",
      message: `Invoice value does not equal quantity multiplied by the PO rate for ${line.description}.`,
      invoiceLineId: null,
      allocationId: null,
      purchaseOrderId: line.purchaseOrderId,
      purchaseOrderLineItemId: line.id,
      expectedValue: expectedCurrentValue,
      actualValue: line.currentValue,
      varianceAmount: round(line.currentValue - expectedCurrentValue, 2),
    });
  }

  return variances;
}

export function summarizeProjectProcurementCommitments(
  purchaseOrders: Array<{
    currentPurchaseOrderValue: number;
    approvedInvoicedValue: number;
    releasedCommitmentValue: number;
    postedActualCost: number;
  }>
) {
  return purchaseOrders.reduce<{
    currentPurchaseOrderValue: number;
    approvedInvoicedValue: number;
    releasedCommitmentValue: number;
    remainingCommitment: number;
    postedActualCost: number;
    unpostedApprovedInvoiceValue: number;
  }>(
    (summary, purchaseOrder) => {
      summary.currentPurchaseOrderValue = round(
        summary.currentPurchaseOrderValue +
          purchaseOrder.currentPurchaseOrderValue,
        2
      );
      summary.approvedInvoicedValue = round(
        summary.approvedInvoicedValue + purchaseOrder.approvedInvoicedValue,
        2
      );
      summary.releasedCommitmentValue = round(
        summary.releasedCommitmentValue +
          purchaseOrder.releasedCommitmentValue,
        2
      );
      summary.remainingCommitment = round(
        summary.remainingCommitment +
          purchaseOrder.currentPurchaseOrderValue -
          purchaseOrder.approvedInvoicedValue -
          purchaseOrder.releasedCommitmentValue,
        2
      );
      summary.postedActualCost = round(
        summary.postedActualCost + purchaseOrder.postedActualCost,
        2
      );
      summary.unpostedApprovedInvoiceValue = round(
        summary.unpostedApprovedInvoiceValue +
          Math.max(
            0,
            purchaseOrder.approvedInvoicedValue -
              purchaseOrder.postedActualCost
          ),
        2
      );
      return summary;
    },
    {
      currentPurchaseOrderValue: 0,
      approvedInvoicedValue: 0,
      releasedCommitmentValue: 0,
      remainingCommitment: 0,
      postedActualCost: 0,
      unpostedApprovedInvoiceValue: 0,
    }
  );
}
