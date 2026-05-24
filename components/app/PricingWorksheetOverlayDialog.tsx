"use client";

import { memo } from "react";
import { X } from "lucide-react";
import { OpportunityPricingWorksheetBoard } from "@/components/app/OpportunityPricingWorksheetBoard";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { countPricingWorksheetPerformance } from "@/lib/pricing-worksheet-performance";

export const PricingWorksheetOverlayDialog = memo(function PricingWorksheetOverlayDialog({
  worksheetId,
  onClose,
  onDirtyStateChange,
}: {
  worksheetId: string;
  onClose: () => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
}) {
  countPricingWorksheetPerformance("overlay-render", { worksheetId });

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        hideClose
        className="relative h-[90vh] w-[94vw] max-h-[92vh] max-w-none overflow-visible rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">Pricing worksheet editor</DialogTitle>
        <button
          type="button"
          aria-label="Close pricing worksheet overlay"
          onClick={onClose}
          className="absolute -right-4 -top-4 z-[80] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" strokeWidth={2.2} />
        </button>
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)]">
          <div className="min-h-0 flex-1 overflow-hidden p-4 pr-5 pt-5">
            <OpportunityPricingWorksheetBoard
              worksheetId={worksheetId}
              onDirtyStateChange={onDirtyStateChange}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
