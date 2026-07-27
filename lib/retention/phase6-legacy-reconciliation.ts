import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type RetentionLegacyReconciliationStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "superseded"
  | "cancelled";

export type RetentionPhase6ErrorCode =
  | "capability_disabled"
  | "project_mode_not_supported"
  | "permission_denied"
  | "project_not_found"
  | "legacy_reconciliation_not_required"
  | "legacy_release_not_found"
  | "legacy_case_not_found"
  | "legacy_case_not_editable"
  | "stale_reconciliation_case"
  | "legacy_source_not_found"
  | "origin_not_found"
  | "origin_cancelled"
  | "origin_has_no_retention"
  | "origin_after_legacy_release"
  | "invalid_allocation_amount"
  | "invalid_allocation_order"
  | "source_overallocated"
  | "origin_overallocated"
  | "duplicate_origin"
  | "legacy_allocation_not_found"
  | "legacy_sources_not_fully_allocated"
  | "legacy_origin_overallocated"
  | "legacy_total_mismatch"
  | "reconciliation_evidence_required"
  | "legacy_approval_permission_required"
  | "approval_reason_required"
  | "rejection_reason_required"
  | "invalid_legacy_transition"
  | "concurrent_update";

export type RetentionPhase6Result = {
  succeeded: boolean;
  errorCode: RetentionPhase6ErrorCode | null;
  [key: string]: Json | undefined;
};

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>;
};

function parseResult(data: Json | null, name: string): RetentionPhase6Result {
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throw new Error(`${name} returned an invalid Phase 6 payload.`);
  }
  return data as RetentionPhase6Result;
}

async function invoke(name: string, args: Record<string, unknown> = {}) {
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args);
  if (error) throw new Error(`Unable to execute ${name}: ${error.message}`);
  return parseResult(data, name);
}

export const createRetentionLegacyReconciliationCase = (
  projectId: string,
  correlationId?: string,
) =>
  invoke("create_retention_legacy_reconciliation_case", {
    p_project_id: projectId,
    p_correlation_id: correlationId,
  });

export const refreshRetentionLegacyReconciliationCase = (input: {
  caseId: string;
  expectedRevision: number;
  correlationId?: string;
}) =>
  invoke("refresh_retention_legacy_reconciliation_case", {
    p_case_id: input.caseId,
    p_expected_revision: input.expectedRevision,
    p_correlation_id: input.correlationId,
  });

export const addRetentionLegacyReleaseAllocation = (
  input: Record<string, Json | undefined>,
) => invoke("add_retention_legacy_release_allocation", { p_input: input });

export const updateRetentionLegacyReleaseAllocation = (
  input: Record<string, Json | undefined>,
) => invoke("update_retention_legacy_release_allocation", { p_input: input });

export const removeRetentionLegacyReleaseAllocation = (input: {
  allocationId: string;
  expectedRevision: number;
  correlationId?: string;
}) =>
  invoke("remove_retention_legacy_release_allocation", {
    p_allocation_id: input.allocationId,
    p_expected_revision: input.expectedRevision,
    p_correlation_id: input.correlationId,
  });

export const submitRetentionLegacyReconciliationCase = (
  input: Record<string, Json | undefined>,
) => invoke("submit_retention_legacy_reconciliation_case", { p_input: input });

export const approveRetentionLegacyReconciliationCase = (
  input: Record<string, Json | undefined>,
) => invoke("approve_retention_legacy_reconciliation_case", { p_input: input });

export const rejectRetentionLegacyReconciliationCase = (
  input: Record<string, Json | undefined>,
) => invoke("reject_retention_legacy_reconciliation_case", { p_input: input });

export const getRetentionLegacyReconciliationCase = (caseId: string) =>
  invoke("get_retention_legacy_reconciliation_case", { p_case_id: caseId });

export const listProjectRetentionLegacyReconciliationCases = (input: {
  projectId: string;
  limit?: number;
  beforeSequence?: number;
}) =>
  invoke("list_project_retention_legacy_reconciliation_cases", {
    p_project_id: input.projectId,
    p_limit: input.limit,
    p_before_sequence: input.beforeSequence,
  });

export const getRetentionLegacyReconciliationEvents = (
  caseId: string,
  limit?: number,
) =>
  invoke("get_retention_legacy_reconciliation_events", {
    p_case_id: caseId,
    p_limit: limit,
  });
