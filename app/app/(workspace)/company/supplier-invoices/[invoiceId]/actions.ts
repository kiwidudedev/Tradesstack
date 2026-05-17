"use server";

import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
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
import type { SupplierInvoiceLineAllocationRow } from "@/lib/supplier-invoice-allocations";

export type SupplierInvoiceDraftAllocationActionResult = {
  ok: boolean;
  allocations?: SupplierInvoiceLineAllocationRow[];
  posting?: SupplierInvoiceActualCostPostingResult;
  reversal?: SupplierInvoiceActualCostReversalResult;
  error?: string;
};

async function requireSupplierInvoiceAllocationContext(organizationId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember || currentMember.organization_id !== organizationId) {
    throw new Error("You do not have access to this organization.");
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
