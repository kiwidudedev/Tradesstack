import {
  MAX_MATERIAL_IMPORT_SIZE_BYTES,
  MATERIAL_IMPORT_ALLOWED_MIME_TYPES,
} from "@/lib/materials/extraction";
import { normalizeCurrency, normalizeMaterialName, normalizeMaterialUnit } from "@/lib/materials/normalization";
import type { MaterialImportRowAction } from "@/lib/materials/types";
import {
  MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION,
  MATERIAL_UNIT_CONVERSION_LEGACY_CONTRACT_VERSION,
  MATERIAL_UNIT_CONVERSION_PROMPT_VERSION,
  type ConfirmedMaterialUnitConversion,
} from "@/lib/materials/unit-conversion/contract";
import { normalizeMaterialConversionUnit } from "@/lib/materials/unit-conversion/normalize-unit";
import { calculateComparableMaterialUnitCost, conversionCostsAgree } from "@/lib/materials/unit-conversion/pricing";
import { SOURCE_TAX_BASES, type SourceTaxBasis } from "@/lib/tax/types";
import type { PriceTaxEvidenceIntent } from "@/lib/tax/price-review-state";

export type MaterialDraftInput = {
  name: string;
  description?: string | null;
  defaultUnit: string;
  category?: string | null;
  organizationCostCodeId?: string | null;
  isActive?: boolean;
};

export type MaterialSupplierPriceDraftInput = {
  materialId: string;
  supplierId: string;
  supplierProductId?: string | null;
  idempotencyKey?: string | null;
  unit: string;
  unitCost: number;
  currency?: string | null;
  supplierDescription?: string | null;
  supplierSku?: string | null;
  isPreferred?: boolean;
  effectiveFrom?: string | null;
  source?: string | null;
  importBatchId?: string | null;
  sourceTaxBasis?: SourceTaxBasis | null;
  sourceTaxRate?: number | null;
  taxEvidenceIntent?: PriceTaxEvidenceIntent | null;
  incompleteTaxReason?: string | null;
};

export type MaterialImportReviewDraft = {
  rowId: string;
  action: MaterialImportRowAction;
  matchedMaterialId?: string | null;
  reviewedName?: string | null;
  reviewedDescription?: string | null;
  supplierUnit?: string | null;
  materialUnit?: string | null;
  confirmedUnitConversion?: ConfirmedMaterialUnitConversion | null;
  /** @deprecated Compatibility for callers created before supplier/material units were separated. */
  reviewedUnit?: string | null;
  reviewedUnitCost?: number | null;
  reviewedCurrency?: string | null;
  reviewedSupplierDescription?: string | null;
  reviewedSupplierSku?: string | null;
  selectedPriceKey?: string | null;
  reviewedTaxBasis?: SourceTaxBasis | null;
  reviewedSourceTaxRate?: number | null;
  taxEvidence?: string | null;
  acknowledgeIncompleteTaxEvidence?: boolean;
  incompleteTaxReason?: string | null;
  allowDuplicateSourceObservation?: boolean;
  archivedSupplierProductId?: string | null;
  archivedSupplierProductResolution?: "restore" | "create_distinct" | null;
  identityVariant?: string | null;
};

export function validateMaterialDraft(input: MaterialDraftInput) {
  const name = input.name.trim();
  const normalizedName = normalizeMaterialName(name);
  const defaultUnit = normalizeMaterialUnit(input.defaultUnit);

  if (!name) {
    throw new Error("Material name is required.");
  }

  if (!defaultUnit) {
    throw new Error("Default unit is required.");
  }

  return {
    name,
    normalizedName,
    description: input.description?.trim() || null,
    defaultUnit,
    category: input.category?.trim() || null,
    organizationCostCodeId: input.organizationCostCodeId || null,
    isActive: input.isActive ?? true,
  };
}

