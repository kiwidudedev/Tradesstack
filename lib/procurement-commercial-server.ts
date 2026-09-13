import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLineCommercialVariances,
  calculateSupplierInvoiceLineTax,
  calculatePurchaseOrderLineInvoicingProgress,
  derivePurchaseOrderInvoicingState,
  isCommercialSnapshotHistoricalForInvoice,
  normalizeCommercialLineDescription,
  normalizeSupplierInvoiceNumber,
  sortPurchaseOrderProgressLines,
  type CommercialVariance,
  type PurchaseOrderInvoicingState,
  type PurchaseOrderLineInvoicingProgress,
} from "@/lib/procurement-commercial";
import type { Database, Json } from "@/lib/supabase/types";

type ServerSupabase = SupabaseClient<Database>;
// New migration tables are intentionally accessed through this narrow escape hatch
// until the next generated Supabase type refresh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = SupabaseClient<any>;

type InvoiceRow = {
  id: string;
  organization_id: string;
  supplier_id: string | null;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal: number;
  tax_total: number;
  total: number;
  status: string;
};

type InvoiceLineRow = {
  id: string;
  supplier_invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_amount: number;
  sort_order: number;
};

type AllocationRow = {
  id: string;
  supplier_invoice_id: string;
  supplier_invoice_line_id: string;
  purchase_order_id: string | null;
  purchase_order_line_item_id: string | null;
  project_id: string | null;
  allocated_quantity: number | null;
  allocated_amount: number;
  allocation_status: string;
  approval_status: string;
  accounting_mapping_id: string | null;
  accounting_route: string | null;
  accounting_route_mapping_id: string | null;
  organization_cost_code_id: string | null;
  account_override_organization_cost_code_id: string | null;
  tradesstack_cost_code: number | null;
  accounting_tax_rate_id: string | null;
  tax_resolution_status: string;
  approval_notes: string;
};

type AccountingTaxRateRow = {
  id: string;
  is_active: boolean;
  effective_rate: number | null;
};

type PurchaseOrderRow = {
  id: string;
  organization_id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  supplier_id: string | null;
  supplier_name_snapshot: string;
  status: string;
  total_purchase_order_price: number;
};

type PurchaseOrderLineRow = {
  id: string;
  organization_id: string;
  purchase_order_id: string;
  description: string;
  quantity: number;
  rate: number;
  total: number;
  sort_order: number;
};

type CommercialApprovalRow = {
  id: string;
  supplier_invoice_id: string;
  status: "approved" | "rejected" | "invalidated";
  finance_version_hash: string;
  accepted_variances: Json;
  no_po_reason: string | null;
  no_po_explanation: string | null;
  approval_note: string;
  reviewed_by: string;
  reviewed_at: string;
  invalidated_at: string | null;
  invalidation_reason: string | null;
};

type CommercialSnapshotRow = {
  id: string;
  commercial_approval_id: string;
  supplier_invoice_id: string;
  supplier_invoice_line_id: string | null;
  allocation_id: string | null;
  purchase_order_id: string | null;
  purchase_order_line_item_id: string | null;
  quantity: number;
  amount: number;
  tax_amount: number;
  approval_reviewed_at: string;
};

type CommitmentReleaseRow = {
  id: string;
  purchase_order_id: string;
  released_amount: number;
  reason: string;
  note: string;
  released_by: string;
  released_at: string;
};

type CommitmentReleaseLineRow = {
  purchase_order_line_item_id: string;
  released_amount: number;
};

type ActualCostRow = {
  purchase_order_id: string | null;
  amount: number;
  event_status: string;
  event_type: string;
};

export type CommercialBlocker = {
  code:
    | "missing_supplier"
    | "missing_invoice_number"
    | "missing_invoice_date"
    | "missing_lines"
    | "allocation_count"
    | "allocation_not_approved"
    | "unallocated_amount"
    | "missing_accounting_mapping"
    | "missing_tax_treatment"
    | "supplier_mismatch"
    | "duplicate_invoice"
    | "blocking_variance"
    | "warning_not_accepted"
    | "missing_no_po_reason"
    | "totals_do_not_reconcile";
  message: string;
  invoiceLineId?: string;
  allocationId?: string;
};

export type AcceptedCommercialVarianceInput = {
  key: string;
  type: string;
  purchaseOrderLineItemId: string | null;
  expectedValue: number | string | null;
  actualValue: number | string | null;
  varianceAmount: number | null;
  note: string;
};

export type SupplierInvoiceCommercialComparison = {
  invoiceId: string;
  financeVersionHash: string;
  derivedStatus:
    | "not_ready"
    | "ready_for_review"
    | "approved"
    | "rejected"
    | "invalidated";
  activeApproval: CommercialApprovalRow | null;
  latestDecision: CommercialApprovalRow | null;
  purchaseOrderProgress: Array<{
    purchaseOrderId: string;
    purchaseOrderNumber: string;
    purchaseOrderTitle: string;
    currentValue: number;
    previouslyApprovedValue: number;
    currentInvoiceValue: number;
    projectedRemainingValue: number;
    overInvoicedValue: number;
    state: PurchaseOrderInvoicingState;
    lines: PurchaseOrderLineInvoicingProgress[];
  }>;
  variances: CommercialVariance[];
  blockers: CommercialBlocker[];
  warnings: CommercialVariance[];
  information: CommercialVariance[];
  duplicateInvoiceIds: string[];
  likelyDuplicateInvoiceIds: string[];
  hasPurchaseOrders: boolean;
  allocatedAmount: number;
  approvedAllocatedAmount: number;
};

