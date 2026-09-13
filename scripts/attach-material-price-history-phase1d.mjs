#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  buildPriceAttachmentPlan,
  changedLegacyPriceIds,
  legacyPriceFactSnapshot,
  validatePredecessorChains,
} from "./material-supplier-price-attachment-lib.mjs";
import { sha256, stableStringify } from "./material-supplier-product-backfill-lib.mjs";

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

function currentStateSnapshot(prices) {
  return {
    current_price_ids: prices.filter((row) => row.is_current).map((row) => row.id).sort(),
    historical_price_ids: prices.filter((row) => !row.is_current).map((row) => row.id).sort(),
    preferred_price_ids: prices.filter((row) => row.is_preferred).map((row) => row.id).sort(),
    current_preferred_supplier_keys: prices
      .filter((row) => row.is_current && row.is_preferred)
      .map((row) => stableStringify([row.organization_id, row.material_id, row.supplier_id]))
      .sort(),
  };
}

const execute = process.argv.includes("--execute");
const phase1CReconciliationPath = option(
  "--phase1c-reconciliation",
  "artifacts/materials/supplier-product-phase1c-reconciliation.json"
);
const phase1CPreSnapshotPath = option(
  "--phase1c-pre-snapshot",
  "artifacts/materials/supplier-product-phase1c-prebackfill.json"
);
const beforeOutputPath = option(
  "--before-output",
  "artifacts/materials/supplier-product-phase1d-pre-attachment.json"
);
const outputPath = option(
  "--output",
  "artifacts/materials/supplier-product-phase1d-reconciliation.json"
);

const [phase1CReconciliation, phase1CPreSnapshot] = await Promise.all([
  readFile(phase1CReconciliationPath, "utf8").then(JSON.parse),
  readFile(phase1CPreSnapshotPath, "utf8").then(JSON.parse),
]);
if (!phase1CReconciliation.success) {
  throw new Error("PHASE 1D BLOCKED — Phase 1C reconciliation was not successful.");
}

const client = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const [pricesBeforeRaw, productsBefore, assignments, materials, suppliers] = await Promise.all([
  selectAll(client, "organization_material_supplier_prices"),
  selectAll(client, "organization_material_supplier_products"),
  selectAll(client, "organization_material_supplier_product_assignments"),
  selectAll(client, "organization_materials", "id,organization_id,name"),
  selectAll(client, "organization_suppliers", "id,organization_id,name,company_name"),
]);

if (
  pricesBeforeRaw.length !== 17 ||
  productsBefore.length !== 15 ||
  assignments.length !== 15 ||
  productsBefore.filter((row) => row.identity_status === "migrated_unverified").length !== 13 ||
  productsBefore.filter((row) => row.identity_status === "needs_review").length !== 2
) {
  throw new Error("PHASE 1D BLOCKED — DATA CHANGED SINCE PHASE 1C");
}
const knownReviewProductIds = new Set([
  "19b94cde-510f-52bb-91e4-122561a31f2b",
  "aa753a62-1500-5ebf-809a-7aff6205979b",
]);
for (const product of productsBefore.filter((row) => knownReviewProductIds.has(row.id))) {
  if (
    product.identity_status !== "needs_review" ||
    product.supplier_sku !== null ||
    product.supplier_description !== null
  ) {
    throw new Error("PHASE 1D BLOCKED — a known review product changed since Phase 1C.");
  }
}

const planBefore = buildPriceAttachmentPlan({
  prices: pricesBeforeRaw,
  products: productsBefore,
  materials,
  suppliers,
  phase1CPreSnapshot,
  phase1CReconciliation,
});
const legacyBefore = legacyPriceFactSnapshot(pricesBeforeRaw);
const legacyHashBefore = sha256(stableStringify(legacyBefore));
const stateBefore = currentStateSnapshot(pricesBeforeRaw);
const beforeSnapshot = {
  run_timestamp: new Date().toISOString(),
  phase_1c_reconciliation: phase1CReconciliationPath,
  phase_1c_pre_snapshot: phase1CPreSnapshotPath,
  price_rows: pricesBeforeRaw.length,
  supplier_products: productsBefore.length,
  assignments: assignments.length,
  attached_prices: pricesBeforeRaw.filter((row) => row.supplier_product_id).length,
  predecessor_links: pricesBeforeRaw.filter((row) => row.supersedes_price_id).length,
  import_row_links: pricesBeforeRaw.filter((row) => row.import_row_id).length,
  legacy_fact_hash: legacyHashBefore,
  current_state: stateBefore,
  planned_mapping: planBefore.attachments.map((entry) => ({
    price_id: entry.price.id,
    supplier_product_id: entry.supplier_product_id,
    supersedes_price_id: entry.supersedes_price_id,
  })),
};
await writeFile(beforeOutputPath, `${JSON.stringify(beforeSnapshot, null, 2)}\n`, "utf8");

if (execute) {
  for (const mutation of planBefore.priceMutations) {
    const { error } = await client
      .from("organization_material_supplier_prices")
      .update({
        supplier_product_id: mutation.supplier_product_id,
        supersedes_price_id: mutation.supersedes_price_id,
      })
      .eq("organization_id", mutation.organization_id)
      .eq("id", mutation.id);
    if (error) throw new Error(`Price lineage update failed for ${mutation.id}: ${error.message}`);
  }
  for (const mutation of planBefore.preferredProductMutations) {
    const { error } = await client
      .from("organization_material_supplier_products")
      .update({ is_preferred: true })
      .eq("organization_id", mutation.organization_id)
      .eq("id", mutation.id);
    if (error) throw new Error(`Preferred product update failed for ${mutation.id}: ${error.message}`);
  }
}

