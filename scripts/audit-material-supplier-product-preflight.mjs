#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const EXAMPLE_LIMIT = 20;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalized(value) {
  const result = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return result || null;
}

function key(...values) {
  return JSON.stringify(values);
}

function groupBy(rows, getKey) {
  const grouped = new Map();
  for (const row of rows) {
    const groupKey = getKey(row);
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(row);
    grouped.set(groupKey, bucket);
  }
  return grouped;
}

function ids(rows, limit = EXAMPLE_LIMIT) {
  return [...new Set(rows.map((row) => row.id))].slice(0, limit);
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

function selectedImportValue(row, reviewedField, extractedField) {
  return row[reviewedField] ?? row[extractedField] ?? null;
}

function importRowMatchesPrice(row, price, batch) {
  if (row.import_batch_id !== price.import_batch_id || row.status !== "approved") return false;
  if (row.matched_material_id !== price.material_id || batch?.supplier_id !== price.supplier_id) return false;

  const unit = selectedImportValue(row, "reviewed_unit", "extracted_unit");
  const unitCost = selectedImportValue(row, "reviewed_unit_cost", "extracted_unit_cost");
  const currency = selectedImportValue(row, "reviewed_currency", "extracted_currency") ?? "NZD";
  const sku = row.reviewed_supplier_sku ?? row.supplier_sku;
  const description = row.reviewed_supplier_description ?? row.supplier_description;

  return (
    normalized(unit) === normalized(price.unit) &&
    Number(unitCost) === Number(price.unit_cost) &&
    normalized(currency) === normalized(price.currency) &&
    normalized(sku) === normalized(price.supplier_sku) &&
    normalized(description) === normalized(price.supplier_description)
  );
}

function intervalsOverlap(left, right) {
  const leftStart = Date.parse(left.effective_from);
  const rightStart = Date.parse(right.effective_from);
  const leftEnd = left.effective_to ? Date.parse(left.effective_to) : Number.POSITIVE_INFINITY;
  const rightEnd = right.effective_to ? Date.parse(right.effective_to) : Number.POSITIVE_INFINITY;
  return leftStart < rightEnd && rightStart < leftEnd;
}

const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const client = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [prices, materials, suppliers, batches, importRows] = await Promise.all([
  selectAll(client, "organization_material_supplier_prices"),
  selectAll(client, "organization_materials", "id,organization_id,name"),
  selectAll(client, "organization_suppliers", "id,organization_id,name,company_name"),
  selectAll(
    client,
    "organization_material_import_batches",
    "id,organization_id,supplier_id,status,storage_path,file_name,extraction_method"
  ),
  selectAll(
    client,
    "organization_material_import_rows",
    "id,organization_id,import_batch_id,row_index,status,action,matched_material_id,extracted_unit,extracted_unit_cost,extracted_currency,supplier_sku,supplier_description,reviewed_unit,reviewed_unit_cost,reviewed_currency,reviewed_supplier_sku,reviewed_supplier_description,source_payload"
  ),
]);

const materialById = new Map(materials.map((row) => [row.id, row]));
const supplierById = new Map(suppliers.map((row) => [row.id, row]));
const batchById = new Map(batches.map((row) => [row.id, row]));
const now = Date.now();

const seriesKey = (row) =>
  key(row.organization_id, row.material_id, row.supplier_id, normalized(row.unit));
const series = groupBy(prices, seriesKey);
const materialKey = (row) => key(row.organization_id, row.material_id);

const groupingRows = [];
const mixedSeriesKeys = new Set();
const multiSkuSeriesKeys = new Set();
const ambiguousSeriesKeys = new Set();
let cleanSkuGroups = 0;
let cleanNoSkuGroups = 0;
let splitMultiSkuGroups = 0;
let mixedSkuNoSkuGroups = 0;
let projectedSupplierProducts = 0;

for (const [groupKey, rows] of series) {
  const skus = new Set(rows.map((row) => normalized(row.supplier_sku)).filter(Boolean));
  const hasNoSku = rows.some((row) => !normalized(row.supplier_sku));
  let classification;
  let projectedProducts;

  if (skus.size === 0) {
    classification = "clean_no_sku";
    projectedProducts = 1;
    cleanNoSkuGroups += 1;
  } else if (hasNoSku) {
    classification = "mixed_sku_and_no_sku";
    projectedProducts = skus.size + 1;
    mixedSkuNoSkuGroups += 1;
    mixedSeriesKeys.add(groupKey);
    ambiguousSeriesKeys.add(groupKey);
  } else if (skus.size === 1) {
    classification = "clean_sku";
    projectedProducts = 1;
    cleanSkuGroups += 1;
  } else {
    classification = "split_multi_sku";
    projectedProducts = skus.size;
    splitMultiSkuGroups += 1;
    multiSkuSeriesKeys.add(groupKey);
  }

  projectedSupplierProducts += projectedProducts;
  groupingRows.push({
    series_key: groupKey,
    organization_id: rows[0].organization_id,
    material_id: rows[0].material_id,
    supplier_id: rows[0].supplier_id,
    normalized_unit: normalized(rows[0].unit),
    classification,
    distinct_skus: [...skus].sort(),
    price_row_ids: ids(rows, Number.POSITIVE_INFINITY),
    projected_supplier_products: projectedProducts,
  });
}

const multiSkuSeriesRows = prices.filter((row) => multiSkuSeriesKeys.has(seriesKey(row)));
const mixedSeriesRows = prices.filter((row) => mixedSeriesKeys.has(seriesKey(row)));

const skuAcrossMaterialGroups = [...groupBy(
  prices.filter((row) => normalized(row.supplier_sku)),
  (row) => key(row.organization_id, row.supplier_id, normalized(row.supplier_sku), normalized(row.unit))
).values()].filter((rows) => new Set(rows.map(materialKey)).size > 1);
const skuAcrossMaterialRows = skuAcrossMaterialGroups.flat();

const inconsistentDescriptionGroups = [...groupBy(
  prices.filter((row) => normalized(row.supplier_sku)),
  (row) =>
    key(
      row.organization_id,
      row.material_id,
      row.supplier_id,
      normalized(row.supplier_sku),
      normalized(row.unit)
    )
).values()].filter(
  (rows) =>
    new Set(rows.map((row) => normalized(row.supplier_description)).filter(Boolean)).size > 1
);
const inconsistentDescriptionRows = inconsistentDescriptionGroups.flat();
for (const row of inconsistentDescriptionRows) ambiguousSeriesKeys.add(seriesKey(row));

const blankIdentityRows = prices.filter(
  (row) => !normalized(row.supplier_sku) && !normalized(row.supplier_description)
);
for (const row of blankIdentityRows) ambiguousSeriesKeys.add(seriesKey(row));
const invalidUnitRows = prices.filter((row) => !normalized(row.unit));

const orphanMaterialRows = prices.filter((row) => !materialById.has(row.material_id));
const orphanSupplierRows = prices.filter((row) => !supplierById.has(row.supplier_id));
const orphanBatchRows = prices.filter(
  (row) => row.import_batch_id && !batchById.has(row.import_batch_id)
);
const priceMaterialTenantMismatchRows = prices.filter((row) => {
  const parent = materialById.get(row.material_id);
  return parent && parent.organization_id !== row.organization_id;
});
const priceSupplierTenantMismatchRows = prices.filter((row) => {
  const parent = supplierById.get(row.supplier_id);
  return parent && parent.organization_id !== row.organization_id;
});
const priceBatchTenantMismatchRows = prices.filter((row) => {
  const parent = row.import_batch_id ? batchById.get(row.import_batch_id) : null;
  return parent && parent.organization_id !== row.organization_id;
});
const orphanImportBatchRows = importRows.filter((row) => !batchById.has(row.import_batch_id));
const importBatchTenantMismatchRows = importRows.filter((row) => {
  const parent = batchById.get(row.import_batch_id);
  return parent && parent.organization_id !== row.organization_id;
});
const importMatchedMaterialOrphanRows = importRows.filter(
  (row) => row.matched_material_id && !materialById.has(row.matched_material_id)
);
const importMatchedMaterialTenantMismatchRows = importRows.filter((row) => {
  const parent = row.matched_material_id ? materialById.get(row.matched_material_id) : null;
  return parent && parent.organization_id !== row.organization_id;
});

const duplicateGroups = [...groupBy(
  prices,
  (row) =>
    key(
      row.organization_id,
      row.material_id,
      row.supplier_id,
      normalized(row.unit),
      Number(row.unit_cost),
      normalized(row.currency),
      row.effective_from,
      normalized(row.supplier_sku),
      normalized(row.supplier_description),
      row.source,
      row.import_batch_id
    )
).values()].filter((rows) => rows.length > 1);
const duplicateRows = duplicateGroups.flat();

const currentConflictGroups = [...series.values()].filter(
  (rows) => rows.filter((row) => row.is_current).length > 1
);
const zeroCurrentGroups = [...series.values()].filter(
  (rows) => rows.length > 0 && !rows.some((row) => row.is_current)
);
const currentEffectiveToRows = prices.filter((row) => row.is_current && row.effective_to);
const futureCurrentRows = prices.filter(
  (row) => row.is_current && Date.parse(row.effective_from) > now
);
const expiredCurrentRows = prices.filter(
  (row) => row.is_current && row.effective_to && Date.parse(row.effective_to) < now
);
const impossibleWindowRows = prices.filter(
  (row) => row.effective_to && Date.parse(row.effective_to) < Date.parse(row.effective_from)
);

const overlapPairs = [];
const equalEffectiveTimestampGroups = [];
for (const rows of series.values()) {
  const byTimestamp = groupBy(rows, (row) => row.effective_from);
  for (const timestampRows of byTimestamp.values()) {
    if (timestampRows.length > 1) equalEffectiveTimestampGroups.push(timestampRows);
  }
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      if (intervalsOverlap(rows[left], rows[right])) {
        overlapPairs.push([rows[left], rows[right]]);
      }
    }
  }
}
const overlapRows = overlapPairs.flat();

