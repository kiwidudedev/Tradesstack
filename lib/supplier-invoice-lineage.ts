import type {
  AccountingCostItemResolutionInput,
  OrganizationCostCodeRow,
  OrganizationTradesstackAccountingMappingRow,
  ResolvedOrganizationAccountingCode,
} from "@/lib/accounting/types";
import type { FinancialRoutingReviewStatus } from "@/lib/tradesstack-financial-routing";
import { resolveOrganizationAccountingCode } from "@/lib/accounting/organization-cost-code-resolver";
import {
  isTradesstackFinancialRoutingCode,
} from "@/lib/tradesstack-financial-routing";
import type { Database } from "@/lib/supabase/types";

export type SupplierInvoiceLineRow =
  Database["public"]["Tables"]["supplier_invoice_lines"]["Row"];
export type SupplierInvoiceLineAllocationInsert =
  Database["public"]["Tables"]["supplier_invoice_line_allocations"]["Insert"];
export type SupplierInvoiceLineAllocationRow =
  Database["public"]["Tables"]["supplier_invoice_line_allocations"]["Row"];
export type CostItemRow = Database["public"]["Tables"]["cost_items"]["Row"];
export type PurchaseOrderLineItemRow =
  Database["public"]["Tables"]["project_purchase_order_line_items"]["Row"];

export interface SupplierInvoiceResolvedLineage {
  projectId: string | null;
  purchaseOrderLineItemId: string | null;
  purchaseOrderId: string | null;
  costItemId: string | null;
  sourceCostItemId: string | null;
  tradesstackCostCode: string | null;
  tradesstackCostCodeLabel: string | null;
  financialRoutingConfidence: number | null;
  financialRoutingSource: string | null;
  reviewStatus: FinancialRoutingReviewStatus | null;
  reviewReason: string | null;
}

export interface SupplierInvoiceOrgConsistencyContext {
  invoiceOrganizationId?: string | null;
  invoiceLineOrganizationId?: string | null;
  purchaseOrderLineOrganizationId?: string | null;
  projectOrganizationId?: string | null;
  costItemOrganizationId?: string | null;
  sourceCostItemOrganizationId?: string | null;
}

