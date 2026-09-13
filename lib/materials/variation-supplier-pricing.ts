import {
  buildSupplierMaterialDescription,
  resolveCommercialSupplierPrice,
} from "@/lib/materials/commercial-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";

export type VariationSupplierMaterialLine = {
  id: string;
  section: "Materials";
  description: string;
  quantity: 1;
  unit: string;
  rate: number;
  total: number;
  sourceProjectQuoteId: null;
  sourceProjectQuoteLineItemId: null;
  sourceProjectQuoteNumber: "";
  sourcePurchaseOrderId: null;
  sourcePurchaseOrderLineItemId: null;
  sourcePurchaseOrderNumber: "";
  commercialItemLink: null;
};

export function buildVariationLineFromSupplierPrice(
  item: PricingWorksheetMaterialPickerItem,
  createId: () => string = () => crypto.randomUUID(),
): VariationSupplierMaterialLine {
  const resolution = resolveCommercialSupplierPrice(item, "Variation");
  if (resolution.status !== "available") throw new Error(resolution.reason);

  return {
    id: createId(),
    section: "Materials",
    description: buildSupplierMaterialDescription(item),
    quantity: 1,
    unit: resolution.unit,
    rate: resolution.rate,
    total: Number(resolution.rate.toFixed(2)),
    sourceProjectQuoteId: null,
    sourceProjectQuoteLineItemId: null,
    sourceProjectQuoteNumber: "",
    sourcePurchaseOrderId: null,
    sourcePurchaseOrderLineItemId: null,
    sourcePurchaseOrderNumber: "",
    commercialItemLink: null,
  };
}
