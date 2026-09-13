import { applyUniversalLearningMemoryActions } from "@/lib/universal-learning/memory-actions";
import {
  claimLearningReviewBatch,
  finalizeLearningReviewBatch,
  type UniversalLearningFinalizeQueueInput,
  type UniversalLearningQueueRow,
} from "@/lib/universal-learning/queue";
import { runUniversalConstructionLearningReview } from "@/lib/universal-learning/runner";
import type { UniversalLearningContainerType } from "@/lib/universal-learning/types";

export type UniversalLearningWorkerResult = {
  claimedCount: number;
  completedCount: number;
  retriedCount: number;
  deadLetteredCount: number;
  skippedCount: number;
  results: Array<{
    queueId: string;
    containerType: UniversalLearningContainerType;
    reviewMonth: string;
    queueState: UniversalLearningFinalizeQueueInput["queueState"];
    reviewRunId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
};

function normalizeReviewMonth(value: string) {
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : value;
}

export function getUniversalLearningRetryAfter(attemptCount: number, now = new Date()) {
  const minutes = attemptCount <= 1
    ? 15
    : attemptCount === 2
      ? 120
      : 1_440;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function classifyUniversalLearningWorkerFailure(error: unknown): {
  retryable: boolean;
  errorCode: string;
  errorMessage: string;
} {
  const message = error instanceof Error ? error.message : "Universal learning review failed.";
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const lower = `${code} ${message}`.toLowerCase();

  const deterministicCodes = new Set([
    "provenance_source_id_invalid",
    "target_memory_id_invalid",
    "memory_action_preflight_failed",
    "model_output_unparseable",
    "supplier_bill_prompt_compaction_failed",
  ]);
  if (
    deterministicCodes.has(code)
    || lower.includes("invalid learnings.")
    || lower.includes("invalid memoryactions.")
    || lower.includes("schema")
    || lower.includes("boundary")
    || lower.includes("construction profile")
  ) {
    return {
      retryable: false,
      errorCode: code || "deterministic_learning_review_failure",
      errorMessage: message,
    };
  }

  if (
    lower.includes("timeout")
    || lower.includes("rate limit")
    || lower.includes("429")
    || lower.includes("500")
    || lower.includes("502")
    || lower.includes("503")
    || lower.includes("504")
    || lower.includes("network")
    || lower.includes("fetch failed")
    || lower.includes("temporar")
  ) {
    return {
      retryable: true,
      errorCode: code || "transient_learning_review_failure",
      errorMessage: message,
    };
  }

  return {
    retryable: false,
    errorCode: code || "learning_review_failed",
    errorMessage: message,
  };
}

async function processQueueRow(row: UniversalLearningQueueRow): Promise<UniversalLearningFinalizeQueueInput & {
  reviewRunId: string | null;
}> {
  if (!row.claimToken) {
    return {
      id: row.id,
      claimToken: "",
      queueState: "dead_lettered",
      errorCode: "missing_claim_token",
      errorMessage: "Claimed learning review queue row did not include a claim token.",
      reviewRunId: null,
    };
  }

  try {
    const result = await runUniversalConstructionLearningReview({
      selection: {
        organizationId: row.organizationId,
        containerType: row.containerType,
        reviewMonth: normalizeReviewMonth(row.reviewMonth),
        runType: "monthly",
        scopeKey: row.scopeKey,
      },
      applyMemoryActions: async ({ reviewRunId, selection, response, records, existingMemories }) =>
        applyUniversalLearningMemoryActions({
          reviewRunId,
          selection,
          response,
          records,
          existingMemories,
        }),
    });

    return {
      id: row.id,
      claimToken: row.claimToken,
      queueState: "completed",
      lastRunId: result.reviewRunId,
      reviewRunId: result.reviewRunId,
    };
  } catch (error) {
    const failure = classifyUniversalLearningWorkerFailure(error);
    const shouldDeadLetter = !failure.retryable || row.attemptCount >= row.maxAttempts;
    return {
      id: row.id,
      claimToken: row.claimToken,
      queueState: shouldDeadLetter ? "dead_lettered" : "retry_scheduled",
      retryAfter: shouldDeadLetter ? null : getUniversalLearningRetryAfter(row.attemptCount),
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
      reviewRunId: null,
    };
  }
}

export async function runUniversalLearningQueueWorker(input: {
  limit?: number;
  organizationId?: string | null;
  containerType?: UniversalLearningContainerType | null;
  workerId?: string | null;
  leaseSeconds?: number;
} = {}): Promise<UniversalLearningWorkerResult> {
  const rows = await claimLearningReviewBatch({
    limit: input.limit ?? 5,
    organizationId: input.organizationId,
    containerType: input.containerType,
    workerId: input.workerId,
    leaseSeconds: input.leaseSeconds,
  });

  const finalizeInputs: UniversalLearningFinalizeQueueInput[] = [];
  const results: UniversalLearningWorkerResult["results"] = [];

  for (const row of rows) {
    const result = await processQueueRow(row);
    finalizeInputs.push(result);
    results.push({
      queueId: row.id,
      containerType: row.containerType,
      reviewMonth: row.reviewMonth,
      queueState: result.queueState,
      reviewRunId: result.reviewRunId,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
    });
  }

  const finalized = await finalizeLearningReviewBatch(finalizeInputs);

  return {
    claimedCount: rows.length,
    completedCount: finalized.completedCount,
    retriedCount: finalized.retriedCount,
    deadLetteredCount: finalized.deadLetteredCount,
    skippedCount: finalized.skippedCount,
    results,
  };
}
