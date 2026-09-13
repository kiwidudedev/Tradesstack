export const OPPORTUNITY_CONVERSION_RECONCILIATION_WARNING =
  "This opportunity has an incomplete earlier conversion and requires administrative reconciliation.";

export function hasUnclassifiedDeliveryProjectCandidates(params: {
  convertedProjectId: string | null;
  workspaceProjectId: string | null;
  sourceProjectIds: string[];
}): boolean {
  if (params.convertedProjectId) {
    return false;
  }

  return params.sourceProjectIds.some(
    (projectId) => projectId !== params.workspaceProjectId,
  );
}

export function isOpportunityConversionReconciliationWarning(
  message: string | null | undefined,
): boolean {
  return message?.trim() === OPPORTUNITY_CONVERSION_RECONCILIATION_WARNING;
}

export function shouldRetryAcceptedOpportunityConversion(params: {
  quoteId: string | null;
  selectedStatus: string;
  persistedStatus: string | null;
}): boolean {
  return Boolean(
    params.quoteId
      && params.selectedStatus === "Accepted"
      && params.persistedStatus === "Accepted",
  );
}

export function selectCanonicalOpportunityQuote<Quote extends { id: string; status: string }>(params: {
  quotes: Quote[];
  mappedAcceptedQuoteId: string | null;
}): Quote | null {
  return (
    (params.mappedAcceptedQuoteId
      ? params.quotes.find((quote) => quote.id === params.mappedAcceptedQuoteId)
      : null)
    ?? params.quotes.find((quote) => quote.status === "Sent")
    ?? params.quotes[0]
    ?? null
  );
}
