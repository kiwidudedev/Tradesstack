import "server-only";

import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getPurchaseOrderInvoicingProgress } from "@/lib/procurement-commercial-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  buildPurchaseOrderSupplierInvoiceSummaryPayload,
  type PurchaseOrderInvoiceSummarySource,
  type PurchaseOrderSupplierInvoiceSummaryPayload,
} from "@/lib/purchase-order-supplier-invoice-summary";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PurchaseOrderSupplierInvoiceSummaryResult = {
  summary: PurchaseOrderSupplierInvoiceSummaryPayload;
  commercialProgress: Awaited<ReturnType<typeof getPurchaseOrderInvoicingProgress>>;
};

function requireNoQueryError(error: { message: string } | null, safeMessage: string) {
  if (error) throw new Error(safeMessage);
}

export async function getPurchaseOrderSupplierInvoiceSummaries(params: {
  purchaseOrderId: string;
  expectedProjectId?: string | null;
}): Promise<PurchaseOrderSupplierInvoiceSummaryResult> {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) throw new Error("You do not have access to this Purchase Order.");

  const supabase = await createServerSupabaseClient();
  const [canViewInvoices, canReviewSiteDecisions, canPerformAccountsActions, canSubmitSiteReview] =
    await Promise.all([
      hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.view"),
      hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.site_review"),
      hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.accounts_approve"),
      hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.submit_site_review"),
    ]);
  if (!canViewInvoices) throw new Error("You do not have access to Supplier Invoices.");

  const { data: purchaseOrder, error: purchaseOrderError } = await supabase
    .from("project_purchase_orders")
    .select("id, organization_id, project_id")
    .eq("organization_id", currentMember.organization_id)
    .eq("id", params.purchaseOrderId)
    .maybeSingle();
  requireNoQueryError(purchaseOrderError, "Unable to load the Purchase Order.");
  if (!purchaseOrder) throw new Error("Purchase Order not found.");
  if (params.expectedProjectId && purchaseOrder.project_id !== params.expectedProjectId) {
    throw new Error("Purchase Order project does not match.");
  }

  const privilegedRole = currentMember.role === "owner" || currentMember.role === "admin";
  let hasProjectAccess = privilegedRole;
  if (!hasProjectAccess) {
    const { data: projectMembership, error: projectMembershipError } = await supabase
      .from("project_members")
      .select("id")
      .eq("organization_id", currentMember.organization_id)
      .eq("project_id", purchaseOrder.project_id)
      .eq("organization_member_id", currentMember.id)
      .eq("is_active", true)
      .maybeSingle();
    requireNoQueryError(projectMembershipError, "Unable to verify Purchase Order project access.");
    hasProjectAccess = Boolean(projectMembership);
  }
  if (!hasProjectAccess) throw new Error("You do not have access to this Purchase Order project.");

  const [matchesResult, commercialProgress] = await Promise.all([
    supabase
      .from("supplier_invoice_purchase_order_matches")
      .select("supplier_invoice_id, match_status")
      .eq("organization_id", currentMember.organization_id)
      .eq("purchase_order_id", purchaseOrder.id)
      .in("match_status", ["accepted", "adjusted"]),
    getPurchaseOrderInvoicingProgress({
      supabase,
      organizationId: currentMember.organization_id,
      purchaseOrderId: purchaseOrder.id,
    }),
  ]);
  requireNoQueryError(matchesResult.error, "Unable to load Purchase Order invoice relationships.");
  const matches = matchesResult.data ?? [];
  const invoiceIds = Array.from(new Set(matches.map((match) => match.supplier_invoice_id)));

  if (invoiceIds.length === 0) {
    return {
      commercialProgress,
      summary: buildPurchaseOrderSupplierInvoiceSummaryPayload({
        purchaseOrderId: purchaseOrder.id,
        projectId: purchaseOrder.project_id,
        canReviewSiteDecisions: canReviewSiteDecisions && hasProjectAccess,
        canPerformAccountsActions,
        canSubmitSiteReview,
        matches: [],
        invoices: [],
        suppliers: [],
        allocations: [],
        submissions: [],
        decisions: [],
        accountsApprovals: [],
        commercialApprovals: [],
        accountingDocuments: [],
        members: [],
        commercialProgress,
      }),
    };
  }

  const [
    invoicesResult,
    allocationsResult,
    submissionsResult,
    decisionsResult,
    accountsApprovalsResult,
    commercialApprovalsResult,
    accountingDocumentsResult,
  ] = await Promise.all([
    supabase
      .from("supplier_invoices")
      .select("id, supplier_id, invoice_number, invoice_date, due_date, subtotal, total")
      .eq("organization_id", currentMember.organization_id)
      .in("id", invoiceIds),
    supabase
      .from("supplier_invoice_line_allocations")
      .select("id, supplier_invoice_id, purchase_order_id, allocated_amount, allocation_status, edit_state")
      .eq("organization_id", currentMember.organization_id)
      .in("supplier_invoice_id", invoiceIds),
    supabase
      .from("supplier_invoice_site_review_submissions")
      .select("id, supplier_invoice_id, finance_hash, status, submitted_at")
      .eq("organization_id", currentMember.organization_id)
      .in("supplier_invoice_id", invoiceIds)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("supplier_invoice_site_review_decisions")
      .select("id, submission_id, supplier_invoice_id, purchase_order_id, decision, reviewer_id, reviewed_at, note")
      .eq("organization_id", currentMember.organization_id)
      .eq("purchase_order_id", purchaseOrder.id)
      .in("supplier_invoice_id", invoiceIds),
    supabase
      .from("supplier_invoice_accounts_approvals")
      .select("id, supplier_invoice_id, site_review_submission_id, finance_hash, status, approved_by, approved_at, created_at")
      .eq("organization_id", currentMember.organization_id)
      .in("supplier_invoice_id", invoiceIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("supplier_invoice_commercial_approvals")
      .select("supplier_invoice_id, finance_version_hash, status, reviewed_at")
      .eq("organization_id", currentMember.organization_id)
      .in("supplier_invoice_id", invoiceIds)
      .order("reviewed_at", { ascending: false }),
    supabase
      .from("organization_accounting_documents")
      .select("id, local_document_id, external_document_id, external_document_number, export_status, normalized_external_status, amount_paid, amount_due, fully_paid_at, last_status_synced_at, last_status_sync_error, updated_at")
      .eq("organization_id", currentMember.organization_id)
      .eq("local_document_type", "supplier_invoice")
      .in("local_document_id", invoiceIds)
      .order("updated_at", { ascending: false }),
  ]);

  const queryResults = [
    invoicesResult,
    allocationsResult,
    submissionsResult,
    decisionsResult,
    accountsApprovalsResult,
    commercialApprovalsResult,
    accountingDocumentsResult,
  ];
  if (queryResults.some((result) => result.error)) {
    throw new Error("Unable to load the authoritative Purchase Order invoice summary.");
  }

  const supplierIds = Array.from(new Set(
    (invoicesResult.data ?? [])
      .map((invoice) => invoice.supplier_id)
      .filter((value): value is string => Boolean(value))
  ));
  const reviewerUserIds = Array.from(new Set([
    ...(decisionsResult.data ?? []).map((decision) => decision.reviewer_id),
    ...(accountsApprovalsResult.data ?? []).map((approval) => approval.approved_by),
  ].filter((value): value is string => Boolean(value))));

  const [suppliersResult, membersResult] = await Promise.all([
    supplierIds.length > 0
      ? supabase
          .from("organization_suppliers")
          .select("id, company_name, name")
          .eq("organization_id", currentMember.organization_id)
          .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    reviewerUserIds.length > 0
      ? supabase
          .from("organization_members")
          .select("user_id, display_name")
          .eq("organization_id", currentMember.organization_id)
          .in("user_id", reviewerUserIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (suppliersResult.error || membersResult.error) {
    throw new Error("Unable to load Supplier Invoice reviewer details.");
  }

  const source: PurchaseOrderInvoiceSummarySource = {
    purchaseOrderId: purchaseOrder.id,
    projectId: purchaseOrder.project_id,
    canReviewSiteDecisions: canReviewSiteDecisions && hasProjectAccess,
    canPerformAccountsActions,
    canSubmitSiteReview,
    matches,
    invoices: invoicesResult.data ?? [],
    suppliers: suppliersResult.data ?? [],
    allocations: allocationsResult.data ?? [],
    submissions: submissionsResult.data ?? [],
    decisions: decisionsResult.data ?? [],
    accountsApprovals: accountsApprovalsResult.data ?? [],
    commercialApprovals: commercialApprovalsResult.data ?? [],
    accountingDocuments: (accountingDocumentsResult.data ?? []).filter(
      (
        document,
      ): document is typeof document & { local_document_id: string } =>
        document.local_document_id !== null,
    ),
    members: membersResult.data ?? [],
    commercialProgress,
  };

  return {
    commercialProgress,
    summary: buildPurchaseOrderSupplierInvoiceSummaryPayload(source),
  };
}
