import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./DisconnectXeroDialog", () => ({
  DisconnectXeroDialog: () => <button type="button">Disconnect Xero</button>,
}));

import { XeroIntegrationView, type XeroIntegrationViewProps } from "./XeroIntegrationView";

const noopFormAction = async (formData: FormData) => {
  void formData;
};
const noopAction = async () => undefined;

function props(overrides: Partial<XeroIntegrationViewProps> = {}): XeroIntegrationViewProps {
  return {
    canManage: true,
    connectionLoaded: true,
    connection: {
      id: "connection-1",
      status: "connected",
      tenant_id: "tenant-1",
      tenant_name: "Tradesstack TEST",
      tenant_type: "ORGANISATION",
      scope: ["accounting.invoices"],
      available_tenants_json: [],
      last_health_status: "healthy",
      last_health_checked_at: "2026-08-22T10:00:00.000Z",
      last_accounts_sync_at: "2026-08-22T10:00:00.000Z",
      last_tax_rates_sync_at: "2026-08-21T10:00:00.000Z",
      last_contacts_sync_at: "2026-08-20T10:00:00.000Z",
      last_error: null,
      updated_at: "2026-08-22T10:00:00.000Z",
    },
    latestAttempt: {
      correlation_id: "support-1",
      status: "completed",
      expires_at: "2026-08-22T11:00:00.000Z",
      created_at: "2026-08-22T10:00:00.000Z",
    },
    latestAttemptLoaded: true,
    accountCount: 119,
    taxRateCount: 5,
    contactCount: 10,
    accounts: [{ id: "account-1", code: "620", external_code: "620", name: "Materials and supplies", metadata: {} }],
    routeMappings: [{ accounting_route: "supplier_bill_expense", organization_cost_code_id: "account-1", project_id: null }],
    recentJobs: [],
    message: null,
    error: null,
    supportReference: null,
    actions: {
      selectTenant: noopFormAction,
      refreshReferenceData: noopAction,
      refreshContacts: noopAction,
      saveAccountingRouteMapping: noopFormAction,
      disconnect: noopFormAction,
    },
    ...overrides,
  };
}

describe("XeroIntegrationView", () => {
  it("renders the correct page heading hierarchy and a healthy Connected summary", () => {
    const markup = renderToStaticMarkup(<XeroIntegrationView {...props()} />);
    expect(markup).toContain('<h2 id="integrations-page-title"');
    expect(markup).toContain('data-testid="xero-primary-status"');
    expect(markup).toContain(">Connected<");
    expect(markup).toContain("Tradesstack TEST");
    expect(markup).not.toContain('data-testid="xero-provider-recovery-action"');
  });

  it("keeps technical information in closed Advanced diagnostics", () => {
    const markup = renderToStaticMarkup(<XeroIntegrationView {...props()} />);
    const advancedStart = markup.indexOf("Advanced diagnostics");
    const containingDetails = markup.lastIndexOf("<details", advancedStart);
    const openingTagEnd = markup.indexOf(">", containingDetails);
    expect(markup.slice(containingDetails, openingTagEnd)).not.toContain("open");
    expect(markup).toContain("support-1");
  });

  it("does not render a misleading metric dashboard for a disconnected integration", () => {
    const disconnected = props({
      connection: { ...props().connection!, status: "disconnected", tenant_id: null, tenant_name: null, last_health_status: "disconnected" },
      accountCount: 0,
      taxRateCount: 0,
      contactCount: 0,
    });
    const markup = renderToStaticMarkup(<XeroIntegrationView {...disconnected} />);
    expect(markup).toContain(">Disconnected<");
    expect(markup).not.toContain('data-testid="xero-provider-metrics"');
    expect(markup).not.toContain("0 accounts");
    expect(markup).not.toContain("0 tax rates");
    expect(markup).not.toContain("0 contacts");
  });

  it("does not present a connection query failure as Not connected or zero data", () => {
    const markup = renderToStaticMarkup(<XeroIntegrationView {...props({
      connection: null,
      connectionLoaded: false,
      accountCount: null,
      taxRateCount: null,
      contactCount: null,
    })} />);
    expect(markup).toContain("Status unavailable");
    expect(markup).not.toContain(">Not connected<");
    expect(markup).not.toContain("0 accounts");
  });

  it("renders tenant selection as the open required setup task with the original tenant ID", () => {
    const markup = renderToStaticMarkup(<XeroIntegrationView {...props({
      connection: {
        ...props().connection!,
        status: "awaiting_tenant_selection",
        tenant_id: null,
        tenant_name: null,
        available_tenants_json: [{ tenantId: "tenant-required", tenantName: "Long Bay Construction", tenantType: "ORGANISATION", connectionId: "tenant-connection-1" }],
      },
    })} />);
    expect(markup).toContain("Action required");
    expect(markup).toContain('name="tenant_id"');
    expect(markup).toContain('value="tenant-required"');
    expect(markup).toContain("Use this organisation");
  });

  it("preserves independent mapping routes and gives save buttons unique accessible names", () => {
    const markup = renderToStaticMarkup(<XeroIntegrationView {...props()} />);
    expect(markup).toContain('name="accounting_route" value="supplier_bill_expense"');
    expect(markup).toContain('name="accounting_route" value="payment_claim_revenue"');
    expect(markup).toContain('name="accounting_route" value="retention_receivable"');
    expect(markup).toContain('aria-label="Save Supplier Bills account"');
    expect(markup).toContain('aria-label="Save Payment Claims account"');
    expect(markup).toContain('aria-label="Save Retention Receivable account"');
  });
});
