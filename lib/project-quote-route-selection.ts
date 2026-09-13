export type ProjectQuoteRouteCandidate = {
  id: string;
  status: string;
  revision_kind: string | null;
  revision_number: number | null;
  award_locked_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  is_untouched_automatic_award_draft?: boolean;
};

function timestamp(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(left: ProjectQuoteRouteCandidate, right: ProjectQuoteRouteCandidate) {
  const revisionDifference = (right.revision_number ?? 0) - (left.revision_number ?? 0);
  if (revisionDifference !== 0) return revisionDifference;
  const updatedDifference = timestamp(right.updated_at) - timestamp(left.updated_at);
  if (updatedDifference !== 0) return updatedDifference;
  const createdDifference = timestamp(right.created_at) - timestamp(left.created_at);
  if (createdDifference !== 0) return createdDifference;
  return left.id.localeCompare(right.id);
}

/** Canonical selection uses persisted revision state and never parses quote numbers. */
export function selectCanonicalProjectQuote(candidates: ProjectQuoteRouteCandidate[]) {
  const ordered = [...candidates].sort(newestFirst);
  const userCommercialRecords = ordered.filter((quote) => !quote.is_untouched_automatic_award_draft);
  return userCommercialRecords.find((quote) => quote.status === "Draft" && quote.revision_kind === "project_working")
    ?? ordered.find((quote) => quote.status === "Accepted" || quote.award_locked_at !== null)
    ?? userCommercialRecords.find((quote) => quote.status === "Draft")
    ?? userCommercialRecords[0]
    ?? ordered[0]
    ?? null;
}

export function appendSearchParams(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
    } else if (typeof value === "string") {
      query.set(key, value);
    }
  }
  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}