export function validateSupplierPriceDraft(input: MaterialSupplierPriceDraftInput) {
  const unit = normalizeMaterialUnit(input.unit);
  const unitCost = Number(input.unitCost);

  if (!input.materialId) {
    throw new Error("Material is required.");
  }
  if (!input.supplierId) {
    throw new Error("Supplier is required.");
  }
  if (!unit) {
    throw new Error("Unit is required.");
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error("Unit cost must be a valid positive number.");
  }
  if (input.taxEvidenceIntent !== "canonical_ready" && input.taxEvidenceIntent !== "needs_review") {
    throw new Error("Choose whether this Supplier Price is canonical-ready or needs tax review.");
  }

  return {
    materialId: input.materialId,
    supplierId: input.supplierId,
    supplierProductId: input.supplierProductId ?? null,
    idempotencyKey: input.idempotencyKey?.trim() || null,
    unit,
    unitCost,
    currency: normalizeCurrency(input.currency),
    supplierDescription: input.supplierDescription?.trim() || null,
    supplierSku: input.supplierSku?.trim() || null,
    isPreferred: Boolean(input.isPreferred),
    effectiveFrom: input.effectiveFrom ?? null,
    source: input.source?.trim() || "manual",
    importBatchId: input.importBatchId ?? null,
    sourceTaxBasis: SOURCE_TAX_BASES.includes(input.sourceTaxBasis as SourceTaxBasis) ? input.sourceTaxBasis as SourceTaxBasis : "unknown",
    sourceTaxRate: typeof input.sourceTaxRate === "number" && Number.isFinite(input.sourceTaxRate) ? input.sourceTaxRate : null,
    taxEvidenceIntent: input.taxEvidenceIntent,
    incompleteTaxReason: input.incompleteTaxReason?.trim() || null,
  };
}

export function validateMaterialImportFile(file: File) {
  const normalizedMimeType = file.type.trim().toLowerCase();
  const fileName = file.name.toLowerCase();
  const isKnownSpreadsheet =
    fileName.endsWith(".csv") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xlsm") ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".webp") ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif");

  if (
    !MATERIAL_IMPORT_ALLOWED_MIME_TYPES.has(normalizedMimeType) &&
    !(normalizedMimeType === "" && isKnownSpreadsheet)
  ) {
    throw new Error("Unsupported file type. Upload CSV, XLSX, PDF, or an image file.");
  }

  if (file.size <= 0) {
    throw new Error("Empty files cannot be uploaded.");
  }

  if (file.size > MAX_MATERIAL_IMPORT_SIZE_BYTES) {
    throw new Error("File is too large. Maximum size is 25 MB.");
  }
}

