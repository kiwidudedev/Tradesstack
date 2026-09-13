import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runMaterialSupplierPricingWorker = vi.fn();
vi.mock("@/lib/materials/import-job-service", () => ({ runMaterialSupplierPricingWorker }));

describe("immediate Material import worker kick", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "material-supplier-pricing");
    runMaterialSupplierPricingWorker.mockReset();
  });

  it("reuses the durable worker claim boundary", async () => {
    runMaterialSupplierPricingWorker
      .mockResolvedValueOnce({ claimed: true, jobId: "job-1", status: "completed" })
      .mockResolvedValue({ claimed: false });
    const { kickMaterialSupplierPricingWorker } = await import("@/lib/materials/import-job-kick");
    await expect(kickMaterialSupplierPricingWorker({ batchId: "batch-1", jobId: "job-1", trigger: "create" }, runMaterialSupplierPricingWorker))
      .resolves.toMatchObject({ started: true, targetClaimed: true });
    expect(runMaterialSupplierPricingWorker).toHaveBeenCalledWith("material-create-job-1-1-1", "job-1");
  });

  it("targets only the requested job without draining older tenant backlog", async () => {
    runMaterialSupplierPricingWorker
      .mockResolvedValueOnce({ claimed: true, jobId: "new-job", status: "completed" })
      .mockResolvedValue({ claimed: false });
    const { kickMaterialSupplierPricingWorker } = await import("@/lib/materials/import-job-kick");
    const result = await kickMaterialSupplierPricingWorker(
      { batchId: "new-batch", jobId: "new-job", trigger: "create" },
      runMaterialSupplierPricingWorker,
    );
    expect(result).toMatchObject({ started: true, targetClaimed: true });
    expect(runMaterialSupplierPricingWorker).toHaveBeenCalledTimes(1);
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
  it("does not schedule or claim while disabled", async () => {
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "");
    const scheduler = vi.fn();
    const { scheduleMaterialSupplierPricingWorker, kickMaterialSupplierPricingWorker } = await import("./import-job-kick");
    const context = { batchId: "batch", jobId: "job", trigger: "create" as const };
    expect(scheduleMaterialSupplierPricingWorker(scheduler, context)).toMatchObject({ disabled: true });
    expect(await kickMaterialSupplierPricingWorker(context, runMaterialSupplierPricingWorker)).toMatchObject({ disabled: true });
    expect(scheduler).not.toHaveBeenCalled();
    expect(runMaterialSupplierPricingWorker).not.toHaveBeenCalled();
  });

});
