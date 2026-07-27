export type PurchaseOrderAllocationTaxBasis =
  | "tax_exclusive"
  | "tax_inclusive"
  | "unknown";

export type PurchaseOrderSiteReviewStatus =
  | "awaiting_site_approval"
  | "approved"
  | "disputed"
  | "invalidated"
  | "legacy_unavailable";

export type PurchaseOrderAccountsApprovalStatus =
  | "approved"
  | "required"
  | "invalidated"
  | "unavailable";

export type PurchaseOrderInvoiceXeroStatus =
  | "not_exported"
  | "draft"
  | "awaiting_approval"
  | "awaiting_payment"
  | "partially_paid"
  | "paid"
  | "voided"
  | "deleted"
  | "attention_required";

export type PurchaseOrderSupplierInvoiceNextAction =
  | "review"
  | "view"
  | "accounts_action"
  | "resubmit"
  | "none";

export type PurchaseOrderSupplierInvoiceSummary = {
  supplierInvoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  supplierName: string | null;
  purchaseOrderId: string;
  projectId: string;
  poAllocatedAmount: number;
  allocationTaxBasis: PurchaseOrderAllocationTaxBasis;
  siteReviewStatus: PurchaseOrderSiteReviewStatus;
  siteReviewerName: string | null;
  siteReviewedAt: string | null;
  siteReviewNote: string | null;
  accountsApprovalStatus: PurchaseOrderAccountsApprovalStatus;
  accountsApprovedByName: string | null;
  accountsApprovedAt: string | null;
  xeroStatus: PurchaseOrderInvoiceXeroStatus;
  xeroInvoiceId: string | null;
  xeroReference: string | null;
  invoiceTotal: number;
  amountPaid: number | null;
  amountDue: number | null;
  fullyPaidAt: string | null;
  lastStatusSyncedAt: string | null;
  lastStatusSyncError: string | null;
  currentFinanceHash: string | null;
  workflowFinanceHash: string | null;
  canReview: boolean;
  canView: boolean;
  nextAction: PurchaseOrderSupplierInvoiceNextAction;
};

export type PurchaseOrderSupplierInvoiceSummaryMetrics = {
  purchaseOrderValue: number;
  billCount: number;
  paidAgainstPurchaseOrder: number;
  outstandingAgainstPurchaseOrder: number;
  paidPercent: number;
  outstandingPercent: number;
  paymentStatus:
    | "no_payments"
    | "partially_paid"
    | "fully_paid"
    | "overpaid"
    | "unavailable";
  overpaidAmount: number;
  paymentAttributionMethod: "exact" | "proportional" | "none";
};

export type PurchaseOrderSupplierInvoiceSummaryPayload = {
  purchaseOrderId: string;
  projectId: string;
  canReviewSiteDecisions: boolean;
  rows: PurchaseOrderSupplierInvoiceSummary[];
  metrics: PurchaseOrderSupplierInvoiceSummaryMetrics;
};

export type PurchaseOrderInvoiceSummarySource = {
  purchaseOrderId: string;
  projectId: string;
  canReviewSiteDecisions: boolean;
  canPerformAccountsActions: boolean;
  canSubmitSiteReview: boolean;
  matches: Array<{
    supplier_invoice_id: string;
    match_status: string;
  }>;
  invoices: Array<{
    id: string;
    supplier_id: string | null;
    invoice_number: string;
    invoice_date: string | null;
    due_date: string | null;
    subtotal: number;
    total: number;
  }>;
  suppliers: Array<{
    id: string;
    company_name: string | null;
    name: string | null;
  }>;
  allocations: Array<{
    id: string;
    supplier_invoice_id: string;
    purchase_order_id: string | null;
    allocated_amount: number;
    allocation_status: string;
    edit_state: string;
  }>;
  submissions: Array<{
    id: string;
    supplier_invoice_id: string;
    finance_hash: string;
    status: string;
    submitted_at: string;
  }>;
  decisions: Array<{
    id: string;
    submission_id: string;
    supplier_invoice_id: string;
    purchase_order_id: string;
    decision: string;
    reviewer_id: string | null;
    reviewed_at: string | null;
    note: string;
  }>;
  accountsApprovals: Array<{
    id: string;
    supplier_invoice_id: string;
    site_review_submission_id: string | null;
    finance_hash: string;
    status: string;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
  }>;
  commercialApprovals: Array<{
    supplier_invoice_id: string;
    finance_version_hash: string;
    status: string;
    reviewed_at: string | null;
  }>;
  accountingDocuments: Array<{
    id: string;
    local_document_id: string;
    external_document_id: string | null;
    external_document_number: string | null;
    export_status: string;
    normalized_external_status: string | null;
    amount_paid: number | null;
    amount_due: number | null;
    fully_paid_at: string | null;
    last_status_synced_at: string | null;
    last_status_sync_error: string | null;
    updated_at: string;
  }>;
  members: Array<{
    user_id: string;
    display_name: string;
  }>;
  commercialProgress: {
    currentPurchaseOrderValue: number;
    approvedInvoicedValue: number;
    remainingCommitment: number;
  };
};

