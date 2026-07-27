import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type RetentionVarianceType =
  | "ownership_reduced"
  | "eligibility_reduced"
  | "origin_payment_claim_cancelled"
  | "schedule_changed"
  | "schedule_cancelled"
  | "legacy_reconciliation_conflict"
  | "xero_local_financial_divergence"
  | "corrective_transaction_pending";

export type RetentionVarianceState =
  | "warning"
  | "reconciliation_required"
  | "over_allocated"
  | "resolution_pending"
  | "resolved"
  | "accepted_contractual_override";

export type RetentionVarianceSeverity = "low" | "medium" | "high" | "critical";

export type RetentionVarianceErrorCode =
  | "variance_not_found"
  | "variance_blocking"
  | "variance_not_resolvable"
  | "variance_already_resolved"
  | "invalid_variance_transition"
  | "stale_variance"
  | "live_position_still_invalid"
  | "override_permission_required"
  | "override_reason_required"
  | "corrective_evidence_required"
  | "invalid_corrective_amount"
  | "assignment_invalid"
  | "concurrent_update"
  | "scan_already_claimed"
  | "scan_failed"
  | "origin_not_found"
  | "project_not_found"
  | "capability_disabled"
  | "project_mode_not_supported"
  | "permission_denied";

export type RetentionVarianceResult = {
  succeeded: boolean;
  errorCode: RetentionVarianceErrorCode | null;
  [key: string]: Json | undefined;
};

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>;
};

function parseResult(data: Json | null, name: string): RetentionVarianceResult {
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throw new Error(`${name} returned an invalid Retention Variance payload.`);
  }
  return data as RetentionVarianceResult;
}

async function invoke(name: string, args: Record<string, unknown> = {}) {
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args);
  if (error) throw new Error(`Unable to execute ${name}: ${error.message}`);
  return parseResult(data, name);
}

async function invokeScanner(name: string, args: Record<string, unknown> = {}) {
  const client = createAdminSupabaseClient();
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args);
  if (error) throw new Error(`Unable to execute ${name}: ${error.message}`);
  return parseResult(data, name);
}

export const evaluateRetentionVariances = (input: {
  projectId: string;
  originIds?: string[];
  correlationId?: string;
}) =>
  invoke("evaluate_retention_variances", {
    p_project_id: input.projectId,
    p_origin_ids: input.originIds,
    p_correlation_id: input.correlationId,
  });

export const checkRetentionVarianceBlocks = (input: {
  projectId: string;
  originIds?: string[];
}) =>
  invoke("check_retention_variance_blocks", {
    p_project_id: input.projectId,
    p_origin_ids: input.originIds,
  });

export const getRetentionVariance = (varianceId: string) =>
  invoke("get_retention_variance", { p_variance_id: varianceId });

export const listProjectRetentionVariances = (input: {
  projectId: string;
  limit?: number;
  after?: { lastDetectedAt: string; id: string };
  states?: RetentionVarianceState[];
  blocking?: boolean;
}) =>
  invoke("list_project_retention_variances", {
    p_project_id: input.projectId,
    p_limit: input.limit,
    p_after_detected_at: input.after?.lastDetectedAt,
    p_after_id: input.after?.id,
    p_states: input.states,
    p_blocking: input.blocking,
  });

export const getRetentionVarianceEvents = (varianceId: string, limit?: number) =>
  invoke("get_retention_variance_events", {
    p_variance_id: varianceId,
    p_limit: limit,
  });

export const assignRetentionVariance = (input: Record<string, Json | undefined>) =>
  invoke("assign_retention_variance", { p_input: input });

export const recordRetentionVarianceCorrectiveEvidence = (
  input: Record<string, Json | undefined>,
) => invoke("record_retention_variance_corrective_evidence", { p_input: input });

export const resolveRetentionVariance = (
  input: Record<string, Json | undefined>,
) => invoke("resolve_retention_variance", { p_input: input });

export const acceptRetentionVarianceContractualOverride = (
  input: Record<string, Json | undefined>,
) => invoke("accept_retention_variance_contractual_override", { p_input: input });

export const reopenRetentionVariance = (
  input: Record<string, Json | undefined>,
) => invoke("reopen_retention_variance", { p_input: input });

export const enqueueRetentionVarianceScanProjects = (input: {
  limit?: number;
  afterProjectId?: string;
  organizationId?: string;
}) =>
  invokeScanner("enqueue_retention_variance_scan_projects", {
    p_limit: input.limit,
    p_after_project_id: input.afterProjectId,
    p_organization_id: input.organizationId,
  });

export const claimRetentionVarianceScanBatch = (input: {
  limit?: number;
  workerId?: string;
  leaseSeconds?: number;
  organizationId?: string;
}) =>
  invokeScanner("claim_retention_variance_scan_batch", {
    p_limit: input.limit,
    p_worker_id: input.workerId,
    p_lease_seconds: input.leaseSeconds,
    p_organization_id: input.organizationId,
  });

export const processRetentionVarianceScanItem = (input: {
  queueId: string;
  claimToken: string;
  correlationId: string;
}) =>
  invokeScanner("process_retention_variance_scan_item", {
    p_queue_id: input.queueId,
    p_claim_token: input.claimToken,
    p_correlation_id: input.correlationId,
  });

export const finalizeRetentionVarianceScanItem = (
  input: Record<string, Json | undefined>,
) => invokeScanner("finalize_retention_variance_scan_item", { p_input: input });

export const runRetentionVarianceScanBatch = (input: {
  limit?: number;
  workerId?: string;
  afterProjectId?: string;
  organizationId?: string;
  correlationId?: string;
}) =>
  invokeScanner("run_retention_variance_scan_batch", {
    p_limit: input.limit,
    p_worker_id: input.workerId,
    p_after_project_id: input.afterProjectId,
    p_organization_id: input.organizationId,
    p_correlation_id: input.correlationId,
  });
