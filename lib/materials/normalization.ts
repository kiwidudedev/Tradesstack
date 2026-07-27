import type {
  MaterialImportRowAction,
  MaterialListSummary,
  OrganizationMaterialRow,
  OrganizationMaterialSupplierPriceRow,
} from "@/lib/materials/types";

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

export function formatMaterialMoney(value: number | null | undefined, currency = "NZD") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
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
  material: Pick<OrganizationMaterialRow, "is_active" | "archived_at" | "needs_review">;
  currentPrices: OrganizationMaterialSupplierPriceRow[];
}) {
  if (!params.material.is_active || params.material.archived_at) {
    return "Archived" as const;
  }

  if (params.material.needs_review) {
    return "Needs Review" as const;
  }

  const hasPreferred = params.currentPrices.some((price) => price.is_current && price.is_preferred);
  if (!hasPreferred || params.currentPrices.length === 0) {
    return "Needs Review" as const;
  }

  return "Active" as const;
}

export function buildMaterialSummary(params: {
  material: OrganizationMaterialRow;
  currentPrices: OrganizationMaterialSupplierPriceRow[];
  supplierNameById: Map<string, string>;
  costCodeLabelById: Map<string, string>;
}): MaterialListSummary {
  const preferredPrice =
    params.currentPrices.find((price) => price.is_current && price.is_preferred) ??
    params.currentPrices[0] ??
    null;

  const lowestCurrentCost =
    params.currentPrices.length > 0
      ? params.currentPrices.reduce((lowest, price) => Math.min(lowest, Number(price.unit_cost)), Number(params.currentPrices[0].unit_cost))
      : null;

  return {
    material: params.material,
    preferredPrice,
    currentPrices: params.currentPrices,
    otherSupplierCount: Math.max(0, params.currentPrices.length - (preferredPrice ? 1 : 0)),
    lowestCurrentCost,
    preferredSupplierName: preferredPrice
      ? params.supplierNameById.get(preferredPrice.supplier_id) ?? null
      : null,
    costCodeLabel: params.material.organization_cost_code_id
      ? params.costCodeLabelById.get(params.material.organization_cost_code_id) ?? null
      : null,
    status: buildMaterialStatus({
      material: params.material,
      currentPrices: params.currentPrices,
    }),
  };
}
