import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260809170000_finalize_material_catalogue_hardening.sql"),
  "utf8"
);
const nullAuthorityMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260809171000_preserve_supplier_product_not_null_authority.sql"),
  "utf8"
);
const service = readFileSync(resolve(process.cwd(), "lib/materials/service.ts"), "utf8");
const atomicAdapter = readFileSync(resolve(process.cwd(), "lib/materials/atomic-rpc.ts"), "utf8");

describe("Materials Phase 1I final catalogue hardening", () => {
  it("makes Supplier Product lineage mandatory after a null-row gate", () => {
    expect(migration).toContain("where supplier_product_id is null");
    expect(migration).toMatch(/alter column supplier_product_id set not null/i);
    expect(nullAuthorityMigration).toContain("if new.supplier_product_id is null then");
    expect(nullAuthorityMigration).toContain("return new;");
  });

  it("keeps effective intervals strictly half-open and non-empty", () => {
    expect(migration).toContain("effective_to > effective_from");
    expect(migration).toContain("tstzrange(price.effective_from, price.effective_to, '[)')");
  });

  it("serializes interval changes and rejects overlaps in the database", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("organization_material_supplier_prices_interval_guard");
    expect(migration).toContain("materials_phase1i:effective_price_interval_overlap");
  });

  it("makes observation facts immutable while retaining lifecycle updates", () => {
    expect(migration).toContain("organization_material_supplier_prices_immutable_facts");
    for (const field of [
      "supplier_product_id", "supplier_sku", "supplier_description", "unit",
      "unit_cost", "currency", "source", "import_batch_id", "import_row_id",
    ]) expect(migration).toContain(`new.${field} is distinct from old.${field}`);
    expect(migration).not.toContain("new.effective_to is distinct from old.effective_to");
    expect(migration).not.toContain("new.is_current is distinct from old.is_current");
  });

  it("revokes authenticated commercial mutation and latent write policies", () => {
    expect(migration).toMatch(/revoke insert, update, delete\s+on public\.organization_material_supplier_products/i);
    expect(migration).toMatch(/revoke insert, update, delete\s+on public\.organization_material_supplier_prices/i);
    expect(migration).toContain("authenticated_direct_mutation_grant_remains");
  });

  it("retains compatibility columns as non-authoritative caches", () => {
    expect(migration).toContain("Legacy compatibility cache maintained by atomic writers");
    expect(migration).toContain("Legacy compatibility cache synchronized from Supplier Product preference");
    expect(migration).not.toMatch(/drop column\s+(?:if exists\s+)?is_(?:current|preferred)/i);
  });

  it("does not use is_current as the service-layer preference gate", () => {
    const preferredHelper = service.slice(service.indexOf("export async function makeSupplierPricePreferred"));
    expect(preferredHelper).not.toContain("currentPrice.is_current");
    expect(preferredHelper).toContain("supplier_product_id");
  });

  it("does not infer existing Product identity from a legacy tuple", () => {
    expect(atomicAdapter).toContain("if (!params.supplierProductId) return null");
    expect(atomicAdapter).not.toContain("Multiple Supplier Products match this Material");
  });
});
