import { beforeEach, describe, expect, it, vi } from "vitest";

const runXeroSyncWorker = vi.fn();

vi.mock("@/lib/xero/sync", () => ({
  runXeroSyncWorker,
}));

describe("GET /api/cron/xero-sync/run", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    runXeroSyncWorker.mockReset();
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "xero-sync,material-source-retention");
  });

  it("requires CRON_SECRET", async () => {
    const { GET } = await import("./route");
    await expect(GET(new Request("http://localhost/api/cron/xero-sync/run"))).rejects.toThrow(
      "CRON_SECRET is not configured.",
    );
  });

  it("rejects unauthorized requests", async () => {
    vi.stubEnv("CRON_SECRET", "this-is-a-strong-test-cron-secret");
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/xero-sync/run", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("runs the worker with normalized batch settings", async () => {
    vi.stubEnv("CRON_SECRET", "this-is-a-strong-test-cron-secret");
    runXeroSyncWorker.mockResolvedValue({
      claimedCount: 1,
      completedCount: 1,
      retriedCount: 0,
      deadLetteredCount: 0,
      results: [],
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/xero-sync/run?organizationId=org-1&batchSize=999", {
        headers: { authorization: "Bearer this-is-a-strong-test-cron-secret" },
      }),
    );

    expect(runXeroSyncWorker).toHaveBeenCalledWith({
      organizationId: "org-1",
      limit: 25,
      workerId: "xero-sync-cron",
    });
    expect(response.status).toBe(200);
  });

  it("rejects weak configured secrets before authorizing requests", async () => {
    vi.stubEnv("CRON_SECRET", "short");

    const { GET } = await import("./route");
    await expect(
      GET(
        new Request("http://localhost/api/cron/xero-sync/run", {
          headers: { authorization: "Bearer short" },
        }),
      ),
    ).rejects.toThrow(/at least 24 characters/);
  });
});
