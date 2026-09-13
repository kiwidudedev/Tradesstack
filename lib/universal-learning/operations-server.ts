import "server-only";

import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";
import {
  UNIVERSAL_LEARNING_CONTAINER_TYPES,
  type UniversalLearningContainerType,
} from "@/lib/universal-learning/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const COST_PER_MILLION_INPUT_TOKENS_USD = 3;
const COST_PER_MILLION_OUTPUT_TOKENS_USD = 15;

export type UniversalLearningOperationsFilters = {
  organizationId: string | null;
  containerType: UniversalLearningContainerType | null;
  reviewMonth: string | null;
  queueState: string | null;
  runStatus: string | null;
  reviewRunId: string | null;
  limit: number;
};

export type LearningReviewQueueOpsRow = {
  id: string;
  organization_id: string;
  container_type: string;
  review_month: string;
  scope_key: string;
  queue_state: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  available_at: string | null;
  retry_after: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  claimed_by: string | null;
  claim_token: string | null;
  last_run_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LearningReviewRunOpsRow = {
  id: string;
  organization_id: string;
  container_type: string;
  review_month: string;
  scope_key: string;
  run_type: string;
  run_status: string;
  selected_record_count: number;
  memory_pack_count: number;
  input_token_count: number | null;
  output_token_count: number | null;
  total_token_count: number | null;
  prompt_hash: string | null;
  response_hash: string | null;
  prompt_version: string | null;
  model_provider: string | null;
  model_name: string | null;
  duration_ms: number | null;
  previous_cursor_updated_at: string | null;
  previous_cursor_id: string | null;
  candidate_next_cursor_updated_at: string | null;
  candidate_next_cursor_id: string | null;
  final_next_cursor_updated_at: string | null;
  final_next_cursor_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LearningReviewRunRecordOpsRow = {
  id: string;
  review_run_id: string;
  organization_id: string;
  container_type: string;
  source_table: string;
  source_id: string;
  source_updated_at: string;
  record_strength: string;
  record_hash: string;
  created_at: string;
};

export type LearningReviewActionResultOpsRow = {
  id: string;
  review_run_id: string;
  organization_id: string;
  learning_id: string;
  action_key: string;
  action_type: string;
  target_memory_id: string | null;
  created_memory_id: string | null;
  updated_memory_id: string | null;
  result_status: string;
  confidence_adjustment: number | null;
  reason: string | null;
  created_at: string;
};

export type OrganizationMemoryOpsRow = {
  id: string;
  organization_id: string;
  title: string;
  summary: string;
  memory_type: string;
  memory_category: string;
  confidence_score: number;
  reinforcement_count: number;
  contradiction_count: number;
  last_reinforced_at: string | null;
  last_contradicted_at: string | null;
  retired_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OrganizationMemoryLinkOpsRow = {
  id: string;
  organization_id: string;
  organization_memory_item_id: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_event_id: string | null;
  source_ai_interaction_id: string | null;
  source_correction_event_id: string | null;
  source_validation_case_id: string | null;
  link_type: string;
  weight: number;
  confidence_delta: number | null;
  note: string | null;
  created_at: string;
};

export type LearningReviewCursorOpsRow = {
  id: string;
  organization_id: string;
  container_type: string;
  scope_key: string;
  last_successful_review_month: string | null;
  last_review_run_id?: string | null;
  last_run_id?: string | null;
  last_cursor_updated_at: string | null;
  last_cursor_id: string | null;
  last_record_count: number;
  created_at: string;
  updated_at: string;
};

export type QueueHealthMetrics = {
  pending: number;
  claimed: number;
  retryScheduled: number;
  completed: number;
  deadLettered: number;
  other: number;
  total: number;
};

export type ReviewRunMetrics = {
  completed: number;
  failed: number;
  running: number;
  other: number;
  total: number;
  selectedRecords: number;
  memoryPackCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type MemoryHealthMetrics = {
  totalMemories: number;
  memoriesWithProvenance: number;
  linklessMemories: number;
  retiredMemories: number;
  contradictedMemories: number;
  sampledLinklessMemoryIds: string[];
};

export type CostSummaryRow = {
  organizationId: string;
  reviewMonth: string;
  containerType: string;
  completedReviews: number;
  failedReviews: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  averageTokens: number;
  estimatedCostUsd: number;
};

export type ProvenanceGraph = {
  memories: OrganizationMemoryOpsRow[];
  links: OrganizationMemoryLinkOpsRow[];
  memoryLinkCounts: Array<{
    memoryId: string;
    title: string;
    linkCount: number;
    sourceTypes: string[];
  }>;
};

export type ReviewRunDetail = {
  run: LearningReviewRunOpsRow | null;
  queueRows: LearningReviewQueueOpsRow[];
  cursor: LearningReviewCursorOpsRow | null;
  sourceRecords: LearningReviewRunRecordOpsRow[];
  actionResults: LearningReviewActionResultOpsRow[];
  provenance: ProvenanceGraph;
};

export type UniversalLearningOperationsDashboardData = {
  filters: UniversalLearningOperationsFilters;
  queueRows: LearningReviewQueueOpsRow[];
  queueHealth: QueueHealthMetrics;
  reviewRuns: LearningReviewRunOpsRow[];
  reviewRunMetrics: ReviewRunMetrics;
  actionResults: LearningReviewActionResultOpsRow[];
  provenance: ProvenanceGraph;
  deadLetters: LearningReviewQueueOpsRow[];
  costSummary: CostSummaryRow[];
  memoryHealth: MemoryHealthMetrics;
  reviewDetail: ReviewRunDetail | null;
};

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeContainerType(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  return (UNIVERSAL_LEARNING_CONTAINER_TYPES as readonly string[]).includes(normalized)
    ? normalized as UniversalLearningContainerType
    : null;
}

function normalizeLimit(value: unknown) {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export function parseUniversalLearningOperationsFilters(
  searchParams: Record<string, string | string[] | undefined>,
): UniversalLearningOperationsFilters {
  return {
    organizationId: normalizeOptionalString(firstParam(searchParams.organizationId)),
    containerType: normalizeContainerType(firstParam(searchParams.containerType)),
    reviewMonth: normalizeOptionalString(firstParam(searchParams.reviewMonth)),
    queueState: normalizeOptionalString(firstParam(searchParams.queueState)),
    runStatus: normalizeOptionalString(firstParam(searchParams.runStatus)),
    reviewRunId: normalizeOptionalString(firstParam(searchParams.reviewRunId)),
    limit: normalizeLimit(firstParam(searchParams.limit)),
  };
}

export function resolveUniversalLearningActionResultMemoryId(row: Pick<
  LearningReviewActionResultOpsRow,
  "created_memory_id" | "updated_memory_id" | "target_memory_id"
>) {
  return row.created_memory_id ?? row.updated_memory_id ?? row.target_memory_id ?? null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function queryRows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data ?? [];
}

async function queryMaybe<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>, label: string) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data ?? null;
}

function applyQueueFilters<T>(query: T, filters: UniversalLearningOperationsFilters) {
  let filtered = query as T & {
    eq(column: string, value: unknown): typeof filtered;
  };
  if (filters.organizationId) filtered = filtered.eq("organization_id", filters.organizationId);
  if (filters.containerType) filtered = filtered.eq("container_type", filters.containerType);
  if (filters.reviewMonth) filtered = filtered.eq("review_month", filters.reviewMonth);
  if (filters.queueState) filtered = filtered.eq("queue_state", filters.queueState);
  return filtered;
}

function applyRunFilters<T>(query: T, filters: UniversalLearningOperationsFilters) {
  let filtered = query as T & {
    eq(column: string, value: unknown): typeof filtered;
  };
  if (filters.organizationId) filtered = filtered.eq("organization_id", filters.organizationId);
  if (filters.containerType) filtered = filtered.eq("container_type", filters.containerType);
  if (filters.reviewMonth) filtered = filtered.eq("review_month", filters.reviewMonth);
  if (filters.runStatus) filtered = filtered.eq("run_status", filters.runStatus);
  return filtered;
}

export async function listUniversalLearningQueueRows(
  filters: UniversalLearningOperationsFilters,
  options?: { deadLettersOnly?: boolean },
) {
  const admin = createDynamicAdminSupabaseClient();
  let query = admin
    .from<LearningReviewQueueOpsRow[]>("learning_review_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit);

  query = applyQueueFilters(query, filters);
  if (options?.deadLettersOnly) query = query.eq("queue_state", "dead_lettered");

  return queryRows<LearningReviewQueueOpsRow>(query, "list Universal Learning queue rows");
}

export async function listUniversalLearningReviewRuns(filters: UniversalLearningOperationsFilters) {
  const admin = createDynamicAdminSupabaseClient();
  const query = applyRunFilters(
    admin
      .from<LearningReviewRunOpsRow[]>("learning_review_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(filters.limit),
    filters,
  );

  return queryRows<LearningReviewRunOpsRow>(query, "list Universal Learning review runs");
}

export async function listUniversalLearningActionResults(filters: UniversalLearningOperationsFilters) {
  const admin = createDynamicAdminSupabaseClient();
  let query = admin
    .from<LearningReviewActionResultOpsRow[]>("learning_review_action_results")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit);

  if (filters.reviewRunId) query = query.eq("review_run_id", filters.reviewRunId);
  if (filters.organizationId) query = query.eq("organization_id", filters.organizationId);

  return queryRows<LearningReviewActionResultOpsRow>(query, "list Universal Learning action results");
}

export async function getUniversalLearningCostSummary(filters: UniversalLearningOperationsFilters) {
  const runs = await listUniversalLearningReviewRuns({
    ...filters,
    limit: Math.max(filters.limit, 100),
  });
  const groups = new Map<string, CostSummaryRow>();

  for (const run of runs) {
    const key = `${run.organization_id}:${run.review_month}:${run.container_type}`;
    const current = groups.get(key) ?? {
      organizationId: run.organization_id,
      reviewMonth: run.review_month,
      containerType: run.container_type,
      completedReviews: 0,
      failedReviews: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      averageTokens: 0,
      estimatedCostUsd: 0,
    };
    if (run.run_status === "completed") current.completedReviews += 1;
    if (run.run_status === "failed") current.failedReviews += 1;
    current.inputTokens += run.input_token_count ?? 0;
    current.outputTokens += run.output_token_count ?? 0;
    current.totalTokens += run.total_token_count ?? 0;
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((row) => {
      const reviewCount = row.completedReviews + row.failedReviews;
      return {
        ...row,
        averageTokens: reviewCount > 0 ? Math.round(row.totalTokens / reviewCount) : 0,
        estimatedCostUsd:
          (row.inputTokens / 1_000_000) * COST_PER_MILLION_INPUT_TOKENS_USD
          + (row.outputTokens / 1_000_000) * COST_PER_MILLION_OUTPUT_TOKENS_USD,
      };
    })
    .sort((left, right) => right.totalTokens - left.totalTokens);
}

export async function getUniversalLearningMemoryHealth(filters: UniversalLearningOperationsFilters) {
  const admin = createDynamicAdminSupabaseClient();
  let memoryQuery = admin
    .from<OrganizationMemoryOpsRow[]>("organization_memory_items")
    .select("id,organization_id,title,summary,memory_type,memory_category,confidence_score,reinforcement_count,contradiction_count,last_reinforced_at,last_contradicted_at,retired_at,is_active,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (filters.organizationId) {
    memoryQuery = memoryQuery.eq("organization_id", filters.organizationId);
  }

  const memories = await queryRows<OrganizationMemoryOpsRow>(memoryQuery, "list organization memory health rows");
  const memoryIds = memories.map((memory) => memory.id);
  const linkedMemoryIds = new Set<string>();

  for (const memoryIdChunk of chunk(memoryIds, 500)) {
    if (memoryIdChunk.length === 0) continue;
    const links = await queryRows<Pick<OrganizationMemoryLinkOpsRow, "organization_memory_item_id">>(
      admin
        .from<Pick<OrganizationMemoryLinkOpsRow, "organization_memory_item_id">[]>("organization_memory_links")
        .select("organization_memory_item_id")
        .in("organization_memory_item_id", memoryIdChunk),
      "list organization memory health links",
    );
    links.forEach((link) => linkedMemoryIds.add(link.organization_memory_item_id));
  }

  const linklessMemoryIds = memoryIds.filter((id) => !linkedMemoryIds.has(id));
  return {
    totalMemories: memories.length,
    memoriesWithProvenance: linkedMemoryIds.size,
    linklessMemories: linklessMemoryIds.length,
    retiredMemories: memories.filter((memory) => memory.retired_at || !memory.is_active).length,
    contradictedMemories: memories.filter((memory) => memory.contradiction_count > 0 || memory.last_contradicted_at).length,
    sampledLinklessMemoryIds: linklessMemoryIds.slice(0, 20),
  };
}

export async function getUniversalLearningProvenanceGraph(input: {
  filters: UniversalLearningOperationsFilters;
  memoryIds?: string[];
}) {
  const admin = createDynamicAdminSupabaseClient();
  let memoryIds = uniqueStrings(input.memoryIds ?? []);

  if (memoryIds.length === 0) {
    const actionResults = await listUniversalLearningActionResults(input.filters);
    memoryIds = uniqueStrings(actionResults.map(resolveUniversalLearningActionResultMemoryId));
  }

  if (memoryIds.length === 0) {
    return { memories: [], links: [], memoryLinkCounts: [] };
  }

  const memories: OrganizationMemoryOpsRow[] = [];
  const links: OrganizationMemoryLinkOpsRow[] = [];

  for (const memoryIdChunk of chunk(memoryIds, 500)) {
    memories.push(...await queryRows<OrganizationMemoryOpsRow>(
      admin
        .from<OrganizationMemoryOpsRow[]>("organization_memory_items")
        .select("id,organization_id,title,summary,memory_type,memory_category,confidence_score,reinforcement_count,contradiction_count,last_reinforced_at,last_contradicted_at,retired_at,is_active,created_at,updated_at")
        .in("id", memoryIdChunk),
      "list provenance memories",
    ));
    links.push(...await queryRows<OrganizationMemoryLinkOpsRow>(
      admin
        .from<OrganizationMemoryLinkOpsRow[]>("organization_memory_links")
        .select("*")
        .in("organization_memory_item_id", memoryIdChunk)
        .order("created_at", { ascending: false }),
      "list provenance links",
    ));
  }

  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));
  const memoryLinkCounts = memoryIds.map((memoryId) => {
    const memoryLinks = links.filter((link) => link.organization_memory_item_id === memoryId);
    return {
      memoryId,
      title: memoryById.get(memoryId)?.title ?? memoryId,
      linkCount: memoryLinks.length,
      sourceTypes: uniqueStrings(memoryLinks.map((link) => {
        if (link.source_entity_type) return link.source_entity_type;
        if (link.source_event_id) return "event";
        if (link.source_ai_interaction_id) return "ai_interaction";
        if (link.source_correction_event_id) return "correction_event";
        if (link.source_validation_case_id) return "validation_case";
        return null;
      })),
    };
  });

  return { memories, links, memoryLinkCounts };
}

export async function getUniversalLearningReviewRunDetail(reviewRunId: string) {
  const admin = createDynamicAdminSupabaseClient();
  const run = await queryMaybe<LearningReviewRunOpsRow>(
    admin
      .from<LearningReviewRunOpsRow>("learning_review_runs")
      .select("*")
      .eq("id", reviewRunId)
      .maybeSingle(),
    "get Universal Learning review run",
  );

  if (!run) {
    return {
      run: null,
      queueRows: [],
      cursor: null,
      sourceRecords: [],
      actionResults: [],
      provenance: { memories: [], links: [], memoryLinkCounts: [] },
    };
  }

  const [queueRows, cursor, sourceRecords, actionResults] = await Promise.all([
    queryRows<LearningReviewQueueOpsRow>(
      admin
        .from<LearningReviewQueueOpsRow[]>("learning_review_queue")
        .select("*")
        .eq("last_run_id", reviewRunId)
        .order("created_at", { ascending: false })
        .limit(20),
      "list review detail queue rows",
    ),
    queryMaybe<LearningReviewCursorOpsRow>(
      admin
        .from<LearningReviewCursorOpsRow>("learning_review_cursors")
        .select("*")
        .eq("organization_id", run.organization_id)
        .eq("container_type", run.container_type)
        .eq("scope_key", run.scope_key)
        .maybeSingle(),
      "get review detail cursor",
    ),
    queryRows<LearningReviewRunRecordOpsRow>(
      admin
        .from<LearningReviewRunRecordOpsRow[]>("learning_review_run_records")
        .select("*")
        .eq("review_run_id", reviewRunId)
        .order("created_at", { ascending: true })
        .limit(500),
      "list review detail source records",
    ),
    queryRows<LearningReviewActionResultOpsRow>(
      admin
        .from<LearningReviewActionResultOpsRow[]>("learning_review_action_results")
        .select("*")
        .eq("review_run_id", reviewRunId)
        .order("created_at", { ascending: true }),
      "list review detail action results",
    ),
  ]);

  const provenance = await getUniversalLearningProvenanceGraph({
    filters: {
      organizationId: run.organization_id,
      containerType: run.container_type as UniversalLearningContainerType,
      reviewMonth: run.review_month,
      queueState: null,
      runStatus: null,
      reviewRunId,
      limit: 200,
    },
    memoryIds: uniqueStrings(actionResults.map(resolveUniversalLearningActionResultMemoryId)),
  });

  return { run, queueRows, cursor, sourceRecords, actionResults, provenance };
}

export function summarizeUniversalLearningQueueHealth(rows: LearningReviewQueueOpsRow[]) {
  const metrics: QueueHealthMetrics = {
    pending: 0,
    claimed: 0,
    retryScheduled: 0,
    completed: 0,
    deadLettered: 0,
    other: 0,
    total: rows.length,
  };
  rows.forEach((row) => {
    if (row.queue_state === "pending") metrics.pending += 1;
    else if (row.queue_state === "claimed") metrics.claimed += 1;
    else if (row.queue_state === "retry_scheduled") metrics.retryScheduled += 1;
    else if (row.queue_state === "completed") metrics.completed += 1;
    else if (row.queue_state === "dead_lettered") metrics.deadLettered += 1;
    else metrics.other += 1;
  });
  return metrics;
}

export function summarizeUniversalLearningReviewRunMetrics(rows: LearningReviewRunOpsRow[]) {
  const metrics: ReviewRunMetrics = {
    completed: 0,
    failed: 0,
    running: 0,
    other: 0,
    total: rows.length,
    selectedRecords: 0,
    memoryPackCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  rows.forEach((row) => {
    if (row.run_status === "completed") metrics.completed += 1;
    else if (row.run_status === "failed") metrics.failed += 1;
    else if (row.run_status === "running") metrics.running += 1;
    else metrics.other += 1;
    metrics.selectedRecords += row.selected_record_count ?? 0;
    metrics.memoryPackCount += row.memory_pack_count ?? 0;
    metrics.inputTokens += row.input_token_count ?? 0;
    metrics.outputTokens += row.output_token_count ?? 0;
    metrics.totalTokens += row.total_token_count ?? 0;
  });
  return metrics;
}

export async function getUniversalLearningOperationsDashboardData(
  filters: UniversalLearningOperationsFilters,
): Promise<UniversalLearningOperationsDashboardData> {
  const [queueRows, reviewRuns, actionResults, deadLetters, costSummary, memoryHealth] = await Promise.all([
    listUniversalLearningQueueRows(filters),
    listUniversalLearningReviewRuns(filters),
    listUniversalLearningActionResults(filters),
    listUniversalLearningQueueRows(filters, { deadLettersOnly: true }),
    getUniversalLearningCostSummary(filters),
    getUniversalLearningMemoryHealth(filters),
  ]);

  const provenance = await getUniversalLearningProvenanceGraph({
    filters,
    memoryIds: uniqueStrings(actionResults.map(resolveUniversalLearningActionResultMemoryId)),
  });
  const reviewDetail = filters.reviewRunId
    ? await getUniversalLearningReviewRunDetail(filters.reviewRunId)
    : null;

  return {
    filters,
    queueRows,
    queueHealth: summarizeUniversalLearningQueueHealth(queueRows),
    reviewRuns,
    reviewRunMetrics: summarizeUniversalLearningReviewRunMetrics(reviewRuns),
    actionResults,
    provenance,
    deadLetters,
    costSummary,
    memoryHealth,
    reviewDetail,
  };
}
