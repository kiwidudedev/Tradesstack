"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, FileDown, Maximize2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "@/components/app/trade-pack-builder.module.css";

type ClaimStatus = "Draft" | "Submitted" | "Unpaid" | "Paid" | "Overdue" | "Cancelled";
type ClaimType = "Progress" | "Deposit" | "Final";
type RetentionMethod = "flat" | "sliding_scale";

interface RetentionScaleBand {
  id?: string;
  up_to: number | null;
  rate_percent: number | string;
}

interface RetentionScaleBandDraftRow {
  id: string;
  amount: string;
  rate_percent: string;
  is_remaining: boolean;
}

interface ClaimRow {
  id: string;
  claim_number: string;
  claim_title: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  claim_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  percent_complete: number | null;
  claim_amount: number | null;
  paid_amount: number | null;
  retention_method?: RetentionMethod | null;
  retention_scale_bands?: RetentionScaleBand[] | null;
  retention_percent: number | null;
  retention_withheld_amount: number | null;
  retention_released_amount: number | null;
  retention_held_to_date: number | null;
  retention_released_to_date: number | null;
  retention_balance: number | null;
  net_claim_excl_gst: number | null;
  gst_amount: number | null;
  total_payable: number | null;
  linked_quote_value: number | null;
  linked_approved_variations: number | null;
  previous_claims_total: number | null;
  revised_contract_value: number | null;
  notes: string | null;
  updated_at: string;
}

interface CreateClaimDraftRow {
  id: string;
  claim_number: string;
  claim_title: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  claim_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  percent_complete: number | null;
  paid_amount: number | null;
  retention_method?: RetentionMethod | null;
  retention_scale_bands?: RetentionScaleBand[] | null;
  retention_percent: number | null;
  retention_withheld_amount: number | null;
  retention_released_amount: number | null;
  retention_held_to_date: number | null;
  retention_released_to_date: number | null;
  retention_balance: number | null;
  net_claim_excl_gst: number | null;
  gst_amount: number | null;
  total_payable: number | null;
  linked_quote_value?: number | null;
  linked_approved_variations?: number | null;
  previous_claims_total?: number | null;
  revised_contract_value?: number | null;
  notes: string | null;
  updated_at: string;
}

interface SaveClaimDraftRow {
  updated_at: string;
  claim_amount: number;
  linked_quote_value: number;
  linked_approved_variations: number;
  previous_claims_total: number;
  revised_contract_value: number;
  percent_complete: number;
  paid_amount: number;
  status: ClaimStatus;
  retention_percent: number;
  retention_withheld_amount: number;
  retention_released_amount: number;
  retention_held_to_date: number;
  retention_released_to_date: number;
  retention_balance: number;
  net_claim_excl_gst: number;
  gst_amount: number;
  total_payable: number;
}

interface ClaimLineItemRow {
  id: string;
  source_kind: "Quote" | "Variation";
  source_document_id: string;
  source_line_item_id: string;
  source_number: string;
  source_title: string;
  section: string;
  description: string;
  quantity: number | null;
  unit: string;
  rate: number | null;
  source_total: number | null;
  previously_claimed_amount: number | null;
  previously_claimed_percent: number | null;
  claim_percent: number | null;
  claim_amount: number | null;
  cumulative_claimed_amount: number | null;
  cumulative_claimed_percent: number | null;
  sort_order: number | null;
}

interface ClaimLineItem {
  id: string;
  sourceKind: "Quote" | "Variation";
  sourceDocumentId: string;
  sourceLineItemId: string;
  sourceNumber: string;
  sourceTitle: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  sourceTotal: number;
  previouslyClaimedAmount: number;
  previouslyClaimedPercent: number;
  claimPercent: number;
  claimAmount: number;
  cumulativeClaimedAmount: number;
  cumulativeClaimedPercent: number;
  sortOrder: number;
}

type ClaimLineIdentity = Pick<
  ClaimLineItem,
  "sourceKind" | "sourceDocumentId" | "sourceLineItemId" | "sourceNumber" | "sourceTitle" | "section" | "description" | "quantity" | "unit" | "rate" | "sourceTotal" | "sortOrder"
