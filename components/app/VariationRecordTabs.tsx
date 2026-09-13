"use client";

import { CommercialRecordTabs } from "@/components/app/CommercialRecordTabs";

export function VariationRecordTabs({
  detailsHref,
  pricingWorksheetHref,
  activeTab,
}: {
  detailsHref: string;
  pricingWorksheetHref: string;
  activeTab: "details" | "pricing-worksheet";
}) {
  return <CommercialRecordTabs
    detailsHref={detailsHref}
    pricingWorksheetHref={pricingWorksheetHref}
    detailsLabel="Variation Details"
    ariaLabel="Variation record navigation"
    activeTab={activeTab}
  />;
}
