import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  createXeroInvoices: vi.fn(),
  findXeroInvoicesByNumber: vi.fn(),
  getXeroInvoice: vi.fn(),
  getFreshXeroAccessToken: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));
vi.mock("@/lib/xero/client", () => ({
  createXeroInvoices: mocks.createXeroInvoices,
  findXeroInvoicesByNumber: mocks.findXeroInvoicesByNumber,
  getXeroInvoice: mocks.getXeroInvoice,
  XeroRequestError: class MockXeroRequestError extends Error {
    status: number;
    isRetryable: boolean;
    constructor(message: string, options: { status: number; isRetryable?: boolean }) {
      super(message);
      this.status = options.status;
      this.isRetryable = options.isRetryable ?? options.status >= 500;
    }
  },
}));
vi.mock("@/lib/xero/service", () => ({
  getFreshXeroAccessToken: mocks.getFreshXeroAccessToken,
}));

import { hashRetentionClaimXeroPayload } from "./retention-claim-sales-invoice-payload";
import {
  createRetentionClaimXeroSalesInvoice,
  RetentionClaimXeroCreateError,
} from "./retention-claim-sales-invoice-create";

type Row = Record<string, unknown>;

const payload = {
  Type: "ACCREC" as const,
  Contact: { ContactID: "contact-1" },
  InvoiceNumber: "RC-0001",
  Reference: "Project | Retention Claim RC-0001",
  Date: "2026-07-24",
  DueDate: "2026-08-24",
  CurrencyCode: "NZD" as const,
  LineAmountTypes: "Exclusive" as const,
  Status: "AUTHORISED" as const,
  LineItems: [{
    Description: "Retention release - Payment Claim PC-0001",
    Quantity: 1 as const,
    UnitAmount: 100,
    AccountCode: "700",
    TaxType: "OUTPUT2",
  }],
};
const payloadHash = hashRetentionClaimXeroPayload(payload);

function document(overrides: Row = {}) {
  return {
    id: "document-1",
    organization_id: "org-1",
    accounting_connection_id: "connection-1",
    provider: "xero",
    tenant_id: "tenant-1",
    local_document_type: "retention_claim",
    local_document_id: null,
    project_claim_id: null,
    retention_claim_id: "retention-claim-1",
    external_document_id: null,
    ...overrides,
  };
}

function snapshot(overrides: Row = {}) {
  return {
    id: "snapshot-1",
    organization_id: "org-1",
    accounting_document_id: "document-1",
    connection_id_snapshot: "connection-1",
    tenant_id_snapshot: "tenant-1",
    invoice_number_snapshot: "RC-0001",
    total_snapshot: 115,
    tax_total_snapshot: 15,
    payload_snapshot: payload,
    payload_sha256: payloadHash,
    idempotency_key: "a".repeat(64),
    ...overrides,
  };
}

function xeroInvoice(overrides: Row = {}) {
  return {
    Type: "ACCREC",
    InvoiceID: "invoice-1",
    InvoiceNumber: "RC-0001",
    Status: "AUTHORISED",
    TotalTax: 15,
    Total: 115,
    ...overrides,
  };
}

function adminFixture(documentRow: Row, snapshotRow: Row) {
  const updates: Row[] = [];
  const events: Array<{ name: string; args: Row }> = [];
  const client = {
    from(table: string) {
      const row = table === "organization_accounting_documents"
        ? documentRow
        : snapshotRow;
      const filters: Array<(candidate: Row) => boolean> = [];
      let update: Row | null = null;
      const builder = {
        select() { return builder; },
        update(value: Row) { update = value; return builder; },
        eq(field: string, value: unknown) {
          filters.push((candidate) => candidate[field] === value);
          return builder;
        },
        is(field: string, value: unknown) {
          filters.push((candidate) => candidate[field] === value);
          return builder;
        },
        maybeSingle() {
          const matches = filters.every((filter) => filter(row));
          if (matches && update) {
            updates.push(update);
            Object.assign(row, update);
          }
          return Promise.resolve({ data: matches ? row : null, error: null });
        },
      };
      return builder;
    },
    rpc(name: string, args: Row) {
      events.push({ name, args });
      return Promise.resolve({ data: { succeeded: true }, error: null });
    },
  };
  return { client, updates, events };
}

