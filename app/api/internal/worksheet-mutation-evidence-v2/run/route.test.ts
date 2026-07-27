import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runWorksheetMutationEvidenceV2OutboxWorker = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/worksheet-mutation-evidence-v2-outbox", () => ({
  runWorksheetMutationEvidenceV2OutboxWorker,
}));

describe("POST /api/internal/worksheet-mutation-evidence-v2/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-mutation-evidence-v2/run", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden.",
    });
  });

  it("runs the outbox worker with org-scoped input", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetMutationEvidenceV2OutboxWorker.mockResolvedValue({
      claimedCount: 2,
      completedCount: 2,
      retriedCount: 0,
      deadLetteredCount: 0,
      persistedEventCount: 2,
      durationMs: 25,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-mutation-evidence-v2/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: 10,
          organizationId: "org-1",
        }),
      }),
    );

    expect(runWorksheetMutationEvidenceV2OutboxWorker).toHaveBeenCalledWith({
      limit: 10,
      organizationId: "org-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claimedCount: 2,
      completedCount: 2,
      batchSize: 10,
      organizationId: "org-1",
    });
  });
});
