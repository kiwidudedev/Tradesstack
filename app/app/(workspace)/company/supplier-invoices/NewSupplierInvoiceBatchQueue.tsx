"use client";

import { AlertTriangle, CheckCircle2, Circle, FileWarning, Loader2 } from "lucide-react";
import type { SupplierInvoiceBatchItem } from "./new-supplier-invoice-batch";

type NewSupplierInvoiceBatchQueueProps = {
  items: SupplierInvoiceBatchItem[];
  selectedItemId: string | null;
  approvedCount: number;
  onSelectItem: (itemId: string) => void;
};

function queueRowLabel(item: SupplierInvoiceBatchItem) {
  return item.formState.invoiceNumber.trim() || item.file?.name || "Manual invoice";
}

function queueRowSubLabel(item: SupplierInvoiceBatchItem) {
  if (item.extractionStatus === "failed" && item.error) {
    return item.error;
  }

  return item.extraction?.supplierMatch.label
    || item.formState.supplierId
    || item.file?.name
    || "Manual entry";
}

function QueueStatusIcon({ item }: { item: SupplierInvoiceBatchItem }) {
  if (item.createStatus === "creating" || item.extractionStatus === "extracting") {
    return <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-blue)]" aria-hidden="true" />;
  }
  if (item.createStatus === "created" || item.reviewStatus === "approved") {
    return <CheckCircle2 className="h-4 w-4 text-[#20633a]" aria-hidden="true" />;
  }
  if (item.createStatus === "failed" || item.extractionStatus === "failed") {
    return <FileWarning className="h-4 w-4 text-[#b42318]" aria-hidden="true" />;
  }
  if (item.reviewStatus === "needs_attention" || item.warnings.length > 0) {
    return <AlertTriangle className="h-4 w-4 text-[#c98200]" aria-hidden="true" />;
  }
  return <Circle className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />;
}

export function NewSupplierInvoiceBatchQueue({
  items,
  selectedItemId,
  approvedCount,
  onSelectItem,
}: NewSupplierInvoiceBatchQueueProps) {
  const totalCount = items.length;

  return (
    <aside className="flex min-h-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Invoice queue</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {approvedCount} of {totalCount} approved
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y divide-[var(--border-subtle)]">
          {items.map((item, index) => {
            const isSelected = item.id === selectedItemId;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item.id)}
                className={[
                  "w-full px-4 py-3 text-left transition",
                  isSelected ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]",
                ].join(" ")}
                aria-current={isSelected ? "true" : undefined}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">
                    <QueueStatusIcon item={item} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {queueRowLabel(item)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {queueRowSubLabel(item)}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Invoice {index + 1} of {totalCount}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
