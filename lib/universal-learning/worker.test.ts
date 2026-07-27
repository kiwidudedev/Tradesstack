import { beforeEach, describe, expect, it, vi } from "vitest";

const applyUniversalLearningMemoryActions = vi.fn();
const claimLearningReviewBatch = vi.fn();
const finalizeLearningReviewBatch = vi.fn();
const runUniversalConstructionLearningReview = vi.fn();

vi.mock("@/lib/universal-learning/memory-actions", () => ({
  applyUniversalLearningMemoryActions,
}));

vi.mock("@/lib/universal-learning/queue", () => ({
  claimLearningReviewBatch,
  finalizeLearningReviewBatch,
}));

vi.mock("@/lib/universal-learning/runner", () => ({
  runUniversalConstructionLearningReview,
}));

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "queue-1",
    organizationId: "org-1",
    containerType: "supplier_invoice_allocation",
    reviewMonth: "2026-05-01",
    scopeKey: "organization",
    queueState: "claimed",
    priority: 100,
    attemptCount: 1,
    maxAttempts: 3,
    availableAt: null,
    retryAfter: null,
    claimedAt: null,
    claimExpiresAt: null,
    claimedBy: "worker-1",
    claimToken: "claim-1",
    lastRunId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastCompletedAt: null,
    eligibilitySnapshot: {},
    budgetSnapshot: {},
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("Universal Construction Learning queue worker", () => {
  beforeEach(() => {
    applyUniversalLearningMemoryActions.mockReset();
    claimLearningReviewBatch.mockReset();
    finalizeLearningReviewBatch.mockReset();
    runUniversalConstructionLearningReview.mockReset();

    finalizeLearningReviewBatch.mockResolvedValue({
      count: 1,
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
      skippedCount: 0,
    });
  });

  it("runs claimed rows through the existing review runner and finalizes completed rows", async () => {
    claimLearningReviewBatch.mockResolvedValue([queueRow()]);
    runUniversalConstructionLearningReview.mockResolvedValue({
      reviewRunId: "run-1",
      appliedCount: 2,
      skipped: false,
    });
    finalizeLearningReviewBatch.mockResolvedValue({
      count: 1,
      completedCount: 1,
      retriedCount: 0,
      deadLetteredCount: 0,
      skippedCount: 0,
    });

    const { runUniversalLearningQueueWorker } = await import("./worker");
    const result = await runUniversalLearningQueueWorker({
      limit: 1,
      workerId: "worker-1",
      leaseSeconds: 60,
    });

    expect(claimLearningReviewBatch).toHaveBeenCalledWith(expect.objectContaining({
      limit: 1,
      workerId: "worker-1",
      leaseSeconds: 60,
    }));
    expect(runUniversalConstructionLearningReview).toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.objectContaining({
        organizationId: "org-1",
        containerType: "supplier_invoice_allocation",
        reviewMonth: "2026-05",
        runType: "monthly",
        scopeKey: "organization",
      }),
      applyMemoryActions: expect.any(Function),
    }));
    expect(finalizeLearningReviewBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "queue-1",
        claimToken: "claim-1",
        queueState: "completed",
        lastRunId: "run-1",
      }),
    ]);
    expect(result.completedCount).toBe(1);
  });

  it("retries transient failures without marking the queue row complete", async () => {
    claimLearningReviewBatch.mockResolvedValue([queueRow({ attemptCount: 1 })]);
    runUniversalConstructionLearningReview.mockRejectedValue(Object.assign(new Error("Anthropic timeout"), {
      code: "provider_timeout",
    }));
    finalizeLearningReviewBatch.mockResolvedValue({
      count: 1,
      completedCount: 0,
      retriedCount: 1,
      deadLetteredCount: 0,
      skippedCount: 0,
    });

    const { runUniversalLearningQueueWorker } = await import("./worker");
    const result = await runUniversalLearningQueueWorker();

    expect(finalizeLearningReviewBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        queueState: "retry_scheduled",
        errorCode: "provider_timeout",
        retryAfter: expect.any(String),
      }),
    ]);
    expect(result.retriedCount).toBe(1);
  });

  it("dead-letters deterministic failures", async () => {
    claimLearningReviewBatch.mockResolvedValue([queueRow()]);
    runUniversalConstructionLearningReview.mockRejectedValue(Object.assign(new Error("Invalid memoryActions."), {
      code: "memory_action_preflight_failed",
    }));
    finalizeLearningReviewBatch.mockResolvedValue({
      count: 1,
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 1,
      skippedCount: 0,
    });

    const { runUniversalLearningQueueWorker } = await import("./worker");
    const result = await runUniversalLearningQueueWorker();

    expect(finalizeLearningReviewBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        queueState: "dead_lettered",
        errorCode: "memory_action_preflight_failed",
      }),
    ]);
    expect(result.deadLetteredCount).toBe(1);
  });

  it("dead-letters transient failures after the final attempt", async () => {
    claimLearningReviewBatch.mockResolvedValue([queueRow({ attemptCount: 3, maxAttempts: 3 })]);
    runUniversalConstructionLearningReview.mockRejectedValue(new Error("network timeout"));
    finalizeLearningReviewBatch.mockResolvedValue({
      count: 1,
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 1,
      skippedCount: 0,
    });

    const { runUniversalLearningQueueWorker } = await import("./worker");
    await runUniversalLearningQueueWorker();

    expect(finalizeLearningReviewBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        queueState: "dead_lettered",
        retryAfter: null,
      }),
    ]);
  });

  it("does nothing cleanly when there are no claimed rows", async () => {
    claimLearningReviewBatch.mockResolvedValue([]);
    finalizeLearningReviewBatch.mockResolvedValue({
      count: 0,
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
      skippedCount: 0,
    });

    const { runUniversalLearningQueueWorker } = await import("./worker");
    const result = await runUniversalLearningQueueWorker();

    expect(runUniversalConstructionLearningReview).not.toHaveBeenCalled();
    expect(finalizeLearningReviewBatch).toHaveBeenCalledWith([]);
    expect(result.claimedCount).toBe(0);
  });
});
