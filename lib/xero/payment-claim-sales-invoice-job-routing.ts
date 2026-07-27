export type PaymentClaimSalesInvoiceSyncMode = "create" | "update";

export function selectPaymentClaimSalesInvoiceSyncMode(
  externalDocumentId: unknown,
): PaymentClaimSalesInvoiceSyncMode {
  return typeof externalDocumentId === "string" && externalDocumentId.trim() ? "update" : "create";
}
