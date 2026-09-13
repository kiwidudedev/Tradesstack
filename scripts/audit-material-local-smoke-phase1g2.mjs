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
  : "artifacts/materials/supplier-product-phase1g2-local-final.json";
const phase1D = JSON.parse(await readFile("artifacts/materials/supplier-product-phase1d-reconciliation.json", "utf8"));
const originalPriceIds = new Set(phase1D.mapping.map((row) => row.price_id));
const originalProductIds = new Set(phase1D.mapping.map((row) => row.supplier_product_id));
const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const select = async (table, columns = "*") => {
  const { data, error } = await client.from(table).select(columns).range(0, 9999);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
};

const [allPrices, allProducts, allAssignments, allMaterials, batches, rows, members] = await Promise.all([
  select("organization_material_supplier_prices"),
  select("organization_material_supplier_products"),
  select("organization_material_supplier_product_assignments"),
  select("organization_materials", "id,name,is_active,archived_at"),
  select("organization_material_import_batches"),
  select("organization_material_import_rows"),
  select("organization_members", "user_id"),
]);

const originalPrices = allPrices.filter((row) => originalPriceIds.has(row.id));
const originalProducts = allProducts.filter((row) => originalProductIds.has(row.id));
const originalHash = sha256(stableStringify(legacyPriceFactSnapshot(originalPrices)));
const productById = new Map(allProducts.map((row) => [row.id, row]));
const priceById = new Map(allPrices.map((row) => [row.id, row]));
const taggedMaterials = allMaterials.filter((row) => row.name.startsWith("__PHASE1G2_LOCAL_"));
const taggedMaterialIds = new Set(taggedMaterials.map((row) => row.id));
const taggedProducts = allProducts.filter((row) => taggedMaterialIds.has(row.material_id));
const taggedProductIds = new Set(taggedProducts.map((row) => row.id));
const taggedPrices = allPrices.filter((row) => taggedMaterialIds.has(row.material_id));
const taggedAssignments = allAssignments.filter((row) => taggedProductIds.has(row.supplier_product_id));
const taggedBatches = batches.filter((row) => row.file_name?.startsWith("__PHASE1G2_LOCAL_"));
const taggedBatchIds = new Set(taggedBatches.map((row) => row.id));
const taggedRows = rows.filter((row) => taggedBatchIds.has(row.import_batch_id));
const approvedBatchIds = new Set(taggedRows.filter((row) => row.status === "approved").map((row) => row.import_batch_id));
const knownHistory = allPrices
  .filter((row) => row.supplier_product_id === "aa753a62-1500-5ebf-809a-7aff6205979b")
  .sort((a, b) => a.created_at.localeCompare(b.created_at));
const originalViolations = {
  unattached_price_ids: originalPrices.filter((row) => !row.supplier_product_id).map((row) => row.id),
  missing_product_price_ids: originalPrices.filter((row) => !productById.has(row.supplier_product_id)).map((row) => row.id),
  invalid_current_product_ids: originalProducts.filter((product) =>
    originalPrices.filter((price) => price.supplier_product_id === product.id && price.is_current).length !== 1
  ).map((row) => row.id),
  cross_product_predecessor_ids: originalPrices.filter((row) => row.supersedes_price_id &&
    priceById.get(row.supersedes_price_id)?.supplier_product_id !== row.supplier_product_id
  ).map((row) => row.id),
};
const newPriceViolations = {
  null_supplier_product_price_ids: taggedPrices.filter((row) => !row.supplier_product_id).map((row) => row.id),
  missing_supplier_product_price_ids: taggedPrices.filter((row) => !productById.has(row.supplier_product_id)).map((row) => row.id),
  cross_product_predecessor_ids: taggedPrices.filter((row) => row.supersedes_price_id &&
    priceById.get(row.supersedes_price_id)?.supplier_product_id !== row.supplier_product_id
  ).map((row) => row.id),
};

const { data: authPage, error: authError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const phaseUsers = (authPage.users ?? []).filter((user) => user.email?.startsWith("phase1g1-") &&
  String(user.user_metadata?.organization_name ?? "").startsWith("__PHASE1G2_LOCAL_"));
const memberIds = new Set(members.map((row) => row.user_id));

const report = {
  run_timestamp: new Date().toISOString(),
  phase: "1G.2 local write-cutover corrections final reconciliation",
  original_dataset: {
    supplier_products_before: originalProductIds.size,
    supplier_products_after: originalProducts.length,
    price_rows_before: originalPriceIds.size,
    price_rows_after: originalPrices.length,
    attached_prices: originalPrices.filter((row) => row.supplier_product_id).length,
    legacy_price_fact_hash: originalHash,
    expected_legacy_price_fact_hash: phase1D.legacy_price_hash_after,
    hash_matches: originalHash === phase1D.legacy_price_hash_after,
    violations: originalViolations,
  },
  new_phase_1g2_rows: {
    materials: taggedMaterials.length,
    active_materials: taggedMaterials.filter((row) => row.is_active).length,
    archived_materials: taggedMaterials.filter((row) => !row.is_active && row.archived_at).length,
    supplier_products: taggedProducts.length,
    price_rows: taggedPrices.length,
    assignments: taggedAssignments.length,
    violations: newPriceViolations,
  },
  import_state: {
    batches: taggedBatches.length,
    rows: taggedRows.length,
    approved_rows: taggedRows.filter((row) => row.status === "approved").length,
    rejected_rows: taggedRows.filter((row) => row.status === "rejected").length,
    batches_with_approved_provenance: approvedBatchIds.size,
    batches_without_approved_provenance: taggedBatches.filter((row) => !approvedBatchIds.has(row.id)).map((row) => row.id),
  },
  temporary_access: {
    users_retained: phaseUsers.length,
    users_with_membership: phaseUsers.filter((user) => memberIds.has(user.id)).length,
  },
  known_history: {
    supplier_product_id: "aa753a62-1500-5ebf-809a-7aff6205979b",
    price_ids: knownHistory.map((row) => row.id),
    supersedes_price_ids: knownHistory.map((row) => row.supersedes_price_id),
    current_price_ids: knownHistory.filter((row) => row.is_current).map((row) => row.id),
  },
  supplier_product_not_null_applied: false,
};

report.success =
  originalProducts.length === 15 &&
  originalPrices.length === 17 &&
  originalPrices.every((row) => row.supplier_product_id) &&
  originalHash === phase1D.legacy_price_hash_after &&
  Object.values(originalViolations).every((items) => items.length === 0) &&
  Object.values(newPriceViolations).every((items) => items.length === 0) &&
  taggedMaterials.every((row) => !row.is_active && row.archived_at) &&
  report.import_state.batches_without_approved_provenance.length === 0 &&
  report.temporary_access.users_with_membership === 0;

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
