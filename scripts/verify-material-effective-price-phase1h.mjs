#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { legacyPriceFactSnapshot } from "./material-supplier-price-attachment-lib.mjs";
import { sha256, stableStringify } from "./material-supplier-product-backfill-lib.mjs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const organizationId = "5c5de347-9f21-48fa-aac9-ba87e91fe92a";
const knownProductId = "aa753a62-1500-5ebf-809a-7aff6205979b";
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0
  ? process.argv[outputIndex + 1]
  : "artifacts/materials/supplier-product-phase1h-effective-price.json";
const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const phase1D = JSON.parse(await readFile("artifacts/materials/supplier-product-phase1d-reconciliation.json", "utf8"));
const originalPriceIds = new Set(phase1D.mapping.map((row) => row.price_id));
const originalProductIds = new Set(phase1D.mapping.map((row) => row.supplier_product_id));

const all = async (table, columns = "*") => {
  const { data, error } = await client.from(table).select(columns).range(0, 9999);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
};
const resolve = async (supplierProductIds, evaluationTime) => {
  const { data, error } = await client.rpc("resolve_material_supplier_product_prices", {
    p_organization_id: organizationId,
    p_evaluation_time: evaluationTime,
    p_supplier_product_ids: supplierProductIds,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
};
const midpoint = (from, to) => new Date((Date.parse(from) + Date.parse(to)) / 2).toISOString();

const beforePrices = await all("organization_material_supplier_prices");
const beforeProducts = await all("organization_material_supplier_products");
const materials = await all("organization_materials", "id,organization_id");
const suppliers = await all("organization_suppliers", "id,organization_id");
const originalPricesBefore = beforePrices.filter((row) => originalPriceIds.has(row.id));
const originalHashBefore = sha256(stableStringify(legacyPriceFactSnapshot(originalPricesBefore)));
const materialById = new Map(materials.map((row) => [row.id, row]));
const supplierById = new Map(suppliers.map((row) => [row.id, row]));
const productById = new Map(beforeProducts.map((row) => [row.id, row]));
const priceById = new Map(beforePrices.map((row) => [row.id, row]));

const intervalConflicts = [];
for (const [supplierProductId, prices] of Map.groupBy(beforePrices, (row) => row.supplier_product_id)) {
  for (let left = 0; left < prices.length; left += 1) {
    for (let right = left + 1; right < prices.length; right += 1) {
      const a = prices[left];
      const b = prices[right];
      const aTo = a.effective_to ? Date.parse(a.effective_to) : Number.POSITIVE_INFINITY;
      const bTo = b.effective_to ? Date.parse(b.effective_to) : Number.POSITIVE_INFINITY;
      if (Date.parse(a.effective_from) < bTo && Date.parse(b.effective_from) < aTo) {
        intervalConflicts.push({ supplier_product_id: supplierProductId, price_ids: [a.id, b.id] });
      }
    }
  }
}

const invariantViolations = {
  unattached_price_ids: beforePrices.filter((row) => !row.supplier_product_id).map((row) => row.id),
  product_material_ids: beforeProducts.filter((row) => materialById.get(row.material_id)?.organization_id !== row.organization_id).map((row) => row.id),
  product_supplier_ids: beforeProducts.filter((row) => supplierById.get(row.supplier_id)?.organization_id !== row.organization_id).map((row) => row.id),
  price_product_material_ids: beforePrices.filter((row) => productById.get(row.supplier_product_id)?.material_id !== row.material_id).map((row) => row.id),
  price_product_supplier_ids: beforePrices.filter((row) => productById.get(row.supplier_product_id)?.supplier_id !== row.supplier_id).map((row) => row.id),
  predecessor_ids: beforePrices.filter((row) => row.supersedes_price_id && priceById.get(row.supersedes_price_id)?.supplier_product_id !== row.supplier_product_id).map((row) => row.id),
  preference_parity_ids: beforePrices.filter((row) => row.is_current && row.is_preferred && !productById.get(row.supplier_product_id)?.is_preferred).map((row) => row.id),
  interval_conflicts: intervalConflicts,
};
if (Object.values(invariantViolations).some((items) => items.length > 0)) {
  throw new Error(`Phase 1H preflight failed: ${JSON.stringify(invariantViolations)}`);
}

const knownHistory = beforePrices
  .filter((row) => row.supplier_product_id === knownProductId)
  .sort((left, right) => left.effective_from.localeCompare(right.effective_from));
const historicalEvaluations = [];
for (let index = 0; index < knownHistory.length; index += 1) {
  const row = knownHistory[index];
  const evaluationTime = row.effective_to
    ? midpoint(row.effective_from, row.effective_to)
    : new Date(Date.parse(row.effective_from) + 1).toISOString();
  const resolved = await resolve([knownProductId], evaluationTime);
  historicalEvaluations.push({ evaluation_time: evaluationTime, expected_price_id: row.id, resolved_price_id: resolved[0]?.price_id ?? null });
}
const firstKnown = knownHistory[0];
const beforeFirst = await resolve([knownProductId], new Date(Date.parse(firstKnown.effective_from) - 1).toISOString());
const boundaryEvaluations = [];
for (let index = 1; index < knownHistory.length; index += 1) {
  const row = knownHistory[index];
  const resolved = await resolve([knownProductId], row.effective_from);
  boundaryEvaluations.push({ evaluation_time: row.effective_from, expected_price_id: row.id, resolved_price_id: resolved[0]?.price_id ?? null });
}

const currentEvaluationTime = new Date().toISOString();
const currentResolutionRows = await resolve(null, currentEvaluationTime);
const currentPriceIdByProductId = new Map(
  currentResolutionRows.map((row) => [row.supplier_product_id, row.price_id])
);
const readParityRows = materials
  .filter((material) => material.organization_id === organizationId)
  .map((material) => {
    const activeProducts = beforeProducts.filter((product) =>
      product.material_id === material.id && product.is_active && !product.archived_at
    );
    const effectivePrices = activeProducts.flatMap((product) => {
      const priceId = currentPriceIdByProductId.get(product.id);
      const effectivePrice = priceId ? priceById.get(priceId) : null;
      return effectivePrice ? [{ product, price: effectivePrice }] : [];
    });
    const legacyCurrentPrices = beforePrices.filter((price) =>
      price.material_id === material.id && price.is_current
    );
    const legacyPreferredPrice =
      legacyCurrentPrices.find((price) => price.is_preferred) ?? legacyCurrentPrices[0] ?? null;
    const preferredProduct = activeProducts.find((product) => product.is_preferred) ?? null;
    const preferredEffectivePriceId = preferredProduct
      ? currentPriceIdByProductId.get(preferredProduct.id) ?? null
      : null;
    const comparisonBases = new Set(effectivePrices.map(({ product, price }) => [
      String(price.currency ?? "NZD").trim().toUpperCase(),
      String(price.unit ?? product.supplier_unit).trim().toLowerCase(),
      product.pack_quantity ?? "no-pack",
      String(product.pack_unit ?? "").trim().toLowerCase(),
    ].join("|")));
    return {
      material_id: material.id,
      legacy_preferred_price_id: legacyPreferredPrice?.id ?? null,
      effective_preferred_price_id: preferredEffectivePriceId,
      legacy_current_price_rows: legacyCurrentPrices.length,
      effective_price_rows: effectivePrices.length,
      effective_distinct_suppliers: new Set(effectivePrices.map(({ product }) => product.supplier_id)).size,
      effective_supplier_products: activeProducts.length,
      best_cost_comparable: comparisonBases.size <= 1,
    };
  });
const originalMaterialIds = new Set(
  beforeProducts.filter((row) => originalProductIds.has(row.id)).map((row) => row.material_id)
);

const stamp = Date.now();
const fixture = {
  materialId: crypto.randomUUID(),
  productId: crypto.randomUUID(),
  firstPriceId: crypto.randomUUID(),
  secondPriceId: crypto.randomUUID(),
  name: `__PHASE1H_EFFECTIVE_${stamp}`,
};
const supplierId = beforeProducts.find((row) => row.organization_id === organizationId)?.supplier_id;
if (!supplierId) throw new Error("A development supplier is required for the scheduled-price fixture.");
let fixtureInserted = false;
let scheduledFixture;

try {
  const { error: materialError } = await client.from("organization_materials").insert({
    id: fixture.materialId,
    organization_id: organizationId,
    name: fixture.name,
    normalized_name: fixture.name.toLowerCase(),
    default_unit: "EA",
    is_active: true,
  });
  if (materialError) throw materialError;
  const { error: productError } = await client.from("organization_material_supplier_products").insert({
    id: fixture.productId,
    organization_id: organizationId,
    material_id: fixture.materialId,
    supplier_id: supplierId,
    supplier_description: fixture.name,
    supplier_unit: "EA",
    identity_status: "confirmed",
    is_preferred: true,
    created_source: "phase1h_test",
  });
  if (productError) throw productError;
  const { error: pricesError } = await client.from("organization_material_supplier_prices").insert([
    {
      id: fixture.firstPriceId,
      organization_id: organizationId,
      material_id: fixture.materialId,
      supplier_id: supplierId,
      supplier_product_id: fixture.productId,
      unit: "EA",
      unit_cost: 10,
      currency: "NZD",
      effective_from: "2099-08-01T00:00:00.000Z",
      effective_to: "2099-09-01T00:00:00.000Z",
      is_current: false,
      is_preferred: false,
      source: "manual",
    },
    {
      id: fixture.secondPriceId,
      organization_id: organizationId,
      material_id: fixture.materialId,
      supplier_id: supplierId,
      supplier_product_id: fixture.productId,
      unit: "EA",
      unit_cost: 12,
      currency: "NZD",
      effective_from: "2099-09-01T00:00:00.000Z",
      effective_to: null,
      supersedes_price_id: fixture.firstPriceId,
      is_current: false,
      is_preferred: false,
      source: "manual",
    },
  ]);
  if (pricesError) throw pricesError;
  fixtureInserted = true;

  const [beforeSchedule, duringFirst, atBoundary] = await Promise.all([
    resolve([fixture.productId], "2099-07-31T23:59:59.999Z"),
    resolve([fixture.productId], "2099-08-15T00:00:00.000Z"),
    resolve([fixture.productId], "2099-09-01T00:00:00.000Z"),
  ]);
  scheduledFixture = {
    before_first_price_id: beforeSchedule[0]?.price_id ?? null,
    during_first_price_id: duringFirst[0]?.price_id ?? null,
    exact_boundary_price_id: atBoundary[0]?.price_id ?? null,
    expected_first_price_id: fixture.firstPriceId,
    expected_boundary_price_id: fixture.secondPriceId,
  };
} finally {
  if (fixtureInserted) {
    await client.from("organization_material_supplier_prices").delete().in("id", [fixture.firstPriceId, fixture.secondPriceId]);
  }
  await client.from("organization_material_supplier_products").delete().eq("id", fixture.productId);
  await client.from("organization_materials").delete().eq("id", fixture.materialId);
}

const afterPrices = await all("organization_material_supplier_prices");
const afterProducts = await all("organization_material_supplier_products");
const originalPricesAfter = afterPrices.filter((row) => originalPriceIds.has(row.id));
const originalHashAfter = sha256(stableStringify(legacyPriceFactSnapshot(originalPricesAfter)));
const report = {
  run_timestamp: new Date().toISOString(),
  phase: "1H effective price read cutover",
  preflight: {
    all_price_rows: beforePrices.length,
    all_supplier_products: beforeProducts.length,
    attached_price_rows: beforePrices.filter((row) => row.supplier_product_id).length,
    violations: invariantViolations,
  },
  historical_resolution: {
    supplier_product_id: knownProductId,
    chain_price_ids: knownHistory.map((row) => row.id),
    interval_evaluations: historicalEvaluations,
    exact_boundary_evaluations: boundaryEvaluations,
    before_first_resolved_price_id: beforeFirst[0]?.price_id ?? null,
  },
  scheduled_fixture: scheduledFixture,
  read_parity: {
    evaluation_time: currentEvaluationTime,
    material_count: materials.filter((row) => row.organization_id === organizationId).length,
    price_history_count: beforePrices.filter((row) => row.organization_id === organizationId).length,
    preferred_price_mismatches: readParityRows.filter((row) =>
      row.legacy_preferred_price_id !== row.effective_preferred_price_id
    ),
    original_preferred_price_mismatches: readParityRows.filter((row) =>
      originalMaterialIds.has(row.material_id) &&
      row.legacy_preferred_price_id !== row.effective_preferred_price_id
    ),
    current_flag_mismatches: readParityRows.filter((row) =>
      row.legacy_current_price_rows !== row.effective_price_rows
    ),
    corrected_supplier_count_rows: readParityRows.filter((row) =>
      row.legacy_current_price_rows !== row.effective_distinct_suppliers
    ),
    non_comparable_best_cost_material_ids: readParityRows
      .filter((row) => !row.best_cost_comparable)
      .map((row) => row.material_id),
  },
  preservation: {
    original_supplier_products_before: originalProductIds.size,
    original_supplier_products_after: afterProducts.filter((row) => originalProductIds.has(row.id)).length,
    original_prices_before: originalPricesBefore.length,
    original_prices_after: originalPricesAfter.length,
    hash_before: originalHashBefore,
    hash_after: originalHashAfter,
    hash_matches: originalHashBefore === originalHashAfter,
    total_price_rows_before: beforePrices.length,
    total_price_rows_after: afterPrices.length,
    total_supplier_products_before: beforeProducts.length,
    total_supplier_products_after: afterProducts.length,
  },
};
report.success =
  historicalEvaluations.every((row) => row.expected_price_id === row.resolved_price_id) &&
  boundaryEvaluations.every((row) => row.expected_price_id === row.resolved_price_id) &&
  report.historical_resolution.before_first_resolved_price_id === null &&
  scheduledFixture?.before_first_price_id === null &&
  scheduledFixture?.during_first_price_id === scheduledFixture?.expected_first_price_id &&
  scheduledFixture?.exact_boundary_price_id === scheduledFixture?.expected_boundary_price_id &&
  report.preservation.hash_matches &&
  report.read_parity.original_preferred_price_mismatches.length === 0 &&
  report.read_parity.current_flag_mismatches.length === 0 &&
  report.preservation.total_price_rows_before === report.preservation.total_price_rows_after &&
  report.preservation.total_supplier_products_before === report.preservation.total_supplier_products_after;

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
