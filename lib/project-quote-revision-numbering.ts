/** Quote identity remains lineage-driven; this helper only formats the next backend number. */
export function nextProjectQuoteRevisionNumber(currentQuoteNumber: string) {
  const normalized = currentQuoteNumber.trim();
  const existingProjectRevision = /^(.*)-P([1-9]\d*)$/.exec(normalized);
  if (existingProjectRevision) {
    return `${existingProjectRevision[1]}-P${Number(existingProjectRevision[2]) + 1}`;
  }
  return `${normalized}-P1`;
}
