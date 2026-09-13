import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809150000_add_atomic_material_supplier_product_operations.sql", import.meta.url),
  "utf8"
);
const createIdempotencyMigration = readFileSync(
  new URL("../supabase/migrations/20260809151000_complete_atomic_material_create_idempotency.sql", import.meta.url),
  "utf8"
);

describe("Phase 1F atomic Supplier Product operations", () => {
  it.each([
    "create_supplier_product_with_initial_price",
    "add_supplier_product_price_version",
    "set_preferred_supplier_product",
    "remap_supplier_product_material",
    "approve_material_import_row",
  ])("defines %s as a security-definer JSON RPC", (name) => {
    expect(migration).toMatch(new RegExp(`function public\\.${name}\\(p_input jsonb\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`));
  });

  it("requires authenticated materials.write access in every public operation", () => {
    expect(migration.match(/materials_phase1f_require_writer\(v_org\)/g)).toHaveLength(5);
    expect(migration).toContain("has_org_permission(p_organization_id, 'materials.write')");
  });

  it("locks Supplier Products before price versioning and serializes preference by Material", () => {
    expect(migration).toMatch(/supplier_product_id = p_supplier_product_id[\s\S]*?for update/);
    expect(migration).toMatch(/organization_materials[\s\S]*?id = p_material_id[\s\S]*?for update/);
  });

  it("closes the prior price and preserves predecessor and legacy-current state atomically", () => {
    expect(migration).toMatch(/set is_current = false,[\s\S]*?effective_to = p_effective_from/);
    expect(migration).toContain("p_import_batch_id, p_import_row_id, v_current.id, v_key");
    expect(migration).toContain("v_product.is_preferred, true, p_source");
  });

  it("uses product-scoped idempotency and rejects changed retry payloads", () => {
    expect(migration).toContain("organization_material_supplier_prices_product_idempotency_key");
    expect(migration).toContain("and idempotency_key = v_key");
    expect(migration).toContain("materials_phase1f_error('idempotency_conflict')");
    expect(migration).toContain("materials_phase1f_error('price_interval_conflict')");
    expect(migration).toContain("'idempotent_replay', true");
  });

  it("rejects future and ambiguous backdated price writes during legacy read compatibility", () => {
    expect(migration).toContain("materials_phase1f_error('future_price_requires_read_cutover')");
    expect(migration).toContain("materials_phase1f_error('unsupported_backdated_price')");
  });

  it("creates product, assignment, and price in one PostgreSQL transaction", () => {
    expect(migration).toMatch(/insert into public\.organization_material_supplier_products[\s\S]*?insert into public\.organization_material_supplier_product_assignments[\s\S]*?materials_phase1f_add_price_internal/);
  });

  it("synchronizes preferred product and legacy current-price preference", () => {
    expect(migration).toMatch(/organization_material_supplier_products[\s\S]*?set is_preferred = false/);
    expect(migration).toMatch(/organization_material_supplier_prices[\s\S]*?set is_preferred = false/);
    expect(migration).toContain("'legacy_preferred_price_id', v_price_id");
  });

  it("preserves price facts by rejecting remaps for products with history", () => {
    expect(migration).toContain("materials_phase1f_error('remap_price_history_not_supported')");
    expect(migration).toContain("'operation', 'phase1f_remap'");
  });

  it("locks import rows and writes complete product, price, row, and batch provenance", () => {
    expect(migration).toMatch(/organization_material_import_rows[\s\S]*?for update/);
    expect(migration).toContain("approved_supplier_product_id = v_product_id");
    expect(migration).toContain("approved_supplier_price_id = v_price_id");
    expect(migration).toContain("v_batch.id, v_row.id");
  });

  it("makes approved import retries return the original result", () => {
    expect(migration).toMatch(/v_row\.status = 'approved'[\s\S]*?'idempotent_replay', true/);
  });

  it("makes exact create-operation retries return the original product and price", () => {
    expect(createIdempotencyMigration).toContain("v_existing_price.id is null");
    expect(createIdempotencyMigration).toContain("'created_product', false");
    expect(createIdempotencyMigration).toContain("exact create retry replays and changed retry rejects");
    expect(createIdempotencyMigration).toContain("materials_phase1f_error('idempotency_conflict')");
  });

  it("keeps privileged internals private and grants only public RPCs to authenticated", () => {
    expect(migration).toContain("revoke all on function public.materials_phase1f_add_price_internal");
    expect(migration).toContain("grant execute on function public.approve_material_import_row(jsonb) to authenticated");
    expect(migration).not.toMatch(/grant execute on function public\.materials_phase1f_.* to authenticated/);
  });

  it("does not apply supplier_product_id NOT NULL or revoke legacy table writes", () => {
    expect(migration).not.toMatch(/alter column supplier_product_id set not null/i);
    expect(migration).not.toMatch(/revoke .*organization_material_supplier_prices/i);
  });

  it("runs rollback-isolated database probes for all atomic operation boundaries", () => {
    expect(migration).toContain("phase1f_price_probe_rollback");
    expect(migration).toContain("phase1f_create_probe_rollback");
    expect(migration).toContain("phase1f_import_probe_rollback");
    expect(migration).toContain("unauthorized caller rejected");
    expect(migration).toContain("priced-product remap rejected");
  });
});
