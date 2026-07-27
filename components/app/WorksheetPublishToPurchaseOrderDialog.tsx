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
import type { PurchaseOrderPublishOption } from "@/lib/commercial-items/purchase-order-destination-adapter";
import type { PurchaseOrderCostSection } from "@/lib/purchase-orders/types";

type ProcurementSection = Exclude<PurchaseOrderCostSection, "Margin">;

export interface WorksheetPublishSupplierOption {
  id: string;
  label: string;
}

export interface WorksheetPublishConfirmationLineDraft {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  total: string;
  purchaseOrderSection: ProcurementSection | "";
}

export function WorksheetPublishToPurchaseOrderDialog({
  open,
  suppliers,
  draftPurchaseOrders,
  lines,
  purchaseOrderTitle,
  variationCode,
  selectedSupplierId,
  selectedTargetMode,
  selectedPurchaseOrderId,
  sourceRangeLabel,
  selectedValues,
  onOpenChange,
  onSupplierChange,
  onPurchaseOrderTitleChange,
  onTargetModeChange,
  onPurchaseOrderChange,
  onLineChange,
  onAddLine,
  onRemoveLine,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  suppliers: WorksheetPublishSupplierOption[];
  draftPurchaseOrders: PurchaseOrderPublishOption[];
  lines: WorksheetPublishConfirmationLineDraft[];
  purchaseOrderTitle: string;
  variationCode?: string | null;
  selectedSupplierId: string;
  selectedTargetMode: "new" | "existing";
  selectedPurchaseOrderId: string;
  sourceRangeLabel: string;
  selectedValues: string[];
  onOpenChange: (open: boolean) => void;
  onSupplierChange: (supplierId: string) => void;
  onPurchaseOrderTitleChange: (title: string) => void;
  onTargetModeChange: (mode: "new" | "existing") => void;
  onPurchaseOrderChange: (purchaseOrderId: string) => void;
  onLineChange: (lineId: string, patch: Partial<WorksheetPublishConfirmationLineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-3xl p-6 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>Add to Purchase Order</DialogTitle>
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
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">Supplier</span>
                <select
                  value={selectedSupplierId}
                  onChange={(event) => onSupplierChange(event.target.value)}
                  className="h-10 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">Purchase Order</p>
                <label className="flex items-start gap-3 rounded-[12px] border border-[var(--border)] bg-white px-4 py-3">
                  <input
                    type="radio"
                    checked={selectedTargetMode === "new"}
                    onChange={() => onTargetModeChange("new")}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[var(--text-primary)]">Create New Draft</span>
                    <input
                      type="text"
                      value={purchaseOrderTitle}
                      onChange={(event) => onPurchaseOrderTitleChange(event.target.value)}
                      disabled={selectedTargetMode !== "new"}
                      placeholder="Purchase order title"
                      className="mt-3 h-10 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] disabled:bg-[var(--surface-muted)]"
                    />
                    {variationCode ? (
                      <span className="mt-2 block text-xs text-[var(--text-secondary)]">
                        Variation: {variationCode}
                      </span>
                    ) : null}
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-[12px] border border-[var(--border)] bg-white px-4 py-3">
                  <input
                    type="radio"
                    checked={selectedTargetMode === "existing"}
                    onChange={() => onTargetModeChange("existing")}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[var(--text-primary)]">Append Existing Draft</span>
                    <select
                      value={selectedPurchaseOrderId}
                      onChange={(event) => onPurchaseOrderChange(event.target.value)}
                      disabled={selectedTargetMode !== "existing"}
                      className="mt-3 h-10 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] disabled:bg-[var(--surface-muted)]"
                    >
                      <option value="">Select draft purchase order</option>
                      {draftPurchaseOrders.map((purchaseOrder) => (
                        <option key={purchaseOrder.id} value={purchaseOrder.id}>
                          {purchaseOrder.purchaseOrderNumber} · {purchaseOrder.purchaseOrderTitle || "Untitled purchase order"}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              </div>
            </div>
          )}
          renderLineExtras={(line) => (
            <label className="mt-3 block space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                Procurement section
              </span>
              <select
                value={line.purchaseOrderSection}
                onChange={(event) =>
                  onLineChange(line.id, {
                    purchaseOrderSection: event.target.value as ProcurementSection | "",
                  })
                }
                className="h-10 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)]"
              >
                <option value="">Select procurement section</option>
                <option value="Labour">Labour</option>
                <option value="Materials">Materials</option>
                <option value="Subcontractors">Subcontractors</option>
                <option value="Plant">Plant / Equipment</option>
              </select>
            </label>
          )}
        />

        <DialogFooter className="mt-5 flex flex-row items-center justify-end gap-2 border-t border-[var(--app-border)] pt-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add to Purchase Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
