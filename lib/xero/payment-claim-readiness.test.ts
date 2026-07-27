import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createAdminSupabaseClient, getOrganizationXeroConnection } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  getOrganizationXeroConnection: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));
vi.mock("@/lib/xero/service", () => ({ getOrganizationXeroConnection }));

import {
  evaluatePaymentClaimXeroReadiness,
  evaluatePaymentClaimXeroReadinessSnapshot,
  type PaymentClaimXeroReadinessBlockerCode,
  type PaymentClaimXeroReadinessSnapshot,
} from "./payment-claim-readiness";

type Row = Record<string, unknown>;

function baseSnapshot(): PaymentClaimXeroReadinessSnapshot {
  return {
    organization: { id: "org-1", country: "New Zealand", default_currency: "NZD", tax_registration_status: "registered" },
    claim: {
      id: "claim-1", organization_id: "org-1", project_id: "project-1", status: "Submitted",
      claim_amount: 1000, retention_withheld_amount: 100,
      retention_released_amount: 0, gst_amount: 135,
    },
    project: { id: "project-1", organization_id: "org-1", client_id: "client-1" },
    client: { id: "client-1", organization_id: "org-1" },
    connection: { id: "conn-1", organization_id: "org-1", status: "connected", tenant_id: "tenant-1" },
    contactLinks: [{
      id: "link-1", organization_id: "org-1", provider: "xero", accounting_connection_id: "conn-1",
      tenant_id: "tenant-1", local_entity_type: "client", local_entity_id: "client-1",
      external_contact_id: "contact-1", link_status: "linked",
    }],
    importedContacts: [{
      id: "imported-1", organization_id: "org-1", connection_id: "conn-1", tenant_id: "tenant-1",
      contact_id: "contact-1", contact_status: "ACTIVE",
    }],
    mappings: [
      {
        id: "mapping-600", organization_id: "org-1", provider: "xero", tradesstack_cost_code: 600,
        organization_cost_code_id: "account-600", project_id: null, is_active: true, updated_at: "2026-07-22T00:00:00Z",
      },
      {
        id: "mapping-700", organization_id: "org-1", provider: "xero", tradesstack_cost_code: 700,
        organization_cost_code_id: "account-700", project_id: null, is_active: true, updated_at: "2026-07-22T00:00:00Z",
      },
    ],
    costCodes: [
      {
        id: "account-600", organization_id: "org-1", is_active: true, external_provider: "xero", external_code: "200",
        metadata: { accountId: "xero-account-600", tenantId: "tenant-1", status: "ACTIVE", class: "REVENUE", type: "REVENUE" },
      },
      {
        id: "account-700", organization_id: "org-1", is_active: true, external_provider: "xero", external_code: "620",
        metadata: { accountId: "xero-account-700", tenantId: "tenant-1", status: "ACTIVE", class: "ASSET", type: "CURRENT" },
      },
    ],
    taxRates: [{
      id: "tax-1", organization_id: "org-1", provider: "xero", accounting_connection_id: "conn-1",
      tenant_id: "tenant-1", jurisdiction_code: "NZ", is_active: true, status: "ACTIVE",
      tax_type: "OUTPUT2", effective_rate: 15, synced_at: "2026-07-22T00:00:00Z",
      metadata: { canApplyToRevenue: true },
    }],
    accountingDocuments: [],
  };
}

function cloneSnapshot() {
  return structuredClone(baseSnapshot());
}

function codes(snapshot: PaymentClaimXeroReadinessSnapshot) {
  return evaluatePaymentClaimXeroReadinessSnapshot(snapshot).blockers.map((blocker) => blocker.code);
}

function expectBlocker(
  code: PaymentClaimXeroReadinessBlockerCode,
  mutate: (snapshot: PaymentClaimXeroReadinessSnapshot) => void,
) {
  const snapshot = cloneSnapshot();
  mutate(snapshot);
  expect(codes(snapshot)).toContain(code);
}

