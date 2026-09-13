import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ create: vi.fn(), rpc: vi.fn(), from: vi.fn(), extract: vi.fn(), prepare: vi.fn(), download: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocked.create }));
vi.mock("@/lib/materials/import-service", () => ({ extractMaterialSupplierDocument: mocked.extract, prepareImportRows: mocked.prepare }));
vi.mock("@/lib/materials/extraction", () => ({ MATERIAL_IMPORTS_BUCKET: "material-imports" }));
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";
import { runMaterialSupplierPricingWorker, purgeExpiredMaterialImportSources } from "./import-job-service";

function query(result: unknown) {
  const q = Object.assign(Promise.resolve(result), { select: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() });
  for (const method of [q.select, q.update, q.eq, q.single, q.maybeSingle]) method.mockReturnValue(q);
  return q;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "material-supplier-pricing,material-source-retention");
  mocked.create.mockReturnValue({ rpc: mocked.rpc, from: mocked.from, storage: { from: () => ({ download: mocked.download, remove: mocked.remove }) } });
  mocked.rpc.mockImplementation(async (name) => ({ error: null, data: name === "claim_material_import_job_v2" ? [{ id: "job", organization_id: "org", import_batch_id: "batch", run_id: "run", lease_token: "lease", attempt_count: 1, max_attempts: 3 }] : "completed" }));
  mocked.from.mockImplementation(() => query({ error: null, data: { id: "batch", storage_path: "source", supplier_id: null, file_name: "test.csv", file_type: "text/csv" } }));
  mocked.download.mockResolvedValue({ data: new Blob(["a,b"]), error: null });
  mocked.extract.mockResolvedValue({ rows: [], extractionMethod: "csv", summary: {} });
  mocked.prepare.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
describe("fenced Material processing", () => {
  it("does not initialize providers/database when disabled", async () => {
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "");
    expect(await runMaterialSupplierPricingWorker()).toMatchObject({ disabled: true });
    expect(await purgeExpiredMaterialImportSources()).toMatchObject({ disabled: true });
    expect(mocked.create).not.toHaveBeenCalled();
  });
  it("claims only the supplied job and publishes through one atomic RPC", async () => {
    expect(await runMaterialSupplierPricingWorker("worker", "job")).toMatchObject({ status: "completed" });
    expect(mocked.rpc).toHaveBeenCalledWith("claim_material_import_job_v2", { p_worker_id: "worker", p_lease_seconds: 180, p_job_id: "job" });
    expect(mocked.rpc).toHaveBeenCalledWith("finalize_material_import_job_v2", expect.objectContaining({ p_job_id: "job", p_lease_token: "lease", p_outcome: "completed", p_rows: [] }));
    expect(mocked.from).not.toHaveBeenCalledWith("organization_material_import_rows");
  });
  it("does not write partial metadata when finalization loses the lease", async () => {
    const normal = mocked.rpc.getMockImplementation();
    mocked.rpc.mockImplementation(async (name, args) => name === "finalize_material_import_job_v2" ? { error: { message: "lease lost" }, data: null } : normal?.(name, args));
    await expect(runMaterialSupplierPricingWorker()).rejects.toThrow("no further state was written");
    expect(mocked.from).not.toHaveBeenCalledWith("organization_material_import_rows");
  });
  it("retains failure usage metadata without exposing the provider error", async () => {
    mocked.extract.mockRejectedValue(new DocumentIntelligenceError({
      code: "provider_timeout", message: "private-provider-detail", retryable: true,
      model: "test-model", safeMetadata: { requestId: "test-request", inputTokens: 42, outputTokens: 3, attemptNumber: 2 },
    }));
    expect(await runMaterialSupplierPricingWorker()).toMatchObject({ status: "failed" });
    expect(mocked.rpc).toHaveBeenCalledWith("finalize_material_import_job_v2", expect.objectContaining({
      p_run: expect.objectContaining({ model: "test-model", request_ids: ["test-request"], usage_json: { inputTokens: 42, outputTokens: 3 }, error_message: "Material document interpretation failed." }),
      p_batch: { extraction_summary: expect.objectContaining({ providerCallCount: 2 }) },
    }));
    expect(JSON.stringify(mocked.rpc.mock.calls)).not.toContain("private-provider-detail");
  });
  it("keeps deletion and retention metadata completion lease-bound", async () => {
    mocked.rpc.mockImplementation(async (name) => ({ error: null, data: name === "claim_material_source_cleanup_v1" ? [{ id: "cleanup", storage_path: "source", lease_token: "lease", lease_expires_at: new Date(Date.now() + 60000).toISOString() }] : null }));
    mocked.remove.mockResolvedValue({ error: null });
    expect(await purgeExpiredMaterialImportSources()).toEqual({ purged: 1 });
    expect(mocked.rpc).toHaveBeenCalledWith("finish_material_source_cleanup_v1", { p_job_id: "cleanup", p_lease_token: "lease", p_success: true });
  });
});
