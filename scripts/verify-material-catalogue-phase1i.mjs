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
  : "artifacts/materials/supplier-product-phase1i-final.json";
const url = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const organizationId = "5c5de347-9f21-48fa-aac9-ba87e91fe92a";
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const phase1D = JSON.parse(await readFile("artifacts/materials/supplier-product-phase1d-reconciliation.json", "utf8"));
const originalPriceIds = new Set(phase1D.mapping.map((row) => row.price_id));
const originalProductIds = new Set(phase1D.mapping.map((row) => row.supplier_product_id));

const select = async (table, columns = "*") => {
  const { data, error } = await admin.from(table).select(columns).range(0, 9999);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
};
const overlap = (left, right) =>
  Date.parse(left.effective_from) < (right.effective_to ? Date.parse(right.effective_to) : Infinity) &&
  Date.parse(right.effective_from) < (left.effective_to ? Date.parse(left.effective_to) : Infinity);

const [prices, products, assignments, materials, suppliers, batches, rows] = await Promise.all([
  select("organization_material_supplier_prices"),
  select("organization_material_supplier_products"),
  select("organization_material_supplier_product_assignments"),
  select("organization_materials", "id,organization_id"),
  select("organization_suppliers", "id,organization_id"),
  select("organization_material_import_batches"),
  select("organization_material_import_rows"),
]);
const productById = new Map(products.map((row) => [row.id, row]));
const priceById = new Map(prices.map((row) => [row.id, row]));
const materialById = new Map(materials.map((row) => [row.id, row]));
const supplierById = new Map(suppliers.map((row) => [row.id, row]));
const batchById = new Map(batches.map((row) => [row.id, row]));
const originalPrices = prices.filter((row) => originalPriceIds.has(row.id));
const originalHash = sha256(stableStringify(legacyPriceFactSnapshot(originalPrices)));

const intervalOverlaps = [];
for (const [productId, history] of Map.groupBy(prices, (row) => row.supplier_product_id)) {
  for (let left = 0; left < history.length; left += 1) {
    for (let right = left + 1; right < history.length; right += 1) {
      if (overlap(history[left], history[right])) {
        intervalOverlaps.push({ supplier_product_id: productId, price_ids: [history[left].id, history[right].id] });
      }
    }
  }
}

const identityKey = (product) => [
  product.organization_id,
  product.material_id,
  product.supplier_id,
  product.normalized_supplier_sku ?? `description:${product.normalized_supplier_description}`,
  product.normalized_supplier_unit,
  product.identity_variant,
].join("|");
const confirmedActive = products.filter((row) => row.identity_status === "confirmed" && !row.archived_at);
const confirmedIdentityDuplicates = [...Map.groupBy(confirmedActive, identityKey)]
  .filter(([, values]) => values.length > 1)
  .map(([key, values]) => ({ key, supplier_product_ids: values.map((row) => row.id) }));

const assignmentViolations = [];
for (const product of products) {
  const history = assignments
    .filter((row) => row.supplier_product_id === product.id)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  if (history.length === 0) {
    assignmentViolations.push({ supplier_product_id: product.id, reason: "missing_initial_assignment" });
    continue;
  }
  if (history[0].previous_material_id !== null) {
    assignmentViolations.push({ supplier_product_id: product.id, reason: "first_assignment_has_previous_material" });
  }
  for (let index = 1; index < history.length; index += 1) {
    if (history[index].previous_material_id !== history[index - 1].new_material_id) {
      assignmentViolations.push({ supplier_product_id: product.id, reason: "assignment_chain_break" });
    }
  }
  if (history.at(-1)?.new_material_id !== product.material_id) {
    assignmentViolations.push({ supplier_product_id: product.id, reason: "latest_assignment_material_mismatch" });
  }
}

const approvedRows = rows.filter((row) => row.status === "approved");
const provenanceGaps = approvedRows.filter((row) => {
  const product = productById.get(row.approved_supplier_product_id);
  const price = priceById.get(row.approved_supplier_price_id);
  const batch = batchById.get(row.import_batch_id);
  return !product || !price || !batch ||
    price.supplier_product_id !== product.id ||
    price.import_row_id !== row.id ||
    price.import_batch_id !== batch.id ||
    product.organization_id !== row.organization_id ||
    price.organization_id !== row.organization_id;
}).map((row) => row.id);

