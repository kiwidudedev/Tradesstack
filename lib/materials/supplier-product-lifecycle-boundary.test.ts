import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("lib/materials/service.ts", "utf8");
const actions = readFileSync("app/app/(workspace)/company/materials/actions.ts", "utf8");
const lifecycleMigration = readFileSync(
  "supabase/migrations/20260816130000_add_material_supplier_product_lifecycle.sql",
  "utf8",
);
const atomicMigration = readFileSync(
  "supabase/migrations/20260809150000_add_atomic_material_supplier_product_operations.sql",
  "utf8",
);

describe("Supplier Product lifecycle application boundary", () => {
  it("routes service operations through atomic RPC wrappers", () => {
    expect(service).toContain("export async function archiveSupplierProduct");
    expect(service).toContain("return archiveSupplierProductAtomic({");
    expect(service).toContain("export async function restoreSupplierProduct");
    expect(service).toContain("return restoreSupplierProductAtomic({");
    expect(service).toContain("export async function moveSupplierProduct");
    expect(service).toContain("return remapSupplierProductMaterialAtomic({");
    expect(service).not.toMatch(/organization_material_supplier_products"\)[\s\S]{0,160}\.(update|delete)\(/);
  });

  it("requires the existing write context in every server action", () => {
    for (const actionName of [
      "archiveMaterialSupplierProductAction",
      "restoreMaterialSupplierProductAction",
      "moveMaterialSupplierProductAction",
    ]) {
      const start = actions.indexOf(`export async function ${actionName}`);
      const next = actions.indexOf("export async function", start + 20);
      const body = actions.slice(start, next < 0 ? actions.length : next);
      expect(body).toContain("requireMaterialsWriteContext(params.organizationId)");
      expect(body).toContain("revalidateMaterialsPage()");
    }
  });

  it("serializes archive against price and preference writes", () => {
    expect(lifecycleMigration).toMatch(/organization_materials[\s\S]*?for update[\s\S]*?organization_material_supplier_products[\s\S]*?for update/);
    expect(atomicMigration).toMatch(/materials_phase1f_set_preferred_internal[\s\S]*?organization_materials[\s\S]*?for update[\s\S]*?organization_material_supplier_products[\s\S]*?for update/);
    expect(atomicMigration).toMatch(/materials_phase1f_add_price_internal[\s\S]*?organization_material_supplier_products[\s\S]*?for update[\s\S]*?supplier_product_inactive/);
    expect(lifecycleMigration).toMatch(/restore_material_supplier_product[\s\S]*?exception when unique_violation[\s\S]*?supplier_product_restore_identity_conflict/);
  });
});
