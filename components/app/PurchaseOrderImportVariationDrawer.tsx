"use client";

import { ListPlus } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { WorksheetSidePanel, WorksheetSidePanelBody, WorksheetSidePanelFooter, WorksheetSidePanelHeader } from "@/components/app/WorksheetSidePanel";
import type { PurchaseOrderImportLine, PurchaseOrderVariationImportOption } from "@/lib/purchase-orders/source-import";
import { interMedium } from "@/lib/fonts";

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "NZD", maximumFractionDigits: 2 }).format(value);
}

export function PurchaseOrderImportVariationDrawer({
  variations, selectedVariationId, lines, selectedLineIds, alreadyImportedSourceCostItemIds,
  isLoadingVariations, isLoadingLines, error, onVariationChange, onToggleLine, onImportSelected, onClose,
}: {
  variations: PurchaseOrderVariationImportOption[];
  selectedVariationId: string;
  lines: PurchaseOrderImportLine[];
  selectedLineIds: ReadonlySet<string>;
  alreadyImportedSourceCostItemIds: ReadonlySet<string>;
  isLoadingVariations: boolean;
  isLoadingLines: boolean;
  error: string | null;
  onVariationChange: (variationId: string) => void;
  onToggleLine: (lineId: string) => void;
  onImportSelected: () => void;
  onClose: () => void;
}) {
  const selectedVariation = variations.find((variation) => variation.id === selectedVariationId) ?? null;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <WorksheetSidePanel ariaLabel="Import variation items" closeLabel="Close Import From Variation" onClose={onClose} variant="overlay" className="w-[min(100vw,700px)] md:w-[700px]">
      <WorksheetSidePanelHeader icon={<ListPlus className="h-4 w-4" strokeWidth={1.75} />} title="Import From Variation" description="Select approved variation items to add to this purchase order." closeLabel="Close Import From Variation" onClose={onClose} />
      <WorksheetSidePanelBody>
        {error ? <p role="alert" className="mb-3 rounded-[8px] bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">{error}</p> : null}
        <select autoFocus aria-label="Approved Variation" value={selectedVariationId} disabled={isLoadingVariations} onChange={(event) => onVariationChange(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]`}>
          <option value="">{isLoadingVariations ? "Loading approved Variations…" : "Select approved Variation"}</option>
          {variations.map((variation) => <option key={variation.id} value={variation.id}>{variation.variationNumber} - {variation.variationTitle || "Untitled Variation"}</option>)}
        </select>
        {!isLoadingVariations && variations.length === 0 && !error ? <div className="mt-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-center"><p className="text-sm font-semibold text-[var(--text-primary)]">No Approved Variations</p><p className="mt-1 text-sm text-[var(--text-secondary)]">This Project has no eligible Variation items to import.</p></div> : null}
        {selectedVariation ? <div className="mt-4 flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"><p className="text-sm font-semibold text-[var(--text-primary)]">{selectedVariation.variationNumber} · {selectedVariation.variationTitle || "Untitled Variation"}</p><span className="rounded-full bg-[var(--success-light)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">Approved</span></div> : null}
        {selectedVariation ? <div className="mt-4 overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--surface)]"><table className="min-w-[660px] border-collapse"><thead><tr className={`${interMedium.className} border-b border-[var(--border)] bg-[var(--surface-muted)] text-[13px] font-semibold text-[var(--text-secondary)]`}><th className="w-[44px] px-3 py-2.5" /><th className="px-3 py-2.5 text-left">Description</th><th className="w-[120px] px-3 py-2.5 text-left">Item</th><th className="w-[70px] px-3 py-2.5 text-left">Qty.</th><th className="w-[70px] px-3 py-2.5 text-left">Unit</th><th className="w-[100px] px-3 py-2.5 text-left">Rate</th><th className="w-[110px] px-3 py-2.5 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">{isLoadingLines ? <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">Loading Variation lines…</td></tr> : lines.length ? lines.map((line) => { const alreadyImported = alreadyImportedSourceCostItemIds.has(line.sourceCostItemId); return <tr key={line.id}><td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`Select ${line.description || "Variation line"}`} checked={selectedLineIds.has(line.id)} disabled={alreadyImported} onChange={() => onToggleLine(line.id)} className="h-4 w-4 rounded border-[var(--border)]" /></td><td className="px-3 py-3"><span className="block max-w-[260px] truncate text-sm font-medium text-[var(--text-primary)]">{line.description || "Untitled line item"}</span>{alreadyImported ? <span className="text-[11px] text-[var(--text-secondary)]">Already imported</span> : null}</td><td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{line.section}</td><td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{line.quantity}</td><td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{line.unit}</td><td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{toMoney(line.rate)}</td><td className="px-3 py-3 text-right text-sm font-semibold text-[var(--text-primary)]">{toMoney(line.quantity * line.rate)}</td></tr>; }) : <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">No eligible Variation lines are available to import.</td></tr>}</tbody></table></div> : null}
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter><Button type="button" variant="outline" onClick={onImportSelected} disabled={selectedLineIds.size === 0} className="h-10 rounded-full">Import Selected Variation Lines</Button></WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}
