import "server-only";

import { createHash } from "node:crypto";
import {
  assertValidSupplierBillUclBusinessRecord,
  SUPPLIER_BILL_UCL_CONTAINER_TYPE,
  SUPPLIER_BILL_UCL_LIMITS,
  SUPPLIER_BILL_UCL_SCHEMA_VERSION,
  type SupplierBillUclBusinessRecord,
} from "@/lib/universal-learning/supplier-bill-schema";
import {
  isSupplierBillRefreshReasonCode,
  type SupplierBillRefreshReasonCode,
} from "@/lib/universal-learning/supplier-bill-refresh-reasons";
import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";

export type SupplierBillContainerContextStatus = "current" | "voided" | "deleted";

export type SupplierBillContainerPersistenceResult = {
  createdVersion: boolean;
  reusedVersion: boolean;
  currentUpdated: boolean;
  contentChanged: boolean;
  staleWriteRejected: boolean;
  versionId: string | null;
  currentHash: string | null;
  versionCount: number | null;
  payloadBytes: number | null;
  contextStatus: SupplierBillContainerContextStatus;
};

function codedError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

export function buildSupplierBillStoredPayloadIntegrityHash(value: unknown) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function buildSupplierBillVisibilityScope(record: SupplierBillUclBusinessRecord) {
  const projectIds = [...new Set(record.payload.visibility.projectIds)].sort();
  const visibility = {
    organizationId: record.payload.visibility.organizationId,
    projectIds,
    primaryProjectId: record.projectId,
    supplierId: record.supplierId,
    requiresSupplierInvoiceView: record.payload.visibility.requiresSupplierInvoiceView,
    requiresAccountingVisibility: record.payload.visibility.requiresAccountingVisibility,
  };
  return {
    projectIds,
    visibilityJson: record.payload.visibility,
    visibilityScopeHash: buildSupplierBillStoredPayloadIntegrityHash(visibility),
  };
}

function parsePersistenceResult(value: unknown): SupplierBillContainerPersistenceResult {
  const result = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const contextStatus = String(result.contextStatus ?? "");
  if (!["current", "voided", "deleted"].includes(contextStatus)) {
    throw codedError(
      "supplier_bill_ucl_persistence_result_invalid",
      "Supplier Bill UCL persistence returned an invalid context status.",
    );
  }
  return {
    createdVersion: result.createdVersion === true,
    reusedVersion: result.reusedVersion === true,
    currentUpdated: result.currentUpdated === true,
    contentChanged: result.contentChanged === true,
    staleWriteRejected: result.staleWriteRejected === true,
    versionId: typeof result.versionId === "string" ? result.versionId : null,
    currentHash: typeof result.currentHash === "string" ? result.currentHash : null,
    versionCount: typeof result.versionCount === "number" ? result.versionCount : null,
    payloadBytes: typeof result.payloadBytes === "number" ? result.payloadBytes : null,
    contextStatus: contextStatus as SupplierBillContainerContextStatus,
  };
}

export async function persistSupplierBillUclContainer(input: {
  queueId: string;
  leaseToken: string;
  organizationId: string;
  sourceId: string;
  record: SupplierBillUclBusinessRecord;
  contextStatus: Exclude<SupplierBillContainerContextStatus, "deleted">;
  refreshReason: SupplierBillRefreshReasonCode;
}) {
  // Persistence is a separate trust boundary. Validate the deserialized full
  // business record immediately before computing metadata and calling the RPC.
  assertValidSupplierBillUclBusinessRecord(input.record);
  if (!isSupplierBillRefreshReasonCode(input.refreshReason)) {
    throw codedError(
      "supplier_bill_ucl_persistence_metadata_invalid",
      "Supplier Bill UCL persistence received an invalid refresh reason.",
    );
  }
  if (
    input.record.containerType !== SUPPLIER_BILL_UCL_CONTAINER_TYPE
    || input.record.payload.schemaVersion !== SUPPLIER_BILL_UCL_SCHEMA_VERSION
    || input.record.organizationId !== input.organizationId
    || input.record.source.sourceId !== input.sourceId
  ) {
    throw codedError(
      "supplier_bill_ucl_persistence_identity_invalid",
      "Supplier Bill UCL persistence identity does not match the validated record.",
    );
  }

  const serialized = JSON.stringify(input.record);
  const payloadBytes = new TextEncoder().encode(serialized).byteLength;
  if (payloadBytes > SUPPLIER_BILL_UCL_LIMITS.serializedPayloadBytes) {
    throw codedError(
      "supplier_bill_ucl_persistence_payload_too_large",
      "Validated Supplier Bill UCL record exceeds the persistence byte limit.",
    );
  }
  const contentHash = input.record.payload.provenance.contentHash;
  if (!contentHash || !/^[0-9a-f]{64}$/.test(contentHash)) {
    throw codedError(
      "supplier_bill_ucl_persistence_hash_invalid",
      "Validated Supplier Bill UCL record has an invalid content hash.",
    );
  }
  const { projectIds, visibilityJson, visibilityScopeHash } =
    buildSupplierBillVisibilityScope(input.record);
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("persist_supplier_bill_ucl_container", {
    p_queue_id: input.queueId,
    p_lease_token: input.leaseToken,
    p_organization_id: input.organizationId,
    p_source_id: input.sourceId,
    p_container_type: SUPPLIER_BILL_UCL_CONTAINER_TYPE,
    p_schema_version: SUPPLIER_BILL_UCL_SCHEMA_VERSION,
    p_builder_version: input.record.payload.provenance.builderVersion,
    p_content_hash: contentHash,
    p_payload_integrity_hash: buildSupplierBillStoredPayloadIntegrityHash(input.record),
    p_canonical_updated_at: input.record.payload.provenance.canonicalRecordUpdatedAt,
    p_latest_dependency_updated_at: input.record.payload.provenance.latestDependencyUpdatedAt,
    p_assembled_at: input.record.payload.provenance.assembledAt,
    p_validated_at: new Date().toISOString(),
    p_payload_bytes: payloadBytes,
    p_payload_json: input.record,
    p_visibility_json: visibilityJson,
    p_project_ids: projectIds,
    p_primary_project_id: input.record.projectId,
    p_supplier_id: input.record.supplierId,
    p_visibility_scope_hash: visibilityScopeHash,
    p_context_status: input.contextStatus,
    p_refresh_reason: input.refreshReason,
  });
  if (error) {
    throw codedError(
      error.code ?? "supplier_bill_ucl_persistence_failed",
      error.message,
    );
  }
  return parsePersistenceResult(data);
}

export async function deleteSupplierBillUclCurrentContainer(input: {
  queueId: string;
  leaseToken: string;
  organizationId: string;
  sourceId: string;
  refreshReason: "supplier_bill_deleted";
  deletionEvidenceAt: string;
}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("delete_supplier_bill_ucl_current_container", {
    p_queue_id: input.queueId,
    p_lease_token: input.leaseToken,
    p_organization_id: input.organizationId,
    p_source_id: input.sourceId,
    p_refresh_reason: input.refreshReason,
    p_deletion_evidence_at: input.deletionEvidenceAt,
  });
  if (error) {
    throw codedError(
      error.code ?? "supplier_bill_ucl_persistence_failed",
      error.message,
    );
  }
  return parsePersistenceResult(data);
}
