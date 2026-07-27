"use server";

import { revalidatePath } from "next/cache";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  saveSupplier,
  setSupplierActiveState,
  SupplierDuplicateWarningError,
  SupplierValidationError,
} from "@/lib/supplier-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupplierWriteInput } from "@/lib/supplier-validation";
import type { SupplierDuplicateWarning } from "@/lib/suppliers";
import {
  createAndLinkXeroContactFromSupplier,
  linkSupplierToImportedXeroContact,
  loadSupplierXeroLinkWorkspaceData,
  unlinkSupplierXeroContact,
  type SupplierXeroLinkWorkspaceData,
  type SupplierXeroSuggestion,
} from "@/lib/xero/contacts";
import { getOrganizationXeroConnection } from "@/lib/xero/service";
import { enqueueOrganizationXeroSync, runXeroSyncWorker } from "@/lib/xero/sync";

export type SupplierXeroActionResult = {
  ok: boolean;
  error?: string;
  workspace?: SupplierXeroLinkWorkspaceData;
  requiresDuplicateConfirmation?: boolean;
  suggestions?: SupplierXeroSuggestion[];
};

export type SupplierSaveActionResult = {
  ok: boolean;
  error?: string;
  supplier?: Awaited<ReturnType<typeof saveSupplier>>["supplier"];
  warnings?: SupplierDuplicateWarning[];
  requiresDuplicateConfirmation?: boolean;
  fieldErrors?: Record<string, string>;
};

const SUPPLIERS_PATH = "/app/company/suppliers";
const INTEGRATIONS_PATH = "/app/settings/integrations";

async function requireSupplierContactsReadContext() {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    throw new Error("You must be signed in to access supplier contact links.");
  }

  return currentMember;
}

async function requireSupplierWriteContext() {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    throw new Error("You must be signed in to manage suppliers.");
  }

  const canWrite = await hasOrganizationPermission(
    currentMember.organization_id,
    "suppliers.write",
  );
  if (!canWrite) {
    throw new Error("You do not have permission to manage suppliers.");
  }

  return {
    currentMember,
    supabase: await createServerSupabaseClient(),
  };
}

async function requireSupplierContactsManageContext() {
  const currentMember = await requireSupplierContactsReadContext();
  const canManage = await hasOrganizationPermission(
    currentMember.organization_id,
    "accounting.contacts.manage",
  );

  if (!canManage) {
    throw new Error("You do not have permission to manage Xero supplier contacts.");
  }

  return currentMember;
}

function revalidateSupplierContactPages() {
  revalidatePath(SUPPLIERS_PATH);
  revalidatePath(INTEGRATIONS_PATH);
}

function revalidateSupplierPages() {
  revalidatePath(SUPPLIERS_PATH);
}

