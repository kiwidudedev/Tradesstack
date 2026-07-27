type PreparationClaim = {
  id: string;
  organizationId: string;
  status: "draft" | "submitted" | "cancelled_draft";
  draftRevision: number;
};

export type RetentionClaimPushPreparationDependencies = {
  loadWorkspace: (retentionClaimId: string) => Promise<{
    claim: {
      succeeded: boolean;
      claim: PreparationClaim;
      currentPosition: { stateHash?: string | null };
      positionStateStale: boolean;
    };
    eligibility: Record<string, unknown>;
  }>;
  reloadClaim: (retentionClaimId: string) => Promise<{
    succeeded: boolean;
    claim: PreparationClaim;
  }>;
  submitClaim: (input: {
    retentionClaimId: string;
    expectedDraftRevision: number;
    expectedPositionStateHash: string;
    expectedEligibilityStateHash: string;
    correlationId: string;
  }) => Promise<{
    succeeded: boolean;
    errorCode: string | null;
  }>;
  generateDocument?: (retentionClaimId: string) => Promise<{
    succeeded: boolean;
  }>;
  correlationId: () => string;
};

export class RetentionClaimPushPreparationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly submittedInternally: boolean,
  ) {
    super(message);
    this.name = "RetentionClaimPushPreparationError";
  }
}

async function reloadSubmittedClaim(
  dependencies: RetentionClaimPushPreparationDependencies,
  retentionClaimId: string,
  organizationId: string,
  submittedInternally: boolean,
) {
  try {
    const result = await dependencies.reloadClaim(retentionClaimId);
    if (
      result.succeeded
      && result.claim.organizationId === organizationId
      && result.claim.status === "submitted"
    ) {
      return result.claim;
    }
  } catch {
    // The safe error below deliberately records whether the immutable
    // transition already succeeded so the caller can present resume semantics.
  }
  throw new RetentionClaimPushPreparationError(
    "submitted_state_reload_failed",
    "The Retention Claim was finalised but its submitted state could not be reloaded.",
    submittedInternally,
  );
}

export async function prepareRetentionClaimForXeroPreview(
  params: {
    organizationId: string;
    retentionClaimId: string;
  },
  dependencies: RetentionClaimPushPreparationDependencies,
): Promise<{
  claim: PreparationClaim;
  submittedInternally: boolean;
}> {
  const workspace = await dependencies.loadWorkspace(params.retentionClaimId);
  if (
    !workspace.claim.succeeded
    || workspace.claim.claim.organizationId !== params.organizationId
  ) {
    throw new RetentionClaimPushPreparationError(
      "claim_not_found",
      "The Retention Claim is not available in this organisation.",
      false,
    );
  }

  let claim = workspace.claim.claim;
  let submittedInternally = false;
  if (claim.status === "draft") {
    const positionStateHash = workspace.claim.currentPosition.stateHash ?? "";
    const eligibilityStateHash =
      typeof workspace.eligibility.eligibilityStateHash === "string"
        ? workspace.eligibility.eligibilityStateHash
        : "";
    if (
      workspace.claim.positionStateStale
      || !positionStateHash
      || !eligibilityStateHash
    ) {
      throw new RetentionClaimPushPreparationError(
        "stale_draft",
        "The Retention position changed. Save the Retention Claim again before pushing to Xero.",
        false,
      );
    }

    let submission: Awaited<
      ReturnType<RetentionClaimPushPreparationDependencies["submitClaim"]>
    >;
    try {
      submission = await dependencies.submitClaim({
        retentionClaimId: claim.id,
        expectedDraftRevision: claim.draftRevision,
        expectedPositionStateHash: positionStateHash,
        expectedEligibilityStateHash: eligibilityStateHash,
        correlationId: dependencies.correlationId(),
      });
    } catch {
      // A lost response may still follow a committed atomic submission.
      claim = await reloadSubmittedClaim(
        dependencies,
        params.retentionClaimId,
        params.organizationId,
        false,
      );
      submittedInternally = true;
      submission = { succeeded: false, errorCode: "submission_result_unknown" };
    }
    if (submission.succeeded) {
      submittedInternally = true;
    } else if (claim.status !== "submitted") {
      // If another deliberate request completed the same transition, resume
      // from Submitted instead of attempting a second submission.
      const concurrent = await dependencies.reloadClaim(
        params.retentionClaimId,
      ).catch(() => null);
      if (
        !concurrent
        || !concurrent.succeeded
        || concurrent.claim.organizationId !== params.organizationId
        || concurrent.claim.status !== "submitted"
      ) {
        throw new RetentionClaimPushPreparationError(
          submission.errorCode ?? "retention_submission_failed",
          "The saved Retention Claim could not be finalised. Review and save it before pushing to Xero.",
          false,
        );
      }
      submittedInternally = true;
    }

    claim = await reloadSubmittedClaim(
      dependencies,
      params.retentionClaimId,
      params.organizationId,
      submittedInternally,
    );
  }

  if (claim.status !== "submitted") {
    throw new RetentionClaimPushPreparationError(
      "claim_not_ready",
      "Only a saved valid Retention Claim can be pushed to Xero.",
      false,
    );
  }

  // Legacy callers may still prepare a historical document. The master
  // Retention accounting flow deliberately omits this dependency and relies
  // entirely on immutable structured line evidence.
  if (dependencies.generateDocument) {
    const document = await dependencies.generateDocument(claim.id).catch(() => ({
      succeeded: false,
    }));
    if (!document.succeeded) {
      throw new RetentionClaimPushPreparationError(
        "immutable_document_failed",
        "The Retention Claim was finalised, but its immutable preview document could not be prepared.",
        submittedInternally,
      );
    }
  }
  return { claim, submittedInternally };
}
