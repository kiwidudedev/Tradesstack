"use server";

import { revalidatePath } from "next/cache";
import { getOrganizationPermissionsBatch, hasOrganizationPermission } from "@/lib/permissions-server";
import {
  getSupplierInvoiceCommercialComparison,
  getPurchaseOrderInvoicingProgress,
  type PurchaseOrderCommercialProgress,
} from "@/lib/procurement-commercial-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  getPurchaseOrderSupplierInvoiceSummaries,
  type PurchaseOrderSupplierInvoiceSummaryResult,
} from "@/lib/purchase-order-supplier-invoice-summary-server";
import { getPurchaseOrderSupplierInvoiceDetail } from "@/lib/purchase-order-supplier-invoice-detail-server";
import type { PurchaseOrderSupplierInvoiceDetail } from "@/lib/purchase-order-supplier-invoice-detail";
import {
  normalizePurchaseOrderImportSection,
  type PurchaseOrderImportLine,
  type PurchaseOrderQuoteImportSource,
  type PurchaseOrderSourceActionResult,
  type PurchaseOrderVariationImportOption,
} from "@/lib/purchase-orders/source-import";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PurchaseOrderCommercialActionResult = {
  ok: boolean;
  progress?: PurchaseOrderCommercialProgress;
  error?: string;
};

export type PurchaseOrderSupplierInvoiceSummaryActionResult = {
  ok: boolean;
  data?: PurchaseOrderSupplierInvoiceSummaryResult;
  error?: string;
};

export type PurchaseOrderSupplierInvoiceDetailActionResult = {
  ok: boolean;
  data?: PurchaseOrderSupplierInvoiceDetail;
  error?: string;
};

export type PurchaseOrderSupplierPricingPermissions = {
  canViewMaterials: boolean;
  canWritePurchaseOrder: boolean;
};

export async function loadPurchaseOrderSupplierPricingPermissionsAction(): Promise<PurchaseOrderSupplierPricingPermissions> {
  const member = await getCurrentOrganizationMember();
  if (!member) return { canViewMaterials: false, canWritePurchaseOrder: false };
  const permissions = await getOrganizationPermissionsBatch({
    organizationId: member.organization_id,
    permissions: ["materials.view", "purchase_orders.write"],
  });
  return {
    canViewMaterials: permissions["materials.view"] === true,
    canWritePurchaseOrder: permissions["purchase_orders.write"] === true,
  };
}

async function requirePurchaseOrderImportContext(projectId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) throw new Error("You do not have access to this Project.");
  if (!(await hasOrganizationPermission(currentMember.organization_id, "purchase_orders.write"))) {
    throw new Error("You do not have permission to edit Purchase Orders.");
  }
  const supabase = await createServerSupabaseClient();
  const { data: project, error } = await supabase
    .from("organization_projects")
    .select("id")
    .eq("organization_id", currentMember.organization_id)
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) throw new Error("Project not found.");
  return { currentMember, supabase };
}

