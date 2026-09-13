import { deriveComparableMaterialPrice } from "@/lib/materials/effective-price";
import type {
  OrganizationMaterialSupplierPriceRow,
  OrganizationMaterialSupplierProductUnitConversionRow,
} from "@/lib/materials/types";
import type { SourceTaxBasis, TaxComparisonBasis } from "@/lib/tax/types";

export const MATERIAL_ESTIMATING_PRICE_CALCULATION_VERSION = "material_estimating_price_v1" as const;

export type MaterialEstimatingPriceStatus =
  | "available"
  | "conversion_required"
  | "missing_tax_policy"
  | "currency_incompatible"
  | "tax_incompatible"
  | "source_unavailable";

export type MaterialEstimatingPriceSource = {
  supplierPriceId: string;
  unitCost: number;
  unit: string;
  currency: string;
  sourceTaxBasis: string;
  sourceTaxRate: number | null;
  taxJurisdictionCode: string | null;
  comparisonTaxBasis: string | null;
  comparisonTaxRate: number | null;
  effectiveFrom: string;
};

export type MaterialEstimatingPriceConversion = {
  conversionId: string;
  supplierQuantity: number;
  supplierUnit: string;
  materialQuantity: number;
  materialUnit: string;
  confirmationSource: "user_confirmed_ai" | "user_confirmed_manual";
  contractVersion: string;
  effectiveFrom: string;
  confirmedAt: string;
};

export type MaterialEstimatingPricing = {
  status: MaterialEstimatingPriceStatus;
  derivationKind: "direct_unit_match" | "confirmed_conversion" | null;
  normalizedSourceUnitCost: number | null;
  unitCost: number | null;
  unit: string;
  currency: string;
  taxBasis: string | null;
  calculationVersion: typeof MATERIAL_ESTIMATING_PRICE_CALCULATION_VERSION;
  evaluatedAt: string;
};

export type MaterialEstimatingPrice = {
  sourcePricing: MaterialEstimatingPriceSource;
  estimatingPricing: MaterialEstimatingPricing;
  conversion: MaterialEstimatingPriceConversion | null;
};

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function sourceTaxBasis(value: string): SourceTaxBasis {
  return value === "inclusive" || value === "exclusive" || value === "zero_rated" ||
    value === "exempt" || value === "no_tax" ? value : "unknown";
}

function comparisonTaxBasis(value: string | null): TaxComparisonBasis | null {
  return value === "inclusive" || value === "exclusive" ? value : null;
}

function confirmedEffectiveConversion(params: {
  price: OrganizationMaterialSupplierPriceRow;
  conversion?: OrganizationMaterialSupplierProductUnitConversionRow | null;
  evaluatedAt: string;
}) {
  const conversion = params.conversion;
  if (!conversion ||
    conversion.organization_id !== params.price.organization_id ||
    conversion.supplier_product_id !== params.price.supplier_product_id ||
    (conversion.source !== "user_confirmed_ai" && conversion.source !== "user_confirmed_manual")) return null;
  const evaluatedAt = Date.parse(params.evaluatedAt);
  const effectiveFrom = Date.parse(conversion.effective_from);
  const effectiveTo = conversion.effective_to ? Date.parse(conversion.effective_to) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(evaluatedAt) || !Number.isFinite(effectiveFrom) || effectiveFrom > evaluatedAt || effectiveTo <= evaluatedAt) return null;
  return conversion;
}

function statusFromComparison(status: ReturnType<typeof deriveComparableMaterialPrice>["comparisonStatus"]): MaterialEstimatingPriceStatus {
  if (status === "comparable") return "available";
  if (status === "non_comparable" || status === "unavailable") return "conversion_required";
  if (status === "missing_tax_policy") return "missing_tax_policy";
  return "tax_incompatible";
}

