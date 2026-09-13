"use client";

import {
  CommercialLineConfirmationEditor,
  type CommercialLineDraft,
} from "@/components/app/WorksheetCommercialLineConfirmationEditor";
import { Button } from "@/components/ui/button";
import { QuoteDestinationMultiSelect } from "@/components/app/QuoteDestinationMultiSelect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QuotePublishOption } from "@/lib/commercial-items/quote-destination-adapter";

export function WorksheetPublishToQuoteDialog({
  open,
  lines,
  quotes,
  selectedTargetMode,
  selectedQuoteIds,
  sourceRangeLabel,
  selectedValues,
  onOpenChange,
  onTargetModeChange,
  onQuotesChange,
  onLineChange,
  onAddLine,
  onRemoveLine,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  lines: CommercialLineDraft[];
  quotes: QuotePublishOption[];
  selectedTargetMode: "new" | "existing";
  selectedQuoteIds: string[];
  sourceRangeLabel: string;
  selectedValues: string[];
  onOpenChange: (open: boolean) => void;
  onTargetModeChange: (mode: "new" | "existing") => void;
  onQuotesChange: (quoteIds: string[]) => void;
  onLineChange: (lineId: string, patch: Partial<CommercialLineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  const hasExistingQuotes = quotes.length > 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-3xl p-6 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>Add to Quote</DialogTitle>
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
              <p className="text-sm font-medium text-[var(--text-primary)]">Quote destination</p>
              <div className="flex items-start gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text-primary)]">Need another client quote?</span>
                  <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                    Create it in the Opportunity Quotation Register so its recipient and Rev 1 are recorded atomically.
                  </span>
                </span>
              </div>
              <label className="flex items-start gap-3 rounded-[12px] border border-[var(--border)] bg-white px-4 py-3">
                <input
                  type="radio"
                  checked={selectedTargetMode === "existing"}
                  onChange={() => hasExistingQuotes && onTargetModeChange("existing")}
                  className="mt-1"
                  disabled={!hasExistingQuotes}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text-primary)]">Append Existing Draft Quote</span>
                  <div className="mt-3">
                    <QuoteDestinationMultiSelect
                    quotes={quotes}
                    selectedIds={selectedQuoteIds}
                    onChange={onQuotesChange}
                    disabled={selectedTargetMode !== "existing" || !hasExistingQuotes}
                    />
                  </div>
                </span>
              </label>
            </div>
          )}
        />

        <DialogFooter className="mt-5 flex flex-row items-center justify-end gap-2 border-t border-[var(--app-border)] pt-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting || (selectedTargetMode === "existing" && selectedQuoteIds.length === 0)}>
            {isSubmitting ? "Adding..." : selectedTargetMode === "existing" && selectedQuoteIds.length > 1 ? "Add to Quotes" : "Add to Quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
