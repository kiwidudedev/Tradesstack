import "server-only";

import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";
import {
  getSupplierBillRefreshPriority,
  isSupplierBillRefreshReasonCode,
  type SupplierBillRefreshReasonCode,
} from "@/lib/universal-learning/supplier-bill-refresh-reasons";

export type SupplierBillRefreshQueueState =
  | "pending"
  | "leased"
  | "retry_wait"
  | "completed"
  | "dead_letter"
  | "deleted";

export type SupplierBillRefreshQueueRow = {
  id: string;
  organizationId: string;
  containerType: "supplier_invoice";
  sourceId: string;
  reasonCode: SupplierBillRefreshReasonCode;
  priority: number;
  queueState: SupplierBillRefreshQueueState;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string | null;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  firstRequestedAt: string | null;
  lastRequestedAt: string | null;
  deletionEvidenceAt: string | null;
  contentHash: string | null;
  schemaVersion: string | null;
  builderVersion: string | null;
};

export type SupplierBillRefreshSuccessMetadata = {
  schemaVersion: "supplier_bill.v2";
  builderVersion: string;
  contentHash: string;
  canonicalUpdatedAt: string;
  latestDependencyUpdatedAt: string;
  payloadBytes: number;
};

export type SupplierBillRefreshFinalizeInput = {
  queueId: string;
  leaseToken: string;
  outcome: "changed" | "no_change" | "voided" | "deleted" | "retry" | "dead_letter";
  retryAt?: string | null;
  errorCode?: string | null;
  errorSummary?: string | null;
  metadata?: SupplierBillRefreshSuccessMetadata;
};

