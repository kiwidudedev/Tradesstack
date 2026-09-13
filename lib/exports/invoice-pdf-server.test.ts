import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

import {
  buildInvoicePdfExportModelServer,
  InvoicePdfServerError,
  parseInvoiceMoneyMinor,
} from "@/lib/exports/invoice-pdf-server";

type Row = Record<string, unknown>;

function fixture(overrides: {
  claim?: Partial<Row>;
  document?: Row | null;
  revision?: Row | null;
  queryStarts?: string[];
  queryGates?: Partial<Record<string, Promise<void>>>;
} = {}) {
  const operations: string[] = [];
  const tables: Record<string, Row[]> = {
    organizations: [
      {
        id: "org-1",
        name: "TradesStack",
        logo_path: null,
        brand_primary_color: "#0B2739",
        country: "New Zealand",
        business_number: "9429000000000",
        bank_account_details: "12-1234-1234567-00",
        gst_number: "123-456-789",
        contact_name: "Accounts",
        contact_email: "accounts@example.test",
        contact_phone: "0210000000",
        default_currency: "NZD",
      },
      {
        id: "org-2",
        name: "Other Organization",
        default_currency: "NZD",
      },
    ],
    project_claims: [{
      id: "claim-1",
      organization_id: "org-1",
      project_id: "project-1",
      claim_number: "PC-0042",
      claim_title: "July progress claim",
      status: "Submitted",
      claim_date: "2026-07-20",
      due_date: "2026-08-20",
      claim_amount: "1000.00",
      retention_withheld_amount: "120.00",
      retention_released_amount: "20.00",
      net_claim_excl_gst: "900.00",
      gst_amount: "135.00",
      total_payable: "1035.00",
      previous_claims_total: "5000.00",
      ...overrides.claim,
    }],
    organization_projects: [{
      id: "project-1",
      organization_id: "org-1",
      name: "Harbour Apartments",
      location: "Auckland",
      client_id: "client-1",
    }],
    organization_clients: [{
      id: "client-1",
      organization_id: "org-1",
      name: "Casey Client",
      company_name: "Client Limited",
    }],
    organization_accounting_documents: overrides.document
      ? [overrides.document]
      : [],
    organization_accounting_document_revisions: overrides.revision
      ? [overrides.revision]
      : [],
  };
  const admin = {
    from(table: string) {
      const rows = tables[table] ?? [];
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select(columns: string) {
          operations.push(`select:${table}:${columns}`);
          return builder;
        },
        eq(field: string, value: unknown) {
          filters.push((row) => row[field] === value);
          return builder;
        },
        maybeSingle: async () => {
          overrides.queryStarts?.push(table);
          await overrides.queryGates?.[table];
          return {
            data: rows.find((row) => filters.every((filter) => filter(row)))
              ?? null,
            error: null,
          };
        },
        insert() {
          throw new Error("Invoice export attempted a database insert.");
        },
        update() {
          throw new Error("Invoice export attempted a database update.");
        },
        delete() {
          throw new Error("Invoice export attempted a database delete.");
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };
  return { admin, operations };
}

function errorCode(error: unknown) {
  return error instanceof InvoicePdfServerError ? error.code : null;
}

describe("server Invoice PDF model", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only persisted current-claim, retention, tax, total, date, project and client values", async () => {
    const { admin, operations } = fixture();
    mocks.createAdminSupabaseClient.mockResolvedValue(admin);
    const result = await buildInvoicePdfExportModelServer({
      organizationId: "org-1",
      claimId: "claim-1",
    });
    expect(result.model).toMatchObject({
      invoiceNumber: "PC-0042",
      paymentClaimReference: "PC-0042",
      invoiceDateIso: "2026-07-20",
      invoiceDateLabel: "20/07/2026",
      dueDateLabel: "20/08/2026",
      clientCompanyName: "Client Limited",
      projectName: "Harbour Apartments",
      currencyCode: "NZD",
      taxLabel: "GST",
      subtotalMinor: 90000,
      taxMinor: 13500,
      totalMinor: 103500,
    });
    expect(result.model.lines).toEqual([
      expect.objectContaining({
        kind: "gross_claim",
        amountMinor: 100000,
      }),
      expect.objectContaining({
        kind: "retention_withheld",
        amountMinor: 12000,
      }),
      expect.objectContaining({
        kind: "retention_released",
        amountMinor: 2000,
      }),
    ]);
    expect(JSON.stringify(result.model)).not.toContain("5000.00");
    expect(
      operations.find((entry) =>
        entry.startsWith("select:project_claims:")),
    ).not.toContain("previous_claims_total");
    expect(operations.every((entry) => entry.startsWith("select:"))).toBe(true);
  });

  it("uses a validated succeeded active accounting revision number", async () => {
    const document = {
      id: "document-1",
      organization_id: "org-1",
      project_claim_id: "claim-1",
      provider: "xero",
      local_document_type: "project_claim",
      integration_contract: "payment_claim_revision_v1",
      active_accounting_revision_id: "revision-2",
      external_document_id: "xero-invoice-2",
      external_document_number: "PC-0042-R1",
      accounting_connection_id: "connection-1",
      tenant_id: "tenant-1",
    };
    const revision = {
      id: "revision-2",
      organization_id: "org-1",
      accounting_document_id: "document-1",
      external_document_id: "xero-invoice-2",
      external_document_number: "PC-0042-R1",
      connection_id: "connection-1",
      tenant_id: "tenant-1",
      lifecycle_state: "succeeded",
    };
    const { admin } = fixture({ document, revision });
    mocks.createAdminSupabaseClient.mockResolvedValue(admin);
    const result = await buildInvoicePdfExportModelServer({
      organizationId: "org-1",
      claimId: "claim-1",
    });
    expect(result.model.invoiceNumber).toBe("PC-0042-R1");
    expect(result.model.paymentClaimReference).toBe("PC-0042");
  });

  it("runs project/client and accounting identity as concurrent post-claim branches", async () => {
    const queryStarts: string[] = [];
    const projectGateControl: {
      release?: () => void;
    } = {};
    const projectGate = new Promise<void>((resolve) => {
      projectGateControl.release = resolve;
    });
    const { admin } = fixture({
      queryStarts,
      queryGates: {
        organization_projects: projectGate,
      },
    });
    mocks.createAdminSupabaseClient.mockResolvedValue(admin);
    const resultPromise = buildInvoicePdfExportModelServer({
      organizationId: "org-1",
      claimId: "claim-1",
    });

    await vi.waitFor(() => {
      expect(queryStarts).toContain("organization_projects");
      expect(queryStarts).toContain("organization_accounting_documents");
    });
    expect(queryStarts.indexOf("project_claims")).toBeLessThan(
      queryStarts.indexOf("organization_projects"),
    );
    expect(queryStarts.indexOf("project_claims")).toBeLessThan(
      queryStarts.indexOf("organization_accounting_documents"),
    );
    expect(queryStarts).not.toContain("organization_clients");

    projectGateControl.release?.();
    await expect(resultPromise).resolves.toMatchObject({
      model: {
        projectName: "Harbour Apartments",
        clientCompanyName: "Client Limited",
        invoiceNumber: "PC-0042",
      },
    });
    expect(queryStarts.indexOf("organization_projects")).toBeLessThan(
      queryStarts.indexOf("organization_clients"),
    );
  });

  it("fails closed when an active accounting identity does not match", async () => {
    const { admin } = fixture({
      document: {
        id: "document-1",
        organization_id: "org-1",
        project_claim_id: "claim-1",
        provider: "xero",
        local_document_type: "project_claim",
        active_accounting_revision_id: "revision-2",
        external_document_id: "xero-invoice-2",
        external_document_number: "PC-0042-R1",
        accounting_connection_id: "connection-1",
        tenant_id: "tenant-1",
      },
      revision: {
        id: "revision-2",
        organization_id: "org-1",
        accounting_document_id: "document-1",
        external_document_id: "different-invoice",
        external_document_number: "PC-0042-R1",
        connection_id: "connection-1",
        tenant_id: "tenant-1",
        lifecycle_state: "succeeded",
      },
    });
    mocks.createAdminSupabaseClient.mockResolvedValue(admin);
    await expect(
      buildInvoicePdfExportModelServer({
        organizationId: "org-1",
        claimId: "claim-1",
      }),
    ).rejects.toMatchObject({ code: "accounting_identity_invalid" });
  });

  it.each(["Draft", "Cancelled"])(
    "rejects %s claims",
    async (status) => {
      const { admin } = fixture({ claim: { status } });
      mocks.createAdminSupabaseClient.mockResolvedValue(admin);
      await expect(
        buildInvoicePdfExportModelServer({
          organizationId: "org-1",
          claimId: "claim-1",
        }),
      ).rejects.toMatchObject({ code: "ineligible_status" });
    },
  );

  it.each(["Submitted", "Unpaid", "Paid", "Overdue"])(
    "allows persisted %s claims",
    async (status) => {
      const { admin } = fixture({ claim: { status } });
      mocks.createAdminSupabaseClient.mockResolvedValue(admin);
      await expect(
        buildInvoicePdfExportModelServer({
          organizationId: "org-1",
          claimId: "claim-1",
        }),
      ).resolves.toMatchObject({
        evidence: { status },
      });
    },
  );

  it("accepts an exact one-cent boundary without recalculating tax", async () => {
    const { admin } = fixture({
      claim: {
        claim_amount: "100.03",
        retention_withheld_amount: "0.00",
        retention_released_amount: "0.00",
        net_claim_excl_gst: "100.03",
        gst_amount: "15.01",
        total_payable: "115.04",
      },
    });
    mocks.createAdminSupabaseClient.mockResolvedValue(admin);
    const result = await buildInvoicePdfExportModelServer({
      organizationId: "org-1",
      claimId: "claim-1",
    });
    expect(result.model).toMatchObject({
      subtotalMinor: 10003,
      taxMinor: 1501,
      totalMinor: 11504,
    });
  });

  it.each([
    ["net_claim_excl_gst", null, "missing_value"],
    ["gst_amount", "15.001", "invalid_value"],
    ["claim_amount", -1, "invalid_value"],
    ["total_payable", "not-money", "invalid_value"],
  ])(
    "fails closed for malformed %s",
    async (field, value, expectedCode) => {
      const { admin } = fixture({ claim: { [field]: value } });
      mocks.createAdminSupabaseClient.mockResolvedValue(admin);
      const caught = await buildInvoicePdfExportModelServer({
        organizationId: "org-1",
        claimId: "claim-1",
      }).catch((error: unknown) => error);
      expect(errorCode(caught)).toBe(expectedCode);
    },
  );

  it.each([
    {
      net_claim_excl_gst: "899.99",
    },
    {
      total_payable: "1035.01",
    },
  ])("fails closed when persisted financial values do not reconcile", async (claim) => {
    const { admin } = fixture({ claim });
    mocks.createAdminSupabaseClient.mockResolvedValue(admin);
    await expect(
      buildInvoicePdfExportModelServer({
        organizationId: "org-1",
        claimId: "claim-1",
      }),
    ).rejects.toMatchObject({ code: "financial_mismatch" });
  });

  it("does not expose a claim from another organization", async () => {
    const { admin } = fixture();
    mocks.createAdminSupabaseClient.mockResolvedValue(admin);
    await expect(
      buildInvoicePdfExportModelServer({
        organizationId: "org-2",
        claimId: "claim-1",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("performs read-only queries across repeated exports", async () => {
    const { admin, operations } = fixture();
    mocks.createAdminSupabaseClient.mockResolvedValue(admin);
    await buildInvoicePdfExportModelServer({
      organizationId: "org-1",
      claimId: "claim-1",
    });
    await buildInvoicePdfExportModelServer({
      organizationId: "org-1",
      claimId: "claim-1",
    });
    expect(operations.length).toBeGreaterThan(0);
    expect(operations.every((entry) => entry.startsWith("select:"))).toBe(true);
  });

  it("parses persisted decimals directly to minor units", () => {
    expect(parseInvoiceMoneyMinor("100.03", "amount")).toBe(10003);
    expect(parseInvoiceMoneyMinor(0, "amount")).toBe(0);
  });
});
