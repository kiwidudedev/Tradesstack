"use server";

import { revalidatePath } from "next/cache";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import {
  getSupplierInvoiceCommercialComparison,
  type AcceptedCommercialVarianceInput,
  type SupplierInvoiceCommercialComparison,
} from "@/lib/procurement-commercial-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  attachOrReplaceSupplierInvoiceDocument,
  loadSupplierInvoiceDocumentState,
  queueSupplierInvoiceDocumentExtraction,
} from "@/lib/supplier-invoice-document-service";
import {
  approveSupplierInvoiceDraftAllocation,
  disputeSupplierInvoiceDraftAllocation,
  markSupplierInvoiceLineAllocationUnmatched,
  postApprovedSupplierInvoiceActualCosts,
  reverseSupplierInvoiceActualCostEvent,
  saveAcceptedSupplierInvoiceDraftAllocations,
  type SupplierInvoiceActualCostReversalResult,
  type SupplierInvoiceActualCostPostingResult,
  type SupplierInvoiceDraftAllocationCandidateInput,
} from "@/lib/supplier-invoice-allocation-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { SupplierInvoiceLineAllocationRow } from "@/lib/supplier-invoice-allocations";
import { getSupplierInvoiceXeroBillReadiness } from "@/lib/xero/bills";
import { enqueueXeroBillRefresh } from "@/lib/xero/bill-refresh";
import { runXeroSyncWorker } from "@/lib/xero/sync";
import { getXeroAccountTenantId } from "@/lib/accounting/xero-account-tenant";
import { deleteSupplierInvoice } from "@/lib/supplier-invoice-delete-service";
import { repairSupplierInvoiceTax } from "@/lib/supplier-invoice-tax-repair";
import {
  getSupplierInvoiceWorkflowState,
  suggestSupplierInvoicePurchaseOrders,
  type SupplierInvoicePurchaseOrderSuggestion,
  type SupplierInvoiceWorkflowState,
} from "@/lib/supplier-invoice-workflow";
import type { Json } from "@/lib/supabase/types";
import type {
  SupplierInvoiceDocumentExtractionRow,
  SupplierInvoiceDocumentRow,
} from "@/lib/supplier-invoices";

export type SupplierInvoiceDraftAllocationActionResult = {
  ok: boolean;
  allocations?: SupplierInvoiceLineAllocationRow[];
  posting?: SupplierInvoiceActualCostPostingResult;
  reversal?: SupplierInvoiceActualCostReversalResult;
  error?: string;
};

export type SupplierInvoiceCommercialActionResult = {
  ok: boolean;
  comparison?: SupplierInvoiceCommercialComparison;
  error?: string;
};

export type SupplierInvoiceXeroBillActionResult = {
  ok: boolean;
  status?: string;
  jobId?: string | null;
  readiness?: Awaited<ReturnType<typeof getSupplierInvoiceXeroBillReadiness>>;
  workflow?: SupplierInvoiceWorkflowState;
  error?: string;
};

export type SupplierInvoiceWorkflowActionResult = {
  ok: boolean;
  workflow?: SupplierInvoiceWorkflowState;
  suggestions?: SupplierInvoicePurchaseOrderSuggestion[];
  error?: string;
};

export type SupplierInvoiceDeleteActionResult = {
  ok: boolean;
  code?: string;
  error?: string;
};

export type SupplierInvoiceDocumentActionResult = {
  ok: boolean;
  currentDocument?: SupplierInvoiceDocumentRow | null;
  extraction?: SupplierInvoiceDocumentExtractionRow | null;
  invoiceUpdate?: {
    source: "upload";
    document_file_path: string;
    document_file_name: string;
    document_mime_type: string | null;
    document_size_bytes: number;
  };
  error?: string;
};

type SupplierInvoiceCaptureLineInput = {
  id?: string;
  description: string;
  supplierItemCode?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxAmount: number;
  costCodeId: string | null;
  projectId: string | null;
  sortOrder: number;
};

function safeWorkflowActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeFragments = [
    "permission", "not found", "Select a valid Supplier", "invoice number", "invoice date",
    "Due date", "reconcile", "already exists", "line", "locked", "Purchase Order",
    "Supplier mismatch", "cancelled", "site review", "allocation", "routing", "coding",
    "finance data changed", "commercial approval", "Xero", "Accounts approval",
  ];
  return safeFragments.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : "Unable to update the Supplier Invoice workflow. Refresh and try again.";
}

function safeDocumentActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeFragments = [
    "permission",
    "not found",
    "locked",
    "posted actual costs",
    "PDF",
    "file",
    "Document is too large",
    "valid PDF",
    "password-protected",
    "extraction",
    "download",
    "upload",
  ];
  return safeFragments.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : "Unable to update the Supplier Invoice document. Refresh and try again.";
}

function safeDeleteActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeFragments = [
    "permission",
    "deleted",
    "no longer exists",
    "posted actual costs",
    "Xero Bill",
    "exported to Xero",
    "queued or complete",
    "payment has been recorded",
    "could not be deleted",
  ];
  return safeFragments.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : "The Supplier Invoice could not be deleted. No records were removed.";
}

