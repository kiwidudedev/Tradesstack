import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runWorksheetEventSemanticClassificationRunner = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/worksheet-event-semantic-classification", () => ({
  runWorksheetEventSemanticClassificationRunner,
}));

describe("POST /api/internal/worksheet-event-classifications/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-event-classifications/run", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden.",
    });
    expect(runWorksheetEventSemanticClassificationRunner).not.toHaveBeenCalled();
  });

  it("returns run summary for manual classification triggers", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
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

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-event-classifications/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: 20,
          organizationId: "org-123",
        }),
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

  it("caps batch size before dispatching the runner", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetEventSemanticClassificationRunner.mockResolvedValue({
      selectedEventCount: 0,
      processedBatchCount: 0,
      persistedClassificationCount: 0,
      classifiedCount: 0,
      lowConfidenceCount: 0,
      failedCount: 0,
      skippedCount: 50,
      provider: null,
      model: null,
      durationMs: 12,
    });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/internal/worksheet-event-classifications/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: 250,
        }),
      }),
    );

    expect(runWorksheetEventSemanticClassificationRunner).toHaveBeenCalledWith({
      limit: 100,
      groupSize: 1,
      organizationId: null,
    });
  });
});
