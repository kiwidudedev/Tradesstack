import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function writeUniversalLearningActionResult(input: {
  reviewRunId: string;
  organizationId: string;
  learningId: string;
  actionKey: string;
  actionType: string;
  resultStatus: "applied" | "skipped" | "deduplicated" | "failed";
  targetMemoryId?: string | null;
  createdMemoryId?: string | null;
  updatedMemoryId?: string | null;
  confidenceAdjustment?: number | null;
  reason?: string | null;
}) {
  const admin = createAdminSupabaseClient() as any;
  const { error } = await admin.from("learning_review_action_results").insert({
    review_run_id: input.reviewRunId,
    organization_id: input.organizationId,
    learning_id: input.learningId,
    action_key: input.actionKey,
    action_type: input.actionType,
    result_status: input.resultStatus,
    target_memory_id: input.targetMemoryId ?? null,
    created_memory_id: input.createdMemoryId ?? null,
    updated_memory_id: input.updatedMemoryId ?? null,
    confidence_adjustment: input.confidenceAdjustment ?? null,
    reason: input.reason ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return;
    }
    throw new Error(error.message);
  }
}
