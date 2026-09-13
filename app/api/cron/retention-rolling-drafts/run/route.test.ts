import { beforeEach, describe, expect, it, vi } from "vitest";

const runRollingRetentionWorker = vi.fn();
vi.mock("@/lib/retention/rolling-retention-worker", () => ({
  runRollingRetentionWorker,
}));

describe("GET /api/cron/retention-rolling-drafts/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "retention-rolling-drafts,material-source-retention");
  });

  it("rejects requests without the configured bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "retention-test-secret");
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/retention-rolling-drafts/run"),
    );
    expect(response.status).toBe(401);
    expect(runRollingRetentionWorker).not.toHaveBeenCalled();
  });

  it("reports the retired worker without processing drafts", async () => {
    vi.stubEnv("CRON_SECRET", "retention-test-secret");
    runRollingRetentionWorker.mockResolvedValue({
      processed: 0,
      succeeded: 0,
      failed: 0,
      retired: true,
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/cron/retention-rolling-drafts/run?limit=25",
        { headers: { authorization: "Bearer retention-test-secret" } },
      ),
    );
    expect(response.status).toBe(200);
    expect(runRollingRetentionWorker).toHaveBeenCalledWith(25);
    expect(await response.json()).toEqual({
      processed: 0,
      succeeded: 0,
      failed: 0,
      retired: true,
    });
  });
});
