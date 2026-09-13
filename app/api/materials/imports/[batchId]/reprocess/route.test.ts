import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ after: vi.fn(), kick: vi.fn(), schedule: vi.fn(), rpc: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: vi.fn().mockResolvedValue({ organization_id: "org-1", user_id: "user-1" }) }));
vi.mock("@/lib/materials/import-job-kick", () => ({ scheduleMaterialSupplierPricingWorker: mocks.schedule }));

function builder(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "update"]) chain[method] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: (table: string) => table === "organization_material_import_batches"
      ? builder({ data: { id: "batch-1", status: "failed", storage_path: "org/batch/prices.csv" }, error: null })
      : table === "organization_material_import_rows"
        ? builder({ count: 0, error: null })
        : builder({ count: 0, error: null }),
    rpc: mocks.rpc,
  })),
}));

describe("POST Material import reprocess immediate execution", () => {
  beforeEach(() => {
    mocks.after.mockReset();
    mocks.kick.mockReset().mockResolvedValue({ started: true });
    mocks.schedule.mockReset().mockImplementation((scheduler, context) => scheduler(() => mocks.kick(context)));
    mocks.rpc.mockReset().mockResolvedValue({ data: [{ run_id: "run-2", job_id: "job-2" }], error: null });
  });

  it("enqueues and schedules the same worker kick", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ batchId: "batch-1" }) });
    expect(response.status).toBe(202);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.schedule).toHaveBeenCalledWith(mocks.after, { batchId: "batch-1", jobId: "job-2", trigger: "reprocess" });
    const scheduled = mocks.after.mock.calls[0]?.[0] as (() => Promise<unknown>);
    await scheduled();
    expect(mocks.kick).toHaveBeenCalledWith({ batchId: "batch-1", jobId: "job-2", trigger: "reprocess" });
  });
});
