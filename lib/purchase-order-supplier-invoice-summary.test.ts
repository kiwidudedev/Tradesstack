import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderSupplierInvoiceSummaryPayload,
  derivePurchaseOrderAllocationTaxBasis,
  type PurchaseOrderInvoiceSummarySource,
} from "@/lib/purchase-order-supplier-invoice-summary";

function source(
  overrides: Partial<PurchaseOrderInvoiceSummarySource> = {}
): PurchaseOrderInvoiceSummarySource {
  return {
    purchaseOrderId: "po-a",
    projectId: "project-a",
    canReviewSiteDecisions: true,
    canPerformAccountsActions: true,
    canSubmitSiteReview: true,
    matches: [{ supplier_invoice_id: "invoice-a", match_status: "accepted" }],
    invoices: [{
      id: "invoice-a",
      supplier_id: "supplier-a",
      invoice_number: "SI-WORKFLOW-INV-001",
      invoice_date: "2026-07-18",
      due_date: "2026-08-17",
      subtotal: 700,
      total: 805,
    }],
    suppliers: [{ id: "supplier-a", company_name: "Test Supplier", name: "Supplier" }],
    allocations: [
      { id: "allocation-1", supplier_invoice_id: "invoice-a", purchase_order_id: "po-a", allocated_amount: 500, allocation_status: "matched", edit_state: "locked_posted" },
      { id: "allocation-2", supplier_invoice_id: "invoice-a", purchase_order_id: "po-a", allocated_amount: 200, allocation_status: "matched", edit_state: "editable" },
    ],
    submissions: [{ id: "submission-a", supplier_invoice_id: "invoice-a", finance_hash: "hash-current", status: "approved", submitted_at: "2026-07-18T09:00:00Z" }],
    decisions: [{ id: "decision-a", submission_id: "submission-a", supplier_invoice_id: "invoice-a", purchase_order_id: "po-a", decision: "approved", reviewer_id: "reviewer-a", reviewed_at: "2026-07-18T10:00:00Z", note: "Received on site" }],
    accountsApprovals: [{ id: "accounts-a", supplier_invoice_id: "invoice-a", site_review_submission_id: "submission-a", finance_hash: "hash-current", status: "approved", approved_by: "accounts-user", approved_at: "2026-07-18T11:00:00Z", created_at: "2026-07-18T11:00:00Z" }],
    commercialApprovals: [{ supplier_invoice_id: "invoice-a", finance_version_hash: "hash-current", status: "approved", reviewed_at: "2026-07-18T10:30:00Z" }],
    accountingDocuments: [{
      id: "document-a",
      local_document_id: "invoice-a",
      external_document_id: "xero-invoice-a",
      external_document_number: "SI-WORKFLOW-INV-001",
      export_status: "exported",
      normalized_external_status: "paid",
      amount_paid: 805,
      amount_due: 0,
      fully_paid_at: "2026-07-18T00:00:00Z",
      last_status_synced_at: "2026-07-18T00:58:44.662Z",
      last_status_sync_error: null,
      updated_at: "2026-07-18T00:58:44.662Z",
    }],
    members: [
      { user_id: "reviewer-a", display_name: "Project Manager" },
      { user_id: "accounts-user", display_name: "Accounts Admin" },
    ],
    commercialProgress: {
      currentPurchaseOrderValue: 2_000,
      approvedInvoicedValue: 700,
      remainingCommitment: 1_300,
    },
    ...overrides,
  };
}

