import type { WorksheetCell } from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  withWorksheetCellMaterialPricingProvenance,
  type WorksheetMaterialPricingProvenance,
  type WorksheetMaterialPricingProvenanceV2,
} from "@/lib/worksheet-material-pricing-provenance";
import {
  parseMaterialEstimatingPrice,
  type MaterialEstimatingPrice,
} from "@/lib/materials/estimating-price";

export const PRICING_WORKSHEET_MATERIAL_PICKER_PAGE_SIZE = 20;
export const PRICING_WORKSHEET_MATERIAL_PICKER_MIN_SEARCH_LENGTH = 2;

export function normalizePricingWorksheetMaterialPickerSearch(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isPricingWorksheetMaterialPickerSearchValid(value: string) {
  return normalizePricingWorksheetMaterialPickerSearch(value).length >= PRICING_WORKSHEET_MATERIAL_PICKER_MIN_SEARCH_LENGTH;
}

export type PricingWorksheetMaterialPickerItem = {
  materialId: string;
  materialName: string;
  materialDescription: string | null;
  category: string | null;
  defaultUnit: string;
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  supplierProductDescription: string | null;
  supplierSku: string | null;
  supplierUnit: string;
  isPreferred: boolean;
  pricing: MaterialEstimatingPrice | null;
};

export type PricingWorksheetMaterialPickerPage = {
  items: PricingWorksheetMaterialPickerItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  evaluatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function parsePricingWorksheetMaterialPickerPage(
  value: unknown,
): PricingWorksheetMaterialPickerPage | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const page = Number(value.page);
  const pageSize = Number(value.pageSize);
  const total = Number(value.total);
  if (
    !Number.isInteger(page) || page < 1 ||
    !Number.isInteger(pageSize) || pageSize < 1 ||
    !Number.isInteger(total) || total < 0 ||
    typeof value.hasMore !== "boolean" ||
    typeof value.evaluatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.evaluatedAt))
  ) return null;

  const items: PricingWorksheetMaterialPickerItem[] = [];
  for (const candidate of value.items) {
    if (!isRecord(candidate)) return null;
    const requiredStrings = [
      candidate.materialId,
      candidate.materialName,
      candidate.defaultUnit,
      candidate.supplierId,
      candidate.supplierName,
      candidate.supplierProductId,
      candidate.supplierUnit,
    ];
    if (
      requiredStrings.some((entry) => typeof entry !== "string" || !entry) ||
      !nullableString(candidate.materialDescription) ||
      !nullableString(candidate.category) ||
      !nullableString(candidate.supplierProductDescription) ||
      !nullableString(candidate.supplierSku) ||
      typeof candidate.isPreferred !== "boolean"
    ) return null;

    const pricing = candidate.pricing === null ? null : parseMaterialEstimatingPrice(candidate.pricing);
    if (candidate.pricing !== null && !pricing) return null;

    items.push({
      materialId: candidate.materialId as string,
      materialName: candidate.materialName as string,
      materialDescription: candidate.materialDescription,
      category: candidate.category,
      defaultUnit: candidate.defaultUnit as string,
      supplierId: candidate.supplierId as string,
      supplierName: candidate.supplierName as string,
      supplierProductId: candidate.supplierProductId as string,
      supplierProductDescription: candidate.supplierProductDescription,
      supplierSku: candidate.supplierSku,
      supplierUnit: candidate.supplierUnit as string,
      isPreferred: candidate.isPreferred,
      pricing,
    });
  }

  return { items, page, pageSize, total, hasMore: value.hasMore, evaluatedAt: value.evaluatedAt };
}

