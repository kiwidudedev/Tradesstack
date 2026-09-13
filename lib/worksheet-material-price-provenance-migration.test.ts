import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260816140000_add_worksheet_material_price_provenance.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("worksheet Material Price provenance migration", () => {
  it("creates append-preserving, organization-scoped evidence with forced RLS", () => {
    expect(migration).toContain("create table public.worksheet_material_price_bindings");
    expect(migration).toContain("binding_state in ('active', 'replaced', 'detached', 'removed')");
    expect(migration).toContain("worksheet_material_price_bindings_preserve_history");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("has_org_permission(organization_id, 'materials.view')");
    expect(migration).not.toMatch(/grant (insert|update|delete) on public\.worksheet_material_price_bindings/i);
  });

  it("reconciles as part of the sheet write transaction and validates the full source chain", () => {
    expect(migration).toMatch(
      /create trigger reconcile_worksheet_material_price_bindings_on_save\s+after insert or update of worksheet_data on public\.opportunity_pricing_workbook_sheets/,
    );
    expect(migration).toContain("worksheet_material_pricing:duplicate_binding_id");
    expect(migration).toContain("worksheet_material_pricing:invalid_binding_evidence");
    expect(migration).toContain("existing.workbook_id <> new.workbook_id");
    expect(migration).toContain("product.material_id is distinct from material.id");
    expect(migration).toContain("worksheet_material_pricing:materials_view_permission_required");
    expect(migration).toContain("resolve_material_supplier_product_prices");
    expect(migration).toContain("(active.cell_data->>'value')::numeric is distinct from price.unit_cost");
  });

  it("derives durable snapshots from canonical database rows", () => {
    expect(migration).toMatch(/price\.unit_cost,\s+price\.unit,\s+price\.currency/);
    expect(migration).toMatch(/material\.name,\s+supplier\.name/);
    expect(migration).toContain("price.effective_from,");
    expect(migration).not.toMatch(/inserted_unit_cost[\s\S]{0,120}v_snapshot->>'unitCost'/);
  });

  it("duplicates provenance with fresh identities inside the existing RPC transaction", () => {
    expect(migration).toContain("regenerate_worksheet_material_binding_ids");
    expect(migration).toContain("to_jsonb(gen_random_uuid()::text)");
    expect(migration).toMatch(
      /create or replace function public\.duplicate_opportunity_pricing_workbook[\s\S]*?v_parent_worksheet_data := public\.regenerate_worksheet_material_binding_ids/,
    );
    expect(migration).toMatch(/when v_sheet_record\.id = v_default_source_sheet\.id then v_parent_worksheet_data/);
  });

  it("has a zero-binding fast path and no per-binding client write API", () => {
    expect(migration).toContain("if not jsonb_path_exists(v_cells, '$.*.metadata.materialPricing')");
    expect(migration).toContain("return new;");
    expect(migration).toContain("revoke all on function public.reconcile_worksheet_material_price_bindings()");
    expect(migration).toMatch(/insert into public\.worksheet_material_price_bindings[\s\S]*?select[\s\S]*?from \(/);
  });
});
