import type { Json } from "@/lib/supabase/types";
import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";

export const MATERIAL_PRICING_METADATA_KEY = "materialPricing" as const;

export type WorksheetMaterialPriceBindingState =
  | "active"
  | "replaced"
  | "detached"
  | "removed";

export type WorksheetMaterialPriceSnapshot = {
  materialName: string;
  supplierName: string;
  supplierProductDescription: string | null;
  supplierSku: string | null;
  unitCost: number;
  unit: string;
  currency: string;
  sourceTaxBasis: string;
  sourceTaxRate: number | null;
  taxJurisdictionCode: string | null;
  priceEffectiveFrom: string;
  evaluatedAt: string;
};

export type WorksheetMaterialPricingProvenanceV1 = {
  version: 1;
  bindingId: string;
  organizationMaterialId: string;
  supplierId: string;
  supplierProductId: string;
  supplierPriceId: string;
  snapshot: WorksheetMaterialPriceSnapshot;
};

export type WorksheetMaterialPricingProvenanceV2 = {
  version: 2;
  bindingId: string;
  organizationMaterialId: string;
  supplierId: string;
  supplierProductId: string;
  sourcePricing: {
    supplierPriceId: string;
    unitCost: number;
    unit: string;
    currency: string;
    sourceTaxBasis: string;
    sourceTaxRate: number | null;
    taxJurisdictionCode: string | null;
    comparisonTaxBasis: string;
    comparisonTaxRate: number;
    priceEffectiveFrom: string;
  };
  conversion: null | {
    conversionId: string;
    contractVersion: string;
    confirmationSource: "user_confirmed_ai" | "user_confirmed_manual";
    supplierQuantity: number;
    supplierUnit: string;
    materialQuantity: number;
    materialUnit: string;
    effectiveFrom: string;
    confirmedAt: string;
  };
  estimatingPricing: {
    derivationKind: "direct_unit_match" | "confirmed_conversion";
    normalizedSourceUnitCost: number;
    unitCost: number;
    unit: string;
    currency: string;
    taxBasis: string;
    calculationVersion: "material_estimating_price_v1";
    evaluatedAt: string;
  };
  labels: {
    materialName: string;
    supplierName: string;
    supplierProductDescription: string | null;
    supplierSku: string | null;
  };
};

export type WorksheetMaterialPricingProvenance =
  | WorksheetMaterialPricingProvenanceV1
  | WorksheetMaterialPricingProvenanceV2;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function parseWorksheetMaterialPricingProvenance(
  value: unknown,
): WorksheetMaterialPricingProvenance | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
    return null;
  }

  if (value.version === 2) {
    const source = value.sourcePricing;
    const conversion = value.conversion;
    const estimating = value.estimatingPricing;
    const labels = value.labels;
    if (
      !isUuid(value.bindingId) || !isUuid(value.organizationMaterialId) ||
      !isUuid(value.supplierId) || !isUuid(value.supplierProductId) ||
      !isRecord(source) || !isUuid(source.supplierPriceId) ||
      typeof source.unitCost !== "number" || !Number.isFinite(source.unitCost) ||
      typeof source.unit !== "string" || typeof source.currency !== "string" ||
      typeof source.sourceTaxBasis !== "string" || !isNullableFiniteNumber(source.sourceTaxRate) ||
      !isNullableString(source.taxJurisdictionCode) || typeof source.comparisonTaxBasis !== "string" ||
      typeof source.comparisonTaxRate !== "number" || !Number.isFinite(source.comparisonTaxRate) ||
      !isTimestamp(source.priceEffectiveFrom) || !isRecord(estimating) ||
      (estimating.derivationKind !== "direct_unit_match" && estimating.derivationKind !== "confirmed_conversion") ||
      typeof estimating.normalizedSourceUnitCost !== "number" || !Number.isFinite(estimating.normalizedSourceUnitCost) ||
      typeof estimating.unitCost !== "number" || !Number.isFinite(estimating.unitCost) ||
      typeof estimating.unit !== "string" || typeof estimating.currency !== "string" ||
      typeof estimating.taxBasis !== "string" || estimating.calculationVersion !== "material_estimating_price_v1" ||
      !isTimestamp(estimating.evaluatedAt) || !isRecord(labels) ||
      typeof labels.materialName !== "string" || typeof labels.supplierName !== "string" ||
      !isNullableString(labels.supplierProductDescription) || !isNullableString(labels.supplierSku)
    ) return null;

    let parsedConversion: WorksheetMaterialPricingProvenanceV2["conversion"] = null;
    if (conversion !== null) {
      if (
        !isRecord(conversion) || !isUuid(conversion.conversionId) ||
        typeof conversion.contractVersion !== "string" ||
        (conversion.confirmationSource !== "user_confirmed_ai" && conversion.confirmationSource !== "user_confirmed_manual") ||
        typeof conversion.supplierQuantity !== "number" || !Number.isFinite(conversion.supplierQuantity) || conversion.supplierQuantity <= 0 ||
        typeof conversion.supplierUnit !== "string" || typeof conversion.materialQuantity !== "number" ||
        !Number.isFinite(conversion.materialQuantity) || conversion.materialQuantity <= 0 ||
        typeof conversion.materialUnit !== "string" || !isTimestamp(conversion.effectiveFrom) ||
        !isTimestamp(conversion.confirmedAt)
      ) return null;
      parsedConversion = conversion as unknown as WorksheetMaterialPricingProvenanceV2["conversion"];
    }
    if ((estimating.derivationKind === "confirmed_conversion") !== Boolean(parsedConversion)) return null;

    return {
      version: 2,
      bindingId: value.bindingId,
      organizationMaterialId: value.organizationMaterialId,
      supplierId: value.supplierId,
      supplierProductId: value.supplierProductId,
      sourcePricing: source as unknown as WorksheetMaterialPricingProvenanceV2["sourcePricing"],
      conversion: parsedConversion,
      estimatingPricing: estimating as unknown as WorksheetMaterialPricingProvenanceV2["estimatingPricing"],
      labels: labels as unknown as WorksheetMaterialPricingProvenanceV2["labels"],
    };
  }

  const snapshot = value.snapshot;
  if (
    !isUuid(value.bindingId) ||
    !isUuid(value.organizationMaterialId) ||
    !isUuid(value.supplierId) ||
    !isUuid(value.supplierProductId) ||
    !isUuid(value.supplierPriceId) ||
    !isRecord(snapshot) ||
    typeof snapshot.materialName !== "string" ||
    typeof snapshot.supplierName !== "string" ||
    !isNullableString(snapshot.supplierProductDescription) ||
    !isNullableString(snapshot.supplierSku) ||
    typeof snapshot.unitCost !== "number" ||
    !Number.isFinite(snapshot.unitCost) ||
    typeof snapshot.unit !== "string" ||
    typeof snapshot.currency !== "string" ||
    typeof snapshot.sourceTaxBasis !== "string" ||
    !isNullableFiniteNumber(snapshot.sourceTaxRate) ||
    !isNullableString(snapshot.taxJurisdictionCode) ||
    !isTimestamp(snapshot.priceEffectiveFrom) ||
    !isTimestamp(snapshot.evaluatedAt)
  ) {
    return null;
  }

  return {
    version: 1,
    bindingId: value.bindingId,
    organizationMaterialId: value.organizationMaterialId,
    supplierId: value.supplierId,
    supplierProductId: value.supplierProductId,
    supplierPriceId: value.supplierPriceId,
    snapshot: {
      materialName: snapshot.materialName,
      supplierName: snapshot.supplierName,
      supplierProductDescription: snapshot.supplierProductDescription,
      supplierSku: snapshot.supplierSku,
      unitCost: snapshot.unitCost,
      unit: snapshot.unit,
      currency: snapshot.currency,
      sourceTaxBasis: snapshot.sourceTaxBasis,
      sourceTaxRate: snapshot.sourceTaxRate,
      taxJurisdictionCode: snapshot.taxJurisdictionCode,
      priceEffectiveFrom: snapshot.priceEffectiveFrom,
      evaluatedAt: snapshot.evaluatedAt,
    },
  };
}

