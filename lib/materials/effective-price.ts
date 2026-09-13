import type {
  EffectiveSupplierProductPrice,
  MaterialBestCost,
  MaterialsSupabaseClient,
  OrganizationMaterialSupplierPriceRow,
  OrganizationMaterialSupplierProductRow,
  OrganizationMaterialSupplierProductUnitConversionRow,
} from "@/lib/materials/types";
import { normalizeMaterialConversionUnit } from "@/lib/materials/unit-conversion/normalize-unit";
import { calculateComparableMaterialUnitCost } from "@/lib/materials/unit-conversion/pricing";
import { normalizePriceTaxBasis, type TaxNormalizationResult } from "@/lib/tax/normalize-price";
import type { OrganizationTaxPolicy, SourceTaxBasis, TaxComparisonBasis } from "@/lib/tax/types";

const normalizeUnit = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizePriceCurrency = (value: string | null | undefined) =>
  (value ?? "NZD").trim().toUpperCase() || "NZD";

export type EffectivePriceResolutionRow = {
  supplierProductId: string;
  priceId: string;
};

export type ComparableMaterialPrice = {
  effectiveConversion: OrganizationMaterialSupplierProductUnitConversionRow | null;
  comparableUnitCost: number | null;
  comparisonUnit: string | null;
  normalizedSupplierUnitCost: number | null;
  taxNormalization: TaxNormalizationResult | null;
  comparisonTaxBasis: TaxComparisonBasis | null;
  comparisonStatus: "comparable" | "unavailable" | "non_comparable" | "unknown_tax_basis" | "unsupported_tax_jurisdiction" | "missing_tax_policy" | "tax_rate_conflict";
  comparisonReason?: "non_comparable_unit" | null;
};

export function policyFromPriceSnapshot(price: OrganizationMaterialSupplierPriceRow): OrganizationTaxPolicy | null {
  if (!price.tax_jurisdiction_code || !price.comparison_tax_basis || price.comparison_tax_rate === null) return null;
  const snapshot = price.tax_policy_snapshot && typeof price.tax_policy_snapshot === "object" && !Array.isArray(price.tax_policy_snapshot)
    ? price.tax_policy_snapshot as Record<string, unknown> : {};
  return {
    id: typeof snapshot.policyId === "string" ? snapshot.policyId : null,
    organizationId: price.organization_id,
    jurisdictionCode: price.tax_jurisdiction_code,
    taxName: typeof snapshot.taxName === "string" ? snapshot.taxName : "Tax",
    registrationStatus: snapshot.registrationStatus === "registered" || snapshot.registrationStatus === "unregistered" ? snapshot.registrationStatus : "unknown",
    comparisonBasis: price.comparison_tax_basis as TaxComparisonBasis,
    standardRate: Number(price.comparison_tax_rate),
    supportsInclusiveExclusive: snapshot.supportsInclusiveExclusive === true,
    effectiveFrom: typeof snapshot.effectiveFrom === "string" ? snapshot.effectiveFrom : price.effective_from,
    effectiveTo: typeof snapshot.effectiveTo === "string" ? snapshot.effectiveTo : null,
    policySource: typeof snapshot.policySource === "string" ? snapshot.policySource : "immutable_price_snapshot",
  };
}

type EffectivePriceRpcClient = {
  rpc: (
    name: "resolve_material_supplier_product_prices",
    args: {
      p_organization_id: string;
      p_evaluation_time: string;
      p_supplier_product_ids: string[] | null;
    }
  ) => Promise<{
    data: Array<{ supplier_product_id: string; price_id: string }> | null;
    error: { message: string } | null;
  }>;
};

function timestamp(value: string | Date) {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(result)) {
    throw new Error("A valid effective-price evaluation timestamp is required.");
  }
  return result;
}

export function isMaterialPriceEffectiveAt(
  price: Pick<OrganizationMaterialSupplierPriceRow, "effective_from" | "effective_to">,
  evaluationTime: string | Date
) {
  const evaluation = timestamp(evaluationTime);
  const effectiveFrom = timestamp(price.effective_from);
  const effectiveTo = price.effective_to ? timestamp(price.effective_to) : Number.POSITIVE_INFINITY;
  return effectiveFrom <= evaluation && effectiveTo > evaluation;
}