async function requireAccountsWorkflowContext(permission: "supplier_invoices.capture" | "supplier_invoices.submit_site_review" | "supplier_invoices.accounts_approve") {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    throw new Error("You do not have permission to perform this Accounts action.");
  }
  if (!(await hasOrganizationPermission(currentMember.organization_id, permission))) {
    throw new Error("You do not have permission to perform this Accounts action.");
  }
  return { currentMember, supabase: await createServerSupabaseClient() };
}

async function requireSupplierInvoiceViewContext() {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    throw new Error("You do not have permission to view this Supplier Invoice.");
  }
  if (!(await hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.view"))) {
    throw new Error("You do not have permission to view this Supplier Invoice.");
  }
  return { currentMember, supabase: await createServerSupabaseClient() };
}

export async function attachSupplierInvoiceDocumentAction(
  formData: FormData
): Promise<SupplierInvoiceDocumentActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.capture");
    const supplierInvoiceIdValue = formData.get("supplierInvoiceId");
    const fileValue = formData.get("document");

    if (typeof supplierInvoiceIdValue !== "string" || supplierInvoiceIdValue.trim().length === 0) {
      throw new Error("Supplier Invoice not found.");
    }
    if (!(fileValue instanceof File) || fileValue.size <= 0) {
      throw new Error("A PDF file is required.");
    }

    const attached = await attachOrReplaceSupplierInvoiceDocument({
      supabase,
      organizationId: currentMember.organization_id,
      userId: currentMember.user_id,
      supplierInvoiceId: supplierInvoiceIdValue.trim(),
      file: fileValue,
    });

    const extraction = attached.currentDocument
      ? await queueSupplierInvoiceDocumentExtraction({
          supabase,
          organizationId: currentMember.organization_id,
          userId: currentMember.user_id,
          supplierInvoiceId: supplierInvoiceIdValue.trim(),
          supplierInvoiceDocumentId: attached.currentDocument.id,
          force: false,
        })
      : null;

    revalidatePath(`/app/company/supplier-invoices/${supplierInvoiceIdValue.trim()}`);
    return {
      ok: true,
      currentDocument: attached.currentDocument,
      extraction,
      invoiceUpdate: attached.invoiceUpdate,
    };
  } catch (error) {
    return { ok: false, error: safeDocumentActionError(error) };
  }
}

export async function loadSupplierInvoiceDocumentStateAction(params: {
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceDocumentActionResult> {
  try {
    const { currentMember, supabase } = await requireSupplierInvoiceViewContext();
    const state = await loadSupplierInvoiceDocumentState({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
    });

    return {
      ok: true,
      currentDocument: state.currentDocument,
      extraction: state.extraction,
    };
  } catch (error) {
    return { ok: false, error: safeDocumentActionError(error) };
  }
}

export async function retrySupplierInvoiceDocumentExtractionAction(params: {
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceDocumentActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.capture");
    const state = await loadSupplierInvoiceDocumentState({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
    });
    if (!state.currentDocument) {
      throw new Error("No current Supplier Invoice PDF is attached.");
    }

    const extraction = await queueSupplierInvoiceDocumentExtraction({
      supabase,
      organizationId: currentMember.organization_id,
      userId: currentMember.user_id,
      supplierInvoiceId: params.supplierInvoiceId,
      supplierInvoiceDocumentId: state.currentDocument.id,
      force: true,
    });

    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return {
      ok: true,
      currentDocument: state.currentDocument,
      extraction,
    };
  } catch (error) {
    return { ok: false, error: safeDocumentActionError(error) };
  }
}

export async function saveSupplierInvoiceCaptureAction(params: {
  supplierInvoiceId: string;
  supplierId: string;
  invoiceNumber: string;
  supplierPoReference: string | null;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  notes: string;
  lines: SupplierInvoiceCaptureLineInput[];
}): Promise<SupplierInvoiceWorkflowActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.capture");
    const { data: existingInvoice, error: invoiceError } = await supabase
      .from("supplier_invoices")
      .select("currency")
      .eq("organization_id", currentMember.organization_id)
      .eq("id", params.supplierInvoiceId)
      .single();
    if (invoiceError) throw new Error(invoiceError.message);
    const { error } = await supabase.rpc("save_supplier_invoice_capture" as never, {
      p_invoice_id: params.supplierInvoiceId,
      p_supplier_id: params.supplierId,
      p_invoice_number: params.invoiceNumber,
      p_supplier_po_reference: params.supplierPoReference,
      p_invoice_date: params.invoiceDate,
      p_due_date: params.dueDate,
      p_currency: existingInvoice.currency,
      p_subtotal: params.subtotal,
      p_tax_total: params.taxTotal,
      p_total: params.total,
      p_notes: params.notes,
      p_source: "manual",
      p_lines: params.lines as unknown as Json,
      p_create: false,
    } as never);
    if (error) throw new Error(error.message);
    const workflow = await getSupplierInvoiceWorkflowState({
      supabase, organizationId: currentMember.organization_id, supplierInvoiceId: params.supplierInvoiceId,
    });
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return { ok: true, workflow };
  } catch (error) {
    return { ok: false, error: safeWorkflowActionError(error) };
  }
}

export async function deleteSupplierInvoiceAction(params: {
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceDeleteActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.capture");
    const result = await deleteSupplierInvoice({
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
      supabase,
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        error: result.message,
      };
    }

    revalidatePath("/app/company/supplier-invoices");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeDeleteActionError(error) };
  }
}

