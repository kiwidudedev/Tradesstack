import { normalizeMaterialConversionUnit } from "@/lib/materials/unit-conversion/normalize-unit";
import { calculateComparableMaterialUnitCost } from "@/lib/materials/unit-conversion/pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";
import { normalizePriceTaxBasis } from "@/lib/tax/normalize-price";
import type { OrganizationTaxPolicy, SourceTaxBasis } from "@/lib/tax/types";

export type CommercialSupplierPriceResolution =
  | { status: "available"; rate: number; unit: string }
  | { status: "unavailable"; reason: string };

function sourceTaxBasis(value: string): SourceTaxBasis | null {
  if (
    value === "exclusive"
    || value === "inclusive"
    || value === "zero_rated"
    || value === "exempt"
    || value === "no_tax"
  ) return value;
  return null;
}

export function resolveCommercialSupplierPrice(
  item: PricingWorksheetMaterialPickerItem,
  destinationLabel = "commercial document",
): CommercialSupplierPriceResolution {
  const pricing = item.pricing;
  if (pricing?.estimatingPricing.status !== "available") {
    return { status: "unavailable", reason: "A normalized estimating rate is not available." };
  }
  if (
    pricing.estimatingPricing.currency.trim().toUpperCase() !== "NZD"
    || pricing.sourcePricing.currency.trim().toUpperCase() !== "NZD"
  ) {
    return { status: "unavailable", reason: `Only NZD supplier prices can be added to this ${destinationLabel}.` };
  }

  const basis = sourceTaxBasis(pricing.sourcePricing.sourceTaxBasis);
  const taxRate = pricing.sourcePricing.comparisonTaxRate;
  if (!basis || taxRate === null || !Number.isFinite(taxRate) || taxRate < 0) {
    return { status: "unavailable", reason: "GST-exclusive pricing cannot be verified for this supplier price." };
  }

  const exclusivePolicy: OrganizationTaxPolicy = {
    id: null,
    organizationId: "",
    jurisdictionCode: pricing.sourcePricing.taxJurisdictionCode ?? destinationLabel.toUpperCase(),
    taxName: "GST",
    registrationStatus: "unknown",
    comparisonBasis: "exclusive",
    standardRate: taxRate,
    supportsInclusiveExclusive: true,
    effectiveFrom: pricing.sourcePricing.effectiveFrom,
    effectiveTo: null,
    policySource: "immutable_supplier_price_snapshot",
  };
  const normalized = normalizePriceTaxBasis({
    sourceAmount: pricing.sourcePricing.unitCost,
    sourceTaxBasis: basis,
    sourceTaxRate: pricing.sourcePricing.sourceTaxRate,
    policy: exclusivePolicy,
  });
  if (normalized.status !== "normalized" || normalized.normalizedAmount === null) {
    return { status: "unavailable", reason: "GST-exclusive pricing cannot be derived from this supplier price." };
  }

  const sourceUnit = normalizeMaterialConversionUnit(pricing.sourcePricing.unit);
  const estimatingUnit = normalizeMaterialConversionUnit(pricing.estimatingPricing.unit);
  let rate: number;
  if (sourceUnit === estimatingUnit) {
    rate = normalized.normalizedAmount;
  } else {
    const conversion = pricing.conversion;
    if (
      !conversion
      || normalizeMaterialConversionUnit(conversion.supplierUnit) !== sourceUnit
      || normalizeMaterialConversionUnit(conversion.materialUnit) !== estimatingUnit
    ) {
      return { status: "unavailable", reason: `A confirmed unit conversion is required for this ${destinationLabel} rate.` };
    }
    try {
      rate = calculateComparableMaterialUnitCost({
        supplierUnitCost: normalized.normalizedAmount,
        supplierQuantity: conversion.supplierQuantity,
        materialQuantity: conversion.materialQuantity,
      });
    } catch {
      return { status: "unavailable", reason: "The confirmed unit conversion is not valid." };
    }
  }

  if (!Number.isFinite(rate) || rate < 0) {
    return { status: "unavailable", reason: `The GST-exclusive ${destinationLabel} rate is invalid.` };
  }
  return { status: "available", rate, unit: pricing.estimatingPricing.unit };
}

export function commercialSupplierPriceIssue(
  item: PricingWorksheetMaterialPickerItem,
  destinationLabel?: string,
) {
  const resolution = resolveCommercialSupplierPrice(item, destinationLabel);
  return resolution.status === "available" ? null : resolution.reason;
}

export function buildSupplierMaterialDescription(item: PricingWorksheetMaterialPickerItem) {
  const materialName = item.materialName.trim();
  const productDescription = item.supplierProductDescription?.trim() ?? "";
  return productDescription
    && productDescription.localeCompare(materialName, undefined, { sensitivity: "accent" }) !== 0
    ? `${materialName} — ${productDescription}`
    : materialName;
}
