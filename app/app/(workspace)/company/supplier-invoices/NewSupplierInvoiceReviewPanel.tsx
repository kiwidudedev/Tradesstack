"use client";

import type { RefObject } from "react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NewSupplierInvoiceDraftValues } from "@/lib/new-supplier-invoice-draft";
import { toMoney } from "@/lib/supplier-invoices";
import type { SupplierInvoiceDraftExtraction } from "@/lib/supplier-invoice-document-extraction";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import { NewSupplierInvoiceLineTable } from "./NewSupplierInvoiceLineTable";
import {
  calculateLineDraftReconciliation,
  formatInvoiceSummaryGstPercent,
  type NewSupplierInvoiceLineDraft,
} from "./new-supplier-invoice-line-drafts";

type NewSupplierInvoiceReviewPanelProps = {
  manualEntryId: string;
  isManualEntryOpen: boolean;
  title?: string;
  titleAction?: React.ReactNode;
  footer?: React.ReactNode | null;
  formState: NewSupplierInvoiceDraftValues;
  lineDrafts: NewSupplierInvoiceLineDraft[];
  suppliers: OrganizationSupplierRow[];
  documentExtraction: SupplierInvoiceDraftExtraction | null;
  pendingExtraction: SupplierInvoiceDraftExtraction | null;
  error: string | null;
  supplierFieldRef: RefObject<HTMLSelectElement | null>;
  onKeepCurrentEntries: () => void;
  onApplyPendingExtraction: () => void;
  onUpdateFormState: (updates: Partial<NewSupplierInvoiceDraftValues>) => void;
  onUpdateLine: (lineId: string, updates: Partial<NewSupplierInvoiceLineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
  onCreateInvoice: () => void;
  onCancel: () => void;
  canWrite: boolean;
  isSaving: boolean;
  isBusy: boolean;
};

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
      {children}
    </label>
  );
}

const FIELD_SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD_TEXTAREA_CLASS =
  "flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const MONEY_TOLERANCE = 0.01;

