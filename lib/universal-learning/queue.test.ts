import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

describe("Universal Construction Learning queue helpers", () => {
  const rpc = vi.fn();
  const from = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    createAdminSupabaseClient.mockReturnValue({ rpc, from });
  });

  it("enqueues a month-normalized queue row through the RPC", async () => {
    rpc.mockResolvedValue({
      data: {
        id: "queue-1",
        organizationId: "org-1",
        containerType: "supplier_invoice_allocation",
        reviewMonth: "2026-05-01",
        scopeKey: "organization",
        queueState: "pending",
        attemptCount: 0,
        maxAttempts: 3,
      },
      error: null,
    });

    const { enqueueLearningReviewQueue } = await import("./queue");
    const row = await enqueueLearningReviewQueue({
      organizationId: "org-1",
      containerType: "supplier_invoice_allocation",
      reviewMonth: "2026-05",
    });

    expect(rpc).toHaveBeenCalledWith("enqueue_learning_review_queue", expect.objectContaining({
      p_organization_id: "org-1",
      p_container_type: "supplier_invoice_allocation",
      p_review_month: "2026-05-01",
      p_scope_key: "organization",
    }));
    expect(row).toMatchObject({
      id: "queue-1",
      organizationId: "org-1",
      containerType: "supplier_invoice_allocation",
      reviewMonth: "2026-05-01",
      queueState: "pending",
    });
  });

  it("claims queue rows with a worker id and lease", async () => {
    rpc.mockResolvedValue({
      data: [{
        id: "queue-1",
        organizationId: "org-1",
        containerType: "project_purchase_order",
        reviewMonth: "2026-05-01",
        scopeKey: "organization",
        queueState: "claimed",
        attemptCount: 1,
        maxAttempts: 3,
        claimToken: "claim-1",
      }],
      error: null,
    });

    const { claimLearningReviewBatch } = await import("./queue");
    const rows = await claimLearningReviewBatch({
      limit: 2,
      workerId: "worker-1",
      leaseSeconds: 60,
    });

    expect(rpc).toHaveBeenCalledWith("claim_learning_review_batch", expect.objectContaining({
      p_limit: 2,
      p_worker_id: "worker-1",
      p_lease_seconds: 60,
    }));
    expect(rows[0]).toMatchObject({
      id: "queue-1",
      attemptCount: 1,
      claimToken: "claim-1",
    });
  });

  it("finalizes rows in a batch and parses queue counters", async () => {
    rpc.mockResolvedValue({
      data: {
        count: 2,
        completedCount: 1,
        retriedCount: 1,
        deadLetteredCount: 0,
        skippedCount: 0,
      },
      error: null,
    });

    const { finalizeLearningReviewBatch } = await import("./queue");
    const result = await finalizeLearningReviewBatch([
      { id: "queue-1", claimToken: "claim-1", queueState: "completed", lastRunId: "run-1" },
      { id: "queue-2", claimToken: "claim-2", queueState: "retry_scheduled", retryAfter: "2026-06-01T00:15:00.000Z" },
    ]);

    expect(rpc).toHaveBeenCalledWith("finalize_learning_review_batch", {
      p_inputs: expect.arrayContaining([
        expect.objectContaining({ id: "queue-1", queueState: "completed" }),
        expect.objectContaining({ id: "queue-2", queueState: "retry_scheduled" }),
      ]),
    });
    expect(result).toMatchObject({
      count: 2,
      completedCount: 1,
      retriedCount: 1,
    });
  });

  it("detects active queue rows for duplicate prevention", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "queue-1" }, error: null });
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => ({ maybeSingle })),
    };
    from.mockReturnValue(query);

    const { hasActiveLearningReviewQueueRow } = await import("./queue");
    await expect(hasActiveLearningReviewQueueRow({
      organizationId: "org-1",
      containerType: "project_claim",
      reviewMonth: "2026-05",
    })).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith("learning_review_queue");
    expect(query.eq).toHaveBeenCalledWith("review_month", "2026-05-01");
    expect(query.in).toHaveBeenCalledWith("queue_state", ["pending", "claimed", "retry_scheduled"]);
  });

  it("reopens dead-lettered rows for operator retry", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "queue-1",
        organization_id: "org-1",
        container_type: "project_claim",
        review_month: "2026-05-01",
        scope_key: "organization",
        queue_state: "pending",
        attempt_count: 3,
        max_attempts: 5,
      },
      error: null,
    });
    const query = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle,
    };
    from.mockReturnValue(query);

    const { retryDeadLetteredLearningReviewQueueRow } = await import("./queue");
    const row = await retryDeadLetteredLearningReviewQueueRow({
      queueId: "queue-1",
      availableAt: "2026-06-01T00:00:00.000Z",
      maxAttempts: 5,
    });

    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      queue_state: "pending",
      available_at: "2026-06-01T00:00:00.000Z",
      retry_after: null,
      claim_token: null,
      last_error_code: null,
      last_error_message: null,
      max_attempts: 5,
    }));
    expect(query.eq).toHaveBeenCalledWith("id", "queue-1");
    expect(query.eq).toHaveBeenCalledWith("queue_state", "dead_lettered");
    expect(row.queueState).toBe("pending");
  });
});
