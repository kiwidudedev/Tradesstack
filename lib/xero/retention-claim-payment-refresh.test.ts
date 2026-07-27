import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  getFreshXeroAccessToken: vi.fn(),
  getXeroInvoice: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));
vi.mock("@/lib/xero/service", () => ({
  getFreshXeroAccessToken: mocks.getFreshXeroAccessToken,
}));
vi.mock("@/lib/xero/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/xero/client")>();
  return { ...original, getXeroInvoice: mocks.getXeroInvoice };
});

import { refreshRetentionClaimPaymentFromXero } from "./retention-claim-payment-refresh";

type Row = Record<string, unknown>;

const rows: Record<string, Row | Row[]> = {
  organization_accounting_documents: {
    id: "document-1",
    organization_id: "org-1",
    accounting_connection_id: "connection-1",
    tenant_id: "tenant-1",
    provider: "xero",
    local_document_type: "retention_claim",
    retention_claim_id: "retention-claim-1",
    external_document_id: "invoice-1",
    external_document_number: "RC-0001",
    amount_exported: 115,
  },
  retention_claim_accounting_snapshots: {
    id: "snapshot-1",
    connection_id_snapshot: "connection-1",
    tenant_id_snapshot: "tenant-1",
    invoice_number_snapshot: "RC-0001",
    subtotal_excl_tax_snapshot: 100,
    total_snapshot: 115,
  },
  retention_claims: {
    id: "retention-claim-1",
    status: "submitted",
  },
  retention_claim_allocations: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      originating_payment_claim_id:
        "10000000-0000-4000-8000-000000000001",
      allocation_sequence: 1,
      allocation_amount: 60,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      originating_payment_claim_id:
        "10000000-0000-4000-8000-000000000002",
      allocation_sequence: 2,
      allocation_amount: 40,
    },
  ],
  retention_claim_payment_reconciliations: [{ id: "reconciliation-0" }],
};

function adminFixture() {
  const calls: Array<{ name: string; args: Row }> = [];
  const client = {
    from(table: string) {
      const value = rows[table];
      const result = {
        data: Array.isArray(value) ? value : value ?? null,
        error: null,
      };
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() {
          return Promise.resolve({
            data: Array.isArray(value) ? value[0] ?? null : value ?? null,
            error: null,
          });
        },
        then(resolve: (value: typeof result) => unknown) {
          return Promise.resolve(result).then(resolve);
        },
      };
      return builder;
    },
    rpc(name: string, args: Row) {
      calls.push({ name, args });
      return Promise.resolve({
        data: { succeeded: true, reconciliationId: "reconciliation-1" },
        error: null,
      });
    },
  };
  return { client, calls };
}

function invoice(overrides: Row = {}) {
  return {
    InvoiceID: "invoice-1",
    InvoiceNumber: "RC-0001",
    Type: "ACCREC",
    Status: "AUTHORISED",
    Total: 115,
    AmountPaid: 57.5,
    AmountDue: 57.5,
    AmountCredited: 0,
    UpdatedDateUTC: "2026-07-24T01:00:00Z",
    ...overrides,
  };
}

describe("Retention Claim Xero payment refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFreshXeroAccessToken.mockResolvedValue({
      connection: { id: "connection-1", tenant_id: "tenant-1" },
      tokenSet: { access_token: "token" },
    });
  });

  it("records aggregate Xero payment and deterministic origin attribution", async () => {
    const fixture = adminFixture();
    mocks.createAdminSupabaseClient.mockResolvedValue(fixture.client);
    mocks.getXeroInvoice.mockResolvedValue([invoice()]);

    const result = await refreshRetentionClaimPaymentFromXero({
      organizationId: "org-1",
      accountingDocumentId: "document-1",
      workerJobId: "job-1",
      actorUserId: null,
    });

    expect(result).toMatchObject({
      paymentStatus: "partially_paid",
      projectionApplied: true,
      paidAmountExclTax: 50,
    });
    expect(fixture.calls[0]).toMatchObject({
      name: "record_retention_claim_payment_reconciliation",
      args: {
        p_expected_previous_reconciliation_id: "reconciliation-0",
        p_paid_amount_excl_tax: 50,
        p_projection_applied: true,
        p_attributions: [
          expect.objectContaining({ paidAmount: 30 }),
          expect.objectContaining({ paidAmount: 20 }),
        ],
      },
    });
  });

  it("records credits as attention without replacing paid attribution", async () => {
    const fixture = adminFixture();
    mocks.createAdminSupabaseClient.mockResolvedValue(fixture.client);
    mocks.getXeroInvoice.mockResolvedValue([
      invoice({ AmountPaid: 50, AmountDue: 50, AmountCredited: 15 }),
    ]);

    const result = await refreshRetentionClaimPaymentFromXero({
      organizationId: "org-1",
      accountingDocumentId: "document-1",
      workerJobId: "job-2",
      actorUserId: null,
    });

    expect(result).toMatchObject({
      paymentStatus: "attention_required",
      projectionApplied: false,
      paidAmountExclTax: null,
      attentionCode: "credit_detected",
    });
    expect(fixture.calls[0].args).toMatchObject({
      p_projection_applied: false,
      p_paid_amount_excl_tax: null,
      p_attributions: [],
    });
  });

  it("does not write Payment Claims while reconciling a divergent invoice", async () => {
    const fixture = adminFixture();
    const from = vi.spyOn(fixture.client, "from");
    mocks.createAdminSupabaseClient.mockResolvedValue(fixture.client);
    mocks.getXeroInvoice.mockResolvedValue([
      invoice({ Total: 120, AmountPaid: 60, AmountDue: 60 }),
    ]);

    const result = await refreshRetentionClaimPaymentFromXero({
      organizationId: "org-1",
      accountingDocumentId: "document-1",
      workerJobId: "job-3",
      actorUserId: null,
    });

    expect(result.attentionCode).toBe("invoice_total_divergence");
    expect(from).not.toHaveBeenCalledWith("project_claims");
  });
});
