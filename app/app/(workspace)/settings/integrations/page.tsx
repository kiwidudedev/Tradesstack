import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getXeroInvoiceScopeStatus,
} from "@/lib/xero/scopes";
import { disconnectXeroAction, refreshXeroContactsAction, refreshXeroReferenceDataAction, selectXeroTenantAction } from "./actions";
import { DisconnectXeroDialog } from "./DisconnectXeroDialog";

type IntegrationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ConnectionRow = {
  id: string;
  status: string;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_type: string | null;
  scope: string[];
  available_tenants_json: Array<{
    tenantId: string;
    tenantName: string;
    tenantType: string;
    connectionId: string;
  }>;
  last_health_status: string | null;
  last_health_checked_at: string | null;
  last_accounts_sync_at: string | null;
  last_tax_rates_sync_at: string | null;
  last_contacts_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
};

type SyncJobRow = {
  id: string;
  job_kind: string;
  trigger_source: string;
  queue_state: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  last_completed_at: string | null;
};

function toSingleSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : null;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not yet";
  }

  return parsed.toLocaleString();
}

function formatStatusLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export default async function IntegrationsPage(props: IntegrationsPageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) {
    return null;
  }

  const canManage = await hasOrganizationPermission(
    currentMember.organization_id,
    "settings.organization.update",
  );

  const admin = await createAdminSupabaseClient();
  const [connectionResult, recentJobsResult, accountCountResult, taxRateCountResult, contactCountResult] = await Promise.all([
    admin
      .from("organization_xero_connections" as never)
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .maybeSingle(),
    admin
      .from("organization_accounting_sync_jobs" as never)
      .select("id, job_kind, trigger_source, queue_state, last_error, created_at, updated_at, last_completed_at")
      .eq("organization_id", currentMember.organization_id)
      .eq("provider", "xero")
      .order("created_at", { ascending: false })
      .limit(8),
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
  ]);

  const connection = (connectionResult.data ?? null) as ConnectionRow | null;
  const recentJobs = (recentJobsResult.data ?? []) as SyncJobRow[];
  const accountCount = accountCountResult.count ?? 0;
  const taxRateCount = taxRateCountResult.count ?? 0;
  const contactCount = contactCountResult.count ?? 0;
  const invoiceScopeStatus = getXeroInvoiceScopeStatus(connection?.scope);
  const message = toSingleSearchParam(searchParams.message);
  const error = toSingleSearchParam(searchParams.error);

  return (
    <div className="space-y-6">
      <Card className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]">
            Integrations
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            Phase 2 currently exposes the live Xero connection, tenant selection, secure token-backed sync, chart of
            accounts import, tax-rate import, and supplier-contact import for linking.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {message ? (
            <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-[var(--radius-lg)] border border-[var(--app-border)] bg-[var(--surface-muted)] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Xero</p>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                    {connection?.tenant_name ? connection.tenant_name : "No tenant connected"}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Status: {formatStatusLabel(connection?.status ?? "disconnected")}
                    {connection?.tenant_type ? ` · ${connection.tenant_type}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canManage ? (
                    <Button asChild type="button">
                      <a href="/api/integrations/xero/connect">
                        {connection?.status === "connected" ? "Reconnect Xero" : "Connect Xero"}
                      </a>
                    </Button>
                  ) : (
                    <Button type="button" disabled>
                      {connection?.status === "connected" ? "Reconnect Xero" : "Connect Xero"}
                    </Button>
                  )}
                  {connection?.status === "connected" ? (
                    <>
                      <form action={refreshXeroReferenceDataAction}>
                        <Button type="submit" variant="secondary" disabled={!canManage}>
                          Refresh Reference Data
                        </Button>
                      </form>
                      <form action={refreshXeroContactsAction}>
                        <Button type="submit" variant="secondary" disabled={!canManage}>
                          Refresh Xero Contacts
                        </Button>
                      </form>
                      <DisconnectXeroDialog action={disconnectXeroAction} disabled={!canManage} />
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--app-border)] bg-[var(--surface)] p-4">
                  <p className="text-sm font-medium text-[var(--text-secondary)]">Connection health</p>
                  <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                    {formatStatusLabel(connection?.last_health_status ?? "disconnected")}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Last checked {formatTimestamp(connection?.last_health_checked_at ?? null)}
                  </p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--app-border)] bg-[var(--surface)] p-4">
                  <p className="text-sm font-medium text-[var(--text-secondary)]">Imported reference data</p>
                  <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                    {accountCount} accounts · {taxRateCount} tax rates
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Accounts {formatTimestamp(connection?.last_accounts_sync_at ?? null)} · Tax rates{" "}
                    {formatTimestamp(connection?.last_tax_rates_sync_at ?? null)}
                  </p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--app-border)] bg-[var(--surface)] p-4">
                  <p className="text-sm font-medium text-[var(--text-secondary)]">Imported contacts</p>
                  <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{contactCount} contacts</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Last synced {formatTimestamp(connection?.last_contacts_sync_at ?? null)}
                  </p>
                </div>
              </div>

              {connection?.last_error ? (
                <div className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  {connection.last_error}
                </div>
              ) : null}

              {connection?.status === "awaiting_tenant_selection" && connection.available_tenants_json.length > 0 ? (
                <form action={selectXeroTenantAction} className="mt-5 space-y-3 rounded-[var(--radius-md)] border border-[var(--app-border)] bg-[var(--surface)] p-4">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">Select the Xero tenant</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      The OAuth exchange succeeded. Choose the tenant that belongs to this organization so TradesStack
                      can import the chart of accounts and tax rates.
                    </p>
                  </div>
                  <select
                    name="tenant_id"
                    defaultValue={connection.available_tenants_json[0]?.tenantId ?? ""}
                    className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text-primary)]"
                    disabled={!canManage}
                  >
                    {connection.available_tenants_json.map((tenant) => (
                      <option key={tenant.connectionId} value={tenant.tenantId}>
                        {tenant.tenantName} {tenant.tenantType ? `(${tenant.tenantType})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={!canManage}>
                      Use Selected Tenant
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--app-border)] bg-[var(--surface-muted)] p-5">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Current scope</h3>
              <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                <li>OAuth connection with Xero tenant selection</li>
                <li>Encrypted token storage on the server side</li>
                <li>Imported chart of accounts into company cost codes</li>
                <li>Imported tax rates into org accounting reference data</li>
                <li>Imported Xero contacts for supplier linking</li>
                <li>
                  Draft Supplier Bill export scope:{" "}
                  {invoiceScopeStatus}
                </li>
                <li>Manual refresh plus durable queued sync foundation</li>
              </ul>
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                Phase 3A can queue commercially approved Supplier Invoices as Draft Xero Bills. Authorisation,
                payments, attachments, webhooks, and posting workflows remain out of scope.
              </p>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--app-border)] bg-[var(--surface-muted)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Recent Xero sync jobs</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  The worker records each import or health check so the integration state is inspectable from the app.
                </p>
              </div>
            </div>

            {recentJobs.length === 0 ? (
              <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--app-border)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                No Xero sync jobs have run yet.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--app-border)] text-[var(--text-secondary)]">
                      <th className="py-2 pr-4 font-medium">Job</th>
                      <th className="py-2 pr-4 font-medium">Trigger</th>
                      <th className="py-2 pr-4 font-medium">State</th>
                      <th className="py-2 pr-4 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentJobs.map((job) => (
                      <tr key={job.id} className="border-b border-[var(--app-border)] last:border-b-0">
                        <td className="py-3 pr-4 text-[var(--text-primary)]">
                          <div>{formatStatusLabel(job.job_kind)}</div>
                          {job.last_error ? (
                            <div className="mt-1 text-xs text-amber-700">{job.last_error}</div>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 text-[var(--text-secondary)]">{formatStatusLabel(job.trigger_source)}</td>
                        <td className="py-3 pr-4 text-[var(--text-secondary)]">{formatStatusLabel(job.queue_state)}</td>
                        <td className="py-3 pr-4 text-[var(--text-secondary)]">{formatTimestamp(job.last_completed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
