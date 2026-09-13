import { beforeEach, describe, expect, it, vi } from "vitest";

const runMaterialSupplierPricingWorker = vi.fn();
const purgeExpiredMaterialImportSources = vi.fn();
vi.mock("@/lib/materials/import-job-service", () => ({ runMaterialSupplierPricingWorker, purgeExpiredMaterialImportSources }));

describe("material supplier pricing worker route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    runMaterialSupplierPricingWorker.mockReset();
    purgeExpiredMaterialImportSources.mockReset();
  });

  it("fails closed when CRON_SECRET is absent", async () => {
    const { POST } = await import("./route");
    expect((await POST(new Request("http://localhost"))).status).toBe(500);
  });

  it("rejects an invalid bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { POST } = await import("./route");
    expect((await POST(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("claims one durable job for an authorized invocation", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    runMaterialSupplierPricingWorker.mockResolvedValue({ claimed: false });
    purgeExpiredMaterialImportSources.mockResolvedValue({ purged: 0 });
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer secret" } }));
    expect(response.status).toBe(200);
    expect(runMaterialSupplierPricingWorker).toHaveBeenCalledTimes(1);
  });
});