const preferredCurrentGroups = [...groupBy(
  prices.filter((row) => row.is_current && row.is_preferred),
  materialKey
).values()];
const multiplePreferredGroups = preferredCurrentGroups.filter((rows) => rows.length > 1);
const historicalPreferredRows = prices.filter((row) => row.is_preferred && !row.is_current);
const preferredMissingSupplierRows = prices.filter(
  (row) => row.is_preferred && !supplierById.has(row.supplier_id)
);
const preferredMissingCurrentStateRows = prices.filter(
  (row) => row.is_preferred && (!row.is_current || !row.effective_from)
);
const currentByMaterial = groupBy(prices.filter((row) => row.is_current), materialKey);
const materialsWithoutPreferred = [...currentByMaterial.entries()]
  .filter(([, rows]) => !rows.some((row) => row.is_preferred))
  .map(([groupKey, rows]) => ({
    material_key: groupKey,
    organization_id: rows[0].organization_id,
    material_id: rows[0].material_id,
    current_price_row_ids: ids(rows, Number.POSITIVE_INFINITY),
  }));
const ambiguousPreferredRows = prices.filter(
  (row) => row.is_current && row.is_preferred && ambiguousSeriesKeys.has(seriesKey(row))
);

const importedPrices = prices.filter((row) => row.source === "import");
const importedMissingBatchRows = importedPrices.filter((row) => !row.import_batch_id);
const nonImportRowsWithBatch = prices.filter(
  (row) => row.source !== "import" && row.import_batch_id
);
const importedBatchSupplierMismatchRows = importedPrices.filter((row) => {
  const batch = row.import_batch_id ? batchById.get(row.import_batch_id) : null;
  return batch && batch.supplier_id !== row.supplier_id;
});
const importedPriceLineage = importedPrices.map((price) => {
  const batch = price.import_batch_id ? batchById.get(price.import_batch_id) : null;
  const candidates = batch
    ? importRows.filter((row) => importRowMatchesPrice(row, price, batch))
    : [];
  return { price_id: price.id, candidate_import_row_ids: ids(candidates, Number.POSITIVE_INFINITY) };
});
const deterministicImportedPriceLineage = importedPriceLineage.filter(
  (entry) => entry.candidate_import_row_ids.length === 1
);
const ambiguousImportedPriceLineage = importedPriceLineage.filter(
  (entry) => entry.candidate_import_row_ids.length > 1
);
const missingImportedPriceLineage = importedPriceLineage.filter(
  (entry) => entry.candidate_import_row_ids.length === 0
);
const approvedImportRows = importRows.filter((row) => row.status === "approved");
const approvedRowsWithoutPriceTrace = approvedImportRows.filter((row) => {
  const batch = batchById.get(row.import_batch_id);
  return !batch || !importedPrices.some((price) => importRowMatchesPrice(row, price, batch));
});
const batchesMissingStorageProvenance = batches.filter(
  (batch) => !normalized(batch.storage_path)
);