export function getWorksheetCellMaterialPricingProvenance(
  cell: WorksheetCell | null | undefined,
) {
  return parseWorksheetMaterialPricingProvenance(cell?.metadata[MATERIAL_PRICING_METADATA_KEY]);
}

export function withWorksheetCellMaterialPricingProvenance(
  cell: WorksheetCell,
  provenance: WorksheetMaterialPricingProvenance,
): WorksheetCell {
  return {
    ...cell,
    metadata: {
      ...cell.metadata,
      [MATERIAL_PRICING_METADATA_KEY]: provenance as unknown as Json,
    },
  };
}

export function withoutWorksheetCellMaterialPricingProvenance(cell: WorksheetCell): WorksheetCell {
  if (!(MATERIAL_PRICING_METADATA_KEY in cell.metadata)) {
    return cell;
  }

  const nextMetadata = { ...cell.metadata };
  delete nextMetadata[MATERIAL_PRICING_METADATA_KEY];
  return {
    ...cell,
    metadata: nextMetadata,
  };
}

function materialPriceValueSignature(cell: WorksheetCell) {
  return JSON.stringify({
    value: cell.value,
    type: cell.type,
    formula: cell.formula,
  });
}

/**
 * Keeps a binding attached while its cell moves or is formatted, and removes
 * it when the represented commercial value is overwritten. Historical state
 * is reconciled append-preservingly by the workbook save transaction.
 */
export function invalidateChangedWorksheetMaterialPricing(
  previousWorksheet: WorksheetData,
  nextWorksheet: WorksheetData,
): WorksheetData {
  const previousByBindingId = new Map<string, WorksheetCell>();

  Object.values(previousWorksheet.cells).forEach((cell) => {
    const provenance = getWorksheetCellMaterialPricingProvenance(cell);
    if (cell && provenance) {
      previousByBindingId.set(provenance.bindingId, cell);
    }
  });

  let nextCells: WorksheetData["cells"] | null = null;
  Object.entries(nextWorksheet.cells).forEach(([cellKey, cell]) => {
    if (!cell) {
      return;
    }

    const provenance = getWorksheetCellMaterialPricingProvenance(cell);
    if (!provenance) {
      return;
    }

    const previousCell = previousByBindingId.get(provenance.bindingId);
    if (!previousCell || materialPriceValueSignature(previousCell) === materialPriceValueSignature(cell)) {
      return;
    }

    nextCells ??= { ...nextWorksheet.cells };
    nextCells[cellKey] = withoutWorksheetCellMaterialPricingProvenance(cell);
  });

  return nextCells
    ? {
        ...nextWorksheet,
        cells: nextCells,
      }
    : nextWorksheet;
}

export function collectActiveWorksheetMaterialPricing(
  worksheet: WorksheetData,
): Array<{ cellAddress: string; provenance: WorksheetMaterialPricingProvenance }> {
  return Object.entries(worksheet.cells).flatMap(([cellAddress, cell]) => {
    const provenance = getWorksheetCellMaterialPricingProvenance(cell);
    return provenance ? [{ cellAddress, provenance }] : [];
  });
}
