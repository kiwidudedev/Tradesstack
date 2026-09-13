"use client";

import { PricingWorksheetEntryPanel } from "@/components/app/PricingWorksheetEntryPanel";

export function VariationPricingWorksheetEntryPanel({
  canManageVariation,
  hasSourceOpportunityLineage,
  hasWorksheet,
  isCreatingWorksheet,
  onOpenWorksheet,
}: {
  canManageVariation: boolean;
  hasSourceOpportunityLineage: boolean;
  hasWorksheet: boolean;
  isCreatingWorksheet: boolean;
  onOpenWorksheet: () => void;
}) {
  const actionLabel = hasWorksheet
    ? "Open Pricing Worksheet"
    : isCreatingWorksheet
      ? "Creating..."
      : "Create Pricing Worksheet";

  return <PricingWorksheetEntryPanel
    description={hasSourceOpportunityLineage
      ? "Open the full worksheet workspace for this variation. It uses the shared workbook, pages, formulas, AI, save pipeline, and overlay experience."
      : "This project still needs source Opportunity lineage before the worksheet can open."}
    actionLabel={actionLabel}
    secondaryText={hasWorksheet
      ? "Resume the existing worksheet for this variation."
      : "Create the first worksheet for this variation and open it immediately."}
    disabled={!canManageVariation || !hasSourceOpportunityLineage || isCreatingWorksheet}
    onOpenWorksheet={onOpenWorksheet}
  />;
}
