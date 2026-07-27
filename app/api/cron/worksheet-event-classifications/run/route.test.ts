import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const runWorksheetEventSemanticClassificationRunner = vi.fn();

vi.mock("@/lib/worksheet-event-semantic-classification", () => ({
  runWorksheetEventSemanticClassificationRunner,
}));

describe("GET /api/cron/worksheet-event-classifications/run", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
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
      new Request("http://localhost/api/cron/worksheet-event-classifications/run"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized.",
    });
    expect(runWorksheetEventSemanticClassificationRunner).not.toHaveBeenCalled();
  });

  it("fails safely when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/worksheet-event-classifications/run", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Missing CRON_SECRET environment variable.",
    });
    expect(runWorksheetEventSemanticClassificationRunner).not.toHaveBeenCalled();
  });

  it("runs the worksheet semantic classification runner in safe batches", async () => {
    runWorksheetEventSemanticClassificationRunner.mockResolvedValue({
      selectedEventCount: 12,
      processedBatchCount: 2,
      persistedClassificationCount: 12,
      classifiedCount: 9,
      lowConfidenceCount: 2,
      failedCount: 1,
      skippedCount: 0,
      provider: "openai",
      model: "gpt-5.5",
      durationMs: 842,
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/worksheet-event-classifications/run?batchSize=20&organizationId=org-123", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(runWorksheetEventSemanticClassificationRunner).toHaveBeenCalledWith({
      limit: 20,
      groupSize: 1,
      organizationId: "org-123",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fetchedCount: 12,
      classifiedCount: 9,
      lowConfidenceCount: 2,
      failedCount: 1,
      skippedCount: 0,
      processedBatchCount: 2,
      persistedClassificationCount: 12,
      provider: "openai",
      model: "gpt-5.5",
      durationMs: 842,
      batchSize: 20,
      organizationId: "org-123",
    });
  });

  it("caps cron-triggered batch size before dispatching the runner", async () => {
    runWorksheetEventSemanticClassificationRunner.mockResolvedValue({
      selectedEventCount: 0,
      processedBatchCount: 0,
      persistedClassificationCount: 0,
      classifiedCount: 0,
      lowConfidenceCount: 0,
      failedCount: 0,
      skippedCount: 150,
      provider: null,
      model: null,
      durationMs: 8,
    });

    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/cron/worksheet-event-classifications/run?batchSize=250", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(runWorksheetEventSemanticClassificationRunner).toHaveBeenCalledWith({
      limit: 100,
      groupSize: 1,
      organizationId: null,
    });
  });
});
