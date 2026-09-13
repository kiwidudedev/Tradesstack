"use client";

import { ListPlus } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  WorksheetSidePanel,
  WorksheetSidePanelBody,
  WorksheetSidePanelFooter,
  WorksheetSidePanelHeader,
} from "@/components/app/WorksheetSidePanel";
import type { PurchaseOrderQuoteImportSource } from "@/lib/purchase-orders/source-import";
import { interMedium } from "@/lib/fonts";

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "NZD", maximumFractionDigits: 2 }).format(value);
}

export function PurchaseOrderImportQuoteDrawer({
  source,
  selectedLineIds,
  alreadyImportedSourceCostItemIds,
  isLoading,
  error,
  onToggleLine,
  onImportSelected,
  onClose,
}: {
  source: PurchaseOrderQuoteImportSource | null;
  selectedLineIds: ReadonlySet<string>;
  alreadyImportedSourceCostItemIds: ReadonlySet<string>;
  isLoading: boolean;
  error: string | null;
  onToggleLine: (lineId: string) => void;
  onImportSelected: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <WorksheetSidePanel
      ariaLabel="Import quote items"
      closeLabel="Close Import From Quote"
      onClose={onClose}
      variant="overlay"
      className="w-[min(100vw,700px)] md:w-[700px]"
    >
      <WorksheetSidePanelHeader
        icon={<ListPlus className="h-4 w-4" strokeWidth={1.75} />}
        title="Import From Quote"
        description="Select quoted items to add to this purchase order."
        closeLabel="Close Import From Quote"
        onClose={onClose}
      />
      <WorksheetSidePanelBody>
        {isLoading ? <p className="py-6 text-sm text-[var(--text-secondary)]">Loading accepted contractual Quote…</p> : null}
        {error ? <p role="alert" className="rounded-[8px] bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">{error}</p> : null}
        {!isLoading && !error && !source ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)]">No accepted contractual Quote</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">This Project does not have an eligible accepted Quote to import.</p>
          </div>
        ) : null}
        {source ? (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{source.quoteNumber} · {source.quoteTitle || "Untitled Quote"}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Revision {source.revisionNumber}</p>
                </div>
                <span className="rounded-full bg-[var(--success-light)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">Accepted</span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
              <table className="min-w-[660px] border-collapse">
                <thead><tr className={`${interMedium.className} border-b border-[var(--border)] bg-[var(--surface-muted)] text-[13px] font-semibold text-[var(--text-secondary)]`}>
                  <th className="w-[44px] px-3 py-2.5" /><th className="px-3 py-2.5 text-left">Description</th><th className="w-[120px] px-3 py-2.5 text-left">Item</th><th className="w-[70px] px-3 py-2.5 text-left">Qty.</th><th className="w-[70px] px-3 py-2.5 text-left">Unit</th><th className="w-[100px] px-3 py-2.5 text-left">Rate</th><th className="w-[110px] px-3 py-2.5 text-right">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {source.lines.length ? source.lines.map((line) => {
                    const alreadyImported = alreadyImportedSourceCostItemIds.has(line.sourceCostItemId);
                    return <tr key={line.id}>
                      <td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`Select ${line.description || "Quote line"}`} checked={selectedLineIds.has(line.id)} disabled={alreadyImported} onChange={() => onToggleLine(line.id)} className="h-4 w-4 rounded border-[var(--border)]" /></td>
                      <td className="px-3 py-3"><span className="block max-w-[260px] truncate text-sm font-medium text-[var(--text-primary)]">{line.description || "Untitled line item"}</span>{alreadyImported ? <span className="text-[11px] text-[var(--text-secondary)]">Already imported</span> : null}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{line.section}</td><td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{line.quantity}</td><td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{line.unit}</td><td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{toMoney(line.rate)}</td><td className="px-3 py-3 text-right text-sm font-semibold text-[var(--text-primary)]">{toMoney(line.quantity * line.rate)}</td>
                    </tr>;
                  }) : <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">No non-optional Quote lines are available to import.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter><Button type="button" variant="outline" onClick={onImportSelected} disabled={selectedLineIds.size === 0} className="h-10 rounded-full">Import Selected Quote Lines</Button></WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}