describe("Purchase Order Supplier Invoice authoritative summaries", () => {
  it("ignores stale match amounts and sums active PO allocations", () => {
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      poAllocatedAmount: 700,
      allocationTaxBasis: "tax_exclusive",
      siteReviewStatus: "approved",
      accountsApprovalStatus: "approved",
      xeroStatus: "paid",
      amountPaid: 805,
      amountDue: 0,
      dueDate: "2026-08-17",
      nextAction: "view",
    });
    expect(result.metrics).toMatchObject({
      purchaseOrderValue: 2_000,
      billCount: 1,
      paidAgainstPurchaseOrder: 700,
      outstandingAgainstPurchaseOrder: 1_300,
      paidPercent: 35,
      outstandingPercent: 65,
      paymentStatus: "partially_paid",
      overpaidAmount: 0,
      paymentAttributionMethod: "exact",
    });
  });

  it("excludes suggested, unmatched, reversed, and superseded allocation rows", () => {
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      allocations: [
        ...source().allocations,
        { id: "suggested", supplier_invoice_id: "invoice-a", purchase_order_id: "po-a", allocated_amount: 100, allocation_status: "suggested", edit_state: "editable" },
        { id: "unmatched", supplier_invoice_id: "invoice-a", purchase_order_id: "po-a", allocated_amount: 100, allocation_status: "unmatched", edit_state: "editable" },
        { id: "reversed", supplier_invoice_id: "invoice-a", purchase_order_id: "po-a", allocated_amount: 100, allocation_status: "matched", edit_state: "reversed" },
        { id: "superseded", supplier_invoice_id: "invoice-a", purchase_order_id: "po-a", allocated_amount: 100, allocation_status: "matched", edit_state: "superseded" },
      ],
    }));
    expect(result.rows[0]?.poAllocatedAmount).toBe(700);
  });

  it("scopes allocation and site review to the current PO while retaining whole-Bill payment", () => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      allocations: [
        { ...base.allocations[0]!, allocated_amount: 1_000 },
        { ...base.allocations[1]!, id: "po-b-allocation", purchase_order_id: "po-b", allocated_amount: 1_000 },
        { ...base.allocations[1]!, id: "manual", purchase_order_id: null, allocated_amount: 300 },
      ],
      invoices: [{ ...base.invoices[0]!, subtotal: 2_300, total: 2_300 }],
      accountingDocuments: [{ ...base.accountingDocuments[0]!, amount_paid: 2_300, amount_due: 0 }],
    }));
    expect(result.rows[0]?.poAllocatedAmount).toBe(1_000);
    expect(result.rows[0]?.amountPaid).toBe(2_300);
    expect(result.metrics.paidAgainstPurchaseOrder).toBe(1_000);
  });

  it("derives exclusive, inclusive, and unknown tax bases with decimal tolerance", () => {
    const allocation = source().allocations[0]!;
    expect(derivePurchaseOrderAllocationTaxBasis({ allInvoiceAllocations: [{ ...allocation, allocated_amount: 700.009 }], subtotal: 700, total: 805 })).toBe("tax_exclusive");
    expect(derivePurchaseOrderAllocationTaxBasis({ allInvoiceAllocations: [{ ...allocation, allocated_amount: 805 }], subtotal: 700, total: 805 })).toBe("tax_inclusive");
    expect(derivePurchaseOrderAllocationTaxBasis({ allInvoiceAllocations: [{ ...allocation, allocated_amount: 750 }], subtotal: 700, total: 805 })).toBe("unknown");
    expect(derivePurchaseOrderAllocationTaxBasis({ allInvoiceAllocations: [{ ...allocation, allocated_amount: 700 }], subtotal: 700, total: 700 })).toBe("unknown");
  });

  it.each([
    ["pending", "awaiting_site_approval", "review"],
    ["approved", "approved", "view"],
    ["disputed", "disputed", "accounts_action"],
  ] as const)("maps %s PO decisions", (decision, status, action) => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      decisions: [{ ...base.decisions[0]!, decision, reviewer_id: decision === "pending" ? null : "reviewer-a", reviewed_at: decision === "pending" ? null : "2026-07-18T10:00:00Z" }],
      accountsApprovals: decision === "approved" ? base.accountsApprovals : [],
    }));
    expect(result.rows[0]?.siteReviewStatus).toBe(status);
    expect(result.rows[0]?.nextAction).toBe(action);
  });

  it("marks invalidated workflow history for resubmission and never uses legacy approval", () => {
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      submissions: [{ id: "old", supplier_invoice_id: "invoice-a", finance_hash: "old-hash", status: "invalidated", submitted_at: "2026-07-18T09:00:00Z" }],
      decisions: [{ id: "old-decision", submission_id: "old", supplier_invoice_id: "invoice-a", purchase_order_id: "po-a", decision: "invalidated", reviewer_id: "reviewer-a", reviewed_at: "2026-07-18T10:00:00Z", note: "" }],
      accountsApprovals: [{ ...source().accountsApprovals[0]!, status: "invalidated", finance_hash: "old-hash" }],
    }));
    expect(result.rows[0]).toMatchObject({
      siteReviewStatus: "invalidated",
      accountsApprovalStatus: "invalidated",
      nextAction: "resubmit",
    });
  });

  it("ignores stale site and Accounts hashes", () => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      submissions: [{ ...base.submissions[0]!, finance_hash: "old-hash" }],
      decisions: [{ ...base.decisions[0]!, submission_id: "submission-a" }],
      accountsApprovals: [{ ...base.accountsApprovals[0]!, finance_hash: "old-hash" }],
      commercialApprovals: [{ ...base.commercialApprovals[0]!, finance_version_hash: "new-hash" }],
    }));
    expect(result.rows[0]?.siteReviewStatus).toBe("invalidated");
    expect(result.rows[0]?.accountsApprovalStatus).not.toBe("approved");
  });

  it("degrades invoices without workflow records without fabricating approval", () => {
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      submissions: [], decisions: [], accountsApprovals: [], commercialApprovals: [], accountingDocuments: [],
    }));
    expect(result.rows[0]).toMatchObject({
      siteReviewStatus: "legacy_unavailable",
      accountsApprovalStatus: "unavailable",
      xeroStatus: "not_exported",
    });
  });

  it.each([
    ["draft", "draft"],
    ["awaiting_approval", "awaiting_approval"],
    ["awaiting_payment", "awaiting_payment"],
    ["partially_paid", "partially_paid"],
    ["paid", "paid"],
    ["voided", "voided"],
    ["deleted", "deleted"],
  ] as const)("maps Xero %s without using the Supplier Invoice header", (providerStatus, expected) => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      accountingDocuments: [{ ...base.accountingDocuments[0]!, normalized_external_status: providerStatus }],
    }));
    expect(result.rows[0]?.xeroStatus).toBe(expected);
  });

  it("preserves the last known paid state when refresh has a safe error", () => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      accountingDocuments: [{ ...base.accountingDocuments[0]!, last_status_sync_error: "Unable to refresh Xero Bill status." }],
    }));
    expect(result.rows[0]?.xeroStatus).toBe("paid");
    expect(result.rows[0]?.lastStatusSyncError).toBeTruthy();
  });

  it("uses provider-neutral PO payment metrics and counts unique bills", () => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      matches: [base.matches[0]!, base.matches[0]!],
      accountingDocuments: [{ ...base.accountingDocuments[0]!, amount_due: 405 }],
    }));
    expect(result.rows).toHaveLength(1);
    expect(result.metrics).toEqual({
      purchaseOrderValue: 2_000,
      billCount: 1,
      paidAgainstPurchaseOrder: 700,
      outstandingAgainstPurchaseOrder: 1_300,
      paidPercent: 35,
      outstandingPercent: 65,
      paymentStatus: "partially_paid",
      overpaidAmount: 0,
      paymentAttributionMethod: "exact",
    });
  });

  it("attributes partially paid bills proportionally against the current PO", () => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      invoices: [{ ...base.invoices[0]!, subtotal: 700, total: 805 }],
      accountingDocuments: [{ ...base.accountingDocuments[0]!, normalized_external_status: "partially_paid", amount_paid: 402.5, amount_due: 402.5, fully_paid_at: null }],
      commercialProgress: {
        currentPurchaseOrderValue: 5_000,
        approvedInvoicedValue: 700,
        remainingCommitment: 4_300,
      },
    }));
    expect(result.metrics).toMatchObject({
      purchaseOrderValue: 5_000,
      paidAgainstPurchaseOrder: 350,
      outstandingAgainstPurchaseOrder: 4_650,
      paidPercent: 7,
      outstandingPercent: 93,
      paymentStatus: "partially_paid",
      paymentAttributionMethod: "proportional",
    });
  });

  it("marks the payment summary unavailable when a positive payment cannot be reconciled to a tax basis", () => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      accountingDocuments: [{ ...base.accountingDocuments[0]!, normalized_external_status: "partially_paid", amount_paid: null, amount_due: 350, fully_paid_at: null }],
    }));
    expect(result.metrics).toMatchObject({
      paidAgainstPurchaseOrder: 0,
      outstandingAgainstPurchaseOrder: 2_000,
      paymentStatus: "unavailable",
      paymentAttributionMethod: "none",
    });
  });

  it("reports no payments when bills exist but nothing has been paid", () => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      accountingDocuments: [{ ...base.accountingDocuments[0]!, normalized_external_status: "awaiting_payment", amount_paid: 0, amount_due: 805, fully_paid_at: null }],
    }));
    expect(result.metrics).toMatchObject({
      paidAgainstPurchaseOrder: 0,
      outstandingAgainstPurchaseOrder: 2_000,
      paidPercent: 0,
      outstandingPercent: 100,
      paymentStatus: "no_payments",
    });
  });

  it("treats zero-value purchase orders as fully paid once there is no outstanding value", () => {
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      matches: [],
      invoices: [],
      suppliers: [],
      allocations: [],
      submissions: [],
      decisions: [],
      accountsApprovals: [],
      commercialApprovals: [],
      accountingDocuments: [],
      commercialProgress: {
        currentPurchaseOrderValue: 0,
        approvedInvoicedValue: 0,
        remainingCommitment: 0,
      },
    }));
    expect(result.metrics).toMatchObject({
      purchaseOrderValue: 0,
      billCount: 0,
      paidAgainstPurchaseOrder: 0,
      outstandingAgainstPurchaseOrder: 0,
      paymentStatus: "fully_paid",
    });
  });

  it("flags purchase orders as overpaid when attributed payments exceed the current PO value", () => {
    const base = source();
    const result = buildPurchaseOrderSupplierInvoiceSummaryPayload(source({
      commercialProgress: {
        currentPurchaseOrderValue: 600,
        approvedInvoicedValue: 700,
        remainingCommitment: 0,
      },
      accountingDocuments: [{ ...base.accountingDocuments[0]!, normalized_external_status: "paid", amount_paid: 805, amount_due: 0, fully_paid_at: "2026-07-18T00:00:00Z" }],
    }));
    expect(result.metrics).toMatchObject({
      paidAgainstPurchaseOrder: 700,
      outstandingAgainstPurchaseOrder: 0,
      overpaidAmount: 100,
      paymentStatus: "overpaid",
    });
  });
});
