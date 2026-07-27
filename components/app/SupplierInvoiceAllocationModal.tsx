"use client";

import { useState } from "react";
import {
  CommercialLineItemsCell,
  CommercialLineItemsRow,
  CommercialLineItemsTable,
  formatCommercialDocumentMoney,
  formatCommercialPriceNumber,
} from "@/components/app/CommercialLineItemsTable";
import {
  deriveSupplierInvoicePreviewThisInvoiceAmount,
  deriveSupplierInvoicePurchaseOrderLineAmounts,
} from "@/components/app/supplier-invoice-allocation-presentation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type SupplierInvoiceAllocationModalLine = {
  id: string;
  description: string;
  sourceLabel: string;
  item: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  previouslyInvoiced: number;
  persistedThisInvoice: number;
  activeSourceAllocationAmount: number;
  pendingApproval: boolean;
  unavailableReason: string | null;
};

export type SupplierInvoiceAllocationModalGroup = {
  id: string;
  number: string;
  title: string;
  projectName: string | null;
  supplierName: string | null;
  requestedDate: string | null;
  status: string;
  total: number;
  matchStatus: string;
  lines: SupplierInvoiceAllocationModalLine[];
};

type SupplierInvoiceAllocationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceLine: { id: string; description: string; amount: number } | null;
  groups: SupplierInvoiceAllocationModalGroup[];
  canAllocate: boolean;
  sourceLocked: boolean;
  saving: boolean;
  onConfirm: (purchaseOrderLineItemId: string) => Promise<boolean>;
  onUseNoPurchaseOrder: () => Promise<boolean>;
  onMatchPurchaseOrders: () => void;
};

