import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  getWorksheetCellMaterialPricingProvenance,
  parseWorksheetMaterialPricingProvenance,
} from "@/lib/worksheet-material-pricing-provenance";
import { parseMaterialEstimatingPrice, type MaterialEstimatingPrice } from "@/lib/materials/estimating-price";

export const MATERIAL_PRICE_REVIEW_PAGE_SIZE = 20;

export type MaterialPriceReviewClassification =
  | "current"
  | "version_changed_same_terms"
  | "price_changed"
  | "conversion_changed"
  | "price_and_conversion_changed"
  | "conversion_unavailable"
  | "estimating_unit_mismatch"
  | "commercial_terms_changed"
  | "no_current_price"
  | "source_inactive"
  | "source_unavailable"
  | "invalid_binding";

export type MaterialPriceReviewReason =
  | "unit"
  | "currency"
  | "tax_basis"
  | "tax_rate"
  | "tax_jurisdiction"
  | "estimating_unit"
  | "conversion";

export type MaterialPriceReviewPrice = {
  id: string;
  unitCost: number;
  unit: string;
  currency: string;
  sourceTaxBasis: string;
  sourceTaxRate: number | null;
  taxJurisdictionCode: string | null;
  effectiveFrom: string;
  evaluatedAt: string;
};

export type MaterialPriceReviewBindingTarget = {
  bindingId: string;
  sheetId: string;
  sheetName: string;
  cellAddress: string;
};

export type MaterialPriceReviewGroup = {
  groupKey: string;
  classification: MaterialPriceReviewClassification;
  reasonCodes: MaterialPriceReviewReason[];
  materialId: string;
  materialName: string;
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  supplierProductDescription: string | null;
  supplierSku: string | null;
  historicalPrice: MaterialPriceReviewPrice;
  currentPrice: MaterialPriceReviewPrice | null;
  provenanceVersion: 1 | 2;
  historicalPricing: MaterialEstimatingPrice | null;
  currentPricing: MaterialEstimatingPrice | null;
  absoluteDifference: number | null;
  percentageDifference: number | null;
  targets: MaterialPriceReviewBindingTarget[];
};

export type MaterialPriceReviewSummary = {
  priceUpdates: number;
  needsReview: number;
  current: number;
  versionChangedSameTerms: number;
};

export type MaterialPriceReviewPage = {
  items: MaterialPriceReviewGroup[];
  summary: MaterialPriceReviewSummary;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  evaluatedAt: string;
};

export type MaterialPriceReviewOverlayBinding = {
  bindingId: string;
  cellAddress: string;
  value: number;
  type: "number";
  formula: null;
  provenance: NonNullable<ReturnType<typeof getWorksheetCellMaterialPricingProvenance>>;
};

export type MaterialPriceReviewRequest = {
  workbookId: string;
  activeSheetId: string | null;
  localBindings: MaterialPriceReviewOverlayBinding[] | null;
  sheetId: string | null;
  page: number;
  pageSize: number;
  mode: "review" | "revalidate";
  targetBindingId: string | null;
  expectedCurrentPriceId: string | null;
};

export type MaterialPriceReviewComparisonInput = {
  historicalPrice: MaterialPriceReviewPrice;
  currentPrice: MaterialPriceReviewPrice | null;
  sourceAvailable?: boolean;
  sourceActive?: boolean;
};

const CLASSIFICATIONS = new Set<MaterialPriceReviewClassification>([
  "current", "version_changed_same_terms", "price_changed", "commercial_terms_changed",
  "conversion_changed", "price_and_conversion_changed", "conversion_unavailable", "estimating_unit_mismatch",
  "no_current_price", "source_inactive", "source_unavailable", "invalid_binding",
]);
const REASONS = new Set<MaterialPriceReviewReason>([
  "unit", "currency", "tax_basis", "tax_rate", "tax_jurisdiction", "estimating_unit", "conversion",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && UUID_PATTERN.test(value));
}

