"use server";

import { revalidatePath } from "next/cache";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  addSupplierPrice,
  confirmSupplierPriceTaxEvidence,
  confirmSupplierPriceTaxEvidenceForward,
  archiveMaterial,
  archiveSupplierProduct,
  createMaterial,
  createMaterialWithInitialSupplierPrice,
  makeSupplierPricePreferred,
  moveSupplierProduct,
  restoreSupplierProduct,
  updateMaterial,
} from "@/lib/materials/service";
import type { MaterialDraftInput, MaterialSupplierPriceDraftInput } from "@/lib/materials/validation";
import type { SourceTaxBasis } from "@/lib/tax/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type MaterialActionResult = {
  ok: boolean;
  error?: string;
  materialId?: string;
  supplierProductId?: string;
  priceId?: string;
  supersedesPriceId?: string | null;
  idempotentReplay?: boolean;
  needsReview?: boolean;
};

async function requireMaterialsWriteContext(organizationId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember || currentMember.organization_id !== organizationId) {
    throw new Error("You do not have access to this organization.");
  }

  const canWrite = await hasOrganizationPermission(organizationId, "materials.write");
  if (!canWrite) {
    throw new Error("You do not have permission to manage materials.");
  }

  return {
    currentMember,
    supabase: await createServerSupabaseClient(),
  };
}

function revalidateMaterialsPage() {
  revalidatePath("/app/company/materials");
  revalidatePath("/app/company/cost-items/review");
}

export async function createMaterialAction(params: {
  organizationId: string;
  input: MaterialDraftInput;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    const material = await createMaterial({
      supabase: context.supabase,
      organizationId: params.organizationId,
      createdBy: context.currentMember.user_id,
      input: params.input,
    });
    revalidateMaterialsPage();
    return {
      ok: true,
      materialId: material.id,
      needsReview: material.needs_review,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to create material.",
    };
  }
}

export async function createMaterialWithInitialSupplierPriceAction(params: {
  organizationId: string;
  operationId: string;
  materialInput: MaterialDraftInput;
  supplierPriceInput: Omit<MaterialSupplierPriceDraftInput, "materialId">;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    const result = await createMaterialWithInitialSupplierPrice({
      supabase: context.supabase,
      organizationId: params.organizationId,
      actorUserId: context.currentMember.user_id,
      materialInput: params.materialInput,
      supplierPriceInput: {
        ...params.supplierPriceInput,
        idempotencyKey: params.operationId,
      },
    });
    revalidateMaterialsPage();
    return {
      ok: true,
      materialId: result.material.id,
      needsReview: result.material.needs_review,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to create material with the initial supplier price.",
    };
  }
}

export async function updateMaterialAction(params: {
  organizationId: string;
  materialId: string;
  input: MaterialDraftInput;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    await updateMaterial({
      supabase: context.supabase,
      organizationId: params.organizationId,
      materialId: params.materialId,
      actorUserId: context.currentMember.user_id,
      input: params.input,
    });
    revalidateMaterialsPage();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update material.",
    };
  }
}

export async function archiveMaterialAction(params: {
  organizationId: string;
  materialId: string;
  archived: boolean;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    await archiveMaterial({
      supabase: context.supabase,
      organizationId: params.organizationId,
      materialId: params.materialId,
      actorUserId: context.currentMember.user_id,
      archived: params.archived,
    });
    revalidateMaterialsPage();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update archive status.",
    };
  }
}

export async function addMaterialSupplierPriceAction(params: {
  organizationId: string;
  operationId: string;
  input: MaterialSupplierPriceDraftInput;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    const result = await addSupplierPrice({
      supabase: context.supabase,
      organizationId: params.organizationId,
      actorUserId: context.currentMember.user_id,
      input: {
        ...params.input,
        idempotencyKey: params.operationId,
      },
    });
    revalidateMaterialsPage();
    return {
      ok: true,
      supplierProductId: result.supplierProductId,
      priceId: result.priceId,
      supersedesPriceId: result.supersedesPriceId,
      idempotentReplay: result.idempotentReplay,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to add supplier price.",
    };
  }
}