const MONEY_TOLERANCE = 0.01;
const ACTIVE_MATCH_STATUSES = new Set(["accepted", "adjusted"]);
const ACTIVE_ALLOCATION_STATUSES = new Set([
  "matched",
  "partially_matched",
  "split",
  "disputed",
]);
const ACTIVE_EDIT_STATES = new Set(["editable", "locked_posted"]);
const ACTIVE_SUBMISSION_STATUSES = new Set([
  "submitted",
  "partially_reviewed",
  "approved",
  "disputed",
]);

function asMoney(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function safePercent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= MONEY_TOLERANCE) return 0;
  return roundPercent((value / total) * 100);
}

function latestBy<T>(rows: T[], date: (row: T) => string | null | undefined) {
  return rows.slice().sort((left, right) =>
    String(date(right) ?? "").localeCompare(String(date(left) ?? ""))
  )[0] ?? null;
}

function isActiveAllocation(allocation: PurchaseOrderInvoiceSummarySource["allocations"][number]) {
  return ACTIVE_ALLOCATION_STATUSES.has(allocation.allocation_status)
    && ACTIVE_EDIT_STATES.has(allocation.edit_state);
}

export function derivePurchaseOrderAllocationTaxBasis(params: {
  allInvoiceAllocations: PurchaseOrderInvoiceSummarySource["allocations"];
  subtotal: number;
  total: number;
}): PurchaseOrderAllocationTaxBasis {
  const allocationTotal = asMoney(
    params.allInvoiceAllocations
      .filter(isActiveAllocation)
      .reduce((sum, allocation) => sum + Number(allocation.allocated_amount ?? 0), 0)
  );
  const matchesSubtotal = Math.abs(allocationTotal - Number(params.subtotal)) <= MONEY_TOLERANCE;
  const matchesTotal = Math.abs(allocationTotal - Number(params.total)) <= MONEY_TOLERANCE;
  if (matchesSubtotal && !matchesTotal) return "tax_exclusive";
  if (matchesTotal && !matchesSubtotal) return "tax_inclusive";
  return "unknown";
}

function mapXeroStatus(
  document: PurchaseOrderInvoiceSummarySource["accountingDocuments"][number] | null
): PurchaseOrderInvoiceXeroStatus {
  if (!document) return "not_exported";
  const normalized = document.normalized_external_status;
  if (
    normalized === "draft"
    || normalized === "awaiting_approval"
    || normalized === "awaiting_payment"
    || normalized === "partially_paid"
    || normalized === "paid"
    || normalized === "voided"
    || normalized === "deleted"
  ) {
    return normalized;
  }
  if (document.last_status_sync_error || document.export_status === "attention_required") {
    return "attention_required";
  }
  return document.external_document_id ? "draft" : "not_exported";
}