describe("Payment Claim Xero readiness snapshot", () => {
  it("returns ready for a submitted NZD claim with current tenant-scoped dependencies", () => {
    expect(evaluatePaymentClaimXeroReadinessSnapshot(baseSnapshot())).toEqual({ ready: true, blockers: [] });
  });

  it("does not require route 700 when signed retention is zero", () => {
    const snapshot = cloneSnapshot();
    snapshot.claim.retention_withheld_amount = 100;
    snapshot.claim.retention_released_amount = 100;
    snapshot.mappings = snapshot.mappings.filter((row) => row.tradesstack_cost_code !== 700);
    snapshot.costCodes = snapshot.costCodes.filter((row) => row.id !== "account-700");
    expect(evaluatePaymentClaimXeroReadinessSnapshot(snapshot)).toEqual({ ready: true, blockers: [] });
  });

  it("requires route 700 when signed retention is non-zero", () => {
    expectBlocker("retention_mapping_missing", (snapshot) => {
      snapshot.mappings = snapshot.mappings.filter((row) => row.tradesstack_cost_code !== 700);
    });
  });

  it("accepts Submitted and blocks Draft claims", () => {
    expect(codes(baseSnapshot())).not.toContain("claim_not_submitted");
    expectBlocker("claim_not_submitted", (snapshot) => { snapshot.claim.status = "Draft"; });
  });

  it("covers connection, tenant, Contact, currency and tax blockers", () => {
    expectBlocker("xero_disconnected", (snapshot) => { snapshot.connection!.status = "disconnected"; });
    expectBlocker("xero_tenant_missing", (snapshot) => { snapshot.connection!.tenant_id = null; });
    expectBlocker("client_contact_missing", (snapshot) => { snapshot.contactLinks = []; });
    expectBlocker("client_contact_organization_mismatch", (snapshot) => { snapshot.contactLinks[0].organization_id = "org-2"; });
    expectBlocker("client_contact_connection_mismatch", (snapshot) => { snapshot.contactLinks[0].accounting_connection_id = "conn-2"; });
    expectBlocker("client_contact_tenant_mismatch", (snapshot) => { snapshot.contactLinks[0].tenant_id = "tenant-2"; });
    expectBlocker("client_contact_inactive", (snapshot) => { snapshot.importedContacts[0].contact_status = "ARCHIVED"; });
    expectBlocker("unsupported_currency", (snapshot) => { snapshot.organization.default_currency = ""; });
    expectBlocker("revenue_tax_type_missing", (snapshot) => { snapshot.taxRates = []; });
  });

  it("does not block a configured non-NZ organisation solely by country", () => {
    const snapshot = cloneSnapshot();
    snapshot.organization.country = "Australia";
    snapshot.organization.default_currency = "AUD";
    snapshot.organization.tax_registration_status = "unregistered";
    snapshot.taxRates[0].jurisdiction_code = "AU";
    snapshot.taxRates[0].tax_type = "OUTPUT";
    snapshot.taxRates[0].effective_rate = 10;
    expect(evaluatePaymentClaimXeroReadinessSnapshot(snapshot)).toEqual({
      ready: true,
      blockers: [],
    });
  });

  it("covers Sales mapping, account activity, tenant and classification blockers", () => {
    expectBlocker("sales_mapping_missing", (snapshot) => {
      snapshot.mappings = snapshot.mappings.filter((row) => row.tradesstack_cost_code !== 600);
    });
    expectBlocker("sales_mapping_archived", (snapshot) => { snapshot.mappings[0].is_active = false; });
    expectBlocker("sales_account_inactive", (snapshot) => { snapshot.costCodes[0].is_active = false; });
    expectBlocker("sales_account_tenant_mismatch", (snapshot) => {
      (snapshot.costCodes[0].metadata as Row).tenantId = "tenant-2";
    });
    expectBlocker("sales_account_classification_invalid", (snapshot) => {
      (snapshot.costCodes[0].metadata as Row).class = "ASSET";
    });
  });

  it("covers Retention mapping, account activity, tenant and classification blockers", () => {
    expectBlocker("retention_mapping_archived", (snapshot) => { snapshot.mappings[1].is_active = false; });
    expectBlocker("retention_account_inactive", (snapshot) => { snapshot.costCodes[1].is_active = false; });
    expectBlocker("retention_account_tenant_mismatch", (snapshot) => {
      (snapshot.costCodes[1].metadata as Row).tenantId = "tenant-2";
    });
    expectBlocker("retention_account_classification_invalid", (snapshot) => {
      (snapshot.costCodes[1].metadata as Row).type = "FIXED";
    });
  });

  it("covers current accounting-document and existing InvoiceID blockers", () => {
    const document = {
      id: "document-1", organization_id: "org-1", provider: "xero", local_document_type: "project_claim",
      project_claim_id: "claim-1", local_document_id: null, current_version_id: null,
      accounting_connection_id: "conn-1", tenant_id: "tenant-1", external_document_id: "invoice-1", currency_code: "NZD",
    };
    const valid = cloneSnapshot();
    valid.accountingDocuments = [document];
    expect(evaluatePaymentClaimXeroReadinessSnapshot(valid).ready).toBe(true);

    expectBlocker("accounting_document_invalid", (snapshot) => {
      snapshot.accountingDocuments = [document, { ...document, id: "document-2" }];
    });
    expectBlocker("accounting_document_organization_mismatch", (snapshot) => {
      snapshot.accountingDocuments = [{ ...document, organization_id: "org-2" }];
    });
    expectBlocker("accounting_document_connection_mismatch", (snapshot) => {
      snapshot.accountingDocuments = [{ ...document, accounting_connection_id: "conn-2" }];
    });
    expectBlocker("accounting_document_tenant_mismatch", (snapshot) => {
      snapshot.accountingDocuments = [{ ...document, tenant_id: "tenant-2" }];
    });
    expectBlocker("existing_invoice_id_invalid", (snapshot) => {
      snapshot.accountingDocuments = [{ ...document, external_document_id: " " }];
    });
  });
});

function createAdminClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select() { return builder; },
        eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return builder; },
        in(field: string, values: unknown[]) { filters.push((row) => values.includes(row[field])); return builder; },
        order() { return builder; },
        maybeSingle() { return execute(true); },
        then(resolve: (result: { data: unknown; error: null }) => unknown) { return execute(false).then(resolve); },
      };
      async function execute(single: boolean) {
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      }
      return builder;
    },
  };
}

function snapshotTables(snapshot: PaymentClaimXeroReadinessSnapshot) {
  return {
    organizations: [snapshot.organization],
    project_claims: [snapshot.claim],
    organization_projects: [snapshot.project],
    organization_clients: snapshot.client ? [snapshot.client] : [],
    organization_external_contacts: snapshot.contactLinks,
    organization_xero_contacts: snapshot.importedContacts,
    organization_tradesstack_accounting_mappings: snapshot.mappings,
    organization_cost_codes: snapshot.costCodes,
    organization_accounting_tax_rates: snapshot.taxRates,
    organization_accounting_documents: snapshot.accountingDocuments,
  };
}

describe("evaluatePaymentClaimXeroReadiness server identity chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationXeroConnection.mockResolvedValue(baseSnapshot().connection);
  });

  it("resolves all readiness identities server-side", async () => {
    const snapshot = baseSnapshot();
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(snapshotTables(snapshot)));
    await expect(evaluatePaymentClaimXeroReadiness({ organizationId: "org-1", claimId: "claim-1" }))
      .resolves.toEqual({ ready: true, blockers: [] });
  });

  it.each([
    ["organization_not_found", (tables: Record<string, Row[]>) => { tables.organizations = []; }],
    ["claim_not_found", (tables: Record<string, Row[]>) => { tables.project_claims = []; }],
    ["organization_mismatch", (tables: Record<string, Row[]>) => { tables.project_claims[0].organization_id = "org-2"; }],
    ["project_not_found", (tables: Record<string, Row[]>) => { tables.organization_projects = []; }],
    ["client_missing", (tables: Record<string, Row[]>) => { tables.organization_projects[0].client_id = null; }],
    ["client_not_found", (tables: Record<string, Row[]>) => { tables.organization_clients = []; }],
  ] satisfies Array<[PaymentClaimXeroReadinessBlockerCode, (tables: Record<string, Row[]>) => void]>)
  ("returns the terminal %s blocker", async (expectedCode, mutate) => {
    const tables = snapshotTables(baseSnapshot());
    mutate(tables);
    createAdminSupabaseClient.mockResolvedValue(createAdminClient(tables));
    const result = await evaluatePaymentClaimXeroReadiness({ organizationId: "org-1", claimId: "claim-1" });
    expect(result).toMatchObject({ ready: false, blockers: [{ code: expectedCode }] });
  });
});
