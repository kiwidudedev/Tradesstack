import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runSupplierBillUclRefreshWorker = vi.fn();

vi.mock("@/lib/universal-learning/supplier-bill-refresh-worker", () => ({
  runSupplierBillUclRefreshWorker,
}));

describe("Supplier Bill UCL refresh cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "refresh-secret");
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "universal-construction-learning/supplier-bills,material-source-retention");
  });

  it("rejects unauthorized requests", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/universal-construction-learning/supplier-bills/run"));
    expect(response.status).toBe(401);
    expect(runSupplierBillUclRefreshWorker).not.toHaveBeenCalled();
  });

  it("runs only the refresh worker with bounded inputs", async () => {
    runSupplierBillUclRefreshWorker.mockResolvedValue({
      claimedCount: 1,
      changedCount: 1,
      noChangeCount: 0,
      voidedCount: 0,
      deletedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
      supersededCount: 0,
      results: [],
    });
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/cron/universal-construction-learning/supplier-bills/run?organizationId=org-1&limit=999&leaseSeconds=99999",
      { headers: { authorization: "Bearer refresh-secret" } },
    ));

    expect(response.status).toBe(200);
    expect(runSupplierBillUclRefreshWorker).toHaveBeenCalledWith({
      organizationId: "org-1",
      limit: 100,
      leaseSeconds: 3_600,
      workerId: "supplier-bill-ucl-refresh-cron",
    });
  });

  it("is scheduled every minute by the deployment configuration", () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path?: string; schedule?: string }> };

    expect(config.crons).toContainEqual({
      path: "/api/cron/universal-construction-learning/supplier-bills/run",
      schedule: "* * * * *",
    });
  });
  it("does not run work when authenticated but not activated", async () => {
    vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "");
    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test", { headers: { authorization: "Bearer synthetic-cron-secret" } }));
    expect(await response.json()).toMatchObject({ skipped: true });
  });

});
