import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
}));

vi.mock("@/lib/permissions-server", () => ({
  hasOrganizationPermission: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: vi.fn().mockResolvedValue({
    organization_id: "org-1",
    user_id: "user-1",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/materials/import-service", () => ({
  approveMaterialImportRows: mocks.approve,
  rejectMaterialImportRows: mocks.reject,
}));

describe("POST /api/materials/imports/[batchId]/approve", () => {
  beforeEach(() => {
    mocks.approve.mockReset();
    mocks.reject.mockReset();
  });

  it("returns explicit partial success with row-scoped failures", async () => {
    mocks.approve.mockResolvedValue({
      approvedRows: [{ rowId: "row-a", materialId: "material-a", status: "approved" }],
      failedRows: [{
        rowId: "row-b",
        code: "duplicate_supplier_product_target",
        message: "Two selected rows resolve to the same Supplier Product.",
      }],
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/materials/imports/batch-1/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          reviews: [{ rowId: "row-a" }, { rowId: "row-b" }],
        }),
      }),
      { params: Promise.resolve({ batchId: "batch-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      approvedRows: [{ rowId: "row-a", materialId: "material-a", status: "approved" }],
      failedRows: [{
        rowId: "row-b",
        code: "duplicate_supplier_product_target",
        message: "Two selected rows resolve to the same Supplier Product.",
      }],
    });
  });

  it("keeps rejection response compatible", async () => {
    mocks.reject.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/materials/imports/batch-1/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject", rowIds: ["row-a"] }),
      }),
      { params: Promise.resolve({ batchId: "batch-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.reject).toHaveBeenCalledWith(expect.objectContaining({
      batchId: "batch-1",
      rowIds: ["row-a"],
    }));
  });

  it("does not expose an unknown database failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.approve.mockRejectedValue(new Error("duplicate key violates secret_constraint"));
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/materials/imports/batch-1/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve", reviews: [{ rowId: "row-a" }] }),
      }),
      { params: Promise.resolve({ batchId: "batch-1" }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Unable to review import rows. Refresh the import and try again.",
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
