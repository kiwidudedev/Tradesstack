import { beforeEach, describe, expect, it, vi } from "vitest";
import { materialUnitConversionContextFromImportRow } from "@/lib/materials/unit-conversion/import-row-context";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";
import { MaterialUnitConversionError } from "@/lib/materials/unit-conversion/errors";

const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  permission: vi.fn(),
  propose: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocks.member }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: mocks.permission }));
vi.mock("@/lib/materials/unit-conversion/convert", () => ({ proposeMaterialUnitConversion: mocks.propose }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = mocks.eq.mockImplementation(() => chain);
    chain.is = vi.fn(() => chain);
    chain.single = mocks.single;
    return { from: vi.fn(() => chain) };
  }),
}));

const sourceRow = {
  extracted_name: "Radiata timber",
  extracted_description: "Radiata SG8 H1.2 Dry Timber 90 x 45 x 6.0m",
  extracted_unit: "each",
  extracted_unit_cost: 48.75,
  extracted_currency: "NZD",
  reviewed_name: null,
  reviewed_supplier_description: null,
  reviewed_supplier_sku: null,
  supplier_description: "Radiata SG8 H1.2 Dry Timber 90 x 45 x 6.0m",
  supplier_sku: "2055895",
  source_payload: {
    priceOptions: [{ priceKey: "price-1", amount: { value: 48.75 }, currency: { value: "NZD" } }],
  },
};

describe("Material import row conversion context", () => {
  it("reconstructs the audited Radiata context from server-owned source payload", () => {
    const context = materialUnitConversionContextFromImportRow({
      extracted_name: "Radiata timber",
      extracted_description: "Radiata SG8 H1.2 Dry Timber 90 x 45 x 6.0m",
      extracted_unit: "each",
      extracted_unit_cost: 48.75,
      extracted_currency: "NZD",
      reviewed_name: null,
      reviewed_supplier_description: null,
      reviewed_supplier_sku: null,
      supplier_description: "Radiata SG8 H1.2 Dry Timber 90 x 45 x 6.0m",
      supplier_sku: "2055895",
      source_payload: {
        recommendedPriceKey: "price-1",
        priceOptions: [{
          priceKey: "price-1",
          label: { value: "Each (per length)" },
          amount: { value: 48.75, evidence: [{ excerpt: "$48.75 each" }] },
          currency: { value: "NZD" },
        }],
        canonicalRow: { supplierUnit: { value: "each" } },
        pack: { quantity: 1, unit: "each" },
        evidence: [{ excerpt: "90 x 45 x 6.0m" }],
      },
    }, "lm", null);

    expect(context).toMatchObject({
      supplierSku: "2055895",
      supplierUnit: "each",
      supplierUnitCost: 48.75,
      currency: "NZD",
      packQuantity: 1,
      packUnit: "each",
      requestedMaterialUnit: "lm",
      selectedPriceLabel: "Each (per length)",
    });
    expect(context.evidence.map((entry) => entry.text)).toContain("90 x 45 x 6.0m");
  });
});

