import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const enqueueManualSupplierBillUclRefresh = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));
vi.mock("@/lib/universal-learning/supplier-bill-refresh-queue", () => ({
  enqueueManualSupplierBillUclRefresh,
}));

describe("Supplier Bill UCL manual refresh route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires platform admin and does not enqueue when forbidden", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/internal/universal-construction-learning/supplier-bills/refresh", {
      method: "POST",
      body: JSON.stringify({ sourceId: "invoice-1" }),
    }));
    expect(response.status).toBe(403);
    expect(enqueueManualSupplierBillUclRefresh).not.toHaveBeenCalled();
  });

  it("accepts only sourceId and resolves organization through the shared enqueue service", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    enqueueManualSupplierBillUclRefresh.mockResolvedValue({
      id: "queue-1",
      organizationId: "resolved-org",
      containerType: "supplier_invoice",
      sourceId: "invoice-1",
      reasonCode: "supplier_bill_manual_refresh",
      queueState: "pending",
      priority: 10,
      firstRequestedAt: "2026-07-28T00:00:00.000Z",
      lastRequestedAt: "2026-07-28T00:01:00.000Z",
    });
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/internal/universal-construction-learning/supplier-bills/refresh", {
      method: "POST",
      body: JSON.stringify({
        sourceId: "invoice-1",
        organizationId: "attacker-org",
        reasonCode: "unsafe",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(enqueueManualSupplierBillUclRefresh).toHaveBeenCalledWith("invoice-1");
    expect(body.organizationId).toBe("resolved-org");
  });
});
