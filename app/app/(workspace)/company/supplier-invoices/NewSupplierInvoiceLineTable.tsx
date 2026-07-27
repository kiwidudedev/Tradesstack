"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NewSupplierInvoiceLineDraft } from "./new-supplier-invoice-line-drafts";

type NewSupplierInvoiceLineTableProps = {
  lines: NewSupplierInvoiceLineDraft[];
  onChangeLine: (lineId: string, updates: Partial<NewSupplierInvoiceLineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
};

const COLUMN_TEMPLATE = "minmax(340px,2.2fr) 78px 96px 116px 116px 56px";

export function NewSupplierInvoiceLineTable({
  lines,
  onChangeLine,
  onAddLine,
  onRemoveLine,
}: NewSupplierInvoiceLineTableProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Invoice lines</h3>
      </div>

      <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <div className="min-w-[1004px]">
            <div
              className="grid border-b border-[var(--border)] bg-[var(--surface-muted)] text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--text-secondary)]"
              style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
            >
              <span className="px-3 py-2.5">Description</span>
              <span className="border-l border-[var(--border)] px-3 py-2.5">Qty</span>
              <span className="border-l border-[var(--border)] px-3 py-2.5">Unit</span>
              <span className="border-l border-[var(--border)] px-3 py-2.5">Unit Price</span>
              <span className="border-l border-[var(--border)] px-3 py-2.5 text-right">Amount</span>
              <span className="border-l border-[var(--border)] px-3 py-2.5" />
            </div>

            {lines.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">
                No invoice lines yet. Add a row manually or upload a PDF with readable line items.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {lines.map((line, index) => (
                  <div
                    key={line.id}
                    className="group grid items-stretch bg-[var(--surface)]"
                    style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
                  >
                    <div className="px-3 py-1.5">
                      <Input
                        aria-label={`Line ${index + 1} description`}
                        value={line.description}
                        onChange={(event) => onChangeLine(line.id, { description: event.target.value })}
                        placeholder="Describe this invoice line"
                        className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                      />
                      <Input
                        aria-label={`Line ${index + 1} supplier item code`}
                        value={line.supplierItemCode}
                        onChange={(event) => onChangeLine(line.id, { supplierItemCode: event.target.value })}
                        placeholder="Supplier item code"
                        className="mt-0.5 h-7 border-0 bg-transparent px-0 text-xs text-[var(--text-secondary)] shadow-none focus-visible:ring-0"
                      />
                    </div>

                    <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                      <Input
                        aria-label={`Line ${index + 1} quantity`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(event) => onChangeLine(line.id, { quantity: event.target.value })}
                        placeholder="0"
                        className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>

                    <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                      <Input
                        aria-label={`Line ${index + 1} unit`}
                        value={line.unit}
                        onChange={(event) => onChangeLine(line.id, { unit: event.target.value })}
                        placeholder="ea"
                        className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>

                    <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                      <Input
                        aria-label={`Line ${index + 1} unit price`}
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(event) => onChangeLine(line.id, { unitPrice: event.target.value })}
                        placeholder="0.00"
                        className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>

                    <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                      <Input
                        aria-label={`Line ${index + 1} amount`}
                        inputMode="decimal"
                        value={line.lineTotal}
                        onChange={(event) => onChangeLine(line.id, { lineTotal: event.target.value })}
                        placeholder="0.00"
                        className="h-9 border-0 bg-transparent px-0 text-right text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>

                    <div className="flex items-center justify-center border-l border-[var(--border-subtle)] px-0 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[var(--text-muted)]/80 opacity-0 shadow-none hover:bg-transparent hover:text-[var(--error)] group-hover:opacity-100 focus-visible:ring-0"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => onRemoveLine(line.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-end pr-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onAddLine}
          className="h-8 rounded-none border-0 bg-transparent px-0 text-[var(--text-secondary)] shadow-none hover:bg-transparent hover:text-[var(--text-primary)] focus-visible:ring-0"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Item
        </Button>
      </div>
    </section>
  );
}