export type PurchaseOrderCommercialProgress = {
  purchaseOrderId: string;
  currentPurchaseOrderValue: number;
  approvedInvoicedValue: number;
  releasedCommitmentValue: number;
  remainingCommitment: number;
  overInvoicedValue: number;
  postedActualCost: number;
  unpostedApprovedInvoiceValue: number;
  invoicingState: PurchaseOrderInvoicingState;
  lineProgress: PurchaseOrderLineInvoicingProgress[];
  releases: CommitmentReleaseRow[];
};

function untyped(supabase: ServerSupabase) {
  return supabase as unknown as UntypedSupabase;
}

function asNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function requireRows<T>(
  promise: PromiseLike<{ data: unknown; error: { message: string } | null }>
) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as T[];
}

async function loadActiveSnapshots(params: {
  supabase: ServerSupabase;
  organizationId: string;
  purchaseOrderLineIds?: string[];
  purchaseOrderIds?: string[];
}) {
  const db = untyped(params.supabase);
  const approvals = await requireRows<CommercialApprovalRow>(
    db
      .from("supplier_invoice_commercial_approvals")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("status", "approved")
  );
  if (approvals.length === 0) {
    return [] as CommercialSnapshotRow[];
  }

  let query = db
    .from("supplier_invoice_commercial_line_snapshots")
    .select("*")
    .eq("organization_id", params.organizationId)
    .in("commercial_approval_id", approvals.map((approval) => approval.id));

  if (params.purchaseOrderLineIds?.length) {
    query = query.in("purchase_order_line_item_id", params.purchaseOrderLineIds);
  } else if (params.purchaseOrderIds?.length) {
    query = query.in("purchase_order_id", params.purchaseOrderIds);
  }

  const snapshots = await requireRows<
    Omit<CommercialSnapshotRow, "approval_reviewed_at">
  >(query);
  const reviewedAtByApprovalId = new Map(
    approvals.map((approval) => [approval.id, approval.reviewed_at])
  );
  return snapshots.map((snapshot) => ({
    ...snapshot,
    approval_reviewed_at:
      reviewedAtByApprovalId.get(snapshot.commercial_approval_id) ?? "",
  }));
}

function acceptedVarianceKeySet(values: AcceptedCommercialVarianceInput[]) {
  return new Set(
    values
      .filter((value) => value.note.trim().length > 0)
      .map((value) => value.key)
  );
}

function readAcceptedVarianceInputs(value: Json): AcceptedCommercialVarianceInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, Json | undefined>;
    if (
      typeof record.key !== "string"
      || typeof record.type !== "string"
      || typeof record.note !== "string"
    ) {
      return [];
    }

    return [{
      key: record.key,
      type: record.type,
      purchaseOrderLineItemId:
        typeof record.purchaseOrderLineItemId === "string"
          ? record.purchaseOrderLineItemId
          : null,
      expectedValue:
        typeof record.expectedValue === "string"
        || typeof record.expectedValue === "number"
          ? record.expectedValue
          : null,
      actualValue:
        typeof record.actualValue === "string"
        || typeof record.actualValue === "number"
          ? record.actualValue
          : null,
      varianceAmount:
        typeof record.varianceAmount === "number"
          ? record.varianceAmount
          : null,
      note: record.note,
    }];
  });
}

export function acceptedCommercialVarianceKeysFromApproval(value: Json) {
  return acceptedVarianceKeySet(readAcceptedVarianceInputs(value));
}

function withVarianceContext(params: {
  variance: CommercialVariance;
  invoiceLineId: string;
  allocationId: string;
}) {
  return {
    ...params.variance,
    invoiceLineId: params.invoiceLineId,
    allocationId: params.allocationId,
  };
}

