"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useMemo, useState, useEffect } from "react";
import { ChevronRight, ChevronUp, MoreVertical, Plus, Printer, Search, Trash2 } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
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
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { summarizeApprovedUnpostedAllocations } from "@/lib/actual-cost-events";
import { ibmPlexSans } from "@/lib/fonts";
import { getSupplierDisplayName, type OrganizationSupplierRow } from "@/lib/suppliers";
import {
  approveSupplierInvoiceDraftAllocationAction,
  disputeSupplierInvoiceDraftAllocationAction,
  markSupplierInvoiceLineAllocationUnmatchedAction,
  postSupplierInvoiceActualCostsAction,
  reverseSupplierInvoiceActualCostEventAction,
  saveAllReadySupplierInvoiceDraftAllocationsAction,
  saveSupplierInvoiceDraftAllocationAction,
} from "./actions";
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
import type { Database } from "@/lib/supabase/types";

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
  initialDocuments: SupplierInvoiceDocumentRow[];
  initialMatches: SupplierInvoicePurchaseOrderMatchRow[];
  initialApprovalSteps: SupplierInvoiceApprovalStepRow[];
  initialActivityEvents: SupplierInvoiceActivityEventRow[];
  purchaseOrders: PurchaseOrderCandidateRow[];
  projects: OrganizationProjectRow[];
  costCodes: OrganizationCostCodeRow[];
  organizationMembers: OrganizationMemberRow[];
  allocationPreviewRows: SupplierInvoiceAllocationPreviewData[];
  initialDraftAllocations: SupplierInvoiceLineAllocationRow[];
  initialActualCostEvents: ProjectActualCostEventRow[];
  canWrite: boolean;
  canReview: boolean;
  canReverse: boolean;
};

