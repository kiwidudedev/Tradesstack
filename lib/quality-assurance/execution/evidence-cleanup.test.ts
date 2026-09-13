import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocked.create }));
import { runProjectQAEvidenceCleanup } from "./evidence-cleanup";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "project-qa-evidence-cleanup");
  mocked.create.mockReturnValue({ rpc: mocked.rpc, storage: { from: () => ({ remove: mocked.remove }) } });
  mocked.rpc.mockImplementation(async (name) => ({ error: null, data: name === "claim_project_qa_cleanup_jobs_v1" ? [{ id: "job", storage_bucket: "project-qa-evidence", storage_path: "path", lease_token: "lease", lease_expires_at: new Date(Date.now() + 60000).toISOString() }] : null }));
});
afterEach(() => vi.unstubAllEnvs());
describe("leased QA evidence cleanup", () => {
  it("does nothing before explicit activation", async () => {
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "");
    expect(await runProjectQAEvidenceCleanup()).toMatchObject({ disabled: true, claimedCount: 0 });
    expect(mocked.create).not.toHaveBeenCalled();
  });
  it("completes only through the owned lease after deletion", async () => {
    mocked.remove.mockResolvedValue({ error: null });
    expect(await runProjectQAEvidenceCleanup()).toMatchObject({ completedCount: 1 });
    expect(mocked.rpc).toHaveBeenCalledWith("finish_project_qa_cleanup_job_v1", { p_job_id: "job", p_lease_token: "lease", p_success: true });
  });
  it("persists transport errors as retryable failures without logging their values", async () => {
    mocked.remove.mockRejectedValue(new Error("synthetic-private-error"));
    expect(await runProjectQAEvidenceCleanup()).toMatchObject({ failedCount: 1 });
    expect(mocked.rpc).toHaveBeenCalledWith("finish_project_qa_cleanup_job_v1", { p_job_id: "job", p_lease_token: "lease", p_success: false });
  });
  it("does not delete after a claim expires", async () => {
    mocked.rpc.mockResolvedValue({ error: null, data: [{ id: "job", lease_token: "lease", lease_expires_at: "2000-01-01T00:00:00Z" }] });
    expect(await runProjectQAEvidenceCleanup()).toMatchObject({ failedCount: 1 });
    expect(mocked.remove).not.toHaveBeenCalled();
  });
});
