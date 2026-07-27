import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPurchaseOrderInvoicingProgress } from "@/lib/procurement-commercial-server";
import type { Database } from "@/lib/supabase/types";
import { deriveSupplierInvoiceWorkflowStage } from "@/lib/supplier-invoice-workflow-state";

type ServerSupabase = SupabaseClient<Database>;
type UntypedSupabase = SupabaseClient<Database> & {
  from(table: string): ReturnType<SupabaseClient<Database>["from"]>;
};

export type SupplierInvoiceWorkflowStatus =
  | "Draft"
  | "Awaiting Allocation"
  | "Awaiting Site Approval"
  | "Partially Site Approved"
  | "Disputed"
  | "Site Approved"
  | "Ready for Accounts"
  | "Ready for Xero"
  | "Xero Export Queued"
  | "Draft Bill Created"
  | "Awaiting Xero Approval"
  | "Awaiting Payment"
  | "Partially Paid"
  | "Paid"
  | "Voided"
  | "Xero Export Failed"
  | "Attention Required";

export type SupplierInvoiceWorkflowState = {
  status: SupplierInvoiceWorkflowStatus;
  responsibleRole: "accounts" | "site_reviewer" | "none";
  nextAction: string;
  blockers: string[];
  warnings: string[];
  financeHash: string | null;
  activeSubmissionId: string | null;
  activeAccountsApprovalId: string | null;
  decisionCounts: { pending: number; approved: number; disputed: number };
};

export type SupplierInvoicePurchaseOrderSuggestion = {
  id: string;
  purchaseOrderNumber: string;
  title: string;
  projectId: string;
  projectName: string | null;
  supplierId: string | null;
  supplierMatches: boolean;
  exactReferenceMatch: boolean;
  status: string;
  total: number;
  approvedInvoicedValue: number;
  remainingCommitment: number;
  isSelectable: boolean;
  warning: string | null;
  ambiguous: boolean;
};

function db(supabase: ServerSupabase) {
  return supabase as UntypedSupabase;
}