type InvoiceFormState = {
  supplierId: string;
  invoiceNumber: string;
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

function numberString(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePurchaseOrderSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toInvoiceFormState(invoice: SupplierInvoiceRow): InvoiceFormState {
  return {
    supplierId: invoice.supplier_id ?? "",
    invoiceNumber: invoice.invoice_number ?? "",
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
  initialDocuments,
  initialMatches,
  initialApprovalSteps,
  initialActivityEvents,
  purchaseOrders,
  projects,
  costCodes,
  organizationMembers,
  allocationPreviewRows,
  initialDraftAllocations,
  initialActualCostEvents,
  canWrite,
  canReview,
  canReverse,
}: SupplierInvoiceDetailWorkspaceProps) {
  const { session } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [invoice, setInvoice] = useState(initialInvoice);
  const [formState, setFormState] = useState<InvoiceFormState>(() =>
    toInvoiceFormState(initialInvoice)
  );
  const [lines, setLines] = useState<LineFormState[]>(
    initialLines.length > 0 ? initialLines.map(toLineFormState) : []
  );
  const [documents, setDocuments] = useState<DocumentWithUrl[]>(
    initialDocuments.map((document) => ({ ...document, signedUrl: null }))
  );
  const [matches, setMatches] = useState(initialMatches);
  const [approvalSteps, setApprovalSteps] = useState(initialApprovalSteps);
  const [activityEvents, setActivityEvents] = useState(initialActivityEvents);
  const [draftAllocations, setDraftAllocations] = useState(initialDraftAllocations);
  const [actualCostEvents, setActualCostEvents] = useState(initialActualCostEvents);
  const [documentsLoading, setDocumentsLoading] = useState(initialDocuments.length > 0);
  const [documentRefreshNonce, setDocumentRefreshNonce] = useState(0);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [matchSearchQuery, setMatchSearchQuery] = useState("");
  const [matchDrafts, setMatchDrafts] = useState<Record<string, PurchaseOrderMatchDraft>>({});
  const [isSavingMatches, setIsSavingMatches] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDraftAllocations, setIsSavingDraftAllocations] = useState(false);
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
    mode: "approve_unmatched" | "dispute";
  } | null>(null);
  const [allocationReviewNotes, setAllocationReviewNotes] = useState<Record<string, string>>({});
  const [expandedAllocationReviewRows, setExpandedAllocationReviewRows] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const memberDirectory = useMemo(
    () => new Map(organizationMembers.map((member) => [member.user_id, member])),
    [organizationMembers]
  );
  const purchaseOrderById = useMemo(
    () => new Map(purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder])),
    [purchaseOrders]
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
    if (initialDocuments.length === 0) {
      setDocuments([]);
      setDocumentsLoading(false);
      return;
    }

    if (!session?.id) {
      setDocuments(initialDocuments.map((document) => ({ ...document, signedUrl: null })));
      setDocumentsLoading(true);
      return;
    }

    let cancelled = false;
    setDocumentsLoading(true);

    void (async () => {
      const nextDocuments = await Promise.all(
        initialDocuments.map(async (document) => {
          const { data, error: signedUrlError } = await supabase.storage
            .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
            .createSignedUrl(document.file_path, 60 * 60);

          return {
            ...document,
            signedUrl: signedUrlError ? null : data?.signedUrl ?? null,
          };
        })
      );

      if (!cancelled) {
        setDocuments(nextDocuments);
        setDocumentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentRefreshNonce, initialDocuments, session?.id, supabase]);

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
    setDraftAllocations((refreshedDraftAllocations ?? []) as SupplierInvoiceLineAllocationRow[]);
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
    if (!canWrite || isSavingMatches) {
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
        const { error: deleteError } = await supabase
          .from("supplier_invoice_purchase_order_matches")
          .delete()
          .eq("organization_id", organizationId)
          .eq("supplier_invoice_id", invoice.id)
          .in("id", matchIdsToDelete);

        if (deleteError) {
          throw new Error(deleteError.message);
        }
      }

      if (nextRows.length > 0) {
        const savedMatches: SupplierInvoicePurchaseOrderMatchRow[] = [];

        if (existingRows.length > 0) {
          const { data: upsertedMatches, error: upsertError } = await supabase
            .from("supplier_invoice_purchase_order_matches")
            .upsert(existingRows, {
              onConflict: "supplier_invoice_id,purchase_order_id",
            })
            .select("*");

          if (upsertError) {
            throw new Error(upsertError.message);
          }

          savedMatches.push(
            ...((upsertedMatches ?? []) as SupplierInvoicePurchaseOrderMatchRow[])
          );
        }

        if (newRows.length > 0) {
          const { data: insertedMatches, error: insertError } = await supabase
            .from("supplier_invoice_purchase_order_matches")
            .insert(newRows)
            .select("*");

          if (insertError) {
            throw new Error(insertError.message);
          }

          savedMatches.push(
            ...((insertedMatches ?? []) as SupplierInvoicePurchaseOrderMatchRow[])
          );
        }

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
    if (!canWrite || isSavingDraftAllocations) {
      return;
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

      setDraftAllocations(result.allocations);
      await refreshWorkflowState();
      setMessage("Draft allocation saved. This does not affect invoice approval, PO match status, or actual costs yet.");
    } catch (saveDraftAllocationError) {
      setError(
        saveDraftAllocationError instanceof Error
          ? saveDraftAllocationError.message
          : "Unable to save the draft allocation."
      );
    } finally {
      setIsSavingDraftAllocations(false);
    }
  }

  async function saveAllReadyDraftAllocations() {
    if (!canWrite || isSavingDraftAllocations || readyDraftCandidates.length === 0) {
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

      setDraftAllocations(result.allocations);
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
    if (!canWrite || isSavingDraftAllocations) {
      return;
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

      setDraftAllocations(result.allocations);
      await refreshWorkflowState();
      setMessage("Draft allocation saved as unmatched. This does not affect invoice approval, PO match status, or actual costs yet.");
    } catch (markUnmatchedError) {
      setError(
        markUnmatchedError instanceof Error
          ? markUnmatchedError.message
          : "Unable to mark the invoice line as unmatched."
      );
    } finally {
      setIsSavingDraftAllocations(false);
    }
  }

  async function approveDraftAllocation(params: {
    allocationId: string;
    requiresNote: boolean;
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

      setDraftAllocations(result.allocations);
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

      setDraftAllocations(result.allocations);
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
      const { data: updatedMatch, error: updateError } = await supabase
        .from("supplier_invoice_purchase_order_matches")
        .update({ match_status: nextStatus })
        .eq("id", matchId)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      if (updateError || !updatedMatch) {
        throw new Error(updateError?.message ?? "Unable to update match.");
      }

      setMatches((current) =>
        current.map((match) => (match.id === matchId ? (updatedMatch as SupplierInvoicePurchaseOrderMatchRow) : match))
      );
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
      const { error: deleteError } = await supabase
        .from("supplier_invoice_purchase_order_matches")
        .delete()
        .eq("id", matchId)
        .eq("organization_id", organizationId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      setMatches((current) => current.filter((match) => match.id !== matchId));
      await refreshWorkflowState();
      setMessage("Purchase order match removed.");
    } catch (deleteMatchError) {
      setError(deleteMatchError instanceof Error ? deleteMatchError.message : "Unable to remove match.");
    }
  }

  async function saveInvoice(nextStatus?: SupplierInvoiceRow["status"]) {
    if (!canWrite || isSaving) {
      return;
    }
    if (!session?.id) {
      setError("You must be signed in to update this invoice.");
      return;
    }

    const statusToPersist = nextStatus ?? formState.status;
    if (actualCostEvents.some((event) => event.event_status === "posted")) {
      setError("This invoice has posted actual costs. Correct posted costs with reversal entries before editing the invoice.");
      return;
    }
    if (
      (statusToPersist === "Approved" || statusToPersist === "Disputed") &&
      !canReview
    ) {
      setError("You do not have permission to review this invoice.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const nextInvoiceTotal = numberString(formState.total);
      if (matchedTotal > nextInvoiceTotal + 0.0001) {
        throw new Error("Invoice total cannot be less than the allocated purchase order amounts.");
      }

      const { data: updatedInvoice, error: invoiceError } = await supabase
        .from("supplier_invoices")
        .update({
          supplier_id: formState.supplierId || null,
          invoice_number: formState.invoiceNumber.trim(),
          invoice_date: formState.invoiceDate || null,
          due_date: formState.dueDate || null,
          subtotal: numberString(formState.subtotal),
          tax_total: numberString(formState.taxTotal),
          total: nextInvoiceTotal,
          notes: formState.notes.trim(),
          status: statusToPersist,
        })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      if (invoiceError || !updatedInvoice) {
        throw new Error(invoiceError?.message ?? "Unable to update invoice.");
      }

      const { error: deleteLinesError } = await supabase
        .from("supplier_invoice_lines")
        .delete()
        .eq("organization_id", organizationId)
        .eq("supplier_invoice_id", invoice.id);

      if (deleteLinesError) {
        throw new Error(deleteLinesError.message);
      }

      if (lines.length > 0) {
        const { error: insertLinesError } = await supabase
          .from("supplier_invoice_lines")
          .insert(
            lines.map((line, index) => ({
              organization_id: organizationId,
              supplier_invoice_id: invoice.id,
              description: line.description.trim(),
              quantity: numberString(line.quantity),
              unit_price: numberString(line.unitPrice),
              line_total: numberString(line.lineTotal),
              tax_amount: numberString(line.taxAmount),
              cost_code_id: line.costCodeId || null,
              project_id: line.projectId || null,
              sort_order: index,
            }))
          );

        if (insertLinesError) {
          throw new Error(insertLinesError.message);
        }
      }

      const autoReReviewed =
        invoice.status === "Approved" && updatedInvoice.status === "Needs Review";

      setInvoice(updatedInvoice);
      setFormState(toInvoiceFormState(updatedInvoice));
      await refreshWorkflowState();
      setMessage(
        autoReReviewed
          ? "Material changes sent this invoice back to Needs Review."
          : nextStatus
          ? `Invoice marked ${nextStatus}.`
          : "Supplier invoice updated."
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  const primaryDocument = documents[0] ?? null;

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
            <Button type="button" variant="secondary" onClick={() => window.print()}>
              <Printer className="hidden h-4 w-4 sm:block" strokeWidth={2.2} />
              Print PDF
            </Button>
            <Button
              type="button"
              onClick={() => void saveInvoice()}
              disabled={!canWrite || isSaving}
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

      <div className="space-y-6">
        <OperationalPanel
          title="Invoice Details"
          description="Manage the supplier invoice record, dates, totals, and notes."
        >
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Supplier</label>
              <select
                value={formState.supplierId}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, supplierId: event.target.value }))
                }
                disabled={!canWrite}
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
                disabled={!canWrite}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Subtotal</label>
                <Input
                  inputMode="decimal"
                  value={formState.subtotal}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      subtotal: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Tax</label>
                <Input
                  inputMode="decimal"
                  value={formState.taxTotal}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      taxTotal: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                />
              </div>
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
                disabled={!canWrite}
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
                disabled={!canWrite}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Total</label>
              <Input
                inputMode="decimal"
                value={formState.total}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    total: event.target.value,
                  }))
                }
                disabled={!canWrite}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Source</label>
              <div className="flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 text-sm text-[var(--text-secondary)]">
                {getSourceLabel(invoice.source)}
              </div>
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
                disabled={!canWrite}
                className={FIELD_TEXTAREA_CLASS}
              />
            </div>
          </div>
        </OperationalPanel>

        <OperationalPanel title="Line Items" contentClassName="p-6 pt-6">
          {lines.length === 0 ? (
            <OperationalEmptyState title="No line items added yet." />
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
              <div className="min-w-[1180px]">
                <div
                  className="grid items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-muted)] text-left text-xs tracking-[-0.01em] text-[var(--text-secondary)]"
                  style={{
                    gridTemplateColumns:
                      "minmax(210px,1.4fr) 82px 108px 108px 82px minmax(170px,0.9fr) minmax(170px,0.9fr) 44px",
                  }}
                >
                  <span className="px-3 py-2.5 font-semibold">Description</span>
                  <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Qty.</span>
                  <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Unit Price</span>
                  <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Line Total</span>
                  <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Tax</span>
                  <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Cost Code</span>
                  <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Project</span>
                  <span className="border-l border-[var(--border)] px-3 py-2.5" />
                </div>
                <div className="divide-y divide-[var(--border)] bg-[var(--card)]">
                  {lines.map((line) => {
                    const inlineInputClass =
                      "h-9 w-full !border-0 !bg-transparent px-0 text-left text-sm font-medium text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent disabled:text-[var(--text-muted)]";
                    const inlineSelectClass =
                      "h-9 w-full appearance-none !border-0 !bg-transparent pl-0 pr-6 text-left text-sm font-medium text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent disabled:text-[var(--text-muted)]";
                    const updateLine = (updates: Partial<LineFormState>) =>
                      setLines((current) =>
                        current.map((item) => (item.id === line.id ? { ...item, ...updates } : item))
                      );

                    return (
                      <div
                        key={line.id}
                        className="group grid items-stretch gap-0"
                        style={{
                          gridTemplateColumns:
                            "minmax(210px,1.4fr) 82px 108px 108px 82px minmax(170px,0.9fr) minmax(170px,0.9fr) 44px",
                        }}
                      >
                        <div className="flex items-center px-3 py-1.5">
                          <Input
                            value={line.description}
                            onChange={(event) => updateLine({ description: event.target.value })}
                            disabled={!canWrite}
                            className={inlineInputClass}
                          />
                        </div>
                        <div className="flex items-center border-l border-[var(--border)] px-3 py-1.5">
                          <Input
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(event) => updateLine({ quantity: event.target.value })}
                            disabled={!canWrite}
                            className={inlineInputClass}
                          />
                        </div>
                        <div className="flex items-center border-l border-[var(--border)] px-3 py-1.5">
                          <Input
                            inputMode="decimal"
                            value={line.unitPrice}
                            onChange={(event) => updateLine({ unitPrice: event.target.value })}
                            disabled={!canWrite}
                            className={inlineInputClass}
                          />
                        </div>
                        <div className="flex items-center border-l border-[var(--border)] px-3 py-1.5">
                          <Input
                            inputMode="decimal"
                            value={line.lineTotal}
                            onChange={(event) => updateLine({ lineTotal: event.target.value })}
                            disabled={!canWrite}
                            className={inlineInputClass}
                          />
                        </div>
                        <div className="flex items-center border-l border-[var(--border)] px-3 py-1.5">
                          <Input
                            inputMode="decimal"
                            value={line.taxAmount}
                            onChange={(event) => updateLine({ taxAmount: event.target.value })}
                            disabled={!canWrite}
                            className={inlineInputClass}
                          />
                        </div>
                        <div className="flex items-center border-l border-[var(--border)] px-3 py-1.5">
                          <select
                            value={line.costCodeId}
                            onChange={(event) => updateLine({ costCodeId: event.target.value })}
                            disabled={!canWrite}
                            className={inlineSelectClass}
                          >
                            <option value="">Select cost code</option>
                            {costCodes.map((costCode) => (
                              <option key={costCode.id} value={costCode.id}>
                                {costCode.code} · {costCode.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center border-l border-[var(--border)] px-3 py-1.5">
                          <select
                            value={line.projectId}
                            onChange={(event) => updateLine({ projectId: event.target.value })}
                            disabled={!canWrite}
                            className={inlineSelectClass}
                          >
                            <option value="">Select project</option>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center justify-center border-l border-[var(--border)] px-0 py-1.5">
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLines((current) => current.filter((item) => item.id !== line.id))
                              }
                              aria-label="Delete line item"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[var(--text-muted)]/80 opacity-0 shadow-none transition hover:bg-transparent hover:text-[var(--error)] group-hover:opacity-100"
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={2.1} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {canWrite ? (
            <div className="mt-2 flex justify-end pr-12">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((current) => [...current, makeEmptyLine()])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>
          ) : null}
        </OperationalPanel>

        <OperationalPanel
          title="Document"
          description="Review the uploaded invoice alongside the details and line items."
        >
          <div className="space-y-4">
            {primaryDocument ? (
              <>
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--text-primary)]">{primaryDocument.file_name}</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {primaryDocument.mime_type || "Unknown type"}
                    {primaryDocument.size_bytes
                      ? ` · ${(primaryDocument.size_bytes / (1024 * 1024)).toFixed(2)} MB`
                      : ""}
                  </p>
                </div>
                {documentsLoading ? (
                  <p className="text-sm text-[var(--text-secondary)]">Loading document preview...</p>
                ) : primaryDocument.signedUrl ? (
                  <>
                    {primaryDocument.mime_type?.includes("pdf") ? (
                      <iframe
                        src={primaryDocument.signedUrl}
                        title={primaryDocument.file_name}
                        className="h-[480px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
                      />
                    ) : primaryDocument.mime_type?.startsWith("image/") ? (
                      <Image
                        src={primaryDocument.signedUrl}
                        alt={primaryDocument.file_name}
                        width={1400}
                        height={1800}
                        unoptimized
                        className="max-h-[480px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] object-contain"
                      />
                    ) : null}
                    <Button asChild variant="secondary" size="sm">
                      <a href={primaryDocument.signedUrl} target="_blank" rel="noreferrer">
                        Download document
                      </a>
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-5 py-5">
                    <p className="text-sm text-[var(--text-secondary)]">Document preview unavailable right now.</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setDocumentsLoading(true);
                        setDocuments(initialDocuments.map((document) => ({ ...document, signedUrl: null })));
                        setDocumentRefreshNonce((current) => current + 1);
                      }}
                    >
                      Retry preview
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <OperationalEmptyState title="No document uploaded yet." />
            )}
          </div>
        </OperationalPanel>

        <OperationalPanel
          title="Invoice Review"
          description="Review this invoice against matched purchase orders, approve valid lines, and post actual costs."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canWrite ? (
                <Button type="button" variant="secondary" size="sm" onClick={openMatchDialog}>
                  Match to Purchase Orders
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
                disabled={!canWrite || isSavingDraftAllocations || readyDraftCandidates.length === 0}
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
              ) : (
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
                        {canWrite ? (
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
                  {canWrite ? (
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
                        : savedDraftAllocation.review_status === "pending") &&
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
                                    {canWrite ? (
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
                                {previewRow.internalCostCode || previewRow.workType || previewRow.costType || previewRow.organizationCostCode ? (
                                  <div className="grid gap-1 sm:grid-cols-2">
                                    <p>
                                      <span className="font-medium text-[var(--text-primary)]">TradesStack classification:</span>{" "}
                                      {previewRow.internalCostCode || "Not set"}
                                    </p>
                                    <p>
                                      <span className="font-medium text-[var(--text-primary)]">Work type / cost type:</span>{" "}
                                      {previewRow.workType || "No work type"} · {previewRow.costType || "No cost type"}
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
                                    {previewRow.accountingResolutionStatus === "classification_review_required"
                                      ? "Classification needs review before the accounting mapping can inherit cleanly from the PO."
                                      : "This line still needs an active company accounting mapping before it can move through approval cleanly."}
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
              disabled={!canWrite || isSavingMatches}
            >
              {isSavingMatches ? "Saving..." : "Save Matches"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
