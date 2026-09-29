import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
const importService = readFileSync(new URL("./import-service.ts", import.meta.url), "utf8");
const actions = readFileSync(
  new URL("../../app/app/(workspace)/company/materials/actions.ts", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL(
    "../../app/app/(workspace)/company/materials/CompanyMaterialsWorkspace.tsx",
    import.meta.url,
  ),
  "utf8",
);
const generatedTypes = readFileSync(new URL("../supabase/types.ts", import.meta.url), "utf8");
const classificationMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260615150000_add_material_classification_foundations.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Phase 1G.2 local price completion", () => {
  it("returns the atomic RPC result without a blocking post-commit price read", () => {
    const addPriceBody = service.slice(
      service.indexOf("export async function addSupplierPrice"),
      service.indexOf("export async function makeSupplierPricePreferred"),
    );

    expect(addPriceBody).toContain("const atomicResult = await writeSupplierPriceAtomic({");
    expect(addPriceBody).toContain("return atomicResult;");
    expect(addPriceBody).not.toContain('.from("organization_material_supplier_prices")');
  });

  it("accepts the preference RPC's legacy_preferred_price_id response contract", () => {
    const adapter = readFileSync(new URL("./atomic-rpc.ts", import.meta.url), "utf8");
    expect(adapter).toContain("row.price_id ?? row.legacy_preferred_price_id");
  });

  it("returns a small serializable completion contract from the server action", () => {
    expect(actions).toContain("supplierProductId: result.supplierProductId");
    expect(actions).toContain("priceId: result.priceId");
    expect(actions).toContain("supersedesPriceId: result.supersedesPriceId");
    expect(actions).toContain("idempotentReplay: result.idempotentReplay");
  });

  it("guards duplicate submits and deterministically closes, resets, refreshes, and clears pending", () => {
    const handler = workspace.slice(
      workspace.indexOf("async function handleAddSupplierPrice"),
      workspace.indexOf("function handleOpenUpdateSupplierPrice"),
    );

    expect(handler).toContain("if (!selectedMaterial || isSavingSupplierPrice)");
    expect(handler).toContain("setIsSavingSupplierPrice(true)");
    expect(handler).toContain("setIsAddPriceOpen(false)");
    expect(handler).toContain("supplierPriceOperationIdRef.current = crypto.randomUUID()");
    expect(handler).toContain("setSupplierPriceForm(emptyPriceForm(initialData.companyCurrency))");
    expect(handler).toContain("router.refresh()");
    expect(handler).toContain("finally");
    expect(handler).toContain("setIsSavingSupplierPrice(false)");
    expect(workspace).toContain('disabled={isSavingSupplierPrice}');
    expect(workspace).toContain('? "Saving..."');
    expect(workspace).toContain('{error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}');

    expect(handler.indexOf("setIsAddPriceOpen(false)")).toBeLessThan(
      handler.lastIndexOf("router.refresh()"),
    );
  });

  it("keeps the same operation id for the active request and rotates it only after success", () => {
    const handler = workspace.slice(
      workspace.indexOf("async function handleAddSupplierPrice"),
      workspace.indexOf("function handleOpenUpdateSupplierPrice"),
    );
    expect(handler).toContain("operationId: supplierPriceOperationIdRef.current");
    expect(handler.indexOf("if (!result.ok)")).toBeLessThan(
      handler.indexOf("supplierPriceOperationIdRef.current = crypto.randomUUID()"),
    );
  });
});

describe("Phase 1G.2 import classification schema alignment", () => {
  it("persists only the established classified_* import-row snapshot", () => {
    expect(importService).not.toMatch(/\bmaterial_classification\s*:/);
    expect(importService).toContain("materialClassification: classified.classification");
    expect(importService).toContain("importRowPatch:");
    expect(importService).toContain("...classification.importRowPatch");
    expect(importService).toContain("classified_work_type:");
    expect(importService).toContain("classified_final_classification:");
    expect(importService).toContain("classified_organization_cost_code_id:");
  });

  it("matches both the generated schema and the existing additive classification migration", () => {
    expect(generatedTypes).not.toMatch(/^\s+material_classification:/m);
    expect(generatedTypes).toContain("classified_final_classification: Json | null");
    expect(classificationMigration).toContain("add column if not exists classified_work_type");
    expect(classificationMigration).toContain("add column if not exists classified_final_classification jsonb null");
    expect(classificationMigration).not.toContain("material_classification");
  });

  it("keeps approval atomic and skip/reject as staging-only mutations", () => {
    expect(importService).toContain("await approveMaterialImportRowAtomic({");
    expect(importService).toContain('action: "skip"');
    expect(importService).toContain('status: "rejected"');
    expect(importService).not.toMatch(
      /from\("organization_material_supplier_prices"\)[\s\S]{0,240}\.(insert|update|delete)\(/,
    );
    expect(importService).not.toMatch(
      /from\("organization_material_supplier_products"\)[\s\S]{0,240}\.(insert|update|delete)\(/,
    );
  });
});
