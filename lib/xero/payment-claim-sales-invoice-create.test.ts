import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  createXeroInvoices: vi.fn(),
  findXeroInvoicesByNumber: vi.fn(),
  getXeroInvoice: vi.fn(),
  getFreshXeroAccessToken: vi.fn(),
  resolvePaymentClaimXeroReadinessContext: vi.fn(),
  evaluatePaymentClaimXeroReadinessSnapshot: vi.fn(),
  buildPaymentClaimXeroPayloadFromResolvedSnapshot: vi.fn(),
  buildPaymentClaimXeroCurrentStateHashFromPayload: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.createAdminSupabaseClient }));
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
vi.mock("@/lib/xero/service", () => ({ getFreshXeroAccessToken: mocks.getFreshXeroAccessToken }));
vi.mock("@/lib/xero/payment-claim-readiness", () => ({
  resolvePaymentClaimXeroReadinessContext: mocks.resolvePaymentClaimXeroReadinessContext,
  evaluatePaymentClaimXeroReadinessSnapshot: mocks.evaluatePaymentClaimXeroReadinessSnapshot,
}));
vi.mock("@/lib/xero/payment-claim-sales-invoice-payload", () => ({
  buildPaymentClaimXeroPayloadFromResolvedSnapshot: mocks.buildPaymentClaimXeroPayloadFromResolvedSnapshot,
  PaymentClaimXeroPayloadError: class MockPayloadError extends Error {},
}));
vi.mock("@/lib/xero/payment-claim-sales-invoice-hash", () => ({
  buildPaymentClaimXeroCurrentStateHashFromPayload: mocks.buildPaymentClaimXeroCurrentStateHashFromPayload,
}));

import {
  buildInitialXeroSalesInvoiceIdempotencyKey,
  createInitialXeroSalesInvoice,
  InitialXeroSalesInvoiceCreateError,
} from "./payment-claim-sales-invoice-create";

type Row = Record<string, unknown>;

function createDocument(overrides: Row = {}) {
  return {
    id: "document-1",
    organization_id: "org-1",
    accounting_connection_id: "conn-1",
    provider: "xero",
    tenant_id: "tenant-1",
    local_document_type: "project_claim",
    local_document_id: null,
    project_claim_id: "claim-1",
    current_version_id: null,
    external_document_id: null,
    ...overrides,
  };
}

function createAdmin(document: Row) {
  const updates: Row[] = [];
  return {
    updates,
    client: {
      from(table: string) {
        expect(table).toBe("organization_accounting_documents");
        const filters: Array<(row: Row) => boolean> = [];
        let update: Row | null = null;
        const builder = {
          select() { return builder; },
          update(values: Row) { update = values; return builder; },
          eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return builder; },
          is(field: string, value: unknown) { filters.push((row) => row[field] === value); return builder; },
          maybeSingle() {
            const matches = filters.every((filter) => filter(document));
            if (update && matches) {
              updates.push(update);
              Object.assign(document, update);
            }
            return Promise.resolve({ data: matches ? document : null, error: null });
          },
        };
        return builder;
      },
    },
  };
}

const payload = {
  Type: "ACCREC" as const,
  Contact: { ContactID: "contact-1" },
  InvoiceNumber: "PC-0042",
  Reference: "Harbour Apartments | Claim PC-0042",
  Date: "2026-07-20",
  DueDate: "2026-08-20",
  CurrencyCode: "NZD" as const,
  LineAmountTypes: "Exclusive" as const,
  Status: "AUTHORISED" as const,
  LineItems: [
    { Description: "Payment Claim", Quantity: 1 as const, UnitAmount: 1000, AccountCode: "200", TaxType: "OUTPUT" },
    { Description: "Retention withheld", Quantity: 1 as const, UnitAmount: -100, AccountCode: "620", TaxType: "OUTPUT" },
  ],
};

function xeroInvoice(overrides: Row = {}) {
  return {
    Type: "ACCREC",
    InvoiceID: "invoice-1",
    InvoiceNumber: "PC-0042",
    Status: "AUTHORISED",
    SubTotal: 900,
    TotalTax: 135,
    Total: 1035,
    ...overrides,
  };
}

