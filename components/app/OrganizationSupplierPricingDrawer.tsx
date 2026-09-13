"use client";

import { useCallback } from "react";
import { Boxes } from "lucide-react";
import {
  SharedSupplierPricingBrowser,
  type SupplierPricingDisplayPrice,
  type SupplierPricingPageLoader,
} from "@/components/app/SharedSupplierPricingBrowser";
import { WorksheetSidePanel, WorksheetSidePanelHeader } from "@/components/app/WorksheetSidePanel";
import { resolveCommercialSupplierPrice } from "@/lib/materials/commercial-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";

export function OrganizationSupplierPricingDrawer({
  destinationLabel,
  onClose,
  onSelectPrice,
  getAdditionalSelectionIssue,
}: {
  destinationLabel: string;
  onClose: () => void;
  onSelectPrice: (item: PricingWorksheetMaterialPickerItem) => void;
  getAdditionalSelectionIssue?: (item: PricingWorksheetMaterialPickerItem) => string | null;
}) {
  const getDisplayPrice = useCallback((item: PricingWorksheetMaterialPickerItem): SupplierPricingDisplayPrice | null => {
    const resolution = resolveCommercialSupplierPrice(item, destinationLabel);
    if (resolution.status !== "available") return null;
    return {
      formattedPrice: new Intl.NumberFormat("en-NZ", {
        style: "currency", currency: "NZD", minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(resolution.rate),
      unit: resolution.unit,
      basisLabel: `${destinationLabel} basis exclusive`,
    };
  }, [destinationLabel]);

  const getSelectionIssue = useCallback((item: PricingWorksheetMaterialPickerItem) => {
    const resolution = resolveCommercialSupplierPrice(item, destinationLabel);
    if (resolution.status !== "available") return resolution.reason;
    return getAdditionalSelectionIssue?.(item) ?? null;
  }, [destinationLabel, getAdditionalSelectionIssue]);

  const loadPage = useCallback<SupplierPricingPageLoader>(async ({ search, page, signal }) => {
    const query = new URLSearchParams({ search, page: String(page) });
    const response = await fetch(`/api/materials/supplier-pricing?${query}`, {
      signal,
      cache: "no-store",
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error : "Material Library unavailable.";
      throw new Error(message);
    }
    return payload;
  }, []);

  return (
    <WorksheetSidePanel
      ariaLabel="Supplier pricing Material Library"
      closeLabel="Close Material Library"
      onClose={onClose}
      variant="overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <WorksheetSidePanelHeader
        icon={<Boxes className="h-4 w-4" strokeWidth={1.75} />}
        title="Materials"
        description="Browse supplier prices"
        closeLabel="Close Material Library"
        onClose={onClose}
      />
      <SharedSupplierPricingBrowser
        loadPage={loadPage}
        onSelectPrice={onSelectPrice}
        getSelectionIssue={getSelectionIssue}
        getDisplayPrice={getDisplayPrice}
        autoFocus
      />
    </WorksheetSidePanel>
  );
}
