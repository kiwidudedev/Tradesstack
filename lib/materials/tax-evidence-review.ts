import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MaterialsSupabaseClient,
  OrganizationMaterialRow,
  OrganizationMaterialSupplierPriceRow,
  OrganizationMaterialSupplierProductRow,
} from "@/lib/materials/types";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import { policyFromPriceSnapshot } from "@/lib/materials/effective-price";
import { normalizePriceTaxBasis } from "@/lib/tax/normalize-price";
import type { SourceTaxBasis } from "@/lib/tax/types";

export type SupplierPriceTaxReviewClassification =
  | "complete"
  | "source_basis_unknown"
  | "source_proven_comparison_missing"
  | "unsupported_tax_jurisdiction"
  | "tax_rate_conflict";

export type SupplierPriceTaxEvidenceReview = {
  organizationId: string;
  organizationName: string;
  dataClass: "business" | "verification";
  materialId: string;
  materialName: string;
  supplierId: string;
  supplierName: string;
  supplierProductId: string | null;
  supplierProductDescription: string | null;
  supplierPriceId: string;
  amount: number;
  unit: string;
  currency: string;
  sourceTaxBasis: SourceTaxBasis;
  sourceTaxRate: number | null;
  jurisdictionCode: string | null;
  comparisonTaxBasis: string | null;
  comparisonTaxRate: number | null;
  snapshotStatus: string;
  source: string;
  importBatchId: string | null;
  importRowId: string | null;
  effectiveFrom: string;
  createdAt: string;
  isCurrent: boolean;
  productIsActive: boolean;
  productIsSearchable: boolean;
  productIsPreferred: boolean;
  workbookBindingCount: number;
  classification: SupplierPriceTaxReviewClassification;
  needsReview: boolean;
  sourceEvidenceExcerpt: string | null;
};

