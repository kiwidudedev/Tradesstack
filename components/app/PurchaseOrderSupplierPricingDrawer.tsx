"use client";

import { useCallback } from "react";
import { OrganizationSupplierPricingDrawer } from "@/components/app/OrganizationSupplierPricingDrawer";
import { purchaseOrderSupplierMismatchIssue } from "@/lib/materials/purchase-order-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";

export function PurchaseOrderSupplierPricingDrawer({
  purchaseOrderSupplierId,
  purchaseOrderSupplierLabel,
  onClose,
  onSelectPrice,
}: {
  purchaseOrderSupplierId: string | null;
  purchaseOrderSupplierLabel: string;
  onClose: () => void;
  onSelectPrice: (item: PricingWorksheetMaterialPickerItem) => void;
}) {
  const getAdditionalSelectionIssue = useCallback((item: PricingWorksheetMaterialPickerItem) => (
    purchaseOrderSupplierMismatchIssue({
      item,
      purchaseOrderSupplierId,
      purchaseOrderSupplierLabel,
    })
  ), [purchaseOrderSupplierId, purchaseOrderSupplierLabel]);

  return (
    <OrganizationSupplierPricingDrawer
      destinationLabel="Purchase Order"
      onClose={onClose}
      onSelectPrice={onSelectPrice}
      getAdditionalSelectionIssue={getAdditionalSelectionIssue}
    />
  );
}
