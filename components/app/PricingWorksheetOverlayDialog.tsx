"use client";

import { memo } from "react";
import { OpportunityPricingWorksheetBoard } from "@/components/app/OpportunityPricingWorksheetBoard";
import { PricingWorksheetOwnerProvider } from "@/components/app/PricingWorksheetOwnerProvider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { countPricingWorksheetPerformance } from "@/lib/pricing-worksheet-performance";
import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";

export const PricingWorksheetOverlayDialog = memo(function PricingWorksheetOverlayDialog({
  owner,
  worksheetId,
  initialSheetId,
  onClose,
  onDirtyStateChange,
}: {
  owner: PricingWorksheetOwnerContextValue;
  worksheetId: string;
  initialSheetId?: string | null;
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
        <DialogDescription className="sr-only">
          Edit worksheet cells, mappings, and commercial outputs.
        </DialogDescription>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <PricingWorksheetOwnerProvider owner={owner}>
              <OpportunityPricingWorksheetBoard
                worksheetId={worksheetId}
                initialSheetId={initialSheetId}
                onClose={onClose}
                onDirtyStateChange={onDirtyStateChange}
              />
            </PricingWorksheetOwnerProvider>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
