import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runCostConstructionIntelligenceWorker = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/cost-construction-intelligence-outbox", () => ({
  runCostConstructionIntelligenceWorker,
}));

describe("POST /api/internal/cost-construction-intelligence/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/cost-construction-intelligence/run", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden." });
  });

  it("runs the worker with normalized batch settings", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runCostConstructionIntelligenceWorker.mockResolvedValue({
      claimedCount: 2,
      processedCount: 2,
      completedCount: 2,
      retriedCount: 0,
      deadLetteredCount: 0,
      durationMs: 21,
      provider: "openai",
      model: "gpt-5.5",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/cost-construction-intelligence/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: 9,
          organizationId: "org-1",
        }),
      }),
    );

    expect(runCostConstructionIntelligenceWorker).toHaveBeenCalledWith({
      limit: 9,
      organizationId: "org-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claimedCount: 2,
      processedCount: 2,
      batchSize: 9,
      organizationId: "org-1",
    });
  });
});
