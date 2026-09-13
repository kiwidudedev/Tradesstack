export function opportunityQuoteDisplayReference(
  opportunityCode: string | null | undefined,
  fallback = "OPP",
) {
  return opportunityCode?.trim() || fallback;
}

export function opportunityQuoteSeriesDisplayReference(
  baseQuoteNumber: string | null | undefined,
  fallback = "OPP",
) {
  const normalized = baseQuoteNumber?.trim() ?? "";
  return normalized.replace(/^Q-/i, "") || fallback;
}

export function opportunityQuoteDisplayRevisionNumber(storedRevisionNumber: number | null | undefined) {
  return Math.max((storedRevisionNumber ?? 1) - 1, 0);
}

export function opportunityQuoteDisplayNumber(
  displayReference: string,
  storedRevisionNumber: number | null | undefined,
) {
  const revision = opportunityQuoteDisplayRevisionNumber(storedRevisionNumber);
  return revision === 0 ? displayReference : `${displayReference}-R${revision}`;
}

export function opportunityQuoteRevisionLabel(storedRevisionNumber: number | null | undefined) {
  const revision = opportunityQuoteDisplayRevisionNumber(storedRevisionNumber);
  return revision === 0 ? "Original" : `R${revision}`;
}