export function validateMaterialImportReviewDraft(input: MaterialImportReviewDraft) {
  if (!input.rowId) {
    throw new Error("Import row id is required.");
  }

  if (input.action === "skip") {
    return {
      rowId: input.rowId,
      action: input.action,
      matchedMaterialId: null,
      reviewedName: null,
      reviewedDescription: null,
      supplierUnit: null,
      materialUnit: null,
      reviewedUnit: null,
      confirmedUnitConversion: null,
      reviewedUnitCost: null,
      reviewedCurrency: null,
      reviewedSupplierDescription: null,
      reviewedSupplierSku: null,
      selectedPriceKey: null,
      reviewedTaxBasis: "unknown" as const,
      reviewedSourceTaxRate: null,
      taxEvidence: null,
      acknowledgeIncompleteTaxEvidence: false,
      incompleteTaxReason: null,
      allowDuplicateSourceObservation: false,
      archivedSupplierProductId: null,
      archivedSupplierProductResolution: null,
      identityVariant: null,
    };
  }

  const reviewedName = input.reviewedName?.trim() ?? "";
  const supplierUnit = normalizeMaterialConversionUnit(input.supplierUnit ?? input.reviewedUnit);
  const materialUnit = normalizeMaterialConversionUnit(input.materialUnit ?? input.reviewedUnit);
  const reviewedUnitCost =
    typeof input.reviewedUnitCost === "number" ? Number(input.reviewedUnitCost) : Number.NaN;

  if (!reviewedName) {
    throw new Error("Reviewed material name is required.");
  }
  if (!supplierUnit) {
    throw new Error("Supplier unit is required.");
  }
  if (!materialUnit) {
    throw new Error("Material unit is required.");
  }
  if (!Number.isFinite(reviewedUnitCost) || reviewedUnitCost < 0) {
    throw new Error("Reviewed unit cost must be a valid positive number.");
  }
  if (input.action === "match_material" && !input.matchedMaterialId) {
    throw new Error("Choose an existing material when matching an import row.");
  }
  const selectedPriceKey = input.selectedPriceKey?.trim() || null;
  if (!selectedPriceKey) {
    throw new Error("Choose an extracted price or select Manual price before approving this row.");
  }
  const reviewedTaxBasis = SOURCE_TAX_BASES.includes(input.reviewedTaxBasis as SourceTaxBasis)
    ? input.reviewedTaxBasis as SourceTaxBasis : "unknown";
  const reviewedSourceTaxRate = typeof input.reviewedSourceTaxRate === "number" && Number.isFinite(input.reviewedSourceTaxRate)
    ? input.reviewedSourceTaxRate : null;
  if (reviewedSourceTaxRate !== null && (reviewedSourceTaxRate < 0 || reviewedSourceTaxRate >= 100)) throw new Error("Source tax rate is invalid.");
  const archivedSupplierProductResolution = input.archivedSupplierProductResolution ?? null;
  const archivedSupplierProductId = input.archivedSupplierProductId?.trim() || null;
  const identityVariant = input.identityVariant?.trim() || null;
  if (archivedSupplierProductResolution === "restore" && !archivedSupplierProductId) {
    throw new Error("Choose the archived supplier item to restore.");
  }
  if (archivedSupplierProductResolution === "create_distinct" && (!identityVariant || identityVariant === "default")) {
    throw new Error("Enter a distinct identity variant for this supplier item.");
  }

  let confirmedUnitConversion: ConfirmedMaterialUnitConversion | null = null;
  if (input.confirmedUnitConversion) {
    const conversion = input.confirmedUnitConversion;
    if (
      (conversion.source !== "user_confirmed_ai" && conversion.source !== "user_confirmed_manual")
      || (
        conversion.contractVersion !== MATERIAL_UNIT_CONVERSION_LEGACY_CONTRACT_VERSION
        && conversion.contractVersion !== MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION
      )
    ) {
      throw new Error("Confirmed unit conversion provenance is invalid.");
    }
    const conversionSupplierUnit = normalizeMaterialConversionUnit(conversion.supplierUnit);
    const conversionMaterialUnit = normalizeMaterialConversionUnit(conversion.materialUnit);
    if (conversionSupplierUnit !== supplierUnit || conversionMaterialUnit !== materialUnit) {
      throw new Error("Confirmed unit conversion does not match the reviewed units.");
    }
    const convertedUnitCost = calculateComparableMaterialUnitCost({
      supplierUnitCost: reviewedUnitCost,
      supplierQuantity: conversion.supplierQuantity,
      materialQuantity: conversion.materialQuantity,
    });
    if (!conversionCostsAgree(convertedUnitCost, conversion.convertedUnitCost)) {
      throw new Error("Confirmed unit conversion cost does not match the source price.");
    }
    if (conversion.contractVersion === MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION) {
      if (
        !conversion.contextHash?.trim()
        || conversion.promptVersion !== MATERIAL_UNIT_CONVERSION_PROMPT_VERSION
        || !conversion.basis
        || !conversion.evidenceSummary?.trim()
        || !conversion.evidenceRefs?.length
      ) {
        throw new Error("Confirmed unit conversion evidence is incomplete.");
      }
      if (input.action === "match_material" && conversion.selectedMaterialId !== input.matchedMaterialId) {
        throw new Error("Confirmed unit conversion does not match the selected Material.");
      }
    }
    confirmedUnitConversion = {
      ...conversion,
      supplierUnit,
      materialUnit,
      convertedUnitCost,
      currency: normalizeCurrency(conversion.currency ?? input.reviewedCurrency),
    };
  }

  return {
    rowId: input.rowId,
    action: input.action,
    matchedMaterialId: input.matchedMaterialId ?? null,
    reviewedName,
    reviewedDescription: input.reviewedDescription?.trim() || null,
    supplierUnit,
    materialUnit,
    reviewedUnit: materialUnit,
    confirmedUnitConversion,
    reviewedUnitCost,
    reviewedCurrency: normalizeCurrency(input.reviewedCurrency),
    reviewedSupplierDescription: input.reviewedSupplierDescription?.trim() || null,
    reviewedSupplierSku: input.reviewedSupplierSku?.trim() || null,
    selectedPriceKey,
    reviewedTaxBasis,
    reviewedSourceTaxRate,
    taxEvidence: input.taxEvidence?.trim() || null,
    acknowledgeIncompleteTaxEvidence: input.acknowledgeIncompleteTaxEvidence === true,
    incompleteTaxReason: input.incompleteTaxReason?.trim() || null,
    allowDuplicateSourceObservation: input.allowDuplicateSourceObservation === true,
    archivedSupplierProductId,
    archivedSupplierProductResolution,
    identityVariant,
  };
}
