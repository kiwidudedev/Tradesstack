import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runDocumentCleanupWorker } = vi.hoisted(() => ({
  runDocumentCleanupWorker: vi.fn(),
}));

vi.mock("@/lib/documents/cleanup-worker", () => ({
  runDocumentCleanupWorker,
}));

import { GET } from "@/app/api/cron/document-storage-cleanup/run/route";

describe("document Storage cleanup cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "document-cleanup-secret");
    runDocumentCleanupWorker.mockResolvedValue({
      expiredUploadCount: 0,
      reconciliation: {
        databaseWithoutObjectCount: 0,
        metadataMismatchCount: 0,
        orphanObjectCount: 0,
      },
      claimedCount: 0,
      completedCount: 0,
      skippedDeleteCount: 0,
      reviewedOrphanCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
    });
  });

  it("rejects public execution", async () => {
    const response = await GET(new Request(
      "http://localhost/api/cron/document-storage-cleanup/run",
    ));
    expect(response.status).toBe(401);
    expect(runDocumentCleanupWorker).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(new Request(
      "http://localhost/api/cron/document-storage-cleanup/run",
      { headers: { authorization: "Bearer document-cleanup-secret" } },
    ));
    expect(response.status).toBe(500);
  });

  it("bounds worker controls and returns aggregate diagnostics", async () => {
    const response = await GET(new Request(
      "http://localhost/api/cron/document-storage-cleanup/run?limit=9999&leaseSeconds=1&reconciliationLimit=99999",
      { headers: { authorization: "Bearer document-cleanup-secret" } },
    ));
    expect(response.status).toBe(200);
    expect(runDocumentCleanupWorker).toHaveBeenCalledWith({
      limit: 500,
      leaseSeconds: 30,
      reconciliationLimit: 5_000,
      workerId: "document-storage-cleanup-cron",
    });
  });

  it("is registered with the production scheduler", () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path: string; schedule: string }> };

    expect(config.crons).toContainEqual({
      path: "/api/cron/document-storage-cleanup/run",
      schedule: "* * * * *",
    });
  });
});
