import type { OrganizationAccountingResolutionStatus } from "@/lib/accounting/types";
import { sanitizeFileName } from "@/lib/quality-assurance/helpers";
import type { Database } from "@/lib/supabase/types";

export const SUPPLIER_INVOICE_DOCUMENTS_BUCKET = "supplier-invoice-documents";

export const SUPPLIER_INVOICE_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const MAX_SUPPLIER_INVOICE_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

export const SUPPLIER_INVOICE_STATUSES = [
  "Captured",
  "Needs Review",
  "Approved",
  "Disputed",
] as const;

export const SUPPLIER_INVOICE_SOURCES = ["upload", "manual"] as const;
export const SUPPLIER_INVOICE_MATCH_STATUSES = [
  "suggested",
  "accepted",
  "rejected",
  "adjusted",
] as const;
export const SUPPLIER_INVOICE_MATCH_BASES = ["manual"] as const;
export const SUPPLIER_INVOICE_MATCH_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "disputed",
] as const;
export const SUPPLIER_INVOICE_APPROVAL_STEP_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "disputed",
] as const;
export const SUPPLIER_INVOICE_ACTIVITY_EVENT_TYPES = [
  "created",
  "edited",
  "status_changed",
  "sent_for_review",
  "approved",
  "disputed",
  "reverted_to_needs_review",
  "match_added",
  "match_updated",
  "match_removed",
  "allocation_approved",
  "allocation_disputed",
  "allocation_approval_changed",
  "actual_costs_posted",
  "actual_cost_posting_skipped",
  "actual_cost_reversed",
  "actual_cost_correction_started",
  "approval_note_added",
] as const;

export type SupplierInvoiceStatus = (typeof SUPPLIER_INVOICE_STATUSES)[number];
export type SupplierInvoiceSource = (typeof SUPPLIER_INVOICE_SOURCES)[number];
export type SupplierInvoiceMatchStatus = (typeof SUPPLIER_INVOICE_MATCH_STATUSES)[number];
export type SupplierInvoiceMatchBasis = (typeof SUPPLIER_INVOICE_MATCH_BASES)[number];
export type SupplierInvoiceMatchApprovalStatus =
  (typeof SUPPLIER_INVOICE_MATCH_APPROVAL_STATUSES)[number];
export type SupplierInvoiceApprovalStepStatus =
  (typeof SUPPLIER_INVOICE_APPROVAL_STEP_STATUSES)[number];
export type SupplierInvoiceActivityEventType =
  (typeof SUPPLIER_INVOICE_ACTIVITY_EVENT_TYPES)[number];
export type SupplierInvoiceDisplayStatus = SupplierInvoiceStatus | "Partially Approved";
export type SupplierInvoiceAllocationPreviewStatus =
  | "Ready"
  | "Needs cost review"
  | "Needs accounting mapping"
  | "No PO line candidate";

export type SupplierInvoiceRow = Database["public"]["Tables"]["supplier_invoices"]["Row"];
export type SupplierInvoiceLineRow = Database["public"]["Tables"]["supplier_invoice_lines"]["Row"];
export type SupplierInvoiceLineAllocationRow =
  Database["public"]["Tables"]["supplier_invoice_line_allocations"]["Row"];
export type SupplierInvoiceAISuggestionRow =
  Database["public"]["Tables"]["supplier_invoice_ai_suggestions"]["Row"];
export type SupplierInvoiceDocumentRow =
  Database["public"]["Tables"]["supplier_invoice_documents"]["Row"];
export type SupplierInvoicePurchaseOrderMatchRow =
  Database["public"]["Tables"]["supplier_invoice_purchase_order_matches"]["Row"];
export type SupplierInvoiceMatchApprovalStepRow =
  Database["public"]["Tables"]["supplier_invoice_match_approval_steps"]["Row"];
export type SupplierInvoiceApprovalStepRow =
  Database["public"]["Tables"]["supplier_invoice_approval_steps"]["Row"];
