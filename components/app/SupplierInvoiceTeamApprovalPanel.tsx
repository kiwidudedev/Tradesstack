"use client";

import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MinusCircle,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { toDayMonthYearLabel, toLongDateLabel, toMoney } from "@/lib/supplier-invoices";

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
  href?: string | null;
  rows: SupplierInvoiceTeamApprovalRow[];
};

type PanelStatus = "not_required" | "not_sent" | "waiting" | "partially_reviewed" | "approved" | "declined" | "invalidated";

function panelStatus(status: PanelStatus) {
  switch (status) {
    case "approved":
      return { label: "Approved", tone: "text-[var(--status-approved)]", Icon: CheckCircle2 };
    case "partially_reviewed":
      return { label: "Partially approved", tone: "text-[var(--status-pending)]", Icon: Clock3 };
    case "waiting":
      return { label: "Awaiting review", tone: "text-[var(--status-pending)]", Icon: Clock3 };
    case "declined":
      return { label: "Changes required", tone: "text-[var(--status-overdue)]", Icon: AlertCircle };
    case "invalidated":
      return { label: "Review again", tone: "text-[var(--status-pending)]", Icon: RefreshCw };
    case "not_required":
      return { label: "Not required", tone: "text-[var(--text-secondary)]", Icon: MinusCircle };
    default:
      return { label: "Not submitted", tone: "text-[var(--text-secondary)]", Icon: Clock3 };
  }
}

function lineStatus(status: SupplierInvoiceTeamApprovalRow["status"], allApproved: boolean) {
  if (status === "approved") {
    return {
      label: "Approved",
      tone: "text-[var(--status-approved)]",
      Icon: CheckCircle2,
      showLabel: !allApproved,
    };
  }
  if (status === "declined") {
    return {
      label: "Declined",
      tone: "text-[var(--status-overdue)]",
      Icon: AlertCircle,
      showLabel: true,
    };
  }
  return {
    label: "Pending",
    tone: "text-[var(--status-pending)]",
    Icon: Clock3,
    showLabel: true,
  };
}

function uniqueReviewers(rows: SupplierInvoiceTeamApprovalRow[]) {
  return Array.from(new Set(rows.map((row) => row.reviewer).filter((reviewer): reviewer is string => Boolean(reviewer))));
}

