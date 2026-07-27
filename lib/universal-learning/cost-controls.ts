import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";
import type { Json } from "@/lib/supabase/types";
import type { UniversalLearningContainerType } from "@/lib/universal-learning/types";

const DEFAULT_MONTHLY_TOKEN_BUDGET = 250_000;
const DEFAULT_MONTHLY_REVIEW_BUDGET = 100;
const ESTIMATED_TOKENS_PER_RECORD = 650;
const ESTIMATED_BASE_TOKENS = 5_000;

function toReviewMonthDate(reviewMonth: string) {
  return /^\d{4}-\d{2}$/.test(reviewMonth) ? `${reviewMonth}-01` : reviewMonth;
}

function getMonthlyTokenBudget() {
  const parsed = Number.parseInt(process.env.UNIVERSAL_LEARNING_MONTHLY_TOKEN_BUDGET ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_TOKEN_BUDGET;
}

function getMonthlyReviewBudget() {
  const parsed = Number.parseInt(process.env.UNIVERSAL_LEARNING_MONTHLY_REVIEW_BUDGET ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_REVIEW_BUDGET;
}

export async function checkUniversalLearningBudgetPreflight(input: {
  organizationId: string;
  containerType: UniversalLearningContainerType;
  reviewMonth: string;
  estimatedRecordCount: number;
}): Promise<{
  allowed: boolean;
  reason: string | null;
  snapshot: Record<string, Json | null>;
}> {
  const admin = createDynamicAdminSupabaseClient();
  const reviewMonth = toReviewMonthDate(input.reviewMonth);
  const tokenBudget = getMonthlyTokenBudget();
  const reviewBudget = getMonthlyReviewBudget();
  const estimatedTokens = ESTIMATED_BASE_TOKENS + Math.max(0, input.estimatedRecordCount) * ESTIMATED_TOKENS_PER_RECORD;

  const { data, error } = await admin
    .from("learning_review_runs")
    .select("total_token_count, run_status")
    .eq("organization_id", input.organizationId)
    .eq("review_month", reviewMonth);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  const usedTokens = rows.reduce((sum, row) => sum + Math.max(0, Number(row.total_token_count ?? 0)), 0);
  const completedReviewCount = rows.filter((row) => row.run_status === "completed").length;
  const projectedTokens = usedTokens + estimatedTokens;
  const projectedReviewCount = completedReviewCount + 1;
  const tokenAllowed = projectedTokens <= tokenBudget;
  const reviewAllowed = projectedReviewCount <= reviewBudget;
  const allowed = tokenAllowed && reviewAllowed;
  const reason = !tokenAllowed
    ? "monthly_token_budget_exceeded"
    : !reviewAllowed
      ? "monthly_review_budget_exceeded"
      : null;

  return {
    allowed,
    reason,
    snapshot: {
      containerType: input.containerType,
      reviewMonth,
      estimatedRecordCount: input.estimatedRecordCount,
      estimatedTokens,
      usedTokens,
      tokenBudget,
      projectedTokens,
      completedReviewCount,
      reviewBudget,
      projectedReviewCount,
      allowed,
      reason,
    },
  };
}
