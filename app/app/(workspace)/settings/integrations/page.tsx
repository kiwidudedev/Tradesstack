import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getLatestXeroOAuthAttempt,
  getSafeLegacyIntegrationError,
  getSafeXeroRecoveryMessage,
} from "@/lib/xero/service";
import {
  disconnectXeroAction,
  refreshXeroContactsAction,
  refreshXeroReferenceDataAction,
  saveAccountingRouteMappingAction,
  selectXeroTenantAction,
} from "./actions";
import {
  XeroIntegrationView,
  type AccountingAccountRow,
  type ConnectionRow,
  type OAuthAttemptRow,
  type RouteMappingRow,
  type SyncJobRow,
} from "./XeroIntegrationView";

type IntegrationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : null;
}

export default async function IntegrationsPage(props: IntegrationsPageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) return null;

  const [canManage, latestAttemptResult, admin] = await Promise.all([
    hasOrganizationPermission(currentMember.organization_id, "settings.organization.update"),
    getLatestXeroOAuthAttempt(currentMember.organization_id)
      .then((data) => ({ data: data as OAuthAttemptRow | null, loaded: true }))
      .catch(() => ({ data: null, loaded: false })),
    createAdminSupabaseClient(),
  ]);

  const [
    connectionResult,
    recentJobsResult,
    accountCountResult,
    taxRateCountResult,
    contactCountResult,
    accountsResult,
    routeMappingsResult,
  ] = await Promise.all([
    admin
      .from("organization_xero_connections" as never)
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .maybeSingle(),
    admin
      .from("organization_accounting_sync_jobs" as never)
      .select("id, connection_id, job_kind, trigger_source, queue_state, request_payload, attempt_count, max_attempts, available_at, retry_after, last_error, created_at, updated_at, last_completed_at")
      .eq("organization_id", currentMember.organization_id)
      .eq("provider", "xero")
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("organization_cost_codes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", currentMember.organization_id)
      .eq("external_provider", "xero")
      .eq("is_active", true),
    admin
      .from("organization_accounting_tax_rates" as never)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", currentMember.organization_id)
      .eq("provider", "xero")
      .eq("is_active", true),
    admin
      .from("organization_xero_contacts" as never)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", currentMember.organization_id),
    admin
      .from("organization_cost_codes")
      .select("id,code,name,external_code,metadata")
      .eq("organization_id", currentMember.organization_id)
      .eq("external_provider", "xero")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    admin
      .from("organization_accounting_route_mappings" as never)
      .select("id,accounting_route,organization_cost_code_id,project_id,is_active")
      .eq("organization_id", currentMember.organization_id)
      .eq("provider", "xero")
      .eq("is_active", true),
  ]);

  const legacyError = toSingleSearchParam(searchParams.error);
  const errorCode = toSingleSearchParam(searchParams.error_code);
  const queryError = getSafeXeroRecoveryMessage(errorCode) ?? getSafeLegacyIntegrationError(legacyError);
  const partialLoadFailure = [
    recentJobsResult.error,
    accountCountResult.error,
    taxRateCountResult.error,
    contactCountResult.error,
    accountsResult.error,
    routeMappingsResult.error,
  ].some(Boolean);
  const loadError = connectionResult.error
    ? "TradesStack could not confirm the current Xero connection. Reload the page before making connection changes."
    : partialLoadFailure
      ? "Some Xero integration details could not be loaded. Unavailable values have not been shown as zero."
      : !latestAttemptResult.loaded
        ? "Authorization history is temporarily unavailable. The current Xero connection state is still shown separately."
        : null;

  return (
    <XeroIntegrationView
      canManage={canManage}
      connection={(connectionResult.data ?? null) as ConnectionRow | null}
      connectionLoaded={!connectionResult.error}
      latestAttempt={latestAttemptResult.data}
      latestAttemptLoaded={latestAttemptResult.loaded}
      accountCount={accountCountResult.error ? null : accountCountResult.count ?? 0}
      taxRateCount={taxRateCountResult.error ? null : taxRateCountResult.count ?? 0}
      contactCount={contactCountResult.error ? null : contactCountResult.count ?? 0}
      accounts={accountsResult.error ? null : (accountsResult.data ?? []) as AccountingAccountRow[]}
      routeMappings={routeMappingsResult.error ? null : (routeMappingsResult.data ?? []) as RouteMappingRow[]}
      recentJobs={recentJobsResult.error ? null : (recentJobsResult.data ?? []) as SyncJobRow[]}
      message={toSingleSearchParam(searchParams.message)}
      error={queryError ?? loadError}
      supportReference={toSingleSearchParam(searchParams.correlation_id)}
      actions={{
        selectTenant: selectXeroTenantAction,
        refreshReferenceData: refreshXeroReferenceDataAction,
        refreshContacts: refreshXeroContactsAction,
        saveAccountingRouteMapping: saveAccountingRouteMappingAction,
        disconnect: disconnectXeroAction,
      }}
    />
  );
}
