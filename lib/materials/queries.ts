import { buildMaterialSummary, resolveCompanyCurrency } from "@/lib/materials/normalization";
import {
  buildEffectiveSupplierProductPrices,
  resolveEffectivePriceIds,
} from "@/lib/materials/effective-price";
import type {
  EffectiveSupplierProductPrice,
  MaterialListSummary,
  MaterialsSupabaseClient,
  OrganizationMaterialRow,
  OrganizationMaterialSupplierPriceRow,
  OrganizationMaterialSupplierProductRow,
  OrganizationMaterialSupplierProductLifecycleEventRow,
  OrganizationMaterialSupplierProductUnitConversionRow,
} from "@/lib/materials/types";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import type { Database } from "@/lib/supabase/types";
import { resolveUniqueOrganizationTaxPolicyAt } from "@/lib/tax/organization-policy-server";
import type { OrganizationTaxPolicy } from "@/lib/tax/types";
import {
  buildSupplierPriceTaxEvidenceReviews,
  type SupplierPriceTaxEvidenceReview,
} from "@/lib/materials/tax-evidence-review";

type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];

export type MaterialLibraryPageData = {
  companyCurrency: string;
  taxPolicy: OrganizationTaxPolicy | null;
  materials: OrganizationMaterialRow[];
  supplierPrices: OrganizationMaterialSupplierPriceRow[];
  supplierProducts: OrganizationMaterialSupplierProductRow[];
  unitConversions: OrganizationMaterialSupplierProductUnitConversionRow[];
  supplierProductLifecycleEvents: OrganizationMaterialSupplierProductLifecycleEventRow[];
  effectiveSupplierProducts: EffectiveSupplierProductPrice[];
  effectivePriceEvaluationTime: string;
  suppliers: OrganizationSupplierRow[];
  costCodes: OrganizationCostCodeRow[];
  materialSummaries: MaterialListSummary[];
  taxEvidenceReviews: SupplierPriceTaxEvidenceReview[];
};