describe("POST row-scoped Material unit conversion", () => {
  beforeEach(() => {
    mocks.member.mockReset().mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    mocks.permission.mockReset().mockResolvedValue(true);
    mocks.propose.mockReset().mockResolvedValue({ status: "convertible" });
    mocks.single.mockReset().mockResolvedValue({ data: { ...sourceRow, status: "pending_review", action: "pending" }, error: null });
    mocks.eq.mockClear();
  });

  it("requires an authenticated materials.write member", async () => {
    const { POST } = await import("./route");
    mocks.member.mockResolvedValueOnce(null);
    expect((await POST(new Request("http://localhost", { method: "POST", body: "{}" }), { params: Promise.resolve({ batchId: "batch-1", rowId: "row-1" }) })).status).toBe(401);
    mocks.permission.mockResolvedValueOnce(false);
    expect((await POST(new Request("http://localhost", { method: "POST", body: "{}" }), { params: Promise.resolve({ batchId: "batch-1", rowId: "row-1" }) })).status).toBe(403);
  });

  it("loads organization/batch/row-scoped source truth and returns a proposal only", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedMaterialUnit: "lm", selectedPriceKey: "price-1" }),
    }), { params: Promise.resolve({ batchId: "batch-1", rowId: "row-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("org-1", "materials.write");
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(mocks.eq).toHaveBeenCalledWith("import_batch_id", "batch-1");
    expect(mocks.eq).toHaveBeenCalledWith("id", "row-1");
    expect(mocks.propose).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ proposal: { status: "convertible" } });
  });

  it("server-loads active selected Material context and ignores client descriptions and prices", async () => {
    const selectedMaterial = {
      id: "material-gib",
      organization_id: "org-1",
      name: "GIB Fyreline® 13mm",
      description: "Fire-rated plasterboard sheet, 13mm thick, 2400mm x 1200mm",
      default_unit: "m2",
      category: null,
      is_active: true,
      archived_at: null,
      updated_at: "2026-08-15T00:38:29Z",
      metadata: null,
      ai_construction_intelligence: null,
    };
    mocks.single
      .mockResolvedValueOnce({ data: { ...sourceRow, status: "pending_review", action: "pending" }, error: null })
      .mockResolvedValueOnce({ data: selectedMaterial, error: null });
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestedMaterialUnit: "m2",
        selectedPriceKey: "price-1",
        selectedMaterialId: "material-gib",
        materialDescription: "FAKE 3000mm x 3000mm",
        sourcePrice: 1,
      }),
    }), { params: Promise.resolve({ batchId: "batch-1", rowId: "row-1" }) });
    expect(response.status).toBe(200);
    const conversionContext = mocks.propose.mock.calls[0][0];
    expect(conversionContext.supplierUnitCost).toBe(48.75);
    expect(conversionContext.evidence).toContainEqual(expect.objectContaining({
      id: "selected_material.description",
      text: selectedMaterial.description,
    }));
    expect(JSON.stringify(conversionContext)).not.toContain("FAKE 3000mm");
  });

  it.each([
    [{ data: null, error: { message: "not found" } }, "cross-organization"],
    [{ data: null, error: { message: "archived" } }, "archived"],
    [{ data: null, error: { message: "inactive" } }, "inactive"],
  ])("fails selected Material access closed (%s)", async (materialResult) => {
    mocks.single
      .mockResolvedValueOnce({ data: { ...sourceRow, status: "pending_review", action: "pending" }, error: null })
      .mockResolvedValueOnce(materialResult);
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedMaterialUnit: "m2", selectedPriceKey: "price-1", selectedMaterialId: "hidden-material" }),
    }), { params: Promise.resolve({ batchId: "batch-1", rowId: "row-1" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_context" });
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it("separates a genuine provider outage from semantic failures", async () => {
    const { POST } = await import("./route");
    mocks.propose.mockRejectedValueOnce(new DocumentIntelligenceError({
      code: "provider_timeout",
      message: "private provider detail",
      retryable: true,
    }));
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedMaterialUnit: "lm", selectedPriceKey: "price-1" }),
    }), { params: Promise.resolve({ batchId: "batch-1", rowId: "row-1" }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Unit conversion is temporarily unavailable.",
      code: "provider_unavailable",
    });
  });

  it("maps unsupported provider assumptions to unsafe_conversion rather than an outage", async () => {
    const { POST } = await import("./route");
    mocks.propose.mockRejectedValueOnce(new MaterialUnitConversionError(
      "unsafe_conversion",
      "private semantic detail",
    ));
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedMaterialUnit: "m2", selectedPriceKey: "price-1" }),
    }), { params: Promise.resolve({ batchId: "batch-1", rowId: "row-1" }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "TradesStack could not verify a safe conversion from the available product information.",
      code: "unsafe_conversion",
    });
  });
});