const blockerRows = new Set();
const reviewRows = new Set();
const addRows = (target, rows) => rows.forEach((row) => target.add(row.id));
addRows(blockerRows, [
  ...orphanMaterialRows,
  ...orphanSupplierRows,
  ...orphanBatchRows,
  ...priceMaterialTenantMismatchRows,
  ...priceSupplierTenantMismatchRows,
  ...priceBatchTenantMismatchRows,
  ...invalidUnitRows,
  ...impossibleWindowRows,
  ...currentConflictGroups.flat(),
  ...overlapRows,
]);
addRows(reviewRows, [
  ...mixedSeriesRows,
  ...skuAcrossMaterialRows,
  ...inconsistentDescriptionRows,
  ...blankIdentityRows,
  ...duplicateRows,
  ...nonImportRowsWithBatch,
  ...importedBatchSupplierMismatchRows,
]);
for (const entry of ambiguousImportedPriceLineage) reviewRows.add(entry.price_id);
for (const rowId of blockerRows) reviewRows.delete(rowId);

const readyRows = prices.filter((row) => !blockerRows.has(row.id) && !reviewRows.has(row.id));
const reviewRequiredRows = prices.filter((row) => reviewRows.has(row.id));
const integrityBlockerRows = prices.filter((row) => blockerRows.has(row.id));

