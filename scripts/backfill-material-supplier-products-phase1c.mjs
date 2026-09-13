#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  assertTenantIntegrity,
  buildSupplierProductPlan,
  changedPriceIds,
  findDuplicateValues,
  normalizeIdentity,
  pricePreservationSnapshot,
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

function phase1BGroupingSignature(prices) {
  const series = new Map();
  for (const row of prices) {
    const seriesKey = JSON.stringify([
      row.organization_id,
      row.material_id,
      row.supplier_id,
      normalizeIdentity(row.unit),
    ]);
    const bucket = series.get(seriesKey) ?? [];
    bucket.push(row);
    series.set(seriesKey, bucket);
  }

  return [...series.entries()]
    .map(([seriesKey, rows]) => {
      const skus = [...new Set(rows.map((row) => normalizeIdentity(row.supplier_sku)).filter(Boolean))].sort();
      const hasNoSku = rows.some((row) => !normalizeIdentity(row.supplier_sku));
      const classification =
        skus.length === 0
          ? "clean_no_sku"
          : hasNoSku
            ? "mixed_sku_and_no_sku"
            : skus.length === 1
              ? "clean_sku"
              : "split_multi_sku";
      return {
        series_key: seriesKey,
        classification,
        distinct_skus: skus,
        price_row_ids: rows.map((row) => row.id).sort(),
      };
    })
    .sort((left, right) => left.series_key.localeCompare(right.series_key));
}

function referenceGroupingSignature(reference) {
  return reference.grouping.groups
    .map((group) => ({
      series_key: group.series_key,
      classification: group.classification,
      distinct_skus: [...group.distinct_skus].sort(),
      price_row_ids: [...group.price_row_ids].sort(),
    }))
    .sort((left, right) => left.series_key.localeCompare(right.series_key));
}

function equivalentProduct(existing, planned) {
  return (
    existing.organization_id === planned.organization_id &&
    existing.material_id === planned.material_id &&
    existing.supplier_id === planned.supplier_id &&
    normalizeIdentity(existing.supplier_sku) === normalizeIdentity(planned.supplier_sku) &&
    normalizeIdentity(existing.supplier_description) === normalizeIdentity(planned.supplier_description) &&
    normalizeIdentity(existing.supplier_unit) === normalizeIdentity(planned.supplier_unit) &&
    existing.identity_variant === planned.identity_variant &&
    existing.identity_status === planned.identity_status &&
    existing.metadata?.migration_group_key === planned.metadata.migration_group_key
  );
}

function equivalentAssignment(existing, planned) {
  return (
    existing.organization_id === planned.organization_id &&
    existing.supplier_product_id === planned.supplier_product_id &&
    existing.previous_material_id === planned.previous_material_id &&
    existing.new_material_id === planned.new_material_id &&
    existing.reason === planned.reason &&
    existing.metadata?.migration_group_key === planned.metadata.migration_group_key
  );
}

const execute = process.argv.includes("--execute");
const referencePath = option(
  "--reference",
  "artifacts/materials/supplier-product-phase1b-preflight.json"
);
const preSnapshotPath = option(
  "--pre-output",
  "artifacts/materials/supplier-product-phase1c-prebackfill.json"
);
const reconciliationPath = option(
  "--output",
  "artifacts/materials/supplier-product-phase1c-reconciliation.json"
);

const reference = JSON.parse(await readFile(referencePath, "utf8"));
if (reference.phase_1c_verdict !== "READY FOR PHASE 1C BACKFILL") {
  throw new Error("PHASE 1C BLOCKED — the reference audit is not ready for backfill.");
}
if (reference.backfill_classification.INTEGRITY_BLOCKER !== 0) {
  throw new Error("PHASE 1C BLOCKED — the reference audit contains integrity blockers.");
}

const client = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const [pricesBeforeRaw, materials, suppliers, productsBefore, assignmentsBefore] =
  await Promise.all([
    selectAll(client, "organization_material_supplier_prices"),
    selectAll(client, "organization_materials", "id,organization_id,name"),
    selectAll(client, "organization_suppliers", "id,organization_id,name,company_name"),
    selectAll(client, "organization_material_supplier_products"),
    selectAll(client, "organization_material_supplier_product_assignments"),
  ]);

const currentSignature = phase1BGroupingSignature(pricesBeforeRaw);
const auditedSignature = referenceGroupingSignature(reference);
if (stableStringify(currentSignature) !== stableStringify(auditedSignature)) {
  throw new Error("PHASE 1C BLOCKED — DATA CHANGED SINCE PREFLIGHT");
}
if (pricesBeforeRaw.length !== reference.inventory.total_price_rows) {
  throw new Error("PHASE 1C BLOCKED — DATA CHANGED SINCE PREFLIGHT");
}

const plan = buildSupplierProductPlan(pricesBeforeRaw);
if (plan.groups.length !== reference.grouping.projected_supplier_products) {
  throw new Error("PHASE 1C BLOCKED — projected Supplier Product count changed since preflight.");
}