export function resolveEffectivePriceRows(params: {
  prices: OrganizationMaterialSupplierPriceRow[];
  evaluationTime: string | Date;
}) {
  const effectiveByProduct = new Map<string, OrganizationMaterialSupplierPriceRow>();

  for (const price of params.prices) {
    if (!price.supplier_product_id || !isMaterialPriceEffectiveAt(price, params.evaluationTime)) {
      continue;
    }
    if (effectiveByProduct.has(price.supplier_product_id)) {
      throw new Error(
        `materials_phase1h:effective_price_interval_conflict:${price.supplier_product_id}`
      );
    }
    effectiveByProduct.set(price.supplier_product_id, price);
  }

  return effectiveByProduct;
}

export function findEffectivePriceIntervalConflicts(
  prices: OrganizationMaterialSupplierPriceRow[]
) {
  const conflicts: Array<{ supplierProductId: string; priceIds: [string, string] }> = [];
  const pricesByProduct = new Map<string, OrganizationMaterialSupplierPriceRow[]>();

  for (const price of prices) {
    if (!price.supplier_product_id) continue;
    pricesByProduct.set(price.supplier_product_id, [
      ...(pricesByProduct.get(price.supplier_product_id) ?? []),
      price,
    ]);
  }

  for (const [supplierProductId, productPrices] of pricesByProduct) {
    for (let leftIndex = 0; leftIndex < productPrices.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < productPrices.length; rightIndex += 1) {
        const left = productPrices[leftIndex];
        const right = productPrices[rightIndex];
        const leftFrom = timestamp(left.effective_from);
        const leftTo = left.effective_to ? timestamp(left.effective_to) : Number.POSITIVE_INFINITY;
        const rightFrom = timestamp(right.effective_from);
        const rightTo = right.effective_to ? timestamp(right.effective_to) : Number.POSITIVE_INFINITY;
        if (leftFrom < rightTo && rightFrom < leftTo) {
          conflicts.push({ supplierProductId, priceIds: [left.id, right.id] });
        }
      }
    }
  }

  return conflicts;
}

export async function resolveEffectivePriceIds(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  evaluationTime?: string | Date;
  supplierProductIds?: string[];
}): Promise<EffectivePriceResolutionRow[]> {
  const evaluationTime = params.evaluationTime ?? new Date();
  const evaluationIso = new Date(timestamp(evaluationTime)).toISOString();
  const { data, error } = await (params.supabase as unknown as EffectivePriceRpcClient).rpc(
    "resolve_material_supplier_product_prices",
    {
      p_organization_id: params.organizationId,
      p_evaluation_time: evaluationIso,
      p_supplier_product_ids: params.supplierProductIds?.length
        ? params.supplierProductIds
        : null,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    supplierProductId: row.supplier_product_id,
    priceId: row.price_id,
  }));
}

