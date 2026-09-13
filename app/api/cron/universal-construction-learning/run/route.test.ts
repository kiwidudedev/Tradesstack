import { beforeEach, describe, expect, it, vi } from "vitest";

const runUniversalLearningQueueWorker = vi.fn();

vi.mock("@/lib/universal-learning/worker", () => ({
  runUniversalLearningQueueWorker,
}));

describe("GET /api/cron/universal-construction-learning/run", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    runUniversalLearningQueueWorker.mockReset();
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "universal-construction-learning,material-source-retention");
  });

  it("requires CRON_SECRET", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/universal-construction-learning/run"));
    expect(response.status).toBe(500);
  });

  it("rejects unauthorized cron requests", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/universal-construction-learning/run", {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(401);
  });

  it("runs the queue worker with bounded batch and lease inputs", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    runUniversalLearningQueueWorker.mockResolvedValue({
      claimedCount: 1,
      completedCount: 1,
      retriedCount: 0,
      deadLetteredCount: 0,
      skippedCount: 0,
      results: [],
    });

    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/cron/universal-construction-learning/run?organizationId=org-1&containerType=project_claim&batchSize=999&leaseSeconds=999999",
      { headers: { authorization: "Bearer secret" } },
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(runUniversalLearningQueueWorker).toHaveBeenCalledWith({
      limit: 25,
      organizationId: "org-1",
      containerType: "project_claim",
      leaseSeconds: 3_600,
      workerId: "universal-construction-learning-cron",
    });
    expect(json.completedCount).toBe(1);
  });
});
