import { OperationalPanel } from "@/components/app/OperationalPanel";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  classifyXeroJobFailure,
  classifyXeroJobRetry,
  xeroJobDocumentIdentity,
} from "@/lib/xero/job-report";
import { DisconnectXeroDialog } from "./DisconnectXeroDialog";
import { PendingActionButton } from "./PendingActionButton";
import {
  deriveDatasetSyncState,
  deriveXeroConnectionPresentation,
  formatOAuthAttemptStatus,
  isAuthorizationInProgress,
  latestSuccessfulSync,
} from "./integration-presentation";

export type ConnectionRow = {
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

export type OAuthAttemptRow = {
  correlation_id: string | null;
  status: string | null;
  expires_at: string | null;
  created_at: string;
};

export type SyncJobRow = {
  id: string;
  connection_id: string | null;
  job_kind: string;
  trigger_source: string;
  queue_state: string;
  request_payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  retry_after: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  last_completed_at: string | null;
};

export type AccountingAccountRow = {
  id: string;
  code: string;
  name: string;
  external_code: string | null;
  metadata: Record<string, unknown>;
};

export const ACCOUNTING_ROUTE_LABELS = {
  supplier_bill_expense: "Supplier Bills",
  payment_claim_revenue: "Payment Claims",
  retention_receivable: "Retention Receivable",
} as const;

export type AccountingRoute = keyof typeof ACCOUNTING_ROUTE_LABELS;

export type RouteMappingRow = {
  accounting_route: AccountingRoute;
  organization_cost_code_id: string;
  project_id: string | null;
};

type IntegrationActions = {
  selectTenant: (formData: FormData) => Promise<void>;
  refreshReferenceData: () => Promise<void>;
  refreshContacts: () => Promise<void>;
  saveAccountingRouteMapping: (formData: FormData) => Promise<void>;
  disconnect: (formData: FormData) => Promise<void>;
};

export type XeroIntegrationViewProps = {
  canManage: boolean;
  connection: ConnectionRow | null;
  connectionLoaded: boolean;
  latestAttempt: OAuthAttemptRow | null;
  latestAttemptLoaded: boolean;
  accountCount: number | null;
  taxRateCount: number | null;
  contactCount: number | null;
  accounts: AccountingAccountRow[] | null;
  routeMappings: RouteMappingRow[] | null;
  recentJobs: SyncJobRow[] | null;
  message: string | null;
  error: string | null;
  supportReference: string | null;
  actions: IntegrationActions;
};

function formatTimestamp(value: string | null) {
  if (!value) return "Not yet synced";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not yet synced";
  return parsed.toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatusLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function CountValue({ value, suffix }: { value: number | null; suffix: string }) {
  return (
    <span className="font-semibold text-[var(--text-primary)]">
      {value === null ? "Unavailable" : `${value} ${suffix}`}
    </span>
  );
}

function ConnectAction({
  canManage,
  label,
  variant = "default",
}: {
  canManage: boolean;
  label: string;
  variant?: "default" | "secondary";
}) {
  if (!canManage) {
    return <Button disabled variant={variant}>{label}</Button>;
  }

  return (
    <Button asChild variant={variant}>
      <a href="/api/integrations/xero/connect">{label}</a>
    </Button>
  );
}

function Feedback({ message, error }: { message: string | null; error: string | null }) {
  return (
    <>
      {message ? (
        <div role="status" className="rounded-[var(--radius-md)] border border-[var(--success-light)] bg-[var(--success-light)] px-4 py-3 text-sm text-[var(--success)]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--error-light)] bg-[var(--error-light)] px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      ) : null}
    </>
  );
}

function ProviderSummary(props: XeroIntegrationViewProps) {
  const presentation = deriveXeroConnectionPresentation({
    connectionLoaded: props.connectionLoaded,
    connection: props.connection,
    latestAttemptStatus: props.latestAttempt?.status,
  });
  const connected = props.connection?.status === "connected";
  const lastSync = latestSuccessfulSync([
    props.connection?.last_accounts_sync_at,
    props.connection?.last_tax_rates_sync_at,
    props.connection?.last_contacts_sync_at,
  ]);
  const showRecoveryAction = [
    "not_connected",
    "disconnected",
    "authorization_in_progress",
    "authorization_interrupted",
    "attention_required",
  ].includes(presentation.key);
  const recoveryLabel = presentation.key === "not_connected"
    ? "Connect Xero"
    : presentation.key === "authorization_in_progress" || presentation.key === "authorization_interrupted"
      ? "Restart authorization"
      : "Reconnect Xero";

  return (
    <Card className="overflow-hidden" data-testid="xero-provider-summary">
      <div className="space-y-5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/xero logo.png" alt="" className="h-11 w-11 shrink-0 rounded-full" />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Xero</h3>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Accounting integration</p>
            </div>
          </div>
          <StatusBadge status={presentation.badgeStatus} data-testid="xero-primary-status" className="w-fit text-left">
            {presentation.label}
          </StatusBadge>
        </div>

        <div>
          {props.connection?.tenant_name ? (
            <p className="break-words text-base font-semibold text-[var(--text-primary)]">{props.connection.tenant_name}</p>
          ) : null}
          <p className="mt-1 max-w-[560px] text-sm leading-6 text-[var(--text-secondary)]">{presentation.description}</p>
          {props.connection?.tenant_type ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">Xero organisation type: {props.connection.tenant_type}</p>
          ) : null}
          {presentation.key === "disconnected" && (props.accountCount || props.taxRateCount || props.contactCount) ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Previously imported reference data and mappings remain available in TradesStack.</p>
          ) : null}
        </div>

        {connected ? (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">Last successful sync</p>
              <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{formatTimestamp(lastSync)}</p>
            </div>
            <dl data-testid="xero-provider-metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><dt className="text-xs text-[var(--text-muted)]">Accounts</dt><dd className="mt-1"><CountValue value={props.accountCount} suffix="accounts" /></dd></div>
              <div><dt className="text-xs text-[var(--text-muted)]">Tax rates</dt><dd className="mt-1"><CountValue value={props.taxRateCount} suffix="tax rates" /></dd></div>
              <div><dt className="text-xs text-[var(--text-muted)]">Contacts</dt><dd className="mt-1"><CountValue value={props.contactCount} suffix="contacts" /></dd></div>
            </dl>
          </>
        ) : null}

        {showRecoveryAction ? (
          <div data-testid="xero-provider-recovery-action" className="flex justify-start sm:justify-end">
            <ConnectAction canManage={props.canManage} label={recoveryLabel} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function TenantSelection(props: XeroIntegrationViewProps) {
  const tenants = props.connection?.available_tenants_json ?? [];
  if (props.connection?.status !== "awaiting_tenant_selection") return null;

  if (tenants.length === 0) {
    return (
      <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--text-primary)]">
        Xero authorization completed, but no organisations are available to select. Restart authorization or contact support.
      </div>
    );
  }

  return (
    <form action={props.actions.selectTenant} className="space-y-4">
      <div>
        <label htmlFor="xero-tenant-id" className="mb-1.5 block text-[13px] font-semibold text-[var(--text-primary)]">Xero organisation</label>
        <select
          id="xero-tenant-id"
          name="tenant_id"
          defaultValue={tenants[0]?.tenantId ?? ""}
          className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
          disabled={!props.canManage}
        >
          {tenants.map((tenant) => (
            <option key={tenant.connectionId} value={tenant.tenantId}>
              {tenant.tenantName} {tenant.tenantType ? `(${tenant.tenantType})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end">
        <PendingActionButton type="submit" pendingLabel="Selecting organisation..." disabled={!props.canManage}>
          Use this organisation
        </PendingActionButton>
      </div>
    </form>
  );
}

function ConnectionSection(props: XeroIntegrationViewProps) {
  const presentation = deriveXeroConnectionPresentation({
    connectionLoaded: props.connectionLoaded,
    connection: props.connection,
    latestAttemptStatus: props.latestAttempt?.status,
  });
  const connected = props.connection?.status === "connected";

  return (
    <OperationalPanel title="Connection" description={presentation.key === "tenant_required" ? "Finish Xero setup by selecting the correct organisation." : undefined}>
      <div className="space-y-5">
        <TenantSelection {...props} />
        {presentation.key !== "tenant_required" ? (
          <dl className="divide-y divide-[var(--border)]">
            <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
              <dt className="text-sm text-[var(--text-secondary)]">Connected organisation</dt>
              <dd className="break-words text-sm font-medium text-[var(--text-primary)]">{props.connection?.tenant_name ?? "Not selected"}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
              <dt className="text-sm text-[var(--text-secondary)]">Connection state</dt>
              <dd className="text-sm font-medium text-[var(--text-primary)]">{presentation.label}</dd>
            </div>
            <div className="grid gap-1 py-3 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
              <dt className="text-sm text-[var(--text-secondary)]">Health</dt>
              <dd className="text-sm font-medium text-[var(--text-primary)]">
                {formatStatusLabel(props.connection?.last_health_status ?? "not checked")}
                <span className="mt-1 block font-normal text-[var(--text-secondary)]">Last checked {formatTimestamp(props.connection?.last_health_checked_at ?? null)}</span>
              </dd>
            </div>
          </dl>
        ) : null}

        {connected ? (
          <div className="flex justify-end">
            <ConnectAction canManage={props.canManage} label="Reconnect Xero" variant="secondary" />
          </div>
        ) : null}
      </div>
    </OperationalPanel>
  );
}

function SyncRow({
  label,
  count,
  countSuffix,
  timestamp,
  state,
}: {
  label: string;
  count: number | null;
  countSuffix: string;
  timestamp: string | null;
  state: string;
}) {
  return (
    <div className="grid gap-2 border-b border-[var(--border)] py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div>
        <p className="font-medium text-[var(--text-primary)]">{label}</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{state} · {formatTimestamp(timestamp)}</p>
      </div>
      <p className="text-sm"><CountValue value={count} suffix={countSuffix} /></p>
    </div>
  );
}

function DataSynchronisationSection(props: XeroIntegrationViewProps) {
  const jobsLoaded = props.recentJobs !== null;
  const connected = props.connection?.status === "connected";

  return (
    <OperationalPanel title="Data synchronisation" description="Review imported Xero reference data and run a manual refresh when needed." contentClassName="p-0">
      <div className="px-6">
        <SyncRow
          label="Chart of accounts"
          count={props.accountCount}
          countSuffix="accounts"
          timestamp={props.connection?.last_accounts_sync_at ?? null}
          state={deriveDatasetSyncState({ jobKind: "import_accounts", lastSyncedAt: props.connection?.last_accounts_sync_at ?? null, jobs: props.recentJobs, loaded: props.accountCount !== null && jobsLoaded })}
        />
        <SyncRow
          label="Tax rates"
          count={props.taxRateCount}
          countSuffix="tax rates"
          timestamp={props.connection?.last_tax_rates_sync_at ?? null}
          state={deriveDatasetSyncState({ jobKind: "import_tax_rates", lastSyncedAt: props.connection?.last_tax_rates_sync_at ?? null, jobs: props.recentJobs, loaded: props.taxRateCount !== null && jobsLoaded })}
        />
        <SyncRow
          label="Contacts"
          count={props.contactCount}
          countSuffix="contacts"
          timestamp={props.connection?.last_contacts_sync_at ?? null}
          state={deriveDatasetSyncState({ jobKind: "import_contacts", lastSyncedAt: props.connection?.last_contacts_sync_at ?? null, jobs: props.recentJobs, loaded: props.contactCount !== null && jobsLoaded })}
        />
      </div>
      {connected ? (
        <div className="flex flex-col gap-2 border-t border-[var(--border)] px-6 py-4 sm:flex-row sm:justify-end">
          <form action={props.actions.refreshReferenceData}>
            <PendingActionButton type="submit" variant="secondary" pendingLabel="Refreshing reference data..." disabled={!props.canManage} className="w-full sm:w-auto">
              Refresh reference data
            </PendingActionButton>
          </form>
          <form action={props.actions.refreshContacts}>
            <PendingActionButton type="submit" variant="secondary" pendingLabel="Refreshing contacts..." disabled={!props.canManage} className="w-full sm:w-auto">
              Refresh contacts
            </PendingActionButton>
          </form>
        </div>
      ) : null}
    </OperationalPanel>
  );
}

function AccountingMappingsSection(props: XeroIntegrationViewProps) {
  const mappingsLoaded = props.routeMappings !== null && props.accounts !== null;
  const configuredCount = mappingsLoaded
    ? Object.keys(ACCOUNTING_ROUTE_LABELS).filter((route) => props.routeMappings?.some((mapping) => mapping.accounting_route === route && mapping.project_id === null)).length
    : null;
  const connected = props.connection?.status === "connected";

  return (
    <OperationalPanel
      title="Accounting workflow accounts"
      description={configuredCount === null ? "Account configuration is temporarily unavailable." : `${configuredCount} of ${Object.keys(ACCOUNTING_ROUTE_LABELS).length} workflows set up`}
      contentClassName="p-0"
    >
      {!mappingsLoaded ? (
        <div role="alert" className="px-6 py-5 text-sm text-[var(--error)]">TradesStack could not load the Xero account configuration. Try reloading the page.</div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {Object.entries(ACCOUNTING_ROUTE_LABELS).map(([routeValue, label]) => {
            const route = routeValue as AccountingRoute;
            const current = props.routeMappings?.find((mapping) => mapping.accounting_route === route && mapping.project_id === null);
            const selectId = `xero-account-${route}`;
            return (
              <form key={route} action={props.actions.saveAccountingRouteMapping} className="space-y-3 px-6 py-5">
                <input type="hidden" name="accounting_route" value={route} />
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div>
                    <label htmlFor={selectId} className="mb-1.5 block text-[13px] font-semibold text-[var(--text-primary)]">{label}</label>
                    <select
                      id={selectId}
                      name="organization_cost_code_id"
                      defaultValue={current?.organization_cost_code_id ?? ""}
                      className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
                      disabled={!props.canManage || !connected}
                    >
                      <option value="">Select Xero account</option>
                      {props.accounts?.map((account) => (
                        <option key={account.id} value={account.id}>{account.external_code ?? account.code} · {account.name}</option>
                      ))}
                    </select>
                  </div>
                  <PendingActionButton
                    type="submit"
                    variant="secondary"
                    pendingLabel={`Saving ${label}...`}
                    disabled={!props.canManage || !connected}
                    aria-label={`Save ${label} account`}
                    className="w-full sm:w-auto"
                  >
                    Save account
                  </PendingActionButton>
                </div>
                <p className="text-xs text-[var(--text-muted)]">{current ? "Configured" : "Accounting setup required"}</p>
              </form>
            );
          })}
        </div>
      )}
    </OperationalPanel>
  );
}

function RecentJobs({ jobs }: { jobs: SyncJobRow[] | null }) {
  if (jobs === null) return <p role="alert" className="text-sm text-[var(--error)]">Recent Xero jobs could not be loaded.</p>;
  if (jobs.length === 0) return <p className="text-sm text-[var(--text-secondary)]">No Xero sync jobs have run yet.</p>;

  return (
    <>
      <div className="space-y-3 md:hidden">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-[var(--text-primary)]">{formatStatusLabel(job.job_kind)}</p>
              <span className="text-xs text-[var(--text-secondary)]">{formatStatusLabel(job.queue_state)}</span>
            </div>
            <p className="mt-2 break-all text-xs text-[var(--text-muted)]">{job.id}</p>
            <p className="mt-2 break-words text-xs text-[var(--text-secondary)]">{xeroJobDocumentIdentity(job.request_payload) ?? "Organization-wide"}</p>
            {job.last_error ? <p className="mt-2 break-words text-xs text-[var(--error)]">{job.last_error}</p> : null}
            <p className="mt-2 text-xs text-[var(--text-muted)]">Updated {formatTimestamp(job.updated_at)}</p>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[920px] text-left text-xs">
          <thead><tr className="border-b border-[var(--border)] text-[var(--text-secondary)]"><th className="py-2 pr-4 font-medium">Job</th><th className="py-2 pr-4 font-medium">Document</th><th className="py-2 pr-4 font-medium">Trigger</th><th className="py-2 pr-4 font-medium">State</th><th className="py-2 pr-4 font-medium">Failure</th><th className="py-2 pr-4 font-medium">Retry</th><th className="py-2 pr-4 font-medium">Attempts</th><th className="py-2 font-medium">Updated</th></tr></thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className="max-w-[180px] py-3 pr-4 text-[var(--text-primary)]"><div>{formatStatusLabel(job.job_kind)}</div><div className="mt-1 break-all text-[11px] text-[var(--text-muted)]">{job.id}</div>{job.last_error ? <div className="mt-1 break-words text-[11px] text-[var(--error)]">{job.last_error}</div> : null}</td>
                <td className="max-w-[180px] break-words py-3 pr-4 text-[var(--text-secondary)]">{xeroJobDocumentIdentity(job.request_payload) ?? "Organization-wide"}</td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">{formatStatusLabel(job.trigger_source)}</td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">{formatStatusLabel(job.queue_state)}</td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">{formatStatusLabel(classifyXeroJobFailure(job))}</td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">{formatStatusLabel(classifyXeroJobRetry(job))}</td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">{job.attempt_count}/{job.max_attempts}</td>
                <td className="whitespace-nowrap py-3 text-[var(--text-secondary)]">{formatTimestamp(job.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AdvancedDiagnostics(props: XeroIntegrationViewProps) {
  const supportReference = props.supportReference ?? props.latestAttempt?.correlation_id ?? null;
  return (
    <details className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <summary className="cursor-pointer list-none rounded-[var(--radius-lg)] px-6 py-5 text-base font-semibold text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-blue)] [&::-webkit-details-marker]:hidden">
        Advanced diagnostics
        <span className="mt-1 block text-sm font-normal text-[var(--text-secondary)]">Authorization history, permissions, support information, and recent sync jobs.</span>
      </summary>
      <div className="space-y-6 border-t border-[var(--border)] px-6 py-5">
        <dl className="divide-y divide-[var(--border)]">
          <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"><dt className="text-sm text-[var(--text-secondary)]">Latest authorization</dt><dd className="text-sm font-medium text-[var(--text-primary)]">{props.latestAttemptLoaded ? formatOAuthAttemptStatus(props.latestAttempt?.status) : "Unavailable"}{isAuthorizationInProgress(props.latestAttempt?.status) ? <span className="mt-1 block font-normal text-[var(--text-secondary)]">Expires {formatTimestamp(props.latestAttempt?.expires_at ?? null)}</span> : null}</dd></div>
          <div className="grid gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"><dt className="text-sm text-[var(--text-secondary)]">Granted permissions</dt><dd className="break-words text-sm text-[var(--text-primary)]">{props.connection?.scope?.length ? props.connection.scope.join(", ") : "None recorded"}</dd></div>
          {supportReference ? <div className="grid gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"><dt className="text-sm text-[var(--text-secondary)]">Support reference</dt><dd className="break-all text-sm text-[var(--text-primary)]">{supportReference}</dd></div> : null}
          {props.connection?.last_error ? <div className="grid gap-1 py-3 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"><dt className="text-sm text-[var(--text-secondary)]">Technical error</dt><dd className="break-words text-sm text-[var(--error)]">{props.connection.last_error}</dd></div> : null}
        </dl>
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Recent Xero sync jobs</h4>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Read-only operational history. Jobs are not retried from this report.</p>
          <div className="mt-4"><RecentJobs jobs={props.recentJobs} /></div>
        </div>
      </div>
    </details>
  );
}

function DangerZone(props: XeroIntegrationViewProps) {
  if (props.connection?.status !== "connected") return null;
  return (
    <OperationalPanel title="Disconnect Xero" description="Stops future Xero synchronisation until the organisation reconnects. Imported reference data, mappings, and historical records are retained.">
      <div className="flex justify-start sm:justify-end">
        <DisconnectXeroDialog action={props.actions.disconnect} disabled={!props.canManage} />
      </div>
    </OperationalPanel>
  );
}

export function XeroIntegrationView(props: XeroIntegrationViewProps) {
  const presentation = deriveXeroConnectionPresentation({
    connectionLoaded: props.connectionLoaded,
    connection: props.connection,
    latestAttemptStatus: props.latestAttempt?.status,
  });
  const hasRetainedData = [props.accountCount, props.taxRateCount, props.contactCount].some((value) => typeof value === "number" && value > 0);
  const showManagement = props.connectionLoaded && Boolean(props.connection || hasRetainedData);

  return (
    <section className="space-y-5" aria-labelledby="integrations-page-title">
      <header className="space-y-2 pb-1 pt-1">
        <h2 id="integrations-page-title" className="text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-primary)]">Integrations</h2>
        <p className="max-w-[600px] text-sm leading-6 text-[var(--text-secondary)]">Connect and manage the external services used by TradesStack.</p>
      </header>

      <Feedback message={props.message} error={props.error} />

      {!props.connectionLoaded ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--error-light)] bg-[var(--error-light)] px-4 py-3 text-sm text-[var(--error)]">
          Connection details could not be loaded. No connection changes are available until the page is reloaded successfully.
        </div>
      ) : null}

      <ProviderSummary {...props} />

      {showManagement ? (
        <details open={presentation.managementOpen} className="group space-y-5">
          <summary className="cursor-pointer list-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] [&::-webkit-details-marker]:hidden">
            Manage Xero
            <span className="float-right font-normal text-[var(--text-secondary)]" aria-hidden="true">Details</span>
          </summary>
          <div className="space-y-5 pt-1">
            <ConnectionSection {...props} />
            {props.connection?.status === "connected" || hasRetainedData ? <DataSynchronisationSection {...props} /> : null}
            {props.connection?.status === "connected" || hasRetainedData || (props.routeMappings?.length ?? 0) > 0 ? <AccountingMappingsSection {...props} /> : null}
            <AdvancedDiagnostics {...props} />
            <DangerZone {...props} />
          </div>
        </details>
      ) : null}
    </section>
  );
}