function toSupplierSaveResult(error: unknown, fallback: string): SupplierSaveActionResult {
  if (error instanceof SupplierValidationError) {
    return {
      ok: false,
      error: "Supplier details need attention.",
      fieldErrors: error.fieldErrors,
    };
  }

  if (error instanceof SupplierDuplicateWarningError) {
    return {
      ok: false,
      error: "Possible duplicate suppliers found.",
      warnings: error.warnings,
      requiresDuplicateConfirmation: true,
    };
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

export async function saveSupplierAction(params: {
  supplierId?: string | null;
  input: SupplierWriteInput;
  confirmPotentialDuplicates?: boolean;
}): Promise<SupplierSaveActionResult> {
  try {
    const context = await requireSupplierWriteContext();
    const result = await saveSupplier({
      supabase: context.supabase,
      organizationId: context.currentMember.organization_id,
      actorUserId: context.currentMember.user_id,
      supplierId: params.supplierId ?? null,
      source: "manual",
      input: params.input,
      confirmPotentialDuplicates: params.confirmPotentialDuplicates ?? false,
    });

    revalidateSupplierPages();
    return {
      ok: true,
      supplier: result.supplier,
      warnings: result.warnings,
    };
  } catch (error) {
    return toSupplierSaveResult(error, "Unable to save supplier.");
  }
}

export async function createPurchaseOrderInlineSupplierAction(params: {
  input: Pick<SupplierWriteInput, "name" | "primaryContactEmail" | "primaryContactPhone">;
  confirmPotentialDuplicates?: boolean;
}): Promise<SupplierSaveActionResult> {
  try {
    const context = await requireSupplierWriteContext();
    const result = await saveSupplier({
      supabase: context.supabase,
      organizationId: context.currentMember.organization_id,
      actorUserId: context.currentMember.user_id,
      source: "purchase_order_inline",
      input: {
        name: params.input.name,
        primaryContactEmail: params.input.primaryContactEmail ?? null,
        primaryContactPhone: params.input.primaryContactPhone ?? null,
      },
      confirmPotentialDuplicates: params.confirmPotentialDuplicates ?? false,
    });

    revalidateSupplierPages();
    return {
      ok: true,
      supplier: result.supplier,
      warnings: result.warnings,
    };
  } catch (error) {
    return toSupplierSaveResult(error, "Unable to create supplier.");
  }
}

export async function setSupplierActiveStateAction(params: {
  supplierId: string;
  isActive: boolean;
}): Promise<SupplierSaveActionResult> {
  try {
    const context = await requireSupplierWriteContext();
    const supplier = await setSupplierActiveState({
      supabase: context.supabase,
      organizationId: context.currentMember.organization_id,
      supplierId: params.supplierId,
      isActive: params.isActive,
    });

    revalidateSupplierPages();
    return { ok: true, supplier };
  } catch (error) {
    return toSupplierSaveResult(error, "Unable to update supplier status.");
  }
}

export async function loadSupplierXeroWorkspaceAction(params: {
  supplierId: string;
  searchTerm?: string | null;
}): Promise<SupplierXeroActionResult> {
  try {
    const currentMember = await requireSupplierContactsReadContext();
    const workspace = await loadSupplierXeroLinkWorkspaceData({
      organizationId: currentMember.organization_id,
      supplierId: params.supplierId,
      searchTerm: params.searchTerm ?? null,
    });

    return {
      ok: true,
      workspace,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to load supplier Xero contacts.",
    };
  }
}

export async function refreshSupplierXeroContactsAction(): Promise<SupplierXeroActionResult> {
  try {
    const currentMember = await requireSupplierContactsManageContext();
    const connection = await getOrganizationXeroConnection(currentMember.organization_id);

    if (!connection?.id || connection.status !== "connected") {
      throw new Error("Connect Xero before refreshing contacts.");
    }

    const jobs = await enqueueOrganizationXeroSync({
      organizationId: currentMember.organization_id,
      connectionId: connection.id,
      createdByUserId: currentMember.user_id,
      triggerSource: "manual_refresh",
      includeContacts: true,
      includeHealthCheck: true,
    });

    await runXeroSyncWorker({
      organizationId: currentMember.organization_id,
      limit: jobs.jobs.length,
      workerId: "supplier-contacts-manual-refresh",
    });

    revalidateSupplierContactPages();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to refresh Xero contacts.",
    };
  }
}

export async function linkSupplierXeroContactAction(params: {
  supplierId: string;
  contactId: string;
  allowRelink?: boolean;
  matchMethod?: "manual_search" | "suggested_match" | "manual_relink";
}): Promise<SupplierXeroActionResult> {
  try {
    const currentMember = await requireSupplierContactsManageContext();
    await linkSupplierToImportedXeroContact({
      organizationId: currentMember.organization_id,
      supplierId: params.supplierId,
      contactId: params.contactId,
      actorUserId: currentMember.user_id,
      allowRelink: params.allowRelink ?? false,
      matchMethod: params.matchMethod ?? "manual_search",
    });

    revalidateSupplierContactPages();
    const workspace = await loadSupplierXeroLinkWorkspaceData({
      organizationId: currentMember.organization_id,
      supplierId: params.supplierId,
    });

    return { ok: true, workspace };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to link the Xero contact.",
    };
  }
}

export async function createSupplierXeroContactAction(params: {
  supplierId: string;
  allowPotentialDuplicate: boolean;
}): Promise<SupplierXeroActionResult> {
  try {
    const currentMember = await requireSupplierContactsManageContext();
    const result = await createAndLinkXeroContactFromSupplier({
      organizationId: currentMember.organization_id,
      supplierId: params.supplierId,
      actorUserId: currentMember.user_id,
      allowPotentialDuplicate: params.allowPotentialDuplicate,
    });

    if (!result.ok) {
      return {
        ok: false,
        requiresDuplicateConfirmation: result.requiresDuplicateConfirmation,
        suggestions: result.suggestions,
      };
    }

    revalidateSupplierContactPages();
    const workspace = await loadSupplierXeroLinkWorkspaceData({
      organizationId: currentMember.organization_id,
      supplierId: params.supplierId,
    });

    return { ok: true, workspace };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to create the Xero contact.",
    };
  }
}

export async function unlinkSupplierXeroContactAction(params: {
  supplierId: string;
  confirmed: boolean;
}): Promise<SupplierXeroActionResult> {
  try {
    if (!params.confirmed) {
      throw new Error("Confirm the unlink before continuing.");
    }

    const currentMember = await requireSupplierContactsManageContext();
    await unlinkSupplierXeroContact({
      organizationId: currentMember.organization_id,
      supplierId: params.supplierId,
      actorUserId: currentMember.user_id,
    });

    revalidateSupplierContactPages();
    const workspace = await loadSupplierXeroLinkWorkspaceData({
      organizationId: currentMember.organization_id,
      supplierId: params.supplierId,
    });

    return { ok: true, workspace };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to unlink the Xero contact.",
    };
  }
}
