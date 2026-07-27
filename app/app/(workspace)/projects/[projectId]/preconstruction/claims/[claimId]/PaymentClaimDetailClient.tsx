"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, FileDown, Maximize2, Plus, Save, Trash2, X } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { PaymentClaimXeroPanel } from "@/components/app/PaymentClaimXeroPanel";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { canManageCommercialData } from "@/lib/role-permissions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { triggerDocumentClassification } from "@/lib/cost-items/trigger-document-classification";
import styles from "@/components/app/trade-pack-builder.module.css";
import {
  composePaymentClaimPdfExport,
  downloadPaymentClaimPdf,
} from "@/lib/exports/payment-claim-pdf";
import { getPaymentClaimStatutoryDocuments } from "@/lib/legal/payment-claim-statutory-documents";
import { resolveAccountingIdentityPresentation } from "@/lib/accounting/accounting-identity-presentation";
import type { PaymentClaimXeroPanelState } from "@/lib/xero/payment-claim-sales-invoice-panel";
import {
  getClaimLineDescriptionText,
  getClaimLineSourceKey,
  getClaimLineSourceText,
  normalizeClaimRowsAgainstLiveSource,
} from "./claim-line-item-helpers";

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

type RetentionNormalizationStatus = "compatible" | "safe_normalized" | "lossy";

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
  id: string;
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

function compareClaimChronology(
  left: { id: string; claim_date?: string | null; created_at?: string | null },
  right: { id: string; claim_date?: string | null; created_at?: string | null },
) {
  const leftClaimDate = left.claim_date ?? "9999-12-31";
  const rightClaimDate = right.claim_date ?? "9999-12-31";
  if (leftClaimDate !== rightClaimDate) {
    return leftClaimDate.localeCompare(rightClaimDate);
  }

  const leftCreatedAt = left.created_at ?? "9999-12-31T23:59:59.999Z";
  const rightCreatedAt = right.created_at ?? "9999-12-31T23:59:59.999Z";
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt.localeCompare(rightCreatedAt);
  }

  return left.id.localeCompare(right.id);
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

function createFixedRetentionScaleBandDraftRow(
  id: string,
  amount: string,
  ratePercent: number,
  isRemaining: boolean,
): RetentionScaleBandDraftRow {
  return {
    id,
    amount,
    rate_percent: toDraftNumericString(Math.max(0, Math.min(100, ratePercent))),
    is_remaining: isRemaining,
  };
}

function assessRetentionScaleBandNormalizationRisk(bands: RetentionScaleBand[]): RetentionNormalizationStatus {
  if (bands.length === 0) {
    return "safe_normalized";
  }

  if (bands.length >= 4) {
    return "lossy";
  }

  if (bands.length === 1) {
    return bands[0]?.up_to == null ? "safe_normalized" : "lossy";
  }

  if (bands.length === 2) {
    return bands[1]?.up_to == null ? "safe_normalized" : "lossy";
  }

  return bands[2]?.up_to == null ? "compatible" : "lossy";
}

function normalizeRetentionScaleBandsToFixedThree(
  bands: RetentionScaleBand[],
  fallbackRatePercent = 0,
): RetentionScaleBand[] {
  const normalizedBands = bands.map((band, index) => ({
    id: band.id ?? `tier-${index + 1}`,
    up_to: band.up_to == null ? null : Number(Math.max(0, numberOrZero(band.up_to)).toFixed(2)),
    rate_percent: Number(Math.max(0, Math.min(100, numberOrZero(band.rate_percent))).toFixed(3)),
  }));
  const safeFallbackRate = Number(Math.max(0, Math.min(100, numberOrZero(fallbackRatePercent))).toFixed(3));
  const fallbackIdPrefix = normalizedBands.length > 0 ? "legacy-tier" : "fixed-tier";
  const firstBand = normalizedBands[0] ?? null;
  const secondBand = normalizedBands[1] ?? null;
  const thirdBand = normalizedBands[2] ?? null;
  const lastBand = normalizedBands[normalizedBands.length - 1] ?? null;

  const firstUpTo = firstBand?.up_to == null ? 0 : firstBand.up_to;
  const secondUpTo = secondBand?.up_to == null
    ? firstUpTo
    : Math.max(firstUpTo, secondBand.up_to);
  const firstAmount = Number(Math.max(0, firstUpTo).toFixed(2));
  const secondAmount = Number(Math.max(0, secondUpTo - firstUpTo).toFixed(2));

  const firstRate = firstBand == null
    ? safeFallbackRate
    : Number(Math.max(0, Math.min(100, numberOrZero(firstBand.rate_percent))).toFixed(3));
  const secondRate = secondBand == null
    ? firstRate
    : Number(Math.max(0, Math.min(100, numberOrZero(secondBand.rate_percent))).toFixed(3));
  const remainingRateSource = thirdBand ?? lastBand ?? secondBand ?? firstBand;
  const remainingRate = remainingRateSource == null
    ? safeFallbackRate
    : Number(Math.max(0, Math.min(100, numberOrZero(remainingRateSource.rate_percent))).toFixed(3));

  return [
    {
      id: firstBand?.id ?? `${fallbackIdPrefix}-1`,
      up_to: Number(firstAmount.toFixed(2)),
      rate_percent: firstRate,
    },
    {
      id: secondBand?.id ?? `${fallbackIdPrefix}-2`,
      up_to: Number((firstAmount + secondAmount).toFixed(2)),
      rate_percent: secondRate,
    },
    {
      id: thirdBand?.id ?? `${fallbackIdPrefix}-3`,
      up_to: null,
      rate_percent: remainingRate,
    },
  ];
}

