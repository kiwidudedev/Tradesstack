export type RetentionClaimDraftReadinessInput = {
  dirty: boolean;
  isSaving: boolean;
  positionStateStale: boolean;
  hasInvalidPercentages: boolean;
  thisClaimCents: number;
  positionStateHash: string;
  eligibilityStateHash: string;
};

export function isSavedRetentionClaimReadyForFinalisation(
  input: RetentionClaimDraftReadinessInput,
) {
  return (
    !input.dirty
    && !input.isSaving
    && !input.positionStateStale
    && !input.hasInvalidPercentages
    && input.thisClaimCents > 0
    && Boolean(input.positionStateHash && input.eligibilityStateHash)
  );
}