type Binding = { supplier_price_id: string; binding_state: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceEvidenceExcerpt(price: OrganizationMaterialSupplierPriceRow) {
  const queue: unknown[] = [price.tax_evidence];
  while (queue.length > 0) {
    const evidence = asRecord(queue.shift());
    for (const key of ["documentExcerpt", "excerpt", "userNote", "taxEvidence"]) {
      if (typeof evidence[key] === "string" && evidence[key].trim()) return evidence[key].trim();
    }
    for (const value of Object.values(evidence)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return null;
}

export function classifySupplierPriceTaxEvidence(price: OrganizationMaterialSupplierPriceRow): {
  classification: SupplierPriceTaxReviewClassification;
  snapshotStatus: string;
} {
  const policy = policyFromPriceSnapshot(price);
  const normalized = normalizePriceTaxBasis({
    sourceAmount: Number(price.unit_cost),
    sourceTaxBasis: price.source_tax_basis as SourceTaxBasis,
    sourceTaxRate: price.source_tax_rate,
    policy,
  });
  if (normalized.status === "normalized") return { classification: "complete", snapshotStatus: "normalized" };
  if (normalized.status === "unknown_tax_basis") {
    return { classification: "source_basis_unknown", snapshotStatus: normalized.status };
  }
  if (normalized.status === "unsupported_tax_jurisdiction") {
    return { classification: "unsupported_tax_jurisdiction", snapshotStatus: normalized.status };
  }
  if (normalized.status === "tax_rate_conflict") {
    return { classification: "tax_rate_conflict", snapshotStatus: normalized.status };
  }
  return { classification: "source_proven_comparison_missing", snapshotStatus: "missing_tax_policy" };
}

export function buildSupplierPriceTaxEvidenceReviews(params: {
  organizationId: string;
  organizationName: string;
  materials: OrganizationMaterialRow[];
  suppliers: OrganizationSupplierRow[];
  supplierProducts: OrganizationMaterialSupplierProductRow[];
  supplierPrices: OrganizationMaterialSupplierPriceRow[];
  bindings?: Binding[];
}) {
  const materialById = new Map(params.materials.map((row) => [row.id, row]));
  const supplierById = new Map(params.suppliers.map((row) => [row.id, row]));
  const productById = new Map(params.supplierProducts.map((row) => [row.id, row]));
  const bindingCounts = new Map<string, number>();
  for (const binding of params.bindings ?? []) {
    bindingCounts.set(binding.supplier_price_id, (bindingCounts.get(binding.supplier_price_id) ?? 0) + 1);
  }
  const verification = /verif|test|fixture/i.test(params.organizationName)
    || params.supplierProducts.some((row) => row.supplier_description?.startsWith("cci-v2-live-"));

  return params.supplierPrices.map((price): SupplierPriceTaxEvidenceReview => {
    const material = materialById.get(price.material_id);
    const supplier = supplierById.get(price.supplier_id);
    const product = price.supplier_product_id ? productById.get(price.supplier_product_id) : undefined;
    const result = classifySupplierPriceTaxEvidence(price);
    return {
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      dataClass: verification ? "verification" : "business",
      materialId: price.material_id,
      materialName: material?.name ?? "Unknown Material",
      supplierId: price.supplier_id,
      supplierName: supplier?.company_name?.trim() || supplier?.name?.trim() || "Unknown supplier",
      supplierProductId: price.supplier_product_id,
      supplierProductDescription: product?.supplier_description ?? price.supplier_description,
      supplierPriceId: price.id,
      amount: Number(price.unit_cost),
      unit: price.unit,
      currency: price.currency,
      sourceTaxBasis: price.source_tax_basis as SourceTaxBasis,
      sourceTaxRate: price.source_tax_rate,
      jurisdictionCode: price.tax_jurisdiction_code,
      comparisonTaxBasis: price.comparison_tax_basis,
      comparisonTaxRate: price.comparison_tax_rate,
      snapshotStatus: result.snapshotStatus,
      source: price.source,
      importBatchId: price.import_batch_id,
      importRowId: price.import_row_id,
      effectiveFrom: price.effective_from,
      createdAt: price.created_at,
      isCurrent: price.is_current,
      productIsActive: Boolean(product?.is_active && !product.archived_at),
      productIsSearchable: Boolean(product?.is_active && !product.archived_at && material?.is_active),
      productIsPreferred: Boolean(product?.is_preferred),
      workbookBindingCount: bindingCounts.get(price.id) ?? 0,
      classification: result.classification,
      needsReview: result.classification !== "complete",
      sourceEvidenceExcerpt: sourceEvidenceExcerpt(price),
    };
  });
}

export async function loadSupplierPriceTaxEvidenceReviews(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
}) {
  const client = params.supabase as unknown as SupabaseClient;
  const [organizationResult, materialResult, supplierResult, productResult, priceResult, bindingResult] = await Promise.all([
    client.from("organizations").select("id,name").eq("id", params.organizationId).single(),
    client.from("organization_materials").select("*").eq("organization_id", params.organizationId),
    client.from("organization_suppliers").select("*").eq("organization_id", params.organizationId),
    client.from("organization_material_supplier_products").select("*").eq("organization_id", params.organizationId),
    client.from("organization_material_supplier_prices").select("*").eq("organization_id", params.organizationId),
    client.from("worksheet_material_price_bindings").select("supplier_price_id,binding_state").eq("organization_id", params.organizationId),
  ]);
  const failure = [organizationResult, materialResult, supplierResult, productResult, priceResult, bindingResult]
    .find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
  return buildSupplierPriceTaxEvidenceReviews({
    organizationId: params.organizationId,
    organizationName: (organizationResult.data as { name?: string | null }).name ?? "Organization",
    materials: (materialResult.data ?? []) as OrganizationMaterialRow[],
    suppliers: (supplierResult.data ?? []) as OrganizationSupplierRow[],
    supplierProducts: (productResult.data ?? []) as OrganizationMaterialSupplierProductRow[],
    supplierPrices: (priceResult.data ?? []) as OrganizationMaterialSupplierPriceRow[],
    bindings: (bindingResult.data ?? []) as Binding[],
  });
}