>;

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function numberOrZero(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateSlidingScaleRequiredRetentionToDate(
  certifiedValueToDate: number,
  bands: RetentionScaleBand[],
) {
  let requiredRetentionToDate = 0;
  let lowerBound = 0;

  bands.forEach((band) => {
    const upperBound = band.up_to == null ? null : Math.max(0, numberOrZero(band.up_to));
    const ratePercent = Math.max(0, Math.min(100, numberOrZero(band.rate_percent)));
    const coveredAmount = upperBound == null
      ? Math.max(0, certifiedValueToDate - lowerBound)
      : Math.max(0, Math.min(certifiedValueToDate, upperBound) - lowerBound);

    requiredRetentionToDate += coveredAmount * (ratePercent / 100);

    if (upperBound != null) {
      lowerBound = Math.max(lowerBound, upperBound);
    }
  });

  return roundMoney(requiredRetentionToDate);
}

function normalizeRetentionScaleBandsForCompare(bands: RetentionScaleBand[]) {
  return bands.map((band) => ({
    up_to: band.up_to == null ? null : Number(Math.max(0, numberOrZero(band.up_to)).toFixed(2)),
    rate_percent: Number(Math.max(0, Math.min(100, numberOrZero(band.rate_percent))).toFixed(3)),
  }));
}

function toDraftNumericString(value: number, maximumFractionDigits = 3) {
  const rounded = Number(value.toFixed(maximumFractionDigits));
  return rounded.toString();
}

function deriveRetentionScaleBandDraftRows(bands: RetentionScaleBand[]): RetentionScaleBandDraftRow[] {
  let previousUpperBound = 0;

  return bands.map((band, index) => {
    const isFinalBand = index === bands.length - 1;
    const isRemainingBand = isFinalBand && band.up_to == null;
    const resolvedUpperBound = band.up_to == null ? null : Math.max(0, numberOrZero(band.up_to));
    const amount = isRemainingBand || resolvedUpperBound == null
      ? ""
      : toDraftNumericString(Math.max(0, resolvedUpperBound - previousUpperBound), 2);

    if (resolvedUpperBound != null) {
      previousUpperBound = resolvedUpperBound;
    }

    return {
      id: band.id ?? `tier-${index + 1}`,
      amount,
      rate_percent: toDraftNumericString(Math.max(0, Math.min(100, numberOrZero(band.rate_percent)))),
      is_remaining: isRemainingBand,
    };
  });
}

function convertRetentionScaleBandDraftRowsToCanonical(rows: RetentionScaleBandDraftRow[]): RetentionScaleBand[] {
  let cumulativeUpperBound = 0;

  return rows.map((row, index) => {
    const isFinalRow = index === rows.length - 1;
    const isRemainingRow = isFinalRow && row.is_remaining;
    const amount = Math.max(0, numberOrZero(row.amount));
    const nextUpTo = isRemainingRow ? null : cumulativeUpperBound + amount;

    if (nextUpTo != null) {
      cumulativeUpperBound = nextUpTo;
    }

    return {
      id: row.id,
      up_to: nextUpTo == null ? null : Number(nextUpTo.toFixed(2)),
      rate_percent: row.rate_percent,
    };
  });
}

function createRetentionScaleBand(upTo: number | null, ratePercent: number): RetentionScaleBand {
  return {
    id: crypto.randomUUID(),
    up_to: upTo,
    rate_percent: ratePercent,
  };
}

function createDefaultRetentionScaleBand(previousUpperBound: number, ratePercent: number): RetentionScaleBand {
  return createRetentionScaleBand(previousUpperBound + 100000, ratePercent);
}

function calculateVariationPreGstTotal(row: Record<string, unknown>) {
  const subtotal = numberOrZero(row.subtotal);
  const marginPercent = numberOrZero(row.margin_percent);
  const discountAmount = numberOrZero(row.discount_amount);
  const contingencyAmount = numberOrZero(row.contingency_amount);
  const marginAmount = subtotal * (marginPercent / 100);
  return Math.max(0, subtotal + marginAmount + contingencyAmount - discountAmount);
}

function calculateQuotePreGstTotal(row: Record<string, unknown>) {
  const subtotal = numberOrZero(row.subtotal);
  const marginPercent = numberOrZero(row.margin_percent);
  const discountAmount = numberOrZero(row.discount_amount);
  const contingencyAmount = numberOrZero(row.contingency_amount);
  const marginAmount = subtotal * (marginPercent / 100);
  return Math.max(0, subtotal + marginAmount + contingencyAmount - discountAmount);
}

function getClaimLineSourceKey(row: Pick<ClaimLineItem, "sourceKind" | "sourceLineItemId">) {
  return `${row.sourceKind}:${row.sourceLineItemId}`;
}

function getVariationLineMatchSignature(row: Pick<ClaimLineItem, "sourceDocumentId" | "section" | "description" | "quantity" | "unit" | "rate" | "sourceTotal">) {
  return [
    row.sourceDocumentId,
    row.section.trim(),
    row.description.trim(),
    numberOrZero(row.quantity).toFixed(6),
    row.unit.trim(),
    numberOrZero(row.rate).toFixed(6),
    numberOrZero(row.sourceTotal).toFixed(6),
  ].join("::");
}

function applyCanonicalClaimLineIdentity(row: ClaimLineItem, canonical: ClaimLineIdentity): ClaimLineItem {
  return {
    ...row,
    sourceKind: canonical.sourceKind,
    sourceDocumentId: canonical.sourceDocumentId,
    sourceLineItemId: canonical.sourceLineItemId,
    sourceNumber: canonical.sourceNumber,
    sourceTitle: canonical.sourceTitle,
    section: canonical.section,
    description: canonical.description,
    quantity: canonical.quantity,
    unit: canonical.unit,
    rate: canonical.rate,
    sourceTotal: canonical.sourceTotal,
    sortOrder: canonical.sortOrder,
  };
}

const RETENTION_PRESET_OPTIONS = [0, 2.5, 5, 10] as const;
const retentionInputClass = "font-[family-name:var(--font-ibm-plex-sans)] h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]";
const retentionLabelClass = "font-[family-name:var(--font-ibm-plex-sans)] mb-1 block text-[13px] font-semibold text-[#1d2433]";
const retentionChoiceButtonClass = "inline-flex h-[2.75rem] rounded-[0.6rem] border px-3.5 text-left text-[13px] font-medium transition";

function normalizeClaimRowsAgainstLiveSource(rows: ClaimLineItem[], liveSourceRows: ClaimLineItem[]) {
  const liveRowsByKey = new Map(liveSourceRows.map((row) => [getClaimLineSourceKey(row), row]));
  const liveVariationRowsBySignature = new Map<string, ClaimLineItem[]>();

  liveSourceRows.forEach((row) => {
    if (row.sourceKind !== "Variation") {
      return;
    }
    const signature = getVariationLineMatchSignature(row);
    const existing = liveVariationRowsBySignature.get(signature) ?? [];
    existing.push(row);
    liveVariationRowsBySignature.set(signature, existing);
  });

  const normalizedRowsByKey = new Map<string, ClaimLineItem>();

  rows.forEach((row) => {
    const directMatch = liveRowsByKey.get(getClaimLineSourceKey(row));
    let canonical = directMatch;

    if (!canonical && row.sourceKind === "Variation") {
      const signatureMatches = liveVariationRowsBySignature.get(getVariationLineMatchSignature(row)) ?? [];
      if (signatureMatches.length === 1) {
        canonical = signatureMatches[0];
      }
    }

    if (!canonical) {
      return;
    }

    const normalizedRow = applyCanonicalClaimLineIdentity(row, canonical);
    const normalizedKey = getClaimLineSourceKey(normalizedRow);
    const existing = normalizedRowsByKey.get(normalizedKey);

    if (!existing) {
      normalizedRowsByKey.set(normalizedKey, normalizedRow);
      return;
    }

    const shouldReplace =
      normalizedRow.claimPercent > existing.claimPercent
      || normalizedRow.claimAmount > existing.claimAmount
      || normalizedRow.previouslyClaimedAmount > existing.previouslyClaimedAmount;

    if (shouldReplace) {
      normalizedRowsByKey.set(normalizedKey, normalizedRow);
    }
  });

  return Array.from(normalizedRowsByKey.values());
}

function toDayMonthYearLabel(value: string | null) {
  if (!value) {
    return "—";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toMonthDayLabel(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString("en-NZ", {
    month: "long",
    day: "numeric",
  });
}

function toPeriodRangeLabel(start: string | null, end: string | null) {
  if (!start && !end) {
    return "—";
  }

  const startDate = start ? new Date(`${start}T00:00:00`) : null;
  const endDate = end ? new Date(`${end}T00:00:00`) : null;
  const startValid = startDate && !Number.isNaN(startDate.getTime());
  const endValid = endDate && !Number.isNaN(endDate.getTime());

  if (!startValid || !endValid) {
    const fallbackStart = toDayMonthYearLabel(start);
    const fallbackEnd = toDayMonthYearLabel(end);
    if (fallbackStart === "—") {
      return fallbackEnd;
    }
    if (fallbackEnd === "—") {
      return fallbackStart;
    }
    return `${fallbackStart} - ${fallbackEnd}`;
  }

  if (
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()
  ) {
    return `${startDate.toLocaleDateString("en-NZ", { month: "long" })} ${startDate.getDate()} - ${endDate.getDate()}`;
  }

  return `${toMonthDayLabel(start)} - ${toMonthDayLabel(end)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function claimStatusClassName(status: ClaimStatus) {
  switch (status) {
    case "Paid":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "Overdue":
      return "border-rose-200 bg-rose-100 text-rose-800";
    case "Submitted":
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "Unpaid":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "Cancelled":
      return "border-slate-300 bg-slate-200 text-slate-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export default function ProjectClaimDetailPage() {
  const params = useParams<{ projectId: string; claimId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeClaimId = params?.claimId;
  const isNewRoute = routeClaimId === "new";
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [organizationBrandPrimaryColor, setOrganizationBrandPrimaryColor] = useState("");
  const [organizationBusinessNumber, setOrganizationBusinessNumber] = useState("");
  const [organizationBankAccountDetails, setOrganizationBankAccountDetails] = useState("");
  const [organizationGstNumber, setOrganizationGstNumber] = useState("");
  const [organizationContactName, setOrganizationContactName] = useState("");
  const [organizationContactEmail, setOrganizationContactEmail] = useState("");
  const [organizationContactPhone, setOrganizationContactPhone] = useState("");
  const [projectDbId, setProjectDbId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientContactName, setClientContactName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatingClaim, setIsCreatingClaim] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimUpdatedAt, setClaimUpdatedAt] = useState<string | null>(null);
  const [claimNumber, setClaimNumber] = useState("");
  const [claimTitle, setClaimTitle] = useState("");
  const [claimType, setClaimType] = useState<ClaimType>("Progress");
  const [status, setStatus] = useState<ClaimStatus>("Draft");
  const [claimDate, setClaimDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");
  const [retentionMethod, setRetentionMethod] = useState<RetentionMethod>("flat");
  const [retentionScaleBands, setRetentionScaleBands] = useState<RetentionScaleBand[]>([]);
  const [retentionScaleBandDraftRows, setRetentionScaleBandDraftRows] = useState<RetentionScaleBandDraftRow[]>([]);
  const [retentionPercent, setRetentionPercent] = useState("0");
  const [retentionReleasedAmount, setRetentionReleasedAmount] = useState("0");
  const [isRetentionSelectorOpen, setIsRetentionSelectorOpen] = useState(false);
  const [isRetentionCustomMode, setIsRetentionCustomMode] = useState(false);
  const [notes, setNotes] = useState("");
  const [claimLineItems, setClaimLineItems] = useState<ClaimLineItem[]>([]);
  const [isLineItemsOpen, setIsLineItemsOpen] = useState(true);
  const [isLineItemsExpanded, setIsLineItemsExpanded] = useState(false);

  const [baseQuoteValue, setBaseQuoteValue] = useState(0);
  const [approvedVariationsValue, setApprovedVariationsValue] = useState(0);
  const [previousClaimsTotal, setPreviousClaimsTotal] = useState(0);
  const [paidToDateTotal, setPaidToDateTotal] = useState(0);
  const [previousRetentionHeldTotal, setPreviousRetentionHeldTotal] = useState(0);
  const [previousRetentionReleasedTotal, setPreviousRetentionReleasedTotal] = useState(0);
  const [snapshotClaimAmount, setSnapshotClaimAmount] = useState<number | null>(null);
  const [snapshotLinkedQuoteValue, setSnapshotLinkedQuoteValue] = useState<number | null>(null);
  const [snapshotLinkedApprovedVariations, setSnapshotLinkedApprovedVariations] = useState<number | null>(null);
  const [snapshotPreviousClaimsTotal, setSnapshotPreviousClaimsTotal] = useState<number | null>(null);
  const [snapshotRevisedContractValue, setSnapshotRevisedContractValue] = useState<number | null>(null);
  const [snapshotPercentComplete, setSnapshotPercentComplete] = useState<number | null>(null);
  const [snapshotRetentionMethod, setSnapshotRetentionMethod] = useState<RetentionMethod>("flat");
  const [snapshotRetentionScaleBands, setSnapshotRetentionScaleBands] = useState<RetentionScaleBand[]>([]);
  const [snapshotRetentionPercent, setSnapshotRetentionPercent] = useState<number | null>(null);
  const [snapshotRetentionWithheldAmount, setSnapshotRetentionWithheldAmount] = useState<number | null>(null);
  const [snapshotRetentionReleasedAmount, setSnapshotRetentionReleasedAmount] = useState<number | null>(null);
  const [snapshotRetentionHeldToDate, setSnapshotRetentionHeldToDate] = useState<number | null>(null);
  const [snapshotRetentionReleasedToDate, setSnapshotRetentionReleasedToDate] = useState<number | null>(null);
  const [snapshotRetentionBalance, setSnapshotRetentionBalance] = useState<number | null>(null);
  const [snapshotNetClaimExclGst, setSnapshotNetClaimExclGst] = useState<number | null>(null);
  const [snapshotGstAmount, setSnapshotGstAmount] = useState<number | null>(null);
  const [snapshotTotalPayable, setSnapshotTotalPayable] = useState<number | null>(null);
  const hasAutoCreatedOnNewRoute = useRef(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const applyClaimRow = useCallback((claim: ClaimRow | CreateClaimDraftRow) => {
    setClaimId(claim.id);
    setClaimUpdatedAt(claim.updated_at ?? null);
    setClaimNumber(claim.claim_number ?? "");
    setClaimTitle(claim.claim_title ?? "");
    setClaimType((claim.claim_type ?? "Progress") as ClaimType);
    setStatus((claim.status ?? "Draft") as ClaimStatus);
    setClaimDate(claim.claim_date ?? "");
    setDueDate(claim.due_date ?? "");
    setPeriodStart(claim.period_start ?? "");
    setPeriodEnd(claim.period_end ?? "");
    setPaidAmount(String(claim.paid_amount ?? 0));
    setRetentionMethod(claim.retention_method === "sliding_scale" ? "sliding_scale" : "flat");
    const hydratedRetentionScaleBands = Array.isArray(claim.retention_scale_bands) ? claim.retention_scale_bands : [];
    setRetentionScaleBands(hydratedRetentionScaleBands);
    setRetentionScaleBandDraftRows(deriveRetentionScaleBandDraftRows(hydratedRetentionScaleBands));
    setRetentionPercent(String(claim.retention_percent ?? 0));
    setRetentionReleasedAmount(String(claim.retention_released_amount ?? 0));
    setSnapshotClaimAmount(Number(claim.claim_amount ?? 0));
    setSnapshotLinkedQuoteValue(claim.linked_quote_value == null ? null : Number(claim.linked_quote_value));
    setSnapshotLinkedApprovedVariations(claim.linked_approved_variations == null ? null : Number(claim.linked_approved_variations));
    setSnapshotPreviousClaimsTotal(claim.previous_claims_total == null ? null : Number(claim.previous_claims_total));
    setSnapshotRevisedContractValue(claim.revised_contract_value == null ? null : Number(claim.revised_contract_value));
    setSnapshotPercentComplete(Number(claim.percent_complete ?? 0));
    setSnapshotRetentionMethod(claim.retention_method === "sliding_scale" ? "sliding_scale" : "flat");
    setSnapshotRetentionScaleBands(
      normalizeRetentionScaleBandsForCompare(Array.isArray(claim.retention_scale_bands) ? claim.retention_scale_bands : []),
    );
    setSnapshotRetentionPercent(Number(claim.retention_percent ?? 0));
    setSnapshotRetentionWithheldAmount(Number(claim.retention_withheld_amount ?? 0));
    setSnapshotRetentionReleasedAmount(Number(claim.retention_released_amount ?? 0));
    setSnapshotRetentionHeldToDate(Number(claim.retention_held_to_date ?? 0));
    setSnapshotRetentionReleasedToDate(Number(claim.retention_released_to_date ?? 0));
    setSnapshotRetentionBalance(Number(claim.retention_balance ?? 0));
    setSnapshotNetClaimExclGst(Number(claim.net_claim_excl_gst ?? 0));
    setSnapshotGstAmount(Number(claim.gst_amount ?? 0));
    setSnapshotTotalPayable(Number(claim.total_payable ?? 0));
    setNotes(claim.notes ?? "");
  }, []);

  const loadClaimSourceRows = useCallback(async (resolvedOrganizationId: string, applyToState = true): Promise<ClaimLineItem[]> => {
    if (!supabase) {
      return [];
    }

      const { data: quoteRows } = await supabase
        .from("project_quotes")
        .select("id, quote_number, quote_title, status, updated_at")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", projectDbId)
        .order("updated_at", { ascending: false });

      const baseQuote = (quoteRows ?? []).sort((left, right) => {
        const leftRank = left.status === "Accepted" ? 0 : left.status === "Sent" ? 1 : 2;
        const rightRank = right.status === "Accepted" ? 0 : right.status === "Sent" ? 1 : 2;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return 0;
      })[0];

      const quoteLineItems = baseQuote
        ? await supabase
            .from("project_quote_line_items")
            .select("id, section, description, quantity, unit, rate, total, sort_order")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectDbId)
            .eq("quote_id", baseQuote.id)
            .eq("is_optional", false)
            .order("sort_order", { ascending: true })
        : { data: [] as Array<Record<string, unknown>> };

      const { data: variationRows } = await supabase
        .from("project_variations")
        .select("id, variation_number, variation_title, subtotal, margin_percent, discount_amount, contingency_amount, created_at")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", projectDbId)
        .eq("status", "Approved")
        .order("created_at", { ascending: true });

      const quoteMapped: ClaimLineItem[] = ((quoteLineItems.data ?? []) as Array<Record<string, unknown>>).map((row, index) => ({
        id: `quote-${String(row.id ?? crypto.randomUUID())}`,
        sourceKind: "Quote",
        sourceDocumentId: String(baseQuote?.id ?? ""),
        sourceLineItemId: String(row.id ?? ""),
        sourceNumber: String(baseQuote?.quote_number ?? ""),
        sourceTitle: String(baseQuote?.quote_title ?? "Quote"),
        section: String(row.section ?? ""),
        description: String(row.description ?? ""),
        quantity: numberOrZero(row.quantity),
        unit: String(row.unit ?? ""),
        rate: numberOrZero(row.rate),
        sourceTotal: numberOrZero(row.total) || numberOrZero(row.quantity) * numberOrZero(row.rate),
        previouslyClaimedAmount: 0,
        previouslyClaimedPercent: 0,
        claimPercent: 0,
        claimAmount: 0,
        cumulativeClaimedAmount: 0,
        cumulativeClaimedPercent: 0,
        sortOrder: numberOrZero(row.sort_order) || index,
      }));

      const variationMapped: ClaimLineItem[] = ((variationRows ?? []) as Array<Record<string, unknown>>).map((row, index) => {
        const variationId = String(row.id ?? "");
        const preGstTotal = calculateVariationPreGstTotal(row);
        const variationTitle = String(row.variation_title ?? "Variation");
        return {
          id: `variation-${variationId || crypto.randomUUID()}`,
          sourceKind: "Variation",
          sourceDocumentId: variationId,
          sourceLineItemId: variationId,
          sourceNumber: String(row.variation_number ?? ""),
          sourceTitle: variationTitle,
          section: "Item",
          description: variationTitle,
          quantity: 1,
          unit: "Item",
          rate: preGstTotal,
          sourceTotal: preGstTotal,
          previouslyClaimedAmount: 0,
          previouslyClaimedPercent: 0,
          claimPercent: 0,
          claimAmount: 0,
          cumulativeClaimedAmount: 0,
          cumulativeClaimedPercent: 0,
          sortOrder: 100000 + index,
        };
      });

      const sourceRows = [...quoteMapped, ...variationMapped];
      if (applyToState) {
        setClaimLineItems(sourceRows);
      }
      return sourceRows;
  }, [projectDbId, supabase]);

  const loadClaimLineItems = useCallback(async (resolvedOrganizationId: string, resolvedClaimId: string) => {
    if (!supabase) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claimLineItemsTable = (supabase as any).from("project_claim_line_items");
    const { data, error: lineItemsError } = await claimLineItemsTable
      .select("id, source_kind, source_document_id, source_line_item_id, source_number, source_title, section, description, quantity, unit, rate, source_total, previously_claimed_amount, previously_claimed_percent, claim_percent, claim_amount, cumulative_claimed_amount, cumulative_claimed_percent, sort_order")
      .eq("organization_id", resolvedOrganizationId)
      .eq("claim_id", resolvedClaimId)
      .order("sort_order", { ascending: true });

    if (lineItemsError) {
      await loadClaimSourceRows(resolvedOrganizationId, true);
      return;
    }

    const nextRows = ((data ?? []) as ClaimLineItemRow[]).map((row) => ({
      id: row.id,
      sourceKind: row.source_kind,
      sourceDocumentId: row.source_document_id,
      sourceLineItemId: row.source_line_item_id,
      sourceNumber: row.source_number ?? "",
      sourceTitle: row.source_title ?? "",
      section: row.section ?? "",
      description: row.description ?? "",
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "",
      rate: Number(row.rate ?? 0),
      sourceTotal: Number(row.source_total ?? 0),
      previouslyClaimedAmount: Number(row.previously_claimed_amount ?? 0),
      previouslyClaimedPercent: Number(row.previously_claimed_percent ?? 0),
      claimPercent: Number(row.claim_percent ?? 0),
      claimAmount: Number(row.claim_amount ?? 0),
      cumulativeClaimedAmount: Number(row.cumulative_claimed_amount ?? 0),
      cumulativeClaimedPercent: Number(row.cumulative_claimed_percent ?? 0),
      sortOrder: Number(row.sort_order ?? 0),
    }));

    if (nextRows.length === 0) {
      await loadClaimSourceRows(resolvedOrganizationId, true);
      return;
    }

    const liveSourceRows = await loadClaimSourceRows(resolvedOrganizationId, false);
    const normalizedExistingRows = normalizeClaimRowsAgainstLiveSource(nextRows, liveSourceRows);
    const existingSourceKeys = new Set(normalizedExistingRows.map((row) => getClaimLineSourceKey(row)));
    const missingRows = liveSourceRows.filter(
      (row) => !existingSourceKeys.has(getClaimLineSourceKey(row))
    );
    const mergedRows = [...normalizedExistingRows, ...missingRows].sort((left, right) => left.sortOrder - right.sortOrder);
    setClaimLineItems(mergedRows);
  }, [loadClaimSourceRows, supabase]);

  const refreshContractSummary = useCallback(async (resolvedOrganizationId: string, resolvedProjectId: string, existingClaimId: string | null) => {
    if (!supabase) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claimsTable = (supabase as any).from("project_claims");
    const [{ data: quoteRows }, { data: variationRows }, { data: claimsRowsRaw }] = await Promise.all([
      supabase
        .from("project_quotes")
        .select("status, subtotal, margin_percent, discount_amount, contingency_amount, updated_at")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", resolvedProjectId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("project_variations")
        .select("status, subtotal, margin_percent, discount_amount, contingency_amount")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", resolvedProjectId),
      claimsTable
        .select("id, claim_amount, paid_amount, retention_withheld_amount, retention_released_amount, status")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", resolvedProjectId),
    ]);

    const bestQuote = (quoteRows ?? []).sort((left, right) => {
      const leftRank = left.status === "Accepted" ? 0 : left.status === "Sent" ? 1 : 2;
      const rightRank = right.status === "Accepted" ? 0 : right.status === "Sent" ? 1 : 2;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return 0;
    })[0];

    const quoteValue = bestQuote ? calculateQuotePreGstTotal(bestQuote as Record<string, unknown>) : 0;
    const approvedVariations = (variationRows ?? [])
      .filter((row) => row.status === "Approved")
      .reduce((sum, row) => sum + calculateVariationPreGstTotal(row as Record<string, unknown>), 0);

    const claimRows = (claimsRowsRaw ?? []) as Array<{
      id: string;
      claim_amount: number | null;
      paid_amount: number | null;
      retention_withheld_amount: number | null;
      retention_released_amount: number | null;
      status: ClaimStatus;
    }>;
    const previousTotal = claimRows
      .filter((row) => row.id !== existingClaimId && row.status !== "Cancelled")
      .reduce((sum, row) => sum + Number(row.claim_amount ?? 0), 0);
    const paidToDate = claimRows
      .filter((row) => row.status !== "Cancelled")
      .reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0);
    const previousRetentionHeld = claimRows
      .filter((row) => row.id !== existingClaimId && row.status !== "Cancelled")
      .reduce((sum, row) => sum + Number(row.retention_withheld_amount ?? 0), 0);
    const previousRetentionReleased = claimRows
      .filter((row) => row.id !== existingClaimId && row.status !== "Cancelled")
      .reduce((sum, row) => sum + Number(row.retention_released_amount ?? 0), 0);

    setBaseQuoteValue(quoteValue);
    setApprovedVariationsValue(approvedVariations);
    setPreviousClaimsTotal(previousTotal);
    setPaidToDateTotal(paidToDate);
    setPreviousRetentionHeldTotal(previousRetentionHeld);
    setPreviousRetentionReleasedTotal(previousRetentionReleased);
  }, [supabase]);

  const createClaim = useCallback(async () => {
    if (isCreatingClaim || !supabase || !organizationId || !projectDbId) {
      return;
    }

    setIsCreatingClaim(true);
    setError(null);
    setSaveMessage(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: createError } = await (supabase as any).rpc("create_project_claim_draft", {
        p_organization_id: organizationId,
        p_project_id: projectDbId,
        p_title: "New Claim",
      });

      if (createError) {
        throw new Error(createError.message);
      }

      const createdRow = Array.isArray(data) ? (data[0] as CreateClaimDraftRow | undefined) : undefined;
      if (!createdRow?.id) {
        throw new Error("Claim draft was created but no identifier was returned.");
      }

      applyClaimRow(createdRow);
      await loadClaimLineItems(organizationId, createdRow.id);
      await refreshContractSummary(organizationId, projectDbId, createdRow.id);
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/claims/${createdRow.id}`);
    } catch (createClaimError) {
      setError(createClaimError instanceof Error ? createClaimError.message : "Unable to create claim.");
    } finally {
      setIsCreatingClaim(false);
    }
  }, [applyClaimRow, isCreatingClaim, loadClaimLineItems, organizationId, projectDbId, refreshContractSummary, routeProjectSlug, router, supabase]);

  useEffect(() => {
    if (!supabase || !routeProjectSlug || !userId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setSaveMessage(null);

      try {
        let resolvedOrganizationId = sessionOrganizationId;
        if (!resolvedOrganizationId) {
          const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
          resolvedOrganizationId = ensuredOrganizationId ?? null;
        }
        if (!resolvedOrganizationId) {
          throw new Error("Could not resolve your organization.");
        }
        if (!cancelled) {
          setOrganizationId(resolvedOrganizationId);
        }

        const { data: organizationRow } = await supabase
          .from("organizations")
          .select("name, logo_path, brand_primary_color, business_number, bank_account_details, gst_number, contact_name, contact_email, contact_phone")
          .eq("id", resolvedOrganizationId)
          .maybeSingle();
        if (!cancelled) {
          setOrganizationName(organizationRow?.name ?? "");
          setOrganizationBrandPrimaryColor((organizationRow?.brand_primary_color ?? "").trim());
          setOrganizationBusinessNumber((organizationRow?.business_number ?? "").trim());
          setOrganizationBankAccountDetails((organizationRow?.bank_account_details ?? "").trim());
          setOrganizationGstNumber((organizationRow?.gst_number ?? "").trim());
          setOrganizationContactName((organizationRow?.contact_name ?? "").trim());
          setOrganizationContactEmail((organizationRow?.contact_email ?? "").trim());
          setOrganizationContactPhone((organizationRow?.contact_phone ?? "").trim());
          if (organizationRow?.logo_path) {
            const { data: logoUrlData } = supabase.storage.from("organization-logos").getPublicUrl(organizationRow.logo_path);
            setOrganizationLogoUrl(logoUrlData.publicUrl);
          } else {
            setOrganizationLogoUrl(null);
          }
        }

        const { data: projectRow, error: projectError } = await supabase
          .from("organization_projects")
          .select("id, name, client_id, location")
          .eq("organization_id", resolvedOrganizationId)
          .eq("slug", routeProjectSlug)
          .maybeSingle();
        if (projectError || !projectRow?.id) {
          throw new Error(projectError?.message ?? "Project not found.");
        }
        if (!cancelled) {
          setProjectDbId(projectRow.id);
          setProjectName(projectRow.name ?? "");
          setProjectLocation(projectRow.location ?? "");
          setClientCompanyName("");
          setClientContactName("");
        }

        if (projectRow.client_id) {
          const { data: clientRow } = await supabase
            .from("organization_clients")
            .select("name, company_name")
            .eq("organization_id", resolvedOrganizationId)
            .eq("id", projectRow.client_id)
            .maybeSingle();
          if (!cancelled) {
            const resolvedContactName = (clientRow?.name ?? "").trim();
            setClientCompanyName((clientRow?.company_name ?? "").trim() || resolvedContactName);
            setClientContactName(resolvedContactName);
          }
        }

        if (!isNewRoute) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const claimsTable = (supabase as any).from("project_claims");
          const { data: claimRowRaw, error: claimError } = await claimsTable
            .select("id, claim_number, claim_title, claim_type, status, claim_date, due_date, period_start, period_end, percent_complete, claim_amount, paid_amount, retention_method, retention_scale_bands, retention_percent, retention_withheld_amount, retention_released_amount, retention_held_to_date, retention_released_to_date, retention_balance, net_claim_excl_gst, gst_amount, total_payable, linked_quote_value, linked_approved_variations, previous_claims_total, revised_contract_value, notes, updated_at")
            .eq("organization_id", resolvedOrganizationId)
            .eq("id", routeClaimId)
            .maybeSingle();
          if (claimError || !claimRowRaw) {
            throw new Error(claimError?.message ?? "Claim not found.");
          }
          if (!cancelled) {
            applyClaimRow(claimRowRaw as ClaimRow);
            await loadClaimLineItems(resolvedOrganizationId, routeClaimId);
          }
        } else if (!cancelled) {
          setClaimId(null);
          setClaimUpdatedAt(null);
          setClaimLineItems([]);
        }

        if (!cancelled) {
          await refreshContractSummary(resolvedOrganizationId, projectRow.id, isNewRoute ? null : routeClaimId);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load claim.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [applyClaimRow, isNewRoute, loadClaimLineItems, refreshContractSummary, routeClaimId, routeProjectSlug, sessionOrganizationId, supabase, userId]);

  useEffect(() => {
    if (!isNewRoute) {
      hasAutoCreatedOnNewRoute.current = false;
      return;
    }

    if (isLoading || !organizationId || !projectDbId || hasAutoCreatedOnNewRoute.current) {
      return;
    }

    hasAutoCreatedOnNewRoute.current = true;
    void createClaim();
  }, [createClaim, isLoading, isNewRoute, organizationId, projectDbId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const isRefreshShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r";
      if (!isRefreshShortcut) {
        return;
      }
      event.preventDefault();
      window.location.reload();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const claimLineItemsComputed = useMemo(() => {
    return claimLineItems.map((item) => {
      const previousAmount = Math.max(0, numberOrZero(item.previouslyClaimedAmount));
      const sourceTotal = Math.max(0, numberOrZero(item.sourceTotal));
      const remainingAmount = Math.max(0, sourceTotal - previousAmount);
      const claimPercent = Math.min(100, Math.max(0, numberOrZero(item.claimPercent)));
      const claimAmount = remainingAmount * (claimPercent / 100);
      const cumulativeAmount = previousAmount + claimAmount;
      const previousPercent = sourceTotal > 0 ? (previousAmount / sourceTotal) * 100 : 0;
      const cumulativePercent = sourceTotal > 0 ? (cumulativeAmount / sourceTotal) * 100 : 0;

      return {
        ...item,
        sourceTotal,
        previouslyClaimedAmount: previousAmount,
        previouslyClaimedPercent: previousPercent,
        claimPercent,
        claimAmount,
        cumulativeClaimedAmount: cumulativeAmount,
        cumulativeClaimedPercent: Math.min(100, cumulativePercent),
      };
    });
  }, [claimLineItems]);

  const currentClaimAmount = useMemo(
    () => claimLineItemsComputed.reduce((sum, item) => sum + item.claimAmount, 0),
    [claimLineItemsComputed],
  );
  const claimGstRate = 0.15;
  const retentionPercentNumber = Math.min(100, Math.max(0, numberOrZero(retentionPercent)));
  const retentionReleasedAmountNumber = Math.max(0, numberOrZero(retentionReleasedAmount));
  const hasCustomRetentionPercent = !RETENTION_PRESET_OPTIONS.some((option) => Math.abs(retentionPercentNumber - option) < 0.001);
  const retentionPercentDisplay = retentionPercent.trim() === "" ? "0" : retentionPercent.trim();
  const retentionSelectorDisplay = retentionMethod === "sliding_scale" ? "Sliding Scale" : retentionPercentDisplay;
  const effectiveRetentionScaleBands = useMemo(
    () => (
      retentionMethod === "sliding_scale" && isRetentionSelectorOpen
        ? convertRetentionScaleBandDraftRowsToCanonical(retentionScaleBandDraftRows)
        : retentionScaleBands
    ),
    [isRetentionSelectorOpen, retentionMethod, retentionScaleBandDraftRows, retentionScaleBands],
  );
  const normalizedRetentionScaleBandsForCompare = useMemo(
    () => normalizeRetentionScaleBandsForCompare(effectiveRetentionScaleBands),
    [effectiveRetentionScaleBands],
  );
  const retentionScaleBandsDirty =
    JSON.stringify(normalizedRetentionScaleBandsForCompare) !== JSON.stringify(snapshotRetentionScaleBands);
  const currentClaimGrossExclGst = roundMoney(currentClaimAmount);
  const revisedContractValue = baseQuoteValue + approvedVariationsValue;
  const valueEarnedToDate = previousClaimsTotal + currentClaimGrossExclGst;
  const parsedPercentComplete = revisedContractValue > 0 ? Math.min(100, Math.max(0, (valueEarnedToDate / revisedContractValue) * 100)) : 0;
  const paidAmountNumber = Number(paidAmount || 0);
  const isSubmittedLocked = status === "Submitted";
  const isRetentionLocked = status !== "Draft";
  const summaryOriginalContract = snapshotLinkedQuoteValue ?? baseQuoteValue;
  const summaryApprovedVariations = snapshotLinkedApprovedVariations ?? approvedVariationsValue;
  const summaryRevisedContractValue = snapshotRevisedContractValue ?? revisedContractValue;
  const summaryPreviousClaimsTotal = snapshotPreviousClaimsTotal ?? previousClaimsTotal;
  const shouldPreferLiveCurrentClaimGross =
    numberOrZero(snapshotClaimAmount) === 0 && currentClaimGrossExclGst > 0;
  const summaryGrossCurrentClaim = shouldPreferLiveCurrentClaimGross
    ? currentClaimGrossExclGst
    : (snapshotClaimAmount ?? currentClaimGrossExclGst);
  const summaryPercentComplete = snapshotPercentComplete ?? parsedPercentComplete;
  const summaryPreviousPercentComplete = summaryRevisedContractValue > 0 ? (summaryPreviousClaimsTotal / summaryRevisedContractValue) * 100 : 0;
  const summaryThisClaimPercent = summaryRevisedContractValue > 0 ? (summaryGrossCurrentClaim / summaryRevisedContractValue) * 100 : 0;
  const summaryValueEarnedToDate = summaryPreviousClaimsTotal + summaryGrossCurrentClaim;
  const isRetentionDirty =
    retentionMethod !== snapshotRetentionMethod
    || retentionScaleBandsDirty
    || retentionPercentNumber !== numberOrZero(snapshotRetentionPercent)
    || retentionReleasedAmountNumber !== numberOrZero(snapshotRetentionReleasedAmount);
  const certifiedValueToDate = summaryPreviousClaimsTotal + summaryGrossCurrentClaim;
  const requiredRetentionToDate = retentionMethod === "flat"
    ? roundMoney(certifiedValueToDate * (retentionPercentNumber / 100))
    : calculateSlidingScaleRequiredRetentionToDate(certifiedValueToDate, effectiveRetentionScaleBands);
  const priorRetentionBalance = roundMoney(previousRetentionHeldTotal - previousRetentionReleasedTotal);
  const previewRetentionWithheld = roundMoney(
    Math.max(0, requiredRetentionToDate - priorRetentionBalance),
  );
  const previewRetentionHeldToDate = roundMoney(previousRetentionHeldTotal + previewRetentionWithheld);
  const previewRetentionReleasedToDate = roundMoney(previousRetentionReleasedTotal + retentionReleasedAmountNumber);
  const previewRetentionBalance = roundMoney(previewRetentionHeldToDate - previewRetentionReleasedToDate);
  const previewNet = roundMoney(summaryGrossCurrentClaim - previewRetentionWithheld + retentionReleasedAmountNumber);
  const previewGst = roundMoney(previewNet * claimGstRate);
  const previewTotal = roundMoney(previewNet + previewGst);
  const shouldUseLiveClaimPreview = isRetentionDirty || shouldPreferLiveCurrentClaimGross;
  const summaryRetentionPercent = isRetentionDirty
    ? retentionPercentNumber
    : (snapshotRetentionPercent ?? retentionPercentNumber);
  const summaryRetentionWithheldAmount = shouldUseLiveClaimPreview
    ? previewRetentionWithheld
    : (snapshotRetentionWithheldAmount ?? 0);
  const summaryRetentionReleasedAmount = shouldUseLiveClaimPreview
    ? retentionReleasedAmountNumber
    : (snapshotRetentionReleasedAmount ?? retentionReleasedAmountNumber);
  const summaryRetentionHeldToDate = shouldUseLiveClaimPreview
    ? previewRetentionHeldToDate
    : (snapshotRetentionHeldToDate ?? 0);
  const summaryRetentionReleasedToDate = shouldUseLiveClaimPreview
    ? previewRetentionReleasedToDate
    : (snapshotRetentionReleasedToDate ?? 0);
  const summaryRetentionBalance = shouldUseLiveClaimPreview
    ? previewRetentionBalance
    : (snapshotRetentionBalance ?? 0);
  const summaryNetClaimExclGst = shouldUseLiveClaimPreview
    ? previewNet
    : (snapshotNetClaimExclGst ?? summaryGrossCurrentClaim);
  const summaryGstAmount = shouldUseLiveClaimPreview
    ? previewGst
    : (snapshotGstAmount ?? 0);
  const summaryTotalPayable = shouldUseLiveClaimPreview
    ? previewTotal
    : (snapshotTotalPayable ?? summaryGrossCurrentClaim);
  const summaryBalanceOutstanding = Math.max(0, summaryValueEarnedToDate - paidToDateTotal);
  const displayedPercentComplete = summaryPercentComplete.toFixed(2);

  const handleRetentionDialogOpenChange = (nextOpen: boolean) => {
    if (isRetentionLocked && nextOpen) {
      return;
    }

    if (nextOpen) {
      setIsRetentionCustomMode(hasCustomRetentionPercent);
      if (retentionMethod === "sliding_scale") {
        const sourceBands = retentionScaleBands.length > 0
          ? retentionScaleBands
          : [createDefaultRetentionScaleBand(0, retentionPercentNumber)];
        setRetentionScaleBandDraftRows(deriveRetentionScaleBandDraftRows(sourceBands));
      }
    } else if (retentionMethod === "sliding_scale") {
      setRetentionScaleBands(convertRetentionScaleBandDraftRowsToCanonical(retentionScaleBandDraftRows));
    }

    setIsRetentionSelectorOpen(nextOpen);
  };

  const handleSelectRetentionPreset = (value: (typeof RETENTION_PRESET_OPTIONS)[number]) => {
    setRetentionPercent(String(value));
    setRetentionMethod("flat");
    setIsRetentionCustomMode(false);
    setIsRetentionSelectorOpen(false);
  };

  const handleSelectRetentionMethod = (value: RetentionMethod) => {
    setRetentionMethod(value);
    setIsRetentionCustomMode(value === "flat" ? hasCustomRetentionPercent : false);
    if (value === "sliding_scale" && retentionScaleBands.length === 0) {
      setRetentionScaleBandDraftRows(
        deriveRetentionScaleBandDraftRows([createDefaultRetentionScaleBand(0, retentionPercentNumber)]),
      );
    }
  };

  const handleAddRetentionScaleTier = () => {
    setRetentionScaleBandDraftRows((current) => {
      if (current.length === 0) {
        return deriveRetentionScaleBandDraftRows([createDefaultRetentionScaleBand(0, retentionPercentNumber)]);
      }

      const next = [...current];
      const lastIndex = next.length - 1;
      const currentLast = next[lastIndex];
      next[lastIndex] = {
        ...currentLast,
        amount: currentLast.amount || "100000",
        is_remaining: false,
      };
      next.push({
        id: crypto.randomUUID(),
        amount: "",
        rate_percent: currentLast.rate_percent,
        is_remaining: true,
      });
      return next;
    });
  };

  const handleUpdateRetentionScaleBand = (
    index: number,
    field: "up_to" | "rate_percent",
    rawValue: string,
  ) => {
    setRetentionScaleBands((current) =>
      current.map((band, bandIndex) => {
        if (bandIndex !== index) {
          return band;
        }

        if (field === "rate_percent") {
          return {
            ...band,
            rate_percent: rawValue,
          };
        }

        const previousUpperBound = index > 0 ? numberOrZero(current[index - 1].up_to) : 0;
        const nextUpperBound = index < current.length - 1 && current[index + 1]?.up_to != null
          ? numberOrZero(current[index + 1].up_to)
          : null;
        const normalizedUpTo = Math.max(previousUpperBound, numberOrZero(rawValue));
        const clampedUpTo = nextUpperBound == null
          ? normalizedUpTo
          : Math.min(normalizedUpTo, nextUpperBound);

        return {
          ...band,
          up_to: clampedUpTo,
        };
      }),
    );
  };

  const handleToggleFinalRetentionScaleOpenEnded = () => {
    setRetentionScaleBandDraftRows((current) => {
      if (current.length === 0) {
        return current;
      }

      const next = [...current];
      const lastIndex = next.length - 1;
      const lastBand = next[lastIndex];
      next[lastIndex] = {
        ...lastBand,
        amount: lastBand.is_remaining ? (lastBand.amount || "100000") : "",
        is_remaining: !lastBand.is_remaining,
      };

      return next;
    });
  };

  const handleRemoveRetentionScaleBand = (index: number) => {
    setRetentionScaleBandDraftRows((current) => {
      const next = current.filter((_, bandIndex) => bandIndex !== index);
      if (next.length === 0) {
        return [];
      }
      return next.map((band, bandIndex) => (
        bandIndex === next.length - 1 && band.is_remaining
          ? { ...band, is_remaining: true, amount: "" }
          : band
      ));
    });
  };

  const handleUpdateRetentionScaleBandDraft = (
    index: number,
    field: "amount" | "rate_percent",
    rawValue: string,
  ) => {
    setRetentionScaleBandDraftRows((current) =>
      current.map((band, bandIndex) => (
        bandIndex === index
          ? { ...band, [field]: rawValue }
          : band
      )),
    );
  };

  const handleCommitRetentionScaleBandDrafts = () => {
    setRetentionScaleBands(convertRetentionScaleBandDraftRowsToCanonical(retentionScaleBandDraftRows));
  };

  const updateClaimLinePercent = (lineId: string, nextValue: string) => {
    if (isSubmittedLocked) {
      return;
    }
    const clampedPercent = Math.min(100, Math.max(0, numberOrZero(nextValue)));
    setClaimLineItems((current) =>
      current.map((line) => (line.id === lineId ? { ...line, claimPercent: clampedPercent } : line)),
    );
  };

  const lineItemsGridTemplate = "minmax(0,1.7fr) minmax(0,0.8fr) minmax(0,1.1fr) minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,0.9fr) minmax(0,1fr) minmax(0,1fr)";
  const quoteLineItems = claimLineItemsComputed.filter((line) => line.sourceKind === "Quote");
  const variationLineItems = claimLineItemsComputed.filter((line) => line.sourceKind === "Variation");
  const quoteLineTotalValue = quoteLineItems.reduce((sum, line) => sum + line.sourceTotal, 0);
  const variationLineTotalValue = variationLineItems.reduce((sum, line) => sum + line.sourceTotal, 0);

  const renderLineItemRow = (line: (typeof claimLineItemsComputed)[number]) => (
    <div
      key={line.id}
      className="grid items-stretch gap-0 border-b border-[#E8EDF5] px-0 py-0 last:border-b-0"
      style={{ gridTemplateColumns: lineItemsGridTemplate }}
    >
      <div className="flex min-w-0 items-center px-3 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#1d2433]">
            {line.sourceNumber || line.description || "Untitled line"}
          </p>
          {line.sourceKind === "Variation" && line.sourceTitle ? (
            <p className={`${interMedium.className} truncate text-[11px] text-[#64748B]`}>
              {line.sourceTitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-sm text-[#334155]`}>{line.section}</span>
      </div>
      <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
        <span className={`${interMedium.className} truncate text-xs text-[#64748B]`}>{line.sourceKind} {line.sourceNumber}</span>
      </div>
      <div className="flex items-center justify-end border-l border-[#EEF2F7] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[#334155]`}>{toMoney(line.sourceTotal)}</span>
      </div>
      <div className="flex items-center justify-end border-l border-[#EEF2F7] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[#334155]`}>{toMoney(line.previouslyClaimedAmount)}</span>
      </div>
      <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
        <div className="relative w-full">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={line.claimPercent.toString()}
            onChange={(event) => updateClaimLinePercent(line.id, event.target.value)}
            disabled={isSubmittedLocked}
            className="h-9 rounded-[6px] border-[#D7E1EC] bg-[#FBFEFE] pr-7 text-right"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#64748B]">%</span>
        </div>
      </div>
      <div className="flex items-center justify-end border-l border-[#EEF2F7] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(line.claimAmount)}</span>
      </div>
      <div className="flex items-center justify-end border-l border-[#EEF2F7] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[#334155]`}>{toMoney(line.cumulativeClaimedAmount)}</span>
      </div>
    </div>
  );

  const renderLineItemsTable = (containerClassName = "") => (
    <div className={`overflow-x-auto rounded-[18px] border border-[#D7E1EC] bg-[#FBFEFE] ${containerClassName}`.trim()}>
      <div
        className={`${styles.quoteButtonLabel} grid items-center gap-0 border-b border-[#D7E1EC] bg-[#F3F4F6] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[#475569]`}
        style={{ gridTemplateColumns: lineItemsGridTemplate }}
      >
        <span className="px-3 py-2.5 font-semibold">Description</span>
        <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Section</span>
        <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Source</span>
        <span className="border-l border-[#D7E1EC] px-3 py-2.5 text-right font-semibold">Line Total</span>
        <span className="border-l border-[#D7E1EC] px-3 py-2.5 text-right font-semibold">Prev Claimed</span>
        <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Claim %</span>
        <span className="border-l border-[#D7E1EC] px-3 py-2.5 text-right font-semibold">This Claim</span>
        <span className="border-l border-[#D7E1EC] px-3 py-2.5 text-right font-semibold">Claimed to Date</span>
      </div>
      <div className="bg-[#FBFEFE]">
        {quoteLineItems.length > 0 ? (
          <div className="border-b border-[#E8EDF5] bg-[#F8FAFC] px-3 py-2">
            <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>
              Quote Value
            </p>
          </div>
        ) : null}
        {quoteLineItems.map(renderLineItemRow)}
        {variationLineItems.length > 0 ? (
          <div className="border-y border-[#E8EDF5] bg-[#F8FAFC] px-3 py-2">
            <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>
              Variations Value
            </p>
          </div>
        ) : null}
        {variationLineItems.map(renderLineItemRow)}
        {claimLineItemsComputed.length === 0 ? (
          <p className={`${styles.quoteBodyLabel} px-3 py-6 text-center`}>No claimable line items found yet.</p>
        ) : null}
      </div>
    </div>
  );

  const saveClaim = async () => {
    if (!supabase || !organizationId || !projectDbId || !userId || !claimId) {
      setError("Claim save is not ready. Please refresh and try again.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const liveSourceRows = await loadClaimSourceRows(organizationId, false);
      const normalizedLineItems = normalizeClaimRowsAgainstLiveSource(claimLineItemsComputed, liveSourceRows);
      const normalizedSourceKeys = new Set(normalizedLineItems.map((item) => getClaimLineSourceKey(item)));
      const missingRows = liveSourceRows.filter((row) => !normalizedSourceKeys.has(getClaimLineSourceKey(row)));
      const rowsForSave = [...normalizedLineItems, ...missingRows].sort((left, right) => left.sortOrder - right.sortOrder);
      const retentionScaleBandsForSave = retentionMethod === "sliding_scale"
        ? retentionScaleBands.map((band, index) => ({
            id: band.id ?? `tier-${index + 1}`,
            up_to: index === retentionScaleBands.length - 1 && band.up_to == null
              ? null
              : Number(Math.max(0, numberOrZero(band.up_to)).toFixed(2)),
            rate_percent: Number(Math.max(0, Math.min(100, numberOrZero(band.rate_percent))).toFixed(3)),
          }))
        : null;

      setClaimLineItems(rowsForSave);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: saveError } = await (supabase as any).rpc("save_project_claim_draft", {
        p_organization_id: organizationId,
        p_project_id: projectDbId,
        p_claim_id: claimId,
        p_expected_updated_at: claimUpdatedAt,
        p_claim_title: claimTitle.trim() || "Untitled Claim",
        p_claim_type: claimType,
        p_status: status,
        p_claim_date: claimDate || null,
        p_due_date: dueDate || null,
        p_period_start: periodStart || null,
        p_period_end: periodEnd || null,
        p_percent_complete: Number(parsedPercentComplete.toFixed(3)),
        p_paid_amount: Number(Math.max(0, paidAmountNumber).toFixed(2)),
        p_retention_method: retentionMethod,
        p_retention_scale_bands: retentionScaleBandsForSave,
        p_retention_percent: Number(retentionPercentNumber.toFixed(3)),
        p_retention_released_amount: Number(retentionReleasedAmountNumber.toFixed(2)),
        p_notes: notes,
        p_line_items: rowsForSave.map((item) => ({
          source_kind: item.sourceKind,
          source_line_item_id: item.sourceLineItemId,
          claim_percent: Number(item.claimPercent.toFixed(3)),
        })),
      });
      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedRow = Array.isArray(data) ? (data[0] as SaveClaimDraftRow | undefined) : undefined;
      if (savedRow) {
        setClaimUpdatedAt(savedRow.updated_at ?? null);
        setStatus(savedRow.status ?? status);
        setPaidAmount(String(savedRow.paid_amount ?? paidAmountNumber));
        setBaseQuoteValue(Number(savedRow.linked_quote_value ?? 0));
        setPreviousClaimsTotal(Number(savedRow.previous_claims_total ?? 0));
        setRetentionPercent(String(savedRow.retention_percent ?? retentionPercentNumber));
        setRetentionReleasedAmount(String(savedRow.retention_released_amount ?? retentionReleasedAmountNumber));
        setSnapshotClaimAmount(Number(savedRow.claim_amount ?? 0));
        setSnapshotLinkedQuoteValue(Number(savedRow.linked_quote_value ?? 0));
        setSnapshotLinkedApprovedVariations(Number(savedRow.linked_approved_variations ?? 0));
        setSnapshotPreviousClaimsTotal(Number(savedRow.previous_claims_total ?? 0));
        setSnapshotRevisedContractValue(Number(savedRow.revised_contract_value ?? 0));
        setSnapshotPercentComplete(Number(savedRow.percent_complete ?? 0));
        setSnapshotRetentionMethod(retentionMethod);
        setSnapshotRetentionScaleBands(normalizeRetentionScaleBandsForCompare(retentionScaleBands));
        setSnapshotRetentionPercent(Number(savedRow.retention_percent ?? 0));
        setSnapshotRetentionWithheldAmount(Number(savedRow.retention_withheld_amount ?? 0));
        setSnapshotRetentionReleasedAmount(Number(savedRow.retention_released_amount ?? 0));
        setSnapshotRetentionHeldToDate(Number(savedRow.retention_held_to_date ?? 0));
        setSnapshotRetentionReleasedToDate(Number(savedRow.retention_released_to_date ?? 0));
        setSnapshotRetentionBalance(Number(savedRow.retention_balance ?? 0));
        setSnapshotNetClaimExclGst(Number(savedRow.net_claim_excl_gst ?? 0));
        setSnapshotGstAmount(Number(savedRow.gst_amount ?? 0));
        setSnapshotTotalPayable(Number(savedRow.total_payable ?? 0));
        setPaidToDateTotal((current) => {
          const currentPaidAmount = numberOrZero(paidAmount);
          const savedPaidAmount = Number(savedRow.paid_amount ?? currentPaidAmount);
          return Math.max(0, current - currentPaidAmount + savedPaidAmount);
        });
        setPreviousRetentionHeldTotal(Math.max(
          0,
          Number(savedRow.retention_held_to_date ?? 0) - Number(savedRow.retention_withheld_amount ?? 0),
        ));
        setPreviousRetentionReleasedTotal(Math.max(
          0,
          Number(savedRow.retention_released_to_date ?? 0) - Number(savedRow.retention_released_amount ?? 0),
        ));
      }

      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveClaimError) {
      setError(saveClaimError instanceof Error ? saveClaimError.message : "Unable to save claim.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteClaim = async () => {
    if (!claimId || !supabase || !organizationId) {
      return;
    }
    const confirmed = typeof window === "undefined" ? true : window.confirm(`Delete claim ${claimNumber}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claimsTable = (supabase as any).from("project_claims");
      const { error: deleteError } = await claimsTable
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", claimId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/claims`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete claim.");
    } finally {
      setIsDeleting(false);
    }
  };

  const exportClaimPdf = () => {
    if (!claimId || typeof window === "undefined") {
      return;
    }

    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = projectName || routeProjectSlug?.replaceAll("-", " ") || "Project";
    const printableIssuedToName = clientCompanyName.trim() || printableProjectName;
    const printableIssuedToAddress = projectLocation.trim() || printableOrgName;
    const printableIssuedToContact = clientContactName.trim();
    const printableIssuedToLines = [
      printableIssuedToName,
      printableIssuedToAddress,
      printableIssuedToContact ? `Contact: ${printableIssuedToContact}` : "",
    ]
      .filter((line) => line.trim().length > 0)
      .map((line) => escapeHtml(line))
      .join("\n");
    const printableClaimNumber = claimNumber || "Unassigned";
    const issueDate = toDayMonthYearLabel(claimDate || new Date().toISOString().slice(0, 10));
    const printablePeriodRange = toPeriodRangeLabel(periodStart || null, periodEnd || null);
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableClaimNumber}`;
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;

    const quotePdfRows = claimLineItemsComputed.filter((line) => line.sourceKind === "Quote");
    const variationPdfRows = claimLineItemsComputed.filter((line) => line.sourceKind === "Variation");
    const renderPdfLineRow = (line: ClaimLineItem) => `
      <tr>
        <td class="desc-cell">
          <div class="cell-primary">${escapeHtml(line.sourceNumber || line.description || "Untitled line item")}</div>
          ${line.sourceKind === "Variation" && line.sourceTitle ? `<div class="cell-secondary">${escapeHtml(line.sourceTitle)}</div>` : ""}
        </td>
        <td class="right money col-contract">${toMoney(line.sourceTotal)}</td>
        <td class="right percent col-progress">${line.cumulativeClaimedPercent.toFixed(2)}%</td>
        <td class="right money col-total">${toMoney(line.cumulativeClaimedAmount)}</td>
      </tr>
    `;
    const lineItemsRows = claimLineItemsComputed.length > 0
      ? [
          quotePdfRows.length > 0 ? `<tr class="group-row"><td colspan="4">Quote Value</td></tr>${quotePdfRows.map(renderPdfLineRow).join("")}` : "",
          variationPdfRows.length > 0 ? `<tr class="group-row"><td colspan="4">Variations Value</td></tr>${variationPdfRows.map(renderPdfLineRow).join("")}` : "",
        ].join("")
      : `<tr><td colspan="4" style="text-align:center;color:#64748b;">No claimable line items.</td></tr>`;

    const grossCurrentClaim = summaryGrossCurrentClaim;
    const retentionWithheld = summaryRetentionWithheldAmount;
    const retentionReleased = summaryRetentionReleasedAmount;
    const netClaim = summaryNetClaimExclGst;
    const gst = summaryGstAmount;
    const total = summaryTotalPayable;
    const sanitizedBrandPrimaryColor = organizationBrandPrimaryColor.trim();
    const pdfPrimaryColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(sanitizedBrandPrimaryColor)
      ? sanitizedBrandPrimaryColor
      : "#0B2739";
    const organizationMetaRows = [
      organizationBusinessNumber
        ? `<p><strong>ABN / NZBN:</strong> ${escapeHtml(organizationBusinessNumber)}</p>`
        : "",
      organizationBankAccountDetails
        ? `<p><strong>Bank Account Details:</strong> ${escapeHtml(organizationBankAccountDetails)}</p>`
        : "",
      organizationGstNumber
        ? `<p><strong>GST Number:</strong> ${escapeHtml(organizationGstNumber)}</p>`
        : "",
    ]
      .filter(Boolean)
      .join("");
    const organizationDetailsRows = [
      printableOrgName ? `<p><strong>Company:</strong> ${escapeHtml(printableOrgName)}</p>` : "",
      organizationContactName ? `<p><strong>Contact:</strong> ${escapeHtml(organizationContactName)}</p>` : "",
      organizationContactPhone ? `<p><strong>Phone:</strong> ${escapeHtml(organizationContactPhone)}</p>` : "",
      organizationContactEmail ? `<p><strong>Email:</strong> ${escapeHtml(organizationContactEmail)}</p>` : "",
    ]
      .filter(Boolean)
      .join("");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportDocumentTitle)}</title>
    <style>
      :root {
        --orange: ${pdfPrimaryColor};
        --text: #2d3137;
        --muted: #697587;
        --line: #cfd6e0;
      }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; background: #eceff3; color: var(--text); }
      body { font-family: Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; }
      .sheet {
        width: 794px;
        min-height: 1123px;
        margin: 34px auto;
        background: #fff;
        padding: 44px 44px 32px;
        box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08), 0 10px 26px rgba(15, 23, 42, 0.12);
      }
      .accent { height: 4px; background: var(--orange); margin-bottom: 16px; }
      .top {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        column-gap: 20px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 10px;
      }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo-wrap { width: 180px; height: 72px; display: flex; align-items: center; justify-content: flex-start; overflow: hidden; }
      .logo-img { width: 100%; height: 100%; object-fit: contain; }
      .logo-fallback {
        width: 52px; height: 52px; display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--line); color: var(--orange); font-size: 13px; font-weight: 700;
      }
      .title {
        margin: 0;
        color: var(--orange);
        font-size: 22px;
        line-height: 1.1;
        letter-spacing: -0.01em;
        font-weight: 700;
        text-align: right;
        justify-self: end;
      }

      .issued-row {
        margin-top: 16px;
        display: grid;
        grid-template-columns: 1fr 310px;
        column-gap: 20px;
      }
      .issued-title {
        margin: 0 0 4px;
        color: #1f2937;
        font-size: 12px;
        line-height: 1;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .issued-text {
        margin: 0;
        color: #4b5563;
        white-space: pre-line;
        font-size: 13px;
        line-height: 1.3;
      }
      .issued-meta .row {
        display: grid;
        grid-template-columns: 185px auto;
        gap: 10px;
        margin-bottom: 1px;
      }
      .issued-meta .k {
        color: #1f2937;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 700;
        text-align: right;
        font-size: 10px;
      }
      .issued-meta .v {
        color: #4b5563;
        text-align: right;
        font-size: 12px;
      }
      .issued-meta .v.nowrap {
        white-space: nowrap;
      }
      .project-lead {
        margin: 14px 0 10px;
      }
      .project-lead .project-line {
        margin: 0 0 2px;
        color: #1f2937;
        font-size: 22px;
        line-height: 1.15;
        font-weight: 700;
      }
      .project-lead .lead-note {
        margin: 0;
        color: #4b5563;
        font-size: 11px;
      }
      .section-title {
        margin: 0 0 6px;
        color: #1f2937;
        font-size: 14px;
        line-height: 1;
        letter-spacing: 0;
        font-weight: 700;
      }

      table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid var(--line); }
      thead th {
        background: var(--orange);
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        font-weight: 700;
        text-align: left;
        padding: 5px 8px;
      }
      thead th.col-progress { white-space: nowrap; }
      tbody td {
        border-top: 1px solid var(--line);
        padding: 6px 8px;
        color: #303846;
        font-size: 10px;
        vertical-align: top;
      }
      .group-row td {
        background: #f5f7fb;
        color: #5d6f88;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 10px;
        font-weight: 700;
      }
      .desc-cell { line-height: 1.25; }
      .cell-primary { font-weight: 600; color: #1f2937; }
      .cell-secondary { margin-top: 1px; font-size: 9px; color: #6b7280; }
      .right { text-align: right; }
      .money, .percent { white-space: nowrap; font-variant-numeric: tabular-nums; }

      .lower {
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1fr 360px;
        gap: 18px;
      }
      .payment-details .bar {
        display: block;
        width: 100%;
        background: var(--orange);
        color: #fff;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        padding: 6px 12px;
        margin-bottom: 8px;
      }
      .payment-details p {
        margin: 0 0 4px;
        color: #374151;
        font-size: 11px;
      }
      .payment-details p strong { color: #1f2937; }
      .payment-details .thanks {
        margin-top: 10px;
        font-size: 11px;
        font-weight: 700;
        color: #1f2937;
      }
      .payment-details .legal {
        margin-top: 12px;
        font-size: 11px;
        line-height: 1.35;
        font-weight: 700;
      }
      .payment-details .org-meta {
        margin-top: 12px;
      }
      .payment-details .org-meta p {
        margin: 0 0 4px;
        color: #374151;
        font-size: 11px;
      }

      .claim-summary .bar {
        display: block;
        width: 100%;
        background: var(--orange);
        color: #fff;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        padding: 6px 12px;
        margin: 0 0 8px;
      }
      .summary-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 4px 0;
        border-bottom: 1px solid var(--line);
        font-size: 11px;
      }
      .summary-row.no-divider {
        border-bottom: 0;
      }
      .summary-row .k { color: #607089; }
      .summary-row .v { color: #253248; font-weight: 600; }
      .summary-row.strong .k,
      .summary-row.strong .v { color: #162033; font-weight: 700; }
      .summary-divider { border-top: 2px solid #9fb2ce; margin: 6px 0 4px; }
      .summary-block-title {
        margin: 8px 0 3px;
        color: #4d617a;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .totals-inline { margin-top: 10px; }
      .totals-inline .row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 3px 0;
        border-bottom: 1px solid var(--line);
        font-size: 11px;
      }
      .totals-inline .k { color: #5d7292; }
      .totals-inline .v { color: #27344a; font-weight: 600; }
      .totals-inline .row.total-row {
        background: var(--orange);
        border-top: 0;
        border-bottom: 0;
        padding-top: 7px;
        padding-bottom: 7px;
        padding-left: 8px;
        padding-right: 8px;
      }
      .totals-inline .row.total-row .k,
      .totals-inline .row.total-row .v {
        color: #fff;
        font-size: 12px;
        line-height: 1.1;
        font-weight: 800;
        letter-spacing: 0;
      }
      .terms {
        margin-top: 16px;
        max-width: 54%;
        color: #374151;
        white-space: pre-line;
        font-size: 11px;
      }
      .terms p { margin: 0 0 8px; }
      .doc-footer {
        margin-top: 18px;
        padding-top: 10px;
        border-top: 1px solid var(--line);
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        align-items: center;
        color: var(--muted);
        font-size: 11px;
      }
      .doc-footer .center { text-align: center; }
      .doc-footer .right { text-align: right; }
      .doc-footer .page::before { content: counter(page); }

      tbody tr { break-inside: avoid; page-break-inside: avoid; }
      @media print {
        html, body { background: #fff; }
        .sheet { margin: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="accent"></div>
      <header class="top">
        <div class="brand">
          <div class="logo-wrap">${logoMarkup}</div>
        </div>
        <p class="title">Payment Claim</p>
      </header>

      <section class="issued-row">
        <div>
          <p class="issued-title">Issued To:</p>
          <p class="issued-text">${printableIssuedToLines}</p>
        </div>
        <div class="issued-meta">
          <div class="row"><span class="k">Payment Claim No:</span><span class="v">${escapeHtml(printableClaimNumber)}</span></div>
          <div class="row"><span class="k">Date:</span><span class="v">${escapeHtml(issueDate)}</span></div>
          <div class="row"><span class="k">Period:</span><span class="v nowrap">${escapeHtml(printablePeriodRange)}</span></div>
          <div class="row"><span class="k">Due Date:</span><span class="v">${escapeHtml(toDayMonthYearLabel(dueDate || null))}</span></div>
        </div>
      </section>

      <section class="project-lead">
        <p class="project-line">Project: ${escapeHtml(printableProjectName)}</p>
      </section>

      <table>
        <thead>
          <tr>
            <th style="width:46%">Description</th>
            <th class="right col-contract" style="width:20%">Contract Value</th>
            <th class="right col-progress" style="width:14%">Progress %</th>
            <th class="right col-total" style="width:20%">Total</th>
          </tr>
        </thead>
        <tbody>${lineItemsRows}</tbody>
      </table>

      <section class="lower">
        <section class="payment-details">
          <div class="bar">Payment Details</div>
          ${organizationDetailsRows ? `<div class="org-details">${organizationDetailsRows}</div>` : ""}
          ${organizationMetaRows ? `<div class="org-meta">${organizationMetaRows}</div>` : ""}
          <p class="thanks">Thank you for your business!</p>
          <p class="legal">This is a Payment Claim under the Construction Contracts Act 2002.</p>
        </section>

        <div>
          <section class="claim-summary">
            <div class="bar">Claim Summary</div>
            <div class="summary-row"><span class="k">Original Contract</span><span class="v">${toMoney(summaryOriginalContract)}</span></div>
            <div class="summary-row"><span class="k">Approved Variations</span><span class="v">${toMoney(summaryApprovedVariations)}</span></div>
            <div class="summary-row no-divider"><span class="k">Revised Contract Value</span><span class="v">${toMoney(summaryRevisedContractValue)}</span></div>

            <div class="summary-divider"></div>
            <p class="summary-block-title">This Claim</p>
            <div class="summary-row"><span class="k">Value Earned to Date</span><span class="v">${toMoney(summaryValueEarnedToDate)}</span></div>
            <div class="summary-row no-divider"><span class="k">Less Previous Claims</span><span class="v">-${toMoney(summaryPreviousClaimsTotal)}</span></div>
            <div class="summary-divider"></div>

          </section>

          <section class="totals-inline">
            <div class="row" style="border-bottom: none;"><span class="k">Gross Current Claim (excl. GST)</span><span class="v">${toMoney(grossCurrentClaim)}</span></div>
            <div class="summary-divider"></div>
            <div class="row" style="border-bottom: none;"><span class="k">Less Retention (This Claim)</span><span class="v">-${toMoney(retentionWithheld)}</span></div>
            <div class="row" style="border-bottom: none;"><span class="k">Retention Held to Date</span><span class="v">${toMoney(summaryRetentionHeldToDate)}</span></div>
            <div class="summary-divider"></div>
            <div class="row"><span class="k">Net Current Claim (excl. GST)</span><span class="v">${toMoney(netClaim)}</span></div>
            <div class="row"><span class="k">GST (${(claimGstRate * 100).toFixed(0)}%)</span><span class="v">${toMoney(gst)}</span></div>
            <div class="row total-row"><span class="k">Total (incl. GST)</span><span class="v">${toMoney(total)}</span></div>
          </section>
        </div>
      </section>

      ${notes.trim() ? `<section class="terms"><p><strong>Claim Notes</strong></p><p>${escapeHtml(notes.trim())}</p></section>` : ""}

    </main>
  </body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank", "width=1024,height=768");
    if (!popup) {
      URL.revokeObjectURL(url);
      setError("Unable to export PDF. Please allow pop-ups and try again.");
      return;
    }

    popup.focus();
    popup.onload = () => {
      popup.print();
    };
    popup.onafterprint = () => {
      URL.revokeObjectURL(url);
    };
  };

  if (isLoading) {
    return (
      <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>
        <section className={styles.heroBlock}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={styles.quotePageTitle}>Payment Claim</h1>
              <span className={`${styles.quoteButtonLabel} inline-flex items-center rounded-full border border-[#D7E1EC] bg-[#FBFEFE] px-3 py-1.5 text-[12px] text-[#4B5D79]`}>
                Draft
              </span>
            </div>
            <p className={`${styles.quoteBodyLabel} text-xs`}>Live claim calculation based on contract progress.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled
              className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC] opacity-60`}
            >
              Save Claim
            </Button>
            <Button type="button" disabled className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#0B2739] px-5 !text-white opacity-60`}>
              Export PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled
              className={`${interMedium.className} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC] px-3 text-[13px] text-[#475569] opacity-60`}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <div className="space-y-6">
          <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
            <div className="space-y-5">
              <section className="border-b border-[#E8EDF5] pb-5">
                <div className="h-10 w-56 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5] md:col-span-2" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                </div>
              </section>
              <section className="border-b border-[#E8EDF5] py-5">
                <div className="h-10 w-48 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                </div>
              </section>
              <section className="py-5">
                <div className="h-10 w-40 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                <div className="mt-4 h-56 animate-pulse rounded-[18px] bg-[#E8EDF5]" />
                <p className={`${styles.quoteBodyLabel} pt-4`}>Loading claim...</p>
              </section>
              <div className="border-t border-[#E8EDF5] py-6">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
                  <div className="space-y-4">
                    <div className="h-10 w-44 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                    <div className="h-28 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                  </div>
                  <div className="border-t border-[#E8EDF5] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                    <div className="space-y-3">
                      <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                      <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                      <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                      <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>
      <section className={styles.heroBlock}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={styles.quotePageTitle}>{claimNumber || "Payment Claim"}</h1>
            <span className={`${styles.quoteButtonLabel} inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] ${claimStatusClassName(status)}`}>
              {status}
            </span>
          </div>
          <p className={`${styles.quoteBodyLabel} text-xs`}>
            Live claim calculation based on contract progress{projectName ? ` for ${projectName}` : ""}.
          </p>
          {saveMessage ? <p className={`${styles.quoteBodyLabel} text-xs`}>{saveMessage}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void saveClaim();
            }}
            disabled={isSaving || !claimId}
            className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}
          >
            {isSaving ? "Saving..." : "Save Claim"}
          </Button>
          <Button
            type="button"
            onClick={exportClaimPdf}
            disabled={!claimId}
            className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#0B2739] px-5 !text-white hover:bg-[#0B2739]`}
          >
            Export PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={`${interMedium.className} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC] px-3 text-[13px] text-[#475569]`}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="!z-[200] min-w-[220px] rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]">
              <DropdownMenuItem asChild className={`${interMedium.className} h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}>
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/claims`}>
                  <ExternalLink className="mr-2 h-4 w-4 text-[#64748B]" />
                  Claims Register
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void createClaim();
                }}
                disabled={isCreatingClaim || !projectDbId || !organizationId}
                className={`${interMedium.className} h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
              >
                <Plus className="mr-2 h-4 w-4 text-[#64748B]" />
                {isCreatingClaim ? "Creating..." : "New Claim"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void saveClaim();
                }}
                disabled={isSaving || !claimId}
                className={`${interMedium.className} h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
              >
                <Save className="mr-2 h-4 w-4 text-[#64748B]" />
                {isSaving ? "Saving..." : "Save Claim"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  exportClaimPdf();
                }}
                disabled={!claimId}
                className={`${interMedium.className} h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
              >
                <FileDown className="mr-2 h-4 w-4 text-[#64748B]" />
                Export PDF
              </DropdownMenuItem>
              {claimId ? (
                <>
                  <DropdownMenuSeparator className="my-1 bg-[#E8EDF5]" />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void deleteClaim();
                    }}
                    disabled={isDeleting}
                    className={`${interMedium.className} h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium text-[#b42318] focus:bg-[#FEF3F2] focus:text-[#b42318]`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}

      <div className="space-y-6 [&_input]:border-[#D7E1EC] [&_input]:bg-[#FBFEFE] [&_input]:text-[#1D1D1D] [&_select]:border-[#D7E1EC] [&_select]:bg-[#FBFEFE] [&_select]:text-[#1D1D1D] [&_textarea]:border-[#D7E1EC] [&_textarea]:bg-[#FBFEFE] [&_textarea]:text-[#1D1D1D]">
        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
          <section className="border-b border-[#E8EDF5] pb-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Claim Workspace</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Claim No.</label>
                  <Input value={claimNumber} onChange={(event) => setClaimNumber(event.target.value)} className="h-10 rounded-[6px] bg-[#f8fafc]" disabled />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className={styles.quoteBodyLabel}>Claim Title</label>
                  <Input value={claimTitle} onChange={(event) => setClaimTitle(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Claim Type</label>
                  <select value={claimType} onChange={(event) => setClaimType(event.target.value as ClaimType)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`} disabled={isSubmittedLocked}>
                    <option value="Progress">Progress</option>
                    <option value="Deposit">Deposit</option>
                    <option value="Final">Final</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Status</label>
                  <select value={status} onChange={(event) => setStatus(event.target.value as ClaimStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}>
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                    <option value="Overdue">Overdue</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>% Complete</label>
                  <Input type="number" value={displayedPercentComplete} className="h-10 rounded-[6px] bg-[#f8fafc]" disabled />
                </div>
              </div>
            </div>
          </section>

          <section className="border-b border-[#E8EDF5] py-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Claim Period</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Claim Date</label><Input type="date" value={claimDate} onChange={(event) => setClaimDate(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Due Date</label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Period Start</label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Period End</label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
            </div>
          </section>

          <section className="border-b border-[#E8EDF5] py-5">
            <button type="button" onClick={() => setIsLineItemsOpen((current) => !current)} className="flex w-full items-center justify-between">
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Line Items</h2>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsLineItemsExpanded(true);
                  }}
                  className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC] px-4`}
                >
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  Expand
                </Button>
                <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isLineItemsOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {isLineItemsOpen ? (
              <div className="mt-4 space-y-4">
                {renderLineItemsTable()}
              </div>
            ) : null}
          </section>

          <div className="border-t border-[#E8EDF5] py-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
              <div>
                <section className="pt-0">
                  <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Payment & Notes</h2>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-[6px] border border-[#E5EAF2] bg-[#FAFCFF] px-4 py-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                          <p className={styles.quoteCardTitle}>Claim Status</p>
                          <p className={styles.quoteBodyLabel}>Current lifecycle state</p>
                          <span className={`${styles.quoteButtonLabel} inline-flex rounded-full border px-3 py-1.5 text-[12px] ${claimStatusClassName(status)}`}>
                            {status}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className={styles.quoteCardTitle}>This Claim</p>
                          <p className={styles.quoteBodyLabel}>Current claim amount</p>
                          <p className={styles.quoteBodyValue}>{toMoney(summaryGrossCurrentClaim)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className={styles.quoteCardTitle}>Balance Outstanding</p>
                          <p className={styles.quoteBodyLabel}>Based on earned less paid to date</p>
                          <p className={styles.quoteBodyValue}>{toMoney(summaryBalanceOutstanding)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Notes</label>
                      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={`${interMedium.className} min-h-[110px] w-full rounded-[6px] border border-[#D7E1EC] px-3 py-2 text-sm`} disabled={isSubmittedLocked} />
                    </div>
                  </div>
                </section>
              </div>

              <div className="border-t border-[#E8EDF5] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle} mb-4`}>Claim Summary</h2>
                <div className="space-y-5">
                  <div className="rounded-[16px] border border-[#E8EDF5] bg-[#F9FAFC] px-4 py-4">
                    <div className={`${interMedium.className} space-y-3 text-sm`}>
                      <p className={styles.quoteCardTitle}>Contract Position</p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Contract Amount</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryOriginalContract)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Approved Variations</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryApprovedVariations)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Revised Contract Value</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryRevisedContractValue)}</span>
                      </p>
                      <div className="h-px bg-[#E7ECF3]" />

                      <p className={styles.quoteCardTitle}>Claim Position</p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Gross Claim To Date</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryValueEarnedToDate)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Less Previous Claims</span>
                        <span className="font-medium text-[#1d2433]">-{toMoney(summaryPreviousClaimsTotal)}</span>
                      </p>
                      <p className="flex items-center justify-between pt-1">
                        <span className="text-[#64748B]">Gross Current Claim</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryGrossCurrentClaim)}</span>
                      </p>
                      <div className="h-px bg-[#E7ECF3]" />

                      <p className={styles.quoteCardTitle}>Retention</p>
                      <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <label className={styles.quoteBodyLabel}>Retention %</label>
                          <Dialog open={isRetentionSelectorOpen} onOpenChange={handleRetentionDialogOpenChange}>
                            <DialogTrigger asChild>
                              <button
                                type="button"
                                disabled={isRetentionLocked}
                                className="relative flex h-10 w-full items-center rounded-[6px] border border-[#D9E3EE] bg-white px-3 pr-8 text-left text-[14px] font-medium text-[#10283B] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-[#94A3B8]"
                              >
                                <span className="truncate">{retentionSelectorDisplay}</span>
                                {retentionMethod === "flat" ? (
                                  <span className={`${interMedium.className} pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>%</span>
                                ) : null}
                                <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8] transition-transform ${isRetentionSelectorOpen ? "rotate-180" : ""}`} />
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
                              <DialogHeader className="px-7 pb-6 pt-7">
                                <DialogTitle className={`${ibmPlexSans.className} m-0 text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]`}>
                                  Retention
                                </DialogTitle>
                                <p className={`${interMedium.className} text-[13px] text-[#6B7A90]`}>
                                  Configure retention method and bands
                                </p>
                              </DialogHeader>
                              <div className="space-y-3.5 px-7 pb-4">
                                <div className="flex items-center gap-6 border-b-2 border-[#E2E8F1]">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectRetentionMethod("flat")}
                                    className={`-mb-[2px] inline-flex items-center py-3 text-[15px] font-medium transition-colors ${
                                      retentionMethod === "flat"
                                        ? "border-b-[2px] border-[#F15A29] text-[#F15A29]"
                                        : "text-[#4B5D79] hover:text-[#4B5D79]"
                                    }`}
                                  >
                                    Flat %
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectRetentionMethod("sliding_scale")}
                                    className={`-mb-[2px] inline-flex items-center py-3 text-[15px] font-medium transition-colors ${
                                      retentionMethod === "sliding_scale"
                                        ? "border-b-[2px] border-[#F15A29] text-[#F15A29]"
                                        : "text-[#4B5D79] hover:text-[#4B5D79]"
                                    }`}
                                  >
                                    Sliding Scale
                                  </button>
                                </div>
                                {retentionMethod === "flat" ? (
                                  <>
                                    <div className="grid grid-cols-2 gap-2">
                                      {RETENTION_PRESET_OPTIONS.map((option) => {
                                        const isSelected = Math.abs(retentionPercentNumber - option) < 0.001 && !hasCustomRetentionPercent;
                                        return (
                                          <button
                                            key={option}
                                            type="button"
                                            onClick={() => handleSelectRetentionPreset(option)}
                                            className={`${retentionChoiceButtonClass} ${
                                              isSelected
                                                ? "border-[#F15A29] bg-[#FFF3EE] text-[#10283B]"
                                                : "border-[#D9E3EE] bg-white text-[#10283B] hover:bg-slate-50"
                                            }`}
                                          >
                                            {option}%
                                          </button>
                                        );
                                      })}
                                      <button
                                        type="button"
                                        onClick={() => setIsRetentionCustomMode(true)}
                                        className={`${retentionChoiceButtonClass} ${
                                          isRetentionCustomMode || hasCustomRetentionPercent
                                            ? "border-[#F15A29] bg-[#FFF3EE] text-[#10283B]"
                                            : "border-[#D9E3EE] bg-white text-[#10283B] hover:bg-slate-50"
                                        }`}
                                      >
                                        Custom
                                      </button>
                                    </div>
                                    {isRetentionCustomMode || hasCustomRetentionPercent ? (
                                      <div className="space-y-2.5">
                                        <label className={retentionLabelClass}>Custom retention %</label>
                                        <div className="relative">
                                          <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step="0.1"
                                            value={retentionPercent}
                                            onChange={(event) => setRetentionPercent(event.target.value)}
                                            className={`${retentionInputClass} pr-9`}
                                          />
                                          <span className={`${interMedium.className} pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>%</span>
                                        </div>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <div className="space-y-3.5">
                                    <div className="space-y-3.5">
                                      {retentionScaleBandDraftRows.map((band, index) => {
                                        const isFinalTier = index === retentionScaleBandDraftRows.length - 1;
                                        const isOpenEndedFinalTier = isFinalTier && band.is_remaining;
                                        const previousUpperBound = retentionScaleBandDraftRows
                                          .slice(0, index)
                                          .reduce((sum, row) => sum + Math.max(0, numberOrZero(row.amount)), 0);
                                        const bandAmount = isOpenEndedFinalTier ? null : Math.max(0, numberOrZero(band.amount));
                                        const rowLabel = isOpenEndedFinalTier
                                          ? "Remaining amount"
                                          : index === 0
                                            ? "First"
                                            : "Next";
                                        const amountLabel = isOpenEndedFinalTier ? "Remaining amount" : `${rowLabel} amount`;

                                        return (
                                          <div
                                            key={band.id ?? `retention-tier-${index}`}
                                            className="space-y-3.5 border-t border-[#E8EDF5] pt-3.5 first:border-t-0 first:pt-0"
                                          >
                                            <div className="flex items-start justify-between gap-3">
                                              <p className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#1d2433]`}>
                                                {isOpenEndedFinalTier
                                                  ? `Remaining amount at ${numberOrZero(band.rate_percent)}%`
                                                  : `${rowLabel} ${toMoney(numberOrZero(bandAmount))} at ${numberOrZero(band.rate_percent)}%`}
                                              </p>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveRetentionScaleBand(index)}
                                                disabled={retentionScaleBandDraftRows.length === 1}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#D9E3EE] bg-white text-[#64748B] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                                aria-label={`Remove band ${index + 1}`}
                                                >
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                              <div className="space-y-2">
                                                <label className={retentionLabelClass}>{amountLabel}</label>
                                                {isOpenEndedFinalTier ? (
                                                  <p className={`${interMedium.className} text-[12px] text-[#6B7A90]`}>
                                                    Remaining amount above {toMoney(previousUpperBound)}
                                                  </p>
                                                ) : (
                                                  <Input
                                                    type="number"
                                                    min={0}
                                                    step="1000"
                                                    value={band.amount}
                                                    onChange={(event) => handleUpdateRetentionScaleBandDraft(index, "amount", event.target.value)}
                                                    onBlur={handleCommitRetentionScaleBandDrafts}
                                                    className={retentionInputClass}
                                                  />
                                                )}
                                              </div>
                                              <div className="space-y-2">
                                                <label className={retentionLabelClass}>Rate</label>
                                                <div className="relative">
                                                  <Input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    step="0.1"
                                                    value={band.rate_percent}
                                                    onChange={(event) => handleUpdateRetentionScaleBandDraft(index, "rate_percent", event.target.value)}
                                                    onBlur={handleCommitRetentionScaleBandDrafts}
                                                    className={`${retentionInputClass} pr-9`}
                                                  />
                                                  <span className={`${interMedium.className} pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>%</span>
                                                </div>
                                              </div>
                                            </div>
                                            <div>
                                              {isFinalTier ? (
                                                <button
                                                  type="button"
                                                  onClick={handleToggleFinalRetentionScaleOpenEnded}
                                                  className={`inline-flex rounded-[8px] border px-3 py-2 text-[12px] font-medium transition ${
                                                    isOpenEndedFinalTier
                                                      ? "border-[#F15A29] bg-[#FFF3EE] text-[#10283B]"
                                                      : "border-[#D9E3EE] bg-white text-[#10283B] hover:bg-slate-50"
                                                  }`}
                                                >
                                                  {isOpenEndedFinalTier ? "Using remaining amount" : "Use remaining amount"}
                                                </button>
                                              ) : null}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleAddRetentionScaleTier}
                                      className={`${retentionChoiceButtonClass} items-center border-[#D9E3EE] bg-white text-[#10283B] hover:bg-slate-50`}
                                    >
                                      <Plus className="mr-2 h-3.5 w-3.5" />
                                      Add Band
                                    </button>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        <div className="grid gap-2">
                          <label className={styles.quoteBodyLabel}>Retention Released</label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={retentionReleasedAmount}
                            onChange={(event) => setRetentionReleasedAmount(event.target.value)}
                            disabled={isRetentionLocked}
                            className="h-10 rounded-[6px]"
                          />
                        </div>
                      </div>
                      <div className="h-px bg-[#E7ECF3]" />
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Less Retention (This Claim)</span>
                        <span className="font-medium text-[#1d2433]">-{toMoney(summaryRetentionWithheldAmount)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Retention Held to Date</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryRetentionHeldToDate)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Retention Released to Date</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryRetentionReleasedToDate)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Current Retention Balance</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryRetentionBalance)}</span>
                      </p>
                      <div className="h-px bg-[#E7ECF3]" />
                      <p className={styles.quoteCardTitle}>Payment Breakdown</p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">Net Current Claim (excl. GST)</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryNetClaimExclGst)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[#64748B]">GST ({(claimGstRate * 100).toFixed(0)}%)</span>
                        <span className="font-medium text-[#1d2433]">{toMoney(summaryGstAmount)}</span>
                      </p>
                      <p className="flex items-center justify-between pt-1">
                        <span className="text-[15px] font-semibold text-[#1d2433]">Total Payable (incl. GST)</span>
                        <span className="text-[15px] font-semibold text-[#1d2433]">{toMoney(summaryTotalPayable)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <Button type="button" onClick={() => void saveClaim()} disabled={isSaving || !claimId} variant="outline" className={`${styles.quoteButtonLabel} h-10 w-full rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}>
                      {isSaving ? "Saving..." : "Save Claim"}
                    </Button>
                    <Button
                      type="button"
                      onClick={exportClaimPdf}
                      disabled={!claimId}
                      className={`${styles.quoteButtonLabel} h-10 w-full rounded-full bg-[#0B2739] !text-white hover:bg-[#0B2739]`}
                    >
                      Export PDF
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLineItemsExpanded ? (
        <div className="fixed inset-0 z-[240] bg-[#0B1626]/55 p-4 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col rounded-[18px] border border-[#D7E1EC] bg-[#FBFEFE] shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
            <div className="flex items-center justify-between border-b border-[#E8EDF5] px-5 py-4">
              <h2 className={styles.quoteSectionTitle}>Line Items</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLineItemsExpanded(false)}
                className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC] px-4`}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Close
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E8EDF5] px-5 py-3">
              <div className="inline-flex items-center gap-2 rounded-[6px] border border-[#D8E0EB] bg-[#F8FAFC] px-3 py-1.5">
                <span className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>Quote Total</span>
                <span className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(quoteLineTotalValue)}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-[6px] border border-[#D8E0EB] bg-[#F8FAFC] px-3 py-1.5">
                <span className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>Variation Total</span>
                <span className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(variationLineTotalValue)}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {renderLineItemsTable("h-full")}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
