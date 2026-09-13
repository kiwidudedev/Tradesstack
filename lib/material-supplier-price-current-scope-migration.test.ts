import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260816120000_scope_current_supplier_prices_to_supplier_product.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Supplier Price current identity scope migration", () => {
  it("fails closed on every existing price-history integrity violation", () => {
    expect(migration).toContain("materials_current_price_scope:invalid_effective_windows");
    expect(migration).toContain("materials_current_price_scope:multiple_current_prices");
    expect(migration).toContain("materials_current_price_scope:overlapping_intervals");
    expect(migration).toContain("materials_current_price_scope:broken_supersession");
    expect(migration).toContain("materials_current_price_scope:orphan_supplier_product");
  });

  it("replaces only the legacy tuple key with a product-scoped current key", () => {
    expect(migration).toContain(
      "drop index if exists public.organization_material_supplier_prices_current_key",
    );
    expect(migration).toMatch(
      /create unique index organization_material_supplier_prices_current_product_key\s+on public\.organization_material_supplier_prices \(organization_id, supplier_product_id\)\s+where is_current = true/,
    );
    expect(migration).not.toContain("drop trigger organization_material_supplier_prices_interval_guard");
    expect(migration).not.toContain("drop constraint organization_material_supplier_prices_effective_window_check");
  });

  it("keeps the half-open interval guard authoritative", () => {
    expect(migration).toContain("organization_material_supplier_prices_interval_guard");
    expect(migration).toContain("pg_catalog.strpos(v_function_definition, 'tstzrange')");
    expect(migration).toContain("pg_catalog.strpos(v_function_definition, '''[)''')");
    expect(migration).toContain("materials_current_price_scope:interval_guard_missing_or_changed");
  });

  it("returns explicit equal-start, current-identity, overlap, and generic constraint errors", () => {
    expect(migration).toContain("materials_phase1f_error('price_effective_start_conflict')");
    expect(migration).toContain("materials_phase1f_error('current_price_identity_conflict')");
    expect(migration).toContain("materials_phase1f_error('price_interval_conflict')");
    expect(migration).toContain("materials_phase1f_error('constraint_failure')");
    expect(migration).toContain("get stacked diagnostics v_constraint_name = CONSTRAINT_NAME");
  });

  it("contains rollback-isolated live proofs for distinct products and timeline protection", () => {
    expect(migration).toContain("GIB Standard 13mm [scope proof ");
    expect(migration).toContain("GIB Fyreline 13mm [scope proof ");
    expect(migration).toContain("materials_current_price_scope:distinct_product_contract_failed");
    expect(migration).toContain("materials_current_price_scope:same_product_current_not_rejected");
    expect(migration).toContain("materials_current_price_scope:true_overlap_not_rejected");
    expect(migration).toContain("materials_current_price_scope:version_handoff_failed");
    expect(migration).toContain("materials_current_price_scope:rollback_live_contract");
    expect(migration).toContain("exception when sqlstate 'P0002'");
  });
});
