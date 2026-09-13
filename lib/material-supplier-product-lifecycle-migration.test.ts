import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260816130000_add_material_supplier_product_lifecycle.sql", import.meta.url),
  "utf8",
);

describe("Supplier Product lifecycle migration", () => {
  it("creates append-only organization-scoped lifecycle history", () => {
    expect(migration).toContain("create table public.organization_material_supplier_product_lifecycle_events");
    expect(migration).toContain("event_type in ('archived', 'restored')");
    expect(migration).toContain("organization_material_supplier_product_lifecycle_events_append_only");
    expect(migration).toContain("before update or delete");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("has_org_permission(organization_id, 'materials.view')");
    expect(migration).toContain("grant select on public.organization_material_supplier_product_lifecycle_events to authenticated");
    expect(migration).not.toMatch(/grant (insert|update|delete).*lifecycle_events/i);
  });

  it("archives atomically without mutating commercial history", () => {
    expect(migration).toMatch(/archive_material_supplier_product[\s\S]*?organization_materials[\s\S]*?for update[\s\S]*?organization_material_supplier_products[\s\S]*?for update/);
    expect(migration).toContain("supplier_product_archive_reason_required");
    expect(migration).toContain("set is_active = false");
    expect(migration).toContain("is_preferred = false");
    expect(migration).toContain("'archived'");
    expect(migration).not.toMatch(/delete from public\.organization_material_supplier_(prices|product_unit_conversions)/i);
    expect(migration).not.toMatch(/update public\.organization_material_supplier_prices[\s\S]*?(unit_cost|effective_from|effective_to)\s*=/i);
  });

  it("restores nonpreferred and rejects exact active identity conflicts", () => {
    expect(migration).toContain("supplier_product_restore_identity_conflict");
    expect(migration).toMatch(/restore_material_supplier_product[\s\S]*?set is_active = true,[\s\S]*?is_preferred = false,[\s\S]*?archived_at = null/);
    expect(migration).toContain("'restored'");
  });

  it("keeps lifecycle writes behind security-definer RPCs", () => {
    expect(migration).toMatch(/function public\.archive_material_supplier_product\(p_input jsonb\)[\s\S]*?security definer/);
    expect(migration).toMatch(/function public\.restore_material_supplier_product\(p_input jsonb\)[\s\S]*?security definer/);
    expect(migration.match(/materials_phase1f_require_writer\(v_org\)/g)).toHaveLength(2);
    expect(migration).toContain("grant execute on function public.archive_material_supplier_product(jsonb) to authenticated");
    expect(migration).toContain("grant execute on function public.restore_material_supplier_product(jsonb) to authenticated");
  });
});
