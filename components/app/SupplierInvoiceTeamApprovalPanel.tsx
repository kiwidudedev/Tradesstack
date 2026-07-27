"use client";

import { Button } from "@/components/ui/button";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { toDayMonthYearLabel, toMoney } from "@/lib/supplier-invoices";

export type SupplierInvoiceTeamApprovalRow = {
  allocationId: string;
  invoiceLine: string;
  purchaseOrderLine: string;
  amount: number;
  status: "waiting" | "approved" | "declined";
  reviewer: string | null;
  comment: string | null;
  reviewedAt: string | null;
};

export type SupplierInvoiceTeamApprovalGroup = {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  rows: SupplierInvoiceTeamApprovalRow[];
};

function badge(status: SupplierInvoiceTeamApprovalRow["status"]) {
  if (status === "approved") return { label: "Approved", className: "bg-[#DCFCE7] text-[#15803D]" };
  if (status === "declined") return { label: "Declined", className: "bg-[#FEE2E2] text-[#B91C1C]" };
  return { label: "Waiting", className: "bg-[#FEF3C7] text-[#92400E]" };
}

export function SupplierInvoiceTeamApprovalPanel(props: {
  status: "not_required" | "not_sent" | "waiting" | "partially_reviewed" | "approved" | "declined" | "invalidated";
  groups: SupplierInvoiceTeamApprovalGroup[];
  canSend: boolean;
  hasBeenSent: boolean;
  sending: boolean;
  onSend: () => void;
}) {
  const statusCopy = {
    not_required: "Team Approval is not required for the current no-PO workflow.",
    not_sent: "Ready to send to the project team.",
    waiting: "Waiting for the project team.",
    partially_reviewed: "The project team has reviewed some lines.",
    approved: "The project team approved every line.",
    declined: "The project team declined one or more lines.",
    invalidated: "The invoice changed and must be sent to the project team again.",
  }[props.status];

  return (
    <OperationalPanel
      title="Team Approval"
      description="The project team reviews each matched invoice line from the Purchase Order Bills/Invoices area."
      actions={props.canSend ? (
        <Button type="button" onClick={props.onSend} disabled={props.sending}>
          {props.sending ? "Sending..." : props.hasBeenSent ? "Send Again" : "Send for Team Approval"}
        </Button>
      ) : null}
    >
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${props.status === "approved" || props.status === "not_required" ? "bg-[#22C55E]" : props.status === "declined" || props.status === "invalidated" ? "bg-[#EF4444]" : "bg-[#FACC15]"}`} />
        <p className={`${interMedium.className} text-[14px] font-semibold text-[var(--text-primary)]`}>{statusCopy}</p>
      </div>

      {props.status === "declined" ? (
        <p className={`${ibmPlexSans.className} mt-3 text-[13px] text-[var(--error)]`}>
          Amend Invoice Capture or the matching in Supplier Invoice Lines, then send the corrected invoice again.
        </p>
      ) : null}

      {props.groups.length ? (
        <div className="mt-5 space-y-5">
          {props.groups.map((group) => (
            <section key={group.purchaseOrderId}>
              <h3 className={`${interMedium.className} mb-2 text-[14px] font-semibold text-[var(--text-primary)]`}>{group.purchaseOrderNumber}</h3>
              <div className="overflow-hidden rounded-[12px] border border-[var(--border)]">
                {group.rows.map((row) => {
                  const presentation = badge(row.status);
                  return (
                    <div key={row.allocationId} className="grid gap-3 border-b border-[var(--border)] px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_150px] md:items-start">
                      <div className="min-w-0">
                        <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>{row.invoiceLine}</p>
                        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Invoice line · {toMoney(row.amount)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] text-[var(--text-secondary)]">Matching PO line</p>
                        <p className="mt-1 text-[13px] text-[var(--text-primary)]">{row.purchaseOrderLine}</p>
                      </div>
                      <span className={`${ibmPlexSans.className} inline-flex w-fit rounded-full px-2.5 py-1 text-[12px] font-semibold ${presentation.className}`}>{presentation.label}</span>
                      <div className="min-w-0 text-[12px] text-[var(--text-secondary)]">
                        {row.reviewer ? <p>{row.reviewer}</p> : <p>Not reviewed</p>}
                        {row.reviewedAt ? <p className="mt-1">{toDayMonthYearLabel(row.reviewedAt)}</p> : null}
                        {row.comment ? <p className="mt-2 break-words text-[var(--text-primary)]">{row.comment}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </OperationalPanel>
  );
}
