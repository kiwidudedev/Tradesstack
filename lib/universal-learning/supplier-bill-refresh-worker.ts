import "server-only";

import { buildUniversalLearningContainerRecords } from "@/lib/universal-learning/builders";
import {
  deleteSupplierBillUclCurrentContainer,
  persistSupplierBillUclContainer,
} from "@/lib/universal-learning/supplier-bill-container-store";
import {
  claimSupplierBillUclRefreshBatch,
  finalizeSupplierBillUclRefresh,
  finalizeSupplierBillUclRefreshStale,
  type SupplierBillRefreshQueueRow,
  type SupplierBillRefreshSuccessMetadata,
} from "@/lib/universal-learning/supplier-bill-refresh-queue";
import {
  assertValidSupplierBillUclBusinessRecord,
  SUPPLIER_BILL_UCL_SCHEMA_VERSION,
} from "@/lib/universal-learning/supplier-bill-schema";
import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";

type SupplierBillRefreshFailure = {
  retryable: boolean;
  errorCode: string;
  errorSummary: string;
};

export type SupplierBillRefreshWorkerResult = {
  claimedCount: number;
  changedCount: number;
  noChangeCount: number;
  voidedCount: number;
  deletedCount: number;
  retriedCount: number;
  deadLetteredCount: number;
  supersededCount: number;
  staleCount: number;
  versionCreatedCount: number;
  versionReusedCount: number;
  results: Array<{
    queueId: string;
    organizationId: string;
    sourceId: string;
    outcome: "changed" | "no_change" | "voided" | "deleted" | "retry" | "dead_letter" | "superseded" | "stale";
    errorCode: string | null;
    versionId: string | null;
    versionCreated: boolean;
    versionReused: boolean;
    payloadBytes: number | null;
    contextStatus: string | null;
    diagnosticCode:
      | "supplier_bill_ucl_version_created"
      | "supplier_bill_ucl_version_reused"
      | "supplier_bill_ucl_stale_write_rejected"
      | "supplier_bill_ucl_deleted"
      | "supplier_bill_ucl_persistence_failed"
      | null;
  }>;
};

function byteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function codedError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

