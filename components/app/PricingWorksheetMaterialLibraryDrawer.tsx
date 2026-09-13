"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import {
  formatSupplierPricingPrice,
  SharedSupplierPricingBrowser,
  type SupplierPricingPageLoader,
} from "@/components/app/SharedSupplierPricingBrowser";
import { WorksheetSidePanel, WorksheetSidePanelHeader } from "@/components/app/WorksheetSidePanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorksheetCell } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";
import {
  MATERIAL_PRICE_REVIEW_PAGE_SIZE,
  parseMaterialPriceReviewPage,
  type MaterialPriceReviewBindingTarget,
  type MaterialPriceReviewGroup,
  type MaterialPriceReviewOverlayBinding,
  type MaterialPriceReviewPage,
  type MaterialPriceReviewSummary,
} from "@/lib/pricing-worksheet-material-price-review";

export type PricingWorksheetMaterialTarget = {
  workbookId: string;
  sheetId: string;
  cellAddress: string;
  cell: WorksheetCell | null;
  structureKey: string;
};

type Props = {
  workbookId: string | null;
  target: PricingWorksheetMaterialTarget | null;
  targetIssue: string | null;
  canWrite: boolean;
  onClose: () => void;
  onInsert: (item: PricingWorksheetMaterialPickerItem) => boolean;
  activeSheetId: string | null;
  isDirty: boolean;
  localBindings: MaterialPriceReviewOverlayBinding[];
  onGoToCell: (cellAddress: string) => void;
  onUpdatePrice: (group: MaterialPriceReviewGroup, target: MaterialPriceReviewBindingTarget) => boolean;
};

const EMPTY_REVIEW_SUMMARY: MaterialPriceReviewSummary = {
  priceUpdates: 0,
  needsReview: 0,
  current: 0,
  versionChangedSameTerms: 0,
};

function formatReviewPrice(price: MaterialPriceReviewGroup["historicalPrice"]) {
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency", currency: price.currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(price.unitCost);
  } catch {
    return `${price.currency} ${price.unitCost.toFixed(2)}`;
  }
}