const tenantViolationsBefore = assertTenantIntegrity(plan, materials, suppliers);
if (tenantViolationsBefore.length > 0) {
  throw new Error(`PHASE 1C BLOCKED — ${tenantViolationsBefore.length} tenant integrity violations.`);
}

const pricesBefore = pricePreservationSnapshot(pricesBeforeRaw);
const preSnapshot = {
  run_timestamp: new Date().toISOString(),
  source_audit: referencePath,
  source_audit_generated_at: reference.generated_at,
  source_price_row_count: pricesBeforeRaw.length,
  distinct_organizations: new Set(pricesBeforeRaw.map((row) => row.organization_id)).size,
  distinct_materials: new Set(pricesBeforeRaw.map((row) => row.material_id)).size,
  distinct_suppliers: new Set(pricesBeforeRaw.map((row) => row.supplier_id)).size,
  distinct_series: currentSignature.length,
  projected_supplier_products: plan.groups.length,
  price_preservation_hash: sha256(stableStringify(pricesBefore)),
  groups: plan.groups.map((group) => ({
    group_key: group.group_key,
    series_case: group.series_case,
    organization_id: group.product.organization_id,
    material_id: group.product.material_id,
    supplier_id: group.product.supplier_id,
    normalized_unit: group.normalized_unit,
    supplier_product_id: group.product.id,
    identity_status: group.product.identity_status,
    identity_variant: group.product.identity_variant,
    source_price_ids: group.source_price_ids,
    sku_values: [...new Set(group.source_rows.map((row) => row.supplier_sku))],
    description_values: [...new Set(group.source_rows.map((row) => row.supplier_description))],
    source_state: group.source_rows.map((row) => ({
      price_id: row.id,
      is_current: row.is_current,
      is_preferred: row.is_preferred,
    })),
  })),
};
await writeFile(preSnapshotPath, `${JSON.stringify(preSnapshot, null, 2)}\n`, "utf8");

const existingProductById = new Map(productsBefore.map((row) => [row.id, row]));
const existingAssignmentById = new Map(assignmentsBefore.map((row) => [row.id, row]));
const productConflicts = [];
const assignmentConflicts = [];
const missingProducts = [];
const missingAssignments = [];

for (const group of plan.groups) {
  const existingProduct = existingProductById.get(group.product.id);
  if (existingProduct && !equivalentProduct(existingProduct, group.product)) {
    productConflicts.push({ product_id: group.product.id, type: "deterministic_id_mismatch" });
  } else if (!existingProduct) {
    missingProducts.push(group.product);
  }

  const existingAssignment = existingAssignmentById.get(group.assignment.id);
  if (existingAssignment && !equivalentAssignment(existingAssignment, group.assignment)) {
    assignmentConflicts.push({ assignment_id: group.assignment.id, type: "deterministic_id_mismatch" });
  } else if (!existingAssignment) {
    missingAssignments.push(group.assignment);
  }
}

const naturalOwner = new Map();
for (const product of productsBefore) {
  naturalOwner.set(productNaturalKey(product), product.id);
}
for (const group of plan.groups) {
  const naturalKey = productNaturalKey(group.product);
  const owner = naturalOwner.get(naturalKey);
  if (owner && owner !== group.product.id) {
    productConflicts.push({ product_id: group.product.id, existing_product_id: owner, type: "natural_key" });
  }
  naturalOwner.set(naturalKey, group.product.id);
}

if (productConflicts.length || assignmentConflicts.length) {
  throw new Error(
    `PHASE 1C BLOCKED — ${productConflicts.length} product conflicts and ${assignmentConflicts.length} assignment conflicts.`
  );
}

if (execute && missingProducts.length > 0) {
  const { error } = await client
    .from("organization_material_supplier_products")
    .insert(missingProducts);
  if (error) throw new Error(`Supplier Product insert failed: ${error.message}`);
}
if (execute && missingAssignments.length > 0) {
  const { error } = await client
    .from("organization_material_supplier_product_assignments")
    .insert(missingAssignments);
  if (error) throw new Error(`Assignment insert failed: ${error.message}`);
}

const [pricesAfterRaw, productsAfter, assignmentsAfter] = await Promise.all([
  selectAll(client, "organization_material_supplier_prices"),
  selectAll(client, "organization_material_supplier_products"),
  selectAll(client, "organization_material_supplier_product_assignments"),
]);
const pricesAfter = pricePreservationSnapshot(pricesAfterRaw);
const changedPrices = changedPriceIds(pricesBefore, pricesAfter);
const attachedBefore = pricesBefore.filter((row) => row.supplier_product_id).length;
const attachedAfter = pricesAfter.filter((row) => row.supplier_product_id).length;
const productAfterById = new Map(productsAfter.map((row) => [row.id, row]));
const assignmentAfterById = new Map(assignmentsAfter.map((row) => [row.id, row]));
const resolvedProducts = plan.groups.map((group) => productAfterById.get(group.product.id)).filter(Boolean);
const resolvedAssignments = plan.groups
  .map((group) => assignmentAfterById.get(group.assignment.id))
  .filter(Boolean);
