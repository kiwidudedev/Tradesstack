export const SUPPLIER_BILL_REFRESH_REASON_CODES = [
  "supplier_bill_created",
  "supplier_bill_header_changed",
  "supplier_bill_lines_changed",
  "supplier_bill_supplier_changed",
  "supplier_bill_project_scope_changed",
  "supplier_bill_document_changed",
  "supplier_bill_extraction_changed",
  "supplier_bill_po_match_changed",
  "supplier_bill_allocation_changed",
  "supplier_bill_routing_changed",
  "supplier_bill_site_review_changed",
  "supplier_bill_accounts_approval_changed",
  "supplier_bill_commercial_approval_changed",
  "supplier_bill_commercial_snapshot_changed",
  "supplier_bill_variance_changed",
  "supplier_bill_actual_cost_changed",
  "supplier_bill_xero_export_changed",
  "supplier_bill_xero_attachment_changed",
  "supplier_bill_payment_changed",
  "supplier_bill_voided",
  "supplier_bill_deleted",
  "supplier_bill_manual_refresh",
] as const;

export type SupplierBillRefreshReasonCode =
  (typeof SUPPLIER_BILL_REFRESH_REASON_CODES)[number];

export const SUPPLIER_BILL_REFRESH_PRIORITIES = Object.freeze({
  low: 10,
  normal: 50,
  high: 80,
  critical: 100,
});

export function isSupplierBillRefreshReasonCode(
  value: unknown,
): value is SupplierBillRefreshReasonCode {
  return (
    typeof value === "string"
    && (SUPPLIER_BILL_REFRESH_REASON_CODES as readonly string[]).includes(value)
  );
}

export function getSupplierBillRefreshPriority(
  reasonCode: SupplierBillRefreshReasonCode,
) {
  if (
    reasonCode === "supplier_bill_deleted"
    || reasonCode === "supplier_bill_voided"
    || reasonCode === "supplier_bill_supplier_changed"
    || reasonCode === "supplier_bill_project_scope_changed"
  ) {
    return SUPPLIER_BILL_REFRESH_PRIORITIES.critical;
  }
  if (
    reasonCode === "supplier_bill_po_match_changed"
    || reasonCode === "supplier_bill_routing_changed"
    || reasonCode === "supplier_bill_site_review_changed"
    || reasonCode === "supplier_bill_accounts_approval_changed"
    || reasonCode === "supplier_bill_commercial_approval_changed"
    || reasonCode === "supplier_bill_commercial_snapshot_changed"
    || reasonCode === "supplier_bill_variance_changed"
    || reasonCode === "supplier_bill_actual_cost_changed"
    || reasonCode === "supplier_bill_xero_export_changed"
    || reasonCode === "supplier_bill_xero_attachment_changed"
    || reasonCode === "supplier_bill_payment_changed"
  ) {
    return SUPPLIER_BILL_REFRESH_PRIORITIES.high;
  }
  if (reasonCode === "supplier_bill_manual_refresh") {
    return SUPPLIER_BILL_REFRESH_PRIORITIES.low;
  }
  return SUPPLIER_BILL_REFRESH_PRIORITIES.normal;
}
