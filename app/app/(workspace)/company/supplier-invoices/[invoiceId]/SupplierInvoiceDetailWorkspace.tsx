"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useEffect } from "react";
import { AlertTriangle, ChevronRight, ChevronUp, ExternalLink, MoreVertical, Printer, Search, Sparkles, Trash2 } from "lucide-react";
import {
  CommercialLineDescriptionField,
  CommercialLineItemActionButton,
  CommercialLineItemsAddButton,
  CommercialLineItemsCell,
  CommercialLineItemsRow,
  CommercialLineItemsTable,
  CommercialLinePrefixedNumberInput,
  CommercialLineTextInput,
  CommercialSummaryCard,
  CommercialSummaryRow,
  formatCommercialDocumentMoney,
  formatCommercialDocumentMoneyValue,
  formatCommercialPriceNumber,
} from "@/components/app/CommercialLineItemsTable";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import {
  deriveSupplierInvoicePurchaseOrderLineAmounts,
  isActiveSupplierInvoicePurchaseOrderMatch,
} from "@/components/app/supplier-invoice-allocation-presentation";
import {
  SupplierInvoiceAllocationModal,
  type SupplierInvoiceAllocationModalGroup,
} from "@/components/app/SupplierInvoiceAllocationModal";
import {
  SupplierInvoiceTeamApprovalPanel,
  type SupplierInvoiceTeamApprovalGroup,
} from "@/components/app/SupplierInvoiceTeamApprovalPanel";
import {
  SupplierInvoiceReadyForXeroPanel,
  type SupplierInvoiceReadyStatus,
} from "@/components/app/SupplierInvoiceReadyForXeroPanel";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { summarizeApprovedUnpostedAllocations } from "@/lib/actual-cost-events";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import {
  buildSupplierInvoiceIntelligenceEvent,
  createSupplierInvoiceAiInteraction,
  hasAiSupplierInvoiceMatchSuggestion,
  logSupplierInvoiceIntelligenceFailure,
  summarizeSupplierInvoiceHeader,
  summarizeSupplierInvoiceMatch,
  writeSupplierInvoiceCorrectionEvent,
  writeSupplierInvoiceIntelligenceEvents,
} from "@/lib/supplier-invoice-intelligence";
import { getSupplierDisplayName, type OrganizationSupplierRow } from "@/lib/suppliers";
import {
  approveSupplierInvoiceCommerciallyAction,
  approveSupplierInvoiceDraftAllocationAction,
  cancelSupplierInvoiceXeroBillExportAction,
  disputeSupplierInvoiceDraftAllocationAction,
  markSupplierInvoiceLineAllocationUnmatchedAction,
  postSupplierInvoiceActualCostsAction,
  prepareSupplierInvoiceXeroBillExportAction,
  refreshSupplierInvoiceCommercialComparisonAction,
  refreshSupplierInvoiceXeroBillStatusAction,
  rejectSupplierInvoiceCommerciallyAction,
  retrySupplierInvoiceXeroBillExportAction,
  reverseSupplierInvoiceActualCostEventAction,
  saveAllReadySupplierInvoiceDraftAllocationsAction,
  saveSupplierInvoiceDraftAllocationAction,
  saveSupplierInvoiceCaptureAction,
  submitSupplierInvoiceForSiteApprovalAction,
  approveSupplierInvoiceForXeroAction,
  suggestSupplierInvoicePurchaseOrdersAction,
  confirmSupplierInvoicePurchaseOrderMatchAction,
  deleteSupplierInvoiceAction,
  removeSupplierInvoicePurchaseOrderMatchAction,
  attachSupplierInvoiceDocumentAction,
  loadSupplierInvoiceDocumentStateAction,
  retrySupplierInvoiceDocumentExtractionAction,
  updateSupplierInvoiceAllocationCommercialCodingAction,
} from "./actions";
import type {
  AcceptedCommercialVarianceInput,
  PurchaseOrderCommercialProgress,
  SupplierInvoiceCommercialComparison,
} from "@/lib/procurement-commercial-server";
import type { PurchaseOrderLineItemRow } from "@/lib/supplier-invoice-lineage";
import type {
  SupplierInvoiceDraftExtraction,
  SupplierInvoiceExtractionField,
  SupplierInvoiceExtractionLineDraft,
} from "@/lib/supplier-invoice-document-extraction";
import type { SupplierInvoiceXeroBillReadiness } from "@/lib/xero/bills";
import type { SupplierInvoiceAllocationPreviewStatus } from "@/lib/supplier-invoices";
import {
  calculateMatchedInvoiceTotal,
  deriveSupplierInvoiceDisplayStatus,
  formatSupplierInvoiceActivityEventLabel,
  formatMatchStatusLabel,
  formatSupplierInvoiceMatchApprovalStatusLabel,
  getSourceLabel,
  matchCountsTowardInvoiceTotal,
  SUPPLIER_INVOICE_DOCUMENTS_BUCKET,
  toDateInputValue,
  toDayMonthYearLabel,
  toMoney,
  type SupplierInvoiceActivityEventRow,
  type SupplierInvoiceApprovalStepRow,
  type SupplierInvoiceDisplayStatus,
  type SupplierInvoiceDocumentExtractionRow,
  type SupplierInvoiceDocumentRow,
  type SupplierInvoiceLineAllocationRow,
  type SupplierInvoiceLineRow,
  type SupplierInvoicePurchaseOrderMatchRow,
  type SupplierInvoiceMatchApprovalStatus,
  type SupplierInvoiceMatchStatus,
  type ProjectActualCostEventRow,
  type SupplierInvoiceRow,
} from "@/lib/supplier-invoices";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import styles from "@/components/app/trade-pack-builder.module.css";
import type {
  SupplierInvoicePurchaseOrderSuggestion,
  SupplierInvoiceWorkflowState,
} from "@/lib/supplier-invoice-workflow";

type OrganizationProjectRow = Database["public"]["Tables"]["organization_projects"]["Row"];
type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];
type OrganizationMemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type PurchaseOrderCandidateRow = {
  id: string;
  project_id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  supplier_id: string | null;
  issued_to_label: string | null;
  status: string;
  requested_date: string | null;
  total_purchase_order_price: number | null;
};
type PurchaseOrderMatchDraft = {
  id?: string;
  matchedAmount: string;
  matchStatus: "accepted" | "adjusted";
};
type PurchaseOrderMatchWithContext = SupplierInvoicePurchaseOrderMatchRow & {
  purchaseOrder: PurchaseOrderCandidateRow | null;
  approverName: string | null;
};
type SupplierInvoiceApprovalStepWithMember = SupplierInvoiceApprovalStepRow & {
  approverName: string;
};
type SupplierInvoiceActivityEventWithMember = SupplierInvoiceActivityEventRow & {
  actorName: string;
};
type SupplierInvoiceHistoryRow = {
  id: string;
  createdAt: string | null;
  user: string;
  action: string;
  detail: string;
};
type SupplierInvoiceAllocationPreviewData = {
  candidateKey: string;
  invoiceLineId: string;
  invoiceLineDescription: string;
  invoiceLineAmount: number;
  candidatePurchaseOrderId: string | null;
  candidatePurchaseOrderNumber: string | null;
  candidatePurchaseOrderTitle: string | null;
  candidatePurchaseOrderLineItemId: string | null;
  candidatePurchaseOrderLineDescription: string | null;
  candidatePurchaseOrderLineAmount: number | null;
  costItemId: string | null;
  sourceCostItemId: string | null;
  tradesstackCostCode: string | null;
  tradesstackCostCodeLabel: string | null;
  workType: string | null;
  costType: string | null;
  internalCostCode: string | null;
  organizationCostCodeId: string | null;
  organizationCostCode: string | null;
  organizationCostCodeName: string | null;
  accountingResolutionStatus: string;
  status: SupplierInvoiceAllocationPreviewStatus;
  candidateScore: number;
};

type AllocationReviewTableRow = {
  line: LineFormState;
  lineDraftAllocations: SupplierInvoiceLineAllocationRow[];
  candidatePreviewRows: SupplierInvoiceAllocationPreviewData[];
  selectedAllocation: SupplierInvoiceLineAllocationRow | null;
  selectedPreviewRow: SupplierInvoiceAllocationPreviewData;
  operationalStatus: AllocationOperationalStatus;
  alternateCandidateCount: number;
  lineHasServerBackedPreview: boolean;
  lineHasPostedActualCosts: boolean;
};

type SupplierInvoiceDetailWorkspaceProps = {
  organizationId: string;
  initialInvoice: SupplierInvoiceRow;
  suppliers: OrganizationSupplierRow[];
  initialLines: SupplierInvoiceLineRow[];
  initialCurrentDocument: SupplierInvoiceDocumentRow | null;
  initialDocumentExtraction: SupplierInvoiceDocumentExtractionRow | null;
  initialMatches: SupplierInvoicePurchaseOrderMatchRow[];
  initialApprovalSteps: SupplierInvoiceApprovalStepRow[];
  initialActivityEvents: SupplierInvoiceActivityEventRow[];
  purchaseOrders: PurchaseOrderCandidateRow[];
  projects: OrganizationProjectRow[];
  costCodes: OrganizationCostCodeRow[];
  organizationMembers: OrganizationMemberRow[];
  allocationPreviewRows: SupplierInvoiceAllocationPreviewData[];
  matchedPurchaseOrderLines: PurchaseOrderLineItemRow[];
  matchedPurchaseOrderProgress: PurchaseOrderCommercialProgress[];
  initialDraftAllocations: SupplierInvoiceLineAllocationRow[];
  initialActualCostEvents: ProjectActualCostEventRow[];
  initialCommercialComparison: SupplierInvoiceCommercialComparison;
  initialXeroBillReadiness: SupplierInvoiceXeroBillReadiness | null;
  initialXeroBillReadinessError: string | null;
  initialWorkflowState: SupplierInvoiceWorkflowState;
  accountingMappings: Array<{ id: string; label: string }>;
  accountingTaxRates: Array<{ id: string; label: string }>;
  canWrite: boolean;
  canReview: boolean;
  canReverse: boolean;
  canExportXeroBill: boolean;
  canRefreshXeroBill: boolean;
  canSubmitSiteReview: boolean;
  canAccountsApprove: boolean;
  canDeleteInvoice: boolean;
};

type InvoiceFormState = {
  supplierId: string;
  invoiceNumber: string;
  supplierPoReference: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string;
  status: SupplierInvoiceRow["status"];
};

type LineFormState = {
  id: string;
  description: string;
  supplierItemCode: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  taxAmount: string;
  costCodeId: string;
  projectId: string;
};

type DocumentWithUrl = SupplierInvoiceDocumentRow & {
  signedUrl: string | null;
};

type HeaderApplyKey =
  | "supplierId"
  | "invoiceNumber"
  | "supplierPoReference"
  | "invoiceDate"
  | "dueDate"
  | "subtotal"
  | "taxTotal"
  | "total"
  | "notes";

type HeaderApplyMode = "current" | "extracted";

function numberString(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInvoiceSummaryPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  const rounded = Number((value * 100).toFixed(2));
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "");
}

function buildPurchaseOrderMatchCompactSummary(match: SupplierInvoicePurchaseOrderMatchRow) {
  return summarizeSupplierInvoiceMatch({
    supplierInvoiceId: match.supplier_invoice_id,
    purchaseOrderId: match.purchase_order_id,
    matchedAmount: Number(match.matched_amount ?? 0),
    matchStatus: match.match_status,
    approvalStatus: match.approval_status,
    matchBasis: match.match_basis,
    confidenceScore: match.confidence_score,
  });
}

function normalizePurchaseOrderSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toInvoiceFormState(invoice: SupplierInvoiceRow): InvoiceFormState {
  return {
    supplierId: invoice.supplier_id ?? "",
    invoiceNumber: invoice.invoice_number ?? "",
    supplierPoReference: invoice.supplier_po_reference ?? "",
    invoiceDate: toDateInputValue(invoice.invoice_date),
    dueDate: toDateInputValue(invoice.due_date),
    subtotal: Number(invoice.subtotal ?? 0).toFixed(2),
    taxTotal: Number(invoice.tax_total ?? 0).toFixed(2),
    total: Number(invoice.total ?? 0).toFixed(2),
    notes: invoice.notes ?? "",
    status: invoice.status,
  };
}

function toLineFormState(line: SupplierInvoiceLineRow): LineFormState {
  return {
    id: line.id,
    description: line.description ?? "",
    supplierItemCode: line.supplier_item_code ?? "",
    quantity: Number(line.quantity ?? 0).toString(),
    unitPrice: Number(line.unit_price ?? 0).toFixed(2),
    lineTotal: Number(line.line_total ?? 0).toFixed(2),
    taxAmount: Number(line.tax_amount ?? 0).toFixed(2),
    costCodeId: line.cost_code_id ?? "",
    projectId: line.project_id ?? "",
  };
}

function makeEmptyLine(): LineFormState {
  return {
    id: crypto.randomUUID(),
    description: "",
    supplierItemCode: "",
    quantity: "1",
    unitPrice: "0.00",
    lineTotal: "0.00",
    taxAmount: "0.00",
    costCodeId: "",
    projectId: "",
  };
}

function formatHistoryDate(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Pending";
  }

  return parsed
    .toLocaleString("en-NZ", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(",", "")
    .replace(/\s(am|pm)$/i, (match) => match.toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDocumentExtractionDraft(
  extraction: SupplierInvoiceDocumentExtractionRow | null
): SupplierInvoiceDraftExtraction | null {
  if (!extraction || extraction.status !== "completed" || !isRecord(extraction.extracted_payload_json)) {
    return null;
  }

  const payload = extraction.extracted_payload_json;
  if (
    !isRecord(payload.header)
    || !Array.isArray(payload.lines)
    || !Array.isArray(payload.warnings)
    || !isRecord(payload.supplierMatch)
    || !isRecord(payload.extractionMeta)
  ) {
    return null;
  }

  return payload as unknown as SupplierInvoiceDraftExtraction;
}

function normalizeComparableValue(value: string) {
  return value.trim();
}

function extractionFieldStateLabel(value: SupplierInvoiceExtractionField<unknown>["state"]) {
  switch (value) {
    case "found":
      return "Found";
    case "inferred":
      return "Inferred";
    case "unreadable":
      return "Unreadable";
    case "missing":
    default:
      return "Missing";
  }
}

function extractionFieldBadgeStatus(value: SupplierInvoiceExtractionField<unknown>["state"]): NonNullable<StatusBadgeProps["status"]> {
  switch (value) {
    case "found":
      return "approved";
    case "inferred":
      return "sent";
    case "unreadable":
      return "overdue";
    case "missing":
    default:
      return "draft";
  }
}

function formatExtractionFieldValue(
  field: SupplierInvoiceExtractionField<string | number>,
  options?: { money?: boolean }
) {
  if (field.value === null || field.value === "") {
    return "Not extracted";
  }

  if (typeof field.value === "number") {
    return options?.money ? Number(field.value).toFixed(2) : String(field.value);
  }

  return field.value;
}

function formatExtractionEvidence(field: SupplierInvoiceExtractionField<unknown>) {
  const primaryEvidence = field.evidence[0];
  if (!primaryEvidence) {
    return null;
  }

  const pageLabel =
    typeof primaryEvidence.sourcePage === "number" ? `Page ${primaryEvidence.sourcePage}` : "Page unknown";
  return primaryEvidence.excerpt ? `${pageLabel} · ${primaryEvidence.excerpt}` : pageLabel;
}

function buildAppliedLineState(line: SupplierInvoiceExtractionLineDraft): LineFormState {
  return {
    id: crypto.randomUUID(),
    description: line.description.value ?? "",
    supplierItemCode: line.supplierItemCode.value ?? "",
    quantity:
      typeof line.quantity.value === "number" && Number.isFinite(line.quantity.value)
        ? String(line.quantity.value)
        : "1",
    unitPrice:
      typeof line.unitPrice.value === "number" && Number.isFinite(line.unitPrice.value)
        ? Number(line.unitPrice.value).toFixed(2)
        : "0.00",
    lineTotal:
      typeof line.lineTotal.value === "number" && Number.isFinite(line.lineTotal.value)
        ? Number(line.lineTotal.value).toFixed(2)
        : typeof line.lineSubtotal.value === "number" && Number.isFinite(line.lineSubtotal.value)
          ? Number(line.lineSubtotal.value).toFixed(2)
          : "0.00",
    taxAmount:
      typeof line.taxAmount.value === "number" && Number.isFinite(line.taxAmount.value)
        ? Number(line.taxAmount.value).toFixed(2)
        : "0.00",
    costCodeId: "",
    projectId: "",
  };
}

function formatConstructionIntelligenceSummary(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const primary = [value.trade, value.subtrade, value.system, value.product]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" / ");
  const secondary = [value.brand, value.activity, value.likely_use]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" · ");

  if (!primary && !secondary) {
    return null;
  }

  return [primary, secondary].filter(Boolean).join(" · ");
}

function displayStatusBadge(value: SupplierInvoiceDisplayStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (value) {
    case "Approved":
      return "approved";
    case "Partially Approved":
      return "sent";
    case "Needs Review":
      return "pending";
    case "Disputed":
      return "overdue";
    case "Captured":
    default:
      return "draft";
  }
}

function matchApprovalBadge(value: SupplierInvoiceMatchApprovalStatus | string): NonNullable<StatusBadgeProps["status"]> {
  switch (value) {
    case "approved":
      return "approved";
    case "disputed":
      return "overdue";
    case "pending":
    default:
      return "pending";
  }
}

function matchStatusBadge(value: SupplierInvoiceMatchStatus | string): NonNullable<StatusBadgeProps["status"]> {
  switch (value) {
    case "accepted":
      return "approved";
    case "adjusted":
      return "sent";
    case "rejected":
      return "overdue";
    default:
      return "draft";
  }
}

type AllocationOperationalStatus =
  | "Ready"
  | "Needs review"
  | "Approved"
  | "Posted"
  | "Needs correction"
  | "Corrected";

const ACTUAL_COST_REVERSAL_REASONS = [
  { value: "allocation_correction", label: "Allocation correction" },
  { value: "classification_correction", label: "Classification correction" },
  { value: "accounting_mapping_correction", label: "Accounting mapping correction" },
  { value: "duplicate_posting", label: "Duplicate posting" },
  { value: "other", label: "Other" },
] as const;

function allocationOperationalStatusBadge(value: AllocationOperationalStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (value) {
    case "Posted":
    case "Corrected":
      return "approved";
    case "Approved":
      return "sent";
    case "Ready":
      return "draft";
    case "Needs correction":
      return "overdue";
    case "Needs review":
    default:
      return "pending";
  }
}

function allocationExceptionBadgeStatus(
  value:
    | "Needs classification review"
    | "Needs accounting mapping"
    | "Unmatched"
    | "Disputed"
    | "Needs correction"
): NonNullable<StatusBadgeProps["status"]> {
  switch (value) {
    case "Unmatched":
      return "draft";
    case "Needs accounting mapping":
      return "sent";
    case "Disputed":
    case "Needs correction":
      return "overdue";
    case "Needs classification review":
    default:
      return "pending";
  }
}

function actualCostHistoryLabel(event: ProjectActualCostEventRow) {
  if (event.event_type === "reversal") {
    return "Reversal";
  }

  if (
    event.event_type === "posting" &&
    event.correction_root_event_id &&
    event.correction_root_event_id !== event.id
  ) {
    return "Repost";
  }

  return "Posted";
}