export async function suggestSupplierInvoicePurchaseOrdersAction(params: {
  supplierInvoiceId: string;
  supplierId: string;
  supplierPoReference: string;
}): Promise<SupplierInvoiceWorkflowActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.capture");
    const { data: invoice } = await supabase.from("supplier_invoices").select("id, supplier_id").eq("organization_id", currentMember.organization_id).eq("id", params.supplierInvoiceId).maybeSingle();
    if (!invoice || invoice.supplier_id !== params.supplierId) throw new Error("Supplier Invoice not found or Supplier changed.");
    const suggestions = await suggestSupplierInvoicePurchaseOrders({
      supabase, organizationId: currentMember.organization_id, supplierId: params.supplierId,
      supplierPoReference: params.supplierPoReference,
    });
    const { error: activityError } = await supabase.rpc("record_supplier_invoice_activity_event", {
      p_organization_id: currentMember.organization_id,
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_event_type: "po_suggested",
      p_message: "Purchase Order suggestions generated from the Supplier reference.",
      p_metadata: {
        supplier_po_reference: params.supplierPoReference.trim(),
        candidate_count: suggestions.length,
      },
      p_created_by: currentMember.user_id,
    });
    if (activityError) throw new Error("Unable to record Purchase Order suggestions.");
    return { ok: true, suggestions };
  } catch (error) {
    return { ok: false, error: safeWorkflowActionError(error) };
  }
}

export async function confirmSupplierInvoicePurchaseOrderMatchAction(params: {
  supplierInvoiceId: string;
  purchaseOrderId: string;
}): Promise<SupplierInvoiceWorkflowActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.capture");
    const { error } = await supabase.rpc("set_supplier_invoice_purchase_order_match" as never, {
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_purchase_order_id: params.purchaseOrderId,
      p_remove: false,
    } as never);
    if (error) throw new Error(error.message);
    const workflow = await getSupplierInvoiceWorkflowState({ supabase, organizationId: currentMember.organization_id, supplierInvoiceId: params.supplierInvoiceId });
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return { ok: true, workflow };
  } catch (error) {
    return { ok: false, error: safeWorkflowActionError(error) };
  }
}

export async function removeSupplierInvoicePurchaseOrderMatchAction(params: {
  supplierInvoiceId: string;
  purchaseOrderId: string;
}): Promise<SupplierInvoiceWorkflowActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.capture");
    const { error } = await supabase.rpc("set_supplier_invoice_purchase_order_match" as never, {
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_purchase_order_id: params.purchaseOrderId,
      p_remove: true,
    } as never);
    if (error) throw new Error(error.message);
    const workflow = await getSupplierInvoiceWorkflowState({ supabase, organizationId: currentMember.organization_id, supplierInvoiceId: params.supplierInvoiceId });
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return { ok: true, workflow };
  } catch (error) {
    return { ok: false, error: safeWorkflowActionError(error) };
  }
}

export async function submitSupplierInvoiceForSiteApprovalAction(params: {
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceWorkflowActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.submit_site_review");
    const taxRepairPreview = await repairSupplierInvoiceTax({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
      dryRun: true,
    });
    if (taxRepairPreview.automaticallyResolved > 0) {
      await repairSupplierInvoiceTax({
        supabase,
        organizationId: currentMember.organization_id,
        supplierInvoiceId: params.supplierInvoiceId,
        dryRun: false,
        expectedFinanceHash: taxRepairPreview.financeHash,
      });
    }
    const workflow = await getSupplierInvoiceWorkflowState({ supabase, organizationId: currentMember.organization_id, supplierInvoiceId: params.supplierInvoiceId });
    if (!workflow.financeHash) throw new Error("Supplier Invoice finance data is unavailable.");
    const { error } = await supabase.rpc("submit_supplier_invoice_for_site_review" as never, {
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_expected_finance_hash: workflow.financeHash,
    } as never);
    if (error) throw new Error(error.message);
    const refreshed = await getSupplierInvoiceWorkflowState({ supabase, organizationId: currentMember.organization_id, supplierInvoiceId: params.supplierInvoiceId });
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return { ok: true, workflow: refreshed };
  } catch (error) {
    return { ok: false, error: safeWorkflowActionError(error) };
  }
}

export async function approveSupplierInvoiceForXeroAction(params: {
  supplierInvoiceId: string;
  approvalNote?: string;
}): Promise<SupplierInvoiceWorkflowActionResult> {
  try {
    const { currentMember, supabase } = await requireAccountsWorkflowContext("supplier_invoices.accounts_approve");
    const workflow = await getSupplierInvoiceWorkflowState({ supabase, organizationId: currentMember.organization_id, supplierInvoiceId: params.supplierInvoiceId });
    if (!workflow.financeHash) throw new Error("Supplier Invoice finance data is unavailable.");
    const readiness = await getSupplierInvoiceXeroBillReadiness({
      supabase, organizationId: currentMember.organization_id, supplierInvoiceId: params.supplierInvoiceId,
      requireAccountsApproval: false,
    });
    if (!readiness.ready) throw new Error(readiness.blockers[0]?.message ?? "Supplier Invoice is not ready for Accounts approval.");
    const { error } = await supabase.rpc("record_supplier_invoice_accounts_approval" as never, {
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_site_review_submission_id: workflow.activeSubmissionId,
      p_expected_finance_hash: workflow.financeHash,
      p_approval_note: params.approvalNote?.trim() ?? "",
    } as never);
    if (error) throw new Error(error.message);
    const refreshed = await getSupplierInvoiceWorkflowState({ supabase, organizationId: currentMember.organization_id, supplierInvoiceId: params.supplierInvoiceId });
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return { ok: true, workflow: refreshed };
  } catch (error) {
    return { ok: false, error: safeWorkflowActionError(error) };
  }
}

function safeXeroBillActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeFragments = [
    "permission",
    "Supplier invoice not found",
    "commercial approval",
    "finance version",
    "supplier",
    "Xero Contact",
    "Xero connection",
    "invoice and Bill access",
    "invoice number",
    "invoice and due dates",
    "NZD",
    "line snapshot",
    "AccountID",
    "AccountCode",
    "TaxType",
    "reconcile",
    "queued",
    "cancelled",
    "claimed",
    "refresh",
    "exported Xero Bill",
    "rate limiting",
    "authorization",
  ];
  return safeFragments.some((fragment) =>
    message.toLowerCase().includes(fragment.toLowerCase())
  )
    ? message
    : "Unable to update the Draft Xero Bill export. Refresh and try again.";
}

async function requireSupplierInvoiceXeroBillContext(
  invoiceId: string,
  permission: "accounting.ap_bills.view" | "accounting.ap_bills.export" | "accounting.ap_bills.retry",
) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    throw new Error("You do not have access to this supplier invoice.");
  }
  if (!["owner", "admin"].includes(currentMember.role)) {
    throw new Error("You do not have permission to perform Accounts commercial review.");
  }
  if (!(await hasOrganizationPermission(currentMember.organization_id, permission))) {
    throw new Error("You do not have permission to manage Xero Bill exports.");
  }
  const supabase = await createServerSupabaseClient();
  const { data: invoice, error } = await supabase
    .from("supplier_invoices")
    .select("id")
    .eq("organization_id", currentMember.organization_id)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !invoice) {
    throw new Error("Supplier invoice not found.");
  }
  return { currentMember, supabase };
}

