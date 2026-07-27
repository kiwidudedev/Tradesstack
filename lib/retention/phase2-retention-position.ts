import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { ProjectRetentionWorkflowMode } from "@/lib/retention/phase1-server";

export type RetentionPositionDiagnosticSeverity =
  | "info"
  | "warning"
  | "blocking_for_future_cutover";

export type RetentionPositionDiagnostic = {
  code: string;
  severity: RetentionPositionDiagnosticSeverity;
  message?: string;
};

export type RetentionPositionOrigin = {
  organizationId: string;
  projectId: string;
  paymentClaimId: string;
  claimNumber: string;
  claimDate: string | null;
  dueDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  chronologicalSequence: number;
  retentionMethod: string;
  retentionRate: number;
  retentionScaleBands: Json | null;
  retentionWithheldAmount: number;
  retentionReleasedAmount: number;
  retentionHeldToDate: number;
  retentionReleasedToDate: number;
  retentionBalance: number;
  grossClaimAmount: number;
  netClaimExcludingGst: number;
  gstAmount: number;
  totalPayable: number;
  originatedPositiveRetention: boolean;
  /**
   * The persisted positive withheld movement originated by this Payment Claim.
   * It is not an available-to-claim or release-allocation value.
   */
  originatedRetentionAmount: number;
  cancelled: boolean;
  containsLegacyRelease: boolean;
  negativeRetentionBalance: boolean;
  internallyInconsistent: boolean;
  eligibleForFutureRetentionAnalysis: boolean;
  movementDerivedCumulativeBalance: number;
  diagnostics: RetentionPositionDiagnostic[];
};

export type RetentionPositionStateHash = string;

export type RetentionPositionLegacyReleaseOrigin = {
  paymentClaimId: string;
  claimNumber: string;
  claimDate: string | null;
  effectiveDate: string | null;
  retentionReleasedAmount: number;
  chronologicalSequence: number;
};

export type RetentionPositionAccessState =
  | "available"
  | "internal_diagnostics"
  | "capability_disabled"
  | "legacy_mode"
  | "inactive_mode"
  | "permission_denied"
  | "not_found_or_denied"
  | "project_not_found";

export type RetentionPositionProjectSummary = {
  organizationId?: string;
  projectId?: string;
  capabilityEnabled?: boolean;
  workflowMode?: ProjectRetentionWorkflowMode;
  accessState: RetentionPositionAccessState;
  observationEligible: boolean;
  paymentClaimCount?: number;
  activePaymentClaimCount?: number;
  retentionOriginCount?: number;
  legacyReleaseClaimCount?: number;
  negativeRetentionBalanceClaimCount?: number;
  cancelledClaimCount?: number;
  totalRetentionWithheld?: number;
  totalLegacyRetentionReleased?: number;
  movementDerivedRetentionBalance?: number;
  latestPersistedCumulativeRetentionBalance?: number;
  latestRelevantPaymentClaimDate?: string | null;
  latestPersistedUpdateAt?: string | null;
  legacyReconciliationRequired?: boolean;
  legacyReleaseOrigins?: RetentionPositionLegacyReleaseOrigin[];
  diagnostics?: RetentionPositionDiagnostic[];
  stateHash?: RetentionPositionStateHash;
};

export type RetentionPositionFilters = {
  statuses?: string[];
  positiveRetention?: boolean;
  legacyRelease?: boolean;
  diagnosticCodes?: string[];
};

export type RetentionPositionCursor = {
  claimDate: string | null;
  createdAt: string;
  paymentClaimId: string;
};

export type RetentionPositionPage = {
  organizationId?: string;
  projectId?: string;
  capabilityEnabled?: boolean;
  workflowMode?: ProjectRetentionWorkflowMode;
  accessState: RetentionPositionAccessState;
  pageSize?: number;
  hasMore: boolean;
  nextCursor?: RetentionPositionCursor | null;
  origins: RetentionPositionOrigin[];
};

export type RetentionPositionReadModel = {
  summary: RetentionPositionProjectSummary;
  page: RetentionPositionPage;
};

function parseRpcJson<T>(value: Json | null, rpcName: string): T {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${rpcName} returned an invalid Retention Position payload.`);
  }
  return value as T;
}

export async function getProjectRetentionPosition(input: {
  projectId: string;
  pageSize?: number;
  after?: RetentionPositionCursor | null;
  filters?: RetentionPositionFilters;
}): Promise<RetentionPositionReadModel> {
  const supabase = await createServerSupabaseClient();
  const [summaryResult, pageResult] = await Promise.all([
    supabase.rpc("get_project_retention_position_summary", {
      p_project_id: input.projectId,
    }),
    supabase.rpc("get_project_retention_position_page", {
      p_project_id: input.projectId,
      p_page_size: input.pageSize,
      p_after_claim_date: input.after?.claimDate ?? undefined,
      p_after_created_at: input.after?.createdAt ?? undefined,
      p_after_claim_id: input.after?.paymentClaimId ?? undefined,
      p_statuses: input.filters?.statuses,
      p_positive_retention: input.filters?.positiveRetention,
      p_legacy_release: input.filters?.legacyRelease,
      p_diagnostic_codes: input.filters?.diagnosticCodes,
    }),
  ]);

  if (summaryResult.error) {
    throw new Error(
      `Unable to read Retention Position summary: ${summaryResult.error.message}`,
    );
  }
  if (pageResult.error) {
    throw new Error(
      `Unable to read Retention Position origins: ${pageResult.error.message}`,
    );
  }

  return {
    summary: parseRpcJson<RetentionPositionProjectSummary>(
      summaryResult.data,
      "get_project_retention_position_summary",
    ),
    page: parseRpcJson<RetentionPositionPage>(
      pageResult.data,
      "get_project_retention_position_page",
    ),
  };
}
