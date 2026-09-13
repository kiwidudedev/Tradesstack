import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNIVERSAL_LEARNING_CONTAINER_TYPES } from "@/lib/universal-learning/types";

const createAdminSupabaseClient = vi.fn();
const buildUniversalLearningContainerRecords = vi.fn();
const checkUniversalLearningBudgetPreflight = vi.fn();
const getUniversalLearningCursor = vi.fn();
const enqueueLearningReviewQueue = vi.fn();
const hasActiveLearningReviewQueueRow = vi.fn();
const hasCompletedUniversalLearningReviewRun = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/lib/universal-learning/builders", () => ({
  buildUniversalLearningContainerRecords,
}));

vi.mock("@/lib/universal-learning/cost-controls", () => ({
  checkUniversalLearningBudgetPreflight,
}));

vi.mock("@/lib/universal-learning/delta-cursors", () => ({
  getUniversalLearningCursor,
}));

vi.mock("@/lib/universal-learning/queue", () => ({
  enqueueLearningReviewQueue,
  hasActiveLearningReviewQueueRow,
}));

vi.mock("@/lib/universal-learning/review-runs", () => ({
  hasCompletedUniversalLearningReviewRun,
}));

function createOrganizationQuery(rows: Array<Record<string, unknown>>) {
  const query = {
    eq: vi.fn(() => query),
    then(resolve: (value: unknown) => void) {
      resolve({ data: rows, error: null });
    },
  };
  return query;
}