export function deriveComparableMaterialPrice(params: {
  sourceUnitCost: number;
  sourceUnit: string;
  materialUnit: string | null | undefined;
  effectiveConversion?: OrganizationMaterialSupplierProductUnitConversionRow | null;
  sourceTaxBasis?: SourceTaxBasis;
  sourceTaxRate?: number | null;
  taxPolicy?: OrganizationTaxPolicy | null;
}): ComparableMaterialPrice {
  const legacyUntaxedPolicy: OrganizationTaxPolicy = {
    id: null, organizationId: "", jurisdictionCode: "NO_TAX", taxName: "Tax",
    registrationStatus: "unknown", comparisonBasis: "exclusive", standardRate: 0,
    supportsInclusiveExclusive: true, effectiveFrom: "1970-01-01T00:00:00.000Z",
    effectiveTo: null, policySource: "explicit_untaxed_call",
  };
  const taxNormalization = normalizePriceTaxBasis({
    sourceAmount: params.sourceUnitCost,
    sourceTaxBasis: params.sourceTaxBasis ?? "no_tax",
    sourceTaxRate: params.sourceTaxRate,
    policy: params.sourceTaxBasis === undefined ? legacyUntaxedPolicy : params.taxPolicy ?? null,
  });
  const common = {
    taxNormalization,
    normalizedSupplierUnitCost: taxNormalization.normalizedAmount,
    comparisonTaxBasis: taxNormalization.comparisonBasis,
  };
  if (taxNormalization.status !== "normalized") return {
    ...common, effectiveConversion: null, comparableUnitCost: null,
    comparisonUnit: params.materialUnit ? normalizeMaterialConversionUnit(params.materialUnit) : null,
    comparisonStatus: taxNormalization.status,
  };
  const materialUnit = params.materialUnit
    ? normalizeMaterialConversionUnit(params.materialUnit)
    : null;
  if (!materialUnit) {
    return {
      effectiveConversion: null,
      comparableUnitCost: null,
      comparisonUnit: null,
      ...common, comparisonStatus: "unavailable",
    };
  }

  const sourceUnit = normalizeMaterialConversionUnit(params.sourceUnit);
  if (sourceUnit === materialUnit) {
    return {
      effectiveConversion: null,
      comparableUnitCost: Number(taxNormalization.normalizedAmount),
      comparisonUnit: materialUnit,
      ...common, comparisonStatus: "comparable",
    };
  }

  const conversion = params.effectiveConversion ?? null;
  if (
    !conversion
    || normalizeMaterialConversionUnit(conversion.supplier_unit) !== sourceUnit
    || normalizeMaterialConversionUnit(conversion.material_unit) !== materialUnit
  ) {
    return {
      effectiveConversion: null,
      comparableUnitCost: null,
      comparisonUnit: materialUnit,
      ...common, comparisonStatus: "non_comparable", comparisonReason: "non_comparable_unit",
    };
  }

  return {
    effectiveConversion: conversion,
    comparableUnitCost: calculateComparableMaterialUnitCost({
      supplierUnitCost: Number(taxNormalization.normalizedAmount),
      supplierQuantity: Number(conversion.supplier_quantity),
      materialQuantity: Number(conversion.material_quantity),
    }),
    comparisonUnit: materialUnit,
    ...common, comparisonStatus: "comparable",
  };
}

export function resolveSupplierPriceComparisonAt(params: {
  price: OrganizationMaterialSupplierPriceRow;
  materialUnit: string | null | undefined;
  conversions: OrganizationMaterialSupplierProductUnitConversionRow[];
  evaluationTime?: string | Date;
}): ComparableMaterialPrice {
  const materialUnit = params.materialUnit
    ? normalizeMaterialConversionUnit(params.materialUnit)
    : null;
  const effectiveConversion = materialUnit
    ? resolveEffectiveConversionRows({
        conversions: params.conversions,
        evaluationTime: params.evaluationTime ?? params.price.effective_from,
      }).get(`${params.price.supplier_product_id}|${materialUnit}`) ?? null
    : null;

  return deriveComparableMaterialPrice({
    sourceUnitCost: Number(params.price.unit_cost),
    sourceUnit: params.price.unit,
    materialUnit,
    effectiveConversion,
    sourceTaxBasis: params.price.source_tax_basis as SourceTaxBasis,
    sourceTaxRate: params.price.source_tax_rate,
    taxPolicy: policyFromPriceSnapshot(params.price),
  });
}

export function buildEffectiveSupplierProductPrices(params: {
  supplierProducts: OrganizationMaterialSupplierProductRow[];
  prices: OrganizationMaterialSupplierPriceRow[];
  resolutions: EffectivePriceResolutionRow[];
  conversions?: OrganizationMaterialSupplierProductUnitConversionRow[];
  materialUnitById?: Map<string, string>;
  evaluationTime?: string | Date;
  activeOnly?: boolean;
}): EffectiveSupplierProductPrice[] {
  const priceById = new Map(params.prices.map((price) => [price.id, price]));
  const priceIdByProductId = new Map(
    params.resolutions.map((resolution) => [resolution.supplierProductId, resolution.priceId])
  );
  const evaluationTime = params.evaluationTime ?? new Date();
  const effectiveConversions = resolveEffectiveConversionRows({
    conversions: params.conversions ?? [],
    evaluationTime,
  });

  return params.supplierProducts
    .filter((product) => !params.activeOnly || (product.is_active && !product.archived_at))
    .map((supplierProduct) => {
      const effectivePrice = priceById.get(priceIdByProductId.get(supplierProduct.id) ?? "") ?? null;
      const materialUnit = params.materialUnitById?.get(supplierProduct.material_id) ?? null;
      const supplierUnit = effectivePrice?.unit || supplierProduct.supplier_unit;
      const effectiveConversion = materialUnit
        ? effectiveConversions.get(`${supplierProduct.id}|${normalizeMaterialConversionUnit(materialUnit)}`) ?? null
        : null;
      if (!effectivePrice) {
        return { supplierProduct, effectivePrice, effectiveConversion, comparableUnitCost: null, normalizedSupplierUnitCost: null, taxNormalization: null, comparisonTaxBasis: null, comparisonUnit: materialUnit, comparisonStatus: "unavailable" as const };
      }
      return {
        supplierProduct,
        effectivePrice,
        ...deriveComparableMaterialPrice({
          sourceUnitCost: Number(effectivePrice.unit_cost),
          sourceUnit: supplierUnit,
          materialUnit,
          effectiveConversion,
          sourceTaxBasis: effectivePrice.source_tax_basis as SourceTaxBasis,
          sourceTaxRate: effectivePrice.source_tax_rate,
          taxPolicy: policyFromPriceSnapshot(effectivePrice),
        }),
      };
    });
}

