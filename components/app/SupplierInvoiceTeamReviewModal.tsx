"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import type {
  PurchaseOrderSupplierInvoiceAllocationDetail,
  PurchaseOrderSupplierInvoiceDetail,
} from "@/lib/purchase-order-supplier-invoice-detail";
import { toMoney } from "@/lib/supplier-invoices";

function statusPresentation(status: PurchaseOrderSupplierInvoiceAllocationDetail["teamReview"]["status"]) {
  if (status === "approved") return { label: "Approved", className: "bg-[#DCFCE7] text-[#15803D]" };
  if (status === "declined") return { label: "Declined", className: "bg-[#FEE2E2] text-[#B91C1C]" };
  return { label: "Waiting", className: "bg-[#FEF3C7] text-[#92400E]" };
}

function ReviewControls(props: {
  allocation: PurchaseOrderSupplierInvoiceAllocationDetail;
  canReview: boolean;
  comment: string;
  saving: boolean;
  onCommentChange: (value: string) => void;
  onReview: (decision: "approved" | "disputed") => void;
}) {
  const status = statusPresentation(props.allocation.teamReview.status);
  if (props.allocation.teamReview.status !== "waiting") {
    return (
      <div className="min-w-[190px]">
        <span className={`${ibmPlexSans.className} inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${status.className}`}>
          {status.label}
        </span>
        {props.allocation.teamReview.comment ? (
          <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">{props.allocation.teamReview.comment}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
          {props.allocation.teamReview.reviewerName ?? "Project reviewer"}
        </p>
      </div>
    );
  }

  if (!props.canReview) {
    return <span className={`${ibmPlexSans.className} inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${status.className}`}>{status.label}</span>;
  }

  return (
    <div className="min-w-[260px] space-y-2">
      <textarea
        value={props.comment}
        onChange={(event) => props.onCommentChange(event.target.value)}
        rows={2}
        aria-label={`Comment for ${props.allocation.invoiceLineDescription}`}
        placeholder="Leave a comment"
        disabled={props.saving}
        className={`${ibmPlexSans.className} w-full resize-y rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]`}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => props.onReview("approved")} disabled={props.saving}>
          {props.saving ? "Saving..." : "Approve"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => props.onReview("disputed")}
          disabled={props.saving || !props.comment.trim()}
          className="text-[var(--error)]"
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

export function SupplierInvoiceTeamReviewModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: PurchaseOrderSupplierInvoiceDetail | null;
  loading: boolean;
  error: string | null;
  reviewError: string | null;
  savingAllocationId: string | null;
  onReview: (params: {
    allocationId: string;
    decision: "approved" | "disputed";
    comment: string;
  }) => void;
}) {
  const [comments, setComments] = useState<Record<string, string>>({});

  const detail = props.detail;
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) setComments({});
        props.onOpenChange(open);
      }}
    >
      <DialogContent fullScreenMobile className="h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden rounded-none border-0 bg-[var(--surface)] p-0 sm:h-auto sm:max-h-[92vh] sm:w-[calc(100vw-32px)] sm:max-w-[1180px] sm:rounded-[18px] sm:border">
        <div className="flex max-h-[100dvh] min-h-0 flex-col sm:max-h-[92vh]">
          <DialogHeader className="shrink-0 border-b border-[var(--border)] px-5 py-5 pr-14 sm:px-7">
            <DialogTitle className={`${interMedium.className} text-[22px] font-semibold tracking-[-0.02em] sm:text-[27px]`}>
              Team Approval
            </DialogTitle>
            <DialogDescription className={`${ibmPlexSans.className} mt-1 text-[14px]`}>
              {detail
                ? `${detail.invoiceNumber} · ${detail.supplierName ?? "Supplier"} · ${detail.purchaseOrderNumber} · ${detail.projectName}`
                : "Review the Supplier Invoice lines matched to this Purchase Order."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            {props.loading ? (
              <div className="flex min-h-[280px] items-center justify-center gap-2 text-[var(--text-secondary)]">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading lines...
              </div>
            ) : props.error ? (
              <div role="alert" className="rounded-[12px] border border-[var(--error)]/20 bg-[var(--error-light)] px-4 py-4 text-[14px] text-[var(--error)]">
                {props.error}
              </div>
            ) : detail ? (
              <>
                {props.reviewError ? (
                  <div role="alert" className="mb-4 rounded-[12px] border border-[var(--error)]/20 bg-[var(--error-light)] px-4 py-4 text-[14px] text-[var(--error)]">
                    {props.reviewError}
                  </div>
                ) : null}
                <div className="hidden overflow-hidden rounded-[14px] border border-[var(--border)] md:block">
                  <div className="max-w-full overflow-x-auto">
                    <table className="w-full min-w-[1040px] border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                          {["Invoice line", "Matching PO line", "Qty.", "Rate", "Amount", "Comment and decision"].map((heading) => (
                            <th key={heading} className={`${ibmPlexSans.className} px-4 py-3 text-left text-[12px] font-semibold text-[var(--text-secondary)]`}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.allocations.map((allocation) => (
                          <tr key={allocation.allocationId} className="border-b border-[var(--border)] align-top last:border-b-0">
                            <td className={`${interMedium.className} px-4 py-4 text-[13px] font-semibold text-[var(--text-primary)]`}>{allocation.invoiceLineDescription}</td>
                            <td className="px-4 py-4 text-[13px] text-[var(--text-primary)]">{allocation.purchaseOrderLineDescription}</td>
                            <td className="px-4 py-4 text-[13px] text-[var(--text-primary)]">{allocation.invoiceQuantity}</td>
                            <td className="px-4 py-4 text-[13px] text-[var(--text-primary)]">{toMoney(allocation.invoiceUnitRate)}</td>
                            <td className={`${interMedium.className} px-4 py-4 text-[13px] font-semibold text-[var(--text-primary)]`}>{toMoney(allocation.allocatedAmount)}</td>
                            <td className="px-4 py-4">
                              <ReviewControls
                                allocation={allocation}
                                canReview={detail.canReview}
                                comment={comments[allocation.allocationId] ?? ""}
                                saving={props.savingAllocationId === allocation.allocationId}
                                onCommentChange={(comment) => setComments((current) => ({ ...current, [allocation.allocationId]: comment }))}
                                onReview={(decision) => props.onReview({ allocationId: allocation.allocationId, decision, comment: comments[allocation.allocationId] ?? "" })}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 md:hidden">
                  {detail.allocations.map((allocation) => (
                    <article key={allocation.allocationId} className="rounded-[12px] border border-[var(--border)] p-4">
                      <p className={`${interMedium.className} text-[14px] font-semibold text-[var(--text-primary)]`}>{allocation.invoiceLineDescription}</p>
                      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Matching PO line: {allocation.purchaseOrderLineDescription}</p>
                      <dl className="my-4 grid grid-cols-3 gap-3 text-[12px]">
                        <div><dt className="text-[var(--text-secondary)]">Qty.</dt><dd className="mt-1">{allocation.invoiceQuantity}</dd></div>
                        <div><dt className="text-[var(--text-secondary)]">Rate</dt><dd className="mt-1">{toMoney(allocation.invoiceUnitRate)}</dd></div>
                        <div><dt className="text-[var(--text-secondary)]">Amount</dt><dd className="mt-1 font-semibold">{toMoney(allocation.allocatedAmount)}</dd></div>
                      </dl>
                      <ReviewControls
                        allocation={allocation}
                        canReview={detail.canReview}
                        comment={comments[allocation.allocationId] ?? ""}
                        saving={props.savingAllocationId === allocation.allocationId}
                        onCommentChange={(comment) => setComments((current) => ({ ...current, [allocation.allocationId]: comment }))}
                        onReview={(decision) => props.onReview({ allocationId: allocation.allocationId, decision, comment: comments[allocation.allocationId] ?? "" })}
                      />
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