const invariants = {
  null_supplier_product_price_ids: prices.filter((row) => !row.supplier_product_id).map((row) => row.id),
  product_material_tenant_ids: products.filter((row) => materialById.get(row.material_id)?.organization_id !== row.organization_id).map((row) => row.id),
  product_supplier_tenant_ids: products.filter((row) => supplierById.get(row.supplier_id)?.organization_id !== row.organization_id).map((row) => row.id),
  price_product_material_ids: prices.filter((row) => productById.get(row.supplier_product_id)?.material_id !== row.material_id).map((row) => row.id),
  price_product_supplier_ids: prices.filter((row) => productById.get(row.supplier_product_id)?.supplier_id !== row.supplier_id).map((row) => row.id),
  predecessor_ids: prices.filter((row) => row.supersedes_price_id && priceById.get(row.supersedes_price_id)?.supplier_product_id !== row.supplier_product_id).map((row) => row.id),
  invalid_effective_windows: prices.filter((row) => row.effective_to && Date.parse(row.effective_to) <= Date.parse(row.effective_from)).map((row) => row.id),
  effective_interval_overlaps: intervalOverlaps,
  invalid_preferred_product_ids: products.filter((row) => row.is_preferred && (!row.is_active || row.archived_at)).map((row) => row.id),
  duplicate_preferred_material_ids: [...Map.groupBy(products.filter((row) => row.is_preferred), (row) => `${row.organization_id}:${row.material_id}`)]
    .filter(([, values]) => values.length > 1).map(([key]) => key),
  confirmed_identity_duplicates: confirmedIdentityDuplicates,
  assignment_violations: assignmentViolations,
  import_provenance_gaps: provenanceGaps,
};

const probeProduct = products.find((row) => row.organization_id === organizationId && row.is_active && !row.archived_at);
const probePrice = prices.find((row) => row.supplier_product_id === probeProduct?.id && row.effective_to === null);
if (!probeProduct || !probePrice) throw new Error("A current development Supplier Product is required for Phase 1I probes.");
const probeIds = { nullPrice: crypto.randomUUID(), overlapPrice: crypto.randomUUID(), directProduct: crypto.randomUUID() };
const probe = {};
let authUserId;
let autoOrganizationId;
const stamp = Date.now();
const email = `phase1i-${stamp}@example.com`;
const password = `Phase1I!${stamp}Aa`;