function deriveRetentionScaleBandDraftRows(
  bands: RetentionScaleBand[],
  fallbackRatePercent = 0,
): RetentionScaleBandDraftRow[] {
  const normalizedBands = normalizeRetentionScaleBandsToFixedThree(bands, fallbackRatePercent);
  const firstBandUpperBound = normalizedBands[0]?.up_to == null ? 0 : Math.max(0, numberOrZero(normalizedBands[0].up_to));
  const secondBandUpperBound = normalizedBands[1]?.up_to == null ? firstBandUpperBound : Math.max(firstBandUpperBound, numberOrZero(normalizedBands[1].up_to));
  const firstAmount = Number(Math.max(0, firstBandUpperBound).toFixed(2));
  const nextAmount = Number(Math.max(0, secondBandUpperBound - firstBandUpperBound).toFixed(2));

  return [
    createFixedRetentionScaleBandDraftRow(
      normalizedBands[0]?.id ?? "fixed-tier-1",
      firstAmount > 0 ? toDraftNumericString(firstAmount, 2) : "",
      numberOrZero(normalizedBands[0]?.rate_percent),
      false,
    ),
    createFixedRetentionScaleBandDraftRow(
      normalizedBands[1]?.id ?? "fixed-tier-2",
      nextAmount > 0 ? toDraftNumericString(nextAmount, 2) : "",
      numberOrZero(normalizedBands[1]?.rate_percent),
      false,
    ),
    createFixedRetentionScaleBandDraftRow(
      normalizedBands[2]?.id ?? "fixed-tier-3",
      "",
      numberOrZero(normalizedBands[2]?.rate_percent),
      true,
    ),
  ];
}