function derivePurchaseOrderInvoicePaidValue(params: {
  poAllocatedAmount: number;
  allocationTaxBasis: PurchaseOrderAllocationTaxBasis;
  invoiceSubtotal: number;
  invoiceTotal: number;
  amountPaid: number | null;
  xeroStatus: PurchaseOrderInvoiceXeroStatus;
  fullyPaidAt: string | null;
}) {
  const poAllocatedAmount = asMoney(params.poAllocatedAmount);
  if (poAllocatedAmount <= MONEY_TOLERANCE) {
    return {
      paidAgainstPurchaseOrder: 0,
      unavailable: false,
      attributionMethod: "none" as const,
    };
  }

  const isFullyPaid = params.xeroStatus === "paid" || Boolean(params.fullyPaidAt);
  if (isFullyPaid) {
    return {
      paidAgainstPurchaseOrder: poAllocatedAmount,
      unavailable: false,
      attributionMethod: "exact" as const,
    };
  }

  const amountPaid = params.amountPaid == null ? null : asMoney(params.amountPaid);
  if (amountPaid == null || amountPaid <= MONEY_TOLERANCE) {
    return {
      paidAgainstPurchaseOrder: 0,
      unavailable: params.xeroStatus === "partially_paid",
      attributionMethod: "none" as const,
    };
  }

  const wholeInvoiceTotal = asMoney(params.invoiceTotal);
  if (wholeInvoiceTotal <= MONEY_TOLERANCE) {
    return {
      paidAgainstPurchaseOrder: 0,
      unavailable: true,
      attributionMethod: "none" as const,
    };
  }

  return {
    paidAgainstPurchaseOrder: asMoney(poAllocatedAmount * Math.max(0, amountPaid / wholeInvoiceTotal)),
    unavailable: false,
    attributionMethod: "proportional" as const,
  };
}

function derivePurchaseOrderPaymentMetrics(rows: Array<{
  poAllocatedAmount: number;
  allocationTaxBasis: PurchaseOrderAllocationTaxBasis;
  invoiceSubtotal: number;
  invoiceTotal: number;
  amountPaid: number | null;
  xeroStatus: PurchaseOrderInvoiceXeroStatus;
  fullyPaidAt: string | null;
}>, purchaseOrderValue: number): PurchaseOrderSupplierInvoiceSummaryMetrics {
  let paidAgainstPurchaseOrder = 0;
  let usedExactAttribution = false;
  let usedProportionalAttribution = false;
  let hasUnavailablePayment = false;

  rows.forEach((row) => {
    const payment = derivePurchaseOrderInvoicePaidValue(row);
    paidAgainstPurchaseOrder = asMoney(paidAgainstPurchaseOrder + payment.paidAgainstPurchaseOrder);
    if (payment.attributionMethod === "exact") usedExactAttribution = true;
    if (payment.attributionMethod === "proportional") usedProportionalAttribution = true;
    if (payment.unavailable) hasUnavailablePayment = true;
  });

  const normalizedPurchaseOrderValue = asMoney(purchaseOrderValue);
  const overpaidAmount = asMoney(Math.max(0, paidAgainstPurchaseOrder - normalizedPurchaseOrderValue));
  const outstandingAgainstPurchaseOrder = asMoney(
    Math.max(0, normalizedPurchaseOrderValue - paidAgainstPurchaseOrder)
  );

  let paymentStatus: PurchaseOrderSupplierInvoiceSummaryMetrics["paymentStatus"] = "no_payments";
  if (hasUnavailablePayment) {
    paymentStatus = "unavailable";
  } else if (overpaidAmount > MONEY_TOLERANCE) {
    paymentStatus = "overpaid";
  } else if (normalizedPurchaseOrderValue <= MONEY_TOLERANCE) {
    paymentStatus = "fully_paid";
  } else if (paidAgainstPurchaseOrder <= MONEY_TOLERANCE) {
    paymentStatus = "no_payments";
  } else if (paidAgainstPurchaseOrder >= normalizedPurchaseOrderValue - MONEY_TOLERANCE) {
    paymentStatus = "fully_paid";
  } else {
    paymentStatus = "partially_paid";
  }

  return {
    purchaseOrderValue: normalizedPurchaseOrderValue,
    billCount: rows.length,
    paidAgainstPurchaseOrder,
    outstandingAgainstPurchaseOrder,
    paidPercent: safePercent(paidAgainstPurchaseOrder, normalizedPurchaseOrderValue),
    outstandingPercent: normalizedPurchaseOrderValue <= MONEY_TOLERANCE
      ? 0
      : safePercent(outstandingAgainstPurchaseOrder, normalizedPurchaseOrderValue),
    paymentStatus,
    overpaidAmount,
    paymentAttributionMethod: usedProportionalAttribution
      ? "proportional"
      : usedExactAttribution
        ? "exact"
        : "none",
  };
}

