import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { RetentionPositionProjectSummary } from "@/lib/retention/phase2-retention-position";

export type RetentionClaimStatus = "draft" | "submitted" | "cancelled_draft";

export type RetentionClaimErrorCode =
  | "capability_disabled"
  | "project_mode_not_supported"
  | "permission_denied"
  | "claim_not_found"
  | "claim_not_draft"
  | "stale_draft"
  | "duplicate_origin"
  | "origin_not_found"
  | "origin_cancelled"
  | "cross_project_origin"
  | "invalid_allocation_amount"
  | "invalid_allocation_order"
  | "unresolved_legacy_release"
  | "retention_overallocated"
  | "variance_blocking"
  | "invalid_transition"
  | "concurrent_update"
  | "submitted_claim_immutable"
  | "RETENTION_DATE_RESET_BLOCKED"
  | "RETENTION_DATES_INVALID"
  | "RETENTION_DATES_UNCHANGED"
  | "RETENTION_DATES_STALE";

export type RetentionClaimHeader = {
  id: string;
  organizationId: string;
  projectId: string;
  claimNumber: string;
  title: string;
  reference: string | null;
  issueDate: string | null;
  dueDate: string | null;
  status: RetentionClaimStatus;
  subtotalExclTax: number;
  draftRevision: number;
  lastPositionStateHash: string | null;
  submissionStateHash: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RetentionClaimAllocation = {
  id: string;
  organizationId: string;
  projectId: string;
  retentionClaimId: string;
  originatingPaymentClaimId: string;
  allocationSequence: number;
  allocationAmount: number;
  draftOriginStateHash: string;
  draftOriginUpdatedAt: string;
  draftOriginRetentionOwned: number;
  currentOriginStateHash: string;
  currentOriginStatus: string;
  currentOriginClaimNumber: string;
  currentOriginClaimDate: string | null;
  currentRetentionOwned: number;
  currentSubmittedAllocationTotalFromOtherClaims: number;
  currentCommittedRetentionTotal: number;
  /**
   * Phase 3-only pre-schedule availability. This is not schedule eligibility.
   */
  currentAvailableBeforeSchedules: number;
  originStateStale: boolean;
  originClaimNumberSnapshot: string | null;
  originClaimDateSnapshot: string | null;
  originClaimStatusSnapshot: string | null;
  originClaimCreatedAtSnapshot: string | null;
  originClaimUpdatedAtSnapshot: string | null;
  retentionMethodSnapshot: string | null;
  retentionRateSnapshot: number | null;
  retentionScaleBandsSnapshot: Json | null;
  retentionWithheldSnapshot: number | null;
  retentionReleasedSnapshot: number | null;
  retentionHeldToDateSnapshot: number | null;
  retentionReleasedToDateSnapshot: number | null;
  retentionBalanceSnapshot: number | null;
  existingSubmittedAllocationBefore: number | null;
  remainingAfterAllocation: number | null;
  grossClaimAmountSnapshot: number | null;
  netClaimExclGstSnapshot: number | null;
  gstAmountSnapshot: number | null;
  totalPayableSnapshot: number | null;
  projectStateHashSnapshot: string | null;
  originStateHashSnapshot: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RetentionClaimEvent = {
  id: string;
  organizationId: string;
  projectId: string;
  retentionClaimId: string | null;
  eventType:
    | "claim_created"
    | "draft_updated"
    | "allocation_added"
    | "allocation_updated"
    | "allocation_removed"
    | "claim_submitted"
    | "submission_rejected"
    | "draft_cancelled"
    | "invalid_transition_attempted"
    | "permission_denied"
    | "draft_document_saved"
    | "draft_save_rejected"
    | "successor_draft_created"
    | "successor_draft_skipped"
    | "master_dates_updated";
  previousStatus: RetentionClaimStatus | null;
  newStatus: RetentionClaimStatus | null;
  actorUserId: string | null;
  reason: string;
  correlationId: string | null;
  metadata: Json;
  occurredAt: string;
};

export type RetentionClaimResult<T = undefined> = {
  succeeded: boolean;
  errorCode: RetentionClaimErrorCode | null;
  details?: Json;
  currentDraftRevision?: number;
} & (T extends undefined ? object : T);

export type RetentionClaimReadModel = RetentionClaimResult<{
  claim: RetentionClaimHeader;
  allocations: RetentionClaimAllocation[];
  currentPosition: RetentionPositionProjectSummary;
  positionStateStale: boolean;
}>;

export type RetentionClaimListPage = RetentionClaimResult<{
  claims: RetentionClaimHeader[];
  hasMore: boolean;
  nextCursor: { createdAt: string; id: string } | null;
}>;

function parseRpcJson<T>(value: Json | null, rpcName: string): T {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${rpcName} returned an invalid Retention Claim payload.`);
  }
  return value as T;
}

async function invoke<T>(
  rpcName:
    | "create_retention_claim_draft"
    | "update_retention_claim_draft"
    | "add_retention_claim_allocation"
    | "update_retention_claim_allocation"
    | "remove_retention_claim_allocation"
    | "reorder_retention_claim_allocations"
    | "cancel_retention_claim_draft"
    | "submit_retention_claim"
    | "get_retention_claim"
    | "list_project_retention_claims"
    | "get_retention_claim_events",
  args: Record<string, unknown>,
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  // Each RPC has a generated signature; this helper centralizes the identical
  // structured JSON/error boundary without exposing raw table mutations.
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    rpcName,
    args,
  );

  if (error) {
    throw new Error(`Unable to execute ${rpcName}: ${error.message}`);
  }
  return parseRpcJson<T>(data, rpcName);
}

export function createRetentionClaimDraft(input: {
  projectId: string;
  title?: string;
  reference?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  correlationId?: string | null;
}) {
  return invoke<RetentionClaimResult<{ claim: RetentionClaimHeader }>>(
    "create_retention_claim_draft",
    {
      p_project_id: input.projectId,
      p_title: input.title,
      p_reference: input.reference,
      p_issue_date: input.issueDate,
      p_due_date: input.dueDate,
      p_correlation_id: input.correlationId,
    },
  );
}

export function getRetentionClaim(retentionClaimId: string) {
  return invoke<RetentionClaimReadModel>("get_retention_claim", {
    p_retention_claim_id: retentionClaimId,
  });
}

export function listRetentionClaimDrafts(input: {
  projectId: string;
  limit?: number;
  before?: { createdAt: string; id: string } | null;
}) {
  return invoke<RetentionClaimListPage>("list_project_retention_claims", {
    p_project_id: input.projectId,
    p_limit: input.limit,
    p_before_created_at: input.before?.createdAt,
    p_before_id: input.before?.id,
  });
}

export function updateRetentionClaimDraft(input: {
  retentionClaimId: string;
  expectedDraftRevision: number;
  title: string;
  reference: string | null;
  issueDate: string | null;
  dueDate: string | null;
  refreshPosition?: boolean;
  correlationId?: string | null;
}) {
  return invoke<RetentionClaimResult<{ claim: RetentionClaimHeader }>>(
    "update_retention_claim_draft",
    {
      p_retention_claim_id: input.retentionClaimId,
      p_expected_draft_revision: input.expectedDraftRevision,
      p_title: input.title,
      p_reference: input.reference,
      p_issue_date: input.issueDate,
      p_due_date: input.dueDate,
      p_refresh_position: input.refreshPosition,
      p_correlation_id: input.correlationId,
    },
  );
}

export function addRetentionClaimAllocation(input: {
  retentionClaimId: string;
  expectedDraftRevision: number;
  originatingPaymentClaimId: string;
  allocationAmount: number;
  allocationSequence?: number;
  correlationId?: string | null;
}) {
  return invoke<RetentionClaimResult<{
    claim: RetentionClaimHeader;
    allocationId: string;
  }>>("add_retention_claim_allocation", {
    p_retention_claim_id: input.retentionClaimId,
    p_expected_draft_revision: input.expectedDraftRevision,
    p_originating_payment_claim_id: input.originatingPaymentClaimId,
    p_allocation_amount: input.allocationAmount,
    p_allocation_sequence: input.allocationSequence,
    p_correlation_id: input.correlationId,
  });
}

export function updateRetentionClaimAllocation(input: {
  allocationId: string;
  expectedDraftRevision: number;
  allocationAmount: number;
  correlationId?: string | null;
}) {
  return invoke<RetentionClaimResult<{ claim: RetentionClaimHeader }>>(
    "update_retention_claim_allocation",
    {
      p_allocation_id: input.allocationId,
      p_expected_draft_revision: input.expectedDraftRevision,
      p_allocation_amount: input.allocationAmount,
      p_correlation_id: input.correlationId,
    },
  );
}

export function removeRetentionClaimAllocation(input: {
  allocationId: string;
  expectedDraftRevision: number;
  correlationId?: string | null;
}) {
  return invoke<RetentionClaimResult<{ claim: RetentionClaimHeader }>>(
    "remove_retention_claim_allocation",
    {
      p_allocation_id: input.allocationId,
      p_expected_draft_revision: input.expectedDraftRevision,
      p_correlation_id: input.correlationId,
    },
  );
}

export function reorderRetentionClaimAllocations(input: {
  retentionClaimId: string;
  expectedDraftRevision: number;
  allocationIds: string[];
  correlationId?: string | null;
}) {
  return invoke<RetentionClaimResult<{
    claim: RetentionClaimHeader;
    allocations: RetentionClaimAllocation[];
  }>>("reorder_retention_claim_allocations", {
    p_retention_claim_id: input.retentionClaimId,
    p_expected_draft_revision: input.expectedDraftRevision,
    p_allocation_ids: input.allocationIds,
    p_correlation_id: input.correlationId,
  });
}

export function cancelRetentionClaimDraft(input: {
  retentionClaimId: string;
  expectedDraftRevision: number;
  reason: string;
  correlationId?: string | null;
}) {
  return invoke<RetentionClaimResult<{ claim: RetentionClaimHeader }>>(
    "cancel_retention_claim_draft",
    {
      p_retention_claim_id: input.retentionClaimId,
      p_expected_draft_revision: input.expectedDraftRevision,
      p_reason: input.reason,
      p_correlation_id: input.correlationId,
    },
  );
}

export function submitRetentionClaim(input: {
  retentionClaimId: string;
  expectedDraftRevision: number;
  expectedPositionStateHash: string;
  expectedEligibilityStateHash?: string;
  correlationId?: string | null;
}) {
  return invoke<RetentionClaimResult<{
    claim: RetentionClaimHeader;
    allocations: RetentionClaimAllocation[];
  }>>("submit_retention_claim", {
    p_retention_claim_id: input.retentionClaimId,
    p_expected_draft_revision: input.expectedDraftRevision,
    p_expected_position_state_hash: input.expectedPositionStateHash,
    p_correlation_id: input.correlationId,
    p_expected_eligibility_state_hash: input.expectedEligibilityStateHash,
  });
}

export function getRetentionClaimEvents(
  retentionClaimId: string,
  limit?: number,
) {
  return invoke<RetentionClaimResult<{ events: RetentionClaimEvent[] }>>(
    "get_retention_claim_events",
    {
      p_retention_claim_id: retentionClaimId,
      p_limit: limit,
    },
  );
}
