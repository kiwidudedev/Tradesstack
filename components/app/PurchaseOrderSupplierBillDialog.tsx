"use client";

import Link from "next/link";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import type { PurchaseOrderSupplierInvoiceDetail } from "@/lib/purchase-order-supplier-invoice-detail";
import { toDayMonthYearLabel, toMoney } from "@/lib/supplier-invoices";

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function statusClass(value: string) {
  if (value === "approved" || value === "paid") return "bg-[#DCFCE7] text-[#15803D]";
  if (["disputed", "voided", "deleted", "invalidated"].includes(value)) return "bg-[#FEE2E2] text-[#B91C1C]";
  if (["partially_paid", "awaiting_payment"].includes(value)) return "bg-[#DBEAFE] text-[#1D4ED8]";
  return "bg-[#FEF3C7] text-[#92400E]";
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={`${ibmPlexSans.className} text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]`}>{label}</dt>
      <dd className={`${interMedium.className} mt-1 break-words text-[13px] text-[var(--text-primary)]`}>{value}</dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <h3 className={`${interMedium.className} text-[15px] font-semibold text-[var(--text-primary)]`}>{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PurchaseOrderSupplierBillDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: PurchaseOrderSupplierInvoiceDetail | null;
  loading: boolean;
  error: string | null;
  reviewNote: string;
  onReviewNoteChange: (value: string) => void;
  onReview: (decision: "approved" | "disputed") => void;
  reviewSaving: boolean;
}) {
  const detail = props.detail;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden rounded-none border-0 bg-[var(--surface-muted)] sm:h-auto sm:max-h-[92vh] sm:w-[calc(100vw-32px)] sm:max-w-[1100px] sm:rounded-[18px] sm:border">
        <div className="flex max-h-[100dvh] min-h-0 flex-col sm:max-h-[92vh]">
          <DialogHeader className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-5 pr-14 sm:px-7">
            <DialogTitle className={`${interMedium.className} text-[22px] font-semibold tracking-[-0.02em] sm:text-[27px]`}>
              {detail ? `Supplier Invoice ${detail.invoiceNumber}` : "Supplier Invoice detail"}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {detail?.supplierName ?? "Authoritative Purchase Order allocation, approval, and payment detail."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            {props.loading ? (
              <div className="flex min-h-[320px] items-center justify-center gap-2 text-[var(--text-secondary)]">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading Supplier Invoice detail...
              </div>
            ) : props.error ? (
              <div role="alert" className="rounded-[12px] border border-[var(--error)]/20 bg-[var(--error-light)] px-4 py-4 text-[14px] text-[var(--error)]">
                {props.error}
              </div>
            ) : detail ? (
              <div className="space-y-4">
                <section className="rounded-[16px] bg-[var(--navy-primary)] px-5 py-5 text-white sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className={`${ibmPlexSans.className} text-[12px] uppercase tracking-[0.08em] text-white/65`}>Allocated to this PO</p>
                      <p className={`${interMedium.className} mt-1 text-[26px] font-semibold`}>{toMoney(detail.poAllocatedAmount)}</p>
                      <p className="mt-1 text-[12px] text-white/70">{detail.allocationTaxBasis === "tax_exclusive" ? "excl. GST" : detail.allocationTaxBasis === "tax_inclusive" ? "incl. GST" : "tax basis unavailable"}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className={`${ibmPlexSans.className} text-[12px] uppercase tracking-[0.08em] text-white/65`}>Whole invoice total</p>
                      <p className={`${interMedium.className} mt-1 text-[22px] font-semibold`}>{toMoney(detail.total)}</p>
                      <p className="mt-1 text-[12px] text-white/70">incl. GST</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${statusClass(detail.siteReview.status)}`}>Site: {statusLabel(detail.siteReview.status)}</span>
                    <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${statusClass(detail.accountsApproval.status)}`}>Accounts: {statusLabel(detail.accountsApproval.status)}</span>
                    <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${statusClass(detail.xero.status)}`}>Xero: {statusLabel(detail.xero.status)}</span>
                  </div>
                </section>

                <DetailSection title="Invoice details">
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailValue label="Supplier" value={detail.supplierName ?? "Not recorded"} />
                    <DetailValue label="Invoice number" value={detail.invoiceNumber} />
                    <DetailValue label="Invoice date" value={toDayMonthYearLabel(detail.invoiceDate)} />
                    <DetailValue label="Due date" value={toDayMonthYearLabel(detail.dueDate)} />
                    <DetailValue label="Supplier PO reference" value={detail.supplierPoReference ?? "Not provided"} />
                    <DetailValue label="Project" value={detail.projectName} />
                    <DetailValue label="Purchase Order" value={`${detail.purchaseOrderNumber} · ${detail.purchaseOrderTitle}`} />
                    <DetailValue label="Currency" value={detail.currency} />
                    <DetailValue label="Subtotal" value={toMoney(detail.subtotal)} />
                    <DetailValue label="Tax" value={toMoney(detail.taxTotal)} />
                    <DetailValue label="Total" value={toMoney(detail.total)} />
                    <DetailValue label="Captured" value={toDayMonthYearLabel(detail.capturedAt)} />
                  </dl>
                </DetailSection>

                <DetailSection title="PO allocation detail">
                  {detail.allocatedToOtherPurchaseOrders ? (
                    <p className="mb-3 rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                      This invoice also has allocations against another Purchase Order. Only this Purchase Order is shown below.
                    </p>
                  ) : null}
                  <div className="space-y-3">
                    {detail.allocations.map((allocation) => (
                      <article key={allocation.allocationId} className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className={`${interMedium.className} text-[14px] font-semibold text-[var(--text-primary)]`}>{allocation.invoiceLineDescription}</p>
                            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Matched PO line: {allocation.purchaseOrderLineDescription}</p>
                          </div>
                          <p className={`${interMedium.className} text-[15px] font-semibold text-[var(--text-primary)]`}>{toMoney(allocation.allocatedAmount)}</p>
                        </div>
                        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <DetailValue label="Invoice qty / rate" value={`${allocation.invoiceQuantity} / ${toMoney(allocation.invoiceUnitRate)}`} />
                          <DetailValue label="Allocated quantity" value={allocation.allocatedQuantity == null ? "Not recorded" : String(allocation.allocatedQuantity)} />
                          <DetailValue label="Previously approved" value={`${allocation.previouslyApprovedQuantity} / ${toMoney(allocation.previouslyApprovedValue)}`} />
                          <DetailValue label="Current approved" value={`${allocation.currentApprovedQuantity} / ${toMoney(allocation.currentApprovedValue)}`} />
                          <DetailValue label="Remaining PO line" value={`${allocation.remainingQuantity} / ${toMoney(allocation.remainingValue)}`} />
                          <DetailValue label="Tax basis" value={allocation.taxBasis === "tax_exclusive" ? "Excluding GST" : allocation.taxBasis === "tax_inclusive" ? "Including GST" : "Unavailable"} />
                        </dl>
                        {allocation.varianceLabels.length ? (
                          <div className="mt-3 rounded-[8px] bg-[#FFF7ED] px-3 py-2 text-[12px] text-[#9A3412]">{allocation.varianceLabels.join(" ")}</div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </DetailSection>

                <div className="grid gap-4 lg:grid-cols-2">
                  <DetailSection title="Site review">
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <DetailValue label="Status" value={statusLabel(detail.siteReview.status)} />
                      <DetailValue label="Submission version" value={detail.siteReview.submissionVersion ? `Version ${detail.siteReview.submissionVersion}` : "Not submitted"} />
                      <DetailValue label="Reviewer" value={detail.siteReview.reviewerName ?? "Not reviewed"} />
                      <DetailValue label="Reviewed" value={toDayMonthYearLabel(detail.siteReview.reviewedAt)} />
                    </dl>
                    {detail.siteReview.note ? <p className="mt-4 rounded-[8px] bg-[var(--surface-muted)] px-3 py-3 text-[13px] text-[var(--text-primary)]">{detail.siteReview.note}</p> : null}
                    {detail.siteReview.acceptedVariances.length ? <ul className="mt-3 space-y-1 text-[12px] text-[var(--text-secondary)]">{detail.siteReview.acceptedVariances.map((variance) => <li key={variance}>{variance}</li>)}</ul> : null}
                    {detail.siteReview.invalidationReason ? <p className="mt-3 text-[12px] text-[var(--error)]">{detail.siteReview.invalidationReason}</p> : null}
                    {detail.canReview ? (
                      <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                        <textarea value={props.reviewNote} onChange={(event) => props.onReviewNoteChange(event.target.value)} rows={3} aria-label="Site-review note" className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px]" />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" onClick={() => props.onReview("approved")} disabled={props.reviewSaving}>{props.reviewSaving ? "Saving..." : "Approve allocation"}</Button>
                          <Button type="button" variant="outline" onClick={() => props.onReview("disputed")} disabled={props.reviewSaving} className="text-[var(--error)]">Mark disputed</Button>
                        </div>
                      </div>
                    ) : null}
                  </DetailSection>

                  <DetailSection title="Accounts approval">
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <DetailValue label="Status" value={statusLabel(detail.accountsApproval.status)} />
                      <DetailValue label="Approval validity" value={detail.accountsApproval.current ? "Approval current" : detail.accountsApproval.status === "invalidated" ? "Approval invalidated by invoice changes" : "Accounts approval required"} />
                      <DetailValue label="Approver" value={detail.accountsApproval.approverName ?? "Not approved"} />
                      <DetailValue label="Approved" value={toDayMonthYearLabel(detail.accountsApproval.approvedAt)} />
                    </dl>
                    {detail.accountsApproval.note ? <p className="mt-4 rounded-[8px] bg-[var(--surface-muted)] px-3 py-3 text-[13px] text-[var(--text-primary)]">{detail.accountsApproval.note}</p> : null}
                    {detail.accountsApproval.invalidationReason ? <p className="mt-3 text-[12px] text-[var(--error)]">{detail.accountsApproval.invalidationReason}</p> : null}
                  </DetailSection>
                </div>

                <DetailSection title="Xero and payment">
                  {detail.xero.status === "not_exported" ? (
                    <p className="text-[14px] text-[var(--text-secondary)]">Not exported to Xero.</p>
                  ) : (
                    <>
                      <p className={`${ibmPlexSans.className} mb-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>Whole Xero Bill</p>
                      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <DetailValue label="Bill reference" value={detail.xero.billReference ?? "Not returned"} />
                        <DetailValue label="Status" value={statusLabel(detail.xero.status)} />
                        <DetailValue label="Total" value={toMoney(detail.total)} />
                        <DetailValue label="Paid" value={detail.xero.amountPaid == null ? "Not refreshed" : toMoney(detail.xero.amountPaid)} />
                        <DetailValue label="Due" value={detail.xero.amountDue == null ? "Not refreshed" : toMoney(detail.xero.amountDue)} />
                        <DetailValue label="Paid date" value={toDayMonthYearLabel(detail.xero.fullyPaidAt)} />
                        <DetailValue label="Last refreshed" value={detail.xero.lastStatusSyncedAt ? new Date(detail.xero.lastStatusSyncedAt).toLocaleString("en-NZ") : "Not refreshed"} />
                      </dl>
                      {detail.xero.safeRefreshWarning ? <p className="mt-3 text-[12px] text-[var(--error)]">{detail.xero.safeRefreshWarning}</p> : null}
                    </>
                  )}
                </DetailSection>

                <div className="grid gap-4 lg:grid-cols-2">
                  <DetailSection title="Invoice document">
                    {detail.documents.length ? (
                      <div className="space-y-2">
                        {detail.documents.map((document) => (
                          <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[var(--surface-muted)] px-3 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{document.fileName}</p>
                              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{document.documentType} · uploaded {toDayMonthYearLabel(document.uploadedAt)}</p>
                            </div>
                            {document.openUrl ? <Button asChild variant="outline" size="sm"><a href={document.openUrl} target="_blank" rel="noreferrer"><FileText className="mr-1 h-4 w-4" />Open</a></Button> : <span className="text-[11px] text-[var(--text-secondary)]">Preview unavailable</span>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[13px] text-[var(--text-secondary)]">No invoice document is available.</p>}
                  </DetailSection>

                  <DetailSection title="Activity history">
                    {detail.activity.length ? (
                      <ol className="space-y-3">
                        {detail.activity.map((event) => (
                          <li key={event.id} className="border-l-2 border-[var(--border)] pl-3">
                            <p className="text-[13px] text-[var(--text-primary)]">{event.message}</p>
                            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{toDayMonthYearLabel(event.occurredAt)}{event.actorName ? ` · ${event.actorName}` : ""}</p>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="text-[13px] text-[var(--text-secondary)]">No activity has been recorded.</p>}
                  </DetailSection>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pb-2">
                  <Button asChild variant="outline"><Link href={detail.fullInvoiceHref}>View full Supplier Invoice <ExternalLink className="ml-1 h-4 w-4" /></Link></Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
