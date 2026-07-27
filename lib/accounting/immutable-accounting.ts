export type AccountingRevisionIntent =
  | "initial_push"
  | "direct_update"
  | "amendment"
  | "credit"
  | "void_and_replace"
  | "replacement"
  | "legacy_import";

export type AccountingRevisionLifecycle =
  | "confirmed"
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "attention_required"
  | "superseded";

export function detectAccountingRevisionDivergence(
  exportedSourceEvidenceHash: string,
  currentSourceEvidenceHash: string,
): { divergent: boolean; reasons: string[] } {
  const sha256 = /^[a-f0-9]{64}$/;
  if (
    !sha256.test(exportedSourceEvidenceHash) ||
    !sha256.test(currentSourceEvidenceHash)
  ) {
    throw new TypeError("Accounting evidence hashes must be lowercase SHA-256.");
  }
  const divergent = exportedSourceEvidenceHash !== currentSourceEvidenceHash;
  return {
    divergent,
    reasons: divergent ? ["local_source_changed_after_export"] : [],
  };
}

export function formatTradesStackSalesInvoiceNumber(sequence: bigint | number): string {
  const value = typeof sequence === "bigint" ? sequence : BigInt(sequence);
  if (value < BigInt(1)) {
    throw new RangeError("Accounting document sequences begin at one.");
  }
  return `TSI-${value.toString().padStart(8, "0")}`;
}

export type RetentionOwnershipInput = {
  originId: string;
  currentOwnedMinor: number;
  proposedOwnedMinor: number;
  nativeSubmittedMinor: number;
  approvedLegacyMinor: number;
  draftCommittedMinor: number;
  exportedMinor: number;
  paidMinor: number;
  scheduleEligibleMinor: number;
  proposedReleaseMinor: number;
  unresolvedLegacy: boolean;
};

export type RetentionOwnershipResult = RetentionOwnershipInput & {
  committedMinor: number;
  remainingMinor: number;
  blockingReasons: string[];
  valid: boolean;
};

function assertMinorUnits(input: RetentionOwnershipInput) {
  for (const [name, value] of Object.entries(input)) {
    if (name === "originId" || name === "unresolvedLegacy") continue;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative minor-unit integer.`);
    }
  }
}

export function evaluateRetentionOwnership(
  input: RetentionOwnershipInput,
): RetentionOwnershipResult {
  assertMinorUnits(input);
  const blockingReasons: string[] = [];
  const committedMinor = input.nativeSubmittedMinor + input.approvedLegacyMinor;
  const remainingMinor = input.proposedOwnedMinor - committedMinor;

  if (input.unresolvedLegacy) blockingReasons.push("unresolved_legacy_retention");
  if (input.proposedOwnedMinor > input.currentOwnedMinor) {
    blockingReasons.push("proposed_ownership_exceeds_current");
  }
  if (committedMinor > input.proposedOwnedMinor) {
    blockingReasons.push("committed_retention_exceeds_proposed_ownership");
  }
  if (
    input.proposedReleaseMinor > 0 &&
    (input.nativeSubmittedMinor > 0 || input.approvedLegacyMinor > 0)
  ) {
    blockingReasons.push("duplicate_release_path");
  }
  if (input.exportedMinor > input.nativeSubmittedMinor) {
    blockingReasons.push("exported_retention_exceeds_native_commitment");
  }
  if (input.paidMinor > input.exportedMinor) {
    blockingReasons.push("paid_retention_exceeds_exported_retention");
  }
  if (input.draftCommittedMinor > Math.max(remainingMinor, 0)) {
    blockingReasons.push("draft_commitment_exceeds_remaining_retention");
  }
  if (input.scheduleEligibleMinor > Math.max(remainingMinor, 0)) {
    blockingReasons.push("schedule_eligibility_exceeds_remaining_retention");
  }

  return {
    ...input,
    committedMinor,
    remainingMinor,
    blockingReasons,
    valid: blockingReasons.length === 0,
  };
}