export async function loadPurchaseOrderQuoteImportSourceAction(params: {
  projectId: string;
}): Promise<PurchaseOrderSourceActionResult<PurchaseOrderQuoteImportSource | null>> {
  try {
    const { currentMember, supabase } = await requirePurchaseOrderImportContext(params.projectId);
    const { data: baselineRows, error: baselineError } = await supabase.rpc(
      "resolve_project_contractual_baseline_v1",
      { p_organization_id: currentMember.organization_id, p_project_id: params.projectId },
    );
    if (baselineError) throw new Error(baselineError.message);
    const baseline = baselineRows?.[0] ?? null;
    if (!baseline?.is_valid || !baseline.quote_id) return { ok: true, data: null };

    const { data: quote, error: quoteError } = await supabase
      .from("project_quotes")
      .select("id, quote_number, quote_title, revision_number, status")
      .eq("organization_id", currentMember.organization_id)
      .eq("project_id", params.projectId)
      .eq("id", baseline.quote_id)
      .eq("status", "Accepted")
      .maybeSingle();
    if (quoteError) throw new Error(quoteError.message);
    if (!quote) return { ok: true, data: null };

    const [{ data: sourceLines, error: linesError }, { data: costItems, error: costsError }] = await Promise.all([
      supabase
        .from("project_quote_line_items")
        .select("id, section, description, quantity, unit, rate, sort_order")
        .eq("organization_id", currentMember.organization_id)
        .eq("project_id", params.projectId)
        .eq("quote_id", quote.id)
        .eq("is_optional", false)
        .order("sort_order", { ascending: true }),
      supabase
        .from("cost_items")
        .select("id, linked_quote_line_item_id")
        .eq("organization_id", currentMember.organization_id)
        .eq("project_id", params.projectId)
        .eq("source_document_kind", "project_quote")
        .eq("source_document_id", quote.id)
        .eq("is_current", true),
    ]);
    if (linesError) throw new Error(linesError.message);
    if (costsError) throw new Error(costsError.message);
    const costItemByLineId = new Map((costItems ?? []).map((item) => [item.linked_quote_line_item_id, item.id]));
    const lines: PurchaseOrderImportLine[] = (sourceLines ?? []).flatMap((line) => {
      const sourceCostItemId = costItemByLineId.get(line.id);
      if (!sourceCostItemId) return [];
      return [{
        id: line.id,
        sourceCostItemId,
        sourceSection: line.section,
        section: normalizePurchaseOrderImportSection(line.section),
        description: line.description ?? "",
        quantity: Number(line.quantity ?? 0),
        unit: line.unit ?? "",
        rate: Number(line.rate ?? 0),
      }];
    });
    return { ok: true, data: {
      id: quote.id,
      quoteNumber: quote.quote_number,
      quoteTitle: quote.quote_title,
      revisionNumber: quote.revision_number,
      status: "Accepted",
      lines,
    } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to load the accepted contractual Quote." };
  }
}

export async function loadPurchaseOrderVariationImportOptionsAction(params: {
  projectId: string;
}): Promise<PurchaseOrderSourceActionResult<PurchaseOrderVariationImportOption[]>> {
  try {
    const { currentMember, supabase } = await requirePurchaseOrderImportContext(params.projectId);
    const { data, error } = await supabase
      .from("project_variations")
      .select("id, variation_number, variation_title, status")
      .eq("organization_id", currentMember.organization_id)
      .eq("project_id", params.projectId)
      .eq("status", "Approved")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []).map((variation) => ({
      id: variation.id,
      variationNumber: variation.variation_number,
      variationTitle: variation.variation_title,
      status: "Approved",
    })) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to load Approved Variations." };
  }
}