export async function getSupplierInvoiceCommercialComparison(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  acceptedVariances?: AcceptedCommercialVarianceInput[];
  noPoReason?: string | null;
  noPoExplanation?: string | null;
}): Promise<SupplierInvoiceCommercialComparison> {
  const db = untyped(params.supabase);
  const [
    invoices,
    lines,
    allocations,
    decisions,
    decisionSnapshots,
    financeHashResult,
  ] = await Promise.all([
    requireRows<InvoiceRow>(
      db
        .from("supplier_invoices")
        .select("id, organization_id, supplier_id, invoice_number, invoice_date, due_date, currency, subtotal, tax_total, total, status")
        .eq("organization_id", params.organizationId)
        .eq("id", params.supplierInvoiceId)
    ),
    requireRows<InvoiceLineRow>(
      db
        .from("supplier_invoice_lines")
        .select("id, supplier_invoice_id, description, quantity, unit_price, line_total, tax_amount, sort_order")
        .eq("organization_id", params.organizationId)
        .eq("supplier_invoice_id", params.supplierInvoiceId)
        .order("sort_order", { ascending: true })
    ),
    requireRows<AllocationRow>(
      db
        .from("supplier_invoice_line_allocations")
        .select("id, supplier_invoice_id, supplier_invoice_line_id, purchase_order_id, purchase_order_line_item_id, project_id, allocated_quantity, allocated_amount, allocation_status, approval_status, accounting_mapping_id, accounting_route, accounting_route_mapping_id, organization_cost_code_id, account_override_organization_cost_code_id, tradesstack_cost_code, accounting_tax_rate_id, tax_resolution_status, approval_notes")
        .eq("organization_id", params.organizationId)
        .eq("supplier_invoice_id", params.supplierInvoiceId)
    ),
    requireRows<CommercialApprovalRow>(
      db
        .from("supplier_invoice_commercial_approvals")
        .select("*")
        .eq("organization_id", params.organizationId)
        .eq("supplier_invoice_id", params.supplierInvoiceId)
        .order("reviewed_at", { ascending: false })
    ),
    requireRows<Pick<CommercialSnapshotRow, "commercial_approval_id" | "supplier_invoice_line_id">>(
      db
        .from("supplier_invoice_commercial_line_snapshots")
        .select("commercial_approval_id, supplier_invoice_line_id")
        .eq("organization_id", params.organizationId)
        .eq("supplier_invoice_id", params.supplierInvoiceId)
    ),
    db.rpc("supplier_invoice_finance_version_hash", {
      p_invoice_id: params.supplierInvoiceId,
    }),
  ]);

  const invoice = invoices[0];
  if (!invoice) {
    throw new Error("Supplier invoice not found.");
  }
  if (financeHashResult.error || typeof financeHashResult.data !== "string") {
    throw new Error(financeHashResult.error?.message ?? "Unable to calculate the invoice finance version.");
  }
  const expectedLineIds = new Set(lines.map((line) => line.id));
  const currentActiveApproval = decisions.find((decision) => {
    if (decision.status !== "approved" || decision.finance_version_hash !== financeHashResult.data) {
      return false;
    }
    const snapshotLineIds = decisionSnapshots
      .filter((snapshot) => snapshot.commercial_approval_id === decision.id)
      .map((snapshot) => snapshot.supplier_invoice_line_id)
      .filter((lineId): lineId is string => Boolean(lineId));
    return snapshotLineIds.length === expectedLineIds.size
      && new Set(snapshotLineIds).size === expectedLineIds.size
      && snapshotLineIds.every((lineId) => expectedLineIds.has(lineId));
  }) ?? null;

  const purchaseOrderIds = Array.from(
    new Set(
      allocations
        .map((allocation) => allocation.purchase_order_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const purchaseOrderLineIds = Array.from(
    new Set(
      allocations
        .map((allocation) => allocation.purchase_order_line_item_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [
    purchaseOrders,
    purchaseOrderLines,
    historicalSnapshots,
    mappings,
    routeMappings,
    taxRates,
    releaseLines,
    duplicateCandidates,
  ] = await Promise.all([
    purchaseOrderIds.length
      ? requireRows<PurchaseOrderRow>(
          db
            .from("project_purchase_orders")
            .select("id, organization_id, purchase_order_number, purchase_order_title, supplier_id, supplier_name_snapshot, status, total_purchase_order_price")
            .eq("organization_id", params.organizationId)
            .in("id", purchaseOrderIds)
        )
      : Promise.resolve([]),
    purchaseOrderLineIds.length
      ? requireRows<PurchaseOrderLineRow>(
          db
            .from("project_purchase_order_line_items")
            .select("id, organization_id, purchase_order_id, description, quantity, rate, total, sort_order")
            .eq("organization_id", params.organizationId)
            .in("id", purchaseOrderLineIds)
        )
      : Promise.resolve([]),
    loadActiveSnapshots({
      supabase: params.supabase,
      organizationId: params.organizationId,
      purchaseOrderLineIds,
    }),
    requireRows<{
      id: string;
      is_active: boolean;
      tradesstack_cost_code: number;
      project_id: string | null;
    }>(
      db
        .from("organization_tradesstack_accounting_mappings")
        .select("id, is_active, tradesstack_cost_code, project_id")
        .eq("organization_id", params.organizationId)
    ),
    requireRows<{
      id: string;
      is_active: boolean;
      accounting_route: string;
      organization_cost_code_id: string;
      project_id: string | null;
    }>(
      db
        .from("organization_accounting_route_mappings")
        .select("id, is_active, accounting_route, organization_cost_code_id, project_id")
        .eq("organization_id", params.organizationId)
        .eq("accounting_route", "supplier_bill_expense")
    ),
    requireRows<AccountingTaxRateRow>(
      db
        .from("organization_accounting_tax_rates")
        .select("id, is_active, effective_rate")
        .eq("organization_id", params.organizationId)
    ),
    purchaseOrderLineIds.length
      ? requireRows<CommitmentReleaseLineRow>(
          db
            .from("purchase_order_commitment_release_lines")
            .select("purchase_order_line_item_id, released_amount")
            .eq("organization_id", params.organizationId)
            .in("purchase_order_line_item_id", purchaseOrderLineIds)
        )
      : Promise.resolve([]),
    invoice.supplier_id
      ? requireRows<InvoiceRow>(
          db
            .from("supplier_invoices")
            .select("id, organization_id, supplier_id, invoice_number, invoice_date, due_date, currency, subtotal, tax_total, total, status")
            .eq("organization_id", params.organizationId)
            .eq("supplier_id", invoice.supplier_id)
            .neq("id", invoice.id)
        )
      : Promise.resolve([]),
  ]);

  const activeMappingById = new Map(
    mappings
      .filter((mapping) => mapping.is_active)
      .map((mapping) => [mapping.id, mapping])
  );
  const activeRouteMappingById = new Map(
    routeMappings.filter((mapping) => mapping.is_active).map((mapping) => [mapping.id, mapping]),
  );
  const activeTaxRateById = new Map(
    taxRates
      .filter((taxRate) => taxRate.is_active)
      .map((taxRate) => [taxRate.id, taxRate] as const)
  );
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const purchaseOrderById = new Map(purchaseOrders.map((po) => [po.id, po]));
  const purchaseOrderLineById = new Map(
    purchaseOrderLines.map((line) => [line.id, line])
  );
  const historyByPurchaseOrderLineId = new Map<
    string,
    { quantity: number; value: number }
  >();
  const releasedByPurchaseOrderLineId = new Map<string, number>();
  releaseLines.forEach((release) => {
    releasedByPurchaseOrderLineId.set(
      release.purchase_order_line_item_id,
      (releasedByPurchaseOrderLineId.get(
        release.purchase_order_line_item_id
      ) ?? 0) + asNumber(release.released_amount)
    );
  });

  historicalSnapshots
    .filter((snapshot) =>
      isCommercialSnapshotHistoricalForInvoice({
        snapshotInvoiceId: snapshot.supplier_invoice_id,
        currentInvoiceId: invoice.id,
        snapshotApprovedAt: snapshot.approval_reviewed_at,
        currentApprovalApprovedAt: currentActiveApproval?.reviewed_at ?? null,
      })
    )
    .forEach((snapshot) => {
      if (!snapshot.purchase_order_line_item_id) {
        return;
      }
      const current = historyByPurchaseOrderLineId.get(
        snapshot.purchase_order_line_item_id
      ) ?? { quantity: 0, value: 0 };
      current.quantity += asNumber(snapshot.quantity);
      current.value += asNumber(snapshot.amount);
      historyByPurchaseOrderLineId.set(
        snapshot.purchase_order_line_item_id,
        current
      );
    });

  const variances: CommercialVariance[] = [];
  const lineProgress: PurchaseOrderLineInvoicingProgress[] = [];
  const blockers: CommercialBlocker[] = [];
  const allocationCounts = new Map<string, number>();

  allocations.forEach((allocation) => {
    allocationCounts.set(
      allocation.supplier_invoice_line_id,
      (allocationCounts.get(allocation.supplier_invoice_line_id) ?? 0) + 1
    );
    const invoiceLine = lineById.get(allocation.supplier_invoice_line_id);
    if (!invoiceLine) {
      return;
    }

    if (!allocation.purchase_order_line_item_id) {
      variances.push({
        key: `unexpected_line:${invoiceLine.id}`,
        type: "unexpected_line",
        severity: "warning",
        message: `${invoiceLine.description || "Invoice line"} is a manual no-PO allocation.`,
        invoiceLineId: invoiceLine.id,
        allocationId: allocation.id,
        purchaseOrderId: null,
        purchaseOrderLineItemId: null,
        expectedValue: "Purchase order line",
        actualValue: "No purchase order",
        varianceAmount: null,
      });
      return;
    }

    const poLine = purchaseOrderLineById.get(
      allocation.purchase_order_line_item_id
    );
    if (!poLine) {
      variances.push({
        key: `unexpected_line:${invoiceLine.id}`,
        type: "unexpected_line",
        severity: "blocking",
        message: `${invoiceLine.description || "Invoice line"} references a purchase order line that no longer exists.`,
        invoiceLineId: invoiceLine.id,
        allocationId: allocation.id,
        purchaseOrderId: allocation.purchase_order_id,
        purchaseOrderLineItemId: allocation.purchase_order_line_item_id,
        expectedValue: "Existing purchase order line",
        actualValue: "Missing",
        varianceAmount: null,
      });
      return;
    }

    const history = historyByPurchaseOrderLineId.get(poLine.id) ?? {
      quantity: 0,
      value: 0,
    };
    const baseProgress = calculatePurchaseOrderLineInvoicingProgress({
      id: poLine.id,
      purchaseOrderId: poLine.purchase_order_id,
      description: poLine.description,
      orderedQuantity: asNumber(poLine.quantity),
      orderedRate: asNumber(poLine.rate),
      orderedValue: asNumber(poLine.total),
      previouslyApprovedQuantity: history.quantity,
      previouslyApprovedValue: history.value,
      currentQuantity: asNumber(
        allocation.allocated_quantity ?? invoiceLine.quantity
      ),
      currentValue: asNumber(allocation.allocated_amount),
      currentUnitRate: asNumber(invoiceLine.unit_price),
    });
    const releasedCommitmentValue =
      releasedByPurchaseOrderLineId.get(poLine.id) ?? 0;
    const progress = {
      ...baseProgress,
      remainingValueBeforeCurrent: roundMoney(
        baseProgress.remainingValueBeforeCurrent - releasedCommitmentValue
      ),
      projectedRemainingValue: roundMoney(
        baseProgress.projectedRemainingValue - releasedCommitmentValue
      ),
      overInvoicedValue: roundMoney(
        Math.max(
          0,
          -(baseProgress.projectedRemainingValue - releasedCommitmentValue)
        )
      ),
      releasedCommitmentValue,
      reportingRemainingValue: roundMoney(
        baseProgress.projectedRemainingValue - releasedCommitmentValue
      ),
    };
    lineProgress.push(progress);
    variances.push(
      ...buildLineCommercialVariances(progress).map((variance) =>
        withVarianceContext({
          variance,
          invoiceLineId: invoiceLine.id,
          allocationId: allocation.id,
        })
      )
    );
    if (
      normalizeCommercialLineDescription(invoiceLine.description) !==
      normalizeCommercialLineDescription(poLine.description)
    ) {
      variances.push({
        key: `unexpected_line:description:${invoiceLine.id}:${poLine.id}`,
        type: "unexpected_line",
        severity: "warning",
        message: `${invoiceLine.description || "Invoice line"} has a different description from the selected purchase order line.`,
        invoiceLineId: invoiceLine.id,
        allocationId: allocation.id,
        purchaseOrderId: allocation.purchase_order_id,
        purchaseOrderLineItemId: poLine.id,
        expectedValue: poLine.description,
        actualValue: invoiceLine.description,
        varianceAmount: null,
      });
    }
  });

  if (!invoice.supplier_id) {
    blockers.push({
      code: "missing_supplier",
      message: "Select a supplier before commercial approval.",
    });
  }
  if (!normalizeSupplierInvoiceNumber(invoice.invoice_number)) {
    blockers.push({
      code: "missing_invoice_number",
      message: "Enter an invoice number before commercial approval.",
    });
  }
  if (!invoice.invoice_date) {
    blockers.push({
      code: "missing_invoice_date",
      message: "Enter an invoice date before commercial approval.",
    });
  }
  if (lines.length === 0) {
    blockers.push({
      code: "missing_lines",
      message: "Add at least one invoice line before commercial approval.",
    });
  }

  lines.forEach((line) => {
    if ((allocationCounts.get(line.id) ?? 0) !== 1) {
      blockers.push({
        code: "allocation_count",
        message: `${line.description || "Invoice line"} must have exactly one active allocation.`,
        invoiceLineId: line.id,
      });
    }
  });

  allocations.forEach((allocation) => {
    if (allocation.approval_status !== "approved") {
      blockers.push({
        code: "allocation_not_approved",
        message: "Every allocation must be approved before commercial approval.",
        invoiceLineId: allocation.supplier_invoice_line_id,
        allocationId: allocation.id,
      });
    }
    const namedMapping = allocation.accounting_route_mapping_id
      ? activeRouteMappingById.get(allocation.accounting_route_mapping_id) ?? null
      : null;
    const legacyMapping = allocation.accounting_mapping_id
      ? activeMappingById.get(allocation.accounting_mapping_id) ?? null
      : null;
    const explicitAccount = allocation.account_override_organization_cost_code_id;
    const namedReady = Boolean(
      allocation.accounting_route === "supplier_bill_expense"
      && allocation.organization_cost_code_id
      && (
        (explicitAccount && explicitAccount === allocation.organization_cost_code_id)
        || (namedMapping
          && namedMapping.organization_cost_code_id === allocation.organization_cost_code_id
          && (namedMapping.project_id === null || namedMapping.project_id === allocation.project_id))
      ),
    );
    const legacyReady = Boolean(
      legacyMapping
      && allocation.tradesstack_cost_code
      && legacyMapping.tradesstack_cost_code === allocation.tradesstack_cost_code
      && (legacyMapping.project_id === null || legacyMapping.project_id === allocation.project_id),
    );
    if (!namedReady && !legacyReady) {
      blockers.push({
        code: "missing_accounting_mapping",
        message: "Every allocation requires a configured Supplier Bills account or explicit line account.",
        invoiceLineId: allocation.supplier_invoice_line_id,
        allocationId: allocation.id,
      });
    }
    if (
      allocation.tax_resolution_status === "unresolved" ||
      (allocation.tax_resolution_status === "not_applicable" &&
        asNumber(
          lineById.get(allocation.supplier_invoice_line_id)?.tax_amount
        ) > 0.01) ||
      (allocation.tax_resolution_status === "resolved" &&
        (!allocation.accounting_tax_rate_id ||
          !activeTaxRateById.has(allocation.accounting_tax_rate_id)))
    ) {
      blockers.push({
        code: "missing_tax_treatment",
        message: "Every allocation requires a resolved tax treatment.",
        invoiceLineId: allocation.supplier_invoice_line_id,
        allocationId: allocation.id,
      });
    }
    if (allocation.purchase_order_id) {
      const po = purchaseOrderById.get(allocation.purchase_order_id);
      if (!po || po.supplier_id !== invoice.supplier_id) {
        blockers.push({
          code: "supplier_mismatch",
          message: `Invoice supplier does not match ${po?.purchase_order_number ?? "the selected purchase order"}.`,
          invoiceLineId: allocation.supplier_invoice_line_id,
          allocationId: allocation.id,
        });
      }
    }
  });

  const allocatedAmount = roundMoney(
    allocations.reduce(
      (sum, allocation) => sum + asNumber(allocation.allocated_amount),
      0
    )
  );
  const approvedAllocatedAmount = roundMoney(
    allocations.reduce(
      (sum, allocation) =>
        sum +
        (allocation.approval_status === "approved"
          ? asNumber(allocation.allocated_amount)
          : 0),
      0
    )
  );
  if (
    Math.abs(allocatedAmount - asNumber(invoice.subtotal)) > 0.01 &&
    Math.abs(allocatedAmount - asNumber(invoice.total)) > 0.01
  ) {
    blockers.push({
      code: "unallocated_amount",
      message: "Allocated amounts do not reconcile to the invoice subtotal or total.",
    });
  }
  const resolvedLineTaxes = allocations.map((allocation) =>
    calculateSupplierInvoiceLineTax({
      lineAmount: asNumber(allocation.allocated_amount),
      taxResolutionStatus:
        allocation.tax_resolution_status === "resolved" ||
        allocation.tax_resolution_status === "not_applicable"
          ? allocation.tax_resolution_status
          : "unresolved",
      effectiveRate: (() => {
        if (!allocation.accounting_tax_rate_id) {
          return null;
        }
        const effectiveRate = activeTaxRateById.get(
          allocation.accounting_tax_rate_id
        )?.effective_rate;
        return effectiveRate === null || effectiveRate === undefined
          ? null
          : asNumber(effectiveRate);
      })(),
    })
  );
  const canReconcileLineTax =
    allocations.length === lines.length &&
    resolvedLineTaxes.every((taxAmount) => taxAmount !== null);
  const resolvedLineTaxTotal = roundMoney(
    resolvedLineTaxes.reduce<number>(
      (sum, taxAmount) => sum + (taxAmount ?? 0),
      0
    )
  );
  if (
    canReconcileLineTax &&
    Math.abs(resolvedLineTaxTotal - asNumber(invoice.tax_total)) > 0.01
  ) {
    blockers.push({
      code: "totals_do_not_reconcile",
      message:
        "The resolved Xero tax treatments do not reconcile to the invoice tax total.",
    });
  }

  const normalizedNumber = normalizeSupplierInvoiceNumber(
    invoice.invoice_number
  );
  const duplicateInvoiceIds = duplicateCandidates
    .filter(
      (candidate) =>
        normalizedNumber.length > 0 &&
        normalizeSupplierInvoiceNumber(candidate.invoice_number) ===
          normalizedNumber
    )
    .map((candidate) => candidate.id);
  const likelyDuplicateInvoiceIds = duplicateCandidates
    .filter(
      (candidate) =>
        !duplicateInvoiceIds.includes(candidate.id) &&
        candidate.invoice_date === invoice.invoice_date &&
        Math.abs(asNumber(candidate.total) - asNumber(invoice.total)) <= 0.01
    )
    .map((candidate) => candidate.id);

  if (duplicateInvoiceIds.length > 0) {
    blockers.push({
      code: "duplicate_invoice",
      message: "Another invoice for this supplier uses the same normalized invoice number.",
    });
    variances.push({
      key: `duplicate_invoice:${duplicateInvoiceIds.join(",")}`,
      type: "duplicate_invoice",
      severity: "blocking",
      message: "An exact supplier invoice duplicate exists.",
      invoiceLineId: null,
      allocationId: null,
      purchaseOrderId: null,
      purchaseOrderLineItemId: null,
      expectedValue: normalizedNumber,
      actualValue: normalizedNumber,
      varianceAmount: null,
    });
  }
  if (likelyDuplicateInvoiceIds.length > 0) {
    variances.push({
      key: `duplicate_invoice:likely:${likelyDuplicateInvoiceIds.join(",")}`,
      type: "duplicate_invoice",
      severity: "warning",
      message: "Another invoice for this supplier has the same date and total.",
      invoiceLineId: null,
      allocationId: null,
      purchaseOrderId: null,
      purchaseOrderLineItemId: null,
      expectedValue: `${invoice.invoice_date}:${invoice.total}`,
      actualValue: `${invoice.invoice_date}:${invoice.total}`,
      varianceAmount: null,
    });
  }

  const hasPurchaseOrders = purchaseOrderIds.length > 0;
  if (
    !hasPurchaseOrders &&
    ![
      "utilities",
      "insurance",
      "emergency_purchase",
      "professional_service",
      "approved_overhead",
      "other",
    ].includes(params.noPoReason ?? "")
  ) {
    blockers.push({
      code: "missing_no_po_reason",
      message: "Select a valid no-PO commercial reason.",
    });
  }
  if (
    !hasPurchaseOrders &&
    params.noPoReason === "other" &&
    !(params.noPoExplanation ?? "").trim()
  ) {
    blockers.push({
      code: "missing_no_po_reason",
      message: "Explain the no-PO reason.",
    });
  }

  const acceptedKeys = acceptedVarianceKeySet(
    params.acceptedVariances
    ?? (
      currentActiveApproval?.finance_version_hash === financeHashResult.data
        ? readAcceptedVarianceInputs(currentActiveApproval.accepted_variances)
        : []
    )
  );
  variances
    .filter((variance) => variance.severity === "blocking")
    .forEach((variance) => {
      blockers.push({
        code: "blocking_variance",
        message: variance.message,
        invoiceLineId: variance.invoiceLineId ?? undefined,
        allocationId: variance.allocationId ?? undefined,
      });
    });
  variances
    .filter(
      (variance) =>
        variance.severity === "warning" && !acceptedKeys.has(variance.key)
    )
    .forEach((variance) => {
      blockers.push({
        code: "warning_not_accepted",
        message: `Accept and explain: ${variance.message}`,
        invoiceLineId: variance.invoiceLineId ?? undefined,
        allocationId: variance.allocationId ?? undefined,
      });
    });

  const progressByPurchaseOrderId = new Map<
    string,
    PurchaseOrderLineInvoicingProgress[]
  >();
  lineProgress.forEach((progress) => {
    const current = progressByPurchaseOrderId.get(progress.purchaseOrderId) ?? [];
    current.push(progress);
    progressByPurchaseOrderId.set(progress.purchaseOrderId, current);
  });
  const purchaseOrderProgress = purchaseOrders.map((po) => {
    const progressLines = sortPurchaseOrderProgressLines(
      progressByPurchaseOrderId.get(po.id) ?? [],
      new Map(
        purchaseOrderLines.map((line) => [line.id, line.sort_order] as const)
      )
    );
    const previouslyApprovedValue = roundMoney(
      progressLines.reduce(
        (sum, line) => sum + line.previouslyApprovedValue,
        0
      )
    );
    const currentInvoiceValue = roundMoney(
      progressLines.reduce((sum, line) => sum + line.currentValue, 0)
    );
    const currentValue = roundMoney(
      progressLines.reduce((sum, line) => sum + line.orderedValue, 0)
    );
    const releasedValue = roundMoney(
      progressLines.reduce(
        (sum, line) => sum + line.releasedCommitmentValue,
        0
      )
    );
    const projectedRemainingValue = roundMoney(
      currentValue -
        previouslyApprovedValue -
        currentInvoiceValue -
        releasedValue
    );
    return {
      purchaseOrderId: po.id,
      purchaseOrderNumber: po.purchase_order_number,
      purchaseOrderTitle: po.purchase_order_title,
      currentValue,
      previouslyApprovedValue,
      currentInvoiceValue,
      projectedRemainingValue,
      overInvoicedValue: roundMoney(Math.max(0, -projectedRemainingValue)),
      state: derivePurchaseOrderInvoicingState({
        currentPurchaseOrderValue: currentValue - releasedValue,
        commerciallyApprovedInvoiceValue:
          previouslyApprovedValue + currentInvoiceValue,
      }),
      lines: progressLines,
    };
  });

  const activeApproval = currentActiveApproval;
  const latestDecision = decisions[0] ?? null;
  const derivedStatus = activeApproval
    ? "approved"
    : latestDecision?.status === "rejected"
      ? "rejected"
      : latestDecision?.status === "invalidated"
        ? "invalidated"
        : blockers.length === 0
          ? "ready_for_review"
          : "not_ready";

  return {
    invoiceId: invoice.id,
    financeVersionHash: financeHashResult.data,
    derivedStatus,
    activeApproval,
    latestDecision,
    purchaseOrderProgress,
    variances,
    blockers,
    warnings: variances.filter((variance) => variance.severity === "warning"),
    information: variances.filter(
      (variance) => variance.severity === "information"
    ),
    duplicateInvoiceIds,
    likelyDuplicateInvoiceIds,
    hasPurchaseOrders,
    allocatedAmount,
    approvedAllocatedAmount,
  };
}

export async function getPurchaseOrderInvoicingProgress(params: {
  supabase: ServerSupabase;
  organizationId: string;
  purchaseOrderId: string;
}): Promise<PurchaseOrderCommercialProgress> {
  const db = untyped(params.supabase);
  const [purchaseOrders, lines, snapshots, releases, releaseLines, actualCosts] =
    await Promise.all([
      requireRows<PurchaseOrderRow>(
        db
          .from("project_purchase_orders")
          .select("id, organization_id, purchase_order_number, purchase_order_title, supplier_id, supplier_name_snapshot, status, total_purchase_order_price")
          .eq("organization_id", params.organizationId)
          .eq("id", params.purchaseOrderId)
      ),
      requireRows<PurchaseOrderLineRow>(
        db
          .from("project_purchase_order_line_items")
          .select("id, organization_id, purchase_order_id, description, quantity, rate, total, sort_order")
          .eq("organization_id", params.organizationId)
          .eq("purchase_order_id", params.purchaseOrderId)
          .order("sort_order", { ascending: true })
      ),
      loadActiveSnapshots({
        supabase: params.supabase,
        organizationId: params.organizationId,
        purchaseOrderIds: [params.purchaseOrderId],
      }),
      requireRows<CommitmentReleaseRow>(
        db
          .from("purchase_order_commitment_releases")
          .select("*")
          .eq("organization_id", params.organizationId)
          .eq("purchase_order_id", params.purchaseOrderId)
          .order("released_at", { ascending: false })
      ),
      requireRows<CommitmentReleaseLineRow>(
        db
          .from("purchase_order_commitment_release_lines")
          .select("purchase_order_line_item_id, released_amount")
          .eq("organization_id", params.organizationId)
          .eq("purchase_order_id", params.purchaseOrderId)
      ),
      requireRows<ActualCostRow>(
        db
          .from("project_actual_cost_events")
          .select("purchase_order_id, amount, event_status, event_type")
          .eq("organization_id", params.organizationId)
          .eq("purchase_order_id", params.purchaseOrderId)
      ),
    ]);

  const purchaseOrder = purchaseOrders[0];
  if (!purchaseOrder) {
    throw new Error("Purchase order not found.");
  }

  const snapshotsByLineId = new Map<string, CommercialSnapshotRow[]>();
  const releasedByLineId = new Map<string, number>();
  releaseLines.forEach((release) => {
    releasedByLineId.set(
      release.purchase_order_line_item_id,
      (releasedByLineId.get(release.purchase_order_line_item_id) ?? 0) +
        asNumber(release.released_amount)
    );
  });
  snapshots.forEach((snapshot) => {
    if (!snapshot.purchase_order_line_item_id) {
      return;
    }
    const current =
      snapshotsByLineId.get(snapshot.purchase_order_line_item_id) ?? [];
    current.push(snapshot);
    snapshotsByLineId.set(snapshot.purchase_order_line_item_id, current);
  });
  const lineProgress = lines.map((line) => {
    const lineSnapshots = snapshotsByLineId.get(line.id) ?? [];
    const progress = calculatePurchaseOrderLineInvoicingProgress({
      id: line.id,
      purchaseOrderId: purchaseOrder.id,
      description: line.description,
      orderedQuantity: asNumber(line.quantity),
      orderedRate: asNumber(line.rate),
      orderedValue: asNumber(line.total),
      previouslyApprovedQuantity: lineSnapshots.reduce(
        (sum, snapshot) => sum + asNumber(snapshot.quantity),
        0
      ),
      previouslyApprovedValue: lineSnapshots.reduce(
        (sum, snapshot) => sum + asNumber(snapshot.amount),
        0
      ),
      currentQuantity: 0,
      currentValue: 0,
      currentUnitRate: null,
    });
    const releasedCommitmentValue = releasedByLineId.get(line.id) ?? 0;
    return {
      ...progress,
      releasedCommitmentValue,
      reportingRemainingValue: roundMoney(
        progress.remainingValueBeforeCurrent - releasedCommitmentValue
      ),
    };
  });
  const approvedInvoicedValue = roundMoney(
    snapshots.reduce((sum, snapshot) => sum + asNumber(snapshot.amount), 0)
  );
  const releasedCommitmentValue = roundMoney(
    releases.reduce((sum, release) => sum + asNumber(release.released_amount), 0)
  );
  const currentPurchaseOrderValue = roundMoney(
    lines.reduce((sum, line) => sum + asNumber(line.total), 0)
  );
  const remainingCommitment = roundMoney(
    currentPurchaseOrderValue -
      approvedInvoicedValue -
      releasedCommitmentValue
  );
  const postedActualCost = roundMoney(
    actualCosts.reduce((sum, event) => {
      if (event.event_status !== "posted") {
        return sum;
      }
      return sum + (event.event_type === "reversal" ? -1 : 1) * asNumber(event.amount);
    }, 0)
  );

  return {
    purchaseOrderId: purchaseOrder.id,
    currentPurchaseOrderValue,
    approvedInvoicedValue,
    releasedCommitmentValue,
    remainingCommitment,
    overInvoicedValue: roundMoney(Math.max(0, -remainingCommitment)),
    postedActualCost,
    unpostedApprovedInvoiceValue: roundMoney(
      Math.max(0, approvedInvoicedValue - postedActualCost)
    ),
    invoicingState: derivePurchaseOrderInvoicingState({
      currentPurchaseOrderValue:
        currentPurchaseOrderValue - releasedCommitmentValue,
      commerciallyApprovedInvoiceValue: approvedInvoicedValue,
    }),
    lineProgress,
    releases,
  };
}

export async function getPurchaseOrderLineInvoicingProgress(params: {
  supabase: ServerSupabase;
  organizationId: string;
  purchaseOrderId: string;
  purchaseOrderLineItemId: string;
}) {
  const progress = await getPurchaseOrderInvoicingProgress(params);
  const line = progress.lineProgress.find(
    (item) => item.id === params.purchaseOrderLineItemId
  );
  if (!line) {
    throw new Error("Purchase order line not found.");
  }
  return line;
}