export function getSupplierBillRefreshRetryAt(
  attemptCount: number,
  now = new Date(),
) {
  const minutes = attemptCount <= 1
    ? 15
    : attemptCount === 2
      ? 60
      : attemptCount === 3
        ? 240
        : 1_440;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function classifySupplierBillRefreshFailure(error: unknown): SupplierBillRefreshFailure {
  const code =
    error && typeof error === "object" && "code" in error
      && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const message = error instanceof Error ? error.message : "";
  const lower = `${code} ${message}`.toLowerCase();

  if (
    code === "supplier_bill_source_cross_organization"
    || code === "supplier_bill_source_missing_unconfirmed"
    || code === "supplier_bill_refresh_identity_invalid"
    || lower.includes("invalid supplier bill ucl container")
    || lower.includes("cross-organization")
    || code === "22023"
    || code.startsWith("supplier_bill_ucl_persistence_")
  ) {
    return {
      retryable: false,
      errorCode: code || "supplier_bill_ucl_validation_failed",
      errorSummary: code === "supplier_bill_source_missing_unconfirmed"
        ? "Canonical Supplier Bill was missing without atomic deletion evidence."
        : code === "supplier_bill_source_cross_organization"
          ? "Canonical Supplier Bill organization identity did not match the refresh request."
          : "Supplier Bill UCL validation failed.",
    };
  }

  if (
    lower.includes("timeout")
    || lower.includes("temporar")
    || lower.includes("connection")
    || lower.includes("network")
    || lower.includes("lock")
    || lower.includes("fetch failed")
    || lower.includes("500")
    || lower.includes("502")
    || lower.includes("503")
    || lower.includes("504")
  ) {
    return {
      retryable: true,
      errorCode: code || "supplier_bill_refresh_dependency_unavailable",
      errorSummary: "A temporary canonical dependency read failed.",
    };
  }

  return {
    retryable: false,
    errorCode: code || "supplier_bill_refresh_failed",
    errorSummary: "Supplier Bill current-context refresh failed.",
  };
}

async function loadCanonicalSupplierBillIdentity(row: SupplierBillRefreshQueueRow) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin
    .from("supplier_invoices")
    .select("id,organization_id,status,updated_at")
    .eq("id", row.sourceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const source = data as Record<string, unknown>;
  if (source.organization_id !== row.organizationId) {
    throw codedError(
      "supplier_bill_source_cross_organization",
      "Supplier Bill refresh source resolved to another organization.",
    );
  }
  return source;
}

async function rebuildSupplierBillCurrentContext(row: SupplierBillRefreshQueueRow) {
  const identity = await loadCanonicalSupplierBillIdentity(row);
  if (!identity) {
    if (row.deletionEvidenceAt) return { deleted: true as const };
    throw codedError(
      "supplier_bill_source_missing_unconfirmed",
      "Supplier Bill source is missing without confirmed deletion evidence.",
    );
  }
  if (row.deletionEvidenceAt) {
    throw codedError(
      "supplier_bill_refresh_identity_invalid",
      "Deletion evidence conflicts with an existing canonical Supplier Bill.",
    );
  }

  const canonicalUpdatedAt =
    typeof identity.updated_at === "string" && !Number.isNaN(Date.parse(identity.updated_at))
      ? identity.updated_at
      : new Date().toISOString();
  const reviewMonth = canonicalUpdatedAt.slice(0, 7);
  const built = await buildUniversalLearningContainerRecords({
    containerType: "supplier_invoice",
    context: {
      organizationId: row.organizationId,
      cursor: { updatedAt: null, id: null },
      reviewMonth,
    },
    sourceIds: [row.sourceId],
    limit: 1,
  });
  const record = built.records[0] ?? null;
  if (!record || record.source.sourceId !== row.sourceId) {
    throw codedError(
      "supplier_bill_refresh_identity_invalid",
      "Targeted Supplier Bill rebuild did not return the requested source.",
    );
  }
  assertValidSupplierBillUclBusinessRecord(record);
  const contentHash = record.payload.provenance.contentHash;
  if (!contentHash) {
    throw codedError(
      "supplier_bill_refresh_identity_invalid",
      "Validated Supplier Bill UCL did not include a content hash.",
    );
  }
  const metadata: SupplierBillRefreshSuccessMetadata = {
    schemaVersion: SUPPLIER_BILL_UCL_SCHEMA_VERSION,
    builderVersion: record.payload.provenance.builderVersion,
    contentHash,
    canonicalUpdatedAt: record.payload.provenance.canonicalRecordUpdatedAt,
    latestDependencyUpdatedAt: record.payload.provenance.latestDependencyUpdatedAt,
    payloadBytes: byteLength(record),
  };
  const canonicalStatus = record.payload.sourceEvidence.bill.canonicalStatus.trim().toLowerCase();
  const voided = ["void", "voided", "cancelled", "canceled"].includes(canonicalStatus);
  return { deleted: false as const, metadata, voided, record };
}

async function finalizeOwnedLease(
  input: Parameters<typeof finalizeSupplierBillUclRefresh>[0],
) {
  try {
    await finalizeSupplierBillUclRefresh(input);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("lease is not owned")) {
      // A newer canonical mutation coalesced into this identity and invalidated
      // the old lease. The row is pending again and must be rebuilt fresh.
      return false;
    }
    throw error;
  }
}