describe("initial Payment Claim Xero Sales Invoice creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({ snapshot: { claim: {} }, terminalReadiness: null });
    mocks.evaluatePaymentClaimXeroReadinessSnapshot.mockReturnValue({ ready: true, blockers: [] });
    mocks.buildPaymentClaimXeroPayloadFromResolvedSnapshot.mockReturnValue({
      payload,
      reconciliation: { revenueAmount: 1000, signedRetentionAmount: -100, subtotal: 900, gst: 135, total: 1035 },
    });
    mocks.buildPaymentClaimXeroCurrentStateHashFromPayload.mockReturnValue({ hash: "hash-current" });
    mocks.getFreshXeroAccessToken.mockResolvedValue({
      connection: { id: "conn-1", tenant_id: "tenant-1", scope: ["accounting.invoices"] },
      tokenSet: { access_token: "access-token" },
    });
    mocks.createXeroInvoices.mockResolvedValue([xeroInvoice()]);
    mocks.getXeroInvoice.mockResolvedValue([xeroInvoice({ Status: "AUTHORISED" })]);
  });

  it("creates one ACCREC with the pure payload and persists initial then refreshed accounting state", async () => {
    const document = createDocument();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);

    const result = await createInitialXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1",
    });

    expect(mocks.createXeroInvoices).toHaveBeenCalledTimes(1);
    expect(mocks.createXeroInvoices).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      invoices: [payload],
      idempotencyKey: result.idempotencyKey,
    }));
    expect(mocks.getXeroInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.getXeroInvoice).toHaveBeenCalledWith("access-token", "tenant-1", "invoice-1");
    expect(admin.updates).toHaveLength(2);
    expect(document).toMatchObject({
      external_document_id: "invoice-1",
      external_document_number: "PC-0042",
      amount_exported: 1035,
      tax_exported: 135,
      raw_external_status: "AUTHORISED",
      normalized_external_status: "awaiting_payment",
    });
    expect(admin.updates.every((update) =>
      !("amount_paid" in update)
      && !("amount_due" in update)
      && !("last_synced_hash" in update)
      && !("last_status_synced_at" in update),
    )).toBe(true);
    expect(result).toMatchObject({ invoiceId: "invoice-1", invoiceNumber: "PC-0042", recovered: false });
  });

  it("refuses creation immediately when the accounting document already has an InvoiceID", async () => {
    const document = createDocument({ external_document_id: "existing-invoice" });
    mocks.createAdminSupabaseClient.mockResolvedValue(createAdmin(document).client);
    await expect(createInitialXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "invoice_already_exists" });
    expect(mocks.resolvePaymentClaimXeroReadinessContext).not.toHaveBeenCalled();
    expect(mocks.createXeroInvoices).not.toHaveBeenCalled();
  });

  it("recovers an uncertain timeout by InvoiceNumber plus ACCREC and refreshes exactly once", async () => {
    const document = createDocument();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.createXeroInvoices.mockRejectedValue(new Error("request timed out"));
    mocks.findXeroInvoicesByNumber.mockResolvedValue([xeroInvoice()]);

    const result = await createInitialXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1",
    });

    expect(mocks.findXeroInvoicesByNumber).toHaveBeenCalledWith({
      accessToken: "access-token", tenantId: "tenant-1", invoiceNumber: "PC-0042", type: "ACCREC",
    });
    expect(mocks.getXeroInvoice).toHaveBeenCalledTimes(1);
    expect(result.recovered).toBe(true);
    expect(document.external_document_id).toBe("invoice-1");
  });

  it("uses one stable document-scoped idempotency key", () => {
    const input = { organizationId: "org-1", accountingDocumentId: "document-1" };
    const first = buildInitialXeroSalesInvoiceIdempotencyKey(input);
    expect(first).toBe(buildInitialXeroSalesInvoiceIdempotencyKey(input));
    expect(first).not.toBe(buildInitialXeroSalesInvoiceIdempotencyKey({ ...input, accountingDocumentId: "document-2" }));
  });

  it("aborts before payload or Xero when canonical readiness fails", async () => {
    mocks.createAdminSupabaseClient.mockResolvedValue(createAdmin(createDocument()).client);
    mocks.evaluatePaymentClaimXeroReadinessSnapshot.mockReturnValue({ ready: false, blockers: [{ code: "client_contact_missing" }] });
    await expect(createInitialXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1",
    })).rejects.toBeInstanceOf(InitialXeroSalesInvoiceCreateError);
    expect(mocks.buildPaymentClaimXeroPayloadFromResolvedSnapshot).not.toHaveBeenCalled();
    expect(mocks.createXeroInvoices).not.toHaveBeenCalled();
  });

  it("rejects a stale queued hash before token retrieval or Xero creation", async () => {
    mocks.createAdminSupabaseClient.mockResolvedValue(createAdmin(createDocument()).client);
    await expect(createInitialXeroSalesInvoice({
      organizationId: "org-1",
      accountingDocumentId: "document-1",
      workerJobId: "job-1",
      queuedHash: "hash-old",
    })).rejects.toMatchObject({ code: "stale_job" });
    expect(mocks.getFreshXeroAccessToken).not.toHaveBeenCalled();
    expect(mocks.createXeroInvoices).not.toHaveBeenCalled();
  });
});
