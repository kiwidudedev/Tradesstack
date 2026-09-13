import {
  buildSupplierMaterialDescription,
  resolveCommercialSupplierPrice,
} from "@/lib/materials/commercial-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";

export type PurchaseOrderSupplierMaterialLine = {
  id: string;
  lineUid: string;
  costItemId: null;
  sourceCostItemId: null;
  commercialItemLink: null;
  section: "Materials";
  description: string;
  quantity: 1;
  unit: string;
  rate: number;
  sourceTimeSheetEntryId: null;
};

export function canUsePurchaseOrderSupplierPricing(purchaseOrderType: string) {
  return purchaseOrderType === "Material Supply";
}

export function purchaseOrderSupplierMismatchIssue({
  item,
  purchaseOrderSupplierId,
  purchaseOrderSupplierLabel,
}: {
  item: PricingWorksheetMaterialPickerItem;
  purchaseOrderSupplierId: string | null;
  purchaseOrderSupplierLabel: string;
}) {
  if (!purchaseOrderSupplierId || purchaseOrderSupplierId === item.supplierId) return null;
  const currentSupplier = purchaseOrderSupplierLabel.trim() || "the selected supplier";
  return `This Purchase Order is issued to ${currentSupplier}. Only prices from that supplier can be used.`;
}

export function buildPurchaseOrderSelectionFromSupplierPrice({
  item,
  purchaseOrderSupplierId,
  purchaseOrderSupplierLabel,
  createId = () => crypto.randomUUID(),
}: {
  item: PricingWorksheetMaterialPickerItem;
  purchaseOrderSupplierId: string | null;
  purchaseOrderSupplierLabel: string;
  createId?: () => string;
}): {
  supplierId: string;
  supplierLabel: string;
  line: PurchaseOrderSupplierMaterialLine;
} {
  const mismatch = purchaseOrderSupplierMismatchIssue({
    item,
    purchaseOrderSupplierId,
    purchaseOrderSupplierLabel,
  });
  if (mismatch) throw new Error(mismatch);

  const resolution = resolveCommercialSupplierPrice(item, "Purchase Order");
  if (resolution.status !== "available") throw new Error(resolution.reason);

  return {
    supplierId: purchaseOrderSupplierId || item.supplierId,
    supplierLabel: purchaseOrderSupplierId
      ? purchaseOrderSupplierLabel.trim() || item.supplierName
      : item.supplierName,
    line: {
      id: createId(),
      lineUid: createId(),
      costItemId: null,
      sourceCostItemId: null,
      commercialItemLink: null,
      section: "Materials",
      description: buildSupplierMaterialDescription(item),
      quantity: 1,
      unit: resolution.unit,
      rate: resolution.rate,
      sourceTimeSheetEntryId: null,
    },
  };
}