export function isMaterialUnitConversionEffectiveAt(
  conversion: Pick<OrganizationMaterialSupplierProductUnitConversionRow, "effective_from" | "effective_to">,
  evaluationTime: string | Date
) {
  const evaluation = timestamp(evaluationTime);
  const effectiveFrom = timestamp(conversion.effective_from);
  const effectiveTo = conversion.effective_to ? timestamp(conversion.effective_to) : Number.POSITIVE_INFINITY;
  return effectiveFrom <= evaluation && effectiveTo > evaluation;
}

export function resolveEffectiveConversionRows(params: {
  conversions: OrganizationMaterialSupplierProductUnitConversionRow[];
  evaluationTime: string | Date;
}) {
  const result = new Map<string, OrganizationMaterialSupplierProductUnitConversionRow>();
  for (const conversion of params.conversions) {
    if (!isMaterialUnitConversionEffectiveAt(conversion, params.evaluationTime)) continue;
    const key = `${conversion.supplier_product_id}|${normalizeMaterialConversionUnit(conversion.material_unit)}`;
    if (result.has(key)) throw new Error(`materials_unit_conversion:effective_interval_conflict:${conversion.supplier_product_id}`);
    result.set(key, conversion);
  }
  return result;
}

function comparisonBasis(offering: EffectiveSupplierProductPrice) {
  const price = offering.effectivePrice;
  if (!price) return null;
  return [
    normalizePriceCurrency(price.currency),
    normalizeUnit(offering.comparisonUnit ?? price.unit ?? offering.supplierProduct.supplier_unit),
    offering.effectiveConversion ? "no-pack" : offering.supplierProduct.pack_quantity ?? "no-pack",
    offering.effectiveConversion ? "" : normalizeUnit(offering.supplierProduct.pack_unit),
    offering.comparisonTaxBasis ?? "unknown-tax-basis",
  ].join("|");
}

export function resolveComparableBestCost(
  offerings: EffectiveSupplierProductPrice[]
): MaterialBestCost {
  const priced = offerings.filter(
    (offering): offering is EffectiveSupplierProductPrice & {
      effectivePrice: OrganizationMaterialSupplierPriceRow;
    } => Boolean(offering.effectivePrice)
  );
  if (priced.length === 0) return { status: "unavailable", price: null };

  const comparable = priced.filter((offering) =>
    offering.comparisonStatus === undefined || offering.comparisonStatus === "comparable"
  );
  if (comparable.length === 0) return { status: "non_comparable", price: null };

  const bases = new Set(comparable.map(comparisonBasis));
  if (bases.size !== 1) return { status: "non_comparable", price: null };

  const bestOffering = comparable.reduce((lowest, offering) =>
    Number(offering.comparableUnitCost ?? offering.effectivePrice.unit_cost) < Number(lowest.comparableUnitCost ?? lowest.effectivePrice.unit_cost)
      ? offering
      : lowest
  );
  return {
    status: "comparable",
    price: bestOffering.effectivePrice,
    comparableUnitCost: Number(bestOffering.comparableUnitCost ?? bestOffering.effectivePrice.unit_cost),
    comparisonUnit: bestOffering.comparisonUnit ?? bestOffering.effectivePrice.unit,
  };
}
