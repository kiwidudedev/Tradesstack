import type {
  CompanyPaymentClaimRegisterRow,
  CompanyPaymentClaimsSearchParams,
} from "@/app/app/(workspace)/company/payment-claims/payment-claim-register-types";

const TRUE_VALUES = new Set(["1", "true", "yes"]);
const SORTS = new Set(["period", "due", "amount", "claim_number"]);

export type CompanyPaymentClaimsFilters = {
  month: string | null;
  search: string | null;
  projectId: string | null;
  clientId: string | null;
  claimStatus: string | null;
  xeroStatus: string | null;
  externalStatus: string | null;
  paymentStatus: string | null;
  outstandingOnly: boolean;
  overdueOnly: boolean;
  attentionOnly: boolean;
  sort: string;
  direction: "asc" | "desc";
  page: number;
};

function clean(value: string | undefined) {
  const result = value?.trim();
  return result ? result : null;
}

export function parseCompanyPaymentClaimsFilters(
  params: CompanyPaymentClaimsSearchParams,
): CompanyPaymentClaimsFilters {
  const page = Number.parseInt(params.page ?? "1", 10);
  return {
    month: clean(params.month),
    search: clean(params.search),
    projectId: clean(params.project),
    clientId: clean(params.client),
    claimStatus: clean(params.claimStatus),
    xeroStatus: clean(params.xeroStatus),
    externalStatus: clean(params.externalStatus),
    paymentStatus: clean(params.paymentStatus),
    outstandingOnly: TRUE_VALUES.has(params.outstanding ?? ""),
    overdueOnly: TRUE_VALUES.has(params.overdue ?? ""),
    attentionOnly: TRUE_VALUES.has(params.attention ?? ""),
    sort: SORTS.has(params.sort ?? "") ? params.sort! : "period",
    direction: params.direction === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function formatRegisterDate(value: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

export function formatRegisterMonth(value: string) {
  if (value === "all") return "All periods";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export function formatRegisterMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: currency || "NZD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatTrustedMinorAmount(
  value: number | null,
  row: CompanyPaymentClaimRegisterRow,
) {
  if (row.divergent || value == null) return "—";
  return formatRegisterMoney(Number(value) / 100, row.currency);
}

export function claimStatusTone(status: string) {
  switch (status) {
    case "Paid": return "completed" as const;
    case "Overdue": return "overdue" as const;
    case "Submitted":
    case "Unpaid": return "pending" as const;
    case "Cancelled": return "draft" as const;
    default: return "draft" as const;
  }
}

export function xeroStatusLabel(status: string) {
  const labels: Record<string, string> = {
    not_exported: "Not exported",
    queued: "Queued",
    processing: "Processing",
    exporting: "Exporting",
    succeeded: "Exported",
    exported: "Exported",
    failed: "Failed",
    attention_required: "Attention required",
    cancelled: "Cancelled",
    superseded: "Superseded",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function externalStatusLabel(status: string | null) {
  if (!status) return "Unavailable";
  const labels: Record<string, string> = {
    draft: "Draft",
    authorised: "Authorized",
    awaiting_payment: "Awaiting payment",
    partially_paid: "Partially paid",
    paid: "Paid",
    voided: "Voided",
    deleted: "Deleted",
    unknown: "Unknown",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function paymentStatusLabel(
  status: string | null,
  divergent: boolean | null,
) {
  if (divergent) return "Attention required";
  const labels: Record<string, string> = {
    unpaid: "Unpaid",
    partially_paid: "Part paid",
    paid: "Paid",
    attention_required: "Attention required",
  };
  return status ? labels[status] ?? status.replaceAll("_", " ") : "Unavailable";
}

export function hasActiveRegisterFilters(filters: CompanyPaymentClaimsFilters) {
  return Boolean(
    filters.search
    || filters.projectId
    || filters.clientId
    || filters.claimStatus
    || filters.xeroStatus
    || filters.externalStatus
    || filters.paymentStatus
    || filters.outstandingOnly
    || filters.overdueOnly
    || filters.attentionOnly
    || filters.month,
  );
}
