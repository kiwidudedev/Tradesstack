import "server-only";

import {
  assertValidSupplierBillUclBusinessRecord,
  SUPPLIER_BILL_UCL_SCHEMA_VERSION,
  type SupplierBillUclBusinessRecord,
} from "@/lib/universal-learning/supplier-bill-schema";
import {
  buildSupplierBillStoredPayloadIntegrityHash,
  buildSupplierBillVisibilityScope,
  type SupplierBillContainerContextStatus,
} from "@/lib/universal-learning/supplier-bill-container-store";
import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";

export type SupplierBillStoredContainer = {
  record: SupplierBillUclBusinessRecord;
  current: {
    organizationId: string;
    sourceId: string;
    currentVersionId: string;
    contentHash: string;
    contextStatus: Exclude<SupplierBillContainerContextStatus, "deleted">;
    validatedAt: string;
  };
  version: {
    id: string;
    schemaVersion: "supplier_bill.v2";
    builderVersion: string;
    contentHash: string;
    canonicalUpdatedAt: string;
    latestDependencyUpdatedAt: string;
    assembledAt: string;
    validatedAt: string;
    payloadBytes: number;
  };
};

function integrityError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

export async function getCurrentSupplierBillUclContainer(input: {
  organizationId: string;
  sourceId: string;
}): Promise<SupplierBillStoredContainer> {
  const admin = createDynamicAdminSupabaseClient();
  const currentResult = await admin
    .from("supplier_bill_ucl_current_state")
    .select(
      "organization_id,container_type,source_id,current_version_id,schema_version,builder_version,content_hash,context_status,validated_at,visibility_scope_hash,deleted_at",
    )
    .eq("organization_id", input.organizationId)
    .eq("container_type", "supplier_invoice")
    .eq("source_id", input.sourceId)
    .maybeSingle();
  if (currentResult.error) throw integrityError("supplier_bill_ucl_retrieval_failed", currentResult.error.message);
  const current = currentResult.data as Record<string, unknown> | null;
  if (!current) {
    throw integrityError("supplier_bill_ucl_current_not_found", "Current Supplier Bill UCL context was not found.");
  }
  if (current.organization_id !== input.organizationId || current.source_id !== input.sourceId) {
    throw integrityError("supplier_bill_ucl_retrieval_scope_mismatch", "Stored Supplier Bill UCL scope does not match the requested identity.");
  }
  if (current.context_status === "deleted" || current.deleted_at) {
    throw integrityError("supplier_bill_ucl_current_deleted", "Deleted Supplier Bill UCL context is not retrievable.");
  }
  if (
    current.schema_version !== SUPPLIER_BILL_UCL_SCHEMA_VERSION
    || typeof current.current_version_id !== "string"
    || !["current", "voided"].includes(String(current.context_status))
  ) {
    throw integrityError("supplier_bill_ucl_current_schema_mismatch", "Current Supplier Bill UCL pointer is invalid.");
  }

  const versionResult = await admin
    .from("supplier_bill_ucl_container_versions")
    .select(
      "id,organization_id,container_type,source_id,schema_version,builder_version,content_hash,payload_integrity_hash,canonical_updated_at,latest_dependency_updated_at,assembled_at,validated_at,payload_bytes,payload_json,visibility_scope_hash,context_status",
    )
    .eq("id", current.current_version_id)
    .eq("organization_id", input.organizationId)
    .eq("source_id", input.sourceId)
    .maybeSingle();
  if (versionResult.error) throw integrityError("supplier_bill_ucl_retrieval_failed", versionResult.error.message);
  const version = versionResult.data as Record<string, unknown> | null;
  if (!version) {
    throw integrityError("supplier_bill_ucl_version_not_found", "Current Supplier Bill UCL version was not found.");
  }
  if (
    version.schema_version !== SUPPLIER_BILL_UCL_SCHEMA_VERSION
    || version.container_type !== "supplier_invoice"
    || version.organization_id !== input.organizationId
    || version.source_id !== input.sourceId
    || version.context_status !== current.context_status
  ) {
    throw integrityError("supplier_bill_ucl_version_scope_mismatch", "Stored Supplier Bill UCL version identity is invalid.");
  }

  const record = version.payload_json;
  assertValidSupplierBillUclBusinessRecord(record);
  if (
    record.organizationId !== input.organizationId
    || record.source.sourceId !== input.sourceId
    || record.payload.provenance.contentHash !== version.content_hash
    || version.content_hash !== current.content_hash
    || version.builder_version !== current.builder_version
  ) {
    throw integrityError("supplier_bill_ucl_hash_mismatch", "Stored Supplier Bill UCL metadata does not match its validated record.");
  }
  if (
    buildSupplierBillStoredPayloadIntegrityHash(record) !== version.payload_integrity_hash
  ) {
    throw integrityError("supplier_bill_ucl_payload_integrity_mismatch", "Stored Supplier Bill UCL payload integrity check failed.");
  }
  const serializedBytes = new TextEncoder().encode(JSON.stringify(record)).byteLength;
  if (
    !Number.isSafeInteger(Number(version.payload_bytes))
    || Number(version.payload_bytes) !== serializedBytes
    || serializedBytes < 1
    || serializedBytes > 64 * 1024
  ) {
    throw integrityError("supplier_bill_ucl_payload_size_invalid", "Stored Supplier Bill UCL payload size metadata is invalid.");
  }
  const visibility = buildSupplierBillVisibilityScope(record);
  if (
    visibility.visibilityScopeHash !== version.visibility_scope_hash
    || visibility.visibilityScopeHash !== current.visibility_scope_hash
  ) {
    throw integrityError("supplier_bill_ucl_visibility_mismatch", "Stored Supplier Bill UCL visibility metadata is inconsistent.");
  }

  return {
    record,
    current: {
      organizationId: input.organizationId,
      sourceId: input.sourceId,
      currentVersionId: String(current.current_version_id),
      contentHash: String(current.content_hash),
      contextStatus: String(current.context_status) as "current" | "voided",
      validatedAt: String(current.validated_at),
    },
    version: {
      id: String(version.id),
      schemaVersion: SUPPLIER_BILL_UCL_SCHEMA_VERSION,
      builderVersion: String(version.builder_version),
      contentHash: String(version.content_hash),
      canonicalUpdatedAt: String(version.canonical_updated_at),
      latestDependencyUpdatedAt: String(version.latest_dependency_updated_at),
      assembledAt: String(version.assembled_at),
      validatedAt: String(version.validated_at),
      payloadBytes: Number(version.payload_bytes),
    },
  };
}
