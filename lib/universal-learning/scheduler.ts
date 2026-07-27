import { buildUniversalLearningContainerRecords } from "@/lib/universal-learning/builders";
import { checkUniversalLearningBudgetPreflight } from "@/lib/universal-learning/cost-controls";
import { getUniversalLearningCursor } from "@/lib/universal-learning/delta-cursors";
import {
  enqueueLearningReviewQueue,
  hasActiveLearningReviewQueueRow,
} from "@/lib/universal-learning/queue";
import {
  getUniversalLearningContainerRolloutConfig,
  isUniversalLearningEnabledForOrganization,
  listUniversalLearningContainerRolloutConfigs,
} from "@/lib/universal-learning/rollout-config";
import { hasCompletedUniversalLearningReviewRun } from "@/lib/universal-learning/review-runs";
import { UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION } from "@/lib/universal-learning/prompt";
import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";
import type {
  UniversalLearningContainerType,
} from "@/lib/universal-learning/types";

type OrganizationCandidate = {
  id: string;
  hasConstructionProfile: boolean;
};

export type UniversalLearningScheduleDecision = {
  organizationId: string;
  containerType: UniversalLearningContainerType;
  reviewMonth: string;
  scopeKey: string;
  eligible: boolean;
  enqueued: boolean;
  reason: string;
  recordCount: number;
  minimumRecordCount: number;
  budgetAllowed: boolean;
  queueId: string | null;
};

export type UniversalLearningScheduleResult = {
  reviewMonth: string;
  dryRun: boolean;
  evaluatedCount: number;
  eligibleCount: number;
  enqueuedCount: number;
  decisions: UniversalLearningScheduleDecision[];
};

export function getPreviousCompletedUniversalLearningReviewMonth(now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  monthStart.setUTCMonth(monthStart.getUTCMonth() - 1);
  return monthStart.toISOString().slice(0, 7);
}

function toReviewMonthDate(reviewMonth: string) {
  return /^\d{4}-\d{2}$/.test(reviewMonth) ? `${reviewMonth}-01` : reviewMonth;
}

async function listOrganizationCandidates(organizationId?: string | null): Promise<OrganizationCandidate[]> {
  const admin = createDynamicAdminSupabaseClient();
  let query = admin
    .from("organizations")
    .select("id, construction_profile");

  if (organizationId) {
    query = query.eq("id", organizationId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (Array.isArray(data) ? data as Array<Record<string, unknown>> : [])
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      hasConstructionProfile:
        typeof row.construction_profile === "string"
        && row.construction_profile.trim().length > 0,
    }))
    .filter((row) => row.id.length > 0);
}

