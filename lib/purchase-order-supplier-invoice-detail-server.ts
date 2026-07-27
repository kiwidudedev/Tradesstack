import "server-only";

import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getSupplierInvoiceCommercialComparison } from "@/lib/procurement-commercial-server";
import type { CommercialVariance } from "@/lib/procurement-commercial";
import type {
  PurchaseOrderSupplierInvoiceAllocationDetail,
  PurchaseOrderSupplierInvoiceDetail,
} from "@/lib/purchase-order-supplier-invoice-detail";
import { getPurchaseOrderSupplierInvoiceSummaries } from "@/lib/purchase-order-supplier-invoice-summary-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SUPPLIER_INVOICE_DOCUMENTS_BUCKET } from "@/lib/supplier-invoices";

const ACTIVE_ALLOCATION_STATUSES = ["matched", "partially_matched", "split", "disputed"];
const ACTIVE_EDIT_STATES = ["editable", "locked_posted"];
const ACTIVE_SUBMISSION_STATUSES = ["submitted", "partially_reviewed", "approved", "disputed"];

function safeError(error: { message: string } | null, message: string) {
  if (error) throw new Error(message);
}

function latestBy<T>(rows: T[], value: (row: T) => string | null | undefined) {
  return rows.slice().sort((left, right) => String(value(right) ?? "").localeCompare(String(value(left) ?? "")))[0] ?? null;
}

function varianceLabel(variance: CommercialVariance) {
  return variance.message;
}

function acceptedVarianceLabels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type.replaceAll("_", " ") : "Commercial variance";
    const note = typeof record.note === "string" ? record.note.trim() : "";
    return [note ? `${type}: ${note}` : type];
  });
}

function allocationAcceptedVarianceLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return acceptedVarianceLabels((value as Record<string, unknown>).acceptedVariances);
}

