import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  kick: vi.fn(),
  schedule: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: vi.fn().mockResolvedValue({ organization_id: "org-1", user_id: "user-1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/materials/validation", () => ({ validateMaterialImportFile: vi.fn() }));
vi.mock("@/lib/materials/import-service", () => ({ uploadAndExtractMaterialImportBatch: mocks.upload }));
vi.mock("@/lib/materials/import-job-kick", () => ({ scheduleMaterialSupplierPricingWorker: mocks.schedule }));

describe("POST /api/materials/imports immediate execution", () => {
  beforeEach(() => {
    mocks.after.mockReset();
    mocks.kick.mockReset().mockResolvedValue({ started: true });
    mocks.schedule.mockReset().mockImplementation((scheduler, context) => scheduler(() => mocks.kick(context)));
    mocks.upload.mockReset().mockResolvedValue({
      queued: true,
      jobId: "job-1",
      runId: "run-1",
      batch: { id: "batch-1", status: "extracting" },
      rows: [],
    });
  });

  it("returns promptly after enqueue and schedules the worker in Next after()", async () => {
    const formData = new FormData();
    formData.set("supplierId", "supplier-1");
    formData.set("file", new File(["SKU,Description,Price"], "prices.csv", { type: "text/csv" }));
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/materials/imports", { method: "POST", body: formData }));
    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.schedule).toHaveBeenCalledWith(mocks.after, { batchId: "batch-1", jobId: "job-1", trigger: "create" });
    expect(mocks.kick).not.toHaveBeenCalled();
    const scheduled = mocks.after.mock.calls[0]?.[0] as (() => Promise<unknown>);
    await scheduled();
    expect(mocks.kick).toHaveBeenCalledWith({ batchId: "batch-1", jobId: "job-1", trigger: "create" });
  });
});
