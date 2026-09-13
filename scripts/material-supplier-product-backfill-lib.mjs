import { createHash } from "node:crypto";

export const PRICE_PRESERVATION_FIELDS = [
  "id",
  "organization_id",
  "material_id",
  "supplier_id",
  "supplier_sku",
  "supplier_description",
  "unit",
  "unit_cost",
  "currency",
  "is_current",
  "is_preferred",
  "effective_from",
  "effective_to",
  "source",
  "import_batch_id",
  "created_by",
  "created_at",
  "updated_at",
  "supplier_product_id",
  "import_row_id",
  "supersedes_price_id",
];

export function normalizeIdentity(value) {
  const result = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return result || null;
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function deterministicUuid(value) {
  const hex = sha256(value).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const compact = hex.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function rowOrder(left, right) {
  return (
    String(left.effective_from).localeCompare(String(right.effective_from)) ||
    String(left.created_at).localeCompare(String(right.created_at)) ||
    String(left.id).localeCompare(String(right.id))
  );
}

function groupBy(rows, getKey) {
  const groups = new Map();
  for (const row of rows) {
    const groupKey = getKey(row);
    const bucket = groups.get(groupKey) ?? [];
    bucket.push(row);
    groups.set(groupKey, bucket);
  }
  return groups;
}

function latestNonEmpty(rows, field) {
  for (const row of [...rows].sort(rowOrder).reverse()) {
    const value = String(row[field] ?? "").trim();
    if (value) return value;
  }
  return null;
}

function observationTime(row) {
  return row.effective_from || row.created_at;
}

function buildProductGroup({ rows, seriesCase, discriminator }) {
  const ordered = [...rows].sort(rowOrder);
  const first = ordered[0];
  const last = ordered.at(-1);
  const normalizedUnit = normalizeIdentity(first.unit);
  const normalizedSku = normalizeIdentity(latestNonEmpty(ordered, "supplier_sku"));
  const supplierDescription = latestNonEmpty(ordered, "supplier_description");
  const normalizedDescription = normalizeIdentity(supplierDescription);
  const groupKey = stableStringify([
    first.organization_id,
    first.material_id,
    first.supplier_id,
    normalizedUnit,
    discriminator,
  ]);
  const productId = deterministicUuid(`tradesstack:supplier-product:v1:${groupKey}`);
  const blankIdentity = !normalizedSku && !normalizedDescription;
  const identityVariant = blankIdentity
    ? `migration-review:${sha256(groupKey).slice(0, 16)}`
    : "default";
  const sourcePriceIds = ordered.map((row) => row.id);
  const createdBy = ordered.find((row) => row.created_by)?.created_by ?? null;
  const firstSeenAt = observationTime(first);
  const lastSeenAt = observationTime(last);
  const sourceEvidence = ordered.map((row) => ({
    id: row.id,
    supplier_sku: row.supplier_sku,
    supplier_description: row.supplier_description,
    unit: row.unit,
    effective_from: row.effective_from,
    created_at: row.created_at,
    is_current: row.is_current,
    is_preferred: row.is_preferred,
  }));

  const product = {
    id: productId,
    organization_id: first.organization_id,
    material_id: first.material_id,
    supplier_id: first.supplier_id,
    supplier_sku: latestNonEmpty(ordered, "supplier_sku"),
    supplier_description: supplierDescription,
    supplier_unit: String(last.unit).trim(),
    identity_variant: identityVariant,
    identity_status: blankIdentity ? "needs_review" : "migrated_unverified",
    is_preferred: false,
    is_active: true,
    archived_at: null,
    archived_by: null,
    created_source: "migration",
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    created_by: createdBy,
    updated_by: null,
    metadata: {
      migration_phase: "materials_phase_1c",
      migration_group_key: groupKey,
      series_case: seriesCase,
      source_price_ids: sourcePriceIds,
      source_evidence_hash: sha256(stableStringify(sourceEvidence)),
      preferred_mapping_deferred: true,
    },
    pack_quantity: null,
    pack_unit: null,
  };

  const assignment = {
    id: deterministicUuid(`tradesstack:supplier-product-assignment:v1:${productId}:initial`),
    organization_id: first.organization_id,
    supplier_product_id: productId,
    previous_material_id: null,
    new_material_id: first.material_id,
    reason: "Phase 1C migration initial material assignment",
    source_import_row_id: null,
    created_by: createdBy,
    created_at: firstSeenAt,
    metadata: {
      migration_phase: "materials_phase_1c",
      migration_group_key: groupKey,
      event_kind: "initial_assignment",
      source_price_ids: sourcePriceIds,
    },
  };

  return {
    group_key: groupKey,
    series_case: seriesCase,
    normalized_unit: normalizedUnit,
    normalized_sku: normalizedSku,
    normalized_description: normalizedDescription,
    source_price_ids: sourcePriceIds,
    source_rows: ordered,
    product,
    assignment,
  };
}

export function buildSupplierProductPlan(prices) {
  const series = groupBy(
    prices,
    (row) =>
      stableStringify([
        row.organization_id,
        row.material_id,
        row.supplier_id,
        normalizeIdentity(row.unit),
      ])
  );
  const groups = [];
  const counts = {
    sku_backed_groups: 0,
    no_sku_groups: 0,
    multi_sku_split_series: 0,
    mixed_sku_no_sku_series: 0,
    ambiguous_groups: 0,
  };

  for (const rows of series.values()) {
    const skuGroups = groupBy(
      rows.filter((row) => normalizeIdentity(row.supplier_sku)),
      (row) => normalizeIdentity(row.supplier_sku)
    );
    const noSkuRows = rows.filter((row) => !normalizeIdentity(row.supplier_sku));

    if (skuGroups.size > 0 && noSkuRows.length > 0) {
      counts.mixed_sku_no_sku_series += 1;
      const error = new Error("Mixed SKU/no-SKU history requires review before Phase 1C.");
      error.code = "MIXED_SKU_NO_SKU";
      error.priceRowIds = rows.map((row) => row.id).sort();
      throw error;
    }

    if (skuGroups.size === 0) {
      const group = buildProductGroup({ rows, seriesCase: "no_sku", discriminator: "no-sku" });
      groups.push(group);
      counts.no_sku_groups += 1;
      if (group.product.identity_status === "needs_review") counts.ambiguous_groups += 1;
      continue;
    }

    if (skuGroups.size > 1) counts.multi_sku_split_series += 1;
    for (const [sku, skuRows] of [...skuGroups].sort(([left], [right]) => left.localeCompare(right))) {
      groups.push(
        buildProductGroup({
          rows: skuRows,
          seriesCase: skuGroups.size > 1 ? "multi_sku_split" : "single_sku",
          discriminator: `sku:${sku}`,
        })
      );
      counts.sku_backed_groups += 1;
    }
  }

  groups.sort((left, right) => left.group_key.localeCompare(right.group_key));
  return { groups, counts };
}

export function assertTenantIntegrity(plan, materials, suppliers) {
  const materialById = new Map(materials.map((row) => [row.id, row]));
  const supplierById = new Map(suppliers.map((row) => [row.id, row]));
  const violations = [];

  for (const group of plan.groups) {
    const product = group.product;
    const material = materialById.get(product.material_id);
    const supplier = supplierById.get(product.supplier_id);
    if (!material || material.organization_id !== product.organization_id) {
      violations.push({ type: "material", product_id: product.id, material_id: product.material_id });
    }
    if (!supplier || supplier.organization_id !== product.organization_id) {
      violations.push({ type: "supplier", product_id: product.id, supplier_id: product.supplier_id });
    }
    if (
      group.assignment.organization_id !== product.organization_id ||
      group.assignment.new_material_id !== product.material_id
    ) {
      violations.push({ type: "assignment", product_id: product.id });
    }
  }
  return violations;
}

export function pricePreservationSnapshot(prices) {
  return prices
    .map((row) =>
      Object.fromEntries(PRICE_PRESERVATION_FIELDS.map((field) => [field, row[field] ?? null]))
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function changedPriceIds(beforeRows, afterRows) {
  const before = new Map(beforeRows.map((row) => [row.id, stableStringify(row)]));
  const after = new Map(afterRows.map((row) => [row.id, stableStringify(row)]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((id) => before.get(id) !== after.get(id))
    .sort();
}

export function productNaturalKey(product) {
  return stableStringify([
    product.organization_id,
    product.material_id,
    product.supplier_id,
    normalizeIdentity(product.supplier_sku) ?? `description:${normalizeIdentity(product.supplier_description) ?? "blank"}`,
    normalizeIdentity(product.supplier_unit),
    product.identity_variant,
  ]);
}

export function findDuplicateValues(values) {
  return [...groupBy(values, (value) => value).entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([value]) => value)
    .sort();
}