export async function refreshSupplierInvoiceXeroBillStatusAction(params: {
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceXeroBillActionResult> {
  try {
    const { currentMember, supabase } =
      await requireSupplierInvoiceXeroBillContext(
        params.supplierInvoiceId,
        "accounting.ap_bills.view",
      );
    const documentResult = await supabase
      .from("organization_accounting_documents")
      .select("id")
      .eq("organization_id", currentMember.organization_id)
      .eq("local_document_type", "supplier_invoice")
      .eq("local_document_id", params.supplierInvoiceId)
      .not("external_document_id", "is", null)
      .maybeSingle();
    if (documentResult.error || !documentResult.data) {
      throw new Error("The exported Xero Bill could not be found.");
    }

    const queued = await enqueueXeroBillRefresh({
      organizationId: currentMember.organization_id,
      documentId: documentResult.data.id,
      createdByUserId: currentMember.user_id,
      triggerSource: "manual_refresh",
    });
    await runXeroSyncWorker({
      organizationId: currentMember.organization_id,
      jobId: queued.jobId,
      limit: 1,
      workerId: "xero-bill-manual-refresh",
    });
    const admin = await createAdminSupabaseClient();
    const jobResult = await admin
      .from("organization_accounting_sync_jobs" as never)
      .select("queue_state, last_error")
      .eq("id", queued.jobId)
      .maybeSingle();
    const job = jobResult.data as { queue_state?: string; last_error?: string | null } | null;
    if (jobResult.error || !job || job.queue_state !== "completed") {
      throw new Error(job?.last_error ?? "The Xero Bill status refresh did not complete.");
    }

    const [readiness, workflow] = await Promise.all([
      getSupplierInvoiceXeroBillReadiness({
        supabase,
        organizationId: currentMember.organization_id,
        supplierInvoiceId: params.supplierInvoiceId,
      }),
      getSupplierInvoiceWorkflowState({
        supabase,
        organizationId: currentMember.organization_id,
        supplierInvoiceId: params.supplierInvoiceId,
      }),
    ]);
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return {
      ok: true,
      status: readiness.resolvedSummary.normalizedExternalStatus ?? "unknown",
      jobId: queued.jobId,
      readiness,
      workflow,
    };
  } catch (error) {
    return { ok: false, error: safeXeroBillActionError(error) };
  }
}

export async function prepareSupplierInvoiceXeroBillExportAction(params: {
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceXeroBillActionResult> {
  try {
    const { currentMember, supabase } =
      await requireSupplierInvoiceXeroBillContext(
        params.supplierInvoiceId,
        "accounting.ap_bills.export",
      );
    const admin = await createAdminSupabaseClient();
    const activeJobResult = await admin
      .from("organization_accounting_sync_jobs" as never)
      .select("id, queue_state, request_payload")
      .eq("organization_id", currentMember.organization_id)
      .eq("job_kind", "xero.bill.export")
      .in("queue_state", ["pending", "claimed", "retry_scheduled"] as never)
      .order("created_at", { ascending: false });
    if (activeJobResult.error) {
      throw new Error("Unable to inspect active Xero Bill jobs.");
    }
    const existingJob = (
      (activeJobResult.data ?? []) as Array<{
        id: string;
        queue_state: string;
        request_payload: Record<string, unknown>;
      }>
    ).find(
      (job) =>
        job.request_payload?.supplierInvoiceId === params.supplierInvoiceId,
    );
    if (existingJob) {
      return {
        ok: true,
        status:
          existingJob.queue_state === "claimed" ? "exporting" : "queued",
        jobId: existingJob.id,
      };
    }
    const readiness = await getSupplierInvoiceXeroBillReadiness({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
    });
    if (!readiness.ready) {
      throw new Error(readiness.blockers[0]?.message ?? "This Supplier Invoice is not ready for Xero export.");
    }
    const { data, error } = await supabase.rpc(
      "prepare_supplier_invoice_xero_bill_export" as never,
      {
        p_organization_id: currentMember.organization_id,
        p_supplier_invoice_id: params.supplierInvoiceId,
      } as never,
    );
    if (error) {
      const retryJobResult = await admin
        .from("organization_accounting_sync_jobs" as never)
        .select("id, queue_state, request_payload")
        .eq("organization_id", currentMember.organization_id)
        .eq("job_kind", "xero.bill.export")
        .in("queue_state", ["pending", "claimed", "retry_scheduled"] as never)
        .order("created_at", { ascending: false });
      const racedJob = (
        (retryJobResult.data ?? []) as Array<{
          id: string;
          queue_state: string;
          request_payload: Record<string, unknown>;
        }>
      ).find(
        (job) =>
          job.request_payload?.supplierInvoiceId === params.supplierInvoiceId,
      );
      if (racedJob) {
        return {
          ok: true,
          status: racedJob.queue_state === "claimed" ? "exporting" : "queued",
          jobId: racedJob.id,
        };
      }
      throw new Error(error.message);
    }
    const result = (data ?? {}) as Record<string, unknown>;
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return {
      ok: true,
      status: typeof result.status === "string" ? result.status : "queued",
      jobId: typeof result.jobId === "string" ? result.jobId : null,
    };
  } catch (error) {
    return { ok: false, error: safeXeroBillActionError(error) };
  }
}

export async function retrySupplierInvoiceXeroBillExportAction(params: {
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceXeroBillActionResult> {
  try {
    const { currentMember, supabase } =
      await requireSupplierInvoiceXeroBillContext(
        params.supplierInvoiceId,
        "accounting.ap_bills.retry",
      );
    const { data, error } = await supabase.rpc(
      "retry_supplier_invoice_xero_bill_export" as never,
      {
        p_organization_id: currentMember.organization_id,
        p_supplier_invoice_id: params.supplierInvoiceId,
      } as never,
    );
    if (error) {
      throw new Error(error.message);
    }
    const result = (data ?? {}) as Record<string, unknown>;
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return {
      ok: true,
      status: "queued",
      jobId: typeof result.jobId === "string" ? result.jobId : null,
    };
  } catch (error) {
    return { ok: false, error: safeXeroBillActionError(error) };
  }
}

export async function cancelSupplierInvoiceXeroBillExportAction(params: {
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceXeroBillActionResult> {
  try {
    const { currentMember, supabase } =
      await requireSupplierInvoiceXeroBillContext(
        params.supplierInvoiceId,
        "accounting.ap_bills.export",
      );
    const { data, error } = await supabase.rpc(
      "cancel_supplier_invoice_xero_bill_export" as never,
      {
        p_organization_id: currentMember.organization_id,
        p_supplier_invoice_id: params.supplierInvoiceId,
      } as never,
    );
    if (error) {
      throw new Error(error.message);
    }
    const result = (data ?? {}) as Record<string, unknown>;
    revalidatePath(`/app/company/supplier-invoices/${params.supplierInvoiceId}`);
    return {
      ok: true,
      status: typeof result.status === "string" ? result.status : "cancelled",
      jobId: typeof result.jobId === "string" ? result.jobId : null,
    };
  } catch (error) {
    return { ok: false, error: safeXeroBillActionError(error) };
  }
}

function safeCommercialActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeFragments = [
    "commercially approve",
    "commercially reject",
    "Supplier invoice not found",
    "Select a supplier",
    "invoice number",
    "invoice date",
    "invoice line",
    "line snapshot",
    "active allocation",
    "Allocated amounts",
    "accounting",
    "tax",
    "supplier does not match",
    "duplicate",
    "same invoice number",
    "no-PO",
    "over-invoice",
    "routing code",
    "variance",
    "changed while",
    "reconcile",
    "rejection reason",
  ];

  return safeFragments.some((fragment) =>
    message.toLowerCase().includes(fragment.toLowerCase())
  )
    ? message
    : "Unable to update the commercial review. Refresh and try again.";
}

async function requireSupplierInvoiceCommercialContext(invoiceId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    throw new Error("You do not have access to this supplier invoice.");
  }
  const canReview = await hasOrganizationPermission(
    currentMember.organization_id,
    "supplier_invoices.review"
  );
  if (!canReview) {
    throw new Error(
      "You do not have permission to commercially approve supplier invoices."
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: invoice, error } = await supabase
    .from("supplier_invoices")
    .select("id")
    .eq("organization_id", currentMember.organization_id)
    .eq("id", invoiceId)
    .maybeSingle();

  if (error || !invoice) {
    throw new Error("Supplier invoice not found.");
  }

  return { currentMember, supabase };
}

async function requireSupplierInvoiceAllocationContext(organizationId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember || currentMember.organization_id !== organizationId) {
    throw new Error("You do not have access to this organization.");
  }
  if (!["owner", "admin"].includes(currentMember.role)) {
    throw new Error("You do not have permission to allocate or code Supplier Invoices.");
  }

  const [canWrite, canReview] = await Promise.all([
    hasOrganizationPermission(organizationId, "supplier_invoices.write"),
    hasOrganizationPermission(organizationId, "supplier_invoices.review"),
  ]);

  if (!canWrite) {
    throw new Error("You do not have permission to save supplier invoice draft allocations.");
  }

  return {
    currentMember,
    canWrite,
    canReview,
    supabase: await createServerSupabaseClient(),
  };
}

async function requireSupplierInvoicePostingContext(organizationId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember || currentMember.organization_id !== organizationId) {
    throw new Error("You do not have access to this organization.");
  }
  if (!["owner", "admin"].includes(currentMember.role)) {
    throw new Error("You do not have permission to post Supplier Invoice actual costs.");
  }

  const canReview = await hasOrganizationPermission(organizationId, "supplier_invoices.review");
  if (!canReview) {
    throw new Error("You do not have permission to post supplier invoice actual costs.");
  }

  return {
    currentMember,
    canReview,
    supabase: await createServerSupabaseClient(),
  };
}

async function requireSupplierInvoiceActualCostReversalContext(organizationId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember || currentMember.organization_id !== organizationId) {
    throw new Error("You do not have access to this organization.");
  }

  const canReverse = await hasOrganizationPermission(organizationId, "actual_costs.reverse");
  if (!canReverse) {
    throw new Error("You do not have permission to reverse actual costs.");
  }

  return {
    currentMember,
    canReverse,
    supabase: await createServerSupabaseClient(),
  };
}

export async function saveSupplierInvoiceDraftAllocationAction(params: {
  organizationId: string;
  supplierInvoiceId: string;
  invoiceLineId: string;
  purchaseOrderLineItemId: string;
}): Promise<SupplierInvoiceDraftAllocationActionResult> {
  try {
    const context = await requireSupplierInvoiceAllocationContext(params.organizationId);
    const allocations = await saveAcceptedSupplierInvoiceDraftAllocations({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      canWrite: context.canWrite,
      canReview: context.canReview,
      actorUserId: context.currentMember.user_id,
      candidates: [
        {
          invoiceLineId: params.invoiceLineId,
          purchaseOrderLineItemId: params.purchaseOrderLineItemId,
        },
      ],
    });

    return { ok: true, allocations };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save draft allocation.",
    };
  }
}

export async function saveAllReadySupplierInvoiceDraftAllocationsAction(params: {
  organizationId: string;
  supplierInvoiceId: string;
  candidates: SupplierInvoiceDraftAllocationCandidateInput[];
}): Promise<SupplierInvoiceDraftAllocationActionResult> {
  try {
    const context = await requireSupplierInvoiceAllocationContext(params.organizationId);
    const allocations = await saveAcceptedSupplierInvoiceDraftAllocations({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      canWrite: context.canWrite,
      canReview: context.canReview,
      actorUserId: context.currentMember.user_id,
      candidates: params.candidates,
    });

    return { ok: true, allocations };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save ready draft allocations.",
    };
  }
}

export async function markSupplierInvoiceLineAllocationUnmatchedAction(params: {
  organizationId: string;
  supplierInvoiceId: string;
  invoiceLineId: string;
}): Promise<SupplierInvoiceDraftAllocationActionResult> {
  try {
    const context = await requireSupplierInvoiceAllocationContext(params.organizationId);
    const allocations = await markSupplierInvoiceLineAllocationUnmatched({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      invoiceLineId: params.invoiceLineId,
      canWrite: context.canWrite,
      canReview: context.canReview,
      actorUserId: context.currentMember.user_id,
    });

    return { ok: true, allocations };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to mark the invoice line as unmatched.",
    };
  }
}

export async function approveSupplierInvoiceDraftAllocationAction(params: {
  organizationId: string;
  supplierInvoiceId: string;
  allocationId: string;
  note?: string | null;
}): Promise<SupplierInvoiceDraftAllocationActionResult> {
  try {
    const context = await requireSupplierInvoiceAllocationContext(params.organizationId);
    if (!context.canReview) {
      throw new Error("You do not have permission to review supplier invoice line allocations.");
    }

    const allocations = await approveSupplierInvoiceDraftAllocation({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      allocationId: params.allocationId,
      actorUserId: context.currentMember.user_id,
      canReview: context.canReview,
      note: params.note ?? null,
    });

    return { ok: true, allocations };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to approve the draft allocation.",
    };
  }
}

