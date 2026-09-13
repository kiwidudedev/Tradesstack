import type { LineItem } from "@/lib/quote-editor-core";
import {
  buildSupplierMaterialDescription,
  resolveCommercialSupplierPrice,
  type CommercialSupplierPriceResolution,
} from "@/lib/materials/commercial-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";

export type QuoteSupplierPriceResolution = CommercialSupplierPriceResolution;

export function resolveQuoteSupplierPrice(
  item: PricingWorksheetMaterialPickerItem,
): QuoteSupplierPriceResolution {
  return resolveCommercialSupplierPrice(item, "Quote");
}

export function quoteSupplierPriceIssue(item: PricingWorksheetMaterialPickerItem) {
  const resolution = resolveQuoteSupplierPrice(item);
  return resolution.status === "available" ? null : resolution.reason;
}

export function buildQuoteLineFromSupplierPrice(
  item: PricingWorksheetMaterialPickerItem,
  createId: () => string = () => crypto.randomUUID(),
): LineItem {
  const resolution = resolveQuoteSupplierPrice(item);
  if (resolution.status !== "available") throw new Error(resolution.reason);

  return {
    id: createId(),
    section: "Materials",
    description: buildSupplierMaterialDescription(item),
    quantity: 1,
    unit: resolution.unit,
    rate: resolution.rate,
    isOptional: false,
  };
}
