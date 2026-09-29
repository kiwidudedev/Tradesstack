import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runWorksheetMemorySynthesisWorker = vi.fn();
const getWorksheetMemorySynthesisMetrics = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/worksheet-memory-synthesis", () => ({
  runWorksheetMemorySynthesisWorker,
  getWorksheetMemorySynthesisMetrics,
}));

describe("worksheet memory synthesis routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    process.env.TRADESSTACK_ENABLED_BACKGROUND_JOBS = "worksheet-memory-synthesis";
  });

  it("requires admin for the internal run route and forwards worker input", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { POST } = await import("./run/route");
    const forbidden = await POST(new Request("http://localhost/api/internal/worksheet-memory-synthesis/run", {
      method: "POST",
      body: JSON.stringify({ organizationId: "org-1" }),
    }));
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetMemorySynthesisWorker.mockResolvedValue({
      runId: "run-1",
      claimedJobCount: 1,
      completedJobCount: 1,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      noMemoryCount: 0,
      createdMemoryCount: 0,
      updatedMemoryCount: 1,
      reusedMemoryCount: 0,
      reconciledMemoryCount: 1,
      deactivatedDuplicateMemoryCount: 1,
      reinforcedMemoryCount: 0,
      contradictedMemoryCount: 0,
      supersededMemoryCount: 0,
      organizationMemoryWriteCount: 1,
      provenanceLinkCount: 7,
      provider: "anthropic",
      model: "claude-test",
      durationMs: 123,
    });
    const allowed = await POST(new Request("http://localhost/api/internal/worksheet-memory-synthesis/run", {
      method: "POST",
      body: JSON.stringify({
        organizationId: "org-1",
        semanticPoolId: "pool-1",
        batchSize: 9,
        timeoutMs: 1234,
        maxOutputTokens: 500,
        maxEvidenceItems: 10,
        maxExistingMemories: 4,
      }),
    }));
    expect(allowed.status).toBe(200);
    expect(runWorksheetMemorySynthesisWorker).toHaveBeenCalledWith({
      organizationId: "org-1",
      semanticPoolId: "pool-1",
      limit: 9,
      timeoutMs: 1234,
      maxOutputTokens: 500,
      maxEvidenceItems: 10,
      maxExistingMemories: 4,
    });
    await expect(allowed.json()).resolves.toMatchObject({
      createdMemoryCount: 0,
      updatedMemoryCount: 1,
      reusedMemoryCount: 0,
      reconciledMemoryCount: 1,
      deactivatedDuplicateMemoryCount: 1,
      batchSize: 9,
      organizationId: "org-1",
      semanticPoolId: "pool-1",
    });
  });

  it("protects the cron route with the shared cron auth pattern", async () => {
    const { GET } = await import("../../cron/worksheet-memory-synthesis/run/route");

    const missingSecret = await GET(new Request("http://localhost/api/cron/worksheet-memory-synthesis/run"));
    expect(missingSecret.status).toBe(500);

    process.env.CRON_SECRET = "secret";
    const unauthorized = await GET(new Request("http://localhost/api/cron/worksheet-memory-synthesis/run"));
    expect(unauthorized.status).toBe(401);

    runWorksheetMemorySynthesisWorker.mockResolvedValue({
      runId: "run-1",
      claimedJobCount: 1,
      completedJobCount: 1,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      noMemoryCount: 1,
      createdMemoryCount: 0,
      updatedMemoryCount: 0,
      reusedMemoryCount: 0,
      reconciledMemoryCount: 0,
      deactivatedDuplicateMemoryCount: 0,
      reinforcedMemoryCount: 0,
      contradictedMemoryCount: 0,
      supersededMemoryCount: 0,
      organizationMemoryWriteCount: 0,
      provenanceLinkCount: 0,
      provider: "anthropic",
      model: "claude-test",
      durationMs: 123,
    });
    const authorized = await GET(new Request("http://localhost/api/cron/worksheet-memory-synthesis/run?batchSize=7&organizationId=org-1", {
      headers: {
        authorization: "Bearer secret",
      },
    }));
    expect(authorized.status).toBe(200);
    expect(runWorksheetMemorySynthesisWorker).toHaveBeenCalledWith({
      limit: 7,
      organizationId: "org-1",
    });
    await expect(authorized.json()).resolves.toMatchObject({
      noMemoryCount: 1,
      createdMemoryCount: 0,
      updatedMemoryCount: 0,
      reusedMemoryCount: 0,
      reconciledMemoryCount: 0,
      deactivatedDuplicateMemoryCount: 0,
      batchSize: 7,
      organizationId: "org-1",
    });
  });

  it("requires admin for the metrics route", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./metrics/route");
    const forbidden = await GET(new Request("http://localhost/api/internal/worksheet-memory-synthesis/metrics?organizationId=org-1"));
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    getWorksheetMemorySynthesisMetrics.mockResolvedValue({ organizationId: "org-1", queueStateCounts: {} });
    const allowed = await GET(new Request("http://localhost/api/internal/worksheet-memory-synthesis/metrics?organizationId=org-1"));
    expect(allowed.status).toBe(200);
    expect(getWorksheetMemorySynthesisMetrics).toHaveBeenCalledWith("org-1");
  });
});