const postTenantViolations = assertTenantIntegrity(
  { groups: plan.groups.filter((group) => productAfterById.has(group.product.id)) },
  materials,
  suppliers
);
const duplicateNaturalKeys = findDuplicateValues(resolvedProducts.map(productNaturalKey));
const duplicateMigrationGroupKeys = findDuplicateValues(
  resolvedProducts.map((product) => product.metadata?.migration_group_key).filter(Boolean)
);
const preferredGroups = new Map();
for (const product of productsAfter.filter((row) => row.is_preferred)) {
  const preferredKey = stableStringify([product.organization_id, product.material_id]);
  preferredGroups.set(preferredKey, (preferredGroups.get(preferredKey) ?? 0) + 1);
}
const multiplePreferredGroups = [...preferredGroups].filter(([, count]) => count > 1);
const materialById = new Map(materials.map((row) => [row.id, row]));
const supplierById = new Map(suppliers.map((row) => [row.id, row]));
const reviewRequired = plan.groups
  .filter((group) => group.product.identity_status === "needs_review")
  .map((group) => ({
    supplier_product_id: group.product.id,
    organization_id: group.product.organization_id,
    material_id: group.product.material_id,
    material_name: materialById.get(group.product.material_id)?.name ?? null,
    supplier_id: group.product.supplier_id,
    supplier_name:
      supplierById.get(group.product.supplier_id)?.company_name ||
      supplierById.get(group.product.supplier_id)?.name ||
      null,
    supplier_unit: group.product.supplier_unit,
    source_price_ids: group.source_price_ids,
    sku_values: [...new Set(group.source_rows.map((row) => row.supplier_sku))],
    description_values: [...new Set(group.source_rows.map((row) => row.supplier_description))],
    source_state: group.source_rows.map((row) => ({
      price_id: row.id,
      is_current: row.is_current,
      is_preferred: row.is_preferred,
    })),
    reason: "All source rows have blank supplier SKU and blank supplier description.",
    identity_variant: group.product.identity_variant,
  }));

const reconciliation = {
  run_timestamp: new Date().toISOString(),
  execution_mode: execute ? "execute" : "dry_run",
  source_audit: referencePath,
  pre_backfill_snapshot: preSnapshotPath,
  source_price_row_count: pricesBeforeRaw.length,
  source_grouping_count: plan.groups.length,
  supplier_products_created: execute ? missingProducts.length : 0,
  supplier_products_already_existing: plan.groups.length - missingProducts.length,
  supplier_products_resolved: resolvedProducts.length,
  migrated_unverified_count: resolvedProducts.filter(
    (product) => product.identity_status === "migrated_unverified"
  ).length,
  needs_review_count: resolvedProducts.filter((product) => product.identity_status === "needs_review").length,
  confirmed_count: resolvedProducts.filter((product) => product.identity_status === "confirmed").length,
  assignment_events_created: execute ? missingAssignments.length : 0,
  assignment_events_already_existing: plan.groups.length - missingAssignments.length,
  assignment_events_resolved: resolvedAssignments.length,
  duplicate_conflicts: {
    deterministic_product_conflicts: productConflicts,
    deterministic_assignment_conflicts: assignmentConflicts,
    duplicate_natural_keys: duplicateNaturalKeys,
    duplicate_migration_group_keys: duplicateMigrationGroupKeys,
    multiple_preferred_groups: multiplePreferredGroups,
  },
  tenant_violations: postTenantViolations,
  unexpected_source_changes: changedPrices,
  price_rows_before: pricesBefore.length,
  price_rows_after: pricesAfter.length,
  price_rows_changed_count: changedPrices.length,
  price_rows_changed_ids: changedPrices,
  price_rows_attached_before: attachedBefore,
  price_rows_attached_after: attachedAfter,
  price_preservation_hash_before: sha256(stableStringify(pricesBefore)),
  price_preservation_hash_after: sha256(stableStringify(pricesAfter)),
  review_required_product_ids: reviewRequired.map((product) => product.supplier_product_id),
  review_required_products: reviewRequired,
  group_to_supplier_product: Object.fromEntries(
    plan.groups.map((group) => [group.group_key, group.product.id])
  ),
  grouping_counts: plan.counts,
  preference_mapping_deferred: true,
  success:
    execute &&
    resolvedProducts.length === plan.groups.length &&
    resolvedAssignments.length === plan.groups.length &&
    changedPrices.length === 0 &&
    attachedBefore === attachedAfter &&
    postTenantViolations.length === 0 &&
    duplicateNaturalKeys.length === 0 &&
    duplicateMigrationGroupKeys.length === 0 &&
    multiplePreferredGroups.length === 0,
};

await writeFile(reconciliationPath, `${JSON.stringify(reconciliation, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(reconciliation, null, 2)}\n`);

if (execute && !reconciliation.success) process.exitCode = 1;
if (!execute) {
  process.stderr.write("Dry run only. Re-run with --execute to create Supplier Products.\n");
}