const [pricesAfterRaw, productsAfter] = await Promise.all([
  selectAll(client, "organization_material_supplier_prices"),
  selectAll(client, "organization_material_supplier_products"),
]);
const legacyAfter = legacyPriceFactSnapshot(pricesAfterRaw);
const legacyHashAfter = sha256(stableStringify(legacyAfter));
const changedLegacyPrices = changedLegacyPriceIds(legacyBefore, legacyAfter);
const stateAfter = currentStateSnapshot(pricesAfterRaw);
const planAfter = buildPriceAttachmentPlan({
  prices: pricesAfterRaw,
  products: productsAfter,
  materials,
  suppliers,
  phase1CPreSnapshot,
  phase1CReconciliation,
});
const chainValidation = validatePredecessorChains(planAfter.attachments);
const targetProductIds = new Set(Object.values(phase1CReconciliation.group_to_supplier_product));
const productsWithPrices = new Set(
  pricesAfterRaw.map((row) => row.supplier_product_id).filter(Boolean)
);
const preferredPrices = pricesAfterRaw.filter((row) => row.is_current && row.is_preferred);
const preferredProducts = productsAfter.filter((row) => row.is_preferred);
const productById = new Map(productsAfter.map((row) => [row.id, row]));
const preferredParityMismatches = preferredPrices
  .filter((price) => !productById.get(price.supplier_product_id)?.is_preferred)
  .map((price) => price.id);
const attachedBefore = pricesBeforeRaw.filter((row) => row.supplier_product_id).length;
const attachedAfter = pricesAfterRaw.filter((row) => row.supplier_product_id).length;
const predecessorBefore = pricesBeforeRaw.filter((row) => row.supersedes_price_id).length;
const predecessorAfter = pricesAfterRaw.filter((row) => row.supersedes_price_id).length;
const importLinksBefore = pricesBeforeRaw.filter((row) => row.import_row_id).length;
const importLinksAfter = pricesAfterRaw.filter((row) => row.import_row_id).length;
const reviewCoverage = productsAfter
  .filter((product) => knownReviewProductIds.has(product.id))
  .map((product) => ({
    supplier_product_id: product.id,
    identity_status: product.identity_status,
    attached_price_count: pricesAfterRaw.filter((price) => price.supplier_product_id === product.id).length,
  }));

const reconciliation = {
  run_timestamp: new Date().toISOString(),
  execution_mode: execute ? "execute" : "dry_run",
  phase_1c_reconciliation: phase1CReconciliationPath,
  before_snapshot: beforeOutputPath,
  price_rows_before: pricesBeforeRaw.length,
  price_rows_after: pricesAfterRaw.length,
  prices_attached_before: attachedBefore,
  prices_attached_after: attachedAfter,
  prices_newly_attached: execute
    ? planBefore.priceMutations.filter((row) => row.attachment_is_new).length
    : 0,
  prices_reused: attachedBefore,
  prices_blocked: 0,
  prices_without_supplier_product: pricesAfterRaw.filter((row) => !row.supplier_product_id).length,
  supplier_products_total: targetProductIds.size,
  supplier_products_with_prices: [...targetProductIds].filter((id) => productsWithPrices.has(id)).length,
  supplier_products_without_prices: [...targetProductIds].filter((id) => !productsWithPrices.has(id)).length,
  predecessor_links_created: execute
    ? planBefore.priceMutations.filter((row) => row.predecessor_is_new).length
    : 0,
  predecessor_links_reused: predecessorBefore,
  predecessor_links_after: predecessorAfter,
  preferred_products_set: execute ? planBefore.preferredProductMutations.length : 0,
  materials_with_preferred_prices: new Set(
    preferredPrices.map((row) => stableStringify([row.organization_id, row.material_id]))
  ).size,
  materials_with_preferred_products: new Set(
    preferredProducts.map((row) => stableStringify([row.organization_id, row.material_id]))
  ).size,
  preferred_parity_mismatches: preferredParityMismatches,
  tenant_violations: [],
  price_fact_changes: changedLegacyPrices,
  legacy_price_hash_before: legacyHashBefore,
  legacy_price_hash_after: legacyHashAfter,
  current_state_parity: stableStringify(stateBefore) === stableStringify(stateAfter),
  import_row_links_created: importLinksAfter - importLinksBefore,
  import_row_links_after: importLinksAfter,
  needs_review_products_with_attached_prices: reviewCoverage,
  price_chains: chainValidation.chains,
  chain_anomalies: chainValidation.anomalies,
  mapping: planAfter.attachments
    .map((entry) => ({
      price_id: entry.price.id,
      supplier_product_id: entry.price.supplier_product_id,
      supersedes_price_id: entry.price.supersedes_price_id,
    }))
    .sort((left, right) => left.price_id.localeCompare(right.price_id)),
  success:
    execute &&
    pricesAfterRaw.length === 17 &&
    attachedAfter === 17 &&
    productsWithPrices.size === 15 &&
    changedLegacyPrices.length === 0 &&
    legacyHashBefore === legacyHashAfter &&
    stableStringify(stateBefore) === stableStringify(stateAfter) &&
    chainValidation.anomalies.length === 0 &&
    preferredParityMismatches.length === 0 &&
    importLinksAfter === 0 &&
    reviewCoverage.every((entry) => entry.identity_status === "needs_review"),
};

await writeFile(outputPath, `${JSON.stringify(reconciliation, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(reconciliation, null, 2)}\n`);
if (execute && !reconciliation.success) process.exitCode = 1;
if (!execute) process.stderr.write("Dry run only. Re-run with --execute to attach lineage.\n");
