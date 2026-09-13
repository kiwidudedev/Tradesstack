import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260809120000_add_material_supplier_product_foundation.sql"
);
const sql = readFileSync(migrationPath, "utf8");

describe("material Supplier Product Phase 1A migration", () => {
  it("adds the tenant-safe Supplier Product foundation", () => {
    expect(sql).toContain("create table public.organization_material_supplier_products");
    expect(sql).toContain("organization_material_supplier_products_org_material_fkey");
    expect(sql).toContain("organization_material_supplier_products_org_supplier_fkey");
    expect(sql).toContain("foreign key (organization_id, material_id)");
    expect(sql).toContain("foreign key (organization_id, supplier_id)");
    expect(sql).toContain("identity_status in ('confirmed', 'migrated_unverified', 'needs_review')");
    expect(sql).toContain("normalized_supplier_sku text generated always as");
    expect(sql).toContain("normalized_supplier_description text generated always as");
    expect(sql).toContain("normalized_supplier_unit text generated always as");
  });

  it("enforces RLS, material permissions, and non-destructive lifecycle access", () => {
    expect(sql).toContain("organization_material_supplier_products enable row level security");
    expect(sql).toContain("organization_material_supplier_products force row level security");
    expect(sql).toContain("'materials.view'");
    expect(sql).toContain("'materials.write'");
    expect(sql).toContain(
      "grant select, insert, update on public.organization_material_supplier_products to authenticated"
    );
    expect(sql).not.toContain(
      "grant select, insert, update, delete on public.organization_material_supplier_products"
    );
  });

  it("adds safe identity and preferred-product uniqueness", () => {
    expect(sql).toContain("organization_material_supplier_products_confirmed_sku_key");
    expect(sql).toContain("organization_material_supplier_products_confirmed_description_key");
    expect(sql).toContain("organization_material_supplier_products_preferred_key");
    expect(sql).toContain("where is_preferred = true");
    expect(sql).toContain("organization_material_supplier_products_preferred_state_check");
  });

  it("adds append-only material assignment history", () => {
    expect(sql).toContain(
      "create table public.organization_material_supplier_product_assignments"
    );
    expect(sql).toContain("organization_material_supplier_product_assignments_append_only");
    expect(sql).toContain("Supplier Product assignment history is append-only.");
    expect(sql).toContain(
      "grant select, insert on public.organization_material_supplier_product_assignments to authenticated"
    );
  });

  it("adds nullable price and import-result lineage without removing legacy fields", () => {
    expect(sql).toContain("add column supplier_product_id uuid null");
    expect(sql).toContain("add column import_row_id uuid null");
    expect(sql).toContain("add column supersedes_price_id uuid null");
    expect(sql).toContain("add column idempotency_key text null");
    expect(sql).toContain("add column observation_metadata jsonb null");
    expect(sql).toContain("add column approved_supplier_product_id uuid null");
    expect(sql).toContain("add column approved_supplier_price_id uuid null");
    expect(sql).toContain(
      "foreign key (organization_id, supplier_product_id, material_id, supplier_id)"
    );
    expect(sql).not.toMatch(/drop\s+(column|table)/i);
    expect(sql).not.toMatch(/alter\s+column\s+supplier_product_id\s+set\s+not\s+null/i);
  });

  it("does not backfill or change legacy price state", () => {
    expect(sql).not.toMatch(/update\s+public\.organization_material_supplier_prices/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.organization_material_supplier_products/i);
    expect(sql).not.toMatch(/alter\s+column\s+(is_current|is_preferred)/i);
  });
});
