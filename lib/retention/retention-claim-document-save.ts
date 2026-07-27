import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type {
  RetentionClaimErrorCode,
  RetentionClaimHeader,
} from "@/lib/retention/phase3-retention-claims";

export type RetentionClaimDraftDocumentLine = {
  originatingPaymentClaimId: string;
  candidateId: string | null;
  existingAllocationId: string | null;
  expectedOriginStateHash: string;
  sequence: number;
  proposedAmountCents: number;
};

export type SaveRetentionClaimDraftDocumentInput = {
  retentionClaimId: string;
  expectedDraftRevision: number;
  title: string;
  reference: string | null;
  issueDate: string | null;
  dueDate: string | null;
  expectedPositionStateHash: string;
  expectedEligibilityStateHash: string;
  expectedOriginSetHash: string;
  lines: RetentionClaimDraftDocumentLine[];
  correlationId: string;
};

export type RetentionClaimDraftDocumentSaveResult = {
  succeeded: boolean;
  errorCode:
    | RetentionClaimErrorCode
    | "invalid_line_set"
    | "origin_set_changed"
    | "position_changed"
    | "eligibility_changed"
    | "allocation_exceeds_ownership"
    | "allocation_exceeds_eligibility"
    | null;
  changed?: boolean;
  requiresReload?: boolean;
  claim?: RetentionClaimHeader;
  draftRevision?: number;
  currentDraftRevision?: number;
  positionStateHash?: string;
  eligibilityStateHash?: string;
  originSetHash?: string;
  lines?: Array<
    RetentionClaimDraftDocumentLine & {
      retentionOwnedCents: number;
      availableCents: number;
    }
  >;
  totals?: { thisClaimCents: number };
  affectedOriginIds?: string[];
  rowErrors?: Array<{
    originatingPaymentClaimId: string;
    errorCode: string;
    currentLimitCents: number;
  }>;
  details?: Json;
};

function parseObject<T>(value: Json | null, operation: string): T {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${operation} returned an invalid Retention Claim payload.`);
  }
  return value as T;
}

async function invoke<T>(rpcName: string, args: Record<string, unknown>) {
  const supabase = await createServerSupabaseClient();
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
  return parseObject<T>(data, rpcName);
}

export function getRetentionClaimDraftOriginSetHash(retentionClaimId: string) {
  return invoke<{
    retentionClaimId: string;
    originSetHash: string;
    originStateHashes: Record<string, string>;
  }>(
    "get_retention_claim_draft_origin_set_hash",
    { p_retention_claim_id: retentionClaimId },
  );
}

export async function saveRetentionClaimDraftDocument(
  input: SaveRetentionClaimDraftDocumentInput,
) {
  const result = await invoke<RetentionClaimDraftDocumentSaveResult>(
    "save_retention_claim_draft_document",
    {
      p_retention_claim_id: input.retentionClaimId,
      p_expected_draft_revision: input.expectedDraftRevision,
      p_title: input.title,
      p_reference: input.reference,
      p_issue_date: input.issueDate,
      p_due_date: input.dueDate,
      p_expected_position_state_hash: input.expectedPositionStateHash,
      p_expected_eligibility_state_hash: input.expectedEligibilityStateHash,
      p_expected_origin_set_hash: input.expectedOriginSetHash,
      p_lines: input.lines as unknown as Json,
      p_correlation_id: input.correlationId,
    },
  );
  if (
    !result.succeeded &&
    result.details &&
    !Array.isArray(result.details) &&
    typeof result.details === "object" &&
    Array.isArray(result.details.rowErrors)
  ) {
    return {
      ...result,
      rowErrors: result.details.rowErrors as RetentionClaimDraftDocumentSaveResult["rowErrors"],
    };
  }
  return result;
}
