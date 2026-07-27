"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { buildIntegrationRedirect, disconnectOrganizationXero, getOrganizationXeroConnection, selectOrganizationXeroTenant } from "@/lib/xero/service";
import { enqueueOrganizationXeroSync, runXeroSyncWorker } from "@/lib/xero/sync";

const SETTINGS_PATH = "/app/settings/integrations";
const COST_CODES_PATH = "/app/company/cost-codes";

async function requireIntegrationAdmin() {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    redirect("/sign-in");
  }

  const canManage = await hasOrganizationPermission(
    currentMember.organization_id,
    "settings.organization.update",
  );

  if (!canManage) {
    redirect(buildIntegrationRedirect({ error: "You do not have permission to manage integrations." }));
  }

  return currentMember;
}

function readFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function selectXeroTenantAction(formData: FormData) {
  const currentMember = await requireIntegrationAdmin();
  const tenantId = readFormValue(formData, "tenant_id");

  if (!tenantId) {
    redirect(buildIntegrationRedirect({ error: "Select a Xero tenant first." }));
  }

  try {
    await selectOrganizationXeroTenant({
      organizationId: currentMember.organization_id,
      tenantId,
      userId: currentMember.user_id,
    });

    const connection = await getOrganizationXeroConnection(currentMember.organization_id);
    if (!connection?.id) {
      throw new Error("The Xero connection could not be reloaded after tenant selection.");
    }

    const jobs = await enqueueOrganizationXeroSync({
      organizationId: currentMember.organization_id,
      connectionId: connection.id,
      createdByUserId: currentMember.user_id,
      triggerSource: "tenant_selection",
      includeHealthCheck: true,
      includeContacts: true,
    });

    await runXeroSyncWorker({
      organizationId: currentMember.organization_id,
      limit: jobs.jobs.length,
      workerId: "xero-tenant-selection",
    });
  } catch (error) {
    redirect(buildIntegrationRedirect({
      error: error instanceof Error ? error.message : "Unable to select the Xero tenant.",
    }));
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath(COST_CODES_PATH);
  redirect(buildIntegrationRedirect({ message: "Xero tenant selected and reference data refreshed." }));
}

export async function refreshXeroReferenceDataAction() {
  const currentMember = await requireIntegrationAdmin();
  const connection = await getOrganizationXeroConnection(currentMember.organization_id);

  if (!connection?.id || connection.status !== "connected") {
    redirect(buildIntegrationRedirect({ error: "Connect Xero before refreshing reference data." }));
  }

  try {
    const jobs = await enqueueOrganizationXeroSync({
      organizationId: currentMember.organization_id,
      connectionId: connection.id,
      createdByUserId: currentMember.user_id,
      triggerSource: "manual_refresh",
      includeHealthCheck: true,
    });

    if (jobs.createdCount === 0) {
      redirect(buildIntegrationRedirect({ message: "Xero reference data refresh is already queued or in progress." }));
    }

    await runXeroSyncWorker({
      organizationId: currentMember.organization_id,
      limit: jobs.jobs.length,
      workerId: "xero-manual-refresh",
    });
  } catch (error) {
    redirect(buildIntegrationRedirect({
      error: error instanceof Error ? error.message : "Unable to refresh Xero reference data.",
    }));
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath(COST_CODES_PATH);
  redirect(buildIntegrationRedirect({ message: "Xero reference data refreshed." }));
}

export async function refreshXeroContactsAction() {
  const currentMember = await requireIntegrationAdmin();
  const connection = await getOrganizationXeroConnection(currentMember.organization_id);

  if (!connection?.id || connection.status !== "connected") {
    redirect(buildIntegrationRedirect({ error: "Connect Xero before refreshing contacts." }));
  }

  try {
    const jobs = await enqueueOrganizationXeroSync({
      organizationId: currentMember.organization_id,
      connectionId: connection.id,
      createdByUserId: currentMember.user_id,
      triggerSource: "manual_refresh",
      includeContacts: true,
      includeHealthCheck: true,
    });

    if (jobs.createdCount === 0) {
      redirect(buildIntegrationRedirect({ message: "Xero contact refresh is already queued or in progress." }));
    }

    await runXeroSyncWorker({
      organizationId: currentMember.organization_id,
      limit: jobs.jobs.length,
      workerId: "xero-contacts-manual-refresh",
    });
  } catch (error) {
    redirect(buildIntegrationRedirect({
      error: error instanceof Error ? error.message : "Unable to refresh Xero contacts.",
    }));
  }

  revalidatePath(SETTINGS_PATH);
  redirect(buildIntegrationRedirect({ message: "Xero contacts refreshed." }));
}

export async function disconnectXeroAction(formData: FormData) {
  const currentMember = await requireIntegrationAdmin();
  const confirmationValue = readFormValue(formData, "disconnect_confirmation");

  if (confirmationValue !== "disconnect_xero") {
    redirect(buildIntegrationRedirect({ error: "Confirm the Xero disconnect before continuing." }));
  }

  try {
    await disconnectOrganizationXero({
      organizationId: currentMember.organization_id,
    });
  } catch (error) {
    redirect(buildIntegrationRedirect({
      error: error instanceof Error ? error.message : "Unable to disconnect Xero.",
    }));
  }

  revalidatePath(SETTINGS_PATH);
  redirect(buildIntegrationRedirect({ message: "Xero disconnected." }));
}
