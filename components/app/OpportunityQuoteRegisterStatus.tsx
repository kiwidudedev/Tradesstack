import { StatusBadge } from "@/components/app/StatusBadge";

function statusTone(status: string): "draft" | "pending" | "sent" | "approved" | "overdue" | "completed" | "active" {
  if (status === "Draft") return "draft";
  if (status === "Accepted") return "approved";
  if (status === "Rejected" || status === "Expired") return "overdue";
  if (status === "Sent" || status === "Viewed") return "sent";
  return "pending";
}

export function OpportunityQuoteRegisterStatus({
  status,
  sourceChanged,
}: {
  status: string | null;
  sourceChanged: boolean;
}) {
  return (
    <div data-testid="quote-register-status" className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 whitespace-nowrap">
      <span data-testid="quote-register-status-badge">
        {status ? <StatusBadge status={statusTone(status)}>{status}</StatusBadge> : <StatusBadge status="pending">Not created</StatusBadge>}
      </span>
      {sourceChanged ? <span data-testid="quote-register-pricing-warning" className="justify-self-center text-xs text-amber-700">Pricing has changed</span> : null}
    </div>
  );
}
