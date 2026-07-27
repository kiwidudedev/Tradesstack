"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { ibmPlexSans, interMedium } from "@/lib/fonts";

export type SupplierInvoiceReadyStatus = "issue" | "waiting" | "ready" | "sent";

const STATUS_PRESENTATION: Record<SupplierInvoiceReadyStatus, { label: string; dot: string }> = {
  issue: { label: "Issue", dot: "bg-[#EF4444]" },
  waiting: { label: "Waiting", dot: "bg-[#FACC15]" },
  ready: { label: "Ready", dot: "bg-[#22C55E]" },
  sent: { label: "Sent", dot: "bg-[#3B82F6]" },
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
}) {
  const status = STATUS_PRESENTATION[props.status];
  return (
    <OperationalPanel
      title="Ready for Xero"
      description="Create the approved Supplier Invoice as a Draft Bill in Xero."
      actions={props.status !== "sent" ? (
        <Button type="button" onClick={props.onCreate} disabled={!props.canCreate || props.creating}>
          {props.creating ? "Preparing..." : "Create Draft Bill in Xero"}
        </Button>
      ) : null}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
        <div>
          <p className={`${interMedium.className} text-[14px] font-semibold text-[var(--text-primary)]`}>{status.label}</p>
          <p className={`${ibmPlexSans.className} mt-1 text-[13px] text-[var(--text-secondary)]`}>{props.message}</p>
        </div>
      </div>

      {props.status === "issue" && props.onResolveGst ? (
        <Button type="button" variant="secondary" className="mt-4" onClick={props.onResolveGst}>
          Resolve GST
        </Button>
      ) : null}

      {props.showNoPoReason ? (
        <div className="mt-5 max-w-[680px] space-y-3">
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
    </OperationalPanel>
  );
}
