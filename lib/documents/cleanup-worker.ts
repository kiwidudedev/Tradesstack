import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type RpcResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};
type DynamicRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<RpcResult>;

export interface DocumentCleanupJob {
  jobId: string;
  claimToken: string;
  organizationId: string;
  workspaceId: string;
  cleanupBatchId: string | null;
  jobType: "abandoned_upload" | "version_purge" | "orphan_reconciliation";
  storageBucket: string;
  storageKey: string;
  byteSize: number;
  attemptCount: number;
  maxAttempts: number;
}

export interface DocumentCleanupWorkerResult {
  expiredUploadCount: number;
  reconciliation: {
    databaseWithoutObjectCount: number;
    metadataMismatchCount: number;
    orphanObjectCount: number;
  };
  claimedCount: number;
  completedCount: number;
  skippedDeleteCount: number;
  reviewedOrphanCount: number;
  retriedCount: number;
  deadLetteredCount: number;
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const admin = createAdminSupabaseClient();
  const result = await (admin.rpc as unknown as DynamicRpc)(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function classifyDocumentCleanupError(error: unknown): {
  code: string;
  message: string;
} {
  const source = error instanceof Error ? error.message : "Unknown cleanup failure.";
  const normalized = source.toLowerCase();
  if (normalized.includes("timeout") || normalized.includes("network")) {
    return {
      code: "storage_temporarily_unavailable",
      message: "Storage was temporarily unavailable.",
    };
  }
  if (normalized.includes("lease")) {
    return {
      code: "cleanup_lease_lost",
      message: "Cleanup lease was no longer owned.",
    };
  }
  return {
    code: "storage_delete_failed",
    message: "The Storage cleanup operation failed.",
  };
}

export async function claimDocumentCleanupJobs(params: {
  limit: number;
  workerId: string;
  leaseSeconds: number;
}): Promise<DocumentCleanupJob[]> {
  const data = await rpc("claim_document_storage_cleanup_jobs", {
    p_limit: params.limit,
    p_worker_id: params.workerId,
    p_lease_seconds: params.leaseSeconds,
  });
  return rows(data).map((row) => ({
    jobId: String(row.job_id),
    claimToken: String(row.claim_token),
    organizationId: String(row.organization_id),
    workspaceId: String(row.workspace_id),
    cleanupBatchId: row.cleanup_batch_id ? String(row.cleanup_batch_id) : null,
    jobType: String(row.job_type) as DocumentCleanupJob["jobType"],
    storageBucket: String(row.storage_bucket),
    storageKey: String(row.storage_key),
    byteSize: Number(row.byte_size),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
  }));
}

async function completeCleanupJob(job: DocumentCleanupJob): Promise<void> {
  await rpc("complete_document_storage_cleanup_job", {
    p_job_id: job.jobId,
    p_claim_token: job.claimToken,
  });
}

async function failCleanupJob(
  job: DocumentCleanupJob,
  error: unknown,
): Promise<"retry_scheduled" | "dead_lettered"> {
  const safe = classifyDocumentCleanupError(error);
  const data = await rpc("fail_document_storage_cleanup_job", {
    p_job_id: job.jobId,
    p_claim_token: job.claimToken,
    p_error_code: safe.code,
    p_error_message: safe.message,
  });
  return data === "dead_lettered" ? "dead_lettered" : "retry_scheduled";
}

async function processCleanupJob(job: DocumentCleanupJob): Promise<{
  skippedDelete: boolean;
  reviewedOrphan: boolean;
}> {
  if (job.jobType === "orphan_reconciliation") {
    // Orphans are deliberately review-only. Unknown objects are never deleted
    // automatically by reconciliation.
    await completeCleanupJob(job);
    return { skippedDelete: true, reviewedOrphan: true };
  }

  const exists = await rpc("document_cleanup_storage_object_exists", {
    p_job_id: job.jobId,
    p_claim_token: job.claimToken,
  });

  if (exists === true) {
    const admin = createAdminSupabaseClient();
    const removal = await admin.storage
      .from(job.storageBucket)
      .remove([job.storageKey]);
    if (removal.error) throw new Error(removal.error.message);
  }

  await completeCleanupJob(job);
  return { skippedDelete: exists !== true, reviewedOrphan: false };
}

export async function runDocumentCleanupWorker(params: {
  limit?: number;
  workerId?: string;
  leaseSeconds?: number;
  reconciliationLimit?: number;
} = {}): Promise<DocumentCleanupWorkerResult> {
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 500);
  const leaseSeconds = Math.min(Math.max(params.leaseSeconds ?? 300, 30), 3_600);
  const reconciliationLimit = Math.min(
    Math.max(params.reconciliationLimit ?? 1_000, 1),
    5_000,
  );
  const workerId = params.workerId?.trim() || "document-storage-cleanup";

  const expiredData = await rpc("abandon_expired_document_uploads", {
    p_limit: Math.min(limit * 2, 1_000),
  });
  const reconciliationData = object(await rpc(
    "reconcile_document_storage_catalog",
    { p_limit: reconciliationLimit },
  ));
  const jobs = await claimDocumentCleanupJobs({ limit, workerId, leaseSeconds });

  const result: DocumentCleanupWorkerResult = {
    expiredUploadCount: Number(expiredData ?? 0),
    reconciliation: {
      databaseWithoutObjectCount: Number(
        reconciliationData.databaseWithoutObjectCount ?? 0,
      ),
      metadataMismatchCount: Number(
        reconciliationData.metadataMismatchCount ?? 0,
      ),
      orphanObjectCount: Number(reconciliationData.orphanObjectCount ?? 0),
    },
    claimedCount: jobs.length,
    completedCount: 0,
    skippedDeleteCount: 0,
    reviewedOrphanCount: 0,
    retriedCount: 0,
    deadLetteredCount: 0,
  };

  // A bounded pool avoids N+1 latency for large purges without creating an
  // unbounded burst against Storage or the database.
  const concurrency = 20;
  for (let offset = 0; offset < jobs.length; offset += concurrency) {
    const batch = jobs.slice(offset, offset + concurrency);
    await Promise.all(batch.map(async (job) => {
      try {
        const outcome = await processCleanupJob(job);
        result.completedCount += 1;
        if (outcome.skippedDelete) result.skippedDeleteCount += 1;
        if (outcome.reviewedOrphan) result.reviewedOrphanCount += 1;
      } catch (error) {
        try {
          const state = await failCleanupJob(job, error);
          if (state === "dead_lettered") result.deadLetteredCount += 1;
          else result.retriedCount += 1;
        } catch (finalizeError) {
          console.error("[document-storage-cleanup] failed to finalize job", {
            error: finalizeError instanceof Error
              ? finalizeError.message
              : "unknown",
          });
        }
      }
    }));
  }

  return result;
}
