import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  adminClient: vi.fn(),
  extract: vi.fn(),
  insertRows: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: vi.fn().mockResolvedValue({ organization_id: "org-1", user_id: "user-1" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.adminClient }));
vi.mock("@/lib/materials/validation", () => ({ validateMaterialImportFile: vi.fn() }));
vi.mock("@/lib/materials/extraction", () => ({ MATERIAL_IMPORTS_BUCKET: "material-library-imports" }));
vi.mock("@/lib/materials/import-service", () => ({
  uploadAndExtractMaterialImportBatch: mocks.upload,
  extractMaterialSupplierDocument: mocks.extract,
  insertImportRows: mocks.insertRows,
}));

type RuntimeState = {
  batch: Record<string, unknown>;
  run: Record<string, unknown>;
  job: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  heartbeatWrites: number;
};

function runtimeDatabase(state: RuntimeState) {
  const matches = (row: Record<string, unknown>, filters: Array<[string, unknown]>) =>
    filters.every(([column, value]) => row[column] === value);

  function from(table: string) {
    let operation: "select" | "update" | "delete" = "select";
    let patch: Record<string, unknown> = {};
    const filters: Array<[string, unknown]> = [];
    const rowsForTable = () => table === "organization_material_import_batches"
      ? [state.batch]
      : table === "organization_material_import_runs"
        ? [state.run]
        : table === "organization_material_import_jobs"
          ? [state.job]
          : state.rows;
    const execute = async () => {
      const rows = rowsForTable().filter((row) => matches(row, filters));
      if (operation === "update") {
        rows.forEach((row) => Object.assign(row, patch));
        if (table === "organization_material_import_jobs" && "heartbeat_at" in patch) state.heartbeatWrites += 1;
      } else if (operation === "delete") {
        state.rows = state.rows.filter((row) => !rows.includes(row));
      }
      return { data: operation === "select" ? rows : null, error: null };
    };
    const builder = {
      select: () => { operation = "select"; return builder; },
      update: (value: Record<string, unknown>) => { operation = "update"; patch = value; return builder; },
      delete: () => { operation = "delete"; return builder; },
      eq: (column: string, value: unknown) => { filters.push([column, value]); return builder; },
      in: () => builder,
      single: async () => {
        const result = await execute();
        return { data: result.data?.[0] ?? null, error: null };
      },
      then: (resolve: (value: { data: Array<Record<string, unknown>> | null; error: null }) => unknown) =>
        execute().then(resolve),
    };
    return builder;
  }

  return {
    from,
    rpc: async (name: string) => {
      if (name !== "claim_material_import_job") return { data: null, error: new Error(`Unexpected RPC ${name}`) };
      const eligible = state.job.state === "queued"
        && Date.parse(String(state.job.run_after)) <= Date.now()
        && Number(state.job.attempt_count) < Number(state.job.max_attempts);
      if (!eligible) return { data: [], error: null };
      state.job.state = "processing";
      state.job.attempt_count = Number(state.job.attempt_count) + 1;
      state.job.lease_owner = "integration-worker";
      state.job.lease_token = "lease-1";
      state.job.heartbeat_at = new Date().toISOString();
      state.job.lease_expires_at = new Date(Date.now() + 180_000).toISOString();
      return { data: [{ ...state.job }], error: null };
    },
    storage: {
      from: () => ({ download: async () => ({ data: new Blob(["%PDF-runtime"]), error: null }) }),
    },
  };
}

function createState(): RuntimeState {
  return {
    batch: {
      id: "batch-1",
      organization_id: "org-1",
      supplier_id: "supplier-1",
      file_name: "prices.pdf",
      file_type: "application/pdf",
      storage_path: "org-1/material-imports/batch-1/prices.pdf",
      status: "extracting",
    },
    run: { id: "run-1", status: "queued", attempt: 0 },
    job: {
      id: "job-1",
      organization_id: "org-1",
      import_batch_id: "batch-1",
      run_id: "run-1",
      state: "queued",
      attempt_count: 0,
      max_attempts: 3,
      run_after: new Date().toISOString(),
      lease_token: null,
      cancel_requested_at: null,
    },
    rows: [],
    heartbeatWrites: 0,
  };
}

