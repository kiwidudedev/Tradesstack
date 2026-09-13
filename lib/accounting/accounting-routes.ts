export const ACCOUNTING_ROUTES = [
  "supplier_bill_expense",
  "payment_claim_revenue",
  "retention_receivable",
] as const;

export type AccountingRoute = (typeof ACCOUNTING_ROUTES)[number];

export type OrganizationAccountingRouteMappingRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  provider: string;
  accounting_route: AccountingRoute;
  organization_cost_code_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountingRouteResolution = {
  status: "resolved" | "needs_accounting_setup";
  accountingRoute: AccountingRoute;
  accountingRouteMappingId: string | null;
  organizationCostCodeId: string | null;
  provider: string;
  requestedProjectId: string | null;
  resolvedProjectId: string | null;
  source: "project" | "organization" | "missing";
};

export function isAccountingRoute(value: unknown): value is AccountingRoute {
  return typeof value === "string" && ACCOUNTING_ROUTES.includes(value as AccountingRoute);
}

/**
 * Pure, batch-friendly route resolution. Callers load the organization's route
 * mappings once and resolve all lines without per-line database queries.
 */
export function resolveAccountingRoute(params: {
  mappings: OrganizationAccountingRouteMappingRow[];
  organizationId: string;
  provider: string;
  accountingRoute: AccountingRoute;
  projectId?: string | null;
}): AccountingRouteResolution {
  const provider = params.provider.trim().toLowerCase();
  const requestedProjectId = params.projectId ?? null;
  const mapping = params.mappings
    .filter((row) => row.is_active)
    .filter((row) => row.organization_id === params.organizationId)
    .filter((row) => row.provider.trim().toLowerCase() === provider)
    .filter((row) => row.accounting_route === params.accountingRoute)
    .filter((row) => row.project_id === requestedProjectId || row.project_id === null)
    .sort((left, right) => {
      const leftScope = left.project_id === requestedProjectId && requestedProjectId ? 0 : 1;
      const rightScope = right.project_id === requestedProjectId && requestedProjectId ? 0 : 1;
      if (leftScope !== rightScope) return leftScope - rightScope;
      if (left.updated_at !== right.updated_at) return right.updated_at.localeCompare(left.updated_at);
      return left.id.localeCompare(right.id);
    })[0] ?? null;

  if (!mapping) {
    return {
      status: "needs_accounting_setup",
      accountingRoute: params.accountingRoute,
      accountingRouteMappingId: null,
      organizationCostCodeId: null,
      provider,
      requestedProjectId,
      resolvedProjectId: null,
      source: "missing",
    };
  }

  return {
    status: "resolved",
    accountingRoute: params.accountingRoute,
    accountingRouteMappingId: mapping.id,
    organizationCostCodeId: mapping.organization_cost_code_id,
    provider,
    requestedProjectId,
    resolvedProjectId: mapping.project_id,
    source: mapping.project_id ? "project" : "organization",
  };
}

export function resolveAccountingRoutesForProjects(params: {
  mappings: OrganizationAccountingRouteMappingRow[];
  organizationId: string;
  provider: string;
  accountingRoute: AccountingRoute;
  projectIds: Array<string | null>;
}) {
  return new Map(
    [...new Set(params.projectIds)].map((projectId) => [
      projectId,
      resolveAccountingRoute({ ...params, projectId }),
    ]),
  );
}
