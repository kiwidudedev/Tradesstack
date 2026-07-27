import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runWorksheetMemoryEvidencePoolWorker = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/worksheet-memory-evidence-pools", () => ({
  runWorksheetMemoryEvidencePoolWorker,
}));

describe("POST /api/internal/worksheet-memory-evidence-pools/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-memory-evidence-pools/run", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden.",
    });
    expect(runWorksheetMemoryEvidencePoolWorker).not.toHaveBeenCalled();
  });

  it("runs the Stage 6 worker for admins", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetMemoryEvidencePoolWorker.mockResolvedValue({
      claimedJobCount: 4,
      completedJobCount: 4,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      rebuiltOrganizationCount: 1,
      fetchedEventCount: 8,
      persistedPoolCount: 2,
      persistedLinkCount: 8,
      semanticQueueInsertCount: 2,
      durationMs: 345,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-memory-evidence-pools/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: 20,
          organizationId: "org-123",
          eventLimit: 120,
        }),
      }),
    );

    expect(runWorksheetMemoryEvidencePoolWorker).toHaveBeenCalledWith({
      limit: 20,
      organizationId: "org-123",
      eventLimit: 120,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimedJobCount: 4,
      completedJobCount: 4,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      rebuiltOrganizationCount: 1,
      fetchedEventCount: 8,
      persistedPoolCount: 2,
      persistedLinkCount: 8,
      semanticQueueInsertCount: 2,
      durationMs: 345,
      batchSize: 20,
      organizationId: "org-123",
      eventLimit: 120,
    });
  });

  it("caps manual Stage 6 batch sizes before dispatching the worker", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
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
      durationMs: 10,
    });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/internal/worksheet-memory-evidence-pools/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: 250,
          eventLimit: 2000,
        }),
      }),
    );

    expect(runWorksheetMemoryEvidencePoolWorker).toHaveBeenCalledWith({
      limit: 100,
      organizationId: null,
      eventLimit: 1000,
    });
  });
});
