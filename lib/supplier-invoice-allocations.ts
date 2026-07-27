import type { Database } from "@/lib/supabase/types";
import type { ResolvedOrganizationAccountingCode } from "@/lib/accounting/types";
import type {
  SupplierInvoiceOrgConsistencyContext,
  SupplierInvoiceResolvedLineage,
} from "@/lib/supplier-invoice-lineage";
import {
  buildSupplierInvoiceLineAllocationPayload,
  deriveAllocationReviewStatus,
} from "@/lib/supplier-invoice-lineage";
import { routeFinancialLineItem } from "@/lib/tradesstack-financial-routing";

export type SupplierInvoiceLineAllocationRow =
  Database["public"]["Tables"]["supplier_invoice_line_allocations"]["Row"];
export type SupplierInvoiceLineAllocationInsert =
  Database["public"]["Tables"]["supplier_invoice_line_allocations"]["Insert"];

export const SUPPLIER_INVOICE_LINE_ALLOCATION_STATUSES = [
  "unmatched",
  "suggested",
  "matched",
  "partially_matched",
  "split",
  "disputed",
] as const;

export const SUPPLIER_INVOICE_LINE_ALLOCATION_REVIEW_STATUSES = [
  "auto_approved",
  "resolved",
  "needs_routing_review",
  "needs_accounting_mapping",
  "high_value_review",
  "disputed",
] as const;

export const SUPPLIER_INVOICE_LINE_ALLOCATION_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "disputed",
] as const;

export function createSupplierInvoiceLineAllocationDraft(params: {
  organizationId: string;
  supplierInvoiceId: string;
  supplierInvoiceLineId: string;
  allocatedAmount?: number;
  allocatedQuantity?: number | null;
  lineage: SupplierInvoiceResolvedLineage;
  accountingResolution: ResolvedOrganizationAccountingCode | null;
  taxResolution?: {
    accountingTaxRateId: string | null;
    taxResolutionStatus: "resolved" | "not_applicable" | "unresolved";
  };
  allocationSequence?: number;
  orgConsistency?: SupplierInvoiceOrgConsistencyContext;
}): SupplierInvoiceLineAllocationInsert {
  return buildSupplierInvoiceLineAllocationPayload(params);
}

export function createUnmatchedSupplierInvoiceLineAllocationDraft(params: {
  organizationId: string;
  supplierInvoiceId: string;
  supplierInvoiceLineId: string;
  allocatedAmount: number;
  allocatedQuantity?: number | null;
  projectId?: string | null;
  organizationCostCodeId?: string | null;
  description?: string | null;
  supplierName?: string | null;
  taxResolution?: {
    accountingTaxRateId: string | null;
    taxResolutionStatus: "resolved" | "not_applicable" | "unresolved";
  };
}): SupplierInvoiceLineAllocationInsert {
  const routing = routeFinancialLineItem({
    sourceModule: "supplier_invoice",
    documentType: "supplier_invoice",
    transactionType: "supplier_invoice",
    objectType: "supplier_invoice_line_allocation",
    description: params.description ?? null,
    supplierName: params.supplierName ?? null,
    amount: params.allocatedAmount,
  });
  const reviewStatus =
    routing.reviewStatus === "auto_approved" ? "needs_accounting_mapping" : routing.reviewStatus;

  return {
    organization_id: params.organizationId,
    supplier_invoice_id: params.supplierInvoiceId,
    supplier_invoice_line_id: params.supplierInvoiceLineId,
    purchase_order_id: null,
    purchase_order_line_item_id: null,
    project_id: params.projectId ?? null,
    allocation_sequence: 1,
    allocated_quantity: params.allocatedQuantity ?? null,
    allocated_amount: params.allocatedAmount,
    matched_amount: 0,
    cost_item_id: null,
    source_cost_item_id: null,
    tradesstack_cost_code: routing.tradesstackCostCode,
    tradesstack_cost_code_label: routing.tradesstackCostCodeLabel,
    work_type: null,
    cost_type: null,
    internal_cost_code: null,
    classification_status:
      reviewStatus === "needs_routing_review" || reviewStatus === "high_value_review"
        ? "needs_review"
        : "pending",
    organization_cost_code_id: params.organizationCostCodeId ?? null,
    accounting_mapping_id: null,
    accounting_resolution_status: "pending",
    accounting_tax_rate_id: params.taxResolution?.accountingTaxRateId ?? null,
    tax_resolution_status: params.taxResolution?.taxResolutionStatus ?? "unresolved",
    allocation_status: "unmatched",
    match_status: "suggested",
    review_status: reviewStatus,
    review_reason:
      reviewStatus === "needs_accounting_mapping"
        ? "missing_accounting_mapping"
        : "unmatched_supplier_invoice_line",
    approval_status: "pending",
    allocation_source: "manual",
  };
}

export function canUserSaveDraftAllocation(params: {
  canWrite: boolean;
  canReview: boolean;
  lineage: SupplierInvoiceResolvedLineage;
  accountingResolution: ResolvedOrganizationAccountingCode | null;
}) {
  if (!params.canWrite) {
    return false;
  }

  const reviewStatus = deriveAllocationReviewStatus({
    lineage: params.lineage,
    accountingResolution: params.accountingResolution,
  });

  if (reviewStatus === "auto_approved" || reviewStatus === "resolved") {
    return true;
  }

  return params.canReview;
}

export function summarizeSupplierInvoiceAllocationAmounts(
  allocations: Array<
    Pick<
      SupplierInvoiceLineAllocationRow,
      "allocated_amount" | "approval_status" | "allocation_status"
    >
  >
) {
  return allocations.reduce(
    (summary, allocation) => {
      const amount = Number(allocation.allocated_amount ?? 0);
      summary.totalAllocated += amount;

      if (allocation.approval_status === "approved") {
        summary.totalApproved += amount;
      }

      if (allocation.allocation_status === "unmatched") {
        summary.totalUnmatched += amount;
      }

      return summary;
    },
    {
      totalAllocated: 0,
      totalApproved: 0,
      totalUnmatched: 0,
    }
  );
}
