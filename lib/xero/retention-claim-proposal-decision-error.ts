import type {
  RetentionClaimAccountingBlockerCode,
} from "@/lib/xero/retention-claim-accounting-decision";

export class RetentionClaimProposalDecisionError extends Error {
  constructor(
    readonly code: RetentionClaimAccountingBlockerCode,
    message: string,
  ) {
    super(message);
    this.name = "RetentionClaimProposalDecisionError";
  }
}

export function proposalDecisionError(blocker: {
  code: RetentionClaimAccountingBlockerCode;
  message: string;
}) {
  return new RetentionClaimProposalDecisionError(
    blocker.code,
    blocker.code === "already_exported"
      ? "This Retention Claim is already synchronized with Xero."
      : blocker.message,
  );
}
