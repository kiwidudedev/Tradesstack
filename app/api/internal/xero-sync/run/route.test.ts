import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runXeroSyncWorker = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/xero/sync", () => ({
  runXeroSyncWorker,
}));

describe("POST /api/internal/xero-sync/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/internal/xero-sync/run", { method: "POST" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden." });
  });

  it("runs the xero worker with bounded inputs", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runXeroSyncWorker.mockResolvedValue({
      claimedCount: 2,
      completedCount: 2,
      retriedCount: 0,
      deadLetteredCount: 0,
      results: [],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/xero-sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchSize: 999,
          organizationId: "org-1",
        }),
      }),
    );

    expect(runXeroSyncWorker).toHaveBeenCalledWith({
      organizationId: "org-1",
      limit: 25,
      workerId: "xero-sync-internal",
    });
    expect(response.status).toBe(200);
  });
});
