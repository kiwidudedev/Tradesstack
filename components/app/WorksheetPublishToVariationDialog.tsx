"use client";

import { CommercialLineConfirmationEditor } from "@/components/app/WorksheetCommercialLineConfirmationEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type VariationCostSection = "Labour" | "Materials" | "Subcontractors" | "Plant" | "Margin";

export interface WorksheetPublishToVariationLineDraft {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  total: string;
  section: VariationCostSection;
}

export function WorksheetPublishToVariationDialog({
  open,
  lines,
  variationNumber,
  variationTitle,
  variationStatus,
  sourceRangeLabel,
  selectedValues,
  onOpenChange,
  onLineChange,
  onAddLine,
  onRemoveLine,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  lines: WorksheetPublishToVariationLineDraft[];
  variationNumber: string;
  variationTitle: string;
  variationStatus: string;
  sourceRangeLabel: string;
  selectedValues: string[];
  onOpenChange: (open: boolean) => void;
  onLineChange: (lineId: string, patch: Partial<WorksheetPublishToVariationLineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-3xl p-6 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>Add to Variation</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Confirm the commercial line values that should be created from this worksheet selection.
          </DialogDescription>
        </DialogHeader>

        <CommercialLineConfirmationEditor
          lines={lines}
          sourceRangeLabel={sourceRangeLabel}
          selectedValues={selectedValues}
          onLineChange={onLineChange}
          onAddLine={onAddLine}
          onRemoveLine={onRemoveLine}
          isSubmitting={isSubmitting}
          renderDestination={(
            <div className="space-y-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">Current variation</p>
              <div className="rounded-[12px] border border-[var(--border)] bg-white px-4 py-3">
                <p className="text-sm text-[var(--text-primary)]">{variationNumber}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {variationTitle.trim() || "Untitled variation"}
                </p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">Status: {variationStatus}</p>
              </div>
            </div>
          )}
          renderLineExtras={(line) => (
            <label className="mt-3 block space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                Variation section
              </span>
              <select
                value={line.section}
                onChange={(event) =>
                  onLineChange(line.id, {
                    section: event.target.value as VariationCostSection,
                  })
                }
                className="h-10 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)]"
              >
                <option value="Labour">Labour</option>
                <option value="Materials">Materials</option>
                <option value="Subcontractors">Subcontractors</option>
                <option value="Plant">Plant / Equipment</option>
                <option value="Margin">Margin</option>
              </select>
            </label>
          )}
        />

        <DialogFooter className="mt-5 flex flex-row items-center justify-end gap-2 border-t border-[var(--app-border)] pt-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add to Variation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
