#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  legacyPriceFactSnapshot,
} from "./material-supplier-price-attachment-lib.mjs";
import {
  findDuplicateValues,
  productNaturalKey,
  sha256,
  stableStringify,
} from "./material-supplier-product-backfill-lib.mjs";

const PAGE_SIZE = 1000;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function selectAll(client, table, columns = "*") {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

function ids(rows) {
  return rows.map((row) => row.id).sort();
}

const phase1DPath = option(
  "--phase1d",
  "artifacts/materials/supplier-product-phase1d-reconciliation.json"
);
const outputPath = option(
  "--output",
  "artifacts/materials/supplier-product-phase1e-reconciliation.json"
);
const phase1D = JSON.parse(await readFile(phase1DPath, "utf8"));
if (!phase1D.success) throw new Error("Phase 1D reconciliation is not successful.");

const client = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const [prices, products, assignments, materials, suppliers, batches, importRows] =
  await Promise.all([
    selectAll(client, "organization_material_supplier_prices"),
    selectAll(client, "organization_material_supplier_products"),
    selectAll(client, "organization_material_supplier_product_assignments"),
    selectAll(client, "organization_materials", "id,organization_id,name"),
    selectAll(client, "organization_suppliers", "id,organization_id,name"),
    selectAll(client, "organization_material_import_batches"),
    selectAll(client, "organization_material_import_rows"),
  ]);

const priceById = new Map(prices.map((row) => [row.id, row]));
const productById = new Map(products.map((row) => [row.id, row]));
const materialById = new Map(materials.map((row) => [row.id, row]));
const supplierById = new Map(suppliers.map((row) => [row.id, row]));
const batchById = new Map(batches.map((row) => [row.id, row]));
const importRowById = new Map(importRows.map((row) => [row.id, row]));

const productMaterialViolations = products.filter((product) => {
  const material = materialById.get(product.material_id);
  return !material || material.organization_id !== product.organization_id;
});
const productSupplierViolations = products.filter((product) => {
  const supplier = supplierById.get(product.supplier_id);
  return !supplier || supplier.organization_id !== product.organization_id;
});
const duplicateIdentityKeys = findDuplicateValues(products.map(productNaturalKey));
const preferredGroups = new Map();
for (const product of products.filter((row) => row.is_preferred)) {
  const groupKey = stableStringify([product.organization_id, product.material_id]);
  preferredGroups.set(groupKey, (preferredGroups.get(groupKey) ?? 0) + 1);
}
const preferredProductViolations = [...preferredGroups]
  .filter(([, count]) => count > 1)
  .map(([groupKey]) => groupKey);

const unattachedPrices = prices.filter((price) => !price.supplier_product_id);
const priceProductOrganizationMismatches = prices.filter((price) => {
  const product = productById.get(price.supplier_product_id);
  return !product || product.organization_id !== price.organization_id;
});
const priceProductMaterialMismatches = prices.filter((price) => {
  const product = productById.get(price.supplier_product_id);
  return !product || product.material_id !== price.material_id;
});
const priceProductSupplierMismatches = prices.filter((price) => {
  const product = productById.get(price.supplier_product_id);
  return !product || product.supplier_id !== price.supplier_id;
});
const priceMaterialTenantViolations = prices.filter((price) => {
  const material = materialById.get(price.material_id);
  return !material || material.organization_id !== price.organization_id;
});
const priceSupplierTenantViolations = prices.filter((price) => {
  const supplier = supplierById.get(price.supplier_id);
  return !supplier || supplier.organization_id !== price.organization_id;
});

const predecessorPrices = prices.filter((price) => price.supersedes_price_id);
const predecessorCrossProduct = predecessorPrices.filter((price) => {
  const predecessor = priceById.get(price.supersedes_price_id);
  return !predecessor || predecessor.supplier_product_id !== price.supplier_product_id;
});
const predecessorCrossOrganization = predecessorPrices.filter((price) => {
  const predecessor = priceById.get(price.supersedes_price_id);
  return !predecessor || predecessor.organization_id !== price.organization_id;
});
const predecessorSelfLinks = predecessorPrices.filter(
  (price) => price.supersedes_price_id === price.id
);
const predecessorCycleIds = [];
for (const price of prices) {
  const seen = new Set([price.id]);
  let cursor = price;
  while (cursor?.supersedes_price_id) {
    if (seen.has(cursor.supersedes_price_id)) {
      predecessorCycleIds.push(price.id);
      break;
    }
    seen.add(cursor.supersedes_price_id);
    cursor = priceById.get(cursor.supersedes_price_id);
  }
}

const assignmentProductViolations = assignments.filter((assignment) => {
  const product = productById.get(assignment.supplier_product_id);
  return !product || product.organization_id !== assignment.organization_id;
});
const assignmentPreviousMaterialViolations = assignments.filter((assignment) => {
  if (!assignment.previous_material_id) return false;
  const material = materialById.get(assignment.previous_material_id);
  return !material || material.organization_id !== assignment.organization_id;
});
const assignmentNewMaterialViolations = assignments.filter((assignment) => {
  const material = materialById.get(assignment.new_material_id);
  return !material || material.organization_id !== assignment.organization_id;
});
const assignmentImportRowViolations = assignments.filter((assignment) => {
  if (!assignment.source_import_row_id) return false;
  const row = importRowById.get(assignment.source_import_row_id);
  return !row || row.organization_id !== assignment.organization_id;
});

const batchSupplierViolations = batches.filter((batch) => {
  if (!batch.supplier_id) return false;
  const supplier = supplierById.get(batch.supplier_id);
  return !supplier || supplier.organization_id !== batch.organization_id;
});
const importRowBatchViolations = importRows.filter((row) => {
  const batch = batchById.get(row.import_batch_id);
  return !batch || batch.organization_id !== row.organization_id;
});
const importRowMaterialViolations = importRows.filter((row) => {
  if (!row.matched_material_id) return false;
  const material = materialById.get(row.matched_material_id);
  return !material || material.organization_id !== row.organization_id;
});
const approvedProductViolations = importRows.filter((row) => {
  if (!row.approved_supplier_product_id) return false;
  const product = productById.get(row.approved_supplier_product_id);
  return !product || product.organization_id !== row.organization_id;
});
const approvedPriceViolations = importRows.filter((row) => {
  if (!row.approved_supplier_price_id) return false;
  const price = priceById.get(row.approved_supplier_price_id);
  return !price || price.organization_id !== row.organization_id;
});
const priceBatchViolations = prices.filter((price) => {
  if (!price.import_batch_id) return false;
  const batch = batchById.get(price.import_batch_id);
  return !batch || batch.organization_id !== price.organization_id;
});
const priceImportRowViolations = prices.filter((price) => {
  if (!price.import_row_id) return false;
  const row = importRowById.get(price.import_row_id);
  return !row || row.organization_id !== price.organization_id;
});

const preferredPrices = prices.filter((row) => row.is_current && row.is_preferred);
const preferredParityMismatches = preferredPrices.filter(
  (price) => !productById.get(price.supplier_product_id)?.is_preferred
);
const currentMapping = prices
  .map((price) => ({
    price_id: price.id,
    supplier_product_id: price.supplier_product_id,
    supersedes_price_id: price.supersedes_price_id,
  }))
  .sort((left, right) => left.price_id.localeCompare(right.price_id));
const mappingChanged = stableStringify(currentMapping) !== stableStringify(phase1D.mapping);
const legacyHash = sha256(stableStringify(legacyPriceFactSnapshot(prices)));

const violationCollections = [
  productMaterialViolations,
  productSupplierViolations,
  duplicateIdentityKeys,
  preferredProductViolations,
  unattachedPrices,
  priceProductOrganizationMismatches,
  priceProductMaterialMismatches,
  priceProductSupplierMismatches,
  priceMaterialTenantViolations,
  priceSupplierTenantViolations,
  predecessorCrossProduct,
  predecessorCrossOrganization,
  predecessorSelfLinks,
  predecessorCycleIds,
  assignmentProductViolations,
  assignmentPreviousMaterialViolations,
  assignmentNewMaterialViolations,
  assignmentImportRowViolations,
  batchSupplierViolations,
  importRowBatchViolations,
  importRowMaterialViolations,
  approvedProductViolations,
  approvedPriceViolations,
  priceBatchViolations,
  priceImportRowViolations,
  preferredParityMismatches,
];

const report = {
  run_timestamp: new Date().toISOString(),
  phase_1d_reconciliation: phase1DPath,
  supplier_products: products.length,
  migrated_unverified_products: products.filter(
    (row) => row.identity_status === "migrated_unverified"
  ).length,
  needs_review_products: products.filter((row) => row.identity_status === "needs_review").length,
  product_material_violations: ids(productMaterialViolations),
  product_supplier_violations: ids(productSupplierViolations),
  duplicate_identity_keys: duplicateIdentityKeys,
  preferred_product_violations: preferredProductViolations,
  preferred_products: products.filter((row) => row.is_preferred).length,
  price_rows: prices.length,
  attached_prices: prices.length - unattachedPrices.length,
  unattached_price_ids: ids(unattachedPrices),
  price_product_organization_mismatches: ids(priceProductOrganizationMismatches),
  price_product_material_mismatches: ids(priceProductMaterialMismatches),
  price_product_supplier_mismatches: ids(priceProductSupplierMismatches),
  price_material_tenant_violations: ids(priceMaterialTenantViolations),
  price_supplier_tenant_violations: ids(priceSupplierTenantViolations),
  predecessor_links: predecessorPrices.length,
  predecessor_cross_product_violations: ids(predecessorCrossProduct),
  predecessor_cross_organization_violations: ids(predecessorCrossOrganization),
  predecessor_self_links: ids(predecessorSelfLinks),
  predecessor_cycle_price_ids: [...new Set(predecessorCycleIds)].sort(),
  assignment_rows: assignments.length,
  assignment_product_violations: ids(assignmentProductViolations),
  assignment_previous_material_violations: ids(assignmentPreviousMaterialViolations),
  assignment_new_material_violations: ids(assignmentNewMaterialViolations),
  assignment_import_row_violations: ids(assignmentImportRowViolations),
  import_batches: batches.length,
  import_rows: importRows.length,
  batch_supplier_violations: ids(batchSupplierViolations),
  import_row_batch_violations: ids(importRowBatchViolations),
  import_row_material_violations: ids(importRowMaterialViolations),
  approved_product_violations: ids(approvedProductViolations),
  approved_price_violations: ids(approvedPriceViolations),
  price_batch_violations: ids(priceBatchViolations),
  price_import_row_violations: ids(priceImportRowViolations),
  populated_price_import_row_links: prices.filter((row) => row.import_row_id).length,
  populated_approved_product_links: importRows.filter((row) => row.approved_supplier_product_id).length,
  populated_approved_price_links: importRows.filter((row) => row.approved_supplier_price_id).length,
  materials_with_preferred_prices: new Set(
    preferredPrices.map((row) => stableStringify([row.organization_id, row.material_id]))
  ).size,
  preferred_parity_mismatch_ids: ids(preferredParityMismatches),
  mapping_changed_since_phase_1d: mappingChanged,
  legacy_price_fact_hash: legacyHash,
  expected_legacy_price_fact_hash: phase1D.legacy_price_hash_after,
  legacy_price_fact_hash_matches: legacyHash === phase1D.legacy_price_hash_after,
  historical_data_ready_for_supplier_product_not_null: unattachedPrices.length === 0,
  current_runtime_writers_ready_for_supplier_product_not_null: false,
  supplier_product_not_null_applied: false,
  success:
    products.length === 15 &&
    prices.length === 17 &&
    assignments.length === 15 &&
    products.filter((row) => row.is_preferred).length === 14 &&
    violationCollections.every((collection) => collection.length === 0) &&
    !mappingChanged &&
    legacyHash === phase1D.legacy_price_hash_after,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.success) process.exitCode = 1;
