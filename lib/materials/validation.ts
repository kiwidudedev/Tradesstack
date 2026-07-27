import {
  MAX_MATERIAL_IMPORT_SIZE_BYTES,
  MATERIAL_IMPORT_ALLOWED_MIME_TYPES,
} from "@/lib/materials/extraction";
import { normalizeCurrency, normalizeMaterialName, normalizeMaterialUnit } from "@/lib/materials/normalization";
import type { MaterialImportRowAction } from "@/lib/materials/types";

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
  unit: string;
  unitCost: number;
  currency?: string | null;
  supplierDescription?: string | null;
  supplierSku?: string | null;
  isPreferred?: boolean;
  effectiveFrom?: string | null;
  source?: string | null;
  importBatchId?: string | null;
};

export type MaterialImportReviewDraft = {
  rowId: string;
  action: MaterialImportRowAction;
  matchedMaterialId?: string | null;
  reviewedName?: string | null;
  reviewedDescription?: string | null;
  reviewedUnit?: string | null;
  reviewedUnitCost?: number | null;
  reviewedCurrency?: string | null;
  reviewedSupplierDescription?: string | null;
  reviewedSupplierSku?: string | null;
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

  return {
    materialId: input.materialId,
    supplierId: input.supplierId,
    unit,
    unitCost,
    currency: normalizeCurrency(input.currency),
    supplierDescription: input.supplierDescription?.trim() || null,
    supplierSku: input.supplierSku?.trim() || null,
    isPreferred: Boolean(input.isPreferred),
    effectiveFrom: input.effectiveFrom ?? null,
    source: input.source?.trim() || "manual",
    importBatchId: input.importBatchId ?? null,
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
      reviewedUnit: null,
      reviewedUnitCost: null,
      reviewedCurrency: null,
      reviewedSupplierDescription: null,
      reviewedSupplierSku: null,
    };
  }

  const reviewedName = input.reviewedName?.trim() ?? "";
  const reviewedUnit = normalizeMaterialUnit(input.reviewedUnit);
  const reviewedUnitCost =
    typeof input.reviewedUnitCost === "number" ? Number(input.reviewedUnitCost) : Number.NaN;

  if (!reviewedName) {
    throw new Error("Reviewed material name is required.");
  }
  if (!reviewedUnit) {
    throw new Error("Reviewed unit is required.");
  }
  if (!Number.isFinite(reviewedUnitCost) || reviewedUnitCost < 0) {
    throw new Error("Reviewed unit cost must be a valid positive number.");
  }
  if (input.action === "match_material" && !input.matchedMaterialId) {
    throw new Error("Choose an existing material when matching an import row.");
  }

  return {
    rowId: input.rowId,
    action: input.action,
    matchedMaterialId: input.matchedMaterialId ?? null,
    reviewedName,
    reviewedDescription: input.reviewedDescription?.trim() || null,
    reviewedUnit,
    reviewedUnitCost,
    reviewedCurrency: normalizeCurrency(input.reviewedCurrency),
    reviewedSupplierDescription: input.reviewedSupplierDescription?.trim() || null,
    reviewedSupplierSku: input.reviewedSupplierSku?.trim() || null,
  };
}
