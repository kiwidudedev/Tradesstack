export const XERO_INVOICE_SCOPE = "accounting.invoices";
export const XERO_ATTACHMENT_SCOPE = "accounting.attachments";

export const XERO_INVOICE_SCOPE_RECONNECT_MESSAGE =
  "Reconnect Xero to grant invoice and Bill access.";

export const XERO_ATTACHMENT_SCOPE_RECONNECT_MESSAGE =
  "Reconnect Xero to grant invoice attachment access.";

export function hasXeroInvoiceScope(scopes: readonly string[] | null | undefined) {
  return scopes?.includes(XERO_INVOICE_SCOPE) ?? false;
}

export function getXeroInvoiceScopeStatus(scopes: readonly string[] | null | undefined) {
  return hasXeroInvoiceScope(scopes)
    ? `${XERO_INVOICE_SCOPE} granted`
    : XERO_INVOICE_SCOPE_RECONNECT_MESSAGE;
}

export function hasXeroAttachmentScope(scopes: readonly string[] | null | undefined) {
  return scopes?.includes(XERO_ATTACHMENT_SCOPE) ?? false;
}
