import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};

const reconciliationPath = valueAfter(
  "--reconciliation",
  "artifacts/materials/supplier-product-phase1g-final-reconciliation.json"
);
const outputPath = valueAfter(
  "--output",
  "artifacts/materials/supplier-product-phase1g-cutover.json"
);

const [service, importService, adapter, actions, workspace, reconciliationText] =
  await Promise.all([
    readFile("lib/materials/service.ts", "utf8"),
    readFile("lib/materials/import-service.ts", "utf8"),
    readFile("lib/materials/atomic-rpc.ts", "utf8"),
    readFile("app/app/(workspace)/company/materials/actions.ts", "utf8"),
    readFile(
      "app/app/(workspace)/company/materials/CompanyMaterialsWorkspace.tsx",
      "utf8"
    ),
    readFile(reconciliationPath, "utf8"),
  ]);

const reconciliation = JSON.parse(reconciliationText);
const runtimeSources = `${service}\n${importService}`;
const directPriceMutationPattern =
  /\.from\("organization_material_supplier_prices"\)[\s\S]{0,240}?\.(?:insert|update|delete)\(/g;
const directProductMutationPattern =
  /\.from\("organization_material_supplier_products"\)[\s\S]{0,240}?\.(?:insert|update|delete)\(/g;

const rpcNames = [
  "create_supplier_product_with_initial_price",
  "add_supplier_product_price_version",
  "set_preferred_supplier_product",
  "approve_material_import_row",
];
const missingAdapterRpcs = rpcNames.filter((name) => !adapter.includes(`"${name}"`));

const report = {
  run_timestamp: new Date().toISOString(),
  reconciliation_source: reconciliationPath,
  active_writers_before: [
    "manual_material_with_initial_price",
    "manual_price_create",
    "manual_price_update",
    "preferred_supplier_change",
    "import_approval",
  ],
  active_writers_after: {
    manual_material_with_initial_price: "canonical_material_then_atomic_product_price_rpc",
    manual_price_create: "supplier_product_atomic_rpc",
    manual_price_update: "supplier_product_atomic_rpc",
    preferred_supplier_change: "atomic_preference_rpc",
    import_approval: "atomic_import_rpc",
  },
  legacy_direct_price_writers_before: [
    "lib/materials/service.ts:addSupplierPrice",
    "lib/materials/service.ts:makeSupplierPricePreferred",
  ],
  legacy_direct_price_writers_after: runtimeSources.match(directPriceMutationPattern) ?? [],
  direct_supplier_product_writers_after:
    runtimeSources.match(directProductMutationPattern) ?? [],
  missing_adapter_rpcs: missingAdapterRpcs,
  compatibility_entry_points: {
    addSupplierPrice: service.includes("return data;") && service.includes("writeSupplierPriceAtomic"),
    makeSupplierPricePreferred: service.includes("setPreferredSupplierProductAtomic"),
    createMaterialWithInitialSupplierPrice:
      service.includes("createMaterialWithInitialSupplierPrice") &&
      service.includes("idempotencyKey"),
    approveMaterialImportReviewRow:
      importService.includes("approveMaterialImportRowAtomic"),
  },
  idempotency: {
    manual_action_operation_ids:
      actions.includes("idempotencyKey: params.operationId") &&
      workspace.includes("supplierPriceOperationIdRef.current"),
    import_row_key: adapter.includes("`import-row:${params.importRowId}`"),
  },
  supplier_products: reconciliation.supplier_products,
  existing_prices: reconciliation.price_rows,
  attached_prices: reconciliation.attached_prices,
  supplier_product_id_null_rows:
    reconciliation.price_rows - reconciliation.attached_prices,
  preference_parity_mismatches:
    reconciliation.preferred_parity_mismatch_ids?.length ?? null,
  legacy_price_fact_hash: reconciliation.legacy_price_fact_hash,
  legacy_price_fact_hash_matches: reconciliation.legacy_price_fact_hash_matches,
  not_null_applied: false,
  not_null_deferred_reason:
    "Application code has not yet been deployed to the hosted runtime; applying NOT NULL first could break the currently deployed legacy writer.",
  success:
    (runtimeSources.match(directPriceMutationPattern) ?? []).length === 0 &&
    (runtimeSources.match(directProductMutationPattern) ?? []).length === 0 &&
    missingAdapterRpcs.length === 0 &&
    reconciliation.success === true,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.success) process.exitCode = 1;
