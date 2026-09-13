import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const runWorksheetMemoryEvidencePoolWorker = vi.fn();

vi.mock("@/lib/worksheet-memory-evidence-pools", () => ({
  runWorksheetMemoryEvidencePoolWorker,
}));

describe("GET /api/cron/worksheet-memory-evidence-pools/run", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "worksheet-memory-evidence-pools,material-source-retention");
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
      new Request("http://localhost/api/cron/worksheet-memory-evidence-pools/run"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized.",
    });
    expect(runWorksheetMemoryEvidencePoolWorker).not.toHaveBeenCalled();
  });

  it("fails safely when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/worksheet-memory-evidence-pools/run", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Missing CRON_SECRET environment variable.",
    });
    expect(runWorksheetMemoryEvidencePoolWorker).not.toHaveBeenCalled();
  });

  it("runs the Stage 6 worker in safe cron batches", async () => {
    runWorksheetMemoryEvidencePoolWorker.mockResolvedValue({
      claimedJobCount: 5,
      completedJobCount: 5,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      rebuiltOrganizationCount: 2,
      fetchedEventCount: 10,
      persistedPoolCount: 3,
      persistedLinkCount: 10,
      semanticQueueInsertCount: 3,
      durationMs: 678,
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/worksheet-memory-evidence-pools/run?batchSize=20&organizationId=org-123&eventLimit=120", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(runWorksheetMemoryEvidencePoolWorker).toHaveBeenCalledWith({
      limit: 20,
      organizationId: "org-123",
      eventLimit: 120,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimedJobCount: 5,
      completedJobCount: 5,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      rebuiltOrganizationCount: 2,
      fetchedEventCount: 10,
      persistedPoolCount: 3,
      persistedLinkCount: 10,
      semanticQueueInsertCount: 3,
      durationMs: 678,
      batchSize: 20,
      organizationId: "org-123",
      eventLimit: 120,
    });
  });

  it("caps cron-triggered Stage 6 batch sizes before dispatching the worker", async () => {
    runWorksheetMemoryEvidencePoolWorker.mockResolvedValue({
      claimedJobCount: 0,
      completedJobCount: 0,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      rebuiltOrganizationCount: 0,
      fetchedEventCount: 0,
      persistedPoolCount: 0,
      persistedLinkCount: 0,
      semanticQueueInsertCount: 0,
      durationMs: 8,
    });

    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/cron/worksheet-memory-evidence-pools/run?batchSize=250&eventLimit=2500", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(runWorksheetMemoryEvidencePoolWorker).toHaveBeenCalledWith({
      limit: 100,
      organizationId: null,
      eventLimit: 1000,
    });
  });

  it("uses route defaults when batchSize and eventLimit are omitted", async () => {
    runWorksheetMemoryEvidencePoolWorker.mockResolvedValue({
      claimedJobCount: 0,
      completedJobCount: 0,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      rebuiltOrganizationCount: 0,
      fetchedEventCount: 0,
      persistedPoolCount: 0,
      persistedLinkCount: 0,
      semanticQueueInsertCount: 0,
      durationMs: 5,
    });

    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/cron/worksheet-memory-evidence-pools/run", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(runWorksheetMemoryEvidencePoolWorker).toHaveBeenCalledWith({
      limit: 25,
      organizationId: null,
      eventLimit: 1000,
    });
  });
});