export async function finalizeSupplierBillUclRefreshStale(input: {
  queueId: string;
  leaseToken: string;
}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("finalize_supplier_bill_ucl_refresh_stale", {
    p_queue_id: input.queueId,
    p_lease_token: input.leaseToken,
  });
  if (error) throw new Error(error.message);
  return parseSupplierBillRefreshQueueRow(data);
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseSupplierBillRefreshQueueRow(value: unknown): SupplierBillRefreshQueueRow {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const reason = String(row.reasonCode ?? row.reason_code ?? "");
  if (!isSupplierBillRefreshReasonCode(reason)) {
    throw new Error("Supplier Bill refresh queue returned an invalid reason code.");
  }
  const containerType = String(row.containerType ?? row.container_type ?? "");
  if (containerType !== "supplier_invoice") {
    throw new Error("Supplier Bill refresh queue returned an invalid container type.");
  }
  return {
    id: String(row.id ?? ""),
    organizationId: String(row.organizationId ?? row.organization_id ?? ""),
    containerType,
    sourceId: String(row.sourceId ?? row.source_id ?? ""),
    reasonCode: reason,
    priority: Number(row.priority ?? 0),
    queueState: String(row.queueState ?? row.queue_state ?? "pending") as SupplierBillRefreshQueueState,
    attemptCount: Number(row.attemptCount ?? row.attempt_count ?? 0),
    maxAttempts: Number(row.maxAttempts ?? row.max_attempts ?? 5),
    availableAt: nullableString(row.availableAt ?? row.available_at),
    leaseOwner: nullableString(row.leaseOwner ?? row.lease_owner),
    leaseToken: nullableString(row.leaseToken ?? row.lease_token),
    leaseExpiresAt: nullableString(row.leaseExpiresAt ?? row.lease_expires_at),
    firstRequestedAt: nullableString(row.firstRequestedAt ?? row.first_requested_at),
    lastRequestedAt: nullableString(row.lastRequestedAt ?? row.last_requested_at),
    deletionEvidenceAt: nullableString(row.deletionEvidenceAt ?? row.deletion_evidence_at),
    contentHash: nullableString(row.contentHash ?? row.content_hash),
    schemaVersion: nullableString(row.schemaVersion ?? row.schema_version),
    builderVersion: nullableString(row.builderVersion ?? row.builder_version),
  };
}

export async function enqueueSupplierBillUclRefresh(input: {
  sourceId: string;
  reasonCode: SupplierBillRefreshReasonCode;
  priority?: number;
}) {
  if (!isSupplierBillRefreshReasonCode(input.reasonCode)) {
    throw new Error("Invalid Supplier Bill refresh reason code.");
  }
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("enqueue_supplier_bill_ucl_refresh", {
    p_source_id: input.sourceId,
    p_reason_code: input.reasonCode,
    p_priority: input.priority ?? getSupplierBillRefreshPriority(input.reasonCode),
  });
  if (error) throw new Error(error.message);
  return parseSupplierBillRefreshQueueRow(data);
}

export async function enqueueManualSupplierBillUclRefresh(sourceId: string) {
  return enqueueSupplierBillUclRefresh({
    sourceId,
    reasonCode: "supplier_bill_manual_refresh",
  });
}

export async function claimSupplierBillUclRefreshBatch(input: {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
} = {}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_supplier_bill_ucl_refresh_batch", {
    p_limit: input.limit ?? 10,
    p_organization_id: input.organizationId ?? null,
    p_worker_id: input.workerId ?? "supplier-bill-ucl-refresh-worker",
    p_lease_seconds: input.leaseSeconds ?? 900,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map(parseSupplierBillRefreshQueueRow);
}

export async function finalizeSupplierBillUclRefresh(
  input: SupplierBillRefreshFinalizeInput,
) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("finalize_supplier_bill_ucl_refresh", {
    p_queue_id: input.queueId,
    p_lease_token: input.leaseToken,
    p_outcome: input.outcome,
    p_retry_at: input.retryAt ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_summary: input.errorSummary ?? null,
    p_schema_version: input.metadata?.schemaVersion ?? null,
    p_builder_version: input.metadata?.builderVersion ?? null,
    p_content_hash: input.metadata?.contentHash ?? null,
    p_canonical_updated_at: input.metadata?.canonicalUpdatedAt ?? null,
    p_latest_dependency_updated_at: input.metadata?.latestDependencyUpdatedAt ?? null,
    p_payload_bytes: input.metadata?.payloadBytes ?? null,
  });
  if (error) throw new Error(error.message);
  return parseSupplierBillRefreshQueueRow(data);
}

export async function requeueSupplierBillUclRefreshDeadLetter(queueId: string) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("requeue_supplier_bill_ucl_refresh_dead_letter", {
    p_queue_id: queueId,
  });
  if (error) throw new Error(error.message);
  return parseSupplierBillRefreshQueueRow(data);
}

export async function getSupplierBillUclRefreshMetrics(
  organizationId?: string | null,
) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("get_supplier_bill_ucl_refresh_metrics", {
    p_organization_id: organizationId ?? null,
  });
  if (error) throw new Error(error.message);
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

export async function listSupplierBillUclRefreshRows(input: {
  organizationId?: string | null;
  state?: SupplierBillRefreshQueueState | null;
  limit?: number;
} = {}) {
  const admin = createDynamicAdminSupabaseClient();
  let query = admin
    .from("supplier_bill_ucl_refresh_queue")
    .select(
      "id,organization_id,container_type,source_id,reason_code,priority,queue_state,attempt_count,max_attempts,available_at,lease_owner,lease_expires_at,first_requested_at,last_requested_at,deletion_evidence_at,completed_at,first_failed_at,last_failed_at,last_error_code,last_error_summary,schema_version,builder_version,content_hash,canonical_updated_at,latest_dependency_updated_at,validated_at,payload_bytes,refresh_result,created_at,updated_at",
    );
  if (input.organizationId) query = query.eq("organization_id", input.organizationId);
  if (input.state) query = query.eq("queue_state", input.state);
  const { data, error } = await query
    .order("last_requested_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}