try {
  const nullInsert = await admin.from("organization_material_supplier_prices").insert({
    id: probeIds.nullPrice,
    organization_id: probeProduct.organization_id,
    material_id: probeProduct.material_id,
    supplier_id: probeProduct.supplier_id,
    unit: probeProduct.supplier_unit,
    unit_cost: 1,
    currency: "NZD",
    source: "manual",
  });
  probe.not_null = { rejected: Boolean(nullInsert.error), code: nullInsert.error?.code ?? null };

  const overlapInsert = await admin.from("organization_material_supplier_prices").insert({
    id: probeIds.overlapPrice,
    organization_id: probePrice.organization_id,
    material_id: probePrice.material_id,
    supplier_id: probePrice.supplier_id,
    supplier_product_id: probePrice.supplier_product_id,
    unit: probePrice.unit,
    unit_cost: Number(probePrice.unit_cost) + 1,
    currency: probePrice.currency,
    source: "manual",
    effective_from: probePrice.effective_from,
  });
  probe.overlap = { rejected: Boolean(overlapInsert.error), code: overlapInsert.error?.code ?? null };

  const immutableUpdate = await admin.from("organization_material_supplier_prices")
    .update({ unit_cost: Number(probePrice.unit_cost) + 1 }).eq("id", probePrice.id);
  const preservedPrice = (await admin.from("organization_material_supplier_prices").select("unit_cost").eq("id", probePrice.id).single()).data;
  probe.immutable_fact = {
    rejected: Boolean(immutableUpdate.error),
    code: immutableUpdate.error?.code ?? null,
    value_preserved: Number(preservedPrice?.unit_cost) === Number(probePrice.unit_cost),
  };

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { organization_name: `__PHASE1I_${stamp}` } });
  if (created.error || !created.data.user) throw created.error ?? new Error("Unable to create Phase 1I grant probe user.");
  authUserId = created.data.user.id;
  const autoMembership = await admin.from("organization_members").select("organization_id").eq("user_id", authUserId).limit(1).single();
  if (autoMembership.error) throw autoMembership.error;
  autoOrganizationId = autoMembership.data.organization_id;
  const removeAuto = await admin.from("organization_members").delete().eq("user_id", authUserId);
  if (removeAuto.error) throw removeAuto.error;
  const membership = await admin.from("organization_members").insert({ organization_id: organizationId, user_id: authUserId, role: "admin", display_name: "Phase 1I Grant Probe" });
  if (membership.error) throw membership.error;

  const authenticated = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await authenticated.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const directProduct = await authenticated.from("organization_material_supplier_products").insert({
    id: probeIds.directProduct,
    organization_id: probeProduct.organization_id,
    material_id: probeProduct.material_id,
    supplier_id: probeProduct.supplier_id,
    supplier_description: `__PHASE1I_DIRECT_${stamp}`,
    supplier_unit: probeProduct.supplier_unit,
    identity_status: "confirmed",
  });
  const directPrice = await authenticated.from("organization_material_supplier_prices").insert({
    organization_id: probeProduct.organization_id,
    material_id: probeProduct.material_id,
    supplier_id: probeProduct.supplier_id,
    unit: probeProduct.supplier_unit,
    unit_cost: 1,
    currency: "NZD",
    source: "manual",
  });
  probe.authenticated_direct_product = { rejected: Boolean(directProduct.error), code: directProduct.error?.code ?? null };
  probe.authenticated_direct_price = { rejected: Boolean(directPrice.error), code: directPrice.error?.code ?? null };
  await authenticated.auth.signOut();
} finally {
  await admin.from("organization_material_supplier_prices").delete().in("id", [probeIds.nullPrice, probeIds.overlapPrice]);
  await admin.from("organization_material_supplier_products").delete().eq("id", probeIds.directProduct);
  if (authUserId) {
    await admin.from("organization_members").delete().eq("user_id", authUserId);
    await admin.auth.admin.deleteUser(authUserId);
  }
  if (autoOrganizationId) {
    const autoMembers = await admin.from("organization_members").select("id").eq("organization_id", autoOrganizationId).limit(1);
    if (!autoMembers.error && (autoMembers.data ?? []).length === 0) {
      await admin.from("organizations").delete().eq("id", autoOrganizationId);
    }
  }
}

const [afterPrices, afterProducts] = await Promise.all([
  select("organization_material_supplier_prices"),
  select("organization_material_supplier_products"),
]);
const originalAfter = afterPrices.filter((row) => originalPriceIds.has(row.id));
const hashAfter = sha256(stableStringify(legacyPriceFactSnapshot(originalAfter)));

const report = {
  run_timestamp: new Date().toISOString(),
  phase: "1I final Material Catalogue hardening",
  counts: {
    materials: materials.length,
    supplier_products: products.length,
    prices: prices.length,
    assignments: assignments.length,
    import_batches: batches.length,
    import_rows: rows.length,
    approved_import_rows: approvedRows.length,
    effective_prices: prices.filter((row) => Date.parse(row.effective_from) <= Date.now() && (!row.effective_to || Date.parse(row.effective_to) > Date.now())).length,
  },
  identity_status: Object.fromEntries([...Map.groupBy(products, (row) => row.identity_status)].map(([key, values]) => [key, values.length])),
  invariants,
  probes: probe,
  preservation: {
    original_supplier_products_before: originalProductIds.size,
    original_supplier_products_after: afterProducts.filter((row) => originalProductIds.has(row.id)).length,
    original_prices_before: originalPriceIds.size,
    original_prices_after: originalAfter.length,
    legacy_facts_changed: originalHash === hashAfter ? 0 : null,
    hash_before: originalHash,
    hash_after: hashAfter,
  },
};
report.success =
  Object.values(invariants).every((values) => values.length === 0) &&
  probe.not_null.rejected && probe.not_null.code === "23502" &&
  probe.overlap.rejected && probe.overlap.code === "23P01" &&
  probe.immutable_fact.rejected && probe.immutable_fact.value_preserved &&
  probe.authenticated_direct_product.rejected &&
  probe.authenticated_direct_price.rejected &&
  report.preservation.original_supplier_products_after === 15 &&
  report.preservation.original_prices_after === 17 &&
  report.preservation.hash_before === report.preservation.hash_after &&
  prices.length === afterPrices.length && products.length === afterProducts.length;

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
