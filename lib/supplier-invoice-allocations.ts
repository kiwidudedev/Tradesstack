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
  accountingRouteMappingId?: string | null;
  accountOverrideOrganizationCostCodeId?: string | null;
  description?: string | null;
  supplierName?: string | null;
  taxResolution?: {
    accountingTaxRateId: string | null;
    taxResolutionStatus: "resolved" | "not_applicable" | "unresolved";
  };
}): SupplierInvoiceLineAllocationInsert {
  return {
    organization_id: params.organizationId,
    supplier_invoice_id: params.supplierInvoiceId,
    supplier_invoice_line_id: params.supplierInvoiceLineId,
    allocation_group_id: crypto.randomUUID(),
    purchase_order_id: null,
    purchase_order_line_item_id: null,
    project_id: params.projectId ?? null,
    allocation_sequence: 1,
    allocated_quantity: params.allocatedQuantity ?? null,
    allocated_amount: params.allocatedAmount,
    matched_amount: 0,
    cost_item_id: null,
    source_cost_item_id: null,
    tradesstack_cost_code: null,
    tradesstack_cost_code_label: null,
    financial_routing_confidence: null,
    financial_routing_source: null,
    organization_cost_code_id:
      params.accountOverrideOrganizationCostCodeId ?? params.organizationCostCodeId ?? null,
    accounting_mapping_id: null,
    accounting_route: "supplier_bill_expense",
    accounting_route_mapping_id: params.accountingRouteMappingId ?? null,
    account_override_organization_cost_code_id:
      params.accountOverrideOrganizationCostCodeId ?? null,
    accounting_resolution_status:
      params.accountOverrideOrganizationCostCodeId || params.accountingRouteMappingId
        ? "resolved"
        : "needs_accounting_setup",
    accounting_tax_rate_id: params.taxResolution?.accountingTaxRateId ?? null,
    tax_resolution_status: params.taxResolution?.taxResolutionStatus ?? "unresolved",
    allocation_status: "unmatched",
    match_status: "suggested",
    review_status:
      params.accountOverrideOrganizationCostCodeId || params.accountingRouteMappingId
        ? "resolved"
        : "needs_accounting_mapping",
    review_reason:
      params.accountOverrideOrganizationCostCodeId
        ? "explicit_line_account_override"
        : params.accountingRouteMappingId
          ? "mapped_accounting_route"
          : "missing_accounting_route",
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

  if (reviewStatus === "auto_approved") {
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