export async function loadMaterialLibraryPageData(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
}) {
  const effectivePriceEvaluationTime = new Date().toISOString();
  const [
    { data: materials, error: materialsError },
    { data: supplierPrices, error: pricesError },
    { data: supplierProducts, error: productsError },
    { data: unitConversions, error: conversionsError },
    { data: lifecycleEvents, error: lifecycleEventsError },
    effectivePriceResolutions,
    { data: suppliers, error: suppliersError },
    { data: costCodes, error: costCodesError },
    { data: organization, error: organizationError },
    { data: priceBindings, error: priceBindingsError },
    taxPolicy,
  ] = await Promise.all([
    params.supabase
      .from("organization_materials")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("updated_at", { ascending: false }),
    params.supabase
      .from("organization_material_supplier_prices")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("updated_at", { ascending: false }),
    params.supabase
      .from("organization_material_supplier_products")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("updated_at", { ascending: false }),
    params.supabase
      .from("organization_material_supplier_product_unit_conversions")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("effective_from", { ascending: false }),
    params.supabase
      .from("organization_material_supplier_product_lifecycle_events")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("created_at", { ascending: false }),
    resolveEffectivePriceIds({
      supabase: params.supabase,
      organizationId: params.organizationId,
      evaluationTime: effectivePriceEvaluationTime,
    }),
    params.supabase
      .from("organization_suppliers")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("company_name", { ascending: true })
      .order("name", { ascending: true }),
    params.supabase
      .from("organization_cost_codes")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("code", { ascending: true }),
    params.supabase
      .from("organizations")
      .select("*")
      .eq("id", params.organizationId)
      .single(),
    params.supabase
      .from("worksheet_material_price_bindings")
      .select("supplier_price_id,binding_state")
      .eq("organization_id", params.organizationId),
    resolveUniqueOrganizationTaxPolicyAt({
      supabase: params.supabase,
      organizationId: params.organizationId,
      effectiveAt: effectivePriceEvaluationTime,
    }).then((resolution) => resolution.policy),
  ]);

  if (materialsError) {
    throw new Error(materialsError.message);
  }
  if (pricesError) {
    throw new Error(pricesError.message);
  }
  if (productsError) {
    throw new Error(productsError.message);
  }
  if (conversionsError) {
    throw new Error(conversionsError.message);
  }
  if (lifecycleEventsError) {
    throw new Error(lifecycleEventsError.message);
  }
  if (suppliersError) {
    throw new Error(suppliersError.message);
  }
  if (costCodesError) {
    throw new Error(costCodesError.message);
  }
  if (organizationError) {
    throw new Error(organizationError.message);
  }
  if (priceBindingsError) {
    throw new Error(priceBindingsError.message);
  }
  const organizationSettings = organization as unknown as {
    country?: string | null;
    default_currency?: string | null;
  };
  const companyCurrency = resolveCompanyCurrency({
    country: organizationSettings.country,
    defaultCurrency: organizationSettings.default_currency,
  });
  const supplierNameById = new Map(
    ((suppliers ?? []) as OrganizationSupplierRow[]).map((supplier) => [
      supplier.id,
      supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier",
    ])
  );
  const costCodeLabelById = new Map(
    ((costCodes ?? []) as OrganizationCostCodeRow[]).map((costCode) => [
      costCode.id,
      `${costCode.code} - ${costCode.name}`,
    ])
  );
  const effectiveSupplierProducts = buildEffectiveSupplierProductPrices({
    supplierProducts: (supplierProducts ?? []) as OrganizationMaterialSupplierProductRow[],
    prices: (supplierPrices ?? []) as OrganizationMaterialSupplierPriceRow[],
    resolutions: effectivePriceResolutions,
    conversions: (unitConversions ?? []) as OrganizationMaterialSupplierProductUnitConversionRow[],
    materialUnitById: new Map(
      ((materials ?? []) as OrganizationMaterialRow[]).map((material) => [material.id, material.default_unit])
    ),
    evaluationTime: effectivePriceEvaluationTime,
    activeOnly: true,
  });
  const offeringsByMaterialId = new Map<string, EffectiveSupplierProductPrice[]>();
  for (const offering of effectiveSupplierProducts) {
    const materialId = offering.supplierProduct.material_id;
    offeringsByMaterialId.set(materialId, [
      ...(offeringsByMaterialId.get(materialId) ?? []),
      offering,
    ]);
  }

  const materialSummaries = ((materials ?? []) as OrganizationMaterialRow[]).map((material) =>
    buildMaterialSummary({
      material,
      effectiveSupplierProducts: offeringsByMaterialId.get(material.id) ?? [],
      supplierNameById,
      costCodeLabelById,
    })
  );
  const taxEvidenceReviews = buildSupplierPriceTaxEvidenceReviews({
    organizationId: params.organizationId,
    organizationName: (organization as unknown as { name?: string | null }).name ?? "Organization",
    materials: (materials ?? []) as OrganizationMaterialRow[],
    suppliers: (suppliers ?? []) as OrganizationSupplierRow[],
    supplierProducts: (supplierProducts ?? []) as OrganizationMaterialSupplierProductRow[],
    supplierPrices: (supplierPrices ?? []) as OrganizationMaterialSupplierPriceRow[],
    bindings: (priceBindings ?? []) as Array<{ supplier_price_id: string; binding_state: string }>,
  });

  return {
    companyCurrency,
    taxPolicy,
    materials: (materials ?? []) as OrganizationMaterialRow[],
    supplierPrices: (supplierPrices ?? []) as OrganizationMaterialSupplierPriceRow[],
    supplierProducts: (supplierProducts ?? []) as OrganizationMaterialSupplierProductRow[],
    unitConversions: (unitConversions ?? []) as OrganizationMaterialSupplierProductUnitConversionRow[],
    supplierProductLifecycleEvents:
      (lifecycleEvents ?? []) as OrganizationMaterialSupplierProductLifecycleEventRow[],
    effectiveSupplierProducts,
    effectivePriceEvaluationTime,
    suppliers: (suppliers ?? []) as OrganizationSupplierRow[],
    costCodes: (costCodes ?? []) as OrganizationCostCodeRow[],
    materialSummaries,
    taxEvidenceReviews,
  } satisfies MaterialLibraryPageData;
}
