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

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0
  ? process.argv[outputIndex + 1]
  : "artifacts/materials/supplier-product-phase1g1-local-final.json";
const phase1D = JSON.parse(await readFile("artifacts/materials/supplier-product-phase1d-reconciliation.json", "utf8"));
const originalPriceIds = phase1D.mapping.map((row) => row.price_id);
const originalProductIds = [...new Set(phase1D.mapping.map((row) => row.supplier_product_id))];
const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const select = async (table, columns = "*") => {
  const { data, error } = await client.from(table).select(columns).range(0, 9999);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
};

const [allPrices, allProducts, allAssignments, allMaterials, batches, rows] = await Promise.all([
  select("organization_material_supplier_prices"),
  select("organization_material_supplier_products"),
  select("organization_material_supplier_product_assignments"),
  select("organization_materials", "id,name,is_active,archived_at"),
  select("organization_material_import_batches"),
  select("organization_material_import_rows"),
]);
const originalPrices = allPrices.filter((row) => originalPriceIds.includes(row.id));
const originalProducts = allProducts.filter((row) => originalProductIds.includes(row.id));
const originalHash = sha256(stableStringify(legacyPriceFactSnapshot(originalPrices)));
const priceById = new Map(allPrices.map((row) => [row.id, row]));
const productById = new Map(allProducts.map((row) => [row.id, row]));
const taggedMaterials = allMaterials.filter((row) => row.name.startsWith("__PHASE1G1_LOCAL_"));
const taggedMaterialIds = new Set(taggedMaterials.map((row) => row.id));
const taggedProducts = allProducts.filter((row) => taggedMaterialIds.has(row.material_id));
const taggedProductIds = new Set(taggedProducts.map((row) => row.id));
const taggedPrices = allPrices.filter((row) => taggedMaterialIds.has(row.material_id));
const taggedAssignments = allAssignments.filter((row) => taggedProductIds.has(row.supplier_product_id));
const knownHistory = allPrices
  .filter((row) => row.supplier_product_id === "aa753a62-1500-5ebf-809a-7aff6205979b")
  .sort((a, b) => a.created_at.localeCompare(b.created_at));
const originalViolations = {
  unattached_price_ids: originalPrices.filter((row) => !row.supplier_product_id).map((row) => row.id),
  missing_product_price_ids: originalPrices.filter((row) => !productById.has(row.supplier_product_id)).map((row) => row.id),
  non_current_product_ids: originalProducts.filter((product) => {
    const currents = originalPrices.filter((price) => price.supplier_product_id === product.id && price.is_current);
    return currents.length !== 1;
  }).map((row) => row.id),
  cross_product_predecessor_ids: originalPrices.filter((row) => {
    if (!row.supersedes_price_id) return false;
    return priceById.get(row.supersedes_price_id)?.supplier_product_id !== row.supplier_product_id;
  }).map((row) => row.id),
};

const report = {
  run_timestamp: new Date().toISOString(),
  phase: "1G.1 local runtime smoke final reconciliation",
  original_dataset: {
    supplier_products: originalProducts.length,
    price_rows: originalPrices.length,
    attached_prices: originalPrices.filter((row) => row.supplier_product_id).length,
    preferred_products: originalProducts.filter((row) => row.is_preferred).length,
    needs_review_products: originalProducts.filter((row) => row.identity_status === "needs_review").length,
    legacy_price_fact_hash: originalHash,
    expected_legacy_price_fact_hash: phase1D.legacy_price_hash_after,
    hash_matches: originalHash === phase1D.legacy_price_hash_after,
    violations: originalViolations,
  },
  known_history: {
    supplier_product_id: "aa753a62-1500-5ebf-809a-7aff6205979b",
    price_ids: knownHistory.map((row) => row.id),
    supersedes_price_ids: knownHistory.map((row) => row.supersedes_price_id),
    current_price_ids: knownHistory.filter((row) => row.is_current).map((row) => row.id),
    timestamps: knownHistory.map((row) => ({ id: row.id, effective_from: row.effective_from, created_at: row.created_at })),
  },
  disposable_fixtures: {
    materials: taggedMaterials.length,
    active_materials: taggedMaterials.filter((row) => row.is_active).length,
    archived_materials: taggedMaterials.filter((row) => !row.is_active && row.archived_at).length,
    products: taggedProducts.length,
    prices: taggedPrices.length,
    assignments: taggedAssignments.length,
    retained_strategy: "Tagged materials archived; immutable product/price/assignment lineage retained.",
  },
  import_state: {
    tagged_batches_remaining: batches.filter((row) => row.file_name?.startsWith("__PHASE1G1_LOCAL_")).length,
    tagged_rows_remaining: rows.filter((row) => row.extracted_name?.startsWith("__PHASE1G1_LOCAL_")).length,
  },
  supplier_product_not_null_applied: false,
  success:
    originalProducts.length === 15 &&
    originalPrices.length === 17 &&
    originalPrices.every((row) => row.supplier_product_id) &&
    originalHash === phase1D.legacy_price_hash_after &&
    Object.values(originalViolations).every((items) => items.length === 0) &&
    taggedMaterials.every((row) => !row.is_active && row.archived_at),
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