export function SupplierInvoiceTeamApprovalPanel(props: {
  status: PanelStatus;
  groups: SupplierInvoiceTeamApprovalGroup[];
  blockers?: string[];
  canSend: boolean;
  hasBeenSent: boolean;
  sending: boolean;
  onSend: () => void;
}) {
  const allRows = props.groups.flatMap((group) => group.rows);
  const approvedCount = allRows.filter((row) => row.status === "approved").length;
  const declinedCount = allRows.filter((row) => row.status === "declined").length;
  const allApproved = allRows.length > 0 && approvedCount === allRows.length;
  const reviewers = uniqueReviewers(allRows);
  const singleReviewer = reviewers.length === 1 ? reviewers[0] : null;
  const latestReviewedAt = allRows
    .map((row) => row.reviewedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const status = panelStatus(props.status);
  const StatusIcon = status.Icon;
  const singleGroup = props.groups.length === 1 ? props.groups[0] : null;

  const description = !props.groups.length
    ? undefined
    : singleGroup
      ? singleGroup.href
        ? <Link href={singleGroup.href} className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)] hover:underline">PO {singleGroup.purchaseOrderNumber}</Link>
        : <span>PO {singleGroup.purchaseOrderNumber}</span>
      : `${props.groups.length} purchase orders`;

  const sendAction = (props.canSend && (props.status === "not_sent" || props.status === "invalidated"))
    ? <Button type="button" size="sm" onClick={props.onSend} disabled={props.sending || Boolean(props.blockers?.length)}>
        {props.sending ? "Sending..." : props.hasBeenSent ? "Send again" : "Send for team approval"}
      </Button>
    : null;

  const actionCopy = {
    not_required: "This invoice does not need team approval.",
    not_sent: "Send this invoice to the project team for approval.",
    waiting: "Review the invoice lines before approving.",
    partially_reviewed: "Some lines still need a decision.",
    approved: "",
    declined: declinedCount > 0 ? `Update the ${declinedCount === 1 ? "declined line" : "declined lines"}, then send the invoice again.` : "Update the declined lines, then send the invoice again.",
    invalidated: "The invoice changed after review.",
  }[props.status];

  const reviewHref = props.groups.length === 1 ? props.groups[0]?.href ?? null : null;
  const actionSuffix = props.status === "waiting" || props.status === "partially_reviewed"
    ? reviewHref
      ? <Link href={reviewHref} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-primary)] hover:underline">
          Review lines <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      : null
    : sendAction;

  const footerLeft = props.status === "approved" && singleReviewer
    ? (
        <div className="flex items-start gap-2">
          <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-approved)]" aria-hidden="true" />
          <div>
            <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>
              Approved by {singleReviewer}
            </p>
            {latestReviewedAt ? (
              <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{toLongDateLabel(latestReviewedAt)}</p>
            ) : null}
          </div>
        </div>
      )
    : props.status === "approved" && allApproved
      ? <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>All lines approved</p>
      : null;

  return (
    <OperationalPanel
      title="Team approval"
      description={description}
      actions={(
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${status.tone}`}>
          <StatusIcon className="h-4 w-4" aria-hidden="true" />
          {status.label}
        </span>
      )}
      contentClassName="p-0"
    >
      <div className="divide-y divide-[var(--border)]">
        {props.blockers?.length ? (
          <div className="px-6 py-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-pending)]" aria-hidden="true" />
              <div>
                <p className={`${interMedium.className} text-[12px] font-semibold text-[var(--text-primary)]`}>
                  Before sending
                </p>
                <ul className={`${ibmPlexSans.className} mt-1 list-disc space-y-1 pl-4 text-[12px] leading-5 text-[var(--text-secondary)]`}>
                  {props.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {actionCopy ? (
          <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-5 text-[var(--text-secondary)]">{actionCopy}</p>
            {actionSuffix}
          </div>
        ) : null}

        {props.groups.length ? (
          <div className={props.groups.length > 1 ? "divide-y divide-[var(--border)]" : undefined}>
            {props.groups.map((group) => (
              <section key={group.purchaseOrderId}>
                {props.groups.length > 1 ? (
                  <div className="px-6 pb-1 pt-4">
                    {group.href ? (
                      <Link href={group.href} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline">
                        PO {group.purchaseOrderNumber}
                      </Link>
                    ) : (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                        PO {group.purchaseOrderNumber}
                      </span>
                    )}
                  </div>
                ) : null}
                <ul className="divide-y divide-[var(--border)]">
                  {group.rows.map((row) => {
                    const presentation = lineStatus(row.status, allApproved);
                    const LineIcon = presentation.Icon;
                    const showRowReviewer = Boolean(row.reviewer)
                      && (reviewers.length > 1 || props.status !== "approved");
                    return (
                      <li key={row.allocationId} className="flex items-start justify-between gap-4 px-6 py-4">
                        <div className="min-w-0">
                          <p className={`${interMedium.className} text-[14px] font-semibold leading-5 text-[var(--text-primary)]`}>
                            {row.invoiceLine}
                          </p>
                          <p className="mt-0.5 text-[12px] leading-5 text-[var(--text-secondary)]">{row.purchaseOrderLine}</p>
                          {showRowReviewer ? (
                            <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
                              {row.reviewer}
                              {row.reviewedAt ? ` · ${toDayMonthYearLabel(row.reviewedAt)}` : ""}
                            </p>
                          ) : null}
                          {row.status === "declined" && row.comment ? (
                            <p className="mt-1.5 text-[12px] leading-5 text-[var(--text-primary)]">{row.comment}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
                            {toMoney(row.amount)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium ${presentation.tone}`}
                            aria-label={presentation.label}
                          >
                            <LineIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {presentation.showLabel ? presentation.label : <span className="sr-only">{presentation.label}</span>}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : props.status !== "not_required" ? (
          <div className="flex items-center gap-2 px-6 py-5 text-[12px] text-[var(--text-secondary)]">
            <MinusCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            No purchase orders are linked to this invoice.
          </div>
        ) : null}

        {props.groups.length ? (
          <div className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">{footerLeft}</div>
            <span className="shrink-0 text-[12px] text-[var(--text-secondary)]">
              {approvedCount} of {allRows.length} {allRows.length === 1 ? "line" : "lines"} approved
            </span>
          </div>
        ) : null}
      </div>
    </OperationalPanel>
  );
}
