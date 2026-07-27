import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { RetentionClaimHeader } from "@/lib/retention/phase3-retention-claims";

export type RollingRetentionOrigin = {
  id: string;
  originatingPaymentClaimId: string;
  originSequence: number;
  latestOriginStateHash: string;
  latestRetentionOwned: number;
  originStateStale: boolean;
  claimNumber: string;
  claimDate: string | null;
  currentRetentionOwned: number;
  currentEligibleRetention: number;
  committedRetention: number;
  availableRetention: number;
  allocationId: string | null;
  allocationAmount: number | null;
};

export type RollingRetentionOriginsResult = {
  succeeded: boolean;
  errorCode: string | null;
  automaticRolling: boolean;
  origins: RollingRetentionOrigin[];
};

export type ProjectRollingRetentionClaimResult = {
  succeeded: boolean;
  errorCode: string | null;
  claim: RetentionClaimHeader | null;
  originCount: number;
  availableAmount: number;
};

export type RetentionClaimHistoryRow = {
  claim: RetentionClaimHeader;
  originCount: number;
  paidAmount: number;
  outstandingAmount: number;
  xeroStatus: string | null;
};

export type RetentionClaimHistoryResult = {
  succeeded: boolean;
  errorCode: string | null;
  xeroVisible: boolean;
  claims: RetentionClaimHistoryRow[];
};

function parse<T>(value: Json | null, operation: string): T {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${operation} returned an invalid rolling Retention payload.`);
  }
  return value as T;
}

async function invoke<T>(
  rpcName:
    | "get_retention_rolling_draft_origins"
    | "get_project_rolling_retention_claim"
    | "get_project_retention_claim_history",
  args: Record<string, unknown>,
): Promise<T> {
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
  return parse<T>(data, rpcName);
}

export function getRetentionRollingDraftOrigins(retentionClaimId: string) {
  return invoke<RollingRetentionOriginsResult>(
    "get_retention_rolling_draft_origins",
    { p_retention_claim_id: retentionClaimId },
  );
}

export function getProjectRollingRetentionClaim(projectId: string) {
  return invoke<ProjectRollingRetentionClaimResult>(
    "get_project_rolling_retention_claim",
    { p_project_id: projectId },
  );
}

export function getProjectRetentionClaimHistory(projectId: string) {
  return invoke<RetentionClaimHistoryResult>(
    "get_project_retention_claim_history",
    { p_project_id: projectId },
  );
}