function parseMoney(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function invoiceSummaryWarning(params: {
  lineSubtotal: number;
  calculatedTax: number;
  lineTotal: number;
  documentSubtotal: number;
  documentTax: number;
  documentTotal: number;
}) {
  const subtotalDifference = Number((params.lineSubtotal - params.documentSubtotal).toFixed(2));
  if (Math.abs(subtotalDifference) > MONEY_TOLERANCE) {
    return {
      title: "Invoice subtotal does not match line items",
      rows: [
        { label: "Line items total", value: toMoney(params.lineSubtotal) },
        { label: "Invoice subtotal", value: toMoney(params.documentSubtotal) },
        { label: "Difference", value: toMoney(subtotalDifference) },
      ],
    };
  }

  const taxDifference = Number((params.calculatedTax - params.documentTax).toFixed(2));
  if (Math.abs(taxDifference) > MONEY_TOLERANCE) {
    return {
      title: "Invoice GST does not match subtotal",
      rows: [
        { label: "Calculated GST", value: toMoney(params.calculatedTax) },
        { label: "Invoice GST", value: toMoney(params.documentTax) },
        { label: "Difference", value: toMoney(taxDifference) },
      ],
    };
  }

  const totalDifference = Number((params.lineTotal - params.documentTotal).toFixed(2));
  if (Math.abs(totalDifference) > MONEY_TOLERANCE) {
    return {
      title: "Invoice total does not equal subtotal + GST",
      rows: [
        { label: "Calculated total", value: toMoney(params.lineTotal) },
        { label: "Invoice total", value: toMoney(params.documentTotal) },
        { label: "Difference", value: toMoney(totalDifference) },
      ],
    };
  }

  return null;
}

export function NewSupplierInvoiceReviewPanel({
  manualEntryId,
  isManualEntryOpen,
  title,
  titleAction,
  footer,
  formState,
  lineDrafts,
  suppliers,
  documentExtraction,
  pendingExtraction,
  error,
  supplierFieldRef,
  onKeepCurrentEntries,
  onApplyPendingExtraction,
  onUpdateFormState,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  onCreateInvoice,
  onCancel,
  canWrite,
  isSaving,
  isBusy,
}: NewSupplierInvoiceReviewPanelProps) {
  const hasReviewHeader = Boolean(title || titleAction);
  const documentSubtotal = parseMoney(formState.subtotal);
  const documentTax = parseMoney(formState.taxTotal);
  const documentTotal = parseMoney(formState.total);
  const summary = calculateLineDraftReconciliation(lineDrafts, formState.subtotal, formState.taxTotal);
  const gstPercentLabel = formatInvoiceSummaryGstPercent(summary.gstRate);
  const summaryWarning = invoiceSummaryWarning({
    lineSubtotal: summary.lineSubtotal,
    calculatedTax: summary.calculatedTax,
    lineTotal: summary.lineTotal,
    documentSubtotal,
    documentTax,
    documentTotal,
  });

  return (
    <section className="flex min-h-0 flex-col">
      {hasReviewHeader ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          {title ? <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3> : <div />}
          {titleAction ? <div className="shrink-0">{titleAction}</div> : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="space-y-5">
          {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}

          {pendingExtraction ? (
            <div className="rounded-[var(--radius-lg)] border border-[#f6d39e] bg-[#fff8eb] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Use extracted details?</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                You already entered invoice values or line items. Choose whether to keep your current review or replace it with the new extraction.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={onKeepCurrentEntries}>
                  Keep my current review
                </Button>
                <Button type="button" size="sm" onClick={onApplyPendingExtraction}>
                  Replace with extracted values
                </Button>
              </div>
            </div>
          ) : null}

          {!isManualEntryOpen ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-5 py-6">
              <p className="text-sm font-medium text-[var(--text-primary)]">Manual entry is ready when you need it.</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Upload a supplier invoice PDF to populate the review automatically, or use the document panel to enter the invoice manually.
              </p>
            </div>
          ) : (
            <div id={manualEntryId} className="space-y-5">
              <section className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    Supplier and reference
                  </h4>
                </div>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <FieldLabel htmlFor="supplier-id">Supplier</FieldLabel>
                    <select
                      id="supplier-id"
                      ref={supplierFieldRef}
                      value={formState.supplierId}
                      onChange={(event) => onUpdateFormState({ supplierId: event.target.value })}
                      className={FIELD_SELECT_CLASS}
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.company_name?.trim() || supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="invoice-number">Invoice Number</FieldLabel>
                    <Input
                      id="invoice-number"
                      value={formState.invoiceNumber}
                      onChange={(event) => onUpdateFormState({ invoiceNumber: event.target.value })}
                      placeholder="INV-1042"
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="supplier-po-reference">Purchase Order</FieldLabel>
                    <Input
                      id="supplier-po-reference"
                      value={formState.supplierPoReference}
                      onChange={(event) => onUpdateFormState({ supplierPoReference: event.target.value })}
                      placeholder="TS-000148"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">Dates</h4>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="invoice-date">Invoice Date</FieldLabel>
                    <Input
                      id="invoice-date"
                      type="date"
                      value={formState.invoiceDate}
                      onChange={(event) => onUpdateFormState({ invoiceDate: event.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="due-date">Due Date</FieldLabel>
                    <Input
                      id="due-date"
                      type="date"
                      value={formState.dueDate}
                      onChange={(event) => onUpdateFormState({ dueDate: event.target.value })}
                    />
                    {documentExtraction?.header.dueDate.state === "inferred" ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Inferred from the invoice payment terms.</p>
                    ) : null}
                  </div>
                </div>
              </section>

              <NewSupplierInvoiceLineTable
                lines={lineDrafts}
                onChangeLine={onUpdateLine}
                onAddLine={onAddLine}
                onRemoveLine={onRemoveLine}
              />

              <div className="pt-2 pb-2">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
                  <section className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">Notes</h4>
                  </div>
                  <div>
                    <textarea
                      id="invoice-notes"
                      rows={4}
                      value={formState.notes}
                      onChange={(event) => onUpdateFormState({ notes: event.target.value })}
                      placeholder="Any notes for review"
                      className="block min-h-[140px] w-full max-w-[600px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand-blue)] focus:outline-none"
                    />
                  </div>
                  </section>

                  <section className="space-y-3">
                    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                      <h4 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Invoice Summary</h4>
                    <div className="space-y-2.5 text-[13px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--text-secondary)]">Subtotal</span>
                        <Input
                          id="invoice-subtotal"
                          inputMode="decimal"
                          value={formState.subtotal}
                          onChange={(event) => onUpdateFormState({ subtotal: event.target.value })}
                          aria-label="Invoice subtotal"
                          className="h-9 w-32 text-right"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--text-secondary)]">GST ({gstPercentLabel}%)</span>
                        <Input
                          id="invoice-tax-total"
                          inputMode="decimal"
                          value={formState.taxTotal}
                          onChange={(event) => onUpdateFormState({ taxTotal: event.target.value })}
                          aria-label="Invoice GST"
                          className="h-9 w-32 text-right"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="h-px bg-[var(--border)]" />
                      <div className="flex items-center justify-between gap-3 pt-0.5">
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">Total</span>
                        <Input
                          id="invoice-total"
                          inputMode="decimal"
                          value={formState.total}
                          onChange={(event) => onUpdateFormState({ total: event.target.value })}
                          aria-label="Invoice total"
                          className="h-9 w-32 text-right font-semibold"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    </div>

                    {summaryWarning ? (
                      <div className="rounded-[14px] border border-[#f6d39e] bg-[#fff8eb] px-4 py-4">
                        <p className="text-sm font-semibold text-[#8a5b00]">{summaryWarning.title}</p>
                        <div className="mt-3 space-y-1.5 text-sm text-[var(--text-primary)]">
                          {summaryWarning.rows.map((row) => (
                            <div key={row.label} className="flex items-start justify-between gap-3">
                              <span className="text-[var(--text-secondary)]">{row.label}</span>
                              <span className="text-right font-medium">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {footer === null ? null : footer ?? (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onCreateInvoice}
              disabled={!canWrite || isSaving || isBusy}
            >
              {isSaving ? "Creating..." : "Create Supplier Invoice"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