export async function getSupplierInvoiceWorkflowState(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceWorkflowState> {
  const database = db(params.supabase);
  const [invoiceResult, linesResult, allocationsResult, matchesResult, submissionsResult, accountsResult, commercialResult, documentResult, hashResult] =
    await Promise.all([
      database.from("supplier_invoices").select("id, supplier_id, invoice_number, invoice_date, total").eq("organization_id", params.organizationId).eq("id", params.supplierInvoiceId).maybeSingle(),
      database.from("supplier_invoice_lines").select("id, line_total").eq("organization_id", params.organizationId).eq("supplier_invoice_id", params.supplierInvoiceId),
      database.from("supplier_invoice_line_allocations").select("id, supplier_invoice_line_id, allocated_amount, allocation_status").eq("organization_id", params.organizationId).eq("supplier_invoice_id", params.supplierInvoiceId),
      database.from("supplier_invoice_purchase_order_matches").select("id, purchase_order_id, match_status").eq("organization_id", params.organizationId).eq("supplier_invoice_id", params.supplierInvoiceId).in("match_status", ["accepted", "adjusted"]),
      database.from("supplier_invoice_site_review_submissions").select("id, finance_hash, status").eq("organization_id", params.organizationId).eq("supplier_invoice_id", params.supplierInvoiceId).in("status", ["submitted", "partially_reviewed", "approved", "disputed"]).order("submitted_at", { ascending: false }).limit(1),
      database.from("supplier_invoice_accounts_approvals").select("id, finance_hash, status").eq("organization_id", params.organizationId).eq("supplier_invoice_id", params.supplierInvoiceId).eq("status", "approved").order("created_at", { ascending: false }).limit(1),
      database.from("supplier_invoice_commercial_approvals").select("id, finance_version_hash, status, no_po_reason").eq("organization_id", params.organizationId).eq("supplier_invoice_id", params.supplierInvoiceId).eq("status", "approved").order("reviewed_at", { ascending: false }).limit(1),
      database.from("organization_accounting_documents").select("export_status, external_document_id, normalized_external_status, last_status_sync_error").eq("organization_id", params.organizationId).eq("local_document_type", "supplier_invoice").eq("local_document_id", params.supplierInvoiceId).order("updated_at", { ascending: false }).limit(1),
      database.rpc("supplier_invoice_finance_version_hash", { p_invoice_id: params.supplierInvoiceId }),
    ]);

  const failed = [invoiceResult, linesResult, allocationsResult, matchesResult, submissionsResult, accountsResult, commercialResult, documentResult, hashResult].find((result) => result.error);
  if (failed?.error) throw new Error("Unable to load the Supplier Invoice workflow state.");
  if (!invoiceResult.data) throw new Error("Supplier Invoice not found.");

  const invoice = invoiceResult.data as Record<string, unknown>;
  const lines = (linesResult.data ?? []) as Array<Record<string, unknown>>;
  const allocations = (allocationsResult.data ?? []) as Array<Record<string, unknown>>;
  const matches = (matchesResult.data ?? []) as Array<Record<string, unknown>>;
  const submission = ((submissionsResult.data ?? [])[0] ?? null) as unknown as Record<string, unknown> | null;
  const accountsApproval = ((accountsResult.data ?? [])[0] ?? null) as unknown as Record<string, unknown> | null;
  const commercialApproval = ((commercialResult.data ?? [])[0] ?? null) as unknown as Record<string, unknown> | null;
  const accountingDocument = ((documentResult.data ?? [])[0] ?? null) as Record<string, unknown> | null;
  const financeHash = typeof hashResult.data === "string" ? hashResult.data : null;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!invoice.supplier_id) blockers.push("Select a Supplier.");
  if (!String(invoice.invoice_number ?? "").trim()) blockers.push("Enter an invoice number.");
  if (!invoice.invoice_date) blockers.push("Enter an invoice date.");
  if (lines.length === 0) blockers.push("Add at least one Supplier Invoice line.");
  const allocationLineIds = new Set(allocations.map((allocation) => String(allocation.supplier_invoice_line_id)));
  if (lines.some((line) => !allocationLineIds.has(String(line.id)))) blockers.push("Allocate every Supplier Invoice line.");
  const allocatedTotal = allocations.reduce((sum, allocation) => sum + Number(allocation.allocated_amount ?? 0), 0);
  if (Math.abs(allocatedTotal - Number(invoice.total ?? 0)) > 0.01) warnings.push("Allocated value does not currently equal the invoice total.");

  const exportStatus = String(accountingDocument?.export_status ?? "");
  if (exportStatus === "exported" && accountingDocument?.external_document_id) {
    const stage = deriveSupplierInvoiceWorkflowStage({
      exportStatus,
      hasExternalDocument: true,
      normalizedExternalStatus:
        typeof accountingDocument.normalized_external_status === "string"
          ? accountingDocument.normalized_external_status
          : null,
      hasStatusSyncError: Boolean(accountingDocument.last_status_sync_error),
      hasCurrentAccountsApproval: false,
      hasCurrentSubmission: false,
      pendingDecisions: 0,
      approvedDecisions: 0,
      disputedDecisions: 0,
      captureComplete: true,
      allocationsComplete: true,
    });
    if (stage === "Paid") return state(stage, "none", "Paid in Xero.");
    if (stage === "Partially Paid") return state(stage, "none", "Await the remaining Xero payment.");
    if (stage === "Awaiting Payment") return state(stage, "none", "Await payment in Xero.");
    if (stage === "Awaiting Xero Approval") return state(stage, "none", "Await approval in Xero.");
    if (stage === "Voided") return state(stage, "accounts", "Review the voided Xero Bill.");
    if (stage === "Attention Required") return state(stage, "accounts", "Review the Xero Bill status exception.");
    return state("Draft Bill Created", "none", "Draft Bill created in Xero.");
  }
  if (["queued", "exporting"].includes(exportStatus)) return state("Xero Export Queued", "none", "Wait for the Xero export job.");
  if (exportStatus === "failed") return state("Xero Export Failed", "accounts", "Review the safe export error and retry.");
  if (exportStatus === "attention_required") return state("Attention Required", "accounts", "Resolve the Xero export exception.");

  const decisionsResult = submission
    ? await database.from("supplier_invoice_site_review_decisions").select("decision").eq("organization_id", params.organizationId).eq("submission_id", String(submission.id))
    : { data: [], error: null };
  if (decisionsResult.error) throw new Error("Unable to load site-review decisions.");
  const decisions = (decisionsResult.data ?? []) as Array<{ decision: string }>;
  const decisionCounts = {
    pending: decisions.filter((decision) => decision.decision === "pending").length,
    approved: decisions.filter((decision) => decision.decision === "approved").length,
    disputed: decisions.filter((decision) => decision.decision === "disputed").length,
  };

  if (
    matches.length === 0
    && commercialApproval?.finance_version_hash === financeHash
    && commercialApproval.no_po_reason
    && !accountsApproval
  ) {
    warnings.push("No Purchase Order is matched; the approved no-PO justification applies.");
    return state("Ready for Accounts", "accounts", "Perform final Accounts approval for the no-PO invoice.", decisionCounts);
  }

  const stage = deriveSupplierInvoiceWorkflowStage({
    exportStatus: null,
    hasExternalDocument: false,
    hasCurrentAccountsApproval: Boolean(accountsApproval && accountsApproval.finance_hash === financeHash),
    hasCurrentSubmission: Boolean(submission && submission.finance_hash === financeHash),
    pendingDecisions: decisionCounts.pending,
    approvedDecisions: decisionCounts.approved,
    disputedDecisions: decisionCounts.disputed,
    captureComplete: blockers.length === 0,
    allocationsComplete: allocations.length > 0 && lines.every((line) => allocationLineIds.has(String(line.id))),
  });
  if (stage === "Ready for Xero") return state(stage, "accounts", "Send one Draft Bill to Xero.", decisionCounts);
  if (stage === "Disputed") return state(stage, "accounts", "Correct the capture or allocation and resubmit.", decisionCounts);
  if (stage === "Partially Site Approved") return state(stage, "site_reviewer", "Complete the remaining PO reviews.", decisionCounts);
  if (stage === "Ready for Accounts") return state(stage, "accounts", "Perform final Accounts approval.", decisionCounts);
  if (stage === "Awaiting Site Approval") return state(stage, "site_reviewer", "Review each affected Purchase Order.", decisionCounts);
  if (matches.length === 0) warnings.push("No Purchase Order is matched; use the explicit no-PO path if applicable.");
  if (stage === "Draft" || stage === "Awaiting Allocation") return state(stage, "accounts", stage === "Draft" && blockers.length === 0 ? "Submit the current finance version for site approval." : "Complete capture and allocation.", decisionCounts);
  return state("Draft", "accounts", "Submit the current finance version for site approval.", decisionCounts);

  function state(
    status: SupplierInvoiceWorkflowStatus,
    responsibleRole: SupplierInvoiceWorkflowState["responsibleRole"],
    nextAction: string,
    counts = { pending: 0, approved: 0, disputed: 0 },
  ): SupplierInvoiceWorkflowState {
    return {
      status,
      responsibleRole,
      nextAction,
      blockers,
      warnings,
      financeHash,
      activeSubmissionId: submission ? String(submission.id) : null,
      activeAccountsApprovalId: accountsApproval ? String(accountsApproval.id) : null,
      decisionCounts: counts,
    };
  }
}

