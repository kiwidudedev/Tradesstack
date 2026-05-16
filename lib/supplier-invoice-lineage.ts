import type { AccountingCostItemResolutionInput, OrganizationCostCodeMappingRuleRow, OrganizationCostCodeRow, ResolvedOrganizationAccountingCode } from "@/lib/accounting/types";
import { resolveOrganizationAccountingCode } from "@/lib/accounting/organization-cost-code-resolver";
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
  workType: string | null;
  costType: string | null;
  internalCostCode: string | null;
  classificationNeedsReview: boolean;
  classificationConfidence: number | null;
  classificationSource: string | null;
}

export interface SupplierInvoiceOrgConsistencyContext {
  invoiceOrganizationId?: string | null;
  invoiceLineOrganizationId?: string | null;
  purchaseOrderLineOrganizationId?: string | null;
  projectOrganizationId?: string | null;
  costItemOrganizationId?: string | null;
  sourceCostItemOrganizationId?: string | null;
}

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function preferClassificationSource(
  costItem: CostItemRow | null,
  sourceCostItem: CostItemRow | null
) {
  return normalizeText(costItem?.classification_source) ?? normalizeText(sourceCostItem?.classification_source);
}

function deriveClassificationNeedsReview(
  costItem: CostItemRow | null,
  sourceCostItem: CostItemRow | null
) {
  if (costItem?.needs_review === true) {
    return true;
  }

  return sourceCostItem?.needs_review === true;
}

function firstPresentText(
  primary: string | null | undefined,
  fallback: string | null | undefined
) {
  return normalizeText(primary) ?? normalizeText(fallback);
}

function choosePreferredCostItem(
  costItem: CostItemRow | null,
  sourceCostItem: CostItemRow | null
) {
  if (costItem && (normalizeText(costItem.work_type) || normalizeText(costItem.cost_type) || normalizeText(costItem.cost_code))) {
    return costItem;
  }

  return sourceCostItem ?? costItem;
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
    workType: firstPresentText(preferredClassification?.work_type, sourceCostItem?.work_type),
    costType: firstPresentText(preferredClassification?.cost_type, sourceCostItem?.cost_type),
    internalCostCode: firstPresentText(preferredClassification?.cost_code, sourceCostItem?.cost_code),
    classificationNeedsReview: deriveClassificationNeedsReview(costItem, sourceCostItem),
    classificationConfidence: costItem?.classification_confidence ?? sourceCostItem?.classification_confidence ?? null,
    classificationSource: preferClassificationSource(costItem, sourceCostItem),
  };
}

export function buildAccountingResolutionInput(params: {
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
    costItemId: params.costItemId ?? `supplier-invoice-line:${params.projectId}:${params.title}`,
    projectId: params.projectId,
    projectName: null,
    sourceDocumentKind: "supplier_invoice",
    title: params.title,
    description: params.description,
    intelligenceCostCode: params.lineage.internalCostCode,
    workType: params.lineage.workType,
    costType: params.lineage.costType,
    classificationConfidence: params.lineage.classificationConfidence,
    classificationNeedsReview: params.lineage.classificationNeedsReview,
    classificationSource: params.lineage.classificationSource,
    updatedAt: null,
  };
}

export function resolveInheritedAccountingCode(params: {
  costCodes: OrganizationCostCodeRow[];
  mappingRules: OrganizationCostCodeMappingRuleRow[];
  input: AccountingCostItemResolutionInput | null;
}): ResolvedOrganizationAccountingCode | null {
  if (!params.input) {
    return null;
  }

  return resolveOrganizationAccountingCode({
    costCodes: params.costCodes,
    mappingRules: params.mappingRules,
    input: params.input,
  });
}

export function deriveAllocationClassificationStatus(lineage: SupplierInvoiceResolvedLineage) {
  if (lineage.classificationNeedsReview) {
    return "needs_review" as const;
  }

  if (lineage.costItemId || lineage.sourceCostItemId) {
    return "inherited" as const;
  }

  return "pending" as const;
}

export function hasCompleteInheritedClassification(lineage: SupplierInvoiceResolvedLineage) {
  return Boolean(lineage.workType && lineage.costType && lineage.internalCostCode);
}

export function deriveAllocationAccountingResolutionStatus(
  resolution: ResolvedOrganizationAccountingCode | null
) {
  return resolution?.status ?? "pending";
}

export function deriveAllocationReviewStatus(params: {
  lineage: SupplierInvoiceResolvedLineage;
  accountingResolution: ResolvedOrganizationAccountingCode | null;
}) {
  if (!hasCompleteInheritedClassification(params.lineage) || params.lineage.classificationNeedsReview) {
    return "needs_cost_review" as const;
  }

  if (!params.accountingResolution?.organizationCostCodeId || params.accountingResolution.needsAccountingReview) {
    return "needs_accounting_review" as const;
  }

  return "pending" as const;
}

export function buildSupplierInvoiceLineAllocationPayload(params: {
  organizationId: string;
  supplierInvoiceId: string;
  supplierInvoiceLineId: string;
  allocatedAmount?: number;
  allocatedQuantity?: number | null;
  lineage: SupplierInvoiceResolvedLineage;
  accountingResolution: ResolvedOrganizationAccountingCode | null;
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
    purchase_order_id: params.lineage.purchaseOrderId,
    purchase_order_line_item_id: params.lineage.purchaseOrderLineItemId,
    project_id: params.lineage.projectId,
    allocation_sequence: params.allocationSequence ?? 1,
    allocated_quantity: params.allocatedQuantity ?? null,
    allocated_amount: allocatedAmount,
    matched_amount: allocatedAmount,
    cost_item_id: params.lineage.costItemId,
    source_cost_item_id: params.lineage.sourceCostItemId,
    work_type: params.lineage.workType,
    cost_type: params.lineage.costType,
    internal_cost_code: params.lineage.internalCostCode,
    classification_status: deriveAllocationClassificationStatus(params.lineage),
    organization_cost_code_id: params.accountingResolution?.organizationCostCodeId ?? null,
    accounting_resolution_status: deriveAllocationAccountingResolutionStatus(params.accountingResolution),
    allocation_status: params.lineage.purchaseOrderLineItemId ? "matched" : "unmatched",
    match_status: params.lineage.purchaseOrderLineItemId ? "accepted" : "suggested",
    review_status: deriveAllocationReviewStatus({
      lineage: params.lineage,
      accountingResolution: params.accountingResolution,
    }),
    approval_status: "pending",
    allocation_source: "manual",
  };
}