function formatSignedMoney(value: number, currency: string) {
  const formatted = formatReviewPrice({
    id: "difference", unitCost: Math.abs(value), unit: "", currency,
    sourceTaxBasis: "", sourceTaxRate: null, taxJurisdictionCode: null,
    effectiveFrom: "1970-01-01T00:00:00.000Z", evaluatedAt: "1970-01-01T00:00:00.000Z",
  });
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatted}`;
}

function reviewIssueLabel(group: MaterialPriceReviewGroup) {
  if (group.classification === "conversion_changed") return "Conversion changed. Review the old and current estimating relationship before replacing this rate.";
  if (group.classification === "price_and_conversion_changed") return "Supplier price and conversion both changed. Manual review is required.";
  if (group.classification === "conversion_unavailable") return "The confirmed conversion used historically is not currently available.";
  if (group.classification === "estimating_unit_mismatch") return "This legacy cell contains a supplier-unit price. A confirmed Material-unit estimating rate is now available.";
  if (group.classification === "source_inactive") return "Source no longer active. The historical worksheet price is preserved.";
  if (group.classification === "source_unavailable") return "Historical source unavailable. Stored pricing evidence is preserved.";
  if (group.classification === "no_current_price") return "No effective current Supplier Price is available.";
  if (group.classification === "invalid_binding") return "This binding requires manual review.";
  if (group.classification === "commercial_terms_changed") {
    const labels = group.reasonCodes.map((reason) => reason.replace("tax_", "tax ").replace("_", " "));
    return `Pricing terms changed: ${labels.join(", ")}. Compare manually before replacing the worksheet value.`;
  }
  return "This Material price requires review.";
}

function conversionLabel(pricing: MaterialPriceReviewGroup["historicalPricing"]) {
  const conversion = pricing?.conversion;
  return conversion
    ? `${conversion.supplierQuantity} ${conversion.supplierUnit} = ${conversion.materialQuantity} ${conversion.materialUnit}`
    : "No conversion available";
}

function currentCellLabel(cell: WorksheetCell | null) {
  if (!cell || cell.value === null || cell.value === "") return "Blank";
  return cell.formula ?? cell.displayValue ?? String(cell.value);
}

function MaterialsPanelTabs({
  mode,
  updateCount,
  onModeChange,
}: {
  mode: "library" | "updates";
  updateCount: number;
  onModeChange: (mode: "library" | "updates") => void;
}) {
  return (
    <div role="tablist" aria-label="Materials panel" className="grid grid-cols-2 border-b border-[var(--border-subtle)] px-4">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "library"}
        onClick={() => onModeChange("library")}
        className={`flex h-9 items-center justify-center border-b-2 px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-blue)] ${
          mode === "library"
            ? "border-[var(--orange-primary)] text-[var(--brand-blue)]"
            : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        Library
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "updates"}
        onClick={() => onModeChange("updates")}
        className={`flex h-9 items-center justify-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-blue)] ${
          mode === "updates"
            ? "border-[var(--orange-primary)] text-[var(--brand-blue)]"
            : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span>Updates</span>
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--text-secondary)]">
          {updateCount}
        </span>
      </button>
    </div>
  );
}

function SelectedCellContext({ target }: { target: PricingWorksheetMaterialTarget | null }) {
  return (
    <dl className="-mx-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-y border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-2 text-xs">
      <dt className="text-[var(--text-secondary)]">Insert into</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-[var(--text-primary)]">{target?.cellAddress ?? "No target"}</dd>
      {target ? (
        <>
          <dt className="text-[var(--text-secondary)]">Current value</dt>
          <dd className="min-w-0 truncate text-right tabular-nums text-[var(--text-primary)]">{currentCellLabel(target.cell)}</dd>
        </>
      ) : null}
    </dl>
  );
}

export const PricingWorksheetMaterialLibraryDrawer = memo(function PricingWorksheetMaterialLibraryDrawer({
  workbookId,
  target,
  targetIssue,
  canWrite,
  onClose,
  onInsert,
  activeSheetId,
  isDirty,
  localBindings,
  onGoToCell,
  onUpdatePrice,
}: Props) {
  const [mode, setMode] = useState<"library" | "updates">("library");
  const [pendingItem, setPendingItem] = useState<PricingWorksheetMaterialPickerItem | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewScope, setReviewScope] = useState<"workbook" | "sheet">("workbook");
  const [review, setReview] = useState<MaterialPriceReviewPage | null>(null);
  const [reviewSummary, setReviewSummary] = useState<MaterialPriceReviewSummary>(EMPTY_REVIEW_SUMMARY);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [updatingBindingId, setUpdatingBindingId] = useState<string | null>(null);
  const localBindingsKey = useMemo(() => JSON.stringify(localBindings), [localBindings]);
  const localBindingsRef = useRef(localBindings);
  localBindingsRef.current = localBindings;
  const loadLibraryPage = useCallback<SupplierPricingPageLoader>(async ({ search, page, signal }) => {
    if (!workbookId) throw new Error("Save the pricing workbook before browsing Material Library prices.");
    const query = new URLSearchParams({ workbookId, search, page: String(page) });
    const response = await fetch(`/api/pricing-worksheets/materials?${query}`, { signal, cache: "no-store" });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error : "Material Library unavailable.";
      throw new Error(message);
    }
    return payload;
  }, [workbookId]);

  const requestReview = useCallback(async (params: { page: number; pageSize: number; sheetId: string | null; signal: AbortSignal }) => {
    if (!workbookId) throw new Error("Save the pricing workbook before reviewing Material prices.");
    const reviewLocalBindings = localBindingsKey === "[]" ? [] : localBindingsRef.current;
    const response = await fetch("/api/pricing-worksheets/material-price-review", {
      method: "POST",
      cache: "no-store",
      signal: params.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workbookId,
        activeSheetId: isDirty ? activeSheetId : null,
        localBindings: isDirty ? reviewLocalBindings : null,
        sheetId: params.sheetId,
        page: params.page,
        pageSize: params.pageSize,
        mode: "review",
      }),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error : "Material price review unavailable.";
      throw new Error(message);
    }
    const parsed = parseMaterialPriceReviewPage(payload);
    if (!parsed) throw new Error("Material price review returned an invalid response.");
    return parsed;
  // The serialized key prevents unrelated worksheet edits from restarting an
  // identical Material review request while the panel remains open.
  }, [activeSheetId, isDirty, localBindingsKey, workbookId]);

  useEffect(() => {
    if (mode !== "library" || !workbookId) return;
    const controller = new AbortController();
    void requestReview({ page: 1, pageSize: 1, sheetId: null, signal: controller.signal })
      .then((next) => setReviewSummary(next.summary))
      .catch(() => undefined);
    return () => controller.abort();
    // localBindings is intentionally included so a dirty-sheet mutation refreshes the count.
  }, [mode, requestReview, reviewRefresh, workbookId]);

  useEffect(() => {
    if (mode !== "updates") return;
    const controller = new AbortController();
    setIsReviewLoading(true);
    setReviewError(null);
    void requestReview({
      page: reviewPage,
      pageSize: MATERIAL_PRICE_REVIEW_PAGE_SIZE,
      sheetId: reviewScope === "sheet" ? activeSheetId : null,
      signal: controller.signal,
    }).then((next) => {
      setReview(next);
      setReviewSummary(next.summary);
    }).catch((loadError) => {
      if (!controller.signal.aborted) setReviewError(loadError instanceof Error ? loadError.message : "Material price review unavailable.");
    }).finally(() => {
      if (!controller.signal.aborted) setIsReviewLoading(false);
    });
    return () => controller.abort();
  }, [activeSheetId, mode, requestReview, reviewPage, reviewRefresh, reviewScope]);

  const revalidateAndUpdate = async (group: MaterialPriceReviewGroup, target: MaterialPriceReviewBindingTarget) => {
    if (!workbookId || !group.currentPrice || target.sheetId !== activeSheetId || updatingBindingId) return;
    setUpdatingBindingId(target.bindingId);
    setReviewError(null);
    try {
      const response = await fetch("/api/pricing-worksheets/material-price-review", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          activeSheetId: isDirty ? activeSheetId : null,
          localBindings: isDirty ? localBindings : null,
          mode: "revalidate",
          targetBindingId: target.bindingId,
          expectedCurrentPriceId: group.currentPrice.id,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
          ? payload.error : "This price update could not be revalidated.";
        throw new Error(message);
      }
      const parsed = parseMaterialPriceReviewPage(payload);
      const freshGroup = parsed?.items[0];
      const freshTarget = freshGroup?.targets.find((candidate) => candidate.bindingId === target.bindingId);
      if (!freshGroup || !freshTarget || !["price_changed", "estimating_unit_mismatch"].includes(freshGroup.classification) || !freshGroup.currentPrice) {
        throw new Error("This price update is no longer current. Refresh updates and try again.");
      }
      if (!onUpdatePrice(freshGroup, freshTarget)) throw new Error("The worksheet cell changed before the update could be applied.");
      setReviewRefresh((value) => value + 1);
    } catch (updateError) {
      setReviewError(updateError instanceof Error ? updateError.message : "Unable to update this Material price.");
      setReviewRefresh((value) => value + 1);
    } finally {
      setUpdatingBindingId(null);
    }
  };

  const insertionIssue = useMemo(() => {
    if (!canWrite) return "This workbook is read-only.";
    return targetIssue ?? (!target ? "Select exactly one worksheet cell to choose a new insertion target." : null);
  }, [canWrite, target, targetIssue]);

  const requestInsert = (item: PricingWorksheetMaterialPickerItem) => {
    if (item.pricing?.estimatingPricing.status !== "available" || item.pricing.estimatingPricing.unitCost === null || insertionIssue) return;
    if (target?.cell && (target.cell.formula || (target.cell.value !== null && target.cell.value !== ""))) {
      setPendingItem(item);
      return;
    }
    onInsert(item);
  };

  return (
    <>
      <WorksheetSidePanel ariaLabel="Material Library" closeLabel="Close Material Library" onClose={onClose}>
        <WorksheetSidePanelHeader
          icon={<Boxes className="h-4 w-4" strokeWidth={1.75} />}
          title="Materials"
          description={mode === "library" ? "Browse supplier prices" : "Review workbook pricing"}
          closeLabel="Close Material Library"
          onClose={onClose}
        />

        <MaterialsPanelTabs
          mode={mode}
          updateCount={reviewSummary.priceUpdates}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            if (nextMode === "updates") setReviewPage(1);
          }}
        />

        <SharedSupplierPricingBrowser
          loadPage={loadLibraryPage}
          onSelectPrice={requestInsert}
          selectionIssue={insertionIssue}
          context={<SelectedCellContext target={target} />}
          active={mode === "library"}
          scopeKey={workbookId ?? "unsaved-workbook"}
        />

        {mode === "updates" ? (
          <div className="shrink-0 space-y-2 border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[13px] font-semibold text-[var(--text-primary)]">{reviewSummary.priceUpdates} price update{reviewSummary.priceUpdates === 1 ? "" : "s"}</p><p className="text-[11px] text-[var(--text-secondary)]">{reviewSummary.needsReview} need manual review</p></div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setReviewRefresh((value) => value + 1)} disabled={isReviewLoading} aria-label="Refresh Material price updates"><RefreshCw className={`h-4 w-4 ${isReviewLoading ? "animate-spin" : ""}`} /></Button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Button type="button" size="sm" variant={reviewScope === "workbook" ? "secondary" : "ghost"} onClick={() => { setReviewScope("workbook"); setReviewPage(1); }}>All pages</Button>
              <Button type="button" size="sm" variant={reviewScope === "sheet" ? "secondary" : "ghost"} onClick={() => { setReviewScope("sheet"); setReviewPage(1); }} disabled={!activeSheetId}>Current page</Button>
            </div>
          </div>
        ) : null}

        {mode === "updates" ? <div className="flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]">
          {reviewError ? <OperationalAlert variant="warning">{reviewError}</OperationalAlert> : null}
          {isReviewLoading ? <div aria-live="polite" aria-busy="true" className="flex items-center justify-center gap-2 py-10 text-[13px] text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" />Reviewing Material prices…</div> : null}
          {!isReviewLoading && !reviewError && (review?.items.length ?? 0) === 0 ? <div aria-live="polite" className="px-4 py-8 text-center"><div className="mx-auto flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-subtle)] text-[var(--text-muted)]"><Boxes className="h-5 w-5" /></div><p className="mt-2.5 text-[13px] font-medium text-[var(--text-primary)]">Material pricing is current</p><p className="mx-auto mt-1 max-w-[300px] text-xs leading-5 text-[var(--text-secondary)]">No price changes or source issues were found.</p></div> : null}
          {!isReviewLoading && !reviewError ? <div className="space-y-2.5">{review?.items.map((group) => {
            const priceChanged = group.classification === "price_changed" && group.currentPrice;
            const correctionAvailable = group.classification === "estimating_unit_mismatch" && group.currentPrice && group.currentPricing?.estimatingPricing.status === "available";
            const increase = (group.absoluteDifference ?? 0) > 0;
            return <section key={group.groupKey} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
              <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2">
                <h3 className="break-words text-sm font-semibold text-[var(--text-primary)]">{group.materialName}</h3>
                <p className="mt-0.5 break-words text-xs text-[var(--text-secondary)]">{group.supplierName}{group.supplierProductDescription ? ` · ${group.supplierProductDescription}` : ""}</p>
                {group.supplierSku ? <p className="break-all text-[11px] text-[var(--text-muted)]">SKU: {group.supplierSku}</p> : null}
              </div>
              <div className="space-y-2.5 p-3">
                {priceChanged ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-[var(--text-muted)]">Used</p>
                        <p className="mt-0.5 break-words text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatReviewPrice(group.historicalPrice)} <span className="text-xs font-normal text-[var(--text-secondary)]">/ {group.historicalPrice.unit}</span></p>
                        {group.historicalPricing ? <p className="mt-0.5 break-words text-[11px] text-[var(--text-secondary)]">Estimating {group.historicalPricing.estimatingPricing.unitCost?.toFixed(2)} / {group.historicalPricing.estimatingPricing.unit}</p> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[var(--text-muted)]">Current</p>
                        <p className="mt-0.5 break-words text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatReviewPrice(group.currentPrice!)} <span className="text-xs font-normal text-[var(--text-secondary)]">/ {group.currentPrice!.unit}</span></p>
                        {group.currentPricing ? <p className="mt-0.5 break-words text-[11px] text-[var(--text-secondary)]">Estimating {group.currentPricing.estimatingPricing.unitCost?.toFixed(2)} / {group.currentPricing.estimatingPricing.unit}</p> : null}
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-semibold ${increase ? "text-[var(--warning)]" : "text-[var(--info)]"}`}>
                      {increase ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {formatSignedMoney(group.absoluteDifference!, group.currentPrice!.currency)}
                      {group.percentageDifference === null ? "" : ` · ${group.percentageDifference > 0 ? "+" : ""}${group.percentageDifference.toFixed(2)}%`}
                    </div>
                  </>
                ) : (
                  <>
                    <OperationalAlert variant="warning" className="px-3 py-2 text-xs">{reviewIssueLabel(group)}</OperationalAlert>
                    {["conversion_changed", "price_and_conversion_changed", "conversion_unavailable"].includes(group.classification) ? (
                      <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)] border-y border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[11px]">
                        <div className="min-w-0 p-2.5">
                          <p className="font-semibold text-[var(--text-primary)]">Used</p>
                          <p className="mt-1 break-words text-[var(--text-secondary)]">{conversionLabel(group.historicalPricing)}</p>
                          <p className="mt-1 break-words tabular-nums">Estimating {group.historicalPricing?.estimatingPricing.unitCost?.toFixed(2)} / {group.historicalPricing?.estimatingPricing.unit}</p>
                        </div>
                        <div className="min-w-0 p-2.5">
                          <p className="font-semibold text-[var(--text-primary)]">Current</p>
                          <p className="mt-1 break-words text-[var(--text-secondary)]">{conversionLabel(group.currentPricing)}</p>
                          <p className="mt-1 break-words tabular-nums">Estimating {group.currentPricing?.estimatingPricing.unitCost?.toFixed(2) ?? "unavailable"}{group.currentPricing?.estimatingPricing.unit ? ` / ${group.currentPricing.estimatingPricing.unit}` : ""}</p>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Used in {group.targets.length} cell{group.targets.length === 1 ? "" : "s"}</p>
                  <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                    {group.targets.map((targetItem) => {
                      const currentSheet = targetItem.sheetId === activeSheetId;
                      return <div key={targetItem.bindingId} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
                        <button type="button" onClick={() => currentSheet && onGoToCell(targetItem.cellAddress)} disabled={!currentSheet} className={`min-w-0 flex-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] ${currentSheet ? "text-[var(--brand-blue)] hover:underline" : "text-[var(--text-secondary)]"}`}>
                          <span className="block truncate">{targetItem.sheetName} · {targetItem.cellAddress}</span>
                          {!currentSheet ? <span className="text-[10px] text-[var(--text-muted)]">Open this page to update</span> : null}
                        </button>
                        {(priceChanged || correctionAvailable) && currentSheet ? (
                          <Button type="button" size="sm" disabled={!canWrite || Boolean(updatingBindingId)} onClick={() => void revalidateAndUpdate(group, targetItem)} className="shrink-0">
                            {updatingBindingId === targetItem.bindingId ? <Loader2 className="h-4 w-4 animate-spin" /> : correctionAvailable ? `Use ${group.currentPricing!.estimatingPricing.unitCost!.toFixed(2)}` : `Update to ${group.currentPricing?.estimatingPricing.unitCost?.toFixed(2) ?? formatReviewPrice(group.currentPrice!)}`}
                          </Button>
                        ) : null}
                      </div>;
                    })}
                  </div>
                </div>
              </div>
            </section>;
          })}</div> : null}
        </div> : null}

        {mode === "updates" && review && review.total > review.pageSize ? <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]"><span>{review.total} review groups</span><div className="flex gap-1"><Button variant="secondary" size="icon" aria-label="Previous price updates page" disabled={reviewPage <= 1 || isReviewLoading} onClick={() => setReviewPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="secondary" size="icon" aria-label="Next price updates page" disabled={!review.hasMore || isReviewLoading} onClick={() => setReviewPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div> : null}
      </WorksheetSidePanel>

      <Dialog open={Boolean(pendingItem)} onOpenChange={(open) => !open && setPendingItem(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="pr-8"><DialogTitle>{target?.cell?.formula ? "Replace formula?" : "Replace cell value?"}</DialogTitle><DialogDescription>{target?.cell?.formula ? <>This cell currently contains <span className="mt-2 block rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]">{target.cell.formula}</span>Using the estimating rate will replace the formula with {pendingItem ? formatSupplierPricingPrice(pendingItem) : "the selected rate"}.</> : <>Current: {currentCellLabel(target?.cell ?? null)}<br />Estimating rate: {pendingItem ? formatSupplierPricingPrice(pendingItem) : ""}</>}</DialogDescription></DialogHeader>
          <DialogFooter className="mt-5 flex flex-row justify-end gap-2 border-t border-[var(--border)] pt-4"><Button type="button" variant="secondary" onClick={() => setPendingItem(null)}>Cancel</Button><Button type="button" onClick={() => { if (pendingItem && onInsert(pendingItem)) setPendingItem(null); }}>{target?.cell?.formula ? "Replace formula" : pendingItem ? `Use ${formatSupplierPricingPrice(pendingItem)}` : "Replace"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