export async function loadPurchaseOrderVariationImportLinesAction(params: {
  projectId: string;
  variationId: string;
}): Promise<PurchaseOrderSourceActionResult<PurchaseOrderImportLine[]>> {
  try {
    const { currentMember, supabase } = await requirePurchaseOrderImportContext(params.projectId);
    const { data: variation, error: variationError } = await supabase
      .from("project_variations")
      .select("id")
      .eq("organization_id", currentMember.organization_id)
      .eq("project_id", params.projectId)
      .eq("id", params.variationId)
      .eq("status", "Approved")
      .maybeSingle();
    if (variationError) throw new Error(variationError.message);
    if (!variation) return { ok: false, error: "The selected Variation is not Approved or is unavailable." };

    const [{ data: sourceLines, error: linesError }, { data: costItems, error: costsError }] = await Promise.all([
      supabase
        .from("project_variation_line_items")
        .select("id, section, description, quantity, unit, rate, sort_order")
        .eq("organization_id", currentMember.organization_id)
        .eq("project_id", params.projectId)
        .eq("variation_id", variation.id)
        .neq("section", "Margin")
        .is("source_purchase_order_line_item_id", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("cost_items")
        .select("id, linked_variation_line_item_id")
        .eq("organization_id", currentMember.organization_id)
        .eq("project_id", params.projectId)
        .eq("source_document_kind", "project_variation")
        .eq("source_document_id", variation.id)
        .eq("is_current", true),
    ]);
    if (linesError) throw new Error(linesError.message);
    if (costsError) throw new Error(costsError.message);
    const costItemByLineId = new Map((costItems ?? []).map((item) => [item.linked_variation_line_item_id, item.id]));
    const lines: PurchaseOrderImportLine[] = (sourceLines ?? []).flatMap((line) => {
      const sourceCostItemId = costItemByLineId.get(line.id);
      if (!sourceCostItemId) return [];
      return [{
        id: line.id,
        sourceCostItemId,
        sourceSection: line.section,
        section: normalizePurchaseOrderImportSection(line.section),
        description: line.description ?? "",
        quantity: Number(line.quantity ?? 0),
        unit: line.unit ?? "",
        rate: Number(line.rate ?? 0),
      }];
    });
    return { ok: true, data: lines };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to load Variation lines." };
  }
}

export async function loadPurchaseOrderSupplierInvoiceSummaryAction(params: {
  purchaseOrderId: string;
  projectId?: string | null;
}): Promise<PurchaseOrderSupplierInvoiceSummaryActionResult> {
  try {
    const data = await getPurchaseOrderSupplierInvoiceSummaries({
      purchaseOrderId: params.purchaseOrderId,
      expectedProjectId: params.projectId,
    });
    return { ok: true, data };
  } catch (error) {
    console.error("[purchase-orders] authoritative Supplier Invoice summary failed", {
      purchaseOrderId: params.purchaseOrderId,
      projectId: params.projectId ?? null,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      ok: false,
      error: "Unable to load the authoritative Purchase Order invoice summary.",
    };
  }
}

export async function loadPurchaseOrderSupplierInvoiceDetailAction(params: {
  purchaseOrderId: string;
  supplierInvoiceId: string;
  projectId?: string | null;
}): Promise<PurchaseOrderSupplierInvoiceDetailActionResult> {
  try {
    const data = await getPurchaseOrderSupplierInvoiceDetail({
      purchaseOrderId: params.purchaseOrderId,
      supplierInvoiceId: params.supplierInvoiceId,
      expectedProjectId: params.projectId,
    });
    return { ok: true, data };
  } catch (error) {
    console.error("[purchase-orders] Supplier Invoice detail failed", {
      purchaseOrderId: params.purchaseOrderId,
      supplierInvoiceId: params.supplierInvoiceId,
      projectId: params.projectId ?? null,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      ok: false,
      error: "Unable to load Supplier Invoice detail.",
    };
  }
}

export async function canReviewSupplierInvoiceSiteAction(params: {
  purchaseOrderId: string;
}): Promise<{ ok: boolean; allowed: boolean; error?: string }> {
  try {
    const { currentMember, purchaseOrder, supabase } = await requirePurchaseOrderContext(
      params.purchaseOrderId
    );
    if (
      !(await hasOrganizationPermission(
        currentMember.organization_id,
        "supplier_invoices.site_review"
      ))
    ) {
      return { ok: true, allowed: false };
    }
    if (["owner", "admin"].includes(currentMember.role)) {
      return { ok: true, allowed: true };
    }
    const { data: projectMembership, error } = await supabase
      .from("project_members")
      .select("id")
      .eq("organization_id", currentMember.organization_id)
      .eq("project_id", purchaseOrder.project_id)
      .eq("organization_member_id", currentMember.id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, allowed: Boolean(projectMembership) };
  } catch {
    return { ok: false, allowed: false, error: "Unable to verify site-review access." };
  }
}

export async function decideSupplierInvoiceSiteReviewAction(params: {
  purchaseOrderId: string;
  supplierInvoiceId: string;
  allocationId: string;
  decision: "approved" | "disputed";
  note: string;
}): Promise<PurchaseOrderCommercialActionResult> {
  try {
    const { currentMember, supabase } = await requirePurchaseOrderContext(params.purchaseOrderId);
    if (!(await hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.site_review"))) {
      throw new Error("You do not have permission to perform site review.");
    }
    const { data: decisionRows, error: decisionError } = await supabase
      .from("supplier_invoice_site_review_decisions")
      .select("id, submission_id, allocation_ids_snapshot")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .eq("purchase_order_id", params.purchaseOrderId)
      .in("decision", ["pending", "approved", "disputed"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (decisionError || !decisionRows?.[0]) throw new Error("This invoice has not been submitted for current site review.");
    if (!(decisionRows[0].allocation_ids_snapshot ?? []).includes(params.allocationId)) {
      throw new Error("This allocation is not part of the current Team Approval request.");
    }
    const { data: allocation, error: allocationError } = await supabase
      .from("supplier_invoice_line_allocations")
      .select("id, purchase_order_line_item_id")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .eq("purchase_order_id", params.purchaseOrderId)
      .eq("id", params.allocationId)
      .maybeSingle();
    if (allocationError || !allocation) throw new Error("This allocation is no longer available for Team Approval.");
    const comparison = await getSupplierInvoiceCommercialComparison({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: params.supplierInvoiceId,
    });
    const acceptedWarnings = comparison.warnings
      .filter((warning) =>
        warning.allocationId === params.allocationId
        || (
          warning.purchaseOrderId === params.purchaseOrderId
          && warning.purchaseOrderLineItemId === allocation.purchase_order_line_item_id
        )
      )
      .map((warning) => ({
        key: warning.key,
        type: warning.type,
        purchaseOrderLineItemId: warning.purchaseOrderLineItemId,
        expectedValue: warning.expectedValue,
        actualValue: warning.actualValue,
        varianceAmount: warning.varianceAmount,
        note: params.note.trim(),
      }));
    if (params.decision === "approved" && acceptedWarnings.length > 0 && !params.note.trim()) {
      throw new Error("Add an approval note to accept the current commercial warnings.");
    }
    const { error } = await supabase.rpc("decide_supplier_invoice_site_review" as never, {
      p_decision_id: decisionRows[0].id,
      p_allocation_id: params.allocationId,
      p_decision: params.decision,
      p_note: params.note,
      p_accepted_variances: params.decision === "approved" ? acceptedWarnings : [],
    } as never);
    if (error) throw new Error(error.message);
    const progress = await getPurchaseOrderInvoicingProgress({
      supabase,
      organizationId: currentMember.organization_id,
      purchaseOrderId: params.purchaseOrderId,
    });
    revalidatePath("/app", "layout");
    return { ok: true, progress };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      error: ["permission", "not been submitted", "dispute reason", "decline comment", "approval note", "no longer current", "assigned projects"].some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
        ? message
        : "Unable to record the site-review decision.",
    };
  }
}

async function requirePurchaseOrderContext(purchaseOrderId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    throw new Error("You do not have access to this purchase order.");
  }
  const supabase = await createServerSupabaseClient();
  const { data: purchaseOrder, error } = await supabase
    .from("project_purchase_orders")
    .select("id, project_id")
    .eq("organization_id", currentMember.organization_id)
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (error || !purchaseOrder) {
    throw new Error("Purchase order not found.");
  }
  return { currentMember, purchaseOrder, supabase };
}

export async function refreshPurchaseOrderCommercialProgressAction(params: {
  purchaseOrderId: string;
}): Promise<PurchaseOrderCommercialActionResult> {
  try {
    const { currentMember, supabase } = await requirePurchaseOrderContext(
      params.purchaseOrderId
    );
    const progress = await getPurchaseOrderInvoicingProgress({
      supabase,
      organizationId: currentMember.organization_id,
      purchaseOrderId: params.purchaseOrderId,
    });
    return { ok: true, progress };
  } catch {
    return {
      ok: false,
      error: "Unable to load purchase order invoicing progress.",
    };
  }
}

export async function releasePurchaseOrderCommitmentAction(params: {
  purchaseOrderId: string;
  expectedRemainingAmount: number;
  reason: string;
  note?: string | null;
}): Promise<PurchaseOrderCommercialActionResult> {
  try {
    const { currentMember, supabase } = await requirePurchaseOrderContext(
      params.purchaseOrderId
    );
    const canWrite = await hasOrganizationPermission(
      currentMember.organization_id,
      "purchase_orders.write"
    );
    if (!canWrite) {
      throw new Error("You do not have permission to release commitments.");
    }

    const { error } = await supabase.rpc(
      "release_purchase_order_commitment" as never,
      {
        p_organization_id: currentMember.organization_id,
        p_purchase_order_id: params.purchaseOrderId,
        p_expected_remaining_amount: params.expectedRemainingAmount,
        p_reason: params.reason,
        p_note: params.note?.trim() ?? "",
      } as never
    );
    if (error) {
      const safeMessage = [
        "no positive commitment",
        "remaining commitment changed",
        "Add a reason",
        "Only active approved",
      ].some((fragment) => error.message.includes(fragment))
        ? error.message
        : "Unable to release the purchase order commitment.";
      throw new Error(safeMessage);
    }

    const progress = await getPurchaseOrderInvoicingProgress({
      supabase,
      organizationId: currentMember.organization_id,
      purchaseOrderId: params.purchaseOrderId,
    });
    revalidatePath("/app", "layout");
    return { ok: true, progress };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to release the purchase order commitment.",
    };
  }
}
