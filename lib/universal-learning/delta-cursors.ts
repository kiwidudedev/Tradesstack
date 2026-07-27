import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  UniversalLearningCursor,
  UniversalLearningRunSelection,
} from "@/lib/universal-learning/types";

function toReviewMonthDate(reviewMonth: string) {
  return /^\d{4}-\d{2}$/.test(reviewMonth) ? `${reviewMonth}-01` : reviewMonth;
}

export async function getUniversalLearningCursor(
  selection: Pick<UniversalLearningRunSelection, "organizationId" | "containerType" | "scopeKey">,
): Promise<UniversalLearningCursor> {
  const admin = createAdminSupabaseClient() as any;
  const { data, error } = await admin
    .from("learning_review_cursors")
    .select("last_cursor_updated_at, last_cursor_id")
    .eq("organization_id", selection.organizationId)
    .eq("container_type", selection.containerType)
    .eq("scope_key", selection.scopeKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    updatedAt: data?.last_cursor_updated_at ?? null,
    id: data?.last_cursor_id ?? null,
  };
}

export async function advanceUniversalLearningCursor(input: {
  selection: Pick<UniversalLearningRunSelection, "organizationId" | "containerType" | "scopeKey" | "reviewMonth">;
  reviewRunId: string;
  nextCursor: UniversalLearningCursor;
  selectedRecordCount: number;
}) {
  const admin = createAdminSupabaseClient() as any;
  const payload = {
    organization_id: input.selection.organizationId,
    container_type: input.selection.containerType,
    scope_key: input.selection.scopeKey,
    last_successful_review_month: toReviewMonthDate(input.selection.reviewMonth),
    last_cursor_updated_at: input.nextCursor.updatedAt,
    last_cursor_id: input.nextCursor.id,
    last_run_id: input.reviewRunId,
    last_record_count: input.selectedRecordCount,
  };

  const { error } = await admin
    .from("learning_review_cursors")
    .upsert(payload, {
      onConflict: "organization_id,container_type,scope_key",
    });

  if (error) {
    throw new Error(error.message);
  }
}
