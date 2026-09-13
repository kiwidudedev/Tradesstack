import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  archiveSupplierProductAtomic,
  approveMaterialImportRowAtomic,
  getMaterialAtomicRpcErrorCode,
  remapSupplierProductMaterialAtomic,
  resolveSupplierProductForPrice,
  restoreSupplierProductAtomic,
  setPreferredSupplierProductAtomic,
  translateMaterialAtomicRpcError,
  writeSupplierPriceAtomic,
} from "@/lib/materials/atomic-rpc";
import type { MaterialsSupabaseClient } from "@/lib/materials/types";

const product = {
  id: "product-1",
  organization_id: "org-1",
  material_id: "material-1",
  supplier_id: "supplier-1",
  supplier_unit: "ea",
  normalized_supplier_unit: "ea",
  normalized_supplier_sku: "sku-1",
  normalized_supplier_description: "description",
  is_active: true,
  archived_at: null,
};

function createClient(products = [product]) {
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === "archive_material_supplier_product"
        ? { supplier_product_id: "product-1", material_id: "material-1", is_active: false, is_preferred: false, archived_at: "2026-08-16T00:00:00Z", idempotent_replay: false }
        : name === "restore_material_supplier_product"
          ? { supplier_product_id: "product-1", material_id: "material-1", is_active: true, is_preferred: false, archived_at: null, idempotent_replay: false }
          : name === "remap_supplier_product_material"
            ? { supplier_product_id: "product-1", previous_material_id: "material-1", new_material_id: "material-2", no_op: false }
      : name === "set_preferred_supplier_product"
        ? {
            supplier_product_id: "product-1",
            legacy_preferred_price_id: "price-1",
          }
        : {
            material_id: "material-1",
            supplier_product_id: "product-1",
            price_id: "price-2",
            supersedes_price_id: "price-1",
            idempotent_replay: false,
          },
    error: null,
  }));

  const from = vi.fn(() => {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      }),
      is: vi.fn(() => builder),
      then: (resolve: (value: unknown) => unknown) => {
        const rows = products.filter((row) =>
          filters.every(([column, value]) => row[column as keyof typeof row] === value)
        );
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return builder;
  });

  return {
    supabase: { rpc, from } as unknown as MaterialsSupabaseClient,
    rpc,
  };
}

