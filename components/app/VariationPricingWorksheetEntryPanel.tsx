"use client";

import { FileSpreadsheet } from "lucide-react";
import { interMedium } from "@/lib/fonts";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-none sm:p-8">
      <div className="max-w-2xl">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[16px] bg-[var(--surface-muted)] text-[var(--text-primary)]">
          <FileSpreadsheet className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Pricing Worksheet</h2>
        <p className={`${interMedium.className} mt-3 text-sm leading-6 text-[var(--text-secondary)]`}>
          Open the full worksheet workspace for this specific variation. The worksheet remains variation-owned and uses
          the same workbook, pages, formulas, AI, save pipeline, and overlay experience as the Opportunity worksheet.
        </p>
        {!hasSourceOpportunityLineage ? (
          <p className={`${interMedium.className} mt-3 text-sm leading-6 text-[var(--text-secondary)]`}>
            This project still needs source opportunity lineage before the worksheet can open.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={onOpenWorksheet}
            disabled={!canManageVariation || !hasSourceOpportunityLineage || isCreatingWorksheet}
            className="h-10 rounded-full px-5"
          >
            {actionLabel}
          </Button>
          <p className={`${interMedium.className} text-sm text-[var(--text-secondary)]`}>
            {hasWorksheet
              ? "Resume the existing worksheet for this variation."
              : "Create the first worksheet for this variation and open it immediately."}
          </p>
        </div>
      </div>
    </div>
  );
}
