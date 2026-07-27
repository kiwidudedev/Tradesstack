"use server";

import { revalidatePath } from "next/cache";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  createAndLinkXeroContactFromClient,
  linkClientToImportedXeroContact,
  loadClientXeroLinkWorkspaceData,
  unlinkClientXeroContact,
  type ClientXeroContactChoice,
  type ClientXeroLinkWorkspaceData,
} from "@/lib/xero/client-contacts";
import { getOrganizationXeroConnection } from "@/lib/xero/service";
import { enqueueOrganizationXeroSync, runXeroSyncWorker } from "@/lib/xero/sync";

export type ClientXeroActionResult = {
  ok: boolean;
  error?: string;
  workspace?: ClientXeroLinkWorkspaceData;
  requiresDuplicateConfirmation?: boolean;
  suggestions?: ClientXeroContactChoice[];
};

async function requireClientContactsReadContext() {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) throw new Error("You must be signed in to access client contact links.");
  return currentMember;
}

async function requireClientContactsManageContext() {
  const currentMember = await requireClientContactsReadContext();
  const canManage = await hasOrganizationPermission(
    currentMember.organization_id,
    "accounting.contacts.manage",
  );
  if (!canManage) throw new Error("You do not have permission to manage Xero client contacts.");
  return currentMember;
}

function revalidateClientContactPages(clientId: string) {
  revalidatePath(`/app/leads-clients/clients/${clientId}`);
  revalidatePath("/app/settings/integrations");
}

async function reloadWorkspace(organizationId: string, clientId: string) {
  return loadClientXeroLinkWorkspaceData({ organizationId, clientId });
}

function failure(error: unknown, fallback: string): ClientXeroActionResult {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

export async function loadClientXeroWorkspaceAction(params: {
  clientId: string;
  searchTerm?: string | null;
}): Promise<ClientXeroActionResult> {
  try {
    const currentMember = await requireClientContactsReadContext();
    const workspace = await loadClientXeroLinkWorkspaceData({
      organizationId: currentMember.organization_id,
      clientId: params.clientId,
      searchTerm: params.searchTerm ?? null,
    });
    return { ok: true, workspace };
  } catch (error) {
    return failure(error, "Unable to load client Xero contacts.");
  }
}

export async function refreshClientXeroContactsAction(params: {
  clientId: string;
}): Promise<ClientXeroActionResult> {
  try {
    const currentMember = await requireClientContactsManageContext();
    const connection = await getOrganizationXeroConnection(currentMember.organization_id);
    if (!connection?.id || connection.status !== "connected" || !connection.tenant_id) {
      throw new Error("Connect Xero and select a tenant before refreshing contacts.");
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
      workerId: "client-contacts-manual-refresh",
    });

    revalidateClientContactPages(params.clientId);
    return {
      ok: true,
      workspace: await reloadWorkspace(currentMember.organization_id, params.clientId),
    };
  } catch (error) {
    return failure(error, "Unable to refresh Xero contacts.");
  }
}

export async function linkClientXeroContactAction(params: {
  clientId: string;
  importedContactId: string;
  allowRelink?: boolean;
  matchMethod?: "manual_search" | "suggested_match" | "manual_relink";
}): Promise<ClientXeroActionResult> {
  try {
    const currentMember = await requireClientContactsManageContext();
    await linkClientToImportedXeroContact({
      organizationId: currentMember.organization_id,
      clientId: params.clientId,
      importedContactId: params.importedContactId,
      actorUserId: currentMember.user_id,
      allowRelink: params.allowRelink ?? false,
      matchMethod: params.matchMethod ?? "manual_search",
    });
    revalidateClientContactPages(params.clientId);
    return {
      ok: true,
      workspace: await reloadWorkspace(currentMember.organization_id, params.clientId),
    };
  } catch (error) {
    return failure(error, "Unable to link the Xero contact.");
  }
}

export async function createClientXeroContactAction(params: {
  clientId: string;
  allowPotentialDuplicate: boolean;
}): Promise<ClientXeroActionResult> {
  try {
    const currentMember = await requireClientContactsManageContext();
    const result = await createAndLinkXeroContactFromClient({
      organizationId: currentMember.organization_id,
      clientId: params.clientId,
      actorUserId: currentMember.user_id,
      allowPotentialDuplicate: params.allowPotentialDuplicate,
    });
    if (!result.ok) {
      return {
        ok: false,
        requiresDuplicateConfirmation: true,
        suggestions: result.suggestions,
      };
    }
    revalidateClientContactPages(params.clientId);
    return {
      ok: true,
      workspace: await reloadWorkspace(currentMember.organization_id, params.clientId),
    };
  } catch (error) {
    return failure(error, "Unable to create and link the Xero contact.");
  }
}

export async function unlinkClientXeroContactAction(params: {
  clientId: string;
  confirmed: boolean;
}): Promise<ClientXeroActionResult> {
  try {
    if (!params.confirmed) throw new Error("Confirm the unlink before continuing.");
    const currentMember = await requireClientContactsManageContext();
    await unlinkClientXeroContact({
      organizationId: currentMember.organization_id,
      clientId: params.clientId,
    });
    revalidateClientContactPages(params.clientId);
    return {
      ok: true,
      workspace: await reloadWorkspace(currentMember.organization_id, params.clientId),
    };
  } catch (error) {
    return failure(error, "Unable to unlink the Xero contact.");
  }
}