function convertRetentionScaleBandDraftRowsToCanonical(rows: RetentionScaleBandDraftRow[]): RetentionScaleBand[] {
  const [firstRow, secondRow, thirdRow] = [
    rows[0] ?? createFixedRetentionScaleBandDraftRow("fixed-tier-1", "", 0, false),
    rows[1] ?? createFixedRetentionScaleBandDraftRow("fixed-tier-2", "", 0, false),
    rows[2] ?? createFixedRetentionScaleBandDraftRow("fixed-tier-3", "", 0, true),
  ];
  const firstAmount = Math.max(0, numberOrZero(firstRow.amount));
  const nextAmount = Math.max(0, numberOrZero(secondRow.amount));
  const firstUpTo = Number(firstAmount.toFixed(2));
  const secondUpTo = Number((firstAmount + nextAmount).toFixed(2));

  return [
    {
      id: firstRow.id,
      up_to: firstUpTo,
      rate_percent: firstRow.rate_percent,
    },
    {
      id: secondRow.id,
      up_to: secondUpTo,
      rate_percent: secondRow.rate_percent,
    },
    {
      id: thirdRow.id,
      up_to: null,
      rate_percent: thirdRow.rate_percent,
    },
  ];
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

const RETENTION_PRESET_OPTIONS = [0, 2.5, 5, 10] as const;
const retentionInputClass = "font-[family-name:var(--font-ibm-plex-sans)] h-10 w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--brand-blue)]";
const retentionLabelClass = "font-[family-name:var(--font-ibm-plex-sans)] mb-1.5 block text-[14px] font-medium text-[var(--text-secondary)]";
const retentionChoiceButtonClass = "inline-flex h-10 items-center justify-center rounded-[10px] border px-4 text-left text-[14px] font-medium transition";

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

function claimStatusBadge(status: ClaimStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (status) {
    case "Paid":
      return "approved";
    case "Overdue":
      return "overdue";
    case "Submitted":
      return "sent";
    case "Unpaid":
      return "pending";
    case "Cancelled":
      return "draft";
    default:
      return "draft";
  }
}

export function PaymentClaimDetailClient(props: {
  initialXeroPanelState?: PaymentClaimXeroPanelState;
}) {
  const params = useParams<{ projectId: string; claimId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeClaimId = params?.claimId;
  const isNewRoute = routeClaimId === "new";
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;
  const canManageClaim = canManageCommercialData(session?.role);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [organizationBrandPrimaryColor, setOrganizationBrandPrimaryColor] = useState("");
  const [organizationCountry, setOrganizationCountry] = useState<string | null>(null);
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
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatingClaim, setIsCreatingClaim] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimUpdatedAt, setClaimUpdatedAt] = useState<string | null>(null);
  const [claimNumber, setClaimNumber] = useState("");
  const [activeXeroInvoiceNumber, setActiveXeroInvoiceNumber] =
    useState<string | null>(null);
  const [activeXeroInvoiceId, setActiveXeroInvoiceId] =
    useState<string | null>(null);
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
  const [retentionNormalizationStatus, setRetentionNormalizationStatus] = useState<RetentionNormalizationStatus>("compatible");
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
    const savedRetentionScaleBands = Array.isArray(claim.retention_scale_bands) ? claim.retention_scale_bands : [];
    setRetentionNormalizationStatus(
      claim.retention_method === "sliding_scale"
        ? assessRetentionScaleBandNormalizationRisk(savedRetentionScaleBands)
        : "compatible",
    );
    const hydratedRetentionScaleBands = normalizeRetentionScaleBandsToFixedThree(
      savedRetentionScaleBands,
      Number(claim.retention_percent ?? 0),
    );
    setRetentionScaleBands(hydratedRetentionScaleBands);
    setRetentionScaleBandDraftRows(deriveRetentionScaleBandDraftRows(hydratedRetentionScaleBands, Number(claim.retention_percent ?? 0)));
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
      normalizeRetentionScaleBandsForCompare(hydratedRetentionScaleBands),
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
        .select("id, claim_amount, paid_amount, retention_withheld_amount, retention_released_amount, status, claim_date, created_at")
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
      claim_date: string | null;
      created_at: string;
    }>;
    const existingClaimRow = existingClaimId == null
      ? null
      : (claimRows.find((row) => row.id === existingClaimId) ?? null);
    const previousClaimRows = claimRows
      .filter((row) => row.status !== "Cancelled")
      .filter((row) => {
        if (!existingClaimRow) {
          return row.id !== existingClaimId;
        }
        return compareClaimChronology(row, existingClaimRow) < 0;
      });
    const previousTotal = previousClaimRows
      .reduce((sum, row) => sum + Number(row.claim_amount ?? 0), 0);
    const paidToDate = claimRows
      .filter((row) => row.status !== "Cancelled")
      .reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0);
    const previousRetentionHeld = previousClaimRows
      .reduce((sum, row) => sum + Number(row.retention_withheld_amount ?? 0), 0);
    const previousRetentionReleased = previousClaimRows
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
          .select("name, logo_path, brand_primary_color, country, business_number, bank_account_details, gst_number, contact_name, contact_email, contact_phone")
          .eq("id", resolvedOrganizationId)
          .maybeSingle();
        if (!cancelled) {
          setOrganizationName(organizationRow?.name ?? "");
          setOrganizationBrandPrimaryColor((organizationRow?.brand_primary_color ?? "").trim());
          setOrganizationCountry(organizationRow?.country ?? null);
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
  const accountingIdentity = useMemo(
    () => resolveAccountingIdentityPresentation({
      commercialClaimNumber: claimNumber,
      activeRevisionInvoiceNumber: activeXeroInvoiceNumber,
      activeRevisionInvoiceId: activeXeroInvoiceId,
    }),
    [activeXeroInvoiceId, activeXeroInvoiceNumber, claimNumber],
  );
  const applyXeroPanelIdentity = useCallback(
    (panelState: PaymentClaimXeroPanelState) => {
      setActiveXeroInvoiceNumber(panelState.invoiceNumber);
      setActiveXeroInvoiceId(panelState.invoiceId ?? null);
    },
    [],
  );
  const isRetentionLocked = status !== "Draft";
  const summaryOriginalContract = snapshotLinkedQuoteValue ?? baseQuoteValue;
  const summaryApprovedVariations = snapshotLinkedApprovedVariations ?? approvedVariationsValue;
  const summaryRevisedContractValue = snapshotRevisedContractValue ?? revisedContractValue;
  const summaryPreviousClaimsTotal = snapshotPreviousClaimsTotal ?? previousClaimsTotal;
  const hasLiveCurrentClaimGrossChange = snapshotClaimAmount == null
    ? currentClaimGrossExclGst > 0
    : Math.abs(currentClaimGrossExclGst - numberOrZero(snapshotClaimAmount)) > 0.004;
  const summaryGrossCurrentClaim = hasLiveCurrentClaimGrossChange
    ? currentClaimGrossExclGst
    : (snapshotClaimAmount ?? currentClaimGrossExclGst);
  const summaryPercentComplete = hasLiveCurrentClaimGrossChange
    ? parsedPercentComplete
    : (snapshotPercentComplete ?? parsedPercentComplete);
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
  const shouldUseLiveClaimPreview = isRetentionDirty || hasLiveCurrentClaimGrossChange;
  const summaryRetentionWithheldAmount = shouldUseLiveClaimPreview
    ? previewRetentionWithheld
    : (snapshotRetentionWithheldAmount ?? 0);
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
        const sourceBands = normalizeRetentionScaleBandsToFixedThree(retentionScaleBands, retentionPercentNumber);
        setRetentionScaleBands(sourceBands);
        setRetentionScaleBandDraftRows(deriveRetentionScaleBandDraftRows(sourceBands, retentionPercentNumber));
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
    if (value === "sliding_scale") {
      const sourceBands = normalizeRetentionScaleBandsToFixedThree(retentionScaleBands, retentionPercentNumber);
      setRetentionScaleBands(sourceBands);
      setRetentionScaleBandDraftRows(deriveRetentionScaleBandDraftRows(sourceBands, retentionPercentNumber));
    }
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
    const normalizedDraftRows = deriveRetentionScaleBandDraftRows(
      convertRetentionScaleBandDraftRowsToCanonical(retentionScaleBandDraftRows),
      retentionPercentNumber,
    );
    setRetentionScaleBandDraftRows(normalizedDraftRows);
    setRetentionScaleBands(convertRetentionScaleBandDraftRowsToCanonical(normalizedDraftRows));
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
      className="grid items-stretch gap-0 border-b border-[var(--border-subtle)] px-0 py-0 last:border-b-0"
      style={{ gridTemplateColumns: lineItemsGridTemplate }}
    >
      <div className="flex min-w-0 items-center px-3 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {getClaimLineDescriptionText(line)}
          </p>
          {line.sourceKind === "Variation" && line.sourceTitle ? (
            <p className={`${interMedium.className} truncate text-[11px] text-[var(--text-secondary)]`}>
              {line.sourceTitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-sm text-[var(--text-secondary)]`}>{line.section}</span>
      </div>
      <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
        <span className={`${interMedium.className} truncate text-xs text-[var(--text-secondary)]`}>{getClaimLineSourceText(line)}</span>
      </div>
      <div className="flex items-center justify-end border-l border-[var(--border-subtle)] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[var(--text-secondary)]`}>{toMoney(line.sourceTotal)}</span>
      </div>
      <div className="flex items-center justify-end border-l border-[var(--border-subtle)] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[var(--text-secondary)]`}>{toMoney(line.previouslyClaimedAmount)}</span>
      </div>
      <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
        <div className="relative w-full">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={line.claimPercent.toString()}
            onChange={(event) => updateClaimLinePercent(line.id, event.target.value)}
            disabled={isSubmittedLocked}
            className="h-9 rounded-[6px] border-[var(--border)] bg-[var(--surface)] pr-7 text-right"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">%</span>
        </div>
      </div>
      <div className="flex items-center justify-end border-l border-[var(--border-subtle)] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-right text-sm font-semibold text-[var(--text-primary)]`}>{toMoney(line.claimAmount)}</span>
      </div>
      <div className="flex items-center justify-end border-l border-[var(--border-subtle)] px-3 py-1.5">
        <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[var(--text-secondary)]`}>{toMoney(line.cumulativeClaimedAmount)}</span>
      </div>
    </div>
  );

  const renderLineItemsTable = (containerClassName = "") => (
    <div className={`overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--surface)] ${containerClassName}`.trim()}>
      <div
        className={`${styles.quoteButtonLabel} grid items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[var(--text-secondary)]`}
        style={{ gridTemplateColumns: lineItemsGridTemplate }}
      >
        <span className="px-3 py-2.5 font-semibold">Description</span>
        <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Section</span>
        <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Source</span>
        <span className="border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Line Total</span>
        <span className="border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Prev Claimed</span>
        <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Claim %</span>
        <span className="border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">This Claim</span>
        <span className="border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Claimed to Date</span>
      </div>
      <div className="bg-[var(--surface)]">
        {quoteLineItems.length > 0 ? (
          <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
            <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
              Quote Value
            </p>
          </div>
        ) : null}
        {quoteLineItems.map(renderLineItemRow)}
        {variationLineItems.length > 0 ? (
          <div className="border-y border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
            <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
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
    if (!claimUpdatedAt) {
      setError("Claim version is missing. Please reload and try again.");
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
          source_document_id: item.sourceDocumentId,
          source_line_item_id: item.sourceLineItemId,
          claim_percent: Number(item.claimPercent.toFixed(3)),
        })),
      });
      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedRow = Array.isArray(data) ? (data[0] as SaveClaimDraftRow | undefined) : undefined;
      if (!savedRow?.id) {
        throw new Error("Claim was saved but no identifier was returned.");
      }
      if (!savedRow.updated_at) {
        throw new Error("Claim was saved but no version timestamp was returned.");
      }

      triggerDocumentClassification({
        documentKind: "project_claim",
        documentId: savedRow.id,
        keepalive: true,
      });

      setClaimUpdatedAt(savedRow.updated_at);
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
      setRetentionNormalizationStatus("compatible");
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

      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveClaimError) {
      setError(saveClaimError instanceof Error ? saveClaimError.message : "Unable to save claim.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteClaim = async () => {
    if (!claimId || !supabase || !organizationId || !projectDbId) {
      return;
    }

    if (!canManageClaim) {
      setError("You do not have permission to delete claims.");
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any).rpc("delete_project_claim_safe", {
        p_organization_id: organizationId,
        p_project_id: projectDbId,
        p_claim_id: claimId,
      });
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      setIsDeleteDialogOpen(false);
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/claims`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete claim.");
    } finally {
      setIsDeleting(false);
    }
  };

  const statutoryDocuments = useMemo(() => getPaymentClaimStatutoryDocuments({
    organisationCountry: organizationCountry,
  }), [organizationCountry]);
  const includesNzForm1 = statutoryDocuments.length > 0;

  const exportClaimPdf = async () => {
    if (!claimId || typeof window === "undefined" || isExporting) {
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const printableOrgName = organizationName.trim() || "Tradesstack";
      const printableProjectName = projectName || routeProjectSlug?.replaceAll("-", " ") || "Project";
      const legalNoticeText = includesNzForm1
        ? "This is a Payment Claim under the Construction Contracts Act 2002."
        : null;
      const result = await composePaymentClaimPdfExport({
        model: {
          organizationCountry,
          organizationName: printableOrgName,
          organizationLogoUrl,
          organizationBrandPrimaryColor,
          organizationBusinessNumber,
          organizationBankAccountDetails,
          organizationGstNumber,
          organizationContactName,
          organizationContactEmail,
          organizationContactPhone,
          projectName: printableProjectName,
          projectLocation,
          clientCompanyName,
          clientContactName,
          claimNumber,
          issueDateIso: claimDate || null,
          issueDateLabel: toDayMonthYearLabel(claimDate || new Date().toISOString().slice(0, 10)),
          dueDateLabel: toDayMonthYearLabel(dueDate || null),
          periodRangeLabel: toPeriodRangeLabel(periodStart || null, periodEnd || null),
          notes,
          legalNoticeText,
          originalContractLabel: toMoney(summaryOriginalContract),
          approvedVariationsLabel: toMoney(summaryApprovedVariations),
          revisedContractValueLabel: toMoney(summaryRevisedContractValue),
          valueEarnedToDateLabel: toMoney(summaryValueEarnedToDate),
          previousClaimsTotalLabel: toMoney(summaryPreviousClaimsTotal),
          grossCurrentClaimLabel: toMoney(summaryGrossCurrentClaim),
          retentionWithheldLabel: toMoney(summaryRetentionWithheldAmount),
          retentionHeldToDateLabel: toMoney(summaryRetentionHeldToDate),
          netCurrentClaimLabel: toMoney(summaryNetClaimExclGst),
          gstLabel: `GST (${(claimGstRate * 100).toFixed(0)}%)`,
          gstAmountLabel: toMoney(summaryGstAmount),
          totalPayableLabel: toMoney(summaryTotalPayable),
          lineItems: claimLineItemsComputed.map((line) => ({
            id: line.id,
            description: getClaimLineDescriptionText(line),
            sourceLabel: getClaimLineSourceText(line),
            secondaryLabel: line.sourceKind === "Variation" && line.sourceTitle ? line.sourceTitle : null,
            contractValueLabel: toMoney(line.sourceTotal),
            progressLabel: `${line.cumulativeClaimedPercent.toFixed(2)}%`,
            totalLabel: toMoney(line.cumulativeClaimedAmount),
          })),
        },
      });

      downloadPaymentClaimPdf(result.bytes, result.fileName);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export payment claim PDF.");
    } finally {
      setIsExporting(false);
    }
  };
  if (isLoading) {
    return (
      <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
        <OperationalModuleHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>Payment Claim</span>
              <StatusBadge status="draft">Draft</StatusBadge>
            </span>
          }
          description="Live claim calculation based on contract progress."
          actions={
            <>
              <Button type="button" variant="secondary" disabled>Save Claim</Button>
              <Button type="button" disabled>Export PDF</Button>
              <Button type="button" variant="secondary" size="sm" disabled className="h-9 px-3">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </>
          }
        />

        <div className="space-y-6">
          <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
            <div className="space-y-5">
              <section className="border-b border-[var(--border-subtle)] pb-5">
                <div className="h-10 w-56 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)] md:col-span-2" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                </div>
              </section>
              <section className="border-b border-[var(--border-subtle)] py-5">
                <div className="h-10 w-48 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                  <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                </div>
              </section>
              <section className="py-5">
                <div className="h-10 w-40 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                <div className="mt-4 h-56 animate-pulse rounded-[18px] bg-[var(--border-subtle)]" />
                <p className={`${styles.quoteBodyLabel} pt-4`}>Loading claim...</p>
              </section>
              <div className="border-t border-[var(--border-subtle)] py-6">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
                  <div className="space-y-4">
                    <div className="h-10 w-44 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                    <div className="h-28 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                    <div className="space-y-3">
                      <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                      <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                      <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                      <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
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
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalModuleHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              {accountingIdentity.displayAccountingNumber || "Payment Claim"}
            </span>
            <StatusBadge status={claimStatusBadge(status)}>{status}</StatusBadge>
          </span>
        }
        description={
          [
            accountingIdentity.hasReplacementIdentity
              ? `Payment Claim ${accountingIdentity.commercialClaimNumber}`
              : null,
            saveMessage
              ? `${saveMessage}`
              : `Live claim calculation based on contract progress${projectName ? ` for ${projectName}` : ""}.`,
          ].filter(Boolean).join(" · ")
        }
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void saveClaim();
              }}
              disabled={isSaving || !claimId}
            >
              {isSaving ? "Saving..." : "Save Claim"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                void exportClaimPdf();
              }}
              disabled={!claimId || isExporting}
            >
              {isExporting ? "Exporting..." : "Export PDF"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="h-9 px-3">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="!z-[200] min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]">
                <DropdownMenuItem asChild className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]">
                  <Link href={`/app/projects/${routeProjectSlug}/preconstruction/claims`}>
                    <ExternalLink className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                    Claims Register
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void createClaim();
                  }}
                  disabled={isCreatingClaim || !projectDbId || !organizationId}
                  className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                >
                  <Plus className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                  {isCreatingClaim ? "Creating..." : "New Claim"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void saveClaim();
                  }}
                  disabled={isSaving || !claimId}
                  className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                >
                  <Save className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                  {isSaving ? "Saving..." : "Save Claim"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void exportClaimPdf();
                  }}
                  disabled={!claimId || isExporting}
                  className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                >
                  <FileDown className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                  {isExporting ? "Exporting..." : "Export PDF"}
                </DropdownMenuItem>
                {claimId && canManageClaim ? (
                  <>
                    <DropdownMenuSeparator className="my-1 bg-[var(--border)]" />
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        setIsDeleteDialogOpen(true);
                      }}
                      disabled={isDeleting}
                      className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--error)] focus:bg-[var(--error-light)] focus:text-[var(--error)]"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {error ? (
        <OperationalAlert variant="error">
          {error}
        </OperationalAlert>
      ) : null}
      {!canManageClaim && session ? (
        <OperationalAlert variant="warning">
          You can review this claim, but only owner, admin, QS, and project manager roles can edit or delete it.
        </OperationalAlert>
      ) : null}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-[520px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-0 shadow-[var(--shadow-lg)] sm:w-full">
          <DialogHeader className="border-b border-[var(--border)] px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
            <DialogTitle className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
              Delete payment claim {claimNumber || "this claim"}?
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-6 text-[var(--text-secondary)]">
              This will permanently delete this payment claim and its line items. Claims after it will be recalculated. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-5 py-4 sm:px-6">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isDeleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void deleteClaim();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6 [&_input]:border-[var(--border)] [&_input]:bg-[var(--surface)] [&_input]:text-[var(--text-primary)] [&_select]:border-[var(--border)] [&_select]:bg-[var(--surface)] [&_select]:text-[var(--text-primary)] [&_textarea]:border-[var(--border)] [&_textarea]:bg-[var(--surface)] [&_textarea]:text-[var(--text-primary)]">
        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
          <section className="border-b border-[var(--border-subtle)] pb-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Claim Workspace</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Claim No.</label>
                  <Input value={claimNumber} onChange={(event) => setClaimNumber(event.target.value)} className="h-10 rounded-[6px] bg-[var(--surface-muted)]" disabled />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Xero Invoice No.</label>
                  <Input
                    value={accountingIdentity.displayAccountingNumber}
                    className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
                    disabled
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className={styles.quoteBodyLabel}>Claim Title</label>
                  <Input value={claimTitle} onChange={(event) => setClaimTitle(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Claim Type</label>
                  <select value={claimType} onChange={(event) => setClaimType(event.target.value as ClaimType)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]`} disabled={isSubmittedLocked}>
                    <option value="Progress">Progress</option>
                    <option value="Deposit">Deposit</option>
                    <option value="Final">Final</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Status</label>
                  <select value={status} onChange={(event) => setStatus(event.target.value as ClaimStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]`}>
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
                  <Input type="number" value={displayedPercentComplete} className="h-10 rounded-[6px] bg-[var(--surface-muted)]" disabled />
                </div>
              </div>
            </div>
          </section>

          <section className="border-b border-[var(--border-subtle)] py-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Claim Period</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Claim Date</label><Input type="date" value={claimDate} onChange={(event) => setClaimDate(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Due Date</label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Period Start</label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Period End</label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
            </div>
          </section>

          <section className="border-b border-[var(--border-subtle)] py-5">
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
                  className={`${styles.quoteButtonLabel} h-9 rounded-full border-[var(--border)] bg-[var(--surface-muted)] px-4`}
                >
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  Expand
                </Button>
                <ChevronDown className={`h-4 w-4 text-[var(--text-secondary)] transition-transform ${isLineItemsOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {isLineItemsOpen ? (
              <div className="mt-4 space-y-4">
                {renderLineItemsTable()}
              </div>
            ) : null}
          </section>

          <div className="border-t border-[var(--border-subtle)] py-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
              <div>
                <section className="pt-0">
                  <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Payment & Notes</h2>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                          <p className={styles.quoteCardTitle}>Claim Status</p>
                          <p className={styles.quoteBodyLabel}>Current lifecycle state</p>
                          <StatusBadge status={claimStatusBadge(status)}>{status}</StatusBadge>
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
                      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={`${interMedium.className} min-h-[110px] w-full rounded-[6px] border border-[var(--border)] px-3 py-2 text-sm`} disabled={isSubmittedLocked} />
                    </div>
                  </div>
                </section>
              </div>

              <div className="border-t border-[var(--border-subtle)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle} mb-4`}>Claim Summary</h2>
                <div className="space-y-5">
                  <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                    <div className={`${interMedium.className} space-y-3 text-sm`}>
                      <p className={styles.quoteCardTitle}>Contract Position</p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Contract Amount</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryOriginalContract)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Approved Variations</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryApprovedVariations)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Revised Contract Value</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryRevisedContractValue)}</span>
                      </p>
                      <div className="h-px bg-[var(--border)]" />

                      <p className={styles.quoteCardTitle}>Claim Position</p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Gross Claim To Date</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryValueEarnedToDate)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Less Previous Claims</span>
                        <span className="font-medium text-[var(--text-primary)]">-{toMoney(summaryPreviousClaimsTotal)}</span>
                      </p>
                      <p className="flex items-center justify-between pt-1">
                        <span className="text-[var(--text-secondary)]">Gross Current Claim</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryGrossCurrentClaim)}</span>
                      </p>
                      <div className="h-px bg-[var(--border)]" />

                      <p className={styles.quoteCardTitle}>Retention</p>
                      <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <label className={styles.quoteBodyLabel}>Retention %</label>
                          <Dialog open={isRetentionSelectorOpen} onOpenChange={handleRetentionDialogOpenChange}>
                            <DialogTrigger asChild>
                              <button
                                type="button"
                                disabled={isRetentionLocked}
                                className="relative flex h-10 w-full items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 pr-8 text-left text-[14px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-muted)]"
                              >
                                <span className="truncate">{retentionSelectorDisplay}</span>
                                {retentionMethod === "flat" ? (
                                  <span className={`${interMedium.className} pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-sm text-[var(--text-secondary)]`}>%</span>
                                ) : null}
                                <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)] transition-transform ${isRetentionSelectorOpen ? "rotate-180" : ""}`} />
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-[760px] overflow-y-auto rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface)] p-0 shadow-[0_10px_28px_rgba(15,23,42,0.08)] sm:w-full">
                              <DialogHeader className="border-b border-[var(--border-subtle)] px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="space-y-1.5">
                                    <DialogTitle className={`${ibmPlexSans.className} m-0 text-[24px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>
                                      Retention
                                    </DialogTitle>
                                    <p className={styles.quoteBodyLabel}>
                                      Configure retention method and bands
                                    </p>
                                  </div>
                                  <DialogClose asChild>
                                    <button
                                      type="button"
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
                                      aria-label="Close retention dialog"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </DialogClose>
                                </div>
                              </DialogHeader>
                              <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
                                {retentionNormalizationStatus === "lossy" ? (
                                  <p className={`${interMedium.className} rounded-[12px] border border-[var(--warning-light)] bg-[var(--warning-light)] px-3.5 py-3 text-[13px] leading-5 text-[var(--warning)]`}>
                                    This claim used an older retention band structure and has been converted into the new fixed 3-band editor. Retention above previous caps may now behave differently, so please review the three band values before saving.
                                  </p>
                                ) : null}
                                <div className="inline-flex w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-1 sm:w-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectRetentionMethod("flat")}
                                    className={`inline-flex flex-1 items-center justify-center rounded-[10px] px-4 py-2.5 text-[14px] font-medium transition-colors sm:flex-none ${
                                      retentionMethod === "flat"
                                        ? "bg-[var(--surface)] text-[var(--brand-blue)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    }`}
                                  >
                                    Flat %
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectRetentionMethod("sliding_scale")}
                                    className={`inline-flex flex-1 items-center justify-center rounded-[10px] px-4 py-2.5 text-[14px] font-medium transition-colors sm:flex-none ${
                                      retentionMethod === "sliding_scale"
                                        ? "bg-[var(--surface)] text-[var(--brand-blue)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    }`}
                                  >
                                    Sliding Scale
                                  </button>
                                </div>
                                {retentionMethod === "flat" ? (
                                  <>
                                    <div className="grid grid-cols-2 gap-3">
                                      {RETENTION_PRESET_OPTIONS.map((option) => {
                                        const isSelected = Math.abs(retentionPercentNumber - option) < 0.001 && !hasCustomRetentionPercent;
                                        return (
                                          <button
                                            key={option}
                                            type="button"
                                            onClick={() => handleSelectRetentionPreset(option)}
                                            className={`${retentionChoiceButtonClass} ${
                                              isSelected
                                                ? "border-[var(--orange-primary)] bg-[var(--warning-light)] text-[var(--text-primary)]"
                                                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
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
                                            ? "border-[var(--orange-primary)] bg-[var(--warning-light)] text-[var(--text-primary)]"
                                            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                                        }`}
                                      >
                                        Custom
                                      </button>
                                    </div>
                                    {isRetentionCustomMode || hasCustomRetentionPercent ? (
                                      <div className="space-y-3">
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
                                          <span className={`${interMedium.className} pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-secondary)]`}>%</span>
                                        </div>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <div className="space-y-4">
                                    <div className="space-y-4">
                                      {retentionScaleBandDraftRows.map((band, index) => {
                                        const previousUpperBound = retentionScaleBandDraftRows
                                          .slice(0, index)
                                          .reduce((sum, row) => sum + Math.max(0, numberOrZero(row.amount)), 0);
                                        const isRemainingTier = index === 2;
                                        const bandAmount = Math.max(0, numberOrZero(band.amount));
                                        const rowLabel = index === 0 ? "First" : index === 1 ? "Next" : "Remaining";
                                        const amountLabel = `${rowLabel} amount`;

                                        return (
                                          <div
                                            key={band.id ?? `retention-tier-${index}`}
                                            className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-4 sm:px-5"
                                          >
                                            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
                                              <div className="space-y-1">
                                                <p className={styles.quoteCardTitle}>{rowLabel}</p>
                                                <p className={`${interMedium.className} text-[13px] text-[var(--text-secondary)]`}>
                                                  {isRemainingTier
                                                    ? `Remaining amount at ${numberOrZero(band.rate_percent)}%`
                                                    : `${rowLabel} ${toMoney(numberOrZero(bandAmount))} at ${numberOrZero(band.rate_percent)}%`}
                                                </p>
                                              </div>
                                            </div>
                                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                              <div className="space-y-2.5">
                                                <label className={retentionLabelClass}>{amountLabel}</label>
                                                {isRemainingTier ? (
                                                  <div className="flex h-10 items-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5">
                                                    <p className={`${interMedium.className} text-[13px] text-[var(--text-secondary)]`}>
                                                      Remaining amount above {toMoney(previousUpperBound)}
                                                    </p>
                                                  </div>
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
                                              <div className="space-y-2.5">
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
                                                  <span className={`${interMedium.className} pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-secondary)]`}>%</span>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                <div className="flex flex-col-reverse gap-3 border-t border-[var(--border-subtle)] pt-5 sm:flex-row sm:items-center sm:justify-end">
                                  <DialogClose asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface-muted)] px-5`}
                                    >
                                      Cancel
                                    </Button>
                                  </DialogClose>
                                  <Button
                                    type="button"
                                    onClick={() => setIsRetentionSelectorOpen(false)}
                                    className={`${styles.quoteButtonLabel} h-10 rounded-full bg-[var(--navy-primary)] px-6 !text-white hover:bg-[var(--navy-primary)]`}
                                  >
                                    Done
                                  </Button>
                                </div>
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
                      <div className="h-px bg-[var(--border)]" />
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Less Retention (This Claim)</span>
                        <span className="font-medium text-[var(--text-primary)]">-{toMoney(summaryRetentionWithheldAmount)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Retention Held to Date</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryRetentionHeldToDate)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Retention Released to Date</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryRetentionReleasedToDate)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Current Retention Balance</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryRetentionBalance)}</span>
                      </p>
                      <div className="h-px bg-[var(--border)]" />
                      <p className={styles.quoteCardTitle}>Payment Breakdown</p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">Net Current Claim (excl. GST)</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryNetClaimExclGst)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">GST ({(claimGstRate * 100).toFixed(0)}%)</span>
                        <span className="font-medium text-[var(--text-primary)]">{toMoney(summaryGstAmount)}</span>
                      </p>
                      <p className="flex items-center justify-between pt-1">
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">Total Payable (incl. GST)</span>
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">{toMoney(summaryTotalPayable)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <Button type="button" onClick={() => void saveClaim()} disabled={isSaving || !claimId} variant="outline" className={`${styles.quoteButtonLabel} h-10 w-full rounded-full border-[var(--border)] bg-[var(--surface-muted)]`}>
                      {isSaving ? "Saving..." : "Save Claim"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        void exportClaimPdf();
                      }}
                      disabled={!claimId || isExporting}
                      className={`${styles.quoteButtonLabel} h-10 w-full rounded-full bg-[var(--navy-primary)] !text-white hover:bg-[var(--navy-primary)]`}
                    >
                      {isExporting ? "Exporting..." : "Export PDF"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {claimId ? (
        <PaymentClaimXeroPanel
          claimId={claimId}
          savedRevision={claimUpdatedAt}
          initialState={props.initialXeroPanelState}
          onStateChange={applyXeroPanelIdentity}
        />
      ) : null}

      {isLineItemsExpanded ? (
        <div className="fixed inset-0 z-[240] bg-[var(--navy-primary)]/55 p-4 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
              <h2 className={styles.quoteSectionTitle}>Line Items</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLineItemsExpanded(false)}
                className={`${styles.quoteButtonLabel} h-9 rounded-full border-[var(--border)] bg-[var(--surface-muted)] px-4`}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Close
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-5 py-3">
              <div className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5">
                <span className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>Quote Total</span>
                <span className={`${interMedium.className} text-sm font-semibold text-[var(--text-primary)]`}>{toMoney(quoteLineTotalValue)}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5">
                <span className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>Variation Total</span>
                <span className={`${interMedium.className} text-sm font-semibold text-[var(--text-primary)]`}>{toMoney(variationLineTotalValue)}</span>
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
