import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("rolling Retention worker", () => {
  it("is permanently retired and performs no database work", async () => {
    const { runRollingRetentionWorker } = await import(
      "./rolling-retention-worker"
    );

    await expect(runRollingRetentionWorker(500)).resolves.toEqual({
      processed: 0,
      succeeded: 0,
      failed: 0,
      retired: true,
    });
  });
});