export function parseMaterialPriceReviewRequest(value: unknown): MaterialPriceReviewRequest | null {
  if (!isRecord(value) || typeof value.workbookId !== "string" || !UUID_PATTERN.test(value.workbookId)) return null;
  const mode = value.mode === "revalidate" ? "revalidate" : value.mode === undefined || value.mode === "review" ? "review" : null;
  const activeSheetId = value.activeSheetId === undefined ? null : value.activeSheetId;
  const sheetId = value.sheetId === undefined ? null : value.sheetId;
  const targetBindingId = value.targetBindingId === undefined ? null : value.targetBindingId;
  const expectedCurrentPriceId = value.expectedCurrentPriceId === undefined ? null : value.expectedCurrentPriceId;
  if (!mode || !nullableUuid(activeSheetId) || !nullableUuid(sheetId) || !nullableUuid(targetBindingId) || !nullableUuid(expectedCurrentPriceId)) return null;
  const page = Math.max(1, Math.floor(Number(value.page ?? 1)));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(value.pageSize ?? MATERIAL_PRICE_REVIEW_PAGE_SIZE))));
  if (!Number.isFinite(page) || !Number.isFinite(pageSize)) return null;

  let localBindings: MaterialPriceReviewOverlayBinding[] | null = null;
  if (value.localBindings !== undefined && value.localBindings !== null) {
    if (!Array.isArray(value.localBindings)) return null;
    localBindings = [];
    for (const entry of value.localBindings) {
      if (!isRecord(entry) || typeof entry.bindingId !== "string" || !UUID_PATTERN.test(entry.bindingId) ||
        typeof entry.cellAddress !== "string" || !/^[A-Z]+[1-9][0-9]*$/.test(entry.cellAddress) ||
        typeof entry.value !== "number" || !Number.isFinite(entry.value) || entry.type !== "number" || entry.formula !== null) return null;
      const provenance = parseWorksheetMaterialPricingProvenance(entry.provenance);
      if (!provenance || provenance.bindingId !== entry.bindingId) return null;
      localBindings.push({ bindingId: entry.bindingId, cellAddress: entry.cellAddress, value: entry.value, type: "number", formula: null, provenance });
    }
    if (!activeSheetId) return null;
  }
  if (mode === "revalidate" && (!targetBindingId || !expectedCurrentPriceId)) return null;
  return {
    workbookId: value.workbookId, activeSheetId, localBindings, sheetId,
    page, pageSize, mode, targetBindingId, expectedCurrentPriceId,
  };
}

