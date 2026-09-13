import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const phase1A = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260809120000_add_material_supplier_product_foundation.sql"
  ),
  "utf8"
);
const phase1E = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260809140000_harden_material_supplier_product_relationships.sql"
  ),
  "utf8"
);
const service = readFileSync(resolve(process.cwd(), "lib/materials/service.ts"), "utf8");
const audit = readFileSync(
  resolve(process.cwd(), "scripts/audit-material-relationship-hardening-phase1e.mjs"),
  "utf8"
);

describe("material Supplier Product Phase 1E relationship hardening", () => {
  it("retains tenant-safe product material and supplier relationships", () => {
    expect(phase1A).toContain("organization_material_supplier_products_org_material_fkey");
    expect(phase1A).toContain("foreign key (organization_id, material_id)");
    expect(phase1A).toContain("organization_material_supplier_products_org_supplier_fkey");
    expect(phase1A).toContain("foreign key (organization_id, supplier_id)");
  });

  it("directly hardens legacy price material and supplier tenant ownership", () => {
    expect(phase1E).toContain("material_prices_org_material_fkey");
    expect(phase1E).toContain("material_prices_org_supplier_fkey");
    expect(phase1E).toContain("validate constraint material_prices_org_material_fkey");
    expect(phase1E).toContain("validate constraint material_prices_org_supplier_fkey");
  });

  it("retains price/product material and supplier equality enforcement", () => {
    expect(phase1A).toContain(
      "foreign key (organization_id, supplier_product_id, material_id, supplier_id)"
    );
    expect(phase1A).toContain("organization_material_supplier_products_price_identity_key");
  });

  it("makes cross-product and cross-organization predecessors impossible", () => {
    expect(phase1E).toContain("organization_material_supplier_prices_product_chain_key");
    expect(phase1E).toContain("material_prices_same_product_predecessor_fkey");
    expect(phase1E).toContain(
      "foreign key (organization_id, supplier_product_id, supersedes_price_id)"
    );
    expect(phase1A).toContain("organization_material_supplier_prices_no_self_supersession_check");
  });

  it("hardens import batch, row, material, and supplier tenant relationships", () => {
    expect(phase1E).toContain("material_prices_org_batch_fkey");
    expect(phase1E).toContain("material_import_batches_org_supplier_fkey");
    expect(phase1E).toContain("material_import_rows_org_batch_fkey");
    expect(phase1E).toContain("material_import_rows_org_material_fkey");
    expect(phase1A).toContain("organization_material_supplier_prices_import_row_fkey");
    expect(phase1A).toContain("organization_material_import_rows_approved_product_fkey");
    expect(phase1A).toContain("organization_material_import_rows_approved_price_fkey");
  });

  it("preserves append-only assignment tenant relationships", () => {
    expect(phase1A).toContain("organization_material_supplier_product_assignments_product_fkey");
    expect(phase1A).toContain("organization_material_supplier_product_assignments_previous_material_fkey");
    expect(phase1A).toContain("organization_material_supplier_product_assignments_new_material_fkey");
    expect(phase1A).toContain("organization_material_supplier_product_assignments_import_row_fkey");
    expect(phase1A).toContain("organization_material_supplier_product_assignments_append_only");
  });

  it("keeps preferred-product and confirmed identity uniqueness intact", () => {
    expect(phase1A).toContain("organization_material_supplier_products_preferred_key");
    expect(phase1A).toContain("organization_material_supplier_products_confirmed_sku_key");
    expect(phase1A).toContain("organization_material_supplier_products_confirmed_description_key");
    expect(phase1E).not.toMatch(/update\s+public\.organization_material_supplier_products\s+set\s+identity_status/i);
  });

  it("defers NOT NULL because current direct writers omit supplier_product_id", () => {
    const payloadStart = service.indexOf("const payload: OrganizationMaterialSupplierPriceInsert");
    const payloadEnd = service.indexOf("const { data, error }", payloadStart);
    const payload = service.slice(payloadStart, payloadEnd);
    expect(payload).not.toContain("supplier_product_id");
    expect(phase1E).not.toMatch(/alter\s+column\s+supplier_product_id\s+set\s+not\s+null/i);
  });

  it("retains material permission RLS without revoking current writes", () => {
    expect(phase1A).toContain("organization_material_supplier_products force row level security");
    expect(phase1A).toContain("organization_material_supplier_product_assignments force row level security");
    expect(phase1A).toContain("'materials.view'");
    expect(phase1A).toContain("'materials.write'");
    expect(phase1E).not.toMatch(/revoke\s+(insert|update|delete).*organization_material_supplier_prices/i);
  });

  it("contains rollback-safe database negative probes for every required invalid relationship", () => {
    expect(phase1E).toContain("cross-organization product/material rejected");
    expect(phase1E).toContain("cross-organization product/supplier rejected");
    expect(phase1E).toContain("cross-organization price/product rejected");
    expect(phase1E).toContain("price/product material mismatch rejected");
    expect(phase1E).toContain("price/product supplier mismatch rejected");
    expect(phase1E).toContain("cross-product predecessor rejected");
    expect(phase1E).toContain("cross-organization predecessor rejected");
    expect(phase1E).toContain("self-referencing predecessor rejected");
    expect(phase1E).toContain("duplicate preferred product rejected");
    expect(phase1E).toContain("cross-tenant assignment material rejected");
    expect(phase1E).toContain("cross-tenant import batch/supplier rejected");
    expect(phase1E).toContain("cross-tenant approved product rejected");
    expect(phase1E).toContain("cross-tenant approved price rejected");
  });

  it("provides a read-only postdeployment relationship and preservation audit", () => {
    expect(audit).toContain("product_material_violations");
    expect(audit).toContain("price_product_material_mismatches");
    expect(audit).toContain("predecessor_cross_product_violations");
    expect(audit).toContain("assignment_new_material_violations");
    expect(audit).toContain("approved_product_violations");
    expect(audit).toContain("legacy_price_fact_hash_matches");
    expect(audit).not.toMatch(/\.from\([^)]*\)\s*\.(insert|upsert|update|delete)\s*\(/);
  });
});