export async function suggestSupplierInvoicePurchaseOrders(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierId: string;
  supplierPoReference: string;
}): Promise<SupplierInvoicePurchaseOrderSuggestion[]> {
  const reference = params.supplierPoReference.trim().toLowerCase();
  if (!reference) return [];
  const database = db(params.supabase);
  const { data, error } = await database
    .from("project_purchase_orders")
    .select("id, project_id, purchase_order_number, purchase_order_title, supplier_id, status, total_purchase_order_price, organization_projects(name)")
    .eq("organization_id", params.organizationId)
    .ilike("purchase_order_number", `%${reference}%`)
    .neq("status", "Cancelled")
    .limit(20);
  if (error) throw new Error("Unable to suggest Purchase Orders.");

  const candidates = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const exactCount = candidates.filter((candidate) => String(candidate.purchase_order_number).trim().toLowerCase() === reference).length;
  const suggestions = await Promise.all(candidates.map(async (candidate) => {
    const progress = await getPurchaseOrderInvoicingProgress({
      supabase: params.supabase,
      organizationId: params.organizationId,
      purchaseOrderId: String(candidate.id),
    });
    const supplierMatches = candidate.supplier_id === params.supplierId;
    const exactReferenceMatch = String(candidate.purchase_order_number).trim().toLowerCase() === reference;
    const status = String(candidate.status);
    const inactive = !["Approved", "Issued", "Received"].includes(status);
    const project = candidate.organization_projects as { name?: string } | null;
    return {
      id: String(candidate.id),
      purchaseOrderNumber: String(candidate.purchase_order_number),
      title: String(candidate.purchase_order_title),
      projectId: String(candidate.project_id),
      projectName: project?.name ?? null,
      supplierId: candidate.supplier_id ? String(candidate.supplier_id) : null,
      supplierMatches,
      exactReferenceMatch,
      status,
      total: Number(candidate.total_purchase_order_price ?? 0),
      approvedInvoicedValue: progress.approvedInvoicedValue,
      remainingCommitment: progress.remainingCommitment,
      isSelectable: supplierMatches && status !== "Cancelled",
      warning: !supplierMatches ? "Supplier mismatch" : inactive ? `PO is ${status}` : null,
      ambiguous: exactReferenceMatch && exactCount > 1,
    };
  }));
  return suggestions.sort((left, right) => Number(right.exactReferenceMatch) - Number(left.exactReferenceMatch) || Number(right.supplierMatches) - Number(left.supplierMatches));
}
