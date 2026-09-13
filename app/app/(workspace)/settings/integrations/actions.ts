"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { buildIntegrationRedirect, disconnectOrganizationXero, getOrganizationXeroConnection, selectOrganizationXeroTenant } from "@/lib/xero/service";
import { enqueueOrganizationXeroSync, runXeroSyncWorker } from "@/lib/xero/sync";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAccountingRoute } from "@/lib/accounting/accounting-routes";

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

export async function saveAccountingRouteMappingAction(formData: FormData) {
  const currentMember = await requireIntegrationAdmin();
  const accountingRoute = readFormValue(formData, "accounting_route");
  const organizationCostCodeId = readFormValue(formData, "organization_cost_code_id");
  const projectId = readFormValue(formData, "project_id") || null;
  if (!isAccountingRoute(accountingRoute) || !organizationCostCodeId) {
    redirect(buildIntegrationRedirect({ error: "Select an accounting workflow and Xero account." }));
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: connection }, { data: account }] = await Promise.all([
    supabase.from("organization_xero_connections" as never)
      .select("tenant_id,status")
      .eq("organization_id", currentMember.organization_id)
      .eq("status", "connected")
      .maybeSingle(),
    supabase.from("organization_cost_codes")
      .select("id,organization_id,external_provider,is_active,metadata")
      .eq("organization_id", currentMember.organization_id)
      .eq("id", organizationCostCodeId)
      .maybeSingle(),
  ]);
  const connected = connection as null | { tenant_id: string | null; status: string };
  const accountMetadata = account?.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
    ? account.metadata as Record<string, unknown>
    : {};
  if (
    !connected?.tenant_id || !account || !account.is_active
    || account.external_provider !== "xero"
    || accountMetadata.tenantId !== connected.tenant_id
  ) {
    redirect(buildIntegrationRedirect({ error: "Select an active account from the connected Xero tenant." }));
  }

  const accountClass = String(accountMetadata.class ?? "").toUpperCase();
  const accountType = String(accountMetadata.type ?? "").toUpperCase();
  const validClass = accountingRoute === "supplier_bill_expense"
    ? ["EXPENSE", "DIRECTCOSTS"].includes(accountClass) || ["EXPENSE", "DIRECTCOSTS"].includes(accountType)
    : accountingRoute === "payment_claim_revenue"
      ? accountClass === "REVENUE"
      : accountClass === "ASSET" && accountType === "CURRENT";
  if (!validClass) {
    redirect(buildIntegrationRedirect({ error: "The selected Xero account has the wrong classification for this workflow." }));
  }

  const { error } = await supabase.rpc("set_organization_accounting_route_mapping" as never, {
    p_organization_id: currentMember.organization_id,
    p_provider: "xero",
    p_accounting_route: accountingRoute,
    p_organization_cost_code_id: organizationCostCodeId,
    p_project_id: projectId,
  } as never);
  if (error) {
    redirect(buildIntegrationRedirect({ error: "Unable to save the accounting workflow mapping." }));
  }
  revalidatePath(SETTINGS_PATH);
  redirect(buildIntegrationRedirect({ message: "Accounting workflow account saved." }));
}

export async function selectXeroTenantAction(formData: FormData) {
  const currentMember = await requireIntegrationAdmin();
  const tenantId = readFormValue(formData, "tenant_id");

  if (!tenantId) {
    redirect(buildIntegrationRedirect({ error: "Select a Xero tenant first." }));
  }

  let redirectTarget: string;
  let succeeded = false;

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

    await enqueueOrganizationXeroSync({
      organizationId: currentMember.organization_id,
      connectionId: connection.id,
      createdByUserId: currentMember.user_id,
      triggerSource: "tenant_selection",
      includeHealthCheck: true,
      includeContacts: true,
    });
    succeeded = true;
    redirectTarget = buildIntegrationRedirect({
      message: "Xero tenant selected. Reference data and contacts are queued for background refresh.",
    });
  } catch {
    redirectTarget = buildIntegrationRedirect({ error: "Unable to select the Xero tenant." });
  }

  if (succeeded) {
    revalidatePath(SETTINGS_PATH);
    revalidatePath(COST_CODES_PATH);
  }
  redirect(redirectTarget);
}

export async function refreshXeroReferenceDataAction() {
  const currentMember = await requireIntegrationAdmin();
  const connection = await getOrganizationXeroConnection(currentMember.organization_id);

  if (!connection?.id || connection.status !== "connected") {
    redirect(buildIntegrationRedirect({ error: "Connect Xero before refreshing reference data." }));
  }

  let redirectTarget: string;
  let refreshed = false;

  try {
    const jobs = await enqueueOrganizationXeroSync({
      organizationId: currentMember.organization_id,
      connectionId: connection.id,
      createdByUserId: currentMember.user_id,
      triggerSource: "manual_refresh",
      includeHealthCheck: true,
    });

    if (jobs.createdCount === 0) {
      redirectTarget = buildIntegrationRedirect({
        message: "Xero reference data refresh is already queued or in progress.",
      });
    } else {
      await runXeroSyncWorker({
        organizationId: currentMember.organization_id,
        limit: jobs.jobs.length,
        workerId: "xero-manual-refresh",
      });
      refreshed = true;
      redirectTarget = buildIntegrationRedirect({ message: "Xero reference data refreshed." });
    }
  } catch {
    redirectTarget = buildIntegrationRedirect({ error: "Unable to refresh Xero reference data." });
  }

  if (refreshed) {
    revalidatePath(SETTINGS_PATH);
    revalidatePath(COST_CODES_PATH);
  }
  redirect(redirectTarget);
}

export async function refreshXeroContactsAction() {
  const currentMember = await requireIntegrationAdmin();
  const connection = await getOrganizationXeroConnection(currentMember.organization_id);

  if (!connection?.id || connection.status !== "connected") {
    redirect(buildIntegrationRedirect({ error: "Connect Xero before refreshing contacts." }));
  }

  let redirectTarget: string;
  let refreshed = false;

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
      redirectTarget = buildIntegrationRedirect({
        message: "Xero contact refresh is already queued or in progress.",
      });
    } else {
      await runXeroSyncWorker({
        organizationId: currentMember.organization_id,
        limit: jobs.jobs.length,
        workerId: "xero-contacts-manual-refresh",
      });
      refreshed = true;
      redirectTarget = buildIntegrationRedirect({ message: "Xero contacts refreshed." });
    }
  } catch {
    redirectTarget = buildIntegrationRedirect({ error: "Unable to refresh Xero contacts." });
  }

  if (refreshed) {
    revalidatePath(SETTINGS_PATH);
  }
  redirect(redirectTarget);
}

export async function disconnectXeroAction(formData: FormData) {
  const currentMember = await requireIntegrationAdmin();
  const confirmationValue = readFormValue(formData, "disconnect_confirmation");

  if (confirmationValue !== "disconnect_xero") {
    redirect(buildIntegrationRedirect({ error: "Confirm the Xero disconnect before continuing." }));
  }

  let redirectTarget: string;
  let disconnected = false;

  try {
    await disconnectOrganizationXero({
      organizationId: currentMember.organization_id,
    });
    disconnected = true;
    redirectTarget = buildIntegrationRedirect({ message: "Xero disconnected." });
  } catch {
    redirectTarget = buildIntegrationRedirect({ error: "Unable to disconnect Xero." });
  }

  if (disconnected) {
    revalidatePath(SETTINGS_PATH);
  }
  redirect(redirectTarget);
}