export async function confirmMaterialSupplierPriceTaxEvidenceAction(params: {
  organizationId: string;
  operationId: string;
  previousSupplierPriceId: string;
  policyId: string;
  sourceTaxBasis: Exclude<SourceTaxBasis, "unknown">;
  sourceTaxRate?: number | null;
  effectiveFrom: string;
  reason: string;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    const result = await confirmSupplierPriceTaxEvidence({
      supabase: context.supabase,
      organizationId: params.organizationId,
      previousSupplierPriceId: params.previousSupplierPriceId,
      policyId: params.policyId,
      sourceTaxBasis: params.sourceTaxBasis,
      sourceTaxRate: params.sourceTaxRate,
      effectiveFrom: params.effectiveFrom,
      reason: params.reason,
      idempotencyKey: params.operationId,
    });
    revalidateMaterialsPage();
    return {
      ok: true,
      priceId: result.priceId,
      supersedesPriceId: result.supersedesPriceId,
      idempotentReplay: result.idempotentReplay,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to confirm Supplier Price tax evidence.",
    };
  }
}

export async function confirmMaterialSupplierPriceTaxEvidenceForwardAction(params: {
  organizationId: string;
  operationId: string;
  previousSupplierPriceId: string;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    const result = await confirmSupplierPriceTaxEvidenceForward({
      supabase: context.supabase,
      organizationId: params.organizationId,
      previousSupplierPriceId: params.previousSupplierPriceId,
      idempotencyKey: params.operationId,
    });
    revalidateMaterialsPage();
    return {
      ok: true,
      priceId: result.priceId,
      supersedesPriceId: result.supersedesPriceId,
      idempotentReplay: result.idempotentReplay,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to confirm Supplier Price tax setup.",
    };
  }
}

export async function makeMaterialSupplierPricePreferredAction(params: {
  organizationId: string;
  supplierPriceId: string;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    await makeSupplierPricePreferred({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierPriceId: params.supplierPriceId,
    });
    revalidateMaterialsPage();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update preferred supplier price.",
    };
  }
}

export async function archiveMaterialSupplierProductAction(params: {
  organizationId: string;
  materialId: string;
  supplierProductId: string;
  reason: string;
  note?: string | null;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    const result = await archiveSupplierProduct({
      supabase: context.supabase,
      organizationId: params.organizationId,
      materialId: params.materialId,
      supplierProductId: params.supplierProductId,
      reason: params.reason,
      note: params.note,
    });
    revalidateMaterialsPage();
    return { ok: true, materialId: result.materialId, supplierProductId: result.supplierProductId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to remove the supplier item." };
  }
}

export async function restoreMaterialSupplierProductAction(params: {
  organizationId: string;
  materialId: string;
  supplierProductId: string;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    const result = await restoreSupplierProduct({
      supabase: context.supabase,
      organizationId: params.organizationId,
      materialId: params.materialId,
      supplierProductId: params.supplierProductId,
    });
    revalidateMaterialsPage();
    return { ok: true, materialId: result.materialId, supplierProductId: result.supplierProductId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to restore the supplier item." };
  }
}

export async function moveMaterialSupplierProductAction(params: {
  organizationId: string;
  supplierProductId: string;
  newMaterialId: string;
  reason: string;
}): Promise<MaterialActionResult> {
  try {
    const context = await requireMaterialsWriteContext(params.organizationId);
    const result = await moveSupplierProduct({
      supabase: context.supabase,
      organizationId: params.organizationId,
      supplierProductId: params.supplierProductId,
      newMaterialId: params.newMaterialId,
      reason: params.reason,
    });
    revalidateMaterialsPage();
    return { ok: true, materialId: result.newMaterialId, supplierProductId: result.supplierProductId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to move the supplier item." };
  }
}
