import type {
  EffectiveSupplierProductPrice,
  MaterialImportRowAction,
  MaterialListSummary,
  OrganizationMaterialRow,
} from "@/lib/materials/types";
import { resolveComparableBestCost } from "@/lib/materials/effective-price";

export function normalizeMaterialName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeMaterialUnit(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCurrency(value: string | null | undefined) {
  const normalized = (value ?? "NZD").trim().toUpperCase();
  return normalized.length > 0 ? normalized : "NZD";
}

export function resolveCompanyCurrency(params: {
  country?: string | null;
  defaultCurrency?: string | null;
}) {
  const country = (params.country ?? "").trim().toUpperCase();
  if (["NEW ZEALAND", "NZ", "NZL"].includes(country)) return "NZD";
  if (["AUSTRALIA", "AU", "AUS"].includes(country)) return "AUD";

  const configuredCurrency = (params.defaultCurrency ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : "NZD";
}

export function formatMaterialMoney(
  value: number | null | undefined,
  currency: string | null | undefined = "NZD",
  fallbackCurrency: string | null | undefined = "NZD",
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  const normalizedCurrency = (currency ?? "").trim().toUpperCase();
  const normalizedFallback = (fallbackCurrency ?? "").trim().toUpperCase();
  const safeFallback = /^[A-Z]{3}$/.test(normalizedFallback) ? normalizedFallback : "NZD";
  const displayCurrency = /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : safeFallback;

  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: displayCurrency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Currency is editable in review forms. A partial draft must not crash the page.
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: safeFallback,
      maximumFractionDigits: 2,
    }).format(value);
  }
}

export function formatMaterialDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function toMaterialImportActionLabel(value: MaterialImportRowAction) {
  switch (value) {
    case "create_material":
      return "Create Material";
    case "match_material":
      return "Match Material";
    case "skip":
      return "Skip";
    default:
      return "Pending";
  }
}

export function buildMaterialStatus(params: {
  material: Pick<OrganizationMaterialRow, "is_active" | "archived_at">;
}) {
  if (!params.material.is_active || params.material.archived_at) {
    return "Archived" as const;
  }

  return "Active" as const;
}

export function buildMaterialSummary(params: {
  material: OrganizationMaterialRow;
  effectiveSupplierProducts: EffectiveSupplierProductPrice[];
  supplierNameById: Map<string, string>;
  costCodeLabelById: Map<string, string>;
}): MaterialListSummary {
  const preferredOffering =
    params.effectiveSupplierProducts.find((offering) => offering.supplierProduct.is_preferred) ?? null;
  const preferredSupplierProduct = preferredOffering?.supplierProduct ?? null;
  const preferredPrice = preferredOffering?.effectivePrice ?? null;
  const currentPrices = params.effectiveSupplierProducts.flatMap((offering) =>
    offering.effectivePrice ? [offering.effectivePrice] : []
  );
  const effectiveSupplierIds = new Set(currentPrices.map((price) => price.supplier_id));
  const preferredEffectiveSupplierId = preferredPrice?.supplier_id ?? null;
  const bestCost = resolveComparableBestCost(params.effectiveSupplierProducts);

  return {
    material: params.material,
    preferredSupplierProduct,
    preferredPrice,
    effectiveSupplierProducts: params.effectiveSupplierProducts,
    currentPrices,
    supplierProductCount: params.effectiveSupplierProducts.length,
    supplierCount: effectiveSupplierIds.size,
    otherSupplierCount: Math.max(
      0,
      effectiveSupplierIds.size -
        (preferredEffectiveSupplierId && effectiveSupplierIds.has(preferredEffectiveSupplierId) ? 1 : 0)
    ),
    bestCost,
    lowestCurrentCost: bestCost.status === "comparable"
      ? Number(bestCost.comparableUnitCost ?? bestCost.price.unit_cost)
      : null,
    preferredSupplierName: preferredSupplierProduct
      ? params.supplierNameById.get(preferredSupplierProduct.supplier_id) ?? null
      : null,
    costCodeLabel: params.material.organization_cost_code_id
      ? params.costCodeLabelById.get(params.material.organization_cost_code_id) ?? null
      : null,
    status: buildMaterialStatus({
      material: params.material,
    }),
  };
}
