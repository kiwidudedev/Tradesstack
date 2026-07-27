import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueEligibleXeroBillRefreshes = vi.fn();
const runXeroSyncWorker = vi.fn();

vi.mock("@/lib/xero/bill-refresh", () => ({ enqueueEligibleXeroBillRefreshes }));
vi.mock("@/lib/xero/sync", () => ({ runXeroSyncWorker }));

describe("GET /api/cron/xero-bill-status/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects unauthorized requests", async () => {
    vi.stubEnv("CRON_SECRET", "this-is-a-strong-test-cron-secret");
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/xero-bill-status/run"));
    expect(response.status).toBe(401);
  });

  it("runs only the exact refresh jobs returned by the scheduler", async () => {
    vi.stubEnv("CRON_SECRET", "this-is-a-strong-test-cron-secret");
    enqueueEligibleXeroBillRefreshes.mockResolvedValue([
      { jobId: "job-1", created: true },
      { jobId: "job-2", created: false },
    ]);
    runXeroSyncWorker.mockResolvedValue({
      claimedCount: 1,
      completedCount: 1,
      retriedCount: 0,
      deadLetteredCount: 0,
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/xero-bill-status/run", {
      headers: { authorization: "Bearer this-is-a-strong-test-cron-secret" },
    }));
    expect(runXeroSyncWorker).toHaveBeenNthCalledWith(1, {
      jobId: "job-1",
      limit: 1,
      workerId: "xero-bill-status-cron",
    });
    expect(runXeroSyncWorker).toHaveBeenNthCalledWith(2, {
      jobId: "job-2",
      limit: 1,
      workerId: "xero-bill-status-cron",
    });
    expect((await response.json()).completedCount).toBe(2);
  });
});