export function buildMaterialPriceWorksheetCell(params: {
  existingCell?: WorksheetCell;
  item: PricingWorksheetMaterialPickerItem;
  bindingId: string;
}): WorksheetCell {
  if (!params.item.pricing) throw new Error("This supplier product has no effective price.");
  const price = params.item.pricing.sourcePricing;
  const baseCell: WorksheetCell = {
    ...(params.existingCell ?? {
      value: null,
      type: "empty",
      formula: null,
      computedValue: null,
      displayValue: "",
      metadata: {},
    }),
    value: price.unitCost,
    type: "number",
    formula: null,
    computedValue: price.unitCost,
    displayValue: String(price.unitCost),
  };
  const provenance: WorksheetMaterialPricingProvenance = {
    version: 1,
    bindingId: params.bindingId,
    organizationMaterialId: params.item.materialId,
    supplierId: params.item.supplierId,
    supplierProductId: params.item.supplierProductId,
    supplierPriceId: price.supplierPriceId,
    snapshot: {
      materialName: params.item.materialName,
      supplierName: params.item.supplierName,
      supplierProductDescription: params.item.supplierProductDescription,
      supplierSku: params.item.supplierSku,
      unitCost: price.unitCost,
      unit: price.unit,
      currency: price.currency,
      sourceTaxBasis: price.sourceTaxBasis,
      sourceTaxRate: price.sourceTaxRate,
      taxJurisdictionCode: price.taxJurisdictionCode,
      priceEffectiveFrom: price.effectiveFrom,
      evaluatedAt: params.item.pricing.estimatingPricing.evaluatedAt,
    },
  };
  return withWorksheetCellMaterialPricingProvenance(baseCell, provenance);
}

export function buildMaterialEstimatingRateWorksheetCell(params: {
  existingCell?: WorksheetCell;
  item: PricingWorksheetMaterialPickerItem;
  bindingId: string;
}): WorksheetCell {
  const pricing = params.item.pricing;
  if (!pricing || pricing.estimatingPricing.status !== "available" || pricing.estimatingPricing.unitCost === null ||
    pricing.estimatingPricing.normalizedSourceUnitCost === null || !pricing.estimatingPricing.derivationKind ||
    !pricing.estimatingPricing.taxBasis || !pricing.sourcePricing.comparisonTaxBasis || pricing.sourcePricing.comparisonTaxRate === null) {
    throw new Error("This supplier product has no safe estimating rate.");
  }
  const baseCell: WorksheetCell = {
    ...(params.existingCell ?? {
      value: null, type: "empty", formula: null, computedValue: null, displayValue: "", metadata: {},
    }),
    value: pricing.estimatingPricing.unitCost,
    type: "number",
    formula: null,
    computedValue: pricing.estimatingPricing.unitCost,
    displayValue: String(pricing.estimatingPricing.unitCost),
  };
  const provenance: WorksheetMaterialPricingProvenanceV2 = {
    version: 2,
    bindingId: params.bindingId,
    organizationMaterialId: params.item.materialId,
    supplierId: params.item.supplierId,
    supplierProductId: params.item.supplierProductId,
    sourcePricing: {
      supplierPriceId: pricing.sourcePricing.supplierPriceId,
      unitCost: pricing.sourcePricing.unitCost,
      unit: pricing.sourcePricing.unit,
      currency: pricing.sourcePricing.currency,
      sourceTaxBasis: pricing.sourcePricing.sourceTaxBasis,
      sourceTaxRate: pricing.sourcePricing.sourceTaxRate,
      taxJurisdictionCode: pricing.sourcePricing.taxJurisdictionCode,
      comparisonTaxBasis: pricing.sourcePricing.comparisonTaxBasis,
      comparisonTaxRate: pricing.sourcePricing.comparisonTaxRate,
      priceEffectiveFrom: pricing.sourcePricing.effectiveFrom,
    },
    conversion: pricing.conversion ? { ...pricing.conversion } : null,
    estimatingPricing: {
      derivationKind: pricing.estimatingPricing.derivationKind,
      normalizedSourceUnitCost: pricing.estimatingPricing.normalizedSourceUnitCost,
      unitCost: pricing.estimatingPricing.unitCost,
      unit: pricing.estimatingPricing.unit,
      currency: pricing.estimatingPricing.currency,
      taxBasis: pricing.estimatingPricing.taxBasis,
      calculationVersion: pricing.estimatingPricing.calculationVersion,
      evaluatedAt: pricing.estimatingPricing.evaluatedAt,
    },
    labels: {
      materialName: params.item.materialName,
      supplierName: params.item.supplierName,
      supplierProductDescription: params.item.supplierProductDescription,
      supplierSku: params.item.supplierSku,
    },
  };
  return withWorksheetCellMaterialPricingProvenance(baseCell, provenance);
}