async function createThroughRoute() {
  const formData = new FormData();
  formData.set("supplierId", "supplier-1");
  formData.set("file", new File(["%PDF-runtime"], "prices.pdf", { type: "application/pdf" }));
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/materials/imports", { method: "POST", body: formData }));
}

describe("Material import route runtime boundary", () => {
  let state: RuntimeState;

  beforeEach(() => {
    vi.useRealTimers();
    state = createState();
    mocks.after.mockReset();
    mocks.adminClient.mockReset().mockImplementation(() => runtimeDatabase(state));
    mocks.upload.mockReset().mockResolvedValue({
      batch: state.batch,
      rows: [],
      queued: true,
      runId: "run-1",
      jobId: "job-1",
    });
    mocks.extract.mockReset().mockResolvedValue({
      rows: [{ rowKey: "row-1" }],
      extractionMethod: "anthropic_document",
      summary: { model: "claude-test", partial: false },
    });
    mocks.insertRows.mockReset().mockImplementation(async () => {
      state.rows = [{ id: "row-1", status: "pending_review" }];
      return state.rows;
    });
  });

  it("creates, claims, interprets, persists rows and promotes the batch", async () => {
    const response = await createThroughRoute();
    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0]![0]();
    expect(mocks.extract).toHaveBeenCalledTimes(1);
    expect(state.rows).toHaveLength(1);
    expect(state.batch.status).toBe("ready_for_review");
    expect(state.run.status).toBe("completed");
    expect(state.job.state).toBe("completed");
  });

  it("renews the lease during a provider call longer than the heartbeat interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T00:00:00.000Z"));
    state.job.run_after = new Date().toISOString();
    let finishProvider!: (value: unknown) => void;
    mocks.extract.mockImplementation(() => new Promise((resolve) => { finishProvider = resolve; }));
    await createThroughRoute();
    const processing = mocks.after.mock.calls[0]![0]();
    await vi.waitFor(() => expect(mocks.extract).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(90_000);
    expect(state.heartbeatWrites).toBeGreaterThanOrEqual(3);
    finishProvider({
      rows: [{ rowKey: "row-1" }],
      extractionMethod: "anthropic_document",
      summary: { model: "claude-test", partial: false },
    });
    await processing;
    expect(state.job.state).toBe("completed");
    vi.useRealTimers();
  });

  it("makes a provider timeout terminal instead of silently paying for another job attempt", async () => {
    mocks.extract.mockRejectedValue(new DocumentIntelligenceError({
      code: "provider_timeout",
      message: "Provider timed out.",
      retryable: true,
    }));
    await createThroughRoute();
    await mocks.after.mock.calls[0]![0]();
    expect(state.job.state).toBe("failed");
    expect(state.run.status).toBe("failed");
    expect(state.job.lease_token).toBeNull();
    expect(state.batch.status).toBe("failed");
  });

  it("persists safe provider usage when a paid response reaches max tokens", async () => {
    mocks.extract.mockRejectedValue(new DocumentIntelligenceError({
      code: "provider_max_tokens",
      message: "Provider output reached its limit.",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      retryable: false,
      safeMetadata: { requestId: "req-max", inputTokens: 500, outputTokens: 32_000, attemptNumber: 1 },
    }));
    await createThroughRoute();
    await mocks.after.mock.calls[0]![0]();
    expect(state.job.state).toBe("failed");
    expect(state.run).toMatchObject({
      status: "failed",
      model: "claude-sonnet-4-6",
      request_ids: ["req-max"],
      usage_json: { inputTokens: 500, outputTokens: 32_000 },
    });
    expect(state.batch.extraction_summary).toMatchObject({
      errorCode: "provider_max_tokens",
      providerCallCount: 1,
    });
  });
});
