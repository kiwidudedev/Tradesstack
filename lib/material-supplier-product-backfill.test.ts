import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error The controlled Node migration helper is intentionally plain ESM.
const library = await import("../scripts/material-supplier-product-backfill-lib.mjs");
const {
  assertTenantIntegrity,
  buildSupplierProductPlan,
  changedPriceIds,
  pricePreservationSnapshot,
} = library;

type PriceRow = Record<string, unknown> & { id: string };

function price(overrides: Partial<PriceRow> = {}): PriceRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    organization_id: "org-1",
    material_id: "material-1",
    supplier_id: "supplier-1",
    supplier_sku: "SKU-1",
    supplier_description: "Product one",
    unit: "Sheet",
    unit_cost: 10,
    currency: "NZD",
    is_current: true,
    is_preferred: true,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: null,
    source: "manual",
    import_batch_id: null,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    supplier_product_id: null,
    import_row_id: null,
    supersedes_price_id: null,
    ...overrides,
  };
}

describe("material Supplier Product Phase 1C backfill", () => {
  it("turns clean one-SKU history into one migrated product", () => {
    const plan = buildSupplierProductPlan([price()]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].product.identity_status).toBe("migrated_unverified");
    expect(plan.groups[0].product.supplier_sku).toBe("SKU-1");
  });

  it("does not duplicate a product for repeated price versions", () => {
    const plan = buildSupplierProductPlan([
      price(),
      price({
        id: "00000000-0000-4000-8000-000000000002",
        unit_cost: 12,
        is_current: false,
        effective_from: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].source_price_ids).toHaveLength(2);
  });

  it("keeps description changes with a stable SKU in one product and uses the latest", () => {
    const plan = buildSupplierProductPlan([
      price({ supplier_description: "Old description" }),
      price({
        id: "00000000-0000-4000-8000-000000000002",
        supplier_description: "New description",
        effective_from: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].product.supplier_description).toBe("New description");
  });

  it("keeps separate SKU groups separate", () => {
    const plan = buildSupplierProductPlan([
      price({ supplier_sku: "SKU-1" }),
      price({
        id: "00000000-0000-4000-8000-000000000002",
        supplier_sku: "SKU-2",
      }),
    ]);
    expect(plan.groups).toHaveLength(2);
    expect(plan.counts.multi_sku_split_series).toBe(1);
  });

  it("creates one no-SKU product for no-SKU history", () => {
    const plan = buildSupplierProductPlan([
      price({ supplier_sku: null, supplier_description: "Descriptive identity" }),
      price({
        id: "00000000-0000-4000-8000-000000000002",
        supplier_sku: " ",
        supplier_description: "Descriptive identity",
      }),
    ]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].product.identity_status).toBe("migrated_unverified");
  });

  it("marks blank SKU and description as needs_review with a deterministic variant", () => {
    const rows = [price({ supplier_sku: null, supplier_description: "" })];
    const first = buildSupplierProductPlan(rows).groups[0].product;
    const second = buildSupplierProductPlan(rows).groups[0].product;
    expect(first.identity_status).toBe("needs_review");
    expect(first.identity_variant).toMatch(/^migration-review:[a-f0-9]{16}$/);
    expect(second.identity_variant).toBe(first.identity_variant);
  });

  it("is deterministic and idempotent for product and assignment IDs", () => {
    const rows = [price()];
    const first = buildSupplierProductPlan(rows).groups[0];
    const second = buildSupplierProductPlan(rows).groups[0];
    expect(second.product.id).toBe(first.product.id);
    expect(second.assignment.id).toBe(first.assignment.id);
    expect(second.group_key).toBe(first.group_key);
  });

  it("blocks mixed SKU and no-SKU history", () => {
    expect(() =>
      buildSupplierProductPlan([
        price(),
        price({ id: "00000000-0000-4000-8000-000000000002", supplier_sku: null }),
      ])
    ).toThrow("Mixed SKU/no-SKU history requires review");
  });

  it("rejects cross-organization material or supplier relationships", () => {
    const plan = buildSupplierProductPlan([price()]);
    const violations = assertTenantIntegrity(
      plan,
      [{ id: "material-1", organization_id: "org-2" }],
      [{ id: "supplier-1", organization_id: "org-1" }]
    );
    expect(violations).toEqual([
      expect.objectContaining({ type: "material", material_id: "material-1" }),
    ]);
  });

  it("does not mutate source price rows or attach products", () => {
    const rows = [price()];
    const before = structuredClone(rows);
    buildSupplierProductPlan(rows);
    expect(rows).toEqual(before);
    expect(rows[0].supplier_product_id).toBeNull();
  });

  it("creates one deterministic initial assignment with no fabricated remap", () => {
    const group = buildSupplierProductPlan([price()]).groups[0];
    expect(group.assignment).toMatchObject({
      supplier_product_id: group.product.id,
      previous_material_id: null,
      new_material_id: "material-1",
      reason: "Phase 1C migration initial material assignment",
    });
  });

  it("does not migrate preferred-price state to the product", () => {
    const product = buildSupplierProductPlan([price({ is_preferred: true })]).groups[0].product;
    expect(product.is_preferred).toBe(false);
    expect(product.metadata).toMatchObject({ preferred_mapping_deferred: true });
  });

  it("detects any before/after price preservation change", () => {
    const before = pricePreservationSnapshot([price()]);
    const after = pricePreservationSnapshot([price({ unit_cost: 11 })]);
    expect(changedPriceIds(before, after)).toEqual(["00000000-0000-4000-8000-000000000001"]);
  });

  it("keeps the controlled executor away from price and import mutations", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/backfill-material-supplier-products-phase1c.mjs"),
      "utf8"
    );
    expect(source).not.toMatch(
      /\.from\("organization_material_supplier_prices"\)\s*\.(insert|upsert|update|delete)/
    );
    expect(source).not.toMatch(
      /\.from\("organization_material_import_rows"\)\s*\.(insert|upsert|update|delete)/
    );
    expect(source).toContain('.from("organization_material_supplier_products")\n    .insert');
    expect(source).toContain('.from("organization_material_supplier_product_assignments")\n    .insert');
  });
});
