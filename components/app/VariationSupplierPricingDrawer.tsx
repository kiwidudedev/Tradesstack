"use client";

import { OrganizationSupplierPricingDrawer } from "@/components/app/OrganizationSupplierPricingDrawer";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";

export function VariationSupplierPricingDrawer({
  onClose,
  onSelectPrice,
}: {
  onClose: () => void;
  onSelectPrice: (item: PricingWorksheetMaterialPickerItem) => void;
}) {
  return (
    <OrganizationSupplierPricingDrawer
      destinationLabel="Variation"
      onClose={onClose}
      onSelectPrice={onSelectPrice}
    />
  );
}
