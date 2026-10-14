"use client";

import { PricingWorksheetTemplateEditor } from "@/components/app/PricingWorksheetTemplateEditor";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export default function PricingWorksheetTemplateEditorPage() {
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
        <DialogTitle className="sr-only">Pricing worksheet template editor</DialogTitle>
        <DialogDescription className="sr-only">Edit the reusable pricing worksheet template workbook.</DialogDescription>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <PricingWorksheetTemplateEditor />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
