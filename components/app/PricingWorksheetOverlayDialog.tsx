"use client";

import { memo } from "react";
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
        align="top"
        hideClose
        className="fixed inset-0 h-dvh w-dvw max-h-none max-w-none overflow-hidden rounded-none border-0 bg-[var(--surface)] p-0 shadow-none"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">Pricing worksheet editor</DialogTitle>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <OpportunityPricingWorksheetBoard
              worksheetId={worksheetId}
              onClose={onClose}
              onDirtyStateChange={onDirtyStateChange}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
