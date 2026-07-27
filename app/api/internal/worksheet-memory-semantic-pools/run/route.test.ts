import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runWorksheetMemorySemanticPoolWorker = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/worksheet-memory-semantic-pools", () => ({
  runWorksheetMemorySemanticPoolWorker,
}));

describe("POST /api/internal/worksheet-memory-semantic-pools/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-memory-semantic-pools/run", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden.",
    });
    expect(runWorksheetMemorySemanticPoolWorker).not.toHaveBeenCalled();
  });

  it("runs the Stage 7 worker for admins", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetMemorySemanticPoolWorker.mockResolvedValue({
      runId: "run-1",
      claimedJobCount: 2,
      completedJobCount: 2,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      semanticPoolCount: 1,
      noPoolCount: 0,
      candidateEventCount: 4,
      provider: "anthropic",
      model: "claude-test",
      durationMs: 321,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-memory-semantic-pools/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: 20,
          organizationId: "org-123",
          batchEventLimit: 16,
          maxSeedPoolCount: 6,
          timeoutMs: 12000,
          maxOutputTokens: 1500,
        }),
      }),
    );

    expect(runWorksheetMemorySemanticPoolWorker).toHaveBeenCalledWith({
      organizationId: "org-123",
      limit: 20,
      batchEventLimit: 16,
      maxSeedPoolCount: 6,
      timeoutMs: 12000,
      maxOutputTokens: 1500,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: "run-1",
      claimedJobCount: 2,
      completedJobCount: 2,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      semanticPoolCount: 1,
      noPoolCount: 0,
      candidateEventCount: 4,
      provider: "anthropic",
      model: "claude-test",
      durationMs: 321,
      batchSize: 20,
      organizationId: "org-123",
    });
  });

  it("caps manual Stage 7 batch sizes before dispatching the worker", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
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
      durationMs: 5,
    });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/internal/worksheet-memory-semantic-pools/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: 250,
        }),
      }),
    );

    expect(runWorksheetMemorySemanticPoolWorker).toHaveBeenCalledWith({
      organizationId: null,
      limit: 100,
      batchEventLimit: undefined,
      maxSeedPoolCount: undefined,
      timeoutMs: undefined,
      maxOutputTokens: undefined,
    });
  });
});