const LINE_GRID_TEMPLATE = "minmax(320px,1.65fr) 150px 130px 90px 90px 120px 140px 110px";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function SupplierInvoiceAllocationModal({
  open,
  onOpenChange,
  invoiceLine,
  groups,
  canAllocate,
  sourceLocked,
  saving,
  onConfirm,
  onUseNoPurchaseOrder,
  onMatchPurchaseOrders,
}: SupplierInvoiceAllocationModalProps) {
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [confirmationMode, setConfirmationMode] = useState<"allocation" | "no-po" | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const selected = (() => {
    for (const group of groups) {
      const line = group.lines.find((candidate) => candidate.id === selectedLineId);
      if (line) return { group, line };
    }
    return null;
  })();

  function resetSelection() {
    setSelectedLineId(null);
    setConfirmationMode(null);
    setModalError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetSelection();
    onOpenChange(nextOpen);
  }

  async function confirmAllocation() {
    if (!selected) return;
    setModalError(null);
    const saved = await onConfirm(selected.line.id);
    if (saved) handleOpenChange(false);
    else setModalError("The allocation could not be saved. Review the page message and try again.");
  }

  async function confirmNoPurchaseOrder() {
    setModalError(null);
    const saved = await onUseNoPurchaseOrder();
    if (saved) handleOpenChange(false);
    else setModalError("The no-PO allocation could not be saved. Review the page message and try again.");
  }

  function getLineDisplay(line: SupplierInvoiceAllocationModalLine) {
    const isPreviewTarget = confirmationMode === "allocation" && selectedLineId === line.id;
    const effectiveThisInvoice = deriveSupplierInvoicePreviewThisInvoiceAmount({
      persistedThisInvoice: line.persistedThisInvoice,
      activeSourceAllocationAmount: line.activeSourceAllocationAmount,
      previewAmount: invoiceLine?.amount ?? 0,
      isPreviewActive: confirmationMode === "allocation",
      isPreviewTarget,
    });
    const amounts = deriveSupplierInvoicePurchaseOrderLineAmounts({
      poLineValue: line.total,
      authoritativePreviouslyInvoiced: line.previouslyInvoiced,
      currentInvoiceAllocationAmounts: [effectiveThisInvoice],
    });
    const isCurrentSelection = line.activeSourceAllocationAmount > 0;
    const fullyInvoiced = amounts.remaining <= 0.009 && !isCurrentSelection;
    const unavailableReason = sourceLocked
      ? "Posted actual costs lock this allocation."
      : line.unavailableReason
        ?? (fullyInvoiced ? "This Purchase Order line is fully invoiced." : null);
    return {
      amounts,
      fullyInvoiced,
      isCurrentSelection,
      isPreviewTarget,
      selectable: canAllocate && !saving && !unavailableReason,
      unavailableReason,
    };
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent fullScreenMobile className="h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden rounded-none border-0 bg-[var(--surface)] sm:h-auto sm:max-h-[92vh] sm:w-[calc(100vw-32px)] sm:max-w-[1320px] sm:rounded-[18px] sm:border">
        <div className="flex max-h-[100dvh] min-h-0 flex-col sm:max-h-[92vh]">
          <DialogHeader className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-5 pr-14 sm:px-7">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[27px]">
              Allocate Supplier Invoice Line
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            {sourceLocked ? (
              <div role="alert" className="rounded-[12px] border border-[var(--warning)]/30 bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--text-primary)]">
                Posted actual costs lock this allocation. Reverse or correct the posting through the existing Actual Costs workflow before changing it.
              </div>
            ) : null}

            {groups.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">No Purchase Order matched</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
                  Match this invoice to a Purchase Order, or continue through the existing no-PO workflow.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="secondary" disabled={!canAllocate || saving} onClick={onMatchPurchaseOrders}>
                    Match to Purchase Orders
                  </Button>
                  <Button type="button" variant="secondary" disabled={!canAllocate || saving} onClick={() => setConfirmationMode("no-po")}>
                    Use no-PO workflow
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-7">
                {groups.map((group) => (
                  <section key={group.id}>
                    <header className="mb-5 px-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{group.number}</h3>
                            <span className="text-[11px] font-semibold capitalize text-[var(--success)]">
                              {group.matchStatus}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {[group.title, group.projectName, group.supplierName].filter(Boolean).join(" · ")}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {formatDate(group.requestedDate)} · {group.status}
                          </p>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">PO Total Excl. GST</div>
                          <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{formatCommercialDocumentMoney(group.total)}</div>
                        </div>
                      </div>
                    </header>

                    <div className="divide-y divide-[var(--border)] rounded-[18px] border border-[var(--border)] sm:hidden">
                      {group.lines.map((line) => {
                        const display = getLineDisplay(line);
                        return (
                          <article key={line.id} className={cn("p-4", (display.isCurrentSelection || selectedLineId === line.id) && "border-l-2 border-l-[var(--brand-blue)]")}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="font-semibold text-[var(--text-primary)]">{line.description}</h4>
                                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                  {formatCommercialPriceNumber(line.quantity)} {line.unit || "units"} · {formatCommercialDocumentMoney(line.rate)} each
                                </p>
                                <p className="mt-1 text-xs text-[var(--text-secondary)]">{line.sourceLabel} · {line.item}</p>
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={!display.selectable}
                                title={display.unavailableReason ?? undefined}
                                onClick={() => {
                                  setSelectedLineId(line.id);
                                  setConfirmationMode("allocation");
                                  setModalError(null);
                                }}
                              >
                                {display.isPreviewTarget || display.isCurrentSelection ? "Selected" : display.fullyInvoiced ? "Fully Invoiced" : display.selectable ? "Select" : "Unavailable"}
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <CommercialLineItemsTable
                      className="hidden rounded-none border-0 sm:block"
                      columns={[
                        { key: "description", label: "Description" },
                        { key: "source", label: "Source" },
                        { key: "item", label: "Item" },
                        { key: "qty", label: "Qty." },
                        { key: "unit", label: "Unit" },
                        { key: "price", label: "Price" },
                        { key: "amount", label: "Amount", align: "right" },
                        { key: "action", label: "Action", align: "center" },
                      ]}
                      gridTemplateColumns={LINE_GRID_TEMPLATE}
                      minWidthClassName="min-w-[1130px]"
                      emptyState={<div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">No Purchase Order lines.</div>}
                    >
                      {group.lines.map((line) => {
                        const display = getLineDisplay(line);

                        return (
                          <CommercialLineItemsRow
                              key={line.id}
                              gridTemplateColumns={LINE_GRID_TEMPLATE}
                              className={cn(
                                (display.isCurrentSelection || selectedLineId === line.id) && "border-l-2 border-l-[var(--brand-blue)]"
                              )}
                            >
                            <CommercialLineItemsCell><span className="text-sm font-medium text-[var(--text-primary)]">{line.description}</span></CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder><span className="text-sm text-[var(--text-secondary)]">{line.sourceLabel}</span></CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder><span className="text-sm text-[var(--text-primary)]">{line.item}</span></CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder>{formatCommercialPriceNumber(line.quantity)}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder>{line.unit || "—"}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder>{formatCommercialDocumentMoney(line.rate)}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder className="justify-end font-medium">{formatCommercialDocumentMoney(display.amounts.poLineValue)}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder className="justify-center">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={!display.selectable}
                                title={display.unavailableReason ?? undefined}
                                onClick={() => {
                                  setSelectedLineId(line.id);
                                  setConfirmationMode("allocation");
                                  setModalError(null);
                                }}
                              >
                                {display.isPreviewTarget || display.isCurrentSelection ? "Selected" : display.fullyInvoiced ? "Fully Invoiced" : display.selectable ? "Select" : "Unavailable"}
                              </Button>
                            </CommercialLineItemsCell>
                          </CommercialLineItemsRow>
                        );
                      })}
                    </CommercialLineItemsTable>
                  </section>
                ))}
              </div>
            )}

            {confirmationMode === "allocation" && selected && invoiceLine ? (
              <section className="mt-6 border-t border-[var(--border)] pt-5">
                <div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Purchase Order line</div>
                    <div className="mt-1 font-semibold text-[var(--text-primary)]">{selected.group.number}</div>
                    <div className="mt-1 text-sm text-[var(--text-primary)]">{selected.line.description}</div>
                    <dl className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                      <div className="flex justify-between gap-3"><dt>PO line value</dt><dd>{formatCommercialDocumentMoney(selected.line.total)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Previously invoiced</dt><dd>{formatCommercialDocumentMoney(selected.line.previouslyInvoiced)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Remaining before this invoice</dt><dd>{formatCommercialDocumentMoney(selected.line.total - selected.line.previouslyInvoiced)}</dd></div>
                      <div className="flex justify-between gap-3 font-semibold text-[var(--text-primary)]"><dt>This Invoice</dt><dd>{formatCommercialDocumentMoney(invoiceLine.amount)}</dd></div>
                    </dl>
                  </div>
                </div>
              </section>
            ) : null}

            {confirmationMode === "no-po" ? (
              <section className="mt-6 border-t border-[var(--border)] pt-5">
                <h3 className="font-semibold text-[var(--text-primary)]">Use no-PO workflow?</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  This replaces the current line allocation with the existing unmatched allocation path. Commercial justification and coding remain required.
                </p>
              </section>
            ) : null}

            {modalError ? <p role="alert" className="mt-4 text-sm font-medium text-[var(--error)]">{modalError}</p> : null}
          </div>

          <DialogFooter className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-4 sm:px-7">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => confirmationMode ? resetSelection() : handleOpenChange(false)}>
              {confirmationMode ? "Cancel" : "Close"}
            </Button>
            {confirmationMode === "allocation" ? (
              <Button type="button" disabled={!selected || saving || sourceLocked} onClick={() => void confirmAllocation()}>
                {saving ? "Saving..." : "Confirm Allocation"}
              </Button>
            ) : confirmationMode === "no-po" ? (
              <Button type="button" disabled={saving || !canAllocate} onClick={() => void confirmNoPurchaseOrder()}>
                {saving ? "Saving..." : "Confirm no-PO workflow"}
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
