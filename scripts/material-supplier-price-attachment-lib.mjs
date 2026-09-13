import { normalizeIdentity, stableStringify } from "./material-supplier-product-backfill-lib.mjs";

export const LEGACY_PRICE_FACT_FIELDS = [
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
];

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

export function legacyPriceFactSnapshot(prices) {
  return prices
    .map((row) =>
      Object.fromEntries(LEGACY_PRICE_FACT_FIELDS.map((field) => [field, row[field] ?? null]))
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function changedLegacyPriceIds(beforeRows, afterRows) {
  const before = new Map(beforeRows.map((row) => [row.id, stableStringify(row)]));
  const after = new Map(afterRows.map((row) => [row.id, stableStringify(row)]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((id) => before.get(id) !== after.get(id))
    .sort();
}

export function buildExactPriceProductMapping(phase1CPreSnapshot, phase1CReconciliation) {
  const mapping = new Map();
  for (const group of phase1CPreSnapshot.groups) {
    const reconciledProductId = phase1CReconciliation.group_to_supplier_product[group.group_key];
    if (!reconciledProductId || reconciledProductId !== group.supplier_product_id) {
      throw new Error(`Phase 1C mapping mismatch for group ${group.group_key}.`);
    }
    for (const priceId of group.source_price_ids) {
      if (mapping.has(priceId)) throw new Error(`Price ${priceId} appears in multiple Phase 1C groups.`);
      mapping.set(priceId, {
        supplier_product_id: reconciledProductId,
        group_key: group.group_key,
        normalized_unit: group.normalized_unit,
      });
    }
  }
  return mapping;
}

export function buildPriceAttachmentPlan({
  prices,
  products,
  materials,
  suppliers,
  phase1CPreSnapshot,
  phase1CReconciliation,
}) {
  const exactMapping = buildExactPriceProductMapping(
    phase1CPreSnapshot,
    phase1CReconciliation
  );
  const productById = new Map(products.map((row) => [row.id, row]));
  const materialById = new Map(materials.map((row) => [row.id, row]));
  const supplierById = new Map(suppliers.map((row) => [row.id, row]));
  const violations = [];
  const blocked = [];

  if (prices.some((row) => row.source === "import")) {
    throw new Error("Imported price rows appeared after Phase 1B; re-audit is required.");
  }
  if (exactMapping.size !== prices.length) {
    throw new Error("Phase 1C mapping does not cover every current price row.");
  }

  const attachments = prices.map((price) => {
    const mapping = exactMapping.get(price.id);
    if (!mapping) throw new Error(`Price ${price.id} is absent from the Phase 1C mapping.`);
    const product = productById.get(mapping.supplier_product_id);
    const material = materialById.get(price.material_id);
    const supplier = supplierById.get(price.supplier_id);
    if (!product) violations.push({ type: "missing_product", price_id: price.id });
    if (!material || material.organization_id !== price.organization_id) {
      violations.push({ type: "material_tenant", price_id: price.id });
    }
    if (!supplier || supplier.organization_id !== price.organization_id) {
      violations.push({ type: "supplier_tenant", price_id: price.id });
    }
    if (
      product &&
      (product.organization_id !== price.organization_id ||
        product.material_id !== price.material_id ||
        product.supplier_id !== price.supplier_id)
    ) {
      violations.push({ type: "product_relationship", price_id: price.id, product_id: product.id });
    }
    if (normalizeIdentity(price.unit) !== mapping.normalized_unit) {
      violations.push({ type: "unit_grouping", price_id: price.id });
    }
    if (price.supplier_product_id && price.supplier_product_id !== mapping.supplier_product_id) {
      blocked.push({ type: "incorrect_existing_attachment", price_id: price.id });
    }
    return {
      price,
      product,
      supplier_product_id: mapping.supplier_product_id,
      supersedes_price_id: null,
    };
  });

  const byProduct = groupBy(attachments, (entry) => entry.supplier_product_id);
  for (const entries of byProduct.values()) {
    const byEffectiveTime = groupBy(entries, (entry) => entry.price.effective_from);
    for (const sameTime of byEffectiveTime.values()) {
      if (sameTime.length > 1) {
        throw new Error(
          `Ambiguous equal effective timestamps: ${sameTime.map((entry) => entry.price.id).join(", ")}`
        );
      }
    }
    entries.sort((left, right) => rowOrder(left.price, right.price));
    for (let index = 0; index < entries.length; index += 1) {
      entries[index].supersedes_price_id = index === 0 ? null : entries[index - 1].price.id;
      const existing = entries[index].price.supersedes_price_id;
      if (existing && existing !== entries[index].supersedes_price_id) {
        blocked.push({ type: "incorrect_existing_predecessor", price_id: entries[index].price.id });
      }
      if (index === 0 && existing) {
        blocked.push({ type: "unexpected_earliest_predecessor", price_id: entries[index].price.id });
      }
    }
  }

  const currentPreferred = prices.filter((row) => row.is_current && row.is_preferred);
  const preferredByMaterial = groupBy(
    currentPreferred,
    (row) => stableStringify([row.organization_id, row.material_id])
  );
  for (const rows of preferredByMaterial.values()) {
    if (rows.length > 1) throw new Error("Multiple current preferred prices exist for a material.");
  }
  const preferredProductIds = new Set(
    currentPreferred.map((price) => exactMapping.get(price.id).supplier_product_id)
  );
  for (const product of products) {
    const shouldBePreferred = preferredProductIds.has(product.id);
    if (product.is_preferred && !shouldBePreferred) {
      blocked.push({ type: "unexpected_existing_preferred_product", product_id: product.id });
    }
  }

  if (violations.length || blocked.length) {
    const error = new Error(
      `Phase 1D blocked by ${violations.length} integrity violations and ${blocked.length} lineage conflicts.`
    );
    error.violations = violations;
    error.blocked = blocked;
    throw error;
  }

  const priceMutations = attachments
    .filter(
      (entry) =>
        entry.price.supplier_product_id !== entry.supplier_product_id ||
        entry.price.supersedes_price_id !== entry.supersedes_price_id
    )
    .map((entry) => ({
      id: entry.price.id,
      organization_id: entry.price.organization_id,
      supplier_product_id: entry.supplier_product_id,
      supersedes_price_id: entry.supersedes_price_id,
      attachment_is_new: !entry.price.supplier_product_id,
      predecessor_is_new:
        Boolean(entry.supersedes_price_id) && !entry.price.supersedes_price_id,
    }));
  const preferredProductMutations = products
    .filter((product) => preferredProductIds.has(product.id) && !product.is_preferred)
    .map((product) => ({ id: product.id, organization_id: product.organization_id }));

  return {
    attachments,
    priceMutations,
    preferredProductMutations,
    preferredProductIds,
    currentPreferred,
  };
}

export function validatePredecessorChains(attachments) {
  const byProduct = groupBy(attachments, (entry) => entry.supplier_product_id);
  const anomalies = [];
  const chains = [];
  for (const [productId, entries] of byProduct) {
    const ordered = [...entries].sort((left, right) => rowOrder(left.price, right.price));
    const seen = new Set();
    for (let index = 0; index < ordered.length; index += 1) {
      const expected = index === 0 ? null : ordered[index - 1].price.id;
      const actual = ordered[index].price.supersedes_price_id;
      if (actual !== expected) anomalies.push({ product_id: productId, price_id: ordered[index].price.id });
      if (actual === ordered[index].price.id || (actual && seen.has(actual) === false && index > 0)) {
        anomalies.push({ product_id: productId, price_id: ordered[index].price.id, type: "cycle_or_gap" });
      }
      seen.add(ordered[index].price.id);
    }
    chains.push({
      supplier_product_id: productId,
      price_count: ordered.length,
      current_price_count: ordered.filter((entry) => entry.price.is_current).length,
      historical_price_count: ordered.filter((entry) => !entry.price.is_current).length,
      oldest_price_id: ordered[0]?.price.id ?? null,
      latest_price_id: ordered.at(-1)?.price.id ?? null,
      predecessor_chain_complete: !anomalies.some((entry) => entry.product_id === productId),
    });
  }
  return { chains: chains.sort((left, right) => left.supplier_product_id.localeCompare(right.supplier_product_id)), anomalies };
}