describe("Retention Claim Xero Sales Invoice creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFreshXeroAccessToken.mockResolvedValue({
      connection: {
        id: "connection-1",
        tenant_id: "tenant-1",
        scope: ["accounting.invoices"],
      },
      tokenSet: { access_token: "token" },
    });
    mocks.createXeroInvoices.mockResolvedValue([xeroInvoice()]);
    mocks.getXeroInvoice.mockResolvedValue([xeroInvoice()]);
  });

  it("creates from the immutable snapshot with its stable idempotency key", async () => {
    const documentRow = document();
    const fixture = adminFixture(documentRow, snapshot());
    mocks.createAdminSupabaseClient.mockResolvedValue(fixture.client);

    const result = await createRetentionClaimXeroSalesInvoice({
      organizationId: "org-1",
      accountingDocumentId: "document-1",
      accountingSnapshotId: "snapshot-1",
      queuedPayloadSha256: payloadHash,
      workerJobId: "job-1",
    });

    expect(mocks.createXeroInvoices).toHaveBeenCalledWith({
      accessToken: "token",
      tenantId: "tenant-1",
      invoices: [payload],
      idempotencyKey: "a".repeat(64),
      fallbackMessage: "Unable to create the Retention Claim Xero Sales Invoice.",
    });
    expect(documentRow).toMatchObject({
      external_document_id: "invoice-1",
      external_document_number: "RC-0001",
      amount_exported: 115,
      tax_exported: 15,
      export_status: "exported",
    });
    expect(fixture.updates.every((update) =>
      !("amount_paid" in update)
      && !("amount_due" in update)
      && !("amount_credited" in update)
      && !("last_status_synced_at" in update)
    )).toBe(true);
    expect(fixture.events).toEqual([
      expect.objectContaining({
        name: "record_retention_claim_xero_event",
        args: expect.objectContaining({ p_event_type: "xero_invoice_created" }),
      }),
    ]);
    expect(result).toMatchObject({
      invoiceId: "invoice-1",
      recovered: false,
      idempotencyKey: "a".repeat(64),
    });
  });

  it("rejects stale queued evidence before token or Xero access", async () => {
    mocks.createAdminSupabaseClient.mockResolvedValue(
      adminFixture(document(), snapshot()).client,
    );
    await expect(createRetentionClaimXeroSalesInvoice({
      organizationId: "org-1",
      accountingDocumentId: "document-1",
      accountingSnapshotId: "snapshot-1",
      queuedPayloadSha256: "b".repeat(64),
      workerJobId: "job-1",
    })).rejects.toBeInstanceOf(RetentionClaimXeroCreateError);
    expect(mocks.getFreshXeroAccessToken).not.toHaveBeenCalled();
    expect(mocks.createXeroInvoices).not.toHaveBeenCalled();
  });

  it("recovers an uncertain create by Retention Claim InvoiceNumber and ACCREC", async () => {
    mocks.createXeroInvoices.mockRejectedValue(new Error("timeout"));
    mocks.findXeroInvoicesByNumber.mockResolvedValue([xeroInvoice()]);
    const fixture = adminFixture(document(), snapshot());
    mocks.createAdminSupabaseClient.mockResolvedValue(fixture.client);

    const result = await createRetentionClaimXeroSalesInvoice({
      organizationId: "org-1",
      accountingDocumentId: "document-1",
      accountingSnapshotId: "snapshot-1",
      queuedPayloadSha256: payloadHash,
      workerJobId: "job-1",
    });
    expect(mocks.findXeroInvoicesByNumber).toHaveBeenCalledWith({
      accessToken: "token",
      tenantId: "tenant-1",
      invoiceNumber: "RC-0001",
      type: "ACCREC",
    });
    expect(result.recovered).toBe(true);
  });
});