export async function disputeSupplierInvoiceDraftAllocationAction(params: {
  organizationId: string;
  supplierInvoiceId: string;
  allocationId: string;
  note: string;
}): Promise<SupplierInvoiceDraftAllocationActionResult> {
  try {
    const context = await requireSupplierInvoiceAllocationContext(params.organizationId);
    if (!context.canReview) {
      throw new Error("You do not have permission to review supplier invoice line allocations.");
    }

    const allocations = await disputeSupplierInvoiceDraftAllocation({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      allocationId: params.allocationId,
      actorUserId: context.currentMember.user_id,
      canReview: context.canReview,
      note: params.note,
    });

    return { ok: true, allocations };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to dispute the draft allocation.",
    };
  }
}

export async function postSupplierInvoiceActualCostsAction(params: {
  organizationId: string;
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceDraftAllocationActionResult> {
  try {
    const context = await requireSupplierInvoicePostingContext(params.organizationId);
    const posting = await postApprovedSupplierInvoiceActualCosts({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      actorUserId: context.currentMember.user_id,
      canReview: context.canReview,
    });

    return { ok: true, posting };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to post actual costs.",
    };
  }
}

export async function approveSupplierInvoiceCommerciallyAction(params: {
  supplierInvoiceId: string;
  acceptedVariances: AcceptedCommercialVarianceInput[];
  noPoReason?: string | null;
  noPoExplanation?: string | null;
  approvalNote?: string | null;
}): Promise<SupplierInvoiceCommercialActionResult> {
  try {
    const { currentMember, supabase } =
      await requireSupplierInvoiceCommercialContext(params.supplierInvoiceId);
    const comparison = await getSupplierInvoiceCommercialComparison({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
      acceptedVariances: params.acceptedVariances,
      noPoReason: params.noPoReason,
      noPoExplanation: params.noPoExplanation,
    });

    if (comparison.blockers.length > 0) {
      throw new Error(comparison.blockers[0].message);
    }

    const { error } = await supabase.rpc(
      "approve_supplier_invoice_commercially" as never,
      {
        p_organization_id: currentMember.organization_id,
        p_supplier_invoice_id: params.supplierInvoiceId,
        p_expected_finance_hash: comparison.financeVersionHash,
        p_accepted_variances: params.acceptedVariances,
        p_no_po_reason: params.noPoReason ?? null,
        p_no_po_explanation: params.noPoExplanation ?? null,
        p_approval_note: params.approvalNote?.trim() ?? "",
      } as never
    );
    if (error) {
      throw new Error(error.message);
    }

    const refreshed = await getSupplierInvoiceCommercialComparison({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
    });
    if (!refreshed.activeApproval) {
      throw new Error("Commercial approval did not create a complete current line snapshot set.");
    }
    revalidatePath(
      `/app/company/supplier-invoices/${params.supplierInvoiceId}`
    );
    return { ok: true, comparison: refreshed };
  } catch (error) {
    return { ok: false, error: safeCommercialActionError(error) };
  }
}

export async function refreshSupplierInvoiceCommercialComparisonAction(params: {
  supplierInvoiceId: string;
  acceptedVariances?: AcceptedCommercialVarianceInput[];
  noPoReason?: string | null;
  noPoExplanation?: string | null;
}): Promise<SupplierInvoiceCommercialActionResult> {
  try {
    const { currentMember, supabase } =
      await requireSupplierInvoiceCommercialContext(params.supplierInvoiceId);
    const comparison = await getSupplierInvoiceCommercialComparison({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
      acceptedVariances: params.acceptedVariances,
      noPoReason: params.noPoReason,
      noPoExplanation: params.noPoExplanation,
    });
    return { ok: true, comparison };
  } catch (error) {
    return { ok: false, error: safeCommercialActionError(error) };
  }
}

export async function rejectSupplierInvoiceCommerciallyAction(params: {
  supplierInvoiceId: string;
  reason: string;
}): Promise<SupplierInvoiceCommercialActionResult> {
  try {
    const { currentMember, supabase } =
      await requireSupplierInvoiceCommercialContext(params.supplierInvoiceId);
    const { error } = await supabase.rpc(
      "reject_supplier_invoice_commercially" as never,
      {
        p_organization_id: currentMember.organization_id,
        p_supplier_invoice_id: params.supplierInvoiceId,
        p_reason: params.reason,
      } as never
    );
    if (error) {
      throw new Error(error.message);
    }

    const comparison = await getSupplierInvoiceCommercialComparison({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
    });
    revalidatePath(
      `/app/company/supplier-invoices/${params.supplierInvoiceId}`
    );
    return { ok: true, comparison };
  } catch (error) {
    return { ok: false, error: safeCommercialActionError(error) };
  }
}

export async function updateSupplierInvoiceAllocationCommercialCodingAction(params: {
  supplierInvoiceId: string;
  allocationId: string;
  accountingMappingId: string;
  accountingTaxRateId?: string | null;
  taxResolutionStatus: "resolved" | "not_applicable";
}): Promise<SupplierInvoiceCommercialActionResult> {
  try {
    const { currentMember, supabase } =
      await requireSupplierInvoiceCommercialContext(params.supplierInvoiceId);
    const { data: mapping, error: mappingError } = await supabase
      .from("organization_tradesstack_accounting_mappings" as never)
      .select("id, is_active, tradesstack_cost_code, project_id, provider, organization_cost_code_id")
      .eq("organization_id", currentMember.organization_id)
      .eq("id", params.accountingMappingId)
      .eq("is_active", true)
      .maybeSingle();
    if (mappingError || !mapping) {
      throw new Error("Select an active accounting mapping.");
    }
    const selectedMappingRecord = mapping as {
      tradesstack_cost_code: number;
      project_id: string | null;
      provider: string;
      organization_cost_code_id: string;
    };
    if (selectedMappingRecord.provider === "xero") {
      const [{ data: connection }, { data: costCode }] = await Promise.all([
        supabase
          .from("organization_xero_connections" as never)
          .select("tenant_id, status")
          .eq("organization_id", currentMember.organization_id)
          .maybeSingle(),
        supabase
          .from("organization_cost_codes")
          .select("metadata, external_provider, is_active")
          .eq("organization_id", currentMember.organization_id)
          .eq("id", selectedMappingRecord.organization_cost_code_id)
          .maybeSingle(),
      ]);
      if (
        !connection
        || (connection as { status: string }).status !== "connected"
        || !(connection as { tenant_id: string | null }).tenant_id
        || !costCode
        || costCode.external_provider !== "xero"
        || !costCode.is_active
        || getXeroAccountTenantId(costCode)
          !== (connection as { tenant_id: string }).tenant_id
      ) {
        throw new Error("Select an accounting mapping for the currently connected Xero tenant.");
      }
    }

    if (params.taxResolutionStatus === "resolved") {
      const [{ data: taxRate, error: taxRateError }, { data: currentConnection }] = await Promise.all([
        supabase
          .from("organization_accounting_tax_rates" as never)
          .select("id, is_active, status, accounting_connection_id, tenant_id, can_apply_to_expenses")
          .eq("organization_id", currentMember.organization_id)
          .eq("id", params.accountingTaxRateId ?? "")
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("organization_xero_connections" as never)
          .select("id, tenant_id, status")
          .eq("organization_id", currentMember.organization_id)
          .eq("status", "connected")
          .maybeSingle(),
      ]);
      const scopedTaxRate = taxRate as null | {
        status: string | null; accounting_connection_id: string | null;
        tenant_id: string | null; can_apply_to_expenses: boolean;
      };
      const scopedConnection = currentConnection as null | { id: string; tenant_id: string | null };
      if (
        taxRateError || !scopedTaxRate || !scopedConnection
        || scopedTaxRate.status?.toUpperCase() !== "ACTIVE"
        || !scopedTaxRate.can_apply_to_expenses
        || scopedTaxRate.accounting_connection_id !== scopedConnection.id
        || scopedTaxRate.tenant_id !== scopedConnection.tenant_id
      ) {
        throw new Error("Select a current Xero purchase tax treatment.");
      }
    }

    const { data: allocation, error: allocationError } = await supabase
      .from("supplier_invoice_line_allocations")
      .select("supplier_invoice_line_id, tradesstack_cost_code, project_id")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .eq("id", params.allocationId)
      .maybeSingle();
    if (allocationError || !allocation) {
      throw new Error("Supplier invoice allocation not found.");
    }
    const selectedMapping = selectedMappingRecord;
    if (
      allocation.tradesstack_cost_code === null ||
      selectedMapping.tradesstack_cost_code !==
        allocation.tradesstack_cost_code ||
      (selectedMapping.project_id !== null &&
        selectedMapping.project_id !== allocation.project_id)
    ) {
      throw new Error(
        "Select an accounting mapping that matches the allocation routing code and project."
      );
    }
    if (params.taxResolutionStatus === "not_applicable") {
      const { data: invoiceLine, error: invoiceLineError } = await supabase
        .from("supplier_invoice_lines")
        .select("tax_amount")
        .eq("organization_id", currentMember.organization_id)
        .eq("supplier_invoice_id", params.supplierInvoiceId)
        .eq("id", allocation.supplier_invoice_line_id)
        .maybeSingle();
      if (
        invoiceLineError ||
        !invoiceLine ||
        Number(invoiceLine.tax_amount ?? 0) > 0.01
      ) {
        throw new Error(
          "A line with tax cannot use the no-tax treatment."
        );
      }
    }

    const { error } = await supabase
      .from("supplier_invoice_line_allocations")
      .update({
        accounting_mapping_id: params.accountingMappingId,
        accounting_resolution_status: "resolved",
        accounting_tax_rate_id:
          params.taxResolutionStatus === "resolved"
            ? params.accountingTaxRateId
            : null,
        tax_resolution_status: params.taxResolutionStatus,
        approval_status: "pending",
        approved_at: null,
        approved_by_user_id: null,
      } as never)
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .eq("id", params.allocationId);
    if (error) {
      throw new Error("Unable to update the allocation coding.");
    }

    const comparison = await getSupplierInvoiceCommercialComparison({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
    });
    revalidatePath(
      `/app/company/supplier-invoices/${params.supplierInvoiceId}`
    );
    return { ok: true, comparison };
  } catch (error) {
    return { ok: false, error: safeCommercialActionError(error) };
  }
}

export async function reverseSupplierInvoiceActualCostEventAction(params: {
  organizationId: string;
  supplierInvoiceId: string;
  eventId: string;
  reversalReason: string;
  reversalNote?: string | null;
}): Promise<SupplierInvoiceDraftAllocationActionResult> {
  try {
    const context = await requireSupplierInvoiceActualCostReversalContext(params.organizationId);
    const reversal = await reverseSupplierInvoiceActualCostEvent({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      eventId: params.eventId,
      reversalReason: params.reversalReason,
      reversalNote: params.reversalNote ?? null,
      canReverse: context.canReverse,
    });

    return { ok: true, reversal };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to reverse the actual cost event.",
    };
  }
}
