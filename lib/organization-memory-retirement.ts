import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type OrganizationMemoryRetirementQueueState =
  | "pending"
  | "claimed"
  | "retry_scheduled"
  | "completed"
  | "dead_lettered";

type OrganizationMemoryRetirementQueueRow = {
  id: string;
  organizationId: string;
  memoryId: string;
  queueState: OrganizationMemoryRetirementQueueState;
  attemptCount: number;
  maxAttempts: number;
  priority: number;
  availableAt: string | null;
  retryAfter: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  claimedBy: string | null;
  claimToken: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastNoActionReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type OrganizationMemoryRetirementNoActionReason =
  | "not_low_confidence"
  | "not_enough_contradiction"
  | "replacement_candidate_exists"
  | "recently_reinforced"
  | "grace_period_not_elapsed"
  | "already_inactive"
  | "already_retired"
  | "already_superseded"
  | "user_confirmed"
  | "no_domain_signature"
  | "missing_memory";

type RetirementEvaluationOutcome =
  | {
      status: "retired";
      basisHash: string;
      lifecycleHistoryId: string;
      reasonSummary: string;
    }
  | {
      status: "no_action";
      reason: OrganizationMemoryRetirementNoActionReason;
      detail: string;
    };

export type RunOrganizationMemoryRetirementWorkerInput = {
  limit?: number;
  organizationId?: string | null;
  memoryId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
  gracePeriodDays?: number;
};

export type RunOrganizationMemoryRetirementWorkerOutput = {
  runId: string;
  claimedJobCount: number;
  completedJobCount: number;
  retiredMemoryCount: number;
  noActionCount: number;
  noActionReasonCounts: Record<string, number>;
  retriedJobCount: number;
  deadLetteredJobCount: number;
  durationMs: number;
  batchSize: number;
  organizationId: string | null;
  memoryId: string | null;
  gracePeriodDays: number;
};

const DEFAULT_LIMIT = 25;
const DEFAULT_LEASE_SECONDS = 600;
const DEFAULT_WORKER_ID = "organization-memory-retirement-worker";
const DEFAULT_GRACE_PERIOD_DAYS = 30;
const RETIREMENT_EVALUATOR_VERSION = 1;
const RETIREMENT_CONFIDENCE_THRESHOLD = 0.25;
const RETIREMENT_CONTRADICTION_COUNT_THRESHOLD = 2;
const RETIREMENT_CONTRADICTION_STRENGTH_THRESHOLD = 0.8;
const REPLACEMENT_CONFIDENCE_THRESHOLD = 0.75;
const REPLACEMENT_REINFORCEMENT_COUNT_THRESHOLD = 2;
const REPLACEMENT_SUPPORTING_CLASSIFICATION_THRESHOLD = 4;

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function clampConfidence(value: unknown) {
  const numeric = toNullableNumber(value);
  if (numeric === null) {
    return null;
  }

  return Math.min(1, Math.max(0, numeric));
}

function roundConfidence(value: number) {
  return Math.round(value * 10000) / 10000;
}

function parseQueueRow(row: Record<string, unknown>): OrganizationMemoryRetirementQueueRow {
  return {
    id: toNullableString(row.id) ?? "",
    organizationId: toNullableString(row.organizationId ?? row.organization_id) ?? "",
    memoryId: toNullableString(row.memoryId ?? row.memory_id) ?? "",
    queueState: (toNullableString(row.queueState ?? row.queue_state) ?? "pending") as OrganizationMemoryRetirementQueueState,
    attemptCount: Math.max(0, toNullableNumber(row.attemptCount ?? row.attempt_count) ?? 0),
    maxAttempts: Math.max(1, toNullableNumber(row.maxAttempts ?? row.max_attempts) ?? 1),
    priority: Math.max(0, toNullableNumber(row.priority) ?? 0),
    availableAt: toNullableString(row.availableAt ?? row.available_at),
    retryAfter: toNullableString(row.retryAfter ?? row.retry_after),
    claimedAt: toNullableString(row.claimedAt ?? row.claimed_at),
    claimExpiresAt: toNullableString(row.claimExpiresAt ?? row.claim_expires_at),
    claimedBy: toNullableString(row.claimedBy ?? row.claimed_by),
    claimToken: toNullableString(row.claimToken ?? row.claim_token),
    lastErrorCode: toNullableString(row.lastErrorCode ?? row.last_error_code),
    lastErrorMessage: toNullableString(row.lastErrorMessage ?? row.last_error_message),
    lastNoActionReason: toNullableString(row.lastNoActionReason ?? row.last_no_action_reason),
    createdAt: toNullableString(row.createdAt ?? row.created_at),
    updatedAt: toNullableString(row.updatedAt ?? row.updated_at),
  };
}

function buildRetryAfter(attemptCount: number, nowIso: string) {
  const baseMinutes = Math.min(120, Math.max(5, 5 * Math.pow(2, Math.max(0, attemptCount - 1))));
  return new Date(new Date(nowIso).getTime() + baseMinutes * 60_000).toISOString();
}

function daysBetween(olderIso: string, newerIso: string) {
  const older = new Date(olderIso).getTime();
  const newer = new Date(newerIso).getTime();
  if (!Number.isFinite(older) || !Number.isFinite(newer) || newer < older) {
    return 0;
  }
  return (newer - older) / 86_400_000;
}

function buildRetirementBasisHash(params: {
  organizationId: string;
  memoryId: string;
  memoryDomainSignature: string;
  confidenceScore: number;
  contradictionCount: number;
  contradictionStrengthScore: number | null;
  lastContradictedAt: string;
  lastReinforcedAt: string | null;
  evaluatorVersion: number;
}) {
  const payload = [
    params.organizationId,
    params.memoryId,
    params.memoryDomainSignature,
    params.confidenceScore.toFixed(4),
    String(params.contradictionCount),
    params.contradictionStrengthScore === null ? "null" : params.contradictionStrengthScore.toFixed(4),
    params.lastContradictedAt,
    params.lastReinforcedAt ?? "null",
    `retirement-evaluator-v${params.evaluatorVersion}`,
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

function mapMemoryHistorySnapshot(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  return {
    id: toNullableString(row.id),
    memoryCategory: toNullableString(row.memory_category),
    memoryType: toNullableString(row.memory_type),
    title: toNullableString(row.title),
    summary: toNullableString(row.summary),
    confidenceScore: clampConfidence(row.confidence_score),
    baseConfidenceScore: clampConfidence(row.base_confidence_score),
    memoryDomainSignature: toNullableString(row.memory_domain_signature),
    sourceRevisionHash: toNullableString(row.source_revision_hash),
    sourceSemanticPoolId: toNullableString(row.source_semantic_pool_id),
    isActive: typeof row.is_active === "boolean" ? row.is_active : null,
    retiredAt: toNullableString(row.retired_at),
    retiredLifecycleHistoryId: toNullableString(row.retired_lifecycle_history_id),
    retiredBySynthesisHistoryId: toNullableString(row.retired_by_synthesis_history_id),
    retirementBasisHash: toNullableString(row.retirement_basis_hash),
    retirementReasonSummary: toNullableString(row.retirement_reason_summary),
    supersededAt: toNullableString(row.superseded_at),
    supersededByMemoryId: toNullableString(row.superseded_by_memory_id),
    contradictionCount: toNullableNumber(row.contradiction_count),
    contradictionStrengthScore: toNullableNumber(row.contradiction_strength_score),
    reinforcementCount: toNullableNumber(row.reinforcement_count),
    lastReinforcedAt: toNullableString(row.last_reinforced_at),
    lastContradictedAt: toNullableString(row.last_contradicted_at),
  } satisfies Record<string, Json | null>;
}

async function enqueueRetirementQueue(params: {
  organizationId?: string | null;
  memoryId?: string | null;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("enqueue_organization_memory_retirement_queue" as never, {
    p_limit: Math.max(params.limit ?? DEFAULT_LIMIT, 1),
    p_organization_id: params.organizationId ?? null,
    p_memory_id: params.memoryId ?? null,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    count: typeof payload.count === "number" ? payload.count : 0,
  };
}

async function claimRetirementBatch(params: {
  limit?: number;
  organizationId?: string | null;
  memoryId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_organization_memory_retirement_batch" as never, {
    p_limit: Math.max(params.limit ?? DEFAULT_LIMIT, 1),
    p_organization_id: params.organizationId ?? null,
    p_memory_id: params.memoryId ?? null,
    p_worker_id: params.workerId ?? DEFAULT_WORKER_ID,
    p_lease_seconds: Math.max(params.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 30),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  return rows.map((row) => parseQueueRow(row));
}

async function finalizeRetirementBatch(inputs: Array<{
  id: string;
  claimToken: string;
  queueState: "completed" | "retry_scheduled" | "dead_lettered";
  retryAfter?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  noActionReason?: string | null;
}>) {
  if (inputs.length === 0) {
    return {
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("finalize_organization_memory_retirement_batch" as never, {
    p_inputs: inputs,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    completedCount: typeof payload.completedCount === "number" ? payload.completedCount : 0,
    retriedCount: typeof payload.retriedCount === "number" ? payload.retriedCount : 0,
    deadLetteredCount: typeof payload.deadLetteredCount === "number" ? payload.deadLetteredCount : 0,
  };
}

async function getMemoryRow(organizationId: string, memoryId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .eq("id", memoryId as never)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? (data as Record<string, unknown>) : null;
}

async function findReplacementCandidates(params: {
  organizationId: string;
  memoryId: string;
  memoryDomainSignature: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_domain_signature", params.memoryDomainSignature as never)
    .eq("is_active", true as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  const eligible = rows.filter((row) => {
    const rowId = toNullableString(row.id);
    if (!rowId || rowId === params.memoryId) {
      return false;
    }
    if (toNullableString(row.retired_at) || toNullableString(row.superseded_at) || toNullableString(row.superseded_by_memory_id)) {
      return false;
    }
    const confidence = clampConfidence(row.confidence_score) ?? 0;
    const reinforcementCount = Math.max(0, toNullableNumber(row.reinforcement_count) ?? 0);
    const reinforcedSupportingClassificationCount = Math.max(
      0,
      toNullableNumber(row.reinforced_supporting_classification_count) ?? 0,
    );
    return confidence >= REPLACEMENT_CONFIDENCE_THRESHOLD
      && (
        reinforcementCount >= REPLACEMENT_REINFORCEMENT_COUNT_THRESHOLD
        || reinforcedSupportingClassificationCount >= REPLACEMENT_SUPPORTING_CLASSIFICATION_THRESHOLD
      );
  });

  return {
    totalInDomain: rows.length,
    eligible,
  };
}

async function findRetirementLifecycleByBasisHash(params: {
  organizationId: string;
  memoryId: string;
  retirementBasisHash: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_lifecycle_history" as never)
    .select("id, lifecycle_metadata")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_id", params.memoryId as never)
    .eq("lifecycle_event_type", "memory_retired" as never)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  const row = (Array.isArray(data) ? data : []).find((candidate) => {
    const metadata = (candidate as Record<string, unknown>).lifecycle_metadata;
    const value = metadata && typeof metadata === "object"
      ? toNullableString((metadata as Record<string, unknown>).retirementBasisHash)
      : null;
    return value === params.retirementBasisHash;
  }) as Record<string, unknown> | undefined;

  return toNullableString(row?.id);
}

async function insertRetirementLifecycle(params: {
  lifecycleHistoryId: string;
  organizationId: string;
  memoryId: string;
  beforeRow: Record<string, unknown>;
  afterRow: Record<string, unknown>;
  retirementBasisHash: string;
  reasonSummary: string;
  reasonType: string;
  replacementCandidateSearchResult: Record<string, Json | null>;
  gracePeriodDays: number;
}) {
  const admin = createAdminSupabaseClient();
  const payload = {
    id: params.lifecycleHistoryId,
    organization_id: params.organizationId,
    memory_id: params.memoryId,
    lifecycle_event_type: "memory_retired",
    event_origin_type: "retirement_evaluator",
    source_semantic_pool_id: null,
    source_revision_hash: null,
    synthesis_history_id: null,
    synthesis_queue_row_id: null,
    synthesis_run_id: null,
    before_memory_snapshot: mapMemoryHistorySnapshot(params.beforeRow),
    after_memory_snapshot: mapMemoryHistorySnapshot(params.afterRow),
    reason_summary: params.reasonSummary,
    lifecycle_metadata: {
      retirementBasisHash: params.retirementBasisHash,
      retirementReasonType: params.reasonType,
      reasonSummary: params.reasonSummary,
      confidenceAtRetirement: clampConfidence(params.beforeRow.confidence_score),
      baseConfidenceAtRetirement: clampConfidence(params.beforeRow.base_confidence_score),
      contradictionCount: Math.max(0, toNullableNumber(params.beforeRow.contradiction_count) ?? 0),
      contradictionStrengthScore: toNullableNumber(params.beforeRow.contradiction_strength_score),
      reinforcementCount: Math.max(0, toNullableNumber(params.beforeRow.reinforcement_count) ?? 0),
      lastReinforcedAt: toNullableString(params.beforeRow.last_reinforced_at),
      lastContradictedAt: toNullableString(params.beforeRow.last_contradicted_at),
      domainSignature: toNullableString(params.beforeRow.memory_domain_signature),
      replacementCandidateSearchResult: params.replacementCandidateSearchResult,
      gracePeriodDays: params.gracePeriodDays,
      evaluatorVersion: RETIREMENT_EVALUATOR_VERSION,
      retirementSource: "deterministic_retirement_evaluator_v1",
    },
    schema_version: 1,
  };

  const { error } = await admin
    .from("organization_memory_lifecycle_history" as never)
    .insert(payload as never);

  if (!error) {
    return { id: params.lifecycleHistoryId };
  }

  const code = toNullableString((error as { code?: unknown }).code);
  if (code === "23505") {
    const existingId = await findRetirementLifecycleByBasisHash({
      organizationId: params.organizationId,
      memoryId: params.memoryId,
      retirementBasisHash: params.retirementBasisHash,
    });
    if (existingId) {
      return { id: existingId };
    }
    return { id: params.lifecycleHistoryId };
  }

  throw new Error(error.message);
}

async function updateMemoryAsRetired(params: {
  organizationId: string;
  memoryId: string;
  retiredAt: string;
  retirementBasisHash: string;
  retirementReasonSummary: string;
  lifecycleHistoryId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .update({
      is_active: false,
      retired_at: params.retiredAt,
      retired_lifecycle_history_id: params.lifecycleHistoryId,
      retired_by_synthesis_history_id: null,
      retirement_basis_hash: params.retirementBasisHash,
      retirement_reason_summary: params.retirementReasonSummary,
    } as never)
    .eq("organization_id", params.organizationId as never)
    .eq("id", params.memoryId as never)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? {}) as Record<string, unknown>;
}

async function evaluateRetirementForMemory(params: {
  organizationId: string;
  memoryId: string;
  gracePeriodDays: number;
}) {
  const row = await getMemoryRow(params.organizationId, params.memoryId);
  if (!row) {
    return {
      status: "no_action",
      reason: "missing_memory",
      detail: "Memory was not found for retirement evaluation.",
    } satisfies RetirementEvaluationOutcome;
  }

  if (row.is_active !== true) {
    return {
      status: "no_action",
      reason: toNullableString(row.retired_at) ? "already_retired" : toNullableString(row.superseded_by_memory_id) || toNullableString(row.superseded_at) ? "already_superseded" : "already_inactive",
      detail: "Memory is no longer active, so retirement is not needed.",
    } satisfies RetirementEvaluationOutcome;
  }

  if (toNullableString(row.retired_at)) {
    return {
      status: "no_action",
      reason: "already_retired",
      detail: "Memory is already retired.",
    } satisfies RetirementEvaluationOutcome;
  }

  if (toNullableString(row.superseded_at) || toNullableString(row.superseded_by_memory_id)) {
    return {
      status: "no_action",
      reason: "already_superseded",
      detail: "Memory already has supersession state and cannot retire separately.",
    } satisfies RetirementEvaluationOutcome;
  }

  if (row.is_user_confirmed === true) {
    return {
      status: "no_action",
      reason: "user_confirmed",
      detail: "User-confirmed memories are excluded from automatic retirement.",
    } satisfies RetirementEvaluationOutcome;
  }

  const memoryDomainSignature = toNullableString(row.memory_domain_signature);
  if (!memoryDomainSignature) {
    return {
      status: "no_action",
      reason: "no_domain_signature",
      detail: "Memory does not have a deterministic domain signature for retirement evaluation.",
    } satisfies RetirementEvaluationOutcome;
  }

  const confidenceScore = clampConfidence(row.confidence_score) ?? 0;
  if (confidenceScore > RETIREMENT_CONFIDENCE_THRESHOLD) {
    return {
      status: "no_action",
      reason: "not_low_confidence",
      detail: `Confidence ${confidenceScore.toFixed(2)} remains above the retirement threshold.`,
    } satisfies RetirementEvaluationOutcome;
  }

  const contradictionCount = Math.max(0, toNullableNumber(row.contradiction_count) ?? 0);
  const contradictionStrengthScore = clampConfidence(row.contradiction_strength_score);
  if (
    contradictionCount < RETIREMENT_CONTRADICTION_COUNT_THRESHOLD
    && (contradictionStrengthScore ?? 0) < RETIREMENT_CONTRADICTION_STRENGTH_THRESHOLD
  ) {
    return {
      status: "no_action",
      reason: "not_enough_contradiction",
      detail: "Contradiction evidence has not met the retirement threshold.",
    } satisfies RetirementEvaluationOutcome;
  }

  const lastContradictedAt = toNullableString(row.last_contradicted_at);
  if (!lastContradictedAt) {
    return {
      status: "no_action",
      reason: "not_enough_contradiction",
      detail: "Contradiction timestamp is missing, so retirement cannot be evaluated safely.",
    } satisfies RetirementEvaluationOutcome;
  }

  const lastReinforcedAt = toNullableString(row.last_reinforced_at);
  if (lastReinforcedAt && new Date(lastReinforcedAt).getTime() > new Date(lastContradictedAt).getTime()) {
    return {
      status: "no_action",
      reason: "recently_reinforced",
      detail: "Memory has newer reinforcement after its latest contradiction.",
    } satisfies RetirementEvaluationOutcome;
  }

  const nowIso = new Date().toISOString();
  const contradictionAgeDays = daysBetween(lastContradictedAt, nowIso);
  if (contradictionAgeDays < params.gracePeriodDays) {
    return {
      status: "no_action",
      reason: "grace_period_not_elapsed",
      detail: `Only ${contradictionAgeDays.toFixed(1)} days have passed since the latest contradiction.`,
    } satisfies RetirementEvaluationOutcome;
  }

  const replacementCandidates = await findReplacementCandidates({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
    memoryDomainSignature,
  });
  if (replacementCandidates.eligible.length > 0) {
    return {
      status: "no_action",
      reason: "replacement_candidate_exists",
      detail: "A stronger active replacement memory already exists in the same domain.",
    } satisfies RetirementEvaluationOutcome;
  }

  const retirementBasisHash = buildRetirementBasisHash({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
    memoryDomainSignature,
    confidenceScore: roundConfidence(confidenceScore),
    contradictionCount,
    contradictionStrengthScore,
    lastContradictedAt,
    lastReinforcedAt,
    evaluatorVersion: RETIREMENT_EVALUATOR_VERSION,
  });

  const retiredAt = nowIso;
  const reasonSummary = [
    `Memory retired after confidence fell to ${confidenceScore.toFixed(2)}.`,
    `Contradiction count ${contradictionCount}${contradictionStrengthScore !== null ? ` with strength ${contradictionStrengthScore.toFixed(2)}` : ""} remained unresolved for ${contradictionAgeDays.toFixed(1)} days.`,
    `No eligible replacement memory was found in the same domain after the ${params.gracePeriodDays}-day grace period.`,
  ].join(" ");

  const lifecycleHistoryId = randomUUID();
  const afterRow = {
    ...row,
    is_active: false,
    retired_at: retiredAt,
    retired_lifecycle_history_id: lifecycleHistoryId,
    retired_by_synthesis_history_id: null,
    retirement_basis_hash: retirementBasisHash,
    retirement_reason_summary: reasonSummary,
  };

  const lifecycleHistory = await insertRetirementLifecycle({
    lifecycleHistoryId,
    organizationId: params.organizationId,
    memoryId: params.memoryId,
    beforeRow: row,
    afterRow,
    retirementBasisHash,
    reasonSummary,
    reasonType: "persistent_low_confidence_no_replacement",
    replacementCandidateSearchResult: {
      totalInDomain: replacementCandidates.totalInDomain,
      eligibleReplacementCount: replacementCandidates.eligible.length,
      eligibleReplacementMemoryIds: replacementCandidates.eligible
        .map((candidate) => toNullableString(candidate.id))
        .filter((value): value is string => Boolean(value)),
      outcome: "no_eligible_replacement_found",
    },
    gracePeriodDays: params.gracePeriodDays,
  });

  await updateMemoryAsRetired({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
    retiredAt,
    retirementBasisHash,
    retirementReasonSummary: reasonSummary,
    lifecycleHistoryId: lifecycleHistory.id,
  });

  return {
    status: "retired",
    basisHash: retirementBasisHash,
    lifecycleHistoryId: lifecycleHistory.id,
    reasonSummary,
  } satisfies RetirementEvaluationOutcome;
}

export async function enqueueOrganizationMemoryRetirementCheck(params: {
  organizationId: string;
  memoryId: string;
}) {
  await enqueueRetirementQueue({
    organizationId: params.organizationId,
    memoryId: params.memoryId,
    limit: 1,
  });
}

export async function runOrganizationMemoryRetirementWorker(
  input: RunOrganizationMemoryRetirementWorkerInput = {},
): Promise<RunOrganizationMemoryRetirementWorkerOutput> {
  const runId = randomUUID();
  const startedAt = Date.now();
  const batchSize = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));
  const gracePeriodDays = Math.max(1, Math.floor(input.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS));
  const summary: RunOrganizationMemoryRetirementWorkerOutput = {
    runId,
    claimedJobCount: 0,
    completedJobCount: 0,
    retiredMemoryCount: 0,
    noActionCount: 0,
    noActionReasonCounts: {},
    retriedJobCount: 0,
    deadLetteredJobCount: 0,
    durationMs: 0,
    batchSize,
    organizationId: input.organizationId ?? null,
    memoryId: input.memoryId ?? null,
    gracePeriodDays,
  };

  const rows = await claimRetirementBatch({
    limit: batchSize,
    organizationId: input.organizationId ?? null,
    memoryId: input.memoryId ?? null,
    workerId: input.workerId ?? DEFAULT_WORKER_ID,
    leaseSeconds: input.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
  });
  summary.claimedJobCount = rows.length;

  const finalizeInputs: Array<{
    id: string;
    claimToken: string;
    queueState: "completed" | "retry_scheduled" | "dead_lettered";
    retryAfter?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    noActionReason?: string | null;
  }> = [];

  for (const row of rows) {
    if (!row.claimToken) {
      continue;
    }

    try {
      const outcome = await evaluateRetirementForMemory({
        organizationId: row.organizationId,
        memoryId: row.memoryId,
        gracePeriodDays,
      });

      if (outcome.status === "retired") {
        summary.retiredMemoryCount += 1;
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: "completed",
        });
      } else {
        summary.noActionCount += 1;
        summary.noActionReasonCounts[outcome.reason] = (summary.noActionReasonCounts[outcome.reason] ?? 0) + 1;
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: "completed",
          noActionReason: outcome.reason,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Organization memory retirement evaluation failed.";
      finalizeInputs.push({
        id: row.id,
        claimToken: row.claimToken,
        queueState: row.attemptCount >= row.maxAttempts ? "dead_lettered" : "retry_scheduled",
        retryAfter: row.attemptCount >= row.maxAttempts ? null : buildRetryAfter(row.attemptCount, new Date().toISOString()),
        errorCode: "organization_memory_retirement_failed",
        errorMessage: message,
      });
    }
  }

  const finalizeSummary = await finalizeRetirementBatch(finalizeInputs);
  summary.completedJobCount = finalizeSummary.completedCount;
  summary.retriedJobCount = finalizeSummary.retriedCount;
  summary.deadLetteredJobCount = finalizeSummary.deadLetteredCount;
  summary.durationMs = Date.now() - startedAt;
  return summary;
}

export const organizationMemoryRetirementTestUtils = {
  buildRetirementBasisHash,
};