const FIELD_SELECT_CLASS =
  "h-11 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD_TEXTAREA_CLASS =
  "flex min-h-[8.5rem] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function SupplierInvoiceDetailWorkspace({
  organizationId,
  initialInvoice,
  suppliers,
  initialLines,
  initialCurrentDocument,
  initialDocumentExtraction,
  initialMatches,
  initialApprovalSteps,
  initialActivityEvents,
  purchaseOrders,
  projects,
  costCodes,
  organizationMembers,
  allocationPreviewRows,
  matchedPurchaseOrderLines,
  matchedPurchaseOrderProgress,
  initialDraftAllocations,
  initialActualCostEvents,
  initialCommercialComparison,
  initialXeroBillReadiness,
  initialXeroBillReadinessError,
  initialWorkflowState,
  accountingMappings,
  accountingTaxRates,
  canWrite,
  canReview,
  canReverse,
  canExportXeroBill,
  canRefreshXeroBill,
  canSubmitSiteReview,
  canAccountsApprove,
  canDeleteInvoice,
}: SupplierInvoiceDetailWorkspaceProps) {
  const router = useRouter();
  const { session } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [invoice, setInvoice] = useState(initialInvoice);
  const [formState, setFormState] = useState<InvoiceFormState>(() =>
    toInvoiceFormState(initialInvoice)
  );
  const [lines, setLines] = useState<LineFormState[]>(
    initialLines.length > 0 ? initialLines.map(toLineFormState) : []
  );
  const [currentDocument, setCurrentDocument] = useState<SupplierInvoiceDocumentRow | null>(
    initialCurrentDocument
  );
  const [currentDocumentSignedUrl, setCurrentDocumentSignedUrl] = useState<string | null>(null);
  const [documentExtraction, setDocumentExtraction] =
    useState<SupplierInvoiceDocumentExtractionRow | null>(initialDocumentExtraction);
  const [matches, setMatches] = useState(initialMatches);
  const [approvalSteps, setApprovalSteps] = useState(initialApprovalSteps);
  const [activityEvents, setActivityEvents] = useState(initialActivityEvents);
  const [draftAllocations, setDraftAllocations] = useState(initialDraftAllocations);
  const [actualCostEvents, setActualCostEvents] = useState(initialActualCostEvents);
  const [commercialComparison, setCommercialComparison] = useState(
    initialCommercialComparison
  );
  const [xeroBillReadiness, setXeroBillReadiness] = useState(
    initialXeroBillReadiness
  );
  const [workflowState, setWorkflowState] = useState(initialWorkflowState);
  const [poSuggestions, setPoSuggestions] = useState<SupplierInvoicePurchaseOrderSuggestion[]>([]);
  const [isUpdatingWorkflow, setIsUpdatingWorkflow] = useState(false);
  const [accountsApprovalNote, setAccountsApprovalNote] = useState("");
  const [isUpdatingXeroBill, setIsUpdatingXeroBill] = useState(false);
  const [acceptedVarianceNotes, setAcceptedVarianceNotes] = useState<
    Record<string, string>
  >({});
  const [noPoReason, setNoPoReason] = useState("");
  const [noPoExplanation, setNoPoExplanation] = useState("");
  const [commercialApprovalNote, setCommercialApprovalNote] = useState("");
  const [commercialRejectionReason, setCommercialRejectionReason] = useState("");
  const [isUpdatingCommercialReview, setIsUpdatingCommercialReview] =
    useState(false);
  const [commercialCodingDrafts, setCommercialCodingDrafts] = useState<
    Record<
      string,
      {
        accountingMappingId: string;
        accountingTaxRateId: string;
        taxResolutionStatus: "resolved" | "not_applicable";
      }
    >
  >(() =>
    Object.fromEntries(
      initialDraftAllocations.map((allocation) => [
        allocation.id,
        {
          accountingMappingId: allocation.accounting_mapping_id ?? "",
          accountingTaxRateId: allocation.accounting_tax_rate_id ?? "",
          taxResolutionStatus:
            allocation.tax_resolution_status === "not_applicable"
              ? "not_applicable"
              : "resolved",
        },
      ])
    )
  );
  const [documentsLoading, setDocumentsLoading] = useState(Boolean(initialCurrentDocument));
  const [documentRefreshNonce, setDocumentRefreshNonce] = useState(0);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isDocumentPreviewOpen, setIsDocumentPreviewOpen] = useState(false);
  const [headerApplyMode, setHeaderApplyMode] = useState<Record<HeaderApplyKey, HeaderApplyMode>>({
    supplierId: "current",
    invoiceNumber: "current",
    supplierPoReference: "current",
    invoiceDate: "current",
    dueDate: "current",
    subtotal: "current",
    taxTotal: "current",
    total: "current",
    notes: "current",
  });
  const [selectedExtractedSupplierId, setSelectedExtractedSupplierId] = useState("");
  const [lineApplyMode, setLineApplyMode] = useState<"keep" | "replace">("keep");
  const [isExtractionReviewOpen, setIsExtractionReviewOpen] = useState(
    initialDocumentExtraction?.status === "completed"
  );
  const [appliedExtractionId, setAppliedExtractionId] = useState<string | null>(null);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [isTaxExceptionOpen, setIsTaxExceptionOpen] = useState(false);

  function replaceDraftAllocations(nextAllocations: SupplierInvoiceLineAllocationRow[]) {
    setDraftAllocations(nextAllocations);
    setCommercialCodingDrafts(
      Object.fromEntries(
        nextAllocations.map((allocation) => [
          allocation.id,
          {
            accountingMappingId: allocation.accounting_mapping_id ?? "",
            accountingTaxRateId: allocation.accounting_tax_rate_id ?? "",
            taxResolutionStatus:
              allocation.tax_resolution_status === "not_applicable"
                ? "not_applicable" as const
                : "resolved" as const,
          },
        ])
      )
    );
  }
  const [matchSearchQuery, setMatchSearchQuery] = useState("");
  const [matchDrafts, setMatchDrafts] = useState<Record<string, PurchaseOrderMatchDraft>>({});
  const [isSavingMatches, setIsSavingMatches] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
  const [isSavingDraftAllocations, setIsSavingDraftAllocations] = useState(false);
  const [activeAllocationInvoiceLineId, setActiveAllocationInvoiceLineId] = useState<string | null>(null);
  const [, setPendingPurchaseOrderLineId] = useState<string | null>(null);
  const [isReviewingAllocationId, setIsReviewingAllocationId] = useState<string | null>(null);
  const [isPostingActualCosts, setIsPostingActualCosts] = useState(false);
  const [isReverseActualCostDialogOpen, setIsReverseActualCostDialogOpen] = useState(false);
  const [isReversingActualCost, setIsReversingActualCost] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<{
    allocation: SupplierInvoiceLineAllocationRow;
    event: ProjectActualCostEventRow;
  } | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalNote, setReversalNote] = useState("");
  const [allocationReviewNoteMode, setAllocationReviewNoteMode] = useState<{
    allocationId: string;
    mode: "approve" | "approve_unmatched" | "dispute";
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [allocationReviewNotes, setAllocationReviewNotes] = useState<Record<string, string>>({});
  const [expandedAllocationReviewRows, setExpandedAllocationReviewRows] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const financeEditLocked = Boolean(
    xeroBillReadiness
      && ["queued", "exporting", "exported", "attention_required"].includes(
        xeroBillReadiness.resolvedSummary.exportStatus
      )
  );
  const canEditInvoice = canWrite && !financeEditLocked;
  const currentExtractionDraft = useMemo(
    () => parseDocumentExtractionDraft(documentExtraction),
    [documentExtraction]
  );

  useEffect(() => {
    const supplierMatch = currentExtractionDraft?.supplierMatch;
    const nextSupplierId =
      supplierMatch?.status === "high_confidence"
        ? supplierMatch.supplierId
        : "";
    const nextHeaderApplyMode: Record<HeaderApplyKey, HeaderApplyMode> = {
      supplierId:
        !formState.supplierId && nextSupplierId ? "extracted" : "current",
      invoiceNumber:
        !formState.invoiceNumber.trim() && currentExtractionDraft?.header.invoiceNumber.value
          ? "extracted"
          : "current",
      supplierPoReference:
        !formState.supplierPoReference.trim() && currentExtractionDraft?.header.supplierPoReference.value
          ? "extracted"
          : "current",
      invoiceDate:
        !formState.invoiceDate && currentExtractionDraft?.header.invoiceDate.value ? "extracted" : "current",
      dueDate:
        !formState.dueDate && currentExtractionDraft?.header.dueDate.value ? "extracted" : "current",
      subtotal:
        !formState.subtotal.trim() && currentExtractionDraft?.header.subtotal.value !== null
          ? "extracted"
          : "current",
      taxTotal:
        !formState.taxTotal.trim() && currentExtractionDraft?.header.taxTotal.value !== null
          ? "extracted"
          : "current",
      total:
        !formState.total.trim() && currentExtractionDraft?.header.total.value !== null ? "extracted" : "current",
      notes:
        !formState.notes.trim() && currentExtractionDraft?.header.notes.value ? "extracted" : "current",
    };

    setHeaderApplyMode(nextHeaderApplyMode);
    setSelectedExtractedSupplierId(nextSupplierId);
    setLineApplyMode(lines.length === 0 && (currentExtractionDraft?.lines.length ?? 0) > 0 ? "replace" : "keep");
    setAppliedExtractionId(null);
    setIsExtractionReviewOpen(documentExtraction?.status === "completed");
  }, [documentExtraction?.id]);

  async function loadPurchaseOrderSuggestions() {
    if (!formState.supplierId || !formState.supplierPoReference.trim()) {
      setPoSuggestions([]);
      return;
    }
    setIsUpdatingWorkflow(true);
    setError(null);
    const result = await suggestSupplierInvoicePurchaseOrdersAction({
      supplierInvoiceId: invoice.id,
      supplierId: formState.supplierId,
      supplierPoReference: formState.supplierPoReference,
    });
    if (!result.ok) setError(result.error ?? "Unable to suggest Purchase Orders.");
    else setPoSuggestions(result.suggestions ?? []);
    setIsUpdatingWorkflow(false);
  }

  async function triggerDocumentExtraction(extractionId: string) {
    try {
      await fetch("/api/supplier-invoices/document-extractions/process", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          supplierInvoiceId: invoice.id,
          extractionId,
        }),
      });
    } catch {
      // Polling the durable extraction record keeps the UI recoverable if this fire-and-forget call fails.
    }
  }

  async function handleDocumentUpload(file: File) {
    if (!canEditInvoice || isUploadingDocument) {
      return;
    }

    if (currentDocument) {
      const confirmed = window.confirm(
        "Replace the current Supplier Invoice PDF? The new PDF will become the active preview and extraction source, and the previous PDF will be kept as history."
      );
      if (!confirmed) {
        return;
      }
    }

    setIsUploadingDocument(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.set("supplierInvoiceId", invoice.id);
      formData.set("document", file);
      const result = await attachSupplierInvoiceDocumentAction(formData);
      if (!result.ok) {
        throw new Error(result.error ?? "Unable to attach the Supplier Invoice document.");
      }

      setInvoice((current) => ({
        ...current,
        source: result.invoiceUpdate?.source ?? current.source,
        document_file_path: result.invoiceUpdate?.document_file_path ?? current.document_file_path,
        document_file_name: result.invoiceUpdate?.document_file_name ?? current.document_file_name,
        document_mime_type: result.invoiceUpdate?.document_mime_type ?? current.document_mime_type,
        document_size_bytes: result.invoiceUpdate?.document_size_bytes ?? current.document_size_bytes,
      }));
      setCurrentDocument(result.currentDocument ?? null);
      setDocumentExtraction(result.extraction ?? null);
      setCurrentDocumentSignedUrl(null);
      setDocumentsLoading(Boolean(result.currentDocument));
      setDocumentRefreshNonce((current) => current + 1);
      setIsExtractionReviewOpen(false);
      setAppliedExtractionId(null);
      setMessage(
        result.currentDocument
          ? "Supplier Invoice PDF attached. Draft extraction is running."
          : "Supplier Invoice document updated."
      );

      if (result.extraction?.id) {
        void triggerDocumentExtraction(result.extraction.id);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the Supplier Invoice PDF.");
    } finally {
      setIsUploadingDocument(false);
    }
  }

  async function retryDocumentExtraction() {
    if (!canEditInvoice || isUploadingDocument) {
      return;
    }

    setIsUploadingDocument(true);
    setError(null);
    setMessage(null);

    try {
      const result = await retrySupplierInvoiceDocumentExtractionAction({
        supplierInvoiceId: invoice.id,
      });
      if (!result.ok || !result.extraction) {
        throw new Error(result.error ?? "Unable to retry extraction.");
      }

      setCurrentDocument(result.currentDocument ?? null);
      setDocumentExtraction(result.extraction);
      setCurrentDocumentSignedUrl(null);
      setDocumentsLoading(Boolean(result.currentDocument));
      setDocumentRefreshNonce((current) => current + 1);
      setIsExtractionReviewOpen(false);
      setAppliedExtractionId(null);
      setMessage("Supplier Invoice draft extraction retried.");
      void triggerDocumentExtraction(result.extraction.id);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Unable to retry extraction.");
    } finally {
      setIsUploadingDocument(false);
    }
  }

  function openDocumentPreview() {
    if (!primaryDocument?.signedUrl || documentsLoading) {
      return;
    }

    setIsDocumentPreviewOpen(true);
  }

  function applyExtractionToInvoice() {
    if (!currentExtractionDraft) {
      return;
    }

    if (headerApplyMode.supplierId === "extracted" && !selectedExtractedSupplierId) {
      setError("Select a Supplier match or keep the current Supplier before applying the extracted draft.");
      return;
    }

    const extractedLines = currentExtractionDraft.lines.map(buildAppliedLineState);
    setFormState((current) => ({
      ...current,
      supplierId:
        headerApplyMode.supplierId === "extracted" ? selectedExtractedSupplierId : current.supplierId,
      invoiceNumber:
        headerApplyMode.invoiceNumber === "extracted"
          ? currentExtractionDraft.header.invoiceNumber.value ?? current.invoiceNumber
          : current.invoiceNumber,
      supplierPoReference:
        headerApplyMode.supplierPoReference === "extracted"
          ? currentExtractionDraft.header.supplierPoReference.value ?? current.supplierPoReference
          : current.supplierPoReference,
      invoiceDate:
        headerApplyMode.invoiceDate === "extracted"
          ? currentExtractionDraft.header.invoiceDate.value ?? current.invoiceDate
          : current.invoiceDate,
      dueDate:
        headerApplyMode.dueDate === "extracted"
          ? currentExtractionDraft.header.dueDate.value ?? current.dueDate
          : current.dueDate,
      subtotal:
        headerApplyMode.subtotal === "extracted"
          ? currentExtractionDraft.header.subtotal.value === null
            ? current.subtotal
            : Number(currentExtractionDraft.header.subtotal.value).toFixed(2)
          : current.subtotal,
      taxTotal:
        headerApplyMode.taxTotal === "extracted"
          ? currentExtractionDraft.header.taxTotal.value === null
            ? current.taxTotal
            : Number(currentExtractionDraft.header.taxTotal.value).toFixed(2)
          : current.taxTotal,
      total:
        headerApplyMode.total === "extracted"
          ? currentExtractionDraft.header.total.value === null
            ? current.total
            : Number(currentExtractionDraft.header.total.value).toFixed(2)
          : current.total,
      notes:
        headerApplyMode.notes === "extracted"
          ? currentExtractionDraft.header.notes.value ?? current.notes
          : current.notes,
    }));

    if (lineApplyMode === "replace") {
      setLines(extractedLines);
    }

    setAppliedExtractionId(documentExtraction?.id ?? null);
    setError(null);
    setMessage("Extracted draft applied to the local invoice form. Use Save Changes to persist it.");
  }

  async function submitForSiteApproval() {
    setIsUpdatingWorkflow(true);
    setError(null);
    const result = await submitSupplierInvoiceForSiteApprovalAction({ supplierInvoiceId: invoice.id });
    if (!result.ok) setError(result.error ?? "Unable to submit for site approval.");
    else {
      if (result.workflow) setWorkflowState(result.workflow);
      await refreshWorkflowState();
      setMessage("Supplier Invoice sent for Team Approval.");
    }
    setIsUpdatingWorkflow(false);
  }

  async function confirmSuggestedPurchaseOrder(purchaseOrderId: string) {
    setIsUpdatingWorkflow(true);
    setError(null);
    const result = await confirmSupplierInvoicePurchaseOrderMatchAction({
      supplierInvoiceId: invoice.id,
      purchaseOrderId,
    });
    if (!result.ok) setError(result.error ?? "Unable to confirm the Purchase Order match.");
    else {
      if (result.workflow) setWorkflowState(result.workflow);
      await refreshWorkflowState();
      setMessage("Purchase Order match confirmed.");
    }
    setIsUpdatingWorkflow(false);
  }

  async function approveForXero() {
    setIsUpdatingWorkflow(true);
    setError(null);
    const result = await approveSupplierInvoiceForXeroAction({
      supplierInvoiceId: invoice.id,
      approvalNote: accountsApprovalNote,
    });
    if (!result.ok) setError(result.error ?? "Unable to complete Accounts approval.");
    else {
      if (result.workflow) setWorkflowState(result.workflow);
      setMessage("Final Accounts approval recorded. The invoice is ready for Xero.");
    }
    setIsUpdatingWorkflow(false);
  }

  async function queueDraftXeroBill() {
    setIsUpdatingXeroBill(true);
    setError(null);
    setMessage(null);
    const result = await prepareSupplierInvoiceXeroBillExportAction({
      supplierInvoiceId: invoice.id,
    });
    if (!result.ok) {
      setError(result.error ?? "Unable to queue the Draft Xero Bill.");
    } else if (xeroBillReadiness) {
      setXeroBillReadiness({
        ...xeroBillReadiness,
        ready: false,
        blockers: [
          {
            code: "active_export_job",
            message: "A Draft Xero Bill export is already active.",
          },
        ],
        resolvedSummary: {
          ...xeroBillReadiness.resolvedSummary,
          exportStatus: result.status ?? "queued",
        },
      });
      setMessage("Draft Xero Bill export queued.");
    }
    setIsUpdatingXeroBill(false);
  }

  async function createDraftBillInXero() {
    if (readyForXeroPresentation.status !== "ready") return;
    setIsUpdatingXeroBill(true);
    setError(null);
    setMessage(null);

    try {
      const preflightCommercial = await refreshSupplierInvoiceCommercialComparisonAction({
        supplierInvoiceId: invoice.id,
        acceptedVariances: readyAcceptedCommercialVariances,
        noPoReason: noPoReason || null,
        noPoExplanation: noPoExplanation || null,
      });
      if (!preflightCommercial.ok || !preflightCommercial.comparison) {
        throw new Error(preflightCommercial.error ?? "TradesStack could not validate this invoice.");
      }
      setCommercialComparison(preflightCommercial.comparison);
      const preflightBlocker = preflightCommercial.comparison.blockers.find(
        (blocker) => !(isNoPurchaseOrderInvoice && ["allocation_not_approved", "missing_no_po_reason"].includes(blocker.code))
      );
      if (preflightBlocker) throw new Error(preflightBlocker.message);

      if (isNoPurchaseOrderInvoice) {
        const pendingNoPoAllocations = draftAllocations.filter((allocation) =>
          !allocation.purchase_order_id
          && allocation.edit_state !== "reversed"
          && allocation.edit_state !== "superseded"
          && allocation.approval_status !== "approved"
        );
        for (const allocation of pendingNoPoAllocations) {
          const result = await approveSupplierInvoiceDraftAllocationAction({
            organizationId,
            supplierInvoiceId: invoice.id,
            allocationId: allocation.id,
            note: noPoExplanation.trim() || noPoReason.replaceAll("_", " "),
          });
          if (!result.ok || !result.allocations) {
            throw new Error(result.error ?? "The no-PO invoice could not be prepared.");
          }
          replaceDraftAllocations(result.allocations);
          await refreshWorkflowState();
        }
      }

      const refreshedCommercial = isNoPurchaseOrderInvoice
        ? await refreshSupplierInvoiceCommercialComparisonAction({
            supplierInvoiceId: invoice.id,
            acceptedVariances: readyAcceptedCommercialVariances,
            noPoReason: noPoReason || null,
            noPoExplanation: noPoExplanation || null,
          })
        : preflightCommercial;
      if (!refreshedCommercial.ok || !refreshedCommercial.comparison) {
        throw new Error(refreshedCommercial.error ?? "TradesStack could not validate this invoice.");
      }
      setCommercialComparison(refreshedCommercial.comparison);
      if (refreshedCommercial.comparison.blockers.length > 0) {
        throw new Error(refreshedCommercial.comparison.blockers[0].message);
      }

      if (refreshedCommercial.comparison.derivedStatus !== "approved") {
        const commercialResult = await approveSupplierInvoiceCommerciallyAction({
          supplierInvoiceId: invoice.id,
          acceptedVariances: readyAcceptedCommercialVariances,
          noPoReason: noPoReason || null,
          noPoExplanation: noPoExplanation || null,
          approvalNote: "Prepared through Ready for Xero.",
        });
        if (!commercialResult.ok || !commercialResult.comparison) {
          throw new Error(commercialResult.error ?? "The invoice could not be prepared for Xero.");
        }
        setCommercialComparison(commercialResult.comparison);
        await refreshWorkflowState();
      }

      if (!accountsApprovalIsCurrent) {
        const accountsResult = await approveSupplierInvoiceForXeroAction({
          supplierInvoiceId: invoice.id,
          approvalNote: "Approved through Ready for Xero.",
        });
        if (!accountsResult.ok) {
          throw new Error(accountsResult.error ?? "The final payment decision could not be recorded.");
        }
        if (accountsResult.workflow) setWorkflowState(accountsResult.workflow);
        await refreshWorkflowState();
      }

      const exportResult = await prepareSupplierInvoiceXeroBillExportAction({
        supplierInvoiceId: invoice.id,
      });
      if (!exportResult.ok) {
        throw new Error(exportResult.error ?? "The Draft Xero Bill could not be created.");
      }
      if (xeroBillReadiness) {
        setXeroBillReadiness({
          ...xeroBillReadiness,
          ready: false,
          blockers: [],
          resolvedSummary: {
            ...xeroBillReadiness.resolvedSummary,
            exportStatus: exportResult.status ?? "queued",
          },
        });
      }
      setMessage("Draft Xero Bill export queued.");
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The Draft Xero Bill could not be created.");
    } finally {
      setIsUpdatingXeroBill(false);
    }
  }

  async function cancelDraftXeroBill() {
    setIsUpdatingXeroBill(true);
    setError(null);
    const result = await cancelSupplierInvoiceXeroBillExportAction({
      supplierInvoiceId: invoice.id,
    });
    if (!result.ok) {
      setError(result.error ?? "Unable to cancel the Draft Xero Bill export.");
    } else if (xeroBillReadiness) {
      setXeroBillReadiness({
        ...xeroBillReadiness,
        ready: true,
        blockers: [],
        resolvedSummary: {
          ...xeroBillReadiness.resolvedSummary,
          exportStatus: "cancelled",
        },
      });
      setMessage("Queued Draft Xero Bill export cancelled.");
    }
    setIsUpdatingXeroBill(false);
  }

  async function retryDraftXeroBill() {
    setIsUpdatingXeroBill(true);
    setError(null);
    const result = await retrySupplierInvoiceXeroBillExportAction({
      supplierInvoiceId: invoice.id,
    });
    if (!result.ok) {
      setError(result.error ?? "Unable to retry the Draft Xero Bill export.");
    } else if (xeroBillReadiness) {
      setXeroBillReadiness({
        ...xeroBillReadiness,
        ready: false,
        blockers: [
          {
            code: "active_export_job",
            message: "A Draft Xero Bill export is already active.",
          },
        ],
        resolvedSummary: {
          ...xeroBillReadiness.resolvedSummary,
          exportStatus: "queued",
          safeError: null,
        },
      });
      setMessage("Draft Xero Bill export retry queued.");
    }
    setIsUpdatingXeroBill(false);
  }

  async function refreshXeroBillStatus() {
    setIsUpdatingXeroBill(true);
    setError(null);
    setMessage(null);
    const result = await refreshSupplierInvoiceXeroBillStatusAction({
      supplierInvoiceId: invoice.id,
    });
    if (!result.ok) {
      setError(result.error ?? "Unable to refresh the Xero Bill status.");
    } else {
      if (result.readiness) setXeroBillReadiness(result.readiness);
      if (result.workflow) setWorkflowState(result.workflow);
      setMessage(`Xero Bill status refreshed: ${result.status?.replaceAll("_", " ") ?? "unknown"}.`);
    }
    setIsUpdatingXeroBill(false);
  }

  function acceptedCommercialVariances(): AcceptedCommercialVarianceInput[] {
    return commercialComparison.warnings
      .map((variance) => ({
        key: variance.key,
        type: variance.type,
        purchaseOrderLineItemId: variance.purchaseOrderLineItemId,
        expectedValue: variance.expectedValue,
        actualValue: variance.actualValue,
        varianceAmount: variance.varianceAmount,
        note: acceptedVarianceNotes[variance.key]?.trim() ?? "",
      }))
      .filter((variance) => variance.note.length > 0);
  }

  async function refreshCommercialReview() {
    setIsUpdatingCommercialReview(true);
    setError(null);
    const result = await refreshSupplierInvoiceCommercialComparisonAction({
      supplierInvoiceId: invoice.id,
      acceptedVariances: acceptedCommercialVariances(),
      noPoReason: noPoReason || null,
      noPoExplanation: noPoExplanation || null,
    });
    if (!result.ok || !result.comparison) {
      setError(result.error ?? "Unable to refresh the commercial review.");
    } else {
      setCommercialComparison(result.comparison);
    }
    setIsUpdatingCommercialReview(false);
  }

  async function approveCommercially() {
    setIsUpdatingCommercialReview(true);
    setError(null);
    const result = await approveSupplierInvoiceCommerciallyAction({
      supplierInvoiceId: invoice.id,
      acceptedVariances: acceptedCommercialVariances(),
      noPoReason: noPoReason || null,
      noPoExplanation: noPoExplanation || null,
      approvalNote: commercialApprovalNote,
    });
    if (!result.ok || !result.comparison) {
      setError(result.error ?? "Unable to commercially approve this invoice.");
    } else {
      setCommercialComparison(result.comparison);
      setMessage("Supplier invoice commercially approved.");
    }
    setIsUpdatingCommercialReview(false);
  }

  async function rejectCommercially() {
    setIsUpdatingCommercialReview(true);
    setError(null);
    const result = await rejectSupplierInvoiceCommerciallyAction({
      supplierInvoiceId: invoice.id,
      reason: commercialRejectionReason,
    });
    if (!result.ok || !result.comparison) {
      setError(result.error ?? "Unable to commercially reject this invoice.");
    } else {
      setCommercialComparison(result.comparison);
      setMessage("Supplier invoice commercially rejected.");
    }
    setIsUpdatingCommercialReview(false);
  }

  async function saveCommercialCoding(allocationId: string) {
    const draft = commercialCodingDrafts[allocationId];
    if (!draft?.accountingMappingId) {
      setError("Select an accounting mapping.");
      return;
    }
    if (
      draft.taxResolutionStatus === "resolved" &&
      !draft.accountingTaxRateId
    ) {
      setError("Select a tax treatment.");
      return;
    }

    setIsUpdatingCommercialReview(true);
    setError(null);
    const result = await updateSupplierInvoiceAllocationCommercialCodingAction({
      supplierInvoiceId: invoice.id,
      allocationId,
      accountingMappingId: draft.accountingMappingId,
      accountingTaxRateId: draft.accountingTaxRateId || null,
      taxResolutionStatus: draft.taxResolutionStatus,
    });
    if (!result.ok || !result.comparison) {
      setError(result.error ?? "Unable to save the commercial coding.");
    } else {
      setCommercialComparison(result.comparison);
      setDraftAllocations((current) => current.map((allocation) =>
        allocation.id === allocationId
          ? {
              ...allocation,
              accounting_tax_rate_id: draft.accountingTaxRateId || null,
              tax_resolution_status: draft.taxResolutionStatus,
              approval_status: "pending",
            }
          : allocation
      ));
      await refreshWorkflowState();
      setMessage("Commercial coding saved. Re-approve the allocation before commercial approval.");
    }
    setIsUpdatingCommercialReview(false);
  }

  const emitIntelligenceEvents = async (
    events: Array<ReturnType<typeof buildSupplierInvoiceIntelligenceEvent>>
  ) => {
    if (events.length === 0) {
      return;
    }

    try {
      await writeSupplierInvoiceIntelligenceEvents(supabase, events);
    } catch (eventError) {
      logSupplierInvoiceIntelligenceFailure("supplier-invoice-detail", eventError);
    }
  };

  const memberDirectory = useMemo(
    () => new Map(organizationMembers.map((member) => [member.user_id, member])),
    [organizationMembers]
  );
  const purchaseOrderById = useMemo(
    () => new Map(purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder])),
    [purchaseOrders]
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );
  const matchesWithPurchaseOrders = useMemo<PurchaseOrderMatchWithContext[]>(
    () =>
      matches.map((match) => ({
        ...match,
        purchaseOrder: purchaseOrderById.get(match.purchase_order_id) ?? null,
        approverName: match.approved_by_user_id
          ? memberDirectory.get(match.approved_by_user_id)?.display_name ?? "Unknown reviewer"
          : null,
      })),
    [matches, memberDirectory, purchaseOrderById]
  );
  const matchedTotal = useMemo(() => calculateMatchedInvoiceTotal(matches), [matches]);
  const remainingMatchAmount = Math.max(0, Number(invoice.total ?? 0) - matchedTotal);
  const approvedAllocationTotal = useMemo(
    () =>
      matchesWithPurchaseOrders.reduce((sum, match) => {
        if (!matchCountsTowardInvoiceTotal(match.match_status) || match.approval_status !== "approved") {
          return sum;
        }
        return sum + Number(match.matched_amount ?? 0);
      }, 0),
    [matchesWithPurchaseOrders]
  );
  const disputedAllocationTotal = useMemo(
    () =>
      matchesWithPurchaseOrders.reduce((sum, match) => {
        if (!matchCountsTowardInvoiceTotal(match.match_status) || match.approval_status !== "disputed") {
          return sum;
        }
        return sum + Number(match.matched_amount ?? 0);
      }, 0),
    [matchesWithPurchaseOrders]
  );
  const pendingAllocationTotal = useMemo(
    () =>
      matchesWithPurchaseOrders.reduce((sum, match) => {
        if (!matchCountsTowardInvoiceTotal(match.match_status) || match.approval_status !== "pending") {
          return sum;
        }
        return sum + Number(match.matched_amount ?? 0);
      }, 0),
    [matchesWithPurchaseOrders]
  );
  const activeAllocationCount = useMemo(
    () =>
      matchesWithPurchaseOrders.filter((match) =>
        matchCountsTowardInvoiceTotal(match.match_status)
      ).length,
    [matchesWithPurchaseOrders]
  );
  const hasActivePurchaseOrderMatch = activeAllocationCount > 0;
  const displayStatus = useMemo(
    () =>
      deriveSupplierInvoiceDisplayStatus({
        storedStatus: invoice.status,
        invoiceTotal: Number(invoice.total ?? 0),
        activeMatchCount: activeAllocationCount,
        approvedAllocationTotal,
        disputedAllocationTotal,
      }),
    [activeAllocationCount, approvedAllocationTotal, disputedAllocationTotal, invoice.status, invoice.total]
  );
  const approvalStepsWithMembers = useMemo<SupplierInvoiceApprovalStepWithMember[]>(
    () =>
      approvalSteps.map((step) => ({
        ...step,
        approverName: step.approver_user_id
          ? memberDirectory.get(step.approver_user_id)?.display_name ?? "Unknown reviewer"
          : "Pending review",
      })),
    [approvalSteps, memberDirectory]
  );
  const activityEventsWithMembers = useMemo<SupplierInvoiceActivityEventWithMember[]>(
    () =>
      activityEvents.map((event) => ({
        ...event,
        actorName: event.created_by
          ? memberDirectory.get(event.created_by)?.display_name ?? "Unknown member"
          : "System",
      })),
    [activityEvents, memberDirectory]
  );
  const historyRows = useMemo<SupplierInvoiceHistoryRow[]>(() => {
    const activityRows = activityEventsWithMembers.map((event) => ({
      id: `activity-${event.id}`,
      createdAt: event.created_at,
      user: event.actorName,
      action: formatSupplierInvoiceActivityEventLabel(event.event_type),
      detail: event.message,
    }));
    const reviewRows = approvalStepsWithMembers.map((step) => ({
      id: `approval-${step.id}`,
      createdAt: step.decided_at,
      user: step.approverName,
      action: step.status.charAt(0).toUpperCase() + step.status.slice(1),
      detail:
        step.decision_notes?.trim() ||
        `Invoice-level ${step.approver_role ? `${step.approver_role.replaceAll("_", " ")} ` : ""}review decision.`,
    }));

    return [...activityRows, ...reviewRows].sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [activityEventsWithMembers, approvalStepsWithMembers]);
  const latestAccountsApprovalActivity = useMemo(
    () =>
      activityEventsWithMembers.find(
        (event) => event.event_type === "accounts_approved"
      ) ?? null,
    [activityEventsWithMembers]
  );
  const accountsApprovalMissingForExport =
    xeroBillReadiness?.blockers.some(
      (blocker) => blocker.code === "missing_accounts_approval"
    ) ?? false;
  const hasRecordedAccountsApproval = Boolean(workflowState.activeAccountsApprovalId);
  const accountsApprovalIsCurrent =
    hasRecordedAccountsApproval && !accountsApprovalMissingForExport;
  const accountsApprovalIsStale =
    hasRecordedAccountsApproval && accountsApprovalMissingForExport;
  const accountsApprovalBlockers = useMemo(() => {
    const blockers: string[] = [];

    if (commercialComparison.derivedStatus !== "approved") {
      blockers.push(
        "A current commercial approval is required before final Accounts approval."
      );
    }

    if (workflowState.status === "Draft" || workflowState.status === "Awaiting Allocation") {
      blockers.push(
        "Complete capture, Purchase Order matching, and allocation before final Accounts approval."
      );
    } else if (
      workflowState.status === "Awaiting Site Approval"
      || workflowState.status === "Partially Site Approved"
    ) {
      blockers.push(
        "Finish the current site-review decisions before final Accounts approval."
      );
    } else if (workflowState.status === "Disputed") {
      blockers.push(
        "Resolve disputed site-review or allocation decisions before final Accounts approval."
      );
    }

    if (accountsApprovalIsStale) {
      blockers.push(
        "A previous Accounts approval is stale because the finance version changed."
      );
    }

    return blockers;
  }, [
    accountsApprovalIsStale,
    commercialComparison.derivedStatus,
    workflowState.status,
  ]);
  const invoiceSummaryGstRate = useMemo(() => {
    const subtotal = numberString(formState.subtotal);
    const tax = numberString(formState.taxTotal);
    return subtotal > 0 ? tax / subtotal : 0;
  }, [formState.subtotal, formState.taxTotal]);
  const invoiceSummaryGstPercent = useMemo(
    () => formatInvoiceSummaryPercent(invoiceSummaryGstRate),
    [invoiceSummaryGstRate]
  );
  const supplierInvoiceLineGridTemplate = useMemo(() => {
    const quantityWidth = lines.reduce(
      (width, line) => Math.max(width, 32 + line.quantity.length * 8),
      72
    );
    const priceWidth = lines.reduce(
      (width, line) => {
        const formattedPrice = `$${formatCommercialPriceNumber(numberString(line.unitPrice))}`;
        return Math.max(width, 32 + formattedPrice.length * 8);
      },
      104
    );
    const amountWidth = lines.reduce(
      (width, line) => {
        const formattedAmount = formatCommercialDocumentMoney(numberString(line.lineTotal));
        return Math.max(width, 32 + formattedAmount.length * 8);
      },
      104
    );

    return `minmax(340px,1fr) ${quantityWidth}px ${priceWidth}px ${amountWidth}px 240px`;
  }, [lines]);
  const allocationPreviewRowsByInvoiceLine = useMemo(() => {
    const grouped = new Map<string, SupplierInvoiceAllocationPreviewData[]>();

    allocationPreviewRows.forEach((row) => {
      const currentRows = grouped.get(row.invoiceLineId) ?? [];
      currentRows.push(row);
      grouped.set(row.invoiceLineId, currentRows);
    });

    return grouped;
  }, [allocationPreviewRows]);
  const draftAllocationsByInvoiceLine = useMemo(() => {
    const grouped = new Map<string, SupplierInvoiceLineAllocationRow[]>();

    draftAllocations.forEach((allocation) => {
      const currentRows = grouped.get(allocation.supplier_invoice_line_id) ?? [];
      currentRows.push(allocation);
      grouped.set(allocation.supplier_invoice_line_id, currentRows);
    });

    return grouped;
  }, [draftAllocations]);
  const postedPostingActualCostEventsByAllocationId = useMemo(() => {
    const map = new Map<string, ProjectActualCostEventRow>();

    actualCostEvents.forEach((event) => {
      const allocationId =
        event.source_invoice_allocation_id ?? event.supplier_invoice_line_allocation_id;

      if (allocationId && event.event_status === "posted" && event.event_type === "posting") {
        map.set(allocationId, event);
      }
    });

    return map;
  }, [actualCostEvents]);
  const reversalActualCostEventsByOriginalEventId = useMemo(() => {
    const map = new Map<string, ProjectActualCostEventRow>();

    actualCostEvents.forEach((event) => {
      if (event.event_type === "reversal" && event.reverses_event_id) {
        map.set(event.reverses_event_id, event);
      }
    });

    return map;
  }, [actualCostEvents]);
  const approvedUnpostedActualCostSummary = useMemo(
    () =>
      summarizeApprovedUnpostedAllocations({
        allocations: draftAllocations,
        postedAllocationIds: new Set(postedPostingActualCostEventsByAllocationId.keys()),
      }),
    [draftAllocations, postedPostingActualCostEventsByAllocationId]
  );
  const readyDraftCandidates = useMemo(() => {
    const candidates: Array<{ invoiceLineId: string; purchaseOrderLineItemId: string }> = [];

    allocationPreviewRowsByInvoiceLine.forEach((previewRows, invoiceLineId) => {
      const firstReadyRow = previewRows.find(
        (previewRow) =>
          previewRow.status === "Ready" && Boolean(previewRow.candidatePurchaseOrderLineItemId)
      );

      if (firstReadyRow?.candidatePurchaseOrderLineItemId) {
        candidates.push({
          invoiceLineId,
          purchaseOrderLineItemId: firstReadyRow.candidatePurchaseOrderLineItemId,
        });
      }
    });

    return candidates;
  }, [allocationPreviewRowsByInvoiceLine]);
  const allocationReviewRows = useMemo<AllocationReviewTableRow[]>(() => {
    return lines.map((line) => {
      const lineDraftAllocations = draftAllocationsByInvoiceLine.get(line.id) ?? [];
      const activeLineDraftAllocations = lineDraftAllocations.filter(
        (allocation) => allocation.edit_state !== "reversed" && allocation.edit_state !== "superseded"
      );
      const basePreviewRows = allocationPreviewRowsByInvoiceLine.get(line.id) ?? [
        {
          candidateKey: `${line.id}:none`,
          invoiceLineId: line.id,
          invoiceLineDescription: line.description.trim() || "Untitled invoice line",
          invoiceLineAmount: Number(line.lineTotal),
          candidatePurchaseOrderId: null,
          candidatePurchaseOrderNumber: null,
          candidatePurchaseOrderTitle: null,
          candidatePurchaseOrderLineItemId: null,
          candidatePurchaseOrderLineDescription: null,
          candidatePurchaseOrderLineAmount: null,
          costItemId: null,
          sourceCostItemId: null,
          tradesstackCostCode: null,
          tradesstackCostCodeLabel: null,
          workType: null,
          costType: null,
          internalCostCode: null,
          organizationCostCodeId: null,
          organizationCostCode: null,
          organizationCostCodeName: null,
          accountingResolutionStatus: "pending",
          status: "No PO line candidate" as const,
          candidateScore: 0,
        },
      ];
      const savedUnmatchedAllocation =
        [...activeLineDraftAllocations].reverse().find(
          (allocation) =>
            allocation.allocation_status === "unmatched" && !allocation.purchase_order_line_item_id
        ) ?? null;
      const previewRows =
        savedUnmatchedAllocation &&
        !basePreviewRows.some((previewRow) => previewRow.candidatePurchaseOrderLineItemId === null)
          ? [
              ...basePreviewRows,
              {
                candidateKey: `${line.id}:saved-unmatched`,
                invoiceLineId: line.id,
                invoiceLineDescription: line.description.trim() || "Untitled invoice line",
                invoiceLineAmount: Number(line.lineTotal),
                candidatePurchaseOrderId: null,
                candidatePurchaseOrderNumber: null,
                candidatePurchaseOrderTitle: null,
                candidatePurchaseOrderLineItemId: null,
                candidatePurchaseOrderLineDescription: null,
                candidatePurchaseOrderLineAmount: null,
                costItemId: null,
                sourceCostItemId: null,
                tradesstackCostCode:
                  savedUnmatchedAllocation.tradesstack_cost_code === null
                    ? null
                    : String(savedUnmatchedAllocation.tradesstack_cost_code),
                tradesstackCostCodeLabel: savedUnmatchedAllocation.tradesstack_cost_code_label,
                workType: null,
                costType: null,
                internalCostCode: null,
                organizationCostCodeId: savedUnmatchedAllocation.organization_cost_code_id,
                organizationCostCode:
                  costCodes.find((costCode) => costCode.id === savedUnmatchedAllocation.organization_cost_code_id)
                    ?.code ?? null,
                organizationCostCodeName:
                  costCodes.find((costCode) => costCode.id === savedUnmatchedAllocation.organization_cost_code_id)
                    ?.name ?? null,
                accountingResolutionStatus: "pending",
                status: "Needs cost review" as const,
                candidateScore: 0,
              },
            ]
          : basePreviewRows;
      const orderedActiveLineDraftAllocations = [...activeLineDraftAllocations].sort((left, right) => {
        const leftSequence = left.allocation_sequence ?? 0;
        const rightSequence = right.allocation_sequence ?? 0;

        if (leftSequence !== rightSequence) {
          return leftSequence - rightSequence;
        }

        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      });
      const selectedAllocation =
        [...orderedActiveLineDraftAllocations]
          .reverse()
          .find((allocation) => Boolean(allocation.supersedes_allocation_id)) ??
        [...orderedActiveLineDraftAllocations].reverse()[0] ??
        null;
      const selectedPreviewRow =
        (selectedAllocation?.purchase_order_line_item_id
          ? previewRows.find(
              (previewRow) =>
                previewRow.candidatePurchaseOrderLineItemId === selectedAllocation.purchase_order_line_item_id
            )
          : previewRows.find((previewRow) => previewRow.candidatePurchaseOrderLineItemId === null)) ??
        previewRows[0];
      const selectedPreviewKey = selectedPreviewRow.candidatePurchaseOrderLineItemId ?? "__unmatched__";
      const alternateCandidateCount = new Set(
        previewRows
          .map((previewRow) => previewRow.candidatePurchaseOrderLineItemId)
          .filter(
            (candidatePurchaseOrderLineItemId) =>
              candidatePurchaseOrderLineItemId !== null && candidatePurchaseOrderLineItemId !== selectedPreviewKey
          )
      ).size;
      const hasHistoricalReversal = lineDraftAllocations.some(
        (allocation) => allocation.edit_state === "reversed"
      );
      const postingEvent = selectedAllocation
        ? postedPostingActualCostEventsByAllocationId.get(selectedAllocation.id) ?? null
        : null;
      const hasReversalForPosting = postingEvent
        ? reversalActualCostEventsByOriginalEventId.has(postingEvent.id)
        : false;
      const operationalStatus: AllocationOperationalStatus = (() => {
        if (!selectedAllocation) {
          return selectedPreviewRow.status === "Ready" ? "Ready" : "Needs review";
        }

        if (postingEvent) {
          return selectedAllocation.supersedes_allocation_id ? "Corrected" : "Posted";
        }

        if (selectedAllocation.supersedes_allocation_id) {
          return hasHistoricalReversal ? "Needs correction" : "Approved";
        }

        if (hasReversalForPosting || selectedAllocation.edit_state === "reversed") {
          return "Needs correction";
        }

        if (selectedAllocation.approval_status === "approved") {
          return "Approved";
        }

        if (
          selectedAllocation.approval_status === "disputed" ||
          selectedAllocation.review_status === "disputed" ||
          selectedPreviewRow.status === "Needs cost review" ||
          selectedPreviewRow.status === "Needs accounting mapping" ||
          selectedPreviewRow.status === "No PO line candidate"
        ) {
          return "Needs review";
        }

        return selectedPreviewRow.status === "Ready" ? "Ready" : "Needs review";
      })();

      return {
        line,
        lineDraftAllocations,
        candidatePreviewRows: previewRows,
        selectedAllocation,
        selectedPreviewRow,
        operationalStatus,
        alternateCandidateCount,
        lineHasServerBackedPreview: allocationPreviewRowsByInvoiceLine.has(line.id),
        lineHasPostedActualCosts: lineDraftAllocations.some((allocation) =>
          postedPostingActualCostEventsByAllocationId.has(allocation.id)
        ),
      };
    });
  }, [
    allocationPreviewRowsByInvoiceLine,
    costCodes,
    draftAllocationsByInvoiceLine,
    lines,
    postedPostingActualCostEventsByAllocationId,
    reversalActualCostEventsByOriginalEventId,
  ]);
  const activeMatchedPurchaseOrders = useMemo(
    () =>
      matchesWithPurchaseOrders.filter(
        (match) => isActiveSupplierInvoicePurchaseOrderMatch(match.match_status)
      ),
    [matchesWithPurchaseOrders]
  );
  const activeMatchedPurchaseOrderIds = useMemo(
    () => new Set(activeMatchedPurchaseOrders.map((match) => match.purchase_order_id)),
    [activeMatchedPurchaseOrders]
  );
  const teamApprovalAllocations = useMemo(
    () => draftAllocations.filter((allocation) =>
      allocation.purchase_order_id
      && activeMatchedPurchaseOrderIds.has(allocation.purchase_order_id)
      && allocation.edit_state !== "reversed"
      && allocation.edit_state !== "superseded"
    ),
    [activeMatchedPurchaseOrderIds, draftAllocations]
  );
  const teamApprovalGroups = useMemo<SupplierInvoiceTeamApprovalGroup[]>(() => {
    const invoiceLinesById = new Map(lines.map((line) => [line.id, line]));
    const purchaseOrderLinesById = new Map(matchedPurchaseOrderLines.map((line) => [line.id, line]));
    return activeMatchedPurchaseOrders.map((match) => ({
      purchaseOrderId: match.purchase_order_id,
      purchaseOrderNumber: match.purchaseOrder?.purchase_order_number ?? "Purchase Order",
      rows: teamApprovalAllocations
        .filter((allocation) => allocation.purchase_order_id === match.purchase_order_id)
        .map((allocation) => ({
          allocationId: allocation.id,
          invoiceLine: invoiceLinesById.get(allocation.supplier_invoice_line_id)?.description || "Supplier Invoice line",
          purchaseOrderLine: allocation.purchase_order_line_item_id
            ? purchaseOrderLinesById.get(allocation.purchase_order_line_item_id)?.description ?? "Purchase Order line"
            : "Purchase Order line",
          amount: Number(allocation.allocated_amount ?? 0),
          status: allocation.approval_status === "approved"
            ? "approved" as const
            : allocation.approval_status === "disputed"
              ? "declined" as const
              : "waiting" as const,
          reviewer: allocation.reviewed_by_user_id
            ? memberDirectory.get(allocation.reviewed_by_user_id)?.display_name ?? "Unknown reviewer"
            : null,
          comment: allocation.approval_notes?.trim() || null,
          reviewedAt: allocation.reviewed_at,
        })),
    }));
  }, [activeMatchedPurchaseOrders, lines, matchedPurchaseOrderLines, memberDirectory, teamApprovalAllocations]);
  const hasTeamApprovalHistory = useMemo(
    () => activityEvents.some((event) => event.event_type === "site_review_submitted"),
    [activityEvents]
  );
  const teamApprovalStatus = useMemo(() => {
    if (activeMatchedPurchaseOrders.length === 0) return "not_required" as const;
    if (!workflowState.activeSubmissionId) return hasTeamApprovalHistory ? "invalidated" as const : "not_sent" as const;
    const declined = teamApprovalAllocations.filter((allocation) => allocation.approval_status === "disputed").length;
    const approved = teamApprovalAllocations.filter((allocation) => allocation.approval_status === "approved").length;
    const waiting = teamApprovalAllocations.length - declined - approved;
    if (declined > 0) return "declined" as const;
    if (waiting === 0 && approved > 0) return "approved" as const;
    if (approved > 0) return "partially_reviewed" as const;
    return "waiting" as const;
  }, [activeMatchedPurchaseOrders.length, hasTeamApprovalHistory, teamApprovalAllocations, workflowState.activeSubmissionId]);
  const teamAcceptedCommercialVariances = useMemo<AcceptedCommercialVarianceInput[]>(() => {
    const acceptedNotesByKey = new Map<string, string>();
    teamApprovalAllocations.forEach((allocation) => {
      const checks = allocation.approval_checks_json;
      if (!checks || typeof checks !== "object" || Array.isArray(checks)) return;
      const accepted = (checks as Record<string, Json>).acceptedVariances;
      if (!Array.isArray(accepted)) return;
      accepted.forEach((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        const record = value as Record<string, Json>;
        if (typeof record.key === "string" && typeof record.note === "string" && record.note.trim()) {
          acceptedNotesByKey.set(record.key, record.note.trim());
        }
      });
    });
    return commercialComparison.warnings.flatMap((warning) => {
      const note = acceptedNotesByKey.get(warning.key);
      return note ? [{
        key: warning.key,
        type: warning.type,
        purchaseOrderLineItemId: warning.purchaseOrderLineItemId,
        expectedValue: warning.expectedValue,
        actualValue: warning.actualValue,
        varianceAmount: warning.varianceAmount,
        note,
      }] : [];
    });
  }, [commercialComparison.warnings, teamApprovalAllocations]);
  const readyAcceptedCommercialVariances = useMemo(() => {
    const manuallyAccepted = commercialComparison.warnings.flatMap((warning) => {
      const note = acceptedVarianceNotes[warning.key]?.trim();
      return note ? [{
        key: warning.key,
        type: warning.type,
        purchaseOrderLineItemId: warning.purchaseOrderLineItemId,
        expectedValue: warning.expectedValue,
        actualValue: warning.actualValue,
        varianceAmount: warning.varianceAmount,
        note,
      }] : [];
    });
    return Array.from(new Map([...teamAcceptedCommercialVariances, ...manuallyAccepted].map((value) => [value.key, value])).values());
  }, [acceptedVarianceNotes, commercialComparison.warnings, teamAcceptedCommercialVariances]);
  const isNoPurchaseOrderInvoice = activeMatchedPurchaseOrders.length === 0;
  const noPoReasonIsComplete = Boolean(noPoReason && (noPoReason !== "other" || noPoExplanation.trim()));
  const exportStatus = xeroBillReadiness?.resolvedSummary.exportStatus ?? null;
  const genuineXeroBlocker = xeroBillReadiness?.blockers.find(
    (blocker) => !["no_active_commercial_approval", "missing_accounts_approval", "finance_hash_mismatch"].includes(blocker.code)
      && !(
        blocker.code === "total_reconciliation_failure"
        && !commercialComparison.activeApproval
      )
      && !(isNoPurchaseOrderInvoice && blocker.code.startsWith("commercial_"))
  ) ?? null;
  const genuineCommercialBlocker = commercialComparison.blockers.find(
    (blocker) => !(isNoPurchaseOrderInvoice && ["allocation_not_approved", "missing_no_po_reason"].includes(blocker.code))
  ) ?? null;
  const hasTaxException = genuineCommercialBlocker?.code === "missing_tax_treatment"
    || genuineXeroBlocker?.code === "missing_tax_type";
  const readyForXeroPresentation = useMemo<{ status: SupplierInvoiceReadyStatus; message: string }>(() => {
    if (["queued", "exporting"].includes(exportStatus ?? "")) return { status: "sent", message: "The Draft Bill is being sent to Xero." };
    if (exportStatus === "exported") return { status: "sent", message: "The Draft Bill has been created in Xero." };
    if (["failed", "attention_required"].includes(exportStatus ?? "")) return { status: "issue", message: "The Xero export needs attention before it can continue." };
    if (isUpdatingXeroBill) return { status: "waiting", message: "Preparing the Draft Bill for Xero." };
    if (teamApprovalStatus === "declined") return { status: "issue", message: "A project reviewer declined one invoice line." };
    if (teamApprovalStatus === "invalidated") return { status: "issue", message: "This invoice changed and must be reviewed again." };
    if (["not_sent", "waiting", "partially_reviewed"].includes(teamApprovalStatus)) return { status: "waiting", message: "Team Approval is not complete." };
    if (isNoPurchaseOrderInvoice && !noPoReasonIsComplete) return { status: "waiting", message: "Select why this invoice does not use a Purchase Order." };
    if (genuineCommercialBlocker) return { status: "issue", message: genuineCommercialBlocker.message };
    if (genuineXeroBlocker) {
      const businessMessage = genuineXeroBlocker.code === "missing_contact_link"
        ? "The supplier needs to be connected to Xero."
        : genuineXeroBlocker.code === "total_reconciliation_failure"
          ? "The invoice total does not match its lines."
          : genuineXeroBlocker.code === "missing_tax_type"
            ? "TradesStack could not validate GST."
            : genuineXeroBlocker.message;
      return { status: "issue", message: businessMessage };
    }
    return { status: "ready", message: "Everything is ready." };
  }, [exportStatus, genuineCommercialBlocker, genuineXeroBlocker, isNoPurchaseOrderInvoice, isUpdatingXeroBill, noPoReasonIsComplete, teamApprovalStatus]);
  const purchaseOrderProgressByLineId = useMemo(
    () =>
      new Map(
        matchedPurchaseOrderProgress.flatMap((progress) =>
          progress.lineProgress.map((line) => [line.id, line] as const)
        )
      ),
    [matchedPurchaseOrderProgress]
  );
  const comparisonProgressByLineId = useMemo(
    () =>
      new Map(
        commercialComparison.purchaseOrderProgress.flatMap((progress) =>
          progress.lines.map((line) => [line.id, line] as const)
        )
      ),
    [commercialComparison.purchaseOrderProgress]
  );
  const activeAllocationsByPurchaseOrderLineId = useMemo(() => {
    const grouped = new Map<string, SupplierInvoiceLineAllocationRow[]>();
    draftAllocations
      .filter(
        (allocation) =>
          allocation.purchase_order_line_item_id
          && allocation.edit_state !== "reversed"
          && allocation.edit_state !== "superseded"
      )
      .forEach((allocation) => {
        const lineId = allocation.purchase_order_line_item_id as string;
        grouped.set(lineId, [...(grouped.get(lineId) ?? []), allocation]);
      });
    return grouped;
  }, [draftAllocations]);
  function beginLineAllocation(invoiceLineId: string) {
    setActiveAllocationInvoiceLineId(invoiceLineId);
  }

  function openReverseActualCostDialog(params: {
    allocation: SupplierInvoiceLineAllocationRow;
    event: ProjectActualCostEventRow;
  }) {
    setReverseTarget(params);
    setReversalReason("");
    setReversalNote("");
    setError(null);
    setMessage(null);
    setIsReverseActualCostDialogOpen(true);
  }

  function closeReverseActualCostDialog(options?: { force?: boolean }) {
    if (isReversingActualCost && !options?.force) {
      return;
    }

    setIsReverseActualCostDialogOpen(false);
    setReverseTarget(null);
    setReversalReason("");
    setReversalNote("");
  }

  useEffect(() => {
    if (!currentDocument) {
      setCurrentDocumentSignedUrl(null);
      setDocumentsLoading(false);
      return;
    }

    if (!session?.id) {
      setCurrentDocumentSignedUrl(null);
      setDocumentsLoading(true);
      return;
    }

    let cancelled = false;
    setDocumentsLoading(true);

    void (async () => {
      const { data, error: signedUrlError } = await supabase.storage
        .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
        .createSignedUrl(currentDocument.file_path, 60 * 60);

      if (!cancelled) {
        setCurrentDocumentSignedUrl(signedUrlError ? null : data?.signedUrl ?? null);
        setDocumentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentDocument, documentRefreshNonce, session?.id, supabase]);

  useEffect(() => {
    if (!documentExtraction || !["queued", "processing"].includes(documentExtraction.status)) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await loadSupplierInvoiceDocumentStateAction({
            supplierInvoiceId: invoice.id,
          });
          if (!result.ok || cancelled) {
            return;
          }

          setCurrentDocument(result.currentDocument ?? null);
          setDocumentExtraction(result.extraction ?? null);
        } catch {
          // Keep the current draft and let the next poll retry.
        }
      })();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [documentExtraction?.id, documentExtraction?.status, invoice.id]);

  async function refreshWorkflowState() {
    const [
      { data: refreshedInvoice, error: invoiceRefreshError },
      { data: refreshedMatches, error: matchesRefreshError },
      { data: refreshedApprovalSteps, error: approvalStepsRefreshError },
      { data: refreshedActivityEvents, error: activityEventsRefreshError },
      { data: refreshedDraftAllocations, error: draftAllocationsRefreshError },
      { data: refreshedActualCostEvents, error: actualCostEventsRefreshError },
    ] = await Promise.all([
      supabase
        .from("supplier_invoices")
        .select("*")
        .eq("id", invoice.id)
        .eq("organization_id", organizationId)
        .single(),
      supabase
        .from("supplier_invoice_purchase_order_matches")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("supplier_invoice_approval_steps")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("supplier_invoice_activity_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("supplier_invoice_line_allocations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id)
        .order("supplier_invoice_line_id", { ascending: true })
        .order("allocation_sequence", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("project_actual_cost_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id)
        .order("created_at", { ascending: true }),
    ]);

    if (invoiceRefreshError) {
      throw new Error(invoiceRefreshError.message);
    }
    if (matchesRefreshError) {
      throw new Error(matchesRefreshError.message);
    }
    if (approvalStepsRefreshError) {
      throw new Error(approvalStepsRefreshError.message);
    }
    if (activityEventsRefreshError) {
      throw new Error(activityEventsRefreshError.message);
    }
    if (draftAllocationsRefreshError) {
      throw new Error(draftAllocationsRefreshError.message);
    }
    if (actualCostEventsRefreshError) {
      throw new Error(actualCostEventsRefreshError.message);
    }

    if (refreshedInvoice) {
      setInvoice(refreshedInvoice as SupplierInvoiceRow);
      setFormState(toInvoiceFormState(refreshedInvoice as SupplierInvoiceRow));
    }
    setMatches((refreshedMatches ?? []) as SupplierInvoicePurchaseOrderMatchRow[]);
    setApprovalSteps((refreshedApprovalSteps ?? []) as SupplierInvoiceApprovalStepRow[]);
    setActivityEvents((refreshedActivityEvents ?? []) as SupplierInvoiceActivityEventRow[]);
    replaceDraftAllocations(
      (refreshedDraftAllocations ?? []) as SupplierInvoiceLineAllocationRow[]
    );
    setActualCostEvents((refreshedActualCostEvents ?? []) as ProjectActualCostEventRow[]);
  }

  function buildInitialMatchDrafts() {
    return matches.reduce<Record<string, PurchaseOrderMatchDraft>>((accumulator, match) => {
      if (!matchCountsTowardInvoiceTotal(match.match_status)) {
        return accumulator;
      }

      accumulator[match.purchase_order_id] = {
        id: match.id,
        matchedAmount: Number(match.matched_amount ?? 0).toFixed(2),
        matchStatus: match.match_status === "adjusted" ? "adjusted" : "accepted",
      };
      return accumulator;
    }, {});
  }

  function openMatchDialog() {
    setMatchDrafts(buildInitialMatchDrafts());
    setMatchSearchQuery("");
    setIsMatchDialogOpen(true);
    setError(null);
  }

  const filteredPurchaseOrders = useMemo(() => {
    const query = normalizePurchaseOrderSearchValue(matchSearchQuery);
    const invoiceSupplierId = formState.supplierId || null;

    return [...purchaseOrders]
      .filter((purchaseOrder) => {
        if (!query) {
          return true;
        }

        return [
          purchaseOrder.purchase_order_number,
          purchaseOrder.purchase_order_title,
          purchaseOrder.issued_to_label,
          purchaseOrder.status,
        ].some((value) => normalizePurchaseOrderSearchValue(value).includes(query));
      })
      .sort((left, right) => {
        const leftHasExistingMatch = Boolean(matchDrafts[left.id]?.matchedAmount);
        const rightHasExistingMatch = Boolean(matchDrafts[right.id]?.matchedAmount);
        if (leftHasExistingMatch !== rightHasExistingMatch) {
          return leftHasExistingMatch ? -1 : 1;
        }

        const leftSupplierMatch = invoiceSupplierId && left.supplier_id === invoiceSupplierId;
        const rightSupplierMatch = invoiceSupplierId && right.supplier_id === invoiceSupplierId;
        if (leftSupplierMatch !== rightSupplierMatch) {
          return leftSupplierMatch ? -1 : 1;
        }

        return normalizePurchaseOrderSearchValue(left.purchase_order_number).localeCompare(
          normalizePurchaseOrderSearchValue(right.purchase_order_number)
        );
      });
  }, [formState.supplierId, matchDrafts, matchSearchQuery, purchaseOrders]);

  const draftMatchedTotal = useMemo(
    () =>
      Object.values(matchDrafts).reduce((sum, draft) => {
        if (!matchCountsTowardInvoiceTotal(draft.matchStatus)) {
          return sum;
        }
        return sum + numberString(draft.matchedAmount);
      }, 0),
    [matchDrafts]
  );

  async function saveMatches() {
    if (!canEditInvoice || isSavingMatches) {
      return;
    }
    if (!session?.id) {
      setError("You must be signed in to update invoice matches.");
      return;
    }

    const invoiceTotal = Number(invoice.total ?? 0);
    if (draftMatchedTotal > invoiceTotal + 0.0001) {
      setError("Allocated and adjusted allocation amounts cannot exceed the supplier invoice total.");
      return;
    }

    setIsSavingMatches(true);
    setError(null);
    setMessage(null);

    try {
      const previousMatches = matches;
      const previousMatchById = new Map(previousMatches.map((match) => [match.id, match]));
      const draftEntries = Object.entries(matchDrafts);
      const nextRows = draftEntries
        .map(([purchaseOrderId, draft]) => {
          const baseRow = {
            organization_id: organizationId,
            supplier_invoice_id: invoice.id,
            purchase_order_id: purchaseOrderId,
            matched_amount: Number(numberString(draft.matchedAmount).toFixed(2)),
            match_status: draft.matchStatus,
            confidence_score: null,
            match_basis: "manual" as const,
            created_by: session.id,
          };

          return draft.id
            ? {
                id: draft.id,
                ...baseRow,
              }
            : baseRow;
        })
        .filter((draft) => draft.matched_amount > 0);

      const existingRows = nextRows.filter(
        (row): row is typeof row & { id: string } => "id" in row && typeof row.id === "string"
      );
      const newRows = nextRows.filter(
        (row): row is Omit<typeof row, "id"> => !("id" in row)
      );

      const untouchedRejectedMatches = matches.filter(
        (match) => !matchCountsTowardInvoiceTotal(match.match_status)
      );
      const keptMatchIds = new Set(
        nextRows
          .map((row) => ("id" in row ? row.id : undefined))
          .filter((value): value is string => Boolean(value))
      );
      const matchIdsToDelete = matches
        .filter(
          (match) =>
            matchCountsTowardInvoiceTotal(match.match_status) && !keptMatchIds.has(match.id)
        )
        .map((match) => match.id);

      if (matchIdsToDelete.length > 0) {
        for (const matchId of matchIdsToDelete) {
          const existing = matches.find((match) => match.id === matchId);
          if (!existing) continue;
          const result = await removeSupplierInvoicePurchaseOrderMatchAction({
            supplierInvoiceId: invoice.id,
            purchaseOrderId: existing.purchase_order_id,
          });
          if (!result.ok) throw new Error(result.error ?? "Unable to remove Purchase Order match.");
          if (result.workflow) setWorkflowState(result.workflow);
        }
      }

      if (nextRows.length > 0) {
        const savedMatches: SupplierInvoicePurchaseOrderMatchRow[] = [];

        if (existingRows.length > 0) {
          for (const row of existingRows) {
            const result = await confirmSupplierInvoicePurchaseOrderMatchAction({
              supplierInvoiceId: invoice.id,
              purchaseOrderId: row.purchase_order_id,
            });
            if (!result.ok) throw new Error(result.error ?? "Unable to confirm Purchase Order match.");
            if (result.workflow) setWorkflowState(result.workflow);
          }
        }

        if (newRows.length > 0) {
          for (const row of newRows) {
            const result = await confirmSupplierInvoicePurchaseOrderMatchAction({
              supplierInvoiceId: invoice.id,
              purchaseOrderId: row.purchase_order_id,
            });
            if (!result.ok) throw new Error(result.error ?? "Unable to confirm Purchase Order match.");
            if (result.workflow) setWorkflowState(result.workflow);
          }
        }

        const { data: savedRows, error: savedRowsError } = await supabase
          .from("supplier_invoice_purchase_order_matches")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("supplier_invoice_id", invoice.id)
          .in("purchase_order_id", nextRows.map((row) => row.purchase_order_id));
        if (savedRowsError) throw new Error("Unable to refresh Purchase Order matches.");
        savedMatches.push(...((savedRows ?? []) as SupplierInvoicePurchaseOrderMatchRow[]));

        const savedPurchaseOrderIds = new Set(savedMatches.map((match) => match.purchase_order_id));
        setMatches([
          ...savedMatches,
          ...untouchedRejectedMatches.filter(
            (match) => !savedPurchaseOrderIds.has(match.purchase_order_id)
          ),
        ]);
        } else {
        setMatches(untouchedRejectedMatches);
      }

      try {
        const intelligenceEvents: Array<ReturnType<typeof buildSupplierInvoiceIntelligenceEvent>> = [];
        let persistedMatchRows: SupplierInvoicePurchaseOrderMatchRow[] = [];
        if (nextRows.length > 0) {
          const { data: refreshedRows, error: refreshedRowsError } = await supabase
            .from("supplier_invoice_purchase_order_matches")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("supplier_invoice_id", invoice.id)
            .in("purchase_order_id", nextRows.map((row) => row.purchase_order_id));

          if (refreshedRowsError) {
            throw new Error(refreshedRowsError.message);
          }

          persistedMatchRows = (refreshedRows ?? []) as SupplierInvoicePurchaseOrderMatchRow[];
        }

        persistedMatchRows.forEach((match) => {
          const previousMatch = previousMatchById.get(match.id) ?? null;
          intelligenceEvents.push(
            buildSupplierInvoiceIntelligenceEvent({
              organizationId,
              module: "supplier_invoices",
              eventFamily: "commercial_action",
              eventType: "supplier_invoice_match_confirmed",
              action: "confirmed",
              entityType: "supplier_invoice_purchase_order_match",
              entityId: match.id,
              beforeData: previousMatch ? buildPurchaseOrderMatchCompactSummary(previousMatch) : null,
              afterData: buildPurchaseOrderMatchCompactSummary(match),
              metadata: {
                supplierInvoiceId: invoice.id,
              },
              reason: previousMatch
                ? "Purchase order match updated and retained on the invoice."
                : "Purchase order match added to the invoice.",
            })
          );

        if (hasAiSupplierInvoiceMatchSuggestion(match)) {
          if (!previousMatch) {
            intelligenceEvents.push(
              buildSupplierInvoiceIntelligenceEvent({
                organizationId,
                module: "supplier_invoices",
                eventFamily: "ai_interaction",
                eventType: "supplier_invoice_match_suggested",
                action: "suggested",
                entityType: "supplier_invoice_purchase_order_match",
                entityId: match.id,
                afterData: buildPurchaseOrderMatchCompactSummary(match),
                metadata: {
                  supplierInvoiceId: invoice.id,
                  confidenceScore: match.confidence_score,
                },
                reason: "AI-assisted purchase order match suggestion persisted on the invoice.",
              })
            );
          }

          const changedAmount =
            previousMatch && Number(previousMatch.matched_amount ?? 0) !== Number(match.matched_amount ?? 0);
            const changedStatus = previousMatch && previousMatch.match_status !== match.match_status;
            const aiDisposition = changedAmount || changedStatus ? "edited" : "accepted";

            intelligenceEvents.push(
              buildSupplierInvoiceIntelligenceEvent({
                organizationId,
                module: "supplier_invoices",
                eventFamily: "ai_interaction",
                eventType:
                  aiDisposition === "edited"
                    ? "ai_supplier_invoice_match_edited"
                    : "ai_supplier_invoice_match_accepted",
                action: aiDisposition,
                entityType: "supplier_invoice_purchase_order_match",
                entityId: match.id,
                beforeData: previousMatch ? buildPurchaseOrderMatchCompactSummary(previousMatch) : null,
                afterData: buildPurchaseOrderMatchCompactSummary(match),
                metadata: {
                  supplierInvoiceId: invoice.id,
                  confidenceScore: match.confidence_score,
                },
                reason:
                  aiDisposition === "edited"
                    ? "AI-assisted purchase order match was edited before being retained."
                    : "AI-assisted purchase order match was accepted.",
              })
            );
          }
        });

        const rejectedMatches = previousMatches.filter((match) => matchIdsToDelete.includes(match.id));
        rejectedMatches.forEach((match) => {
          intelligenceEvents.push(
            buildSupplierInvoiceIntelligenceEvent({
              organizationId,
              module: "supplier_invoices",
              eventFamily: "correction",
              eventType: "supplier_invoice_match_rejected",
              action: "rejected",
              entityType: "supplier_invoice_purchase_order_match",
              entityId: match.id,
              beforeData: buildPurchaseOrderMatchCompactSummary(match),
              afterData: null,
              metadata: {
                supplierInvoiceId: invoice.id,
              },
              reason: "Purchase order match removed from the invoice.",
            })
          );

          if (hasAiSupplierInvoiceMatchSuggestion(match)) {
            intelligenceEvents.push(
              buildSupplierInvoiceIntelligenceEvent({
                organizationId,
                module: "supplier_invoices",
                eventFamily: "ai_interaction",
                eventType: "ai_supplier_invoice_match_rejected",
                action: "rejected",
                entityType: "supplier_invoice_purchase_order_match",
                entityId: match.id,
                beforeData: buildPurchaseOrderMatchCompactSummary(match),
                afterData: null,
                metadata: {
                  supplierInvoiceId: invoice.id,
                  confidenceScore: match.confidence_score,
                },
                reason: "AI-assisted purchase order match was removed from the invoice.",
              })
            );
          }
        });

        await emitIntelligenceEvents(intelligenceEvents);

        for (const match of persistedMatchRows) {
          if (!hasAiSupplierInvoiceMatchSuggestion(match)) {
            continue;
          }

          const previousMatch = previousMatchById.get(match.id) ?? null;
          const changedAmount =
            previousMatch && Number(previousMatch.matched_amount ?? 0) !== Number(match.matched_amount ?? 0);
          const changedStatus = previousMatch && previousMatch.match_status !== match.match_status;

          try {
            const aiInteractionId = await createSupplierInvoiceAiInteraction(supabase, {
              organizationId,
              subjectEntityType: "supplier_invoice_purchase_order_match",
              subjectEntityId: match.id,
              confidence: match.confidence_score,
              humanDisposition: changedAmount || changedStatus ? "edited" : "accepted",
              humanFeedbackSummary:
                changedAmount || changedStatus
                  ? "User edited an AI-assisted supplier invoice purchase order match."
                  : "User accepted an AI-assisted supplier invoice purchase order match.",
              outputStructured: (previousMatch
                ? buildPurchaseOrderMatchCompactSummary(previousMatch)
                : buildPurchaseOrderMatchCompactSummary(match)) as unknown as Json,
              editedOutput: changedAmount || changedStatus ? (buildPurchaseOrderMatchCompactSummary(match) as unknown as Json) : null,
            });

            if (changedAmount || changedStatus) {
              await writeSupplierInvoiceCorrectionEvent(supabase, {
                organizationId,
                targetEntityType: "supplier_invoice_purchase_order_match",
                targetEntityId: match.id,
                correctionType: "manual_override",
                correctedFieldName: changedAmount ? "matched_amount" : "match_status",
                incorrectValue: previousMatch ? (buildPurchaseOrderMatchCompactSummary(previousMatch) as unknown as Json) : null,
                correctedValue: buildPurchaseOrderMatchCompactSummary(match) as unknown as Json,
                correctionReason: "User edited an AI-assisted supplier invoice purchase order match.",
                feedbackLabel: "ai_match_edited",
                linkedAiInteractionId: aiInteractionId,
              });
            }
          } catch (aiError) {
            logSupplierInvoiceIntelligenceFailure("supplier-invoice-match-ai", aiError);
          }
        }

        for (const match of rejectedMatches) {
          if (!hasAiSupplierInvoiceMatchSuggestion(match)) {
            continue;
          }

          try {
            await createSupplierInvoiceAiInteraction(supabase, {
              organizationId,
              subjectEntityType: "supplier_invoice_purchase_order_match",
              subjectEntityId: match.id,
              confidence: match.confidence_score,
              humanDisposition: "rejected",
              humanFeedbackSummary: "User rejected an AI-assisted supplier invoice purchase order match.",
              outputStructured: buildPurchaseOrderMatchCompactSummary(match) as unknown as Json,
              editedOutput: null,
            });
          } catch (aiError) {
            logSupplierInvoiceIntelligenceFailure("supplier-invoice-match-ai-rejected", aiError);
          }
        }
      } catch (intelligenceError) {
        logSupplierInvoiceIntelligenceFailure("supplier-invoice-save-matches", intelligenceError);
      }

      await refreshWorkflowState();
      setIsMatchDialogOpen(false);
      setMessage("Purchase order matches updated.");
    } catch (saveMatchesError) {
      setError(
        saveMatchesError instanceof Error
          ? saveMatchesError.message
          : "Unable to update purchase order matches."
      );
    } finally {
      setIsSavingMatches(false);
    }
  }

  async function saveDraftAllocation(params: {
    invoiceLineId: string;
    purchaseOrderLineItemId: string;
  }) {
    if (!canEditInvoice || isSavingDraftAllocations) {
      return false;
    }

    setIsSavingDraftAllocations(true);
    setError(null);
    setMessage(null);

    try {
      const result = await saveSupplierInvoiceDraftAllocationAction({
        organizationId,
        supplierInvoiceId: invoice.id,
        invoiceLineId: params.invoiceLineId,
        purchaseOrderLineItemId: params.purchaseOrderLineItemId,
      });

      if (!result.ok || !result.allocations) {
        throw new Error(result.error ?? "Unable to save the draft allocation.");
      }

      replaceDraftAllocations(result.allocations);
      await refreshWorkflowState();
      setMessage("Draft allocation saved. This does not affect invoice approval, PO match status, or actual costs yet.");
      return true;
    } catch (saveDraftAllocationError) {
      setError(
        saveDraftAllocationError instanceof Error
          ? saveDraftAllocationError.message
          : "Unable to save the draft allocation."
      );
      return false;
    } finally {
      setIsSavingDraftAllocations(false);
    }
  }

  async function saveAllReadyDraftAllocations() {
    if (!canEditInvoice || isSavingDraftAllocations || readyDraftCandidates.length === 0) {
      return;
    }

    setIsSavingDraftAllocations(true);
    setError(null);
    setMessage(null);

    try {
      const result = await saveAllReadySupplierInvoiceDraftAllocationsAction({
        organizationId,
        supplierInvoiceId: invoice.id,
        candidates: readyDraftCandidates,
      });

      if (!result.ok || !result.allocations) {
        throw new Error(result.error ?? "Unable to save ready draft allocations.");
      }

      replaceDraftAllocations(result.allocations);
      await refreshWorkflowState();
      setMessage("Ready draft allocations saved. This does not affect invoice approval, PO match status, or actual costs yet.");
    } catch (saveAllError) {
      setError(
        saveAllError instanceof Error ? saveAllError.message : "Unable to save ready draft allocations."
      );
    } finally {
      setIsSavingDraftAllocations(false);
    }
  }

  async function markLineUnmatched(invoiceLineId: string) {
    if (!canEditInvoice || isSavingDraftAllocations) {
      return false;
    }

    setIsSavingDraftAllocations(true);
    setError(null);
    setMessage(null);

    try {
      const result = await markSupplierInvoiceLineAllocationUnmatchedAction({
        organizationId,
        supplierInvoiceId: invoice.id,
        invoiceLineId,
      });

      if (!result.ok || !result.allocations) {
        throw new Error(result.error ?? "Unable to mark the invoice line as unmatched.");
      }

      replaceDraftAllocations(result.allocations);
      await refreshWorkflowState();
      setMessage("Draft allocation saved as unmatched. This does not affect invoice approval, PO match status, or actual costs yet.");
      return true;
    } catch (markUnmatchedError) {
      setError(
        markUnmatchedError instanceof Error
          ? markUnmatchedError.message
          : "Unable to mark the invoice line as unmatched."
      );
      return false;
    } finally {
      setIsSavingDraftAllocations(false);
    }
  }

  async function approveDraftAllocation(params: {
    allocationId: string;
    requiresNote?: boolean;
  }) {
    if (!canReview || isReviewingAllocationId) {
      return;
    }

    const note = allocationReviewNotes[params.allocationId]?.trim() ?? "";
    if (params.requiresNote && note.length === 0) {
      setError("Add a reason before approving an unmatched allocation.");
      return;
    }

    setIsReviewingAllocationId(params.allocationId);
    setError(null);
    setMessage(null);

    try {
      const result = await approveSupplierInvoiceDraftAllocationAction({
        organizationId,
        supplierInvoiceId: invoice.id,
        allocationId: params.allocationId,
        note,
      });

      if (!result.ok || !result.allocations) {
        throw new Error(result.error ?? "Unable to approve the draft allocation.");
      }

      replaceDraftAllocations(result.allocations);
      setAllocationReviewNotes((current) => ({ ...current, [params.allocationId]: "" }));
      setAllocationReviewNoteMode((current) =>
        current?.allocationId === params.allocationId ? null : current
      );
      await refreshWorkflowState();
      setMessage("Line allocation approved. This does not change PO match approval, invoice status, or actual costs yet.");
    } catch (approveError) {
      setError(
        approveError instanceof Error ? approveError.message : "Unable to approve the draft allocation."
      );
    } finally {
      setIsReviewingAllocationId(null);
    }
  }

  async function disputeDraftAllocation(allocationId: string) {
    if (!canReview || isReviewingAllocationId) {
      return;
    }

    const note = allocationReviewNotes[allocationId]?.trim() ?? "";
    if (note.length === 0) {
      setError("Add a dispute reason before marking an allocation as disputed.");
      return;
    }

    setIsReviewingAllocationId(allocationId);
    setError(null);
    setMessage(null);

    try {
      const result = await disputeSupplierInvoiceDraftAllocationAction({
        organizationId,
        supplierInvoiceId: invoice.id,
        allocationId,
        note,
      });

      if (!result.ok || !result.allocations) {
        throw new Error(result.error ?? "Unable to dispute the draft allocation.");
      }

      replaceDraftAllocations(result.allocations);
      setAllocationReviewNotes((current) => ({ ...current, [allocationId]: "" }));
      setAllocationReviewNoteMode((current) =>
        current?.allocationId === allocationId ? null : current
      );
      await refreshWorkflowState();
      setMessage("Line allocation marked disputed. This does not change PO match approval, invoice status, or actual costs yet.");
    } catch (disputeError) {
      setError(
        disputeError instanceof Error ? disputeError.message : "Unable to dispute the draft allocation."
      );
    } finally {
      setIsReviewingAllocationId(null);
    }
  }

  async function postApprovedActualCosts() {
    if (!canReview || isPostingActualCosts || approvedUnpostedActualCostSummary.count === 0) {
      return;
    }

    const confirmed = window.confirm(
      [
        "This will create actual-cost ledger entries for approved line allocations.",
        "This does not change invoice status or PO match approval.",
        "Posted actual costs should be corrected with reversal entries, not edited directly.",
      ].join("\n\n")
    );

    if (!confirmed) {
      return;
    }

    setIsPostingActualCosts(true);
    setError(null);
    setMessage(null);

    try {
      const result = await postSupplierInvoiceActualCostsAction({
        organizationId,
        supplierInvoiceId: invoice.id,
      });

      if (!result.ok || !result.posting) {
        throw new Error(result.error ?? "Unable to post approved actual costs.");
      }

      await refreshWorkflowState();
      setMessage(
        result.posting.skippedCount > 0
          ? `Posted ${result.posting.postedCount} actual cost events. ${result.posting.skippedCount} allocations were skipped.`
          : `Posted ${result.posting.postedCount} actual cost events.`
      );
    } catch (postError) {
      setError(
        postError instanceof Error ? postError.message : "Unable to post approved actual costs."
      );
    } finally {
      setIsPostingActualCosts(false);
    }
  }

  async function reverseActualCostEvent() {
    if (!reverseTarget || !canReverse || isReversingActualCost) {
      return;
    }

    const normalizedReason = reversalReason.trim();
    if (normalizedReason.length === 0) {
      setError("Select a reversal reason before continuing.");
      return;
    }

    setIsReversingActualCost(true);
    setError(null);
    setMessage(null);

    try {
      const result = await reverseSupplierInvoiceActualCostEventAction({
        organizationId,
        supplierInvoiceId: invoice.id,
        eventId: reverseTarget.event.id,
        reversalReason: normalizedReason,
        reversalNote: reversalNote.trim() || null,
      });

      if (!result.ok || !result.reversal) {
        throw new Error(result.error ?? "Unable to reverse the actual cost event.");
      }

      await refreshWorkflowState();
      closeReverseActualCostDialog({ force: true });
      setMessage(
        "Actual cost reversed. A new correction draft allocation was created for review. This does not change invoice status or PO match approval."
      );
    } catch (reverseError) {
      setError(
        reverseError instanceof Error
          ? reverseError.message
          : "Unable to reverse the actual cost event."
      );
    } finally {
      setIsReversingActualCost(false);
    }
  }

  async function updateMatchStatus(matchId: string, nextStatus: "rejected") {
    setError(null);
    setMessage(null);

    try {
      const existingMatch = matches.find((match) => match.id === matchId) ?? null;
      if (!existingMatch) throw new Error("Purchase Order match not found.");
      const result = await removeSupplierInvoicePurchaseOrderMatchAction({
        supplierInvoiceId: invoice.id,
        purchaseOrderId: existingMatch.purchase_order_id,
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to update match.");
      if (result.workflow) setWorkflowState(result.workflow);
      const updatedMatch = { ...existingMatch, match_status: nextStatus };

      setMatches((current) =>
        current.map((match) => (match.id === matchId ? (updatedMatch as SupplierInvoicePurchaseOrderMatchRow) : match))
      );

      await emitIntelligenceEvents([
        buildSupplierInvoiceIntelligenceEvent({
          organizationId,
          module: "supplier_invoices",
          eventFamily: "correction",
          eventType: "supplier_invoice_match_rejected",
          action: "rejected",
          entityType: "supplier_invoice_purchase_order_match",
          entityId: updatedMatch.id,
          beforeData: existingMatch ? buildPurchaseOrderMatchCompactSummary(existingMatch) : null,
          afterData: buildPurchaseOrderMatchCompactSummary(updatedMatch as SupplierInvoicePurchaseOrderMatchRow),
          metadata: {
            supplierInvoiceId: invoice.id,
          },
          reason: "Purchase order match was marked rejected.",
        }),
        ...(hasAiSupplierInvoiceMatchSuggestion(updatedMatch as SupplierInvoicePurchaseOrderMatchRow)
          ? [
              buildSupplierInvoiceIntelligenceEvent({
                organizationId,
                module: "supplier_invoices",
                eventFamily: "ai_interaction",
                eventType: "ai_supplier_invoice_match_rejected",
                action: "rejected",
                entityType: "supplier_invoice_purchase_order_match",
                entityId: updatedMatch.id,
                beforeData: existingMatch ? buildPurchaseOrderMatchCompactSummary(existingMatch) : null,
                afterData: buildPurchaseOrderMatchCompactSummary(updatedMatch as SupplierInvoicePurchaseOrderMatchRow),
                metadata: {
                  supplierInvoiceId: invoice.id,
                  confidenceScore: (updatedMatch as SupplierInvoicePurchaseOrderMatchRow).confidence_score,
                },
                reason: "AI-assisted purchase order match was rejected.",
              }),
            ]
          : []),
      ]);
      if (hasAiSupplierInvoiceMatchSuggestion(updatedMatch as SupplierInvoicePurchaseOrderMatchRow)) {
        try {
          await createSupplierInvoiceAiInteraction(supabase, {
            organizationId,
            subjectEntityType: "supplier_invoice_purchase_order_match",
            subjectEntityId: updatedMatch.id,
            confidence: (updatedMatch as SupplierInvoicePurchaseOrderMatchRow).confidence_score,
            humanDisposition: "rejected",
            humanFeedbackSummary: "User rejected an AI-assisted supplier invoice purchase order match.",
            outputStructured: ((existingMatch
              ? buildPurchaseOrderMatchCompactSummary(existingMatch)
              : buildPurchaseOrderMatchCompactSummary(updatedMatch as SupplierInvoicePurchaseOrderMatchRow)) as unknown as Json),
            editedOutput: buildPurchaseOrderMatchCompactSummary(updatedMatch as SupplierInvoicePurchaseOrderMatchRow) as unknown as Json,
          });
        } catch (aiError) {
          logSupplierInvoiceIntelligenceFailure("supplier-invoice-update-match-ai", aiError);
        }
      }
      await refreshWorkflowState();
      setMessage("Purchase order match updated.");
    } catch (updateMatchError) {
      setError(updateMatchError instanceof Error ? updateMatchError.message : "Unable to update match.");
    }
  }

  async function removeMatch(matchId: string) {
    setError(null);
    setMessage(null);

    try {
      const existingMatch = matches.find((match) => match.id === matchId) ?? null;
      if (!existingMatch) throw new Error("Purchase Order match not found.");
      const result = await removeSupplierInvoicePurchaseOrderMatchAction({
        supplierInvoiceId: invoice.id,
        purchaseOrderId: existingMatch.purchase_order_id,
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to remove match.");
      if (result.workflow) setWorkflowState(result.workflow);

      setMatches((current) => current.filter((match) => match.id !== matchId));
      if (existingMatch) {
        await emitIntelligenceEvents([
          buildSupplierInvoiceIntelligenceEvent({
            organizationId,
            module: "supplier_invoices",
            eventFamily: "correction",
            eventType: "supplier_invoice_match_rejected",
            action: "rejected",
            entityType: "supplier_invoice_purchase_order_match",
            entityId: existingMatch.id,
            beforeData: buildPurchaseOrderMatchCompactSummary(existingMatch),
            afterData: null,
            metadata: {
              supplierInvoiceId: invoice.id,
            },
            reason: "Purchase order match removed from the invoice.",
          }),
          ...(hasAiSupplierInvoiceMatchSuggestion(existingMatch)
            ? [
                buildSupplierInvoiceIntelligenceEvent({
                  organizationId,
                  module: "supplier_invoices",
                  eventFamily: "ai_interaction",
                  eventType: "ai_supplier_invoice_match_rejected",
                  action: "rejected",
                  entityType: "supplier_invoice_purchase_order_match",
                  entityId: existingMatch.id,
                  beforeData: buildPurchaseOrderMatchCompactSummary(existingMatch),
                  afterData: null,
                  metadata: {
                    supplierInvoiceId: invoice.id,
                    confidenceScore: existingMatch.confidence_score,
                  },
                  reason: "AI-assisted purchase order match removed from the invoice.",
                }),
              ]
            : []),
        ]);
        if (hasAiSupplierInvoiceMatchSuggestion(existingMatch)) {
          try {
            await createSupplierInvoiceAiInteraction(supabase, {
              organizationId,
              subjectEntityType: "supplier_invoice_purchase_order_match",
              subjectEntityId: existingMatch.id,
              confidence: existingMatch.confidence_score,
              humanDisposition: "rejected",
              humanFeedbackSummary: "User removed an AI-assisted supplier invoice purchase order match.",
              outputStructured: buildPurchaseOrderMatchCompactSummary(existingMatch) as unknown as Json,
              editedOutput: null,
            });
          } catch (aiError) {
            logSupplierInvoiceIntelligenceFailure("supplier-invoice-remove-match-ai", aiError);
          }
        }
      }
      await refreshWorkflowState();
      setMessage("Purchase order match removed.");
    } catch (deleteMatchError) {
      setError(deleteMatchError instanceof Error ? deleteMatchError.message : "Unable to remove match.");
    }
  }

  async function saveInvoice() {
    if (!canEditInvoice || isSaving) {
      return;
    }
    if (actualCostEvents.some((event) => event.event_status === "posted")) {
      setError("This invoice has posted actual costs. Correct posted costs with reversal entries before editing the invoice.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const nextInvoiceTotal = numberString(formState.total);
      const result = await saveSupplierInvoiceCaptureAction({
        supplierInvoiceId: invoice.id,
        supplierId: formState.supplierId,
        invoiceNumber: formState.invoiceNumber,
        supplierPoReference: formState.supplierPoReference || null,
        invoiceDate: formState.invoiceDate,
        dueDate: formState.dueDate || null,
        subtotal: numberString(formState.subtotal),
        taxTotal: numberString(formState.taxTotal),
        total: nextInvoiceTotal,
        notes: formState.notes,
        lines: lines.map((line, index) => ({
          id: line.id,
          description: line.description,
          supplierItemCode: line.supplierItemCode || null,
          quantity: numberString(line.quantity),
          unitPrice: numberString(line.unitPrice),
          lineTotal: numberString(line.lineTotal),
          taxAmount: numberString(line.taxAmount),
          costCodeId: line.costCodeId || null,
          projectId: line.projectId || null,
          sortOrder: index,
        })),
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to update invoice.");
      if (result.workflow) setWorkflowState(result.workflow);
      const updatedInvoice = { ...invoice, supplier_po_reference: formState.supplierPoReference || null };
      const autoReReviewed = false;

      const invoiceEvents: Array<ReturnType<typeof buildSupplierInvoiceIntelligenceEvent>> = [];
      if (invoice.status !== updatedInvoice.status) {
        if (updatedInvoice.status === "Needs Review") {
          invoiceEvents.push(
            buildSupplierInvoiceIntelligenceEvent({
              organizationId,
              module: "supplier_invoices",
              eventFamily: "approval",
              eventType: "supplier_invoice_approval_requested",
              action: "requested",
              entityType: "supplier_invoice",
              entityId: updatedInvoice.id,
              beforeData: summarizeSupplierInvoiceHeader({
                supplierId: invoice.supplier_id,
                source: invoice.source,
                status: invoice.status,
                invoiceNumber: invoice.invoice_number,
                invoiceDate: invoice.invoice_date,
                dueDate: invoice.due_date,
                total: Number(invoice.total ?? 0),
                hasDocument: Boolean(invoice.document_file_path),
              }),
              afterData: summarizeSupplierInvoiceHeader({
                supplierId: updatedInvoice.supplier_id,
                source: updatedInvoice.source,
                status: updatedInvoice.status,
                invoiceNumber: updatedInvoice.invoice_number,
                invoiceDate: updatedInvoice.invoice_date,
                dueDate: updatedInvoice.due_date,
                total: Number(updatedInvoice.total ?? 0),
                hasDocument: Boolean(updatedInvoice.document_file_path),
              }),
              reason: autoReReviewed
                ? "Material invoice changes moved the invoice back into review."
                : "Invoice submitted for review.",
            })
          );
        } else if (updatedInvoice.status === "Approved") {
          invoiceEvents.push(
            buildSupplierInvoiceIntelligenceEvent({
              organizationId,
              module: "supplier_invoices",
              eventFamily: "approval",
              eventType: "supplier_invoice_approved",
              action: "approved",
              entityType: "supplier_invoice",
              entityId: updatedInvoice.id,
              beforeData: summarizeSupplierInvoiceHeader({
                supplierId: invoice.supplier_id,
                source: invoice.source,
                status: invoice.status,
                invoiceNumber: invoice.invoice_number,
                invoiceDate: invoice.invoice_date,
                dueDate: invoice.due_date,
                total: Number(invoice.total ?? 0),
                hasDocument: Boolean(invoice.document_file_path),
              }),
              afterData: summarizeSupplierInvoiceHeader({
                supplierId: updatedInvoice.supplier_id,
                source: updatedInvoice.source,
                status: updatedInvoice.status,
                invoiceNumber: updatedInvoice.invoice_number,
                invoiceDate: updatedInvoice.invoice_date,
                dueDate: updatedInvoice.due_date,
                total: Number(updatedInvoice.total ?? 0),
                hasDocument: Boolean(updatedInvoice.document_file_path),
              }),
              reason: "Invoice status approved.",
            })
          );
        } else if (updatedInvoice.status === "Disputed") {
          invoiceEvents.push(
            buildSupplierInvoiceIntelligenceEvent({
              organizationId,
              module: "supplier_invoices",
              eventFamily: "approval",
              eventType: "supplier_invoice_rejected",
              action: "rejected",
              entityType: "supplier_invoice",
              entityId: updatedInvoice.id,
              beforeData: summarizeSupplierInvoiceHeader({
                supplierId: invoice.supplier_id,
                source: invoice.source,
                status: invoice.status,
                invoiceNumber: invoice.invoice_number,
                invoiceDate: invoice.invoice_date,
                dueDate: invoice.due_date,
                total: Number(invoice.total ?? 0),
                hasDocument: Boolean(invoice.document_file_path),
              }),
              afterData: summarizeSupplierInvoiceHeader({
                supplierId: updatedInvoice.supplier_id,
                source: updatedInvoice.source,
                status: updatedInvoice.status,
                invoiceNumber: updatedInvoice.invoice_number,
                invoiceDate: updatedInvoice.invoice_date,
                dueDate: updatedInvoice.due_date,
                total: Number(updatedInvoice.total ?? 0),
                hasDocument: Boolean(updatedInvoice.document_file_path),
              }),
              reason: "Invoice status disputed.",
            })
          );
        }
      }

      setInvoice(updatedInvoice);
      setFormState(toInvoiceFormState(updatedInvoice));
      await emitIntelligenceEvents(invoiceEvents);
      await refreshWorkflowState();
      setMessage(
        autoReReviewed
          ? "Material changes sent this invoice back to Needs Review."
          : "Supplier invoice capture and lines updated."
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteInvoice() {
    if (!canDeleteInvoice || isDeletingInvoice) {
      return;
    }

    setIsDeletingInvoice(true);
    setError(null);
    setMessage(null);

    try {
      const result = await deleteSupplierInvoiceAction({
        supplierInvoiceId: invoice.id,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Unable to delete this Supplier Invoice.");
      }
      setIsDeleteDialogOpen(false);
      router.push("/app/company/supplier-invoices");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete this Supplier Invoice."
      );
      setIsDeletingInvoice(false);
    }
  }

  const primaryDocument = currentDocument
    ? ({
        ...currentDocument,
        signedUrl: currentDocumentSignedUrl,
      } satisfies DocumentWithUrl)
    : null;
  const extractedSupplierCandidates = useMemo(() => {
    const candidateIds =
      currentExtractionDraft?.supplierMatch.candidateSupplierIds ?? [];
    return suppliers.filter((supplier) => candidateIds.includes(supplier.id));
  }, [currentExtractionDraft?.supplierMatch, suppliers]);
  const currentSupplier = suppliers.find((supplier) => supplier.id === formState.supplierId) ?? null;
  const currentSupplierLabel = currentSupplier
    ? getSupplierDisplayName(currentSupplier)
    : formState.supplierId
      ? "Unknown supplier"
      : "No supplier selected";
  const extractedSupplierLabel = (() => {
    if (!currentExtractionDraft) {
      return "No extracted supplier";
    }

    if (currentExtractionDraft.supplierMatch.status === "high_confidence") {
      return currentExtractionDraft.supplierMatch.label;
    }

    if (currentExtractionDraft.supplierMatch.status === "ambiguous") {
      return "Multiple possible suppliers";
    }

    return "No extracted supplier match";
  })();
  const extractionHeaderRows: Array<{
    key: Exclude<HeaderApplyKey, "supplierId">;
    label: string;
    currentValue: string;
    extractedField: SupplierInvoiceExtractionField<string | number>;
    money?: boolean;
  }> = currentExtractionDraft
    ? [
        {
          key: "invoiceNumber",
          label: "Invoice Number",
          currentValue: formState.invoiceNumber || "Empty",
          extractedField: currentExtractionDraft.header.invoiceNumber,
        },
        {
          key: "supplierPoReference",
          label: "Supplier PO Reference",
          currentValue: formState.supplierPoReference || "Empty",
          extractedField: currentExtractionDraft.header.supplierPoReference,
        },
        {
          key: "invoiceDate",
          label: "Invoice Date",
          currentValue: formState.invoiceDate || "Empty",
          extractedField: currentExtractionDraft.header.invoiceDate,
        },
        {
          key: "dueDate",
          label: "Due Date",
          currentValue: formState.dueDate || "Empty",
          extractedField: currentExtractionDraft.header.dueDate,
        },
        {
          key: "subtotal",
          label: "Subtotal",
          currentValue: formState.subtotal || "Empty",
          extractedField: currentExtractionDraft.header.subtotal,
          money: true,
        },
        {
          key: "taxTotal",
          label: "Tax",
          currentValue: formState.taxTotal || "Empty",
          extractedField: currentExtractionDraft.header.taxTotal,
          money: true,
        },
        {
          key: "total",
          label: "Total",
          currentValue: formState.total || "Empty",
          extractedField: currentExtractionDraft.header.total,
          money: true,
        },
        {
          key: "notes",
          label: "Notes",
          currentValue: formState.notes || "Empty",
          extractedField: currentExtractionDraft.header.notes,
        },
      ]
    : [];
  const activeAllocationSourceLine = activeAllocationInvoiceLineId
    ? lines.find((line) => line.id === activeAllocationInvoiceLineId) ?? null
    : null;
  const activeAllocationReviewRow = activeAllocationInvoiceLineId
    ? allocationReviewRows.find((row) => row.line.id === activeAllocationInvoiceLineId) ?? null
    : null;
  const allocationModalGroups: SupplierInvoiceAllocationModalGroup[] = activeMatchedPurchaseOrders.flatMap((match) => {
    const purchaseOrder = match.purchaseOrder;
    if (!purchaseOrder) return [];
    const supplierMismatch = Boolean(
      invoice.supplier_id
      && purchaseOrder.supplier_id
      && invoice.supplier_id !== purchaseOrder.supplier_id
    );
    const purchaseOrderUnavailableReason = purchaseOrder.status.toLowerCase() === "cancelled"
      ? "This Purchase Order is cancelled."
      : supplierMismatch
        ? "This Purchase Order no longer belongs to the invoice supplier."
        : null;
    const purchaseOrderLines = matchedPurchaseOrderLines
      .filter((line) => line.purchase_order_id === purchaseOrder.id)
      .sort((left, right) => left.sort_order - right.sort_order);

    return [{
      id: purchaseOrder.id,
      number: purchaseOrder.purchase_order_number,
      title: purchaseOrder.purchase_order_title,
      projectName: projectById.get(purchaseOrder.project_id)?.name ?? null,
      supplierName: purchaseOrder.issued_to_label,
      requestedDate: purchaseOrder.requested_date,
      status: purchaseOrder.status,
      total: purchaseOrderLines.reduce((sum, line) => sum + Number(line.total ?? 0), 0),
      matchStatus: match.match_status,
      lines: purchaseOrderLines.map((line) => {
          const history = purchaseOrderProgressByLineId.get(line.id);
          const comparison = comparisonProgressByLineId.get(line.id);
          const currentAllocations = activeAllocationsByPurchaseOrderLineId.get(line.id) ?? [];
          const activeSourceAllocation = currentAllocations.find(
            (allocation) => allocation.supplier_invoice_line_id === activeAllocationInvoiceLineId
          );
          return {
            id: line.id,
            description: line.description,
            sourceLabel: line.source_cost_item_id ? "Linked source" : "Manual",
            item: line.section || "—",
            quantity: Number(line.quantity ?? 0),
            unit: line.unit ?? "",
            rate: Number(line.rate ?? 0),
            total: Number(line.total ?? 0),
            previouslyInvoiced: Number(
              comparison?.previouslyApprovedValue ?? history?.previouslyApprovedValue ?? 0
            ),
            persistedThisInvoice: currentAllocations.reduce(
              (sum, allocation) => sum + Number(allocation.allocated_amount ?? 0),
              0
            ),
            activeSourceAllocationAmount: Number(activeSourceAllocation?.allocated_amount ?? 0),
            pendingApproval: currentAllocations.some(
              (allocation) => allocation.approval_status !== "approved"
            ),
            unavailableReason: purchaseOrderUnavailableReason,
          };
        }),
    }];
  });

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-transparent pb-8`}>
      <nav className="flex items-center gap-2 pt-6 text-sm font-medium" aria-label="Breadcrumb">
        <Link
          href="/app/company/supplier-invoices"
          className="text-[var(--text-primary)] transition hover:underline hover:underline-offset-4"
        >
          Supplier Invoices
        </Link>
        <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" strokeWidth={2.4} />
        <span className="text-[var(--text-primary)]">
          {invoice.invoice_number || "Supplier Invoice"}
        </span>
      </nav>

      <OperationalModuleHeader
        title={`Invoice ${invoice.invoice_number || "Supplier Invoice"}`}
        actions={
          <>
            <StatusBadge status={displayStatusBadge(displayStatus)}>{displayStatus}</StatusBadge>
            {canDeleteInvoice ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 w-10 rounded-full p-0"
                    aria-label="Supplier invoice actions"
                    disabled={isDeletingInvoice}
                  >
                    <MoreVertical className="h-4 w-4" strokeWidth={2.4} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem]">
                  <DropdownMenuItem
                    onSelect={() => setIsDeleteDialogOpen(true)}
                    className="text-[var(--error)] focus:text-[var(--error)]"
                  >
                    {isDeletingInvoice ? "Deleting..." : "Delete invoice"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => window.print()}>
              <Printer className="hidden h-4 w-4 sm:block" strokeWidth={2.2} />
              Print PDF
            </Button>
            <Button
              type="button"
              onClick={() => void saveInvoice()}
              disabled={!canEditInvoice || isSaving}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </>
        }
      />

      {message ? (
        <OperationalAlert variant="success">
          {message}
        </OperationalAlert>
      ) : null}

      {error ? (
        <OperationalAlert variant="error">
          {error}
        </OperationalAlert>
      ) : null}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-[520px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-0 shadow-[var(--shadow-lg)] sm:w-full">
          <DialogHeader className="border-b border-[var(--border)] px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
            <DialogTitle className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
              Delete Supplier Invoice {invoice.invoice_number || "this invoice"}?
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Delete supplier invoice {invoice.invoice_number || "this invoice"} from {(() => {
                const matchedSupplier = suppliers.find((supplier) => supplier.id === invoice.supplier_id);
                return matchedSupplier ? getSupplierDisplayName(matchedSupplier) : "this supplier";
              })()}? This permanently removes its line items, Purchase Order match, uploaded PDF, and review history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-5 py-4 sm:px-6">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isDeletingInvoice}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void deleteInvoice();
              }}
              disabled={isDeletingInvoice}
            >
              {isDeletingInvoice ? "Deleting..." : "Delete Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {financeEditLocked ? (
          <OperationalAlert variant="warning">
            This Supplier Invoice is locked because its Xero Bill export is queued or complete. Amendments are not yet supported.
          </OperationalAlert>
        ) : null}
        <OperationalPanel
          title="Invoice Capture"
          description="Manage the Supplier, supplier-referenced PO number, invoice dates, totals, and notes."
        >
          <div className="space-y-5">
            {documentExtraction?.status === "queued" || documentExtraction?.status === "processing" ? (
              <OperationalAlert variant="warning">
                Draft extraction is running on the current Supplier Invoice PDF. Existing fields stay editable and unchanged until you apply the extracted draft.
              </OperationalAlert>
            ) : null}

            {documentExtraction?.status === "failed" ? (
              <OperationalAlert variant="error">
                {documentExtraction.error_message || "Supplier Invoice extraction failed. You can keep entering details manually or retry extraction."}
              </OperationalAlert>
            ) : null}

            {currentExtractionDraft ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#f15a29]" />
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Extraction ready for review</p>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Review the extracted draft first. Applying it updates only the local invoice form and line items until Save Changes is used.
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Method: {currentExtractionDraft.extractionMeta.method} · Pages: {currentExtractionDraft.extractionMeta.pageCount} · Attempt {documentExtraction?.attempt_number ?? 1}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsExtractionReviewOpen((current) => !current)}
                    >
                      {isExtractionReviewOpen ? "Hide review" : "Review extraction"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={applyExtractionToInvoice}
                      disabled={!canEditInvoice}
                    >
                      Apply to invoice
                    </Button>
                  </div>
                </div>

                {appliedExtractionId && appliedExtractionId === documentExtraction?.id ? (
                  <div className="mt-3 rounded-[var(--radius-md)] border border-[#d6e9db] bg-[#f4fbf6] px-3 py-2 text-sm text-[#205b2d]">
                    This extracted draft has been applied locally. Save Changes is still required to persist it.
                  </div>
                ) : null}

                {isExtractionReviewOpen ? (
                  <div className="mt-4 space-y-4">
                    {currentExtractionDraft.warnings.length > 0 ? (
                      <div className="space-y-2 rounded-[var(--radius-md)] border border-[#f6d39e] bg-[#fff8eb] p-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-[#c98200]" />
                          <p className="text-sm font-semibold text-[var(--text-primary)]">Extraction warnings</p>
                        </div>
                        <div className="space-y-1">
                          {currentExtractionDraft.warnings.map((warning) => (
                            <p key={`${warning.code}:${warning.message}`} className="text-sm text-[var(--text-secondary)]">
                              {warning.message}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">Supplier</p>
                          <StatusBadge status={currentExtractionDraft.supplierMatch.status === "high_confidence" ? "approved" : currentExtractionDraft.supplierMatch.status === "ambiguous" ? "sent" : "overdue"}>
                            {currentExtractionDraft.supplierMatch.status === "high_confidence"
                              ? "Matched"
                              : currentExtractionDraft.supplierMatch.status === "ambiguous"
                                ? "Needs selection"
                                : "No match"}
                          </StatusBadge>
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                          <div>
                            <p className="text-[var(--text-muted)]">Current</p>
                            <p className="font-medium text-[var(--text-primary)]">{currentSupplierLabel}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)]">Extracted</p>
                            <p className="font-medium text-[var(--text-primary)]">{extractedSupplierLabel}</p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {currentExtractionDraft.supplierMatch.reason}
                            </p>
                          </div>
                          {extractedSupplierCandidates.length > 0 ? (
                            <div>
                              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                                Apply supplier match
                              </label>
                              <select
                                value={selectedExtractedSupplierId}
                                onChange={(event) => setSelectedExtractedSupplierId(event.target.value)}
                                disabled={!canEditInvoice}
                                className={FIELD_SELECT_CLASS}
                              >
                                <option value="">Keep current supplier</option>
                                {extractedSupplierCandidates.map((supplier) => (
                                  <option key={supplier.id} value={supplier.id}>
                                    {getSupplierDisplayName(supplier)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={headerApplyMode.supplierId === "current" ? "default" : "secondary"}
                              onClick={() =>
                                setHeaderApplyMode((current) => ({ ...current, supplierId: "current" }))
                              }
                            >
                              Keep current
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={headerApplyMode.supplierId === "extracted" ? "default" : "secondary"}
                              onClick={() =>
                                setHeaderApplyMode((current) => ({ ...current, supplierId: "extracted" }))
                              }
                              disabled={!selectedExtractedSupplierId}
                            >
                              Use extracted
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Line item handling</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          Extracted lines never save automatically. Choose whether to keep current local lines or replace them with the extracted set.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={lineApplyMode === "keep" ? "default" : "secondary"}
                            onClick={() => setLineApplyMode("keep")}
                          >
                            Keep existing lines
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={lineApplyMode === "replace" ? "default" : "secondary"}
                            onClick={() => setLineApplyMode("replace")}
                            disabled={currentExtractionDraft.lines.length === 0}
                          >
                            Replace with extracted lines
                          </Button>
                        </div>
                        <p className="mt-3 text-xs text-[var(--text-muted)]">
                          Extracted line count: {currentExtractionDraft.lines.length}. Current local line count: {lines.length}.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {extractionHeaderRows.map((row) => (
                        <div key={row.key} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{row.label}</p>
                            <StatusBadge status={extractionFieldBadgeStatus(row.extractedField.state)}>
                              {extractionFieldStateLabel(row.extractedField.state)}
                            </StatusBadge>
                          </div>
                          <div className="mt-3 space-y-2 text-sm">
                            <div>
                              <p className="text-[var(--text-muted)]">Current</p>
                              <p className="font-medium text-[var(--text-primary)]">{row.currentValue}</p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">Extracted</p>
                              <p className="font-medium text-[var(--text-primary)]">
                                {formatExtractionFieldValue(row.extractedField, { money: row.money })}
                              </p>
                              {formatExtractionEvidence(row.extractedField) ? (
                                <p className="text-xs text-[var(--text-secondary)]">
                                  {formatExtractionEvidence(row.extractedField)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={headerApplyMode[row.key] === "current" ? "default" : "secondary"}
                                onClick={() =>
                                  setHeaderApplyMode((current) => ({ ...current, [row.key]: "current" }))
                                }
                              >
                                Keep current
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={headerApplyMode[row.key] === "extracted" ? "default" : "secondary"}
                                onClick={() =>
                                  setHeaderApplyMode((current) => ({ ...current, [row.key]: "extracted" }))
                                }
                                disabled={row.extractedField.value === null || normalizeComparableValue(String(row.extractedField.value)).length === 0}
                              >
                                Use extracted
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Extracted lines</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Cost codes, projects, allocations and PO matches are not populated by extraction.
                        </p>
                      </div>
                      {currentExtractionDraft.lines.length === 0 ? (
                        <p className="mt-3 text-sm text-[var(--text-secondary)]">No line items were extracted.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {currentExtractionDraft.lines.map((line, index) => (
                            <div key={`extracted-line-${index}`} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">
                                  {line.description.value || `Extracted line ${index + 1}`}
                                </p>
                                <StatusBadge status={extractionFieldBadgeStatus(line.description.state)}>
                                  {extractionFieldStateLabel(line.description.state)}
                                </StatusBadge>
                              </div>
                              <div className="mt-2 grid gap-2 text-sm text-[var(--text-secondary)] md:grid-cols-4">
                                <p>Qty: {formatExtractionFieldValue(line.quantity)}</p>
                                <p>Unit Price: {formatExtractionFieldValue(line.unitPrice, { money: true })}</p>
                                <p>Tax: {formatExtractionFieldValue(line.taxAmount, { money: true })}</p>
                                <p>Total: {formatExtractionFieldValue(line.lineTotal, { money: true })}</p>
                              </div>
                              {formatExtractionEvidence(line.description) ? (
                                <p className="mt-2 text-xs text-[var(--text-muted)]">
                                  {formatExtractionEvidence(line.description)}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Supplier</label>
              <select
                value={formState.supplierId}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, supplierId: event.target.value }))
                }
                disabled={!canEditInvoice}
                className={FIELD_SELECT_CLASS}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {getSupplierDisplayName(supplier)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Invoice Number</label>
              <Input
                value={formState.invoiceNumber}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    invoiceNumber: event.target.value,
                  }))
                }
                disabled={!canEditInvoice}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Supplier-referenced PO number</label>
              <div className="flex gap-2">
                <Input
                  value={formState.supplierPoReference}
                  onChange={(event) => setFormState((current) => ({ ...current, supplierPoReference: event.target.value }))}
                  disabled={!canEditInvoice}
                  placeholder="TS-000148"
                />
                <Button
                  type="button"
                  variant={hasActivePurchaseOrderMatch ? "secondary" : "orange"}
                  className={cn(
                    hasActivePurchaseOrderMatch
                      ? "border-[#d6e9db] bg-[#f4fbf6] text-[#205b2d] hover:bg-[#e8f7ec] focus-visible:ring-[#205b2d]"
                      : "border-[var(--error-light)] bg-[var(--error-light)] text-[var(--error)] hover:bg-[var(--error-light)] focus-visible:ring-[var(--error)]"
                  )}
                  disabled={!canEditInvoice || isUpdatingWorkflow || !formState.supplierPoReference.trim()}
                  onClick={() => void loadPurchaseOrderSuggestions()}
                >
                  {hasActivePurchaseOrderMatch ? "Matched PO" : "Suggest PO"}
                </Button>
              </div>
              {poSuggestions.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {poSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3"
                    >
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        Suggested Purchase Order
                      </p>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {suggestion.purchaseOrderNumber} · {suggestion.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {suggestion.projectName ?? "Project"} · {suggestion.status} · Remaining {toMoney(suggestion.remainingCommitment)}
                          {suggestion.warning ? ` · ${suggestion.warning}` : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!suggestion.isSelectable || isUpdatingWorkflow}
                          onClick={() => void confirmSuggestedPurchaseOrder(suggestion.id)}
                        >
                          Confirm match
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Invoice Date</label>
              <Input
                type="date"
                value={formState.invoiceDate}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    invoiceDate: event.target.value,
                  }))
                }
                disabled={!canEditInvoice}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Due Date</label>
              <Input
                type="date"
                value={formState.dueDate}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                disabled={!canEditInvoice}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Source</label>
              <div className="flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 text-sm text-[var(--text-secondary)]">
                {getSourceLabel(invoice.source)}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Document</label>
              {primaryDocument?.signedUrl ? (
                <div className="print:hidden">
                  <Button type="button" variant="secondary" size="sm" onClick={openDocumentPreview}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    View PDF
                  </Button>
                </div>
              ) : (
                <span className="text-sm text-[var(--text-secondary)]">
                  {documentsLoading ? "Loading preview link..." : "No document attached"}
                </span>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Notes</label>
              <textarea
                id="supplier-invoice-notes"
                rows={4}
                value={formState.notes}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, notes: event.target.value }))
                }
                disabled={!canEditInvoice}
                className={FIELD_TEXTAREA_CLASS}
              />
            </div>
            </div>
          </div>
        </OperationalPanel>

        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
          <section className="py-5">
            <div className="flex items-center justify-between">
              <h2 className={styles.quoteSectionTitle}>Supplier Invoice Lines</h2>
              <div className="h-10" />
            </div>

            <div className="mt-4">
              <CommercialLineItemsTable
              columns={[
                { key: "description", label: "Description" },
                { key: "qty", label: "Qty." },
                { key: "unitPrice", label: "Price" },
                { key: "amount", label: "Amount", align: "right" },
                { key: "actions", label: "" },
              ]}
              gridTemplateColumns={supplierInvoiceLineGridTemplate}
              emptyState={
                <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">
                  No invoice lines yet. Add a row manually or keep using the existing Save Changes flow.
                </div>
              }
            >
              {lines.map((line, index) => {
                const allocationRow = allocationReviewRows.find((row) => row.line.id === line.id);
                const selectedAllocation = allocationRow?.selectedAllocation ?? null;
                const selectedPurchaseOrder = selectedAllocation?.purchase_order_id
                  ? purchaseOrderById.get(selectedAllocation.purchase_order_id) ?? null
                  : null;
                const selectedPurchaseOrderLine = selectedAllocation?.purchase_order_line_item_id
                  ? matchedPurchaseOrderLines.find(
                      (purchaseOrderLine) => purchaseOrderLine.id === selectedAllocation.purchase_order_line_item_id
                    ) ?? null
                  : null;
                const updateLine = (updates: Partial<LineFormState>) =>
                  setLines((current) =>
                    current.map((item) =>
                      item.id === line.id ? { ...item, ...updates } : item
                    )
                  );

                return (
                  <CommercialLineItemsRow
                    key={line.id}
                    gridTemplateColumns={supplierInvoiceLineGridTemplate}
                    className={cn(
                      activeAllocationInvoiceLineId === line.id
                        && "bg-[color-mix(in_srgb,var(--brand-blue)_7%,transparent)]"
                    )}
                  >
                    <CommercialLineItemsCell>
                      <CommercialLineDescriptionField
                        primaryValue={line.description}
                        onPrimaryChange={(value) => updateLine({ description: value })}
                        disabled={!canEditInvoice}
                        primaryPlaceholder="Describe this invoice line"
                        primaryAriaLabel={`Line ${index + 1} description`}
                      />
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder>
                      <CommercialLineTextInput
                        value={line.quantity}
                        onChange={(value) => updateLine({ quantity: value })}
                        disabled={!canEditInvoice}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Line ${index + 1} quantity`}
                      />
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder>
                      <CommercialLinePrefixedNumberInput
                        value={line.unitPrice}
                        onChange={(value) => updateLine({ unitPrice: value })}
                        disabled={!canEditInvoice}
                        placeholder="0.00"
                        aria-label={`Line ${index + 1} unit price`}
                        prefix="$"
                      />
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder className="justify-end">
                      <CommercialLinePrefixedNumberInput
                        value={line.lineTotal}
                        onChange={(value) => updateLine({ lineTotal: value })}
                        disabled={!canEditInvoice}
                        placeholder="0.00"
                        aria-label={`Line ${index + 1} amount`}
                        prefix="NZ$"
                        align="right"
                        formatter={formatCommercialDocumentMoneyValue}
                        joinPrefixWithValue
                      />
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder className="gap-2 px-3">
                      <div className="min-w-0 flex-1">
                        {selectedPurchaseOrderLine ? (
                          <>
                            <div className="text-xs font-semibold text-[var(--text-primary)]">Allocated</div>
                            <div className="truncate text-[11px] text-[var(--text-secondary)]">
                              {selectedPurchaseOrder?.purchase_order_number ?? "Purchase Order"} · {selectedPurchaseOrderLine.description}
                            </div>
                          </>
                        ) : selectedAllocation?.allocation_status === "unmatched" ? (
                          <div className="text-xs text-[var(--text-secondary)]">No-PO workflow</div>
                        ) : null}
                      </div>
                      {canEditInvoice && !allocationRow?.lineHasPostedActualCosts ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => beginLineAllocation(line.id)}
                          disabled={isSavingDraftAllocations}
                        >
                          {selectedAllocation ? "Change" : "Allocate"}
                        </Button>
                      ) : selectedAllocation ? (
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Locked</span>
                      ) : null}
                      {canEditInvoice ? (
                        <CommercialLineItemActionButton
                          icon={<Trash2 className="h-4 w-4" strokeWidth={2.1} />}
                          label={`Delete line ${index + 1}`}
                          onClick={() =>
                            setLines((current) => current.filter((item) => item.id !== line.id))
                          }
                        />
                      ) : (
                        <span className="sr-only">Actions unavailable</span>
                      )}
                    </CommercialLineItemsCell>
                  </CommercialLineItemsRow>
                );
              })}
              </CommercialLineItemsTable>
            </div>

            {canEditInvoice ? (
              <div className="mt-3 flex justify-end pr-3">
                <CommercialLineItemsAddButton
                  onClick={() => setLines((current) => [...current, makeEmptyLine()])}
                  className={styles.quoteButtonLabel}
                />
              </div>
            ) : null}

            <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
              <div className="hidden xl:block" />
              <CommercialSummaryCard
                title={<span className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Invoice Summary</span>}
              >
                <div className={`${interMedium.className} space-y-2.5 text-[13px]`}>
                  <CommercialSummaryRow
                    label="Subtotal"
                    value={formatCommercialDocumentMoney(numberString(formState.subtotal))}
                  />
                  <CommercialSummaryRow
                    label={`GST (${invoiceSummaryGstPercent}%)`}
                    value={formatCommercialDocumentMoney(numberString(formState.taxTotal))}
                  />
                  <div className="h-px bg-[var(--border)]" />
                  <CommercialSummaryRow
                    label="Total"
                    value={formatCommercialDocumentMoney(numberString(formState.total))}
                    className="pt-0.5"
                    labelClassName="text-[15px] font-semibold text-[var(--text-primary)]"
                    valueClassName="text-[15px] font-semibold text-[var(--text-primary)]"
                  />
                </div>
              </CommercialSummaryCard>
            </div>
          </section>
        </div>

        <OperationalPanel
          id="line-allocation-workspace"
          className="hidden"
          tabIndex={-1}
          title="Purchase Order Allocation"
          actions={
            activeMatchedPurchaseOrders.length > 0 ? (
              <div className="text-right text-lg font-semibold leading-tight text-[var(--text-primary)]">
                {activeMatchedPurchaseOrders
                  .map((match) => match.purchaseOrder?.purchase_order_number)
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : null
          }
        >
          {allocationReviewRows.some((row) => row.selectedAllocation) ? (
            <div className="space-y-3">
              {allocationReviewRows.filter((row) => row.selectedAllocation).map((row) => {
                const allocation = row.selectedAllocation as SupplierInvoiceLineAllocationRow;
                const purchaseOrder = allocation.purchase_order_id
                  ? purchaseOrderById.get(allocation.purchase_order_id) ?? null
                  : null;
                const purchaseOrderLine = allocation.purchase_order_line_item_id
                  ? matchedPurchaseOrderLines.find((line) => line.id === allocation.purchase_order_line_item_id) ?? null
                  : null;
                return (
                  <div key={allocation.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">{row.line.description || "Untitled invoice line"}</span>
                          <StatusBadge status={matchApprovalBadge(allocation.approval_status)}>{allocation.approval_status}</StatusBadge>
                          {row.lineHasPostedActualCosts ? <StatusBadge status="draft">Locked</StatusBadge> : null}
                        </div>
                        <p className="mt-1 text-sm text-[var(--text-primary)]">
                          {purchaseOrderLine
                            ? `Allocated to ${purchaseOrder?.purchase_order_number ?? "Purchase Order"} · ${purchaseOrderLine.description}`
                            : "No-PO workflow"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          Allocation {toMoney(Number(allocation.allocated_amount ?? 0))} · Coding {allocation.accounting_resolution_status.replaceAll("_", " ")} · Tax {allocation.tax_resolution_status.replaceAll("_", " ")} · {row.operationalStatus}
                        </p>
                        {allocation.approval_notes ? <p className="mt-1 text-xs text-[var(--text-secondary)]">Review note: {allocation.approval_notes}</p> : null}
                      </div>
                      {canReview && !row.lineHasPostedActualCosts ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input className="h-9 w-56" placeholder="Review note" value={allocationReviewNotes[allocation.id] ?? ""} onChange={(event) => setAllocationReviewNotes((current) => ({ ...current, [allocation.id]: event.target.value }))} />
                          {allocation.approval_status !== "approved" ? <Button type="button" variant="secondary" size="sm" disabled={isReviewingAllocationId === allocation.id} onClick={() => void approveDraftAllocation({ allocationId: allocation.id, requiresNote: allocation.allocation_status === "unmatched" })}>Approve allocation</Button> : null}
                          {allocation.approval_status !== "disputed" ? <Button type="button" variant="secondary" size="sm" disabled={isReviewingAllocationId === allocation.id} onClick={() => void disputeDraftAllocation(allocation.id)}>Dispute</Button> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-5 py-7 text-center text-sm text-[var(--text-secondary)]">
              Use Allocate on a Supplier Invoice line to select a line from an accepted matched Purchase Order.
            </div>
          )}
        </OperationalPanel>

        <SupplierInvoiceAllocationModal
          open={Boolean(activeAllocationSourceLine)}
          onOpenChange={(open) => {
            if (!open) setActiveAllocationInvoiceLineId(null);
          }}
          invoiceLine={activeAllocationSourceLine ? {
            id: activeAllocationSourceLine.id,
            description: activeAllocationSourceLine.description,
            amount: numberString(activeAllocationSourceLine.lineTotal),
          } : null}
          groups={allocationModalGroups}
          canAllocate={canEditInvoice}
          sourceLocked={Boolean(activeAllocationReviewRow?.lineHasPostedActualCosts)}
          saving={isSavingDraftAllocations}
          onConfirm={async (purchaseOrderLineItemId) => {
            if (!activeAllocationSourceLine) return false;
            return saveDraftAllocation({
              invoiceLineId: activeAllocationSourceLine.id,
              purchaseOrderLineItemId,
            });
          }}
          onUseNoPurchaseOrder={async () => {
            if (!activeAllocationSourceLine) return false;
            return markLineUnmatched(activeAllocationSourceLine.id);
          }}
          onMatchPurchaseOrders={() => {
            setActiveAllocationInvoiceLineId(null);
            openMatchDialog();
          }}
        />

        <SupplierInvoiceTeamApprovalPanel
          status={teamApprovalStatus}
          groups={teamApprovalGroups}
          canSend={canSubmitSiteReview && ["not_sent", "invalidated"].includes(teamApprovalStatus)}
          hasBeenSent={hasTeamApprovalHistory}
          sending={isUpdatingWorkflow}
          onSend={() => void submitForSiteApproval()}
        />

        <SupplierInvoiceReadyForXeroPanel
          status={readyForXeroPresentation.status}
          message={readyForXeroPresentation.message}
          canCreate={
            readyForXeroPresentation.status === "ready"
            && canAccountsApprove
            && canExportXeroBill
            && (!isNoPurchaseOrderInvoice || (canReview && noPoReasonIsComplete))
          }
          creating={isUpdatingXeroBill || isUpdatingCommercialReview || isUpdatingWorkflow}
          showNoPoReason={isNoPurchaseOrderInvoice && commercialComparison.derivedStatus !== "approved"}
          noPoReason={noPoReason}
          noPoExplanation={noPoExplanation}
          onNoPoReasonChange={setNoPoReason}
          onNoPoExplanationChange={setNoPoExplanation}
          onCreate={() => void createDraftBillInXero()}
          onResolveGst={hasTaxException && canReview ? () => setIsTaxExceptionOpen(true) : undefined}
        />

        <Dialog open={isTaxExceptionOpen} onOpenChange={setIsTaxExceptionOpen}>
          <DialogContent className="w-[calc(100vw-24px)] max-w-[640px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-0 shadow-[var(--shadow-lg)] sm:w-full">
            <DialogHeader className="border-b border-[var(--border)] px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
              <DialogTitle>Resolve GST</DialogTitle>
              <DialogDescription>
                Select the current Xero purchase GST treatment only where the invoice evidence requires Accounts review.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-5 py-5 sm:px-6">
              {draftAllocations.filter((allocation) => allocation.tax_resolution_status === "unresolved").map((allocation) => {
                const invoiceLine = lines.find((line) => line.id === allocation.supplier_invoice_line_id);
                const draft = commercialCodingDrafts[allocation.id];
                return (
                  <div key={allocation.id} className="space-y-3 border-b border-[var(--border)] pb-4 last:border-b-0 last:pb-0">
                    <div>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{invoiceLine?.description || "Invoice line"}</p>
                      <p className="text-[13px] text-[var(--text-secondary)]">GST could not be validated automatically.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        aria-label={`GST treatment for ${invoiceLine?.description || "invoice line"}`}
                        className={FIELD_SELECT_CLASS}
                        value={draft?.accountingTaxRateId ?? ""}
                        onChange={(event) => setCommercialCodingDrafts((current) => ({
                          ...current,
                          [allocation.id]: {
                            accountingMappingId: allocation.accounting_mapping_id ?? "",
                            accountingTaxRateId: event.target.value,
                            taxResolutionStatus: "resolved",
                          },
                        }))}
                      >
                        <option value="">Select GST treatment</option>
                        {accountingTaxRates.map((taxRate) => <option key={taxRate.id} value={taxRate.id}>{taxRate.label}</option>)}
                      </select>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!draft?.accountingTaxRateId || !allocation.accounting_mapping_id || isUpdatingCommercialReview}
                        onClick={() => void saveCommercialCoding(allocation.id)}
                      >
                        Save GST
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter className="border-t border-[var(--border)] px-5 py-4 sm:px-6">
              <DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OperationalPanel
          id="legacy-line-allocation-workspace"
          className="hidden"
          tabIndex={-1}
          title="Purchase Order Allocation"
          actions={
            activeMatchedPurchaseOrders.length > 0 ? (
              <div className="text-right text-lg font-semibold leading-tight text-[var(--text-primary)]">
                {activeMatchedPurchaseOrders
                  .map((match) => match.purchaseOrder?.purchase_order_number)
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : null
          }
        >
          {activeAllocationInvoiceLineId ? (
            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--brand-blue)] bg-[color-mix(in_srgb,var(--brand-blue)_6%,transparent)] px-4 py-3 text-sm text-[var(--text-primary)] sm:flex-row sm:items-center sm:justify-between">
              <div><span className="font-semibold">
                  {lines.find((line) => line.id === activeAllocationInvoiceLineId)?.description || "Selected Supplier Invoice line"}
                </span>
                <span className="ml-2 text-[var(--text-secondary)]">
                  Select the Purchase Order line this Supplier Invoice line relates to.
                </span></div>
              {canEditInvoice ? <Button type="button" variant="secondary" size="sm" disabled={isSavingDraftAllocations} onClick={() => void markLineUnmatched(activeAllocationInvoiceLineId)}>Use no-PO workflow</Button> : null}
            </div>
          ) : null}

          <div className="mt-6 space-y-7">
            {activeMatchedPurchaseOrders.length === 0 ? (
              <OperationalEmptyState
                title="No Purchase Order matched"
                description="Match this invoice to a Purchase Order, or keep the existing no-PO allocation workflow."
                actions={
                  <div className="flex flex-wrap justify-center gap-2">
                    {canEditInvoice ? <Button type="button" variant="secondary" onClick={openMatchDialog}>Match to Purchase Orders</Button> : null}
                    {canEditInvoice && lines.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isSavingDraftAllocations}
                        onClick={() => {
                          const invoiceLineId = activeAllocationInvoiceLineId
                            ?? allocationReviewRows.find((row) => !row.selectedAllocation)?.line.id
                            ?? lines[0]?.id;
                          if (invoiceLineId) void markLineUnmatched(invoiceLineId);
                        }}
                      >
                        Use no-PO workflow
                      </Button>
                    ) : null}
                  </div>
                }
              />
            ) : (
              activeMatchedPurchaseOrders.map((match) => {
                const purchaseOrder = match.purchaseOrder;
                if (!purchaseOrder) return null;
                const purchaseOrderLines = matchedPurchaseOrderLines.filter(
                  (line) => line.purchase_order_id === purchaseOrder.id
                );
                const gridTemplate = "minmax(260px,1.4fr) 72px 86px 110px 130px 140px 130px 130px minmax(250px,1fr) 110px";

                return (
                  <section key={match.id} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
                    <CommercialLineItemsTable
                      className="rounded-none border-0"
                      columns={[
                        { key: "description", label: "Description" },
                        { key: "qty", label: "Qty." },
                        { key: "unit", label: "Unit" },
                        { key: "price", label: "Price" },
                        { key: "value", label: "PO Line Value", align: "right" },
                        { key: "previous", label: "Previously Invoiced", align: "right" },
                        { key: "current", label: "This Invoice", align: "right" },
                        { key: "remaining", label: "Remaining", align: "right" },
                        { key: "progress", label: "Progress" },
                        { key: "action", label: "Action" },
                      ]}
                      gridTemplateColumns={gridTemplate}
                      emptyState={<div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">No Purchase Order lines.</div>}
                    >
                      {purchaseOrderLines.map((purchaseOrderLine) => {
                        const history = purchaseOrderProgressByLineId.get(purchaseOrderLine.id);
                        const comparison = comparisonProgressByLineId.get(purchaseOrderLine.id);
                        const currentAllocations = activeAllocationsByPurchaseOrderLineId.get(purchaseOrderLine.id) ?? [];
                        const amounts = deriveSupplierInvoicePurchaseOrderLineAmounts({
                          poLineValue: Number(purchaseOrderLine.total ?? 0),
                          authoritativePreviouslyInvoiced: Number(
                            comparison?.previouslyApprovedValue ?? history?.previouslyApprovedValue ?? 0
                          ),
                          currentInvoiceAllocationAmounts: currentAllocations.map(
                            (allocation) => Number(allocation.allocated_amount ?? 0)
                          ),
                        });
                        const { poLineValue, previouslyInvoiced, thisInvoice: thisInvoiceValue, totalInvoiced, remaining, percentage, displayedPercentage } = amounts;
                        const isOver = amounts.progressState === "over";
                        const isComplete = amounts.progressState === "complete";
                        const currentSourceAllocation = currentAllocations.find(
                          (allocation) => allocation.supplier_invoice_line_id === activeAllocationInvoiceLineId
                        );
                        const activeSourceRow = allocationReviewRows.find(
                          (row) => row.line.id === activeAllocationInvoiceLineId
                        );
                        const isSourceLocked = Boolean(activeSourceRow?.lineHasPostedActualCosts);
                        const isFullyInvoiced = remaining <= 0.009 && !currentSourceAllocation;
                        const canSelect = Boolean(activeAllocationInvoiceLineId) && canEditInvoice && !isSourceLocked && !isFullyInvoiced;

                        return (
                          <CommercialLineItemsRow key={purchaseOrderLine.id} gridTemplateColumns={gridTemplate}>
                            <CommercialLineItemsCell><span className="text-sm text-[var(--text-primary)]">{purchaseOrderLine.description}</span></CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder>{formatCommercialPriceNumber(Number(purchaseOrderLine.quantity ?? 0))}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder>{purchaseOrderLine.unit || "—"}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder>{toMoney(Number(purchaseOrderLine.rate ?? 0))}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder className="justify-end font-medium">{toMoney(poLineValue)}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder className="justify-end">{toMoney(previouslyInvoiced)}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder className="justify-end">
                              <div className="text-right">
                                <div>{toMoney(thisInvoiceValue)}</div>
                                {currentAllocations.some((allocation) => allocation.approval_status !== "approved") ? <div className="text-[10px] text-[var(--text-secondary)]">Pending</div> : null}
                              </div>
                            </CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder className={cn("justify-end", isOver && "text-[var(--danger)]")}>{toMoney(remaining)}</CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder>
                              <div className="w-full min-w-[210px]">
                                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]" aria-label={`${percentage.toFixed(1)}% invoiced`}>
                                  <div
                                    data-progress-state={amounts.progressState}
                                    className={cn("h-full rounded-full", isOver ? "bg-[var(--danger)]" : isComplete ? "bg-[var(--success)]" : "bg-[repeating-linear-gradient(135deg,#eab308_0,#eab308_5px,#facc15_5px,#facc15_10px)]")}
                                    style={{ width: `${displayedPercentage}%` }}
                                  />
                                </div>
                                <div className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">
                                  <div>{toMoney(totalInvoiced)} of {toMoney(poLineValue)} invoiced</div>
                                  <div>{toMoney(remaining)} remaining</div>
                                </div>
                              </div>
                            </CommercialLineItemsCell>
                            <CommercialLineItemsCell withBorder className="justify-center">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={!canSelect || isSavingDraftAllocations}
                                onClick={() => setPendingPurchaseOrderLineId(purchaseOrderLine.id)}
                                title={!activeAllocationInvoiceLineId ? "Choose a Supplier Invoice line first." : isSourceLocked ? "Posted actual costs lock this allocation." : isFullyInvoiced ? "This PO line is fully invoiced." : undefined}
                              >
                                {currentSourceAllocation ? "Selected" : isFullyInvoiced ? "Fully Invoiced" : canSelect ? "Select" : "Unavailable"}
                              </Button>
                            </CommercialLineItemsCell>
                          </CommercialLineItemsRow>
                        );
                      })}
                    </CommercialLineItemsTable>
                  </section>
                );
              })
            )}
          </div>

          {allocationReviewRows.some((row) => row.selectedAllocation) ? (
            <section className="mt-8 border-t border-[var(--border)] pt-6">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Line allocation review</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Allocation approval is separate from PO match, commercial, site, Accounts, and Xero approval.</p>
              <div className="mt-4 space-y-3">
                {allocationReviewRows.filter((row) => row.selectedAllocation).map((row) => {
                  const allocation = row.selectedAllocation as SupplierInvoiceLineAllocationRow;
                  return (
                    <div key={allocation.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[var(--text-primary)]">{row.line.description || "Untitled invoice line"}</span><StatusBadge status={matchApprovalBadge(allocation.approval_status)}>{allocation.approval_status}</StatusBadge></div>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">Allocation {toMoney(Number(allocation.allocated_amount ?? 0))} · Coding {allocation.accounting_resolution_status.replaceAll("_", " ")} · Tax {allocation.tax_resolution_status.replaceAll("_", " ")}</p>
                        </div>
                        {canReview && !row.lineHasPostedActualCosts ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input className="h-9 w-56" placeholder="Review note" value={allocationReviewNotes[allocation.id] ?? ""} onChange={(event) => setAllocationReviewNotes((current) => ({ ...current, [allocation.id]: event.target.value }))} />
                            {allocation.approval_status !== "approved" ? <Button type="button" variant="secondary" size="sm" disabled={isReviewingAllocationId === allocation.id} onClick={() => void approveDraftAllocation({ allocationId: allocation.id, requiresNote: allocation.allocation_status === "unmatched" })}>Approve allocation</Button> : null}
                            {allocation.approval_status !== "disputed" ? <Button type="button" variant="secondary" size="sm" disabled={isReviewingAllocationId === allocation.id} onClick={() => void disputeDraftAllocation(allocation.id)}>Dispute</Button> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

        </OperationalPanel>

        <OperationalPanel
          className="hidden"
          title="Line Allocations and Actual Costs"
          description="Review allocations against matched Purchase Orders. Actual-cost posting remains a separate secondary action."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canEditInvoice ? (
                <Button type="button" variant="secondary" size="sm" onClick={openMatchDialog}>
                  Match to Purchase Orders
                </Button>
              ) : null}
              {canSubmitSiteReview
                && !workflowState.activeSubmissionId
                && !workflowState.warnings.some((warning) =>
                  warning.startsWith("No Purchase Order")
                ) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isUpdatingWorkflow || financeEditLocked}
                    onClick={() => void submitForSiteApproval()}
                  >
                    {isUpdatingWorkflow ? "Submitting..." : "Submit for Site Approval"}
                  </Button>
                ) : null}
              <div className="text-right text-xs text-[var(--text-secondary)]">
                <div>{approvedUnpostedActualCostSummary.count} ready to post</div>
                <div>{toMoney(approvedUnpostedActualCostSummary.amount)}</div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void postApprovedActualCosts()}
                disabled={
                  !canReview ||
                  isPostingActualCosts ||
                  approvedUnpostedActualCostSummary.count === 0
                }
              >
                {isPostingActualCosts ? "Posting..." : "Post approved actual costs"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void saveAllReadyDraftAllocations()}
                disabled={!canEditInvoice || isSavingDraftAllocations || readyDraftCandidates.length === 0}
              >
                {isSavingDraftAllocations ? "Saving..." : "Save all Ready rows"}
              </Button>
            </div>
          }
          toolbar={
            <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
              <span>Select or confirm the right purchase orders, then validate each invoice line against the matched PO lines before approval and posting.</span>
            </div>
          }
          contentClassName="p-0"
        >
          <div className="space-y-5 px-6 py-6">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Matched POs", String(matchesWithPurchaseOrders.length)],
                ["Matched amount", toMoney(matchedTotal)],
                ["Remaining", toMoney(remainingMatchAmount)],
                ["Approved / Pending", `${toMoney(approvedAllocationTotal)} / ${toMoney(pendingAllocationTotal)}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
                  <p className="mt-1 font-semibold text-[var(--text-primary)]">{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Matched purchase orders</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    These matched POs provide the context for the invoice-line review below.
                  </p>
                </div>
              </div>

              {matchesWithPurchaseOrders.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-5 py-5">
                  <OperationalEmptyState title="No purchase orders linked yet." />
                </div>
              ) : null}

              {matchesWithPurchaseOrders.length === 0 ? null : (
                <div className="grid gap-3">
                  {matchesWithPurchaseOrders.map((match) => (
                    <div
                      key={match.id}
                      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1 text-sm text-[var(--text-secondary)]">
                        <p className="font-semibold text-[var(--text-primary)]">
                          {match.purchaseOrder?.purchase_order_number || "Purchase Order"}
                        </p>
                        <p className="leading-[1.35]">
                          {match.purchaseOrder?.purchase_order_title || "Untitled purchase order"}
                        </p>
                        <p>
                          {match.purchaseOrder?.issued_to_label?.trim() || "Unassigned supplier"}
                          {match.purchaseOrder?.requested_date
                            ? ` · ${toDayMonthYearLabel(match.purchaseOrder.requested_date)}`
                            : ""}
                        </p>
                        {match.approval_notes?.trim() ? (
                          <p className="text-[var(--text-muted)]">{match.approval_notes}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <p className="font-semibold text-[var(--text-primary)]">
                          {toMoney(Number(match.matched_amount ?? 0))}
                        </p>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <StatusBadge status={matchApprovalBadge(match.approval_status)}>
                            {formatSupplierInvoiceMatchApprovalStatusLabel(match.approval_status)}
                          </StatusBadge>
                          <StatusBadge status={matchStatusBadge(match.match_status)}>
                            {formatMatchStatusLabel(match.match_status)}
                          </StatusBadge>
                        </div>
                        {canEditInvoice ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                aria-label="Purchase order match actions"
                                className="h-8 w-8 rounded-full p-0"
                              >
                                <MoreVertical className="h-4 w-4" strokeWidth={2.4} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[9rem]">
                              <DropdownMenuItem onSelect={openMatchDialog}>Edit</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void removeMatch(match.id)}>Delete</DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={match.match_status === "rejected"}
                                onSelect={() => void updateMatchStatus(match.id, "rejected")}
                                className="text-[var(--error)] focus:text-[var(--error)]"
                              >
                                Reject
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-[var(--border)]">
            {matchesWithPurchaseOrders.length > 0 && lines.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Invoice lines</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Validate each invoice line against the matched PO lines below.
                  </p>
                </div>
              </div>
            ) : null}
            {matchesWithPurchaseOrders.length === 0 ? (
              <div className="px-6 py-6">
                <div className="space-y-3">
                  <OperationalEmptyState title="Match purchase orders to start reviewing invoice lines against PO lines." />
                  {canEditInvoice ? (
                    <div className="flex justify-center">
                      <Button type="button" variant="secondary" size="sm" onClick={openMatchDialog}>
                        Match to PO
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : lines.length === 0 ? (
              <div className="px-6 py-6">
                <OperationalEmptyState title="Add invoice lines to preview candidate purchase order allocations." />
              </div>
            ) : (
              <OperationalTable className="min-w-[1080px]">
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>Invoice line</OperationalTableHead>
                  <OperationalTableHead>Matched PO line</OperationalTableHead>
                  <OperationalTableHead>Amount</OperationalTableHead>
                  <OperationalTableHead>Status</OperationalTableHead>
                  <OperationalTableHead className="text-right">Action</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {allocationReviewRows.map((row) => {
                  const previewRow = row.selectedPreviewRow;
                  const savedDraftAllocation = row.selectedAllocation;
                  const isSavedDraft = Boolean(savedDraftAllocation);
                  const isExpanded = expandedAllocationReviewRows[row.line.id] ?? false;
                  const canSaveReadyCandidate = Boolean(
                    previewRow.candidatePurchaseOrderLineItemId &&
                      canWrite &&
                      previewRow.status === "Ready"
                  );
                  const canSaveReviewCandidate = Boolean(
                    previewRow.candidatePurchaseOrderLineItemId &&
                      canWrite &&
                      canReview &&
                      (previewRow.status === "Needs cost review" ||
                        previewRow.status === "Needs accounting mapping")
                  );
                  const canMarkUnmatched = canWrite && canReview;
                  const approvalRequiresNote = savedDraftAllocation?.allocation_status === "unmatched";
                  const canApproveSavedAllocation = Boolean(
                    savedDraftAllocation &&
                      canReview &&
                      (savedDraftAllocation.allocation_status === "unmatched"
                        ? true
                        : ["pending", "auto_approved", "resolved"].includes(
                            savedDraftAllocation.review_status
                          )) &&
                      savedDraftAllocation.approval_status !== "approved"
                  );
                  const reviewNoteMode =
                    allocationReviewNoteMode?.allocationId === savedDraftAllocation?.id
                      ? allocationReviewNoteMode?.mode ?? null
                      : null;
                  const postedEvent = savedDraftAllocation
                    ? postedPostingActualCostEventsByAllocationId.get(savedDraftAllocation.id) ?? null
                    : null;
                  const isPostedAllocation = Boolean(postedEvent);
                  const hasReversalForPostedEvent = Boolean(
                    postedEvent && reversalActualCostEventsByOriginalEventId.has(postedEvent.id)
                  );
                  const canReversePostedActualCost = Boolean(
                    savedDraftAllocation &&
                      postedEvent &&
                      canReverse &&
                      !hasReversalForPostedEvent
                  );
                  const exceptionChips: Array<
                    | "Needs classification review"
                    | "Needs accounting mapping"
                    | "Unmatched"
                    | "Disputed"
                    | "Needs correction"
                  > = [];

                  if (row.operationalStatus === "Needs correction") {
                    exceptionChips.push("Needs correction");
                  }

                  if (
                    savedDraftAllocation?.approval_status === "disputed" ||
                    savedDraftAllocation?.review_status === "disputed"
                  ) {
                    exceptionChips.push("Disputed");
                  } else if (savedDraftAllocation?.allocation_status === "unmatched") {
                    exceptionChips.push("Unmatched");
                  }

                  if (
                    previewRow.status === "Needs cost review" ||
                    previewRow.accountingResolutionStatus === "classification_review_required"
                  ) {
                    exceptionChips.push("Needs classification review");
                  } else if (previewRow.status === "Needs accounting mapping") {
                    exceptionChips.push("Needs accounting mapping");
                  }

                  const lineAllocationIds = new Set(row.lineDraftAllocations.map((allocation) => allocation.id));
                  const lineActualCostEvents = actualCostEvents.filter((event) => {
                    const allocationId =
                      event.source_invoice_allocation_id ?? event.supplier_invoice_line_allocation_id;
                    return Boolean(allocationId && lineAllocationIds.has(allocationId));
                  });
                  const candidatePreviewRows = row.candidatePreviewRows.filter(
                    (candidate) => Boolean(candidate.candidatePurchaseOrderLineItemId)
                  );
                  const candidatePreviewGroups = Array.from(
                    candidatePreviewRows.reduce((groups, candidate) => {
                      const groupKey = candidate.candidatePurchaseOrderId ?? candidate.candidateKey;
                      const currentGroup = groups.get(groupKey);

                      if (currentGroup) {
                        currentGroup.candidates.push(candidate);
                        return groups;
                      }

                      groups.set(groupKey, {
                        purchaseOrderId: candidate.candidatePurchaseOrderId,
                        purchaseOrderNumber: candidate.candidatePurchaseOrderNumber,
                        purchaseOrderTitle: candidate.candidatePurchaseOrderTitle,
                        candidates: [candidate],
                      });

                      return groups;
                    }, new Map<string, {
                      purchaseOrderId: string | null;
                      purchaseOrderNumber: string | null;
                      purchaseOrderTitle: string | null;
                      candidates: SupplierInvoiceAllocationPreviewData[];
                    }>())
                  ).map(([, group]) => group);
                  const reviewerName =
                    savedDraftAllocation?.reviewed_by_user_id
                      ? memberDirectory.get(savedDraftAllocation.reviewed_by_user_id)?.display_name ?? "Unknown reviewer"
                      : null;
                  const reviewSummary = (() => {
                    switch (row.operationalStatus) {
                      case "Ready":
                        return {
                          reason: "This invoice line matches a PO line and is ready for approval.",
                          nextStep: isSavedDraft
                            ? "Approve this line when the invoice details look right."
                            : "Accept the suggested PO line, then approve it.",
                        };
                      case "Needs review":
                        return {
                          reason:
                            exceptionChips[0] === "Unmatched"
                              ? "This line is currently unmatched and needs reviewer confirmation."
                              : exceptionChips[0] === "Disputed"
                              ? "This line has been disputed and needs a decision."
                              : exceptionChips[0] === "Needs accounting mapping"
                              ? "This line inherited a PO match, but the accounting mapping still needs attention."
                              : "This line needs review before it can be approved.",
                          nextStep: "Review the exception details below and resolve what is blocking approval.",
                        };
                      case "Approved":
                        return {
                          reason: "This line has been approved and is waiting to be posted as an actual cost.",
                          nextStep: "Use the invoice-level posting action when the approved lines are ready to post.",
                        };
                      case "Posted":
                        return {
                          reason: "This line has already been posted as an actual cost.",
                          nextStep: "Correct posted actual costs with a reversal if the allocation needs to change.",
                        };
                      case "Corrected":
                        return {
                          reason: "A correction draft exists for this line allocation.",
                          nextStep: "Review the correction lineage before approving or reposting.",
                        };
                      case "Needs correction":
                        return {
                          reason: "A posted actual cost was reversed and this line needs correction before reposting.",
                          nextStep: "Select the corrected PO line or mark the line unmatched, then approve it again.",
                        };
                      default:
                        return {
                          reason: "This line does not have an allocation status yet.",
                          nextStep: "Select the best PO line match or mark the line unmatched.",
                        };
                    }
                  })();

                  return (
                    <Fragment key={row.line.id}>
                      <OperationalTableRow>
                        <OperationalTableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-[var(--text-primary)]">{row.line.description || "Untitled invoice line"}</p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              Qty {row.line.quantity || "0"} · Unit price {toMoney(numberString(row.line.unitPrice))}
                            </p>
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-[var(--text-primary)]">
                              {previewRow.candidatePurchaseOrderLineDescription || "No matched PO line"}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {previewRow.candidatePurchaseOrderNumber || "No Purchase Order"}
                              {previewRow.candidatePurchaseOrderTitle
                                ? ` · ${previewRow.candidatePurchaseOrderTitle}`
                                : ""}
                            </p>
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell className="font-medium text-[var(--text-primary)]">
                          {toMoney(numberString(row.line.lineTotal))}
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge status={allocationOperationalStatusBadge(row.operationalStatus)}>
                              {row.operationalStatus}
                            </StatusBadge>
                            {exceptionChips.map((chip) => (
                              <StatusBadge key={`${row.line.id}-${chip}`} status={chip === "Disputed" || chip === "Needs correction" ? "overdue" : "pending"}>
                                {chip}
                              </StatusBadge>
                            ))}
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell className="text-right">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setExpandedAllocationReviewRows((current) => ({
                                ...current,
                                [row.line.id]: !(current[row.line.id] ?? false),
                              }))
                            }
                          >
                            {isExpanded ? "Hide detail" : "Review detail"}
                          </Button>
                        </OperationalTableCell>
                      </OperationalTableRow>
                      {isExpanded ? (
                        <OperationalTableRow>
                          <OperationalTableCell colSpan={5} className="bg-[var(--surface-muted)] px-6 py-5 text-sm text-[var(--text-secondary)]">
                            <div className="space-y-5">
                              <section className="space-y-1.5">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  Review summary
                                </h4>
                                <p className="font-medium text-[var(--text-primary)]">{reviewSummary.reason}</p>
                                <p>{reviewSummary.nextStep}</p>
                              </section>

                              {savedDraftAllocation ? (
                                <section className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge status={savedDraftAllocation.approval_status === "approved" ? "approved" : savedDraftAllocation.approval_status === "disputed" ? "overdue" : "pending"}>
                                      {savedDraftAllocation.approval_status}
                                    </StatusBadge>
                                    <StatusBadge status={savedDraftAllocation.review_status === "disputed" ? "overdue" : "pending"}>
                                      {savedDraftAllocation.review_status}
                                    </StatusBadge>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        setAllocationReviewNoteMode({
                                          allocationId: savedDraftAllocation.id,
                                          mode: "approve",
                                        });
                                        void approveDraftAllocation({
                                          allocationId: savedDraftAllocation.id,
                                        });
                                      }}
                                      disabled={
                                        isReviewingAllocationId !== null ||
                                        isPostedAllocation ||
                                        !canApproveSavedAllocation ||
                                        (approvalRequiresNote &&
                                          savedDraftAllocation.allocation_status !== "unmatched")
                                      }
                                    >
                                      {isReviewingAllocationId === savedDraftAllocation.id
                                        ? "Saving..."
                                        : savedDraftAllocation.allocation_status === "unmatched"
                                        ? "Approve unmatched line"
                                        : "Approve allocation"}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() =>
                                        setAllocationReviewNoteMode({
                                          allocationId: savedDraftAllocation.id,
                                          mode: "dispute",
                                        })
                                      }
                                      disabled={isReviewingAllocationId !== null || !canReview || isPostedAllocation}
                                    >
                                      Dispute
                                    </Button>
                                    {canReversePostedActualCost ? (
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() =>
                                          openReverseActualCostDialog({
                                            allocation: savedDraftAllocation,
                                            event: postedEvent!,
                                          })
                                        }
                                      >
                                        Correct actual cost
                                      </Button>
                                    ) : null}
                                  </div>
                                  {reviewNoteMode ? (
                                    <div className="space-y-2">
                                      <textarea
                                        value={allocationReviewNotes[savedDraftAllocation.id] ?? ""}
                                        onChange={(event) =>
                                          setAllocationReviewNotes((current) => ({
                                            ...current,
                                            [savedDraftAllocation.id]: event.target.value,
                                          }))
                                        }
                                        rows={3}
                                        className={FIELD_TEXTAREA_CLASS}
                                        placeholder={reviewNoteMode === "approve" ? "Optional approval note" : "Required dispute note"}
                                      />
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => setAllocationReviewNoteMode(null)}
                                          disabled={isReviewingAllocationId !== null}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() =>
                                            reviewNoteMode === "approve"
                                              ? void approveDraftAllocation({
                                                  allocationId: savedDraftAllocation.id,
                                                })
                                              : void disputeDraftAllocation(savedDraftAllocation.id)
                                          }
                                          disabled={
                                            isReviewingAllocationId !== null ||
                                            (reviewNoteMode === "dispute" &&
                                              (allocationReviewNotes[savedDraftAllocation.id]?.trim()?.length ?? 0) === 0)
                                          }
                                        >
                                          {isReviewingAllocationId === savedDraftAllocation.id
                                            ? "Saving..."
                                            : reviewNoteMode === "approve"
                                            ? "Save approval"
                                            : "Save dispute"}
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null}
                                </section>
                              ) : null}

                              <section className="space-y-3">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  Candidate PO lines
                                </h4>
                                {candidatePreviewGroups.length > 0 ? (
                                  <div className="space-y-3">
                                    {candidatePreviewGroups.map((group) => (
                                      <div key={`${row.line.id}-${group.purchaseOrderId ?? group.purchaseOrderNumber ?? "none"}`} className="space-y-2">
                                        <div className="space-y-1">
                                          <p className="font-medium text-[var(--text-primary)]">
                                            {group.purchaseOrderNumber || "Purchase Order"}
                                          </p>
                                          <p className="text-[var(--text-muted)]">
                                            {group.purchaseOrderTitle || "Untitled purchase order"}
                                          </p>
                                        </div>
                                        <div className="space-y-2">
                                          {group.candidates.map((candidate) => {
                                            const isCurrentSelection =
                                              candidate.candidatePurchaseOrderLineItemId ===
                                              previewRow.candidatePurchaseOrderLineItemId;

                                            return (
                                              <div
                                                key={candidate.candidateKey}
                                                className={`rounded-[var(--radius-md)] border px-4 py-3 ${
                                                  isCurrentSelection
                                                    ? "border-[var(--brand-blue)] bg-[var(--surface-muted)]"
                                                    : "border-[var(--border)] bg-[var(--card)]"
                                                }`}
                                              >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                  <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                                                    <p className="font-medium text-[var(--text-primary)]">
                                                      {candidate.candidatePurchaseOrderLineDescription || "Untitled PO line"}
                                                    </p>
                                                    <p>
                                                      PO line amount {toMoney(candidate.candidatePurchaseOrderLineAmount ?? 0)}
                                                    </p>
                                                  </div>
                                                  <div className="flex flex-col items-end gap-2">
                                                    {isCurrentSelection ? (
                                                      <StatusBadge status="approved">Current selection</StatusBadge>
                                                    ) : (
                                                      <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() =>
                                                          void saveDraftAllocation({
                                                            invoiceLineId: candidate.invoiceLineId,
                                                            purchaseOrderLineItemId: candidate.candidatePurchaseOrderLineItemId!,
                                                          })
                                                        }
                                                        disabled={
                                                          isSavingDraftAllocations ||
                                                          row.lineHasPostedActualCosts ||
                                                          !row.lineHasServerBackedPreview
                                                        }
                                                      >
                                                        Use this PO line
                                                      </Button>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => void markLineUnmatched(previewRow.invoiceLineId)}
                                        disabled={
                                          isSavingDraftAllocations ||
                                          !canMarkUnmatched ||
                                          !row.lineHasServerBackedPreview ||
                                          row.lineHasPostedActualCosts
                                        }
                                      >
                                        Mark unmatched
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3">
                                    <p className="text-[var(--text-muted)]">
                                      No suitable PO line is suggested yet for this invoice line.
                                    </p>
                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => void markLineUnmatched(previewRow.invoiceLineId)}
                                        disabled={
                                          isSavingDraftAllocations ||
                                          !canMarkUnmatched ||
                                          !row.lineHasServerBackedPreview ||
                                          row.lineHasPostedActualCosts
                                        }
                                      >
                                        Mark unmatched
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </section>

                              <section className="space-y-1.5">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  Inherited costing
                                </h4>
                                {previewRow.tradesstackCostCode || previewRow.organizationCostCode ? (
                                  <div className="grid gap-1 sm:grid-cols-2">
                                    <p>
                                      <span className="font-medium text-[var(--text-primary)]">TradesStack routing:</span>{" "}
                                      {[previewRow.tradesstackCostCode, previewRow.tradesstackCostCodeLabel].filter(Boolean).join(" ") || "Not set"}
                                    </p>
                                    {previewRow.sourceCostItemId ? (
                                      <p>
                                        <span className="font-medium text-[var(--text-primary)]">Source lineage:</span>{" "}
                                        Inherited from the source cost item on the matched PO line
                                      </p>
                                    ) : null}
                                    {previewRow.organizationCostCode ? (
                                      <p>
                                        <span className="font-medium text-[var(--text-primary)]">Company cost code:</span>{" "}
                                        {previewRow.organizationCostCode}
                                        {previewRow.organizationCostCodeName
                                          ? ` · ${previewRow.organizationCostCodeName}`
                                          : ""}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : (
                                  <p className="text-[var(--text-muted)]">
                                    No inherited costing details are available for this line yet.
                                  </p>
                                )}
                              </section>

                              {previewRow.status === "Needs accounting mapping" || previewRow.accountingResolutionStatus === "classification_review_required" ? (
                                <section className="space-y-1.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Accounting / mapping issue
                                  </h4>
                                  <p>
                                    This line still needs an active company accounting mapping before it can move through approval cleanly.
                                  </p>
                                </section>
                              ) : null}

                              {formatConstructionIntelligenceSummary(savedDraftAllocation?.ai_construction_intelligence) ? (
                                <section className="space-y-1.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Construction Intelligence
                                  </h4>
                                  <p>
                                    {formatConstructionIntelligenceSummary(savedDraftAllocation?.ai_construction_intelligence)}
                                  </p>
                                </section>
                              ) : null}

                              {(savedDraftAllocation?.approval_notes?.trim() || reviewerName || savedDraftAllocation?.reviewed_at) ? (
                                <section className="space-y-1.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Notes
                                  </h4>
                                  {savedDraftAllocation?.approval_notes?.trim() ? (
                                    <p>{savedDraftAllocation.approval_notes.trim()}</p>
                                  ) : null}
                                  {reviewerName || savedDraftAllocation?.reviewed_at ? (
                                    <p className="text-[var(--text-muted)]">
                                      {reviewerName ? `Reviewed by ${reviewerName}` : "Reviewed"}
                                      {savedDraftAllocation?.reviewed_at
                                        ? ` · ${formatHistoryDate(savedDraftAllocation.reviewed_at)}`
                                        : ""}
                                    </p>
                                  ) : null}
                                </section>
                              ) : null}

                              <section className="space-y-1.5">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  Posting / correction history
                                </h4>
                                {lineActualCostEvents.length > 0 ? (
                                  <div className="space-y-2">
                                    {lineActualCostEvents.map((event) => (
                                      <div
                                        key={event.id}
                                        className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0"
                                      >
                                        <div className="space-y-1">
                                          <p className="font-medium text-[var(--text-primary)]">
                                            {actualCostHistoryLabel(event)}
                                          </p>
                                          <p className="text-[var(--text-muted)]">
                                            {formatHistoryDate(event.created_at)}
                                          </p>
                                          {event.event_type === "reversal" && (event.reversal_reason || event.reversal_note) ? (
                                            <p>
                                              {event.reversal_reason ? `Reason: ${event.reversal_reason}` : null}
                                              {event.reversal_reason && event.reversal_note ? " · " : null}
                                              {event.reversal_note ? event.reversal_note : null}
                                            </p>
                                          ) : null}
                                        </div>
                                        <p className="font-medium text-[var(--text-primary)]">
                                          {toMoney(Number(event.total_amount ?? 0))}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[var(--text-muted)]">
                                    No posted or corrected actual-cost history exists for this line yet.
                                  </p>
                                )}
                              </section>

                              {savedDraftAllocation ? (
                                <section className="space-y-1.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Audit detail
                                  </h4>
                                  <p className="text-[var(--text-muted)]">
                                    Allocation revision {savedDraftAllocation.allocation_sequence ?? 1}
                                    {savedDraftAllocation.supersedes_allocation_id ? " · correction draft lineage active" : ""}
                                    {savedDraftAllocation.edit_state ? ` · ${savedDraftAllocation.edit_state.replace(/_/g, " ")}` : ""}
                                  </p>
                                </section>
                              ) : null}
                            </div>
                          </OperationalTableCell>
                        </OperationalTableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </OperationalTableBody>
            </OperationalTable>
            )}
          </div>
          <div className="border-t border-[var(--border)]">
            {matchesWithPurchaseOrders.length > 0 && lines.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Invoice lines</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Validate each invoice line against the matched PO lines below.
                  </p>
                </div>
              </div>
            ) : null}
            {matchesWithPurchaseOrders.length === 0 ? (
              <div className="px-6 py-6">
                <div className="space-y-3">
                  <OperationalEmptyState title="Match purchase orders to start reviewing invoice lines against PO lines." />
                  {canEditInvoice ? (
                    <div className="flex justify-center">
                      <Button type="button" variant="secondary" size="sm" onClick={openMatchDialog}>
                        Match to PO
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : lines.length === 0 ? (
              <div className="px-6 py-6">
                <OperationalEmptyState title="Add invoice lines to preview candidate purchase order allocations." />
              </div>
            ) : (
              <OperationalTable className="min-w-[1080px]">
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>Invoice line</OperationalTableHead>
                  <OperationalTableHead>Matched PO line</OperationalTableHead>
                  <OperationalTableHead>Amount</OperationalTableHead>
                  <OperationalTableHead>Status</OperationalTableHead>
                  <OperationalTableHead className="text-right">Action</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {allocationReviewRows.map((row) => {
                  const previewRow = row.selectedPreviewRow;
                  const savedDraftAllocation = row.selectedAllocation;
                  const isSavedDraft = Boolean(savedDraftAllocation);
                  const isExpanded = expandedAllocationReviewRows[row.line.id] ?? false;
                  const canSaveReadyCandidate = Boolean(
                    previewRow.candidatePurchaseOrderLineItemId &&
                      canWrite &&
                      previewRow.status === "Ready"
                  );
                  const canSaveReviewCandidate = Boolean(
                    previewRow.candidatePurchaseOrderLineItemId &&
                      canWrite &&
                      canReview &&
                      (previewRow.status === "Needs cost review" ||
                        previewRow.status === "Needs accounting mapping")
                  );
                  const canMarkUnmatched = canWrite && canReview;
                  const approvalRequiresNote = savedDraftAllocation?.allocation_status === "unmatched";
                  const canApproveSavedAllocation = Boolean(
                    savedDraftAllocation &&
                      canReview &&
                      (savedDraftAllocation.allocation_status === "unmatched"
                        ? true
                        : ["pending", "auto_approved", "resolved"].includes(
                            savedDraftAllocation.review_status
                          )) &&
                      savedDraftAllocation.approval_status !== "approved"
                  );
                  const reviewNoteMode =
                    allocationReviewNoteMode?.allocationId === savedDraftAllocation?.id
                      ? allocationReviewNoteMode?.mode ?? null
                      : null;
                  const postedEvent = savedDraftAllocation
                    ? postedPostingActualCostEventsByAllocationId.get(savedDraftAllocation.id) ?? null
                    : null;
                  const isPostedAllocation = Boolean(postedEvent);
                  const hasReversalForPostedEvent = Boolean(
                    postedEvent && reversalActualCostEventsByOriginalEventId.has(postedEvent.id)
                  );
                  const canReversePostedActualCost = Boolean(
                    savedDraftAllocation &&
                      postedEvent &&
                      canReverse &&
                      !hasReversalForPostedEvent
                  );
                  const exceptionChips: Array<
                    | "Needs classification review"
                    | "Needs accounting mapping"
                    | "Unmatched"
                    | "Disputed"
                    | "Needs correction"
                  > = [];

                  if (row.operationalStatus === "Needs correction") {
                    exceptionChips.push("Needs correction");
                  }

                  if (
                    savedDraftAllocation?.approval_status === "disputed" ||
                    savedDraftAllocation?.review_status === "disputed"
                  ) {
                    exceptionChips.push("Disputed");
                  } else if (savedDraftAllocation?.allocation_status === "unmatched") {
                    exceptionChips.push("Unmatched");
                  }

                  if (
                    previewRow.status === "Needs cost review" ||
                    previewRow.accountingResolutionStatus === "classification_review_required"
                  ) {
                    exceptionChips.push("Needs classification review");
                  } else if (previewRow.status === "Needs accounting mapping") {
                    exceptionChips.push("Needs accounting mapping");
                  }

                  const lineAllocationIds = new Set(row.lineDraftAllocations.map((allocation) => allocation.id));
                  const lineActualCostEvents = actualCostEvents.filter((event) => {
                    const allocationId =
                      event.source_invoice_allocation_id ?? event.supplier_invoice_line_allocation_id;
                    return Boolean(allocationId && lineAllocationIds.has(allocationId));
                  });
                  const candidatePreviewRows = row.candidatePreviewRows.filter(
                    (candidate) => Boolean(candidate.candidatePurchaseOrderLineItemId)
                  );
                  const candidatePreviewGroups = Array.from(
                    candidatePreviewRows.reduce((groups, candidate) => {
                      const groupKey = candidate.candidatePurchaseOrderId ?? candidate.candidateKey;
                      const currentGroup = groups.get(groupKey);

                      if (currentGroup) {
                        currentGroup.candidates.push(candidate);
                        return groups;
                      }

                      groups.set(groupKey, {
                        purchaseOrderId: candidate.candidatePurchaseOrderId,
                        purchaseOrderNumber: candidate.candidatePurchaseOrderNumber,
                        purchaseOrderTitle: candidate.candidatePurchaseOrderTitle,
                        candidates: [candidate],
                      });

                      return groups;
                    }, new Map<string, {
                      purchaseOrderId: string | null;
                      purchaseOrderNumber: string | null;
                      purchaseOrderTitle: string | null;
                      candidates: SupplierInvoiceAllocationPreviewData[];
                    }>())
                  ).map(([, group]) => group);
                  const reviewerName =
                    savedDraftAllocation?.reviewed_by_user_id
                      ? memberDirectory.get(savedDraftAllocation.reviewed_by_user_id)?.display_name ?? "Unknown reviewer"
                      : null;
                  const reviewSummary = (() => {
                    switch (row.operationalStatus) {
                      case "Ready":
                        return {
                          reason: "This invoice line matches a PO line and is ready for approval.",
                          nextStep: isSavedDraft
                            ? "Approve this line when the invoice details look right."
                            : "Accept the suggested PO line, then approve it.",
                        };
                      case "Needs review":
                        return {
                          reason:
                            exceptionChips[0] === "Unmatched"
                              ? "This line is currently unmatched and needs reviewer confirmation."
                              : exceptionChips[0] === "Disputed"
                              ? "This line has been disputed and needs a decision."
                              : exceptionChips[0] === "Needs accounting mapping"
                              ? "This line inherited a PO match, but the accounting mapping still needs attention."
                              : "This line needs review before it can be approved.",
                          nextStep: "Review the exception details below and resolve what is blocking approval.",
                        };
                      case "Approved":
                        return {
                          reason: "This line has been approved and is waiting to be posted as an actual cost.",
                          nextStep: "Use the invoice-level posting action when the approved lines are ready to post.",
                        };
                      case "Posted":
                        return {
                          reason: "This line has already been posted as an actual cost.",
                          nextStep: "Only take action if the posted cost needs correction.",
                        };
                      case "Needs correction":
                        return {
                          reason: "A posted actual cost was reversed and this line needs correction before reposting.",
                          nextStep: "Review the correction history and update or approve the active draft before reposting.",
                        };
                      case "Corrected":
                        return {
                          reason: "This line was corrected and reposted successfully.",
                          nextStep: "No action is needed unless another correction is required.",
                        };
                      default:
                        return {
                          reason: "Review this line before continuing.",
                          nextStep: "Open the details below to inspect the current state.",
                        };
                    }
                  })();

                  return (
                    <Fragment key={row.line.id}>
                      <OperationalTableRow className="align-top">
                        <OperationalTableCell className="max-w-[19rem] break-words text-[var(--text-secondary)]">
                          <span className="block font-semibold leading-[1.4] text-[var(--text-primary)]">
                            {previewRow.invoiceLineDescription}
                          </span>
                          <span className="block">
                            Qty {row.line.quantity || "0"} · Unit {toMoney(numberString(row.line.unitPrice))}
                          </span>
                        </OperationalTableCell>
                        <OperationalTableCell className="max-w-[21rem] break-words text-[var(--text-secondary)]">
                          {previewRow.candidatePurchaseOrderLineItemId ? (
                            <>
                              <span className="block font-semibold text-[var(--text-primary)]">
                                {previewRow.candidatePurchaseOrderNumber || "Purchase Order"}
                              </span>
                              <span className="block leading-[1.35]">
                                {previewRow.candidatePurchaseOrderLineDescription || "Untitled PO line"}
                              </span>
                              <span className="block">
                                {previewRow.candidatePurchaseOrderTitle || "Untitled purchase order"}
                              </span>
                              {row.alternateCandidateCount > 0 ? (
                                <span className="mt-1 block text-[var(--text-muted)]">
                                  {row.alternateCandidateCount}{" "}
                                  {row.alternateCandidateCount === 1 ? "alternative" : "alternatives"} available
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <span className="block">
                                {row.alternateCandidateCount > 0
                                  ? "Currently unmatched."
                                  : "No matched purchase order lines available yet."}
                              </span>
                              {row.alternateCandidateCount > 0 ? (
                                <span className="mt-1 block text-[var(--text-muted)]">
                                  {row.alternateCandidateCount}{" "}
                                  {row.alternateCandidateCount === 1 ? "alternative" : "alternatives"} available
                                </span>
                              ) : null}
                            </>
                          )}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-secondary)]">
                          <span className="block font-semibold text-[var(--text-primary)]">
                            {toMoney(previewRow.invoiceLineAmount)}
                          </span>
                          {previewRow.candidatePurchaseOrderLineAmount !== null ? (
                            <span className="block text-[var(--text-muted)]">
                              PO line {toMoney(previewRow.candidatePurchaseOrderLineAmount)}
                            </span>
                          ) : null}
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="flex flex-col items-start gap-2">
                            <StatusBadge status={allocationOperationalStatusBadge(row.operationalStatus)}>
                              {row.operationalStatus}
                            </StatusBadge>
                            {exceptionChips.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {Array.from(new Set(exceptionChips)).map((chip) => (
                                  <StatusBadge key={chip} status={allocationExceptionBadgeStatus(chip)}>
                                    {chip}
                                  </StatusBadge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="flex flex-col items-end gap-2">
                            {!isSavedDraft && previewRow.candidatePurchaseOrderLineItemId ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  void saveDraftAllocation({
                                    invoiceLineId: previewRow.invoiceLineId,
                                    purchaseOrderLineItemId: previewRow.candidatePurchaseOrderLineItemId!,
                                  })
                                }
                                disabled={
                                  isSavingDraftAllocations ||
                                  !row.lineHasServerBackedPreview ||
                                  row.lineHasPostedActualCosts ||
                                  (!canSaveReadyCandidate && !canSaveReviewCandidate)
                                }
                              >
                                Accept candidate
                              </Button>
                            ) : null}
                            {!isSavedDraft ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void markLineUnmatched(previewRow.invoiceLineId)}
                                disabled={
                                  isSavingDraftAllocations ||
                                  !canMarkUnmatched ||
                                  !row.lineHasServerBackedPreview ||
                                  row.lineHasPostedActualCosts
                                }
                              >
                                Mark unmatched
                              </Button>
                            ) : null}
                            {savedDraftAllocation ? (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    if (approvalRequiresNote) {
                                      setAllocationReviewNoteMode({
                                        allocationId: savedDraftAllocation.id,
                                        mode: "approve_unmatched",
                                      });
                                    } else {
                                      void approveDraftAllocation({
                                        allocationId: savedDraftAllocation.id,
                                        requiresNote: false,
                                      });
                                    }
                                  }}
                                  disabled={
                                    isReviewingAllocationId !== null ||
                                    isPostedAllocation ||
                                    !canApproveSavedAllocation ||
                                    (!approvalRequiresNote &&
                                      previewRow.status !== "Ready" &&
                                      savedDraftAllocation.allocation_status !== "unmatched")
                                  }
                                >
                                  {isReviewingAllocationId === savedDraftAllocation.id
                                    ? "Saving..."
                                    : savedDraftAllocation.allocation_status === "unmatched"
                                    ? "Approve unmatched"
                                    : "Approve"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setAllocationReviewNoteMode({
                                      allocationId: savedDraftAllocation.id,
                                      mode: "dispute",
                                    })
                                  }
                                  disabled={isReviewingAllocationId !== null || !canReview || isPostedAllocation}
                                >
                                  Dispute
                                </Button>
                                {canReversePostedActualCost && postedEvent ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      openReverseActualCostDialog({
                                        allocation: savedDraftAllocation,
                                        event: postedEvent,
                                      })
                                    }
                                    disabled={isReversingActualCost}
                                  >
                                    Correct cost
                                  </Button>
                                ) : null}
                                {reviewNoteMode ? (
                                  <div className="w-full min-w-[16rem] space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-left">
                                    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                      {reviewNoteMode === "approve_unmatched"
                                        ? "Approval note"
                                        : "Dispute reason"}
                                    </label>
                                    <textarea
                                      value={allocationReviewNotes[savedDraftAllocation.id] ?? ""}
                                      onChange={(event) =>
                                        setAllocationReviewNotes((current) => ({
                                          ...current,
                                          [savedDraftAllocation.id]: event.target.value,
                                        }))
                                      }
                                      rows={3}
                                      className={FIELD_TEXTAREA_CLASS}
                                      placeholder={
                                        reviewNoteMode === "approve_unmatched"
                                          ? "Why is this allocation intentionally unmatched?"
                                          : "Why is this allocation disputed?"
                                      }
                                    />
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setAllocationReviewNoteMode(null)}
                                        disabled={isReviewingAllocationId !== null}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() =>
                                          reviewNoteMode === "approve_unmatched"
                                            ? void approveDraftAllocation({
                                                allocationId: savedDraftAllocation.id,
                                                requiresNote: true,
                                              })
                                            : void disputeDraftAllocation(savedDraftAllocation.id)
                                        }
                                        disabled={
                                          isReviewingAllocationId !== null ||
                                          (reviewNoteMode === "approve_unmatched" || reviewNoteMode === "dispute") &&
                                            (allocationReviewNotes[savedDraftAllocation.id]?.trim()?.length ?? 0) === 0
                                        }
                                      >
                                        {isReviewingAllocationId === savedDraftAllocation.id
                                          ? "Saving..."
                                          : reviewNoteMode === "approve_unmatched"
                                          ? "Confirm approval"
                                          : "Confirm dispute"}
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setExpandedAllocationReviewRows((current) => ({
                                  ...current,
                                  [row.line.id]: !isExpanded,
                                }))
                              }
                            >
                              {isExpanded ? "Hide details" : "View details"}
                            </Button>
                          </div>
                        </OperationalTableCell>
                      </OperationalTableRow>
                      {isExpanded ? (
                        <OperationalTableRow>
                          <OperationalTableCell colSpan={5} className="border-t-0 bg-[var(--surface-muted)] px-5 py-4">
                            <div className="space-y-4 text-sm text-[var(--text-secondary)]">
                              <section className="space-y-1.5">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  Review summary
                                </h4>
                                <p>{reviewSummary.reason}</p>
                                <p className="text-[var(--text-muted)]">{reviewSummary.nextStep}</p>
                              </section>

                              <section className="space-y-2">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  PO line match
                                </h4>
                                {matchesWithPurchaseOrders.length === 0 ? (
                                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3">
                                    <p className="text-[var(--text-muted)]">No purchase orders are linked yet.</p>
                                    {canEditInvoice ? (
                                      <Button type="button" variant="secondary" size="sm" onClick={openMatchDialog}>
                                        Match to PO
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : candidatePreviewGroups.length > 0 ? (
                                  <div className="space-y-3">
                                    {candidatePreviewGroups.map((group) => (
                                      <div key={group.purchaseOrderId ?? group.purchaseOrderNumber ?? "po-group"} className="space-y-2">
                                        <div className="space-y-0.5">
                                          <p className="font-medium text-[var(--text-primary)]">
                                            {group.purchaseOrderNumber || "Purchase Order"}
                                          </p>
                                          <p className="text-[var(--text-muted)]">
                                            {group.purchaseOrderTitle || "Untitled purchase order"}
                                          </p>
                                        </div>
                                        <div className="space-y-2">
                                          {group.candidates.map((candidate) => {
                                            const isCurrentSelection =
                                              candidate.candidatePurchaseOrderLineItemId ===
                                              previewRow.candidatePurchaseOrderLineItemId;

                                            return (
                                              <div
                                                key={candidate.candidateKey}
                                                className={`rounded-[var(--radius-md)] border px-4 py-3 ${
                                                  isCurrentSelection
                                                    ? "border-[var(--brand-blue)] bg-[var(--surface-muted)]"
                                                    : "border-[var(--border)] bg-[var(--card)]"
                                                }`}
                                              >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                  <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                                                    <p className="font-medium text-[var(--text-primary)]">
                                                      {candidate.candidatePurchaseOrderLineDescription || "Untitled PO line"}
                                                    </p>
                                                    <p>
                                                      PO line amount {toMoney(candidate.candidatePurchaseOrderLineAmount ?? 0)}
                                                    </p>
                                                  </div>
                                                  <div className="flex flex-col items-end gap-2">
                                                    {isCurrentSelection ? (
                                                      <StatusBadge status="approved">Current selection</StatusBadge>
                                                    ) : (
                                                      <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() =>
                                                          void saveDraftAllocation({
                                                            invoiceLineId: candidate.invoiceLineId,
                                                            purchaseOrderLineItemId: candidate.candidatePurchaseOrderLineItemId!,
                                                          })
                                                        }
                                                        disabled={
                                                          isSavingDraftAllocations ||
                                                          row.lineHasPostedActualCosts ||
                                                          !row.lineHasServerBackedPreview
                                                        }
                                                      >
                                                        Use this PO line
                                                      </Button>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => void markLineUnmatched(previewRow.invoiceLineId)}
                                        disabled={
                                          isSavingDraftAllocations ||
                                          !canMarkUnmatched ||
                                          !row.lineHasServerBackedPreview ||
                                          row.lineHasPostedActualCosts
                                        }
                                      >
                                        Mark unmatched
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3">
                                    <p className="text-[var(--text-muted)]">
                                      No suitable PO line is suggested yet for this invoice line.
                                    </p>
                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => void markLineUnmatched(previewRow.invoiceLineId)}
                                        disabled={
                                          isSavingDraftAllocations ||
                                          !canMarkUnmatched ||
                                          !row.lineHasServerBackedPreview ||
                                          row.lineHasPostedActualCosts
                                        }
                                      >
                                        Mark unmatched
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </section>

                              <section className="space-y-1.5">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  Inherited costing
                                </h4>
                                {previewRow.tradesstackCostCode || previewRow.organizationCostCode ? (
                                  <div className="grid gap-1 sm:grid-cols-2">
                                    <p>
                                      <span className="font-medium text-[var(--text-primary)]">TradesStack routing:</span>{" "}
                                      {[previewRow.tradesstackCostCode, previewRow.tradesstackCostCodeLabel].filter(Boolean).join(" ") || "Not set"}
                                    </p>
                                    {previewRow.sourceCostItemId ? (
                                      <p>
                                        <span className="font-medium text-[var(--text-primary)]">Source lineage:</span>{" "}
                                        Inherited from the source cost item on the matched PO line
                                      </p>
                                    ) : null}
                                    {previewRow.organizationCostCode ? (
                                      <p>
                                        <span className="font-medium text-[var(--text-primary)]">Company cost code:</span>{" "}
                                        {previewRow.organizationCostCode}
                                        {previewRow.organizationCostCodeName
                                          ? ` · ${previewRow.organizationCostCodeName}`
                                          : ""}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : (
                                  <p className="text-[var(--text-muted)]">
                                    No inherited costing details are available for this line yet.
                                  </p>
                                )}
                              </section>

                              {previewRow.status === "Needs accounting mapping" || previewRow.accountingResolutionStatus === "classification_review_required" ? (
                                <section className="space-y-1.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Accounting / mapping issue
                                  </h4>
                                  <p>
                                    This line still needs an active company accounting mapping before it can move through approval cleanly.
                                  </p>
                                </section>
                              ) : null}

                              {formatConstructionIntelligenceSummary(savedDraftAllocation?.ai_construction_intelligence) ? (
                                <section className="space-y-1.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Construction Intelligence
                                  </h4>
                                  <p>
                                    {formatConstructionIntelligenceSummary(savedDraftAllocation?.ai_construction_intelligence)}
                                  </p>
                                </section>
                              ) : null}

                              {(savedDraftAllocation?.approval_notes?.trim() || reviewerName || savedDraftAllocation?.reviewed_at) ? (
                                <section className="space-y-1.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Notes
                                  </h4>
                                  {savedDraftAllocation?.approval_notes?.trim() ? (
                                    <p>{savedDraftAllocation.approval_notes.trim()}</p>
                                  ) : null}
                                  {reviewerName || savedDraftAllocation?.reviewed_at ? (
                                    <p className="text-[var(--text-muted)]">
                                      {reviewerName ? `Reviewed by ${reviewerName}` : "Reviewed"}
                                      {savedDraftAllocation?.reviewed_at
                                        ? ` · ${formatHistoryDate(savedDraftAllocation.reviewed_at)}`
                                        : ""}
                                    </p>
                                  ) : null}
                                </section>
                              ) : null}

                              <section className="space-y-1.5">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  Posting / correction history
                                </h4>
                                {lineActualCostEvents.length > 0 ? (
                                  <div className="space-y-2">
                                    {lineActualCostEvents.map((event) => (
                                      <div
                                        key={event.id}
                                        className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0"
                                      >
                                        <div className="space-y-1">
                                          <p className="font-medium text-[var(--text-primary)]">
                                            {actualCostHistoryLabel(event)}
                                          </p>
                                          <p className="text-[var(--text-muted)]">
                                            {formatHistoryDate(event.created_at)}
                                          </p>
                                          {event.event_type === "reversal" && (event.reversal_reason || event.reversal_note) ? (
                                            <p>
                                              {event.reversal_reason ? `Reason: ${event.reversal_reason}` : null}
                                              {event.reversal_reason && event.reversal_note ? " · " : null}
                                              {event.reversal_note ? event.reversal_note : null}
                                            </p>
                                          ) : null}
                                        </div>
                                        <p className="font-medium text-[var(--text-primary)]">
                                          {toMoney(Number(event.total_amount ?? 0))}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[var(--text-muted)]">
                                    No posted or corrected actual-cost history exists for this line yet.
                                  </p>
                                )}
                              </section>

                              {savedDraftAllocation ? (
                                <section className="space-y-1.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Audit detail
                                  </h4>
                                  <p className="text-[var(--text-muted)]">
                                    Allocation revision {savedDraftAllocation.allocation_sequence ?? 1}
                                    {savedDraftAllocation.supersedes_allocation_id ? " · correction draft lineage active" : ""}
                                    {savedDraftAllocation.edit_state ? ` · ${savedDraftAllocation.edit_state.replace(/_/g, " ")}` : ""}
                                  </p>
                                </section>
                              ) : null}
                            </div>
                          </OperationalTableCell>
                        </OperationalTableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </OperationalTableBody>
            </OperationalTable>
            )}
          </div>
        </OperationalPanel>
      </div>

      {canReview ? (
        <OperationalPanel
          className="hidden"
          title="Commercial Approval"
          description="Server-verified procurement readiness. This approval is separate from PO match approval and accounting export."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={
                  commercialComparison.derivedStatus === "approved"
                    ? "approved"
                    : commercialComparison.derivedStatus === "ready_for_review"
                      ? "active"
                      : commercialComparison.derivedStatus === "rejected"
                        ? "overdue"
                        : "pending"
                }
              >
                {commercialComparison.derivedStatus.replaceAll("_", " ")}
              </StatusBadge>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isUpdatingCommercialReview}
                onClick={() => void refreshCommercialReview()}
              >
                Refresh check
              </Button>
            </div>
          }
        >
          <div className="space-y-5">
            {commercialComparison.latestDecision?.status === "invalidated" ? (
              <OperationalAlert variant="warning">
                <p className="font-semibold">Commercial approval invalidated</p>
                <p>
                  {commercialComparison.latestDecision.invalidation_reason ??
                    "Financial information changed and must be reviewed again."}
                </p>
              </OperationalAlert>
            ) : null}

            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Allocated", toMoney(commercialComparison.allocatedAmount)],
                [
                  "Approved allocations",
                  toMoney(commercialComparison.approvedAllocatedAmount),
                ],
                ["Blockers", String(commercialComparison.blockers.length)],
                ["Warnings", String(commercialComparison.warnings.length)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {label}
                  </p>
                  <p className="mt-1 font-semibold text-[var(--text-primary)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {commercialComparison.blockers.length > 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--error)]/30 bg-[var(--error-light)] px-4 py-4">
                <h3 className="text-sm font-semibold text-[var(--error)]">
                  Commercial blockers
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-[var(--text-primary)]">
                  {commercialComparison.blockers.map((blocker, index) => (
                    <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <OperationalAlert variant="success">
                <p className="font-semibold">Ready for commercial review</p>
                <p>All server-enforced prerequisites are satisfied.</p>
              </OperationalAlert>
            )}

            {commercialComparison.purchaseOrderProgress.map((purchaseOrder) => (
              <div
                key={purchaseOrder.purchaseOrderId}
                className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-muted)] px-4 py-3">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {purchaseOrder.purchaseOrderNumber} · {purchaseOrder.purchaseOrderTitle}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Previous {toMoney(purchaseOrder.previouslyApprovedValue)} · Current{" "}
                      {toMoney(purchaseOrder.currentInvoiceValue)} · Projected remaining{" "}
                      {toMoney(purchaseOrder.projectedRemainingValue)}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      purchaseOrder.overInvoicedValue > 0
                        ? "overdue"
                        : purchaseOrder.state === "fully_invoiced"
                          ? "completed"
                          : "pending"
                    }
                  >
                    {purchaseOrder.state.replaceAll("_", " ")}
                  </StatusBadge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="border-t border-[var(--border)] bg-[var(--card)] text-left text-xs uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-4 py-2">PO line</th>
                        <th className="px-4 py-2">Ordered qty/value</th>
                        <th className="px-4 py-2">Previously approved</th>
                        <th className="px-4 py-2">Current invoice</th>
                        <th className="px-4 py-2">Projected remaining</th>
                        <th className="px-4 py-2">Over-invoiced</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrder.lines.map((line) => (
                        <tr key={line.id} className="border-t border-[var(--border)]">
                          <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                            {line.description}
                          </td>
                          <td className="px-4 py-3">
                            {line.orderedQuantity} / {toMoney(line.orderedValue)}
                          </td>
                          <td className="px-4 py-3">
                            {line.previouslyApprovedQuantity} /{" "}
                            {toMoney(line.previouslyApprovedValue)}
                          </td>
                          <td className="px-4 py-3">
                            {line.currentQuantity} / {toMoney(line.currentValue)}
                          </td>
                          <td className="px-4 py-3">
                            {line.projectedRemainingQuantity} /{" "}
                            {toMoney(line.projectedRemainingValue)}
                          </td>
                          <td
                            className={`px-4 py-3 ${
                              line.overInvoicedQuantity > 0 || line.overInvoicedValue > 0
                                ? "font-semibold text-[var(--error)]"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {line.overInvoicedQuantity} / {toMoney(line.overInvoicedValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {draftAllocations.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Accounting and tax readiness
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Coding changes reset allocation approval and invalidate any previous commercial approval.
                  </p>
                </div>
                {draftAllocations.map((allocation) => {
                  const draft = commercialCodingDrafts[allocation.id] ?? {
                    accountingMappingId: "",
                    accountingTaxRateId: "",
                    taxResolutionStatus: "resolved" as const,
                  };
                  const invoiceLine = lines.find(
                    (line) => line.id === allocation.supplier_invoice_line_id
                  );
                  return (
                    <div
                      key={allocation.id}
                      className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 lg:grid-cols-[1.2fr_1fr_1fr_auto]"
                    >
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {invoiceLine?.description || "Invoice line"}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {toMoney(Number(allocation.allocated_amount ?? 0))} · {allocation.approval_status}
                        </p>
                      </div>
                      <select
                        className={FIELD_SELECT_CLASS}
                        value={draft.accountingMappingId}
                        onChange={(event) =>
                          setCommercialCodingDrafts((current) => ({
                            ...current,
                            [allocation.id]: {
                              ...draft,
                              accountingMappingId: event.target.value,
                            },
                          }))
                        }
                        disabled={!canReview}
                      >
                        <option value="">Select accounting mapping</option>
                        {accountingMappings.map((mapping) => (
                          <option key={mapping.id} value={mapping.id}>
                            {mapping.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className={FIELD_SELECT_CLASS}
                        value={
                          draft.taxResolutionStatus === "not_applicable"
                            ? "__not_applicable__"
                            : draft.accountingTaxRateId
                        }
                        onChange={(event) =>
                          setCommercialCodingDrafts((current) => ({
                            ...current,
                            [allocation.id]: {
                              ...draft,
                              accountingTaxRateId:
                                event.target.value === "__not_applicable__"
                                  ? ""
                                  : event.target.value,
                              taxResolutionStatus:
                                event.target.value === "__not_applicable__"
                                  ? "not_applicable"
                                  : "resolved",
                            },
                          }))
                        }
                        disabled={!canReview}
                      >
                        <option value="">Select tax treatment</option>
                        <option value="__not_applicable__">No tax / not applicable</option>
                        {accountingTaxRates.map((taxRate) => (
                          <option key={taxRate.id} value={taxRate.id}>
                            {taxRate.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!canReview || isUpdatingCommercialReview}
                        onClick={() => void saveCommercialCoding(allocation.id)}
                      >
                        Save coding
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {commercialComparison.warnings.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Warning acceptance
                </h3>
                {commercialComparison.warnings.map((variance) => (
                  <div
                    key={variance.key}
                    className="rounded-[var(--radius-md)] border border-[var(--status-pending)]/30 bg-[var(--status-pending-light)] px-4 py-3"
                  >
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {variance.message}
                    </p>
                    <Input
                      className="mt-2"
                      value={acceptedVarianceNotes[variance.key] ?? ""}
                      onChange={(event) =>
                        setAcceptedVarianceNotes((current) => ({
                          ...current,
                          [variance.key]: event.target.value,
                        }))
                      }
                      placeholder="Required acceptance note"
                      disabled={!canReview}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {!commercialComparison.hasPurchaseOrders ? (
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className={FIELD_SELECT_CLASS}
                  value={noPoReason}
                  onChange={(event) => setNoPoReason(event.target.value)}
                  disabled={!canReview}
                >
                  <option value="">Select no-PO reason</option>
                  <option value="utilities">Utilities</option>
                  <option value="insurance">Insurance</option>
                  <option value="emergency_purchase">Emergency purchase</option>
                  <option value="professional_service">Professional service</option>
                  <option value="approved_overhead">Approved overhead</option>
                  <option value="other">Other</option>
                </select>
                <Input
                  value={noPoExplanation}
                  onChange={(event) => setNoPoExplanation(event.target.value)}
                  placeholder={
                    noPoReason === "other"
                      ? "Explain the no-PO reason"
                      : "Optional no-PO detail"
                  }
                  disabled={!canReview}
                />
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={commercialApprovalNote}
                onChange={(event) => setCommercialApprovalNote(event.target.value)}
                placeholder="Commercial approval note"
                disabled={!canReview}
              />
              <Input
                value={commercialRejectionReason}
                onChange={(event) => setCommercialRejectionReason(event.target.value)}
                placeholder="Rejection reason"
                disabled={!canReview}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={
                  !canReview ||
                  isUpdatingCommercialReview ||
                  !commercialRejectionReason.trim()
                }
                onClick={() => void rejectCommercially()}
              >
                Reject commercially
              </Button>
              <Button
                type="button"
                disabled={
                  !canReview ||
                  isUpdatingCommercialReview ||
                  commercialComparison.blockers.some(
                    (blocker) => blocker.code !== "warning_not_accepted"
                  ) ||
                  commercialComparison.warnings.some(
                    (warning) => !(acceptedVarianceNotes[warning.key] ?? "").trim()
                  )
                }
                onClick={() => void approveCommercially()}
              >
                {isUpdatingCommercialReview ? "Checking..." : "Approve commercially"}
              </Button>
            </div>
          </div>
        </OperationalPanel>
      ) : null}

      <OperationalPanel
        className="hidden"
        title="Accounts Approval"
        description="Final Accounts approval remains separate from commercial approval and Xero export."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge
              status={
                accountsApprovalIsCurrent
                  ? "approved"
                  : accountsApprovalIsStale
                    ? "overdue"
                    : workflowState.status === "Ready for Accounts"
                      ? "active"
                      : "pending"
              }
            >
              {accountsApprovalIsCurrent
                ? "Current"
                : accountsApprovalIsStale
                  ? "Stale"
                  : workflowState.status === "Ready for Accounts"
                    ? "Ready for approval"
                    : "Pending"}
            </StatusBadge>
            <p className="text-sm text-[var(--text-secondary)]">
              {accountsApprovalIsCurrent
                ? "Final Accounts approval is current for this finance version."
                : accountsApprovalIsStale
                  ? "A previous Accounts approval no longer matches the current finance version."
                  : workflowState.status === "Ready for Accounts"
                    ? "This invoice is ready for final Accounts approval."
                    : "Complete the remaining approval prerequisites before final Accounts approval."}
            </p>
          </div>

          {accountsApprovalBlockers.length > 0 ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--status-pending)]/30 bg-[var(--status-pending-light)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Accounts approval blockers
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                {accountsApprovalBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {latestAccountsApprovalActivity ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Approved by {latestAccountsApprovalActivity.actorName} ·{" "}
              {formatHistoryDate(latestAccountsApprovalActivity.created_at)}
            </p>
          ) : null}

          {canAccountsApprove && workflowState.status === "Ready for Accounts" ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              <Input
                value={accountsApprovalNote}
                onChange={(event) => setAccountsApprovalNote(event.target.value)}
                placeholder="Accounts approval note"
              />
              <Button
                type="button"
                disabled={isUpdatingWorkflow}
                onClick={() => void approveForXero()}
              >
                {isUpdatingWorkflow ? "Approving..." : "Approve for Xero"}
              </Button>
            </div>
          ) : null}
        </div>
      </OperationalPanel>

      {xeroBillReadiness ? (
        <OperationalPanel
          className="hidden"
          title="Xero Accounting"
          description="Commercial approval and Xero export are separate states. Phase 3A creates Draft ACCPAY Bills only."
          actions={
            <StatusBadge
              status={
                xeroBillReadiness.resolvedSummary.exportStatus === "exported"
                  ? "completed"
                  : xeroBillReadiness.ready
                    ? "active"
                    : xeroBillReadiness.resolvedSummary.exportStatus === "attention_required"
                      ? "overdue"
                      : "pending"
              }
            >
              {(
                xeroBillReadiness.resolvedSummary.normalizedExternalStatus ??
                xeroBillReadiness.resolvedSummary.exportStatus
              ).replaceAll("_", " ")}
            </StatusBadge>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                [
                  "Commercial approval",
                  xeroBillReadiness.resolvedSummary.commercialApprovalId
                    ? xeroBillReadiness.resolvedSummary.financeHashValid
                      ? "Current"
                      : "Stale"
                    : "Missing",
                ],
                [
                  "Internal posting",
                  xeroBillReadiness.resolvedSummary.internallyPosted
                    ? "Posted"
                    : "Not posted",
                ],
                [
                  "Xero Contact",
                  xeroBillReadiness.resolvedSummary.contactName ?? "Not linked",
                ],
                [
                  "Total",
                  `${xeroBillReadiness.resolvedSummary.currency} ${toMoney(
                    xeroBillReadiness.resolvedSummary.total
                  )}`,
                ],
                [
                  "Paid",
                  xeroBillReadiness.resolvedSummary.amountPaid === null
                    ? "Not refreshed"
                    : `${xeroBillReadiness.resolvedSummary.currency} ${toMoney(
                        xeroBillReadiness.resolvedSummary.amountPaid
                      )}`,
                ],
                [
                  "Amount due",
                  xeroBillReadiness.resolvedSummary.amountDue === null
                    ? "Not refreshed"
                    : `${xeroBillReadiness.resolvedSummary.currency} ${toMoney(
                        xeroBillReadiness.resolvedSummary.amountDue
                      )}`,
                ],
                [
                  "Paid on",
                  xeroBillReadiness.resolvedSummary.fullyPaidAt
                    ? new Date(xeroBillReadiness.resolvedSummary.fullyPaidAt).toLocaleDateString()
                    : "Not fully paid",
                ],
                [
                  "Last refreshed",
                  xeroBillReadiness.resolvedSummary.lastStatusSyncedAt
                    ? new Date(xeroBillReadiness.resolvedSummary.lastStatusSyncedAt).toLocaleString()
                    : "Not yet",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {label}
                  </p>
                  <p className="mt-1 font-semibold text-[var(--text-primary)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Export review
                </h3>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-[var(--text-secondary)]">Invoice</dt>
                  <dd>{xeroBillReadiness.resolvedSummary.invoiceNumber || "Missing"}</dd>
                  <dt className="text-[var(--text-secondary)]">Dates</dt>
                  <dd>
                    {xeroBillReadiness.resolvedSummary.invoiceDate ?? "Missing"} to{" "}
                    {xeroBillReadiness.resolvedSummary.dueDate ?? "Missing"}
                  </dd>
                  <dt className="text-[var(--text-secondary)]">Lines</dt>
                  <dd>{xeroBillReadiness.resolvedSummary.lineCount}</dd>
                  <dt className="text-[var(--text-secondary)]">PO references</dt>
                  <dd>
                    {xeroBillReadiness.resolvedSummary.poNumbers.join(", ") || "No PO"}
                  </dd>
                  <dt className="text-[var(--text-secondary)]">Accounts</dt>
                  <dd>
                    {Array.from(
                      new Set(
                        xeroBillReadiness.resolvedSummary.lines.map(
                          (line) => line.xeroAccountCode
                        )
                      )
                    ).join(", ") || "Missing"}
                  </dd>
                  <dt className="text-[var(--text-secondary)]">Tax types</dt>
                  <dd>
                    {Array.from(
                      new Set(
                        xeroBillReadiness.resolvedSummary.lines.map(
                          (line) => line.xeroTaxType
                        )
                      )
                    ).join(", ") || "Missing"}
                  </dd>
                </dl>
              </div>

              <div className="space-y-3">
                {xeroBillReadiness.blockers.length > 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--error)]/30 bg-[var(--error-light)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--error)]">
                      Xero blockers
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {xeroBillReadiness.blockers.map((blocker) => (
                        <li key={blocker.code}>{blocker.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <OperationalAlert variant="success">
                    Ready to queue one Draft Xero Bill.
                  </OperationalAlert>
                )}
                {xeroBillReadiness.warnings.length > 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--status-pending)]/30 bg-[var(--status-pending-light)] p-4">
                    <ul className="space-y-1 text-sm">
                      {xeroBillReadiness.warnings.map((warning) => (
                        <li key={warning.code}>{warning.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {xeroBillReadiness.resolvedSummary.safeError ? (
                  <OperationalAlert variant="error">
                    {xeroBillReadiness.resolvedSummary.safeError}
                  </OperationalAlert>
                ) : null}
              </div>
            </div>

            {xeroBillReadiness.resolvedSummary.externalDocumentNumber ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Xero Bill {xeroBillReadiness.resolvedSummary.externalDocumentNumber}
                {xeroBillReadiness.resolvedSummary.rawExternalStatus
                  ? ` · ${xeroBillReadiness.resolvedSummary.rawExternalStatus}`
                  : ""}
                {xeroBillReadiness.resolvedSummary.exportedAt
                  ? ` · exported ${new Date(
                      xeroBillReadiness.resolvedSummary.exportedAt
                    ).toLocaleString()}`
                  : ""}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              {xeroBillReadiness.resolvedSummary.exportStatus === "exported" &&
              xeroBillReadiness.resolvedSummary.externalDocumentNumber ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canRefreshXeroBill || isUpdatingXeroBill}
                  onClick={() => void refreshXeroBillStatus()}
                >
                  {isUpdatingXeroBill ? "Refreshing..." : "Refresh Xero Status"}
                </Button>
              ) : xeroBillReadiness.resolvedSummary.exportStatus === "queued" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canExportXeroBill || isUpdatingXeroBill}
                  onClick={() => void cancelDraftXeroBill()}
                >
                  {isUpdatingXeroBill ? "Cancelling..." : "Cancel queued export"}
                </Button>
              ) : xeroBillReadiness.resolvedSummary.exportStatus === "failed" ? (
                <Button
                  type="button"
                  disabled={!canExportXeroBill || isUpdatingXeroBill}
                  onClick={() => void retryDraftXeroBill()}
                >
                  {isUpdatingXeroBill ? "Retrying..." : "Retry export"}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={
                    !canExportXeroBill ||
                    !xeroBillReadiness.ready ||
                    isUpdatingXeroBill
                  }
                  onClick={() => void queueDraftXeroBill()}
                >
                  {isUpdatingXeroBill ? "Queueing..." : "Queue Draft Xero Bill"}
                </Button>
              )}
            </div>
          </div>
        </OperationalPanel>
      ) : initialXeroBillReadinessError ? (
        <OperationalPanel
          className="hidden"
          title="Xero Accounting"
          description="Commercial approval and Xero export are separate states."
        >
          <OperationalAlert variant="error">
            {initialXeroBillReadinessError} Xero export remains disabled until readiness can be verified.
          </OperationalAlert>
        </OperationalPanel>
      ) : null}

      <OperationalPanel
        title={
          <button
            type="button"
            onClick={() => setIsHistoryOpen((current) => !current)}
            aria-expanded={isHistoryOpen}
            className="flex items-center gap-4 text-left"
          >
            <ChevronUp
              className={`h-5 w-5 text-[var(--text-secondary)] transition-transform ${isHistoryOpen ? "" : "rotate-180"}`}
              strokeWidth={2.2}
            />
            Activity & Notes
          </button>
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => document.getElementById("supplier-invoice-notes")?.focus()}
          >
            Add note
          </Button>
        }
        contentClassName="p-0"
      >
        {!isHistoryOpen ? null : historyRows.length === 0 ? (
          <div className="p-6">
            <OperationalEmptyState title="No history or notes yet." />
          </div>
        ) : (
          <OperationalTable className="min-w-[820px]">
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead className="w-[24%]">Date</OperationalTableHead>
                <OperationalTableHead className="w-[15%]">User</OperationalTableHead>
                <OperationalTableHead className="w-[18%]">Action</OperationalTableHead>
                <OperationalTableHead>Detail</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {historyRows.map((row) => (
                <OperationalTableRow key={row.id}>
                  <OperationalTableCell className="text-[var(--text-secondary)]">
                    {formatHistoryDate(row.createdAt)}
                  </OperationalTableCell>
                  <OperationalTableCell className="text-[var(--text-secondary)]">{row.user}</OperationalTableCell>
                  <OperationalTableCell className="text-[var(--text-secondary)]">{row.action}</OperationalTableCell>
                  <OperationalTableCell className="leading-[1.35] text-[var(--text-secondary)]">
                    {row.detail}
                  </OperationalTableCell>
                </OperationalTableRow>
              ))}
            </OperationalTableBody>
          </OperationalTable>
        )}
      </OperationalPanel>

      <Dialog
        open={isDocumentPreviewOpen}
        onOpenChange={(open) => {
          setIsDocumentPreviewOpen(open);
        }}
      >
        <DialogContent className="max-h-[92vh] w-full max-w-[960px] overflow-y-auto p-0">
          <div className="space-y-5 px-7 pb-7 pt-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                  Invoice Document
                </h2>
                <p className="truncate text-sm text-[var(--text-secondary)]">
                  {primaryDocument?.file_name ?? "No document attached"}
                </p>
              </div>
              {primaryDocument?.signedUrl ? (
                <Button asChild type="button" variant="secondary" size="sm">
                  <a href={primaryDocument.signedUrl} target="_blank" rel="noreferrer">
                    Download document
                  </a>
                </Button>
              ) : null}
            </div>

            {!primaryDocument ? (
              <OperationalEmptyState title="No document uploaded yet." />
            ) : documentsLoading ? (
              <p className="text-sm text-[var(--text-secondary)]">Loading document preview...</p>
            ) : primaryDocument.signedUrl ? (
              primaryDocument.mime_type?.includes("pdf") ? (
                <iframe
                  src={primaryDocument.signedUrl}
                  title={primaryDocument.file_name}
                  className="h-[70vh] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
                />
              ) : primaryDocument.mime_type?.startsWith("image/") ? (
                <Image
                  src={primaryDocument.signedUrl}
                  alt={primaryDocument.file_name}
                  width={1400}
                  height={1800}
                  unoptimized
                  className="max-h-[70vh] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] object-contain"
                />
              ) : (
                <div className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-5 py-5">
                  <p className="text-sm text-[var(--text-secondary)]">Preview unavailable for this document type.</p>
                </div>
              )
            ) : (
              <div className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-5 py-5">
                <p className="text-sm text-[var(--text-secondary)]">Document preview unavailable right now.</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDocumentsLoading(true);
                    setCurrentDocumentSignedUrl(null);
                    setDocumentRefreshNonce((current) => current + 1);
                  }}
                >
                  Retry preview
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isReverseActualCostDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeReverseActualCostDialog();
            return;
          }

          setIsReverseActualCostDialogOpen(true);
        }}
      >
        <DialogContent className="w-full max-w-[640px] p-0">
          <div className="space-y-5 px-7 pb-7 pt-7">
            <div className="space-y-2">
              <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                Correct actual cost
              </h2>
              <p className="text-sm leading-[1.5] text-[var(--text-secondary)]">
                This will create a reversing actual-cost entry.
              </p>
              <p className="text-sm leading-[1.5] text-[var(--text-secondary)]">
                The original posted event will remain in history.
              </p>
              <p className="text-sm leading-[1.5] text-[var(--text-secondary)]">
                A new correction draft allocation will be created for review before reposting.
              </p>
              <p className="text-sm leading-[1.5] text-[var(--text-secondary)]">
                This does not change invoice status or PO match approval.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Original actual cost
                </p>
                <p className="mt-1 font-semibold text-[var(--text-primary)]">
                  {reverseTarget ? toMoney(Number(reverseTarget.event.total_amount ?? 0)) : "—"}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Reversal allocation
                </p>
                <p className="mt-1 font-semibold text-[var(--text-primary)]">
                  {reverseTarget ? toMoney(Number(reverseTarget.event.total_amount ?? 0) * -1) : "—"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Reversal reason
              </label>
              <select
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
                className={FIELD_SELECT_CLASS}
                disabled={isReversingActualCost}
              >
                <option value="">Select a reason</option>
                {ACTUAL_COST_REVERSAL_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Note
              </label>
              <textarea
                value={reversalNote}
                onChange={(event) => setReversalNote(event.target.value)}
                rows={4}
                className={FIELD_TEXTAREA_CLASS}
                placeholder="Optional context for the correction workflow."
                disabled={isReversingActualCost}
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => closeReverseActualCostDialog()}
                disabled={isReversingActualCost}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void reverseActualCostEvent()}
                disabled={isReversingActualCost || reversalReason.trim().length === 0}
              >
                {isReversingActualCost ? "Starting..." : "Start correction"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isMatchDialogOpen}
        onOpenChange={(open) => {
          setIsMatchDialogOpen(open);
          if (open) {
            setMatchDrafts(buildInitialMatchDrafts());
          }
        }}
      >
        <DialogContent className="max-h-[92vh] w-full max-w-[880px] overflow-y-auto p-0">
          <div className="px-7 pb-6 pt-7">
            <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
              Match to Purchase Orders
            </h2>
          </div>

          <div className="space-y-4 px-7 pb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Invoice Total", toMoney(Number(invoice.total ?? 0))],
                ["Draft Matched Total", toMoney(draftMatchedTotal)],
                ["Remaining Amount", toMoney(Math.max(0, Number(invoice.total ?? 0) - draftMatchedTotal))],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
                  <p className="mt-1 font-semibold text-[var(--text-primary)]">{value}</p>
                </div>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                type="text"
                value={matchSearchQuery}
                onChange={(event) => setMatchSearchQuery(event.target.value)}
                placeholder="Search purchase orders..."
                className="pl-9"
              />
            </div>

            <div className="space-y-3">
              {filteredPurchaseOrders.length === 0 ? (
                <OperationalEmptyState title="No purchase orders match this search." />
              ) : (
                filteredPurchaseOrders.map((purchaseOrder) => {
                  const draft = matchDrafts[purchaseOrder.id] ?? {
                    matchedAmount: "",
                    matchStatus: "accepted" as const,
                  };
                  const matchesSupplier =
                    Boolean(formState.supplierId) && purchaseOrder.supplier_id === formState.supplierId;

                  return (
                    <div
                      key={purchaseOrder.id}
                      className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-[var(--text-primary)]">
                              {purchaseOrder.purchase_order_number}
                            </p>
                            {matchesSupplier ? (
                              <StatusBadge status="approved">Same supplier</StatusBadge>
                            ) : null}
                          </div>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {purchaseOrder.purchase_order_title || "Untitled purchase order"}
                          </p>
                          <p className="text-sm text-[var(--text-muted)]">
                            {purchaseOrder.issued_to_label?.trim() || "Unassigned supplier"} · {purchaseOrder.status} · {toDayMonthYearLabel(purchaseOrder.requested_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">PO Total</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {toMoney(Number(purchaseOrder.total_purchase_order_price ?? 0))}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_170px]">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Matched Amount</label>
                          <Input
                            inputMode="decimal"
                            value={draft.matchedAmount}
                            onChange={(event) =>
                              setMatchDrafts((current) => ({
                                ...current,
                                [purchaseOrder.id]: {
                                  id: current[purchaseOrder.id]?.id,
                                  matchedAmount: event.target.value,
                                  matchStatus: current[purchaseOrder.id]?.matchStatus ?? "accepted",
                                },
                              }))
                            }
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Allocation Status</label>
                          <select
                            value={draft.matchStatus}
                            onChange={(event) =>
                              setMatchDrafts((current) => ({
                                ...current,
                                [purchaseOrder.id]: {
                                  id: current[purchaseOrder.id]?.id,
                                  matchedAmount: current[purchaseOrder.id]?.matchedAmount ?? "",
                                  matchStatus: event.target.value as "accepted" | "adjusted",
                                },
                              }))
                            }
                            className={FIELD_SELECT_CLASS}
                          >
                            <option value="accepted">Allocated</option>
                            <option value="adjusted">Adjusted Allocation</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setMatchDrafts((current) => {
                                const next = { ...current };
                                delete next[purchaseOrder.id];
                                return next;
                              })
                            }
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => void saveMatches()}
              disabled={!canEditInvoice || isSavingMatches}
            >
              {isSavingMatches ? "Saving..." : "Save Matches"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
