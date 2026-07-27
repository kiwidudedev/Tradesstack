import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueEligibleXeroSalesInvoiceRefreshes = vi.fn();
const runXeroSyncWorker = vi.fn();

vi.mock("@/lib/xero/payment-claim-sales-invoice-refresh", () => ({ enqueueEligibleXeroSalesInvoiceRefreshes }));
vi.mock("@/lib/xero/sync", () => ({ runXeroSyncWorker }));

describe("GET /api/cron/xero-sales-invoice-status/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects unauthorized requests", async () => {
    vi.stubEnv("CRON_SECRET", "this-is-a-strong-test-cron-secret");
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/xero-sales-invoice-status/run"));
    expect(response.status).toBe(401);
  });

  it("runs only the exact ACCREC refresh jobs returned by its scheduler", async () => {
    vi.stubEnv("CRON_SECRET", "this-is-a-strong-test-cron-secret");
    enqueueEligibleXeroSalesInvoiceRefreshes.mockResolvedValue([
      { jobId: "job-1", created: true },
      { jobId: "job-2", created: false },
    ]);
    runXeroSyncWorker.mockResolvedValue({
      claimedCount: 1, completedCount: 1, retriedCount: 0, deadLetteredCount: 0,
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/xero-sales-invoice-status/run", {
      headers: { authorization: "Bearer this-is-a-strong-test-cron-secret" },
    }));
    expect(runXeroSyncWorker).toHaveBeenNthCalledWith(1, {
      jobId: "job-1", limit: 1, workerId: "xero-sales-invoice-status-cron",
    });
    expect((await response.json()).completedCount).toBe(2);
  });
});
