export type RetentionClaimAccountingDriftInput = {
  activeStructuredSourceHash: string | null;
  currentStructuredSourceHash: string | null;
  activeIssueDate: string | null;
  currentIssueDate: string | null;
  activeDueDate: string | null;
  currentDueDate: string | null;
};

export function resolveRetentionClaimAccountingDrift(
  input: RetentionClaimAccountingDriftInput,
) {
  const financialChangedAfterExport = Boolean(
    input.activeStructuredSourceHash
    && input.currentStructuredSourceHash
    && input.activeStructuredSourceHash !== input.currentStructuredSourceHash,
  );
  const dateChangedAfterExport = Boolean(
    (input.currentIssueDate
      && input.currentIssueDate !== input.activeIssueDate)
    || (input.currentDueDate
      && input.currentDueDate !== input.activeDueDate),
  );
  return {
    financialChangedAfterExport,
    dateChangedAfterExport,
    claimChangedAfterExport:
      financialChangedAfterExport || dateChangedAfterExport,
  };
}
