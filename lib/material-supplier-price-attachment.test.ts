import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error The controlled Node migration helper is intentionally plain ESM.
const attachmentLibrary = await import("../scripts/material-supplier-price-attachment-lib.mjs");
const {
  buildPriceAttachmentPlan,
  changedLegacyPriceIds,
  legacyPriceFactSnapshot,
  validatePredecessorChains,
} = attachmentLibrary;

type Row = Record<string, unknown> & { id: string };

function price(overrides: Partial<Row> = {}): Row {
  return {
    id: "price-1",
    organization_id: "org-1",
    material_id: "material-1",
    supplier_id: "supplier-1",
    supplier_sku: "SKU-1",
    supplier_description: "Product",
    unit: "sheet",
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
    supersedes_price_id: null,
    import_row_id: null,
    ...overrides,
  };
}

function product(overrides: Partial<Row> = {}): Row {
  return {
    id: "product-1",
    organization_id: "org-1",
    material_id: "material-1",
    supplier_id: "supplier-1",
    supplier_sku: "SKU-1",
    supplier_description: "Product",
    supplier_unit: "sheet",
    identity_status: "migrated_unverified",
    identity_variant: "default",
    is_preferred: false,
    ...overrides,
  };
}

function context(prices: Row[] = [price()], products: Row[] = [product()]) {
  const groups = products.map((item, index) => {
    const sourceRows =
      products.length === 1
        ? prices
        : prices.filter((row) => row.supplier_id === item.supplier_id);
    const groupKey = `group-${index + 1}`;
    return {
      group_key: groupKey,
      supplier_product_id: item.id,
      normalized_unit: String(item.supplier_unit).toLowerCase(),
      source_price_ids: sourceRows.map((row) => row.id),
    };
  });
  return {
    prices,
    products,
    materials: [{ id: "material-1", organization_id: "org-1" }],
    suppliers: [
      { id: "supplier-1", organization_id: "org-1" },
      { id: "supplier-2", organization_id: "org-1" },
    ],
    phase1CPreSnapshot: { groups },
    phase1CReconciliation: {
      group_to_supplier_product: Object.fromEntries(
        groups.map((group) => [group.group_key, group.supplier_product_id])
      ),
    },
  };
}

