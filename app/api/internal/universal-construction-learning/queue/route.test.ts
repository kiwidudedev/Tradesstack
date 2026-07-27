import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const createAdminSupabaseClient = vi.fn();
const enqueueLearningReviewQueue = vi.fn();
const retryDeadLetteredLearningReviewQueueRow = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/lib/universal-learning/queue", () => ({
  enqueueLearningReviewQueue,
  retryDeadLetteredLearningReviewQueueRow,
}));

describe("Universal Construction Learning queue admin API", () => {
  beforeEach(() => {
    hasPlatformAdminRole.mockReset();
    createAdminSupabaseClient.mockReset();
    enqueueLearningReviewQueue.mockReset();
    retryDeadLetteredLearningReviewQueueRow.mockReset();
  });

  it("rejects non-admin users", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"));
    expect(response.status).toBe(403);
  });

  it("lists queue rows for admins", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      eq: vi.fn(() => query),
      then(resolve: (value: unknown) => void) {
        resolve({ data: [{ id: "queue-1" }], error: null });
      },
    };
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => query),
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost?organizationId=org-1&queueState=dead_lettered"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("queue_state", "dead_lettered");
    expect(json.rows).toEqual([{ id: "queue-1" }]);
  });

  it("manually enqueues queue rows", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    enqueueLearningReviewQueue.mockResolvedValue({ id: "queue-1" });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        containerType: "project_claim",
        reviewMonth: "2026-05",
      }),
    }));

    expect(response.status).toBe(200);
    expect(enqueueLearningReviewQueue).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      containerType: "project_claim",
      reviewMonth: "2026-05",
      scopeKey: "organization",
      eligibilitySnapshot: { manuallyEnqueued: true },
    }));
  });

  it("retries dead-lettered rows", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    retryDeadLetteredLearningReviewQueueRow.mockResolvedValue({ id: "queue-1", queueState: "pending" });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "retry_dead_lettered",
        queueId: "queue-1",
        maxAttempts: 5,
      }),
    }));

    expect(response.status).toBe(200);
    expect(retryDeadLetteredLearningReviewQueueRow).toHaveBeenCalledWith({
      queueId: "queue-1",
      maxAttempts: 5,
    });
  });
});