function normalizeText(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstPresentText(
  ...values: Array<string | number | null | undefined>
) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function choosePreferredCostItem(
  costItem: CostItemRow | null,
  sourceCostItem: CostItemRow | null
) {
  // An explicit source Cost Item represents the committed financial identity.
  // Otherwise use the PO Cost Item. Arbitrary parent inheritance is intentionally
  // not part of Financial Routing.
  if (
    sourceCostItem &&
    (normalizeText(sourceCostItem.tradesstack_cost_code) ||
      normalizeText(sourceCostItem.tradesstack_cost_code_label))
  ) {
    return sourceCostItem;
  }

  return costItem ?? sourceCostItem;
}

export function validateSupplierInvoiceOrgConsistency(
  organizationId: string,
  context: SupplierInvoiceOrgConsistencyContext
) {
  const scopedValues = [
    context.invoiceOrganizationId,
    context.invoiceLineOrganizationId,
    context.purchaseOrderLineOrganizationId,
    context.projectOrganizationId,
    context.costItemOrganizationId,
    context.sourceCostItemOrganizationId,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const mismatchedOrganizationId = scopedValues.find((value) => value !== organizationId) ?? null;
  if (mismatchedOrganizationId) {
    throw new Error("Supplier invoice lineage org mismatch detected.");
  }
}

export function resolvePurchaseOrderLineLineage(params: {
  purchaseOrderLine: PurchaseOrderLineItemRow | null;
  costItem: CostItemRow | null;
  sourceCostItem: CostItemRow | null;
}): SupplierInvoiceResolvedLineage {
  const { purchaseOrderLine, costItem, sourceCostItem } = params;
  const preferredClassification = choosePreferredCostItem(costItem, sourceCostItem);

  return {
    projectId: purchaseOrderLine?.project_id ?? costItem?.project_id ?? sourceCostItem?.project_id ?? null,
    purchaseOrderLineItemId: purchaseOrderLine?.id ?? null,
    purchaseOrderId: purchaseOrderLine?.purchase_order_id ?? null,
    costItemId: purchaseOrderLine?.cost_item_id ?? costItem?.id ?? null,
    sourceCostItemId: purchaseOrderLine?.source_cost_item_id ?? sourceCostItem?.id ?? null,
    tradesstackCostCode:
      firstPresentText(
        preferredClassification?.tradesstack_cost_code,
        costItem?.tradesstack_cost_code
      ),
    tradesstackCostCodeLabel:
      firstPresentText(
        preferredClassification?.tradesstack_cost_code_label,
        costItem?.tradesstack_cost_code_label
      ),
    financialRoutingConfidence:
      preferredClassification?.financial_routing_confidence ?? costItem?.financial_routing_confidence ?? null,
    financialRoutingSource:
      normalizeText(preferredClassification?.financial_routing_source) ??
      normalizeText(costItem?.financial_routing_source),
    reviewStatus: (normalizeText(preferredClassification?.review_status) ??
      normalizeText(costItem?.review_status)) as FinancialRoutingReviewStatus | null,
    reviewReason: normalizeText(preferredClassification?.review_reason) ?? normalizeText(costItem?.review_reason),
  };
}

export function buildAccountingResolutionInput(params: {
  organizationId: string;
  provider: string;
  costItemId: string | null;
  projectId: string | null;
  title: string;
  description: string;
  lineage: SupplierInvoiceResolvedLineage;
}): AccountingCostItemResolutionInput | null {
  if (!params.projectId) {
    return null;
  }

  return {
    organizationId: params.organizationId,
    provider: params.provider,
    tradesstackCostCode: isTradesstackFinancialRoutingCode(params.lineage.tradesstackCostCode)
      ? params.lineage.tradesstackCostCode
      : null,
    costItemId: params.costItemId ?? `supplier-invoice-line:${params.projectId}:${params.title}`,
    projectId: params.projectId,
    title: params.title,
    description: params.description,
    routingConfidence: params.lineage.financialRoutingConfidence,
    routingSource: params.lineage.financialRoutingSource,
    reviewStatus: params.lineage.reviewStatus ?? "needs_routing_review",
    updatedAt: null,
  };
}

export function resolveInheritedAccountingCode(params: {
  costCodes: OrganizationCostCodeRow[];
  mappings: OrganizationTradesstackAccountingMappingRow[];
  input: AccountingCostItemResolutionInput | null;
}): ResolvedOrganizationAccountingCode | null {
  if (!params.input) {
    return null;
  }

  return resolveOrganizationAccountingCode({
    costCodes: params.costCodes,
    mappings: params.mappings,
    input: params.input,
  });
}

export function hasCompleteInheritedClassification(lineage: SupplierInvoiceResolvedLineage) {
  return Boolean(lineage.tradesstackCostCode);
}

export function deriveAllocationAccountingResolutionStatus(
  resolution: ResolvedOrganizationAccountingCode | null
) {
  return resolution?.status ?? "pending";
}

export function deriveAllocationReviewStatus(params: {
  lineage: SupplierInvoiceResolvedLineage;
  accountingResolution: ResolvedOrganizationAccountingCode | null;
  taxResolution?: {
    accountingTaxRateId: string | null;
    taxResolutionStatus: "resolved" | "not_applicable" | "unresolved";
  };
}) {
  if (!params.accountingResolution?.organizationCostCodeId) {
    return "needs_accounting_mapping" as const;
  }

  return "auto_approved" as const;
}

export function buildSupplierInvoiceLineAllocationPayload(params: {
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
  const allocatedAmount = params.allocatedAmount ?? 0;
  if (params.orgConsistency) {
    validateSupplierInvoiceOrgConsistency(params.organizationId, params.orgConsistency);
  }

  return {
    organization_id: params.organizationId,
    supplier_invoice_id: params.supplierInvoiceId,
    supplier_invoice_line_id: params.supplierInvoiceLineId,
    allocation_group_id: crypto.randomUUID(),
    purchase_order_id: params.lineage.purchaseOrderId,
    purchase_order_line_item_id: params.lineage.purchaseOrderLineItemId,
    project_id: params.lineage.projectId,
    allocation_sequence: params.allocationSequence ?? 1,
    allocated_quantity: params.allocatedQuantity ?? null,
    allocated_amount: allocatedAmount,
    matched_amount: allocatedAmount,
    cost_item_id: params.lineage.costItemId,
    source_cost_item_id: params.lineage.sourceCostItemId,
    tradesstack_cost_code: params.lineage.tradesstackCostCode
      ? Number(params.lineage.tradesstackCostCode)
      : null,
    tradesstack_cost_code_label: params.lineage.tradesstackCostCodeLabel,
    financial_routing_confidence: params.lineage.financialRoutingConfidence,
    financial_routing_source: params.lineage.financialRoutingSource,
    organization_cost_code_id: params.accountingResolution?.organizationCostCodeId ?? null,
    accounting_resolution_status: deriveAllocationAccountingResolutionStatus(params.accountingResolution),
    accounting_mapping_id: params.accountingResolution?.accountingMappingId ?? null,
    accounting_route: params.accountingResolution?.accountingRoute ?? null,
    accounting_route_mapping_id: params.accountingResolution?.accountingRouteMappingId ?? null,
    accounting_tax_rate_id: params.taxResolution?.accountingTaxRateId ?? null,
    tax_resolution_status: params.taxResolution?.taxResolutionStatus ?? "unresolved",
    allocation_status: params.lineage.purchaseOrderLineItemId ? "matched" : "unmatched",
    match_status: params.lineage.purchaseOrderLineItemId ? "accepted" : "suggested",
    review_status: deriveAllocationReviewStatus({
      lineage: params.lineage,
      accountingResolution: params.accountingResolution,
    }),
    review_reason: params.lineage.reviewReason ?? params.accountingResolution?.reason ?? null,
    approval_status: "pending",
    allocation_source: "manual",
  };
}