export type SupplierInvoiceActivityEventRow =
  Database["public"]["Tables"]["supplier_invoice_activity_events"]["Row"];
export type ProjectActualCostEventRow =
  Database["public"]["Tables"]["project_actual_cost_events"]["Row"];
export type SupplierInvoiceLineAllocationPreviewRow = {
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
  accountingResolutionStatus: OrganizationAccountingResolutionStatus | "pending";
  status: SupplierInvoiceAllocationPreviewStatus;
  candidateScore: number;
};

export type SupplierInvoiceApprovalChecks = {
  materials_received: boolean;
  pricing_correct: boolean;
  variation_approved: boolean;
  no_supplier_overcharge: boolean;
  allocation_correct: boolean;
  ready_for_accounting: boolean;
};

export const DEFAULT_SUPPLIER_INVOICE_APPROVAL_CHECKS: SupplierInvoiceApprovalChecks = {
  materials_received: false,
  pricing_correct: false,
  variation_approved: false,
  no_supplier_overcharge: false,
  allocation_correct: false,
  ready_for_accounting: false,
};

export function getSupplierInvoiceStatusClassName(
  status: SupplierInvoiceStatus | SupplierInvoiceDisplayStatus | string
) {
  switch (status) {
    case "Approved":
      return "bg-[#DCFCE7] text-[#15803D]";
    case "Partially Approved":
      return "bg-[#DBEAFE] text-[#1D4ED8]";
    case "Disputed":
      return "bg-[#FEE2E2] text-[#B91C1C]";
    case "Needs Review":
      return "bg-[#FEF3C7] text-[#92400E]";
    default:
      return "bg-[#F1F5F9] text-[#64748B]";
  }
}

export function validateSupplierInvoiceDocument(file: File) {
  const normalizedMimeType = file.type.trim().toLowerCase();
  const hasPdfName = file.name.toLowerCase().endsWith(".pdf");

  if (
    !SUPPLIER_INVOICE_ALLOWED_MIME_TYPES.has(normalizedMimeType) &&
    !(normalizedMimeType === "" && hasPdfName)
  ) {
    throw new Error("Unsupported file type. Please upload a PDF or image file.");
  }

  if (file.size <= 0) {
    throw new Error("Empty files cannot be uploaded.");
  }

  if (file.size > MAX_SUPPLIER_INVOICE_DOCUMENT_SIZE_BYTES) {
    throw new Error("Document is too large. Maximum size is 25 MB.");
  }
}

export function buildSupplierInvoiceDocumentStoragePath(params: {
  organizationId: string;
  supplierInvoiceId: string;
  documentId: string;
  fileName: string;
}) {
  return `${params.organizationId}/supplier-invoices/${params.supplierInvoiceId}/${params.documentId}-${sanitizeFileName(params.fileName)}`;
}

export function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

