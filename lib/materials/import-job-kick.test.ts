import { beforeEach, describe, expect, it, vi } from "vitest";

const runMaterialSupplierPricingWorker = vi.fn();
vi.mock("@/lib/materials/import-job-service", () => ({ runMaterialSupplierPricingWorker }));

describe("immediate Material import worker kick", () => {
  beforeEach(() => runMaterialSupplierPricingWorker.mockReset());

  it("reuses the durable worker claim boundary", async () => {
    runMaterialSupplierPricingWorker
      .mockResolvedValueOnce({ claimed: true, jobId: "job-1", status: "completed" })
      .mockResolvedValue({ claimed: false });
    const { kickMaterialSupplierPricingWorker } = await import("@/lib/materials/import-job-kick");
    await expect(kickMaterialSupplierPricingWorker({ batchId: "batch-1", jobId: "job-1", trigger: "create" }, runMaterialSupplierPricingWorker))
      .resolves.toMatchObject({ started: true, targetClaimed: true });
    expect(runMaterialSupplierPricingWorker).toHaveBeenCalledWith("material-create-job-1-1-1");
  });

  it("drains eligible backlog so an older job cannot consume the new job's only wake-up", async () => {
    runMaterialSupplierPricingWorker
      .mockResolvedValueOnce({ claimed: true, jobId: "older-job", status: "completed" })
      .mockResolvedValueOnce({ claimed: true, jobId: "new-job", status: "completed" })
      .mockResolvedValue({ claimed: false });
    const { kickMaterialSupplierPricingWorker } = await import("@/lib/materials/import-job-kick");
    const result = await kickMaterialSupplierPricingWorker(
      { batchId: "new-batch", jobId: "new-job", trigger: "create" },
      runMaterialSupplierPricingWorker,
    );
    expect(result).toMatchObject({ started: true, targetClaimed: true });
    expect(runMaterialSupplierPricingWorker).toHaveBeenCalledTimes(6);
  });

  it("keeps scheduling failure recoverable instead of failing the durable job", async () => {
    const failingWorker = async () => {
      throw new Error("temporary wake-up failure");
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { kickMaterialSupplierPricingWorker } = await import("@/lib/materials/import-job-kick");
    await expect(kickMaterialSupplierPricingWorker({ batchId: "batch-2", jobId: "job-2", trigger: "reprocess" }, failingWorker))
      .resolves.toEqual({ started: false, recoverable: true, errorCode: "worker_kick_failed" });
    expect(warning).toHaveBeenCalledWith("material_import_worker_kick_failed", expect.objectContaining({ batchId: "batch-2", jobId: "job-2" }));
    warning.mockRestore();
  });

  it("keeps after() registration failure recoverable", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { scheduleMaterialSupplierPricingWorker } = await import("@/lib/materials/import-job-kick");
    expect(scheduleMaterialSupplierPricingWorker(() => { throw new Error("request lifecycle unavailable"); }, { batchId: "batch-3", jobId: "job-3", trigger: "create" }))
      .toEqual({ scheduled: false, recoverable: true, errorCode: "worker_schedule_failed" });
    expect(warning).toHaveBeenCalledWith("material_import_worker_schedule_failed", expect.objectContaining({ batchId: "batch-3", jobId: "job-3" }));
    warning.mockRestore();
  });
});
