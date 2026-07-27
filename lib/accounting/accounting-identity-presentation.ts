export type AccountingIdentityPresentation = {
  commercialClaimNumber: string;
  activeXeroInvoiceNumber: string | null;
  activeXeroInvoiceId: string | null;
  displayAccountingNumber: string;
  hasReplacementIdentity: boolean;
};

function text(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveAccountingIdentityPresentation(input: {
  commercialClaimNumber: string;
  activeRevisionInvoiceNumber?: string | null;
  activeRevisionInvoiceId?: string | null;
  stableDocumentInvoiceNumber?: string | null;
  stableDocumentInvoiceId?: string | null;
  historicalInvoiceNumber?: string | null;
  historicalInvoiceId?: string | null;
}): AccountingIdentityPresentation {
  const commercialClaimNumber = text(input.commercialClaimNumber) ?? "—";
  const activeXeroInvoiceNumber =
    text(input.activeRevisionInvoiceNumber)
    ?? text(input.stableDocumentInvoiceNumber)
    ?? text(input.historicalInvoiceNumber);
  const activeXeroInvoiceId =
    text(input.activeRevisionInvoiceId)
    ?? text(input.stableDocumentInvoiceId)
    ?? text(input.historicalInvoiceId);

  return {
    commercialClaimNumber,
    activeXeroInvoiceNumber,
    activeXeroInvoiceId,
    displayAccountingNumber:
      activeXeroInvoiceNumber ?? commercialClaimNumber,
    hasReplacementIdentity: Boolean(
      activeXeroInvoiceNumber
      && activeXeroInvoiceNumber !== commercialClaimNumber,
    ),
  };
}
