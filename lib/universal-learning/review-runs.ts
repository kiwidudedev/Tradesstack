import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";
import type {
  UniversalLearningCursor,
  UniversalLearningRunSelection,
  UniversalLearningRunStatus,
} from "@/lib/universal-learning/types";

type ReviewRunRow = {
  id: string;
  organization_id: string;
  container_type: string;
  scope_key: string;
  review_month: string;
  run_type: string;
  run_status: string;
  prompt_hash: string;
};

function toReviewMonthDate(reviewMonth: string) {
  return /^\d{4}-\d{2}$/.test(reviewMonth) ? `${reviewMonth}-01` : reviewMonth;
}

export async function createUniversalLearningReviewRun(input: UniversalLearningRunSelection & {
  promptHash: string;
  promptVersion: string;
  previousCursor: UniversalLearningCursor;
}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin
    .from("learning_review_runs")
    .insert({
      organization_id: input.organizationId,
      container_type: input.containerType,
      scope_key: input.scopeKey,
      review_month: toReviewMonthDate(input.reviewMonth),
      run_type: input.runType,
      run_status: "pending",
      previous_cursor_updated_at: input.previousCursor.updatedAt,
      previous_cursor_id: input.previousCursor.id,
      prompt_hash: input.promptHash,
      prompt_version: input.promptVersion,
    })
    .select("id, organization_id, container_type, scope_key, review_month, run_type, run_status, prompt_hash")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const { data: existing, error: selectError } = await admin
        .from("learning_review_runs")
        .select("id, organization_id, container_type, scope_key, review_month, run_type, run_status, prompt_hash")
        .eq("organization_id", input.organizationId)
        .eq("container_type", input.containerType)
        .eq("scope_key", input.scopeKey)
        .eq("review_month", toReviewMonthDate(input.reviewMonth))
        .eq("run_type", input.runType)
        .eq("prompt_hash", input.promptHash)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selectError || !existing) {
        throw new Error(selectError?.message ?? error.message);
      }

      return existing as ReviewRunRow;
    }

    throw new Error(error?.message ?? "Unable to create universal learning review run.");
  }

  return data as ReviewRunRow;
}

export async function hasCompletedUniversalLearningReviewRun(input: UniversalLearningRunSelection & {
  promptVersion?: string;
}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin
    .from("learning_review_runs")
    .select(
      "id, candidate_next_cursor_updated_at, candidate_next_cursor_id, final_next_cursor_updated_at, final_next_cursor_id",
    )
    .eq("organization_id", input.organizationId)
    .eq("container_type", input.containerType)
    .eq("scope_key", input.scopeKey)
    .eq("review_month", toReviewMonthDate(input.reviewMonth))
    .eq("run_type", input.runType)
    .eq("run_status", "completed")
    .eq("prompt_version", input.promptVersion ?? "ucl-v1")
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return rows.some((row) => {
    const hasCursorCompletionFields =
      "candidate_next_cursor_updated_at" in row
      || "candidate_next_cursor_id" in row
      || "final_next_cursor_updated_at" in row
      || "final_next_cursor_id" in row;
    if (!hasCursorCompletionFields) return true;
    return (
      (row.candidate_next_cursor_updated_at ?? null) === (row.final_next_cursor_updated_at ?? null)
      && (row.candidate_next_cursor_id ?? null) === (row.final_next_cursor_id ?? null)
    );
  });
}

export async function updateUniversalLearningReviewRunStatus(input: {
  reviewRunId: string;
  runStatus: UniversalLearningRunStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  responseHash?: string | null;
  selectedRecordCount?: number;
  memoryPackCount?: number;
  candidateNextCursor?: UniversalLearningCursor;
  finalNextCursor?: UniversalLearningCursor;
  modelProvider?: string | null;
  modelName?: string | null;
  inputTokenCount?: number | null;
  outputTokenCount?: number | null;
  totalTokenCount?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
  const admin = createDynamicAdminSupabaseClient();
  const patch: Record<string, unknown> = {
    run_status: input.runStatus,
  };

  if (input.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;
  if (input.responseHash !== undefined) patch.response_hash = input.responseHash;
  if (input.selectedRecordCount !== undefined) patch.selected_record_count = input.selectedRecordCount;
  if (input.memoryPackCount !== undefined) patch.memory_pack_count = input.memoryPackCount;
  if (input.candidateNextCursor) {
    patch.candidate_next_cursor_updated_at = input.candidateNextCursor.updatedAt;
    patch.candidate_next_cursor_id = input.candidateNextCursor.id;
  }
  if (input.finalNextCursor) {
    patch.final_next_cursor_updated_at = input.finalNextCursor.updatedAt;
    patch.final_next_cursor_id = input.finalNextCursor.id;
  }
  if (input.modelProvider !== undefined) patch.model_provider = input.modelProvider;
  if (input.modelName !== undefined) patch.model_name = input.modelName;
  if (input.inputTokenCount !== undefined) patch.input_token_count = input.inputTokenCount;
  if (input.outputTokenCount !== undefined) patch.output_token_count = input.outputTokenCount;
  if (input.totalTokenCount !== undefined) patch.total_token_count = input.totalTokenCount;
  if (input.startedAt !== undefined) patch.started_at = input.startedAt;
  if (input.completedAt !== undefined) patch.completed_at = input.completedAt;

  const { error } = await admin
    .from("learning_review_runs")
    .update(patch)
    .eq("id", input.reviewRunId);

  if (error) {
    throw new Error(error.message);
  }
}