export function buildPurchaseOrderSupplierInvoiceSummaryPayload(
  source: PurchaseOrderInvoiceSummarySource
): PurchaseOrderSupplierInvoiceSummaryPayload {
  const invoiceIds = Array.from(new Set(
    source.matches
      .filter((match) => ACTIVE_MATCH_STATUSES.has(match.match_status))
      .map((match) => match.supplier_invoice_id)
  ));
  const suppliersById = new Map(source.suppliers.map((supplier) => [supplier.id, supplier]));
  const membersByUserId = new Map(source.members.map((member) => [member.user_id, member.display_name]));

  const summaryRows = invoiceIds.flatMap<{
    row: PurchaseOrderSupplierInvoiceSummary;
    invoiceSubtotal: number;
    invoiceTotal: number;
  }>((supplierInvoiceId) => {
    const invoice = source.invoices.find((candidate) => candidate.id === supplierInvoiceId);
    if (!invoice) return [];
    const allInvoiceAllocations = source.allocations.filter(
      (allocation) => allocation.supplier_invoice_id === supplierInvoiceId
    );
    const purchaseOrderAllocations = allInvoiceAllocations.filter(
      (allocation) => allocation.purchase_order_id === source.purchaseOrderId && isActiveAllocation(allocation)
    );
    const poAllocatedAmount = asMoney(
      purchaseOrderAllocations.reduce(
        (sum, allocation) => sum + Number(allocation.allocated_amount ?? 0),
        0
      )
    );

    const invoiceCommercialApproval = latestBy(
      source.commercialApprovals.filter(
        (approval) => approval.supplier_invoice_id === supplierInvoiceId && approval.status === "approved"
      ),
      (approval) => approval.reviewed_at
    );
    const activeSubmission = latestBy(
      source.submissions.filter(
        (submission) => submission.supplier_invoice_id === supplierInvoiceId
          && ACTIVE_SUBMISSION_STATUSES.has(submission.status)
      ),
      (submission) => submission.submitted_at
    );
    const latestSubmission = latestBy(
      source.submissions.filter((submission) => submission.supplier_invoice_id === supplierInvoiceId),
      (submission) => submission.submitted_at
    );
    const currentFinanceHash = invoiceCommercialApproval?.finance_version_hash
      ?? activeSubmission?.finance_hash
      ?? null;
    const currentSubmission = activeSubmission?.finance_hash === currentFinanceHash
      ? activeSubmission
      : null;
    const currentDecision = currentSubmission
      ? source.decisions.find(
          (decision) => decision.submission_id === currentSubmission.id
            && decision.purchase_order_id === source.purchaseOrderId
        ) ?? null
      : null;

    let siteReviewStatus: PurchaseOrderSiteReviewStatus = "legacy_unavailable";
    if (currentDecision?.decision === "pending") siteReviewStatus = "awaiting_site_approval";
    else if (currentDecision?.decision === "approved") siteReviewStatus = "approved";
    else if (currentDecision?.decision === "disputed") siteReviewStatus = "disputed";
    else if (
      currentDecision?.decision === "invalidated"
      || latestSubmission?.status === "invalidated"
      || (activeSubmission && !currentSubmission)
    ) siteReviewStatus = "invalidated";

    const invoiceAccountsApprovals = source.accountsApprovals.filter(
      (approval) => approval.supplier_invoice_id === supplierInvoiceId
    );
    const currentAccountsApproval = latestBy(
      invoiceAccountsApprovals.filter(
        (approval) => approval.status === "approved"
          && approval.finance_hash === currentFinanceHash
          && approval.site_review_submission_id === currentSubmission?.id
      ),
      (approval) => approval.created_at
    );
    const latestAccountsApproval = latestBy(invoiceAccountsApprovals, (approval) => approval.created_at);
    let accountsApprovalStatus: PurchaseOrderAccountsApprovalStatus = "unavailable";
    if (currentAccountsApproval) accountsApprovalStatus = "approved";
    else if (latestAccountsApproval?.status === "invalidated") accountsApprovalStatus = "invalidated";
    else if (["approved", "disputed", "awaiting_site_approval"].includes(siteReviewStatus)) {
      accountsApprovalStatus = "required";
    }

    const document = latestBy(
      source.accountingDocuments.filter((candidate) => candidate.local_document_id === supplierInvoiceId),
      (candidate) => candidate.updated_at
    );
    const xeroStatus = mapXeroStatus(document);
    const supplier = invoice.supplier_id ? suppliersById.get(invoice.supplier_id) : null;
    const canReview = Boolean(
      source.canReviewSiteDecisions
      && siteReviewStatus === "awaiting_site_approval"
      && currentDecision
    );
    let nextAction: PurchaseOrderSupplierInvoiceNextAction = "view";
    if (canReview) nextAction = "review";
    else if (siteReviewStatus === "disputed" && source.canPerformAccountsActions) nextAction = "accounts_action";
    else if (siteReviewStatus === "invalidated" && source.canSubmitSiteReview) nextAction = "resubmit";
    else if (!invoice) nextAction = "none";

    return [{
      row: {
        supplierInvoiceId,
        invoiceNumber: invoice.invoice_number || "Supplier Invoice",
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        supplierName: supplier?.company_name?.trim() || supplier?.name?.trim() || null,
        purchaseOrderId: source.purchaseOrderId,
        projectId: source.projectId,
        poAllocatedAmount,
        allocationTaxBasis: derivePurchaseOrderAllocationTaxBasis({
          allInvoiceAllocations,
          subtotal: invoice.subtotal,
          total: invoice.total,
        }),
        siteReviewStatus,
        siteReviewerName: currentDecision?.reviewer_id
          ? membersByUserId.get(currentDecision.reviewer_id) ?? "Unknown reviewer"
          : null,
        siteReviewedAt: currentDecision?.reviewed_at ?? null,
        siteReviewNote: currentDecision?.note?.trim() || null,
        accountsApprovalStatus,
        accountsApprovedByName: currentAccountsApproval?.approved_by
          ? membersByUserId.get(currentAccountsApproval.approved_by) ?? "Unknown approver"
          : null,
        accountsApprovedAt: currentAccountsApproval?.approved_at ?? null,
        xeroStatus,
        xeroInvoiceId: document?.external_document_id ?? null,
        xeroReference: document?.external_document_number ?? null,
        invoiceTotal: asMoney(invoice.total),
        amountPaid: document?.amount_paid == null ? null : asMoney(document.amount_paid),
        amountDue: document?.amount_due == null ? null : asMoney(document.amount_due),
        fullyPaidAt: document?.fully_paid_at ?? null,
        lastStatusSyncedAt: document?.last_status_synced_at ?? null,
        lastStatusSyncError: document?.last_status_sync_error ?? null,
        currentFinanceHash,
        workflowFinanceHash: currentSubmission?.finance_hash ?? null,
        canReview,
        canView: true,
        nextAction,
      },
      invoiceSubtotal: asMoney(invoice.subtotal),
      invoiceTotal: asMoney(invoice.total),
    }];
  }).sort((left, right) =>
    String(right.row.invoiceDate ?? "").localeCompare(String(left.row.invoiceDate ?? ""))
      || left.row.invoiceNumber.localeCompare(right.row.invoiceNumber)
  );
  const rows = summaryRows.map((summaryRow) => summaryRow.row);
  const metrics = derivePurchaseOrderPaymentMetrics(
    summaryRows.map((summaryRow) => ({
      poAllocatedAmount: summaryRow.row.poAllocatedAmount,
      allocationTaxBasis: summaryRow.row.allocationTaxBasis,
      invoiceSubtotal: summaryRow.invoiceSubtotal,
      invoiceTotal: summaryRow.invoiceTotal,
      amountPaid: summaryRow.row.amountPaid,
      xeroStatus: summaryRow.row.xeroStatus,
      fullyPaidAt: summaryRow.row.fullyPaidAt,
    })),
    source.commercialProgress.currentPurchaseOrderValue
  );

  return {
    purchaseOrderId: source.purchaseOrderId,
    projectId: source.projectId,
    canReviewSiteDecisions: source.canReviewSiteDecisions,
    rows,
    metrics,
  };
}