describe("Phase 1G material atomic RPC adapter", () => {
  it("uses atomic archive and restore lifecycle RPCs", async () => {
    const { supabase, rpc } = createClient();
    await expect(archiveSupplierProductAtomic({
      supabase,
      organizationId: "org-1",
      materialId: "material-1",
      supplierProductId: "product-1",
      reason: "No longer supplied",
    })).resolves.toMatchObject({ isActive: false, isPreferred: false });
    await expect(restoreSupplierProductAtomic({
      supabase,
      organizationId: "org-1",
      materialId: "material-1",
      supplierProductId: "product-1",
    })).resolves.toMatchObject({ isActive: true, isPreferred: false });
    expect(rpc).toHaveBeenCalledWith("archive_material_supplier_product", {
      p_input: expect.objectContaining({ reason: "No longer supplied" }),
    });
    expect(rpc).toHaveBeenCalledWith("restore_material_supplier_product", {
      p_input: expect.objectContaining({ supplier_product_id: "product-1" }),
    });
  });

  it("reuses the safe remap RPC", async () => {
    const { supabase, rpc } = createClient();
    await expect(remapSupplierProductMaterialAtomic({
      supabase,
      organizationId: "org-1",
      supplierProductId: "product-1",
      newMaterialId: "material-2",
      reason: "Incorrect match",
    })).resolves.toMatchObject({ newMaterialId: "material-2", noOp: false });
    expect(rpc).toHaveBeenCalledWith("remap_supplier_product_material", {
      p_input: expect.objectContaining({ new_material_id: "material-2" }),
    });
  });
  it("targets an existing Supplier Product for a new price version", async () => {
    const { supabase, rpc } = createClient();
    await writeSupplierPriceAtomic({
      supabase,
      organizationId: "org-1",
      materialId: "material-1",
      supplierId: "supplier-1",
      supplierProductId: "product-1",
      unit: "EA",
      unitCost: 12,
      idempotencyKey: "request-1",
    });
    expect(rpc).toHaveBeenCalledWith("add_supplier_product_price_version", {
      p_input: expect.objectContaining({
        supplier_product_id: "product-1",
        idempotency_key: "request-1",
      }),
    });
  });

  it("creates a Supplier Product and initial price when no product exists", async () => {
    const { supabase, rpc } = createClient([]);
    await writeSupplierPriceAtomic({
      supabase,
      organizationId: "org-1",
      materialId: "material-1",
      supplierId: "supplier-1",
      supplierDescription: "New product",
      unit: "ea",
      unitCost: 12,
      idempotencyKey: "request-2",
    });
    expect(rpc).toHaveBeenCalledWith("create_supplier_product_with_initial_price", {
      p_input: expect.objectContaining({
        supplier_description: "New product",
        supplier_unit: "ea",
      }),
    });
  });

  it("does not infer an existing Product from material, supplier, and unit", async () => {
    const { supabase } = createClient([
      product,
      { ...product, id: "product-2", normalized_supplier_sku: "sku-2" },
    ]);
    await expect(resolveSupplierProductForPrice({
      supabase,
      organizationId: "org-1",
      materialId: "material-1",
      supplierId: "supplier-1",
      unit: "ea",
    })).resolves.toBeNull();
  });

  it("uses the atomic preference RPC", async () => {
    const { supabase, rpc } = createClient();
    const result = await setPreferredSupplierProductAtomic({
      supabase,
      organizationId: "org-1",
      materialId: "material-1",
      supplierProductId: "product-1",
    });
    expect(rpc).toHaveBeenCalledWith("set_preferred_supplier_product", {
      p_input: expect.objectContaining({ supplier_product_id: "product-1" }),
    });
    expect(result).toMatchObject({
      supplierProductId: "product-1",
      priceId: "price-1",
      legacyPreferredPriceId: "price-1",
    });
  });

  it("uses row-stable import idempotency and complete reviewed provenance", async () => {
    const { supabase, rpc } = createClient();
    await approveMaterialImportRowAtomic({
      supabase,
      organizationId: "org-1",
      importRowId: "row-1",
      materialId: "material-1",
      supplierProductId: "product-1",
      materialName: "Timber",
      materialUnit: "lm",
      supplierUnit: "lm",
      unitCost: 5,
    });
    expect(rpc).toHaveBeenCalledWith("approve_material_import_row", {
      p_input: expect.objectContaining({
        import_row_id: "row-1",
        material_id: "material-1",
        supplier_product_id: "product-1",
        idempotency_key: "import-row:row-1",
      }),
    });
  });

  it("passes the reviewed tax basis and immutable comparison snapshot to atomic import approval", async () => {
    const { supabase, rpc } = createClient();
    await approveMaterialImportRowAtomic({
      supabase,
      organizationId: "org-1",
      importRowId: "inclusive-row",
      materialId: "material-1",
      supplierProductId: "product-1",
      materialName: "GIB Fyreline",
      materialUnit: "m2",
      supplierUnit: "sheet",
      unitCost: 78.8,
      taxSnapshot: {
        sourceTaxBasis: "inclusive",
        sourceTaxRate: null,
        taxJurisdictionCode: "NEW ZEALAND",
        comparisonTaxBasis: "exclusive",
        comparisonTaxRate: 15,
        taxPolicySnapshot: {
          policyId: "policy-1",
          taxName: "GST",
          supportsInclusiveExclusive: true,
        },
        taxEvidence: {
          confirmationSource: "user_confirmed",
          actorUserId: "user-1",
        },
      },
    });

    expect(rpc).toHaveBeenCalledWith("approve_material_import_row", {
      p_input: expect.objectContaining({
        import_row_id: "inclusive-row",
        unit_cost: 78.8,
        observation_metadata: {
          tax_snapshot: expect.objectContaining({
            sourceTaxBasis: "inclusive",
            taxJurisdictionCode: "NEW ZEALAND",
            comparisonTaxBasis: "exclusive",
            comparisonTaxRate: 15,
          }),
        },
      }),
    });
  });

  it("passes separate source and Material units plus a user-confirmed ratio to atomic approval", async () => {
    const { supabase, rpc } = createClient();
    await approveMaterialImportRowAtomic({
      supabase,
      organizationId: "org-1",
      importRowId: "radiata-row",
      materialName: "Radiata timber",
      materialUnit: "lm",
      supplierUnit: "each",
      unitCost: 48.75,
      currency: "NZD",
      confirmedUnitConversion: {
        supplierQuantity: 1,
        supplierUnit: "each",
        materialQuantity: 6,
        materialUnit: "lm",
        convertedUnitCost: 8.125,
        currency: "NZD",
        contractVersion: "material_unit_conversion_v2",
        source: "user_confirmed_ai",
        explanation: "One six metre supplier length.",
        confidence: 0.98,
        selectedMaterialId: "material-1",
        selectedMaterialUpdatedAt: "2026-08-15T00:38:29Z",
        contextHash: "context-hash",
        basis: "supplier_source",
        evidenceRefs: ["supplier.description"],
        evidenceSummary: "Supplier description states a six metre length.",
        promptVersion: "material_unit_conversion_prompt_v2",
        additionalInformation: null,
      },
    });
    expect(rpc).toHaveBeenCalledWith("approve_material_import_row", {
      p_input: expect.objectContaining({
        material_unit: "lm",
        supplier_unit: "each",
        unit_cost: 48.75,
        unit_conversion: expect.objectContaining({
          supplier_quantity: 1,
          supplier_unit: "each",
          material_quantity: 6,
          material_unit: "lm",
          converted_unit_cost: 8.125,
          contract_version: "material_unit_conversion_v2",
          proposal_metadata: expect.objectContaining({
            context_hash: "context-hash",
            selected_material_id: "material-1",
            basis: "supplier_source",
            evidence_refs: ["supplier.description"],
            prompt_version: "material_unit_conversion_prompt_v2",
          }),
        }),
      }),
    });
  });

  it("translates stable database error codes", () => {
    expect(
      translateMaterialAtomicRpcError(
        { message: "materials_phase1f:idempotency_conflict" } as never,
        "fallback"
      ).message
    ).toContain("already used with different price details");
    expect(
      translateMaterialAtomicRpcError(
        { message: "materials_phase1f:organization_mismatch" } as never,
        "fallback"
    ).message
    ).toContain("another organization");
  });

  it.each([
    ["price_interval_conflict", "conflicting price interval"],
    ["current_price_identity_conflict", "current price already exists"],
    ["price_effective_start_conflict", "cannot start at the same time"],
    ["constraint_failure", "catalogue constraints changed"],
  ])("classifies %s without exposing SQL", (code, message) => {
    const error = translateMaterialAtomicRpcError(
      { message: `materials_phase1f:${code}` } as never,
      "fallback",
    );
    expect(error.message).toContain(message);
    expect(getMaterialAtomicRpcErrorCode(error)).toBe(code);
    expect(error.message).not.toContain("organization_material_supplier_prices");
  });

  it("contains no active direct price mutations after cutover", () => {
    const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
    const imports = readFileSync(new URL("./import-service.ts", import.meta.url), "utf8");
    expect(service).not.toMatch(/from\("organization_material_supplier_prices"\)[\s\S]{0,180}\.(insert|update|delete)\(/);
    expect(imports).not.toMatch(/from\("organization_material_supplier_prices"\)[\s\S]{0,180}\.(insert|update|delete)\(/);
    expect(imports).toContain("approveMaterialImportRowAtomic");
    expect(imports).not.toContain("await addSupplierPrice(");
  });

  it("keeps compatibility entry points while routing them through the adapter", () => {
    const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
    const actions = readFileSync(
      new URL("../../app/app/(workspace)/company/materials/actions.ts", import.meta.url),
      "utf8"
    );
    const workspace = readFileSync(
      new URL(
        "../../app/app/(workspace)/company/materials/CompanyMaterialsWorkspace.tsx",
        import.meta.url
      ),
      "utf8"
    );
    expect(service).toContain("const atomicResult = await writeSupplierPriceAtomic({");
    expect(service).toContain("await setPreferredSupplierProductAtomic({");
    expect(actions).toContain("idempotencyKey: params.operationId");
    expect(workspace).toContain("supplierProductId: supplierPriceForm.supplierProductId || null");
    expect(workspace).toContain("supplierPriceOperationIdRef.current");
  });
});
