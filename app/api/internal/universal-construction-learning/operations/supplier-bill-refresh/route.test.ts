import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUniversalLearningOperationsAdmin = vi.fn();
const getSupplierBillUclRefreshMetrics = vi.fn();
const listSupplierBillUclRefreshRows = vi.fn();
const requeueSupplierBillUclRefreshDeadLetter = vi.fn();

vi.mock("@/app/api/internal/universal-construction-learning/operations/_shared", () => ({
  requireUniversalLearningOperationsAdmin,
}));
vi.mock("@/lib/universal-learning/supplier-bill-refresh-queue", () => ({
  getSupplierBillUclRefreshMetrics,
  listSupplierBillUclRefreshRows,
  requeueSupplierBillUclRefreshDeadLetter,
}));

describe("Supplier Bill UCL refresh operations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUniversalLearningOperationsAdmin.mockResolvedValue(null);
    getSupplierBillUclRefreshMetrics.mockResolvedValue({
      pendingCount: 2,
      deadLetterCount: 1,
      oldestPendingAt: "2026-07-28T00:00:00.000Z",
    });
    listSupplierBillUclRefreshRows.mockResolvedValue([
      {
        id: "queue-1",
        organization_id: "org-1",
        source_id: "invoice-1",
        last_error_code: "safe_code",
        last_error_summary: "Safe summary.",
      },
    ]);
  });

  it("returns safe metrics and queue rows to platform operations admins", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/internal/universal-construction-learning/operations/supplier-bill-refresh?organizationId=org-1&state=dead_letter",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getSupplierBillUclRefreshMetrics).toHaveBeenCalledWith("org-1");
    expect(listSupplierBillUclRefreshRows).toHaveBeenCalledWith({
      organizationId: "org-1",
      state: "dead_letter",
      limit: 50,
    });
    expect(body.metrics.deadLetterCount).toBe(1);
  });

  it("does not expose operations when the shared platform-admin guard rejects", async () => {
    requireUniversalLearningOperationsAdmin.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/internal/universal-construction-learning/operations/supplier-bill-refresh",
    ));

    expect(response.status).toBe(403);
    expect(getSupplierBillUclRefreshMetrics).not.toHaveBeenCalled();
    expect(listSupplierBillUclRefreshRows).not.toHaveBeenCalled();
  });

  it("manually requeues a dead letter through the service-only RPC", async () => {
    requeueSupplierBillUclRefreshDeadLetter.mockResolvedValue({
      id: "queue-1",
      sourceId: "invoice-1",
      queueState: "pending",
      attemptCount: 0,
    });
    const { POST } = await import("./route");
    const response = await POST(new Request(
      "http://localhost/api/internal/universal-construction-learning/operations/supplier-bill-refresh",
      { method: "POST", body: JSON.stringify({ queueId: "queue-1" }) },
    ));

    expect(response.status).toBe(200);
    expect(requeueSupplierBillUclRefreshDeadLetter).toHaveBeenCalledWith("queue-1");
  });
});
