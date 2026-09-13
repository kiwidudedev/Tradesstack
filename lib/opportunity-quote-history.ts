export type OpportunityQuoteHistoryCandidate = {
  revision_id: string;
  revision_number: number;
};

export function selectPreviousOpportunityQuoteRevisions<Row extends OpportunityQuoteHistoryCandidate>(params: {
  rows: Row[];
  viewedRevisionId: string | null;
  currentRevisionId: string | null;
  currentRevisionNumber: number;
}) {
  if (!params.viewedRevisionId || params.viewedRevisionId !== params.currentRevisionId) return [];

  return params.rows
    .filter((revision) => revision.revision_number < params.currentRevisionNumber)
    .sort((left, right) => right.revision_number - left.revision_number);
}