describe("Universal Construction Learning monthly scheduler", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    createAdminSupabaseClient.mockReset();
    buildUniversalLearningContainerRecords.mockReset();
    checkUniversalLearningBudgetPreflight.mockReset();
    getUniversalLearningCursor.mockReset();
    enqueueLearningReviewQueue.mockReset();
    hasActiveLearningReviewQueueRow.mockReset();
    hasCompletedUniversalLearningReviewRun.mockReset();

    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => createOrganizationQuery([
          { id: "org-1", construction_profile: "Commercial interiors contractor in Auckland." },
        ])),
      })),
    });
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    hasCompletedUniversalLearningReviewRun.mockResolvedValue(false);
    hasActiveLearningReviewQueueRow.mockResolvedValue(false);
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: Array.from({ length: 10 }, (_, index) => ({ source: { sourceId: `record-${index}` } })),
      nextCursorCandidate: { updatedAt: "2026-05-31T00:00:00.000Z", id: "record-9" },
    });
    checkUniversalLearningBudgetPreflight.mockResolvedValue({
      allowed: true,
      reason: null,
      snapshot: { estimatedTokens: 10_000 },
    });
    enqueueLearningReviewQueue.mockResolvedValue({ id: "queue-1" });
  });

  it("defaults to the previous completed UTC month", async () => {
    const { getPreviousCompletedUniversalLearningReviewMonth } = await import("./scheduler");
    expect(getPreviousCompletedUniversalLearningReviewMonth(new Date("2026-06-24T12:00:00.000Z"))).toBe("2026-05");
  });

  it("iterates all supported containers when no container filter is supplied", async () => {
    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const result = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      dryRun: true,
    });

    expect(result.evaluatedCount).toBe(UNIVERSAL_LEARNING_CONTAINER_TYPES.length);
    expect(buildUniversalLearningContainerRecords).toHaveBeenCalled();
    expect(result.decisions.map((decision) => decision.containerType)).toEqual([...UNIVERSAL_LEARNING_CONTAINER_TYPES]);
  });

  it("skips organizations without a construction profile", async () => {
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => createOrganizationQuery([
          { id: "org-1", construction_profile: "" },
        ])),
      })),
    });

    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const result = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "supplier_invoice_allocation",
    });

    expect(result.decisions[0]).toMatchObject({
      eligible: false,
      reason: "missing_construction_profile",
    });
    expect(enqueueLearningReviewQueue).not.toHaveBeenCalled();
  });

  it("skips disabled containers but can enable them with rollout env config", async () => {
    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const skipped = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "task",
    });
    expect(skipped.decisions[0]).toMatchObject({
      eligible: false,
      reason: "container_disabled",
    });

    vi.stubEnv("UNIVERSAL_LEARNING_ENABLED_CONTAINERS", "task");
    vi.resetModules();
    const enabledModule = await import("./scheduler");
    const enabled = await enabledModule.scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "task",
      dryRun: true,
    });
    expect(enabled.decisions[0]).toMatchObject({
      eligible: true,
      reason: "eligible_dry_run",
    });
  });

  it("requires the monthly delta to meet the container threshold", async () => {
    buildUniversalLearningContainerRecords.mockResolvedValueOnce({
      records: [{ source: { sourceId: "only-one" } }],
      nextCursorCandidate: { updatedAt: "2026-05-01T00:00:00.000Z", id: "only-one" },
    });

    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const result = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "supplier_invoice_allocation",
    });

    expect(result.decisions[0]).toMatchObject({
      eligible: false,
      reason: "below_minimum_record_threshold",
      recordCount: 1,
      minimumRecordCount: 5,
    });
    expect(enqueueLearningReviewQueue).not.toHaveBeenCalled();
  });

  it("keeps a deferred Supplier Bill suffix eligible below the initial threshold", async () => {
    getUniversalLearningCursor.mockResolvedValueOnce({
      updatedAt: "2026-05-20T00:00:00.000Z",
      id: "invoice-12",
    });
    buildUniversalLearningContainerRecords.mockResolvedValueOnce({
      records: [{ source: { sourceId: "invoice-13" } }],
      nextCursorCandidate: { updatedAt: "2026-05-21T00:00:00.000Z", id: "invoice-13" },
    });

    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const result = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "supplier_invoice",
      dryRun: true,
    });

    expect(result.decisions[0]).toMatchObject({
      eligible: true,
      reason: "eligible_dry_run",
      recordCount: 1,
      minimumRecordCount: 3,
    });
  });

  it("does not enqueue if a completed review already exists", async () => {
    hasCompletedUniversalLearningReviewRun.mockResolvedValueOnce(true);

    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const result = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "project_claim",
    });

    expect(result.decisions[0]).toMatchObject({
      eligible: false,
      reason: "review_already_completed",
    });
    expect(enqueueLearningReviewQueue).not.toHaveBeenCalled();
  });

  it("does not enqueue if a pending/claimed/retry row already exists", async () => {
    hasActiveLearningReviewQueueRow.mockResolvedValueOnce(true);

    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const result = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "project_purchase_order",
    });

    expect(result.decisions[0]).toMatchObject({
      eligible: false,
      reason: "queue_row_already_active",
    });
    expect(enqueueLearningReviewQueue).not.toHaveBeenCalled();
  });

  it("does not enqueue when budget preflight blocks the review", async () => {
    checkUniversalLearningBudgetPreflight.mockResolvedValueOnce({
      allowed: false,
      reason: "monthly_token_budget_exceeded",
      snapshot: { estimatedTokens: 500_000 },
    });

    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const result = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "supplier_invoice_allocation",
    });

    expect(result.decisions[0]).toMatchObject({
      eligible: false,
      reason: "monthly_token_budget_exceeded",
      budgetAllowed: false,
    });
    expect(enqueueLearningReviewQueue).not.toHaveBeenCalled();
  });

  it("enqueues eligible monthly reviews with eligibility and budget snapshots", async () => {
    const { scheduleUniversalLearningMonthlyReviews } = await import("./scheduler");
    const result = await scheduleUniversalLearningMonthlyReviews({
      reviewMonth: "2026-05",
      containerType: "supplier_invoice_allocation",
    });

    expect(enqueueLearningReviewQueue).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      containerType: "supplier_invoice_allocation",
      reviewMonth: "2026-05",
      scopeKey: "organization",
      maxAttempts: 3,
      eligibilitySnapshot: expect.objectContaining({
        constructionProfilePresent: true,
        recordCount: 10,
      }),
      budgetSnapshot: expect.objectContaining({
        estimatedTokens: 10_000,
      }),
    }));
    expect(result.decisions[0]).toMatchObject({
      eligible: true,
      enqueued: true,
      reason: "enqueued",
      queueId: "queue-1",
    });
  });
});
