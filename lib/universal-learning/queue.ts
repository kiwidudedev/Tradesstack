import type { Json } from "@/lib/supabase/types";
import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";
import type {
  UniversalLearningContainerType,
} from "@/lib/universal-learning/types";

export type UniversalLearningQueueState =
  | "pending"
  | "claimed"
  | "retry_scheduled"
  | "completed"
  | "dead_lettered"
  | "skipped";

export type UniversalLearningQueueRow = {
  id: string;
  organizationId: string;
  containerType: UniversalLearningContainerType;
  reviewMonth: string;
  scopeKey: string;
  queueState: UniversalLearningQueueState;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string | null;
  retryAfter: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  claimedBy: string | null;
  claimToken: string | null;
  lastRunId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastCompletedAt: string | null;
  eligibilitySnapshot: Record<string, Json | null>;
  budgetSnapshot: Record<string, Json | null>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UniversalLearningFinalizeQueueInput = {
  id: string;
  claimToken: string;
  queueState: Extract<UniversalLearningQueueState, "completed" | "retry_scheduled" | "dead_lettered" | "skipped">;
  lastRunId?: string | null;
  retryAfter?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

function toRecord(value: unknown): Record<string, Json | null> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | null>
    : {};
}

function parseQueueRow(value: Record<string, unknown>): UniversalLearningQueueRow {
  return {
    id: String(value.id ?? ""),
    organizationId: String(value.organizationId ?? value.organization_id ?? ""),
    containerType: String(value.containerType ?? value.container_type ?? "") as UniversalLearningContainerType,
    reviewMonth: String(value.reviewMonth ?? value.review_month ?? ""),
    scopeKey: String(value.scopeKey ?? value.scope_key ?? "organization"),
    queueState: String(value.queueState ?? value.queue_state ?? "pending") as UniversalLearningQueueState,
    priority: Number(value.priority ?? 0),
    attemptCount: Number(value.attemptCount ?? value.attempt_count ?? 0),
    maxAttempts: Number(value.maxAttempts ?? value.max_attempts ?? 3),
    availableAt: typeof (value.availableAt ?? value.available_at) === "string" ? String(value.availableAt ?? value.available_at) : null,
    retryAfter: typeof (value.retryAfter ?? value.retry_after) === "string" ? String(value.retryAfter ?? value.retry_after) : null,
    claimedAt: typeof (value.claimedAt ?? value.claimed_at) === "string" ? String(value.claimedAt ?? value.claimed_at) : null,
    claimExpiresAt: typeof (value.claimExpiresAt ?? value.claim_expires_at) === "string" ? String(value.claimExpiresAt ?? value.claim_expires_at) : null,
    claimedBy: typeof (value.claimedBy ?? value.claimed_by) === "string" ? String(value.claimedBy ?? value.claimed_by) : null,
    claimToken: typeof (value.claimToken ?? value.claim_token) === "string" ? String(value.claimToken ?? value.claim_token) : null,
    lastRunId: typeof (value.lastRunId ?? value.last_run_id) === "string" ? String(value.lastRunId ?? value.last_run_id) : null,
    lastErrorCode: typeof (value.lastErrorCode ?? value.last_error_code) === "string" ? String(value.lastErrorCode ?? value.last_error_code) : null,
    lastErrorMessage: typeof (value.lastErrorMessage ?? value.last_error_message) === "string" ? String(value.lastErrorMessage ?? value.last_error_message) : null,
    lastCompletedAt: typeof (value.lastCompletedAt ?? value.last_completed_at) === "string" ? String(value.lastCompletedAt ?? value.last_completed_at) : null,
    eligibilitySnapshot: toRecord(value.eligibilitySnapshot ?? value.eligibility_snapshot),
    budgetSnapshot: toRecord(value.budgetSnapshot ?? value.budget_snapshot),
    createdAt: typeof (value.createdAt ?? value.created_at) === "string" ? String(value.createdAt ?? value.created_at) : null,
    updatedAt: typeof (value.updatedAt ?? value.updated_at) === "string" ? String(value.updatedAt ?? value.updated_at) : null,
  };
}

export async function enqueueLearningReviewQueue(input: {
  organizationId: string;
  containerType: UniversalLearningContainerType;
  reviewMonth: string;
  scopeKey?: string;
  priority?: number;
  maxAttempts?: number;
  availableAt?: string;
  eligibilitySnapshot?: Record<string, Json | null>;
  budgetSnapshot?: Record<string, Json | null>;
}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("enqueue_learning_review_queue", {
    p_organization_id: input.organizationId,
    p_container_type: input.containerType,
    p_review_month: /^\d{4}-\d{2}$/.test(input.reviewMonth) ? `${input.reviewMonth}-01` : input.reviewMonth,
    p_scope_key: input.scopeKey ?? "organization",
    p_priority: input.priority ?? 0,
    p_max_attempts: input.maxAttempts ?? 3,
    p_available_at: input.availableAt ?? new Date().toISOString(),
    p_eligibility_snapshot: input.eligibilitySnapshot ?? {},
    p_budget_snapshot: input.budgetSnapshot ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseQueueRow((data ?? {}) as Record<string, unknown>);
}

export async function claimLearningReviewBatch(input: {
  limit?: number;
  organizationId?: string | null;
  containerType?: UniversalLearningContainerType | null;
  workerId?: string | null;
  leaseSeconds?: number;
} = {}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_learning_review_batch", {
    p_limit: input.limit ?? 5,
    p_organization_id: input.organizationId ?? null,
    p_container_type: input.containerType ?? null,
    p_worker_id: input.workerId ?? "universal-construction-learning-worker",
    p_lease_seconds: input.leaseSeconds ?? 900,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => parseQueueRow((row ?? {}) as Record<string, unknown>));
}

export async function finalizeLearningReviewBatch(inputs: UniversalLearningFinalizeQueueInput[]) {
  if (inputs.length === 0) {
    return {
      count: 0,
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
      skippedCount: 0,
    };
  }

  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("finalize_learning_review_batch", {
    p_inputs: inputs,
  });

  if (error) {
    throw new Error(error.message);
  }

  const record = (data ?? {}) as Record<string, unknown>;
  return {
    count: Number(record.count ?? 0),
    completedCount: Number(record.completedCount ?? 0),
    retriedCount: Number(record.retriedCount ?? 0),
    deadLetteredCount: Number(record.deadLetteredCount ?? 0),
    skippedCount: Number(record.skippedCount ?? 0),
  };
}

export async function hasActiveLearningReviewQueueRow(input: {
  organizationId: string;
  containerType: UniversalLearningContainerType;
  reviewMonth: string;
  scopeKey?: string;
}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin
    .from("learning_review_queue")
    .select("id, queue_state")
    .eq("organization_id", input.organizationId)
    .eq("container_type", input.containerType)
    .eq("scope_key", input.scopeKey ?? "organization")
    .eq("review_month", /^\d{4}-\d{2}$/.test(input.reviewMonth) ? `${input.reviewMonth}-01` : input.reviewMonth)
    .in("queue_state", ["pending", "claimed", "retry_scheduled"])
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function retryDeadLetteredLearningReviewQueueRow(input: {
  queueId: string;
  availableAt?: string;
  maxAttempts?: number;
}) {
  const admin = createDynamicAdminSupabaseClient();
  const patch: Record<string, unknown> = {
    queue_state: "pending",
    available_at: input.availableAt ?? new Date().toISOString(),
    retry_after: null,
    claimed_at: null,
    claim_expires_at: null,
    claimed_by: null,
    claim_token: null,
    last_error_code: null,
    last_error_message: null,
  };

  if (typeof input.maxAttempts === "number") {
    patch.max_attempts = Math.max(1, input.maxAttempts);
  }

  const { data, error } = await admin
    .from("learning_review_queue")
    .update(patch)
    .eq("id", input.queueId)
    .eq("queue_state", "dead_lettered")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Dead-lettered learning review queue row not found.");
  }

  return parseQueueRow(data as Record<string, unknown>);
}