const tenantViolationCount =
  priceMaterialTenantMismatchRows.length +
  priceSupplierTenantMismatchRows.length +
  priceBatchTenantMismatchRows.length +
  importBatchTenantMismatchRows.length +
  importMatchedMaterialTenantMismatchRows.length;
const orphanCount =
  orphanMaterialRows.length +
  orphanSupplierRows.length +
  orphanBatchRows.length +
  orphanImportBatchRows.length +
  importMatchedMaterialOrphanRows.length;
const phase1CReady = integrityBlockerRows.length === 0 && tenantViolationCount === 0 && orphanCount === 0;

const report = {
  audit: "TradesStack Materials Phase 1B Supplier Product preflight",
  generated_at: new Date().toISOString(),
  mode: "read_only",
  inventory: {
    total_price_rows: prices.length,
    current_price_rows: prices.filter((row) => row.is_current).length,
    historical_price_rows: prices.filter((row) => !row.is_current).length,
    preferred_current_rows: prices.filter((row) => row.is_current && row.is_preferred).length,
    manual_source_rows: prices.filter((row) => row.source === "manual").length,
    import_source_rows: importedPrices.length,
    rows_with_sku: prices.filter((row) => normalized(row.supplier_sku)).length,
    rows_without_sku: prices.filter((row) => !normalized(row.supplier_sku)).length,
    rows_with_description: prices.filter((row) => normalized(row.supplier_description)).length,
    rows_without_description: prices.filter((row) => !normalized(row.supplier_description)).length,
    distinct_organizations: new Set(prices.map((row) => row.organization_id)).size,
    distinct_materials: new Set(prices.map((row) => row.material_id)).size,
    distinct_suppliers: new Set(prices.map((row) => row.supplier_id)).size,
    distinct_material_supplier_unit_series: series.size,
    by_organization: Object.fromEntries(
      [...groupBy(prices, (row) => row.organization_id)].map(([organizationId, rows]) => [
        organizationId,
        { total: rows.length, current: rows.filter((row) => row.is_current).length },
      ])
    ),
  },
  grouping: {
    clean_sku_groups: cleanSkuGroups,
    clean_no_sku_groups: cleanNoSkuGroups,
    split_multi_sku_groups: splitMultiSkuGroups,
    mixed_sku_no_sku_groups: mixedSkuNoSkuGroups,
    ambiguous_groups: ambiguousSeriesKeys.size,
    groups_requiring_identity_variant: ambiguousSeriesKeys.size,
    projected_supplier_products: projectedSupplierProducts,
    projected_needs_review: groupingRows.filter((row) =>
      ambiguousSeriesKeys.has(row.series_key)
    ).reduce((total, row) => total + row.projected_supplier_products, 0),
    projected_migrated_unverified: groupingRows.filter(
      (row) => !ambiguousSeriesKeys.has(row.series_key)
    ).reduce((total, row) => total + row.projected_supplier_products, 0),
    groups: groupingRows,
  },
  identity_findings: {
    multi_sku_series: { count: multiSkuSeriesKeys.size, price_row_ids: ids(multiSkuSeriesRows) },
    same_sku_across_materials: {
      count: skuAcrossMaterialGroups.length,
      price_row_ids: ids(skuAcrossMaterialRows),
    },
    inconsistent_descriptions: {
      count: inconsistentDescriptionGroups.length,
      price_row_ids: ids(inconsistentDescriptionRows),
    },
    blank_sku_and_description: { count: blankIdentityRows.length, price_row_ids: ids(blankIdentityRows) },
    invalid_units: { count: invalidUnitRows.length, price_row_ids: ids(invalidUnitRows) },
    suspicious_duplicate_observations: {
      groups: duplicateGroups.length,
      price_row_ids: ids(duplicateRows),
    },
  },
  tenant_integrity: {
    price_material_organization_mismatches: {
      count: priceMaterialTenantMismatchRows.length,
      price_row_ids: ids(priceMaterialTenantMismatchRows),
    },
    price_supplier_organization_mismatches: {
      count: priceSupplierTenantMismatchRows.length,
      price_row_ids: ids(priceSupplierTenantMismatchRows),
    },
    price_import_batch_organization_mismatches: {
      count: priceBatchTenantMismatchRows.length,
      price_row_ids: ids(priceBatchTenantMismatchRows),
    },
    import_row_batch_organization_mismatches: {
      count: importBatchTenantMismatchRows.length,
      import_row_ids: ids(importBatchTenantMismatchRows),
    },
    import_row_material_organization_mismatches: {
      count: importMatchedMaterialTenantMismatchRows.length,
      import_row_ids: ids(importMatchedMaterialTenantMismatchRows),
    },
    orphan_price_materials: { count: orphanMaterialRows.length, price_row_ids: ids(orphanMaterialRows) },
    orphan_price_suppliers: { count: orphanSupplierRows.length, price_row_ids: ids(orphanSupplierRows) },
    orphan_price_batches: { count: orphanBatchRows.length, price_row_ids: ids(orphanBatchRows) },
    orphan_import_row_batches: {
      count: orphanImportBatchRows.length,
      import_row_ids: ids(orphanImportBatchRows),
    },
    orphan_import_row_materials: {
      count: importMatchedMaterialOrphanRows.length,
      import_row_ids: ids(importMatchedMaterialOrphanRows),
    },
  },
  price_history: {
    multiple_current_series: {
      count: currentConflictGroups.length,
      price_row_ids: ids(currentConflictGroups.flat()),
    },
    zero_current_series: { count: zeroCurrentGroups.length, price_row_ids: ids(zeroCurrentGroups.flat()) },
    current_with_effective_to: { count: currentEffectiveToRows.length, price_row_ids: ids(currentEffectiveToRows) },
    future_current: { count: futureCurrentRows.length, price_row_ids: ids(futureCurrentRows) },
    expired_current: { count: expiredCurrentRows.length, price_row_ids: ids(expiredCurrentRows) },
    overlapping_interval_pairs: { count: overlapPairs.length, price_row_ids: ids(overlapRows) },
    equal_effective_timestamp_groups: {
      count: equalEffectiveTimestampGroups.length,
      price_row_ids: ids(equalEffectiveTimestampGroups.flat()),
    },
    impossible_windows: { count: impossibleWindowRows.length, price_row_ids: ids(impossibleWindowRows) },
  },
  preferred_price: {
    multiple_current_preferred_materials: {
      count: multiplePreferredGroups.length,
      price_row_ids: ids(multiplePreferredGroups.flat()),
    },
    historical_preferred: { count: historicalPreferredRows.length, price_row_ids: ids(historicalPreferredRows) },
    preferred_missing_supplier: {
      count: preferredMissingSupplierRows.length,
      price_row_ids: ids(preferredMissingSupplierRows),
    },
    preferred_missing_current_or_effective_state: {
      count: preferredMissingCurrentStateRows.length,
      price_row_ids: ids(preferredMissingCurrentStateRows),
    },
    materials_with_current_prices_but_no_preferred: {
      count: materialsWithoutPreferred.length,
      examples: materialsWithoutPreferred.slice(0, EXAMPLE_LIMIT),
    },
    ambiguous_after_supplier_product_grouping: {
      count: ambiguousPreferredRows.length,
      price_row_ids: ids(ambiguousPreferredRows),
    },
  },
  import_provenance: {
    imported_price_rows: importedPrices.length,
    imported_prices_with_deterministic_import_row: deterministicImportedPriceLineage.length,
    imported_prices_with_ambiguous_import_rows: ambiguousImportedPriceLineage.length,
    imported_prices_without_import_row_match: missingImportedPriceLineage.length,
    imported_prices_missing_batch: {
      count: importedMissingBatchRows.length,
      price_row_ids: ids(importedMissingBatchRows),
    },
    non_import_prices_with_import_batch: {
      count: nonImportRowsWithBatch.length,
      price_row_ids: ids(nonImportRowsWithBatch),
    },
    imported_price_batch_supplier_mismatches: {
      count: importedBatchSupplierMismatchRows.length,
      price_row_ids: ids(importedBatchSupplierMismatchRows),
    },
    approved_rows_without_price_trace: {
      count: approvedRowsWithoutPriceTrace.length,
      import_row_ids: ids(approvedRowsWithoutPriceTrace),
    },
    batches_missing_storage_path: {
      count: batchesMissingStorageProvenance.length,
      import_batch_ids: ids(batchesMissingStorageProvenance),
    },
    ambiguous_lineage_examples: ambiguousImportedPriceLineage.slice(0, EXAMPLE_LIMIT),
    missing_lineage_examples: missingImportedPriceLineage.slice(0, EXAMPLE_LIMIT),
  },
  backfill_classification: {
    READY: readyRows.length,
    REVIEW_REQUIRED: reviewRequiredRows.length,
    INTEGRITY_BLOCKER: integrityBlockerRows.length,
    ready_price_row_ids: ids(readyRows, Number.POSITIVE_INFINITY),
    review_required_price_row_ids: ids(reviewRequiredRows, Number.POSITIVE_INFINITY),
    integrity_blocker_price_row_ids: ids(integrityBlockerRows, Number.POSITIVE_INFINITY),
  },
  phase_1c_verdict: phase1CReady
    ? "READY FOR PHASE 1C BACKFILL"
    : "PHASE 1C BLOCKED — RECONCILIATION REQUIRED",
};

const output = `${JSON.stringify(report, null, 2)}\n`;
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const outputPath = process.argv[outputIndex + 1];
  if (!outputPath) throw new Error("--output requires a file path.");
  await writeFile(outputPath, output, "utf8");
}
process.stdout.write(output);
