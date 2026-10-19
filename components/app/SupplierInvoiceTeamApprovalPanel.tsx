"use client";

import { Button } from "@/components/ui/button";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { StatusBadge } from "@/components/app/StatusBadge";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
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

function badge(rowStatus: SupplierInvoiceTeamApprovalRow["status"]) {
  if (rowStatus === "approved") return { label: "Approved", status: "approved" as const };
  if (rowStatus === "declined") return { label: "Declined", status: "overdue" as const };
  return { label: "Waiting", status: "pending" as const };
}

const statusDotClassName = (panelStatus: "not_required" | "not_sent" | "waiting" | "partially_reviewed" | "approved" | "declined" | "invalidated") =>
  panelStatus === "approved" || panelStatus === "not_required"
    ? "bg-[#22C55E]"
    : panelStatus === "declined" || panelStatus === "invalidated"
      ? "bg-[#EF4444]"
      : "bg-[#FACC15]";

export function SupplierInvoiceTeamApprovalPanel(props: {
  status: "not_required" | "not_sent" | "waiting" | "partially_reviewed" | "approved" | "declined" | "invalidated";
  groups: SupplierInvoiceTeamApprovalGroup[];
  blockers?: string[];
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
      <div className="space-y-5">
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClassName(props.status)}`} />
            <p className={`${interMedium.className} text-[14px] font-semibold text-[var(--text-primary)]`}>
              {statusCopy}
            </p>
          </div>
          <p className={`${ibmPlexSans.className} mt-1.5 text-[12px] leading-5 text-[var(--text-secondary)]`}>
            Site review verifies the supplier, PO match and received quantities. Accounting coding and tax treatment are completed later in Accounts.
          </p>
          {props.status === "declined" ? (
            <p className={`${ibmPlexSans.className} mt-2 text-[12px] leading-5 text-[var(--error)]`}>
              Amend Invoice Capture or the matching in Supplier Invoice Lines, then send the corrected invoice again.
            </p>
          ) : null}
        </div>

        {props.blockers?.length ? (
          <div className="rounded-[12px] border border-[var(--status-pending)]/30 bg-[var(--status-pending-light)] px-4 py-3">
            <p className={`${interMedium.className} text-[12px] font-semibold text-[var(--text-primary)]`}>
              Complete these operational checks before sending
            </p>
            <ul className={`${ibmPlexSans.className} mt-1.5 list-disc space-y-1 pl-4 text-[12px] leading-5 text-[var(--text-secondary)]`}>
              {props.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        ) : null}

        {props.groups.length ? (
          <div className="space-y-6">
            {props.groups.map((group) => (
              <section key={group.purchaseOrderId}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Purchase order
                    </span>
                    <span className={`${interMedium.className} truncate text-[14px] font-semibold text-[var(--text-primary)]`}>
                      {group.purchaseOrderNumber}
                    </span>
                  </div>
                  <span className="shrink-0 text-[12px] text-[var(--text-secondary)]">
                    {group.rows.length} {group.rows.length === 1 ? "line" : "lines"}
                  </span>
                </div>

                <div className="hidden overflow-hidden rounded-[12px] border border-[var(--border)] md:block">
                  <OperationalTable>
                    <OperationalTableHeader>
                      <OperationalTableRow className="h-11 hover:bg-transparent">
                        <OperationalTableHead scope="col" className="h-11 w-[36%] py-3 text-[12px] font-semibold text-[var(--text-secondary)]">Invoice line</OperationalTableHead>
                        <OperationalTableHead scope="col" className="h-11 w-[24%] py-3 text-[12px] font-semibold text-[var(--text-secondary)]">Matching PO line</OperationalTableHead>
                        <OperationalTableHead scope="col" className="h-11 w-[12%] py-3 text-right text-[12px] font-semibold text-[var(--text-secondary)]">Amount</OperationalTableHead>
                        <OperationalTableHead scope="col" className="h-11 w-[16%] py-3 text-[12px] font-semibold text-[var(--text-secondary)]">Reviewed by</OperationalTableHead>
                        <OperationalTableHead scope="col" className="h-11 w-[12%] py-3 text-[12px] font-semibold text-[var(--text-secondary)]">Status</OperationalTableHead>
                      </OperationalTableRow>
                    </OperationalTableHeader>
                    <OperationalTableBody>
                      {group.rows.map((row) => {
                        const presentation = badge(row.status);
                        return (
                          <OperationalTableRow key={row.allocationId} className="align-top">
                            <OperationalTableCell className="py-3.5">
                              <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>
                                {row.invoiceLine}
                              </p>
                              {row.comment ? (
                                <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{row.comment}</p>
                              ) : null}
                            </OperationalTableCell>
                            <OperationalTableCell className="py-3.5 text-[13px] text-[var(--text-primary)]">
                              {row.purchaseOrderLine}
                            </OperationalTableCell>
                            <OperationalTableCell className="py-3.5 text-right text-[13px] font-semibold text-[var(--text-primary)]">
                              {toMoney(row.amount)}
                            </OperationalTableCell>
                            <OperationalTableCell className="py-3.5">
                              {row.reviewer ? (
                                <p className="text-[13px] text-[var(--text-primary)]">{row.reviewer}</p>
                              ) : (
                                <p className="text-[13px] text-[var(--text-secondary)]">Not reviewed</p>
                              )}
                              {row.reviewedAt ? (
                                <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{toDayMonthYearLabel(row.reviewedAt)}</p>
                              ) : null}
                            </OperationalTableCell>
                            <OperationalTableCell className="py-3.5">
                              <StatusBadge status={presentation.status}>{presentation.label}</StatusBadge>
                            </OperationalTableCell>
                          </OperationalTableRow>
                        );
                      })}
                    </OperationalTableBody>
                  </OperationalTable>
                </div>

                <div className="space-y-2 md:hidden">
                  {group.rows.map((row) => {
                    const presentation = badge(row.status);
                    return (
                      <article key={row.allocationId} className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`${interMedium.className} min-w-0 text-[13px] font-semibold text-[var(--text-primary)]`}>
                            {row.invoiceLine}
                          </p>
                          <StatusBadge status={presentation.status}>{presentation.label}</StatusBadge>
                        </div>
                        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                          Matching PO line: {row.purchaseOrderLine}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
                          <span className="font-semibold text-[var(--text-primary)]">{toMoney(row.amount)}</span>
                          <span className="text-right text-[var(--text-secondary)]">
                            {row.reviewer ?? "Not reviewed"}
                            {row.reviewedAt ? ` · ${toDayMonthYearLabel(row.reviewedAt)}` : ""}
                          </span>
                        </div>
                        {row.comment ? (
                          <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">{row.comment}</p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </OperationalPanel>
  );
}
