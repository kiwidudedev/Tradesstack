import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/universal-learning/supabase-dynamic-client", () => ({
  createDynamicAdminSupabaseClient: vi.fn(),
}));

import {
  parseUniversalLearningOperationsFilters,
  resolveUniversalLearningActionResultMemoryId,
  summarizeUniversalLearningQueueHealth,
  summarizeUniversalLearningReviewRunMetrics,
  type LearningReviewQueueOpsRow,
  type LearningReviewRunOpsRow,
} from "./operations-server";

function queueRow(queue_state: string): LearningReviewQueueOpsRow {
  return {
    id: `queue-${queue_state}`,
    organization_id: "org-1",
    container_type: "project_quote",
    review_month: "2026-06",
    scope_key: "organization",
    queue_state,
    priority: 10,
    attempt_count: 0,
    max_attempts: 3,
    available_at: null,
    retry_after: null,
    claimed_at: null,
    claim_expires_at: null,
    claimed_by: null,
    claim_token: null,
    last_run_id: null,
    last_error_code: null,
    last_error_message: null,
    last_completed_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
}

function reviewRun(input: Partial<LearningReviewRunOpsRow>): LearningReviewRunOpsRow {
  return {
    id: input.id ?? "run-1",
    organization_id: "org-1",
    container_type: "project_quote",
    review_month: "2026-06",
    scope_key: "organization",
    run_type: "monthly",
    run_status: input.run_status ?? "completed",
    selected_record_count: input.selected_record_count ?? 0,
    memory_pack_count: input.memory_pack_count ?? 0,
    input_token_count: input.input_token_count ?? null,
    output_token_count: input.output_token_count ?? null,
    total_token_count: input.total_token_count ?? null,
    prompt_hash: "prompt",
    response_hash: "response",
    prompt_version: "v1",
    model_provider: "anthropic",
    model_name: "claude",
    duration_ms: null,
    previous_cursor_updated_at: null,
    previous_cursor_id: null,
    candidate_next_cursor_updated_at: null,
    candidate_next_cursor_id: null,
    final_next_cursor_updated_at: null,
    final_next_cursor_id: null,
    error_code: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
}

describe("Universal Learning operations server helpers", () => {
  it("parses filters and ignores unknown container types", () => {
    expect(parseUniversalLearningOperationsFilters({
      organizationId: "org-1",
      containerType: "project_quote",
      reviewMonth: "2026-06",
      limit: "500",
    })).toMatchObject({
      organizationId: "org-1",
      containerType: "project_quote",
      reviewMonth: "2026-06",
      limit: 200,
    });

    expect(parseUniversalLearningOperationsFilters({
      containerType: "not_a_container",
    }).containerType).toBeNull();
  });

  it("coalesces action result memory ids using created, updated, then target", () => {
    expect(resolveUniversalLearningActionResultMemoryId({
      created_memory_id: "created",
      updated_memory_id: "updated",
      target_memory_id: "target",
    })).toBe("created");
    expect(resolveUniversalLearningActionResultMemoryId({
      created_memory_id: null,
      updated_memory_id: "updated",
      target_memory_id: "target",
    })).toBe("updated");
    expect(resolveUniversalLearningActionResultMemoryId({
      created_memory_id: null,
      updated_memory_id: null,
      target_memory_id: "target",
    })).toBe("target");
  });

  it("summarizes queue health states", () => {
    const summary = summarizeUniversalLearningQueueHealth([
      queueRow("pending"),
      queueRow("claimed"),
      queueRow("retry_scheduled"),
      queueRow("completed"),
      queueRow("dead_lettered"),
      queueRow("paused"),
    ]);

    expect(summary).toEqual({
      pending: 1,
      claimed: 1,
      retryScheduled: 1,
      completed: 1,
      deadLettered: 1,
      other: 1,
      total: 6,
    });
  });

  it("summarizes review run metrics and token usage", () => {
    const summary = summarizeUniversalLearningReviewRunMetrics([
      reviewRun({
        run_status: "completed",
        selected_record_count: 3,
        memory_pack_count: 2,
        input_token_count: 100,
        output_token_count: 50,
        total_token_count: 150,
      }),
      reviewRun({
        id: "run-2",
        run_status: "failed",
        selected_record_count: 4,
        memory_pack_count: 1,
        input_token_count: 20,
        output_token_count: 5,
        total_token_count: 25,
      }),
      reviewRun({ id: "run-3", run_status: "running" }),
    ]);

    expect(summary).toMatchObject({
      completed: 1,
      failed: 1,
      running: 1,
      total: 3,
      selectedRecords: 7,
      memoryPackCount: 3,
      inputTokens: 120,
      outputTokens: 55,
      totalTokens: 175,
    });
  });
});