describe("material price-history Phase 1D attachment", () => {
  it("attaches every price to exactly one deterministic product", () => {
    const plan = buildPriceAttachmentPlan(context());
    expect(plan.attachments).toHaveLength(1);
    expect(plan.attachments[0].supplier_product_id).toBe("product-1");
    expect(plan.priceMutations).toHaveLength(1);
  });

  it("places repeated historical prices on the same product", () => {
    const rows = [
      price({ id: "price-1", is_current: false }),
      price({ id: "price-2", effective_from: "2026-02-01T00:00:00.000Z" }),
    ];
    const plan = buildPriceAttachmentPlan(context(rows));
    expect(new Set(plan.attachments.map((entry: { supplier_product_id: string }) => entry.supplier_product_id))).toEqual(
      new Set(["product-1"])
    );
  });

  it("does not mix different supplier products", () => {
    const rows = [
      price(),
      price({
        id: "price-2",
        supplier_id: "supplier-2",
        supplier_sku: "SKU-2",
        is_preferred: false,
      }),
    ];
    const products = [product(), product({ id: "product-2", supplier_id: "supplier-2", supplier_sku: "SKU-2" })];
    const plan = buildPriceAttachmentPlan(context(rows, products));
    expect(plan.attachments.map((entry: { supplier_product_id: string }) => entry.supplier_product_id).sort()).toEqual([
      "product-1",
      "product-2",
    ]);
  });

  it("allows needs_review products as safe destinations", () => {
    const plan = buildPriceAttachmentPlan(
      context(
        [price({ supplier_sku: null, supplier_description: null })],
        [product({ supplier_sku: null, supplier_description: null, identity_status: "needs_review" })]
      )
    );
    expect(plan.attachments[0].supplier_product_id).toBe("product-1");
  });

  it("rejects cross-tenant product attachment", () => {
    expect(() => buildPriceAttachmentPlan(context([price()], [product({ organization_id: "org-2" })]))).toThrow(
      "integrity violations"
    );
  });

  it("rejects material mismatch", () => {
    expect(() => buildPriceAttachmentPlan(context([price()], [product({ material_id: "material-2" })]))).toThrow(
      "integrity violations"
    );
  });

  it("rejects supplier mismatch", () => {
    expect(() => buildPriceAttachmentPlan(context([price()], [product({ supplier_id: "supplier-2" })]))).toThrow(
      "integrity violations"
    );
  });

  it("builds deterministic predecessor lineage", () => {
    const rows = [
      price({
        id: "price-2",
        effective_from: "2026-02-01T00:00:00.000Z",
        is_current: false,
        is_preferred: false,
      }),
      price({ id: "price-1", is_current: false, is_preferred: false }),
      price({ id: "price-3", effective_from: "2026-03-01T00:00:00.000Z" }),
    ];
    const plan = buildPriceAttachmentPlan(context(rows));
    const mapping = Object.fromEntries(
      plan.attachments.map((entry: { price: Row; supersedes_price_id: string | null }) => [
        entry.price.id,
        entry.supersedes_price_id,
      ])
    );
    expect(mapping).toEqual({ "price-1": null, "price-2": "price-1", "price-3": "price-2" });
  });

  it("gives a one-price product a null predecessor", () => {
    expect(buildPriceAttachmentPlan(context()).attachments[0].supersedes_price_id).toBeNull();
  });

  it("blocks ambiguous equal effective timestamps", () => {
    expect(() =>
      buildPriceAttachmentPlan(
        context([price(), price({ id: "price-2", created_at: "2026-02-01T00:00:00.000Z" })])
      )
    ).toThrow("Ambiguous equal effective timestamps");
  });

  it("validates complete chains without cycles", () => {
    const rows = [
      price({ id: "price-1", is_current: false, supplier_product_id: "product-1" }),
      price({
        id: "price-2",
        effective_from: "2026-02-01T00:00:00.000Z",
        supplier_product_id: "product-1",
        supersedes_price_id: "price-1",
      }),
    ];
    const plan = buildPriceAttachmentPlan(context(rows));
    expect(validatePredecessorChains(plan.attachments).anomalies).toEqual([]);
  });

  it("does not mutate current/history flags or price facts", () => {
    const rows = [price({ unit_cost: 99, is_current: false, is_preferred: true })];
    const before = structuredClone(rows);
    buildPriceAttachmentPlan(context(rows));
    expect(rows).toEqual(before);
  });

  it("maps preferred foundation from the existing current preferred price", () => {
    const plan = buildPriceAttachmentPlan(context());
    expect(plan.preferredProductMutations).toEqual([{ id: "product-1", organization_id: "org-1" }]);
    expect(plan.currentPreferred[0].is_preferred).toBe(true);
  });

  it("does not fabricate import lineage", () => {
    const plan = buildPriceAttachmentPlan(context());
    expect(plan.priceMutations[0]).not.toHaveProperty("import_row_id");
    expect(() => buildPriceAttachmentPlan(context([price({ source: "import" })]))).toThrow(
      "Imported price rows appeared"
    );
  });

  it("is idempotent when attachment, predecessor, and preference are already correct", () => {
    const rows = [price({ supplier_product_id: "product-1" })];
    const plan = buildPriceAttachmentPlan(context(rows, [product({ is_preferred: true })]));
    expect(plan.priceMutations).toEqual([]);
    expect(plan.preferredProductMutations).toEqual([]);
  });

  it("blocks an incorrect existing attachment instead of overwriting it", () => {
    expect(() =>
      buildPriceAttachmentPlan(context([price({ supplier_product_id: "wrong-product" })]))
    ).toThrow("lineage conflicts");
  });

  it("detects any legacy price fact change", () => {
    const before = legacyPriceFactSnapshot([price()]);
    const after = legacyPriceFactSnapshot([price({ updated_at: "2026-02-01T00:00:00.000Z" })]);
    expect(changedLegacyPriceIds(before, after)).toEqual(["price-1"]);
  });

  it("uses a timestamp-preserving trigger and mutates only approved lineage fields", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260809130000_preserve_material_price_timestamp_for_lineage.sql"
      ),
      "utf8"
    );
    const executor = readFileSync(
      resolve(process.cwd(), "scripts/attach-material-price-history-phase1d.mjs"),
      "utf8"
    );
    expect(migration).toContain("new.updated_at = old.updated_at");
    expect(migration).toContain("new.updated_at = now()");
    expect(executor).toContain("supplier_product_id: mutation.supplier_product_id");
    expect(executor).toContain("supersedes_price_id: mutation.supersedes_price_id");
    expect(executor).not.toMatch(
      /\.from\("organization_material_import_rows"\)\s*\.(insert|upsert|update|delete)/
    );
  });
});
