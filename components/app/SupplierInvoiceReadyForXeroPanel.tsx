"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { ibmPlexSans } from "@/lib/fonts";

export type SupplierInvoiceReadyStatus = "issue" | "waiting" | "ready" | "sent";

const STATUS_PRESENTATION: Record<SupplierInvoiceReadyStatus, {
  label: string;
  tone: string;
  Icon: typeof CheckCircle2;
}> = {
  issue: { label: "Needs attention", tone: "text-[var(--status-overdue)]", Icon: AlertCircle },
  waiting: { label: "Waiting", tone: "text-[var(--status-pending)]", Icon: Clock3 },
  ready: { label: "Ready", tone: "text-[var(--status-approved)]", Icon: CheckCircle2 },
  sent: { label: "Sent", tone: "text-[var(--status-sent)]", Icon: Send },
};

export function SupplierInvoiceReadyForXeroPanel(props: {
  status: SupplierInvoiceReadyStatus;
  message: string;
  canCreate: boolean;
  creating: boolean;
  showNoPoReason: boolean;
  noPoReason: string;
  noPoExplanation: string;
  onNoPoReasonChange: (value: string) => void;
  onNoPoExplanationChange: (value: string) => void;
  onCreate: () => void;
  onResolveGst?: () => void;
  setupHref?: string | null;
}) {
  const status = STATUS_PRESENTATION[props.status];
  const StatusIcon = status.Icon;
  const readyAction = props.status === "ready" && props.canCreate
    ? <Button type="button" onClick={props.onCreate} disabled={props.creating}>
        {props.creating ? "Preparing..." : "Create Draft Bill in Xero"}
      </Button>
    : null;
  const issueAction = props.status === "issue"
    ? (
        <div className="flex flex-wrap items-center gap-3">
          {props.setupHref ? (
            <Link href={props.setupHref} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-primary)] hover:underline">
              Open accounting settings <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null}
          {props.onResolveGst ? (
            <Button type="button" variant="secondary" size="sm" onClick={props.onResolveGst}>
              Resolve GST
            </Button>
          ) : null}
        </div>
      )
    : null;

  return (
    <OperationalPanel
      title="Ready for Xero"
      actions={(
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${status.tone}`}>
          <StatusIcon className="h-4 w-4" aria-hidden="true" />
          {status.label}
        </span>
      )}
      contentClassName="p-0"
    >
      <div className="divide-y divide-[var(--border)]">
        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`${ibmPlexSans.className} text-[13px] leading-5 text-[var(--text-secondary)]`}>{props.message}</p>
          {props.status === "ready" && !props.canCreate ? (
            <p className="text-[12px] text-[var(--text-secondary)]">You do not have permission to create the Draft Bill.</p>
          ) : readyAction ?? issueAction}
        </div>

        {props.showNoPoReason ? (
          <div className="max-w-[680px] space-y-3 px-6 py-4">
            <label className={`${ibmPlexSans.className} block text-[13px] font-semibold text-[var(--text-primary)]`}>
              Why was no Purchase Order used?
              <select
                value={props.noPoReason}
                onChange={(event) => props.onNoPoReasonChange(event.target.value)}
                className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px]"
              >
                <option value="">Select a reason</option>
                <option value="utilities">Utilities</option>
                <option value="insurance">Insurance</option>
                <option value="emergency_purchase">Emergency purchase</option>
                <option value="professional_service">Professional service</option>
                <option value="approved_overhead">Approved overhead</option>
                <option value="other">Other</option>
              </select>
            </label>
            {props.noPoReason === "other" ? (
              <Input
                value={props.noPoExplanation}
                onChange={(event) => props.onNoPoExplanationChange(event.target.value)}
                placeholder="Explain the reason"
                aria-label="No Purchase Order explanation"
              />
            ) : null}
          </div>
        ) : null}

      </div>
    </OperationalPanel>
  );
}