export function toDayMonthYearLabel(value: string | null | undefined) {
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

export function getSourceLabel(source: SupplierInvoiceSource | string) {
  return source === "upload" ? "Upload" : "Manual";
}

export function getSupplierInvoiceMatchStatusClassName(status: SupplierInvoiceMatchStatus | string) {
  switch (status) {
    case "accepted":
      return "bg-[#DCFCE7] text-[#15803D]";
    case "adjusted":
      return "bg-[#DBEAFE] text-[#1D4ED8]";
    case "rejected":
      return "bg-[#FEE2E2] text-[#B91C1C]";
    default:
      return "bg-[#F1F5F9] text-[#64748B]";
  }
}

export function formatMatchStatusLabel(status: SupplierInvoiceMatchStatus | string) {
  if (status === "accepted") {
    return "Allocated";
  }
  if (status === "adjusted") {
    return "Adjusted Allocation";
  }
  if (status === "rejected") {
    return "Allocation Removed";
  }
  return "Suggested Allocation";
}

export function getSupplierInvoiceMatchApprovalStatusClassName(
  status: SupplierInvoiceMatchApprovalStatus | string
) {
  switch (status) {
    case "approved":
      return "bg-[#DCFCE7] text-[#15803D]";
    case "disputed":
      return "bg-[#FEE2E2] text-[#B91C1C]";
    default:
      return "bg-[#FEF3C7] text-[#92400E]";
  }
}

export function formatSupplierInvoiceMatchApprovalStatusLabel(
  status: SupplierInvoiceMatchApprovalStatus | string
) {
  if (status === "approved") {
    return "Approved";
  }
  if (status === "disputed") {
    return "Disputed";
  }
  return "Pending Approval";
}

export function matchCountsTowardInvoiceTotal(status: SupplierInvoiceMatchStatus | string) {
  return status === "accepted" || status === "adjusted";
}

export function calculateMatchedInvoiceTotal(
  matches: Array<Pick<SupplierInvoicePurchaseOrderMatchRow, "matched_amount" | "match_status">>
) {
  return matches.reduce((sum, match) => {
    if (!matchCountsTowardInvoiceTotal(match.match_status)) {
      return sum;
    }
    return sum + Number(match.matched_amount ?? 0);
  }, 0);
}

export function deriveSupplierInvoiceDisplayStatus(params: {
  storedStatus: SupplierInvoiceStatus | string;
  invoiceTotal: number;
  activeMatchCount: number;
  approvedAllocationTotal: number;
  disputedAllocationTotal: number;
}) {
  if (params.disputedAllocationTotal > 0) {
    return "Disputed" as const;
  }

  if (params.approvedAllocationTotal > 0) {
    if (params.approvedAllocationTotal >= params.invoiceTotal - 0.0001) {
      return "Approved" as const;
    }
    return "Partially Approved" as const;
  }

  if (params.activeMatchCount > 0) {
    return "Needs Review" as const;
  }

  if (params.storedStatus === "Approved" || params.storedStatus === "Disputed") {
    return "Needs Review" as const;
  }

  return (params.storedStatus as SupplierInvoiceStatus) ?? "Captured";
}

export function normalizeSupplierInvoiceApprovalChecks(
  value: unknown
): SupplierInvoiceApprovalChecks {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_SUPPLIER_INVOICE_APPROVAL_CHECKS };
  }

  const record = value as Record<string, unknown>;
  return {
    materials_received: record.materials_received === true,
    pricing_correct: record.pricing_correct === true,
    variation_approved: record.variation_approved === true,
    no_supplier_overcharge: record.no_supplier_overcharge === true,
    allocation_correct: record.allocation_correct === true,
    ready_for_accounting: record.ready_for_accounting === true,
  };
}

export function allSupplierInvoiceApprovalChecksComplete(
  checks: SupplierInvoiceApprovalChecks
) {
  return Object.values(checks).every((value) => value);
}

export function formatSupplierInvoiceActivityEventLabel(
  eventType: SupplierInvoiceActivityEventType | string
) {
  switch (eventType) {
    case "created":
      return "Invoice created";
    case "edited":
      return "Invoice edited";
    case "status_changed":
      return "Status changed";
    case "sent_for_review":
      return "Sent for review";
    case "approved":
      return "Approved";
    case "disputed":
      return "Marked disputed";
    case "reverted_to_needs_review":
      return "Re-review required";
    case "match_added":
      return "PO match added";
    case "match_updated":
      return "PO match updated";
    case "match_removed":
      return "PO match removed";
    case "allocation_approved":
      return "Allocation approved";
    case "allocation_disputed":
      return "Allocation disputed";
    case "allocation_approval_changed":
      return "Allocation review updated";
    case "actual_costs_posted":
      return "Actual costs posted";
    case "actual_cost_posting_skipped":
      return "Actual cost posting skipped";
    case "actual_cost_reversed":
      return "Actual cost reversed";
    case "actual_cost_correction_started":
      return "Actual cost correction started";
    case "approval_note_added":
      return "Approval note added";
    default:
      return "Activity";
  }
}