export async function evaluateUniversalLearningScheduleCandidate(input: {
  organizationId: string;
  hasConstructionProfile: boolean;
  containerType: UniversalLearningContainerType;
  reviewMonth: string;
  dryRun?: boolean;
}) {
  const scopeKey = "organization";
  const rolloutConfig = getUniversalLearningContainerRolloutConfig(input.containerType);
  const baseDecision = {
    organizationId: input.organizationId,
    containerType: input.containerType,
    reviewMonth: input.reviewMonth,
    scopeKey,
    enqueued: false,
    queueId: null,
    recordCount: 0,
    minimumRecordCount: rolloutConfig.minimumRecordCount,
    budgetAllowed: false,
  };

  if (!isUniversalLearningEnabledForOrganization(input.organizationId)) {
    return { ...baseDecision, eligible: false, reason: "organization_disabled" };
  }
  if (!input.hasConstructionProfile) {
    return { ...baseDecision, eligible: false, reason: "missing_construction_profile" };
  }
  if (!rolloutConfig.enabled) {
    return { ...baseDecision, eligible: false, reason: "container_disabled" };
  }

  const selection = {
    organizationId: input.organizationId,
    containerType: input.containerType,
    reviewMonth: input.reviewMonth,
    runType: "monthly" as const,
    scopeKey,
  };

  const completed = await hasCompletedUniversalLearningReviewRun({
    ...selection,
    promptVersion: UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION,
  });
  if (completed) {
    return { ...baseDecision, eligible: false, reason: "review_already_completed" };
  }

  const activeQueueRow = await hasActiveLearningReviewQueueRow(selection);
  if (activeQueueRow) {
    return { ...baseDecision, eligible: false, reason: "queue_row_already_active" };
  }

  const cursor = await getUniversalLearningCursor(selection);
  const builderResult = await buildUniversalLearningContainerRecords({
    containerType: input.containerType,
    context: {
      organizationId: input.organizationId,
      cursor,
      reviewMonth: input.reviewMonth,
    },
  });
  const recordCount = builderResult.records.length;
  if (recordCount < rolloutConfig.minimumRecordCount) {
    return {
      ...baseDecision,
      recordCount,
      eligible: false,
      reason: "below_minimum_record_threshold",
    };
  }

  const budget = await checkUniversalLearningBudgetPreflight({
    organizationId: input.organizationId,
    containerType: input.containerType,
    reviewMonth: input.reviewMonth,
    estimatedRecordCount: recordCount,
  });
  if (!budget.allowed) {
    return {
      ...baseDecision,
      recordCount,
      budgetAllowed: false,
      eligible: false,
      reason: budget.reason ?? "budget_blocked",
    };
  }

  const eligibilitySnapshot = {
    promptVersion: UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION,
    constructionProfilePresent: input.hasConstructionProfile,
    containerEnabled: rolloutConfig.enabled,
    rolloutTier: rolloutConfig.rolloutTier,
    minimumRecordCount: rolloutConfig.minimumRecordCount,
    recordCount,
    reviewMonth: toReviewMonthDate(input.reviewMonth),
  };

  if (input.dryRun) {
    return {
      ...baseDecision,
      recordCount,
      budgetAllowed: true,
      eligible: true,
      reason: "eligible_dry_run",
    };
  }

  const queueRow = await enqueueLearningReviewQueue({
    organizationId: input.organizationId,
    containerType: input.containerType,
    reviewMonth: input.reviewMonth,
    scopeKey,
    priority: rolloutConfig.priority,
    maxAttempts: 3,
    eligibilitySnapshot,
    budgetSnapshot: budget.snapshot,
  });

  return {
    ...baseDecision,
    recordCount,
    budgetAllowed: true,
    eligible: true,
    enqueued: true,
    reason: "enqueued",
    queueId: queueRow.id,
  };
}

export async function scheduleUniversalLearningMonthlyReviews(input: {
  organizationId?: string | null;
  containerType?: UniversalLearningContainerType | null;
  reviewMonth?: string | null;
  dryRun?: boolean;
} = {}): Promise<UniversalLearningScheduleResult> {
  const reviewMonth = input.reviewMonth ?? getPreviousCompletedUniversalLearningReviewMonth();
  const organizations = await listOrganizationCandidates(input.organizationId);
  const containerConfigs = input.containerType
    ? [getUniversalLearningContainerRolloutConfig(input.containerType)]
    : listUniversalLearningContainerRolloutConfigs();
  const decisions: UniversalLearningScheduleDecision[] = [];

  for (const organization of organizations) {
    for (const config of containerConfigs) {
      decisions.push(await evaluateUniversalLearningScheduleCandidate({
        organizationId: organization.id,
        hasConstructionProfile: organization.hasConstructionProfile,
        containerType: config.containerType,
        reviewMonth,
        dryRun: input.dryRun,
      }));
    }
  }

  return {
    reviewMonth,
    dryRun: input.dryRun === true,
    evaluatedCount: decisions.length,
    eligibleCount: decisions.filter((decision) => decision.eligible).length,
    enqueuedCount: decisions.filter((decision) => decision.enqueued).length,
    decisions,
  };
}