function normalizedUnit(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizedCurrency(value: string) {
  return value.trim().toUpperCase();
}

export function classifyMaterialPriceReview(input: MaterialPriceReviewComparisonInput): {
  classification: MaterialPriceReviewClassification;
  reasonCodes: MaterialPriceReviewReason[];
  absoluteDifference: number | null;
  percentageDifference: number | null;
} {
  if (input.sourceAvailable === false) {
    return { classification: "source_unavailable", reasonCodes: [], absoluteDifference: null, percentageDifference: null };
  }
  if (input.sourceActive === false) {
    return { classification: "source_inactive", reasonCodes: [], absoluteDifference: null, percentageDifference: null };
  }
  if (!input.currentPrice) {
    return { classification: "no_current_price", reasonCodes: [], absoluteDifference: null, percentageDifference: null };
  }
  if (input.historicalPrice.id === input.currentPrice.id) {
    return { classification: "current", reasonCodes: [], absoluteDifference: 0, percentageDifference: 0 };
  }

  const reasons: MaterialPriceReviewReason[] = [];
  if (normalizedUnit(input.historicalPrice.unit) !== normalizedUnit(input.currentPrice.unit)) reasons.push("unit");
  if (normalizedCurrency(input.historicalPrice.currency) !== normalizedCurrency(input.currentPrice.currency)) reasons.push("currency");
  if (input.historicalPrice.sourceTaxBasis !== input.currentPrice.sourceTaxBasis) reasons.push("tax_basis");
  if (input.historicalPrice.sourceTaxRate !== input.currentPrice.sourceTaxRate) reasons.push("tax_rate");
  if (input.historicalPrice.taxJurisdictionCode !== input.currentPrice.taxJurisdictionCode) reasons.push("tax_jurisdiction");
  if (reasons.length > 0) {
    return { classification: "commercial_terms_changed", reasonCodes: reasons, absoluteDifference: null, percentageDifference: null };
  }

  const absoluteDifference = input.currentPrice.unitCost - input.historicalPrice.unitCost;
  if (absoluteDifference === 0) {
    return { classification: "version_changed_same_terms", reasonCodes: [], absoluteDifference: 0, percentageDifference: 0 };
  }
  return {
    classification: "price_changed",
    reasonCodes: [],
    absoluteDifference,
    percentageDifference: input.historicalPrice.unitCost === 0
      ? null
      : (absoluteDifference / input.historicalPrice.unitCost) * 100,
  };
}

export function buildMaterialPriceReviewOverlay(worksheet: WorksheetData): MaterialPriceReviewOverlayBinding[] {
  return Object.entries(worksheet.cells).flatMap(([cellAddress, cell]) => {
    const provenance = getWorksheetCellMaterialPricingProvenance(cell);
    if (!cell || !provenance || cell.type !== "number" || typeof cell.value !== "number" || cell.formula) return [];
    return [{ bindingId: provenance.bindingId, cellAddress, value: cell.value, type: "number" as const, formula: null, provenance }];
  });
}

function parsePrice(value: unknown): MaterialPriceReviewPrice | null {
  if (!isRecord(value)) return null;
  const unitCost = Number(value.unitCost);
  const taxRate = value.sourceTaxRate === null ? null : Number(value.sourceTaxRate);
  if (
    typeof value.id !== "string" || !value.id || !Number.isFinite(unitCost) ||
    typeof value.unit !== "string" || typeof value.currency !== "string" ||
    typeof value.sourceTaxBasis !== "string" || (taxRate !== null && !Number.isFinite(taxRate)) ||
    (value.taxJurisdictionCode !== null && typeof value.taxJurisdictionCode !== "string") ||
    typeof value.effectiveFrom !== "string" || !Number.isFinite(Date.parse(value.effectiveFrom)) ||
    typeof value.evaluatedAt !== "string" || !Number.isFinite(Date.parse(value.evaluatedAt))
  ) return null;
  return {
    id: value.id, unitCost, unit: value.unit, currency: value.currency,
    sourceTaxBasis: value.sourceTaxBasis, sourceTaxRate: taxRate,
    taxJurisdictionCode: value.taxJurisdictionCode as string | null,
    effectiveFrom: value.effectiveFrom, evaluatedAt: value.evaluatedAt,
  };
}

export function parseMaterialPriceReviewPage(value: unknown): MaterialPriceReviewPage | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.summary)) return null;
  const page = Number(value.page); const pageSize = Number(value.pageSize); const total = Number(value.total);
  const priceUpdates = Number(value.summary.priceUpdates); const needsReview = Number(value.summary.needsReview);
  const current = Number(value.summary.current); const versionChangedSameTerms = Number(value.summary.versionChangedSameTerms);
  if (![page, pageSize, total, priceUpdates, needsReview, current, versionChangedSameTerms].every(Number.isInteger) ||
    page < 1 || pageSize < 1 || total < 0 || typeof value.hasMore !== "boolean" ||
    typeof value.evaluatedAt !== "string" || !Number.isFinite(Date.parse(value.evaluatedAt))) return null;

  const items: MaterialPriceReviewGroup[] = [];
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.classification !== "string" ||
      !CLASSIFICATIONS.has(item.classification as MaterialPriceReviewClassification) || !Array.isArray(item.reasonCodes) ||
      item.reasonCodes.some((reason) => typeof reason !== "string" || !REASONS.has(reason as MaterialPriceReviewReason)) ||
      !Array.isArray(item.targets)) return null;
    const historicalPrice = parsePrice(item.historicalPrice);
    const currentPrice = item.currentPrice === null ? null : parsePrice(item.currentPrice);
    const provenanceVersion = Number(item.provenanceVersion ?? 1);
    const historicalPricing = item.historicalPricing === null || item.historicalPricing === undefined
      ? null : parseMaterialEstimatingPrice(item.historicalPricing);
    const currentPricing = item.currentPricing === null || item.currentPricing === undefined
      ? null : parseMaterialEstimatingPrice(item.currentPricing);
    if (!historicalPrice || (item.currentPrice !== null && !currentPrice)) return null;
    if ((provenanceVersion !== 1 && provenanceVersion !== 2) ||
      (item.historicalPricing != null && !historicalPricing) || (item.currentPricing != null && !currentPricing)) return null;
    const required = [item.groupKey, item.materialId, item.materialName, item.supplierId, item.supplierName, item.supplierProductId];
    if (required.some((entry) => typeof entry !== "string" || !entry) ||
      (item.supplierProductDescription !== null && typeof item.supplierProductDescription !== "string") ||
      (item.supplierSku !== null && typeof item.supplierSku !== "string")) return null;
    const targets: MaterialPriceReviewBindingTarget[] = [];
    for (const target of item.targets) {
      if (!isRecord(target) || [target.bindingId, target.sheetId, target.sheetName, target.cellAddress].some((entry) => typeof entry !== "string" || !entry)) return null;
      targets.push(target as MaterialPriceReviewBindingTarget);
    }
    const absoluteDifference = item.absoluteDifference === null ? null : Number(item.absoluteDifference);
    const percentageDifference = item.percentageDifference === null ? null : Number(item.percentageDifference);
    if ((absoluteDifference !== null && !Number.isFinite(absoluteDifference)) || (percentageDifference !== null && !Number.isFinite(percentageDifference))) return null;
    items.push({
      groupKey: item.groupKey as string,
      classification: item.classification as MaterialPriceReviewClassification,
      reasonCodes: item.reasonCodes as MaterialPriceReviewReason[],
      materialId: item.materialId as string, materialName: item.materialName as string,
      supplierId: item.supplierId as string, supplierName: item.supplierName as string,
      supplierProductId: item.supplierProductId as string,
      supplierProductDescription: item.supplierProductDescription as string | null,
      supplierSku: item.supplierSku as string | null,
      historicalPrice, currentPrice, provenanceVersion, historicalPricing, currentPricing,
      absoluteDifference, percentageDifference, targets,
    });
  }
  return {
    items, summary: { priceUpdates, needsReview, current, versionChangedSameTerms },
    page, pageSize, total, hasMore: value.hasMore, evaluatedAt: value.evaluatedAt,
  };
}