export async function getPurchaseOrderSupplierInvoiceDetail(params: {
  purchaseOrderId: string;
  supplierInvoiceId: string;
  expectedProjectId?: string | null;
}): Promise<PurchaseOrderSupplierInvoiceDetail> {
  const summaryResult = await getPurchaseOrderSupplierInvoiceSummaries({
    purchaseOrderId: params.purchaseOrderId,
    expectedProjectId: params.expectedProjectId,
  });
  const summary = summaryResult.summary.rows.find((row) => row.supplierInvoiceId === params.supplierInvoiceId);
  if (!summary) throw new Error("Supplier Invoice is not allocated to this Purchase Order.");

  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) throw new Error("You do not have access to this Supplier Invoice.");
  const supabase = await createServerSupabaseClient();
  const canPerformAccountsActions = await hasOrganizationPermission(
    currentMember.organization_id,
    "supplier_invoices.accounts_approve"
  );

  const [
    invoiceResult,
    purchaseOrderResult,
    projectResult,
    linesResult,
    allocationsResult,
    poLinesResult,
    documentsResult,
    submissionsResult,
    decisionsResult,
    accountsResult,
    activityResult,
    accountingDocumentResult,
    commercialComparison,
  ] = await Promise.all([
    supabase.from("supplier_invoices")
      .select("id, supplier_id, invoice_number, invoice_date, due_date, supplier_po_reference, currency, subtotal, tax_total, total, created_at, source")
      .eq("organization_id", currentMember.organization_id)
      .eq("id", params.supplierInvoiceId)
      .maybeSingle(),
    supabase.from("project_purchase_orders")
      .select("id, project_id, purchase_order_number, purchase_order_title")
      .eq("organization_id", currentMember.organization_id)
      .eq("id", params.purchaseOrderId)
      .maybeSingle(),
    supabase.from("organization_projects")
      .select("id, name")
      .eq("organization_id", currentMember.organization_id)
      .eq("id", summary.projectId)
      .maybeSingle(),
    supabase.from("supplier_invoice_lines")
      .select("id, description, quantity, unit_price, line_total, tax_amount, sort_order")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .order("sort_order", { ascending: true }),
    supabase.from("supplier_invoice_line_allocations")
      .select("id, supplier_invoice_line_id, purchase_order_id, purchase_order_line_item_id, allocated_quantity, allocated_amount, allocation_status, edit_state, tax_resolution_status, approval_status, approval_notes, approval_checks_json, reviewed_by_user_id, reviewed_at")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId),
    supabase.from("project_purchase_order_line_items")
      .select("id, description, quantity, rate, total, sort_order")
      .eq("organization_id", currentMember.organization_id)
      .eq("purchase_order_id", params.purchaseOrderId)
      .order("sort_order", { ascending: true }),
    supabase.from("supplier_invoice_documents")
      .select("id, file_name, file_path, document_type, mime_type, created_at")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .order("created_at", { ascending: true }),
    supabase.from("supplier_invoice_site_review_submissions")
      .select("id, status, submitted_at, invalidated_at, invalidation_reason")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .order("submitted_at", { ascending: true }),
    supabase.from("supplier_invoice_site_review_decisions")
      .select("id, submission_id, decision, reviewer_id, reviewed_at, note, accepted_variances, invalidated_at, invalidation_reason")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .eq("purchase_order_id", params.purchaseOrderId),
    supabase.from("supplier_invoice_accounts_approvals")
      .select("id, site_review_submission_id, status, approved_by, approved_at, approval_note, invalidated_at, invalidation_reason, created_at")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .order("created_at", { ascending: false }),
    supabase.from("supplier_invoice_activity_events")
      .select("id, event_type, message, created_at, created_by")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("organization_accounting_documents")
      .select("external_document_number, normalized_external_status, amount_paid, amount_due, fully_paid_at, last_status_synced_at, last_status_sync_error, updated_at")
      .eq("organization_id", currentMember.organization_id)
      .eq("local_document_type", "supplier_invoice")
      .eq("local_document_id", params.supplierInvoiceId)
      .order("updated_at", { ascending: false })
      .limit(1),
    getSupplierInvoiceCommercialComparison({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
    }),
  ]);

  [
    [invoiceResult.error, "Unable to load the Supplier Invoice."],
    [purchaseOrderResult.error, "Unable to load the Purchase Order."],
    [projectResult.error, "Unable to load the project."],
    [linesResult.error, "Unable to load Supplier Invoice lines."],
    [allocationsResult.error, "Unable to load Supplier Invoice allocations."],
    [poLinesResult.error, "Unable to load Purchase Order lines."],
    [documentsResult.error, "Unable to load Supplier Invoice documents."],
    [submissionsResult.error, "Unable to load site-review history."],
    [decisionsResult.error, "Unable to load site-review decisions."],
    [accountsResult.error, "Unable to load Accounts approval."],
    [activityResult.error, "Unable to load Supplier Invoice activity."],
    [accountingDocumentResult.error, "Unable to load Xero Bill status."],
  ].forEach(([error, message]) => safeError(error as { message: string } | null, String(message)));

  const invoice = invoiceResult.data;
  const purchaseOrder = purchaseOrderResult.data;
  const project = projectResult.data;
  if (!invoice || !purchaseOrder || !project) throw new Error("Supplier Invoice detail is no longer available.");

  const supplierResult = invoice.supplier_id
    ? await supabase.from("organization_suppliers")
        .select("id, company_name, name")
        .eq("organization_id", currentMember.organization_id)
        .eq("id", invoice.supplier_id)
        .maybeSingle()
    : { data: null, error: null };
  safeError(supplierResult.error, "Unable to load the Supplier.");

  const submissions = submissionsResult.data ?? [];
  const activeSubmission = latestBy(
    submissions.filter((submission) => ACTIVE_SUBMISSION_STATUSES.includes(submission.status)),
    (submission) => submission.submitted_at
  );
  const latestSubmission = latestBy(submissions, (submission) => submission.submitted_at);
  const currentDecision = activeSubmission
    ? (decisionsResult.data ?? []).find((decision) => decision.submission_id === activeSubmission.id) ?? null
    : latestBy(decisionsResult.data ?? [], (decision) => decision.reviewed_at);
  const currentAccountsApproval = latestBy(accountsResult.data ?? [], (approval) => approval.created_at);

  const userIds = Array.from(new Set([
    currentDecision?.reviewer_id,
    currentAccountsApproval?.approved_by,
    ...(allocationsResult.data ?? []).map((allocation) => allocation.reviewed_by_user_id),
    ...(activityResult.data ?? []).map((event) => event.created_by),
  ].filter((value): value is string => Boolean(value))));
  const membersResult = userIds.length
    ? await supabase.from("organization_members")
        .select("user_id, display_name")
        .eq("organization_id", currentMember.organization_id)
        .in("user_id", userIds)
    : { data: [], error: null };
  safeError(membersResult.error, "Unable to load reviewer details.");
  const memberNames = new Map((membersResult.data ?? []).map((member) => [member.user_id, member.display_name]));

  const linesById = new Map((linesResult.data ?? []).map((line) => [line.id, line]));
  const poLinesById = new Map((poLinesResult.data ?? []).map((line) => [line.id, line]));
  const poProgress = commercialComparison.purchaseOrderProgress.find((progress) => progress.purchaseOrderId === params.purchaseOrderId);
  const progressByLineId = new Map((poProgress?.lines ?? []).map((line) => [line.id, line]));
  const activeAllocations = (allocationsResult.data ?? []).filter(
    (allocation) => ACTIVE_ALLOCATION_STATUSES.includes(allocation.allocation_status)
      && ACTIVE_EDIT_STATES.includes(allocation.edit_state)
  );
  const currentPoAllocations = activeAllocations.filter((allocation) => allocation.purchase_order_id === params.purchaseOrderId);
  const allocationDetails = currentPoAllocations.flatMap<PurchaseOrderSupplierInvoiceAllocationDetail>((allocation) => {
    const line = linesById.get(allocation.supplier_invoice_line_id);
    const poLine = allocation.purchase_order_line_item_id ? poLinesById.get(allocation.purchase_order_line_item_id) : null;
    if (!line || !poLine) return [];
    const progress = progressByLineId.get(poLine.id);
    const variances = commercialComparison.variances.filter(
      (variance) => variance.allocationId === allocation.id || variance.purchaseOrderLineItemId === poLine.id
    );
    return [{
      allocationId: allocation.id,
      invoiceLineId: line.id,
      invoiceLineDescription: line.description,
      invoiceQuantity: Number(line.quantity),
      invoiceUnitRate: Number(line.unit_price),
      invoiceLineAmount: Number(line.line_total),
      purchaseOrderLineDescription: poLine.description,
      allocatedQuantity: allocation.allocated_quantity == null ? null : Number(allocation.allocated_quantity),
      allocatedAmount: Number(allocation.allocated_amount),
      previouslyApprovedQuantity: Number(progress?.previouslyApprovedQuantity ?? 0),
      previouslyApprovedValue: Number(progress?.previouslyApprovedValue ?? 0),
      currentApprovedQuantity: Number(progress?.currentQuantity ?? allocation.allocated_quantity ?? 0),
      currentApprovedValue: Number(progress?.currentValue ?? allocation.allocated_amount),
      remainingQuantity: Number(progress?.projectedRemainingQuantity ?? 0),
      remainingValue: Number(progress?.reportingRemainingValue ?? 0),
      taxBasis: summary.allocationTaxBasis,
      varianceLabels: variances.map(varianceLabel),
      teamReview: {
        status: allocation.approval_status === "approved"
          ? "approved"
          : allocation.approval_status === "disputed"
            ? "declined"
            : "waiting",
        reviewerName: allocation.reviewed_by_user_id
          ? memberNames.get(allocation.reviewed_by_user_id) ?? "Unknown reviewer"
          : null,
        reviewedAt: allocation.reviewed_at,
        comment: allocation.approval_notes?.trim() || null,
        acceptedVariances: allocationAcceptedVarianceLabels(allocation.approval_checks_json),
      },
    }];
  });

  const documentDetails = await Promise.all((documentsResult.data ?? []).map(async (document) => {
    const { data } = await supabase.storage
      .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
      .createSignedUrl(document.file_path, 60 * 60);
    return {
      id: document.id,
      fileName: document.file_name,
      documentType: document.document_type,
      mimeType: document.mime_type,
      uploadedAt: document.created_at,
      openUrl: data?.signedUrl ?? null,
    };
  }));
  const accountingDocument = accountingDocumentResult.data?.[0] ?? null;
  const supplier = supplierResult.data;
  const submissionVersion = activeSubmission
    ? submissions.findIndex((submission) => submission.id === activeSubmission.id) + 1
    : latestSubmission
      ? submissions.findIndex((submission) => submission.id === latestSubmission.id) + 1
      : null;

  return {
    supplierInvoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    supplierName: supplier?.company_name?.trim() || supplier?.name?.trim() || summary.supplierName,
    invoiceDate: invoice.invoice_date,
    dueDate: invoice.due_date,
    supplierPoReference: invoice.supplier_po_reference,
    currency: invoice.currency,
    subtotal: Number(invoice.subtotal),
    taxTotal: Number(invoice.tax_total),
    total: Number(invoice.total),
    capturedAt: invoice.created_at,
    source: invoice.source,
    projectName: project.name,
    purchaseOrderNumber: purchaseOrder.purchase_order_number,
    purchaseOrderTitle: purchaseOrder.purchase_order_title,
    poAllocatedAmount: summary.poAllocatedAmount,
    allocationTaxBasis: summary.allocationTaxBasis,
    allocatedToOtherPurchaseOrders: activeAllocations.some(
      (allocation) => allocation.purchase_order_id && allocation.purchase_order_id !== params.purchaseOrderId
    ),
    allocations: allocationDetails,
    siteReview: {
      status: summary.siteReviewStatus,
      submissionVersion,
      submittedAt: activeSubmission?.submitted_at ?? latestSubmission?.submitted_at ?? null,
      reviewerName: currentDecision?.reviewer_id ? memberNames.get(currentDecision.reviewer_id) ?? "Unknown reviewer" : null,
      reviewedAt: currentDecision?.reviewed_at ?? null,
      note: currentDecision?.note?.trim() || null,
      acceptedVariances: acceptedVarianceLabels(currentDecision?.accepted_variances),
      invalidationReason: currentDecision?.invalidation_reason ?? latestSubmission?.invalidation_reason ?? null,
    },
    accountsApproval: {
      status: summary.accountsApprovalStatus,
      approverName: currentAccountsApproval?.approved_by ? memberNames.get(currentAccountsApproval.approved_by) ?? "Unknown approver" : null,
      approvedAt: currentAccountsApproval?.approved_at ?? null,
      note: currentAccountsApproval?.approval_note?.trim() || null,
      current: summary.accountsApprovalStatus === "approved",
      invalidationReason: currentAccountsApproval?.invalidation_reason ?? null,
    },
    xero: {
      status: summary.xeroStatus,
      billReference: accountingDocument?.external_document_number ?? null,
      amountPaid: accountingDocument?.amount_paid == null ? null : Number(accountingDocument.amount_paid),
      amountDue: accountingDocument?.amount_due == null ? null : Number(accountingDocument.amount_due),
      fullyPaidAt: accountingDocument?.fully_paid_at ?? null,
      lastStatusSyncedAt: accountingDocument?.last_status_synced_at ?? null,
      safeRefreshWarning: accountingDocument?.last_status_sync_error ? "Xero status refresh needs attention." : null,
    },
    documents: documentDetails,
    activity: (activityResult.data ?? []).map((event) => ({
      id: event.id,
      eventType: event.event_type,
      message: event.message,
      occurredAt: event.created_at,
      actorName: event.created_by ? memberNames.get(event.created_by) ?? null : null,
    })),
    canReview: summaryResult.summary.canReviewSiteDecisions
      && Boolean(activeSubmission)
      && allocationDetails.some((allocation) => allocation.teamReview.status === "waiting"),
    canPerformAccountsActions,
    fullInvoiceHref: `/app/company/supplier-invoices/${invoice.id}`,
  };
}