async function processSupplierBillRefreshRow(row: SupplierBillRefreshQueueRow) {
  if (!row.leaseToken) {
    return {
      outcome: "dead_letter" as const,
      errorCode: "supplier_bill_refresh_missing_lease",
      finalized: false,
      persisted: null,
      persistenceFailed: false,
    };
  }

  let persistenceAttempted = false;
  try {
    const rebuilt = await rebuildSupplierBillCurrentContext(row);
    if (rebuilt.deleted) {
      persistenceAttempted = true;
      const persisted = await deleteSupplierBillUclCurrentContainer({
        queueId: row.id,
        leaseToken: row.leaseToken,
        organizationId: row.organizationId,
        sourceId: row.sourceId,
        refreshReason: "supplier_bill_deleted",
        deletionEvidenceAt: row.deletionEvidenceAt!,
      });
      const finalized = await finalizeOwnedLease({
        queueId: row.id,
        leaseToken: row.leaseToken,
        outcome: "deleted",
      });
      return {
        outcome: finalized ? "deleted" as const : "superseded" as const,
        errorCode: null,
        finalized,
        persisted,
        persistenceFailed: false,
      };
    }

    persistenceAttempted = true;
    const persisted = await persistSupplierBillUclContainer({
      queueId: row.id,
      leaseToken: row.leaseToken,
      organizationId: row.organizationId,
      sourceId: row.sourceId,
      record: rebuilt.record,
      contextStatus: rebuilt.voided ? "voided" : "current",
      refreshReason: row.reasonCode,
    });
    if (persisted.staleWriteRejected) {
      await finalizeSupplierBillUclRefreshStale({
        queueId: row.id,
        leaseToken: row.leaseToken,
      });
      return {
        outcome: "stale" as const,
        errorCode: "supplier_bill_ucl_stale_write_rejected",
        finalized: true,
        persisted,
        persistenceFailed: false,
      };
    }
    const outcome = rebuilt.voided
      ? "voided" as const
      : persisted.contentChanged
        ? "changed" as const
        : "no_change" as const;
    const finalized = await finalizeOwnedLease({
      queueId: row.id,
      leaseToken: row.leaseToken,
      outcome,
      metadata: rebuilt.metadata,
    });
    return {
      outcome: finalized ? outcome : "superseded" as const,
      errorCode: null,
      finalized,
      persisted,
      persistenceFailed: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
    if (
      errorMessage.includes("persistence lease is not owned")
      || errorMessage.includes("deletion lease is not owned")
    ) {
      return {
        outcome: "superseded" as const,
        errorCode: null,
        finalized: false,
        persisted: null,
        persistenceFailed: false,
      };
    }
    const failure = classifySupplierBillRefreshFailure(error);
    const outcome = failure.retryable && row.attemptCount < row.maxAttempts
      ? "retry" as const
      : "dead_letter" as const;
    const finalized = await finalizeOwnedLease({
      queueId: row.id,
      leaseToken: row.leaseToken,
      outcome,
      retryAt: outcome === "retry" ? getSupplierBillRefreshRetryAt(row.attemptCount) : null,
      errorCode: failure.errorCode,
      errorSummary: failure.errorSummary,
    });
    return {
      outcome: finalized ? outcome : "superseded" as const,
      errorCode: failure.errorCode,
      finalized,
      persisted: null,
      persistenceFailed: persistenceAttempted,
    };
  }
}

export async function runSupplierBillUclRefreshWorker(input: {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
} = {}): Promise<SupplierBillRefreshWorkerResult> {
  const rows = await claimSupplierBillUclRefreshBatch(input);
  const results: SupplierBillRefreshWorkerResult["results"] = [];

  for (const row of rows) {
    const result = await processSupplierBillRefreshRow(row);
    results.push({
      queueId: row.id,
      organizationId: row.organizationId,
      sourceId: row.sourceId,
      outcome: result.outcome,
      errorCode: result.errorCode,
      versionId: result.persisted?.versionId ?? null,
      versionCreated: result.persisted?.createdVersion ?? false,
      versionReused: result.persisted?.reusedVersion ?? false,
      payloadBytes: result.persisted?.payloadBytes ?? null,
      contextStatus: result.persisted?.contextStatus ?? null,
      diagnosticCode:
        result.outcome === "deleted"
          ? "supplier_bill_ucl_deleted"
          : result.outcome === "stale"
            ? "supplier_bill_ucl_stale_write_rejected"
            : result.persisted?.createdVersion
              ? "supplier_bill_ucl_version_created"
              : result.persisted?.reusedVersion
                ? "supplier_bill_ucl_version_reused"
                : result.persistenceFailed
                  ? "supplier_bill_ucl_persistence_failed"
                  : null,
    });
  }

  return {
    claimedCount: rows.length,
    changedCount: results.filter((result) => result.outcome === "changed").length,
    noChangeCount: results.filter((result) => result.outcome === "no_change").length,
    voidedCount: results.filter((result) => result.outcome === "voided").length,
    deletedCount: results.filter((result) => result.outcome === "deleted").length,
    retriedCount: results.filter((result) => result.outcome === "retry").length,
    deadLetteredCount: results.filter((result) => result.outcome === "dead_letter").length,
    supersededCount: results.filter((result) => result.outcome === "superseded").length,
    staleCount: results.filter((result) => result.outcome === "stale").length,
    versionCreatedCount: results.filter((result) => result.versionCreated).length,
    versionReusedCount: results.filter((result) => result.versionReused).length,
    results,
  };
}