export function deriveMaterialEstimatingPrice(params: {
  price: OrganizationMaterialSupplierPriceRow;
  materialUnit: string;
  organizationCurrency: string;
  evaluatedAt: string;
  conversion?: OrganizationMaterialSupplierProductUnitConversionRow | null;
}): MaterialEstimatingPrice {
  const price = params.price;
  const currency = normalizeCurrency(price.currency);
  const sourcePricing: MaterialEstimatingPriceSource = {
    supplierPriceId: price.id,
    unitCost: Number(price.unit_cost),
    unit: price.unit,
    currency,
    sourceTaxBasis: price.source_tax_basis,
    sourceTaxRate: price.source_tax_rate === null ? null : Number(price.source_tax_rate),
    taxJurisdictionCode: price.tax_jurisdiction_code,
    comparisonTaxBasis: price.comparison_tax_basis,
    comparisonTaxRate: price.comparison_tax_rate === null ? null : Number(price.comparison_tax_rate),
    effectiveFrom: price.effective_from,
  };
  const common = {
    unit: params.materialUnit,
    currency,
    calculationVersion: MATERIAL_ESTIMATING_PRICE_CALCULATION_VERSION,
    evaluatedAt: params.evaluatedAt,
  } as const;

  if (currency !== normalizeCurrency(params.organizationCurrency)) {
    return {
      sourcePricing,
      conversion: null,
      estimatingPricing: {
        ...common,
        status: "currency_incompatible",
        derivationKind: null,
        normalizedSourceUnitCost: null,
        unitCost: null,
        taxBasis: price.comparison_tax_basis,
      },
    };
  }

  const comparable = deriveComparableMaterialPrice({
    sourceUnitCost: Number(price.unit_cost),
    sourceUnit: price.unit,
    materialUnit: params.materialUnit,
    effectiveConversion: confirmedEffectiveConversion(params),
    sourceTaxBasis: sourceTaxBasis(price.source_tax_basis),
    sourceTaxRate: price.source_tax_rate,
    taxPolicy: price.tax_jurisdiction_code && comparisonTaxBasis(price.comparison_tax_basis) && price.comparison_tax_rate !== null
      ? {
          id: null,
          organizationId: price.organization_id,
          jurisdictionCode: price.tax_jurisdiction_code,
          taxName: typeof price.tax_policy_snapshot === "object" && price.tax_policy_snapshot && !Array.isArray(price.tax_policy_snapshot) && typeof price.tax_policy_snapshot.taxName === "string"
            ? price.tax_policy_snapshot.taxName : "Tax",
          registrationStatus: typeof price.tax_policy_snapshot === "object" && price.tax_policy_snapshot && !Array.isArray(price.tax_policy_snapshot) && (price.tax_policy_snapshot.registrationStatus === "registered" || price.tax_policy_snapshot.registrationStatus === "unregistered")
            ? price.tax_policy_snapshot.registrationStatus : "unknown",
          comparisonBasis: comparisonTaxBasis(price.comparison_tax_basis)!,
          standardRate: Number(price.comparison_tax_rate),
          supportsInclusiveExclusive: typeof price.tax_policy_snapshot === "object" && price.tax_policy_snapshot !== null && !Array.isArray(price.tax_policy_snapshot) && price.tax_policy_snapshot.supportsInclusiveExclusive === true,
          effectiveFrom: price.effective_from,
          effectiveTo: null,
          policySource: "immutable_price_snapshot",
        }
      : null,
  });
  const status = statusFromComparison(comparable.comparisonStatus);
  const conversion = status === "available" && comparable.effectiveConversion
    ? {
        conversionId: comparable.effectiveConversion.id,
        supplierQuantity: Number(comparable.effectiveConversion.supplier_quantity),
        supplierUnit: comparable.effectiveConversion.supplier_unit,
        materialQuantity: Number(comparable.effectiveConversion.material_quantity),
        materialUnit: comparable.effectiveConversion.material_unit,
        confirmationSource: comparable.effectiveConversion.source as "user_confirmed_ai" | "user_confirmed_manual",
        contractVersion: comparable.effectiveConversion.contract_version,
        effectiveFrom: comparable.effectiveConversion.effective_from,
        confirmedAt: comparable.effectiveConversion.confirmed_at,
      } satisfies MaterialEstimatingPriceConversion
    : null;

  return {
    sourcePricing,
    conversion,
    estimatingPricing: {
      ...common,
      status,
      derivationKind: status !== "available"
        ? null
        : conversion ? "confirmed_conversion" : "direct_unit_match",
      normalizedSourceUnitCost: comparable.normalizedSupplierUnitCost,
      unitCost: comparable.comparableUnitCost,
      taxBasis: comparable.comparisonTaxBasis,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseMaterialEstimatingPrice(value: unknown): MaterialEstimatingPrice | null {
  if (!isRecord(value) || !isRecord(value.sourcePricing) || !isRecord(value.estimatingPricing)) return null;
  const source = value.sourcePricing;
  const estimating = value.estimatingPricing;
  const statuses = new Set<MaterialEstimatingPriceStatus>([
    "available", "conversion_required", "missing_tax_policy", "currency_incompatible", "tax_incompatible", "source_unavailable",
  ]);
  if (
    typeof source.supplierPriceId !== "string" || !finite(source.unitCost) ||
    typeof source.unit !== "string" || typeof source.currency !== "string" ||
    typeof source.sourceTaxBasis !== "string" ||
    !(source.sourceTaxRate === null || finite(source.sourceTaxRate)) ||
    !(source.taxJurisdictionCode === null || typeof source.taxJurisdictionCode === "string") ||
    !(source.comparisonTaxBasis === null || typeof source.comparisonTaxBasis === "string") ||
    !(source.comparisonTaxRate === null || finite(source.comparisonTaxRate)) ||
    typeof source.effectiveFrom !== "string" || !Number.isFinite(Date.parse(source.effectiveFrom)) ||
    typeof estimating.status !== "string" || !statuses.has(estimating.status as MaterialEstimatingPriceStatus) ||
    !(estimating.derivationKind === null || estimating.derivationKind === "direct_unit_match" || estimating.derivationKind === "confirmed_conversion") ||
    !(estimating.normalizedSourceUnitCost === null || finite(estimating.normalizedSourceUnitCost)) ||
    !(estimating.unitCost === null || finite(estimating.unitCost)) ||
    typeof estimating.unit !== "string" || typeof estimating.currency !== "string" ||
    !(estimating.taxBasis === null || typeof estimating.taxBasis === "string") ||
    estimating.calculationVersion !== MATERIAL_ESTIMATING_PRICE_CALCULATION_VERSION ||
    typeof estimating.evaluatedAt !== "string" || !Number.isFinite(Date.parse(estimating.evaluatedAt))
  ) return null;

  let conversion: MaterialEstimatingPriceConversion | null = null;
  if (value.conversion !== null) {
    if (!isRecord(value.conversion)) return null;
    const candidate = value.conversion;
    if (
      typeof candidate.conversionId !== "string" || !finite(candidate.supplierQuantity) ||
      typeof candidate.supplierUnit !== "string" || !finite(candidate.materialQuantity) ||
      typeof candidate.materialUnit !== "string" ||
      (candidate.confirmationSource !== "user_confirmed_ai" && candidate.confirmationSource !== "user_confirmed_manual") ||
      typeof candidate.contractVersion !== "string" || typeof candidate.effectiveFrom !== "string" ||
      !Number.isFinite(Date.parse(candidate.effectiveFrom)) || typeof candidate.confirmedAt !== "string" ||
      !Number.isFinite(Date.parse(candidate.confirmedAt))
    ) return null;
    conversion = candidate as unknown as MaterialEstimatingPriceConversion;
  }
  if (estimating.status === "available" && (!finite(estimating.unitCost) || !finite(estimating.normalizedSourceUnitCost) || !estimating.derivationKind)) return null;
  if (estimating.derivationKind === "confirmed_conversion" && !conversion) return null;
  if (estimating.derivationKind === "direct_unit_match" && conversion) return null;

  return {
    sourcePricing: source as unknown as MaterialEstimatingPriceSource,
    estimatingPricing: estimating as unknown as MaterialEstimatingPricing,
    conversion,
  };
}
