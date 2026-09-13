import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const runWorksheetMemorySemanticPoolWorker = vi.fn();

vi.mock("@/lib/worksheet-memory-semantic-pools", () => ({
  runWorksheetMemorySemanticPoolWorker,
}));

describe("GET /api/cron/worksheet-memory-semantic-pools/run", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "worksheet-memory-semantic-pools,material-source-retention");
  });

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
      return;
    }

    process.env.CRON_SECRET = originalCronSecret;
  });

  it("rejects unauthorized cron requests", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/worksheet-memory-semantic-pools/run"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized.",
    });
    expect(runWorksheetMemorySemanticPoolWorker).not.toHaveBeenCalled();
  });

  it("fails safely when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/worksheet-memory-semantic-pools/run", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Missing CRON_SECRET environment variable.",
    });
    expect(runWorksheetMemorySemanticPoolWorker).not.toHaveBeenCalled();
  });

  it("runs the Stage 7 worker in safe cron batches", async () => {
    runWorksheetMemorySemanticPoolWorker.mockResolvedValue({
      runId: "run-1",
      claimedJobCount: 3,
      completedJobCount: 2,
      retriedJobCount: 1,
      deadLetteredJobCount: 0,
      semanticPoolCount: 1,
      noPoolCount: 1,
      candidateEventCount: 6,
      provider: "anthropic",
      model: "claude-test",
      durationMs: 456,
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/worksheet-memory-semantic-pools/run?batchSize=20&organizationId=org-123", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(runWorksheetMemorySemanticPoolWorker).toHaveBeenCalledWith({
      limit: 20,
      organizationId: "org-123",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: "run-1",
      claimedJobCount: 3,
      completedJobCount: 2,
      retriedJobCount: 1,
      deadLetteredJobCount: 0,
      semanticPoolCount: 1,
      noPoolCount: 1,
      candidateEventCount: 6,
      provider: "anthropic",
      model: "claude-test",
      durationMs: 456,
      batchSize: 20,
      organizationId: "org-123",
    });
  });

  it("caps cron-triggered Stage 7 batch sizes before dispatching the worker", async () => {
    runWorksheetMemorySemanticPoolWorker.mockResolvedValue({
      runId: "run-2",
      claimedJobCount: 0,
      completedJobCount: 0,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      semanticPoolCount: 0,
      noPoolCount: 0,
      candidateEventCount: 0,
      provider: "anthropic",
      model: "claude-test",
      durationMs: 4,
    });

    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/cron/worksheet-memory-semantic-pools/run?batchSize=250", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(runWorksheetMemorySemanticPoolWorker).toHaveBeenCalledWith({
      limit: 100,
      organizationId: null,
    });
  });
});
