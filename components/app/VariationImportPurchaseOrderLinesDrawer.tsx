"use client";

import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WorksheetSidePanel,
  WorksheetSidePanelBody,
  WorksheetSidePanelFooter,
  WorksheetSidePanelHeader,
} from "@/components/app/WorksheetSidePanel";
import { interMedium } from "@/lib/fonts";

export type VariationPurchaseOrderOption = {
  id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  status: string;
};

export type VariationPurchaseOrderLineOption = {
  id: string;
  purchase_order_id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
};

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function VariationImportPurchaseOrderLinesDrawer({
  purchaseOrders,
  selectedPurchaseOrderId,
  purchaseOrderLines,
  selectedLineIds,
  alreadyImportedLineIds,
  onPurchaseOrderChange,
  onToggleLine,
  onImportSelected,
  onClose,
}: {
  purchaseOrders: VariationPurchaseOrderOption[];
  selectedPurchaseOrderId: string;
  purchaseOrderLines: VariationPurchaseOrderLineOption[];
  selectedLineIds: ReadonlySet<string>;
  alreadyImportedLineIds: ReadonlySet<string>;
  onPurchaseOrderChange: (purchaseOrderId: string) => void;
  onToggleLine: (lineId: string) => void;
  onImportSelected: () => void;
  onClose: () => void;
}) {
  const selectedPurchaseOrder = purchaseOrders.find((purchaseOrder) => purchaseOrder.id === selectedPurchaseOrderId) ?? null;

  return (
    <WorksheetSidePanel
      ariaLabel="Import purchase order items"
      closeLabel="Close Import PO Items"
      onClose={onClose}
      variant="overlay"
      className="w-[min(100vw,700px)] md:w-[700px]"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <WorksheetSidePanelHeader
        icon={<ListPlus className="h-4 w-4" strokeWidth={1.75} />}
        title="Import From Purchase Order"
        description="Select purchase order lines to add into this variation."
        closeLabel="Close Import PO Items"
        onClose={onClose}
      />
      <WorksheetSidePanelBody>
        <div className="space-y-4">
          <select
            autoFocus
            value={selectedPurchaseOrderId}
            onChange={(event) => onPurchaseOrderChange(event.target.value)}
            className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]`}
          >
            <option value="">Select purchase order</option>
            {purchaseOrders.map((purchaseOrder) => (
              <option key={purchaseOrder.id} value={purchaseOrder.id}>
                {purchaseOrder.purchase_order_number} - {purchaseOrder.purchase_order_title || "Untitled purchase order"}
              </option>
            ))}
          </select>

          {selectedPurchaseOrder ? (
            <div className="overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
              <table className="min-w-[660px] border-collapse">
                <thead>
                  <tr className={`${interMedium.className} border-b border-[var(--border)] bg-[var(--surface-muted)] text-[13px] font-semibold text-[var(--text-secondary)]`}>
                    <th className="w-[44px] px-3 py-2.5 text-left" />
                    <th className="px-3 py-2.5 text-left">Description</th>
                    <th className="w-[140px] px-3 py-2.5 text-left">Item</th>
                    <th className="w-[90px] px-3 py-2.5 text-left">Qty.</th>
                    <th className="w-[110px] px-3 py-2.5 text-left">Price</th>
                    <th className="w-[120px] px-3 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface)]">
                  {purchaseOrderLines.length > 0 ? (
                    purchaseOrderLines.map((line) => {
                      const alreadyImported = alreadyImportedLineIds.has(line.id);
                      return (
                        <tr key={line.id} className="transition-colors">
                          <td className="px-3 py-3 align-middle">
                            <label className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={selectedLineIds.has(line.id)}
                                onChange={() => onToggleLine(line.id)}
                                disabled={alreadyImported}
                                className="h-4 w-4 rounded border-[var(--border)]"
                              />
                            </label>
                          </td>
                          <td className="min-w-0 px-3 py-3 align-middle">
                            <span className={`${interMedium.className} block truncate text-sm font-medium text-[var(--text-primary)]`}>
                              {line.description || "Untitled line item"}
                            </span>
                            {alreadyImported ? (
                              <span className={`${interMedium.className} mt-0.5 block text-[11px] text-[var(--text-secondary)]`}>
                                Already imported into this variation
                              </span>
                            ) : null}
                          </td>
                          <td className={`${interMedium.className} px-3 py-3 text-sm text-[var(--text-secondary)] align-middle`}>{line.section}</td>
                          <td className={`${interMedium.className} px-3 py-3 text-sm text-[var(--text-secondary)] align-middle`}>{line.quantity}</td>
                          <td className={`${interMedium.className} px-3 py-3 text-sm text-[var(--text-secondary)] align-middle`}>{toMoney(line.rate)}</td>
                          <td className={`${interMedium.className} px-3 py-3 text-right text-sm font-semibold text-[var(--text-primary)] align-middle`}>
                            {toMoney(Number((line.quantity * line.rate).toFixed(2)))}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className={`${interMedium.className} px-3 py-6 text-center text-sm text-[var(--text-secondary)]`}>
                        No purchase order line items available to import.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter>
        <Button
          type="button"
          data-testid="variation-import-po-confirm"
          variant="outline"
          onClick={onImportSelected}
          disabled={selectedLineIds.size === 0}
          className="h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4 disabled:opacity-50"
        >
          Import Selected PO Lines
        </Button>
      </WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}
